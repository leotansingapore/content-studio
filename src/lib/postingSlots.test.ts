import { describe, expect, it } from "vitest";
import { DAY_SETS, GOAL_DAYS, addSlots, fillSlots, monFirst, nextOpenSlots, openSlots, slotDaysLabel, slotsForGoal, slotsOn } from "./postingSlots";
import { suggestPostingTime } from "./analytics";

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

  it("a post the board scheduled with its older full timestamp takes that day's earliest open slot, like a day-only post", () => {
    // the board once saved 9am Singapore as a UTC instant; the app reads it as the day alone (dueDates.ts scheduleTime)
    expect(openSlots(SLOTS, ["2026-10-14T01:00:00.000Z"], morning, 1)).toEqual([{ date: "2026-10-14", time: "19:30" }]);
  });

  it("returns nothing without slots", () => {
    expect(openSlots([], [], morning, 14)).toEqual([]);
  });
});

// Pins (phase 7a post-libs): today's answers on fixed inputs, before nextOpenSlots and fillSlots build on them.
describe("pins: open slots and the next slot as they read before per-network times", () => {
  const morning = new Date(2026, 9, 14, 7, 0); // Wed 07:00

  it("openSlots over two weeks with exact, day-only, board and other-time posts", () => {
    const taken = ["2026-10-14T08:30", "2026-10-16", "2026-10-19T01:00:00.000Z", "2026-10-21T10:00", "2026-10-23T12:00"];
    expect(openSlots(SLOTS, taken, morning, 14)).toEqual([
      { date: "2026-10-14", time: "19:30" },
      { date: "2026-10-21", time: "08:30" },
      { date: "2026-10-21", time: "19:30" },
      { date: "2026-10-26", time: "08:30" },
    ]);
  });

  it("suggestPostingTime's slot answers that stay when its slot branch moves to nextOpenSlots", () => {
    // nothing scheduled: the first slot at least 2 hours away (Wed 08:30 is 90 minutes off)
    expect(suggestPostingTime([], "linkedin", [], morning, SLOTS)).toEqual({ at: "2026-10-14T19:30", why: "slot" });
    expect(suggestPostingTime([], "instagram", [], new Date(2026, 9, 14, 20, 0), SLOTS)).toEqual({ at: "2026-10-16T12:00", why: "slot" });
    // Friday's one slot taken: the next Monday
    expect(suggestPostingTime([], "linkedin", ["2026-10-16T12:00"], new Date(2026, 9, 15, 9, 0), SLOTS)).toEqual({ at: "2026-10-19T08:30", why: "slot" });
    // no usable slots: the results fallback
    expect(suggestPostingTime([], "instagram", [], morning, [])).toEqual({ at: "2026-10-14T19:30", why: "common" });
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

describe("addSlots", () => {
  it("adds one time to every chosen day, in week order, without repeats", () => {
    expect(addSlots(["2T19:30"], DAY_SETS.weekdays, "08:30").slots).toEqual(["0T08:30", "1T08:30", "2T08:30", "2T19:30", "3T08:30", "4T08:30"]);
    expect(addSlots(["5T10:00"], DAY_SETS.weekends, "10:00")).toEqual({ slots: ["5T10:00", "6T10:00"], skipped: 0 });
  });
  it("stops at the limit and says how many it left out", () => {
    const full = addSlots([], DAY_SETS.everyDay, "08:00").slots;
    expect(addSlots(full, DAY_SETS.everyDay, "19:30", 10)).toEqual({ slots: [...full, "0T19:30", "1T19:30", "2T19:30"].sort(), skipped: 4 });
  });
  it("ignores a malformed time", () => {
    expect(addSlots(["1T08:30"], DAY_SETS.everyDay, "8:30")).toEqual({ slots: ["1T08:30"], skipped: 0 });
  });
  it("never counts a time it already has as left out, even when full", () => {
    expect(addSlots(["0T08:00", "1T08:00"], [0, 1], "08:00", 2)).toEqual({ slots: ["0T08:00", "1T08:00"], skipped: 0 });
  });
});

// publish-queue: one rule for the next open slot, per network when the brand kit has per-network times.
describe("nextOpenSlots", () => {
  const monday = new Date(2026, 9, 19, 9, 0); // Mon 19 Oct 09:00; Tue 20 Oct is Mon-first weekday 1
  const shared = { slots: ["1T08:00", "1T19:30"] };
  const perNetwork = { ...shared, slotsBy: { linkedin: ["1T08:00"], instagram: ["1T19:30"] } };

  it("with per-network times a LinkedIn post at Tue 8:00 am leaves Instagram's Tue 7:30 pm open", () => {
    const li = [{ platform: "linkedin", scheduledFor: "2026-10-20T08:00" }];
    expect(nextOpenSlots(perNetwork, "instagram", li, monday, 7)).toEqual([{ date: "2026-10-20", time: "19:30" }]);
    expect(nextOpenSlots(perNetwork, "linkedin", li, monday, 7)).toEqual([]);
  });

  it("with per-network times only a post on the same network holds its slot; with shared times every post does", () => {
    const evening = [{ platform: "linkedin", scheduledFor: "2026-10-20T19:30" }];
    expect(nextOpenSlots(perNetwork, "instagram", evening, monday, 7)).toEqual([{ date: "2026-10-20", time: "19:30" }]);
    expect(nextOpenSlots(shared, "instagram", evening, monday, 7)).toEqual([{ date: "2026-10-20", time: "08:00" }]);
    // a network with no row of its own takes the shared times, held by its own posts only
    expect(nextOpenSlots(perNetwork, "tiktok", evening, monday, 7)).toEqual([{ date: "2026-10-20", time: "08:00" }, { date: "2026-10-20", time: "19:30" }]);
    // a network whose row was emptied has no times
    expect(nextOpenSlots({ ...perNetwork, slotsBy: { ...perNetwork.slotsBy, tiktok: [] } }, "tiktok", [], monday, 7)).toEqual([]);
  });

  it("with them off it is openSlots over every post, as today", () => {
    const taken = [
      { platform: "instagram", scheduledFor: "2026-10-14T08:30" },
      { platform: "linkedin", scheduledFor: "2026-10-16" },
      { platform: "tiktok", scheduledFor: "2026-10-19T01:00:00.000Z" },
      { platform: "facebook", scheduledFor: "2026-10-23T12:00" },
      { platform: "linkedin" },
    ];
    const at6 = new Date(2026, 9, 14, 6, 0); // no slot within 2 hours
    expect(nextOpenSlots({ slots: SLOTS }, "linkedin", taken, at6, 14)).toEqual(openSlots(SLOTS, taken.filter((t) => t.scheduledFor).map((t) => t.scheduledFor!), at6, 14));
    expect(nextOpenSlots({ slots: SLOTS, slotsBy: {} }, "linkedin", taken, at6, 14)).toEqual(openSlots(SLOTS, taken.filter((t) => t.scheduledFor).map((t) => t.scheduledFor!), at6, 14));
  });

  it("skips slots already past and any under 2 hours away", () => {
    const wed = new Date(2026, 9, 14, 7, 0);
    expect(nextOpenSlots({ slots: SLOTS }, "linkedin", [], wed, 3)).toEqual([{ date: "2026-10-14", time: "19:30" }, { date: "2026-10-16", time: "12:00" }]);
    expect(nextOpenSlots({ slots: SLOTS }, "linkedin", [], new Date(2026, 9, 14, 6, 30), 1)).toEqual([{ date: "2026-10-14", time: "08:30" }, { date: "2026-10-14", time: "19:30" }]);
    expect(nextOpenSlots(null, "linkedin", [], wed, 14)).toEqual([]);
  });
});

describe("fillSlots", () => {
  const wed = new Date(2026, 9, 14, 7, 0);
  const draft = (id: string, createdAt: string, platform = "linkedin") => ({ id, createdAt, platform });

  it("places the oldest draft first, one per slot, skipping slots that are taken", () => {
    const drafts = [draft("c", "2026-10-03T00:00:00.000Z", "instagram"), draft("a", "2026-10-01T00:00:00.000Z"), draft("b", "2026-10-02T00:00:00.000Z", "instagram")];
    expect(fillSlots(drafts, { slots: SLOTS }, [{ platform: "facebook", scheduledFor: "2026-10-14T19:30" }], wed)).toEqual({
      placed: [
        { draftId: "a", at: "2026-10-16T12:00" },
        { draftId: "b", at: "2026-10-19T08:30" },
        { draftId: "c", at: "2026-10-21T08:30" },
      ],
      left: [],
    });
  });

  it("with per-network times fills each network's own slots, and lists the drafts that didn't fit by network", () => {
    const brand = { slots: SLOTS, slotsBy: { linkedin: ["4T12:00"], instagram: ["4T12:00"], tiktok: [] } };
    const drafts = [draft("a", "2026-10-01"), draft("b", "2026-10-02", "instagram"), draft("c", "2026-10-03"), draft("d", "2026-10-04", "tiktok"), draft("e", "2026-10-05")];
    expect(fillSlots(drafts, brand, [], wed)).toEqual({
      placed: [
        { draftId: "a", at: "2026-10-16T12:00" },
        { draftId: "b", at: "2026-10-16T12:00" },
        { draftId: "c", at: "2026-10-23T12:00" },
      ],
      left: [
        { draftId: "d", platform: "tiktok" },
        { draftId: "e", platform: "linkedin" },
      ],
    });
  });

  it("has nothing to place without posting times", () => {
    expect(fillSlots([draft("a", "2026-10-01")], { slots: [] }, [], wed)).toEqual({ placed: [], left: [{ draftId: "a", platform: "linkedin" }] });
  });
});
