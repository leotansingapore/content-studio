// A subtitle file (.srt or .vtt, from Zoom, Riverside, YouTube or an editor) as
// the editor's word-timed transcript, so a recording that already has captions
// skips transcription. Each line's words share its time by their length, as
// AutoClip spreads an SRT line (subtitle_processor.py); YouTube's word times
// (<00:00:01.500>) are kept as they are, and its rolling captions, where each
// cue repeats the line before, give each line once.

import type { Word } from "@/lib/videoEdit";

/** A file bigger than this is not a subtitle file (a 2-hour SRT is about 150 KB). */
export const MAX_SUBTITLE_BYTES = 5 * 1024 * 1024;

const TIME = /(?:(\d+):)?(\d{1,2}):(\d{2})[,.](\d{1,3})/;
const ARROW = new RegExp(`${TIME.source}\\s*-->\\s*${TIME.source}`);

function seconds(h: string | undefined, m: string, s: string, ms: string): number {
  return Number(h ?? 0) * 3600 + Number(m) * 60 + Number(s) + Number(ms.padEnd(3, "0")) / 1000;
}

const ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&nbsp;": " " };
const plain = (t: string) => t.replace(/<[^>]*>/g, "").replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (e) => ENTITIES[e]).replace(/\s+/g, " ").trim();

interface Cue {
  s: number;
  e: number;
  lines: string[];
}

/** The timed cues, line by line: a cue's text runs to an empty line, the next cue's number or the next time line. */
function cues(text: string): Cue[] {
  const out: Cue[] = [];
  const rows = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").split("\n");
  let cur: Cue | null = null;
  rows.forEach((row, i) => {
    const m = row.match(ARROW);
    if (m) {
      const s = seconds(m[1], m[2], m[3], m[4]);
      const e = seconds(m[5], m[6], m[7], m[8]);
      cur = e > s ? { s, e, lines: [] } : null;
      if (cur) out.push(cur);
    } else if (row === "" || (/^\d+$/.test(row.trim()) && ARROW.test(rows[i + 1] ?? ""))) {
      cur = null; // the end of a cue (YouTube keeps a line of one space inside its cues), or an SRT cue number
    } else if (cur && plain(row)) {
      (cur as Cue).lines.push(row);
    }
  });
  return out.sort((a, b) => a.s - b.s);
}

const r = (t: number) => Math.round(t * 1000) / 1000;
const toSeconds = (t: string) => {
  const m = t.match(TIME)!;
  return seconds(m[1], m[2], m[3], m[4]);
};

/** Words of plain text spread over [s, e) by their length. */
function spread(text: string, s: number, e: number): Word[] {
  const words = text.split(" ").filter(Boolean);
  const total = words.reduce((n, w) => n + w.length + 1, 0);
  let t = s;
  return words.map((w) => {
    const len = ((e - s) * (w.length + 1)) / total;
    const word = { w, s: r(t), e: r(t + len * 0.9) };
    t += len;
    return word;
  });
}

/** One line's words: at YouTube's word times (<00:00:01.500>) when the line has them, else spread over [s, e). */
function lineWords(line: string, s: number, e: number): Word[] {
  const parts = line.split(/<((?:\d+:)?\d{1,2}:\d{2}\.\d{1,3})>/);
  const times = [s, ...parts.filter((_, i) => i % 2).map((t) => Math.min(e, Math.max(s, toSeconds(t)))), e];
  return parts.filter((_, i) => i % 2 === 0).flatMap((t, k) => spread(plain(t), times[k], Math.max(times[k], times[k + 1])));
}

/**
 * The transcript in a subtitle file, word by word on the recording's clock, up
 * to `duration`. Empty when the file holds no timed lines.
 */
export function subtitleWords(text: string, duration = Infinity): Word[] {
  const out: Word[] = [];
  let before: string[] = [];
  for (const c of cues(text)) {
    // a rolling caption repeats the line before it: each line is said once
    const said = c.lines.filter((l) => !before.includes(plain(l)));
    before = c.lines.map(plain);
    const fresh = said.length;
    if (!fresh) continue;
    const span = (c.e - c.s) / fresh;
    said.forEach((l, i) => out.push(...lineWords(l, c.s + i * span, c.s + (i + 1) * span)));
  }
  // on the recording's clock and in time order: overlapping cues never send a word back in time
  const kept: Word[] = [];
  for (const w of out) if (w.s < duration && (!kept.length || w.s >= kept[kept.length - 1].s)) kept.push({ ...w, e: Math.min(w.e, duration) });
  return kept;
}
