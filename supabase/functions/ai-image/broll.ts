// ai-image mode "broll": an AI B-roll clip for a line stock footage had nothing
// for (the video editor's "Add B-roll for me", switched on 2026-10-10 once the
// Higgsfield API pool was topped up). Higgsfield makes a Soul v2 picture of the scene
// at 720p, then DoP lite moves it for 5 s: 0.05 + 2 credits, about USD 0.13 a
// clip (Higgsfield's free estimate, 2026-10-09). One clip counts once against
// "ai-broll" (3 a day per adviser) and once against "ai-broll-global" (20 a day
// across everyone). Pure, so vitest covers it (broll.test.ts).

import { PEOPLE_RULE } from "./logic.ts";

export const PICTURE_MODEL = "higgsfield-ai/soul/v2/standard";
// Not on Higgsfield's public catalog, but the API serves it: its free POST /estimate/higgsfield-ai/dop/lite at 5 s
// answered 2 credits, US$0.125 on 2026-10-21 (an unknown route answers 404 model_not_found).
export const MOTION_MODEL = "higgsfield-ai/dop/lite";
export const CLIP_SECONDS = 5;
/** DoP lite's credits for one CLIP_SECONDS clip (that estimate); prices.ts DOP_LITE_CREDITS must match. */
export const MOTION_CREDITS = 2;
const MOTION_PROMPT = "Slow, steady camera push in with gentle natural movement in the scene. Realistic, no text, no cuts.";

export type Aspect = "9:16" | "16:9" | "1:1";

export interface AiBrollRequest {
  /** The 1 to 3 word stock search that found nothing. */
  search: string;
  /** The line it goes over, for context. */
  line: string;
  aspect: Aspect;
}

/** AI B-roll spends the studio's Higgsfield credits, so the server decides, not the browser:
 * it runs only while the AI_BROLL_ENABLED secret is "1" (on since 2026-10-10). */
export const aiBrollEnabled = (flag: string | undefined) => flag?.trim() === "1";

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

/** The picture moved for CLIP_SECONDS, by today's realistic push in or the given prompt (an explainer look's motion). */
export const motionBody = (imageUrl: string, prompt = MOTION_PROMPT): Record<string, unknown> => ({ prompt, image_url: imageUrl, duration: CLIP_SECONDS });
