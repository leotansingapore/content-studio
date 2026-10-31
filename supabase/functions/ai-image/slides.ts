// AI pictures for a made slideshow (ai-image mode "slides", NORTH_STAR_USERS only): one Soul v2 picture per slide,
// every one in the same look, so a slideshow holds one style (the 30 Oct teardowns: gymmadesimple's figures,
// glowuptrickz's faces). The looks are the AI video explainer's (ai-video/logic.ts EXPLAINER_LOOKS, pictureBody).
//   POST {mode:"slides", pictures, look, aspect} -> {tokens}: counts once against "slide-pictures" and
//        "slide-pictures-global"; each token is read with {mode:"status"} like a Make the image job.

import { LOOK_IDS, pictureBody, type LookId } from "../ai-video/logic.ts";

export const MAX_SLIDE_PICTURES = 10;
export const MAX_SLIDE_PICTURE = 200;
/** 9:16 for a TikTok slideshow; 3:4 is Soul v2's nearest to a 4:5 one (as buildImageBody). */
export const SLIDE_ASPECTS = ["9:16", "3:4"] as const;
export type SlideAspect = (typeof SLIDE_ASPECTS)[number];

export interface SlidesRequest {
  pictures: string[];
  look: LookId;
  aspect: SlideAspect;
}

export function parseSlides(raw: unknown): { ok: true; request: SlidesRequest } | { ok: false; error: string } {
  const b = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const list = Array.isArray(b.pictures) ? b.pictures : [];
  const pictures = list.map((p) => (typeof p === "string" ? p.replace(/\s+/g, " ").trim() : ""));
  if (!pictures.length || pictures.length > MAX_SLIDE_PICTURES) return { ok: false, error: `Ask for 1 to ${MAX_SLIDE_PICTURES} pictures.` };
  if (pictures.some((p) => p.length < 3 || p.length > MAX_SLIDE_PICTURE)) return { ok: false, error: `Describe each picture in 3 to ${MAX_SLIDE_PICTURE} characters.` };
  const look = LOOK_IDS.find((l) => l === b.look);
  if (!look) return { ok: false, error: "Pick a look." };
  const aspect = SLIDE_ASPECTS.find((a) => a === b.aspect);
  if (!aspect) return { ok: false, error: "Pick 9:16 or 4:5." };
  return { ok: true, request: { pictures, look, aspect } };
}

/** One slide's picture: what it shows, in the look with Leo's people rule (no words on it), at the slideshow's shape. */
export const slidePictureBody = (picture: string, look: LookId, aspect: SlideAspect): Record<string, unknown> => ({
  ...pictureBody(`A picture of ${picture}.`, look),
  aspect_ratio: aspect,
});
