import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { saveDrafts, upsertDraft, type DraftEntry } from "./draftHistory";
import { links, withRemix } from "./links";
import { addProfile, setActiveProfile } from "./profiles";
import {
  canCredit,
  draftLine,
  earlierRemix,
  fromAd,
  fromAuditPost,
  fromDraft,
  fromFollowPost,
  fromHubTrend,
  fromInspiration,
  fromTopPost,
  fromTrend,
  rememberSource,
  remixedKeys,
  remixedOn,
  seedNote,
  seenSources,
  sourceChip,
  sourceKey,
  sourceNoun,
  type RemixSource,
} from "./remixSource";
import type { TopPost } from "./topPosts";
import type { SwipeAd } from "./adsSwipe";
import type { TrendEntry } from "./trends";
import type { RatedPost } from "./accountAudit";
import type { InspirationEntry } from "@/components/Inspiration";
import type { HubTrend } from "./hub";

const UID = "6d80f027-3395-480c-86a1-8827d3d6cce3";
const NOW = Date.parse("2026-10-20T04:00:00Z");
const DAY = 86_400_000;

class MemStorage {
  private m = new Map<string, string>();
  get length() { return this.m.size; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
}

beforeEach(() => vi.stubGlobal("window", { localStorage: new MemStorage(), sessionStorage: new MemStorage() }));
afterEach(() => vi.unstubAllGlobals());

const draft = (id: string, extra: Partial<DraftEntry> = {}): DraftEntry => ({
  id, createdAt: new Date(NOW).toISOString(), hook: "Hook", draft: "Body", pillar: "topic", pillarDetail: "", audience: "general",
  format: "text-post", platform: "instagram", ctaType: "dm-keyword", ...extra,
});
const src = (key: string, at: number, extra: Partial<RemixSource> = {}): RemixSource =>
  ({ key, kind: "top-post", author: "@mrbrown", remixedAt: new Date(at).toISOString(), ...extra });

describe("key shapes", () => {
  it("builds one key per kind", () => {
    expect(sourceKey.top("grace-koh-instagram", "C931K-2DS")).toBe("top:grace-koh-instagram-C931K-2DS");
    expect(sourceKey.follow("instagram", "C9x")).toBe("follow:instagram:C9x");
    expect(sourceKey.ad("2095783381019179")).toBe("ad:2095783381019179");
    expect(sourceKey.clone("tiktok", "768")).toBe("clone:tiktok:768");
    expect(sourceKey.own("d1")).toBe("own:d1");
    expect(sourceKey.audit("tiktok", "768")).toBe("audit:tiktok:768");
    expect(sourceKey.trend("trend-1")).toBe("trend:trend-1");
    expect(sourceKey.hubtrend("h1")).toBe("hubtrend:h1");
    expect(sourceKey.insp("linkedin-cpf-001")).toBe("insp:linkedin-cpf-001");
    expect(sourceKey.link("meta-ad", "123")).toBe("link:meta-ad:123");
    expect(sourceKey.upload("abc123")).toBe("upload:abc123");
    expect(sourceKey.pattern("instagram", "mrbrown", 2)).toBe("pattern:instagram:mrbrown:2");
  });

  it("names the original the way the screens say it", () => {
    expect(sourceNoun({ kind: "top-post", format: "video", platform: "instagram" })).toBe("reel");
    expect(sourceNoun({ kind: "follow", format: "video", platform: "tiktok" })).toBe("video");
    // a 5-minute /watch video was called a Short (dogfood 21 Oct, IphYQzGtYyk)
    expect(sourceNoun({ kind: "link", format: "video", platform: "youtube", url: "https://www.youtube.com/watch?v=IphYQzGtYyk" })).toBe("video");
    expect(sourceNoun({ kind: "link", format: "video", platform: "youtube", url: "https://www.youtube.com/shorts/IphYQzGtYyk" })).toBe("Short");
    expect(sourceNoun({ kind: "link", format: "video", platform: "youtube" })).toBe("video");
    expect(sourceNoun({ kind: "follow", format: "carousel" })).toBe("carousel");
    expect(sourceNoun({ kind: "own", format: "text" })).toBe("post");
    expect(sourceNoun({ kind: "ad", format: "video" })).toBe("ad");
    expect(sourceNoun({ kind: "trend" })).toBe("trend");
    expect(sourceNoun({ kind: "upload", format: "video" })).toBe("upload");
  });
});

describe("snapshot builders", () => {
  const top: TopPost = {
    shortCode: "C931K2DSgnl", url: "https://www.instagram.com/p/C931K2DSgnl/", type: "Video", productType: "clips",
    likes: 249, comments: 24, views: 32696, caption: "Spend within your means!\n" + "x".repeat(600), cover: "/covers/C931K2DSgnl.jpg",
    idea: { hook: "Spend within your means", format: "Talking-head reel", why: "w".repeat(400), adapt: "a" },
  };

  it("keeps a small snapshot: caption cut to 400, title to 120, the teardown under 600, remixedAt empty", () => {
    const s = fromTopPost(top, { id: "seantalkssg-instagram", name: "Sean", handle: "@seantalkssg" });
    expect(s).toMatchObject({
      key: "top:seantalkssg-instagram-C931K2DSgnl", kind: "top-post", format: "video", platform: "instagram",
      url: "https://www.instagram.com/p/C931K2DSgnl/", author: "@seantalkssg", title: "Spend within your means!",
      cover: "/covers/C931K2DSgnl.jpg", numbers: { views: 32696, likes: 249, comments: 24 }, remixedAt: "",
    });
    expect(s.caption!.length).toBe(400);
    const t = s.teardown!;
    expect((t.hook ?? "").length + (t.structure ?? "").length + (t.why ?? "").length).toBeLessThanOrEqual(600);
    expect(JSON.stringify(s).length).toBeLessThan(1500);
  });

  it("drops a link that isn't https and never doubles the @", () => {
    const s = fromTopPost({ ...top, url: "http://www.instagram.com/p/x/", cover: "javascript:alert(1)" }, { id: "a", name: "A", handle: "@@sean" });
    expect(s.url).toBeUndefined();
    expect(s.cover).toBeUndefined();
    expect(s.author).toBe("@sean");
    expect(fromTopPost({ ...top, url: "https://user:pw@www.instagram.com/p/x/#frag" }, { id: "a", name: "A", handle: "sean" }).url).toBe(
      "https://www.instagram.com/p/x/",
    );
  });

  it("builds every other kind with its key, kind and format", () => {
    const tracked = { id: "C9x", url: "https://www.instagram.com/p/C9x/", format: "carousel" as const, caption: "Three CPF myths", postedAt: null, views: null, likes: 5, comments: 1 };
    expect(fromFollowPost({ handle: "rival", platform: "instagram" }, tracked)).toMatchObject({
      key: "follow:instagram:C9x", kind: "follow", format: "carousel", author: "@rival", remixedAt: "",
    });

    const ad: SwipeAd = {
      adId: "1", advertiser: "Singlife", industry: "Insurance", format: "video", headline: "Travel cover", body: "Plans change.",
      cta: null, link: null, start: "2026-10-10", platforms: [], image: "/ads/1.jpg", libraryUrl: "https://www.facebook.com/ads/library/?id=1", hookFamily: "Problem",
    };
    expect(fromAd(ad, NOW)).toMatchObject({
      key: "ad:1", kind: "ad", format: "video", platform: "meta-ad", author: "Singlife", title: "Travel cover",
      url: "https://www.facebook.com/ads/library/?id=1", numbers: { daysRunning: 10 }, remixedAt: "",
    });
    // a competitor's ad: no industry or hook yet, Meta's picture link expired (empty), no start date
    const theirs = fromAd({ ...ad, adId: "2", format: "text", image: "", start: null, industry: null, hookFamily: null }, NOW);
    expect(theirs).toMatchObject({ key: "ad:2", kind: "ad", format: "image", platform: "meta-ad", author: "Singlife" });
    expect(theirs).not.toHaveProperty("cover");
    expect(theirs).not.toHaveProperty("numbers");

    const trend = { id: "t1", platform: "tiktok", format: "short-video", pillar: "identity", title: "The little treat trap", why_it_works: "Tension",
      how_to_film: "", source_label: "", source_url: "https://www.tiktok.com/@x/video/1", date_found: "2026-10-11", hooks: ["", "First hook"] } as TrendEntry;
    expect(fromTrend(trend)).toMatchObject({ key: "trend:t1", kind: "trend", format: "video", teardown: { hook: "First hook", why: "Tension" }, remixedAt: "" });

    const hub = { id: "h1", niche: "", title: "Hub trend", summary_md: "Summary", angles_md: "Angles", source_urls: ["https://a.sg/x"], example_video_urls: [],
      audience_type: "all", audience_value: null, created_at: "" } as HubTrend;
    expect(fromHubTrend(hub)).toMatchObject({ key: "hubtrend:h1", kind: "trend", format: "text", url: "https://a.sg/x", remixedAt: "" });

    const insp = { id: "linkedin-001", platform: "linkedin", format: "text-only", pillar: "Authority", audience: "", topic: "CPF",
      hook: "A client asked me", content: "Body", why_it_works: "Real question", source: "", curriculum_anchor: "", tags: [] } as InspirationEntry;
    expect(fromInspiration(insp)).toMatchObject({ key: "insp:linkedin-001", kind: "inspiration", format: "text", remixedAt: "" });

    const rated = { ...tracked, id: "C9y", url: "https://www.instagram.com/p/C9y/", format: "video", postedAt: "2026-10-12T02:00:00Z", shares: null, saves: null,
      durationSec: 30, pinned: false, collab: false, interactions: 6, engagementRate: 1, ratio: 2.5, young: false } as RatedPost;
    expect(fromAuditPost(rated, "instagram", "leo.tan")).toMatchObject({
      key: "audit:instagram:C9y", kind: "own", format: "video", author: "@leo.tan", numbers: { ratio: 2.5 }, postedAt: "2026-10-12T02:00:00Z", remixedAt: "",
    });

    expect(fromDraft(draft("d1", { format: "carousel" }))).toMatchObject({ key: "own:d1", kind: "own", format: "carousel", remixedAt: "" });
  });
});

describe("the words", () => {
  it("names who and what on the chip and the draft line", () => {
    expect(sourceChip(src("top:a-1", NOW, { format: "video", platform: "instagram" }))).toBe("Remixing @mrbrown's reel");
    expect(sourceChip({ key: "ad:1", kind: "ad", author: "Singlife", remixedAt: "" })).toBe("Remixing Singlife's ad");
    expect(sourceChip({ key: "own:d", kind: "own", postedAt: "2026-10-12T02:00:00Z", remixedAt: "" })).toBe("Remixing your post from 12 Oct");
    expect(sourceChip({ key: "own:d", kind: "own", postedAt: "2026-09-12T02:00:00Z", remixedAt: "" })).toBe("Remixing your post from 12 Sep");
    expect(sourceChip({ key: "trend:t", kind: "trend", remixedAt: "" })).toBe("Remixing a trend");
    expect(sourceChip({ key: "pattern:instagram:mrbrown:1", kind: "pattern", author: "@mrbrown", remixedAt: "" })).toBe("Remixing what worked for @mrbrown");
    expect(draftLine(src("follow:instagram:1", NOW, { format: "carousel" }))).toBe("From @mrbrown's carousel");
    expect(draftLine({ key: "upload:x", kind: "upload", remixedAt: "" })).toBe("From an upload");
  });

  it("offers credit only for someone else's idea, and never for React to it", () => {
    expect(canCredit(src("top:a-1", NOW))).toBe(true);
    expect(canCredit(src("top:a-1", NOW), "react")).toBe(false);
    expect(canCredit({ key: "own:d", kind: "own", author: "@me", remixedAt: "" })).toBe(false);
    expect(canCredit({ key: "insp:1", kind: "inspiration", remixedAt: "" })).toBe(false);
  });
});

describe("remix history", () => {
  it("finds a remix from 10 days ago and ignores one from 31 days ago", () => {
    saveDrafts(UID, [
      draft("old", { source: src("top:a-1", NOW - 31 * DAY) }),
      draft("recent", { source: src("top:a-1", NOW - 10 * DAY) }),
      draft("other", { source: src("ad:9", NOW - DAY) }),
    ]);
    expect(remixedOn(UID, "top:a-1", NOW)).toEqual({ at: new Date(NOW - 10 * DAY).toISOString(), draftId: "recent" });
    saveDrafts(UID, [draft("old", { source: src("top:a-1", NOW - 31 * DAY) })]);
    expect(remixedOn(UID, "top:a-1", NOW)).toBeNull();
    expect(remixedOn(UID, "top:zzz", NOW)).toBeNull();
  });

  it("shows the repeat notice for a source not saved yet, never for a saved remix and its own versions", () => {
    const at = NOW - 5 * DAY;
    // upsertDraft puts the last save first: the LinkedIn version V sits before its main draft D
    upsertDraft(UID, draft("D", { source: src("top:a-1", at) }));
    upsertDraft(UID, draft("V", { platform: "linkedin", source: src("top:a-1", at) }));
    expect(earlierRemix(UID, src("top:a-1", at), NOW)).toBeNull();
    expect(earlierRemix(UID, { ...src("top:a-1", at), remixedAt: "" }, NOW)).toEqual({ at: new Date(at).toISOString(), draftId: "V" });
    expect(earlierRemix(UID, null, NOW)).toBeNull();
  });

  it("lists every key this brand remixed, newest date per key, and rereads only on a change", () => {
    saveDrafts(UID, [draft("a", { source: src("top:a-1", NOW - 3 * DAY) }), draft("b", { source: src("top:a-1", NOW - DAY) }), draft("c")]);
    const keys = remixedKeys(UID);
    expect([...keys]).toEqual([["top:a-1", new Date(NOW - DAY).toISOString()]]);
    expect(remixedKeys(UID)).toBe(keys);
    upsertDraft(UID, draft("d", { source: src("ad:9", NOW) }));
    expect(remixedKeys(UID).has("ad:9")).toBe(true);
  });

  it("is per brand: switching brand changes the keys", () => {
    saveDrafts(UID, [draft("a", { source: src("top:a-1", NOW) })]);
    expect(remixedKeys(UID).has("top:a-1")).toBe(true);
    const brand = addProfile(UID, "MoneyBees");
    setActiveProfile(UID, brand.id);
    expect(remixedKeys(UID).size).toBe(0);
    expect(remixedOn(UID, "top:a-1", NOW)).toBeNull();
  });
});

describe("the seen registry", () => {
  it("keeps the newest 30, one per key", () => {
    for (let i = 0; i < 35; i++) rememberSource({ key: `audit:instagram:${i}`, kind: "own", remixedAt: "" }, UID);
    rememberSource({ key: "audit:instagram:10", kind: "own", remixedAt: "" }, UID);
    const seen = seenSources(UID);
    expect(seen).toHaveLength(30);
    expect(seen[0].key).toBe("audit:instagram:10");
    expect(seen.filter((s) => s.key === "audit:instagram:10")).toHaveLength(1);
  });

  it("is per brand and per tab: nothing lands in device storage", () => {
    rememberSource({ key: "audit:instagram:1", kind: "own", remixedAt: "" }, UID);
    expect(window.localStorage.length).toBe(0);
    setActiveProfile(UID, addProfile(UID, "MoneyBees").id);
    expect(seenSources(UID)).toEqual([]);
  });
});

describe("seedNote", () => {
  it("fills an empty note with the card's suggestion and never overwrites a typed one", () => {
    seedNote("audit:instagram:1", "Angle for the new version: the receipts");
    expect(window.localStorage.getItem("cs-remix-note-audit:instagram:1")).toBe("Angle for the new version: the receipts");
    window.localStorage.setItem("cs-remix-note-audit:instagram:2", "my own note");
    seedNote("audit:instagram:2", "Angle for the new version: the receipts");
    expect(window.localStorage.getItem("cs-remix-note-audit:instagram:2")).toBe("my own note");
  });
});

describe("links", () => {
  it("carries the source into Write and opens the Remix sheet over any page", () => {
    expect(links.generate({ detail: "CPF", source: "top:a-1" })).toBe("/generate?detail=CPF&source=top%3Aa-1");
    expect(withRemix("/swipe", "top:a-1")).toBe("/swipe?remix=top%3Aa-1");
    expect(withRemix("/swipe?tab=ads", "ad:1")).toBe("/swipe?tab=ads&remix=ad%3A1");
  });
});
