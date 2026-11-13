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

import { DEFAULT_DIALS, DIAL_META, deskPostId, levelOf, runDesk, runRescript, saveScriptDraft, secondsOf, stopDesk, wordsOf } from "./scriptDesk";
import { EdgeError } from "@/lib/edgeFn";
import { deleteDraft, loadDrafts } from "./draftHistory";
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

  it("waits on a job the server files with its queued status, as script-desk answers a filing", async () => {
    calls.replies.push({ job: "j1", kind: "write", status: "queued" }, { status: "claimed" }, { status: "done", result: { title: "t", script: "s" } });
    const filed: string[] = [];
    const r = await runDesk<{ title: string }>({ action: "write", entry: "dials" }, opts({ onFiled: (j: string) => filed.push(j) }));
    expect(r).toEqual({ title: "t", script: "s" });
    expect(filed).toEqual(["j1"]);
    expect(calls.sent.slice(1).every((p) => p.action === "job" && p.id === "j1")).toBe(true);
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

  it("keeps waiting through a poll that can't reach the server or gets a 5xx, and ends on a 4xx", async () => {
    const offline = () => new EdgeError("Couldn't reach the server. Check your connection and try again.", 0);
    calls.replies.push({ job: "j1" }, { status: "queued" }, offline(), new EdgeError("Something went wrong. Try again in a minute.", 500, "failed"), { status: "claimed" }, { status: "done", result: { title: "t", script: "s" } });
    await expect(runDesk({ action: "write", entry: "dials" }, opts())).resolves.toEqual({ title: "t", script: "s" });
    calls.replies.push({ job: "j2" }, offline(), new EdgeError("That job isn't there any more. Start it again.", 404, "gone"));
    await expect(runDesk({ action: "hooks", topic: "t" }, opts())).rejects.toThrow("isn't there any more");
    calls.replies.push({ job: "j3" }, ...Array.from({ length: 400 }, offline));
    await expect(runDesk({ action: "hooks", topic: "t" }, opts())).rejects.toThrow("Couldn't reach the server");
  });

  it("keeps waiting past five minutes when the caller asks for longer, as a research read does", async () => {
    calls.replies.push({ job: "j1" }, ...Array.from({ length: 250 }, () => ({ status: "claimed" })), { status: "done", result: { reels: [] } });
    await expect(runDesk({ action: "ig_reels", handle: "made.up_creator" }, opts({ giveUpMs: 10 * 60_000 }))).resolves.toEqual({ reels: [] });
  });

  it("stops waiting when the page stops it", async () => {
    const stop = new AbortController();
    calls.replies.push({ job: "j1" });
    const p = runDesk({ action: "hooks", topic: "t" }, opts({ signal: stop.signal, sleep: async () => stop.abort() }));
    await expect(p).rejects.toThrow("Stopped.");
  });

  it("asks the server to take a stopped job off the queue, and a refusal from a server without it changes nothing", async () => {
    calls.replies.push(new EdgeError("Unknown action.", 400, "bad_request"));
    stopDesk("j1");
    stopDesk(undefined);
    await new Promise((r) => setTimeout(r, 0));
    expect(calls.sent).toEqual([{ action: "cancel", id: "j1" }]);
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

describe("deskPostId", () => {
  it("names an Instagram or TikTok reel read on Clone a reel, and nothing else", () => {
    expect(deskPostId("link:instagram:DdsjSosgWYL")).toBe("instagram-DdsjSosgWYL");
    expect(deskPostId("link:tiktok:7412345678901234567")).toBe("tiktok-7412345678901234567");
    expect(deskPostId("link:youtube:dQw4w9WgXcQ")).toBeNull();
    expect(deskPostId("upload:abc")).toBeNull();
    expect(deskPostId("link:instagram:../x")).toBeNull();
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

  it("saves an edited script over the draft it made before, and makes a new one once that draft is deleted", () => {
    const first = saveScriptDraft(UID, { title: "Price before volume", script: "Raise your price first." }, undefined, new Date(Date.now() - 3_600_000));
    const again = saveScriptDraft(UID, { title: "Price before volume", script: "Raise your price first, then add clients.\nHere's why." }, first.id);
    expect(again).toMatchObject({ id: first.id, createdAt: first.createdAt, hook: "Raise your price first, then add clients." });
    expect(loadDrafts(UID).map((x) => [x.id, x.draft])).toEqual([[first.id, "Raise your price first, then add clients.\nHere's why."]]);
    deleteDraft(UID, first.id);
    const fresh = saveScriptDraft(UID, { title: "", script: "Raise your price first." }, first.id);
    expect(fresh.id).not.toBe(first.id);
    expect(loadDrafts(UID).map((x) => x.id)).toEqual([fresh.id]);
  });
});
