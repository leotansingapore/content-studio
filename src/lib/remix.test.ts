import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabase: { functions: { invoke: vi.fn() } }, SUPABASE_URL: "", SUPABASE_ANON_KEY: "" }));

import { ADS } from "./adsSwipe";
import { splitDraftIntoSlides } from "./carousel";
import { saveDrafts, type DraftEntry } from "./draftHistory";
import {
  VIDEO_LIMITS,
  asParam,
  carouselDraftText,
  cleanAs,
  defaultOutput,
  formatsAllowed,
  fullText,
  intentsFor,
  makePrice,
  platformFor,
  remixLabel,
  tooLongLine,
  videoAsk,
  videoBlock,
  videoPrice,
  whatRemixDoes,
} from "./remix";
import { AVATAR_MAX, priceOf, priceText } from "./prices";
import { fromAd, fromDraft, fromFollowPost, fromTopPost, fromTrend, sourceKey, type RemixSource } from "./remixSource";
import { REMIX_LINKS_PREFIX, resolveSource } from "./resolveSource";
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

  // the 21 Oct dogfood's Aaron ad (2972139646506607) as Your space keeps it: the store cuts a body at 600, mid-word
  const AARON = "\"Just following up!\" \u{1F4F2}\n\nYou've sent that message more times than you'd like to count.\nBe honest about the reply rate.\n\nHere's why it does nothing.\n\n\"Just following up\" carries no new information.\nIt doesn't help the customer. It doesn't move anything.\nIt is a request \u2014 for them to do the work of remembering, re-deciding, and replying.\n\nTo them it reads as: have you decided yet?\nWhich means replying costs something, and ignoring it costs nothing. \u{1F507}\n\nSo they ignore it. Not rudely. It just never reaches the top of a list that already has forty things on it.\n\nThen you wait, feel awkward, and sen";
  const aaron = { id: "2972139646506607", format: "image", headline: "Stop saying \"just following up\" \u{1F4F2}", body: AARON, cta: "Learn more", link: null, image: null, video: null, start: "2026-10-18", end: null, active: true, platforms: ["facebook"], versions: 1, advertiser: "Sales Mentoring by Aaron", pageId: "1283526538188234" };

  it("reads a Your space ad whole from its store, not the snapshot's 400, and stops at its last whole sentence when the store cut it", () => {
    localStorage.setItem(`content-studio-space-ads-${UID}`, JSON.stringify({ checkedAt: "2026-10-20T00:00:00Z", keywords: ["sales"], ads: [aaron] }));
    const s = resolveSource(sourceKey.ad(aaron.id), UID)!;
    expect(s.caption!.endsWith("Which means replyi")).toBe(true);
    const text = fullText(s, UID);
    expect(text).toContain("Which means replying costs something, and ignoring it costs nothing.");
    expect(text.endsWith("already has forty things on it.\n\nLearn more")).toBe(true);
    expect(text.startsWith(aaron.headline)).toBe(true);
    expect(text).not.toContain("and sen");
  });

  it("keeps a body longer than the store's cap whole (the drop's ads are not cut), even when it ends without a full stop", () => {
    const body = `${"A whole sentence here. ".repeat(30)}Then a last line with no stop`;
    expect(body.length).toBeGreaterThan(600);
    localStorage.setItem(`content-studio-space-ads-${UID}`, JSON.stringify({ checkedAt: "2026-10-20T00:00:00Z", keywords: ["sales"], ads: [{ ...aaron, id: "999", body }] }));
    expect(fullText(resolveSource(sourceKey.ad("999"), UID)!, UID)).toContain("Then a last line with no stop");
  });

  it("reads a competitor's ad whole from Their ads, and keeps a body the store did not cut as it is", () => {
    const body = "Short ad with no full stop at the end";
    localStorage.setItem(`content-studio-competitor-ads-${UID}`, JSON.stringify({ c1: { checkedAt: "2026-10-20T00:00:00Z", pageName: "Apollo.io", ads: [{ ...aaron, id: "1075280991926367", body: `${"Still waiting. ".repeat(20)}${body}`, cta: "Sign up" }] } }));
    const s = resolveSource(sourceKey.ad("1075280991926367"), UID)!;
    expect(s.author).toBe("Apollo.io");
    expect(fullText(s, UID).endsWith(`${body}\n\nSign up`)).toBe(true);
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

  it("puts both videos where a script goes: the source's TikTok or the adviser's, else Instagram", () => {
    for (const as of ["speaking", "explainer"] as const) {
      expect(platformFor(src({ platform: "tiktok" }), as, { platform: "linkedin" })).toBe("tiktok");
      expect(platformFor(src({ platform: "linkedin" }), as, { platform: "linkedin" })).toBe("instagram");
      expect(platformFor(src({}), as, { platform: "tiktok" })).toBe("tiktok");
    }
  });
});

describe("the Make row", () => {
  it("adds and removes picks, never the last one, never a fourth and never a second video", () => {
    expect(formatsAllowed(["post"], "carousel")).toEqual(["post", "carousel"]);
    expect(formatsAllowed(["post", "carousel"], "post")).toEqual(["carousel"]);
    expect(formatsAllowed(["post"], "post")).toEqual(["post"]);
    expect(formatsAllowed(["post", "carousel", "script"], "speaking")).toEqual(["post", "carousel", "script"]);
    expect(formatsAllowed(["post", "speaking"], "explainer")).toEqual(["post", "speaking"]);
    expect(formatsAllowed(["post", "speaking"], "speaking")).toEqual(["post"]);
    expect(formatsAllowed(["post"], "explainer")).toEqual(["post", "explainer"]);
  });

  it("reads as= safely: no repeats, at most 3, one video, the default when empty, and leaves the default out", () => {
    expect(cleanAs([], "script")).toEqual(["script"]);
    expect(cleanAs(["post", "post", "carousel"], "script")).toEqual(["post", "carousel"]);
    expect(cleanAs(["speaking", "explainer", "post"], "script")).toEqual(["speaking", "post"]);
    expect(cleanAs(["post", "carousel", "script", "speaking"], "post")).toEqual(["post", "carousel", "script"]);
    expect(cleanAs(["slideshow", "nonsense"], "carousel")).toEqual(["carousel"]);
    expect(asParam(["script"], "script")).toEqual([]);
    expect(asParam(["post"], "script")).toEqual(["post"]);
    expect(asParam(["script", "post"], "script")).toEqual(["script", "post"]);
  });

  it("counts the picks on the button", () => {
    expect([1, 2, 3].map(remixLabel)).toEqual(["Remix", "Remix into 2 formats", "Remix into 3 formats"]);
  });

  it("prices one remix per format plus the video, from the price table only", () => {
    expect(videoPrice("post")).toBeNull();
    expect(videoPrice("speaking")).toEqual({ usd: AVATAR_MAX.usd + (priceOf("ai-voice") as { usd: number }).usd + 0.006, kind: "upTo" });
    expect(videoPrice("explainer")?.kind).toBe("about");
    const make = priceOf("remix-make") as { usd: number };
    expect(makePrice(["post", "carousel"])).toEqual({ usd: make.usd * 2, kind: "about" });
    const both = makePrice(["post", "speaking"]) as { usd: number; kind: string };
    expect(both.kind).toBe("upTo");
    expect(both.usd).toBeCloseTo(make.usd * 2 + videoPrice("speaking")!.usd, 6);
    // a source with no breakdown on the device is broken down first, once per press
    const torn = makePrice(["post", "carousel"], true) as { usd: number; kind: string };
    expect(torn.kind).toBe("about");
    expect(torn.usd).toBeCloseTo(make.usd * 2 + (priceOf("remix-teardown") as { usd: number }).usd, 6);
  });

  it("asks first for a video, with what the video part uses", () => {
    expect(videoAsk(["post", "carousel"])).toBeNull();
    expect(videoAsk(["post", "speaking"])).toBe(`This makes a video and uses ${priceText(videoPrice("speaking")!).replace("Up to", "up to")} of video credit.`);
    expect(videoAsk(["explainer"])).toMatch(/^This makes a video and uses about US\$\d+\.\d\d of video credit\.$/);
  });

  it("says why a video chip is off: another video first, then each cap it spends", () => {
    const left = (o: Partial<Record<"ai-video" | "ai-voice" | "ai-image", number | null>>) => (f: "ai-video" | "ai-voice" | "ai-image") => o[f] ?? 3;
    expect(videoBlock("speaking", { busy: true, left: left({ "ai-video": 0 }) })).toBe(VIDEO_LIMITS.busy);
    expect(videoBlock("speaking", { busy: false, left: left({ "ai-video": 0 }) })).toBe("No videos left today.");
    expect(videoBlock("explainer", { busy: false, left: left({ "ai-voice": 0 }) })).toBe(VIDEO_LIMITS.noVoices);
    expect(videoBlock("speaking", { busy: false, left: left({ "ai-image": 0 }) })).toBe(VIDEO_LIMITS.noPresenter);
    expect(videoBlock("explainer", { busy: false, left: left({ "ai-image": 0 }) })).toBeNull();
    expect(videoBlock("speaking", { busy: false, left: () => null })).toBeNull();
    // a paid avatar still waiting stops a new one, which would write over it, but not an explainer
    expect(videoBlock("speaking", { busy: false, waiting: true, left: () => null })).toBe(VIDEO_LIMITS.waiting);
    expect(videoBlock("speaking", { busy: true, waiting: true, left: () => null })).toBe(VIDEO_LIMITS.busy);
    expect(videoBlock("explainer", { busy: false, waiting: true, left: () => null })).toBeNull();
  });

  it("names a voiceover that runs too long", () => {
    expect(tooLongLine(31.4)).toBe("The script runs 31 s, over the 30-second limit. Shorten it, then try again.");
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
      "Reads this reel, breaks it down, keeps its hook and writes a text post, a carousel and a video of an AI presenter saying it for MoneyBees in your voice, close to it, with every line new. You see it before anything posts.",
    );
  });

  it("names every format pair it can make, for every source format", () => {
    const words = { post: "a text post", carousel: "a carousel", script: "a script and shot list", speaking: "a video of an AI presenter saying it", explainer: "an explainer video" };
    for (const format of ["video", "carousel", "image", "text"] as const) {
      for (const [a, b] of [["post", "carousel"], ["script", "speaking"], ["carousel", "explainer"]] as const) {
        const line = whatRemixDoes(src({ format }), { keep: "structure", as: [a, b], close: "balanced" }, ctx);
        expect(line, `${format} ${a} ${b}`).toContain(`writes ${words[a]} and ${words[b]} for MoneyBees`);
      }
    }
  });
});
