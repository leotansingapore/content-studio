// "Montage from a theme" on Edit a video's start screen: type a theme, get 20 to 45 seconds of stock clips
// that fit it, one colour look over all, words on screen, your own music under it if you add a track.
// video-assist (mode "montage") plans 6 to 10 beats and picks the look (supabase/functions/video-assist/montage.ts);
// each beat is filled from stock (stock-media, Pexels) with the clip Jev says shows it (mode "montage-pick"),
// a broader search standing in when nothing fits. The clips are put together on this device by videoMedia's
// join (as the AI presenter and explainer are) and open in the editor like an upload. No paid generation.
// Cuts land on the beats of your track when you add one. AI music is off (AI_MUSIC in aiMusic.ts); when it is
// switched on the editor's Music for me fills the same music slot, so nothing here changes.
// The job lives outside React, so it carries on while the adviser uses other pages.

import { callFn } from "@/lib/edgeFn";
import { putFile } from "@/lib/deviceFiles";
import { chooseClips } from "@/lib/autoBroll";
import { downloadStock, searchStock, type StockItem } from "@/lib/stockMedia";
import { MAX_OVERLAYS, MUSIC_LEVEL, newOverlay, type FilterId, type Overlay } from "@/lib/videoEdit";
import { currentJoin, monoPcm, startJoin } from "@/lib/videoMedia";
import type { Beat } from "../../supabase/functions/video-assist/montage.ts";

export { LEN_MAX, LEN_MIN, MAX_THEME } from "../../supabase/functions/video-assist/montage.ts";

// ---------- cuts on the beat ----------

/** Seconds of the loudest sudden rises in a track (drum hits and plucks): where a cut feels right. */
export function beatTimes(pcm: Float32Array, rate: number): number[] {
  const hop = Math.round(rate * 0.02);
  const n = Math.floor(pcm.length / hop);
  const level = new Float32Array(n);
  for (let f = 0; f < n; f++) {
    let sum = 0;
    for (let i = f * hop; i < (f + 1) * hop; i++) sum += pcm[i] * pcm[i];
    level[f] = Math.sqrt(sum / hop);
  }
  const rise = level.map((v, f) => (f ? Math.max(0, v - level[f - 1]) : 0));
  const top = Math.max(0, ...level);
  const out: number[] = [];
  for (let f = 1; f < n; f++) {
    let near = 0;
    let count = 0;
    for (let g = Math.max(0, f - 25); g <= Math.min(n - 1, f + 25); g++, count++) near += rise[g];
    let peak = true;
    for (let g = Math.max(0, f - 2); g <= Math.min(n - 1, f + 2); g++) if (rise[g] > rise[f]) peak = false;
    // a clear rise over its own second, never room hiss; 0.3 s apart at least (200 bpm)
    if (peak && rise[f] > (near / count) * 2 && rise[f] > top * 0.05 && (!out.length || f * 0.02 - out[out.length - 1] >= 0.3)) out.push(Math.round(f * 2) / 100);
  }
  return out;
}

export const SNAP = 0.6;
export const SHORTEST = 1.2;

/**
 * Beat lengths moved so each cut lands on the nearest beat within SNAP seconds, never leaving a beat
 * under SHORTEST. The total stays what was asked: drift never builds up, the last beat takes the rest.
 */
export function snapCuts(lengths: number[], beats: number[]): number[] {
  const out: number[] = [];
  let ideal = 0;
  let prev = 0;
  lengths.forEach((len, i) => {
    ideal += len;
    let cut = ideal;
    if (i < lengths.length - 1) {
      const near = beats.filter((b) => Math.abs(b - ideal) <= SNAP && b - prev >= SHORTEST).sort((a, b) => Math.abs(a - ideal) - Math.abs(b - ideal))[0];
      if (near !== undefined) cut = near;
    }
    out.push(Math.round((cut - prev) * 100) / 100);
    prev = cut;
  });
  return out;
}

// ---------- finding the clips ----------

/** A stock video's page name as words ("woman walking on street"), the only description it carries. */
export const describe = (it: Pick<StockItem, "url">): string => (/\/video\/(.+?)-\d+\/?$/.exec(it.url)?.[1] ?? "").replace(/-/g, " ");

export interface Swapped {
  beat: string;
  /** What stood in for it. */
  used: string;
}
export interface Report {
  swapped: Swapped[];
  /** Beats left out: nothing usable was found. */
  missed: string[];
}

/** The plain sentence the adviser reads when the editor opens; empty when every beat had its clip. */
export function noteOf(r: Report): string {
  return [
    ...r.swapped.map((s) => `No good clip for "${s.beat}", used "${s.used || "a nearby clip"}" instead.`),
    r.missed.length ? `Left out for lack of a clip: ${r.missed.map((m) => `"${m}"`).join(", ")}.` : "",
  ].filter(Boolean).join(" ");
}

interface Choice {
  item: StockItem;
  /** Jev (or the first result, with no answer from it) found it fits. */
  fits: boolean;
}

/**
 * Per beat in order: the clip that shows it, else the one that stands in, else nothing. `lists` are each
 * beat's first-search and broader-search candidates and `picks` Jev's index in each (-1 none fits, null no
 * answer). A clip never goes in twice.
 */
export function chooseFor(lists: [StockItem[], StockItem[]][], picks: [number | null, number | null][]): (Choice | null)[] {
  const used = new Set<string>();
  return lists.map(([first, broad], i) => {
    const free = (xs: StockItem[]) => xs.filter((x) => !used.has(x.id));
    const take = (c: Choice | null) => (c && used.add(c.item.id), c);
    const fit = (xs: StockItem[], p: number | null): Choice | null => {
      if (p === -1) return null;
      const want = p === null ? undefined : xs[p];
      const it = want && !used.has(want.id) ? want : free(xs)[0];
      return it ? { item: it, fits: true } : null;
    };
    const a = fit(first, picks[i][0]);
    if (a) return take(a);
    const b = fit(broad, picks[i][1]);
    if (b) return take(b);
    // nothing fits: the best of what was found stands in
    const stand = free(broad)[0] ?? free(first)[0];
    return take(stand ? { item: stand, fits: false } : null);
  });
}

// ---------- the job ----------

export interface MontageAsk {
  theme: string;
  seconds: number;
  /** Words on screen over the beats that have them. */
  words: boolean;
  /** The adviser's own track, when they add one. */
  music: File | null;
}
export interface MontageJob {
  state: "writing" | "finding" | "joining" | "done" | "failed";
  /** Beats looked for so far, of how many. */
  done: number;
  of: number;
  error?: string;
}

let job: MontageJob | null = null;
const listeners = new Set<(j: MontageJob | null) => void>();
const set = (j: MontageJob | null) => {
  job = j;
  listeners.forEach((l) => l(j && { ...j }));
};
export const montageJob = () => job;
export const montageBusy = () => job?.state === "writing" || job?.state === "finding" || job?.state === "joining";
export function onMontageJob(fn: (j: MontageJob | null) => void) {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}
export const dismissMontage = () => void (job && !montageBusy() && set(null));

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function startMontage(a: MontageAsk): Promise<void> {
  if (montageBusy()) return;
  set({ state: "writing", done: 0, of: 0 });
  try {
    const plan = await callFn<{ beats: Beat[]; grade: FilterId }>("video-assist", { mode: "montage", theme: a.theme, seconds: a.seconds }, "Couldn't plan the montage right now. Try again in a minute.");
    if (!Array.isArray(plan?.beats) || !plan.beats.length) throw new Error("Couldn't plan the montage. Try again.");
    const beats = plan.beats;

    // your track: kept on this device, and its beats move the cuts
    let lengths = beats.map((b) => b.seconds);
    let music: { key: string; name: string; level: number } | undefined;
    if (a.music) {
      const key = `mu-montage-${Date.now().toString(36)}`;
      await putFile(key, a.music);
      music = { key, name: a.music.name.replace(/\.[^.]+$/, "") || "Music", level: MUSIC_LEVEL };
      const heard = await monoPcm(a.music, 22050).catch(() => null);
      if (heard) lengths = snapCuts(lengths, beatTimes(heard.pcm.subarray(0, 22050 * 50), 22050));
    }

    // a clip for each beat: its search, then Jev's pick; the broader search where nothing fits
    set({ state: "finding", done: 0, of: beats.length });
    const pick = async (asks: { say: string; items: StockItem[] }[]): Promise<(number | null)[]> => {
      if (!asks.some((x) => x.items.length)) return asks.map(() => null);
      const r = await callFn<{ picks: (number | null)[] }>("video-assist", {
        mode: "montage-pick",
        theme: a.theme,
        beats: asks.map((x) => ({ say: x.say, candidates: x.items.map((it) => ({ desc: describe(it) })) })),
      }).catch(() => null);
      return asks.map((_, i) => (typeof r?.picks?.[i] === "number" ? r.picks[i] : null));
    };
    const candidates = async (query: string, need: number) => chooseClips((await searchStock("video", query, 1, "portrait")).items, new Set(), need + 0.5, "portrait").slice(0, 5);
    const first: StockItem[][] = [];
    for (let i = 0; i < beats.length; i++) {
      first.push(await candidates(beats[i].search, lengths[i]));
      set({ state: "finding", done: i + 1, of: beats.length });
    }
    const p1 = await pick(beats.map((b, i) => ({ say: b.say, items: first[i] })));
    // the broader search, for a beat with nothing or where Jev said none fits
    const broad: StockItem[][] = beats.map(() => []);
    const again = beats.flatMap((b, i) => (first[i].length && p1[i] !== -1) || b.fallback === b.search ? [] : [i]);
    for (const i of again) broad[i] = await candidates(beats[i].fallback, lengths[i]);
    const p2 = await pick(beats.map((b, i) => ({ say: b.say, items: broad[i] })));
    const chosen = chooseFor(beats.map((_, i) => [first[i], broad[i]]), beats.map((_, i) => [p1[i], p2[i]]));

    // keep them, and build the report of what had no good clip
    const report: Report = { swapped: [], missed: [] };
    const takes: { file: Blob; start: number; end: number }[] = [];
    const lens: number[] = [];
    const kept: number[] = [];
    for (let i = 0; i < beats.length; i++) {
      const c = chosen[i];
      const blob = c ? await downloadStock(c.item.src).catch(() => null) : null;
      if (!c || !blob) {
        report.missed.push(beats[i].say);
        continue;
      }
      if (!c.fits) report.swapped.push({ beat: beats[i].say, used: describe(c.item) });
      takes.push({ file: blob, start: 0, end: Math.min(lengths[i], c.item.duration ?? lengths[i]) });
      lens.push(takes[takes.length - 1].end);
      kept.push(i);
    }
    if (takes.length < 3) throw new Error("Couldn't find enough clips for that theme. Try a different one.");

    // words on screen over their beats
    const overlays: Overlay[] = [];
    if (a.words) {
      let at = 0;
      kept.forEach((bi, k) => {
        const text = beats[bi].text;
        if (text && overlays.length < MAX_OVERLAYS) overlays.push({ ...newOverlay("text", at + 0.1, "#FFFFFF"), text, to: Math.floor((at + lens[k] - 0.1) * 10) / 10 });
        at += lens[k];
      });
    }

    set({ state: "joining", done: takes.length, of: takes.length });
    while (currentJoin()) await sleep(1000);
    await startJoin(a.theme.slice(0, 40), takes, "Putting your montage together", {
      mute: true,
      extra: { note: noteOf(report), settings: { filter: plan.grade, captions: false, overlays, ...(music ? { music } : {}) } },
    });
    set({ state: "done", done: takes.length, of: takes.length });
  } catch (e) {
    set({ state: "failed", done: 0, of: 0, error: (e as Error).message || "That didn't go through. Try again." });
  }
}
