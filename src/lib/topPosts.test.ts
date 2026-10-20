import { describe, expect, it } from "vitest";
import advisors from "@/data/advisors.json";
import { buildRemixUrl, compactNum, getAllTopPosts, postAge } from "./topPosts";

describe("buildRemixUrl", () => {
  it("names the post as its source, top:<advisor id>-<short code>", () => {
    const post = getAllTopPosts()[0];
    const url = new URL(buildRemixUrl(post, { name: post.advisorName, handle: post.handle }), "https://x");
    expect(url.searchParams.get("source")).toBe(`top:${post.advisorId}-${post.shortCode}`);
    expect((advisors as { id: string }[]).some((a) => a.id === post.advisorId)).toBe(true);
  });

  it("sends no source for a creator the library doesn't know", () => {
    const post = getAllTopPosts()[0];
    expect(new URL(buildRemixUrl(post, { name: "Someone", handle: "@nobody_here_123" }), "https://x").searchParams.has("source")).toBe(false);
  });
});

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
