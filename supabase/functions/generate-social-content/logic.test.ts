import { describe, expect, it } from "vitest";
import {
  buildSystemForVariant,
  hashtagsSystemPrompt,
  hashtagsUserPrompt,
  imagePromptSystemPrompt,
  imagePromptUserPrompt,
  requestError,
  AUDIENCE_VALUES,
  CTA_VALUES,
  FORMAT_VALUES,
  PILLAR_VALUES,
  PLATFORM_VALUES,
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
import { adviserWordsIn, PROFESSIONS } from "../_shared/adviserWords";

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

describe("request sizes", () => {
  const post = (mode: string, extra: Record<string, unknown> = {}) => ({ ...BODIES[1], mode, ...extra });
  const kb = (n: number) => "x".repeat(n * 1000);

  it("takes the largest the app sends: a long rewrite with brand rules and memory, 5 long past posts", () => {
    expect(requestError(post("post", { ideaContext: kb(15), styleReference: kb(6), voiceSummary: kb(4), pillarDetail: kb(0.5) }))).toBeNull();
    expect(requestError({ mode: "voice-summary", posts: Array(10).fill(kb(5)) })).toBeNull();
    expect(requestError(post("hashtags", { draft: kb(10) }))).toBeNull();
  });

  it.each([
    ["ideaContext", 20_001],
    ["styleReference", 8_001],
    ["voiceSummary", 6_001],
    ["draft", 10_001],
    ["pillarDetail", 1_001],
    ["chosenHook", 1_001],
    ["ideaSource", 1_001],
  ])("refuses %s over its cap with a plain message", (field, size) => {
    expect(requestError(post("post", { [field]: "x".repeat(size - 1) }))).toBeNull();
    expect(requestError(post("post", { [field]: "x".repeat(size) }))).toBe("That's too long to write from. Shorten it and try again.");
  });

  it("refuses more than 10 past posts, or one over 5,000 characters", () => {
    expect(requestError({ mode: "voice-summary", posts: Array(11).fill("A past post.") })).toBe("Send at most 10 past posts.");
    expect(requestError({ mode: "voice-summary", posts: ["A past post.", "x".repeat(5_001)] })).toBe("That's too long to write from. Shorten it and try again.");
  });

  it("keeps today's messages for a request missing what its mode needs", () => {
    expect(requestError({ mode: "voice-summary", posts: [" "] })).toBe("voice-summary requires at least 1 past post");
    expect(requestError({ mode: "hashtags" })).toBe("hashtags requires a draft");
    expect(requestError({ mode: "image-prompt", draft: "  " })).toBe("image-prompt requires a draft");
    expect(requestError({ mode: "post", pillar: "topic" })).toBe("Missing required fields: pillar, format, platform, ideaSource, ctaType");
    expect(requestError(post("body", { chosenHook: " " }))).toBe("mode 'body' requires chosenHook");
  });

  const UNREADABLE = "Couldn't read that request. Reload the page and try again.";

  it.each(["ideaContext", "styleReference", "voiceSummary", "draft", "pillarDetail", "chosenHook", "ideaSource"])(
    "refuses %s when it is there but isn't text",
    (field) => {
      for (const v of [123, null, ["a"], { a: 1 }]) expect(requestError(post("post", { [field]: v }))).toBe(UNREADABLE);
    },
  );

  it("refuses past posts that aren't a list of text", () => {
    expect(requestError({ mode: "voice-summary", posts: "A past post." as unknown as string[] })).toBe(UNREADABLE);
    expect(requestError({ mode: "voice-summary", posts: ["A past post.", 7 as unknown as string] })).toBe(UNREADABLE);
  });

  it("takes every pillar, format, platform, CTA and audience the app's types allow, and nothing else", () => {
    const lists = { pillar: PILLAR_VALUES, format: FORMAT_VALUES, platform: PLATFORM_VALUES, ctaType: CTA_VALUES, audience: AUDIENCE_VALUES };
    for (const [field, values] of Object.entries(lists)) {
      for (const v of values) expect(requestError(post("post", { [field]: v }))).toBeNull();
      expect(requestError(post("post", { [field]: "nope" }))).toBe(UNREADABLE);
      expect(requestError(post("hashtags", { draft: "A post.", [field]: "nope" }))).toBe(UNREADABLE);
    }
    expect(requestError(post("post", { audience: undefined }))).toBeNull();
  });
});

describe("generate-social-content for the brand's profession", () => {
  it("an adviser's brand, or one with nothing set, gets the same pinned prompts as a caller that sends none", () => {
    const today = JSON.stringify(BODIES.map(allPrompts));
    for (const profession of ["", "  ", "Financial adviser", "financial ADVISER"]) {
      expect(JSON.stringify(BODIES.map((b, i) => allPrompts({ ...b, profession }, i)))).toBe(today);
    }
  });

  it.each(PROFESSIONS)("$raw gets every prompt written for them, with none of the adviser words", ({ raw, said }) => {
    BODIES.forEach((b, i) => {
      const out = allPrompts({ ...b, profession: raw }, i);
      for (const v of out.variants) expect(v.system).toContain(`assistant for a ${said}.`);
      expect(out.hashtags[0]).toContain(`for a ${said}.`);
      expect(adviserWordsIn(JSON.stringify(out))).toEqual([]);
    });
  });

  it("keeps the honesty rules for everyone", () => {
    const out = allPrompts({ ...BODIES[1], profession: "Coach" }, 1);
    expect(out.variants[0].system).toContain("Never invent a number, a result, a client story or a testimonial, and never promise an outcome.");
  });
});
