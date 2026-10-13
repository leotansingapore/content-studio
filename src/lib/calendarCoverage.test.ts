import { describe, expect, it } from "vitest";
import { dueByHand, runsOut, weekGlance, type DatedItem } from "./calendarCoverage";

const TODAY = "2026-10-13"; // a Tuesday
const item = (business: string, date: string, done = false): DatedItem => ({ business, date, done });

describe("runsOut", () => {
  it("flags a business whose last planned post lands inside the next two weeks", () => {
    const items = [item("MoneyBees", "2026-10-20"), item("MoneyBees", "2026-10-25")];
    expect(runsOut(items, ["MoneyBees"], TODAY)).toEqual([{ business: "MoneyBees", last: "2026-10-25" }]);
  });

  it("leaves out a business planned past the horizon", () => {
    const items = [item("Team posts", "2026-10-20"), item("Team posts", "2026-12-11")];
    expect(runsOut(items, ["Team posts"], TODAY)).toEqual([]);
  });

  it("counts a post exactly on the horizon as covered and the day before as running out", () => {
    expect(runsOut([item("A", "2026-10-27")], ["A"], TODAY)).toEqual([]);
    expect(runsOut([item("A", "2026-10-26")], ["A"], TODAY)).toEqual([{ business: "A", last: "2026-10-26" }]);
  });

  it("reports nothing planned when only past or posted items exist", () => {
    const items = [item("Me", "2026-10-01"), item("Me", "2026-10-15", true)];
    expect(runsOut(items, ["Me"], TODAY)).toEqual([{ business: "Me", last: null }]);
  });

  it("keeps the order of the businesses given and ignores items of businesses not listed", () => {
    const items = [item("B", "2026-10-14"), item("Hidden", "2026-10-14")];
    expect(runsOut(items, ["B", "A"], TODAY).map((r) => r.business)).toEqual(["B", "A"]);
  });
});

describe("weekGlance", () => {
  const week = ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18"];

  it("counts what goes out from today, what was posted, and the empty days still ahead", () => {
    const items = [
      item("A", "2026-10-12", true), // posted Monday
      item("A", "2026-10-12"), // missed Monday: past, not going
      item("A", "2026-10-13"),
      item("B", "2026-10-15"),
      item("B", "2026-10-15"),
      item("A", "2026-10-20"), // next week
    ];
    expect(weekGlance(items, week, TODAY)).toEqual({
      going: 3,
      posted: 1,
      emptyDays: ["2026-10-14", "2026-10-16", "2026-10-17", "2026-10-18"],
    });
  });

  it("treats a day with only a posted item as busy", () => {
    const g = weekGlance([item("A", "2026-10-14", true)], week, TODAY);
    expect(g.emptyDays).not.toContain("2026-10-14");
  });
});

describe("dueByHand", () => {
  const reel = (id: string, date: string, auto: boolean, posted = false) => ({ id, title: id, date, auto, posted });

  it("returns reels on unconnected brands due today or earlier, oldest first", () => {
    const reels = [reel("late", "2026-10-11", false), reel("today", "2026-10-13", false), reel("future", "2026-10-14", false)];
    expect(dueByHand(reels, TODAY).map((r) => r.id)).toEqual(["late", "today"]);
  });

  it("skips reels that post themselves or are already posted", () => {
    const reels = [reel("auto", "2026-10-12", true), reel("done", "2026-10-12", false, true)];
    expect(dueByHand(reels, TODAY)).toEqual([]);
  });
});
