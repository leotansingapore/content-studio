import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabase: { functions: { invoke: vi.fn() } } }));

import inspiration from "@/data/inspiration.json";
import { ADS } from "./adsSwipe";
import { saveDrafts, type DraftEntry } from "./draftHistory";
import { saveFollowing, type FollowedAccount } from "./following";
import { addProfile, setActiveProfile } from "./profiles";
import { rememberClone, type CloneResponse } from "./reelClone";
import { rememberSource, sourceKey } from "./remixSource";
import { REMIX_LINKS_PREFIX, resolveSource, type LinkedSource } from "./resolveSource";
import { getAllTopPosts } from "./topPosts";
import { TRENDS } from "./trends";

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

beforeEach(() => {
  const storage = new MemStorage();
  // following.ts reads the bare global, the rest window.localStorage; the seen registry is per tab
  vi.stubGlobal("window", { localStorage: storage, sessionStorage: new MemStorage() });
  vi.stubGlobal("localStorage", storage);
});
afterEach(() => vi.unstubAllGlobals());

describe("resolveSource", () => {
  it("reads the data drops: top posts, ads, trends and inspiration", () => {
    const post = getAllTopPosts()[0];
    expect(resolveSource(sourceKey.top(post.advisorId, post.shortCode), UID)).toMatchObject({
      key: `top:${post.advisorId}-${post.shortCode}`, kind: "top-post", platform: "instagram", remixedAt: "",
    });
    expect(resolveSource(sourceKey.ad(ADS[0].adId), UID)).toMatchObject({ kind: "ad", author: ADS[0].advertiser });
    expect(resolveSource(sourceKey.trend(TRENDS[0].id), UID)).toMatchObject({ kind: "trend", title: TRENDS[0].title.slice(0, 120) });
    const item = (inspiration as { id: string }[])[0];
    expect(resolveSource(sourceKey.insp(item.id), UID)).toMatchObject({ key: `insp:${item.id}`, kind: "inspiration" });
  });

  it("reads this brand's Following, recent clones and drafts", () => {
    const account: FollowedAccount = {
      platform: "tiktok", handle: "rival", addedAt: "", history: [], seen: [], fresh: [],
      posts: [{ id: "7682935406396001567", url: "https://www.tiktok.com/@rival/video/7682935406396001567", format: "carousel", caption: "Three myths", postedAt: null, views: 900, likes: 40, comments: 2 }],
    };
    saveFollowing(UID, [account]);
    // Your market's posts come in as follow:<platform>:<postId> too
    expect(resolveSource("follow:tiktok:7682935406396001567", UID)).toMatchObject({ kind: "follow", author: "@rival", format: "carousel" });
    expect(resolveSource("follow:instagram:7682935406396001567", UID)).toBeNull();

    const result = {
      source: { platform: "instagram", postId: "C9x", url: "https://www.instagram.com/reel/C9x/", author: "mrbrown", caption: "Stop", transcript: null,
        isVideo: true, postedAt: null, durationSec: 30, metrics: null, metricsAsOf: null },
      breakdown: { hook: "h", beats: ["a", "b"], payoff: "p", cta: "c", whyItWorked: "w" },
      myVersion: { hook: "x", script: "s", caption: "c", cta: "c", filmingNotes: "" },
      cached: false, usage: null,
    } as unknown as CloneResponse;
    rememberClone(UID, { id: "instagram:C9x", savedAt: "x", result });
    expect(resolveSource("clone:instagram:C9x", UID)).toMatchObject({ kind: "clone", author: "@mrbrown", teardown: { hook: "h" } });

    const d: DraftEntry = { id: "d1", createdAt: "2026-10-01T00:00:00.000Z", hook: "My best post", draft: "Body", pillar: "topic", pillarDetail: "",
      audience: "general", format: "text-post", platform: "linkedin", ctaType: "dm-keyword" };
    saveDrafts(UID, [d]);
    expect(resolveSource("own:d1", UID)).toMatchObject({ kind: "own", title: "My best post" });
  });

  it("reads pasted links from their store without the read text, and audit keys from the seen registry", () => {
    const linked: LinkedSource = { key: "link:youtube:abc", kind: "link", platform: "youtube", format: "video", remixedAt: "", text: "t".repeat(2000) };
    window.localStorage.setItem(REMIX_LINKS_PREFIX + UID, JSON.stringify([linked]));
    const s = resolveSource("link:youtube:abc", UID);
    expect(s).toMatchObject({ key: "link:youtube:abc", kind: "link" });
    expect(s).not.toHaveProperty("text");

    expect(resolveSource("audit:instagram:C9y", UID)).toBeNull();
    rememberSource({ key: "audit:instagram:C9y", kind: "own", remixedAt: "2026-10-01T00:00:00.000Z" }, UID);
    expect(resolveSource("audit:instagram:C9y", UID)).toMatchObject({ kind: "own", remixedAt: "" });
    rememberSource({ key: "hubtrend:h1", kind: "trend", title: "Rate cuts", remixedAt: "" }, UID);
    expect(resolveSource("hubtrend:h1", UID)).toMatchObject({ kind: "trend", title: "Rate cuts" });
  });

  it("reads the seen registry only for audit and hub trend keys, and only this brand's", () => {
    // a snapshot of another brand's draft never stands in for this brand's own data
    rememberSource({ key: "own:A1", kind: "own", caption: "Brand A's post", remixedAt: "" }, UID);
    expect(resolveSource("own:A1", UID)).toBeNull();
    const ad = ADS[0];
    rememberSource({ key: sourceKey.ad(ad.adId), kind: "ad", author: "Stale snapshot", remixedAt: "" }, UID);
    expect(resolveSource(sourceKey.ad(ad.adId), UID)).toMatchObject({ author: ad.advertiser });

    rememberSource({ key: "audit:instagram:A2", kind: "own", remixedAt: "" }, UID);
    setActiveProfile(UID, addProfile(UID, "MoneyBees").id);
    expect(resolveSource("audit:instagram:A2", UID)).toBeNull();
  });

  it("returns null for an unknown, rotated-out or pattern key", () => {
    expect(resolveSource("nope", UID)).toBeNull();
    expect(resolveSource("top:grace-koh-instagram-NOTAPOST", UID)).toBeNull();
    expect(resolveSource("ad:0", UID)).toBeNull();
    expect(resolveSource("own:missing", UID)).toBeNull();
    rememberSource({ key: "pattern:instagram:mrbrown:1", kind: "pattern", remixedAt: "" }, UID);
    expect(resolveSource("pattern:instagram:mrbrown:1", UID)).toBeNull();
  });
});
