import { describe, expect, it } from "vitest";
import { badgeText, boardWaitingHere, campaignsToReview, countBoardWaiting, countNeedsYou, countPostingToday, heldOrLive, homeToday, needsYouItems, nextUpLabel, notesByBrand, waitingByBrand, type NextUpInput } from "./needsYou";
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

describe("boardWaitingHere", () => {
  it("counts Leo's open brand only, and every brand for a teammate", () => {
    const card = (id: string, brand: string, stage: StageId) => ({ id, title: id, brand, stage, version: "v1", versions: [], comments: [], history: [] }) as ReelCard;
    const cards = [card("a", "activitytracker", "review"), card("b", "moneybees", "review"), card("c", "moneybees", "changes"), card("d", "activitytracker", "posted")];
    expect(boardWaitingHere(cards, true, "activitytracker")).toBe(1);
    expect(boardWaitingHere(cards, true, "moneybees")).toBe(2);
    expect(boardWaitingHere(cards, true, undefined)).toBe(0);
    expect(boardWaitingHere(cards, false, "activitytracker")).toBe(3);
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

describe("needsYouItems", () => {
  const NOW = Date.parse("2026-10-14T10:00:00+08:00");
  const note = { id: "n", at: "", text: "x", t: null, version: "v1", resolved: false, by: { id: "u2", label: "Amy", role: "editor" } } as ReelComment;
  const rc = (stage: StageId, brand: string, o: Partial<ReelCard> = {}) => ({ id: stage + brand, title: "t", stage, brand, version: "v1", versions: [], comments: [], history: [], ...o }) as ReelCard;
  const post = (state: PostState) => ({ n: 1, state }) as CampaignPost;
  const full: NextUpInput = {
    cards: [{ thread: "t1", msg: "m2", card: { id: "k1", kind: "video", title: 'Talking video: "Most people"' }, price: "About US$2.77 | about 44 Higgsfield credits" }],
    threads: [
      { id: "t2", messages: [{ id: "m5", card: { status: "failed", title: "Picture: CPF", decidedAt: "2026-10-14T00:00:00Z" } }, { id: "m6", card: { status: "failed", title: "Old", decidedAt: "2026-10-12T00:00:00Z" } }] },
      { id: "t3", messages: [{ id: "m7", job: { state: "failed", endedAt: "2026-10-13T23:00:00Z", title: "A slideshow" } }, { id: "m8", job: { state: "done", endedAt: "2026-10-14T01:00:00Z" } }] },
    ],
    drafts: [
      draft({ id: "z1", hook: "Zernio hook", zernio: { key: "k", status: "failed" } }),
      draft({ id: "o1", hook: "Older", status: "scheduled", scheduledFor: "2026-10-10" }),
      draft({ id: "o2", hook: "Newest overdue", status: "scheduled", scheduledFor: "2026-10-13T08:30" }),
      draft({ id: "d1", hook: "Due later", status: "scheduled", scheduledFor: "2026-10-14T19:30" }),
      draft({ id: "d2", hook: "Due first", status: "scheduled", scheduledFor: "2026-10-14T08:00" }),
      draft({ id: "r1", hook: "Remixed", createdAt: "2026-10-12T00:00:00Z", remix: {} as DraftEntry["remix"] }),
      draft({ id: "a1", hook: "Agent made", createdAt: "2026-10-13T00:00:00Z", agent: { thread: "t1", msg: "m3" } }),
      draft({ id: "r0", hook: "Remixed long ago", createdAt: "2026-10-01T00:00:00Z", remix: {} as DraftEntry["remix"] }),
      draft({ id: "w1", hook: "Typed by hand", createdAt: "2026-10-13T00:00:00Z" }),
    ],
    me: { owner: true, member: false },
    board: { stages: [], brands: [{ id: "moneybees", name: "MoneyBees" }, { id: "radiant", name: "Radiant" }], cards: [rc("review", "moneybees"), rc("changes", "radiant", { comments: [note] }), rc("approved", "moneybees", { id: "x", schedule: "2026-10-14T19:00" })] },
    otherDrafts: [draft({ status: "scheduled", scheduledFor: "2026-10-14T12:00" })],
    market: true,
    teamPosts: [team({ id: "tp2", day: "2026-10-21" }), team({ id: "tp1", day: "2026-10-20" })],
    reviews: {},
    autopilot: 3,
    campaigns: [
      { id: "c1", name: "Young families, October", audienceName: "Young families", posts: [post("ready"), post("ready"), post("made"), post("waiting")] },
      { id: "c2", name: "Done", audienceName: "Grads", posts: [post("made")] },
    ],
    ideas: 6,
    setup: { label: "Set your voice", to: "/voice" },
  };

  it("orders every kind as the table says, with each button's link", () => {
    const items = needsYouItems(full, TODAY, NOW);
    expect(items.map((i) => i.id)).toEqual([
      "card:k1", "failed:z1", "failed:m5", "failed:m7", "overdue", "today", "team", "review:moneybees", "review:radiant", "notes:radiant",
      "unscheduled", "autopilot", "campaign:c1", "ideas", "market", "setup",
    ]);
    const by = Object.fromEntries(items.map((i) => [i.id, i]));
    expect(by["card:k1"]).toEqual({ id: "card:k1", kind: "card", title: "A video is waiting for your yes", quote: 'Talking video: "Most people"', line: "About US$2.77 | about 44 Higgsfield credits", actions: [{ label: "Open", to: links.agent({ thread: "t1", m: "m2" }) }] });
    expect(by["failed:z1"]).toMatchObject({ title: "A post didn't go out", quote: "Zernio hook", line: "Try it again or post it yourself.", actions: [{ label: "Open", to: links.generate({ draft: "z1", panel: "post" }) }] });
    expect(by["failed:m5"]).toMatchObject({ title: "Something you asked for wasn't made", quote: "Picture: CPF", line: "Nothing was used.", actions: [{ label: "Open", to: links.agent({ thread: "t2", m: "m5" }) }] });
    expect(by.overdue).toEqual({ id: "overdue", kind: "overdue", title: "2 posts are overdue", quote: "Newest overdue", line: "1 day overdue", actions: [{ label: "Reschedule", to: "/calendar#overdue" }, { label: "Mark posted", markPosted: "o2" }] });
    // two of this brand's, one board post and one other brand's
    expect(by.today).toEqual({ id: "today", kind: "today", title: "4 posts go out today", quote: "Due first", line: "8am", actions: [{ label: "Open", to: links.generate({ draft: "d2" }) }] });
    expect(by.team).toEqual({ id: "team", kind: "team", title: "2 team posts wait for you", line: "Approve or skip each one.", actions: [{ label: "Review", to: links.calendar({ business: "team-posts", teampost: "tp1" }) }] });
    expect(by["review:radiant"]).toMatchObject({ title: "To review: Radiant", n: 1, actions: [{ label: "Review", to: "/reels?brand=radiant&stage=all" }] });
    expect(by["notes:radiant"]).toMatchObject({ title: "Team notes: Radiant", n: 1, actions: [{ label: "Open", to: "/reels?brand=radiant&view=feed&stage=notes" }] });
    expect(by.unscheduled).toEqual({ id: "unscheduled", kind: "unscheduled", title: "2 posts are made and not scheduled", quote: "Agent made", line: "Schedule them, or leave them in My posts.", actions: [{ label: "Open", to: links.drafts({ status: "draft" }) }] });
    expect(by.autopilot).toMatchObject({ title: "Posts for your OK", n: 3, actions: [{ label: "Open", to: links.plan({ section: "autopilot" }) }] });
    expect(by["campaign:c1"]).toEqual({ id: "campaign:c1", kind: "campaign", title: "Keep making your campaign", quote: "Young families", line: "1 of 4 made | 2 drafts waiting for you", actions: [{ label: "Open", to: links.campaign("c1", { section: "queue" }) }] });
    expect(by.ideas).toMatchObject({ title: "Today's ideas", n: 6, actions: [{ label: "Open", to: links.ideas() }] });
    expect(by.market).toMatchObject({ title: "Your market", actions: [{ label: "Open", to: "/market" }] });
    expect(by.setup).toEqual({ id: "setup", kind: "setup", title: "Set your voice", actions: [{ label: "Open", to: "/voice" }] });
  });

  it("puts a campaign's made posts in one row with their count, so the campaign comes third of five, not 26th (live-p6replay D15)", () => {
    const made = Array.from({ length: 24 }, (_, i) => draft({ id: `m${i}`, hook: `Made ${i}`, createdAt: `2026-10-13T00:${String(i).padStart(2, "0")}:00Z`, agent: { thread: "t1", msg: `m${i}` } }));
    const campaigns = [{ id: "c1", name: "Coaches, October", audienceName: "Coaches", posts: [post("ready")] }];
    const items = needsYouItems({ cards: full.cards, drafts: made, campaigns, ideas: 2, setup: full.setup }, TODAY, NOW);
    expect(items.map((i) => i.id)).toEqual(["card:k1", "unscheduled", "campaign:c1", "ideas", "setup"]);
    expect(items[1]).toMatchObject({ title: "24 posts are made and not scheduled", quote: "Made 23", actions: [{ label: "Open", to: "/drafts?status=draft" }] });
    // one made post keeps its own row with its own buttons
    const one = needsYouItems({ drafts: made.slice(0, 1) }, TODAY, NOW);
    expect(one).toEqual([{ id: "draft:m0", kind: "unscheduled", title: "A post is made and not scheduled", quote: "Made 0", line: "Schedule it, or leave it in My posts.", actions: [{ label: "Open", to: links.generate({ draft: "m0" }) }, { label: "Schedule it", to: links.drafts({ schedule: "m0", step: "where" }) }] }]);
  });

  it("opens the schedule steps on that post from Schedule it, at Where, and posts nothing itself (phase 7a)", () => {
    const [item] = needsYouItems({ drafts: [draft({ id: "a b/1", hook: "Agent made", createdAt: "2026-10-13T00:00:00Z", agent: { thread: "t1", msg: "m3" } })] }, TODAY, NOW);
    expect(item.actions[1]).toEqual({ label: "Schedule it", to: "/drafts?schedule=a+b%2F1&step=where" });
    expect(item.actions[1].to).toBe(links.drafts({ schedule: "a b/1", step: "where" }));
    expect(item.actions.some((a) => a.markPosted)).toBe(false);
  });

  it("leaves out a made post Zernio holds or one linked to a live post, since each has a time", () => {
    const made = (id: string, over: Partial<DraftEntry> = {}) => draft({ id, hook: id, createdAt: "2026-10-13T00:00:00Z", agent: { thread: "t1", msg: id }, ...over });
    const drafts = [
      made("inbox", { zernio: { key: "k1", postId: "p1", status: "scheduled", drafts: ["tiktok"] } }),
      made("sending", { zernio: { key: "k2" } }),
      made("live", { live: { postId: "x", platform: "tiktok", by: "you", numbers: { at: "2026-10-13T00:00:00Z" } } as DraftEntry["live"] }),
      made("plain"),
    ];
    expect(needsYouItems({ drafts }, TODAY, NOW).map((i) => i.id)).toEqual(["draft:plain"]);
  });

  it("counts a post marked posted as out, so nothing offers Schedule it on it (live-p7a D19)", () => {
    expect(heldOrLive({ status: "posted" })).toBe(true);
    expect(heldOrLive({ status: "draft" })).toBe(false);
    expect(heldOrLive({ status: "scheduled" })).toBe(false);
    expect(heldOrLive({})).toBe(false);
  });

  it("leaves out every kind whose source is missing", () => {
    expect(needsYouItems({ drafts: [] }, TODAY, NOW)).toEqual([]);
    const items = needsYouItems({ drafts: full.drafts, campaigns: [{ id: "c", name: "n", audienceName: "", posts: [post("ready")] }] }, TODAY, NOW);
    expect(items.map((i) => i.kind)).toEqual(["failed", "overdue", "today", "unscheduled", "campaign"]);
    expect(items.find((i) => i.kind === "today")!.title).toBe("2 posts go out today");
    expect(items.find((i) => i.kind === "campaign")).toMatchObject({ quote: "n", line: "0 of 1 made | 1 draft waiting for you" });
    // a teammate gets the review rows only, not notes, market or the other brands' posts
    const mate = needsYouItems({ ...full, me: { owner: false, member: true, role: "editor" }, cards: [], threads: [], drafts: [] }, TODAY, NOW);
    expect(mate.map((i) => i.id)).toEqual(["team", "review:moneybees", "review:radiant", "autopilot", "campaign:c1", "ideas", "setup"]);
  });

  it("reads overdue and today by the day passed in, so a post due today is never also overdue", () => {
    const drafts = [draft({ id: "a", status: "scheduled", scheduledFor: "2026-10-14T00:30" }), draft({ id: "b", status: "scheduled", scheduledFor: "2026-10-13T23:30" })];
    const sg = needsYouItems({ drafts }, "2026-10-14", NOW);
    expect(sg.map((i) => [i.id, i.title])).toEqual([["overdue", "1 post is overdue"], ["today", "1 post goes out today"]]);
    expect(sg[0].actions[1]).toEqual({ label: "Mark posted", markPosted: "b" });
    expect(needsYouItems({ drafts }, "2026-10-13", NOW).map((i) => i.title)).toEqual(["1 post goes out today"]);
  });

  it("drops what was hidden today and ignores yesterday's hides", () => {
    const hidden = { "card:k1": TODAY, overdue: TODAY, unscheduled: "2026-10-13", setup: "2026-10-01" };
    const ids = needsYouItems({ ...full, hidden }, TODAY, NOW).map((i) => i.id);
    expect(ids).not.toContain("card:k1");
    expect(ids).not.toContain("overdue");
    expect(ids).toContain("unscheduled");
    expect(ids).toContain("setup");
    expect(ids).toHaveLength(14);
    expect(needsYouItems({ ...full, hidden: { unscheduled: TODAY } }, TODAY, NOW).map((i) => i.id)).not.toContain("unscheduled");
  });

  it("labels one item and several", () => {
    expect(nextUpLabel(1)).toBe("NEXT UP | THE 1 THING THAT NEEDS YOU");
    expect(nextUpLabel(3)).toBe("NEXT UP | 1 OF 3 THAT NEED YOU");
    expect(nextUpLabel(0)).toBe("NEXT UP");
  });
});

describe("badgeText", () => {
  it("caps at 9+", () => {
    expect(badgeText(3)).toBe("3");
    expect(badgeText(12)).toBe("9+");
  });
});
