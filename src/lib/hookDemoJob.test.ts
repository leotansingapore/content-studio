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
const media = vi.hoisted(() => ({ start: vi.fn(), current: vi.fn(), get: vi.fn(), put: vi.fn(), del: vi.fn() }));
vi.mock("@/lib/videoMedia", async (orig) => ({
  ...(await orig<typeof import("./videoMedia")>()),
  ensureCaptionFonts: async () => {},
  startJoin: media.start,
  currentJoin: media.current,
  getFile: media.get,
  putFile: media.put,
  deleteFile: media.del,
}));

const frame = vi.hoisted(() => vi.fn());
vi.mock("@/lib/crumpleCard", async (orig) => ({ ...(await orig<typeof import("./crumpleCard")>()), cardFrame: frame }));

import { DEMO_GONE, pendingAvatar } from "./aiVideo";
import { FRAME_FAILED } from "./crumpleCard";
import { EdgeError } from "./edgeFn";
import { formatJobs, onFormatJob, type FormatJob } from "./formatJob";
import { hookFormulaSet } from "./hookFormulas";
import {
  HOOK_NAME,
  HOOK_REFUSED,
  HOOK_TOAST,
  NO_CARD_FIT,
  NO_HOOK_CLIP,
  chooseHook,
  clearHookDemo,
  hookDemoJob,
  hookSet,
  keepOnlyDemo,
  makeHookDemo,
  pendingDemo,
  pendingDemoKey,
  repickDemo,
  resumeHookDemo,
  writeHooks,
  type HookDemoAsk,
} from "./hookDemoJob";
import type { MakeResponse } from "./remix";
import { VIDEO_LIMITS } from "./remix";
import type { RemixSource } from "./remixSource";
import type { StockItem } from "./stockMedia";
import W2 from "../../supabase/functions/remix/fixtures/phase3-w2-live.json";

const UID = "6d80f027-3395-480c-86a1-8827d3d6cce3";
const DEMO = { key: "hd-demo1", name: "screen-recording.mp4", seconds: 24 };
const DEMO_FILE = new Blob(["demo"]);
// a demo saved on /brand: the 0:20 to 0:50 window of a 2-minute recording
const SAVED = { key: "cvid-mh2k9x01ab", name: "Budget sheet walkthrough", seconds: 30, start: 20 };
const SAVED_FILE = new Blob(["saved demo"]);
const ASK: HookDemoAsk = { source: null, topic: "How I log every client call in one place", mention: true, play: "stock", hook: "", demo: DEMO };
const HOOKS = [
  { text: "I logged every call for 30 days and this changed", formula: hookFormulaSet(0)[0].id },
  { text: "Most people track deals. I track calls.", formula: hookFormulaSet(0)[1].id },
  { text: "Stop guessing why your pipeline is empty", formula: hookFormulaSet(0)[2].id },
];
const hooksResponse = (): MakeResponse => ({ as: "hooks", result: { as: "hooks", hooks: HOOKS }, flags: { copied: [], claim: false, invented: false }, usage: { used: 1, limit: 30 } });
const clip = (id: string, duration = 6): StockItem => ({ id, w: 720, h: 1280, alt: "", thumb: "", src: `https://videos.pexels.com/video-files/${id}/v.mp4`, by: "Ann", byUrl: "", url: `https://www.pexels.com/video/a-phone-${id}-1/`, duration });

type Body = { mode: string; hooks?: string[] };
/** Each function's answer by name and mode; anything else fails as an unreachable server would. */
function serve(o: { pick?: number | null; montage?: (n: number) => number | null; status?: () => unknown } = {}) {
  let picks = 0;
  fn.mockImplementation(async (name: string, body: Body) => {
    if (name === "writing-judge" && body.mode === "hooks") {
      if (o.pick === null) throw new EdgeError("The check is unavailable for a moment.", 503);
      return { pick: { index: o.pick ?? 1, p: 0.7 } };
    }
    if (name === "video-assist" && body.mode === "montage-pick") {
      const p = o.montage ? o.montage(++picks) : 0;
      if (p === null) throw new EdgeError("No picks left today.", 429, "daily_limit");
      return { picks: [p] };
    }
    if (name === "ai-video" && body.mode === "template") return { tokens: ["t1"], refund: "ticket" };
    if (name === "ai-video" && body.mode === "status") return o.status ? o.status() : { jobs: [{ state: "done", url: "https://cdn.example/hook.mp4" }] };
    throw new Error(`${name} ${body.mode}`);
  });
}
const called = (name: string, mode: string) => fn.mock.calls.filter(([n, b]) => n === name && (b as Body).mode === mode);

async function run(ask: HookDemoAsk = ASK) {
  const done = makeHookDemo(UID, ask);
  await vi.runAllTimersAsync();
  await done;
  await vi.runAllTimersAsync();
  return hookDemoJob()!;
}

const store = new Map<string, string>();
beforeEach(() => {
  vi.useFakeTimers();
  store.clear();
  const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("sessionStorage", storage);
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, blob: async () => new Blob(["hook"]) })));
  make.mockReset().mockResolvedValue(hooksResponse());
  fn.mockReset();
  serve();
  stock.search.mockReset().mockImplementation(async () => ({ items: [clip("a"), clip("b")], more: false }));
  stock.download.mockReset().mockImplementation(async (src: string) => new Blob([src]));
  length.mockReset().mockResolvedValue(6);
  media.start.mockReset().mockResolvedValue(undefined);
  media.current.mockReset().mockReturnValue(null);
  media.get.mockReset().mockImplementation(async (k: string) => (k === DEMO.key ? DEMO_FILE : undefined));
  media.put.mockReset().mockResolvedValue(undefined);
  media.del.mockReset().mockResolvedValue(undefined);
  clearHookDemo();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("the hooks", () => {
  it("writes three in the formulas' shape for the demo, marks Jev's pick, and Write 3 more asks for the next three", async () => {
    await writeHooks(UID, ASK);
    const body = make.mock.calls[0][0];
    expect(body).toMatchObject({ mode: "make", as: "hooks", topic: ASK.topic, demo: { name: "screen-recording.mp4", seconds: 24 } });
    // a stock hook asks for no word limit: the server's 12 stands
    expect(body).not.toHaveProperty("maxWords");
    // the formulas go as writeHooks sends them: five fields, never bestFor
    expect(body.formulas).toEqual(hookFormulaSet(0).map(({ id, name, template, example, trap }) => ({ id, name, template, example, trap })));
    const [judge] = called("writing-judge", "hooks");
    expect(judge[1]).toMatchObject({ hooks: HOOKS.map((h) => h.text), platform: "tiktok" });
    expect(hookSet()).toMatchObject({ hooks: HOOKS, pick: 1, set: 0 });

    await writeHooks(UID, ASK);
    expect(make.mock.calls[1][0].formulas.map((f: { id: string }) => f.id)).toEqual(hookFormulaSet(1).map((f) => f.id));
    expect(hookSet()?.set).toBe(1);
  });

  it("asks for hooks of at most 8 words when someone says it, from Write 3 hooks and from a make (live check 22 Oct)", async () => {
    await writeHooks(UID, { ...ASK, play: "spoken" });
    expect(make.mock.calls[0][0]).toMatchObject({ as: "hooks", maxWords: 8 });
    await run({ ...ASK, play: "spoken" });
    expect(make.mock.calls[1][0]).toMatchObject({ as: "hooks", maxWords: 8 });
    await writeHooks(UID, { ...ASK, play: "mine" });
    expect(make.mock.calls[2][0]).not.toHaveProperty("maxWords");
  });

  it("marks none when Jev has no answer, and a make then takes the first", async () => {
    serve({ pick: null });
    await writeHooks(UID, ASK);
    expect(hookSet()?.pick).toBeNull();
    expect(chooseHook(hookSet()!, "stock")).toBe(HOOKS[0].text);
  });

  it("takes Jev's pick for a make, else the first that someone can say in 4 seconds", () => {
    expect(chooseHook({ hooks: HOOKS, pick: 2 }, "stock")).toBe(HOOKS[2].text);
    // the first hook runs 10 words: too long to say, so the next one
    expect(chooseHook({ hooks: HOOKS, pick: null }, "spoken")).toBe(HOOKS[1].text);
    expect(chooseHook({ hooks: HOOKS, pick: 0 }, "spoken")).toBe(HOOKS[1].text);
    expect(chooseHook({ hooks: [HOOKS[0]], pick: 0 }, "spoken")).toBeNull();
  });
});

describe("words on a stock clip", () => {
  it("finds Jev's clip for the hook, cuts it to 3 s with one sticker ending at 3 s, then the demo, captions off and never a wall", async () => {
    serve({ montage: () => 1 });
    const j = await run({ ...ASK, hook: "Stop guessing why your pipeline is empty" });
    expect(j.state).toBe("done");
    expect(make).not.toHaveBeenCalled();
    expect(stock.search.mock.calls[0]).toEqual(["video", "how i log every", 1, "portrait"]);
    const [pick] = called("video-assist", "montage-pick");
    expect((pick[1] as { beats: { say: string }[] }).beats[0].say).toBe("Stop guessing why your pipeline is empty");
    expect(stock.download).toHaveBeenCalledWith(clip("b").src);
    const [name, takes, , opts] = media.start.mock.calls[0];
    expect(name).toBe(HOOK_NAME);
    expect(takes.map((t: { start: number; end: number }) => [t.start, t.end])).toEqual([[0, 3], [0, 24]]);
    expect(takes[1].file).toBe(DEMO_FILE);
    // the demo keeps its own sound
    expect(opts.mute).toBeUndefined();
    const s = opts.extra.settings;
    expect(s.captions).toBe(false);
    expect(s.wall).toBeUndefined();
    expect(s.volume).toBeUndefined();
    expect(s.overlays).toHaveLength(1);
    expect(s.overlays[0]).toMatchObject({ kind: "block", text: "Stop guessing why your pipeline is empty", from: 0, to: 3, box: "white" });
    expect(opts.extra.toast).toBe(HOOK_TOAST);
  });

  it("takes the first clip when Jev has no answer", async () => {
    serve({ montage: () => null });
    await run({ ...ASK, hook: "Stop guessing why your pipeline is empty" });
    expect(stock.download).toHaveBeenCalledWith(clip("a").src);
  });

  it("writes the hooks first when none is picked, and joins Jev's pick", async () => {
    const j = await run();
    expect(make).toHaveBeenCalledTimes(1);
    expect(make.mock.invocationCallOrder[0]).toBeLessThan(stock.search.mock.invocationCallOrder[0]);
    expect(media.start.mock.calls[0][3].extra.settings.overlays[0].text).toBe(HOOKS[1].text);
    expect(j.ask.hook).toBe(HOOKS[1].text);
  });

  it("says no clip fits when Jev says none twice, and the writer's refusal in its own words with no clip looked for", async () => {
    serve({ montage: () => -1 });
    expect(await run({ ...ASK, hook: "Stop guessing" })).toMatchObject({ state: "failed", error: NO_HOOK_CLIP, noClip: true });
    expect(media.start).not.toHaveBeenCalled();

    stock.search.mockClear();
    make.mockRejectedValueOnce(new EdgeError("That topic can't be turned into something safe to post. Try another one.", 422, "refused"));
    expect(await run()).toMatchObject({ state: "failed", refused: true, error: HOOK_REFUSED });
    expect(stock.search).not.toHaveBeenCalled();
  });

  it("refuses before writing anything when the demo is gone from this device", async () => {
    media.get.mockResolvedValue(undefined);
    expect(await run()).toMatchObject({ state: "failed", error: DEMO_GONE, demoGone: true });
    expect(make).not.toHaveBeenCalled();
    expect(stock.search).not.toHaveBeenCalled();
  });

  it("shows each step in the library's Making now and clears it once made", async () => {
    const seen: FormatJob[][] = [];
    const off = onFormatJob((l) => seen.push(l));
    await run({ ...ASK, source: { key: "trend:t1", kind: "trend", remixedAt: "" } as RemixSource, play: "stock" });
    off();
    const rows = seen.flat();
    expect(rows[0]).toMatchObject({ slug: "hook-demo", label: "Hook plus demo", state: "working", step: "Writing the hooks", href: "/make/hook-demo?source=trend%3At1" });
    expect(rows.find((r) => r.step === "Putting it together")?.href).toBe("/edit");
    expect(formatJobs()).toEqual([]);
  });
});

describe("the stock search (wave 2 live check, 21 Oct)", () => {
  // the live request and its three hooks; that day the page searched "how i see every", then "most people say keep",
  // and Jev took none of the 12 clips
  const d = W2.find((x) => x.call === "hook-demo-hooks")!;
  const LIVE_ASK: HookDemoAsk = { ...ASK, topic: d.request.topic };
  const TERMS = ["two people talking", "person checking phone", "messy desk with notes"];
  const withTerms = (): MakeResponse => ({ ...(d.response as MakeResponse), result: { as: "hooks", hooks: d.response.result.hooks.map((h, i) => ({ ...h, search: TERMS[i] })) } });
  const queries = () => stock.search.mock.calls.map((c) => c[1]);

  it("searches the picked hook's own words, and Jev's pick's when the make writes them", async () => {
    make.mockResolvedValue(withTerms());
    await writeHooks(UID, LIVE_ASK);
    expect(hookSet()?.hooks.map((h) => h.search)).toEqual(TERMS);
    // the live check's first press: the first hook
    expect(await run({ ...LIVE_ASK, hook: hookSet()!.hooks[0].text })).toMatchObject({ state: "done" });
    expect(queries()).toEqual(["two people talking"]);

    clearHookDemo();
    stock.search.mockClear();
    // no hook picked: written, then Jev's pick (the second) is searched by its own words
    expect(await run({ ...LIVE_ASK, hook: "" })).toMatchObject({ state: "done", ask: { hook: d.response.result.hooks[1].text } });
    expect(queries()).toEqual(["person checking phone"]);
  });

  it("searches the topic's first words, as before, for a typed hook or a hook written with no search", async () => {
    make.mockResolvedValue(withTerms());
    await writeHooks(UID, LIVE_ASK);
    await run({ ...LIVE_ASK, hook: "Every chat in one place" });
    expect(queries()).toEqual(["how i see every"]);

    clearHookDemo();
    stock.search.mockClear();
    make.mockResolvedValue(d.response as MakeResponse);
    await writeHooks(UID, LIVE_ASK);
    serve({ montage: () => -1 });
    expect(await run({ ...LIVE_ASK, hook: d.response.result.hooks[0].text })).toMatchObject({ state: "failed", error: NO_HOOK_CLIP });
    expect(queries()).toEqual(["how i see every", "most people say keep"]);
  });
});

describe("your own clip first", () => {
  it("joins your upright clip whole, then the demo, with the hook on screen while you say it", async () => {
    const own = new Blob(["me"]);
    await run({ ...ASK, play: "mine", hook: "Stop guessing", mine: { file: own, seconds: 3.4 } });
    const [, takes, , opts] = media.start.mock.calls[0];
    expect(takes[0]).toEqual({ file: own, start: 0, end: 3.4 });
    expect(takes[1].file).toBe(DEMO_FILE);
    expect(opts.extra.settings.overlays[0].to).toBe(3.4);
    expect(stock.search).not.toHaveBeenCalled();
  });

  it("never falls back to stock when your own clip is missing", async () => {
    expect(await run({ ...ASK, play: "mine", hook: "Stop guessing", mine: null })).toMatchObject({ state: "failed", error: "Pick your hook clip first." });
    expect(stock.search).not.toHaveBeenCalled();
    expect(media.start).not.toHaveBeenCalled();
  });
});

describe("someone says it", () => {
  const SPOKEN: HookDemoAsk = { ...ASK, play: "spoken", hook: "Stop guessing why your pipeline is empty" };

  it("orders the 4 s spoken-hook clip and keeps the demo in its after, so a reload still joins it at no cost", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false })));
    const failed = await run(SPOKEN);
    expect(failed.state).toBe("failed");
    const [start] = called("ai-video", "template");
    expect(start[1]).toEqual({ mode: "template", template: "spoken-hook", seconds: 4, quality: "480p", fields: { line: "Stop guessing why your pipeline is empty" }, photos: [] });
    expect(pendingAvatar()).toMatchObject({ name: HOOK_NAME, kind: "template", after: [{ key: DEMO.key, end: 24 }] });
    expect(pendingAvatar()?.extra?.settings?.overlays?.[0]).toMatchObject({ text: "Stop guessing why your pipeline is empty", to: 4 });
    expect(media.start).not.toHaveBeenCalled();

    // a reload: the run is gone from memory, the paid clip and its demo key are not
    clearHookDemo();
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, blob: async () => new Blob(["hook"]) })));
    resumeHookDemo(SPOKEN);
    await vi.runAllTimersAsync();
    expect(hookDemoJob()?.state).toBe("done");
    expect(called("ai-video", "template")).toHaveLength(1);
    const [, takes, , opts] = media.start.mock.calls[0];
    expect(takes.map((t: { start: number; end: number }) => [t.start, t.end])).toEqual([[0, 4], [0, 24]]);
    expect(takes[1].file).toBe(DEMO_FILE);
    expect(opts.extra.toast).toBe(HOOK_TOAST);
    expect(pendingAvatar()).toBeNull();
  });

  it("keeps the paid clip when the demo is gone, and joins once the demo is picked again under the same key", async () => {
    // the demo is there when the make starts, then gone from this device before the clip is ready
    let gone = false;
    media.get.mockImplementation(async (k: string) => (k === DEMO.key && !gone ? DEMO_FILE : undefined));
    const done = makeHookDemo(UID, SPOKEN);
    gone = true;
    await vi.runAllTimersAsync();
    await done;
    expect(hookDemoJob()).toMatchObject({ state: "failed", error: DEMO_GONE, demoGone: true });
    expect(pendingDemoKey()).toBe(DEMO.key);

    const again = new Blob(["demo again"]);
    media.get.mockImplementation(async (k: string) => (k === DEMO.key ? again : undefined));
    await repickDemo(again, SPOKEN);
    await vi.runAllTimersAsync();
    expect(media.put).toHaveBeenCalledWith(DEMO.key, again);
    expect(hookDemoJob()?.state).toBe("done");
    expect(media.start.mock.calls[0][1][1].file).toBe(again);
    expect(called("ai-video", "template")).toHaveLength(1);
  });

  it("a second press while the hooks are written or the clip is made writes once and orders one clip", async () => {
    const write = { ...SPOKEN, hook: "" };
    const presses = [makeHookDemo(UID, write), makeHookDemo(UID, write), makeHookDemo(UID, SPOKEN), writeHooks(UID, { ...SPOKEN, demo: DEMO })];
    await vi.runAllTimersAsync();
    await Promise.all(presses);
    await vi.runAllTimersAsync();
    expect(make).toHaveBeenCalledTimes(1);
    expect(called("ai-video", "template")).toHaveLength(1);
    expect(media.start).toHaveBeenCalledTimes(1);
    expect(hookDemoJob()?.state).toBe("done");
  });

  it("orders nothing when another video starts while the hooks are written", async () => {
    make.mockImplementationOnce(async () => {
      store.set("cs-ai-video-pending", JSON.stringify({ name: "Laksa", tokens: ["old"], seconds: [4], kind: "template" }));
      return hooksResponse();
    });
    expect(await run({ ...SPOKEN, hook: "" })).toMatchObject({ state: "failed", error: VIDEO_LIMITS.waiting });
    expect(make).toHaveBeenCalledTimes(1);
    expect(called("ai-video", "template")).toHaveLength(0);
    expect(pendingAvatar()?.tokens).toEqual(["old"]);
  });

  it("spends nothing while another paid clip waits on this device", async () => {
    store.set("cs-ai-video-pending", JSON.stringify({ name: "Laksa", tokens: ["old"], seconds: [4], kind: "template" }));
    expect(await run({ ...SPOKEN, hook: "" })).toMatchObject({ state: "failed", error: VIDEO_LIMITS.waiting });
    expect(make).not.toHaveBeenCalled();
    expect(called("ai-video", "template")).toHaveLength(0);
  });
});

describe("a crumpled notification", () => {
  const CRUMPLE: HookDemoAsk = { ...ASK, play: "crumple", hook: "Stop guessing why your pipeline is empty" };
  const JPEG_B64 = "/9j/frame";
  /** A browser for toJpeg: the drawn frame comes back as a JPEG, read as base64. */
  const browser = () => {
    vi.stubGlobal("createImageBitmap", async () => ({ width: 1080, height: 1920, close: () => {} }));
    vi.stubGlobal("document", { createElement: () => ({ getContext: () => ({ drawImage: () => {} }), toBlob: (cb: (b: Blob) => void) => cb(new Blob(["jpeg"])) }) });
    vi.stubGlobal("FileReader", class {
      result = `data:image/jpeg;base64,${JPEG_B64}`;
      onload: () => void = () => {};
      readAsDataURL() { this.onload(); }
    });
  };
  beforeEach(() => {
    browser();
    frame.mockReset().mockResolvedValue(new Blob(["frame"]));
  });

  it("draws the card on the demo's own frame, orders the 4 s 720p clip from it, and keeps the demo in its after", async () => {
    store.set(`content-studio-carousel-brand-${UID}`, JSON.stringify({ color: "#0F766E", name: "Leo Tan", handle: "@leo" }));
    vi.stubGlobal("window", { localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: () => {}, removeItem: () => {} }, location: { search: "" } });
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false })));
    expect((await run(CRUMPLE)).state).toBe("failed");
    expect(frame).toHaveBeenCalledWith(DEMO_FILE, 0.3, CRUMPLE.hook, expect.objectContaining({ name: "Leo Tan", color: "#0F766E" }));
    const [start] = called("ai-video", "template");
    expect(start[1]).toEqual({ mode: "template", template: "crumple-hook", seconds: 4, quality: "720p", fields: {}, photos: [{ role: "person", jpeg: JPEG_B64 }] });
    expect(pendingAvatar()).toMatchObject({ name: HOOK_NAME, kind: "template", after: [{ key: DEMO.key, end: 24 }] });
    // the hook is on the card: no words sticker over the clip
    expect(pendingAvatar()?.extra?.settings).toMatchObject({ captions: false, overlays: [] });

    // a reload joins the paid clip and the demo at no cost
    clearHookDemo();
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, blob: async () => new Blob(["hook"]) })));
    resumeHookDemo(CRUMPLE);
    await vi.runAllTimersAsync();
    expect(hookDemoJob()?.state).toBe("done");
    expect(called("ai-video", "template")).toHaveLength(1);
    expect(media.start.mock.calls[0][1].map((t: { start: number; end: number }) => [t.start, t.end])).toEqual([[0, 4], [0, 24]]);
  });

  it("takes the frame 0.3 s into a saved demo's window", async () => {
    media.get.mockImplementation(async (k: string) => (k === SAVED.key ? SAVED_FILE : undefined));
    await run({ ...CRUMPLE, demo: SAVED });
    expect(frame.mock.calls[0].slice(0, 2)).toEqual([SAVED_FILE, 20.3]);
    expect(media.start.mock.calls[0][1].map((t: { start: number; end: number }) => [t.start, t.end])).toEqual([[0, 4], [20, 50]]);
  });

  it("writes hooks short enough for the card, and takes the first that fits it", async () => {
    serve({ pick: 0 });
    await run({ ...CRUMPLE, hook: "" });
    expect(make.mock.calls[0][0]).toMatchObject({ as: "hooks", maxWords: 8 });
    // Jev picked the 48-character hook: too long for the card, so the next one
    expect(frame.mock.calls[0][2]).toBe(HOOKS[1].text);
    expect(chooseHook({ hooks: [HOOKS[0]], pick: 0 }, "crumple")).toBeNull();
  });

  it("says none fits the card when every hook is too long, before anything is paid", async () => {
    make.mockResolvedValue({ ...hooksResponse(), result: { as: "hooks", hooks: [HOOKS[0]] } });
    expect(await run({ ...CRUMPLE, hook: "" })).toMatchObject({ state: "failed", error: NO_CARD_FIT });
    expect(NO_CARD_FIT).toBe("None of these hooks fits on the card. Pick a shorter one or type your own.");
    expect(frame).not.toHaveBeenCalled();
    expect(called("ai-video", "template")).toHaveLength(0);
  });

  it("orders nothing when the frame can't be drawn, or while another paid clip waits", async () => {
    frame.mockRejectedValue(new Error("no"));
    expect(await run(CRUMPLE)).toMatchObject({ state: "failed", error: FRAME_FAILED });
    expect(called("ai-video", "template")).toHaveLength(0);
    expect(pendingAvatar()).toBeNull();

    frame.mockResolvedValue(new Blob(["frame"]));
    store.set("cs-ai-video-pending", JSON.stringify({ name: "Laksa", tokens: ["old"], seconds: [4], kind: "template" }));
    expect(await run(CRUMPLE)).toMatchObject({ state: "failed", error: VIDEO_LIMITS.waiting });
    expect(called("ai-video", "template")).toHaveLength(0);
  });
});

describe("the demo on this device", () => {
  it("keeps only the demo picked now and the one a waiting spoken hook still joins, even ones a closed tab left", async () => {
    store.set("cs-make-hook-demo-files", JSON.stringify(["hd-old", "hd-waiting", "hd-older"]));
    store.set("cs-ai-video-pending", JSON.stringify({ name: HOOK_NAME, tokens: ["t1"], seconds: [4], kind: "template", after: [{ key: "hd-waiting", end: 18 }] }));
    await keepOnlyDemo("hd-new");
    expect(media.del.mock.calls.map((c) => c[0]).sort()).toEqual(["hd-old", "hd-older"]);
    expect(JSON.parse(store.get("cs-make-hook-demo-files")!).sort()).toEqual(["hd-new", "hd-waiting"]);
    // a new tab knows the waiting clip's demo from the clip alone
    expect(pendingDemo()).toEqual({ key: "hd-waiting", name: "Your demo", seconds: 18 });

    store.delete("cs-ai-video-pending");
    store.set("cs-make-hook-demo-files", "not json");
    await keepOnlyDemo("hd-new");
    expect(media.del).toHaveBeenCalledTimes(2);
    expect(pendingDemo()).toBeNull();
  });

  it("a saved demo survives picking another demo: keepOnlyDemo never lists or deletes a cvid- key", async () => {
    store.set("cs-make-hook-demo-files", JSON.stringify(["hd-old"]));
    // the saved demo picked, then a one-off picked, then another saved demo, with a spoken hook waiting on the first
    await keepOnlyDemo(SAVED.key);
    expect(media.del.mock.calls.map((c) => c[0])).toEqual(["hd-old"]);
    expect(JSON.parse(store.get("cs-make-hook-demo-files")!)).toEqual([]);
    await keepOnlyDemo("hd-new");
    store.set("cs-ai-video-pending", JSON.stringify({ name: HOOK_NAME, tokens: ["t1"], seconds: [4], kind: "template", after: [{ key: SAVED.key, start: 20, end: 50 }] }));
    // even a list someone wrote with a saved key in it
    store.set("cs-make-hook-demo-files", JSON.stringify(["hd-new", "cvid-other0001", SAVED.key]));
    await keepOnlyDemo("cvid-other0001");
    expect(media.del.mock.calls.map((c) => c[0])).toEqual(["hd-old", "hd-new"]);
    expect(media.del.mock.calls.some(([k]) => String(k).startsWith("cvid-"))).toBe(false);
    expect(JSON.parse(store.get("cs-make-hook-demo-files")!)).toEqual([]);
    // the waiting clip plays the saved demo's window
    expect(pendingDemo()).toEqual({ key: SAVED.key, name: "Your demo", seconds: 30, start: 20 });
  });
});

describe("a demo saved on /brand", () => {
  beforeEach(() => media.get.mockImplementation(async (k: string) => (k === SAVED.key ? SAVED_FILE : k === DEMO.key ? DEMO_FILE : undefined)));

  it("joins its window, from where it starts in the file, after a stock hook", async () => {
    serve({ montage: () => 0 });
    const j = await run({ ...ASK, demo: SAVED, hook: "Stop guessing why your pipeline is empty" });
    expect(j.state).toBe("done");
    const [, takes] = media.start.mock.calls[0];
    expect(takes.map((t: { start: number; end: number }) => [t.start, t.end])).toEqual([[0, 3], [20, 50]]);
    expect(takes[1].file).toBe(SAVED_FILE);
    expect(media.del).not.toHaveBeenCalled();
  });

  it("keeps its window in a spoken hook's after, so a reload joins the same part", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false })));
    await run({ ...ASK, demo: SAVED, play: "spoken", hook: "Stop guessing why your pipeline is empty" });
    expect(pendingAvatar()?.after).toEqual([{ key: SAVED.key, start: 20, end: 50 }]);
    clearHookDemo();
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, blob: async () => new Blob(["hook"]) })));
    resumeHookDemo({ ...ASK, demo: SAVED, play: "spoken" });
    await vi.runAllTimersAsync();
    const [, takes] = media.start.mock.calls[0];
    expect(takes.map((t: { start: number; end: number }) => [t.start, t.end])).toEqual([[0, 4], [20, 50]]);
    expect(takes[1].file).toBe(SAVED_FILE);
  });

  it("a demo picked here keeps playing from 0, as before saved demos", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false })));
    await run({ ...ASK, play: "spoken", hook: "Stop guessing why your pipeline is empty" });
    expect(pendingAvatar()?.after).toEqual([{ key: DEMO.key, end: 24 }]);
  });
});
