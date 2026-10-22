import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultSettings } from "./videoEdit";
import {
  addToJoin, currentJoin, drawEndCard, drawFrame, drawIntroCard, endJoin, loadBrandArt, type BrandArt, exportAll, exportQueue, handToEditor, joinAdd, mergeExtra, onJoinJob, pickupPlan, planFor, seek, slidePlan, startExport, startSound, stopExportQueue, syncBackdrop,
  TAP_TO_FINISH, withJoinAdd, type ExportJob, type Frame, type JoinExtra, type PickupPath,
} from "./videoMedia";

const kitFont = vi.hoisted(() => ({ font: undefined as string | undefined }));
vi.mock("@/lib/brandFont", () => ({ leoBrandFont: async () => kitFont.font }));
const signIn = vi.hoisted(() => ({ leo: null as { id: string; email: string } | null }));
vi.mock("@/lib/useLeoOnly", () => ({ leoUser: async () => signIn.leo }));
vi.mock("@/lib/fastExport", () => ({ exportFast: async () => ({ blob: new Blob(["mp4"]), ext: "mp4", seconds: 3, cap: 0, label: "Instagram" }) }));

describe("export all", () => {
  it("runs the exports one after another, notes a failure and keeps going", async () => {
    const order: string[] = [];
    const run = (id: string, fail = false) => ({
      id,
      run: async () => {
        expect(exportQueue()?.running).toBe(true);
        order.push(`${id}:${exportQueue()?.at} of ${exportQueue()?.of}`);
        if (fail) throw new Error("No video file.");
      },
    });
    await exportAll([run("a"), run("b", true), run("c")]);
    expect(order).toEqual(["a:1 of 3", "b:2 of 3", "c:3 of 3"]);
    const q = exportQueue()!;
    expect(q.running).toBe(false);
    expect(q.failed.b).toBe("No video file.");
    // no startExport ran here, so nothing was made
    expect(q.failed.a).toBe("The export did not finish.");
  });

  it("stops after the export running when asked", async () => {
    const ran: string[] = [];
    const runs = ["a", "b", "c"].map((id) => ({ id, run: async () => { ran.push(id); if (id === "a") stopExportQueue(); } }));
    await exportAll(runs);
    expect(ran).toEqual(["a"]);
    expect(exportQueue()).toMatchObject({ at: 1, of: 3, ids: ["a", "b", "c"], running: false, stopping: true });
  });

  it("checks each file it made before the next export starts, by the run's id, and notes a check that breaks", async () => {
    // a made file: startExport's fast route (mocked above) hands back a blob, delivered under the version's name
    vi.stubGlobal("document", { querySelector: () => ({}), fonts: { load: async () => [] }, createElement: () => ({ click() {} }) });
    // both exports start in the same millisecond, as the mocked fast route often does
    const now = vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
    const order: string[] = [];
    const run = (id: string) => ({
      id,
      run: async () => { order.push(`export ${id}`); await startExport(`Budget tips ${id}`, new Blob(["v"]), [], defaultSettings()); },
      check: async (made: ExportJob) => {
        order.push(`check ${made.name}`);
        if (id === "b") throw new Error("decode failed");
        return { issues: [{ id: "quiet" as const, text: "Quiet" }], read: true };
      },
    });
    await exportAll([run("a"), run("b")]);
    vi.unstubAllGlobals();
    now.mockRestore();
    expect(order).toEqual(["export a", "check Budget tips a", "export b", "check Budget tips b"]);
    const q = exportQueue()!;
    expect(Object.keys(q.files)).toEqual(["a", "b"]);
    expect(q.checks.a).toEqual({ issues: [{ id: "quiet", text: "Quiet" }], read: true });
    expect(q.checks.b).toEqual({ issues: [], read: false });
  });

  it("refuses a second run while one is going", async () => {
    let release = () => {};
    const first = exportAll([{ id: "a", run: () => new Promise<void>((r) => (release = r)) }]);
    await expect(exportAll([{ id: "b", run: async () => {} }])).rejects.toThrow("An export is already running.");
    release();
    await first;
  });
});

describe("handToEditor", () => {
  it("leaves a done join that endJoin gives to the editor once, with the same extra", async () => {
    const file = new File(["clip"], "mine.mp4", { type: "video/mp4" });
    const extra: JoinExtra = { settings: { wall: true, trimEnd: 12 }, toast: "Your wall of text is ready. Export it when it looks right.", caption: "Cap." };
    await handToEditor(file, extra);
    expect(currentJoin()).toMatchObject({ state: "done", progress: 1, file });
    const j = endJoin();
    expect(j?.file).toBe(file);
    expect(j?.extra).toBe(extra);
    expect(endJoin()).toBeNull();
  });

  it("waits while another video waits for the editor, so a paid one is never overwritten", async () => {
    vi.useFakeTimers();
    try {
      const paid = new File(["avatar"], "avatar.mp4");
      const mine = new File(["clip"], "mine.mp4");
      await handToEditor(paid, { note: "paid" });
      let handed = false;
      const second = handToEditor(mine, { note: "mine" }).then(() => (handed = true));
      await vi.advanceTimersByTimeAsync(3000);
      expect(handed).toBe(false);
      expect(endJoin()?.file).toBe(paid);
      await vi.advanceTimersByTimeAsync(1000);
      await second;
      expect(endJoin()?.extra?.note).toBe("mine");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("pickupPlan", () => {
  const PATHS: PickupPath[] = ["wall", "long", "no-captions", "captions"];
  const source = { kind: "ad", id: "a1", title: "An ad", remixedAt: "2026-10-20T00:00:00.000Z" } as unknown as NonNullable<JoinExtra["source"]>;
  const full: JoinExtra = { toast: "Your talking head is ready", note: "The person is made by AI.", caption: "Cap.", source, draftId: "d1", tab: "face", settings: { captions: false } };

  it("keeps the toast, caption, source, draftId and tab of a hand-off on every path", () => {
    for (const path of PATHS) {
      expect(pickupPlan(full, path)).toEqual({
        keep: { caption: "Cap.", source, draftId: "d1" },
        toast: { title: "Your talking head is ready", description: "The person is made by AI." },
        tab: "face",
      });
    }
  });

  it("asks nothing of an upload with no extra, or a start panel's wall with only its look", () => {
    for (const path of PATHS) {
      expect(pickupPlan(undefined, path)).toEqual({ keep: {}, toast: null });
      expect(pickupPlan({ settings: { wall: true } }, path)).toEqual({ keep: {}, toast: null });
    }
  });

  it("titles a montage's note as it always has, and only on the path with no captions", () => {
    expect(pickupPlan({ note: "No clip fit beat 2, so beat 1 plays longer." }, "no-captions").toast).toEqual({ title: "Your montage is ready", description: "No clip fit beat 2, so beat 1 plays longer." });
    for (const path of ["wall", "long", "captions"] as const) expect(pickupPlan({ note: "A note." }, path).toast).toBeNull();
  });

  it("keeps exactly today's fields on every path, with no key added", () => {
    for (const path of PATHS) {
      expect(pickupPlan(full, path).keep).toStrictEqual({ caption: "Cap.", source, draftId: "d1" });
      expect(pickupPlan(undefined, path)).toStrictEqual({ keep: {}, toast: null });
      expect(pickupPlan({ settings: { wall: true } }, path)).toStrictEqual({ keep: {}, toast: null });
    }
  });

  it("keeps the AI mark on every path, and nothing for a junk one", () => {
    const ai = { kind: "avatar", person: "presenter", who: "p-1", voice: "premade", voiceId: "alice", madeAt: "2026-10-21T09:15:00.000Z" } as const;
    for (const path of PATHS) {
      expect(pickupPlan({ ...full, ai }, path).keep).toStrictEqual({ caption: "Cap.", source, draftId: "d1", ai });
      expect(pickupPlan({ ai }, path)).toStrictEqual({ keep: { ai }, toast: null });
      for (const junk of [{ kind: "avatar" }, { kind: "swap", madeAt: ai.madeAt }, "avatar", 5, null])
        expect(pickupPlan({ ...full, ai: junk } as unknown as JoinExtra, path).keep).toStrictEqual({ caption: "Cap.", source, draftId: "d1" });
    }
    // a bad field inside a good mark is dropped on the way to the project
    expect(pickupPlan({ ai: { ...ai, voiceId: "rachel" } } as unknown as JoinExtra, "captions").keep.ai).not.toHaveProperty("voiceId");
  });

  it("drops junk read back from a pending clip's JSON, and leaves the default tab out of the URL", () => {
    const junk = { toast: 5, note: "", caption: "", source: "ad:1", draftId: 7, tab: "nope" } as unknown as JoinExtra;
    expect(pickupPlan(junk, "captions")).toEqual({ keep: {}, toast: null });
    expect(pickupPlan({ tab: "style", toast: "Ready" }, "captions")).toEqual({ keep: {}, toast: { title: "Ready" } });
  });
});

describe("slidePlan", () => {
  it("places each scene on the voiceover's clock, loops a clip shorter than its scene and plays a longer one through", () => {
    expect(slidePlan([{ seconds: 3 }, { seconds: 4, length: 2.5 }, { seconds: 2, length: 6 }, { seconds: 1.5, length: 1.5 }])).toEqual([
      { start: 0, end: 3, loop: false },
      { start: 3, end: 7, loop: true },
      { start: 7, end: 9, loop: false },
      { start: 9, end: 10.5, loop: false },
    ]);
  });

  it("never loops a clip whose length the browser can't read", () => {
    expect(slidePlan([{ seconds: 4, length: Infinity }, { seconds: 4, length: NaN }]).map((s) => s.loop)).toEqual([false, false]);
  });
});

/** A 2D context that takes every call and draws nothing, on a 1080x1920 canvas. */
function nullContext(): CanvasRenderingContext2D {
  const ctx: CanvasRenderingContext2D = new Proxy({} as CanvasRenderingContext2D, {
    get: (_, k) =>
      k === "canvas" ? { width: 1080, height: 1920 }
      : k === "measureText" ? () => ({ width: 10 })
      : k === "createLinearGradient" || k === "createRadialGradient" ? () => ({ addColorStop: () => {} })
      : () => ctx,
    set: () => true,
  });
  return ctx;
}

describe("drawFrame's effects", () => {
  const settings = { ...defaultSettings("bold"), captions: false, hook: "", progressBar: false, punchIn: false };
  const frame = (fx: Frame["fx"], backdrop?: CanvasImageSource | null): Frame => ({
    video: { videoWidth: 1080, videoHeight: 1920 } as HTMLVideoElement,
    settings,
    ...planFor([], 10, settings),
    src: 3,
    out: 2.5,
    total: 10,
    fx,
    backdrop,
  });

  it("hands the effects the time on the edited timeline and the backdrop's frame", () => {
    const fx = vi.fn();
    const behind = { videoWidth: 720, videoHeight: 1280 } as unknown as CanvasImageSource;
    drawFrame(nullContext(), frame(fx, behind));
    expect(fx).toHaveBeenCalledTimes(1);
    expect(fx.mock.calls[0][1]).toEqual({ x: 0, y: 0, w: 1080, h: 1920 });
    expect(fx.mock.calls[0][2]).toBe(2.5);
    expect(fx.mock.calls[0][3]).toBe(behind);
  });

  it("still runs an effect written for two arguments", () => {
    const seen: number[] = [];
    const two = (_g: CanvasRenderingContext2D, r: { w: number }) => void seen.push(r.w);
    drawFrame(nullContext(), frame(two));
    expect(seen).toEqual([1080]);
  });
});

describe("syncBackdrop", () => {
  const el = (o: Partial<{ duration: number; currentTime: number; paused: boolean; videoWidth: number }>) => {
    const v = { duration: 4, currentTime: 0, paused: true, videoWidth: 720, play: vi.fn(async () => { v.paused = false; }), pause: vi.fn(() => { v.paused = true; }), ...o };
    return v;
  };

  it("loops the video on the edit's clock, exact while paused", () => {
    const v = el({ currentTime: 0 });
    expect(syncBackdrop(v as unknown as HTMLVideoElement, 9.5, false)).toBe(v);
    expect(v.currentTime).toBe(1.5);
    v.currentTime = 1.53;
    syncBackdrop(v as unknown as HTMLVideoElement, 9.5, false);
    expect(v.currentTime).toBe(1.53);
    v.currentTime = 1.6;
    syncBackdrop(v as unknown as HTMLVideoElement, 9.5, false);
    expect(v.currentTime).toBe(1.5);
    expect(v.play).not.toHaveBeenCalled();
  });

  it("lets a playing video run within a quarter second, plays it, and pauses it when the edit stops", () => {
    const v = el({ currentTime: 1.3 });
    syncBackdrop(v as unknown as HTMLVideoElement, 5.5, true);
    expect(v.currentTime).toBe(1.3);
    expect(v.play).toHaveBeenCalled();
    syncBackdrop(v as unknown as HTMLVideoElement, 6.5, true);
    expect(v.currentTime).toBe(2.5);
    syncBackdrop(v as unknown as HTMLVideoElement, 6.5, false);
    expect(v.pause).toHaveBeenCalled();
  });

  it("gives nothing until the video has a length and a frame", () => {
    expect(syncBackdrop(null, 1, false)).toBeNull();
    expect(syncBackdrop(el({ duration: NaN }) as unknown as HTMLVideoElement, 1, false)).toBeNull();
    expect(syncBackdrop(el({ videoWidth: 0 }) as unknown as HTMLVideoElement, 1, false)).toBeNull();
  });
});

describe("an extra added to another format's join", () => {
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });
  });
  const TALK = "Your talking head video is ready. Export it when it looks right.";
  const base: JoinExtra = { toast: TALK, caption: "Cap.", note: "The person is made by AI.", settings: { volume: 1 } };
  const add: JoinExtra = { toast: "Your green screen is ready. Export it when it looks right.", tab: "face", settings: { backdrop: { kind: "video", key: "bd-gs-1abc" }, stand: "corner" } };

  it("lays the settings over the join's own and replaces the rest", () => {
    expect(mergeExtra(base, add)).toEqual({
      toast: add.toast, caption: "Cap.", note: "The person is made by AI.", tab: "face",
      settings: { volume: 1, backdrop: { kind: "video", key: "bd-gs-1abc" }, stand: "corner" },
    });
    expect(mergeExtra(undefined, { tab: "face" })).toEqual({ tab: "face" });
  });

  it("goes to the join with the same name and toast, once", () => {
    addToJoin("Three habits that keep you", TALK, add, 1000);
    expect(withJoinAdd("Another script", base, 2000)).toBe(base);
    expect(withJoinAdd("Three habits that keep you", { ...base, toast: "Your hook and demo are ready." }, 2000)?.tab).toBeUndefined();
    expect(withJoinAdd("Three habits that keep you", base, 2000)).toEqual(mergeExtra(base, add));
    expect(joinAdd(2000)).toBeNull();
    expect(withJoinAdd("Three habits that keep you", base, 2000)).toBe(base);
  });

  it("is forgotten after 7 days, and junk in storage is nothing", () => {
    addToJoin("Talking head", TALK, add, 0);
    expect(joinAdd(6 * 864e5)?.name).toBe("Talking head");
    expect(withJoinAdd("Talking head", base, 7 * 864e5)).toBe(base);
    store.set("cs-join-add", "{nope");
    expect(joinAdd()).toBeNull();
  });
});

describe("seek", () => {
  // a <video> as loadVideo hands it over: at 0 with readyState 1 (no picture decoded), and a seek that decodes one
  const fakeVideo = (readyState: number) => {
    const v = Object.assign(new EventTarget(), { readyState, at: 0, seeks: 0 });
    Object.defineProperty(v, "currentTime", {
      get: () => v.at,
      set: (t: number) => {
        v.seeks++;
        v.at = t;
        setTimeout(() => {
          v.readyState = 4;
          v.dispatchEvent(new Event("seeked"));
        });
      },
    });
    return v as typeof v & HTMLVideoElement;
  };

  it("waits for the picture of a fresh video already at the time, so a join's first frame is not black", async () => {
    const v = fakeVideo(1);
    await seek(v, 0);
    expect(v.seeks).toBe(1);
    expect(v.readyState).toBe(4);
  });

  it("does not seek again when the picture at that time is already there", async () => {
    const v = fakeVideo(4);
    await seek(v, 0.005);
    expect(v.seeks).toBe(0);
  });
});

describe("startSound", () => {
  const fakeCtx = (heldFirst: boolean) => {
    const ctx = { state: "suspended", resumes: 0, resume() {
      ctx.resumes++;
      if (heldFirst && ctx.resumes === 1) return new Promise<void>(() => {}); // Chrome with no click behind it
      ctx.state = "running";
      return Promise.resolve();
    } };
    return ctx;
  };

  it("starts at once when a click is behind it, and asks for nothing", async () => {
    const seen: (string | undefined)[] = [];
    const off = onJoinJob((j) => seen.push(j?.waiting));
    const ctx = fakeCtx(false);
    await startSound(ctx as unknown as AudioContext, 10);
    off();
    expect(ctx.resumes).toBe(1);
    expect(seen).not.toContain(TAP_TO_FINISH);
  });

  it("asks for a tap when the browser holds the sound after a reload, and starts it on the tap", async () => {
    const page = new EventTarget();
    vi.stubGlobal("window", page);
    const seen: (string | undefined)[] = [];
    const off = onJoinJob((j) => seen.push(j?.waiting));
    const ctx = fakeCtx(true);
    const started = startSound(ctx as unknown as AudioContext, 10);
    await new Promise((r) => setTimeout(r, 30));
    expect(seen).toContain(TAP_TO_FINISH);
    page.dispatchEvent(new Event("pointerdown"));
    await started;
    off();
    vi.unstubAllGlobals();
    expect(ctx.resumes).toBe(2);
    expect(ctx.state).toBe("running");
    expect(seen.at(-1)).toBeUndefined();
  });
});

// A 2D context that records what is painted: each font set, each text written, each picture drawn and each fill.
function paintLog() {
  const log = { fonts: [] as string[], texts: [] as string[], images: [] as unknown[], fills: [] as string[] };
  const state: Record<string, unknown> = { canvas: { width: 1080, height: 1920 } };
  const g = new Proxy(state, {
    get: (t, k) => {
      if (k in t) return t[k as string];
      if (k === "measureText") return (x: string) => ({ width: x.length * 20 });
      if (k === "fillText") return (x: string) => log.texts.push(x);
      if (k === "drawImage") return (img: unknown) => log.images.push(img);
      if (k === "fillRect") return () => log.fills.push(String(t.fillStyle));
      return () => {};
    },
    set: (t, k, v) => {
      if (k === "font") log.fonts.push(v);
      t[k as string] = v;
      return true;
    },
  });
  return { g: g as unknown as CanvasRenderingContext2D, log };
}

describe("the brand kit's cards on video (brand-kit)", () => {
  const LOGO = { naturalWidth: 400, naturalHeight: 200 } as HTMLImageElement;
  const PHOTO = { naturalWidth: 256, naturalHeight: 256 } as HTMLImageElement;
  const art: BrandArt = { name: "Activity Tracker", handle: "@activitytracker", role: "Adviser", color: "#1E3A8A", line: "DM me PLAN" };

  it("writes the end card in DM Sans exactly as before when there is no brand font", () => {
    const { g, log } = paintLog();
    drawEndCard(g, art, 1);
    expect(log.fonts).toEqual([
      '800 76px "DM Sans", Inter, system-ui, sans-serif',
      '600 44px "DM Sans", Inter, system-ui, sans-serif',
      '500 38px "DM Sans", Inter, system-ui, sans-serif',
      '700 40px "DM Sans", Inter, system-ui, sans-serif',
    ]);
  });

  it("writes the end card in the brand font first, DM Sans behind it", () => {
    const { g, log } = paintLog();
    drawEndCard(g, { ...art, font: "BrandFont" }, 1);
    expect(log.fonts).toHaveLength(4);
    for (const f of log.fonts) expect(f).toMatch(/^\d00 \d+px "BrandFont", "DM Sans", Inter, system-ui, sans-serif$/);
  });

  it("opens on the brand colour with the logo over the name, in the brand font", () => {
    const { g, log } = paintLog();
    drawIntroCard(g, { ...art, logo: LOGO, photo: PHOTO, font: "BrandFont" }, 1);
    expect(log.fills[0]).toBe("#1E3A8A");
    expect(log.images).toEqual([LOGO]);
    expect(log.texts).toEqual(["Activity Tracker"]);
    expect(log.fonts).toEqual(['800 80px "BrandFont", "DM Sans", Inter, system-ui, sans-serif']);
  });

  it("shows the photo when there is no logo, and only the colour and name with neither", () => {
    const withPhoto = paintLog();
    drawIntroCard(withPhoto.g, { ...art, photo: PHOTO }, 0.5);
    expect(withPhoto.log.images).toEqual([PHOTO]);
    const bare = paintLog();
    drawIntroCard(bare.g, art, 0.5);
    expect(bare.log.images).toEqual([]);
    expect(bare.log.texts).toEqual(["Activity Tracker"]);
  });

  it("carries Leo's brand font into the art, and nothing for everyone else", async () => {
    const kit = { color: "#1E3A8A", name: "Activity Tracker", handle: "" };
    kitFont.font = undefined;
    expect(await loadBrandArt(kit)).not.toHaveProperty("font");
    kitFont.font = "BrandFont";
    expect(await loadBrandArt(kit)).toMatchObject({ font: "BrandFont" });
    kitFont.font = undefined;
  });

  it("lets the intro card be drawn only from art loaded on Leo's sign-in", async () => {
    const kit = { color: "#1E3A8A", name: "Activity Tracker", handle: "" };
    signIn.leo = null;
    expect(await loadBrandArt(kit)).not.toHaveProperty("intro");
    signIn.leo = { id: "leo", email: "leo@example.com" };
    expect(await loadBrandArt(kit)).toMatchObject({ intro: true });
    signIn.leo = null;
  });
});
