import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabase: { functions: { invoke: vi.fn() } }, SUPABASE_URL: "", SUPABASE_ANON_KEY: "" }));

import { ADS } from "./adsSwipe";
import { splitDraftIntoSlides } from "./carousel";
import { saveDrafts, type DraftEntry } from "./draftHistory";
import { carouselDraftText, defaultOutput, fullText, intentsFor, platformFor, whatRemixDoes } from "./remix";
import { fromAd, fromDraft, fromFollowPost, fromTopPost, fromTrend, sourceKey, type RemixSource } from "./remixSource";
import { REMIX_LINKS_PREFIX } from "./resolveSource";
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
  const local = new MemStorage();
  vi.stubGlobal("window", { localStorage: local, sessionStorage: new MemStorage() });
  vi.stubGlobal("localStorage", local);
});
afterEach(() => vi.unstubAllGlobals());

const src = (extra: Partial<RemixSource>): RemixSource => ({ key: "top:x-y", kind: "top-post", remixedAt: "", ...extra });

describe("fullText", () => {
  it("reads a top post's whole caption, past the 400 the snapshot keeps", () => {
    const post = getAllTopPosts().find((p) => p.caption.length > 600)!;
    const s = fromTopPost(post, { id: post.advisorId, name: post.advisorName, handle: post.handle });
    expect(s.caption!.length).toBeLessThanOrEqual(400);
    expect(fullText(s, UID)).toBe(post.caption.trim());
  });

  it("reads an ad's headline, body and call to action", () => {
    const ad = ADS.find((a) => a.headline && a.cta && a.body.length > 300)!;
    expect(fullText(fromAd(ad), UID)).toBe([ad.headline, ad.body, ad.cta].map((x) => x!.trim()).join("\n\n"));
  });

  it("reads a trend's kit: why it works, its hooks and talking points", () => {
    const t = TRENDS.find((x) => x.hooks?.length && x.talking_points?.length)!;
    const text = fullText(fromTrend(t), UID);
    for (const part of [t.why_it_works, ...t.hooks!, ...t.talking_points!]) expect(text).toContain(part.trim());
  });

  it("reads a followed post, an own draft and a pasted link, capped at 2000", () => {
    const long = "word ".repeat(600).trim();
    localStorage.setItem(`content-studio-following-${UID}`, JSON.stringify([{ platform: "instagram", handle: "mrbrown", addedAt: "", history: [], posts: [{ id: "p1", caption: long, url: "https://instagram.com/p/x", likes: 1, comments: 1, format: "image" }], seen: [], fresh: [] }]));
    const follow = fromFollowPost({ platform: "instagram", handle: "mrbrown" }, { id: "p1", caption: long, url: "https://instagram.com/p/x", likes: 1, comments: 1, format: "image" } as never);
    expect(fullText(follow, UID)).toBe(long.slice(0, 2000));

    const d: DraftEntry = { id: "d1", createdAt: "2026-10-01T00:00:00Z", hook: "H", draft: "My whole post\n\nwith two parts", pillar: "topic", pillarDetail: "", audience: "general", format: "text-post", platform: "linkedin", ctaType: "dm-keyword" };
    saveDrafts(UID, [d]);
    expect(fullText(fromDraft(d), UID)).toBe("My whole post\n\nwith two parts");

    localStorage.setItem(REMIX_LINKS_PREFIX + UID, JSON.stringify([{ key: "link:tiktok:1", kind: "link", remixedAt: "", text: "The transcript" }]));
    expect(fullText(src({ key: "link:tiktok:1", kind: "link", caption: "short" }), UID)).toBe("The transcript");
  });

  it("falls back to the snapshot when the device no longer has the original", () => {
    expect(fullText(src({ key: sourceKey.ad("gone"), kind: "ad", caption: "The kept caption", title: "T" }), UID)).toBe("The kept caption");
    expect(fullText(src({ key: "hubtrend:h1", kind: "trend", title: "Only a title" }), UID)).toBe("Only a title");
  });
});

describe("defaultOutput", () => {
  it("maps video, carousel, image and text", () => {
    expect(defaultOutput(src({ format: "video" }))).toBe("script");
    expect(defaultOutput(src({ format: "carousel" }))).toBe("carousel");
    expect(defaultOutput(src({ format: "image" }))).toBe("post");
    expect(defaultOutput(src({ format: "text" }))).toBe("post");
    expect(defaultOutput(src({}))).toBe("post");
  });
});

describe("intentsFor (shared with the server)", () => {
  it("gives each kind of card its own chips", () => {
    expect(intentsFor(src({ key: "ad:1", kind: "ad", format: "video" }))).toEqual(["structure", "hook", "energy", "topic"]);
    expect(intentsFor(src({ key: "trend:t", kind: "trend", format: "text" }))).toEqual(["structure", "hook", "topic"]);
    expect(intentsFor(src({ key: "own:d1", kind: "own", format: "carousel" }))).toEqual(["structure", "hook", "topic", "part2"]);
    expect(intentsFor(src({ key: "follow:instagram:1", kind: "follow", format: "video" }))).toEqual(["structure", "hook", "energy", "topic", "react"]);
  });
});

describe("platformFor", () => {
  it("puts a script on the short-video app and the rest on the adviser's main one", () => {
    expect(platformFor(src({ platform: "tiktok" }), "script", { platform: "linkedin" })).toBe("tiktok");
    expect(platformFor(src({ platform: "instagram" }), "script", { platform: "linkedin" })).toBe("instagram");
    expect(platformFor(src({ platform: "instagram" }), "script", { platform: "tiktok" })).toBe("tiktok");
    expect(platformFor(src({}), "carousel", { platform: "linkedin" })).toBe("linkedin");
    expect(platformFor(src({}), "carousel", { platform: "facebook" })).toBe("instagram");
    expect(platformFor(src({}), "post", { platform: "facebook" })).toBe("facebook");
    expect(platformFor(src({}), "post", { platform: "tiktok" })).toBe("instagram");
  });
});

describe("carouselDraftText", () => {
  it("splits back into the cover, one slide per point and the CTA", () => {
    for (const n of [4, 8]) {
      const slides = Array.from({ length: n }, (_, i) => ({ title: `Point ${i + 1} about CPF`, body: `Why point ${i + 1} matters for you.` }));
      const split = splitDraftIntoSlides(carouselDraftText("Five CPF checks", slides, "Save this for your next review"), { hook: "Five CPF checks" });
      expect(split.slides).toHaveLength(n + 2);
      expect(split.ctaFromDraft).toBe(true);
      expect(split.dropped).toBe(0);
      expect(split.slides[1].title).toContain("Point 1");
    }
  });
});

describe("whatRemixDoes", () => {
  const reel = src({ format: "video", platform: "instagram" });
  const ctx = { brand: "MoneyBees", hasVoice: true, teardownCached: true };

  it("says what it does from the choices", () => {
    expect(whatRemixDoes(reel, { keep: "structure", as: ["script"], close: "balanced" }, ctx)).toBe(
      "Reads this reel, keeps its structure and writes a script and shot list for MoneyBees in your voice, with new words. You see it before anything posts.",
    );
    expect(whatRemixDoes(src({ kind: "ad", key: "ad:1" }), { keep: "topic", about: "CPF", as: ["post"], close: "loose" }, { ...ctx, hasVoice: false })).toBe(
      "Reads this ad, moves it to CPF and writes a text post for MoneyBees in a plain voice, loosely based on it. You see it before anything posts.",
    );
  });

  it("never says 'writes' twice for React to it and Part 2", () => {
    expect(whatRemixDoes(reel, { keep: "react", as: ["script"], close: "balanced" }, ctx)).toBe(
      "Reads this reel, reacts to it and writes a script and shot list for MoneyBees in your voice, with new words. You see it before anything posts.",
    );
    expect(whatRemixDoes(src({ kind: "own", key: "own:d1", format: "text" }), { keep: "part2", as: ["post"], close: "balanced" }, ctx)).toBe(
      "Reads this post, follows it with a part 2 and writes a text post for MoneyBees in your voice, with new words. You see it before anything posts.",
    );
  });

  it("names the breakdown only when it still has to run, and joins several formats", () => {
    expect(whatRemixDoes(reel, { keep: "hook", as: ["post", "carousel", "speaking"], close: "close" }, { ...ctx, teardownCached: false })).toBe(
      "Reads this reel, breaks it down, keeps its hook and writes a text post, a carousel and a video of you saying it for MoneyBees in your voice, close to it, with every line new. You see it before anything posts.",
    );
  });
});
