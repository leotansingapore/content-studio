import { describe, expect, it } from "vitest";
import { cadence } from "@/lib/campaignLabels";

// the time is written in the device's own locale (9:00 AM in en-US, 09:00 in en-GB), so the expected words use it too
const clock = (at: string) => new Date(`2000-01-01T${at}:00`).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

describe("a campaign's posting times in words (Home and the Campaigns list)", () => {
  it("says every day, or the weekdays it posts, with the time", () => {
    expect(cadence({ tz: "Asia/Singapore", times: [{ at: "09:00", days: [0, 1, 2, 3, 4, 5, 6] }] })).toBe(`Every day at ${clock("09:00")}`);
    expect(cadence({ tz: "Asia/Singapore", times: [{ at: "18:30", days: [3, 1] }] })).toBe(`Mon, Wed at ${clock("18:30")}`);
    expect(cadence({ tz: "Asia/Singapore", times: [{ at: "07:00", days: [0, 6] }] })).toBe(`Sun, Sat at ${clock("07:00")}`);
  });

  it("counts several times as times a day and the posts a week they add up to", () => {
    expect(cadence({ tz: "Asia/Singapore", times: [{ at: "09:00", days: [0, 1, 2, 3, 4, 5, 6] }, { at: "12:00", days: [1, 3] }, { at: "18:00", days: [5] }] })).toBe("3 times a day, 10 a week");
  });

  it("says there are no posting times when none can be read", () => {
    expect(cadence(null)).toBe("No posting times");
    expect(cadence({ times: [{ at: "9am", days: [1] }, { at: "10:00", days: [] }] })).toBe("No posting times");
  });
});
