import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabase: { functions: { invoke: vi.fn() } }, SUPABASE_URL: "", SUPABASE_ANON_KEY: "" }));
const make = vi.hoisted(() => vi.fn());
vi.mock("@/lib/remix", async (orig) => ({ ...(await orig<typeof import("./remix")>()), requestMake: make }));
vi.mock("@/lib/remixTeardown", () => ({ localTeardown: () => null, ensureTeardown: () => Promise.resolve(null) }));

import { loadDrafts, saveDrafts, type DraftEntry } from "./draftHistory";
import type { MakeResponse } from "./remix";
import { clearRemixJob, onRemixJob, remixJob, type RemixJobState } from "./remixJob";
import { draftsInSet } from "./variants";
import { WINNER_NOTE, makeVersions } from "./versionsJob";

const UID = "6d80f027-3395-480c-86a1-8827d3d6cce3";

class MemStorage {
  private m = new Map<string, string>();
  get length() { return this.m.size; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
}

beforeEach(() => {
  const local = new MemStorage();
  vi.stubGlobal("window", { localStorage: local, dispatchEvent: () => true });
  vi.stubGlobal("localStorage", local);
  make.mockReset();
  clearRemixJob();
});
afterEach(() => vi.unstubAllGlobals());

const winner: DraftEntry = {
  id: "w1",
  createdAt: "2026-10-01T02:00:00.000Z",
  pillar: "topic",
  audience: "general",
  platform: "linkedin",
  format: "text-post",
  pillarDetail: "CPF top-ups",
  ctaType: "none",
  hook: "5 things I wish I knew before my first CPF top-up",
  draft: "5 things I wish I knew before my first CPF top-up\n\nOne. Start early.",
  status: "posted",
  postedAt: "2026-10-02T02:00:00.000Z",
  hookFormula: "number-reveal",
};
const answer = (hook: string): MakeResponse => ({ as: "post", result: { as: "post", hook, body: "B", cta: "", hashtags: [] }, flags: { copied: [], claim: false, invented: false }, usage: { used: 1, limit: 30 } });
const finished = () =>
  new Promise<RemixJobState>((resolve) => {
    const off = onRemixJob((j) => {
      if (j && j.state !== "working") {
        off();
        resolve(j);
      }
    });
  });

describe("makeVersions", () => {
  it("makes 3 versions of an own post with the winner's note, in one set from own:<id>", async () => {
    saveDrafts(UID, [winner]);
    make.mockImplementation(async (b: { formula: string }) => answer(`New hook ${b.formula}`));
    const done = finished();
    expect(makeVersions(UID, { draftId: "w1" })).toBe("started");
    const j = await done;
    const sent = make.mock.calls.map(([b]) => b);
    expect(sent).toHaveLength(3);
    for (const b of sent) expect(b).toMatchObject({ mode: "make", as: "post", keep: "structure", close: "balanced", note: WINNER_NOTE, source: { key: "own:w1", kind: "own" } });
    expect(j.set).toMatchObject({ kind: "versions", from: "own:w1" });
    expect(draftsInSet(loadDrafts(UID), j.set!.id)).toHaveLength(3);
  });

  it("makes a source's versions with no note, answers busy while a run goes, and gone for a post no longer here", async () => {
    saveDrafts(UID, [winner]);
    let release!: () => void;
    make.mockImplementation((b: { formula: string }) => new Promise((r) => (release = () => r(answer(`H ${b.formula}`)))));
    const done = finished();
    expect(makeVersions(UID, { source: "own:w1" })).toBe("started");
    expect(makeVersions(UID, { draftId: "w1" })).toBe("busy");
    expect(makeVersions(UID, { draftId: "nope" })).toBe("gone");
    await vi.waitFor(() => expect(make).toHaveBeenCalledTimes(1));
    expect(make.mock.calls[0][0].note).toBeUndefined();
    for (let i = 0; i < 3; i++) {
      await vi.waitFor(() => expect(make).toHaveBeenCalledTimes(i + 1));
      release();
    }
    await done;
    expect(remixJob()?.state).toBe("done");
  });
});
