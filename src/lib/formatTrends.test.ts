import { describe, expect, it } from "vitest";
import { cleanFormatTrends, currentFormatTrends, formatRemixUrl, formatTag, kindCounts, type FormatTrend } from "./formatTrends";

const slideshow: FormatTrend = {
  id: "tiktok-7412345678901234567",
  kind: "slideshow",
  url: "https://www.tiktok.com/@habits/photo/7412345678901234567",
  author: "habits",
  caption: "7 habits to BREAK the freeze #selfimprovement #moneytips",
  views: 2_300_000,
  likes: 460_300,
  slides: 8,
  cover: "/format-trends/7412345678901234567.jpg",
  hook: "7 habits to BREAK the freeze",
  structure: ["Hook: a numbered list promise", "One habit with a one-line reason", "Another habit, same shape", "Call to follow for part two"],
  postedAt: "2026-10-20",
  fit: 0.81,
};
const wall: FormatTrend = {
  ...slideshow,
  id: "tiktok-7499999999999999999",
  kind: "wall-of-text",
  url: "https://www.tiktok.com/@pov/video/7499999999999999999",
  caption: "POV: waking up and seeing a $6847 payout",
  slides: null,
  cover: "/format-trends/7499999999999999999.jpg",
  hook: "POV: waking up and seeing a $6847 payout",
  structure: ["A POV line that sets the scene", "The twist the reader did not expect", "The lesson in one line"],
};
const FILE = { fetched: "2026-10-27", items: [slideshow, wall, { ...slideshow, id: "tiktok-7400000000000000001" }] };

describe("the bundled file", () => {
  it("keeps whole items and drops malformed ones field by field", () => {
    const bad = [
      { ...slideshow, id: "../../etc" },
      { ...slideshow, url: "http://www.tiktok.com/@a/photo/1" },
      { ...slideshow, url: "https://evil.example/x" },
      { ...slideshow, cover: "https://cdn.example/x.jpg" },
      { ...slideshow, kind: "carousel" },
      { ...slideshow, structure: ["Only one line"] },
      { ...slideshow, hook: "" },
      { ...slideshow, views: -1 },
      { ...slideshow, postedAt: "last week" },
      "junk",
    ];
    const out = cleanFormatTrends({ fetched: "2026-10-27", items: [slideshow, ...bad, { ...wall, slides: 4, fit: 3 }] });
    expect(out.items.map((i) => i.id)).toEqual([slideshow.id, wall.id]);
    // a wall of text has no slide count, and a fit outside 0 to 1 is no score
    expect(out.items[1]).toMatchObject({ slides: null, fit: null });
    expect(cleanFormatTrends({ fetched: "Monday", items: "x" })).toEqual({ fetched: null, items: [] });
    expect(cleanFormatTrends(null)).toEqual({ fetched: null, items: [] });
  });

  it("shows nothing before the first drop or when the drop is over 21 days old", () => {
    expect(currentFormatTrends({ fetched: null, items: [slideshow] })).toEqual([]);
    expect(currentFormatTrends(FILE, new Date("2026-11-17T00:00:00Z"))).toHaveLength(3);
    expect(currentFormatTrends(FILE, new Date("2026-11-17T12:00:00Z"))).toEqual([]);
  });
});

describe("the cards", () => {
  it("counts each kind for the filter chips", () => {
    expect(kindCounts(FILE.items)).toEqual({ all: 3, slideshow: 2, "wall-of-text": 1 });
    expect(kindCounts([])).toEqual({ all: 0, slideshow: 0, "wall-of-text": 0 });
  });

  it("tags a slideshow with its slide count and a wall of text plainly", () => {
    expect(formatTag(slideshow)).toBe("Slideshow, 8");
    expect(formatTag({ kind: "slideshow", slides: null })).toBe("Slideshow");
    expect(formatTag(wall)).toBe("Wall of text");
  });

  it("Remix this opens the format's own page with the post as its source, and never starts a make", () => {
    expect(formatRemixUrl(slideshow)).toBe("/make/slideshow?source=format%3Atiktok-7412345678901234567");
    expect(formatRemixUrl(wall)).toBe("/make/wall-of-text?source=format%3Atiktok-7499999999999999999");
    expect(formatRemixUrl(slideshow)).not.toMatch(/go=/);
  });
});
