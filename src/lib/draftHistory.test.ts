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
