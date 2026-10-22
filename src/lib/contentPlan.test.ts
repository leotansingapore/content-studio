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

import { angleText, generatePlan, pillarGrid, planItemToGenerateUrl, rebuildPlan, recentThemes, relabelSlot, slotLabel, stageSplit, weightedOrder } from "./contentPlan";
import type { Label } from "./labels";
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
import { planOptionsFor, planPerformance, steerFor, WEEKDAYS, type ContentPlan, type GeneratePlanOptions } from "./contentPlan";
import { saveGoal } from "./positioning";
import { updateLabel } from "./labels";

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
  const localStorage = () => (globalThis as unknown as { window: { localStorage: MemStorage } }).window.localStorage;
  const seed = () => {
    const mem = new MemStorage();
    (globalThis as { window?: unknown }).window = { localStorage: mem, dispatchEvent: () => true };
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

  it("steerFor gives the goal's weights and, once labels are saved, the pillars", () => {
    seed();
    expect(steerFor(UID)).toEqual({});
    localStorage().setItem(`content-studio-positioning-${UID}`, JSON.stringify({ topics: ["CPF", "Wills"] }));
    saveGoal(UID, "Get known", "audience");
    expect(steerFor(UID)).toEqual({ weights: { attraction: 6, trust: 3, conversion: 1 } });
    updateLabel(UID, "t-cpf", { target: 75 });
    expect(steerFor(UID).pillars).toEqual([{ id: "t-cpf", name: "CPF", weight: 75 }, { id: "t-wills", name: "Wills", weight: 50 }]);
    saveGoal(UID, "Hire two", "recruit");
    expect(steerFor(UID)).not.toHaveProperty("weights");
  });

  it("builds today's options and plan from the brand's slots, results, recent posts and last plan (PlanPage's planOptions, moved out)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 8, 10, 0));
    seed();
    const full = planOptionsFor(UID, "instagram", { competitors, plan: lastPlan });
    const empty = planOptionsFor("someone-else", "linkedin", { plan: null });
    const out = {
      stores: { options: shown(full), plan: stable(generatePlan({ ...PIN_POS, cadence: 5 }, { weeks: 2, salt: 0, ...full })) },
      empty: { options: shown(empty), plan: stable(generatePlan({ ...PIN_POS, platform: "linkedin", cadence: 3 }, { weeks: 1, salt: 0, ...empty })) },
    };
    await expect(JSON.stringify(out, null, 2)).toMatchFileSnapshot("./__pins__/plan-options-today.json");
    expect(planPerformance(UID)).toEqual(full.performance);
  });
});

describe("stageSplit", () => {
  const AUDIENCE = { attraction: 6, trust: 3, conversion: 1 };
  const CLIENTS = { attraction: 2, trust: 4, conversion: 4 };
  const TRUST = { attraction: 3, trust: 6, conversion: 1 };
  const counts = (order: string[]) => ["attraction", "trust", "conversion"].map((s) => order.filter((x) => x === s).length);

  it("is today's split exactly without weights", () => {
    expect([3, 4, 5, 7].map((c) => counts(stageSplit(c)))).toEqual([[1, 1, 1], [1, 2, 1], [2, 2, 1], [3, 3, 1]]);
    expect(stageSplit(4, { attraction: 0, trust: 0, conversion: 0 })).toEqual(stageSplit(4));
  });

  it("splits by the largest remainder, ties to the earlier stage, in funnel order", () => {
    expect([3, 5, 7].map((c) => counts(stageSplit(c, CLIENTS)))).toEqual([[1, 1, 1], [1, 2, 2], [1, 3, 3]]);
    expect([3, 5, 7].map((c) => counts(stageSplit(c, AUDIENCE)))).toEqual([[2, 1, 0], [3, 2, 0], [4, 2, 1]]);
    expect([3, 5, 7].map((c) => counts(stageSplit(c, TRUST)))).toEqual([[1, 2, 0], [2, 3, 0], [2, 4, 1]]);
    expect(stageSplit(5, CLIENTS)).toEqual(["attraction", "trust", "trust", "conversion", "conversion"]);
  });

  it("keeps at least one attraction slot", () => {
    expect(stageSplit(3, { attraction: 0, trust: 1, conversion: 1 })).toEqual(["attraction", "trust", "conversion"]);
  });

  it("steers generatePlan: 3/2/0 a week at 5 with an audience goal, 1/2/2 with clients", () => {
    const week = (weights?: typeof AUDIENCE) => counts(generatePlan(pos({ cadence: 5 }), { weeks: 2, weights }).items.filter((i) => i.week === 2).map((i) => i.stage));
    expect(week(AUDIENCE)).toEqual([3, 2, 0]);
    expect(week(CLIENTS)).toEqual([1, 2, 2]);
    expect(week()).toEqual([2, 2, 1]);
  });
});

describe("weightedOrder", () => {
  const P = (...w: number[]) => w.map((weight, i) => ({ id: "abc"[i], weight }));

  it("spreads 2, 1, 1 over 8 as 4, 2, 2 with no pillar twice in a row", () => {
    expect(weightedOrder(P(2, 1, 1), 8).join("")).toBe("abacabac");
  });

  it("never picks a zero weight, fills every slot with one pillar, and gives none when every weight is 0", () => {
    expect(weightedOrder(P(1, 0), 5)).toEqual(["a", "a", "a", "a", "a"]);
    expect(weightedOrder(P(3), 3)).toEqual(["a", "a", "a"]);
    expect(weightedOrder(P(0, 0), 4)).toEqual([]);
    expect(weightedOrder([], 4)).toEqual([]);
  });

  it("repeats a pillar only once the others are used up", () => {
    expect(weightedOrder(P(6, 1, 1), 8).join("")).toBe("abacaaaa");
  });
});

describe("generatePlan pillars, angles and formats", () => {
  const PILLARS = [
    { id: "cpf", name: "CPF top-ups", weight: 50 },
    { id: "ins", name: "Insurance", weight: 25 },
    { id: "ret", name: "Retirement", weight: 25 },
  ];

  it("spreads 8 topic and market slots over pillars 50/25/25 as 4, 2, 2, never twice in a row, past the two-week rest, and leaves social slots unlabelled", () => {
    const plan = generatePlan(pos({ cadence: 7 }), { weeks: 2, pillars: PILLARS, recentThemes: new Set(["cpf top-ups"]) });
    const topical = plan.items.filter((i) => i.pillar === "topic" || i.pillar === "market");
    expect(topical).toHaveLength(8);
    const ids = topical.map((i) => i.labelId);
    expect(["cpf", "ins", "ret"].map((id) => ids.filter((x) => x === id).length)).toEqual([4, 2, 2]);
    expect(ids.some((id, k) => k > 0 && id === ids[k - 1])).toBe(false);
    expect(topical.map((i) => i.pillarDetail)).toEqual(ids.map((id) => PILLARS.find((p) => p.id === id)!.name));
    expect(topical[0].angle.startsWith(topical[0].pillarDetail)).toBe(true);
    expect(plan.items.filter((i) => i.pillar === "identity" || i.pillar === "interest").every((i) => !("labelId" in i))).toBe(true);
    expect(plan.restedThemes).toBeUndefined();
  });

  it("falls back to today's topic rotation when every pillar weight is 0", () => {
    const zero = PILLARS.map((p) => ({ ...p, weight: 0 }));
    expect(stable(generatePlan(pos({ cadence: 7 }), { weeks: 2, salt: 1, pillars: zero }))).toEqual(stable(generatePlan(pos({ cadence: 7 }), { weeks: 2, salt: 1 })));
  });

  it("cycles the angles: 12 posts over 5 angles give 3, 3, 2, 2, 2", () => {
    const angles = ["a1", "a2", "a3", "a4", "a5"].map((id) => ({ id, title: id, line: "" }));
    const ids = generatePlan(pos({ cadence: 4 }), { weeks: 3, angles }).items.map((i) => i.angleId);
    expect(ids.slice(0, 6)).toEqual(["a1", "a2", "a3", "a4", "a5", "a1"]);
    expect(angles.map((a) => ids.filter((x) => x === a.id).length)).toEqual([3, 3, 2, 2, 2]);
    expect(generatePlan(pos({ cadence: 4 }), { weeks: 1 }).items.some((i) => "angleId" in i)).toBe(false);
  });

  it("rotates only the given formats, even past the best format", () => {
    const formats = (o: Parameters<typeof generatePlan>[1]) => [...new Set(generatePlan(pos({ cadence: 7 }), { weeks: 2, ...o }).items.map((i) => i.format))].sort();
    expect(formats({ formats: ["carousel"] })).toEqual(["carousel"]);
    expect(formats({ formats: ["text-post", "short-video"], performance: { bestFormat: "carousel" } })).toEqual(["short-video", "text-post"]);
    expect(formats({ formats: ["story"] })).toEqual(["story"]);
    expect(formats({})).toEqual(["carousel", "short-video", "text-post"]);
  });

  it("passes a slot's label to Write and to its calendar placeholder", () => {
    const labelled = { ...item("a", "Wk 1 · Mon"), labelId: "cpf" };
    expect(new URLSearchParams(planItemToGenerateUrl(labelled).split("?")[1]).get("label")).toBe("cpf");
    expect(new URLSearchParams(planItemToGenerateUrl(item("b", "Mon")).split("?")[1]).has("label")).toBe(false);
    const { entries } = planCalendarEntries([labelled, item("b", "Wk 1 · Tue")], monday, []);
    expect(entries.map((e) => e.labels)).toEqual([["cpf"], undefined]);
  });
});

describe("slot labels, rebuild and the pillar grid", () => {
  const LABELS: Label[] = [
    { id: "cpf", name: "CPF top-ups", color: "primary" },
    { id: "ci", name: "Critical illness", color: "brand" },
  ];
  const topicSlot = (o: Partial<PlanItem> = {}): PlanItem => ({
    ...item("s", "Wk 1 · Mon"), pillar: "topic", pillarDetail: "critical illness", angle: "Critical illness \u2014 a myth worth busting", hook: "Hook s", ...o,
  });

  it("angleText swaps the em dash for a colon", () => {
    expect(angleText(topicSlot())).toBe("Critical illness: a myth worth busting");
    const plan = generatePlan(pos({ cadence: 7 }), { weeks: 2 });
    expect(plan.items.some((i) => i.angle.includes("\u2014"))).toBe(true);
    expect(plan.items.every((i) => !angleText(i).includes("\u2014"))).toBe(true);
  });

  it("slotLabel prefers the slot's label, falls back to a name match, and ignores a deleted id", () => {
    expect(slotLabel(topicSlot({ labelId: "cpf" }), LABELS)!.id).toBe("cpf");
    expect(slotLabel(topicSlot({ pillarDetail: "  Critical Illness " }), LABELS)!.id).toBe("ci");
    expect(slotLabel(topicSlot({ labelId: "gone" }), LABELS)!.id).toBe("ci");
    expect(slotLabel(topicSlot({ pillarDetail: "Wills" }), LABELS)).toBeNull();
  });

  it("relabelSlot renames a topic slot's topic and angle head, only labels a personal slot, and No label clears it", () => {
    const moved = relabelSlot(topicSlot(), LABELS[0]);
    expect(moved).toMatchObject({ labelId: "cpf", pillarDetail: "CPF top-ups", angle: "CPF top-ups \u2014 a myth worth busting", hook: "Hook s" });
    const personal = topicSlot({ pillar: "identity", pillarDetail: "a value you refuse to compromise on", angle: "A value you refuse to compromise on" });
    expect(relabelSlot(personal, LABELS[0])).toEqual({ ...personal, labelId: "cpf" });
    expect(relabelSlot(moved, null)).not.toHaveProperty("labelId");
    expect(relabelSlot(moved, null).pillarDetail).toBe("CPF top-ups");
  });

  it("rebuildPlan with new pillars keeps posted ticks by slot id, the first hook formula and this week's story", () => {
    const before = { ...generatePlan(pos({ cadence: 5 }), { weeks: 2, salt: 1, formulaStart: 7 }), thisWeek: "Lost a client" };
    before.items = before.items.map((i, k) => (k === 1 || k === 6 ? { ...i, posted: true } : i));
    const after = rebuildPlan(before, pos({ cadence: 5 }), { pillars: [{ id: "cpf", name: "CPF top-ups", weight: 1 }], formulaStart: 0 });
    expect(after.items.map((i) => i.id)).toEqual(before.items.map((i) => i.id));
    expect(after.items.filter((i) => i.posted).map((i) => i.id)).toEqual([before.items[1].id, before.items[6].id]);
    expect(after.items.map((i) => i.formulaId)).toEqual(before.items.map((i) => i.formulaId));
    expect(after).toMatchObject({ id: before.id, createdAt: before.createdAt, salt: 1, weeks: 2, thisWeek: "Lost a client" });
    expect(after.items.some((i) => i.labelId === "cpf")).toBe(true);
  });

  it("pillarGrid counts posts out in the last 28 days and this plan's slots, by label and format", () => {
    const now = new Date("2026-10-22T04:00:00.000Z");
    const drafts = [
      post({ id: "1", status: "posted", postedAt: "2026-10-20T02:00:00.000Z", format: "carousel", labels: ["cpf", "ci"] }),
      post({ id: "2", status: "posted", postedAt: "2026-09-25T02:00:00.000Z", format: "carousel", labels: ["cpf"] }),
      post({ id: "3", status: "posted", postedAt: "2026-09-20T02:00:00.000Z", format: "carousel", labels: ["cpf"] }),
      post({ id: "4", status: "scheduled", scheduledFor: "2026-10-25", format: "text-post", labels: ["cpf"] }),
      post({ id: "5", status: "posted", postedAt: "2026-10-21T02:00:00.000Z", format: "story", labels: ["cpf"] }),
      post({ id: "6", status: "draft", postedAt: "2026-10-21T02:00:00.000Z", format: "carousel", labels: ["ci"] }),
    ];
    const plan = { items: [topicSlot({ format: "short-video" }), topicSlot({ labelId: "cpf", format: "short-video" }), topicSlot({ labelId: "cpf", format: "text-post" })] } as ContentPlan;
    const grid = pillarGrid(LABELS, drafts, plan, now);
    expect(grid.map((r) => [r.labelId, r.cells])).toEqual([
      ["cpf", { "text-post": { posted: 0, planned: 1 }, carousel: { posted: 2, planned: 0 }, "short-video": { posted: 0, planned: 1 } }],
      ["ci", { "text-post": { posted: 0, planned: 0 }, carousel: { posted: 1, planned: 0 }, "short-video": { posted: 0, planned: 1 } }],
    ]);
    expect(pillarGrid(LABELS, [], null, now)[0].cells.carousel).toEqual({ posted: 0, planned: 0 });
  });
});
