import { describe, expect, it } from "vitest";
import { planCalendarEntries, type PlanItem } from "./contentPlan";
import type { DraftEntry } from "./draftHistory";

const item = (id: string, dayLabel: string, week = 1): PlanItem => ({
  id, week, dayLabel, stage: "attraction", pillar: "topic", pillarDetail: "", format: "text-post",
  platform: "linkedin", audience: "general", ctaType: "open-question", ideaSource: "", angle: `Angle ${id}`, hook: `Hook ${id}`, posted: false,
});
const post = (o: Partial<DraftEntry>): DraftEntry => ({
  id: "x", createdAt: "2026-10-01T00:00:00.000Z", hook: "", draft: "", pillar: "", pillarDetail: "", audience: "", format: "", platform: "", ctaType: "", ...o,
});
const monday = new Date(2026, 9, 12);

describe("planCalendarEntries", () => {
  it("dates each slot from the week-1 Monday", () => {
    const { entries, kept } = planCalendarEntries([item("a", "Week 1 · Wed"), item("b", "Week 2 · Mon", 2)], monday, []);
    expect(kept).toBe(0);
    expect(entries.map((e) => [e.id, e.scheduledFor, e.status, e.hook])).toEqual([
      ["plan_a", "2026-10-14", "scheduled", "Hook a"],
      ["plan_b", "2026-10-19", "scheduled", "Hook b"],
    ]);
  });

  it("leaves a slot alone once it is written or posted, and refreshes an untouched one", () => {
    const existing = [
      post({ id: "plan_a", status: "scheduled", scheduledFor: "2026-10-07", draft: "My written post" }),
      post({ id: "plan_b", status: "posted", postedAt: "2026-10-06T02:00:00.000Z" }),
      post({ id: "plan_c", status: "scheduled", scheduledFor: "2026-10-07", hook: "old hook", createdAt: "2026-09-01T00:00:00.000Z" }),
    ];
    const { entries, kept } = planCalendarEntries([item("a", "Mon"), item("b", "Tue"), item("c", "Fri")], monday, existing);
    expect(kept).toBe(2);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ id: "plan_c", hook: "Hook c", scheduledFor: "2026-10-16", createdAt: "2026-09-01T00:00:00.000Z" });
  });
});

import { generatePlan, planItemToGenerateUrl, recentThemes } from "./contentPlan";
import { HOOK_FORMULAS, hookFormulasFrom } from "./hookFormulas";
import { EMPTY_POSITIONING, type Positioning } from "./positioning";

const pos = (o: Partial<Positioning> = {}): Positioning => ({
  ...EMPTY_POSITIONING, oneLiner: "I help parents", topics: ["CPF top-ups", "Critical illness", "Hospital plans"], ...o,
});

describe("generatePlan hook formulas", () => {
  it("gives every slot a different formula, carrying on from where the last plan stopped", () => {
    const start = HOOK_FORMULAS.length - 2;
    const plan = generatePlan(pos({ cadence: 5 }), { weeks: 4, formulaStart: start });
    const ids = plan.items.map((i) => i.formulaId);
    expect(ids[0]).toBe(HOOK_FORMULAS[start].id);
    expect(ids[2]).toBe(HOOK_FORMULAS[0].id);
    // 20 slots, 20 formulas: no two share one
    expect(new Set(ids).size).toBe(20);
  });
});

describe("generatePlan themes", () => {
  it("leaves out a topic used in the last two weeks and says which", () => {
    const plan = generatePlan(pos({ cadence: 7 }), { weeks: 1, recentThemes: new Set(["cpf top-ups"]) });
    const details = plan.items.map((i) => i.pillarDetail);
    expect(details).not.toContain("CPF top-ups");
    expect(details).toContain("Critical illness");
    expect(plan.restedThemes).toEqual(["CPF top-ups"]);
  });

  it("keeps every topic when all of them were used recently", () => {
    const all = new Set(["cpf top-ups", "critical illness", "hospital plans"]);
    const plan = generatePlan(pos({ cadence: 7 }), { weeks: 1, recentThemes: all });
    expect(plan.items.map((i) => i.pillarDetail)).toContain("CPF top-ups");
    expect(plan.restedThemes).toBeUndefined();
  });
});

describe("recentThemes", () => {
  const now = new Date(2026, 9, 8, 10, 0); // Thu 8 Oct 2026
  it("takes posts posted in the last 14 days and scheduled ones from then on", () => {
    const set = recentThemes([
      post({ id: "a", status: "posted", postedAt: "2026-09-30T02:00:00.000Z", pillarDetail: " CPF Top-ups " }),
      post({ id: "b", status: "posted", postedAt: "2026-09-01T02:00:00.000Z", pillarDetail: "Old theme" }),
      post({ id: "c", status: "scheduled", scheduledFor: "2026-10-20T08:30", pillarDetail: "Wills" }),
      post({ id: "d", status: "draft", pillarDetail: "Just a draft" }),
      post({ id: "plan_x", status: "scheduled", scheduledFor: "2026-10-12", pillarDetail: "Empty slot" }),
      post({ id: "plan_y", status: "scheduled", scheduledFor: "2026-10-12", pillarDetail: "Written slot", draft: "text" }),
    ], now);
    expect([...set].sort()).toEqual(["cpf top-ups", "wills", "written slot"]);
  });
});

describe("generatePlan posting days and times", () => {
  it("leads with the adviser's own posting days, runs Mon to Sun, and times each slot", () => {
    const plan = generatePlan(pos({ cadence: 3 }), {
      weeks: 1,
      postingDays: ["Thu", "Tue"],
      postingTime: (day) => (day === 1 ? "08:30" : day === 3 ? "20:00" : "12:00"),
    });
    expect(plan.items.map((i) => [i.dayLabel, i.time])).toEqual([
      ["Wk 1 · Mon", "12:00"],
      ["Wk 1 · Tue", "08:30"],
      ["Wk 1 · Thu", "20:00"],
    ]);
    const { entries } = planCalendarEntries(plan.items, monday, []);
    expect(entries.map((e) => e.scheduledFor)).toEqual(["2026-10-12T12:00", "2026-10-13T08:30", "2026-10-15T20:00"]);
  });
});

describe("planItemToGenerateUrl", () => {
  it("passes the slot's formula, and this week's story to week 1 only", () => {
    const a = new URLSearchParams(planItemToGenerateUrl({ ...item("a", "Mon"), formulaId: "receipt" }, "Lost a client").split("?")[1]);
    expect(a.get("formula")).toBe("receipt");
    expect(a.get("ctx")).toContain("Lost a client");
    const b = new URLSearchParams(planItemToGenerateUrl(item("b", "Mon", 2), "Lost a client").split("?")[1]);
    expect(b.get("ctx")).toBe("Angle b");
    expect(b.has("formula")).toBe(false);
  });
});

describe("hookFormulasFrom", () => {
  it("opens with the slot's formula and adds the next ones, wrapping at the end", () => {
    const last = HOOK_FORMULAS[HOOK_FORMULAS.length - 1];
    expect(hookFormulasFrom(last.id).map((f) => f.id)).toEqual([last.id, HOOK_FORMULAS[0].id, HOOK_FORMULAS[1].id]);
  });
});
