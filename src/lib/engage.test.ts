import { describe, expect, it } from "vitest";
import { engageList, isoWeek, rotate, sizedCreators, type EngagePerson } from "@/lib/engage";
import type { AdvisorEntry } from "@/components/AdvisorProfiles";

const person = (key: string, usual: number): EngagePerson => ({ key, name: key, handle: `@${key}`, url: "", usual, unit: "views" });

describe("engage this week", () => {
  it("sizes Instagram creators by their usual reel views, falling back to likes", () => {
    const advisors = [
      { id: "a", name: "A", handle: "@a", platform: "instagram", platform_url: "u" },
      { id: "b", name: "B", handle: "b", platform: "instagram", platform_url: "u" },
      { id: "c", name: "C", handle: "@c", platform: "youtube", platform_url: "u" },
    ] as unknown as AdvisorEntry[];
    const posts: Record<string, { views?: number; likes: number }[]> = {
      a: [{ views: 100, likes: 1 }, { views: 300, likes: 1 }, { views: 200, likes: 1 }],
      b: [{ likes: 10 }, { likes: 30 }, { likes: 20 }],
    };
    const out = sizedCreators(advisors, ((a: AdvisorEntry) => posts[a.id] ?? []) as never);
    expect(out).toEqual([
      { key: "b", name: "B", handle: "@b", url: "u", usual: 20, unit: "likes" },
      { key: "a", name: "A", handle: "@a", url: "u", usual: 200, unit: "views" },
    ].sort((x, y) => y.usual - x.usual));
  });

  it("names the ISO week, turning over on Monday", () => {
    expect(isoWeek(new Date(2026, 9, 8))).toBe("2026-W41");
    expect(isoWeek(new Date(2026, 9, 11))).toBe("2026-W41");
    expect(isoWeek(new Date(2026, 9, 12))).toBe("2026-W42");
    expect(isoWeek(new Date(2027, 0, 1))).toBe("2026-W53");
  });

  it("rotates n in a row from a week-seeded start, the same all week", () => {
    const xs = [1, 2, 3, 4, 5, 6, 7];
    expect(rotate(xs, 3, "w1")).toEqual(rotate(xs, 3, "w1"));
    expect(new Set(rotate(xs, 3, "w1")).size).toBe(3);
    expect(rotate([1, 2], 3, "w1")).toEqual([1, 2]);
  });

  it("sorts creators into bigger (2x your views or more) and peers (half to 2x)", () => {
    const cs = [person("huge", 100_000), person("big1", 9000), person("big2", 8000), person("big3", 5000), person("big4", 4100), person("big5", 4000), person("peer1", 3000), person("peer2", 2000), person("peer3", 1100), person("small", 100)];
    const { bigger, peers } = engageList(cs, 2000, "2026-W41");
    expect(bigger).toHaveLength(5);
    expect(bigger.every((p) => p.usual >= 4000)).toBe(true);
    expect(peers.map((p) => p.key).sort()).toEqual(["peer1", "peer2", "peer3"]);
  });

  it("with no audit, the top half are bigger and the rest peers", () => {
    const cs = [person("a", 10), person("b", 8), person("c", 6), person("d", 4)];
    const { bigger, peers } = engageList(cs, null, "w");
    expect(bigger.map((p) => p.key)).toEqual(["a", "b"]);
    expect(peers.map((p) => p.key)).toEqual(["c", "d"]);
  });
});
