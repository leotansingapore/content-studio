import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabase: { functions: { invoke: vi.fn() } }, SUPABASE_URL: "", SUPABASE_ANON_KEY: "" }));
const make = vi.hoisted(() => vi.fn());
vi.mock("@/lib/remix", async (orig) => ({ ...(await orig<typeof import("./remix")>()), requestMake: make }));
const fn = vi.hoisted(() => vi.fn());
vi.mock("@/lib/edgeFn", async (orig) => ({ ...(await orig<typeof import("./edgeFn")>()), callFn: fn }));
const stock = vi.hoisted(() => ({ search: vi.fn(), download: vi.fn() }));
vi.mock("@/lib/stockMedia", () => ({ searchStock: stock.search, downloadStock: stock.download }));
const store = vi.hoisted(() => vi.fn());
vi.mock("@/lib/mediaLibrary", async (orig) => ({ ...(await orig<typeof import("./mediaLibrary")>()), storePicture: store }));
vi.mock("@/lib/videoMedia", async (orig) => ({ ...(await orig<typeof import("./videoMedia")>()), ensureCaptionFonts: async () => {} }));
// a canvas-free measure: each character half as wide as the font is tall
const measure = (text: string, css: string) => text.length * Number(/(\d+)px/.exec(css)?.[1] ?? 40) * 0.55;
vi.mock("@/lib/slideshowDraw", async (orig) => ({ ...(await orig<typeof import("./slideshowDraw")>()), screenMeasure: () => measure }));

import { EdgeError } from "./edgeFn";
import { links } from "./links";
import type { MakeResponse } from "./remix";
import type { RemixSource } from "./remixSource";
import { frameHeight, loadSlideshows } from "./slideshow";
import { layoutBoxes } from "./slideshowDraw";
import {
  FINISH_FAILED,
  WRITE_FAILED,
  addUsed,
  askParams,
  buildShow,
  clearSlideshowJob,
  coverWords,
  keptNote,
  NOTE_MAX,
  fitSlide,
  freshPhotos,
  loadUsed,
  mediaWindows,
  makeBody,
  onSlideshowJob,
  resolvePicks,
  slideshowJob,
  startFrom,
  startSlideshow,
  stepText,
  type SlideshowAsk,
  type SlideshowJob,
} from "./slideshowJob";
import type { StockItem } from "./stockMedia";
import { parseMakeRequest } from "../../supabase/functions/remix/logic";

const UID = "6d80f027-3395-480c-86a1-8827d3d6cce3";

class MemStorage {
  private m = new Map<string, string>();
  get length() { return this.m.size; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
}

const SOURCE: RemixSource = { key: "top:grace-koh-instagram-C931K", kind: "top-post", format: "carousel", platform: "instagram", author: "@gracekoh", caption: "6 signs your CPF plan is off track.", remixedAt: "" };
const ASK: SlideshowAsk = { source: SOURCE, topic: "", mention: true, note: "", size: "4x5", pictures: "stock" };
const photo = (id: string, alt = `photo ${id}`): StockItem => ({ id, w: 1080, h: 1620, alt, thumb: `https://images.pexels.com/photos/${id}/t.jpeg`, src: `https://images.pexels.com/photos/${id}/p.jpeg?w=1080`, by: "Ann", byUrl: "https://www.pexels.com/@ann", url: `https://www.pexels.com/photo/a-${id}/` });
const SLIDES = [
  { title: "3 signs your week went quiet", sub: "You might not see it yet.", search: "empty office" },
  { title: "1. You only call when it's slow", sub: "", search: "phone on desk" },
  { title: "2. Follow-ups slip", sub: "They move to next week, then the week after.", search: "calendar" },
];
const response = (slides = SLIDES): MakeResponse => ({ as: "slideshow", result: { as: "slideshow", slides, caption: "Quiet weeks start early. Track the work.\n\nSave this." }, flags: { copied: [], claim: false, invented: false }, usage: { used: 1, limit: 30 } });

/** Pexels answers per search and page; montage-pick answers with `picks`. */
function answer(pages: Record<string, StockItem[]>, picks: (number | null)[] | ((n: number) => (number | null)[]) | null = null) {
  let calls = 0;
  stock.search.mockImplementation(async (_kind: string, q: string, page: number) => ({ items: pages[`${q}|${page}`] ?? [], more: false }));
  fn.mockImplementation(async (name: string) => {
    if (name !== "video-assist") throw new Error(name);
    calls++;
    const p = typeof picks === "function" ? picks(calls) : picks;
    if (p === null) throw new EdgeError("No picks left today.", 429, "daily_limit");
    return { picks: p };
  });
}

let local: MemStorage;
beforeEach(() => {
  local = new MemStorage();
  vi.stubGlobal("window", { localStorage: local, dispatchEvent: () => true });
  vi.stubGlobal("localStorage", local);
  make.mockReset().mockResolvedValue(response());
  fn.mockReset();
  stock.search.mockReset();
  stock.download.mockReset().mockResolvedValue(new Blob(["x"]));
  store.mockReset().mockImplementation(async () => ({ key: `cimg-${Math.random().toString(36).slice(2, 10)}`, url: "", width: 1080, height: 1620 }));
  clearSlideshowJob();
});
afterEach(() => vi.unstubAllGlobals());

const run = async (ask: SlideshowAsk = ASK) => {
  await startSlideshow(UID, ask);
  return slideshowJob()!;
};
const madeShow = (j: SlideshowJob) => loadSlideshows(UID).find((s) => s.id === j.showId)!;
const srcs = (j: SlideshowJob) => madeShow(j).slides.map((s) => s.photo?.src.split("/")[4] ?? null);

describe("start from", () => {
  it("opens on a topic with no source and on remix with one", () => {
    expect(startFrom(null)).toBe("topic");
    expect(startFrom(SOURCE)).toBe("remix");
    expect(startFrom({ ...SOURCE, format: "video" })).toBe("remix");
  });
});

describe("picking a picture per slide", () => {
  const ids = (list: (StockItem | null)[]) => list.map((x) => x?.id ?? null);
  it("takes Jev's pick, falls back to the first result, and never gives two slides one photo", () => {
    const shared = [photo("1"), photo("2"), photo("3")];
    const taken = new Set<string>();
    expect(ids(resolvePicks([shared, shared, shared], [1, 1, null], (p) => p.id, taken))).toEqual(["2", "1", "3"]);
    expect([...taken].sort()).toEqual(["1", "2", "3"]);
  });
  it("gives null for Jev's none on stock, and falls back on the brand's own media", () => {
    expect(ids(resolvePicks([[photo("1")]], [-1], (p) => p.id, new Set()))).toEqual([null]);
    expect(ids(resolvePicks([[photo("1")]], [-1], (p) => p.id, new Set(), true))).toEqual(["1"]);
    expect(ids(resolvePicks([[photo("1")]], [7], (p) => p.id, new Set()))).toEqual(["1"]);
    expect(ids(resolvePicks([[]], [null], (p: StockItem) => p.id, new Set()))).toEqual([null]);
  });
  it("offers Jev at most 6 results this brand hasn't used lately, each once", () => {
    const list = [photo("1"), photo("2"), photo("2"), photo("3"), ...["4", "5", "6", "7", "8"].map((i) => photo(i))];
    expect(freshPhotos(list, new Set(["1"])).map((p) => p.id)).toEqual(["2", "3", "4", "5", "6", "7"]);
  });
  it("keeps one entry per slideshow, newest first, the last 5", () => {
    let used = addUsed([], "a", ["1"]);
    for (const s of ["b", "c", "d", "e", "f"]) used = addUsed(used, s, [s]);
    expect(used.map((u) => u.show)).toEqual(["f", "e", "d", "c", "b"]);
    expect(addUsed(used, "d", ["9"]).map((u) => u.show)).toEqual(["d", "f", "e", "c", "b"]);
  });
});

describe("the slides' words fit the frame", () => {
  const inside = (size: "4x5" | "9x16", title: string, sub: string) => {
    const boxes = fitSlide({ title, sub }, true, size, measure);
    const lay = layoutBoxes({ id: "x", boxes }, size, measure);
    expect(lay.overflow, `${size} ${title}`).toBe(false);
    const H = frameHeight(size);
    for (const b of lay.boxes) {
      expect(b.rect.y).toBeGreaterThanOrEqual(0);
      expect(b.rect.y + b.rect.h).toBeLessThanOrEqual(H);
    }
    if (lay.boxes[1]) expect(lay.boxes[0].rect.y + lay.boxes[0].rect.h).toBeLessThanOrEqual(lay.boxes[1].rect.y);
    return boxes;
  };
  it("keeps every box inside the slide at 4:5 and 9:16, the sub under the title", () => {
    for (const size of ["4x5", "9x16"] as const) {
      inside(size, "3 signs your week went quiet", "You might not see it yet.");
      inside(size, "Done", "");
    }
  });
  it("steps a long title down instead of letting it run off the slide", () => {
    const long = Array(12).fill("accountability").join(" ");
    const sub = Array(25).fill("conversations").join(" ");
    const boxes = inside("4x5", long, sub);
    expect(boxes[0].size).toBeLessThan(72);
    expect(boxes[0]).toMatchObject({ font: "heavy", bg: "white" });
  });
});

describe("the made slideshow", () => {
  it("uses the brand colour where no picture was found, and carries the caption and source", () => {
    const show = buildShow({ slides: SLIDES, caption: "Cap. Save this.", ask: ASK, pictures: [{ photo: { src: "https://images.pexels.com/photos/1/p.jpeg", by: "Ann", byUrl: "" } }, null, { image: "cimg-abc1234" }], fill: "#1D4ED8", measure, now: new Date("2026-10-20T00:00:00Z") });
    expect(show.slides.map((s) => s.fill ?? null)).toEqual([null, "#1D4ED8", null]);
    expect(show.slides[2].image).toBe("cimg-abc1234");
    expect(show.caption).toBe("Cap. Save this.");
    expect(show.source).toEqual({ ...SOURCE, remixedAt: "2026-10-20T00:00:00.000Z" });
    expect(show.title).toBe("3 signs your week went quiet");
    expect(buildShow({ slides: SLIDES, caption: "", ask: { ...ASK, source: null, topic: "x" }, pictures: [], fill: "red", measure, now: new Date() }).slides[0].fill).toBeUndefined();
    // the device's last style carries over to a made slideshow (the slideshow accounts' look after one edit); the fit keeps the sizes
    const native = buildShow({ slides: SLIDES, caption: "", ask: ASK, pictures: [], measure, now: new Date(), look: { font: "clean", bg: "none", color: "#FFFFFF", size: 20 } });
    expect(native.slides.flatMap((x) => x.boxes).every((b) => b.font === "clean" && b.bg === "none" && b.color === "#FFFFFF")).toBe(true);
    expect(native.slides[0].boxes[0].size).toBe(buildShow({ slides: SLIDES, caption: "", ask: ASK, pictures: [], measure, now: new Date() }).slides[0].boxes[0].size);
    expect(buildShow({ slides: SLIDES, caption: "", ask: ASK, pictures: [], measure, now: new Date() }).slides[0].boxes[0]).toMatchObject({ font: "heavy", bg: "white", color: "#111111" });
  });
});

describe("the job", () => {
  const pages = { "empty office|1": [photo("10"), photo("11")], "phone on desk|1": [photo("20"), photo("21")], "calendar|1": [photo("30"), photo("31")] };

  it("walks writing, finding and drawing, then saves the slideshow with Jev's picks", async () => {
    answer(pages, [1, 0, 1]);
    const steps: string[] = [];
    const off = onSlideshowJob((j) => j && steps.push(stepText(j)));
    const j = await run();
    off();
    expect(j.state).toBe("done");
    expect(steps[0]).toBe("Writing the slides...");
    expect(steps).toContain("Finding pictures, 1 of 3...");
    expect(steps).toContain("Drawing the slides...");
    expect(srcs(j)).toEqual(["11", "20", "31"]);
    expect(madeShow(j).slides.every((s) => s.image?.startsWith("cimg-"))).toBe(true);
    // the photo question goes to Jev once, about photos
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn.mock.calls[0][1]).toMatchObject({ mode: "montage-pick", noun: "photo", beats: [{ say: SLIDES[0].title, candidates: [{ desc: "photo 10" }, { desc: "photo 11" }] }, expect.anything(), expect.anything()] });
    // the make's copy and claim flags stay on the saved slideshow
    expect(madeShow(j).flags).toEqual({ copied: [], claim: false, invented: false });
    // the make asked for a slideshow from the source's words
    expect(make.mock.calls[0][0]).toMatchObject({ mode: "make", as: "slideshow", source: { key: SOURCE.key, text: expect.stringContaining("") } });
  });

  it("keeps a saved slideshow's cover: no search for it, its old points sent as ones to leave out, the cover saved as slide 1", async () => {
    answer(pages, [0, 1]);
    const { saveSlideshow, blankSlideshow, makeBox } = await import("./slideshow");
    const cover = { id: "c1", fill: "#1E293B", boxes: [{ ...makeBox("5 viral theories that will ACTUALLY change your life"), id: "b1" }] };
    const old = { ...blankSlideshow(), id: "old", slides: [cover, { id: "o2", boxes: [{ ...makeBox("1. the let them theory."), id: "b2" }] }] };
    saveSlideshow(UID, old);
    const j = await run({ ...ASK, source: null, topic: "5 viral theories", keep: "old" });
    expect(j.state).toBe("done");
    // two searches for the two new slides, none for the cover
    expect(stock.search.mock.calls.map((c) => c[1])).toEqual(["phone on desk", "calendar"]);
    expect(make.mock.calls[0][0].note).toBe('Keep the hook as typed. Write new points, not these: "1. the let them theory.".');
    const made = madeShow(j);
    expect(made.slides[0]).toMatchObject({ fill: "#1E293B", boxes: cover.boxes });
    expect(made.slides[0].id).not.toBe("c1");
    expect(srcs(j)).toEqual([null, "20", "31"]);
    expect(made.title).toBe("5 viral theories that will ACTUALLY change your life");
  });

  it("takes the first portrait result when Jev has no answer", async () => {
    answer(pages, null);
    expect(srcs(await run())).toEqual(["10", "20", "30"]);
    expect(stock.search.mock.calls.every((c) => c[0] === "photo" && c[3] === "portrait")).toBe(true);
  });

  it("tries page 2 once when Jev says none, then takes the first free photo rather than a blank slide", async () => {
    local.setItem(`content-studio-carousel-brand-${UID}`, JSON.stringify({ color: "#1D4ED8", name: "MoneyBees", handle: "" }));
    answer({ ...pages, "phone on desk|2": [photo("22")] }, (n) => (n === 1 ? [0, -1, -1] : [null, 0, -1]));
    const j = await run();
    expect(srcs(j)).toEqual(["10", "22", "30"]);
    expect(stock.search).toHaveBeenCalledWith("photo", "calendar", 2, "portrait");
    expect(madeShow(j).slides[2].fill).toBeUndefined();
    expect(j.state).toBe("done");
  });

  it("never puts the same photo on two slides when their searches overlap", async () => {
    const same = [photo("1"), photo("2"), photo("3")];
    answer({ "empty office|1": same, "phone on desk|1": same, "calendar|1": same }, [0, 0, 0]);
    const got = srcs(await run());
    expect(new Set(got).size).toBe(3);
    expect(got).toEqual(["1", "2", "3"]);
  });

  it("skips the photos this brand used in its last 5 slideshows", async () => {
    answer(pages, [0, 0, 0]);
    const first = await run();
    expect(srcs(first)).toEqual(["10", "20", "30"]);
    expect(loadUsed(UID)[0]).toEqual({ show: first.showId, ids: ["10", "20", "30"] });
    const second = await run();
    expect(srcs(second)).toEqual(["11", "21", "31"]);
    // with both results used, page 2 is tried, then the slide goes without
    const third = await run();
    expect(srcs(third)).toEqual([null, null, null]);
    expect(loadUsed(UID).map((u) => u.show)).toEqual([second.showId, first.showId]);
  });

  it("draws from the brand's own media in media order when Jev has no answer", async () => {
    const media = ["cimg-aaaaaa1", "cimg-bbbbbb2"].map((key, i) => ({ key, name: `Pic ${i}`, folder: "", alt: "", width: 1, height: 1, addedAt: "" }));
    local.setItem(`cs-media-${UID}`, JSON.stringify(media));
    answer({}, null);
    const j = await run({ ...ASK, pictures: "mine" });
    expect(madeShow(j).slides.map((s) => s.image ?? null)).toEqual(["cimg-aaaaaa1", "cimg-bbbbbb2", null]);
    expect(stock.search).not.toHaveBeenCalled();
  });

  it("asks Jev, per slide, about the 6 media items from its place in media order (the /make/slideshow pin)", async () => {
    const media = Array.from({ length: 12 }, (_, i) => ({ key: `cimg-m${String(i).padStart(5, "0")}`, name: `Screen ${i}`, folder: "", alt: "", width: 1, height: 1, addedAt: "" }));
    local.setItem(`cs-media-${UID}`, JSON.stringify(media));
    answer({}, [0, 0, 0]);
    const j = await run({ ...ASK, pictures: "mine" });
    const beats = fn.mock.calls[0][1].beats as { candidates: { desc: string }[] }[];
    expect(beats.map((b) => b.candidates.map((c) => Number(c.desc.split(" ")[1])))).toEqual([[0, 1, 2, 3, 4, 5], [1, 2, 3, 4, 5, 6], [2, 3, 4, 5, 6, 7]]);
    expect(madeShow(j).slides.map((s) => s.image)).toEqual(["cimg-m00000", "cimg-m00001", "cimg-m00002"]);
  });

  it("a campaign's spread offers the screens its slideshows used least, from its start (live-p5dog D7)", async () => {
    const media = Array.from({ length: 12 }, (_, i) => ({ key: `cimg-m${String(i).padStart(5, "0")}`, name: `Screen ${i}`, folder: "", alt: "", width: 1, height: 1, addedAt: "" }));
    local.setItem(`cs-media-${UID}`, JSON.stringify(media));
    answer({}, [0, 0, 0]);
    // screens 0 to 5 were used once each, screen 6 twice
    const used = [0, 1, 2, 3, 4, 5, 6, 6].map((i) => media[i].key);
    const j = await startSlideshow(UID, { ...ASK, pictures: "mine" }, { used, start: 9 }).then(() => slideshowJob()!);
    const beats = fn.mock.calls[0][1].beats as { candidates: { desc: string }[] }[];
    // unused first from screen 9 round (9, 10, 11, 7, 8), then the used once, then screen 6
    expect(beats[0].candidates.map((c) => Number(c.desc.split(" ")[1]))).toEqual([9, 10, 11, 7, 8, 0]);
    expect(madeShow(j).slides.map((s) => s.image)).toEqual(["cimg-m00009", "cimg-m00010", "cimg-m00011"]);
  });

  it("spreads 12 screens evenly over a campaign's 12 slideshows even when Jev always takes the first", () => {
    const media = Array.from({ length: 12 }, (_, i) => ({ key: `m${i}` }));
    const used: string[] = [];
    for (let s = 0; s < 12; s++) {
      const picks = resolvePicks(mediaWindows(media, 6, { used, start: s * 2 + 1 }), [0, 0, 0, 0, 0, 0], (m) => m.key, new Set(), true);
      used.push(...picks.map((m) => m!.key));
    }
    const counts = media.map((m) => used.filter((k) => k === m.key).length);
    expect(Math.min(...counts)).toBe(6);
    expect(Math.max(...counts)).toBe(6);
  });

  it("ends in failed with the server's words, refused when the writer said no, and starts again", async () => {
    make.mockRejectedValueOnce(new EdgeError("You've used all 30 for today. It resets at 8am Singapore time.", 429, "daily_limit"));
    // capped, so no page offers a Try again that can only hit the cap again
    expect(await run()).toMatchObject({ state: "failed", capped: true, error: "You've used all 30 for today. It resets at 8am Singapore time." });
    make.mockRejectedValueOnce(new EdgeError("That remix didn't go through. Nothing was used.", 502, "failed"));
    const infra = await run();
    expect(infra).toMatchObject({ state: "failed", error: WRITE_FAILED });
    expect(infra.capped).toBeUndefined();
    make.mockRejectedValueOnce(new EdgeError("The slides didn't match the number in the hook. Nothing was used. Try again.", 422, "refused"));
    expect(await run()).toMatchObject({ state: "failed", refused: true, error: "The slides didn't match the number in the hook. Nothing was used. Try again." });
    answer(pages, [0, 0, 0]);
    expect((await run()).state).toBe("done");
  });

  it("a second press while the slides are being written makes no second write and saves one slideshow", async () => {
    answer(pages, [0, 0, 0]);
    const first = startSlideshow(UID, ASK);
    await startSlideshow(UID, { ...ASK, topic: "again", source: null });
    await first;
    expect(make).toHaveBeenCalledTimes(1);
    expect(slideshowJob()).toMatchObject({ state: "done", ask: ASK });
    expect(loadSlideshows(UID)).toHaveLength(1);
  });

  it("keeps a photo that won't save on this device by its Pexels link", async () => {
    answer(pages, [0, 0, 0]);
    store.mockRejectedValue(new Error("disk full"));
    const j = await run();
    expect(j.state).toBe("done");
    expect(madeShow(j).slides[0]).toMatchObject({ photo: { src: photo("10").src } });
    expect(madeShow(j).slides[0].image).toBeUndefined();
  });

  it("says the slides couldn't be finished, not written, when it breaks after the words came back", async () => {
    answer(pages, [0, 0, 0]);
    fn.mockImplementation(() => {
      throw new Error("boom");
    });
    expect(await run()).toMatchObject({ state: "failed", error: FINISH_FAILED });
  });

  it("sends a swipe carousel's own hook, format and why when this device has no breakdown of it", () => {
    const s = { ...SOURCE, teardown: { hook: "I brought two new advisers along to Awards Night", structure: "Carousel milestone story", why: "The underdog arc." } };
    expect(makeBody(UID, { ...ASK, source: s }).teardown).toEqual({ hookPattern: "I brought two new advisers along to Awards Night", beats: ["Format: Carousel milestone story", "Why it worked: The underdog arc."] });
    expect(makeBody(UID, ASK).teardown).toBeUndefined();
  });

  it("sends a phase 3 shape with its own options, which the server takes, and today's body with none", () => {
    const topic = { ...ASK, source: null, topic: "Why I log every client call" };
    const formulas = ["contrarian", "mistake", "blunt"].map((id) => ({ id, name: id, template: `The ${id} shape`, example: "An example", trap: "A trap" }));
    const hooks = makeBody(UID, topic, "hooks", { formulas, demo: { name: "screen.mp4", seconds: 20 } });
    expect(hooks).toMatchObject({ mode: "make", as: "hooks", topic: "Why I log every client call", formulas, demo: { name: "screen.mp4", seconds: 20 } });
    expect(parseMakeRequest(JSON.parse(JSON.stringify(hooks)))).toMatchObject({ ok: true, value: { as: "hooks", formulas, demo: { name: "screen.mp4", seconds: 20 } } });
    for (const [as, more] of [
      ["speaking", { seconds: 15 }],
      ["wall", { scene: "kitchen", maxWords: 30 }],
      ["notes", {}],
      ["image", { layout: "quote", shows: "A big quote on a blue card" }],
      ["meme", { layout: "pov" }],
    ] as const) {
      const body = makeBody(UID, topic, as, more);
      expect(body, as).toMatchObject({ as, ...more });
      expect(parseMakeRequest(JSON.parse(JSON.stringify(body))), as).toMatchObject({ ok: true, value: { as, ...more } });
    }
    expect(makeBody(UID, ASK, "slideshow", {})).toEqual(makeBody(UID, ASK));
    expect(Object.keys(makeBody(UID, ASK))).not.toContain("seconds");
  });

  it("writes from a topic with no source", async () => {
    answer(pages, [0, 0, 0]);
    const j = await run({ ...ASK, source: null, topic: "  5 things to check before you buy a hospital plan " });
    expect(make.mock.calls[0][0].topic).toBe("5 things to check before you buy a hospital plan");
    expect(make.mock.calls[0][0].source).toBeUndefined();
    expect(madeShow(j).source).toBeUndefined();
  });
});

describe("links and params", () => {
  it("builds /make/<slug> with the shared params, defaults left out", () => {
    expect(links.makeFormat("slideshow")).toBe("/make/slideshow");
    expect(links.makeFormat("slideshow", { source: "top:a-b", mention: undefined })).toBe("/make/slideshow?source=top%3Aa-b");
    expect(links.makeFormat("slideshow", askParams({ ...ASK, mention: false, size: "9x16", pictures: "mine" }))).toBe(`/make/slideshow?source=${encodeURIComponent(SOURCE.key)}&mention=no&size=9x16&pictures=mine`);
    expect(links.makeFormat("slideshow", askParams({ ...ASK, source: null }))).toBe("/make/slideshow?from=topic");
  });

  it("keeps Once, inside in the link and sends it only with mention on, only for a slideshow", () => {
    expect(askParams({ ...ASK, inside: true }).mention).toBe("inside");
    expect(askParams({ ...ASK, mention: false, inside: true }).mention).toBe("no");
    expect(makeBody(UID, { ...ASK, inside: true }).brandAt).toBe("inside");
    expect(makeBody(UID, { ...ASK, mention: false, inside: true }).brandAt).toBeUndefined();
    expect(makeBody(UID, { ...ASK, inside: true }, "wall").brandAt).toBeUndefined();
    expect(makeBody(UID, ASK).brandAt).toBeUndefined();
  });
});

describe("keep the cover", () => {
  const box = (text: string) => ({ id: `b-${text.length}`, text, x: 0.5, y: 0.3, w: 0.84, font: "clean" as const, size: 60, color: "#FFFFFF", stroke: 0, strokeColor: "#FFFFFF", bg: "none" as const });
  const kept = {
    slides: [
      { id: "c1", photo: { src: "https://images.pexels.com/photos/9/p.jpeg", by: "A", byUrl: "" }, boxes: [box("5 viral theories that will ACTUALLY change your life"), box("(from an extreme trend skeptic)")] },
      { id: "s2", boxes: [box("1. the let them theory.")] },
      { id: "s3", boxes: [box("2. the two-minute rule.")] },
    ],
  };

  it("reads the cover's words in order as the hook", () => {
    expect(coverWords(kept)).toBe("5 viral theories that will ACTUALLY change your life (from an extreme trend skeptic)");
    expect(coverWords({ slides: [] })).toBe("");
  });

  it("asks for new points, not the old ones, after the steer, and never runs past the server's limit", () => {
    expect(keptNote("lowercase.", kept)).toBe('lowercase. Keep the hook as typed. Write new points, not these: "1. the let them theory."; "2. the two-minute rule.".');
    expect(keptNote("", kept)).toBe('Keep the hook as typed. Write new points, not these: "1. the let them theory."; "2. the two-minute rule.".');
    const long = "x".repeat(280);
    expect(keptNote(long, kept)).toBe(long);
    const many = { slides: [kept.slides[0], ...Array.from({ length: 9 }, (_, i) => ({ id: `s${i}`, boxes: [box(`${i + 1}. ${"word ".repeat(11)}`)] }))] };
    expect(keptNote("short steer.", many).length).toBeLessThanOrEqual(NOTE_MAX);
  });

  it("puts the kept cover in as slide 1, as it was, and names the slideshow after it", () => {
    const show = buildShow({ slides: SLIDES, caption: "Cap.", ask: { ...ASK, keep: "old" }, pictures: [null, null, null], measure, now: new Date(), cover: kept.slides[0] });
    const { id, ...first } = show.slides[0];
    expect(id).not.toBe("c1");
    expect(first).toEqual({ photo: kept.slides[0].photo, boxes: kept.slides[0].boxes });
    expect(show.title).toBe("5 viral theories that will ACTUALLY change your life");
    expect(show.slides).toHaveLength(SLIDES.length);
    expect(askParams({ ...ASK, keep: "old" }).keep).toBe("old");
  });
});
