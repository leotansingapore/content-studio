import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabase: { functions: { invoke: vi.fn() } }, SUPABASE_URL: "", SUPABASE_ANON_KEY: "" }));
const fn = vi.hoisted(() => vi.fn());
vi.mock("@/lib/edgeFn", async (orig) => ({ ...(await orig<typeof import("./edgeFn")>()), callFn: fn }));
const stock = vi.hoisted(() => ({ search: vi.fn(), download: vi.fn() }));
vi.mock("@/lib/stockMedia", () => ({ searchStock: stock.search, downloadStock: stock.download }));
const length = vi.hoisted(() => vi.fn());
vi.mock("@/lib/longAudio", async (orig) => ({ ...(await orig<typeof import("./longAudio")>()), mediaLength: length }));
const join = vi.hoisted(() => ({ start: vi.fn(), current: vi.fn() }));
vi.mock("@/lib/videoMedia", async (orig) => ({
  ...(await orig<typeof import("./videoMedia")>()),
  ensureCaptionFonts: async () => {},
  startJoin: join.start,
  currentJoin: join.current,
}));
// a canvas-free measure: each character half as wide as the font is tall
const measure = (text: string, css: string) => text.length * Number(/([\d.]+)px/.exec(css)?.[1] ?? 40) * 0.55;
vi.mock("@/lib/slideshowDraw", async (orig) => ({ ...(await orig<typeof import("./slideshowDraw")>()), screenMeasure: () => measure }));

import { NOTIFY_TOAST, NO_STOCK, STOCK, notifyBusy, notifyJob, startNotify, type NotifyAsk } from "./notifyJob";
import { OPEN_FAILED } from "./wallJob";

describe("the notification stack's stock clip", () => {
  it("searches for an Asian person first (Leo: people are Singaporean by default), with the city at night as the fallback", () => {
    expect(STOCK.search).toMatch(/\basian\b/i);
    expect(STOCK.again).toBe("city night");
  });

  it("asks Jev about the scene in words a Pexels page name can match: page names never say who is in the clip", () => {
    // a beat naming the person's race made Jev doubt every candidate (none 0.00 -> 0.13, 22 Oct) without telling them apart
    expect(STOCK.scene).not.toMatch(/asian|singapor/i);
  });
});

describe("making a stack", () => {
  const ASK: NotifyAsk = { lines: ["Did I save enough?", "What if I get sick?", "Can I retire at 60?"], word: "Breathe", label: "Money", bg: "stock" };
  const clip = { id: "p1", w: 720, h: 1280, alt: "", thumb: "", src: "https://videos.pexels.com/video-files/p1/v.mp4", by: "Ann", byUrl: "", url: "https://www.pexels.com/video/man-thinking-at-a-desk-1/", duration: 5 };
  const FAILED_JOIN = { progress: 0, state: "failed", error: "This browser can't record video." };

  /** Runs until the job settles, the join slot's sleeps included. */
  async function run(ask: NotifyAsk = ASK) {
    const done = startNotify(ask);
    await vi.runAllTimersAsync();
    await done;
    return notifyJob()!;
  }

  beforeEach(() => {
    vi.useFakeTimers();
    stock.search.mockReset().mockResolvedValue({ items: [clip], more: false });
    stock.download.mockReset().mockImplementation(async (src: string) => new Blob([src]));
    fn.mockReset().mockResolvedValue({ picks: [0] });
    length.mockReset().mockResolvedValue(5);
    join.start.mockReset().mockResolvedValue(undefined);
    join.current.mockReset().mockReturnValue(null);
  });
  afterEach(() => vi.useRealTimers());

  it("joins Jev's stock clip, muted, with the cards and the word riding to the editor", async () => {
    expect(await run()).toMatchObject({ state: "done", extra: { toast: NOTIFY_TOAST, caption: "Did I save enough?\nWhat if I get sick?\nCan I retire at 60?\nBreathe" } });
    expect(stock.search).toHaveBeenCalledWith("video", STOCK.search, 1, "portrait");
    expect(join.start).toHaveBeenCalledTimes(1);
    expect(join.start.mock.calls[0][3]).toMatchObject({ mute: true, extra: { toast: NOTIFY_TOAST } });
  });

  it("a second press while one is being made looks for no second clip and joins once", async () => {
    const first = startNotify(ASK);
    await startNotify({ ...ASK, word: "Again" });
    await vi.runAllTimersAsync();
    await first;
    expect(stock.search).toHaveBeenCalledTimes(1);
    expect(join.start).toHaveBeenCalledTimes(1);
    expect(notifyJob()?.ask.word).toBe("Breathe");
  });

  it("ends failed in the join's own words, and Make it works again", async () => {
    join.current.mockImplementation(() => (join.start.mock.calls.length === 1 ? FAILED_JOIN : null));
    expect(await run()).toMatchObject({ state: "failed", error: "This browser can't record video." });
    expect(notifyBusy()).toBe(false);
    expect(await run()).toMatchObject({ state: "done" });
    expect(join.start).toHaveBeenCalledTimes(2);
  });

  it("joins at once when an earlier video failed to join while you were off /edit (it never waits on a failed join)", async () => {
    join.current.mockImplementation(() => (join.start.mock.calls.length ? null : FAILED_JOIN));
    expect(await run()).toMatchObject({ state: "done" });
    expect(join.start).toHaveBeenCalledTimes(1);
  });

  it("says no stock clip came up and offers your own video, and refuses your own video when it won't open, joining nothing", async () => {
    stock.search.mockResolvedValue({ items: [], more: false });
    expect(await run()).toMatchObject({ state: "failed", error: NO_STOCK, noClip: true });
    length.mockResolvedValue(NaN);
    expect(await run({ ...ASK, bg: "mine", file: new File(["x"], "me.mov") })).toMatchObject({ state: "failed", error: OPEN_FAILED });
    expect(join.start).not.toHaveBeenCalled();
  });
});
