import { describe, expect, it } from "vitest";
import { clockIn, instantIn, offsetAt, postZone } from "./zone";

// DST days are built from this year's rules, never a fixed calendar date.
const Y = new Date().getUTCFullYear();
const pad = (n: number) => String(n).padStart(2, "0");
const sundays = (m: number) => {
  const out: number[] = [];
  for (let d = 1; d <= 31; d++) {
    const at = new Date(Date.UTC(Y, m - 1, d));
    if (at.getUTCMonth() === m - 1 && at.getUTCDay() === 0) out.push(d);
  }
  return out;
};
const day = (m: number, d: number) => `${Y}-${pad(m)}-${pad(d)}`;
const utc = (m: number, d: number, h: number, min = 0) => Date.UTC(Y, m - 1, d, h, min);

// US: forward on the second Sunday of March, back on the first Sunday of November, both at 2:00 local.
const NY_FWD = sundays(3)[1];
const NY_BACK = sundays(11)[0];
// UK: forward and back on the last Sunday of March and of October, both at 1:00 UTC.
const UK_FWD = sundays(3).at(-1)!;
const UK_BACK = sundays(10).at(-1)!;

describe("postZone: the zone a post's time is read in", () => {
  it("is its Zernio post's zone once Zernio holds it, even when another was saved with the time", () => {
    expect(postZone({ tz: "Europe/London", zernio: { postId: "p1", tz: "America/New_York" } })).toBe("America/New_York");
  });

  it("is Singapore for a Zernio post that saved no zone, not the zone saved with the time", () => {
    expect(postZone({ tz: "Europe/London", zernio: { postId: "p1" } })).toBe("Asia/Singapore");
  });

  it("is the zone saved with the time while Zernio holds no post yet", () => {
    expect(postZone({ tz: "Europe/London", zernio: { tz: "America/Chicago" } })).toBe("Europe/London");
    expect(postZone({ tz: "Europe/London" })).toBe("Europe/London");
  });

  it("reads a missing, unknown or malformed zone as Singapore", () => {
    expect(postZone({})).toBe("Asia/Singapore");
    expect(postZone({ tz: "Mars/Olympus_Mons" })).toBe("Asia/Singapore");
    expect(postZone({ tz: 7 })).toBe("Asia/Singapore");
    expect(postZone({ tz: "Europe/London", zernio: { postId: "p1", tz: "Nowhere/Land" } })).toBe("Asia/Singapore");
  });
});

describe("instantIn: the instant a day and time name in a zone", () => {
  it("reads Singapore and half-hour zones with no daylight saving", () => {
    expect(instantIn(day(7, 1), "09:00", "Asia/Singapore")).toBe(utc(7, 1, 1));
    expect(instantIn(day(1, 15), "09:00", "Asia/Kolkata")).toBe(utc(1, 15, 3, 30));
  });

  it("New York: a time the clocks skip as they go forward goes out the same hour later", () => {
    expect(instantIn(day(3, NY_FWD), "01:30", "America/New_York")).toBe(utc(3, NY_FWD, 6, 30));
    // 2:30 never happens: 3:30 EDT
    expect(instantIn(day(3, NY_FWD), "02:30", "America/New_York")).toBe(utc(3, NY_FWD, 7, 30));
    expect(instantIn(day(3, NY_FWD), "03:30", "America/New_York")).toBe(utc(3, NY_FWD, 7, 30));
    expect(instantIn(day(3, NY_FWD), "09:00", "America/New_York")).toBe(utc(3, NY_FWD, 13));
    // the day before is still winter time all day
    expect(instantIn(day(3, NY_FWD - 1), "23:00", "America/New_York")).toBe(utc(3, NY_FWD, 4));
  });

  it("New York: a time that happens twice as the clocks go back is the first one", () => {
    expect(instantIn(day(11, NY_BACK), "00:30", "America/New_York")).toBe(utc(11, NY_BACK, 4, 30));
    // 1:30 EDT, not 1:30 EST an hour later
    expect(instantIn(day(11, NY_BACK), "01:30", "America/New_York")).toBe(utc(11, NY_BACK, 5, 30));
    expect(instantIn(day(11, NY_BACK), "02:00", "America/New_York")).toBe(utc(11, NY_BACK, 7));
    expect(instantIn(day(11, NY_BACK), "09:00", "America/New_York")).toBe(utc(11, NY_BACK, 14));
  });

  it("London: the skipped hour goes the same hour later and the repeated hour is the first", () => {
    expect(instantIn(day(3, UK_FWD), "00:30", "Europe/London")).toBe(utc(3, UK_FWD, 0, 30));
    expect(instantIn(day(3, UK_FWD), "01:30", "Europe/London")).toBe(utc(3, UK_FWD, 1, 30));
    expect(instantIn(day(3, UK_FWD), "09:00", "Europe/London")).toBe(utc(3, UK_FWD, 8));
    expect(instantIn(day(10, UK_BACK), "01:30", "Europe/London")).toBe(utc(10, UK_BACK, 0, 30));
    expect(instantIn(day(10, UK_BACK), "09:00", "Europe/London")).toBe(utc(10, UK_BACK, 9));
  });

  it("every half hour across the change days reads back as the same day and time, skipped times aside", () => {
    const cases: [string, string, string[]][] = [
      ["America/New_York", day(3, NY_FWD), ["02:00", "02:30"]],
      ["America/New_York", day(11, NY_BACK), []],
      ["Europe/London", day(3, UK_FWD), ["01:00", "01:30"]],
      ["Europe/London", day(10, UK_BACK), []],
    ];
    for (const [tz, d, skipped] of cases) {
      for (let m = 0; m < 24 * 60; m += 30) {
        const time = `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
        if (skipped.includes(time)) continue;
        expect(clockIn(tz, instantIn(d, time, tz)).wall, `${tz} ${d} ${time}`).toBe(`${d}T${time}`);
      }
    }
  });
});

describe("offsetAt and clockIn", () => {
  it("give the zone's offset and wall clock on either side of a change", () => {
    expect(offsetAt("America/New_York", utc(3, NY_FWD, 6, 59))).toBe(-300);
    expect(offsetAt("America/New_York", utc(3, NY_FWD, 7))).toBe(-240);
    expect(offsetAt("Asia/Kolkata", utc(1, 15, 0))).toBe(330);
    expect(clockIn("America/New_York", utc(3, NY_FWD, 7)).wall).toBe(`${day(3, NY_FWD)}T03:00`);
    expect(clockIn("Asia/Singapore", utc(12, 31, 16)).wall).toBe(`${Y + 1}-01-01T00:00`);
  });
});
