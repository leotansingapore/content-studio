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

import { DEMO_GONE, pendingAvatar } from "./aiVideo";
import { EdgeError } from "./edgeFn";
import { formatJobs, onFormatJob, type FormatJob } from "./formatJob";
import { hookFormulaSet } from "./hookFormulas";
import {
  HOOK_NAME,
  HOOK_REFUSED,
  HOOK_TOAST,
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

const UID = "6d80f027-3395-480c-86a1-8827d3d6cce3";
const DEMO = { key: "hd-demo1", name: "screen-recording.mp4", seconds: 24 };
const DEMO_FILE = new Blob(["demo"]);
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
    // the formulas go as writeHooks sends them: five fields, never bestFor
    expect(body.formulas).toEqual(hookFormulaSet(0).map(({ id, name, template, example, trap }) => ({ id, name, template, example, trap })));
    const [judge] = called("writing-judge", "hooks");
    expect(judge[1]).toMatchObject({ hooks: HOOKS.map((h) => h.text), platform: "tiktok" });
    expect(hookSet()).toMatchObject({ hooks: HOOKS, pick: 1, set: 0 });

    await writeHooks(UID, ASK);
    expect(make.mock.calls[1][0].formulas.map((f: { id: string }) => f.id)).toEqual(hookFormulaSet(1).map((f) => f.id));
    expect(hookSet()?.set).toBe(1);
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

  it("spends nothing while another paid clip waits on this device", async () => {
    store.set("cs-ai-video-pending", JSON.stringify({ name: "Laksa", tokens: ["old"], seconds: [4], kind: "template" }));
    expect(await run({ ...SPOKEN, hook: "" })).toMatchObject({ state: "failed", error: VIDEO_LIMITS.waiting });
    expect(make).not.toHaveBeenCalled();
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
});
