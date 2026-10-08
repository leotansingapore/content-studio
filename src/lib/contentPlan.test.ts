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
