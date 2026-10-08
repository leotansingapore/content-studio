import { describe, expect, it } from "vitest";
import { brandForProfile, cardsIn, mmss, type ReelCard } from "./reelsBoard";

const brands = [
  { id: "leo", name: "Leo" },
  { id: "moneybees", name: "MoneyBees" },
  { id: "finternship", name: "FINternship" },
];
const card = (id: string, stage: ReelCard["stage"], brand?: string, schedule = "", title = id): ReelCard => ({
  id, title, stage, brand, schedule, version: "v", versions: [{ file: "v", label: "original", mtime: 0 }], comments: [], history: [],
});

describe("reels board helpers", () => {
  it("matches the open profile to a board brand by name", () => {
    expect(brandForProfile(brands, "MoneyBees")).toBe("moneybees");
    expect(brandForProfile(brands, " finternship ")).toBe("finternship");
    expect(brandForProfile(brands, "Me")).toBe("");
  });
  it("filters a column by brand (no brand = MoneyBees) and orders scheduled reels by date", () => {
    const cards = [
      card("b", "scheduled", "leo", "2026-10-10T19:30"),
      card("a", "scheduled", "leo", "2026-10-09T19:30"),
      card("c", "scheduled", undefined, "2026-10-08T19:30"),
      card("d", "review", "leo"),
    ];
    expect(cardsIn(cards, "scheduled", "leo").map((c) => c.id)).toEqual(["a", "b"]);
    expect(cardsIn(cards, "scheduled", "moneybees").map((c) => c.id)).toEqual(["c"]);
    expect(cardsIn(cards, "scheduled", "").map((c) => c.id)).toEqual(["c", "a", "b"]);
  });
  it("formats a timestamp as m:ss", () => {
    expect(mmss(75.9)).toBe("1:15");
    expect(mmss(null)).toBe("0:00");
  });
});
