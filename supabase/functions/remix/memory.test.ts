// The brand's memory line (src/lib/voiceMemory.ts memoryLine) in every make: none, or an empty one, builds today's
// prompts byte for byte (the pins taken before it); one with words goes in after the brand rules and nowhere else, and
// its Avoid items are checked in code like the format checks.
import { describe, expect, it } from "vitest";
import { STATIC_LAYOUTS, TOPIC_AS, avoidOf, avoidProblem, buildMakePrompt, jevFacts, makeProblem, parseMakeRequest, responseFormat, wordsFound, type MadeResult } from "./logic";

const SOURCE = { key: "top:jane-instagram-C1", kind: "top-post", format: "carousel", platform: "instagram", author: "@jane", title: "3 signs", text: "3 signs your week is too full. 1. You eat lunch at your desk. 2. You answer email at midnight. 3. You skip the gym." };
const ADVISER = { name: "Jane Tan", oneLiner: "I help young families plan", audience: "young parents", topics: ["Insurance basics"], facts: "- Ten years advising", mention: true, offer: null, rules: "MY BRAND RULES (these win over any other emoji, hashtag or link guidance): Use no emoji at all." };
const BIZ = { ...ADVISER, name: "Hilltop Coffee", speaker: "business" };
const MEMORY = [
  "ABOUT ME, FROM WHAT I HAVE TOLD YOU (follow these unless MY BRAND RULES say otherwise):",
  "- Facts you may state about me (state no other facts, numbers, awards or results about me): My current offer, to quote word for word: 20% off the first month (last day 30 Nov 2026); Where I work: Singapore; Claim: Saves 2 hours a week",
  "- Keep doing or avoid: Avoid: game-changer; Avoid: unlock your potential; Do: Speak plainly; Don't: Promise returns; Keep posts short",
].join("\n");

const req = (b: Record<string, unknown>, brand: Record<string, unknown>) => {
  const r = parseMakeRequest({ mode: "make", ...b, brand: { ...brand, ...(b.brand as object | undefined) } });
  if (!r.ok) throw new Error(r.error);
  return r.value;
};

// every shape that needs nothing more than a topic or a source, plus the image, meme and ad layouts
const SHAPES: Record<string, unknown>[] = [
  ...(["post", "carousel", "script", "speaking", "explainer", "slideshow", "wall", "notes"] as const).flatMap((as) => [...(TOPIC_AS.includes(as) ? [{ as, topic: "Signs your week is too full" }] : []), { as, source: SOURCE }]),
  { as: "image", layout: "headline", topic: "Why a hospital plan has a co-pay" },
  { as: "image", layout: "street-poster", source: SOURCE },
  { as: "meme", layout: "pov", topic: "Saving for a flat" },
  { as: "ads", layout: "headline", versions: ["contrarian", "mistake"], topic: "Why a hospital plan has a co-pay" },
];
const BRANDS = { adviser: ADVISER, business: BIZ };

describe("an empty or absent memory", () => {
  it.each(Object.entries(BRANDS))("leaves the %s brand's prompts, response shapes and Jev facts byte for byte", (_, brand) => {
    for (const shape of SHAPES) {
      const today = req(shape, brand);
      for (const memory of ["", "  \n\t ", null, 42, ["Avoid: x"], { text: "x" }]) {
        const r = req(shape, { ...brand, memory });
        expect(r.brand, JSON.stringify([shape, memory])).not.toHaveProperty("memory");
        expect(buildMakePrompt(r)).toEqual(buildMakePrompt(today));
        expect(responseFormat(r)).toEqual(responseFormat(today));
        expect(jevFacts(r.brand)).toBe(jevFacts(today.brand));
      }
    }
  });

  it("still builds the pinned adviser slideshow prompts", async () => {
    // the bodies of profession.test.ts, which took this pin
    const brand = { name: "Jane Tan", oneLiner: "", audience: "busy parents", topics: [], facts: "", mention: true, offer: null, rules: "", memory: "" };
    const bodies = [
      { as: "slideshow", topic: "Signs your week is too full" },
      { as: "slideshow", source: SOURCE },
      { as: "slideshow", topic: "Signs your week is too full", brandAt: "inside", note: "I run a 6am class on Tuesdays." },
      { as: "slideshow", source: SOURCE, brand: { topics: ["Morning routines"], mention: false } },
    ];
    await expect(JSON.stringify(bodies.map((b) => buildMakePrompt(req(b, brand))), null, 2)).toMatchFileSnapshot("./__pins__/adviser-slideshow-prompts.json");
  });

  it("still builds the pinned static layout prompts, a business's and an adviser's", async () => {
    // the bodies of staticAds.test.ts, which took this pin
    const SRC = { key: "ad:2095783381019179", kind: "ad", format: "image", text: "Protect your family today with a plan that grows with you. Get a free quote." };
    const brand = { name: "Jane Tan", oneLiner: "I help young families plan", audience: "young parents", topics: ["Insurance basics"], facts: "- Ten years advising", mention: true, offer: null, rules: "", memory: "" };
    const biz = { ...brand, name: "Hilltop Coffee", speaker: "business" };
    const both = (b: Record<string, unknown>) => {
      const r = req(b, brand);
      return { ...buildMakePrompt(r), format: responseFormat(r) };
    };
    const prompts = STATIC_LAYOUTS.flatMap((layout) => [
      both({ as: "image", layout, topic: "Afternoon coffee", brand: biz }),
      both({ as: "image", layout, topic: "Why a hospital plan has a co-pay" }),
      both({ as: "image", layout, source: SRC, brand: biz }),
    ]);
    await expect(JSON.stringify(prompts, null, 2)).toMatchFileSnapshot("./__pins__/static-prompts.json");
  });
});

describe("a memory with words", () => {
  it.each(Object.entries(BRANDS))("goes into the %s brand's system prompt once, right after the brand rules, and changes nothing else", (_, brand) => {
    for (const shape of SHAPES) {
      const today = buildMakePrompt(req(shape, brand));
      const now = buildMakePrompt(req(shape, { ...brand, memory: MEMORY }));
      expect(now.system.split(MEMORY).length, JSON.stringify(shape)).toBe(2);
      expect(now.system).toContain(`${brand.rules}\n${MEMORY}`);
      expect(now.system.replace(`\n${MEMORY}`, "")).toBe(today.system);
      expect(now.user).toBe(today.user);
    }
  });

  it("is cut to 1,500 characters and gives Jev's facts its facts, so a make that uses them isn't flagged invented", () => {
    const r = req({ as: "post", topic: "x" }, { ...ADVISER, memory: MEMORY });
    expect(r.brand.memory).toBe(MEMORY);
    expect(jevFacts(r.brand)).toBe(`- What they do: I help young families plan\n- Who they serve: young parents\n- Ten years advising\n${MEMORY}`);
    expect(req({ as: "post", topic: "x" }, { ...ADVISER, memory: `${MEMORY}\n${"a".repeat(2000)}` }).brand.memory).toHaveLength(1500);
  });
});

describe("the Avoid list", () => {
  const post = (body: string): MadeResult => ({ as: "post", hook: "Your week is too full.", body, cta: "Save this for Monday.", hashtags: ["gamechanger"] });
  const brand = req({ as: "post", topic: "x" }, { ...ADVISER, memory: MEMORY }).brand;

  it("reads only the keep line's Avoid items from the memory", () => {
    expect(avoidOf(MEMORY)).toEqual(["game-changer", "unlock your potential"]);
    expect(avoidOf(undefined)).toEqual([]);
    expect(avoidOf(MEMORY.split("\n").slice(0, 2).join("\n"))).toEqual([]);
  });

  it("matches whole words and phrases in any case and spacing, as the app's own flag does", () => {
    expect(wordsFound("A real Game-Changer.", ["game-changer"])).toEqual(["game-changer"]);
    expect(wordsFound("Unlock\nyour  potential today", ["unlock your potential"])).toEqual(["unlock your potential"]);
    expect(wordsFound("Two game-changers and an unlocked door", ["game-changer", "unlock"])).toEqual([]);
    expect(wordsFound("Costs (S$5)", ["(S$5)", "$"])).toEqual(["(S$5)"]);
  });

  it("is a format check: what a reader sees with an Avoid item gets a fix and a refusal, hashtags and plain memory don't", () => {
    const bad = post("This app is a game-changer for busy parents.");
    expect(avoidProblem(bad, { brand })).toEqual({
      kind: "avoid",
      fix: `These are on the brand's Avoid list and must not appear anywhere: "game-changer". Return the whole JSON object again without them, saying the same thing in other words.`,
      error: `That remix used "game-changer", which is on your Avoid list. Try again.`,
    });
    expect(makeProblem(bad, { brand })?.kind).toBe("avoid");
    expect(makeProblem(post("Plan one quiet evening a week."), { brand })).toBeNull();
    expect(makeProblem(bad, { brand: { ...brand, memory: undefined } })).toBeNull();
    expect(avoidProblem(post("Unlock your potential. A game-changer."), { brand })?.error).toBe(`That remix used "game-changer", "unlock your potential", which are on your Avoid list. Try again.`);
  });

  it("keeps an edit's markers in its fixing pass", () => {
    const edit: MadeResult = { as: "edit", lines: ["A game-changer for your week"], marks: [], texts: [], searches: [], caption: "Plan it." };
    expect(avoidProblem(edit, { brand })?.fix).toContain("Keep every [[k]] marker in its line and in its order.");
  });
});
