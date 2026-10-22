// The tour's store against a fake localStorage: the six steps in Q12's order, every state, the device key, and the
// ?tour= link.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

class MemStorage {
  m = new Map<string, string>();
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
}
const local = new MemStorage();
vi.stubGlobal("localStorage", local);

import {
  TOUR_STEPS,
  finishTour,
  nextStep,
  onTour,
  pauseTour,
  resumeTour,
  skipTour,
  startTour,
  stepForPath,
  takeFocus,
  tourKey,
  tourParam,
  tourState,
} from "./tour";

// a fresh account per test: the store keeps a copy in memory for storage that refuses writes
let n = 0;
let U = "";
beforeEach(() => {
  U = `u${++n}`;
});
afterEach(() => {
  local.clear();
  takeFocus();
});

describe("the steps", () => {
  it("are Q12's six pages, in order, with the three new pages' copy exact", () => {
    expect(TOUR_STEPS.map((s) => [s.id, s.path, s.page])).toEqual([
      ["home", "/home", "Home"],
      ["competitors", "/competitors", "Competitors"],
      ["formats", "/make", "Formats"],
      ["campaigns", "/campaigns", "Campaigns"],
      ["brand", "/brand", "Brand kit"],
      ["agent", "/agent", "Agent"],
    ]);
    expect(TOUR_STEPS[1].text).toBe("Competitors are the accounts you watch. Their ads and best posts arrive here every week, ready to remix.");
    expect(TOUR_STEPS[2].text).toBe("Formats is every kind of post the AI can make, each with a preview and its price.");
    expect(TOUR_STEPS[3].text).toBe("Campaigns turn a goal into a month of posts you review one at a time.");
    expect(TOUR_STEPS[5].target).toBe("agent-composer");
    expect(TOUR_STEPS.filter((s) => s.target)).toHaveLength(1);
  });
  it("are ASCII with no em dashes", () => {
    for (const s of TOUR_STEPS) expect(s.text).toMatch(/^[\x20-\x7e]+$/);
  });
});

describe("the store", () => {
  it("starts at home, running, and Next walks all six, finishing on the last", () => {
    expect(startTour(U).id).toBe("home");
    expect(tourState(U)).toMatchObject({ step: "home", state: "running" });
    const seen = ["home"];
    for (let i = 0; i < 5; i++) seen.push(nextStep(U)!.id);
    expect(seen).toEqual(TOUR_STEPS.map((s) => s.id));
    expect(tourState(U)).toMatchObject({ step: "agent", state: "running" });
    expect(nextStep(U)).toBeNull();
    expect(tourState(U)).toMatchObject({ step: "agent", state: "done" });
  });

  it("stores skipped and done, and a new start begins again at step 1", () => {
    startTour(U, "campaigns");
    skipTour(U);
    expect(tourState(U)).toMatchObject({ step: "campaigns", state: "skipped" });
    expect(startTour(U).id).toBe("home");
    expect(tourState(U)).toMatchObject({ step: "home", state: "running" });
    nextStep(U);
    finishTour(U);
    expect(tourState(U)).toMatchObject({ state: "done" });
    startTour(U);
    expect(tourState(U)).toMatchObject({ step: "home", state: "running" });
  });

  it("pauses at the same step, resumes there, and starts at a named step or step 1 for an unknown one", () => {
    startTour(U, "formats");
    pauseTour(U);
    expect(tourState(U)).toMatchObject({ step: "formats", state: "paused" });
    expect(resumeTour(U)?.id).toBe("formats");
    expect(tourState(U)).toMatchObject({ step: "formats", state: "running" });
    expect(startTour(U, "brand").id).toBe("brand");
    expect(startTour(U, "calendar").id).toBe("home");
    expect(startTour(U, "1").id).toBe("home");
  });

  it("never resumes, pauses or moves a tour that ended or never started", () => {
    expect(nextStep(U)).toBeNull();
    expect(resumeTour(U)).toBeNull();
    pauseTour(U);
    expect(tourState(U)).toBeNull();
    startTour(U);
    skipTour(U);
    expect(resumeTour(U)).toBeNull();
    pauseTour(U);
    expect(tourState(U)).toMatchObject({ state: "skipped" });
  });

  it("reads back from cs-tour-<uid>, and a malformed value reads as no tour", () => {
    local.setItem(tourKey(U), JSON.stringify({ step: "campaigns", state: "paused", at: "2026-10-22T09:00:00.000Z" }));
    expect(tourState(U)).toEqual({ step: "campaigns", state: "paused", at: "2026-10-22T09:00:00.000Z" });
    expect(tourState("someone-else")).toBeNull();
    for (const bad of ["{", "null", '"home"', JSON.stringify({ step: "calendar", state: "running", at: "x" }), JSON.stringify({ step: "home", state: "open", at: "x" })]) {
      local.setItem(tourKey(U), bad);
      expect(tourState(U)).toBeNull();
    }
  });

  it("keeps the tour for this visit when storage refuses the write", () => {
    const set = vi.spyOn(local, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    startTour(U, "brand");
    set.mockRestore();
    expect(local.getItem(tourKey(U))).toBeNull();
    expect(tourState(U)).toMatchObject({ step: "brand", state: "running" });
  });

  it("tells subscribers about every change, and stops when they leave", () => {
    const fn = vi.fn();
    const off = onTour(fn);
    startTour(U);
    nextStep(U);
    pauseTour(U);
    expect(fn).toHaveBeenCalledTimes(3);
    off();
    skipTour(U);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("hands focus to the popover once after a start, Next or Resume, and never after a pause or a skip", () => {
    startTour(U);
    expect(takeFocus()).toBe(true);
    expect(takeFocus()).toBe(false);
    nextStep(U);
    expect(takeFocus()).toBe(true);
    pauseTour(U);
    expect(takeFocus()).toBe(false);
    resumeTour(U);
    expect(takeFocus()).toBe(true);
    skipTour(U);
    expect(takeFocus()).toBe(false);
  });
});

describe("stepForPath", () => {
  it("matches each step's own page only", () => {
    expect(stepForPath("/home")).toBe("home");
    expect(stepForPath("/home/")).toBe("home");
    expect(stepForPath("/competitors")).toBe("competitors");
    expect(stepForPath("/make")).toBe("formats");
    expect(stepForPath("/make/carousel")).toBeNull();
    expect(stepForPath("/campaigns")).toBe("campaigns");
    expect(stepForPath("/campaigns/c1")).toBeNull();
    expect(stepForPath("/brand")).toBe("brand");
    expect(stepForPath("/agent")).toBe("agent");
    expect(stepForPath("/agent/t1")).toBe("agent");
    expect(stepForPath("/agent/t1/x")).toBeNull();
    expect(stepForPath("/generate")).toBeNull();
    expect(stepForPath("/")).toBeNull();
  });
});

describe("tourParam", () => {
  it("returns the step and a search that has lost tour and kept the rest", () => {
    expect(tourParam("?tour=brand&profile=me")).toEqual({ step: "brand", search: "?profile=me" });
    expect(tourParam("?tour=1")).toEqual({ step: "home", search: "" });
    expect(tourParam("?tour=calendar&a=1")).toEqual({ step: "home", search: "?a=1" });
    expect(tourParam("?tour=")).toEqual({ step: "home", search: "" });
    expect(tourParam("?profile=me")).toBeNull();
    expect(tourParam("")).toBeNull();
  });
});
