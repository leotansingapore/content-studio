// The video's post caption for TikTok, LinkedIn, Facebook, YouTube (title and
// description), X and Threads (Instagram's is the editor's own caption):
// written in one video-assist "captions" call, edited here, kept per video
// under a content-studio- key that ends in the user and profile so it syncs. firstLine is the spoken keyword's
// ask ("Comment "PLAN" ..."), waiting for the consultant to add or skip it.

import { callFn } from "@/lib/edgeFn";
import { scoped } from "@/lib/profiles";
import { CAPTION_PLATFORMS, PLATFORM_RULES, YOUTUBE_TITLE_MAX, xParts, type CaptionPlatform, type CaptionSet } from "../../supabase/functions/video-assist/captions.ts";

export { CAPTION_PLATFORMS, PLATFORM_RULES, YOUTUBE_TITLE_MAX, xParts, type CaptionPlatform };
export type PlatformCaptionSet = CaptionSet & { firstLine?: string };

const KEYS = [...CAPTION_PLATFORMS, "youtubeTitle", "firstLine"] as const;
const OLD_PREFIX = "content-studio-video-captions-";
/** Ends in the user and profile, so the sync keeps it in this account and removeProfile takes it. */
export const captionsKey = (userId: string, projectId: string) => `${OLD_PREFIX}${projectId}-${scoped(userId)}`;

/** Deletes a video's captions, under its own key and the old one with no user in it. */
export function removePlatformCaptions(userId: string, projectId: string) {
  try {
    localStorage.removeItem(captionsKey(userId, projectId));
    localStorage.removeItem(OLD_PREFIX + projectId);
  } catch {
    // storage blocked: nothing was kept
  }
}

/** The stored captions for this video, kept only as strings for known keys. Captions saved under the old key move to this account's. */
export function loadPlatformCaptions(userId: string, projectId: string): PlatformCaptionSet {
  try {
    const own = localStorage.getItem(captionsKey(userId, projectId));
    const old = own === null ? localStorage.getItem(OLD_PREFIX + projectId) : null;
    if (old !== null) {
      localStorage.setItem(captionsKey(userId, projectId), old);
      localStorage.removeItem(OLD_PREFIX + projectId);
    }
    const raw = JSON.parse(own ?? old ?? "{}") as Record<string, unknown>;
    const out: PlatformCaptionSet = {};
    for (const p of KEYS) if (typeof raw?.[p] === "string") out[p] = (raw[p] as string).slice(0, 63206);
    return out;
  } catch {
    return {};
  }
}

export function savePlatformCaptions(userId: string, projectId: string, set: PlatformCaptionSet) {
  try {
    localStorage.setItem(captionsKey(userId, projectId), JSON.stringify(set));
  } catch {
    // storage full or blocked: the captions stay on screen for this visit
  }
}

/** `rules`: the brand kit's rules line (brandRules.ts), "" when it sets none. firstLine is unset when no keyword was heard. */
export async function writePlatformCaptions(transcript: string, instagram: string, title: string, rules = ""): Promise<PlatformCaptionSet> {
  const res = await callFn<{ captions?: CaptionSet; firstLine?: string | null }>("video-assist", { mode: "captions", transcript, instagram, title, rules: rules || undefined }, "Couldn't write the captions right now. Try again in a minute.");
  const out: PlatformCaptionSet = {};
  for (const p of CAPTION_PLATFORMS) if (typeof res?.captions?.[p] === "string") out[p] = res.captions[p];
  if (!Object.keys(out).length) throw new Error("The captions came back incomplete. Try again.");
  if (typeof res?.captions?.youtubeTitle === "string") out.youtubeTitle = res.captions.youtubeTitle;
  if (typeof res?.firstLine === "string" && res.firstLine.trim()) out.firstLine = res.firstLine.trim().slice(0, 200);
  return out;
}
