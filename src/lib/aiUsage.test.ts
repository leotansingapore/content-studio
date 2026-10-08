import { describe, expect, it } from "vitest";
import { usesLeft, utcDay } from "@/lib/aiUsage";
import { DAILY_LIMITS } from "../../supabase/functions/_shared/usageCaps";

describe("uses left today", () => {
  const now = new Date("2026-10-08T03:00:00Z");
  it("counts today's uses against the daily cap, never below zero", () => {
    const u = { day: "2026-10-08", used: { "video-clips": 7, "ai-voice": 12 } };
    expect(usesLeft(u, "video-clips", now)).toBe(DAILY_LIMITS["video-clips"] - 7);
    expect(usesLeft(u, "ai-voice", now)).toBe(0);
    expect(usesLeft(u, "video-publish", now)).toBe(DAILY_LIMITS["video-publish"]);
  });
  it("gives the full cap once the day has turned over (8am Singapore), and nothing before a read", () => {
    expect(usesLeft({ day: "2026-10-07", used: { "video-clips": 20 } }, "video-clips", now)).toBe(DAILY_LIMITS["video-clips"]);
    expect(usesLeft(null, "video-clips", now)).toBeNull();
  });
  it("uses the UTC date, as the counter does", () => {
    expect(utcDay(new Date("2026-10-08T23:30:00+08:00"))).toBe("2026-10-08");
    expect(utcDay(new Date("2026-10-09T07:59:00+08:00"))).toBe("2026-10-08");
    expect(utcDay(new Date("2026-10-09T08:00:00+08:00"))).toBe("2026-10-09");
  });
});
