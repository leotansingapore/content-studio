// "Even out loudness" measures the sound the edit keeps, not the whole
// recording: a clip of a 2-hour podcast reads its own minute, part by part
// (fastExport's decoder), a long edit is measured on 10 minutes spread across
// it, and only a recording up to 15 minutes whose sound can't be read in parts
// is decoded whole, as before. Pure: videoMedia's
// measureLevel turns the result into an AudioBuffer.

/** A kept stretch of the source, in seconds. */
export interface KeptPart {
  from: number;
  dur: number;
}

/** Decoded sound that starts `start` seconds into the source. */
export interface SoundPiece {
  start: number;
  rate: number;
  channels: Float32Array[];
}

/** At most this much kept sound is measured: a longer edit is measured on SAMPLES stretches spread evenly across it. */
export const MEASURE_SECONDS = 600;
const SAMPLES = 20;

/**
 * The stretches to measure, each with the index of the kept part it comes from:
 * all of them up to MEASURE_SECONDS, else SAMPLES stretches of 30 s spread evenly
 * over the kept sound (an export of a whole 2-hour podcast reads 10 minutes, not 2 hours).
 */
export function sampleKept(parts: KeptPart[]): (KeptPart & { part: number })[] {
  const total = parts.reduce((a, p) => a + p.dur, 0);
  if (total <= MEASURE_SECONDS) return parts.map((p, part) => ({ ...p, part }));
  const len = MEASURE_SECONDS / SAMPLES;
  const out: (KeptPart & { part: number })[] = [];
  for (let k = 0, part = 0, before = 0; k < SAMPLES; k++) {
    const t = (k * total) / SAMPLES;
    while (part < parts.length - 1 && before + parts[part].dur <= t) before += parts[part++].dur;
    const into = t - before;
    out.push({ from: parts[part].from + into, dur: Math.min(len, parts[part].dur - into), part });
  }
  return out;
}

/** The longest recording decoded whole: 15 minutes at 48 kHz stereo is about 350 MB (fastExport's WHOLE_SECONDS). */
export const WHOLE_SECONDS = 15 * 60;

/** Whether a recording this long may be decoded whole; an unknown length may not. */
export const wholeFits = (duration: number | undefined) => typeof duration === "number" && duration <= WHOLE_SECONDS;

/** The kept parts back to back, channel by channel; pieces[i] holds parts[i]'s sound. Null with no sound. */
export function joinKept(pieces: SoundPiece[], parts: KeptPart[]): Float32Array<ArrayBuffer>[] | null {
  const first = pieces[0];
  if (!first || !parts.length) return null;
  const lens = parts.map((p) => Math.max(0, Math.round(p.dur * first.rate)));
  const out = first.channels.map(() => new Float32Array(lens.reduce((a, b) => a + b, 0)));
  let at = 0;
  parts.forEach((p, i) => {
    const piece = pieces[i] ?? first;
    const from = Math.max(0, Math.round((p.from - piece.start) * first.rate));
    out.forEach((ch, c) => ch.set((piece.channels[c] ?? piece.channels[0]).subarray(from, from + lens[i]), at));
    at += lens[i];
  });
  return out[0]?.length ? out : null;
}
