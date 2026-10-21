import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SwipeAd } from "./adsSwipe";
import type { DraftEntry } from "./draftHistory";
import type { FollowedAccount, TrackedPost } from "./following";
import { links } from "./links";
import { kindLabel, numberParts } from "@/components/OriginalPane";
import { MORE_MAX, moreLikeThis, whatChanged } from "./remixCompare";
import { fromAd, fromFollowPost, fromTopPost, sourceKey, type RemixSource } from "./remixSource";
import type { Teardown } from "./remixTeardown";
import { getAllTopPosts } from "./topPosts";

const UID = "6d80f027-3395-480c-86a1-8827d3d6cce3";

// The ads drop changes weekly: a fixed list whose order is not the running order, so the sort is what puts it right.
const ADS = vi.hoisted(() => {
  const ad = (adId: string, industry: string, start: string | null) =>
    ({ adId, advertiser: `Advertiser ${adId}`, industry, format: "image", headline: null, body: `Body ${adId}`, cta: null, link: null, start, platforms: [], image: `/ads/${adId}.jpg`, libraryUrl: `https://www.facebook.com/ads/library/?id=${adId}`, hookFamily: "question" }) as SwipeAd;
  return [
    ad("1", "Software", "2026-10-06"),
    ad("2", "Software", "2026-09-14"),
    ad("3", "Banking", "2026-01-01"),
    ad("4", "Software", null),
    ad("5", "Software", "2026-09-29"),
    ad("6", "Software", "2026-08-01"),
    ad("7", "Software", "2026-10-01"),
  ];
});
vi.mock("./adsSwipe", async (load) => ({ ...(await load<typeof import("./adsSwipe")>()), ADS }));

class MemStorage {
  private m = new Map<string, string>();
  get length() { return this.m.size; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
}

beforeEach(() => {
  const local = new MemStorage();
  // following.ts reads the bare global, profiles.ts reads window's
  vi.stubGlobal("localStorage", local);
  vi.stubGlobal("window", { localStorage: local, sessionStorage: new MemStorage() });
});
afterEach(() => vi.unstubAllGlobals());

const CAPTION = "Most people check their insurance only once a year and then forget every single detail of it.";
const source = (extra: Partial<RemixSource> = {}): RemixSource => ({
  key: "top:grace-koh-instagram-C931K",
  kind: "top-post",
  format: "video",
  platform: "instagram",
  author: "@gracekoh",
  caption: CAPTION,
  teardown: { hook: "Most people check their insurance only once a year" },
  remixedAt: "2026-10-19T04:00:00.000Z",
  ...extra,
});
const draft = (extra: Partial<DraftEntry> = {}): DraftEntry => ({
  id: "d1",
  createdAt: "2026-10-19T04:00:00.000Z",
  hook: "Hook",
  draft: "Body",
  pillar: "topic",
  pillarDetail: "",
  audience: "general",
  format: "text-post",
  platform: "instagram",
  ctaType: "dm-keyword",
  source: source(),
  ...extra,
});
const teardown = (pattern: string): Teardown => ({
  v: 1,
  key: "top:grace-koh-instagram-C931K",
  format: "video",
  hook: { line: "Most people check their insurance only once a year", pattern, formula: null },
  beats: ["a", "b", "c"],
  payoff: "",
  cta: "None",
  pacing: null,
  whyItWorked: "",
  dontReuse: [],
  basedOn: "transcript",
  at: "2026-10-19T04:00:00.000Z",
});
const NEW_TEXT = "Your cover should change when your life does. Here is what to look at this weekend.";

describe("whatChanged", () => {
  it("lists the intent and closeness labels only for a draft made in the Remix sheet", () => {
    expect(whatChanged(draft(), NEW_TEXT, null).madeWith).toBeNull();
    const made = draft({ remix: { keep: "structure", as: "post", close: "balanced" } });
    expect(whatChanged(made, NEW_TEXT, null).madeWith).toBe("Keep the structure, Balanced");
    expect(whatChanged(draft({ remix: { keep: "hook", as: "post", close: "close" } }), NEW_TEXT, null).madeWith).toBe("Keep the hook, Close");
  });

  it("drops a stored value it has no label for", () => {
    expect(whatChanged(draft({ remix: { keep: "face", as: "post", close: "balanced" } }), NEW_TEXT, null).madeWith).toBe("Balanced");
    expect(whatChanged(draft({ remix: { keep: "constructor", as: "post", close: "toString" } }), NEW_TEXT, null).madeWith).toBeNull();
  });

  it("takes the hook shape from the full teardown's pattern only, never the inline hook line", () => {
    expect(whatChanged(draft(), NEW_TEXT, null).hookShape).toBeNull();
    expect(whatChanged(draft(), NEW_TEXT, teardown("[N] signs your [thing] is [problem]")).hookShape).toBe("[N] signs your [thing] is [problem]");
    // a teardown made from a clone has no pattern
    expect(whatChanged(draft(), NEW_TEXT, teardown("")).hookShape).toBeNull();
  });

  it("finds 6 words of the caption once the text repeats them, and clears them once they are gone", () => {
    expect(whatChanged(draft(), NEW_TEXT, null).copied).toEqual([]);
    const edited = `${NEW_TEXT} Most people check their insurance only once a year.`;
    expect(whatChanged(draft(), edited, null).copied).toEqual(["Most people check their insurance only once a year"]);
    // five shared words are not a copied line
    expect(whatChanged(draft(), `${NEW_TEXT} Most people check their insurance.`, null).copied).toEqual([]);
    expect(whatChanged(draft(), NEW_TEXT, null).copied).toEqual([]);
  });

  it("merges live runs with the lines flagged when it was made, without repeats, while the text still has them", () => {
    const flagged = draft({
      remix: {
        keep: "structure",
        as: "post",
        close: "balanced",
        flags: { copied: ["most people check their insurance only once a year", "$12,000", "a line from further down the long caption"], claim: false, invented: false },
      },
    });
    const text = `${NEW_TEXT} Most people check their insurance only once a year. Save $12,000 a year.`;
    expect(whatChanged(flagged, text, null).copied).toEqual(["Most people check their insurance only once a year", "$12,000"]);
    // 12000 written another way still counts
    expect(whatChanged(flagged, `${NEW_TEXT} Save 12000 a year.`, null).copied).toEqual(["$12,000"]);
    expect(whatChanged(flagged, NEW_TEXT, null).copied).toEqual([]);
  });

  it("reads the claim flag from the time it was made", () => {
    expect(whatChanged(draft(), NEW_TEXT, null).claim).toBe(false);
    const claimed = draft({ remix: { keep: "structure", as: "post", close: "balanced", flags: { copied: [], claim: true, invented: false } } });
    expect(whatChanged(claimed, NEW_TEXT, null).claim).toBe(true);
  });

  it("works for a source saved with no caption", () => {
    expect(whatChanged(draft({ source: source({ caption: undefined }) }), NEW_TEXT, null).copied).toEqual([]);
  });
});

describe("moreLikeThis", () => {
  it("gives a top post up to 4 similar top posts, never itself", () => {
    const all = getAllTopPosts();
    const sources = all.map((p) => fromTopPost(p, { id: p.advisorId, name: p.advisorName, handle: p.handle }));
    const withMore = sources.map((s) => ({ s, more: moreLikeThis(s, UID) })).filter((x) => x.more.length > 0);
    expect(withMore.length).toBeGreaterThan(0);
    for (const { s, more } of withMore) {
      expect(more.length).toBeLessThanOrEqual(MORE_MAX);
      expect(more.map((m) => m.key)).not.toContain(s.key);
      expect(more.every((m) => m.kind === "top-post")).toBe(true);
    }
  });

  it("gives an ad the same industry's other ads, longest running first", () => {
    // no Banking ad, never the source, an unknown start last, and only 4
    expect(moreLikeThis(fromAd(ADS[0]), UID).map((m) => m.key)).toEqual(["6", "2", "5", "7"].map(sourceKey.ad));
    expect(moreLikeThis(fromAd(ADS[5]), UID).map((m) => m.key)).toEqual(["2", "5", "7", "1"].map(sourceKey.ad));
    expect(moreLikeThis(fromAd(ADS[2]), UID)).toEqual([]);
  });

  it("gives a Following post the same account's other posts, best first by views or likes plus comments", () => {
    const post = (id: string, views: number | null, likes: number, comments = 0): TrackedPost => ({ id, url: `https://www.instagram.com/p/${id}/`, format: "image", caption: `Post ${id}`, postedAt: null, views, likes, comments });
    const account: FollowedAccount = {
      platform: "instagram",
      handle: "mrbrown",
      addedAt: "2026-10-01T00:00:00.000Z",
      history: [],
      posts: [post("a", 100, 5), post("b", null, 400, 20), post("c", 9000, 1), post("d", 50, 0), post("e", 10, 0), post("f", 1, 0)],
      seen: [],
      fresh: [],
    };
    localStorage.setItem(`content-studio-following-${UID}`, JSON.stringify([account]));
    const more = moreLikeThis(fromFollowPost(account, account.posts[0]), UID);
    expect(more.map((m) => m.key)).toEqual(["c", "b", "d", "e"].map((id) => sourceKey.follow("instagram", id)));
    // a post no followed account holds any more has nothing to rank against
    expect(moreLikeThis(fromFollowPost(account, post("gone", 1, 1)), UID)).toEqual([]);
  });

  it("is empty for own posts, pasted links, uploads and the kinds with no list to rank", () => {
    for (const kind of ["own", "link", "upload", "trend", "clone", "pattern", "inspiration"] as const) {
      expect(moreLikeThis(source({ key: `${kind}:x`, kind }), UID)).toEqual([]);
    }
  });

  it("is empty for a top post that rotated out of the drop", () => {
    expect(moreLikeThis(source({ key: "top:nobody-gone" }), UID)).toEqual([]);
  });
});

describe("pane words", () => {
  it("names the kind with its platform, and the adviser's own as Your post", () => {
    expect(kindLabel({ kind: "top-post", format: "video", platform: "instagram" })).toBe("Instagram reel");
    expect(kindLabel({ kind: "ad", platform: "meta-ad" })).toBe("Meta ad");
    expect(kindLabel({ kind: "link", format: "video", platform: "youtube", url: "https://www.youtube.com/shorts/IphYQzGtYyk" })).toBe("YouTube Short");
    expect(kindLabel({ kind: "link", format: "video", platform: "youtube", url: "https://www.youtube.com/watch?v=IphYQzGtYyk" })).toBe("YouTube video");
    expect(kindLabel({ kind: "own", format: "text", platform: "linkedin" })).toBe("Your post");
    expect(kindLabel({ kind: "trend" })).toBe("Trend");
  });

  it("shows only the numbers the source has", () => {
    expect(numberParts(undefined)).toEqual([]);
    expect(numberParts({ views: 32600, likes: 249, ratio: 2.43 })).toEqual(["32.6K views", "249 likes", "2.4x their usual"]);
    expect(numberParts({ daysRunning: 1 })).toEqual(["1 day running"]);
  });
});

describe("compare links", () => {
  it("opens a tab on Write and the carousel maker, and leaves the default out", () => {
    expect(links.generate({ draft: "d1", compare: "original" })).toBe("/generate?draft=d1&compare=original");
    expect(links.carousel({ draft: "d1", compare: "more" })).toBe("/carousel?draft=d1&compare=more");
    expect(links.carousel({ carousel: "d:d1", compare: "original" })).toBe("/carousel?carousel=d%3Ad1&compare=original");
    expect(links.generate({ draft: "d1" })).toBe("/generate?draft=d1");
    expect(links.carousel({ draft: "d1" })).toBe("/carousel?draft=d1");
  });
});
