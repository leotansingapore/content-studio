import { describe, expect, it } from "vitest";
import { badgeText, countBoardWaiting, countNeedsYou, waitingByBrand } from "./needsYou";
import type { DraftEntry } from "./draftHistory";
import type { ReelCard, StageId } from "./reelsBoard";
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

describe("badgeText", () => {
  it("caps at 9+", () => {
    expect(badgeText(3)).toBe("3");
    expect(badgeText(12)).toBe("9+");
  });
});
