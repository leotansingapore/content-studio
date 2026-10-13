import { beforeEach, describe, expect, it } from "vitest";
import {
  addComment,
  approve,
  readTeamPosts,
  readTeamReviews,
  statusOf,
  teamPostsKey,
  teamReviewsKey,
  threadOf,
  unapprove,
  type TeamPost,
} from "./teamPosts";

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
