import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({ sent: [] as Record<string, unknown>[], replies: [] as unknown[] }));
vi.mock("@/lib/edgeFn", async (real) => ({
  ...(await real<typeof import("./edgeFn")>()),
  callFn: async (_name: string, body: Record<string, unknown>) => {
    calls.sent.push(body);
    const r = calls.replies.shift();
    if (r instanceof Error) throw r;
    return r;
  },
}));
vi.mock("@/lib/supabase", () => ({ supabase: {}, SUPABASE_URL: "https://x.supabase.co" }));

import { DEFAULT_DIALS, DIAL_META, levelOf, runDesk, runRescript, saveScriptDraft, secondsOf, wordsOf } from "./scriptDesk";
import { loadDrafts } from "./draftHistory";
import { saveScriptContext } from "./scriptContext";

class MemStorage {
  s = new Map<string, string>();
  getItem(k: string) { return this.s.get(k) ?? null; }
  setItem(k: string, v: string) { this.s.set(k, v); }
  removeItem(k: string) { this.s.delete(k); }
  key(i: number) { return [...this.s.keys()][i] ?? null; }
  get length() { return this.s.size; }
}
beforeEach(() => {
  const storage = new MemStorage();
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("window", { localStorage: storage, dispatchEvent: () => true, addEventListener: () => {}, removeEventListener: () => {} });
  calls.sent.length = 0;
  calls.replies.length = 0;
});
afterEach(() => vi.unstubAllGlobals());

const UID = "u1";
const opts = (o: Record<string, unknown> = {}) => {
  let t = 0;
  return { userId: UID, sleep: async (ms: number) => void (t += ms), now: () => t, ...o };
};

describe("runDesk", () => {
  it("files the job with the brand's context, polls until the Mac answers, and says queued then claimed", async () => {
    saveScriptContext(UID, { me: { on: true, name: "Leo", handle: "", what: "", story: "", results: "$1m raised\n\n", beliefs: "", niche: "finance for founders" } });
    calls.replies.push({ job: "j1" }, { status: "queued" }, { status: "claimed" }, { status: "claimed" }, { status: "done", result: { hooks: [{ hook: "h", pattern: "p" }] } });
    const phases: string[] = [];
    const filed: string[] = [];
    const r = await runDesk<{ hooks: unknown[] }>({ action: "hooks", topic: "t" }, opts({ onPhase: (p: string) => phases.push(p), onFiled: (j: string) => filed.push(j) }));
    expect(r.hooks).toHaveLength(1);
    expect(phases).toEqual(["queued", "claimed"]);
    expect(filed).toEqual(["j1"]);
    const [first, ...polls] = calls.sent;
    expect(first).toMatchObject({ action: "hooks", topic: "t", brand: "me", context: { niche: "finance for founders", me: { name: "Leo", results: ["$1m raised"] }, avatar: null } });
    expect(polls.every((p) => p.action === "job" && p.id === "j1")).toBe(true);
  });

  it("sends Me and Product only while their switch is on", async () => {
    saveScriptContext(UID, { me: { on: false, name: "Leo", handle: "", what: "", story: "", results: "", beliefs: "", niche: "" } });
    calls.replies.push({ job: "j1" }, { status: "done", result: {} });
    await runDesk({ action: "hooks", topic: "t" }, opts());
    expect(calls.sent[0].context).toMatchObject({ me: null, product: expect.objectContaining({ name: "" }) });
  });

  it("throws the server's words for a failed job, and gives up after five minutes", async () => {
    calls.replies.push({ job: "j1" }, { status: "failed", error: "Your Mac didn't pick this up. Check the script worker is running on it, then try again." });
    await expect(runDesk({ action: "hooks", topic: "t" }, opts())).rejects.toThrow("Your Mac didn't pick this up");
    calls.replies.push({ job: "j2" }, ...Array.from({ length: 400 }, () => ({ status: "claimed" })));
    await expect(runDesk({ action: "hooks", topic: "t" }, opts())).rejects.toThrow("taking too long");
  });

  it("stops waiting when the page stops it", async () => {
    const stop = new AbortController();
    calls.replies.push({ job: "j1" });
    const p = runDesk({ action: "hooks", topic: "t" }, opts({ signal: stop.signal, sleep: async () => stop.abort() }));
    await expect(p).rejects.toThrow("Stopped.");
  });

  it("runs the claim check on the re-script it just got, by that job's id", async () => {
    calls.replies.push({ job: "re1" }, { status: "done", result: { script: "a [x]", changes: [], fill: ["[x]"] } }, { job: "cc1" }, { status: "done", result: { unsupported: [], script: "a [x]" } });
    const got = vi.fn();
    const filed = vi.fn();
    const r = await runRescript("https://www.instagram.com/reel/abc/", { ...opts(), onRescript: got, onFiled: filed });
    expect([r.check.script, r.job]).toEqual(["a [x]", "re1"]);
    expect(got).toHaveBeenCalledWith({ script: "a [x]", changes: [], fill: ["[x]"] }, "re1");
    expect(filed.mock.calls).toEqual([["re1", "rescript"], ["cc1", "claims"]]);
    expect(calls.sent[2]).toEqual({ action: "claims", job: "re1" });
  });

  it("hands over a finished re-script before its claim check fails", async () => {
    calls.replies.push({ job: "re1" }, { status: "done", result: { script: "a", changes: [], fill: [] } }, { job: "cc1" }, { status: "failed", error: "Leo's Claude plan limit is reached for now." });
    const got = vi.fn();
    await expect(runRescript("https://www.instagram.com/reel/abc/", { ...opts(), onRescript: got })).rejects.toThrow("plan limit");
    expect(got).toHaveBeenCalledWith({ script: "a", changes: [], fill: [] }, "re1");
  });
});

describe("the scriptwriter's numbers", () => {
  it("has the dial defaults and labels the panel draws", () => {
    expect(DIAL_META.map((d) => `${d.label} ${d.value} ${levelOf(d.value)}`)[0]).toBe("Avatar use 70 Strong");
    expect(DEFAULT_DIALS.cta).toBe(0);
  });

  it("counts words and seconds at 170 words a minute", () => {
    expect(wordsOf("  one two\nthree ")).toBe(3);
    expect(wordsOf("")).toBe(0);
    expect(secondsOf(Array(170).fill("w").join(" "))).toBe(60);
  });

  it("saves a script to My posts as a short-video draft with its title", () => {
    const d = saveScriptDraft(UID, { title: "Price before volume", script: "Raise your price first.\nHere's why." });
    expect(d).toMatchObject({ hook: "Raise your price first.", format: "short-video", titles: ["Price before volume"] });
    expect(loadDrafts(UID).map((x) => x.id)).toEqual([d.id]);
  });
});
