import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabase: { functions: { invoke: vi.fn() } }, SUPABASE_URL: "", SUPABASE_ANON_KEY: "" }));
const make = vi.hoisted(() => vi.fn());
vi.mock("@/lib/remix", async (orig) => ({ ...(await orig<typeof import("./remix")>()), requestMake: make }));
const fn = vi.hoisted(() => vi.fn());
vi.mock("@/lib/edgeFn", async (orig) => ({ ...(await orig<typeof import("./edgeFn")>()), callFn: fn }));
vi.mock("@/lib/remixLink", async (orig) => ({ ...(await orig<typeof import("./remixLink")>()), scalePicture: async () => "data:image/jpeg;base64,AAAA" }));
import { EdgeError } from "./edgeFn";
import { formatJobs } from "./formatJob";
import {
  HEADSHOT,
  MAX_IMAGES,
  blankImage,
  cachedShows,
  imageDraft,
  imageWrite,
  loadImages,
  pictureLine,
  postFileKey,
  sanitizeSavedImage,
  saveImage,
  startImageWrite,
  swipePicture,
  wordsFromMake,
  type ImageWriteAsk,
  type SavedImage,
} from "./images";
import type { MakeResponse } from "./remix";
import type { RemixSource } from "./remixSource";
import { parseMakeRequest } from "../../supabase/functions/remix/logic";

class MemStorage {
  s = new Map<string, string>();
  /** Writes of the images key longer than this throw, as a full device does. */
  full = Infinity;
  get length() { return this.s.size; }
  key(i: number) { return [...this.s.keys()][i] ?? null; }
  getItem(k: string) { return this.s.get(k) ?? null; }
  setItem(k: string, v: string) {
    if (k.startsWith("content-studio-images-") && v.length > this.full) throw new DOMException("full", "QuotaExceededError");
    this.s.set(k, v);
  }
  removeItem(k: string) { this.s.delete(k); }
}
let storage: MemStorage;
const changed = vi.fn();
const U = "u1";

beforeEach(() => {
  storage = new MemStorage();
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("window", { localStorage: storage, sessionStorage: new MemStorage(), addEventListener: () => {}, removeEventListener: () => {} });
  vi.stubGlobal("dispatchEvent", changed);
  make.mockReset();
  fn.mockReset();
  changed.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

const design = (id: string, extra: Partial<SavedImage> = {}): SavedImage => ({ ...blankImage(), id, ...extra });

describe("saved designs", () => {
  it("keeps the newest 20, a saved one moving to the top, and tells the page", () => {
    for (let i = 0; i < 25; i++) saveImage(U, design(`img-a${i}xx`, { words: { headline: `H ${i}` } }), new Date(Date.UTC(2026, 9, 21, 0, i)));
    const list = loadImages(U);
    expect(list).toHaveLength(MAX_IMAGES);
    expect(list[0].id).toBe("img-a24xx");
    expect(list.at(-1)?.id).toBe("img-a5xx");
    // the stored list itself is cut, not only what is read back
    const key = [...storage.s.keys()].find((k) => k.startsWith("content-studio-images-"))!;
    expect(JSON.parse(storage.getItem(key)!)).toHaveLength(MAX_IMAGES);
    saveImage(U, design("img-a10xx"));
    expect(loadImages(U)[0].id).toBe("img-a10xx");
    expect(loadImages(U)).toHaveLength(MAX_IMAGES);
    expect(changed).toHaveBeenCalled();
  });

  it("drops the oldest designs when the device is full, and still saves the new one", () => {
    for (let i = 0; i < 6; i++) saveImage(U, design(`img-b${i}xx`, { words: { caption: "x".repeat(400) } }));
    storage.full = 2300;
    const kept = saveImage(U, design("img-newxx", { words: { caption: "y".repeat(400) } }));
    expect(kept[0].id).toBe("img-newxx");
    expect(kept.length).toBeLessThan(7);
    expect(loadImages(U).map((x) => x.id)).toEqual(kept.map((x) => x.id));
    expect(kept.map((x) => x.id)).toEqual(["img-newxx", "img-b5xx", "img-b4xx", "img-b3xx", "img-b2xx"].slice(0, kept.length));
  });

  it("reads back clean: junk dropped, unknown values set to the defaults", () => {
    expect(sanitizeSavedImage({ id: "../x" })).toBeNull();
    expect(sanitizeSavedImage(null)).toBeNull();
    const img = sanitizeSavedImage({
      id: "img-abc123",
      layout: "billboard",
      size: "3x2",
      words: { headline: "Hi", line: 4, "bad key": "x", caption: "c".repeat(3000) },
      font: "comic",
      paper: "neon",
      align: "right",
      pictureKey: "https://evil.test/a.png",
      source: { key: "ad:123", label: "Singlife" },
    });
    expect(img).toEqual({ id: "img-abc123", layout: "headline", size: "4x5", words: { headline: "Hi", caption: "c".repeat(2200) }, font: "classic", paper: "light", align: "left", source: { key: "ad:123", label: "Singlife" }, updatedAt: "" });
    expect(sanitizeSavedImage({ id: "img-abc123", pictureKey: "cimg-abc123def" })?.pictureKey).toBe("cimg-abc123def");
    expect(sanitizeSavedImage({ id: "img-abc123", pictureKey: HEADSHOT })?.pictureKey).toBe(HEADSHOT);
    storage.setItem("content-studio-images-u1", "{not json");
    expect(loadImages(U)).toEqual([]);
  });

  it("says when a design's picture is on another device", () => {
    expect(pictureLine({ pictureKey: "cimg-abc123def" }, false)).toBe("The picture is on another device.");
    expect(pictureLine({ pictureKey: "cimg-abc123def" }, true)).toBeNull();
    // still looking: nothing yet
    expect(pictureLine({ pictureKey: "cimg-abc123def" }, undefined)).toBeNull();
    expect(pictureLine({ pictureKey: HEADSHOT }, false)).toBeNull();
    expect(pictureLine({}, false)).toBeNull();
  });
});

describe("the words a make wrote", () => {
  it("replaces the layout's own fields, keeps what you typed, and puts a client's words in their own field", () => {
    const prev = { headline: "Old", line: "Old line", button: "Old", number: "57%", statSource: "MOH", quote: "My line" };
    expect(wordsFromMake(prev, { as: "image", layout: "headline", layoutBy: "jev", words: { headline: "New", button: "Message me" }, caption: "Cap" })).toEqual({
      headline: "New", line: "", button: "Message me", number: "57%", statSource: "MOH", quote: "My line", caption: "Cap",
    });
    const t = wordsFromMake(prev, { as: "image", layout: "testimonial", layoutBy: "default", words: { quote: "They helped" }, caption: "Cap" });
    expect(t.clientWords).toBe("They helped");
    expect(t.quote).toBe("My line");
    expect(wordsFromMake(prev, { as: "image", layout: "stat", layoutBy: "default", words: { statLabel: "of people" }, caption: "C" })).toMatchObject({ number: "57%", statSource: "MOH", statLabel: "of people" });
  });
});

describe("Write it for me", () => {
  const swipe: RemixSource = { key: "ad:2095783381019179", kind: "ad", format: "image", platform: "meta-ad", author: "Singlife", title: "Singlife CareShield", caption: "Plan for long-term care today.", cover: "/ads/2095783381019179.jpg", remixedAt: "" };
  const theirs: RemixSource = { ...swipe, key: "ad:555", cover: "https://scontent.xx.fbcdn.net/v/t39/a.jpg" };
  const ask = (o: Partial<ImageWriteAsk> = {}): ImageWriteAsk => ({ designId: "img-job1xx", source: swipe, topic: "", layout: null, mention: true, note: "", size: "4x5", read: true, ...o });
  const reply = (o: Partial<Extract<MakeResponse["result"], { as: "image" }>> = {}): MakeResponse => ({
    as: "image",
    result: { as: "image", layout: "stat", layoutBy: "jev", words: { statLabel: "of families plan care too late" }, caption: "Plan early.", ...o },
    flags: { copied: [], claim: false, invented: false, mas: false },
    usage: { used: 1, limit: 30 },
  });
  const jpeg = () => new Response(new Blob([new Uint8Array([255, 216, 255])]), { status: 200, headers: { "content-type": "image/jpeg" } });
  let fetcher: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetcher = vi.fn(async () => jpeg());
    vi.stubGlobal("fetch", fetcher);
    saveImage(U, design("img-job1xx", { words: { number: "57%", statSource: "MOH 2024" } }));
  });

  it("reads a swipe ad's own picture once, lets Jev pick the layout from it, and writes into the design", async () => {
    fn.mockResolvedValue({ source: { key: "upload:x", kind: "upload", teardown: { structure: "A big number on an orange block." }, text: "", remixedAt: "" } });
    make.mockResolvedValue(reply());
    await startImageWrite(U, ask());
    expect(fetcher).toHaveBeenCalledWith("/ads/2095783381019179.jpg");
    expect(fn).toHaveBeenCalledWith("remix-link", expect.objectContaining({ mode: "image", image: "data:image/jpeg;base64,AAAA", sha1: expect.stringMatching(/^[0-9a-f]{40}$/) }));
    const body = make.mock.calls[0][0];
    expect(body).toMatchObject({ mode: "make", as: "image", shows: "A big number on an orange block.", source: { key: swipe.key } });
    expect("layout" in body).toBe(false);
    // the server takes this body as it is
    expect(parseMakeRequest(body).ok).toBe(true);
    const saved = loadImages(U)[0];
    expect(saved).toMatchObject({ id: "img-job1xx", layout: "stat", words: { number: "57%", statSource: "MOH 2024", statLabel: "of families plan care too late", caption: "Plan early." } });
    expect(imageWrite()).toMatchObject({ state: "done", layout: "stat", layoutBy: "jev", flags: { mas: false } });
    expect(formatJobs().find((j) => j.slug === "static-ad")).toMatchObject({ state: "ready", format: "image", href: "/image?image=img-job1xx" });
    expect(cachedShows(swipe.key)).toBe("A big number on an orange block.");

    // writing it again reads nothing
    fetcher.mockClear();
    fn.mockClear();
    await startImageWrite(U, ask({ layout: "stat" }));
    expect(fetcher).not.toHaveBeenCalled();
    expect(fn).not.toHaveBeenCalled();
    expect(make.mock.calls[1][0]).toMatchObject({ layout: "stat", shows: "A big number on an orange block." });
  });

  it("passes the picture's own words to the writer, cut at a word to the server's 800 characters", async () => {
    // the WATI ad: its numbered steps are only in the picture, the ad's text just says "Swipe for the steps."
    const steps = "1. Connect your WhatsApp number 2. Import your contacts 3. Send your first broadcast Book a Demo";
    fn.mockResolvedValue({ source: { key: "upload:w", kind: "upload", teardown: { structure: "Green numbered instructions on a white card." }, text: steps, remixedAt: "" } });
    make.mockResolvedValue(reply());
    await startImageWrite(U, ask());
    const body = make.mock.calls[0][0];
    expect(body.shows).toBe(`Green numbered instructions on a white card. Words in it: ${steps}`);
    expect(parseMakeRequest(body).ok).toBe(true);

    localStorage.removeItem("cs-image-shows-2");
    fn.mockResolvedValue({ source: { key: "upload:w", kind: "upload", teardown: { structure: "A long checklist." }, text: "word ".repeat(300), remixedAt: "" } });
    await startImageWrite(U, ask());
    const long = make.mock.calls[1][0].shows as string;
    expect(long.length).toBeLessThanOrEqual(800);
    expect(long.endsWith("word")).toBe(true);
    expect(parseMakeRequest(make.mock.calls[1][0]).ok).toBe(true);

    // the live 22 Oct read: a 199-character description and 738 characters of words, the steps starting near character 320
    localStorage.removeItem("cs-image-shows-2");
    const description = "A clean white promotional graphic has a green Wati logo and headline at the top, with a numbered list and bright green demo button on the left. A small, pale workflow and messaging mockup appears at it.";
    const words = `Chats build up. Follow-ups slip. Here is how teams on Wati keep every lead moving without a single missed reply. ${steps} ${"Wati DMs them the right next step at the right time. ".repeat(10)}`.slice(0, 738);
    fn.mockResolvedValue({ source: { key: "upload:w", kind: "upload", teardown: { structure: description }, text: words, remixedAt: "" } });
    await startImageWrite(U, ask());
    const wati = make.mock.calls[2][0].shows as string;
    expect(wati).toContain("3. Send your first broadcast");
    expect(wati.length).toBeLessThanOrEqual(800);
    expect(parseMakeRequest(make.mock.calls[2][0]).ok).toBe(true);
  });

  it("never reads a competitor's picture, a missing file the app answers with its own page, or with no picture reads left", async () => {
    make.mockResolvedValue(reply());
    await startImageWrite(U, ask({ source: theirs }));
    await startImageWrite(U, ask({ read: false }));
    expect(fetcher).not.toHaveBeenCalled();
    fetcher.mockResolvedValue(new Response("<!doctype html>", { status: 200, headers: { "content-type": "text/html" } }));
    await startImageWrite(U, ask());
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fn).not.toHaveBeenCalled();
    for (const [body] of make.mock.calls) expect(body.shows).toBeUndefined();
  });

  it("still writes when the picture read fails, from the ad's words", async () => {
    fn.mockRejectedValue(new EdgeError("You've used today's picture reads.", 429, "daily_limit"));
    make.mockResolvedValue(reply({ layout: "headline", layoutBy: "default", words: { headline: "Plan care early" } }));
    await startImageWrite(U, ask());
    expect(make).toHaveBeenCalledTimes(1);
    expect(make.mock.calls[0][0].shows).toBeUndefined();
    expect(imageWrite()?.state).toBe("done");
  });

  it("keeps the design as it was when the writer says no, and sends a typed topic with no source", async () => {
    make.mockRejectedValue(new EdgeError("The words kept too much of the original ad. Try again.", 422, "refused"));
    await startImageWrite(U, ask({ read: false }));
    expect(imageWrite()).toMatchObject({ state: "failed", refused: true, error: "The words kept too much of the original ad. Try again." });
    expect(loadImages(U)[0].words).toEqual({ number: "57%", statSource: "MOH 2024" });
    expect(formatJobs().find((j) => j.slug === "static-ad")).toMatchObject({ state: "failed" });

    make.mockRejectedValue(new Error("network"));
    await startImageWrite(U, ask({ source: null, topic: "Saving for a BTO", layout: "quote" }));
    expect(make.mock.calls[1][0]).toMatchObject({ as: "image", topic: "Saving for a BTO", layout: "quote" });
    expect(parseMakeRequest(make.mock.calls[1][0]).ok).toBe(true);
    expect(imageWrite()).toMatchObject({ state: "failed", error: "Couldn't write it right now. Try again in a minute." });
  });
});

describe("Post it for me", () => {
  it("keeps one PNG per design under a media-style key, so posting again replaces it", () => {
    expect(postFileKey({ id: "img-mvhj09rz2wt" })).toBe("cimg-pmvhj09rz2wt");
    expect(postFileKey({ id: `img-${"a".repeat(30)}` })).toMatch(/^cimg-[a-z0-9]{6,30}$/);
  });

  it("saves the caption as the post, the main words as its hook, and keeps a post it saved before", () => {
    const img = design("img-post1xx", { words: { headline: "Your hospital bill, split in two", caption: "A co-pay is not a catch." } });
    const src: RemixSource = { key: "ad:1", kind: "ad", remixedAt: "" };
    const fresh = imageDraft(img, "Your hospital bill, split in two", { id: "d1", now: "2026-10-21T00:00:00.000Z", prev: null, source: src });
    expect(fresh).toMatchObject({ id: "d1", hook: "Your hospital bill, split in two", draft: "A co-pay is not a catch.", format: "text-post", platform: "instagram", status: "draft", source: { key: "ad:1", remixedAt: "2026-10-21T00:00:00.000Z" } });
    const again = imageDraft({ ...img, words: { headline: "New", caption: "" } }, "New", { id: "x", now: "later", prev: { ...fresh, status: "scheduled" }, source: null });
    expect(again).toMatchObject({ id: "d1", hook: "New", draft: "New", status: "scheduled", createdAt: "2026-10-21T00:00:00.000Z" });
    expect(sanitizeSavedImage({ id: "img-abc123", draftId: "d1" })?.draftId).toBe("d1");
  });
});

describe("swipePicture", () => {
  it("reads only a swipe ad's own copy of its picture", () => {
    expect(swipePicture({ kind: "ad", cover: "/ads/2095783381019179.jpg" })).toBe("/ads/2095783381019179.jpg");
    expect(swipePicture({ kind: "ad", cover: "https://scontent.xx.fbcdn.net/a.jpg" })).toBeNull();
    expect(swipePicture({ kind: "top-post", cover: "/ads/2095783381019179.jpg" })).toBeNull();
    expect(swipePicture({ kind: "ad", cover: "/ads/../secret.jpg" })).toBeNull();
    expect(swipePicture(null)).toBeNull();
  });
});
