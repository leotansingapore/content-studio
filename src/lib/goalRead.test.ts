import { beforeEach, describe, expect, it, vi } from "vitest";

const callFn = vi.fn();
vi.mock("@/lib/edgeFn", async (orig) => ({ ...(await orig<typeof import("@/lib/edgeFn")>()), callFn: (...a: unknown[]) => callFn(...a) }));

import { EdgeError } from "@/lib/edgeFn";
import { loadGoals, saveGoals } from "@/lib/goals";
import { goalChips, loadPositioning } from "@/lib/positioning";
import { chipKind, keepGoal, keepGoalWork, loadGoalWork, readGoal } from "./goalRead";

const UID = "6d80f027-3395-480c-86a1-8827d3d6cce3";

class MemStorage {
  m = new Map<string, string>();
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
}
let local: MemStorage;
let session: MemStorage;

beforeEach(() => {
  callFn.mockReset();
  local = new MemStorage();
  session = new MemStorage();
  (globalThis as { window?: unknown }).window = { localStorage: local, dispatchEvent: () => true };
  (globalThis as { sessionStorage?: unknown }).sessionStorage = session;
});

describe("readGoal", () => {
  it("asks writing-judge's goal mode with the trimmed text and keeps a 200's kind", async () => {
    callFn.mockResolvedValueOnce({ kind: "clients", p: 0.83 });
    expect(await readGoal("  more people booking a 15-minute review with me ")).toBe("clients");
    expect(callFn).toHaveBeenCalledWith("writing-judge", { mode: "goal", text: "more people booking a 15-minute review with me" });
  });

  it("reads a 200 with no kind, or a kind it does not know, as null", async () => {
    callFn.mockResolvedValueOnce({ kind: null, p: 0.41 });
    expect(await readGoal("something vague")).toBeNull();
    callFn.mockResolvedValueOnce({ kind: "sales", p: 0.9 });
    expect(await readGoal("something vague")).toBeNull();
    callFn.mockResolvedValueOnce(null);
    expect(await readGoal("something vague")).toBeNull();
  });

  it.each([
    ["422 not English", new EdgeError("Write it in English.", 422, "not_english")],
    ["429 over the cap", new EdgeError("Daily limit reached.", 429, "daily_limit")],
    ["503 no key or usage unreadable", new EdgeError("Not set up.", 503, "usage_unavailable")],
    ["403 not switched on", new EdgeError("This isn't switched on for your account yet.", 403, "not_enabled")],
    ["no connection", new EdgeError("Couldn't reach the server.", 0)],
    ["a thrown call", new Error("boom")],
  ])("reads %s as null", async (_, err) => {
    callFn.mockRejectedValueOnce(err);
    expect(await readGoal("grow my reach")).toBeNull();
  });
});

describe("chipKind", () => {
  const person = goalChips("person");
  const business = goalChips("business");
  it("names the chip a text is, in any case and with spaces around it", () => {
    expect(chipKind(" find people to join my team ", person)).toBe("recruit");
    expect(chipKind("Get more sign-ups and enquiries", business)).toBe("clients");
  });
  it("is null for typed words and for the other speaker's chips", () => {
    expect(chipKind("Find people to join my team today", person)).toBeNull();
    expect(chipKind("Find people to join my team", business)).toBeNull();
  });
});

describe("keepGoal", () => {
  it("keeps Home's weekly goal empty on a brand with no positioning", () => {
    expect(loadGoals(UID)).toEqual({});
    expect(keepGoal(UID, "Grow an audience that knows what I do", "audience")).toBe(true);
    expect(loadPositioning(UID)).toMatchObject({ goal: "Grow an audience that knows what I do", goalKind: "audience" });
    expect(loadGoals(UID)).toEqual({});
  });

  it("leaves weekly goals read from positioning as they were", () => {
    local.setItem(`content-studio-positioning-${UID}`, JSON.stringify({ platform: "instagram", cadence: 5, topics: ["CPF"] }));
    expect(keepGoal(UID, "Find people to join my team", "recruit")).toBe(true);
    expect(loadGoals(UID)).toEqual({ instagram: 5 });
    expect(local.getItem(`content-studio-goals-${UID}`)).toBeNull();
  });

  it("keeps saved weekly goals", () => {
    saveGoals(UID, { tiktok: 4 });
    keepGoal(UID, "Find people to join my team", "recruit");
    expect(loadGoals(UID)).toEqual({ tiktok: 4 });
  });

  it("says false and writes no goal when storage refuses", () => {
    local.setItem = () => {
      throw new Error("QuotaExceededError");
    };
    expect(keepGoal(UID, "Grow", "audience")).toBe(false);
    expect(loadPositioning(UID)).toBeNull();
  });
});

describe("the editor's typed work", () => {
  it("round-trips per brand in this tab and clears on null", () => {
    keepGoalWork(UID, { text: "more people booking a review", unsure: true, closest: "clients" });
    expect(session.getItem(`cs-goal-work-${UID}`)).not.toBeNull();
    expect(loadGoalWork(UID)).toEqual({ text: "more people booking a review", unsure: true, closest: "clients" });
    keepGoalWork(UID, null);
    expect(loadGoalWork(UID)).toBeNull();
  });

  it("reads bad JSON, a missing text or an unknown kind safely", () => {
    session.setItem(`cs-goal-work-${UID}`, "{oops");
    expect(loadGoalWork(UID)).toBeNull();
    session.setItem(`cs-goal-work-${UID}`, JSON.stringify({ unsure: true }));
    expect(loadGoalWork(UID)).toBeNull();
    session.setItem(`cs-goal-work-${UID}`, JSON.stringify({ text: "x".repeat(200), closest: "sales" }));
    expect(loadGoalWork(UID)).toEqual({ text: "x".repeat(120), unsure: false, closest: null });
  });
});
