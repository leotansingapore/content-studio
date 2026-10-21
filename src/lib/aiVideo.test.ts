import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/edgeFn", () => ({ callFn: vi.fn() }));
vi.mock("@/lib/videoMedia", () => ({ currentJoin: vi.fn(() => null), getFile: vi.fn(async () => undefined), monoPcm: vi.fn(), startJoin: vi.fn(async () => {}), startSlides: vi.fn(async () => {}), encodeWav: vi.fn() }));
vi.mock("@/lib/textVoice", () => ({ audioSeconds: vi.fn(async () => 30), speak: vi.fn(async () => new Blob(["mp3"])) }));

import { callFn } from "@/lib/edgeFn";
import { currentJoin, getFile, startJoin, startSlides, type JoinExtra, type JoinJob } from "@/lib/videoMedia";
import { DEMO_GONE, aiBusy, aiJob, makeAvatar, makeExplainer, makePresenter, makeTemplateClip, pendingAvatar, resumeAvatar } from "./aiVideo";

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
