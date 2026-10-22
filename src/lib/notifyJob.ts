// Make a notification stack (/make/notification-stack, src/lib/notifyStack.ts) outside React, so leaving the page keeps
// it going (wallJob.ts's shape). No AI writes anything: the adviser types the lines and the word. The clip behind them
// is a Pexels clip of an Asian person Jev picks, the way a wall of text finds one, or the adviser's own video; either
// loops to the stack's length and videoMedia's join records it, muted, with the cards and the word riding in its
// extra, then the editor opens it. In memory only: a reload mid-make loses the run, and nothing paid goes with it.

import { mediaLength } from "@/lib/longAudio";
import { stackLines, stackSettings, stackTimes } from "@/lib/notifyStack";
import { screenMeasure } from "@/lib/slideshowDraw";
import { downloadStock } from "@/lib/stockMedia";
import { currentJoin, ensureCaptionFonts, startJoin, type JoinExtra } from "@/lib/videoMedia";
import { FINISH_FAILED, OPEN_FAILED, findClip, loopTakes, type WallBg } from "@/lib/wallJob";

export interface NotifyAsk {
  lines: string[];
  word: string;
  label: string;
  bg: WallBg;
  /** The adviser's own clip with bg mine; it stays on this device. */
  file?: File | null;
}

export interface NotifyJob {
  id: number;
  /** finding: a stock clip, or reading the adviser's own; joining: the editor takes over from here. */
  state: "finding" | "joining" | "done" | "failed";
  ask: NotifyAsk;
  /** What went to the join: the page knows the video waiting for the editor is this one by it. */
  extra?: JoinExtra;
  error?: string;
  /** No stock clip came up: the adviser's own video is the way on. */
  noClip?: boolean;
}

export const NOTIFY_TOAST = "Your notification stack is ready. Export it when it looks right.";
export const NO_STOCK = "No stock clip came up. Try again in a minute or pick your own video.";
const JOIN_LABEL = "Putting your notification stack together";
/**
 * What the stock search asks for and Jev looks for: someone alone with their thoughts suits any list of worries. The
 * search asks for an Asian person (people are Singaporean by default; a plain "person thinking" drew a Western woman);
 * the scene stays race-blind, because Jev reads only Pexels page names, which never say who is in the clip.
 */
export const STOCK = { search: "asian person thinking", scene: "someone alone, deep in thought", again: "city night" };

let job: NotifyJob | null = null;
let seq = 0;
const listeners = new Set<(j: NotifyJob | null) => void>();
const set = (next: NotifyJob | null) => {
  job = next;
  listeners.forEach((l) => l(next && { ...next }));
};
export const notifyJob = () => job;
export const notifyBusy = () => job?.state === "finding" || job?.state === "joining";
export function onNotifyJob(fn: (j: NotifyJob | null) => void): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function startNotify(ask: NotifyAsk): Promise<void> {
  if (notifyBusy()) return;
  const id = ++seq;
  // a newer run is never touched by an older one finishing
  const mine = (patch: Partial<NotifyJob>) => void (job?.id === id && set({ ...job, ...patch }));
  const own = ask.bg === "mine" && ask.file ? ask.file : null;
  set({ id, state: "finding", ask });
  try {
    await ensureCaptionFonts();
    const lines = stackLines(ask.lines);
    const seconds = stackTimes(lines.length).total;
    // the post caption is the video's own words, as a wall of text with no caption posts its words
    const extra: JoinExtra = { settings: stackSettings(ask, screenMeasure()), caption: [...lines, ask.word.trim()].join("\n"), toast: NOTIFY_TOAST };
    let clip: Blob;
    let length: number;
    if (own) {
      clip = own;
      length = await mediaLength(own);
      if (!(length > 0)) return void mine({ state: "failed", error: OPEN_FAILED });
    } else {
      const found = await findClip({ scene: STOCK.scene, search: STOCK.search }, STOCK.again);
      if (!found) return void mine({ state: "failed", error: NO_STOCK, noClip: true });
      clip = await downloadStock(found.src);
      length = (await mediaLength(clip)) || found.duration || seconds;
    }
    mine({ state: "joining", extra });
    // a video the editor hasn't picked up yet (a paid avatar) is never overwritten
    while (currentJoin()) await sleep(1000);
    await startJoin("Notification stack", loopTakes(clip, length, seconds), JOIN_LABEL, { mute: true, extra });
    const joined = currentJoin();
    if (joined?.state === "failed") return void mine({ state: "failed", error: joined.error || FINISH_FAILED });
    mine({ state: "done" });
  } catch (e) {
    mine({ state: "failed", error: e instanceof Error && e.message ? e.message : FINISH_FAILED });
  }
}
