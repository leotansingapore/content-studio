import { beforeEach, describe, expect, it } from "vitest";
import type { DraftEntry } from "./draftHistory";
import { loadGoals, saveGoals, sgDay, weekProgress } from "./goals";

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
let mem: MemStorage;
beforeEach(() => {
  mem = new MemStorage();
  (globalThis as { window?: unknown }).window = { localStorage: mem };
});

const post = (id: string, platform: string, extra: Partial<DraftEntry>): DraftEntry => ({
  id, createdAt: "", hook: id, draft: "", pillar: "", pillarDetail: "", audience: "", format: "", platform, ctaType: "", ...extra,
});

describe("goals store", () => {
  it("defaults to the positioning cadence on its platform until goals are saved", () => {
    expect(loadGoals(UID)).toEqual({});
    mem.setItem(`content-studio-positioning-${UID}`, JSON.stringify({ platform: "instagram", cadence: 4 }));
    expect(loadGoals(UID)).toEqual({ instagram: 4 });
    saveGoals(UID, { linkedin: 3, instagram: 0, tiktok: 99, facebook: -1 } as never);
    expect(loadGoals(UID)).toEqual({ linkedin: 3, tiktok: 21 });
  });
});

describe("sgDay", () => {
  it("is the Singapore calendar day", () => {
    expect(sgDay("2026-10-04T15:59:00Z")).toBe("2026-10-04"); // Sun 11:59pm SG
    expect(sgDay("2026-10-04T16:00:00Z")).toBe("2026-10-05"); // Mon 12am SG
  });
});

describe("weekProgress", () => {
  // Thu 8 Oct 2026; the week is Mon 5 to Sun 11 Oct.
  const drafts = [
    post("a", "linkedin", { status: "posted", postedAt: "2026-10-04T16:30:00Z" }), // Mon 12:30am SG: this week
    post("b", "linkedin", { status: "posted", postedAt: "2026-10-04T15:00:00Z" }), // Sun 11pm SG: last week
    post("c", "linkedin", { status: "scheduled", scheduledFor: "2026-10-11T19:30" }),
    post("d", "linkedin", { status: "scheduled", scheduledFor: "2026-10-12" }), // next week
    post("e", "instagram", { status: "posted", postedAt: "2026-10-07T02:00:00Z" }),
    post("f", "tiktok", { status: "draft" }),
    post("g", "", { status: "posted", postedAt: "2026-10-07T02:00:00Z" }),
  ];
  it("counts posted, scheduled and still to do per platform", () => {
    const w = weekProgress(drafts, { linkedin: 3, facebook: 2 }, "2026-10-08");
    expect(w.rows).toEqual([
      { platform: "linkedin", goal: 3, posted: 1, scheduled: 1, toDo: 1 },
      { platform: "instagram", goal: 0, posted: 1, scheduled: 0, toDo: 0 },
      { platform: "facebook", goal: 2, posted: 0, scheduled: 0, toDo: 2 },
    ]);
    expect(w).toMatchObject({ goal: 5, posted: 2, scheduled: 1, toDo: 3, met: 1 });
  });
  it("extra posts on one platform don't cover another", () => {
    const many = [1, 2, 3, 4].map((i) => post(`x${i}`, "linkedin", { status: "posted", postedAt: "2026-10-06T02:00:00Z" }));
    expect(weekProgress(many, { linkedin: 2, instagram: 2 }, "2026-10-08")).toMatchObject({ toDo: 2, met: 2 });
  });
});
