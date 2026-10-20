import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// a follow's first check never reaches the network: it stays running for the whole test
vi.mock("@/lib/edgeFn", () => ({ callFn: vi.fn(() => new Promise(() => {})) }));

import { callFn } from "@/lib/edgeFn";
import {
  MAX_FOLLOWED, applyCheck, checkCapped, checkFailure, followAccount, followStats, isChecking, loadFollowing, remixUrl, runCheck, saveFollowing,
  type FollowedAccount, type TrackedPost,
} from "@/lib/following";

const post = (id: string, day: number, extra: Partial<TrackedPost> = {}): TrackedPost => ({
  id, url: `https://www.instagram.com/p/${id}/`, format: "video", caption: "Most people buy insurance backwards. Here's why.",
  postedAt: `2026-10-${String(day).padStart(2, "0")}T10:00:00Z`, views: 100, likes: 5, comments: 1, ...extra,
});
const base: FollowedAccount = { platform: "instagram", handle: "acct", addedAt: "2026-09-01T00:00:00Z", history: [], posts: [], seen: [], fresh: [] };
const check = (at: string, followers: number, posts: TrackedPost[]) => ({
  platform: "instagram" as const, handle: "acct", name: "Acct", url: "https://www.instagram.com/acct/", followers, postsCount: 10, posts, checkedAt: at,
});

describe("following", () => {
  it("marks nothing new on the first check, then only posts not seen before", () => {
    const a1 = applyCheck(base, check("2026-10-01T09:00:00Z", 1000, [post("a", 1), post("b", 2)]));
    expect(a1.fresh).toEqual([]);
    const a2 = applyCheck(a1, check("2026-10-03T09:00:00Z", 1040, [post("c", 3), post("a", 1)]));
    expect(a2.fresh).toEqual(["c"]);
    expect(a2.seen).toEqual(expect.arrayContaining(["a", "b", "c"]));
    expect(a2.history.map((s) => s.followers)).toEqual([1000, 1040]);
  });

  it("keeps one snapshot a day, the latest", () => {
    const a1 = applyCheck(base, check("2026-10-01T09:00:00Z", 1000, []));
    const a2 = applyCheck(a1, check("2026-10-01T18:00:00Z", 1010, []));
    expect(a2.history).toEqual([{ at: "2026-10-01T18:00:00Z", followers: 1010 }]);
  });

  it("works out growth over 30 days, posting pace and the best post", () => {
    const a = { ...base, checkedAt: "x", history: [
      { at: "2026-08-20T00:00:00Z", followers: 500 },
      { at: "2026-09-10T00:00:00Z", followers: 900 },
      { at: "2026-10-08T00:00:00Z", followers: 1000 },
    ], posts: [post("a", 1, { views: 50 }), post("b", 4, { views: 900 }), post("c", 7, { views: null, likes: 40, comments: 2 })] };
    const s = followStats(a, Date.parse("2026-10-08T00:00:00Z"));
    expect(s.followers).toBe(1000);
    expect(s.growth).toBe(100);
    expect(s.growthDays).toBe(28);
    expect(s.perWeek).toBe(3);
    expect(s.best?.id).toBe("b");
    expect(followStats({ ...a, history: [a.history[2]] }, Date.parse("2026-10-08T00:00:00Z")).growth).toBeNull();
  });

  it("sends a video to Clone a reel and anything else to Write with a no-copy brief", () => {
    expect(remixUrl(base, post("a", 1))).toBe("/clone?url=https%3A%2F%2Fwww.instagram.com%2Fp%2Fa%2F");
    const url = remixUrl(base, post("b", 1, { format: "carousel" }));
    const p = new URLSearchParams(url.split("?")[1]);
    expect(url.startsWith("/generate?")).toBe(true);
    expect(p.get("detail")).toBe("Most people buy insurance backwards");
    expect(p.get("ctx")).toContain("Do not copy its wording");
    expect(p.get("source")).toBe("follow:instagram:b");
    // a video goes to Clone a reel, whose draft gets a clone: key
    expect(remixUrl(base, post("a", 1))).not.toContain("source=");
  });
});

describe("followAccount", () => {
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.mocked(callFn).mockClear();
  });

  it("adds a normalised handle and starts its first check", () => {
    expect(followAccount("u1", "instagram", "https://www.instagram.com/SeanTalksSG/")).toBe("added");
    expect(loadFollowing("u1").map((a) => `${a.platform}:${a.handle}`)).toEqual(["instagram:seantalkssg"]);
    expect(isChecking({ platform: "instagram", handle: "seantalkssg" })).toBe(true);
    expect(callFn).toHaveBeenCalledWith("track-accounts", { platform: "instagram", handle: "seantalkssg" }, expect.any(String));
  });

  it("adds nothing for an account already followed, in any spelling", () => {
    followAccount("u1", "tiktok", "@moneyfox");
    expect(followAccount("u1", "tiktok", "https://www.tiktok.com/@MoneyFox")).toBe("already");
    expect(loadFollowing("u1")).toHaveLength(1);
    expect(callFn).toHaveBeenCalledTimes(1);
  });

  it("stops at five accounts and stores nothing more", () => {
    for (let i = 0; i < MAX_FOLLOWED; i++) expect(followAccount("u1", "instagram", `acct${i}`)).toBe("added");
    const before = store.get("content-studio-following-u1");
    expect(followAccount("u1", "instagram", "one_more")).toBe("full");
    expect(store.get("content-studio-following-u1")).toBe(before);
    expect(loadFollowing("u1")).toHaveLength(MAX_FOLLOWED);
  });

  it("stores nothing for a name that is not an account", () => {
    expect(followAccount("u1", "instagram", "not a handle!")).toBe("invalid");
    expect(followAccount("u1", "instagram", "https://www.instagram.com/explore/")).toBe("invalid");
    expect(store.size).toBe(0);
    expect(callFn).not.toHaveBeenCalled();
  });
});

describe("a check running outside React", () => {
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.mocked(callFn).mockReset().mockImplementation(() => new Promise(() => {}));
  });
  const acct = (handle: string): FollowedAccount => ({ ...base, handle });
  const result = (handle: string, followers: number) => ({ ...check("2026-10-05T09:00:00Z", followers, [post("p1", 4)]), handle });

  it("leaves an account removed while its check ran removed, and keeps one added meanwhile", async () => {
    const answers: ((v: unknown) => void)[] = [];
    vi.mocked(callFn).mockImplementation(() => new Promise((r) => answers.push(r)));
    saveFollowing("u1", [acct("gone_one"), acct("kept_one")]);
    const checks = [runCheck("u1", acct("gone_one")), runCheck("u1", acct("kept_one"))];
    saveFollowing("u1", [acct("kept_one"), acct("new_one")]);
    answers[0](result("gone_one", 500));
    answers[1](result("kept_one", 800));
    await Promise.all(checks);
    const list = loadFollowing("u1");
    expect(list.map((a) => a.handle)).toEqual(["kept_one", "new_one"]);
    expect(list[0].history.map((h) => h.followers)).toEqual([800]);
  });

  it("keeps the account as it was when the check is refused, and says it can run again after 8am only for today's limit", async () => {
    saveFollowing("u1", [acct("capped_one")]);
    const before = store.get("content-studio-following-u1");
    vi.mocked(callFn).mockRejectedValueOnce(Object.assign(new Error("You've used all 20 checks for today. It resets at 8am Singapore time."), { code: "daily_limit" }));
    await runCheck("u1", acct("capped_one"));
    expect(store.get("content-studio-following-u1")).toBe(before);
    expect(isChecking(acct("capped_one"))).toBe(false);
    expect(checkFailure(acct("capped_one"))).toMatch(/resets at 8am/);
    expect(checkCapped(acct("capped_one"))).toBe(true);
    vi.mocked(callFn).mockRejectedValueOnce(Object.assign(new Error("Couldn't check that account right now."), { code: "failed" }));
    await runCheck("u1", acct("capped_one"));
    expect(checkCapped(acct("capped_one"))).toBe(false);
  });
});
