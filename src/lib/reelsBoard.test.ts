import { describe, expect, it } from "vitest";
import { aspectOf, brandForProfile, cardsIn, feedCards, findCard, igLine, instagramHandle, mmss, setConnectedIg, stageForLink, type ReelCard } from "./reelsBoard";

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

describe("igLine", () => {
  it("says where a scheduled reel posts, or that it is posted by hand", () => {
    expect(igLine(card("a", "scheduled", "moneybees"))?.text).toBe("Posts to @the_moneybees automatically");
    expect(igLine(card("a", "scheduled", "leo"))?.text).toBe("Not linked to Instagram: post it by hand");
    expect(igLine(card("a", "scheduled", "activitytracker"))?.text).toBe("Posts to @activity_tracker_io automatically");
    expect(igLine(card("a", "review", "moneybees"))).toBeNull();
  });
  it("links a posted reel to its Instagram post", () => {
    const c = { ...card("a", "posted", "finternship"), ig: { state: "posted" as const, permalink: "https://instagram.com/p/x", account: "finternshipofficial" } };
    expect(igLine(c)).toEqual({ text: "On Instagram @finternshipofficial", href: "https://instagram.com/p/x" });
  });
});

describe("Instagram connected in Content Studio", () => {
  const acct = (platform: string, username: string, needsReconnect = false) =>
    ({ id: "x", platform, username, name: "", url: null, picture: null, health: "healthy" as const, needsReconnect, issues: [] });
  it("takes the working Instagram, without the @", () => {
    expect(instagramHandle([acct("tiktok", "t"), acct("instagram", "@radiant_vep_solutions")])).toBe("radiant_vep_solutions");
    expect(instagramHandle([acct("instagram", "r", true)])).toBeNull();
    expect(instagramHandle([])).toBeNull();
  });
  it("says a connected brand's posts go out by themselves, and stops when it is disconnected", () => {
    expect(igLine(card("a", "scheduled", "radiant"))?.text).toBe("Not linked to Instagram: post it by hand");
    setConnectedIg("radiant", "radiant_vep_solutions");
    expect(igLine(card("a", "scheduled", "radiant"))?.text).toBe("Posts to @radiant_vep_solutions automatically");
    setConnectedIg("radiant", null);
    expect(igLine(card("a", "scheduled", "radiant"))?.text).toBe("Not linked to Instagram: post it by hand");
  });
});

describe("posts view", () => {
  it("shows carousels at 4:5 and reels at 9:16", () => {
    expect(aspectOf({ ...card("a", "review"), kind: "carousel" })).toBe("4 / 5");
    expect(aspectOf(card("b", "review"))).toBe("9 / 16");
  });
  it("lists every stage but Archived for 'all', soonest first, undated last, one brand only", () => {
    const cards = [
      card("late", "review", "activitytracker", "2026-11-03T19:30"),
      card("undated", "scheduled", "activitytracker"),
      card("soon", "approved", "activitytracker", "2026-10-20T19:30"),
      card("gone", "archived", "activitytracker", "2026-10-18T19:30"),
      card("other", "review", "moneybees", "2026-10-19T19:30"),
    ];
    expect(feedCards(cards, "all", "activitytracker").map((c) => c.id)).toEqual(["soon", "late", "undated"]);
    expect(feedCards(cards, "review", "").map((c) => c.id)).toEqual(["other", "late"]);
    expect(feedCards(cards, "archived", "activitytracker").map((c) => c.id)).toEqual(["gone"]);
  });
});

describe("column order", () => {
  it("puts undated cards after dated ones", () => {
    const cards = [card("undated", "review", "leo"), card("dated", "review", "leo", "2026-10-20T19:30")];
    expect(cardsIn(cards, "review", "leo").map((c) => c.id)).toEqual(["dated", "undated"]);
  });
});

describe("findCard", () => {
  const cards = [card("at-1016-car1~carousel", "review"), card("at-r-hits~animated", "review")];
  it("finds a card by its full id or by the id a chat app cut at the ~", () => {
    expect(findCard(cards, "at-1016-car1~carousel")?.id).toBe("at-1016-car1~carousel");
    expect(findCard(cards, "at-1016-car1")?.id).toBe("at-1016-car1~carousel");
    expect(findCard(cards, "at-r-hits")?.id).toBe("at-r-hits~animated");
    expect(findCard(cards, "nope")).toBeUndefined();
    expect(findCard(cards, null)).toBeUndefined();
  });
});

describe("stageForLink", () => {
  const cards = [card("a1~carousel", "scheduled"), card("a2", "review"), card("a3", "posted")];
  const at = (q: string) => stageForLink(cards, new URLSearchParams(q));
  it("lands a post link on that post's stage, even when a chat app cut the id at the ~", () => {
    expect(at("card=a1~carousel")).toBe("scheduled");
    expect(at("card=a1")).toBe("scheduled");
    expect(at("card=a3&view=feed")).toBe("posted");
  });
  it("leaves the stage alone when the link names one, the post is in Review, or the post is gone", () => {
    expect(at("card=a1&stage=all")).toBeNull();
    expect(at("card=a2")).toBeNull();
    expect(at("card=gone")).toBeNull();
    expect(at("view=feed")).toBeNull();
  });
});
