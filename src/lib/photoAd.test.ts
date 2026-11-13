// "Make it as a photo" (photoAd.ts): the picture maker's prompt for a static format, every format's scene line, and the
// run that writes the words first and spends on a picture only when they came and fit ai-image's prompt.
import { beforeEach, describe, expect, it, vi } from "vitest";

const fake = vi.hoisted(() => {
  const store = new Map<string, string>();
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
  };
  // images.ts keeps designs in window.localStorage
  Object.assign(globalThis, { localStorage: storage, window: { localStorage: storage, addEventListener: () => {}, removeEventListener: () => {} } });
  return {
    write: null as null | { id: number; designId: string; state: string; error?: string },
    writeWords: {} as Record<string, string>,
    writeFails: "",
    image: null as null | Record<string, unknown>,
    imageFails: "",
    calls: [] as { prompt: string; name: string; o?: unknown }[],
    asks: [] as Record<string, unknown>[],
    writeAngle: "",
    writeSubject: "",
    files: {} as Record<string, Blob>,
  };
});
vi.mock("@/lib/supabase", () => ({
  SUPABASE_URL: "https://abc.supabase.co",
  supabase: { auth: { getUser: () => new Promise(() => undefined), getSession: () => new Promise(() => undefined), onAuthStateChange: () => ({}) } },
}));
// the drawn make's write: its words land in the design, as requestMake's would
vi.mock("@/lib/images", async (actual) => {
  const real = await actual<typeof import("@/lib/images")>();
  return {
    ...real,
    imageWrite: () => fake.write,
    imageWriteBusy: () => false,
    startImageWrite: async (userId: string, ask: { designId: string }) => {
      fake.asks.push(ask);
      fake.write = { id: 1, designId: ask.designId, state: "writing" };
      await Promise.resolve();
      if (fake.writeFails) return void (fake.write = { ...fake.write, state: "failed", error: fake.writeFails });
      const d = real.imageById(userId, ask.designId)!;
      real.saveImage(userId, { ...d, words: { ...d.words, ...fake.writeWords } });
      fake.write = { ...fake.write, state: "done", ...(fake.writeAngle ? { angle: fake.writeAngle } : {}), ...(fake.writeSubject ? { subject: fake.writeSubject } : {}) };
    },
  };
});
// the product's picture on this device, and the scale to ai-image's limit (a canvas in the browser)
vi.mock("@/lib/deviceFiles", async (actual) => ({ ...(await actual<typeof import("@/lib/deviceFiles")>()), getFile: async (k: string) => fake.files[k] }));
vi.mock("@/lib/remixLink", async (actual) => ({ ...(await actual<typeof import("@/lib/remixLink")>()), scalePicture: async (b: Blob) => `data:image/jpeg;base64,${btoa(await b.text())}` }));
// the paid picture: never called for real
vi.mock("@/lib/aiImage", async (actual) => ({
  ...(await actual<typeof import("@/lib/aiImage")>()),
  imageJob: () => fake.image,
  imageBusy: () => false,
  makeImage: async (_u: string, prompt: string, name: string, _design?: string, _agent?: unknown, o?: unknown) => {
    fake.calls.push({ prompt, name, o });
    await Promise.resolve();
    fake.image = fake.imageFails ? { prompt, state: "failed", error: fake.imageFails } : { prompt, state: "done", mediaKey: "cimg-photo1", preview: "data:image/jpeg;base64,eA" };
  },
}));

import { AD_FACTS_MAX, ANGLE_POOL, SUBJECT_LINES, subjectOf, brandAdFacts, PHOTO_MARKS, PHOTO_PEOPLE, PHOTO_RULE, TOO_LONG, angleOrder, photoAd, photoAdPrompt, productLine, rememberAngle, sampleOpening, shownPhotoAd, startPhotoAd, usedAngles } from "./photoAd";
import { STATIC_ANGLES } from "../../supabase/functions/remix/logic.ts";
import { STATIC_FORMATS, staticFormatBySlug } from "@/data/staticFormats";
import { DEFAULT_BRAND } from "@/lib/carousel";
import { IMAGE_FIELDS, isStatic } from "@/lib/imageLayout";
import { imageById } from "@/lib/images";
import { MAX_PROMPT } from "../../supabase/functions/ai-image/logic.ts";

const U = "u1";
const poster = staticFormatBySlug("street-poster")!;
const chat = staticFormatBySlug("text-chat")!;
const hilltop = { name: "Hilltop Coffee", color: "#7A4B2A" };

describe("the photo prompt", () => {
  it("starts with the scene, names the brand and its colour, and quotes each drawn line in the layout's order", () => {
    const p = photoAdPrompt(poster, hilltop, { line: "Hilltop cold brew.", headline: "Still dark, still raining.", topic: "Office workers", caption: "The post's caption" });
    expect(p.startsWith(`${poster.scene} `)).toBe(true);
    expect(p).toContain('The brand is "Hilltop Coffee", its colour #7A4B2A.');
    expect(p).toContain('The words on it, in order: Headline: "Still dark, still raining."; Small line: "Hilltop cold brew.".');
    // the topic and the caption are never on the picture
    expect(p).not.toContain("Office workers");
    expect(p).not.toContain("caption");
  });

  it("puts a typed field the layout draws on the picture too (a flyer's price)", () => {
    const flyer = staticFormatBySlug("tear-off-flyer")!;
    expect(photoAdPrompt(flyer, hilltop, { headline: "Cold brew, delivered.", price: "$6 a bottle" })).toContain('Headline: "Cold brew, delivered."; Price: "$6 a bottle".');
  });

  it("asks for no edge margin: nothing is cut off the picture any more, so the words run straight into the closing lines", () => {
    const p = photoAdPrompt(poster, hilltop, { headline: "Still dark." });
    expect(p).toContain(`"Still dark.". ${PHOTO_PEOPLE}`);
    expect(p).not.toMatch(/edges?\b|cut/i);
  });

  it("ends on the people line, the real-marks line and the spelling rule, word for word", () => {
    const p = photoAdPrompt(poster, hilltop, { headline: "Still dark." });
    expect(p.endsWith(" People, when the scene shows any, are Singaporean adults. Singapore by its look alone: no real place names on signs, and no real transit, mall, bank or shop logos or vehicle liveries. All text spelled exactly as quoted. No other logos, brands or watermarks.")).toBe(true);
    expect(p.endsWith(`${PHOTO_PEOPLE} ${PHOTO_MARKS} ${PHOTO_RULE}`)).toBe(true);
  });

  it("keeps every quoted line whole: a double quote inside becomes a single one, and a line break a space", () => {
    const p = photoAdPrompt(chat, { name: 'The "Best" Cafe', color: "#000000" }, { name: "Priya", one: 'she said "wow"\n   twice' });
    expect(p).toContain(`1. Them: "she said 'wow' twice"`);
    expect(p).toContain(`The brand is "The 'Best' Cafe"`);
    expect((p.match(/"/g) ?? []).length).toBe(6);
  });

  it("leaves out empty lines, and gives a brand with no name by its colour alone", () => {
    const p = photoAdPrompt(chat, { name: "  ", color: "#123456" }, { name: "Priya", one: "hi", two: "  " });
    expect(p).toContain("The brand colour is #123456.");
    expect(p).not.toContain('""');
    expect(p).not.toContain("2. You");
    expect(p).toContain('The words on it, in order: Their name: "Priya"; 1. Them: "hi".');
  });

  it("fits ai-image's prompt cap for every format with each line at its writer's word limit and a 40-character brand", () => {
    for (const f of STATIC_FORMATS.filter((x) => x.ready)) {
      if (!isStatic(f.slug)) throw new Error(`${f.slug} has no layout`);
      const words = Object.fromEntries(IMAGE_FIELDS[f.slug].map((x) => [x.key, x.unit === "words" ? Array(x.max).fill("words").join(" ") : "x".repeat(x.max)]));
      expect(photoAdPrompt(f, { name: "N".repeat(40), color: "#7A4B2A" }, words).length, f.slug).toBeLessThanOrEqual(MAX_PROMPT);
    }
  });
});

describe("each format's scene", () => {
  it("asks for Singapore by its look, never a real station, line, mall or named place, and every prompt carries the real-marks line", () => {
    for (const f of STATIC_FORMATS) {
      expect(f.scene, f.slug).not.toMatch(/\b(MRT|LRT|platforms?|stations?|malls?|banks?|Orchard|Changi|Sentosa|Marina|Raffles|Bugis|Jurong|Tampines|Buona Vista|Chinatown)\b/i);
      expect(photoAdPrompt(f, hilltop, {}), f.slug).toContain(PHOTO_MARKS);
    }
    expect(PHOTO_MARKS).toMatch(/no real place names on signs, and no real transit, mall, bank or shop logos or vehicle liveries/);
  });

  it("is one plain sentence with no double quote, so it never reads as words to print", () => {
    for (const f of STATIC_FORMATS) {
      expect(f.scene, f.slug).toMatch(/^An? [\x20-\x7e]+\.$/);
      expect(f.scene, f.slug).not.toContain('"');
      expect(f.scene.slice(0, -1), f.slug).not.toMatch(/[.!?] /);
    }
  });
});

describe("the photo run", () => {
  beforeEach(() => {
    localStorage.clear();
    Object.assign(fake, { write: null, writeFails: "", image: null, imageFails: "", calls: [], asks: [], files: {}, writeAngle: "", writeWords: { headline: "Still dark, still raining.", line: "Hilltop cold brew." } });
  });

  it("shows its first step at once, writes the words into a layout design, then makes one photo from those words", async () => {
    const run = startPhotoAd(U, poster, { topic: "Rainy mornings" });
    expect(photoAd()).toMatchObject({ slug: "street-poster", state: "writing" });
    await run;
    const p = photoAd()!;
    expect(p).toMatchObject({ slug: "street-poster", state: "done", mediaKey: "cimg-photo1" });
    const design = imageById(U, p.designId)!;
    expect(design).toMatchObject({ layout: "street-poster", words: { topic: "Rainy mornings", headline: "Still dark, still raining." } });
    // the words flag (no "No text" rule, no Soul v2) and kept cut to the examples' 4:5
    expect(fake.calls).toEqual([{ prompt: photoAdPrompt(poster, { name: "", color: DEFAULT_BRAND.color }, design.words), name: "Poster in the street: Still dark, still raining.", o: { words: true } }]);
  });

  it("hands the model the brand kit's logo to place, and no picture at all for a kit without one", async () => {
    const LOGO = "data:image/png;base64,iVBORw0KGgo=";
    localStorage.setItem(`content-studio-carousel-brand-${U}`, JSON.stringify({ color: "#F26B1D", name: "ActivityTracker", handle: "", logo: LOGO }));
    await startPhotoAd(U, poster, { topic: "x" });
    expect(fake.calls[0].o).toEqual({ words: true, refs: { logo: LOGO } });
    // the name and colour still go in the words, so the picture reads the same when the model can't take the logo
    expect(fake.calls[0].prompt).toContain('The brand is "ActivityTracker", its colour #F26B1D.');
    localStorage.setItem(`content-studio-carousel-brand-${U}`, JSON.stringify({ color: "#F26B1D", name: "ActivityTracker", handle: "" }));
    await startPhotoAd(U, poster, { topic: "x" });
    expect(fake.calls[1].o).toEqual({ words: true });
  });

  describe("about the brand's product", () => {
    const tracker = { id: "pd-tracker1", name: "Activity Tracker", what: "Logs daily sales activities as streaks, with a leaderboard.", forWho: "Sales agents", pictures: ["cimg-tracker1"], sources: [""], use: true, from: "you", addedAt: "" };
    const corgi = { ...tracker, id: "pd-corgi11", name: "Corgi Coach", what: "A virtual corgi that grows with your streak.", pictures: [], sources: [] };
    const keep = (...items: object[]) => localStorage.setItem(`content-studio-products-${U}`, JSON.stringify({ items }));

    it("writes for the first product in use and shows it: its line in the prompt, its own picture as a reference", async () => {
      keep({ ...corgi, use: false }, tracker);
      fake.files["cimg-tracker1"] = new Blob(["tracker"]);
      await startPhotoAd(U, poster, { topic: "What ActivityTracker does and who it's for" });
      expect(fake.asks[0].product).toEqual({ name: "Activity Tracker", what: tracker.what, forWho: "Sales agents" });
      const design = imageById(U, photoAd()!.designId)!;
      expect(fake.calls[0].prompt).toBe(photoAdPrompt(poster, { name: "", color: DEFAULT_BRAND.color }, design.words, { name: "Activity Tracker", what: tracker.what }));
      expect(fake.calls[0].prompt).toContain("The ad shows the brand's product itself: Activity Tracker, Logs daily sales activities as streaks, with a leaderboard.");
      expect(fake.calls[0].o).toEqual({ words: true, refs: { product: `data:image/jpeg;base64,${btoa("tracker")}` } });
    });

    it("takes the product the note names, and describes one with no picture on this device in words alone", async () => {
      keep(tracker, corgi);
      await startPhotoAd(U, poster, { topic: "Make it about corgi coach" });
      expect(fake.asks[0].product).toMatchObject({ name: "Corgi Coach" });
      expect(fake.calls[0].prompt).toContain("The ad shows the brand's product itself: Corgi Coach, A virtual corgi that grows with your streak.");
      expect(fake.calls[0].o).toEqual({ words: true });
      // the tracker's picture key is known but not on this device: still words alone
      await startPhotoAd(U, poster, { topic: "x" });
      expect(fake.asks[1].product).toMatchObject({ name: "Activity Tracker" });
      expect(fake.calls[1].o).toEqual({ words: true });
    });

    it("sends a named insurer product's general kind and never its picture, and leaves the product out with none saved", async () => {
      keep({ ...tracker, name: "AIA Pro Achiever 3.0", what: "AIA Pro Achiever 3.0 grows your money.", generic: "an investment-linked plan", namedProduct: true });
      fake.files["cimg-tracker1"] = new Blob(["brochure"]);
      await startPhotoAd(U, poster, { topic: "x" });
      expect(fake.asks[0].product).toMatchObject({ name: "an investment-linked plan" });
      expect(fake.calls[0].prompt).not.toMatch(/Pro Achiever|AIA/);
      expect(fake.calls[0].o).toEqual({ words: true });
      localStorage.removeItem(`content-studio-products-${U}`);
      await startPhotoAd(U, poster, { topic: "x" });
      expect(fake.asks[1]).not.toHaveProperty("product");
      expect(fake.calls[1].prompt).not.toContain("product");
    });

    it("with no product in use, writes from the brand's most concrete saved facts and names it in the prompt", async () => {
      localStorage.setItem(`content-studio-carousel-brand-${U}`, JSON.stringify({ color: "#F26B1D", name: "ActivityTracker", handle: "" }));
      localStorage.setItem(`content-studio-positioning-${U}`, JSON.stringify({ oneLiner: "A phone app for your selling week.", edge: "Logs each day's calls as a streak, with a team leaderboard.", audience: "working-adult", audienceDetail: "Insurance agents", topics: [] }));
      keep({ ...tracker, use: false });
      await startPhotoAd(U, poster, { topic: "x" });
      expect(fake.asks[0].product).toEqual({ name: "ActivityTracker", what: "Logs each day's calls as a streak, with a team leaderboard. A phone app for your selling week.", forWho: "Insurance agents" });
      expect(fake.calls[0].prompt).toContain("The ad shows the brand's product itself: ActivityTracker, Logs each day's calls as a streak, with a team leaderboard. A phone app for your selling week.");
      // no product of its own, so no product picture
      expect(fake.calls[0].o).toEqual({ words: true });
      // the writer reads every fact; the picture gets the first 160 characters, cut at a word
      const long = `Logs each day's calls as a streak, with a team leaderboard and a virtual corgi that grows as you keep going. ${"Every call counts toward the week. ".repeat(6)}`;
      localStorage.setItem(`content-studio-positioning-${U}`, JSON.stringify({ oneLiner: "", edge: long, audience: "working-adult", audienceDetail: "", topics: [] }));
      await startPhotoAd(U, poster, { topic: "x" });
      expect((fake.asks[1].product as { what: string }).what.length).toBeGreaterThan(200);
      const line = fake.calls[1].prompt.match(/The ad shows the brand's product itself: [^.]*\.[^"]*?(?= The words on it)/)![0];
      expect(line.length).toBeLessThanOrEqual("The ad shows the brand's product itself: ActivityTracker, .".length + 160);
    });

    it("drops the product line, never the words, when both would run past ai-image's prompt cap", async () => {
      keep({ ...tracker, what: "w".repeat(200) });
      fake.writeWords = { headline: "word ".repeat(125).trim(), line: "Hilltop cold brew." };
      await startPhotoAd(U, poster, { topic: "x" });
      expect(photoAd()).toMatchObject({ state: "done" });
      expect(fake.calls[0].prompt).not.toContain("The ad shows the brand's product");
      expect(fake.calls[0].prompt.length).toBeLessThanOrEqual(MAX_PROMPT);
    });
  });

  it("takes the angle and the product the person picked, over the rotation and the note", async () => {
    const tracker = { id: "pd-tracker1", name: "Activity Tracker", what: "Logs daily sales activities.", forWho: "Sales agents", pictures: [], sources: [], use: true, from: "you", addedAt: "" };
    localStorage.setItem(`content-studio-products-${U}`, JSON.stringify({ items: [tracker, { ...tracker, id: "pd-corgi11", name: "Corgi Coach", use: false }] }));
    await startPhotoAd(U, poster, { topic: "Make it about the tracker", angle: "Bust a myth", product: "pd-corgi11" });
    expect(fake.asks[0]).toMatchObject({ angles: ["Bust a myth"], product: { name: "Corgi Coach" } });
    // an angle that isn't one of the twelve keeps the rotation
    await startPhotoAd(U, poster, { topic: "x", angle: "Shout louder" });
    expect(fake.asks[1].angles).toEqual(angleOrder(poster.slug, usedAngles(U, poster.slug)).slice(0, ANGLE_POOL));
  });

  it("names the product in one plain sentence with no double quote, so it is never printed as words", () => {
    expect(productLine({ name: 'The "Pro" plan', what: "  Logs daily\nactivities.  " })).toBe("The ad shows the brand's product itself: The 'Pro' plan, Logs daily activities.");
    expect(productLine({ name: "Corgi Coach", what: "" })).toBe("The ad shows the brand's product itself: Corgi Coach.");
  });

  it("spends nothing on a picture when the words fail or come back empty, and says why", async () => {
    fake.writeFails = "Today's remixes are used up.";
    await startPhotoAd(U, poster, { topic: "x" });
    expect(photoAd()).toMatchObject({ state: "failed", error: "Today's remixes are used up." });
    fake.writeFails = "";
    fake.writeWords = { line: "No headline came back." };
    await startPhotoAd(U, poster, { topic: "x" });
    expect(photoAd()).toMatchObject({ state: "failed", error: "Couldn't write it right now. Try again in a minute." });
    expect(fake.calls).toEqual([]);
  });

  it("spends nothing on a picture when the words are too long for ai-image's prompt", async () => {
    fake.writeWords = { headline: "long ".repeat(250).trim() };
    await startPhotoAd(U, poster, { topic: "x" });
    expect(photoAd()).toMatchObject({ state: "failed", error: TOO_LONG });
    expect(fake.calls).toEqual([]);
  });

  it("passes the picture maker's own failure on", async () => {
    fake.imageFails = "The image was blocked by the safety filter. Change the prompt and try again.";
    await startPhotoAd(U, poster, { topic: "x" });
    expect(photoAd()).toMatchObject({ state: "failed", error: fake.imageFails });
  });
});

describe("what the picture shows of what the brand sells", () => {
  beforeEach(() => {
    localStorage.clear();
    Object.assign(fake, { write: null, writeFails: "", image: null, imageFails: "", calls: [], asks: [], files: {}, writeAngle: "", writeSubject: "", writeWords: { headline: "Still dark, still raining.", line: "Hilltop cold brew." } });
  });

  it("shows software on its own plain screen, a product itself and a service being done, never a stock person with a phone", () => {
    expect(SUBJECT_LINES.software).toContain("show it on a phone or laptop screen, a plain, plausible interface in the brand colour showing the thing the words name. No real app's interface and no readable small print.");
    expect(SUBJECT_LINES.product).toContain("show the product itself");
    expect(SUBJECT_LINES.service).toContain("show the service being done");
    const p = photoAdPrompt(poster, hilltop, { headline: "Still dark." }, undefined, "software");
    expect(p).toContain(SUBJECT_LINES.software);
    expect(p.indexOf(SUBJECT_LINES.software)).toBeLessThan(p.indexOf("The words on it"));
    // only where the format pictures what is sold: a chat on a phone screen has no room for it
    expect(photoAdPrompt(chat, hilltop, { one: "hi" }, undefined, "software")).not.toContain("What it sells is");
    expect(photoAdPrompt(poster, hilltop, { headline: "Still dark." })).not.toContain("What it sells is");
  });

  it("takes Jev's read from the write, else What you sell's own kind when the brand picked one, else nothing", () => {
    expect(subjectOf("software", "products")).toBe("software");
    expect([subjectOf(undefined, "products"), subjectOf(undefined, "service"), subjectOf(undefined, undefined)]).toEqual(["product", "service", undefined]);
  });

  it("puts the read in the photo prompt, and the kind a brand picked when Jev had none", async () => {
    fake.writeSubject = "software";
    await startPhotoAd(U, poster, { topic: "x" });
    expect(fake.calls[0].prompt).toContain(SUBJECT_LINES.software);
    fake.writeSubject = "";
    localStorage.setItem(`content-studio-products-${U}`, JSON.stringify({ kind: "products", items: [] }));
    await startPhotoAd(U, poster, { topic: "x" });
    expect(fake.calls[1].prompt).toContain(SUBJECT_LINES.product);
    localStorage.removeItem(`content-studio-products-${U}`);
    await startPhotoAd(U, poster, { topic: "x" });
    expect(fake.calls[2].prompt).not.toContain("What it sells is");
  });

  it("leaves out the product line first, then what to show, never the words, to stay inside the cap", async () => {
    localStorage.setItem(`content-studio-products-${U}`, JSON.stringify({ items: [{ id: "pd-long111", name: "Activity Tracker", what: "w ".repeat(100), forWho: "", pictures: [], sources: [], use: true, from: "you", addedAt: "" }] }));
    fake.writeSubject = "software";
    for (const [n, product, subject] of [[40, true, true], [80, false, true], [120, false, false]] as const) {
      fake.writeWords = { headline: "word ".repeat(n).trim(), line: "Hilltop cold brew." };
      fake.calls = [];
      await startPhotoAd(U, poster, { topic: "x" });
      const p = fake.calls[0].prompt;
      expect(p.length, String(n)).toBeLessThanOrEqual(MAX_PROMPT);
      expect([p.includes("The ad shows the brand's product"), p.includes(SUBJECT_LINES.software)], String(n)).toEqual([product, subject]);
      expect(p).toContain("word ".repeat(n).trim());
    }
  });
});

describe("a brand's saved facts, for an ad with no product in use", () => {
  beforeEach(() => localStorage.clear());
  const put = (k: string, v: unknown) => localStorage.setItem(`content-studio-${k}-${U}`, JSON.stringify(v));
  const brand = () => put("carousel-brand", { color: "#F26B1D", name: "ActivityTracker", handle: "" });
  const desk = (o: Record<string, unknown> = {}) => put("script-context", { product: { on: true, name: "Activity Tracker", what: "Logs daily sales activities.", who: "Agents", how: "Tap after each call\nWatch the streak grow.", gets: "A streak and a virtual corgi.", proof: "Agents keep 3x more streak days.", ...o } });

  it("takes the script desk's Product first, then the edge and one-liner, then the brand's own facts, each once", () => {
    brand();
    desk();
    put("positioning", { oneLiner: "A phone app for your selling week.", edge: "Logs daily sales activities", audienceDetail: "Insurance agents", topics: [] });
    put("facts", [{ id: "f1", text: "Rated by agents on the App Store.", createdAt: "2026-11-01T00:00:00Z" }, { id: "f2", text: "Old fact", createdAt: "2026-11-01T00:00:00Z", offAt: "2026-11-02T00:00:00Z" }]);
    expect(brandAdFacts(U)).toEqual({
      name: "Activity Tracker",
      what: "Logs daily sales activities. Tap after each call, Watch the streak grow. A streak and a virtual corgi. Agents keep 3x more streak days. A phone app for your selling week. Rated by agents on the App Store.",
      forWho: "Agents",
    });
  });

  it("skips a Product that is switched off, names the brand then, cuts at a word, and is nothing with no name or no facts", () => {
    brand();
    desk({ on: false });
    put("positioning", { oneLiner: "word ".repeat(120), edge: "", audienceDetail: "", topics: [] });
    const r = brandAdFacts(U)!;
    expect(r.name).toBe("ActivityTracker");
    expect(r.what).not.toContain("Logs daily sales");
    expect(r.forWho).toBe("");
    expect(r.what.length).toBeLessThanOrEqual(AD_FACTS_MAX);
    expect(r.what.endsWith("word")).toBe(true);
    localStorage.clear();
    brand();
    expect(brandAdFacts(U)).toBeNull();
    localStorage.clear();
    put("positioning", { oneLiner: "A phone app.", edge: "", audienceDetail: "", topics: [] });
    expect(brandAdFacts(U)).toBeNull();
  });
});

describe("the angle each make takes", () => {
  beforeEach(() => {
    localStorage.clear();
    Object.assign(fake, { write: null, writeFails: "", image: null, imageFails: "", calls: [], asks: [], files: {}, writeAngle: "", writeWords: { headline: "Still dark, still raining.", line: "Hilltop cold brew." } });
  });
  const ALL = Object.keys(STATIC_ANGLES);

  it("offers the never used first, the format's own examples' angles ahead, then the oldest used", () => {
    const own = ["The moment", "Before and after", "Make them smile", "The offer"];
    expect(angleOrder("street-poster", []).slice(0, 4)).toEqual(own);
    expect(new Set(angleOrder("street-poster", []))).toEqual(new Set(ALL));
    // used latest first: the never used lead, then the used from the oldest
    const order = angleOrder("street-poster", ["The offer", "The moment", "not an angle"]);
    expect(order.slice(0, 3)).toEqual(["Before and after", "Make them smile", "Name the pain"]);
    expect(order.slice(-2)).toEqual(["The moment", "The offer"]);
    expect(order).toHaveLength(12);
  });

  it("is remembered per brand and format in one small synced key, latest first, once each", () => {
    rememberAngle(U, "street-poster", "The offer");
    rememberAngle(U, "street-poster", "Bust a myth");
    rememberAngle(U, "street-poster", "The offer");
    rememberAngle(U, "text-chat", "Name the pain");
    expect(usedAngles(U, "street-poster")).toEqual(["The offer", "Bust a myth"]);
    expect(JSON.parse(localStorage.getItem(`content-studio-static-angles-${U}`)!)).toEqual({ "street-poster": ["The offer", "Bust a myth"], "text-chat": ["Name the pain"] });
    for (const a of ALL) rememberAngle(U, "street-poster", a);
    expect(usedAngles(U, "street-poster")).toHaveLength(12);
    localStorage.setItem(`content-studio-static-angles-${U}`, "[1,2]");
    expect(usedAngles(U, "street-poster")).toEqual([]);
    rememberAngle(U, "street-poster", "The offer");
    expect(usedAngles(U, "street-poster")).toEqual(["The offer"]);
  });

  it("sends the four least recently used and the sample's opening, keeps the angle taken, and the next make moves on", async () => {
    expect(sampleOpening(poster)).toBe("Still dark, still");
    fake.writeAngle = "Make them smile";
    await startPhotoAd(U, poster, { topic: "x" });
    expect(fake.asks[0]).toMatchObject({ angles: ["The moment", "Before and after", "Make them smile", "The offer"], avoid: "Still dark, still" });
    expect((fake.asks[0].angles as string[]).length).toBe(ANGLE_POOL);
    expect(photoAd()).toMatchObject({ state: "done", angle: "Make them smile" });
    expect(usedAngles(U, "street-poster")).toEqual(["Make them smile"]);
    fake.writeAngle = "The moment";
    await startPhotoAd(U, poster, { topic: "x" });
    expect(fake.asks[1].angles).toEqual(["The moment", "Before and after", "The offer", "Name the pain"]);
    expect(usedAngles(U, "street-poster")).toEqual(["The moment", "Make them smile"]);
  });

  it("keeps the angle of words whose picture failed, and remembers nothing when the writer sent none back", async () => {
    fake.writeAngle = "The offer";
    fake.imageFails = "Couldn't make the photo.";
    await startPhotoAd(U, poster, { topic: "x" });
    expect(photoAd()).toMatchObject({ state: "failed", angle: "The offer" });
    expect(usedAngles(U, "street-poster")).toEqual(["The offer"]);
    fake.imageFails = "";
    fake.writeAngle = "";
    await startPhotoAd(U, poster, { topic: "x" });
    expect(photoAd()).not.toHaveProperty("angle");
    expect(usedAngles(U, "street-poster")).toEqual(["The offer"]);
  });
});

describe("the run a format's page shows", () => {
  const run = { seq: 3, slug: "street-poster", designId: "img-abcd1", state: "making" as const };
  const picture = (o: Record<string, unknown> = {}) => ({ prompt: `${poster.scene} The brand colour is #000000.`, state: "working" as const, ...o });

  it("is its own run, never another format's, and a live run outranks an older picture job", () => {
    expect(shownPhotoAd(poster, run, null)).toBe(run);
    expect(shownPhotoAd(chat, run, picture())).toBeNull();
    // a chat photo made earlier in this visit is still the picture job while the poster's words are written
    expect(shownPhotoAd(chat, run, picture({ prompt: `${chat.scene} The brand colour is #000000.`, state: "done", mediaKey: "cimg-chat1" }))).toBeNull();
  });

  it("after a reload forgot the run, is the picture job whose prompt opens with this format's scene", () => {
    expect(shownPhotoAd(poster, null, picture())).toMatchObject({ slug: "street-poster", state: "making", designId: "" });
    expect(shownPhotoAd(poster, null, picture({ state: "saving" }))).toMatchObject({ state: "making" });
    expect(shownPhotoAd(poster, null, picture({ state: "done", mediaKey: "cimg-photo1", preview: "data:x" }))).toMatchObject({ state: "done", mediaKey: "cimg-photo1", preview: "data:x" });
    expect(shownPhotoAd(poster, null, picture({ state: "failed", error: "The image didn't come through. Try again." }))).toMatchObject({ state: "failed", error: "The image didn't come through. Try again." });
  });

  it("is nothing for another format's picture, any other picture, or a fix", () => {
    expect(shownPhotoAd(chat, null, picture())).toBeNull();
    expect(shownPhotoAd(poster, null, picture({ prompt: "A family picnic at East Coast Park" }))).toBeNull();
    expect(shownPhotoAd(poster, null, picture({ fix: "make the sky bluer" }))).toBeNull();
    expect(shownPhotoAd(poster, null, null)).toBeNull();
  });
});
