import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/edgeFn", () => ({ callFn: vi.fn() }));
vi.mock("@/lib/videoMedia", () => ({
  currentJoin: vi.fn(() => null), getFile: vi.fn(async () => undefined), putFile: vi.fn(async () => {}), deleteFile: vi.fn(async () => {}), monoPcm: vi.fn(),
  startJoin: vi.fn(async () => {}), startSlides: vi.fn(async () => {}), encodeWav: vi.fn(),
}));
vi.mock("@/lib/textVoice", () => ({ audioSeconds: vi.fn(async () => 30), speak: vi.fn(async () => new Blob(["mp3"])) }));

import { callFn } from "@/lib/edgeFn";
import { currentJoin, deleteFile, getFile, putFile, startJoin, startSlides, type JoinExtra, type JoinJob } from "@/lib/videoMedia";
import {
  DEMO_GONE, aiBusy, aiJob, makeAvatar, makeExplainer, makePresenter, makeTemplateClip, onAiJob, pendingAvatar, pendingExplainer, resumeAvatar, resumeExplainer,
} from "./aiVideo";

const ASK = { template: "food-asmr", seconds: 4 as const, quality: "480p" as const, fields: { product: "Laksa" }, photo: null };
type Body = { mode: string; refund?: string };
// the start hands back one job and a refund ticket; every status check answers with `status`
const higgsfield = (status: (n: number) => unknown) => {
  let n = 0;
  vi.mocked(callFn).mockImplementation(async (_fn, body) => {
    if ((body as Body).mode === "template" || (body as Body).mode === "avatar") return { tokens: ["t1"], refund: "ticket" };
    const r = status(++n);
    if (r instanceof Error) throw r;
    return r;
  });
};
const statusChecks = () => vi.mocked(callFn).mock.calls.filter(([, b]) => (b as Body).mode === "status");

beforeEach(() => {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
  vi.useFakeTimers();
  vi.mocked(callFn).mockReset();
  vi.mocked(startJoin).mockReset();
  vi.mocked(startSlides).mockReset();
  vi.mocked(getFile).mockReset().mockResolvedValue(undefined);
  vi.mocked(currentJoin).mockReset().mockReturnValue(null);
  vi.mocked(putFile).mockReset().mockResolvedValue(undefined);
  vi.mocked(deleteFile).mockReset().mockResolvedValue(undefined);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("a template clip that has been paid for", () => {
  it("is kept on the device when it is only slow, so Try again at no cost picks it up after 20 minutes", async () => {
    higgsfield(() => ({ jobs: [{ state: "working" }] }));
    const run = makeTemplateClip("Laksa", ASK);
    await vi.advanceTimersByTimeAsync(21 * 60_000);
    await run;
    expect(aiJob()).toMatchObject({ kind: "template", state: "failed", error: "It's taking too long. Try again later." });
    expect(pendingAvatar()).toMatchObject({ name: "Laksa", tokens: ["t1"], kind: "template", refund: "ticket" });
  });

  it("is dropped when Higgsfield fails it, with the refund ticket on every status check", async () => {
    higgsfield((n) => ({ jobs: [n < 3 ? { state: "working" } : { state: "failed", error: "Blocked by the safety filter." }] }));
    const run = makeTemplateClip("Laksa", ASK);
    await vi.advanceTimersByTimeAsync(20_000);
    await run;
    expect(aiJob()).toMatchObject({ state: "failed", error: "Blocked by the safety filter." });
    expect(pendingAvatar()).toBeNull();
    expect(statusChecks()).toHaveLength(3);
    for (const [, b] of statusChecks()) expect(b).toMatchObject({ tokens: ["t1"], refund: "ticket" });
  });

  it("rides out a dropped status check, and keeps the job when the finished clip won't download", async () => {
    higgsfield((n) => (n === 1 ? new Error("offline") : { jobs: [{ state: "done", url: "https://cdn.example/v.mp4" }] }));
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false })));
    const run = makeTemplateClip("Laksa", ASK);
    await vi.advanceTimersByTimeAsync(11_000);
    await run;
    expect(statusChecks()).toHaveLength(2);
    expect(aiJob()).toMatchObject({ state: "failed", error: "It was made but didn't download. Try again." });
    expect(pendingAvatar()).toMatchObject({ tokens: ["t1"] });
    expect(startJoin).not.toHaveBeenCalled();
  });
});

describe("the parts counter while a video is made", () => {
  it("shows the most parts seen done, never stepping back when a status check answers behind the last", async () => {
    // wave 2's live check: 1 of 2, then 0 of 2, then 1 of 2
    const done = { state: "done", url: "https://cdn.example/v.mp4" };
    const working = { state: "working" };
    const answers = [[done, working], [working, working], [done, working], [working, done], [done, done]];
    let n = 0;
    vi.mocked(callFn).mockImplementation(async (_fn, body) => {
      if ((body as Body).mode === "avatar") return { tokens: ["t1", "t2"], refund: "ticket" };
      return { jobs: answers[Math.min(n++, answers.length - 1)] };
    });
    vi.stubGlobal("FileReader", class {
      result = "data:audio/wav;base64,AAAA";
      onload: () => void = () => {};
      readAsDataURL() { this.onload(); }
    });
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, blob: async () => new Blob(["clip"]) })));
    const steps: string[] = [];
    const off = onAiJob((j) => j?.step && steps.push(j.step));
    const run = makeAvatar("Talking head", "https://cdn.example/face.jpg", { pcm: new Float32Array(24000), seconds: 2, slices: [{ start: 0, end: 1 }, { start: 1, end: 2 }] });
    await vi.advanceTimersByTimeAsync(26_000);
    await run;
    off();
    const counts = steps.flatMap((s) => /Making your video, (\d) of 2/.exec(s)?.[1] ?? []).map(Number);
    expect(counts).toEqual([0, 1, 1, 1, 1]);
    expect(aiJob()).toMatchObject({ kind: "avatar", state: "done" });
  });
});

describe("a paid clip being put together on the device", () => {
  // the join runs until `finish` is called with how it ended
  const slowJoin = () => {
    let finish: (j: JoinJob) => void = () => {};
    vi.mocked(startJoin).mockImplementation(() => new Promise((r) => (finish = (j) => {
      vi.mocked(currentJoin).mockReturnValue(j);
      r();
    })));
    return (j: JoinJob) => finish(j);
  };
  const madeAndJoining = async () => {
    higgsfield(() => ({ jobs: [{ state: "done", url: "https://cdn.example/v.mp4" }] }));
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, blob: async () => new Blob(["clip"]) })));
    const run = makeTemplateClip("Laksa", ASK);
    await vi.advanceTimersByTimeAsync(6_000);
    expect(startJoin).toHaveBeenCalledTimes(1);
    return { run }; // wrapped: an async function returning the promise would wait for it
  };

  it("keeps the paid job until the join is done, and a remount starts no second join", async () => {
    const finish = slowJoin();
    const { run } = await madeAndJoining();
    expect(pendingAvatar()).toMatchObject({ tokens: ["t1"] });
    expect(aiBusy()).toBe(true);
    resumeAvatar(); // AiVideo mounted again while the join runs
    await vi.advanceTimersByTimeAsync(6_000);
    expect(startJoin).toHaveBeenCalledTimes(1);
    finish({ progress: 1, state: "done" });
    await run;
    expect(pendingAvatar()).toBeNull();
    expect(aiJob()).toMatchObject({ kind: "template", state: "done" });
  });

  it("keeps the paid job when the join fails, so Try again at no cost joins the clips again", async () => {
    const finish = slowJoin();
    const { run } = await madeAndJoining();
    finish({ progress: 0, state: "failed", error: "This browser can't record video." });
    await run;
    expect(aiJob()).toMatchObject({ kind: "template", state: "failed", error: "This browser can't record video." });
    expect(pendingAvatar()).toMatchObject({ tokens: ["t1"] });
  });
});

describe("a format's hand-off riding a paid clip", () => {
  const extra: JoinExtra = { toast: "Your hook and demo are ready", note: "Check the hook.", caption: "Cap.", draftId: "d1", tab: "stickers", settings: { captions: false } };
  const after = [{ key: "demo-1", end: 12.5 }, { key: "demo-2", end: 3 }];
  const made = () => {
    higgsfield(() => ({ jobs: [{ state: "done", url: "https://cdn.example/v.mp4" }] }));
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, blob: async () => new Blob(["clip"]) })));
  };

  it("keeps extra and after through the device's JSON, and joins the clip, then each take in order, with the extra", async () => {
    made();
    const demo1 = new Blob(["demo one"]);
    const demo2 = new Blob(["demo two"]);
    vi.mocked(getFile).mockImplementation(async (k) => (k === "demo-1" ? demo1 : k === "demo-2" ? demo2 : undefined));
    let kept: unknown = null;
    vi.mocked(startJoin).mockImplementation(async () => void (kept = pendingAvatar()));
    const run = makeTemplateClip("Hook", { ...ASK, template: "spoken-hook" }, { extra, after });
    await vi.advanceTimersByTimeAsync(6_000);
    await run;
    // read back from localStorage while the join ran: the same extra and takes, nothing lost to JSON
    expect(kept).toEqual({ name: "Hook", tokens: ["t1"], seconds: [4], kind: "template", refund: "ticket", extra, after });
    const [name, takes, label, opts] = vi.mocked(startJoin).mock.calls[0];
    expect(name).toBe("Hook");
    expect(takes.map((t) => [t.file, t.start, t.end])).toEqual([[expect.any(Blob), 0, 4], [demo1, 0, 12.5], [demo2, 0, 3]]);
    expect(label).toBe("Putting your video together");
    expect(opts).toEqual({ extra });
    expect(pendingAvatar()).toBeNull();
  });

  it("keeps an AI mark and a take's start through the device's JSON, and joins that take from its start", async () => {
    made();
    const ai = { kind: "avatar", person: "presenter", who: "p-1", voice: "premade", voiceId: "alice", madeAt: "2026-10-21T09:15:00.000Z" } as const;
    const marked: JoinExtra = { ...extra, ai };
    const windowed = [{ key: "demo-1", start: 7.5, end: 19 }, { key: "demo-2", end: 3 }];
    const demo1 = new Blob(["demo one"]);
    vi.mocked(getFile).mockImplementation(async (k) => (k === "demo-1" ? demo1 : k === "demo-2" ? new Blob(["demo two"]) : undefined));
    let kept: unknown = null;
    vi.mocked(startJoin).mockImplementation(async () => void (kept = pendingAvatar()));
    const run = makeTemplateClip("Hook", { ...ASK, template: "spoken-hook" }, { extra: marked, after: windowed });
    await vi.advanceTimersByTimeAsync(6_000);
    await run;
    expect(kept).toEqual({ name: "Hook", tokens: ["t1"], seconds: [4], kind: "template", refund: "ticket", extra: marked, after: windowed });
    const [, takes, , opts] = vi.mocked(startJoin).mock.calls[0];
    expect(takes.map((t) => [t.start, t.end])).toEqual([[0, 4], [7.5, 19], [0, 3]]);
    expect(takes[1].file).toBe(demo1);
    expect(opts).toEqual({ extra: marked });
  });

  it("plays a take from 0 when its start read back from JSON isn't a place before its end", async () => {
    made();
    vi.mocked(getFile).mockResolvedValue(new Blob(["demo"]));
    const after = [{ key: "a", start: 12, end: 12 }, { key: "b", start: 20, end: 9 }, { key: "c", start: -3, end: 9 }, { key: "d", start: "4", end: 9 }, { key: "e", start: null, end: 9 }];
    localStorage.setItem("cs-ai-video-pending", JSON.stringify({ name: "Hook", tokens: ["t1"], seconds: [4], kind: "template", after }));
    resumeAvatar();
    await vi.advanceTimersByTimeAsync(6_000);
    expect(vi.mocked(startJoin).mock.calls[0][1].map((t) => t.start)).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it("resumes an avatar video saved before the AI mark with the extra it had", async () => {
    made();
    localStorage.setItem("cs-ai-video-pending", JSON.stringify({ name: "Talking head", tokens: ["t1", "t2"], seconds: [9.5, 4], refund: "ticket", extra }));
    vi.mocked(callFn).mockImplementation(async () => ({ jobs: [{ state: "done", url: "https://cdn.example/1.mp4" }, { state: "done", url: "https://cdn.example/2.mp4" }] }));
    resumeAvatar();
    await vi.advanceTimersByTimeAsync(6_000);
    const [name, takes, , opts] = vi.mocked(startJoin).mock.calls[0];
    expect(name).toBe("Talking head");
    expect(takes.map((t) => [t.start, t.end])).toEqual([[0, 9.5], [0, 4]]);
    expect(opts).toStrictEqual({ extra });
    expect(pendingAvatar()).toBeNull();
  });

  it("keeps the paid clip pending when a take is gone from this device, and joins once it is back", async () => {
    made();
    vi.mocked(getFile).mockImplementation(async (k) => (k === "demo-1" ? new Blob(["demo"]) : undefined));
    const run = makeTemplateClip("Hook", ASK, { extra, after });
    await vi.advanceTimersByTimeAsync(6_000);
    await run;
    expect(aiJob()).toMatchObject({ kind: "template", state: "failed", error: DEMO_GONE });
    expect(pendingAvatar()).toMatchObject({ tokens: ["t1"], after });
    expect(startJoin).not.toHaveBeenCalled();
    // the demo picked again under its key: Try again joins at no new cost
    vi.mocked(getFile).mockResolvedValue(new Blob(["demo"]));
    resumeAvatar();
    await vi.advanceTimersByTimeAsync(6_000);
    expect(startJoin).toHaveBeenCalledTimes(1);
    expect(vi.mocked(callFn).mock.calls.filter(([, b]) => (b as Body).mode === "template")).toHaveLength(1);
  });

  it("resumes a clip saved before extra and after existed exactly as before", async () => {
    made();
    localStorage.setItem("cs-ai-video-pending", JSON.stringify({ name: "Old", tokens: ["t9"], seconds: [8], kind: "template" }));
    resumeAvatar();
    await vi.advanceTimersByTimeAsync(6_000);
    const [name, takes, , opts] = vi.mocked(startJoin).mock.calls[0];
    expect(name).toBe("Old");
    expect(takes.map((t) => t.end)).toEqual([8]);
    expect(opts).toEqual({ extra: undefined });
    expect(getFile).not.toHaveBeenCalled();
  });

  it("carries an avatar's extra, an explainer's extra and a presenter's setting", async () => {
    made();
    vi.stubGlobal("FileReader", class {
      result = "data:audio/wav;base64,AAAA";
      onload: () => void = () => {};
      readAsDataURL() { this.onload(); }
    });
    const run = makeAvatar("Talking head", "https://cdn.example/face.jpg", { pcm: new Float32Array(24000), seconds: 1, slices: [{ start: 0, end: 1 }] }, extra);
    await vi.advanceTimersByTimeAsync(6_000);
    await run;
    expect(vi.mocked(startJoin).mock.calls[0][3]).toEqual({ extra });

    vi.mocked(callFn).mockReset().mockImplementation(async (_fn, body) => {
      const mode = (body as Body).mode;
      return mode === "explainer" ? { tokens: ["p1"] } : mode === "presenter" ? { token: "f1" } : { jobs: [{ state: "done", url: "https://cdn.example/p.png" }] };
    });
    const explainer = makeExplainer("Explainer", [{ say: "One.", picture: "A desk." }] as never, "rachel" as never, extra);
    await vi.advanceTimersByTimeAsync(6_000);
    await explainer;
    expect(vi.mocked(startSlides).mock.calls[0][4]).toEqual({ extra });

    for (const setting of ["car", undefined]) {
      const presenter = makePresenter("A Malay Singaporean man", setting);
      await vi.advanceTimersByTimeAsync(6_000);
      await presenter;
    }
    const bodies = vi.mocked(callFn).mock.calls.map(([, b]) => b as Record<string, unknown>).filter((b) => b.mode === "presenter");
    // no setting sends today's body, which the server reads as the office
    expect(bodies).toEqual([{ mode: "presenter", look: "A Malay Singaporean man", setting: "car" }, { mode: "presenter", look: "A Malay Singaporean man" }]);
  });
});

describe("a narrated video (Leo's explainer with stock clips, a look and moving scenes)", () => {
  const SCENES = [1, 2, 3, 4].map((n) => ({ say: `Line ${n} of the script.`, picture: `A clinic waiting room, scene ${n}` }));
  // a downloaded file says where it came from
  const fetched = () => vi.stubGlobal("fetch", vi.fn(async (u: string) => (u.includes("broken") ? { ok: false } : { ok: true, blob: async () => new Blob([u]) })));
  const text = (b: unknown) => (b as Blob).text();
  /** ai-video answers: the pictures, their status, the move and the moving clips' status (m2 fails). */
  const studio = (move: (string | null)[] = ["m1", "m2", "m3"]) =>
    vi.mocked(callFn).mockImplementation(async (_fn, body) => {
      const b = body as { mode: string; pictures?: string[]; tokens?: string[] };
      if (b.mode === "explainer") return { tokens: b.pictures!.map((_, i) => `p${i + 1}`), refund: "ticket" };
      if (b.mode === "move") return { tokens: move };
      return { jobs: b.tokens!.map((t) => (t === "m2" ? { state: "failed", error: "No." } : { state: "done", url: `https://cdn.example/${t}.${t[0] === "m" ? "mp4" : "png"}` })) };
    });
  const calls = (mode: string) => vi.mocked(callFn).mock.calls.map(([, b]) => b as Record<string, unknown>).filter((b) => b.mode === mode);
  const slides = async () => Promise.all(vi.mocked(startSlides).mock.calls[0][1].map(async (s) => [("video" in s ? "video " : "image ") + (await text("video" in s ? s.video : s.image)), Math.round(s.seconds * 10) / 10]));

  it("hands startSlides a moving clip per moved scene and the still for one that failed, polling the moves with no refund ticket", async () => {
    fetched();
    studio();
    const run = makeExplainer("Co-pays", SCENES, "eric" as never, { draftId: "d1" }, { look: "paper", move: true, stock: [null, "https://pexels.example/stock.mp4", null, null] });
    await vi.advanceTimersByTimeAsync(20_000);
    await run;
    // the stock scene takes no picture; the look rides the pictures and the move
    expect(calls("explainer")).toEqual([{ mode: "explainer", pictures: [SCENES[0].picture, SCENES[2].picture, SCENES[3].picture], look: "paper" }]);
    expect(calls("move")).toEqual([{ mode: "move", tokens: ["p1", "p2", "p3"], look: "paper" }]);
    const polls = calls("status");
    expect(polls[0]).toMatchObject({ tokens: ["p1", "p2", "p3"], refund: "ticket" });
    for (const poll of polls.slice(1)) {
      expect(poll.tokens).toEqual(["m1", "m2", "m3"]);
      expect(poll.refund).toBeUndefined();
    }
    expect((await slides()).map(([what]) => what)).toEqual([
      "video https://cdn.example/m1.mp4",
      "video https://pexels.example/stock.mp4",
      "image https://cdn.example/p2.png",
      "video https://cdn.example/m3.mp4",
    ]);
    // the voice's 30 s split by words, in order
    expect((await slides()).reduce((n, [, s]) => n + Number(s), 0)).toBeCloseTo(30);
    const [, , , label, opts] = vi.mocked(startSlides).mock.calls[0];
    expect(label).toBe("Putting your explainer together");
    expect(opts?.extra).toEqual({ draftId: "d1", note: "Scene 3 stayed still; it didn't come through as a moving clip.", toast: "Your narrated video is ready" });
    expect(aiJob()).toMatchObject({ kind: "explainer", state: "done" });
    expect(pendingExplainer()).toBeNull();
    expect(deleteFile).toHaveBeenCalledWith(vi.mocked(putFile).mock.calls[0][0]);
  });

  it("makes an all-stock video with no ai-video call at all, and gives a stock clip that won't download an AI picture first", async () => {
    fetched();
    studio();
    const run = makeExplainer("Stock", SCENES.slice(0, 3), "eric" as never, undefined, { stock: ["https://pexels.example/a.mp4", "https://pexels.example/b.mp4", "https://pexels.example/c.mp4"] });
    await vi.advanceTimersByTimeAsync(10_000);
    await run;
    expect(vi.mocked(callFn)).not.toHaveBeenCalled();
    expect(putFile).not.toHaveBeenCalled();
    expect((await slides()).map(([what]) => what)).toEqual(["video https://pexels.example/a.mp4", "video https://pexels.example/b.mp4", "video https://pexels.example/c.mp4"]);

    vi.mocked(startSlides).mockReset();
    const again = makeExplainer("Stock", SCENES.slice(0, 3), "eric" as never, undefined, { stock: ["https://pexels.example/a.mp4", "https://broken.example/b.mp4", null] });
    await vi.advanceTimersByTimeAsync(10_000);
    await again;
    expect(calls("explainer")).toEqual([{ mode: "explainer", pictures: [SCENES[1].picture, SCENES[2].picture] }]);
    expect(calls("move")).toEqual([]);
  });

  it("is kept on this device until it is put together, and a reload picks it up at no cost without moving it twice", async () => {
    fetched();
    studio();
    const voice = new Blob(["kept voice"]);
    vi.mocked(getFile).mockResolvedValue(voice);
    vi.mocked(startSlides).mockImplementation(async () => {
      vi.mocked(currentJoin).mockReturnValue({ progress: 0, state: "failed", error: "This browser can't record video." });
    });
    const run = makeExplainer("Co-pays", SCENES.slice(0, 3), "eric" as never, undefined, { move: true });
    await vi.advanceTimersByTimeAsync(20_000);
    await run;
    expect(aiJob()).toMatchObject({ kind: "explainer", state: "failed", error: "This browser can't record video." });
    const kept = pendingExplainer();
    expect(kept).toMatchObject({ name: "Co-pays", tokens: ["p1", "p2", "p3"], refund: "ticket", move: true, moved: ["m1", "m2", "m3"], voice: vi.mocked(putFile).mock.calls[0][0] });

    // a reload: the join works this time, with the kept voiceover and no new explainer or move
    vi.mocked(currentJoin).mockReturnValue(null);
    vi.mocked(startSlides).mockReset().mockResolvedValue(undefined);
    resumeExplainer();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(calls("explainer")).toHaveLength(1);
    expect(calls("move")).toHaveLength(1);
    expect(vi.mocked(startSlides).mock.calls[0][2]).toBe(voice);
    expect(aiJob()).toMatchObject({ kind: "explainer", state: "done" });
    expect(pendingExplainer()).toBeNull();
  });

  it("drops the kept video when Higgsfield fails a picture (its use came back), and leaves today's explainer unkept", async () => {
    fetched();
    vi.mocked(callFn).mockImplementation(async (_fn, body) => ((body as { mode: string }).mode === "explainer" ? { tokens: ["p1", "p2", "p3"], refund: "ticket" } : { jobs: [{ state: "failed", error: "Blocked." }] }));
    const run = makeExplainer("Co-pays", SCENES.slice(0, 3), "eric" as never, undefined, { look: "clay" });
    await vi.advanceTimersByTimeAsync(10_000);
    await run;
    expect(aiJob()).toMatchObject({ state: "failed", error: "Blocked." });
    expect(pendingExplainer()).toBeNull();
    expect(deleteFile).toHaveBeenCalled();

    vi.mocked(putFile).mockClear();
    studio();
    const today = makeExplainer("Today", SCENES.slice(0, 3), "eric" as never);
    await vi.advanceTimersByTimeAsync(10_000);
    await today;
    expect(putFile).not.toHaveBeenCalled();
    expect(calls("explainer").at(-1)).toEqual({ mode: "explainer", pictures: SCENES.slice(0, 3).map((s) => s.picture) });
  });
});
