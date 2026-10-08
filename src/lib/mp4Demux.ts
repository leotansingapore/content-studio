// Reads the video and AAC sound tracks of an MP4 or MOV (what phones record,
// and what the browser's own recorder makes) well enough to decode them with
// WebCodecs: the codec setup, the picture size and turn, and where each frame
// sits in the file. Plain and fragmented files both. Anything else (WebM, a
// flipped picture, a codec other than H.264, HEVC or AAC) gives null, and the
// export falls back.

export interface Sample {
  /** When the frame shows, in seconds, after the edit list's start offset (as the browser plays it). */
  pts: number;
  key: boolean;
  /** Where its bytes are in the file. */
  off: number;
  size: number;
}

export interface VideoTrack {
  /** WebCodecs codec string, e.g. avc1.64001f or hvc1.1.6.L93.B0. */
  codec: string;
  /** The avcC or hvcC box: the decoder's setup. */
  description: Uint8Array;
  /** The coded picture size, before the turn. */
  width: number;
  height: number;
  /** How far the picture is turned clockwise for showing. */
  rotation: 0 | 90 | 180 | 270;
  /** Every frame, in decode order. */
  samples: Sample[];
}

type Box = [type: string, body: Uint8Array];

const view = (b: Uint8Array) => new DataView(b.buffer, b.byteOffset, b.byteLength);
const str4 = (b: Uint8Array, at: number) => String.fromCharCode(b[at], b[at + 1], b[at + 2], b[at + 3]);
const hex2 = (n: number) => n.toString(16).padStart(2, "0");

function boxes(b: Uint8Array): Box[] {
  const out: Box[] = [];
  const v = view(b);
  for (let p = 0; p + 8 <= b.length; ) {
    let size = v.getUint32(p);
    let head = 8;
    if (size === 1) {
      if (p + 16 > b.length) break;
      size = Number(v.getBigUint64(p + 8));
      head = 16;
    } else if (size === 0) size = b.length - p;
    if (size < head || p + size > b.length) break;
    out.push([str4(b, p + 4), b.subarray(p + head, p + size)]);
    p += size;
  }
  return out;
}
const kid = (b: Uint8Array | undefined, type: string) => (b ? boxes(b).find((x) => x[0] === type)?.[1] : undefined);
const path = (b: Uint8Array | undefined, ...types: string[]) => types.reduce<Uint8Array | undefined>((at, t) => kid(at, t), b);

/** The track's turn from its tkhd matrix; null for a flip or a skew, which the export doesn't draw. */
export function rotationOf(tkhd: Uint8Array): VideoTrack["rotation"] | null {
  const m = tkhd[0] === 1 ? 52 : 40;
  if (tkhd.length < m + 20) return 0;
  const v = view(tkhd);
  const a = v.getInt32(m) / 65536, b = v.getInt32(m + 4) / 65536, c = v.getInt32(m + 12) / 65536, d = v.getInt32(m + 16) / 65536;
  if (Math.abs(a * d - b * c - 1) > 0.01) return null;
  const deg = ((Math.round((Math.atan2(b, a) * 180) / Math.PI) % 360) + 360) % 360;
  return deg === 0 || deg === 90 || deg === 180 || deg === 270 ? deg : null;
}

/** The WebCodecs codec string for an HEVC track, from its hvcC box. */
export function hevcCodec(type: string, c: Uint8Array): string {
  const space = ["", "A", "B", "C"][c[1] >> 6];
  const tier = c[1] & 0x20 ? "H" : "L";
  const profile = c[1] & 0x1f;
  // the compatibility flags, bit-reversed
  let flags = view(c).getUint32(2);
  let rev = 0;
  for (let i = 0; i < 32; i++) {
    rev = (rev << 1) | (flags & 1);
    flags >>>= 1;
  }
  const cons = Array.from(c.subarray(6, 12));
  while (cons.length && cons[cons.length - 1] === 0) cons.pop();
  return [`${type}`, `${space}${profile}`, (rev >>> 0).toString(16).toUpperCase(), `${tier}${c[12]}`, ...cons.map((x) => x.toString(16).toUpperCase())].join(".");
}

function codecOf(stsd: Uint8Array): { codec: string; description: Uint8Array; width: number; height: number } | null {
  const entry = boxes(stsd.subarray(8))[0];
  if (!entry) return null;
  const [type, e] = entry;
  if (e.length < 78) return null;
  const width = view(e).getUint16(24);
  const height = view(e).getUint16(26);
  const kids = e.subarray(78);
  if (type === "avc1" || type === "avc3") {
    const c = kid(kids, "avcC");
    return c && c.length > 4 ? { codec: `${type}.${hex2(c[1])}${hex2(c[2])}${hex2(c[3])}`, description: c, width, height } : null;
  }
  if (type === "hvc1" || type === "hev1") {
    const c = kid(kids, "hvcC");
    return c && c.length > 22 ? { codec: hevcCodec(type, c), description: c, width, height } : null;
  }
  return null;
}

/** The start offset from the edit list (media time units): the first edit that plays media. Empty edits are let be. */
function shiftOf(elst: Uint8Array | undefined): number {
  if (!elst) return 0;
  const v = view(elst);
  const ver = elst[0];
  const n = v.getUint32(4);
  const step = ver === 1 ? 20 : 12;
  for (let i = 0; i < n && 8 + (i + 1) * step <= elst.length; i++) {
    const at = 8 + i * step;
    const media = ver === 1 ? Number(v.getBigInt64(at + 8)) : v.getInt32(at + 4);
    if (media >= 0) return media;
  }
  return 0;
}

/** The frames listed in a plain (not fragmented) track's sample tables, in decode order, in media time units. */
function tableSamples(stbl: Uint8Array): { dts: number; cts: number; key: boolean; off: number; size: number }[] {
  const t = (type: string) => kid(stbl, type);
  const stsz = t("stsz");
  if (!stsz) return [];
  const zv = view(stsz);
  const fixed = zv.getUint32(4);
  const n = zv.getUint32(8);
  const sizes = Array.from({ length: n }, (_, i) => (fixed ? fixed : zv.getUint32(12 + i * 4)));
  const out = sizes.map((size) => ({ dts: 0, cts: 0, key: true, off: 0, size }));
  // decode times
  const stts = t("stts");
  if (stts) {
    const v = view(stts);
    let i = 0, dts = 0;
    for (let e = 0, m = v.getUint32(4); e < m; e++) {
      const count = v.getUint32(8 + e * 8), delta = v.getUint32(12 + e * 8);
      for (let k = 0; k < count && i < n; k++, i++) {
        out[i].dts = dts;
        dts += delta;
      }
    }
  }
  // show times (B-frames)
  const ctts = t("ctts");
  for (let i = 0; i < n; i++) out[i].cts = out[i].dts;
  if (ctts) {
    const v = view(ctts);
    let i = 0;
    for (let e = 0, m = v.getUint32(4); e < m; e++) {
      const count = v.getUint32(8 + e * 8), off = v.getInt32(12 + e * 8);
      for (let k = 0; k < count && i < n; k++, i++) out[i].cts = out[i].dts + off;
    }
  }
  // key frames (no table: every frame is one)
  const stss = t("stss");
  if (stss) {
    const v = view(stss);
    for (const s of out) s.key = false;
    for (let e = 0, m = v.getUint32(4); e < m; e++) {
      const k = v.getUint32(8 + e * 4) - 1;
      if (out[k]) out[k].key = true;
    }
  }
  // where each frame is: chunks from stco or co64, frames per chunk from stsc
  const stco = t("stco");
  const co64 = t("co64");
  const chunks: number[] = [];
  if (stco) for (let e = 0, v = view(stco), m = v.getUint32(4); e < m; e++) chunks.push(v.getUint32(8 + e * 4));
  else if (co64) for (let e = 0, v = view(co64), m = v.getUint32(4); e < m; e++) chunks.push(Number(v.getBigUint64(8 + e * 8)));
  const stsc = t("stsc");
  if (!stsc) return [];
  const sv = view(stsc);
  const runs = Array.from({ length: sv.getUint32(4) }, (_, e) => ({ first: sv.getUint32(8 + e * 12) - 1, per: sv.getUint32(12 + e * 12) }));
  let i = 0;
  for (let r = 0; r < runs.length; r++) {
    const last = r + 1 < runs.length ? runs[r + 1].first : chunks.length;
    for (let c = runs[r].first; c < last && i < n; c++) {
      let off = chunks[c];
      for (let k = 0; k < runs[r].per && i < n; k++, i++) {
        out[i].off = off;
        off += out[i].size;
      }
    }
  }
  return i === n ? out : [];
}

interface Trex { dur: number; size: number; flags: number }

/** The frames one fragment (moof at `at` in the file) holds for this track, after `dts`. */
function fragmentSamples(moof: Uint8Array, at: number, id: number, trex: Trex, dts: number) {
  const out: { dts: number; cts: number; key: boolean; off: number; size: number }[] = [];
  for (const [type, traf] of boxes(moof)) {
    if (type !== "traf") continue;
    const tfhd = kid(traf, "tfhd");
    if (!tfhd || view(tfhd).getUint32(4) !== id) continue;
    const hv = view(tfhd);
    const hf = hv.getUint32(0) & 0xffffff;
    let p = 8;
    let base = at;
    if (hf & 0x1) { base = Number(hv.getBigUint64(p)); p += 8; }
    if (hf & 0x2) p += 4;
    const dDur = hf & 0x8 ? hv.getUint32((p += 4) - 4) : trex.dur;
    const dSize = hf & 0x10 ? hv.getUint32((p += 4) - 4) : trex.size;
    const dFlags = hf & 0x20 ? hv.getUint32((p += 4) - 4) : trex.flags;
    const tfdt = kid(traf, "tfdt");
    if (tfdt) dts = tfdt[0] === 1 ? Number(view(tfdt).getBigUint64(4)) : view(tfdt).getUint32(4);
    let off = base;
    for (const [rt, trun] of boxes(traf)) {
      if (rt !== "trun") continue;
      const v = view(trun);
      const f = v.getUint32(0) & 0xffffff;
      const n = v.getUint32(4);
      let q = 8;
      if (f & 0x1) { off = base + v.getInt32(q); q += 4; }
      let first: number | null = null;
      if (f & 0x4) { first = v.getUint32(q); q += 4; }
      for (let i = 0; i < n; i++) {
        const dur = f & 0x100 ? v.getUint32((q += 4) - 4) : dDur;
        const size = f & 0x200 ? v.getUint32((q += 4) - 4) : dSize;
        const flags = f & 0x400 ? v.getUint32((q += 4) - 4) : i === 0 && first !== null ? first : dFlags;
        const ct = f & 0x800 ? v.getInt32((q += 4) - 4) : 0;
        out.push({ dts, cts: dts + ct, key: !((flags >> 16) & 1), off, size });
        dts += dur;
        off += size;
      }
    }
  }
  return { samples: out, dts };
}

/** The file's first track of this kind, with every frame listed; null when there is none or the file isn't MP4. */
async function readTrack(file: Blob, handler: "vide" | "soun") {
  const read = async (at: number, n: number) => new Uint8Array(await file.slice(at, at + n).arrayBuffer());
  let moov: Uint8Array | null = null;
  const moofs: { at: number; body: Uint8Array }[] = [];
  for (let p = 0; p + 8 <= file.size; ) {
    const h = await read(p, 16);
    const v = view(h);
    let size = v.getUint32(0);
    let head = 8;
    if (size === 1) {
      size = Number(v.getBigUint64(8));
      head = 16;
    } else if (size === 0) size = file.size - p;
    if (size < head) return null;
    const type = str4(h, 4);
    if (type === "moov") moov = await read(p + head, size - head);
    else if (type === "moof") moofs.push({ at: p, body: await read(p + head, size - head) });
    p += size;
  }
  if (!moov) return null;
  const trak = boxes(moov).find(([t, b]) => t === "trak" && str4(path(b, "mdia", "hdlr") ?? new Uint8Array(12), 8) === handler)?.[1];
  const tkhd = kid(trak, "tkhd");
  const mdhd = path(trak, "mdia", "mdhd");
  const stbl = path(trak, "mdia", "minf", "stbl");
  const stsd = kid(stbl, "stsd");
  if (!trak || !tkhd || !mdhd || !stbl || !stsd) return null;
  const scale = mdhd[0] === 1 ? view(mdhd).getUint32(20) : view(mdhd).getUint32(12);
  if (!scale) return null;
  let raw = tableSamples(stbl);
  if (moofs.length) {
    const id = view(tkhd).getUint32(tkhd[0] === 1 ? 20 : 12);
    const trex = boxes(kid(moov, "mvex") ?? new Uint8Array()).map(([, b]) => b).find((b) => b.length >= 24 && view(b).getUint32(4) === id);
    const def = trex ? { dur: view(trex).getUint32(12), size: view(trex).getUint32(16), flags: view(trex).getUint32(20) } : { dur: 0, size: 0, flags: 0 };
    let dts = 0;
    for (const m of moofs) {
      const f = fragmentSamples(m.body, m.at, id, def, dts);
      raw = raw.concat(f.samples);
      dts = f.dts;
    }
  }
  if (!raw.length || !raw[0].key) return null;
  const shift = shiftOf(path(trak, "edts", "elst"));
  const samples = raw.map((s) => ({ pts: (s.cts - shift) / scale, key: s.key, off: s.off, size: s.size }));
  if (samples.some((s) => s.off + s.size > file.size || !s.size)) return null;
  return { tkhd, stsd, samples };
}

/** Reads the file's first video track; null when the export can't decode it itself. */
export async function demuxVideo(file: Blob): Promise<VideoTrack | null> {
  const t = await readTrack(file, "vide");
  const rotation = t && rotationOf(t.tkhd);
  const codec = t && codecOf(t.stsd);
  return t && rotation !== null && codec ? { ...codec, rotation, samples: t.samples } : null;
}

export interface AudioTrack {
  /** WebCodecs codec string, e.g. mp4a.40.2 (AAC). */
  codec: string;
  /** The AudioSpecificConfig: the decoder's setup. */
  description: Uint8Array;
  sampleRate: number;
  channels: number;
  /** Every packet, in order. */
  samples: Sample[];
}

/** The AudioSpecificConfig from an esds box, and the AAC object type it names. */
export function aacConfig(esds: Uint8Array): { asc: Uint8Array; aot: number } | null {
  let p = 4;
  const size = () => {
    let n = 0;
    for (let i = 0; i < 4 && p < esds.length; i++) {
      const b = esds[p++];
      n = (n << 7) | (b & 0x7f);
      if (!(b & 0x80)) break;
    }
    return n;
  };
  if (esds[p++] !== 3) return null;
  size();
  p += 2;
  const flags = esds[p++];
  if (flags & 0x80) p += 2;
  if (flags & 0x40) p += esds[p] + 1;
  if (flags & 0x20) p += 2;
  if (esds[p++] !== 4) return null;
  size();
  if (esds[p] !== 0x40) return null; // MPEG-4 audio
  p += 13;
  if (esds[p++] !== 5) return null;
  const n = size();
  const asc = esds.subarray(p, p + n);
  if (asc.length < 2) return null;
  const aot = asc[0] >> 3;
  return { asc, aot: aot === 31 ? 32 + (((asc[0] & 7) << 3) | (asc[1] >> 5)) : aot };
}

/** Reads the file's AAC sound track (MP4, MOV, M4A); null when it has none the export can decode itself. */
export async function demuxAudio(file: Blob): Promise<AudioTrack | null> {
  const t = await readTrack(file, "soun");
  const entry = t && boxes(t.stsd.subarray(8))[0];
  if (!entry || entry[0] !== "mp4a" || entry[1].length < 28) return null;
  const e = entry[1];
  // QuickTime sound descriptions 1 and 2 carry more fields before their boxes
  const ver = view(e).getUint16(8);
  const kids = e.subarray(28 + (ver === 1 ? 16 : ver === 2 ? 36 : 0));
  const esds = kid(kids, "esds") ?? path(kids, "wave", "esds");
  const aac = esds && aacConfig(esds);
  if (!aac) return null;
  return { codec: `mp4a.40.${aac.aot}`, description: aac.asc, sampleRate: view(e).getUint32(24) >>> 16, channels: view(e).getUint16(16), samples: t.samples };
}

/** The decode-order index to start decoding from to show time t: the last key frame showing at or before it. */
export function keyBefore(samples: Sample[], t: number): number {
  let k = 0;
  for (let i = 0; i < samples.length; i++) if (samples[i].key && samples[i].pts <= t + 1e-6) k = i;
  return k;
}
