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

// ---- Pins: today's generatePlan and the options /plan builds, taken on 0d23f6a6 before the plan
// engine changed. Plans are live for everyone, so these files never change: never vitest -u.
import { afterEach, vi } from "vitest";
import { nextFormulaStart, WEEKDAYS, type ContentPlan, type GeneratePlanOptions } from "./contentPlan";
import { getBreakdown, getDayOfWeekBreakdown, getTrackedPosts, MIN_GROUP_SAMPLE, postingTimeOn } from "./analytics";
import { loadBrand } from "./carousel";
import { loadDrafts } from "./draftHistory";
import type { PlanFormat } from "./contentPlan";

const PIN_POS = pos({ audience: "parent", audienceDetail: "Parents of under-5s", platform: "instagram", edge: "Ex-teacher" });
const stable = (p: ContentPlan) => {
  const { id: _id, createdAt: _at, ...rest } = p;
  return rest;
};

describe("generatePlan, pinned", () => {
  it("lays out today's plan at 3, 4, 5 and 7 a week, and with every option", async () => {
    const out: Record<string, unknown> = {};
    for (const cadence of [3, 4, 5, 7]) out[`cadence ${cadence}`] = stable(generatePlan({ ...PIN_POS, cadence }, { weeks: 2, salt: 1 }));
    out["cadence 4, salt 0"] = stable(generatePlan({ ...PIN_POS, cadence: 4 }, { weeks: 2 }));
    out["every option"] = stable(
      generatePlan({ ...PIN_POS, cadence: 5 }, {
        weeks: 2,
        salt: 2,
        competitors: [{ name: "Ada", handle: "@ada", styleNotes: "short lines" }, { name: "Bo", handle: "@bo", styleNotes: "" }],
        performance: { bestFormat: "carousel", bestDays: ["Thu", "Sat"] },
        formulaStart: 5,
        recentThemes: new Set(["cpf top-ups"]),
        postingDays: ["Tue"],
        postingTime: (d) => (d === 1 ? "08:30" : d % 2 ? "20:00" : null),
      }),
    );
    await expect(JSON.stringify(out, null, 2)).toMatchFileSnapshot("./__pins__/generate-plan-today.json");
  });

  it("splits each week 1/1/1, 1/2/1, 2/2/1 and 3/3/1 at 3, 4, 5 and 7 a week", () => {
    const split = (cadence: number) => {
      const week = generatePlan({ ...PIN_POS, cadence }, { weeks: 1 }).items.map((i) => i.stage);
      return ["attraction", "trust", "conversion"].map((s) => week.filter((x) => x === s).length);
    };
    expect([3, 4, 5, 7].map(split)).toEqual([[1, 1, 1], [1, 2, 1], [2, 2, 1], [3, 3, 1]]);
  });
});

describe("the options /plan builds, pinned", () => {
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
  // scheduledFor carries the posting hour as typed, so the best time reads the same in every time zone
  const posted = (id: string, format: string, postedAt: string, at: string, reactions: number, pillarDetail = ""): DraftEntry =>
    post({ id, format, platform: "instagram", status: "posted", postedAt, scheduledFor: at, pillarDetail, metrics: { impressions: 1000, reactions } });
  const seed = () => {
    const mem = new MemStorage();
    (globalThis as { window?: unknown }).window = { localStorage: mem };
    mem.setItem(`content-studio-carousel-brand-${UID}`, JSON.stringify({ slots: ["1T08:30", "3T20:00"] }));
    mem.setItem(`content-studio-drafts-${UID}`, JSON.stringify([
      posted("c1", "carousel", "2026-10-01T06:00:00.000Z", "2026-10-01T12:00", 80, "CPF top-ups"),
      posted("c2", "carousel", "2026-09-24T06:00:00.000Z", "2026-09-24T12:00", 90),
      posted("t1", "text-post", "2026-10-03T06:00:00.000Z", "2026-10-03T19:00", 30, "Hospital plans"),
      posted("t2", "text-post", "2026-09-26T06:00:00.000Z", "2026-09-26T19:00", 20),
    ]));
  };
  const lastPlan = { items: [{ formulaId: HOOK_FORMULAS[3].id }] } as unknown as ContentPlan;
  const competitors = [{ id: "x", name: "Ada", handle: "@ada", styleNotes: "short lines", platformUrl: "https://instagram.com/ada", platform: "instagram" }];

  // PlanPage's performance memo and planOptions as they are on 0d23f6a6, run on fixed stores.
  const todaysOptions = (id: string, platform: string, comps: typeof competitors, plan: ContentPlan | null) => {
    const performance = (() => {
      const formats = getBreakdown(id, "format").filter((r) => r.count >= MIN_GROUP_SAMPLE && r.key !== "unspecified");
      const bestFormat = formats.length >= 2 && formats[0].avgEngagementRate > formats[1].avgEngagementRate ? (formats[0].key as PlanFormat) : null;
      const days = getDayOfWeekBreakdown(id).filter((r) => r.count >= MIN_GROUP_SAMPLE).sort((a, b) => b.avgEngagementRate - a.avgEngagementRate);
      const bestDays = days.length >= 2 ? days.slice(0, 2).map((r) => r.day) : [];
      return bestFormat || bestDays.length ? { bestFormat, bestDays } : undefined;
    })();
    const slots = loadBrand(id)?.slots ?? [];
    const posts = getTrackedPosts(id);
    return {
      competitors: comps.map((c) => ({ name: c.name, handle: c.handle, styleNotes: c.styleNotes })),
      performance,
      formulaStart: nextFormulaStart(plan),
      recentThemes: recentThemes(loadDrafts(id)),
      postingDays: slots.map((x) => WEEKDAYS[Number(x[0])]),
      postingTime: (day: number) => postingTimeOn(posts, platform, day, slots).time,
    };
  };
  const shown = (o: GeneratePlanOptions) => ({
    competitors: o.competitors,
    performance: o.performance ?? null,
    formulaStart: o.formulaStart,
    recentThemes: [...(o.recentThemes ?? [])].sort(),
    postingDays: o.postingDays,
    postingTime: WEEKDAYS.map((_, d) => o.postingTime?.(d) ?? null),
  });

  afterEach(() => {
    vi.useRealTimers();
    delete (globalThis as { window?: unknown }).window;
  });

  it("builds today's options and plan from the brand's slots, results, recent posts and last plan", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 8, 10, 0));
    seed();
    const full = todaysOptions(UID, "instagram", competitors, lastPlan);
    const empty = todaysOptions("someone-else", "linkedin", [], null);
    const out = {
      stores: { options: shown(full), plan: stable(generatePlan({ ...PIN_POS, cadence: 5 }, { weeks: 2, salt: 0, ...full })) },
      empty: { options: shown(empty), plan: stable(generatePlan({ ...PIN_POS, platform: "linkedin", cadence: 3 }, { weeks: 1, salt: 0, ...empty })) },
    };
    await expect(JSON.stringify(out, null, 2)).toMatchFileSnapshot("./__pins__/plan-options-today.json");
  });
});
