import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadDrafts,
  nextOccurrence,
  occurrencesBetween,
  restoreDraft,
  saveDrafts,
  setDraftStatus,
  setRepeat,
  skipOccurrence,
  upsertDraft,
  duplicateDraft,
  undoDuplicate,
  undoPosted,
  markUnposted,
  MAX_DRAFTS,
  type DraftEntry,
} from "./draftHistory";

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

const post = (extra: Partial<DraftEntry>): DraftEntry => ({
  id: "s",
  createdAt: "2026-10-01T00:00:00.000Z",
  hook: "Weekly tip",
  draft: "Body",
  pillar: "",
  pillarDetail: "",
  audience: "",
  format: "",
  platform: "linkedin",
  ctaType: "",
  ...extra,
});

beforeEach(() => {
  (globalThis as { window?: unknown }).window = { localStorage: new MemStorage() };
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 8, 10, 0)); // Thu 8 Oct 2026, local
});
afterEach(() => vi.useRealTimers());

describe("occurrences", () => {
  it("steps weekly and fortnightly from the start", () => {
    const weekly = { every: "week" as const, start: "2026-10-08" };
    expect(occurrencesBetween(weekly, "2026-10-08", "2026-10-31")).toEqual(["2026-10-15", "2026-10-22", "2026-10-29"]);
    expect(occurrencesBetween({ every: "2weeks", start: "2026-10-08" }, "2026-10-08", "2026-11-30")).toEqual([
      "2026-10-22",
      "2026-11-05",
      "2026-11-19",
    ]);
  });

  it("keeps the day of the month, on the last day of a short month", () => {
    const monthly = { every: "month" as const, start: "2027-01-31" };
    expect(occurrencesBetween(monthly, "2027-01-31", "2027-05-31")).toEqual([
      "2027-02-28",
      "2027-03-31",
      "2027-04-30",
      "2027-05-31",
    ]);
  });

  it("leaves skipped days out", () => {
    const r = { every: "week" as const, start: "2026-10-08", skip: ["2026-10-22"] };
    expect(occurrencesBetween(r, "2026-10-08", "2026-10-31")).toEqual(["2026-10-15", "2026-10-29"]);
    expect(nextOccurrence(r, "2026-10-15")).toBe("2026-10-29");
  });
});

describe("recurring posts", () => {
  it("posting an occurrence records it and moves the series on, keeping the time", () => {
    saveDrafts(UID, [post({ status: "scheduled", scheduledFor: "2026-10-08T19:30" })]);
    setRepeat(UID, "s", "week");
    const after = setDraftStatus(UID, "s", "posted");
    expect(after).toHaveLength(2);
    const [record, series] = after;
    expect(record).toMatchObject({ status: "posted", scheduledFor: "2026-10-08T19:30", hook: "Weekly tip" });
    expect(record.repeat).toBeUndefined();
    expect(record.id).not.toBe("s");
    expect(series).toMatchObject({ id: "s", status: "scheduled", scheduledFor: "2026-10-15T19:30" });
    expect(series.repeat).toEqual({ every: "week", start: "2026-10-08" });
  });

  it("a late post catches the series up to after today", () => {
    saveDrafts(UID, [post({ status: "scheduled", scheduledFor: "2026-09-17", repeat: { every: "week", start: "2026-09-17" } })]);
    const series = setDraftStatus(UID, "s", "posted").find((d) => d.id === "s")!;
    expect(series.scheduledFor).toBe("2026-10-15"); // 8 Oct is today, so the post covers it
  });

  it("skip this one moves the next occurrence on, or leaves a later one out", () => {
    saveDrafts(UID, [post({ status: "scheduled", scheduledFor: "2026-10-15", repeat: { every: "week", start: "2026-10-08" } })]);
    let s = skipOccurrence(UID, "s", "2026-10-15")[0];
    expect(s.scheduledFor).toBe("2026-10-22");
    s = skipOccurrence(UID, "s", "2026-10-29")[0];
    expect(s.scheduledFor).toBe("2026-10-22");
    expect(s.repeat?.skip).toEqual(["2026-10-29"]);
    s = setDraftStatus(UID, "s", "posted").find((d) => d.id === "s")!;
    expect(s.scheduledFor).toBe("2026-11-05");
    expect(s.repeat?.skip).toBeUndefined();
  });

  it("moving a recurring post moves the series; unscheduling ends it", () => {
    saveDrafts(UID, [post({ status: "scheduled", scheduledFor: "2026-10-15", repeat: { every: "week", start: "2026-10-08", skip: ["2026-10-29"] } })]);
    let s = setDraftStatus(UID, "s", "scheduled", "2026-10-16")[0];
    expect(s.repeat).toEqual({ every: "week", start: "2026-10-16" });
    s = setDraftStatus(UID, "s", "draft")[0];
    expect(s.repeat).toBeUndefined();
  });

  it("a one-off post still just turns posted", () => {
    saveDrafts(UID, [post({ status: "scheduled", scheduledFor: "2026-10-08" })]);
    const after = setDraftStatus(UID, "s", "posted");
    expect(after).toHaveLength(1);
    expect(after[0].status).toBe("posted");
  });

  it("restore puts an entry back exactly, in place", () => {
    const original = post({ status: "scheduled", scheduledFor: "2026-10-15", repeat: { every: "week", start: "2026-10-08", skip: ["2026-10-29"] } });
    saveDrafts(UID, [post({ id: "first" }), original]);
    setDraftStatus(UID, "s", "scheduled", "2026-10-20");
    expect(restoreDraft(UID, original)).toEqual([post({ id: "first" }), original]);
    expect(loadDrafts(UID)[1]).toEqual(original);
  });
});

describe("upsertDraft", () => {
  it("keeps a post's numbers when the edit doesn't carry them", () => {
    saveDrafts(UID, [post({ status: "posted", metrics: { impressions: 900, reactions: 12 } })]);
    upsertDraft(UID, post({ status: "posted", hook: "Edited in Write" }));
    expect(loadDrafts(UID)[0]).toMatchObject({ hook: "Edited in Write", metrics: { impressions: 900, reactions: 12 } });
  });
});

describe("upsertDraft and the hook formula", () => {
  it("keeps the formula while the hook is the same, and drops it with a new hook", () => {
    saveDrafts(UID, [post({ hook: "I reviewed 40 families.", hookFormula: "number-reveal" })]);
    upsertDraft(UID, post({ hook: "I reviewed 40 families.", draft: "Edited body" }));
    expect(loadDrafts(UID)[0]).toMatchObject({ draft: "Edited body", hookFormula: "number-reveal" });
    upsertDraft(UID, post({ hook: "A hook I typed myself" }));
    expect(loadDrafts(UID)[0].hookFormula).toBeUndefined();
  });
});

describe("undoPosted", () => {
  it("puts a one-off post back to scheduled", () => {
    const before = [post({ status: "scheduled", scheduledFor: "2026-10-08T19:30" }), post({ id: "other" })];
    saveDrafts(UID, before);
    setDraftStatus(UID, "s", "posted");
    expect(undoPosted(UID, before[0], before)).toEqual(before);
    expect(loadDrafts(UID)).toEqual(before);
  });

  it("removes a recurring post's posted copy and moves the series back", () => {
    const before = [post({ status: "scheduled", scheduledFor: "2026-10-08", repeat: { every: "week", start: "2026-10-08" } })];
    saveDrafts(UID, before);
    expect(setDraftStatus(UID, "s", "posted")).toHaveLength(2);
    expect(undoPosted(UID, before[0], before)).toEqual(before);
  });

  it("brings back a post the posted copy pushed past the cap", () => {
    const before = Array.from({ length: MAX_DRAFTS }, (_, i) =>
      post(i === 0 ? { id: "p0", status: "scheduled", scheduledFor: "2026-10-08", repeat: { every: "week", start: "2026-10-08" } } : { id: `p${i}` }),
    );
    saveDrafts(UID, before);
    setDraftStatus(UID, "p0", "posted");
    expect(loadDrafts(UID).some((d) => d.id === `p${MAX_DRAFTS - 1}`)).toBe(false);
    expect(undoPosted(UID, before[0], before)).toEqual(before);
  });
});

describe("markUnposted", () => {
  it("puts a posted post back on its scheduled day, time and repeat, keeping its numbers", () => {
    const repeat = { every: "week" as const, start: "2026-10-09" };
    const metrics = { impressions: 900, reactions: 12 };
    saveDrafts(UID, [post({ status: "posted", postedAt: "2026-10-09T01:00:00.000Z", scheduledFor: "2026-10-09T08:00", repeat, metrics })]);
    const [d] = markUnposted(UID, "s");
    expect(d).toMatchObject({ status: "scheduled", scheduledFor: "2026-10-09T08:00", repeat, metrics });
    expect(d.postedAt).toBeUndefined();
    expect(loadDrafts(UID)[0]).toEqual(d);
  });

  it("sends a post that never had a day back to the drafts", () => {
    saveDrafts(UID, [post({ status: "posted", postedAt: "2026-10-09T01:00:00.000Z" })]);
    const [d] = markUnposted(UID, "s");
    expect(d.status).toBe("draft");
    expect(d.postedAt).toBeUndefined();
  });
});

describe("duplicateDraft", () => {
  it("copies the content as a fresh draft at the top, without schedule or numbers", () => {
    const original = post({ id: "o", status: "scheduled", scheduledFor: "2026-10-15T09:00", repeat: { every: "week", start: "2026-10-15" }, metrics: { impressions: 5 }, labels: ["l1"] });
    saveDrafts(UID, [post({ id: "first" }), original]);
    const r = duplicateDraft(UID, "o")!;
    expect(r.copy.id).not.toBe("o");
    expect(r.copy).toMatchObject({ hook: "Weekly tip (copy)", draft: "Body", platform: "linkedin", labels: ["l1"], status: "draft" });
    for (const k of ["scheduledFor", "postedAt", "repeat", "metrics"]) expect(r.copy).not.toHaveProperty(k);
    expect(loadDrafts(UID).map((d) => d.id)).toEqual([r.copy.id, "first", "o"]);
    expect(loadDrafts(UID)[2]).toEqual(original);
    expect(duplicateDraft(UID, "missing")).toBeNull();
  });

  it("undo removes the copy and puts back a post the cap pushed out", () => {
    const full = Array.from({ length: MAX_DRAFTS }, (_, i) => post({ id: `p${i}` }));
    saveDrafts(UID, full);
    const r = duplicateDraft(UID, "p0")!;
    expect(r.dropped.map((d) => d.id)).toEqual([`p${MAX_DRAFTS - 1}`]);
    expect(loadDrafts(UID)).toHaveLength(MAX_DRAFTS);
    expect(undoDuplicate(UID, r.copy.id, r.dropped)).toEqual(full);
    expect(loadDrafts(UID)).toEqual(full);
  });
});
