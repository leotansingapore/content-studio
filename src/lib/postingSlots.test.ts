import { describe, expect, it } from "vitest";
import { GOAL_DAYS, monFirst, openSlots, slotDaysLabel, slotsForGoal, slotsOn } from "./postingSlots";

// 2026-10-14 is a Wednesday (Mon-first weekday 2).
const SLOTS = ["0T08:30", "2T08:30", "2T19:30", "4T12:00"];

describe("slotsOn", () => {
  it("returns the times on that weekday, earliest first", () => {
    expect(monFirst("2026-10-14")).toBe(2);
    expect(slotsOn(["2T19:30", "2T08:30", "0T08:30"], "2026-10-14")).toEqual(["08:30", "19:30"]);
    expect(slotsOn(SLOTS, "2026-10-15")).toEqual([]); // Thursday
  });
  it("ignores malformed slots", () => {
    expect(slotsOn(["2T25:00", "9T08:00", "x", "2T07:05"], "2026-10-14")).toEqual(["07:05"]);
  });
});

describe("openSlots", () => {
  const morning = new Date(2026, 9, 14, 7, 0); // Wed 07:00

  it("lists a week of slots from now when nothing is scheduled", () => {
    expect(openSlots(SLOTS, [], morning, 7)).toEqual([
      { date: "2026-10-14", time: "08:30" },
      { date: "2026-10-14", time: "19:30" },
      { date: "2026-10-16", time: "12:00" },
      { date: "2026-10-19", time: "08:30" },
    ]);
  });

  it("leaves out slots earlier today", () => {
    const evening = new Date(2026, 9, 14, 12, 0);
    expect(openSlots(SLOTS, [], evening, 1)).toEqual([{ date: "2026-10-14", time: "19:30" }]);
  });

  it("a post at a slot's exact time takes that slot only", () => {
    expect(openSlots(SLOTS, ["2026-10-14T19:30"], morning, 1)).toEqual([{ date: "2026-10-14", time: "08:30" }]);
  });

  it("a post with a day but no time takes that day's earliest open slot", () => {
    expect(openSlots(SLOTS, ["2026-10-14"], morning, 1)).toEqual([{ date: "2026-10-14", time: "19:30" }]);
    expect(openSlots(SLOTS, ["2026-10-14", "2026-10-14"], morning, 1)).toEqual([]);
  });

  it("a post at another time that day leaves the slots open", () => {
    expect(openSlots(SLOTS, ["2026-10-14T10:00"], morning, 1)).toHaveLength(2);
  });

  it("returns nothing without slots", () => {
    expect(openSlots([], [], morning, 14)).toEqual([]);
  });
});

describe("slotsForGoal", () => {
  it("spreads the goal over the week at the time given per weekday", () => {
    expect(slotsForGoal(3, () => "08:30")).toEqual(["0T08:30", "2T08:30", "4T08:30"]);
    expect(slotsForGoal(2, (d) => (d === 1 ? "19:30" : "12:00"))).toEqual(["1T19:30", "3T12:00"]);
  });
  it("clamps the goal to 1-7 and drops a malformed time", () => {
    expect(slotsForGoal(0, () => "08:30")).toEqual(["1T08:30"]);
    expect(slotsForGoal(12, () => "08:30")).toHaveLength(7);
    expect(slotsForGoal(3, (d) => (d === 2 ? "8:30" : "09:00"))).toEqual(["0T09:00", "4T09:00"]);
  });
  it("never puts two goal days next to each other below 4 a week", () => {
    for (const n of [2, 3]) {
      const d = GOAL_DAYS[n];
      for (let i = 1; i < d.length; i++) expect(d[i] - d[i - 1]).toBeGreaterThan(1);
    }
  });
});

describe("slotDaysLabel", () => {
  it("names each weekday once in week order", () => {
    expect(slotDaysLabel(["4T08:30", "0T08:30", "0T19:30", "2T12:00"])).toBe("Mon, Wed, Fri");
  });
});
