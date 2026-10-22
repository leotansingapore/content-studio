import { beforeEach, describe, expect, it } from "vitest";
import { EMPTY_POSITIONING, GOAL_KINDS, GOAL_WEIGHTS, goalChips, loadPositioning, saveGoal } from "./positioning";

const UID = "6d80f027-3395-480c-86a1-8827d3d6cce3";
const KEY = `content-studio-positioning-${UID}`;

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
let events: string[];

beforeEach(() => {
  mem = new MemStorage();
  events = [];
  (globalThis as { window?: unknown }).window = { localStorage: mem, dispatchEvent: (e: Event) => events.push(e.type) };
});

const OLD_ROW = {
  oneLiner: "I help young parents plan", audience: "parent", audienceDetail: "Parents of under-5s", topics: ["CPF", "Wills"],
  edge: "Ex-teacher", platform: "instagram", cadence: 5, updatedAt: "2026-09-01T00:00:00.000Z",
};

describe("positioning goal", () => {
  it("loads an old row with the goal fields undefined", () => {
    mem.setItem(KEY, JSON.stringify(OLD_ROW));
    const p = loadPositioning(UID)!;
    expect(p).toEqual(OLD_ROW);
    expect([p.goal, p.goalKind, p.goalSetAt]).toEqual([undefined, undefined, undefined]);
    expect(Object.keys(EMPTY_POSITIONING)).not.toContain("goal");
  });

  it("saveGoal sets the three goal fields and keeps every other field as stored", () => {
    mem.setItem(KEY, JSON.stringify({ ...OLD_ROW, legacy: 1 }));
    expect(saveGoal(UID, "  More people booking a review with me ", "clients")).toBe(true);
    const row = JSON.parse(mem.getItem(KEY)!);
    expect(row).toEqual({ ...OLD_ROW, legacy: 1, goal: "More people booking a review with me", goalKind: "clients", goalSetAt: row.goalSetAt });
    expect(Number.isNaN(Date.parse(row.goalSetAt))).toBe(false);
    expect(loadPositioning(UID)).toMatchObject({ cadence: 5, topics: ["CPF", "Wills"], goalKind: "clients" });
    expect(events).toEqual(["content-studio-positioning-changed"]);
  });

  it("saveGoal on a brand with no positioning stores only the goal", () => {
    saveGoal(UID, "Grow", "audience");
    expect(Object.keys(JSON.parse(mem.getItem(KEY)!)).sort()).toEqual(["goal", "goalKind", "goalSetAt"]);
  });

  it("says false when storage refuses the write", () => {
    mem.setItem = () => {
      throw new Error("QuotaExceededError");
    };
    expect(saveGoal(UID, "Grow", "audience")).toBe(false);
    expect(events).toEqual([]);
  });

  it("has five chips per speaker and weights for clients, audience and trust only", () => {
    expect(Object.keys(goalChips("person"))).toEqual(GOAL_KINDS);
    expect(goalChips("person").clients).toBe("Get more enquiries from people I can help");
    expect(goalChips("business").clients).toBe("Get more sign-ups and enquiries");
    expect(Object.keys(GOAL_WEIGHTS)).toEqual(["clients", "audience", "trust"]);
    expect(GOAL_WEIGHTS.audience).toEqual({ attraction: 6, trust: 3, conversion: 1 });
  });
});
