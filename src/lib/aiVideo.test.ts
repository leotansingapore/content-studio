import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/edgeFn", () => ({ callFn: vi.fn() }));
vi.mock("@/lib/videoMedia", () => ({ currentJoin: vi.fn(() => null), monoPcm: vi.fn(), startJoin: vi.fn(async () => {}), startSlides: vi.fn(async () => {}), encodeWav: vi.fn() }));
vi.mock("@/lib/textVoice", () => ({ audioSeconds: vi.fn(async () => 30), speak: vi.fn() }));

import { callFn } from "@/lib/edgeFn";
import { currentJoin, startJoin, type JoinJob } from "@/lib/videoMedia";
import { aiBusy, aiJob, makeTemplateClip, pendingAvatar, resumeAvatar } from "./aiVideo";

const ASK = { template: "food-asmr", seconds: 4 as const, quality: "480p" as const, fields: { product: "Laksa" }, photo: null };
type Body = { mode: string; refund?: string };
// the start hands back one job and a refund ticket; every status check answers with `status`
const higgsfield = (status: (n: number) => unknown) => {
  let n = 0;
  vi.mocked(callFn).mockImplementation(async (_fn, body) => {
    if ((body as Body).mode === "template") return { tokens: ["t1"], refund: "ticket" };
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
