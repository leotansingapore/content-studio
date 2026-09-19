import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_CTA,
  MAX_SLIDES,
  WORDS_PER_SLIDE,
  addSlide,
  applyCopy,
  countWords,
  draftLabel,
  draftsWithText,
  loadBrand,
  moveSlide,
  normalizeHandle,
  normalizeHex,
  removeSlide,
  sanitizeBrand,
  saveBrand,
  slideFileName,
  slideRole,
  slugify,
  splitDraftIntoSlides,
  splitSentences,
  toSlideText,
  type Slide,
} from "@/lib/carousel";
import type { DraftEntry } from "@/lib/draftHistory";

const titles = (slides: Slide[]) => slides.map((s) => s.title);

describe("splitDraftIntoSlides", () => {
  it("turns a LinkedIn post into cover, one point per slide and the draft's CTA", () => {
    const draft = `Most people think insurance is expensive.

It isn't. What's expensive is finding out you're not covered.

Here's what I tell every client in their 20s:

1. Start with a hospital plan and a rider, because a week in a private ward can cost more than a year of premiums.
2. Add term life cover while you're young and healthy.
3. Review your cover every two years or after a big life event.

DM me "REVIEW" and I'll send you the checklist I use.

#insurance #singapore`;
    const result = splitDraftIntoSlides(draft, { hook: "Most people think insurance is expensive." });
    expect(result).toMatchObject({ points: 5, tooShort: false, dropped: 0, ctaFromDraft: true });
    expect(result.slides).toHaveLength(7);
    expect(titles(result.slides)).toEqual([
      "Most people think insurance is expensive",
      "It isn't",
      "Here's what I tell every client in their 20s",
      "",
      "Add term life cover while you're young and healthy",
      "Review your cover every two years or after a big life event",
      'DM me "REVIEW" and I\'ll send you the checklist I use',
    ]);
    expect(result.slides[1].body).toBe("What's expensive is finding out you're not covered.");
    expect(result.slides[3].body).toMatch(/^Start with a hospital plan/);
    // The hook isn't repeated as a point, and hashtags never reach a slide.
    expect(result.slides.slice(1).some((s) => /insurance is expensive/.test(s.title + s.body))).toBe(false);
    expect(JSON.stringify(result.slides)).not.toContain("#");
    expect(new Set(result.slides.map((s) => s.id)).size).toBe(7);
  });

  it("follows the draft's own Slide 1/Slide 2 markers", () => {
    const draft = [
      "Slide 1: Got your BTO ballot? 5 financial moves before key collection. Save now.",
      "Slide 2: Move 1 - Lock in your mortgage rate intent. Floating vs fixed. SORA-pegged vs board rate. Different strokes for different income trajectories.",
      "Slide 3: Move 2 - Top up SA before you wipe OA on downpayment. Once OA goes to housing it cannot come back.",
      "Slide 4: Move 3 - Mortgage Reducing Term Assurance (MRTA). Cheap term cover that decreases with your loan.",
      "Slide 5: Move 4 - Joint income protection. Group cover is rarely enough.",
      "Slide 6: Move 5 - Set up the legacy admin. CPF nomination, will, LPA.",
      "Slide 7: Save this carousel. DM me BTO if you want the spreadsheet I use with my BTO clients.",
    ].join("\n\n");
    const result = splitDraftIntoSlides(draft, { hook: "Got your BTO ballot?" });
    expect(result).toMatchObject({ points: 5, tooShort: false, ctaFromDraft: true });
    expect(result.slides).toHaveLength(7);
    expect(result.slides[0].title).toBe("Got your BTO ballot? 5 financial moves before key collection. Save now");
    expect(result.slides[1]).toMatchObject({
      title: "Move 1 - Lock in your mortgage rate intent",
      body: "Floating vs fixed. SORA-pegged vs board rate. Different strokes for different income trajectories.",
    });
    expect(result.slides[3].title).toBe("Move 3 - Mortgage Reducing Term Assurance (MRTA)");
    expect(result.slides[6]).toMatchObject({
      title: "Save this carousel",
      body: "DM me BTO if you want the spreadsheet I use with my BTO clients.",
    });
  });

  it("reads a short-video script: HOOK and CTA labels, and ignores the caption", () => {
    const draft = `**HOOK:** Nasi lemak went up a dollar. Here's the maths.

**BODY:**
Inflation at 3% a year halves your money's buying power in about 24 years.
That's why cash in a savings account slowly loses value.
A mix of CPF top-ups and diversified investments can help you keep pace.

**CTA:** Comment "MATHS" and I'll send you the breakdown.

---

**CAPTION:**
Your nasi lemak is a lesson in inflation. #inflation #sg`;
    const result = splitDraftIntoSlides(draft);
    expect(result).toMatchObject({ points: 3, tooShort: false, ctaFromDraft: true });
    expect(result.slides).toHaveLength(5);
    expect(result.slides[0].title).toBe("Nasi lemak went up a dollar. Here's the maths");
    expect(result.slides[1].body).toBe(
      "Inflation at 3% a year halves your money's buying power in about 24 years.",
    );
    expect(result.slides[2].title).toBe("That's why cash in a savings account slowly loses value");
    expect(result.slides[4].title).toBe('Comment "MATHS" and I\'ll send you the breakdown');
    expect(JSON.stringify(result.slides)).not.toMatch(/lesson in inflation|HOOK|BODY|CTA/);
  });

  it("adds a simple CTA when the draft has none, and keeps full paragraphs apart", () => {
    const draft = `Three money habits I wish I'd started at 25.

Pay yourself first. Move savings out on payday before you can spend them.

Know your number. Work out what six months of expenses looks like for you.

Check your cover. Make sure an illness wouldn't wipe out your savings.`;
    const result = splitDraftIntoSlides(draft);
    expect(result).toMatchObject({ points: 3, ctaFromDraft: false, tooShort: false });
    expect(titles(result.slides)).toEqual([
      "Three money habits I wish I'd started at 25",
      "Pay yourself first",
      "Know your number",
      "Check your cover",
      DEFAULT_CTA.title,
    ]);
    expect(result.slides[4].body).toBe(DEFAULT_CTA.body);
  });

  it("joins one-line paragraphs instead of giving each a slide", () => {
    const draft = `I nearly lost a client last year.

Not because of price.

Because I didn't follow up.

Now I send a two-line recap within a day of every meeting, with the one thing we agreed to do next.

It takes three minutes and clients mention it more than anything else I do.`;
    const result = splitDraftIntoSlides(draft);
    expect(result.slides[0].title).toBe("I nearly lost a client last year");
    expect(result.slides[1]).toMatchObject({ title: "Not because of price", body: "Because I didn't follow up." });
    expect(result.points).toBe(3);
  });

  it("uses emoji and markdown bullets as points and drops a short lead-in", () => {
    const emoji = splitDraftIntoSlides("How I'd start at 25\n\nTop tips:\n1️⃣ Save first\n2️⃣ Insure early\n3️⃣ Invest steadily");
    expect(titles(emoji.slides)).toEqual([
      "How I'd start at 25",
      "Save first",
      "Insure early",
      "Invest steadily",
      DEFAULT_CTA.title,
    ]);

    const markdown = splitDraftIntoSlides("**Why it matters**\n\n- Point one is here\n- Point two is here\n\nFollow me for more tips");
    expect(titles(markdown.slides)).toEqual(["Why it matters", "Point one is here", "Point two is here", "Follow me for more tips"]);
    expect(markdown).toMatchObject({ points: 2, tooShort: false, ctaFromDraft: true });
  });

  it("flags posts that are too short, including hook-only board ideas", () => {
    const short = splitDraftIntoSlides("Insurance matters.\n\nGet covered.");
    expect(short).toMatchObject({ points: 1, tooShort: true });
    expect(short.slides).toHaveLength(3);

    const idea = splitDraftIntoSlides("", { hook: "3 things pickleball can teach you about compounding" });
    expect(idea).toMatchObject({ points: 0, tooShort: true, ctaFromDraft: false });
    expect(titles(idea.slides)).toEqual(["3 things pickleball can teach you about compounding", DEFAULT_CTA.title]);

    expect(splitDraftIntoSlides("   ")).toMatchObject({ slides: [], points: 0, tooShort: true });
  });

  it("caps slides at 10 and says how many points were left out", () => {
    const items = Array.from({ length: 10 }, (_, i) => `- Habit number ${i + 1} is a good one`).join("\n");
    const result = splitDraftIntoSlides(`Ten habits worth keeping\n\n${items}\n\nFollow me for more`);
    expect(result.slides).toHaveLength(MAX_SLIDES);
    expect(result).toMatchObject({ points: 10, dropped: 2, ctaFromDraft: true });
    expect(result.slides[8].title).toBe("Habit number 8 is a good one");
  });

  it("keeps every slide within about 40 words", () => {
    const sentence = (i: number) => `Sentence ${i} has exactly fifteen words in it so we can test the cap well.`;
    const para = Array.from({ length: 6 }, (_, i) => sentence(i + 1)).join(" ");
    const result = splitDraftIntoSlides(`A hook line\n\n${para}`);
    expect(result.slides).toHaveLength(5);
    for (const s of result.slides) {
      expect(countWords(s.title) + countWords(s.body)).toBeLessThanOrEqual(WORDS_PER_SLIDE);
    }
  });

  it("splits a short draft's one long paragraph so the carousel reaches 5 slides", () => {
    const result = splitDraftIntoSlides(
      "Why an emergency fund comes first\n\nMost people start investing before they have any cash buffer at all. Then one surprise bill forces them to sell at a bad time. Six months of expenses in cash keeps your plan on track.",
    );
    expect(result.points).toBe(3);
    expect(result.slides).toHaveLength(5);
  });
});

describe("text helpers", () => {
  it("splits sentences without breaking prices or abbreviations", () => {
    expect(splitSentences("It costs S$1.5k a year, e.g. for term life. Worth it? Yes!")).toEqual([
      "It costs S$1.5k a year, e.g. for term life.",
      "Worth it?",
      "Yes!",
    ]);
  });

  it("titles a point from its opening sentence or label", () => {
    expect(toSlideText("Know your number. Work out six months of expenses.")).toEqual({
      title: "Know your number",
      body: "Work out six months of expenses.",
    });
    expect(toSlideText("Hospital cover: it pays the bill when you're admitted, and most people only have the basic plan")).toEqual({
      title: "Hospital cover",
      body: "It pays the bill when you're admitted, and most people only have the basic plan",
    });
    expect(toSlideText("Short and sweet.")).toEqual({ title: "Short and sweet", body: "" });
  });
});

describe("slide editing", () => {
  const s = (id: string): Slide => ({ id, title: id, body: "" });
  const [a, b, c] = [s("a"), s("b"), s("c")];

  it("moves, removes and adds slides within the limits", () => {
    expect(moveSlide([a, b, c], 0, 1)).toEqual([b, a, c]);
    const same = [a, b, c];
    expect(moveSlide(same, 0, -1)).toBe(same);
    expect(moveSlide(same, 2, 1)).toBe(same);
    expect(removeSlide([a, b, c], 1)).toEqual([a, c]);
    const two = [a, b];
    expect(removeSlide(two, 0)).toBe(two);
    expect(addSlide([a, b], c)).toEqual([a, c, b]);
    const ten = Array.from({ length: 10 }, (_, i) => s(`s${i}`));
    expect(addSlide(ten, c)).toBe(ten);
  });

  it("applies AI copy slide-for-slide and keeps ids", () => {
    const pair = [a, b];
    expect(applyCopy(pair, [{ title: "T", body: "B" }])).toBe(pair);
    expect(applyCopy(pair, [{ title: "T1", body: "" }, { title: "T2", body: "B2" }])).toEqual([
      { id: "a", title: "T1", body: "" },
      { id: "b", title: "T2", body: "B2" },
    ]);
  });

  it("gives the first slide the cover role and the last the CTA role", () => {
    expect([0, 1, 2, 3].map((i) => slideRole(i, 4))).toEqual(["cover", "point", "point", "cta"]);
  });
});

describe("files and sources", () => {
  it("names files from the hook, numbered in order", () => {
    expect(slideFileName("Got your BTO ballot? 5 moves", 0)).toBe("got-your-bto-ballot-5-moves-01.png");
    expect(slideFileName("", 9)).toBe("carousel-10.png");
    expect(slugify("Ümlaut & Co!")).toBe("umlaut-co");
  });

  it("offers only drafts with written text", () => {
    const base = { createdAt: "", pillar: "", pillarDetail: "", audience: "", format: "", platform: "", ctaType: "" };
    const drafts = [
      { ...base, id: "1", hook: "Idea only", draft: "" },
      { ...base, id: "2", hook: "", draft: "  A real post  " },
    ] as DraftEntry[];
    expect(draftsWithText(drafts).map((d) => d.id)).toEqual(["2"]);
    expect(draftLabel({ hook: "", draft: "A real post" })).toBe("A real post");
    expect(draftLabel({ hook: "x".repeat(100), draft: "" }, 20)).toBe(`${"x".repeat(19)}…`);
  });
});

describe("brand", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("normalises colours and handles", () => {
    expect(normalizeHex("#abc")).toBe("#AABBCC");
    expect(normalizeHex("1e3a8a")).toBe("#1E3A8A");
    expect(normalizeHex("red")).toBeNull();
    expect(normalizeHandle(" jane ")).toBe("@jane");
    expect(normalizeHandle("https://www.instagram.com/jane.tan/")).toBe("@jane.tan");
    expect(normalizeHandle("linkedin.com/in/jane-tan")).toBe("linkedin.com/in/jane-tan");
    expect(normalizeHandle("")).toBe("");
    expect(sanitizeBrand({ color: "red", name: 5, handle: "@j" })).toEqual({ color: "#1E3A8A", name: "", handle: "@j" });
  });

  it("saves and loads the brand under a synced content-studio- key", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
      },
    });
    expect(loadBrand("u1")).toBeNull();
    saveBrand("u1", { color: "#abc", name: "Jane", handle: "@jane" });
    expect([...store.keys()]).toEqual(["content-studio-carousel-brand-u1"]);
    expect(loadBrand("u1")).toEqual({ color: "#AABBCC", name: "Jane", handle: "@jane" });
    store.set("content-studio-carousel-brand-u1", "{bad json");
    expect(loadBrand("u1")).toBeNull();
    expect(loadBrand(null)).toBeNull();
  });
});
