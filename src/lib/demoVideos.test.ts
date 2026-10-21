import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabase: { functions: { invoke: vi.fn() } }, SUPABASE_URL: "", SUPABASE_ANON_KEY: "" }));
const fn = vi.hoisted(() => vi.fn());
vi.mock("@/lib/edgeFn", async (orig) => ({ ...(await orig<typeof import("./edgeFn")>()), callFn: fn }));
const files = vi.hoisted(() => new Map<string, Blob>());
vi.mock("@/lib/deviceFiles", () => ({
  putFile: vi.fn(async (k: string, b: Blob) => void files.set(k, b)),
  getFile: vi.fn(async (k: string) => files.get(k)),
  deleteFile: vi.fn(async (k: string) => void files.delete(k)),
}));
const video = vi.hoisted(() => ({ meta: { duration: 24, videoWidth: 1280, videoHeight: 720 }, stills: vi.fn() }));
vi.mock("@/lib/videoMedia", () => ({
  loadVideo: vi.fn(async () => ({ ...video.meta, src: "blob:x" })),
  stills: video.stills,
}));

import { EdgeError } from "./edgeFn";
import {
  CANT_OPEN, DEMOS_FULL, MAX_DEMOS, READ_FAILED, READ_USED_UP, TOO_SHORT, WRONG_TYPE, demoFile, demoFileLine, demoLengthLine, demoState, demoVideos,
  firstWindow, readDemo, removeDemo, restoreDemo, saveDemo, stillPoints, tooBig, tooLong, uploadDemo,
} from "./demoVideos";
import { addMedia, cleanDemo, loadMedia } from "./mediaLibrary";
import { MAX_VIDEO_BYTES, fileLine } from "./mediaUpload";

const UID = "u1";
const store = new Map<string, string>();
const MB = 1_000_000;
const mov = (name: string, size = 5 * MB, type = "video/quicktime") => {
  const f = new Blob(["x"], { type });
  Object.defineProperties(f, { name: { value: name }, size: { value: size } });
  return f as File;
};
const flush = () => new Promise((r) => setTimeout(r, 0));
const STILL = "data:image/jpeg;base64,AAAA";

beforeEach(() => {
  store.clear();
  files.clear();
  const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
  vi.stubGlobal("window", { localStorage: storage });
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("fetch", vi.fn(async () => ({ blob: async () => new Blob(["thumb"]) })));
  vi.stubGlobal("URL", { ...URL, revokeObjectURL: () => undefined });
  video.meta = { duration: 24, videoWidth: 1280, videoHeight: 720 };
  video.stills.mockReset().mockImplementation(async (_f: Blob, at: number[]) => at.map(() => STILL));
  fn.mockReset().mockResolvedValue({ shows: "A monthly budget spreadsheet being filled in", flags: [] });
});
afterEach(() => vi.unstubAllGlobals());

describe("the window", () => {
  it("clamps a negative start, an end past the length, and windows over 30 or under 3 seconds", () => {
    expect(cleanDemo({ start: -4, end: 12, shows: "" }, 60)).toMatchObject({ start: 0, end: 12 });
    expect(cleanDemo({ start: 50, end: 90, shows: "" }, 60)).toMatchObject({ start: 50, end: 60 });
    expect(cleanDemo({ start: 10, end: 55, shows: "" }, 120)).toMatchObject({ start: 10, end: 40 });
    expect(cleanDemo({ start: 10, end: 11, shows: "" }, 120)).toMatchObject({ start: 10, end: 13 });
    expect(cleanDemo({ start: 58.5, end: 59, shows: "" }, 60)).toMatchObject({ start: 57, end: 60 });
    expect(cleanDemo({ start: 0, end: 2, shows: "" }, 2)).toBeUndefined();
    expect(cleanDemo({ start: 0, end: 5, shows: "x".repeat(200) }, 60)?.shows).toHaveLength(120);
  });

  it("starts a new demo on its first 30 seconds, or the whole file when shorter", () => {
    expect(firstWindow(50)).toEqual({ start: 0, end: 30 });
    expect(firstWindow(24)).toEqual({ start: 0, end: 24 });
  });

  it("takes the read's stills at 10%, 50% and 90% of the window, as fractions of the file", () => {
    expect(stillPoints(20, 50, 120)).toEqual([23 / 120, 35 / 120, 47 / 120]);
  });
});

describe("the checks before anything is stored", () => {
  it("takes up to 100 MB, so a 70 MB demo passes where a 70 MB Media video would not", () => {
    const seventy = { name: "walkthrough.mp4", type: "video/mp4", size: 70 * MB };
    expect(demoFileLine(seventy)).toBeNull();
    expect(seventy.size).toBeGreaterThan(MAX_VIDEO_BYTES);
    expect(fileLine(seventy)).toBe("walkthrough.mp4 is 70 MB. Videos can be up to 50 MB.");
    expect(demoFileLine({ name: "big.mov", type: "video/quicktime", size: 240 * MB })).toBe(
      "That file is 240 MB. Demos can be up to 100 MB. Trim it or export it smaller, then try again.",
    );
    expect(tooBig(240 * MB)).toBe(demoFileLine({ name: "big.mov", type: "video/quicktime", size: 240 * MB }));
  });

  it("takes MP4 or MOV only, by type or, with none, by name", () => {
    expect(demoFileLine({ name: "a.webm", type: "video/webm", size: MB })).toBe(WRONG_TYPE);
    expect(demoFileLine({ name: "a.png", type: "image/png", size: MB })).toBe("Use an MP4 or MOV video.");
    expect(demoFileLine({ name: "screen.MOV", type: "", size: MB })).toBeNull();
    expect(demoFileLine({ name: "screen.mp4", type: "video/mp4", size: MB })).toBeNull();
  });

  it("takes 3 seconds to 3 minutes", () => {
    expect(demoLengthLine(2.9)).toBe(TOO_SHORT);
    expect(TOO_SHORT).toBe("That clip is under 3 seconds. Use one that shows the screen in use.");
    expect(demoLengthLine(3)).toBeNull();
    expect(demoLengthLine(180.4)).toBeNull();
    expect(demoLengthLine(250)).toBe("That recording runs 4:10. Demos can be up to 3 minutes. Trim it first.");
    expect(tooLong(250)).toBe(demoLengthLine(250));
    expect(demoLengthLine(NaN)).toBe(CANT_OPEN);
    expect(CANT_OPEN).toBe("This browser can't open that video. Try an MP4 or MOV.");
  });
});

describe("saving a demo", () => {
  it("keeps a short one in Media as a screen video with its window, and reads it once", async () => {
    const r = await uploadDemo(UID, mov("Budget sheet walkthrough.mov"));
    await flush();
    expect(r).toMatchObject({ window: false });
    const [m] = loadMedia(UID, { videos: true });
    expect(m).toMatchObject({ key: r!.key, kind: "video", type: "screen", seconds: 24, name: "Budget sheet walkthrough", demo: { start: 0, end: 24 } });
    expect(files.has(r!.key) && files.has(r!.key.replace("cvid-", "cimg-"))).toBe(true);
    expect(fn).toHaveBeenCalledTimes(1);
    const [name, body] = fn.mock.calls[0];
    expect(name).toBe("media-sort");
    expect(body).toEqual({ mode: "demo", stills: [STILL, STILL, STILL], name: "Budget sheet walkthrough" });
    expect(video.stills.mock.calls.at(-1)![1]).toEqual(stillPoints(0, 24, 24));
    expect(demoVideos(UID)).toEqual([
      { key: r!.key, name: "Budget sheet walkthrough", start: 0, end: 24, shows: "A monthly budget spreadsheet being filled in", flags: [], seconds: 24, width: 1280, height: 720 },
    ]);
    expect(await demoFile(r!.key)).toBeInstanceOf(Blob);
  });

  it("keeps a 50 s recording, asks for its 30 seconds, and reads the window once it is saved", async () => {
    video.meta = { duration: 50, videoWidth: 1170, videoHeight: 2532 };
    const r = await uploadDemo(UID, mov("screen.mov"));
    expect(r).toMatchObject({ window: true });
    expect(demoVideos(UID)[0]).toMatchObject({ start: 0, end: 30, seconds: 50 });
    expect(fn).not.toHaveBeenCalled();
    expect(demoState().picking.has(r!.key)).toBe(true);
    saveDemo(UID, r!.key, { start: 20, end: 50, shows: "" });
    await flush();
    expect(fn).toHaveBeenCalledTimes(1);
    expect(video.stills.mock.calls.at(-1)![1]).toEqual(stillPoints(20, 50, 50));
    // the window survives a reload: it is in the stored index
    expect(JSON.parse(store.get("cs-media-u1")!)[0].demo).toMatchObject({ start: 20, end: 50 });
  });

  it("refuses each bad file with its line and stores nothing", async () => {
    const cases: [File, number, string][] = [
      [mov("huge.mov", 240 * MB), 24, tooBig(240 * MB)],
      [mov("clip.webm", MB, "video/webm"), 24, WRONG_TYPE],
      [mov("blink.mp4", MB, "video/mp4"), 2, TOO_SHORT],
      [mov("long.mov"), 250, tooLong(250)],
    ];
    for (const [file, duration, line] of cases) {
      video.meta = { duration, videoWidth: 1280, videoHeight: 720 };
      expect(await uploadDemo(UID, file)).toBeNull();
      expect(demoState().refused).toBe(line);
    }
    expect(files.size).toBe(0);
    expect(store.get("cs-media-u1")).toBeUndefined();
    expect(fn).not.toHaveBeenCalled();
  });

  it("blocks the eleventh demo for the open brand only", async () => {
    const list = Array.from({ length: MAX_DEMOS }, (_, i) => ({ key: `cvid-demo${String(i).padStart(4, "0")}`, name: `d${i}`, folder: "", alt: "", width: 1, height: 1, addedAt: "", kind: "video" as const, seconds: 20, demo: { start: 0, end: 20, shows: "" } }));
    store.set("cs-media-u1", JSON.stringify(list));
    expect(await uploadDemo(UID, mov("eleventh.mov"))).toBeNull();
    expect(demoState().refused).toBe(DEMOS_FULL);
    expect(DEMOS_FULL).toBe("10 is the most a brand can keep. Remove one to add another.");
    expect(files.size).toBe(0);
    expect(demoVideos("someone-else")).toEqual([]);
  });

  it("lists only items with a demo, so Media's other videos and photos never show", () => {
    addMedia(UID, { key: "cimg-photo01", name: "Desk", folder: "", alt: "", width: 1, height: 1, addedAt: "" });
    addMedia(UID, { key: "cvid-clip0001", name: "Walk", folder: "", alt: "", width: 1, height: 1, addedAt: "", kind: "video", seconds: 12 });
    addMedia(UID, { key: "cvid-demo0001", name: "Demo", folder: "", alt: "", width: 1, height: 1, addedAt: "", kind: "video", seconds: 12, demo: { start: 0, end: 12, shows: "" } });
    expect(demoVideos(UID).map((d) => d.key)).toEqual(["cvid-demo0001"]);
  });
});

describe("reading what it shows", () => {
  const saved = async () => (await uploadDemo(UID, mov("Illustration.mov")))!.key;

  it("adds the flags Jev raised and keeps the demo usable", async () => {
    fn.mockResolvedValue({ shows: "A policy illustration with projected payouts", flags: ["returns"] });
    const key = await saved();
    await flush();
    expect(demoVideos(UID)[0]).toMatchObject({ key, flags: ["returns"], shows: "A policy illustration with projected payouts" });
  });

  it("with Jev off, saves its Shows line and no flag, without an error", async () => {
    fn.mockResolvedValue({ shows: "A plain budgeting sheet", flags: [] });
    const key = await saved();
    await flush();
    expect(demoVideos(UID)[0]).toMatchObject({ shows: "A plain budgeting sheet", flags: [] });
    expect(demoState().notes.get(key)).toBeUndefined();
  });

  it("a failed read (or a 403) leaves the demo saved and asks for a line; the cap says it is used up", async () => {
    fn.mockRejectedValue(new EdgeError("This isn't switched on for your account yet.", 403, "not_enabled"));
    const key = await saved();
    await flush();
    expect(demoVideos(UID)).toHaveLength(1);
    expect(demoState().notes.get(key)).toBe(READ_FAILED);
    fn.mockRejectedValue(new EdgeError("Used up.", 429, "daily_limit"));
    await readDemo(UID, key);
    expect(demoState().notes.get(key)).toBe(READ_USED_UP);
    expect(READ_USED_UP).toBe("Saved. Reading it is used up for today; add a line yourself.");
  });

  it("never replaces a line typed while it was reading", async () => {
    let answer: (v: unknown) => void = () => undefined;
    fn.mockImplementation(() => new Promise((r) => (answer = r)));
    const key = await saved();
    await flush();
    saveDemo(UID, key, { start: 0, end: 24, shows: "My own words" });
    answer({ shows: "The model's words", flags: ["personal"] });
    await flush();
    expect(demoVideos(UID)[0]).toMatchObject({ shows: "My own words", flags: ["personal"] });
  });
});

describe("removing a demo", () => {
  it("takes it off the brand, keeps the file, and Undo puts it back", async () => {
    const key = (await uploadDemo(UID, mov("Demo.mov")))!.key;
    await flush();
    const item = removeDemo(UID, key)!;
    expect(demoVideos(UID)).toEqual([]);
    expect(files.has(key)).toBe(true);
    restoreDemo(UID, item);
    expect(demoVideos(UID).map((d) => d.key)).toEqual([key]);
  });
});
