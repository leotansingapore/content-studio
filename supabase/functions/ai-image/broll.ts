// ai-image mode "broll": an AI B-roll clip for a line stock footage had nothing
// for (the video editor's "Add B-roll for me", behind a switch while the
// Higgsfield API pool is empty). Higgsfield makes a Soul v2 picture of the scene
// at 720p, then DoP lite moves it for 5 s: 0.05 + 2 credits, about USD 0.13 a
// clip (Higgsfield's free estimate, 2026-10-09). One clip counts once against
// "ai-broll" (3 a day per adviser) and once against "ai-broll-global" (20 a day
// across everyone). Pure, so vitest covers it (broll.test.ts).

import { PEOPLE_RULE } from "./logic.ts";

export const PICTURE_MODEL = "higgsfield-ai/soul/v2/standard";
export const MOTION_MODEL = "higgsfield-ai/dop/lite";
export const CLIP_SECONDS = 5;
const MOTION_PROMPT = "Slow, steady camera push in with gentle natural movement in the scene. Realistic, no text, no cuts.";

export type Aspect = "9:16" | "16:9" | "1:1";

export interface AiBrollRequest {
  /** The 1 to 3 word stock search that found nothing. */
  search: string;
  /** The line it goes over, for context. */
  line: string;
  aspect: Aspect;
}

export function parseAiBroll(raw: unknown): { ok: true; request: AiBrollRequest } | { ok: false; error: string } {
  const b = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const clean = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
  const search = clean(b.search, 40);
  if (search.length < 3) return { ok: false, error: "Say what the clip should show." };
  const aspect = (["9:16", "16:9", "1:1"] as const).find((a) => a === b.aspect) ?? "9:16";
  return { ok: true, request: { search, line: clean(b.line, 300), aspect } };
}

/** The scene as one realistic picture in the video's shape, with the studio's people rule. */
export function scenePictureBody(r: AiBrollRequest): Record<string, unknown> {
  const said = r.line ? ` It shows while someone says: "${r.line.replace(/"/g, "'")}"` : "";
  return { prompt: `A realistic photo of ${r.search}, as B-roll in a short video.${said}\n\n${PEOPLE_RULE}`, aspect_ratio: r.aspect, resolution: "720p", batch_size: 1 };
}

/** The picture moved for CLIP_SECONDS. */
export const motionBody = (imageUrl: string): Record<string, unknown> => ({ prompt: MOTION_PROMPT, image_url: imageUrl, duration: CLIP_SECONDS });
