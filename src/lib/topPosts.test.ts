import { describe, expect, it } from "vitest";
import { compactNum, postAge } from "./topPosts";

describe("compactNum", () => {
  it("shortens counts the way the reel cards show them", () => {
    expect(compactNum(141_900)).toBe("141.9K");
    expect(compactNum(2_200)).toBe("2.2K");
    expect(compactNum(950)).toBe("950");
    expect(compactNum(1_250_000)).toBe("1.3M");
    expect(compactNum(-1)).toBe("0");
  });
});

describe("postAge", () => {
  const NOW = Date.parse("2026-10-08T12:00:00Z");
  const ago = (d: number) => new Date(NOW - d * 86_400_000).toISOString();
  it("reads days, weeks, months and years", () => {
    expect(postAge(ago(0.2), NOW)).toBe("today");
    expect(postAge(ago(3), NOW)).toBe("3d ago");
    expect(postAge(ago(29), NOW)).toBe("4w ago");
    expect(postAge(ago(75), NOW)).toBe("2mo ago");
    expect(postAge(ago(800), NOW)).toBe("2y ago");
  });
  it("has nothing to say without a timestamp", () => {
    expect(postAge(null, NOW)).toBeNull();
    expect(postAge("garbage", NOW)).toBeNull();
  });
});
