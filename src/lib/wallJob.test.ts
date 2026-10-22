import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabase: { functions: { invoke: vi.fn() } }, SUPABASE_URL: "", SUPABASE_ANON_KEY: "" }));
const make = vi.hoisted(() => vi.fn());
vi.mock("@/lib/remix", async (orig) => ({ ...(await orig<typeof import("./remix")>()), requestMake: make }));
const fn = vi.hoisted(() => vi.fn());
vi.mock("@/lib/edgeFn", async (orig) => ({ ...(await orig<typeof import("./edgeFn")>()), callFn: fn }));
const stock = vi.hoisted(() => ({ search: vi.fn(), download: vi.fn() }));
vi.mock("@/lib/stockMedia", () => ({ searchStock: stock.search, downloadStock: stock.download }));
const length = vi.hoisted(() => vi.fn());
vi.mock("@/lib/longAudio", async (orig) => ({ ...(await orig<typeof import("./longAudio")>()), mediaLength: length }));
const join = vi.hoisted(() => ({ start: vi.fn(), current: vi.fn(), hand: vi.fn() }));
vi.mock("@/lib/videoMedia", async (orig) => ({
  ...(await orig<typeof import("./videoMedia")>()),
  ensureCaptionFonts: async () => {},
  startJoin: join.start,
  currentJoin: join.current,
  handToEditor: join.hand,
}));
// a canvas-free measure: each character half as wide as the font is tall
const measure = (text: string, css: string) => text.length * Number(/([\d.]+)px/.exec(css)?.[1] ?? 40) * 0.55;
vi.mock("@/lib/slideshowDraw", async (orig) => ({ ...(await orig<typeof import("./slideshowDraw")>()), screenMeasure: () => measure }));

import { aiJob, pendingAvatar } from "./aiVideo";
import { EdgeError } from "./edgeFn";
import { formatJobs, onFormatJob, type FormatJob } from "./formatJob";
import { links } from "./links";
import { VIDEO_LIMITS } from "./remix";
import type { MakeResponse } from "./remix";
import type { RemixSource } from "./remixSource";
import type { StockItem } from "./stockMedia";
import { BLOCK_W, wrapBlock, type Overlay } from "./videoEdit";
import {
  FINISH_FAILED,
  NO_CLIP,
  OPEN_FAILED,
  SCENE_NAME,
  SCENE_TOAST,
  WALL_TOAST,
  WRITE_FAILED,
  clearWallJob,
  finishAgain,
  loopTakes,
  noteOf,
  onWallJob,
  pendingScene,
  resumeScene,
  sceneExtra,
  simpleQuery,
  startWall,
  stepText,
  wallJob,
  wallParams,
  wallSeconds,
  wallSize,
  type WallAsk,
  type WallJob,
} from "./wallJob";

const UID = "6d80f027-3395-480c-86a1-8827d3d6cce3";
const SOURCE: RemixSource = {
  key: "trend:trend-2026-10-20-the-one-small-money-habit",
  kind: "trend",
  format: "video",
  platform: "tiktok",
  author: "@moneygirl",
  url: "https://www.tiktok.com/@moneygirl/video/7300000000000000000",
  title: "The one small money habit that quietly changes everything",
  caption: "POV: you finally check where your money went \u{1F631}",
  remixedAt: "",
};
const ASK: WallAsk = { source: SOURCE, about: "", mention: true, bg: "stock" };
const TEXT = "POV: it's month end and you finally open your notes \u{1F631}\nevery call and follow-up is there, so tomorrow is easy";
const response = (text = TEXT): MakeResponse => ({
  as: "wall",
  result: { as: "wall", text, scene: "A woman at a desk at night with a cup of tea", search: "desk night tea", caption: "Busy weeks hide the work.\n\nFollow for more." },
  flags: { copied: [], claim: false, invented: false },
  usage: { used: 1, limit: 30 },
});
const clip = (id: string, duration = 4): StockItem => ({ id, w: 720, h: 1280, alt: "", thumb: "", src: `https://videos.pexels.com/video-files/${id}/v.mp4`, by: "Ann", byUrl: "https://www.pexels.com/@ann", url: `https://www.pexels.com/video/woman-at-a-desk-${id}-${id.charCodeAt(0)}/`, duration });

/** Pexels answers per query; montage-pick answers with `picks` (null: the call fails, as at its cap). */
function answer(found: Record<string, StockItem[]>, picks: ((n: number) => number | null) | null = () => 0) {
  let calls = 0;
  stock.search.mockImplementation(async (_kind: string, q: string) => ({ items: found[q] ?? [], more: false }));
  fn.mockImplementation(async (name: string) => {
    if (name !== "video-assist") throw new Error(name);
    calls++;
    const p = picks?.(calls);
    if (p === undefined || p === null) throw new EdgeError("No picks left today.", 429, "daily_limit");
    return { picks: [p] };
  });
}

/** Runs until the job settles, the join slot sleeps included. */
async function run(ask: WallAsk = ASK) {
  const done = startWall(UID, ask);
  await vi.runAllTimersAsync();
  await done;
  return wallJob()!;
}

beforeEach(() => {
  vi.useFakeTimers();
  make.mockReset().mockResolvedValue(response());
  fn.mockReset();
  stock.search.mockReset();
  stock.download.mockReset().mockImplementation(async (src: string) => new Blob([src]));
  length.mockReset().mockResolvedValue(4);
  join.start.mockReset().mockResolvedValue(undefined);
  join.current.mockReset().mockReturnValue(null);
  join.hand.mockReset().mockResolvedValue(undefined);
  clearWallJob();
});
afterEach(() => vi.useRealTimers());

describe("the wall's length, loops and size", () => {
  it("runs the words' reading time, 6 to 15 s", () => {
    const words = (n: number) => Array.from({ length: n }, () => "word").join(" ");
    expect(wallSeconds(words(9))).toBe(6);
    expect(wallSeconds(words(30))).toBe(9);
    expect(wallSeconds(words(60))).toBe(15);
    expect(wallSeconds(words(80))).toBe(15);
  });

  it("loops a short clip into takes that add up to the length, the last one cut", () => {
    const f = new Blob(["v"]);
    const takes = loopTakes(f, 4, 11);
    expect(takes.map((t) => [t.start, t.end])).toEqual([[0, 4], [0, 4], [0, 3]]);
    expect(takes.every((t) => t.file === f)).toBe(true);
    expect(loopTakes(f, 20, 9)).toEqual([{ file: f, start: 0, end: 9 }]);
    expect(loopTakes(f, NaN, 9)).toEqual([{ file: f, start: 0, end: 9 }]);
    expect(loopTakes(f, 2.5, 6).map((t) => t.end)).toEqual([2.5, 2.5, 1]);
  });

  it("steps the block down from 1 until its lines fit 45% of a 9:16 frame", () => {
    expect(wallSize("short words", measure)).toBe(1);
    const sixty = Array.from({ length: 60 }, (_, i) => `longerword${i}`).join(" ");
    const size = wallSize(sixty, measure);
    expect(size).toBeLessThan(1);
    const px = 52 * size;
    const lines = wrapBlock(sixty, BLOCK_W * 1080, px, (t) => measure(t, `${px.toFixed(2)}px`));
    expect(lines.length * px * 1.3).toBeLessThanOrEqual(0.45 * 1920);
    // one size up would not have fit
    const up = 52 * (size + 0.1);
    expect(wrapBlock(sixty, BLOCK_W * 1080, up, (t) => measure(t, `${up.toFixed(2)}px`)).length * up * 1.3).toBeGreaterThan(0.45 * 1920);
  });
});

describe("the wall job", () => {
  it("writes, finds Jev's clip for the scene, and joins it muted with the words as one block over the whole video", async () => {
    answer({ "desk night tea": [clip("a", 4), clip("b", 9)] }, () => 1);
    const j = await run();
    expect(j.state).toBe("done");
    // the make is the wall's, on the source's words
    expect(make.mock.calls[0][0]).toMatchObject({ mode: "make", as: "wall", source: { key: SOURCE.key } });
    // Jev is asked one beat: the writer's scene, the candidates by page name
    const ask = fn.mock.calls[0][1];
    expect(ask.mode).toBe("montage-pick");
    expect(ask.beats).toHaveLength(1);
    expect(ask.beats[0].say).toBe("A woman at a desk at night with a cup of tea");
    expect(ask.beats[0].candidates).toEqual([{ desc: "woman at a desk a" }, { desc: "woman at a desk b" }]);
    expect(stock.download).toHaveBeenCalledWith(clip("b").src);
    const [name, takes, label, opts] = join.start.mock.calls[0];
    expect(name).toBe("Wall of text");
    expect(label).toBe("Putting your wall of text together");
    expect(opts.mute).toBe(true);
    // the 4 s download loops to the 6 s the 21 words take to read
    expect(takes.map((t: { end: number }) => t.end)).toEqual([4, 2]);
    const s = opts.extra.settings;
    expect(s).toMatchObject({ wall: true, captions: false, volume: 0, aspect: "9:16" });
    expect(s.overlays).toHaveLength(1);
    const block: Overlay = s.overlays[0];
    expect(block).toMatchObject({ kind: "block", text: TEXT, from: 0, to: 6, font: "clean", box: "none", color: "#FFFFFF" });
    expect(opts.extra.toast).toBe(WALL_TOAST);
    expect(opts.extra.caption).toBe("Busy weeks hide the work.\n\nFollow for more.");
    expect(opts.extra.note).toBe(`Remixed from @moneygirl, ${SOURCE.url}`);
    expect(opts.extra.source).toMatchObject({ key: SOURCE.key });
    expect(opts.extra.source.remixedAt).not.toBe("");
    expect(j.extra).toBe(opts.extra);
  });

  it("never touches the source's own video: only Pexels clips are searched and downloaded", async () => {
    answer({ "desk night tea": [clip("a")] });
    await run();
    for (const [src] of stock.download.mock.calls) expect(src).not.toBe(SOURCE.url);
    expect(stock.download.mock.calls.every(([src]) => String(src).startsWith("https://videos.pexels.com/"))).toBe(true);
    expect(JSON.stringify(join.start.mock.calls[0][1])).not.toContain("tiktok.com");
  });

  it("takes the first clip that loops when Jev has no answer", async () => {
    answer({ "desk night tea": [clip("short", 1), clip("a"), clip("b")] }, null);
    await run();
    expect(stock.download).toHaveBeenCalledWith(clip("a").src);
    // a 1 s clip is never a candidate
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("searches once more with the title when Jev says none, and says no clip fits when it says none again", async () => {
    answer({ "desk night tea": [clip("a")], "the one small money": [clip("c")] }, (n) => (n === 1 ? -1 : 0));
    await run();
    expect(stock.search.mock.calls.map((c) => c[1])).toEqual(["desk night tea", "the one small money"]);
    expect(stock.download).toHaveBeenCalledWith(clip("c").src);

    clearWallJob();
    answer({ "desk night tea": [clip("a")], "the one small money": [clip("c")] }, () => -1);
    const j = await run();
    expect(j).toMatchObject({ state: "failed", error: NO_CLIP, noClip: true });
    expect(j.written?.text).toBe(TEXT);
    expect(join.start).toHaveBeenCalledTimes(1);
  });

  it("uses the typed topic for the second search when there is no source", async () => {
    answer({ "desk night tea": [], "why busy weeks feel": [clip("t")] });
    await run({ ...ASK, source: null, about: "Why busy weeks feel empty" });
    expect(make.mock.calls[0][0]).toMatchObject({ as: "wall", topic: "Why busy weeks feel empty" });
    expect(make.mock.calls[0][0].source).toBeUndefined();
    expect(stock.download).toHaveBeenCalledWith(clip("t").src);
    expect(join.start.mock.calls[0][3].extra.note).toBeUndefined();
    expect(simpleQuery("POV: waking up & seeing a $6847 payment")).toBe("pov waking up seeing");
  });

  it("finishes with the adviser's own video after no clip fit, with the same words and no second write", async () => {
    answer({}, () => -1);
    expect((await run()).noClip).toBe(true);
    const file = new File(["mine"], "phone.mov", { type: "video/quicktime" });
    length.mockResolvedValue(42);
    finishAgain({ bg: "mine", file });
    await vi.runAllTimersAsync();
    expect(make).toHaveBeenCalledTimes(1);
    const [handed, extra] = join.hand.mock.calls[0];
    expect(handed).toBe(file);
    // the first 15 s of a 42 s phone clip
    expect(extra.settings.trimEnd).toBe(27);
    expect(extra.settings.overlays[0].text).toBe(TEXT);
    expect(wallJob()).toMatchObject({ state: "done", ask: { bg: "mine" } });
  });

  it("hands a short phone clip over whole, and refuses a file that won't open", async () => {
    const file = new File(["mine"], "phone.mp4", { type: "video/mp4" });
    length.mockResolvedValue(10);
    await run({ ...ASK, bg: "mine", file });
    expect(join.hand.mock.calls[0][1].settings.trimEnd).toBe(0);
    expect(join.start).not.toHaveBeenCalled();
    expect(stock.search).not.toHaveBeenCalled();

    clearWallJob();
    length.mockResolvedValue(NaN);
    const j = await run({ ...ASK, bg: "mine", file });
    expect(j).toMatchObject({ state: "failed", error: OPEN_FAILED });
    expect(j.written).toBeDefined();
  });

  it("waits while another video waits for the editor before it joins", async () => {
    answer({ "desk night tea": [clip("a")] });
    let waiting = 3;
    join.current.mockImplementation(() => (waiting-- > 0 ? { state: "done", progress: 1 } : null));
    const done = startWall(UID, ASK);
    await vi.advanceTimersByTimeAsync(1500);
    expect(join.start).not.toHaveBeenCalled();
    expect(wallJob()?.state).toBe("joining");
    await vi.runAllTimersAsync();
    await done;
    expect(join.start).toHaveBeenCalledTimes(1);
  });

  it("says why it failed: the writer, a refusal in the server's words, the cap, a dropped download, the join", async () => {
    make.mockRejectedValueOnce(new Error("network"));
    expect(await run()).toMatchObject({ state: "failed", error: WRITE_FAILED });
    expect(join.start).not.toHaveBeenCalled();

    make.mockRejectedValueOnce(new EdgeError("That post can't be turned into something safe to post. Pick another one.", 422, "refused"));
    expect(await run()).toMatchObject({ state: "failed", refused: true, error: "That post can't be turned into something safe to post. Pick another one." });

    make.mockRejectedValueOnce(new EdgeError("You've used all 30 remixes for today.", 429, "daily_limit"));
    expect((await run()).error).toBe("You've used all 30 remixes for today.");

    answer({ "desk night tea": [clip("a")] });
    stock.download.mockRejectedValueOnce(new Error("Couldn't download it. Check your connection and try again."));
    const dropped = await run();
    expect(dropped).toMatchObject({ state: "failed", error: "Couldn't download it. Check your connection and try again." });
    expect(dropped.written).toBeDefined();

    join.current.mockImplementation(() => (join.start.mock.calls.length ? { state: "failed", progress: 0, error: "This browser can't record video." } : null));
    expect(await run()).toMatchObject({ state: "failed", error: "This browser can't record video." });
    join.current.mockImplementation(() => (join.start.mock.calls.length > 1 ? { state: "failed", progress: 0 } : null));
    expect((await run()).error).toBe(FINISH_FAILED);
  });

  it("runs one at a time and tells its listeners each step", async () => {
    answer({ "desk night tea": [clip("a")] });
    const seen: WallJob["state"][] = [];
    const off = onWallJob((j) => j && seen.push(j.state));
    const first = startWall(UID, ASK);
    await startWall(UID, { ...ASK, about: "again" });
    await vi.runAllTimersAsync();
    await first;
    off();
    expect(make).toHaveBeenCalledTimes(1);
    expect([...new Set(seen)]).toEqual(["writing", "finding", "joining", "done"]);
  });
});

// pinned before WallAsk.draftId (plan-review-queue): a wall started without one hands the editor exactly today's extra
describe("the editor's extra without a draftId", () => {
  it("joins a stock clip with today's keys, from a source and from a topic", async () => {
    answer({ "desk night tea": [clip("a")] });
    await run();
    expect(Object.keys(join.start.mock.calls[0][3].extra).sort()).toEqual(["caption", "note", "settings", "source", "toast"]);
    clearWallJob();
    await run({ ...ASK, source: null, about: "Why busy weeks feel empty" });
    expect(Object.keys(join.start.mock.calls[1][3].extra).sort()).toEqual(["caption", "note", "settings", "toast"]);
  });

  it("hands the adviser's own clip over with today's keys", async () => {
    length.mockResolvedValue(10);
    await run({ ...ASK, bg: "mine", file: new File(["mine"], "phone.mp4", { type: "video/mp4" }) });
    expect(Object.keys(join.hand.mock.calls[0][1]).sort()).toEqual(["caption", "note", "settings", "source", "toast"]);
  });
});

describe("the page's words and links", () => {
  it("names each step", () => {
    expect(stepText({ state: "writing" })).toBe("Writing the text...");
    expect(stepText({ state: "finding" })).toBe("Finding a clip...");
    expect(stepText({ state: "joining" })).toBe("Putting it together...");
  });

  it("says where the words came from, and any copy-check warning", () => {
    expect(noteOf(SOURCE)).toBe(`Remixed from @moneygirl, ${SOURCE.url}`);
    expect(noteOf({ ...SOURCE, url: undefined })).toBe("Remixed from @moneygirl");
    expect(noteOf(null)).toBeUndefined();
    expect(noteOf(SOURCE, { copied: ["you finally check where your money went"], claim: true, invented: false })).toBe(
      `Remixed from @moneygirl, ${SOURCE.url}. These words repeat the original: "you finally check where your money went". Change them before you post. Uses a figure or claim from the original. Check it or take it out.`,
    );
  });

  it("reopens what ran, defaults left out", () => {
    expect(links.makeFormat("wall-of-text", wallParams(ASK))).toBe(`/make/wall-of-text?source=${encodeURIComponent(SOURCE.key)}`);
    expect(links.makeFormat("wall-of-text", wallParams({ source: null, mention: false, bg: "mine" }))).toBe("/make/wall-of-text?from=topic&mention=no&bg=mine");
  });
});

describe("words over a made scene", () => {
  const SCENE: WallAsk = { ...ASK, scene: { id: "walk", quality: "720p", person: "A Tamil man in his 50s in a batik shirt" } };
  const WORDS = "POV: you finally write down every client call this week and the follow-ups stop slipping, because tomorrow already knows who to call first and why";
  const sceneResponse = (): MakeResponse => ({ ...response(WORDS), result: { ...response(WORDS).result, text: WORDS } as MakeResponse["result"] });
  type Body = { mode: string; template?: string };
  /** ai-video: the start hands back one job; each status check answers with `status` (default: done). */
  const higgsfield = (status: () => unknown = () => ({ jobs: [{ state: "done", url: "https://cdn.example/scene.mp4" }] })) =>
    fn.mockImplementation(async (name: string, body: Body) => {
      if (name !== "ai-video") throw new Error(name);
      return body.mode === "template" ? { tokens: ["t1"], refund: "ticket" } : status();
    });
  const store = new Map<string, string>();
  const calls = (mode: string) => fn.mock.calls.filter(([n, b]) => n === "ai-video" && (b as Body).mode === mode);
  const runScene = async (ask: WallAsk = SCENE) => {
    const done = startWall(UID, ask);
    await vi.runAllTimersAsync();
    await done;
    await vi.runAllTimersAsync();
    return wallJob("scene")!;
  };

  beforeEach(() => {
    store.clear();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, blob: async () => new Blob(["scene"]) })));
    make.mockReset().mockResolvedValue(sceneResponse());
    higgsfield();
    clearWallJob("scene");
  });
  afterEach(() => vi.unstubAllGlobals());

  it("writes the words first, then orders the scene, then joins it with the words over the whole clip and its sound on", async () => {
    const j = await runScene();
    expect(j.state).toBe("done");
    // the write asks for the scene and the 30-word ceiling
    expect(make.mock.calls[0][0]).toMatchObject({ mode: "make", as: "wall", scene: "walk", maxWords: 30, source: { key: SOURCE.key } });
    const [start] = calls("template");
    expect(start[1]).toEqual({ mode: "template", template: "scene-walk", seconds: 8, quality: "720p", fields: { person: "A Tamil man in his 50s in a batik shirt" }, photos: [] });
    // write, then clip, then join
    const order = [make.mock.invocationCallOrder[0], fn.mock.invocationCallOrder[fn.mock.calls.indexOf(start)], join.start.mock.invocationCallOrder[0]];
    expect(order).toEqual([...order].sort((a, b) => a - b));
    const [name, takes, , opts] = join.start.mock.calls[0];
    expect(name).toBe(SCENE_NAME);
    expect(takes).toHaveLength(1);
    expect(takes[0].end).toBe(8);
    // a stock wall is muted; a made scene keeps its room or street sound
    expect(opts.mute).toBeUndefined();
    expect(opts.extra.settings).toMatchObject({ wall: true, captions: false, volume: 1, aspect: "9:16" });
    expect(opts.extra.settings.overlays).toHaveLength(1);
    expect(opts.extra.settings.overlays[0]).toMatchObject({ kind: "block", text: WORDS, from: 0, to: 8 });
    expect(opts.extra).toMatchObject({ toast: SCENE_TOAST, tab: "stickers", caption: "Busy weeks hide the work.\n\nFollow for more.", source: { key: SOURCE.key } });
    // the paid clip is put together, so nothing waits on the device; the wall's own run is untouched
    expect(pendingAvatar()).toBeNull();
    expect(wallJob()).toBeNull();
    expect(stock.search).not.toHaveBeenCalled();
  });

  it("orders no clip when the writer refuses, and none when the words come back unusable", async () => {
    make.mockRejectedValueOnce(new EdgeError("That post can't be turned into something safe to post. Pick another one.", 422, "refused"));
    expect(await runScene()).toMatchObject({ state: "failed", refused: true, error: "That post can't be turned into something safe to post. Pick another one." });
    make.mockRejectedValueOnce(new Error("network"));
    expect(await runScene()).toMatchObject({ state: "failed", error: WRITE_FAILED });
    expect(calls("template")).toHaveLength(0);
    expect(join.start).not.toHaveBeenCalled();
  });

  it("spends nothing while a paid clip waits on this device: it never writes over it", async () => {
    store.set("cs-ai-video-pending", JSON.stringify({ name: "Laksa", tokens: ["old"], seconds: [4], kind: "template" }));
    expect(await runScene()).toMatchObject({ state: "failed", error: VIDEO_LIMITS.waiting });
    expect(make).not.toHaveBeenCalled();
    expect(calls("template")).toHaveLength(0);
    expect(pendingAvatar()?.tokens).toEqual(["old"]);
  });

  it("keeps the paid clip when it won't download, then a reload picks it up at no cost with the words still on it", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false })));
    const failed = await runScene();
    expect(failed).toMatchObject({ state: "failed", error: "It was made but didn't download. Try again." });
    expect(pendingScene()).toBe(true);
    expect(pendingAvatar()?.extra?.settings?.overlays?.[0].text).toBe(WORDS);
    expect(join.start).not.toHaveBeenCalled();

    // a reload: this tab's memory is gone, the pending clip and its extra are not
    clearWallJob("scene");
    make.mockClear();
    fn.mockClear();
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, blob: async () => new Blob(["scene"]) })));
    resumeScene({ ...SCENE, source: null });
    expect(wallJob("scene")?.state).toBe("clip");
    await vi.runAllTimersAsync();
    expect(wallJob("scene")).toMatchObject({ state: "done", written: { text: WORDS } });
    expect(make).not.toHaveBeenCalled();
    expect(calls("template")).toHaveLength(0);
    expect(calls("status").length).toBeGreaterThan(0);
    const opts = join.start.mock.calls[0][3];
    expect(opts.extra.settings.overlays[0].text).toBe(WORDS);
    expect(opts.extra.settings.volume).toBe(1);
    expect(pendingAvatar()).toBeNull();
  });

  it("says Higgsfield's failure in its words and drops the clip, so Try again orders a new one for the same words", async () => {
    higgsfield(() => ({ jobs: [{ state: "failed", error: "The safety filter blocked it. Try another photo or wording." }] }));
    const j = await runScene();
    expect(j).toMatchObject({ state: "failed", error: "The safety filter blocked it. Try another photo or wording.", written: { text: WORDS } });
    expect(pendingScene()).toBe(false);
    higgsfield();
    finishAgain({}, "scene");
    await vi.runAllTimersAsync();
    expect(wallJob("scene")?.state).toBe("done");
    expect(make).toHaveBeenCalledTimes(1);
    expect(calls("template")).toHaveLength(2);
    expect(aiJob()?.state).toBe("done");
  });

  it("shows each step in the library's Making now, linked back to its page, and clears it once made", async () => {
    const seen: FormatJob[][] = [];
    const off = onFormatJob((l) => seen.push(l));
    await runScene();
    off();
    const steps = [...new Set(seen.flatMap((l) => l.map((j) => j.step)))];
    expect(steps[0]).toBe("Writing the text");
    expect(steps).toContain("Making your video, 0 of 1 part ready. This takes a few minutes.");
    expect(seen.flat()[0]).toMatchObject({ slug: "text-over-clip", label: "Words over a made scene", format: "video", href: `/make/text-over-clip?source=${encodeURIComponent(SOURCE.key)}&scene=walk&quality=720p` });
    // once put together, the editor has it: its link is the editor's, then the row goes
    expect(seen.flat().find((j) => j.step === "Putting your video together")?.href).toBe("/edit");
    expect(formatJobs()).toEqual([]);
  });

  it("puts the words in the editor's block, sized to fit, with the copy check's warnings in the note", () => {
    const extra = sceneExtra({ ...SCENE, source: null }, { text: WORDS, caption: "c", flags: { copied: [], claim: true, invented: false } });
    expect(extra.settings?.overlays?.[0]).toMatchObject({ text: WORDS, to: 8, font: "clean", box: "none" });
    expect(extra.note).toBe("Uses a figure or claim from the original. Check it or take it out.");
    expect(extra.source).toBeUndefined();
    expect(stepText({ state: "clip", step: "Downloading your video..." })).toBe("Downloading your video...");
    expect(links.makeFormat("text-over-clip", wallParams({ source: null, mention: true, bg: "stock", scene: { id: "kitchen", quality: "480p", person: "" } }))).toBe("/make/text-over-clip?from=topic");
  });
});
