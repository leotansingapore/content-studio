// Storyboards for any short-video draft in Write: the storyboard edge function
// splits the script into the shot list Clone a reel shows, and the result is
// kept on the draft (My posts, synced by cloudSync).

import { getDraftById, upsertDraft, type Storyboard } from "@/lib/draftHistory";
import { ReelCloneError, invokeFunction, type ShotBeat } from "@/lib/reelClone";

export type { Storyboard };

const runs = new Map<string, Promise<Storyboard>>();

/** The storyboard being made for this draft, if one is. */
export const storyboardRun = (draftId: string) => runs.get(draftId) ?? null;

/**
 * Makes the shot list for a draft's script and saves it on the draft. It runs
 * outside the page, so it lands even when the consultant opens another page
 * meanwhile. One at a time per draft.
 */
export function makeStoryboard(userId: string, draftId: string, script: string, topic: string): Promise<Storyboard> {
  const running = runs.get(draftId);
  if (running) return running;
  const promise = invokeFunction("storyboard", { script, topic })
    .then((data) => {
      const beats = (data as { beats?: ShotBeat[] } | null)?.beats;
      if (!Array.isArray(beats) || beats.length < 2 || beats.some((b) => typeof b?.say !== "string")) {
        throw new ReelCloneError("The storyboard came back incomplete. Try again.", "server_error", 200);
      }
      const board: Storyboard = { beats, script, madeAt: new Date().toISOString() };
      const entry = getDraftById(userId, draftId);
      if (entry) upsertDraft(userId, { ...entry, storyboard: board });
      return board;
    })
    .finally(() => runs.delete(draftId));
  runs.set(draftId, promise);
  return promise;
}
