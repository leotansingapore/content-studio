import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadDrafts,
  nextOccurrence,
  occurrencesBetween,
  restoreDraft,
  saveDrafts,
  setDraftStatus,
  setRepeat,
  skipOccurrence,
  upsertDraft,
  duplicateDraft,
  undoDuplicate,
  undoPosted,
  markUnposted,
  setDraftZernio,
  setDraftAttached,
  deleteDraft,
  setDraftNumbers,
  MAX_DRAFTS,
  draftsOfBrand,
  getDraftStats,
  getPostingActivity,
  threadOf,
  titlesOf,
  coverOf,
  type DraftEntry,
} from "./draftHistory";
import { addProfile, DEFAULT_PROFILE_ID, setActiveProfile } from "./profiles";
import { loadActivity, setActivityOn } from "./activity";
import { loadOutbox, settleOutbox } from "./zernioOutbox";
import { createCloudSync } from "./cloudSync";

const UID = "6d80f027-3395-480c-86a1-8827d3d6cce3";

class MemStorage {
  private m = new Map<string, string>();
  get length() { return this.m.size; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
}

const post = (extra: Partial<DraftEntry>): DraftEntry => ({
  id: "s",
  createdAt: "2026-10-01T00:00:00.000Z",
  hook: "Weekly tip",
  draft: "Body",
  pillar: "",
  pillarDetail: "",
  audience: "",
  format: "",
  platform: "linkedin",
  ctaType: "",
  ...extra,
});

beforeEach(() => {
  (globalThis as { window?: unknown }).window = { localStorage: new MemStorage() };
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 8, 10, 0)); // Thu 8 Oct 2026, local
});
afterEach(() => vi.useRealTimers());

describe("occurrences", () => {
  it("steps weekly and fortnightly from the start", () => {
    const weekly = { every: "week" as const, start: "2026-10-08" };
    expect(occurrencesBetween(weekly, "2026-10-08", "2026-10-31")).toEqual(["2026-10-15", "2026-10-22", "2026-10-29"]);
    expect(occurrencesBetween({ every: "2weeks", start: "2026-10-08" }, "2026-10-08", "2026-11-30")).toEqual([
      "2026-10-22",
      "2026-11-05",
      "2026-11-19",
    ]);
  });

  it("keeps the day of the month, on the last day of a short month", () => {
    const monthly = { every: "month" as const, start: "2027-01-31" };
    expect(occurrencesBetween(monthly, "2027-01-31", "2027-05-31")).toEqual([
      "2027-02-28",
      "2027-03-31",
      "2027-04-30",
      "2027-05-31",
    ]);
  });

  it("leaves skipped days out", () => {
    const r = { every: "week" as const, start: "2026-10-08", skip: ["2026-10-22"] };
    expect(occurrencesBetween(r, "2026-10-08", "2026-10-31")).toEqual(["2026-10-15", "2026-10-29"]);
    expect(nextOccurrence(r, "2026-10-15")).toBe("2026-10-29");
  });
});

describe("recurring posts", () => {
  it("posting an occurrence records it and moves the series on, keeping the time", () => {
    saveDrafts(UID, [post({ status: "scheduled", scheduledFor: "2026-10-08T19:30" })]);
    setRepeat(UID, "s", "week");
    const after = setDraftStatus(UID, "s", "posted");
    expect(after).toHaveLength(2);
    const [record, series] = after;
    expect(record).toMatchObject({ status: "posted", scheduledFor: "2026-10-08T19:30", hook: "Weekly tip" });
    expect(record.repeat).toBeUndefined();
    expect(record.id).not.toBe("s");
    expect(series).toMatchObject({ id: "s", status: "scheduled", scheduledFor: "2026-10-15T19:30" });
    expect(series.repeat).toEqual({ every: "week", start: "2026-10-08" });
  });

  it("a late post catches the series up to after today", () => {
    saveDrafts(UID, [post({ status: "scheduled", scheduledFor: "2026-09-17", repeat: { every: "week", start: "2026-09-17" } })]);
    const series = setDraftStatus(UID, "s", "posted").find((d) => d.id === "s")!;
    expect(series.scheduledFor).toBe("2026-10-15"); // 8 Oct is today, so the post covers it
  });

  it("skip this one moves the next occurrence on, or leaves a later one out", () => {
    saveDrafts(UID, [post({ status: "scheduled", scheduledFor: "2026-10-15", repeat: { every: "week", start: "2026-10-08" } })]);
    let s = skipOccurrence(UID, "s", "2026-10-15")[0];
    expect(s.scheduledFor).toBe("2026-10-22");
    s = skipOccurrence(UID, "s", "2026-10-29")[0];
    expect(s.scheduledFor).toBe("2026-10-22");
    expect(s.repeat?.skip).toEqual(["2026-10-29"]);
    s = setDraftStatus(UID, "s", "posted").find((d) => d.id === "s")!;
    expect(s.scheduledFor).toBe("2026-11-05");
    expect(s.repeat?.skip).toBeUndefined();
  });

  it("moving a recurring post moves the series; unscheduling ends it", () => {
    saveDrafts(UID, [post({ status: "scheduled", scheduledFor: "2026-10-15", repeat: { every: "week", start: "2026-10-08", skip: ["2026-10-29"] } })]);
    let s = setDraftStatus(UID, "s", "scheduled", "2026-10-16")[0];
    expect(s.repeat).toEqual({ every: "week", start: "2026-10-16" });
    s = setDraftStatus(UID, "s", "draft")[0];
    expect(s.repeat).toBeUndefined();
  });

  it("a one-off post still just turns posted", () => {
    saveDrafts(UID, [post({ status: "scheduled", scheduledFor: "2026-10-08" })]);
    const after = setDraftStatus(UID, "s", "posted");
    expect(after).toHaveLength(1);
    expect(after[0].status).toBe("posted");
  });

  it("restore puts an entry back exactly, in place", () => {
    const original = post({ status: "scheduled", scheduledFor: "2026-10-15", repeat: { every: "week", start: "2026-10-08", skip: ["2026-10-29"] } });
    saveDrafts(UID, [post({ id: "first" }), original]);
    setDraftStatus(UID, "s", "scheduled", "2026-10-20");
    expect(restoreDraft(UID, original)).toEqual([post({ id: "first" }), original]);
    expect(loadDrafts(UID)[1]).toEqual(original);
  });
});

describe("upsertDraft", () => {
  it("keeps a post's numbers when the edit doesn't carry them", () => {
    saveDrafts(UID, [post({ status: "posted", metrics: { impressions: 900, reactions: 12 } })]);
    upsertDraft(UID, post({ status: "posted", hook: "Edited in Write" }));
    expect(loadDrafts(UID)[0]).toMatchObject({ hook: "Edited in Write", metrics: { impressions: 900, reactions: 12 } });
  });

  it("keeps an imported post's media link and its labels when Write saves an edit", () => {
    saveDrafts(UID, [post({ media: "https://drive.example.com/reel.mp4", labels: ["format:carousel"] })]);
    upsertDraft(UID, post({ draft: "Edited in Write" }));
    expect(loadDrafts(UID)[0]).toMatchObject({ draft: "Edited in Write", media: "https://drive.example.com/reel.mp4", labels: ["format:carousel"] });
  });

  it("editing a post when My posts is full loses no other post", () => {
    const full = Array.from({ length: MAX_DRAFTS }, (_, i) => post({ id: `p${i}` }));
    saveDrafts(UID, full);
    upsertDraft(UID, post({ id: "p10", hook: "Edited in Write" }));
    const after = loadDrafts(UID);
    expect(after[0]).toMatchObject({ id: "p10", hook: "Edited in Write" });
    expect(after.map((d) => d.id).sort()).toEqual(full.map((d) => d.id).sort());
  });
});

describe("upsertDraft and the remix source", () => {
  const source = { key: "top:grace-koh-instagram-C931K2DSgnl", kind: "top-post" as const, author: "@gracedotc0m", remixedAt: "2026-10-08T02:00:00.000Z" };
  const remix = { keep: "structure", as: "post", close: "balanced" };

  it("keeps the source through a save and a reload", () => {
    upsertDraft(UID, post({ source, remix }));
    expect(JSON.parse(JSON.stringify(loadDrafts(UID)))[0]).toMatchObject({ source, remix });
  });

  it("keeps it when a writer leaves the key out, and clears it when Write sets it to undefined", () => {
    upsertDraft(UID, post({ source, remix }));
    upsertDraft(UID, post({ draft: "Edited on the board" }));
    expect(loadDrafts(UID)[0]).toMatchObject({ draft: "Edited on the board", source, remix });
    upsertDraft(UID, post({ draft: "Chip removed", source: undefined }));
    expect(loadDrafts(UID)[0].source).toBeUndefined();
    expect(loadDrafts(UID)[0].remix).toEqual(remix);
  });
});

// phase 6's remix-topic pin, taken before drafts gained `agent`: drafts stored today load and edit byte for byte
describe("drafts saved before the agent field", () => {
  const source = { key: "top:grace-koh-instagram-C931K2DSgnl", kind: "top-post" as const, author: "@gracedotc0m", remixedAt: "2026-10-08T02:00:00.000Z" };
  const remix = { keep: "structure", as: "post", close: "balanced", flags: { copied: [], claim: false, invented: false } };
  const OLD = JSON.stringify([
    post({ id: "remixed", source, remix, labels: ["format:text"], metrics: { impressions: 900 } }),
    post({ id: "scheduled", status: "scheduled", scheduledFor: "2026-10-09T19:30", repeat: { every: "week", start: "2026-10-09" } }),
  ]);

  it("load exactly as stored", () => {
    (globalThis as unknown as { window: { localStorage: Storage } }).window.localStorage.setItem(`content-studio-drafts-${UID}`, OLD);
    expect(JSON.stringify(loadDrafts(UID))).toBe(OLD);
  });

  it("keep what an edit leaves out, in the same order, and gain nothing", () => {
    (globalThis as unknown as { window: { localStorage: Storage } }).window.localStorage.setItem(`content-studio-drafts-${UID}`, OLD);
    upsertDraft(UID, post({ id: "remixed", draft: "Edited in Write" }));
    expect(JSON.stringify(loadDrafts(UID))).toBe(
      JSON.stringify([{ ...post({ id: "remixed", draft: "Edited in Write" }), metrics: { impressions: 900 }, labels: ["format:text"], source, remix }, JSON.parse(OLD)[1]]),
    );
  });
});

describe("the agent that made a draft", () => {
  const agent = { thread: "t1a2b", msg: "m3c4d" };

  it("survives a save, a reload and an edit that leaves it out", () => {
    upsertDraft(UID, post({ agent }));
    expect(JSON.parse(JSON.stringify(loadDrafts(UID)))[0].agent).toEqual(agent);
    upsertDraft(UID, post({ draft: "Edited in Write" }));
    expect(loadDrafts(UID)[0]).toMatchObject({ draft: "Edited in Write", agent });
  });

  it("is never added to a draft without one", () => {
    upsertDraft(UID, post({}));
    upsertDraft(UID, post({ draft: "Edited" }));
    expect(Object.keys(JSON.parse(JSON.stringify(loadDrafts(UID)))[0])).not.toContain("agent");
  });
});

describe("upsertDraft and the hook formula", () => {
  it("keeps the formula while the hook is the same, and drops it with a new hook", () => {
    saveDrafts(UID, [post({ hook: "I reviewed 40 families.", hookFormula: "number-reveal" })]);
    upsertDraft(UID, post({ hook: "I reviewed 40 families.", draft: "Edited body" }));
    expect(loadDrafts(UID)[0]).toMatchObject({ draft: "Edited body", hookFormula: "number-reveal" });
    upsertDraft(UID, post({ hook: "A hook I typed myself" }));
    expect(loadDrafts(UID)[0].hookFormula).toBeUndefined();
  });
});

describe("a draft's thread, titles and cover", () => {
  const thread = { network: "threads" as const, posts: ["Most people pay for their hospital stay twice.", "First through the premium. Then through the co-pay."] };
  const titles = ["Why your hospital bill comes twice", "The co-pay nobody explains", "Two bills, one stay"];
  const cover = "Two bills, one stay";
  const junk = (v: unknown) => v as never;

  it("survive a save and a reload", () => {
    upsertDraft(UID, post({ thread, titles, cover }));
    const back = JSON.parse(JSON.stringify(loadDrafts(UID)))[0] as DraftEntry;
    expect(threadOf(back)).toEqual(thread);
    expect(titlesOf(back)).toEqual(titles);
    expect(coverOf(back)).toBe(cover);
  });

  it("an older draft without them still loads, and reads as none", () => {
    saveDrafts(UID, [post({})]);
    const old = loadDrafts(UID)[0];
    expect(old.hook).toBe("Weekly tip");
    expect(threadOf(old)).toBeNull();
    expect(titlesOf(old)).toEqual([]);
    expect(coverOf(old)).toBe("");
  });

  it("drops junk: a bad network, non-text and blank posts, fewer than 2 posts, past 10, past 500 characters", () => {
    expect(threadOf({ thread: junk({ network: "bluesky", posts: thread.posts }) })).toBeNull();
    expect(threadOf({ thread: junk({ network: "x", posts: "one long post" }) })).toBeNull();
    expect(threadOf({ thread: junk("a thread") })).toBeNull();
    expect(threadOf({ thread: junk(null) })).toBeNull();
    expect(threadOf({ thread: junk({ network: "x", posts: ["Only one", "  ", 3, null] }) })).toBeNull();
    expect(threadOf({ thread: junk({ network: "x", posts: ["One", "", { t: 1 }, "Two"] }) })).toEqual({ network: "x", posts: ["One", "Two"] });
    const twelve = Array.from({ length: 12 }, (_, i) => `Post ${i + 1}`);
    expect(threadOf({ thread: { network: "threads", posts: twelve } })!.posts).toEqual(twelve.slice(0, 10));
    const long = "a".repeat(700);
    expect(threadOf({ thread: { network: "threads", posts: [long, "Two"] } })!.posts[0]).toBe("a".repeat(500));
  });

  it("drops junk titles and cover: non-text, blank, past 3", () => {
    expect(titlesOf({ titles: junk("one title") })).toEqual([]);
    expect(titlesOf({ titles: junk(["One", "", 2, null, "Two", "Three", "Four"]) })).toEqual(["One", "Two", "Three"]);
    expect(coverOf({ cover: junk(42) })).toBe("");
    expect(coverOf({ cover: "   " })).toBe("");
  });

  it("upsertDraft keeps them when a writer leaves them out, and takes new ones", () => {
    upsertDraft(UID, post({ thread, titles, cover }));
    upsertDraft(UID, post({ draft: "Edited in Write" }));
    expect(loadDrafts(UID)[0]).toMatchObject({ draft: "Edited in Write", thread, titles, cover });
    const next = { network: "x" as const, posts: ["New one", "New two"] };
    upsertDraft(UID, post({ thread: next, titles: ["Only this"], cover: "New cover" }));
    expect(loadDrafts(UID)[0]).toMatchObject({ thread: next, titles: ["Only this"], cover: "New cover" });
  });
});

describe("a version in another language (edit-translate)", () => {
  const translationOf = { id: "english-1", key: "48-abc123", at: "2026-10-21T10:00:00.000Z" };
  const back = ["Most people pay twice.", "", "Comment PLAN."];
  const version = { lang: "zh" as const, translationOf, back, sameP: 0.82 };

  it("survives a save and a reload", () => {
    upsertDraft(UID, post(version));
    expect(JSON.parse(JSON.stringify(loadDrafts(UID)))[0]).toMatchObject(version);
  });

  it("upsertDraft keeps it when a writer leaves the fields out, as Write's rebuilt entry does", () => {
    upsertDraft(UID, post(version));
    upsertDraft(UID, post({ draft: "Edited in Write" }));
    expect(loadDrafts(UID)[0]).toMatchObject({ draft: "Edited in Write", ...version });
  });

  it("keeps a same-meaning answer of 0 and a null one (Jev had no answer)", () => {
    upsertDraft(UID, post({ ...version, sameP: 0 }));
    upsertDraft(UID, post({ draft: "Edited" }));
    expect(loadDrafts(UID)[0].sameP).toBe(0);
    upsertDraft(UID, post({ ...version, sameP: null }));
    upsertDraft(UID, post({ draft: "Edited again" }));
    expect(loadDrafts(UID)[0].sameP).toBeNull();
  });

  it("takes new values from a writer that sets them, and clears one set to undefined", () => {
    upsertDraft(UID, post(version));
    const again = { id: "english-1", key: "52-def456", at: "2026-10-22T09:00:00.000Z" };
    upsertDraft(UID, post({ translationOf: again, back: ["New meaning."], sameP: undefined }));
    expect(loadDrafts(UID)[0]).toMatchObject({ lang: "zh", translationOf: again, back: ["New meaning."] });
    expect(loadDrafts(UID)[0].sameP).toBeUndefined();
  });

  it("an English post saves with none of them", () => {
    upsertDraft(UID, post({}));
    upsertDraft(UID, post({ draft: "Edited" }));
    const saved = JSON.parse(JSON.stringify(loadDrafts(UID)))[0];
    expect(Object.keys(saved).filter((k) => ["lang", "translationOf", "back", "sameP"].includes(k))).toEqual([]);
  });
});

describe("undoPosted", () => {
  it("puts a one-off post back to scheduled", () => {
    const before = [post({ status: "scheduled", scheduledFor: "2026-10-08T19:30" }), post({ id: "other" })];
    saveDrafts(UID, before);
    setDraftStatus(UID, "s", "posted");
    expect(undoPosted(UID, before[0], before)).toEqual(before);
    expect(loadDrafts(UID)).toEqual(before);
  });

  it("removes a recurring post's posted copy and moves the series back", () => {
    const before = [post({ status: "scheduled", scheduledFor: "2026-10-08", repeat: { every: "week", start: "2026-10-08" } })];
    saveDrafts(UID, before);
    expect(setDraftStatus(UID, "s", "posted")).toHaveLength(2);
    expect(undoPosted(UID, before[0], before)).toEqual(before);
  });

  it("brings back a post the posted copy pushed past the cap", () => {
    const before = Array.from({ length: MAX_DRAFTS }, (_, i) =>
      post(i === 0 ? { id: "p0", status: "scheduled", scheduledFor: "2026-10-08", repeat: { every: "week", start: "2026-10-08" } } : { id: `p${i}` }),
    );
    saveDrafts(UID, before);
    setDraftStatus(UID, "p0", "posted");
    expect(loadDrafts(UID).some((d) => d.id === `p${MAX_DRAFTS - 1}`)).toBe(false);
    expect(undoPosted(UID, before[0], before)).toEqual(before);
  });
});

describe("markUnposted", () => {
  it("puts a posted post back on its scheduled day, time and repeat, keeping its numbers", () => {
    const repeat = { every: "week" as const, start: "2026-10-09" };
    const metrics = { impressions: 900, reactions: 12 };
    saveDrafts(UID, [post({ status: "posted", postedAt: "2026-10-09T01:00:00.000Z", scheduledFor: "2026-10-09T08:00", repeat, metrics })]);
    const [d] = markUnposted(UID, "s");
    expect(d).toMatchObject({ status: "scheduled", scheduledFor: "2026-10-09T08:00", repeat, metrics });
    expect(d.postedAt).toBeUndefined();
    expect(loadDrafts(UID)[0]).toEqual(d);
  });

  it("sends a post that never had a day back to the drafts", () => {
    saveDrafts(UID, [post({ status: "posted", postedAt: "2026-10-09T01:00:00.000Z" })]);
    const [d] = markUnposted(UID, "s");
    expect(d.status).toBe("draft");
    expect(d.postedAt).toBeUndefined();
  });
});

describe("duplicateDraft", () => {
  it("copies the content as a fresh draft at the top, without schedule or numbers", () => {
    const original = post({ id: "o", status: "scheduled", scheduledFor: "2026-10-15T09:00", repeat: { every: "week", start: "2026-10-15" }, metrics: { impressions: 5 }, labels: ["l1"], zernio: { key: "k", postId: "p" } });
    saveDrafts(UID, [post({ id: "first" }), original]);
    const r = duplicateDraft(UID, "o")!;
    expect(r.copy.id).not.toBe("o");
    expect(r.copy).toMatchObject({ hook: "Weekly tip (copy)", draft: "Body", platform: "linkedin", labels: ["l1"], status: "draft" });
    for (const k of ["scheduledFor", "postedAt", "repeat", "metrics", "zernio"]) expect(r.copy).not.toHaveProperty(k);
    expect(loadDrafts(UID).map((d) => d.id)).toEqual([r.copy.id, "first", "o"]);
    expect(loadDrafts(UID)[2]).toEqual(original);
    expect(duplicateDraft(UID, "missing")).toBeNull();
  });

  it("undo removes the copy and puts back a post the cap pushed out", () => {
    const full = Array.from({ length: MAX_DRAFTS }, (_, i) => post({ id: `p${i}` }));
    saveDrafts(UID, full);
    const r = duplicateDraft(UID, "p0")!;
    expect(r.dropped.map((d) => d.id)).toEqual([`p${MAX_DRAFTS - 1}`]);
    expect(loadDrafts(UID)).toHaveLength(MAX_DRAFTS);
    expect(undoDuplicate(UID, r.copy.id, r.dropped)).toEqual(full);
    expect(loadDrafts(UID)).toEqual(full);
  });
});

describe("files attached in Write", () => {
  it("are set, kept by an edit in Write, and an empty list removes them", () => {
    saveDrafts(UID, [post({})]);
    expect(setDraftAttached(UID, "s", ["cimg-a", "cimg-b"])[0].attached).toEqual(["cimg-a", "cimg-b"]);
    upsertDraft(UID, post({ draft: "Edited" }));
    expect(loadDrafts(UID)[0].attached).toEqual(["cimg-a", "cimg-b"]);
    expect(setDraftAttached(UID, "s", [])[0]).not.toHaveProperty("attached");
  });
});

describe("Post it for me's link to the Zernio post", () => {
  const link = { key: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", postId: "67000000000000000000d001", status: "scheduled" };

  it("is set and cleared, and an edit in Write keeps it", () => {
    saveDrafts(UID, [post({ status: "scheduled", scheduledFor: "2026-10-15T09:00" })]);
    expect(setDraftZernio(UID, "s", link)[0].zernio).toEqual(link);
    upsertDraft(UID, post({ status: "scheduled", scheduledFor: "2026-10-15T09:00", draft: "Edited" }));
    expect(loadDrafts(UID)[0].zernio).toEqual(link);
    expect(setDraftZernio(UID, "s", null)[0]).not.toHaveProperty("zernio");
  });

  it("stays with the posted record of a recurring post, not the next occurrence", () => {
    saveDrafts(UID, [post({ status: "scheduled", scheduledFor: "2026-10-08T09:00", repeat: { every: "week", start: "2026-10-08" }, zernio: link })]);
    const [record, series] = setDraftStatus(UID, "s", "posted");
    expect(record.zernio).toEqual(link);
    expect(series.id).toBe("s");
    expect(series).not.toHaveProperty("zernio");
  });
});

describe("Home's posting numbers", () => {
  // days before the frozen now (Thu 8 Oct), at midday local
  const ago = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() - days);
    d.setHours(12, 0, 0, 0);
    return d.toISOString();
  };
  const posted = (id: string, days: number) => post({ id, status: "posted", postedAt: ago(days) });

  it("counts the weeks in a row with a post, and a week not posted in yet doesn't break the run", () => {
    // last week, the week before, then a week with nothing, then one more
    saveDrafts(UID, [posted("a", 7), posted("b", 14), posted("c", 28), post({ id: "d" }), post({ id: "e", status: "posted" })]);
    expect(getPostingActivity(UID)).toEqual({ thisWeekPosted: 0, weekStreak: 2 });
    saveDrafts(UID, [posted("today", 1), ...loadDrafts(UID)]);
    expect(getPostingActivity(UID)).toEqual({ thisWeekPosted: 1, weekStreak: 3 });
  });

  it("counts this month's posts and the last one out", () => {
    saveDrafts(UID, [posted("a", 7), posted("b", 1), posted("c", 14), post({ id: "d" }), post({ id: "e", status: "scheduled" })]);
    expect(getDraftStats(UID)).toEqual({ total: 5, drafts: 1, scheduled: 1, posted: 3, postedThisMonth: 2, lastPostedAt: ago(1) });
  });
});

describe("another brand's posts, for the Calendar's every-brand view", () => {
  it("reads each brand's list as stored, whichever brand is open, and a damaged one as empty", () => {
    const mb = addProfile(UID, "MoneyBees");
    setActiveProfile(UID, mb.id);
    saveDrafts(UID, [post({ id: "mb1" })]);
    setActiveProfile(UID, DEFAULT_PROFILE_ID);
    saveDrafts(UID, [post({ id: "me1" })]);
    expect(draftsOfBrand(UID, mb.id).map((d) => d.id)).toEqual(["mb1"]);
    expect(draftsOfBrand(UID, DEFAULT_PROFILE_ID).map((d) => d.id)).toEqual(["me1"]);
    (globalThis as unknown as { window: { localStorage: Storage } }).window.localStorage.setItem(`content-studio-drafts-${UID}~${mb.id}`, "{oops");
    expect(draftsOfBrand(UID, mb.id)).toEqual([]);
  });
});

// phase 6's activity-page pin, taken before the absorb logged to Activity: what absorbClaudeDrafts makes of Claude's
// sync rows, field for field, and which rows it leaves
describe("drafts Claude saved, as absorbed today", () => {
  const ls = () => (globalThis as unknown as { window: { localStorage: MemStorage } }).window.localStorage;
  const row = (id: string, o: Record<string, unknown> = {}) =>
    JSON.stringify({ id, createdAt: "2026-10-08T03:00:00.000Z", hook: "From Claude", draft: "Body", platform: "instagram", format: "carousel", status: "draft", ...o });

  it("join My posts newest first with these fields, and only this brand's rows go", () => {
    ls().setItem(`content-studio-drafts-${UID}`, JSON.stringify([post({ id: "old" })]));
    ls().setItem(`content-studio-mcpdraft-claude-a1-${UID}`, row("claude-a1", { pillarDetail: "CPF at 55" }));
    ls().setItem(`content-studio-mcpdraft-claude-b2-${UID}`, row("claude-b2", { createdAt: "2026-10-08T04:00:00.000Z", status: "scheduled", scheduledFor: "2026-10-20T19:30", hook: "x".repeat(200) }));
    ls().setItem(`content-studio-mcpdraft-claude-c3-${UID}~p9`, row("claude-c3"));
    ls().setItem(`content-studio-mcpdraft-claude-old-${UID}`, row("old"));
    expect(loadDrafts(UID)).toEqual([
      {
        id: "claude-b2", createdAt: "2026-10-08T04:00:00.000Z", hook: "x".repeat(160), draft: "Body", pillar: "topic", pillarDetail: "x".repeat(160),
        audience: "general", format: "carousel", platform: "instagram", ctaType: "comment-keyword", status: "scheduled", scheduledFor: "2026-10-20T19:30",
      },
      {
        id: "claude-a1", createdAt: "2026-10-08T03:00:00.000Z", hook: "From Claude", draft: "Body", pillar: "topic", pillarDetail: "CPF at 55",
        audience: "general", format: "carousel", platform: "instagram", ctaType: "comment-keyword", status: "draft",
      },
      post({ id: "old" }),
    ]);
    expect(Array.from({ length: ls().length }, (_, i) => ls().key(i)).sort()).toEqual([`content-studio-drafts-${UID}`, `content-studio-mcpdraft-claude-c3-${UID}~p9`]);
  });
});

describe("drafts Claude saved, in Leo's Activity", () => {
  const ls = () => (globalThis as unknown as { window: { localStorage: MemStorage } }).window.localStorage;
  const row = (id: string, o: Record<string, unknown> = {}) =>
    JSON.stringify({ id, createdAt: "2026-10-08T03:00:00.000Z", hook: "From Claude", draft: "Body", platform: "instagram", format: "carousel", status: "draft", ...o });
  beforeEach(() => {
    const storage = ls();
    vi.stubGlobal("localStorage", storage);
    vi.stubGlobal("window", { localStorage: storage, dispatchEvent: () => true });
    storage.setItem("cs-device-tag", "dev001");
    setActivityOn(true);
  });
  afterEach(() => {
    setActivityOn(false);
    vi.unstubAllGlobals();
  });

  it("each is one Claude row at the time Claude saved it, under the draft's id, linked to Write", () => {
    ls().setItem(`content-studio-mcpdraft-claude-a1-${UID}`, row("claude-a1"));
    ls().setItem(`content-studio-mcpdraft-claude-b2-${UID}`, row("claude-b2", { createdAt: "2026-10-08T04:00:00.000Z", status: "scheduled", scheduledFor: "2026-10-20T19:30", hook: "Why I stopped chasing yield" }));
    loadDrafts(UID);
    expect(loadActivity(UID, ["2026-10"])).toEqual([
      { id: "claude-b2", at: "2026-10-08T04:00:00.000Z", who: "claude", kind: "post", title: 'Added a draft: "Why I stopped chasing yield"', detail: "Scheduled for Tue 20 Oct, 7:30pm.", link: "/generate?draft=claude-b2" },
      { id: "claude-a1", at: "2026-10-08T03:00:00.000Z", who: "claude", kind: "post", title: 'Added a draft: "From Claude"', detail: "Saved as a draft in My posts.", link: "/generate?draft=claude-a1" },
    ]);
  });

  it("stays one event when a second device absorbs the same row before the first one's removal syncs", () => {
    ls().setItem(`content-studio-mcpdraft-claude-a1-${UID}`, row("claude-a1"));
    loadDrafts(UID);
    ls().setItem("cs-device-tag", "dev002");
    ls().removeItem(`content-studio-drafts-${UID}`);
    ls().setItem(`content-studio-mcpdraft-claude-a1-${UID}`, row("claude-a1"));
    loadDrafts(UID);
    expect(Array.from({ length: ls().length }, (_, i) => ls().key(i)).filter((k) => k?.startsWith("content-studio-activity-")).sort()).toEqual([
      `content-studio-activity-2026-10-dev001-${UID}`,
      `content-studio-activity-2026-10-dev002-${UID}`,
    ]);
    expect(loadActivity(UID, ["2026-10"]).map((e) => e.id)).toEqual(["claude-a1"]);
  });

  it("a draft already in My posts logs nothing", () => {
    ls().setItem(`content-studio-drafts-${UID}`, JSON.stringify([post({ id: "claude-a1" })]));
    ls().setItem(`content-studio-mcpdraft-claude-a1-${UID}`, row("claude-a1"));
    loadDrafts(UID);
    expect(loadActivity(UID, ["2026-10"])).toEqual([]);
  });
});

// phase 7a's data-shapes pins, taken before drafts gained set, versions, score, live and the Zernio outbox: what the
// store keeps, trims, copies and writes today, byte for byte
describe("pins before phase 7a's fields and the outbox", () => {
  const ls = () => (globalThis as unknown as { window: { localStorage: MemStorage } }).window.localStorage;
  const keys = () => Array.from({ length: ls().length }, (_, i) => ls().key(i)).sort();
  const KEPT = {
    metrics: { impressions: 900, reactions: 12 },
    labels: ["format:text"],
    storyboard: { beats: [], script: "Script", madeAt: "2026-10-01T00:00:00.000Z" },
    zernio: { key: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", postId: "67000000000000000000d001", status: "scheduled", at: "2026-10-15T01:00:00.000Z" },
    media: "https://drive.example.com/reel.mp4",
    attached: ["cimg-a"],
    source: { key: "top:grace-koh-instagram-C931K2DSgnl", kind: "top-post" as const, author: "@gracedotc0m", remixedAt: "2026-10-08T02:00:00.000Z" },
    remix: { keep: "structure", as: "post", close: "balanced" },
    agent: { thread: "t1a2b", msg: "m3c4d" },
    thread: { network: "threads" as const, posts: ["One", "Two"] },
    titles: ["A title"],
    cover: "A cover",
    lang: "zh" as const,
    translationOf: { id: "english-1", key: "48-abc123", at: "2026-10-21T10:00:00.000Z" },
    back: ["Meaning."],
    sameP: 0.82,
    hookFormula: "number-reveal",
  };
  const WHEN = { status: "scheduled" as const, scheduledFor: "2026-10-15T09:00" };

  it("upsertDraft keeps every field it keeps today, in this order, when an edit leaves them all out", () => {
    saveDrafts(UID, [post({ id: "other" }), post({ ...WHEN, ...KEPT })]);
    upsertDraft(UID, post({ ...WHEN, draft: "Edited in Write" }));
    const { metrics, labels, storyboard, zernio, media, attached, source, remix, agent, thread, titles, cover, lang, translationOf, back, sameP, hookFormula } = KEPT;
    expect(ls().getItem(`content-studio-drafts-${UID}`)).toBe(
      JSON.stringify([
        { ...post({ ...WHEN, draft: "Edited in Write" }), metrics, labels, storyboard, zernio, media, attached, source, remix, agent, thread, titles, cover, lang, translationOf, back, sameP, hookFormula },
        post({ id: "other" }),
      ]),
    );
    expect(keys()).toEqual([`content-studio-drafts-${UID}`]);
  });

  it("saveDrafts keeps the first 150 and drops the rest, newest first", () => {
    const list = Array.from({ length: MAX_DRAFTS + 2 }, (_, i) => post({ id: `p${i}` }));
    saveDrafts(UID, list);
    expect(ls().getItem(`content-studio-drafts-${UID}`)).toBe(JSON.stringify(list.slice(0, MAX_DRAFTS)));
    upsertDraft(UID, post({ id: "new" }));
    expect(loadDrafts(UID).map((d) => d.id)).toEqual(["new", ...list.slice(0, MAX_DRAFTS - 1).map((d) => d.id)]);
  });

  it("duplicateDraft's copy drops only the schedule, posting record, repeat, numbers and Zernio link", () => {
    saveDrafts(UID, [post({ id: "o", ...WHEN, postedAt: "2026-10-15T01:00:00.000Z", repeat: { every: "week", start: "2026-10-15" }, ...KEPT })]);
    const { copy } = duplicateDraft(UID, "o")!;
    const { metrics: _m, zernio: _z, ...rest } = KEPT;
    expect(JSON.stringify({ ...copy, id: "copy" })).toBe(
      JSON.stringify({ ...post({ id: "copy", status: "draft", ...rest }), createdAt: "2026-10-08T02:00:00.000Z", hook: "Weekly tip (copy)" }),
    );
  });

  it("saveDrafts with no Zernio link writes the list and nothing else, moves and deletes included", () => {
    saveDrafts(UID, [post({ ...WHEN }), post({ id: "b", ...WHEN })]);
    setDraftStatus(UID, "s", "scheduled", "2026-10-16T09:00");
    setDraftStatus(UID, "b", "draft");
    deleteDraft(UID, "s");
    expect(ls().getItem(`content-studio-drafts-${UID}`)).toBe(JSON.stringify([post({ id: "b", status: "draft" })]));
    expect(keys()).toEqual([`content-studio-drafts-${UID}`]);
  });
});

describe("phase 7a's draft fields", () => {
  const set = { id: "vs1", kind: "versions" as const, from: "own:abc" };
  const versions = { linkedin: { caption: "For LinkedIn", linkedin: { poll: { question: "Which?", options: ["A", "B"], days: 7 as const } } }, instagram: { instagram: { placement: "reel" as const, shareToFeed: true } } };
  const score = { v: 7.8, down: ["cta" as const], key: "4-abc", at: "2026-10-08T02:00:00.000Z" };
  const live = { postId: "m1", platform: "instagram", url: "https://www.instagram.com/p/abc/", by: "you" as const };
  const zernio = { key: "k", postId: "67000000000000000000d001", status: "published", platforms: ["tiktok", "instagram"], drafts: ["tiktok"] };
  const numbers = { impressions: 900, reach: 800, views: 1000, likes: 40, comments: 3, shares: 2, saves: 5 };

  it("each survives a save, a reload and an edit that leaves it out", () => {
    upsertDraft(UID, post({ set, versions, score, live, zernio }));
    expect(JSON.parse(JSON.stringify(loadDrafts(UID)))[0]).toMatchObject({ set, versions, score, live, zernio });
    upsertDraft(UID, post({ hook: "New title, same post" }));
    expect(loadDrafts(UID)[0]).toMatchObject({ hook: "New title, same post", set, versions, score, live, zernio });
    upsertDraft(UID, post({ id: "plain" }));
    upsertDraft(UID, post({ id: "plain", draft: "Edited" }));
    expect(Object.keys(JSON.parse(JSON.stringify(loadDrafts(UID)))[0]).filter((k) => ["set", "versions", "score", "live"].includes(k))).toEqual([]);
  });

  it("set and versions are kept when a writer leaves them out, and a writer that sets them, even to undefined, wins", () => {
    upsertDraft(UID, post({ set, versions }));
    upsertDraft(UID, post({ draft: "Edited" }));
    expect(loadDrafts(UID)[0]).toMatchObject({ set, versions });
    upsertDraft(UID, post({ set: undefined, versions: { tiktok: { caption: "Only TikTok" } } }));
    expect(loadDrafts(UID)[0].set).toBeUndefined();
    expect(loadDrafts(UID)[0].versions).toEqual({ tiktok: { caption: "Only TikTok" } });
  });

  it("the score stays while the text and platform are the same, and goes once either changes", () => {
    upsertDraft(UID, post({ score }));
    upsertDraft(UID, post({ hook: "Only the title changed" }));
    expect(loadDrafts(UID)[0].score).toEqual(score);
    upsertDraft(UID, post({ draft: "A new body" }));
    expect(loadDrafts(UID)[0]).not.toHaveProperty("score");
    upsertDraft(UID, post({ score }));
    upsertDraft(UID, post({ platform: "instagram" }));
    expect(loadDrafts(UID)[0]).not.toHaveProperty("score");
    upsertDraft(UID, post({ score }));
    upsertDraft(UID, post({ draft: "Rescored body", score: { ...score, v: 8.4 } }));
    expect(loadDrafts(UID)[0].score).toEqual({ ...score, v: 8.4 });
  });

  it("a copy drops live and the set and keeps the versions and the score", () => {
    saveDrafts(UID, [post({ id: "o", set, versions, score, live, zernio })]);
    const { copy } = duplicateDraft(UID, "o")!;
    for (const k of ["set", "live", "zernio"]) expect(copy).not.toHaveProperty(k);
    expect(copy).toMatchObject({ versions, score });
  });

  it("setDraftNumbers writes onto a hand-linked post's live link, and onto zernio for a Zernio post", () => {
    saveDrafts(UID, [post({ id: "hand", live }), post({ id: "app", zernio }), post({ id: "plain" })]);
    const at = "2026-10-08T02:00:00.000Z";
    const after = setDraftNumbers(UID, new Map([["hand", numbers], ["app", numbers], ["plain", numbers]]), at);
    expect(after[0].live).toEqual({ ...live, numbers: { ...numbers, at } });
    expect(after[1].zernio).toEqual({ ...zernio, numbers: { ...numbers, at } });
    expect(after[2]).toEqual(post({ id: "plain" }));
    expect(loadDrafts(UID)).toEqual(after);
  });
});

describe("the Zernio outbox from My posts' own actions (phase 7 decision 6)", () => {
  const ls = () => (globalThis as unknown as { window: { localStorage: MemStorage } }).window.localStorage;
  const POST_ID = "67000000000000000000d001";
  const link = { key: "k", postId: POST_ID, status: "scheduled", at: "2026-10-15T01:00:00.000Z" };
  const held = (extra: Partial<DraftEntry> = {}) => post({ status: "scheduled", scheduledFor: "2026-10-15T09:00", zernio: link, ...extra });
  const ops = () => loadOutbox(UID).ops.map((o) => ({ postId: o.postId, op: o.op, ...(o.at ? { at: o.at } : {}) }));

  it("a move queues one op and its Undo drops it", () => {
    const original = held();
    saveDrafts(UID, [original, post({ id: "other" })]);
    setDraftStatus(UID, "s", "scheduled", "2026-10-16T19:30");
    expect(ops()).toEqual([{ postId: POST_ID, op: "move", at: "2026-10-16T19:30:00+08:00" }]);
    restoreDraft(UID, original);
    expect(ops()).toEqual([]);
  });

  it("Back in drafts queues one cancel and keeps the link until it goes through; its Undo drops the cancel", () => {
    const original = held();
    saveDrafts(UID, [original]);
    const [d] = setDraftStatus(UID, "s", "draft");
    expect(d.zernio).toEqual(link);
    expect(ops()).toEqual([{ postId: POST_ID, op: "cancel" }]);
    restoreDraft(UID, original);
    expect(ops()).toEqual([]);
  });

  it("deleting a post Zernio holds queues one cancel; deleting any other post queues nothing", () => {
    saveDrafts(UID, [held(), post({ id: "plain", status: "scheduled", scheduledFor: "2026-10-15T09:00" }), held({ id: "sent", zernio: { ...link, postId: "67000000000000000000d002", status: "published" } })]);
    deleteDraft(UID, "plain");
    deleteDraft(UID, "sent");
    expect(ops()).toEqual([]);
    deleteDraft(UID, "s");
    expect(ops()).toEqual([{ postId: POST_ID, op: "cancel" }]);
  });

  it("deleting a post whose Zernio post failed queues one cancel, so it comes off Zernio; a partly posted one queues nothing (live-p7a-post D5)", () => {
    const failed = { ...link, status: "failed", error: "TikTok refused it." };
    saveDrafts(UID, [held({ zernio: failed }), held({ id: "part", zernio: { ...link, postId: "67000000000000000000d003", status: "partial" } })]);
    deleteDraft(UID, "part");
    expect(ops()).toEqual([]);
    deleteDraft(UID, "s");
    expect(ops()).toEqual([{ postId: POST_ID, op: "cancel" }]);
  });

  it("an edit in Write that keeps the time, and a cloudSync pull that moves it, queue nothing; this device's move then does", async () => {
    saveDrafts(UID, [held()]);
    upsertDraft(UID, held({ draft: "Edited in Write" }));
    ls().setItem("cs-sync-meta", JSON.stringify({ [`content-studio-drafts-${UID}`]: "2026-10-08T01:00:00.000Z" }));
    const pulled = JSON.stringify([held({ draft: "Moved on the phone", scheduledFor: "2026-10-16T09:00" })]);
    const sync = createCloudSync(UID, ls(), {
      pull: async () => ({ data: [{ key: `content-studio-drafts-${UID}`, data: pulled, updated_at: "2026-10-08T03:00:00.000Z" }], error: null }),
      upsert: async () => ({ error: null }),
      remove: async () => ({ error: null }),
    });
    await sync.start();
    expect(ls().getItem(`content-studio-drafts-${UID}`)).toBe(pulled);
    expect(ls().getItem(`content-studio-zernio-outbox-${UID}`)).toBeNull();
    await sync.stop();
    setDraftStatus(UID, "s", "scheduled", "2026-10-17T09:00");
    expect(ops()).toEqual([{ postId: POST_ID, op: "move", at: "2026-10-17T09:00:00+08:00" }]);
  });

  it("the trim keeps every post Zernio holds before any other and queues nothing, a CSV import of 5 too", () => {
    const full = Array.from({ length: MAX_DRAFTS }, (_, i) => (i === MAX_DRAFTS - 1 ? held({ id: "held" }) : post({ id: `p${i}` })));
    saveDrafts(UID, full);
    upsertDraft(UID, post({ id: "new" }));
    let ids = loadDrafts(UID).map((d) => d.id);
    expect(ids).toHaveLength(MAX_DRAFTS);
    expect(ids).toContain("held");
    expect(ids).not.toContain(`p${MAX_DRAFTS - 2}`);
    saveDrafts(UID, [...Array.from({ length: 5 }, (_, i) => post({ id: `csv${i}` })), ...loadDrafts(UID)]);
    ids = loadDrafts(UID).map((d) => d.id);
    expect(ids.slice(0, 5)).toEqual(["csv0", "csv1", "csv2", "csv3", "csv4"]);
    expect(ids[MAX_DRAFTS - 1]).toBe("held");
    expect(ls().getItem(`content-studio-zernio-outbox-${UID}`)).toBeNull();
    // only held posts: the oldest goes after all, and still queues nothing
    const all = Array.from({ length: MAX_DRAFTS + 1 }, (_, i) => held({ id: `h${i}`, zernio: { ...link, postId: `67000000000000000000${String(i).padStart(4, "0")}` } }));
    saveDrafts(UID, all);
    expect(loadDrafts(UID).map((d) => d.id)).toEqual(all.slice(0, MAX_DRAFTS).map((d) => d.id));
    expect(ls().getItem(`content-studio-zernio-outbox-${UID}`)).toBeNull();
  });

  it("a draft Claude saved, absorbed into a full list, never pushes out a post Zernio holds", () => {
    const full = Array.from({ length: MAX_DRAFTS }, (_, i) => (i === MAX_DRAFTS - 1 ? held({ id: "held" }) : post({ id: `p${i}` })));
    saveDrafts(UID, full);
    ls().setItem(`content-studio-mcpdraft-claude-a1-${UID}`, JSON.stringify({ id: "claude-a1", createdAt: "2026-10-08T03:00:00.000Z", hook: "From Claude", draft: "Body" }));
    const ids = loadDrafts(UID).map((d) => d.id);
    expect(ids[0]).toBe("claude-a1");
    expect(ids).toContain("held");
    expect(ids).not.toContain(`p${MAX_DRAFTS - 2}`);
  });

  it("a duplicate into a full list hands back what the cap pushed out, never a held post", () => {
    const full = Array.from({ length: MAX_DRAFTS }, (_, i) => (i === MAX_DRAFTS - 1 ? held({ id: "held" }) : post({ id: `p${i}` })));
    saveDrafts(UID, full);
    const r = duplicateDraft(UID, "p0")!;
    expect(r.dropped.map((d) => d.id)).toEqual([`p${MAX_DRAFTS - 2}`]);
    expect(r.drafts.map((d) => d.id)).toContain("held");
    expect(undoDuplicate(UID, r.copy.id, r.dropped).map((d) => d.id).sort()).toEqual(full.map((d) => d.id).sort());
  });

  it("once Zernio has cancelled a post, its link is stripped on the next save, so an Undo can't bring the auto-post back", () => {
    const original = held();
    saveDrafts(UID, [original]);
    deleteDraft(UID, "s");
    settleOutbox(UID, loadOutbox(UID).ops, [], [POST_ID]);
    const back = saveDrafts(UID, [original]);
    expect(back[0]).not.toHaveProperty("zernio");
    expect(loadDrafts(UID)[0]).toEqual({ ...original, zernio: undefined });
    expect(loadDrafts(UID)[0]).not.toHaveProperty("zernio");
    expect(ops()).toEqual([]);
  });
});
