import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/edgeFn", async (orig) => ({ ...(await orig<typeof import("@/lib/edgeFn")>()), callFn: vi.fn() }));
import { callFn } from "@/lib/edgeFn";
import { aspectOf, brandForProfile, cardsIn, feedCards, findCard, igLine, instagramHandle, mmss, perms, seesBoard, setConnectedIg, sharedBoard, stageForLink, checkMe, forgetMe, waitsOnMe, teamNotes, updateCard, type Me, type ReelCard, type ReelComment, type Role } from "./reelsBoard";

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
  it("'notes' lists posts with open notes someone else left, Leo's older unstamped notes counting as his own", () => {
    const leo = { owner: true, member: false };
    const ann = { owner: false, member: true, id: "ann", role: "editor" as const };
    const note = (id: string, by?: ReelComment["by"], resolved = false): ReelComment => ({ id, at: "", text: id, t: null, version: "v", resolved, by });
    const withNotes = (c: ReelCard, ...comments: ReelComment[]) => ({ ...c, comments });
    const cards = [
      withNotes(card("old", "approved"), note("n1")),
      withNotes(card("own", "review"), note("n2", { id: "leo", label: "Leo", role: "owner" })),
      withNotes(card("team", "scheduled"), note("n3", { id: "ann", label: "Ann", role: "editor" }), note("n4", { id: "bob", label: "Bob", role: "commenter" })),
      withNotes(card("done", "review"), note("n5", { id: "bob", label: "Bob", role: "commenter" }, true)),
      withNotes(card("gone", "archived"), note("n6", { id: "bob", label: "Bob", role: "commenter" })),
    ];
    expect(feedCards(cards, "notes", "", leo).map((c) => c.id)).toEqual(["team"]);
    expect(teamNotes(cards[2], leo)).toBe(2);
    expect(feedCards(cards, "notes", "", ann).map((c) => c.id)).toEqual(["old", "own", "team"]);
    expect(teamNotes(cards[2], ann)).toBe(1);
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

describe("sharedBoard", () => {
  it("shares one board call until a write or a failed call drops it", async () => {
    const call = vi.mocked(callFn);
    call.mockResolvedValue({ stages: [], brands: [], cards: [] });
    const first = sharedBoard();
    expect(sharedBoard()).toBe(first);
    await first;
    expect(call).toHaveBeenCalledTimes(1);
    await updateCard("c1", { stage: "approved" });
    expect(sharedBoard()).not.toBe(first);
    expect(call).toHaveBeenCalledTimes(3);
    await updateCard("c1", { stage: "review" });
    call.mockRejectedValueOnce(new Error("down"));
    await expect(sharedBoard()).rejects.toThrow("down");
    await sharedBoard();
    expect(call).toHaveBeenCalledTimes(6);
  });

  it("asks again after 30 seconds, and after a sign-out", () => {
    const call = vi.mocked(callFn);
    call.mockClear();
    call.mockResolvedValue({ stages: [], brands: [], cards: [] });
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-20T10:00:00Z"));
    forgetMe();
    const first = sharedBoard();
    vi.setSystemTime(new Date("2026-10-20T10:00:29Z"));
    expect(sharedBoard()).toBe(first);
    vi.setSystemTime(new Date("2026-10-20T10:00:31Z"));
    const second = sharedBoard();
    expect(second).not.toBe(first);
    forgetMe();
    expect(sharedBoard()).not.toBe(second);
    expect(call).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });
});

describe("checkMe and waitsOnMe", () => {
  it("shares one server call between screens asking at once", async () => {
    const call = vi.mocked(callFn);
    call.mockClear();
    call.mockResolvedValue({ owner: false, member: true, role: "viewer", modules: ["reels"] });
    const [a, b] = await Promise.all([checkMe(true), checkMe(true)]);
    expect(a).toBe(b);
    expect(call).toHaveBeenCalledTimes(1);
  });
  it("counts posts as waiting on owners, commenters and up, never on a viewer", () => {
    const member = { owner: false, member: true, modules: ["reels"] };
    expect(waitsOnMe({ ...member, role: "viewer" })).toBe(false);
    expect(waitsOnMe({ ...member, role: "commenter" })).toBe(true);
    expect(waitsOnMe({ owner: true, member: false })).toBe(true);
    expect(waitsOnMe({ owner: false, member: false })).toBe(false);
    expect(waitsOnMe(null)).toBe(false);
  });
});

describe("what each person is offered on a post (docs/team-roles.md)", () => {
  const member = (role: Role): Me => ({ owner: false, member: true, id: "ann", role, brands: ["moneybees"], modules: ["reels"] });
  const leo: Me = { owner: true, member: false };
  const note = (by?: ReelComment["by"]): ReelComment => ({ id: "n", at: "", text: "n", t: null, version: "v", resolved: false, by });

  it("lets a viewer only look, and a commenter leave notes and clear only their own", () => {
    const v = perms(member("viewer"), card("a", "review"));
    expect([v.note, v.edit, v.move("changes"), v.brand, v.resolve(note({ id: "ann", label: "Ann" }))]).toEqual([false, false, false, false, false]);
    const c = perms(member("commenter"), card("a", "review"));
    expect([c.note, c.edit, c.move("changes")]).toEqual([true, false, false]);
    expect(c.resolve(note({ id: "ann", label: "Ann", role: "commenter" }))).toBe(true);
    expect(c.resolve(note({ id: "bob", label: "Bob", role: "editor" }))).toBe(false);
    // Leo's older unstamped notes are his to clear
    expect(c.resolve(note())).toBe(false);
    expect(perms(leo, card("a", "review")).resolve(note({ id: "bob", label: "Bob" }))).toBe(true);
  });

  it("lets an editor change and send back a post only before it is approved", () => {
    const open = perms(member("editor"), card("a", "review"));
    expect([open.edit, open.move("changes"), open.move("approved"), open.move("archived")]).toEqual([true, true, false, false]);
    expect(perms(member("editor"), card("a", "changes")).move("review")).toBe(true);
    const approved = perms(member("editor"), card("a", "approved"));
    expect([approved.edit, approved.move("changes"), approved.move("scheduled")]).toEqual([false, false, false]);
  });

  it("lets an approver move a post on and archive it, but never mark it posted or change its brand", () => {
    const a = perms(member("approver"), card("a", "approved"));
    expect([a.edit, a.move("scheduled"), a.move("archived"), a.move("review"), a.move("posted"), a.brand]).toEqual([true, true, true, true, false, false]);
  });

  it("keeps a posted or publishing post in Leo's hands only", () => {
    for (const live of [card("a", "posted"), { ...card("a", "scheduled"), ig: { state: "publishing" as const } }]) {
      const a = perms(member("approver"), live);
      expect([a.edit, a.move("archived"), a.move("approved")], live.stage).toEqual([false, false, false]);
      const o = perms(leo, live);
      expect([o.edit, o.move("archived"), o.brand]).toEqual([true, true, true]);
    }
    // nobody signed in gets nothing
    const none = perms(null, card("a", "review"));
    expect([none.note, none.edit, none.move("changes")]).toEqual([false, false, false]);
  });

  it("shows the board to Leo and to members given the posts module, no one else", () => {
    expect(seesBoard(leo)).toBe(true);
    expect(seesBoard(member("viewer"))).toBe(true);
    expect(seesBoard({ ...member("approver"), modules: ["calendar"] })).toBe(false);
    expect(seesBoard({ ...member("approver"), member: false })).toBe(false);
    expect(seesBoard(null)).toBe(false);
  });
});
