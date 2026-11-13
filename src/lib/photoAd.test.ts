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
    calls: [] as { prompt: string; name: string }[],
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
      fake.write = { id: 1, designId: ask.designId, state: "writing" };
      await Promise.resolve();
      if (fake.writeFails) return void (fake.write = { ...fake.write, state: "failed", error: fake.writeFails });
      const d = real.imageById(userId, ask.designId)!;
      real.saveImage(userId, { ...d, words: { ...d.words, ...fake.writeWords } });
      fake.write = { ...fake.write, state: "done" };
    },
  };
});
// the paid picture: never called for real
vi.mock("@/lib/aiImage", async (actual) => ({
  ...(await actual<typeof import("@/lib/aiImage")>()),
  imageJob: () => fake.image,
  imageBusy: () => false,
  makeImage: async (_u: string, prompt: string, name: string) => {
    fake.calls.push({ prompt, name });
    await Promise.resolve();
    fake.image = fake.imageFails ? { prompt, state: "failed", error: fake.imageFails } : { prompt, state: "done", mediaKey: "cimg-photo1", preview: "data:image/jpeg;base64,eA" };
  },
}));

import { PHOTO_PEOPLE, PHOTO_RULE, TOO_LONG, photoAd, photoAdPrompt, startPhotoAd } from "./photoAd";
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

  it("ends on the people line and the spelling rule, word for word", () => {
    const p = photoAdPrompt(poster, hilltop, { headline: "Still dark." });
    expect(p.endsWith(" People, when the scene shows any, are Singaporean adults. All text spelled exactly as quoted. No other logos, brands or watermarks.")).toBe(true);
    expect(p.endsWith(`${PHOTO_PEOPLE} ${PHOTO_RULE}`)).toBe(true);
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
    Object.assign(fake, { write: null, writeFails: "", image: null, imageFails: "", calls: [], writeWords: { headline: "Still dark, still raining.", line: "Hilltop cold brew." } });
  });

  it("shows its first step at once, writes the words into a layout design, then makes one photo from those words", async () => {
    const run = startPhotoAd(U, poster, { topic: "Rainy mornings" });
    expect(photoAd()).toMatchObject({ slug: "street-poster", state: "writing" });
    await run;
    const p = photoAd()!;
    expect(p).toMatchObject({ slug: "street-poster", state: "done", mediaKey: "cimg-photo1" });
    const design = imageById(U, p.designId)!;
    expect(design).toMatchObject({ layout: "street-poster", words: { topic: "Rainy mornings", headline: "Still dark, still raining." } });
    expect(fake.calls).toEqual([{ prompt: photoAdPrompt(poster, { name: "", color: DEFAULT_BRAND.color }, design.words), name: "Poster in the street: Still dark, still raining." }]);
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
