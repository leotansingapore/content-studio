// The video's post caption for TikTok, LinkedIn, Facebook, YouTube (title and
// description), X and Threads (Instagram's is the editor's own caption):
// written in one video-assist "captions" call, edited here, kept per video
// under a content-studio- key so it syncs. firstLine is the spoken keyword's
// ask ("Comment "PLAN" ..."), waiting for the consultant to add or skip it.

import { callFn } from "@/lib/edgeFn";
import { CAPTION_PLATFORMS, PLATFORM_RULES, YOUTUBE_TITLE_MAX, xParts, type CaptionPlatform, type CaptionSet } from "../../supabase/functions/video-assist/captions.ts";

export { CAPTION_PLATFORMS, PLATFORM_RULES, YOUTUBE_TITLE_MAX, xParts, type CaptionPlatform };
export type PlatformCaptionSet = CaptionSet & { firstLine?: string };

const KEYS = [...CAPTION_PLATFORMS, "youtubeTitle", "firstLine"] as const;
const key = (projectId: string) => `content-studio-video-captions-${projectId}`;

/** The stored captions for this video, kept only as strings for known keys. */
export function loadPlatformCaptions(projectId: string): PlatformCaptionSet {
  try {
    const raw = JSON.parse(localStorage.getItem(key(projectId)) ?? "{}") as Record<string, unknown>;
    const out: PlatformCaptionSet = {};
    for (const p of KEYS) if (typeof raw?.[p] === "string") out[p] = (raw[p] as string).slice(0, 63206);
    return out;
  } catch {
    return {};
  }
}

export function savePlatformCaptions(projectId: string, set: PlatformCaptionSet) {
  try {
    localStorage.setItem(key(projectId), JSON.stringify(set));
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
