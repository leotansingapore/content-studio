// Filming a short video script in Write (formats-hooks-scripts, Leo only): the titles and cover line for the post,
// kept on the draft.

import { getDraftById, upsertDraft } from "@/lib/draftHistory";
import { callFn } from "@/lib/edgeFn";
import { countWords, spokenLines } from "@/lib/platformCounters";

/** Words a second at a natural speaking pace (platformCounters' spokenSeconds). */
const SAY_RATE = 2.5;

/**
 * The script as timed sentences for video-assist publish, spread at 2.5 words a second. The function refuses a
 * video under 3 s, so a very short script still counts as 3 s.
 */
export function scriptSentences(script: string): { sentences: { s: number; e: number; text: string }[]; duration: number } {
  let t = 0;
  const sentences = spokenLines(script)
    .flatMap((line) => line.split(/(?<=[.!?])\s+/))
    .filter((text) => countWords(text) > 0)
    .map((text) => {
      const s = t;
      t = Math.round((t + countWords(text) / SAY_RATE) * 10) / 10;
      return { s, e: t, text: text.slice(0, 400) };
    });
  return { sentences, duration: Math.max(3, t) };
}

export const TITLES_FAILED = "Couldn't write titles right now. Try again in a minute.";
const runs = new Map<string, Promise<{ titles: string[]; cover: string }>>();

/** The titles being written for this draft, if they are. */
export const titlesRun = (draftId: string) => runs.get(draftId) ?? null;

/**
 * Three titles and a cover line for a script (video-assist publish, the video-publish cap), saved on the draft. It
 * runs outside the page, so they land on the draft even when the adviser opens another page meanwhile. The reply's
 * cover moment is for a finished video, so it is ignored. One run at a time per draft.
 */
export function writeTitles(userId: string, draftId: string, script: string): Promise<{ titles: string[]; cover: string }> {
  const running = runs.get(draftId);
  if (running) return running;
  const promise = callFn<{ titles?: unknown; cover?: unknown }>("video-assist", { mode: "publish", ...scriptSentences(script) }, TITLES_FAILED)
    .then((r) => {
      const titles = (Array.isArray(r?.titles) ? r.titles : []).filter((t): t is string => typeof t === "string" && t.trim() !== "").slice(0, 3);
      const cover = typeof r?.cover === "string" ? r.cover.trim() : "";
      if (!titles.length || !cover) throw new Error(TITLES_FAILED);
      const entry = getDraftById(userId, draftId);
      if (entry) upsertDraft(userId, { ...entry, titles, cover });
      return { titles, cover };
    })
    .finally(() => runs.delete(draftId));
  runs.set(draftId, promise);
  return promise;
}
