import { beforeEach, describe, expect, it } from "vitest";
import {
  addComment,
  approve,
  groupOf,
  nextToReview,
  reviewOrder,
  readTeamPosts,
  readTeamReviews,
  skip,
  skippedBy,
  statusOf,
  teamHome,
  teamPostsHere,
  teamPostsKey,
  teamReviewsKey,
  threadOf,
  unapprove,
  unskip,
  type TeamPost,
} from "./teamPosts";
import { addProfile, setActiveProfile } from "./profiles";

const UID = "40f07a18-b087-4c95-ba1f-d5444222968a";

class MemStorage {
  m = new Map<string, string>();
  writes: string[] = [];
  get length() { return this.m.size; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.writes.push(k); this.m.set(k, v); }
  removeItem(k: string) { this.writes.push(k); this.m.delete(k); }
}

let store: MemStorage;
beforeEach(() => {
  store = new MemStorage();
  (globalThis as { window?: unknown }).window = { localStorage: store };
});

const post = (over: Partial<TeamPost> = {}): TeamPost => ({
  id: "tp1",
  title: "Script Deck",
  product: "gac",
  day: "2026-10-20",
  time: "10:00",
  image: "https://example.com/tp1-r1.png",
  message: "Hi team",
  rev: 1,
  revisedAt: null,
  postedAt: null,
  postLink: null,
  skipped: false,
  telegram: { approvedRev: null, comments: [] },
  handled: [],
  ...over,
});

describe("statusOf", () => {
  it("posted wins over everything", () =>
    expect(statusOf(post({ postedAt: "2026-10-20T02:00:00Z", skipped: true }), { approvedRev: 1, comments: [] })).toBe("posted"));

  it("skipped wins over an approval", () =>
    expect(statusOf(post({ skipped: true }), { approvedRev: 1, comments: [] })).toBe("skipped"));

  it("approved only for the current rev", () => {
    expect(statusOf(post({ rev: 2 }), { approvedRev: 2, comments: [] })).toBe("approved");
    expect(statusOf(post({ rev: 2 }), { approvedRev: 1, comments: [] })).toBe("waiting");
  });

  it("counts a Telegram approval", () => {
    expect(statusOf(post({ rev: 3, telegram: { approvedRev: 3, comments: [] } }))).toBe("approved");
    expect(statusOf(post({ rev: 3, telegram: { approvedRev: 3, comments: [] } }), { approvedRev: 2, comments: [] })).toBe("approved");
  });

  it("revising while any comment is not handled, from either side", () => {
    const c = { id: "c-abcd1234", at: "2026-10-14T01:00:00Z", text: "shorter", rev: 1 };
    const t = { id: "t-55", at: "2026-10-14T02:00:00Z", text: "add a link", rev: 1 };
    expect(statusOf(post(), { approvedRev: null, comments: [c] })).toBe("revising");
    expect(statusOf(post({ telegram: { approvedRev: null, comments: [t] } }))).toBe("revising");
    expect(statusOf(post({ rev: 2, handled: ["c-abcd1234"], telegram: { approvedRev: null, comments: [t] } }), { approvedRev: null, comments: [c] })).toBe("revising");
    expect(statusOf(post({ rev: 2, handled: ["c-abcd1234", "t-55"], telegram: { approvedRev: null, comments: [t] } }), { approvedRev: null, comments: [c] })).toBe("waiting");
  });

  it("waiting with no review at all", () => expect(statusOf(post())).toBe("waiting"));
});

describe("skipping: the later of Telegram's skip and the calendar's Skip/Undo wins", () => {
  const T1 = "2026-10-14T01:00:00+00:00"; // the job writes seconds and +00:00
  const T2 = "2026-10-14T02:00:00.000Z"; // the app writes toISOString
  const none = { approvedRev: null, comments: [] };

  it("a calendar Skip -> skipped", () => {
    expect(statusOf(post(), { ...none, skip: { on: true, at: T2 } })).toBe("skipped");
    expect(skippedBy(post(), { ...none, skip: { on: true, at: T2 } })).toBe("calendar");
  });

  it("a calendar Undo after a Telegram skip -> not skipped", () => {
    const p = post({ skipped: true, skippedAt: T1 });
    expect(statusOf(p, { ...none, skip: { on: false, at: T2 } })).toBe("waiting");
    expect(skippedBy(p)).toBe("telegram");
  });

  it("a Telegram skip after a calendar Undo -> skipped, and said to be Telegram's", () => {
    const p = post({ skipped: true, skippedAt: "2026-10-14T03:00:00+00:00" });
    expect(statusOf(p, { ...none, skip: { on: false, at: T2 } })).toBe("skipped");
    expect(skippedBy(p, { ...none, skip: { on: false, at: T2 } })).toBe("telegram");
  });

  it("an old post with skipped and no skippedAt -> skipped, and any calendar Undo is later", () => {
    expect(statusOf(post({ skipped: true }))).toBe("skipped");
    expect(statusOf(post({ skipped: true }), none)).toBe("skipped");
    expect(statusOf(post({ skipped: true }), { ...none, skip: { on: false, at: T1 } })).toBe("waiting");
  });

  it("an approval under an Undo shows again", () =>
    expect(statusOf(post({ skipped: true, skippedAt: T1 }), { approvedRev: 1, comments: [], skip: { on: false, at: T2 } })).toBe("approved"));
});

describe("threadOf", () => {
  it("merges calendar and Telegram comments by time, tagged with source and rev", () => {
    const p = post({
      rev: 2,
      telegram: { approvedRev: null, comments: [{ id: "t-9", at: "2026-10-14T02:00:00Z", text: "tg", rev: 1 }] },
    });
    const thread = threadOf(p, {
      approvedRev: null,
      comments: [
        { id: "c-late0000", at: "2026-10-14T03:00:00Z", text: "late", rev: 2 },
        { id: "c-earl0000", at: "2026-10-14T01:00:00Z", text: "early", rev: 1 },
      ],
    });
    expect(thread.map((c) => [c.id, c.source, c.rev])).toEqual([
      ["c-earl0000", "calendar", 1],
      ["t-9", "telegram", 1],
      ["c-late0000", "calendar", 2],
    ]);
  });
});

describe("storage", () => {
  it("reads nothing when the account has no team posts", () => {
    expect(readTeamPosts(UID)).toEqual([]);
    expect(readTeamReviews(UID)).toEqual({});
  });

  it("drops malformed posts and fills missing telegram fields", () => {
    store.setItem(teamPostsKey(UID), JSON.stringify({ schema: 1, posts: [{ id: "x", day: "soon", rev: 1 }, { ...post(), telegram: undefined, handled: undefined }] }));
    const [p, ...rest] = readTeamPosts(UID);
    expect(rest).toEqual([]);
    expect(p.telegram).toEqual({ approvedRev: null, comments: [] });
    expect(p.handled).toEqual([]);
  });

  it("approve, unapprove and comment write only the reviews key", () => {
    store.setItem(teamPostsKey(UID), JSON.stringify({ schema: 1, posts: [post({ rev: 2 })] }));
    const before = store.getItem(teamPostsKey(UID));
    store.writes = [];
    const p = readTeamPosts(UID)[0];

    expect(approve(UID, p).tp1.approvedRev).toBe(2);
    expect(unapprove(UID, p).tp1.approvedRev).toBeNull();
    const next = addComment(UID, p, "  make it shorter  ");
    expect(next.tp1.comments).toHaveLength(1);
    expect(next.tp1.comments[0]).toMatchObject({ text: "make it shorter", rev: 2 });
    expect(next.tp1.comments[0].id).toMatch(/^c-[a-z0-9]{8}$/);
    addComment(UID, p, "   "); // blank: ignored, nothing written

    expect(new Set(store.writes)).toEqual(new Set([teamReviewsKey(UID)]));
    expect(store.writes).toHaveLength(3);
    expect(store.getItem(teamPostsKey(UID))).toBe(before);
    expect(readTeamReviews(UID)).toEqual(next);
  });

  it("skip and unskip write only the reviews key, and keep the approval and comments", () => {
    store.setItem(teamPostsKey(UID), JSON.stringify({ schema: 1, posts: [post({ skipped: true })] }));
    const before = store.getItem(teamPostsKey(UID));
    const p = readTeamPosts(UID)[0];
    approve(UID, p);
    addComment(UID, p, "hi");
    store.writes = [];

    const skipped = skip(UID, p);
    expect(skipped.tp1.skip?.on).toBe(true);
    expect(Date.parse(skipped.tp1.skip!.at)).toBeGreaterThan(Date.now() - 5000);
    expect(statusOf(p, skipped.tp1)).toBe("skipped");
    const undone = unskip(UID, p);
    expect(undone.tp1.skip?.on).toBe(false);
    expect(statusOf(p, undone.tp1)).toBe("approved"); // Undo reverses the Telegram skip too
    expect(undone.tp1.approvedRev).toBe(1);
    expect(undone.tp1.comments).toHaveLength(1);

    expect(store.writes).toEqual([teamReviewsKey(UID), teamReviewsKey(UID)]);
    expect(store.getItem(teamPostsKey(UID))).toBe(before);
    expect(readTeamReviews(UID)).toEqual(undone);
  });

  it("keeps other posts' reviews when one changes", () => {
    const a = post({ id: "tp1" });
    const b = post({ id: "tp2", rev: 3 });
    approve(UID, a);
    addComment(UID, b, "hi");
    const all = readTeamReviews(UID);
    expect(all.tp1.approvedRev).toBe(1);
    expect(all.tp2.comments).toHaveLength(1);
    expect(all.tp2.approvedRev).toBeNull();
  });
});

describe("groupOf", () => {
  it("names the group a post goes to, FASTRACK when the post predates channels", () => {
    expect(groupOf({ channel: "advisoros" })).toBe("AdvisorOS");
    expect(groupOf({ channel: "fastrack" })).toBe("FINTERNSHIP FASTRACK");
    expect(groupOf({})).toBe("FINTERNSHIP FASTRACK");
    expect(groupOf({ channel: "nope" as never })).toBe("FINTERNSHIP FASTRACK");
  });
});

describe("review queue", () => {
  const p = (id: string, day: string, extra: Partial<TeamPost> = {}): TeamPost => ({
    id, title: id, product: "at", day, time: "10:00", image: "", message: "", rev: 1, revisedAt: null, postedAt: null,
    postLink: null, skipped: false, telegram: { approvedRev: null, comments: [] }, handled: [], ...extra,
  });
  const posts = [p("tp9", "2026-11-04"), p("tp2", "2026-10-23", { postedAt: "x" }), p("tp30", "2026-10-28"), p("tp10", "2026-10-28"), p("tp5", "2026-10-30")];

  it("orders the posts still to go out by when they go out", () => {
    expect(reviewOrder(posts).map((x) => x.id)).toEqual(["tp10", "tp30", "tp5", "tp9"]);
  });

  it("moves to the next waiting post, past approved ones, wrapping round", () => {
    const order = reviewOrder(posts);
    const reviews = { tp5: { approvedRev: 1, comments: [] } };
    expect(nextToReview(order, reviews, "tp30")?.id).toBe("tp9");
    expect(nextToReview(order, reviews, "tp9")?.id).toBe("tp10");
    expect(nextToReview(order, reviews, "tp2")?.id).toBe("tp10"); // a posted post is not in the queue: start at the top
  });

  it("is null when nothing else waits", () => {
    const order = reviewOrder([p("tp1", "2026-10-28"), p("tp2", "2026-10-30")]);
    expect(nextToReview(order, { tp2: { approvedRev: 1, comments: [] } }, "tp1")).toBeNull();
  });
});

describe("teamHome", () => {
  it("puts AdvisorOS posts on ActivityTracker and FASTRACK and memo posts on Leo's team, each falling back while its brand is missing", () => {
    const fast = post({ id: "f" }), adv = post({ id: "a", channel: "advisoros" }), memo = post({ id: "m", channel: "memos" });
    expect(teamHome(UID)).toBe("me");
    expect(teamPostsHere(UID, [fast, adv, memo]).map((p) => p.id)).toEqual(["f", "a", "m"]);
    const at = addProfile(UID, "ActivityTracker");
    expect(teamHome(UID, adv)).toBe(at.id);
    expect(teamHome(UID, memo)).toBe(at.id); // no Leo's team yet
    expect(teamPostsHere(UID, [fast, adv, memo])).toEqual([]);
    const team = addProfile(UID, "Leo's team");
    expect(teamHome(UID)).toBe(team.id);
    expect(teamHome(UID, fast)).toBe(team.id);
    expect(teamHome(UID, memo)).toBe(team.id);
    expect(teamHome(UID, adv)).toBe(at.id);
    setActiveProfile(UID, at.id);
    expect(teamPostsHere(UID, [fast, adv, memo]).map((p) => p.id)).toEqual(["a"]);
    setActiveProfile(UID, team.id);
    expect(teamPostsHere(UID, [fast, adv, memo]).map((p) => p.id)).toEqual(["f", "m"]);
  });
});

describe("memo posts", () => {
  it("names the memo topic and keeps a well-formed client part, dropping a broken one", () => {
    expect(groupOf({ channel: "memos" })).toBe("FINTERNSHIP FASTRACK memos");
    const client = { image: "https://x.supabase.co/a.png", message: "Hi [Client name]" };
    window.localStorage.setItem(teamPostsKey(UID), JSON.stringify({ posts: [
      { id: "tp1", day: "2026-10-29", rev: 1, channel: "memos", auto: true, client },
      { id: "tp2", day: "2026-10-30", rev: 1, client: { image: 3 } },
    ] }));
    const [a, b] = readTeamPosts(UID);
    expect(a.client).toEqual(client);
    expect(a.auto).toBe(true);
    expect(b.client).toBeUndefined();
  });
});
