import { describe, expect, it } from "vitest";
import {
  addDays,
  daysOverdue,
  dueHeading,
  localDateKey,
  monthGrid,
  overdueLabel,
  postedDay,
  scheduleAt,
  scheduleTime,
  timeLabel,
  weekOf,
} from "./dueDates";

describe("postedDay", () => {
  it("is the local day of the posting instant, not its UTC day", () => {
    // 4am on 5 Oct where the test runs: still 4 Oct in UTC east of London.
    expect(postedDay(new Date(2026, 9, 5, 4, 0).toISOString())).toBe("2026-10-05");
    expect(postedDay(new Date(2026, 9, 5, 23, 30).toISOString())).toBe("2026-10-05");
  });
  it("keeps a bare day as it is", () => {
    expect(postedDay("2026-10-05")).toBe("2026-10-05");
  });
});

describe("localDateKey", () => {
  it("uses the local calendar day, not the UTC one", () => {
    expect(localDateKey(new Date(2026, 8, 5, 7, 30))).toBe("2026-09-05");
    expect(localDateKey(new Date(2026, 11, 31, 23, 59))).toBe("2026-12-31");
  });
});

describe("daysOverdue", () => {
  it("counts whole days late, zero for today and negative for later", () => {
    expect(daysOverdue("2026-07-26", "2026-09-15")).toBe(51);
    expect(daysOverdue("2026-09-15", "2026-09-15")).toBe(0);
    expect(daysOverdue("2026-09-18", "2026-09-15")).toBe(-3);
  });

  it("reads the day part of a full timestamp", () =>
    expect(daysOverdue("2026-09-14T16:00:00.000Z", "2026-09-15")).toBe(1));

  it("reads the day part of a day with a posting time", () => {
    expect(daysOverdue("2026-09-15T19:30", "2026-09-15")).toBe(0);
    expect(daysOverdue("2026-09-13T08:00", "2026-09-15")).toBe(2);
  });
});

describe("overdueLabel", () => {
  it("says how late a post is in plain units", () => {
    expect(overdueLabel(0)).toBe("Due today");
    expect(overdueLabel(1)).toBe("1 day overdue");
    expect(overdueLabel(13)).toBe("13 days overdue");
    expect(overdueLabel(51)).toBe("7 weeks overdue");
    expect(overdueLabel(70)).toBe("2 months overdue");
  });

  it("names the time when a post due today has one", () => {
    expect(overdueLabel(0, "19:30")).toBe("Due 7:30pm");
    expect(overdueLabel(0, null)).toBe("Due today");
    expect(overdueLabel(3, "19:30")).toBe("3 days overdue");
  });
});

describe("dueHeading", () => {
  it("separates due today from overdue", () => {
    expect(dueHeading(1, 0)).toBe("1 post is due today");
    expect(dueHeading(3, 0)).toBe("3 posts are due today");
    expect(dueHeading(1, 1)).toBe("1 post is overdue");
    expect(dueHeading(2, 2)).toBe("2 posts are overdue");
    expect(dueHeading(2, 1)).toBe("2 posts are due or overdue");
  });
});

describe("calendar grids", () => {
  it("steps days across month and year ends", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2026-10-08", 7)).toBe("2026-10-15");
  });

  it("gives the Monday-to-Sunday week of any day", () => {
    const week = ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11"];
    expect(weekOf("2026-10-08")).toEqual(week);
    expect(weekOf("2026-10-05")).toEqual(week);
    expect(weekOf("2026-10-11")).toEqual(week);
  });

  it("lays a month out from the Monday on or before the 1st", () => {
    const oct = monthGrid(2026, 9); // 1 Oct 2026 is a Thursday
    expect(oct).toHaveLength(42);
    expect(oct[0]).toBe("2026-09-28");
    expect(oct).toContain("2026-10-31");
    expect(monthGrid(2026, 5)[0]).toBe("2026-06-01"); // 1 Jun 2026 is a Monday
  });
});

describe("posting times", () => {
  it("reads a local time and treats every other shape as date-only", () => {
    expect(scheduleTime("2026-10-09T19:30")).toBe("19:30");
    expect(scheduleTime("2026-10-09")).toBeNull();
    expect(scheduleTime("2026-10-09T01:00:00.000Z")).toBeNull(); // the board's default 9am
    expect(scheduleTime(undefined)).toBeNull();
  });

  it("joins a day and an optional time", () => {
    expect(scheduleAt("2026-10-09", "07:05")).toBe("2026-10-09T07:05");
    expect(scheduleAt("2026-10-09", null)).toBe("2026-10-09");
    expect(scheduleAt("2026-10-09", "")).toBe("2026-10-09");
  });

  it("says a time the way people write it", () => {
    expect(timeLabel("19:30")).toBe("7:30pm");
    expect(timeLabel("09:00")).toBe("9am");
    expect(timeLabel("00:15")).toBe("12:15am");
    expect(timeLabel("12:00")).toBe("12pm");
  });
});
