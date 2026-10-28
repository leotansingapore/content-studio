import { describe, expect, it } from "vitest";
import {
  buildSystemForVariant,
  hashtagsSystemPrompt,
  hashtagsUserPrompt,
  imagePromptSystemPrompt,
  imagePromptUserPrompt,
  userPrompt,
  voiceSummarySystemPrompt,
  voiceSummaryUserPrompt,
  type Audience,
  type CtaType,
  type Format,
  type Pillar,
  type Platform,
  type RequestBody,
} from "./logic";

const PILLARS: Pillar[] = ["interest", "identity", "topic", "market"];
const FORMATS: Format[] = ["carousel", "short-video", "text-post", "story"];
const PLATFORMS: Platform[] = ["linkedin", "instagram", "facebook", "tiktok"];
const CTAS: CtaType[] = ["dm-keyword", "comment-keyword", "save-share", "book-call", "open-question"];
const AUDIENCES: (Audience | undefined)[] = [undefined, "general", "young-adult", "working-adult", "parent", "pre-retiree"];

/** Every pillar and format, with the platform, CTA, audience and optional fields rotating through all their values. */
export const BODIES: RequestBody[] = PILLARS.flatMap((pillar, p) =>
  FORMATS.map((format, f) => {
    const i = p * FORMATS.length + f;
    return {
      pillar,
      format,
      platform: PLATFORMS[i % PLATFORMS.length],
      ctaType: CTAS[i % CTAS.length],
      audience: AUDIENCES[i % AUDIENCES.length],
      ideaSource: i % 2 ? "A real question from a client this week" : "",
      ...(i % 3 ? { pillarDetail: "Weekend running" } : {}),
      ...(i % 4 ? { ideaContext: "Someone asked me how to start." } : {}),
      ...(i % 5 === 1 ? { styleReference: "Short lines. One question at the end." } : {}),
      ...(i % 3 === 2 ? { voiceSummary: "Warm and plain. Short sentences." } : {}),
      ...(i % 4 === 3 ? { singlish: true } : {}),
      chosenHook: "Most people get this backwards.",
      posts: ["First past post.", "Second past post."],
      draft: "A draft about getting started.",
    };
  }),
);

/** Every prompt the function builds for one body: hooks, body and post (variant `i % 5`, all five for the first), then the side modes. */
export function allPrompts(body: RequestBody, i: number) {
  return {
    variants: (["hooks", "body", "post"] as const).flatMap((mode) =>
      (i ? [i % 5] : [0, 1, 2, 3, 4]).map((v) => ({ mode, v, system: buildSystemForVariant(body, mode, v), user: userPrompt(body, mode) })),
    ),
    voice: [voiceSummarySystemPrompt(body), voiceSummaryUserPrompt(body)],
    hashtags: [hashtagsSystemPrompt(body), hashtagsUserPrompt(body)],
    image: [imagePromptSystemPrompt(body), imagePromptUserPrompt(body)],
  };
}

describe("generate-social-content prompts", () => {
  it("a caller that sends no profession gets the live adviser prompts, byte for byte", async () => {
    await expect(JSON.stringify(BODIES.map(allPrompts), null, 2)).toMatchFileSnapshot("./__pins__/adviser-prompts.json");
  });
});
