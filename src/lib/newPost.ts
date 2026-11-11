// Where "New post" goes (Leo 11 Nov): Create > Start with the topic box focused, so a typed topic opens the writer on
// its last step. Someone mid-post is not interrupted: while this tab holds an unfinished post in the writer (its
// cs-write-brief-<brand> scratch, GeneratePage's briefKey), the button goes back to it instead.
import { scoped } from "@/lib/profiles";

/** Create > Start, its topic box focused (StudioPage reads the #topic). */
export const NEW_POST = "/studio#topic";

export function newPostHref(userId: string | null | undefined): string {
  if (!userId) return NEW_POST;
  try {
    return globalThis.sessionStorage?.getItem(`cs-write-brief-${scoped(userId)}`) ? "/generate" : NEW_POST;
  } catch {
    return NEW_POST; // storage blocked: nothing could have been kept
  }
}

export const leftOpenPost = (was: string | null, now: string | null, nav: string) => nav === "PUSH" && !!was && !now;
