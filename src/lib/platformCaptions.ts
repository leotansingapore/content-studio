// The video's post caption for TikTok, LinkedIn and Facebook (Instagram's is
// the editor's own caption): written in one video-assist "captions" call,
// edited here, kept per video under a content-studio- key so it syncs.

import { callFn } from "@/lib/edgeFn";
import { CAPTION_PLATFORMS, type CaptionPlatform } from "../../supabase/functions/video-assist/captions.ts";

export { CAPTION_PLATFORMS, type CaptionPlatform };
export type PlatformCaptionSet = Partial<Record<CaptionPlatform, string>>;

const key = (projectId: string) => `content-studio-video-captions-${projectId}`;

/** The stored captions for this video, kept only as strings for known platforms. */
export function loadPlatformCaptions(projectId: string): PlatformCaptionSet {
  try {
    const raw = JSON.parse(localStorage.getItem(key(projectId)) ?? "{}") as Record<string, unknown>;
    const out: PlatformCaptionSet = {};
    for (const p of CAPTION_PLATFORMS) if (typeof raw?.[p] === "string") out[p] = (raw[p] as string).slice(0, 63206);
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

export async function writePlatformCaptions(transcript: string, instagram: string, title: string): Promise<PlatformCaptionSet> {
  const res = await callFn<{ captions?: PlatformCaptionSet }>("video-assist", { mode: "captions", transcript, instagram, title }, "Couldn't write the captions right now. Try again in a minute.");
  const out: PlatformCaptionSet = {};
  for (const p of CAPTION_PLATFORMS) if (typeof res?.captions?.[p] === "string") out[p] = res.captions[p];
  if (!Object.keys(out).length) throw new Error("The captions came back incomplete. Try again.");
  return out;
}
