import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_CTA,
  MAX_SLIDES,
  WORDS_PER_SLIDE,
  addSlide,
  duplicateSlide,
  restoreSlide,
  applyCopy,
  recapFits,
  withRecap,
  countWords,
  draftLabel,
  draftsWithText,
  draftToOpen,
  loadBrand,
  carouselStartLook,
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
  saveCarousel,
  loadCarousels,
  MAX_SAVED_CAROUSELS,
  removeCarousel,
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

  it("puts the recap just before the call to action, replacing an old one, only when there is room", () => {
    const r = { title: "Recap", body: "• a\n• b" };
    const out = withRecap([a, b, c], r);
    expect(out.map((x) => x.id)).toEqual(["a", "b", out[2].id, "c"]);
    expect(out[2]).toMatchObject({ title: "Recap", body: "• a\n• b", recap: true });
    const again = withRecap(out, { title: "New", body: "• x" });
    expect(again.map((x) => [x.id, x.title])).toEqual([["a", "a"], ["b", "b"], [out[2].id, "New"], ["c", "c"]]);
    expect(withRecap([a, out[2], c], null)).toEqual([a, out[2], c]);
    const ten = Array.from({ length: 10 }, (_, i) => s(`s${i}`));
    expect(withRecap(ten, r)).toEqual(ten);
    expect([3, 4, 9, 10].map((n) => recapFits(Array.from({ length: n }, (_, i) => s(`n${i}`))))).toEqual([false, true, true, false]);
    // a new point goes before the recap, not between it and the call to action
    expect(addSlide(out, s("d")).map((x) => x.id)).toEqual(["a", "b", "d", out[2].id, "c"]);
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

  it("opens a post a changed ?draft= names, never the one already open", () => {
    expect(draftToOpen("new", "old")).toBe("new");
    expect(draftToOpen("new", "")).toBe("new");
    expect(draftToOpen("old", "old")).toBeNull();
    expect(draftToOpen(null, "old")).toBeNull();
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

  it("keeps brand kit images only when they are small base64 image data URLs", () => {
    const ok = "data:image/png;base64,iVBORw0KGgo=";
    const kit = sanitizeBrand({ color: "#000000", name: "J", handle: "@j", photo: ok, logo: ok, role: "Adviser", signOff: "DM me" });
    expect(kit).toMatchObject({ photo: ok, logo: ok, role: "Adviser", signOff: "DM me" });
    for (const bad of ["javascript:alert(1)", "data:image/svg+xml;base64,PHN2Zz4=", "data:text/html;base64,PGI+", `${ok}"onload="x`, `data:image/png;base64,${"A".repeat(400_000)}`]) {
      expect(sanitizeBrand({ photo: bad, logo: bad }).photo).toBeUndefined();
      expect(sanitizeBrand({ photo: bad, logo: bad }).logo).toBeUndefined();
    }
    // a patch without the image keys keeps the saved ones
    expect(sanitizeBrand({ name: "K" }, kit).photo).toBe(ok);
  });

  it("keeps the DM link fields as text, capped, and drops anything else", () => {
    const kit = sanitizeBrand({ instagram: "ada", facebook: "adatan.sg", whatsapp: "6591234567", whatsappText: "x".repeat(400) });
    expect(kit).toMatchObject({ instagram: "ada", facebook: "adatan.sg", whatsapp: "6591234567" });
    expect(kit.whatsappText).toHaveLength(300);
    expect(sanitizeBrand({ instagram: 5, whatsapp: { n: 1 } })).toMatchObject({ instagram: undefined, whatsapp: undefined });
    expect(sanitizeBrand({ name: "K" }, kit).whatsapp).toBe("6591234567");
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

  it("keeps the phase-4 kit fields and drops bad ones", () => {
    const photo = "data:image/jpeg;base64,/9j/4AAQ";
    const person = (id: string) => ({ id, name: `Person ${id}`, role: "Adviser", handle: "@p", photo });
    const kit = sanitizeBrand({
      website: "https://ada.sg/about?x=1",
      websiteReadAt: "2026-10-21T08:30:00.000Z",
      palette: [{ name: "Sea", hex: "0f766e" }, { name: "Sun", hex: "#fc0" }, { name: "Sky", hex: "#2563EB" }, { name: "Extra", hex: "#000000" }],
      people: [person("a"), person("b"), person("c"), person("d"), person("e")],
      stamp: { videoLogo: false, videoEnd: true, videoIntro: true, pictureLogo: true },
      slideFont: "serif",
      slidePaper: "tint",
      postLang: "zh",
    });
    expect(kit).toMatchObject({
      website: "https://ada.sg",
      websiteReadAt: "2026-10-21T08:30:00.000Z",
      palette: [{ name: "Sea", hex: "#0F766E" }, { name: "Sun", hex: "#FFCC00" }, { name: "Sky", hex: "#2563EB" }],
      stamp: { videoLogo: false, videoEnd: true, videoIntro: true, pictureLogo: true },
      slideFont: "serif",
      slidePaper: "tint",
      postLang: "zh",
    });
    // a fifth person is dropped
    expect(kit.people?.map((p) => p.id)).toEqual(["a", "b", "c", "d"]);
    expect(kit.people?.[0]).toEqual(person("a"));
    expect(sanitizeBrand({ website: "http://ada.sg:8080/" }).website).toBe("http://ada.sg:8080");
    for (const website of ["javascript:alert(1)", "ftp://ada.sg", "ada.sg", "data:text/html,x", `https://${"a".repeat(200)}.sg`]) {
      expect(sanitizeBrand({ website }).website, website).toBeUndefined();
    }
    const bad = sanitizeBrand({
      websiteReadAt: "21 Oct 2026",
      palette: [{ name: "x".repeat(30), hex: "red" }, { hex: "#abc" }, null, "#fff"],
      people: [{ id: "a", name: "No photo" }, { id: "", photo }, { name: "No id", photo }, { id: "b", name: 5, photo: "javascript:x", role: 7 }, person("c")],
      stamp: { videoLogo: "yes", videoEnd: 1 },
      slideFont: "comic",
      slidePaper: "neon",
      postLang: "fr",
    });
    expect(bad.websiteReadAt).toBeUndefined();
    expect(bad.palette).toEqual([{ name: "", hex: "#AABBCC" }]);
    expect(bad.people).toEqual([person("c")]);
    expect(bad.stamp).toBeUndefined();
    expect(bad).toMatchObject({ slideFont: undefined, slidePaper: undefined, postLang: undefined });
    for (const postLang of ["en", "ZH", 1, null]) expect(sanitizeBrand({ postLang }).postLang).toBeUndefined();
    expect(sanitizeBrand({ palette: [{ name: "x".repeat(30), hex: "#000" }] }).palette).toEqual([{ name: "x".repeat(20), hex: "#000000" }]);
  });

  it("saves the phase-4 fields through a reload, and a kit without them writes no new keys", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("window", { localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) } });
    const full = { color: "#1E3A8A", name: "Ada", handle: "@ada", website: "https://ada.sg", websiteReadAt: "2026-10-21T08:30:00Z", palette: [{ name: "Sea", hex: "#0F766E" }], stamp: { videoLogo: true }, slideFont: "modern" as const, slidePaper: "dark" as const, postLang: "ms" as const };
    saveBrand("u1", full);
    expect(loadBrand("u1")).toEqual(full);
    saveBrand("u2", { color: "#abc", name: "Jane", handle: "@jane", website: "", postLang: undefined, stamp: {} });
    expect(store.get("content-studio-carousel-brand-u2")).toBe(`{"color":"#AABBCC","name":"Jane","handle":"@jane"}`);
  });

  // Pinned on main e0e6cf48, before phase 4 added kit fields: a kit with every field of today writes the same JSON.
  it("writes today's full kit byte for byte", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("window", { localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) } });
    const photo = "data:image/jpeg;base64,/9j/4AAQ";
    const logo = "data:image/webp;base64,UklGRg==";
    saveBrand("u1", {
      color: "#0f766e", name: "Ada Tan", handle: "@adatan", role: "Financial adviser", photo, logo, signOff: "DM me PLAN", tagLinks: true,
      slots: ["4T19:00", "1T08:30", "1T08:30"], instagram: "adatan", facebook: "adatan.sg", whatsapp: "6591234567", whatsappText: "Hi",
      offers: [{ name: "Free review", url: "https://ada.sg/review" }], emojiPolicy: "one", hashtagPolicy: "few", avoidWords: "cheapest",
    });
    expect(store.get("content-studio-carousel-brand-u1")).toBe(
      `{"color":"#0F766E","name":"Ada Tan","handle":"@adatan","role":"Financial adviser","photo":"${photo}","logo":"${logo}","signOff":"DM me PLAN","tagLinks":true,"slots":["1T08:30","4T19:00"],"instagram":"adatan","facebook":"adatan.sg","whatsapp":"6591234567","whatsappText":"Hi","offers":[{"name":"Free review","url":"https://ada.sg/review"}],"emojiPolicy":"one","hashtagPolicy":"few","avoidWords":"cheapest"}`,
    );
    saveBrand("u2", { color: "#abc", name: "Jane", handle: "@jane" });
    expect(store.get("content-studio-carousel-brand-u2")).toBe(`{"color":"#AABBCC","name":"Jane","handle":"@jane"}`);
  });
});

describe("saved carousels", () => {
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
        removeItem: (k: string) => void store.delete(k),
      },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  const slides = [{ id: "a", title: "Hook", body: "" }, { id: "b", title: "Point", body: "Body" }];

  it("saves newest first, replaces by id and keeps the latest 20", async () => {
    saveCarousel("u1", { id: "d:1", title: "One", platform: "instagram", slides }, new Date("2026-10-01"));
    saveCarousel("u1", { id: "p:2", title: "Two", platform: "linkedin", slides }, new Date("2026-10-02"));
    saveCarousel("u1", { id: "d:1", title: "One again", platform: "instagram", slides }, new Date("2026-10-03"));
    expect(loadCarousels("u1").map((c) => c.title)).toEqual(["One again", "Two"]);
    expect([...store.keys()]).toEqual(["content-studio-carousels-u1"]);
    for (let i = 0; i < 25; i++) saveCarousel("u1", { id: `p:${i + 10}`, title: `n${i}`, platform: "instagram", slides });
    expect(loadCarousels("u1")).toHaveLength(MAX_SAVED_CAROUSELS);
  });

  it("keeps a carousel's alignment, text size, font and paper through a reload, and opens an old one without them", () => {
    saveCarousel("u1", { id: "d:1", title: "Styled", platform: "linkedin", slides, align: "center", scale: 1.1, font: "serif", paper: "dark" });
    store.set("content-studio-carousels-u1", JSON.stringify([
      ...JSON.parse(store.get("content-studio-carousels-u1")!),
      { id: "p:2", title: "Odd", slides, align: "right", scale: 3, font: "comic", paper: "neon", updatedAt: "" },
    ]));
    const [styled, odd] = loadCarousels("u1");
    expect(styled).toMatchObject({ platform: "linkedin", align: "center", scale: 1.1, font: "serif", paper: "dark" });
    expect(odd).toEqual({ id: "p:2", title: "Odd", platform: "instagram", slides, draftId: undefined, updatedAt: "" });
  });

  it("keeps a known design and size through a reload, and drops unknown ones and the defaults", () => {
    saveCarousel("u1", { id: "d:1", title: "Designed", platform: "linkedin", slides, design: "numbered", size: "1x1" });
    store.set("content-studio-carousels-u1", JSON.stringify([
      ...JSON.parse(store.get("content-studio-carousels-u1")!),
      { id: "p:2", title: "Odd", slides, design: "comic-sans", size: "16x9", updatedAt: "" },
      { id: "p:3", title: "Defaults", slides, design: "clean", size: "4x5", updatedAt: "" },
      { id: "p:4", title: "Tall", slides, design: "post-card", size: "9x16", updatedAt: "" },
    ]));
    const [designed, odd, defaults, tall] = loadCarousels("u1");
    expect(designed).toMatchObject({ design: "numbered", size: "1x1" });
    expect(tall).toMatchObject({ design: "post-card", size: "9x16" });
    for (const c of [odd, defaults]) {
      expect(c).not.toHaveProperty("design");
      expect(c).not.toHaveProperty("size");
    }
  });

  // Pinned on main e0e6cf48, before phase 4 added carousel fields: today's carousels load and save the same JSON.
  it("loads and saves today's carousels byte for byte", () => {
    const today = `[{"id":"d:9","title":"Old","platform":"linkedin","slides":[{"id":"a","title":"Hook","body":""},{"id":"b","title":"Point","body":"Body","image":"cimg-mh2k9x01ab"}],"draftId":"9","align":"center","scale":1.1,"font":"modern","paper":"tint","design":"numbered","size":"1x1","updatedAt":"2026-10-01T00:00:00.000Z"},{"id":"p:2","title":"Plain","platform":"instagram","slides":[{"id":"a","title":"Hook","body":""},{"id":"r","title":"Recap","body":"x","recap":true}],"updatedAt":""}]`;
    store.set("content-studio-carousels-u1", today);
    expect(JSON.stringify(loadCarousels("u1"))).toBe(today);
    saveCarousel("u1", { id: "p:3", title: "New", platform: "instagram", slides }, new Date("2026-10-02T00:00:00.000Z"));
    expect(store.get("content-studio-carousels-u1")).toBe(
      `[{"id":"p:3","title":"New","platform":"instagram","slides":[{"id":"a","title":"Hook","body":""},{"id":"b","title":"Point","body":"Body"}],"updatedAt":"2026-10-02T00:00:00.000Z"},${today.slice(1)}`,
    );
  });

  it("keeps a version's language and source and the signer, and drops bad ones", () => {
    const from = { id: "d:9", at: "2026-10-21T08:30:00.000Z" };
    saveCarousel("u1", { id: "v:1", title: "Chinese", platform: "instagram", slides, lang: "zh", translationOf: from, signer: "pa" });
    store.set("content-studio-carousels-u1", JSON.stringify([
      ...JSON.parse(store.get("content-studio-carousels-u1")!),
      { id: "v:2", title: "Odd", slides, lang: "fr", translationOf: { id: "d:9" }, signer: 5, updatedAt: "" },
      { id: "v:3", title: "Odder", slides, lang: "ZH", translationOf: { id: 9, at: "x" }, signer: "", updatedAt: "" },
      { id: "v:4", title: "Malay", slides, lang: "ms", translationOf: "d:9", updatedAt: "" },
    ]));
    const [version, odd, odder, malay] = loadCarousels("u1");
    expect(version).toMatchObject({ lang: "zh", translationOf: from, signer: "pa" });
    expect(malay).toMatchObject({ lang: "ms" });
    for (const c of [odd, odder, malay]) {
      expect(c).not.toHaveProperty("translationOf");
      expect(c).not.toHaveProperty("signer");
    }
    for (const c of [odd, odder]) expect(c).not.toHaveProperty("lang");
  });

  it("reads a carousel saved before designs exactly as before", () => {
    const before = [{ id: "d:9", title: "Old", platform: "linkedin", slides, draftId: "9", align: "center", scale: 1.1, font: "modern", paper: "tint", updatedAt: "2026-10-01T00:00:00.000Z" }];
    store.set("content-studio-carousels-u1", JSON.stringify(before));
    expect(loadCarousels("u1")).toEqual(before);
  });

  it("still lists a saved carousel for this visit when storage is full, instead of throwing", () => {
    saveCarousel("u1", { id: "d:1", title: "Kept", platform: "instagram", slides });
    vi.stubGlobal("window", { localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: () => { throw new DOMException("full", "QuotaExceededError"); } } });
    expect(saveCarousel("u1", { id: "p:2", title: "New", platform: "instagram", slides }).map((c) => c.title)).toEqual(["New", "Kept"]);
    expect(removeCarousel("u1", "d:1")).toEqual([]);
  });

  it("drops malformed entries and removes by id", async () => {
    store.set("content-studio-carousels-u1", JSON.stringify([{ id: "x", slides: "no" }, { id: "y", title: 5, slides: [null, { id: "s", title: "T" }, { id: "r", title: "R", body: "• a", recap: true }] }, { slides: [] }]));
    expect(loadCarousels("u1")).toEqual([{ id: "y", title: "Carousel", platform: "instagram", slides: [{ id: "s", title: "T", body: "" }, { id: "r", title: "R", body: "• a", recap: true }], draftId: undefined, updatedAt: "" }]);
    expect(removeCarousel("u1", "y")).toEqual([]);
    store.set("content-studio-carousels-u1", "{not json");
    expect(loadCarousels("u1")).toEqual([]);
  });
});

describe("generated carousel labels", () => {
  it("drops Title/Text labels and design notes from slide-by-slide drafts", async () => {
    const draft = [
      "Slide 1",
      "Title: Think CPF is only for retirement?",
      "Visual: a calendar with a red circle",
      "",
      "Slide 2",
      "Title: Move #1: Top up your SA early",
      "Text: Compounding at 4% does the heavy lifting over 30 years.",
      "",
      "Slide 3",
      "Headline: Move #2: Keep an OA buffer",
      "Body: Use your OA for the flat, but leave some for emergencies.",
      "Image idea: an HDB block",
      "",
      "Slide 4",
      "Title: Move #3: Nominate your beneficiaries",
      "Copy: It takes five minutes online.",
      "",
      "Slide 5",
      "Title: Want the full checklist?",
      "Text: Comment PLAN and I'll send it.",
    ].join("\n");
    const { slides } = splitDraftIntoSlides(draft);
    const all = slides.map((x) => `${x.title}|${x.body}`).join("\n");
    expect(all).not.toMatch(/\b(Title|Text|Headline|Body|Copy|Visual|Image idea):/);
    expect(slides[0].title).toBe("Think CPF is only for retirement?");
    expect(slides[1]).toMatchObject({ title: "Move #1: Top up your SA early", body: "Compounding at 4% does the heavy lifting over 30 years." });
    expect(slides[2].title).toBe("Move #2: Keep an OA buffer");
    expect(all).not.toContain("calendar");
    expect(all).not.toContain("HDB block");
  });
});

describe("generated carousels keep their own slides", () => {
  // real output of the generate function for "3 CPF moves for people in their 30s" (2026-10-08)
  const raw = [
    "SLIDE 1:  ",
    "Think CPF Is Just “For Retirement”? \u{1F914}  ",
    "Most Singaporeans in their 30s only see CPF as a savings pot for age 65. But you could be missing 3 powerful moves your future self will thank you for!",
    "",
    "SLIDE 2:  ",
    "Myth #1: “I can’t touch my CPF before 55 anyway.”  ",
    "Reality: Did you know you can use your OA for your first home, and every extra $1,000 OA repayment now knocks years off your mortgage? Even a small top-up or prepayment makes a dent.",
    "",
    "SLIDE 3:  ",
    "Myth #2: “Top-ups are only for those with spare cash.”  ",
    "Fact: If you transfer just $100/month from your OA to your SA in your 30s, that’s $1,200 a year compounding at 4%, not 2.5%. Over 10 years, that ‘small’ shift could mean over $1,500 in extra interest.",
    "",
    "SLIDE 4:  ",
    "Myth #3: “CPF has nothing to do with my family right now.”  ",
    "Correction: Nominate your CPF! If you haven’t yet, your savings go to the public distribution process (not your loved ones) if anything happens. Takes 5 minutes, saves months of legal hassle.",
    "",
    "SLIDE 5:  ",
    "Real Talk: My Friends Waited…  ",
    "As an FC, I’ve seen friends in their 30s regret not moving early on these. Most wish they’d started those OA-to-SA transfers sooner, or sorted out nominations before life got complicated.",
    "",
    "SLIDE 6:  ",
    "Want My CPF Moves Checklist?  ",
    "Comment “CPF30s” below and I’ll DM you my quick guide to these 3 moves!  ",
    "",
    "#CPF #CPFSingapore #SingaporeFinance",
  ].join("\n");

  it("makes one slide per SLIDE marker, even when a slide runs long", async () => {
    const { slides, dropped } = splitDraftIntoSlides(raw);
    expect(slides).toHaveLength(6);
    expect(dropped).toBe(0);
    expect(slides.map((x) => x.title.slice(0, 9))).toEqual(["Think CPF", "Myth #1: ", "Myth #2: ", "Myth #3: ", "Real Talk", "Want My C"]);
    expect(slides[1].body).toContain("Even a small top-up");
  });

  it("drops quote marks that wrap a whole title, not ones inside it", async () => {
    expect(toSlideText("“Move #1: Top up early”\nBody text here.").title).toBe("Move #1: Top up early");
    expect(toSlideText("Myth #1: “I can’t touch my CPF”\nBody.").title).toBe("Myth #1: “I can’t touch my CPF”");
  });
});

describe("duplicateSlide and restoreSlide", () => {
  const a = { id: "a", title: "Cover", body: "" };
  const b = { id: "b", title: "Point", body: "Text", image: "cimg-abcdef" };
  const r = { id: "r", title: "Recap", body: "• one", recap: true as const };
  const c = { id: "c", title: "DM me", body: "" };

  it("copies a slide right after it with a new id, picture kept, never a second recap", () => {
    const out = duplicateSlide([a, b, c], 1);
    expect(out.map((s) => s.id).slice(0, 2)).toEqual(["a", "b"]);
    expect(out[2]).toEqual({ ...b, id: out[2].id });
    expect(out[2].id).not.toBe("b");
    expect(out[3]).toBe(c);
    const recap = duplicateSlide([a, r, c], 1);
    expect(recap[2].recap).toBeUndefined();
    expect(recap.filter((s) => s.recap)).toHaveLength(1);
  });

  it("refuses at 10 slides and for a slide that isn't there", () => {
    const ten = Array.from({ length: MAX_SLIDES }, (_, i) => ({ id: `s${i}`, title: `S${i}`, body: "" }));
    expect(duplicateSlide(ten, 3)).toBe(ten);
    const three = [a, b, c];
    expect(duplicateSlide(three, 3)).toBe(three);
    expect(duplicateSlide(three, -1)).toBe(three);
  });

  it("puts a deleted slide back in its place with its picture, once", () => {
    expect(restoreSlide([a, c], 1, b)).toEqual([a, b, c]);
    expect(restoreSlide([a, c], 9, b)).toEqual([a, c, b]);
    const back = [a, b, c];
    expect(restoreSlide(back, 1, b)).toBe(back);
    const ten = Array.from({ length: MAX_SLIDES }, (_, i) => ({ id: `s${i}`, title: `S${i}`, body: "" }));
    expect(restoreSlide(ten, 1, b)).toBe(ten);
  });
});

describe("carouselStartLook (brand-kit)", () => {
  const kit = { slideFont: "serif" as const, slidePaper: "dark" as const };
  const device = { font: "modern", paper: "tint" };

  it("opens a saved carousel in its own look, absent reading classic and light, whatever the kit or device", () => {
    expect(carouselStartLook({ font: "modern", paper: "tint" }, kit, device)).toEqual({ font: "modern", paper: "tint" });
    expect(carouselStartLook({}, kit, device)).toEqual({ font: "classic", paper: "light" });
  });

  it("starts a new one from the kit, then the device's last pick, then classic and light", () => {
    expect(carouselStartLook(null, kit, device)).toEqual({ font: "serif", paper: "dark" });
    expect(carouselStartLook(null, { slideFont: "serif" }, device)).toEqual({ font: "serif", paper: "tint" });
    expect(carouselStartLook(null, null, device)).toEqual({ font: "modern", paper: "tint" });
    expect(carouselStartLook(null, {}, {})).toEqual({ font: "classic", paper: "light" });
    expect(carouselStartLook(null, null, { font: "comic", paper: 7 })).toEqual({ font: "classic", paper: "light" });
  });
});
