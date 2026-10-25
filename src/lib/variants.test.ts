import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabase: {}, SUPABASE_ANON_KEY: "", SUPABASE_URL: "" }));

import { draftsInSet, hookTestResult, joinHook, otherFormulas, splitHook, spreadSlots } from "./variants";
import { HOOK_FORMULAS } from "./hookFormulas";
import type { DraftEntry } from "./draftHistory";

const post = (id: string, extra: Partial<DraftEntry> & Record<string, unknown> = {}): DraftEntry =>
  ({ id, createdAt: `2026-10-0${id.slice(-1)}T00:00:00.000Z`, hook: "", draft: "", pillar: "", pillarDetail: "", audience: "", format: "text", platform: "linkedin", ctaType: "", ...extra }) as DraftEntry;

describe("the hook on and off", () => {
  const body = "Most people check their CPF once a year.\n\nHere are three checks:\n- one\n- two";

  it("takes off a first line equal to the hook, and puts it back with one blank line", () => {
    const draft = joinHook("I reviewed 40 plans this year.", body);
    expect(draft).toBe(`I reviewed 40 plans this year.\n\n${body}`);
    expect(splitHook(draft, "I reviewed 40 plans this year.")).toBe(body);
    expect(splitHook(`  I reviewed 40 plans this year.  \n${body}`, "I reviewed 40 plans this year.")).toBe(body);
    expect(joinHook("A new hook.", splitHook(draft, "I reviewed 40 plans this year."))).toBe(`A new hook.\n\n${body}`);
  });

  it("leaves the draft whole when the hook is not its first line", () => {
    expect(splitHook(body, "I reviewed 40 plans this year.")).toBe(body);
    expect(splitHook(body, "")).toBe(body);
    expect(splitHook("Only a hook.", "Only a hook.")).toBe("");
  });
});

describe("otherFormulas", () => {
  it("gives the 3 formulas after the draft's own, wrapping to the start of the list", () => {
    const ids = otherFormulas("give-it-away");
    expect(ids).toHaveLength(3);
    expect(ids).not.toContain("give-it-away");
    expect(ids).toEqual(HOOK_FORMULAS.slice(0, 3).map((f) => f.id));
    expect(otherFormulas("contrarian")).toEqual(HOOK_FORMULAS.slice(1, 4).map((f) => f.id));
  });

  it("starts at the top of the list for a draft with no formula or an unknown one", () => {
    expect(otherFormulas(undefined)).toEqual(HOOK_FORMULAS.slice(0, 3).map((f) => f.id));
    expect(otherFormulas("gone")).toEqual(HOOK_FORMULAS.slice(0, 3).map((f) => f.id));
  });

  it("keeps the winner's own formula first, then the 2 after it (Make 3 more like the winner)", () => {
    expect(otherFormulas("give-it-away", true)).toEqual(["give-it-away", ...HOOK_FORMULAS.slice(0, 2).map((f) => f.id)]);
    expect(otherFormulas("contrarian", true)).toEqual(HOOK_FORMULAS.slice(0, 3).map((f) => f.id));
    expect(otherFormulas(undefined, true)).toEqual(otherFormulas(undefined));
  });
});

describe("hookTestResult", () => {
  const typed = (impressions: number | undefined, reactions: number) => ({ metrics: { ...(impressions === undefined ? {} : { impressions }), reactions, comments: 0, shares: 0 } });

  it("waits until every version has numbers, typed or pulled", () => {
    const set = [post("p1", typed(1000, 50)), post("p2"), post("p3", { zernio: { key: "k", postId: "z", numbers: { impressions: 900, reach: 800, views: 900, likes: 30, comments: 0, shares: 0, saves: 0, at: "2026-10-20T00:00:00Z" } } as never }), post("p4", { metrics: {} })];
    expect(hookTestResult(set)).toEqual({ kind: "waiting", missing: 2, total: 4 });
    expect(hookTestResult([])).toEqual({ kind: "waiting", missing: 0, total: 0 });
  });

  it("names a winner at a 15 percent lead and calls a 14 percent lead too close, by engagements when one has no impressions", () => {
    expect(hookTestResult([post("p1", typed(undefined, 114)), post("p2", typed(5000, 100))])).toEqual({ kind: "close" });
    expect(hookTestResult([post("p1", typed(undefined, 115)), post("p2", typed(5000, 100)), post("p3", typed(10, 3))])).toEqual({ kind: "winner", id: "p1" });
  });

  it("ranks by engagement rate only when every version has impressions", () => {
    // p1 has more engagements, p2 the better rate (15 percent against 10)
    expect(hookTestResult([post("p1", typed(1000, 100)), post("p2", typed(400, 60))])).toEqual({ kind: "winner", id: "p2" });
    // 11.5 percent against 10 percent is a 15 percent lead; 11.4 is not
    expect(hookTestResult([post("p1", typed(1000, 100)), post("p2", typed(2000, 230))])).toEqual({ kind: "winner", id: "p2" });
    expect(hookTestResult([post("p1", typed(1000, 100)), post("p2", typed(2000, 228))])).toEqual({ kind: "close" });
  });

  it("calls nothing at all a tie", () => {
    expect(hookTestResult([post("p1", typed(100, 0)), post("p2", typed(200, 0))])).toEqual({ kind: "close" });
  });
});

describe("spreadSlots", () => {
  const wed = new Date(2026, 9, 14, 7, 0); // Wed 14 Oct 07:00
  const brand = { slots: ["0T08:30", "2T08:30", "2T19:30", "4T12:00"] };
  const days = (placed: { at: string }[]) => placed.map((p) => p.at.slice(0, 10));
  const gap = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 86_400_000;

  it("puts each version on an open slot 3 or more days after the one before, from now on", () => {
    const set = [post("v1"), post("v2"), post("v3"), post("v4")];
    const { placed, left } = spreadSlots(set, brand, [], wed);
    expect(placed).toEqual([
      { draftId: "v1", at: "2026-10-14T19:30" },
      { draftId: "v2", at: "2026-10-19T08:30" },
      { draftId: "v3", at: "2026-10-23T12:00" },
      { draftId: "v4", at: "2026-10-26T08:30" },
    ]);
    expect(left).toEqual([]);
    const d = days(placed);
    for (let i = 1; i < d.length; i++) expect(gap(d[i - 1], d[i])).toBeGreaterThanOrEqual(3);
    expect(d.every((x) => x >= "2026-10-14")).toBe(true);
  });

  it("never moves a scheduled version, spaces from it, and skips days with a post on that network", () => {
    const set = [post("v1", { scheduledFor: "2026-10-16T12:00" }), post("v2"), post("v3")];
    const scheduled = [
      { platform: "linkedin", scheduledFor: "2026-10-16T12:00" },
      { platform: "linkedin", scheduledFor: "2026-10-19T19:00" },
      { platform: "instagram", scheduledFor: "2026-10-26T10:00" },
    ];
    const { placed } = spreadSlots(set, brand, scheduled, wed);
    expect(placed.map((p) => p.draftId)).toEqual(["v2", "v3"]);
    // Mon 19 holds a LinkedIn post, so v2 waits for Wed 21; Instagram's Mon 26 post doesn't block LinkedIn
    expect(placed).toEqual([
      { draftId: "v2", at: "2026-10-21T08:30" },
      { draftId: "v3", at: "2026-10-26T08:30" },
    ]);
  });

  it("lists the versions no slot took", () => {
    expect(spreadSlots([post("v1"), post("v2")], { slots: ["4T12:00"] }, [], wed, 7)).toEqual({ placed: [{ draftId: "v1", at: "2026-10-16T12:00" }], left: [{ draftId: "v2", platform: "linkedin" }] });
  });
});

describe("draftsInSet", () => {
  it("returns only that set's drafts, oldest first", () => {
    const set = { id: "s1", kind: "hook-test" as const };
    const drafts = [post("p3", { set }), post("p1", { set }), post("p2", { set: { id: "s2", kind: "versions" } }), post("p4")];
    expect(draftsInSet(drafts, "s1").map((d) => d.id)).toEqual(["p1", "p3"]);
    expect(draftsInSet(drafts, "nope")).toEqual([]);
  });
});
