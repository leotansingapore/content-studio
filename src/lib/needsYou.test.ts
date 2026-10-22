import { describe, expect, it } from "vitest";
import { badgeText, campaignsToReview, countBoardWaiting, countNeedsYou, countPostingToday, homeToday, notesByBrand, waitingByBrand } from "./needsYou";
import { links } from "./links";
import type { CampaignPost, PostState } from "./campaigns";
import type { DraftEntry } from "./draftHistory";
import type { ReelCard, ReelComment, StageId } from "./reelsBoard";
import type { TeamPost } from "./teamPosts";

const TODAY = "2026-10-14";
const draft = (over: Partial<DraftEntry>): DraftEntry => ({ id: Math.random().toString(36), createdAt: "2026-10-01T00:00:00Z", draft: "x", hook: "x", platform: "linkedin", ...over }) as DraftEntry;
const team = (over: Partial<TeamPost>): TeamPost => ({
  id: "tp1", title: "t", product: "gac", day: "2026-10-20", time: "10:00", image: "", message: "", rev: 1,
  revisedAt: null, postedAt: null, postLink: null, skipped: false, telegram: { approvedRev: null, comments: [] }, handled: [], ...over,
});

describe("countNeedsYou", () => {
  it("counts scheduled posts whose day has passed, not today's or future ones", () => {
    const drafts = [
      draft({ status: "scheduled", scheduledFor: "2026-10-13T08:30" }),
      draft({ status: "scheduled", scheduledFor: "2026-10-10" }),
      draft({ status: "scheduled", scheduledFor: "2026-10-14T08:00" }),
      draft({ status: "scheduled", scheduledFor: "2026-10-20" }),
      draft({ status: "posted", scheduledFor: "2026-10-01", postedAt: "2026-10-01T09:00:00Z" }),
      draft({ status: "draft" }),
    ];
    expect(countNeedsYou(drafts, [], {}, TODAY)).toBe(2);
  });

  it("counts team posts waiting for approval only", () => {
    const posts = [
      team({ id: "a" }),
      team({ id: "b", rev: 2 }),
      team({ id: "c", postedAt: "2026-10-13T02:00:00Z" }),
      team({ id: "d", skipped: true }),
    ];
    expect(countNeedsYou([], posts, { b: { approvedRev: 2, comments: [] } }, TODAY)).toBe(1);
  });

  it("adds both", () => {
    expect(countNeedsYou([draft({ status: "scheduled", scheduledFor: "2026-10-01" })], [team({})], {}, TODAY)).toBe(2);
  });

  it("adds Leo's autopilot posts waiting for an OK as a fifth argument, and 0 when it is left out", () => {
    const drafts = [draft({ status: "scheduled", scheduledFor: "2026-10-01" })];
    expect(countNeedsYou(drafts, [team({})], {}, TODAY, 3)).toBe(5);
    expect(countNeedsYou([], [], {}, TODAY, 4)).toBe(4);
    expect(countNeedsYou(drafts, [team({})], {}, TODAY, 0)).toBe(countNeedsYou(drafts, [team({})], {}, TODAY));
  });
});

describe("campaignsToReview", () => {
  const post = (n: number, state: PostState) => ({ n, state }) as CampaignPost;
  it("counts written posts not yet made, skipped or failed, per campaign with any", () => {
    const list = [
      { id: "c-new", posts: [post(1, "ready"), post(2, "ready"), post(3, "made"), post(4, "waiting")] },
      { id: "c-done", posts: [post(1, "made"), post(2, "skipped"), post(3, "failed"), post(4, "making"), post(5, "drafting")] },
      { id: "c-old", posts: [post(1, "ready")] },
    ];
    expect(campaignsToReview(list)).toEqual([{ id: "c-new", n: 2 }, { id: "c-old", n: 1 }]);
    expect(campaignsToReview([])).toEqual([]);
  });
});

describe("countBoardWaiting", () => {
  it("counts posts in Review or Needs changes only", () => {
    const card = (stage: StageId) => ({ id: stage, title: stage, stage, version: "v1", versions: [], comments: [], history: [] }) as ReelCard;
    const stages: StageId[] = ["review", "review", "changes", "approved", "scheduled", "posted", "archived"];
    expect(countBoardWaiting(stages.map(card))).toBe(3);
    expect(countBoardWaiting([])).toBe(0);
  });
});

describe("waitingByBrand", () => {
  it("lists the other brands with posts in Review or Needs changes, unbranded posts under moneybees", () => {
    const card = (stage: StageId, brand?: string) => ({ id: stage, title: stage, stage, brand, version: "v1", versions: [], comments: [], history: [] }) as ReelCard;
    const brands = [{ id: "moneybees", name: "MoneyBees" }, { id: "radiant", name: "Radiant" }, { id: "at", name: "ActivityTracker" }, { id: "leo", name: "Leo" }];
    const cards = [card("review"), card("review", "radiant"), card("changes", "radiant"), card("approved", "at"), card("archived", "at"), card("review", "leo")];
    expect(waitingByBrand({ stages: [], brands, cards }, "leo")).toEqual([
      { id: "moneybees", name: "MoneyBees", n: 1, changes: false },
      { id: "radiant", name: "Radiant", n: 2, changes: true },
    ]);
    expect(waitingByBrand({ stages: [], brands, cards }, "")).toHaveLength(3);
  });
});

describe("countPostingToday", () => {
  it("counts today's approved or scheduled board posts and today's scheduled drafts", () => {
    const card = (stage: StageId, schedule?: string) => ({ id: stage, title: stage, stage, schedule, version: "v1", versions: [], comments: [], history: [] }) as ReelCard;
    const cards = [card("approved", "2026-10-14T19:30"), card("scheduled", "2026-10-14"), card("posted", "2026-10-14T08:00"), card("review", "2026-10-14"), card("scheduled", "2026-10-15"), card("approved")];
    const drafts = [draft({ status: "scheduled", scheduledFor: "2026-10-14T08:00" }), draft({ status: "scheduled", scheduledFor: "2026-10-13" }), draft({ status: "draft" })];
    expect(countPostingToday(cards, drafts, TODAY)).toBe(3);
    expect(countPostingToday([], [], TODAY)).toBe(0);
  });
});

describe("notesByBrand", () => {
  it("lists brands with posts carrying open notes from the team, per brand", () => {
    const note = (by: ReelComment["by"], resolved = false) => ({ id: "n", at: "", text: "x", t: null, version: "v1", resolved, by }) as ReelComment;
    const card = (brand: string, comments: ReelComment[], stage: StageId = "review") => ({ id: brand, title: brand, stage, brand, version: "v1", versions: [], comments, history: [] }) as ReelCard;
    const amy = { id: "u2", label: "Amy", role: "editor" };
    const brands = [{ id: "moneybees", name: "MoneyBees" }, { id: "radiant", name: "Radiant" }, { id: "at", name: "ActivityTracker" }];
    const cards = [card("moneybees", [note(amy)]), card("moneybees", [note(amy)]), card("radiant", [note(amy, true), note(undefined)]), card("at", [note(amy)], "archived")];
    expect(notesByBrand({ stages: [], brands, cards }, { owner: true, member: false })).toEqual([{ id: "moneybees", name: "MoneyBees", n: 2 }]);
  });
});

describe("homeToday", () => {
  const note = { id: "n", at: "", text: "x", t: null, version: "v1", resolved: false, by: { id: "u2", label: "Amy", role: "editor" } } as ReelComment;
  const card = (stage: StageId, brand: string, comments: ReelComment[] = []) => ({ id: stage + brand, title: "t", stage, brand, version: "v1", versions: [], comments, history: [] }) as ReelCard;
  const board = {
    stages: [],
    brands: [{ id: "moneybees", name: "MoneyBees" }, { id: "radiant", name: "Radiant" }],
    cards: [card("review", "moneybees"), card("changes", "radiant", [note])],
  };

  it("gives Leo review rows, today, team notes in the Posts view and Your market", () => {
    expect(homeToday({ owner: true, member: false }, board, [], TODAY, true)).toEqual([
      { label: "To review: MoneyBees", n: 1, to: "/reels?brand=moneybees" },
      { label: "To review: Radiant", n: 1, to: "/reels?brand=radiant&stage=all" },
      { label: "Posting today", n: 0, to: "/calendar?view=week" },
      { label: "Team notes: Radiant", n: 1, to: "/reels?brand=radiant&view=feed&stage=notes" },
      { label: "Your market", to: "/market" },
    ]);
  });

  it("adds Leo's plan rows after the review rows, each only above 0, linking where links.ts would", () => {
    const plan = { autopilot: 3, campaigns: [{ id: "c-mz1ab", n: 5 }], ideas: 6 };
    const rows = homeToday({ owner: true, member: false }, board, [], TODAY, false, plan);
    expect(rows.map((r) => r.label)).toEqual(["To review: MoneyBees", "To review: Radiant", "Posts for your OK", "Campaign posts to review", "Today's ideas", "Posting today", "Team notes: Radiant"]);
    expect(rows.slice(2, 5)).toEqual([
      { label: "Posts for your OK", n: 3, to: links.plan({ section: "autopilot" }) },
      { label: "Campaign posts to review", n: 5, to: links.campaign("c-mz1ab", { section: "queue" }) },
      { label: "Today's ideas", n: 6, to: links.ideas() },
    ]);
    expect(links.plan({ section: "autopilot" })).toBe("/plan#autopilot");
    expect(homeToday({ owner: true, member: false }, null, [], TODAY, false, { autopilot: 0, campaigns: [], ideas: 0 })).toEqual([{ label: "Posting today", n: 0, to: "/calendar?view=week" }]);
    expect(homeToday({ owner: true, member: false }, null, [], TODAY, false, { autopilot: 1, campaigns: [], ideas: 0 }).map((r) => r.label)).toEqual(["Posts for your OK", "Posting today"]);
  });

  it("sends several campaigns' written posts to the list, with their total", () => {
    const rows = homeToday(null, null, [], TODAY, false, { autopilot: 0, campaigns: [{ id: "a", n: 2 }, { id: "b", n: 4 }], ideas: 0 });
    expect(rows).toEqual([{ label: "Campaign posts to review", n: 6, to: links.campaigns() }]);
  });

  it("gives Leo's plan rows with no board answer (signed in as Leo on a brand off the board)", () => {
    expect(homeToday(null, null, [], TODAY, true, { autopilot: 2, campaigns: [], ideas: 4 })).toEqual([
      { label: "Posts for your OK", n: 2, to: "/plan#autopilot" },
      { label: "Today's ideas", n: 4, to: "/ideas" },
    ]);
    expect(homeToday(null, null, [], TODAY, true)).toEqual([]);
  });

  it("gives a teammate only the review rows, and nothing breaks when the board didn't answer", () => {
    expect(homeToday({ owner: false, member: true, role: "editor" }, board, [], TODAY, true).map((r) => r.label)).toEqual(["To review: MoneyBees", "To review: Radiant"]);
    expect(homeToday({ owner: true, member: false }, null, [], TODAY, false)).toEqual([{ label: "Posting today", n: 0, to: "/calendar?view=week" }]);
  });
});

describe("badgeText", () => {
  it("caps at 9+", () => {
    expect(badgeText(3)).toBe("3");
    expect(badgeText(12)).toBe("9+");
  });
});
