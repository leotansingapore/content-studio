import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_MIX, candidatesOf, emptyReason, cleanMix, deckDay, keyAction, loadBlitz, pickDeck, rememberUsed, saveBlitz, sourceChip, spread, usedKeys, whyLine,
  type BlitzMix, type Pools,
} from "./blitz";
import { links } from "./links";
import type { AdLike } from "./adsSwipe";
import type { FormatTrend } from "./formatTrends";
import type { Winner } from "./winners";
import type { DraftEntry } from "./draftHistory";

class MemStorage {
  s = new Map<string, string>();
  get length() { return this.s.size; }
  key(i: number) { return [...this.s.keys()][i] ?? null; }
  getItem(k: string) { return this.s.get(k) ?? null; }
  setItem(k: string, v: string) { this.s.set(k, v); }
  removeItem(k: string) { this.s.delete(k); }
}

const NOW = new Date("2026-11-11T10:00:00.000Z");
const ad = (i: number, days: number): { ad: AdLike } => ({
  ad: { adId: `a${i}`, advertiser: `Rival ${"ABCDEFGHIJKL"[i]}`, format: "image", headline: `Ad ${i}`, body: "Body", cta: null, link: null, start: new Date(NOW.getTime() - days * 86_400_000).toISOString().slice(0, 10), platforms: [], image: "", libraryUrl: "", industry: null, hookFamily: null } as AdLike,
});
const trend = (i: number, kind: FormatTrend["kind"], views: number): FormatTrend => ({
  id: `tiktok-${i}`, kind, url: `https://www.tiktok.com/@t${i}/video/${i}`, author: `t${i}`, caption: "", views, likes: 10, slides: kind === "slideshow" ? 5 : null, cover: "", hook: `Hook ${i}`, structure: ["one"], postedAt: "2026-11-01", fit: 0.8,
});
const winner = (i: number, ratio: number): Winner => ({
  draft: { id: `d${i}`, createdAt: "2026-11-01T00:00:00Z", hook: `Winner ${i}`, draft: "Words", pillar: "topic", pillarDetail: "", audience: "general", format: "text-post", platform: "linkedin", ctaType: "x" } as DraftEntry,
  network: "linkedin", engagements: 50, usual: 10, ratio,
});
const pools = (o: Partial<Pools> = {}): Pools => ({
  ads: Array.from({ length: 12 }, (_, i) => ad(i, 10 + i)),
  trends: Array.from({ length: 12 }, (_, i) => trend(i, i % 2 ? "wall-of-text" : "slideshow", 1000 * (i + 1))),
  winners: Array.from({ length: 6 }, (_, i) => winner(i, 2 + i)),
  ideas: [],
  ...o,
});
const mix = (o: Partial<BlitzMix> = {}): BlitzMix => ({ ...DEFAULT_MIX, remix: 100, ...o });

describe("the deck", () => {
  it("holds at most 10 cards, from up to 30 candidates", () => {
    const deck = pickDeck(pools(), mix(), new Set(), { now: NOW.getTime() });
    expect(deck).toHaveLength(10);
    expect(new Set(deck.map((c) => c.source?.key)).size).toBe(10);
    expect(deck.every((c) => c.state === "waiting")).toBe(true);
  });

  it("follows the content mix and takes turns over the sources switched on, best outlier first", () => {
    const deck = pickDeck(pools(), mix({ slideshow: 70 }), new Set(), { now: NOW.getTime() });
    expect(deck.filter((c) => c.format === "slideshow")).toHaveLength(7);
    // ads, trends, winners in turn; each kind's best first (the longest-running ad, the most viewed trend, the biggest winner)
    expect(deck.slice(0, 3).map((c) => c.source?.kind)).toEqual(["ad", "format", "own"]);
    expect(deck[0].source?.key).toBe("ad:a11");
    expect(deck[2].source?.numbers?.ratio).toBe(7);
    const adsOnly = pickDeck(pools(), mix({ sources: { ads: true, trends: false, winners: false } }), new Set(), { now: NOW.getTime() });
    expect(adsOnly.every((c) => c.source?.kind === "ad")).toBe(true);
  });

  it("remixes a trending format in its own format when one fits", () => {
    // every slideshow trend outranks every wall one, so best-first alone would put slideshows on the wall slots
    const trends = Array.from({ length: 12 }, (_, i) => trend(i, i < 6 ? "slideshow" : "wall-of-text", i < 6 ? 10_000 + i : i));
    const deck = pickDeck(pools({ ads: [], winners: [], trends }), mix({ slideshow: 50 }), new Set(), { now: NOW.getTime() });
    for (const c of deck) expect(c.source?.caption?.startsWith(c.format === "wall" ? "TikTok wall of text" : "TikTok slideshow"), c.source?.key).toBe(true);
  });

  it("writes the remix ratio's other share from your ideas, and either side fills in when the other runs dry", () => {
    const ideas = Array.from({ length: 8 }, (_, i) => ({ title: `Idea ${i}`, angle: `Angle ${i}`, from: "Idea Dump, Mon 3 Nov" }));
    const half = pickDeck(pools({ ideas }), mix({ remix: 50 }), new Set(), { now: NOW.getTime() });
    expect(half.filter((c) => !c.source)).toHaveLength(5);
    expect(half.find((c) => !c.source)).toMatchObject({ topic: { title: "Idea 0", angle: "Angle 0" }, why: "From Idea Dump, Mon 3 Nov. Written fresh, not remixed." });
    // no ideas: all from sources; no sources: all from ideas
    expect(pickDeck(pools(), mix({ remix: 0 }), new Set(), { now: NOW.getTime() }).every((c) => c.source)).toBe(true);
    expect(pickDeck(pools({ ads: [], trends: [], winners: [], ideas }), mix(), new Set(), { now: NOW.getTime() })).toHaveLength(8);
    expect(pickDeck(pools({ ads: [], trends: [], winners: [] }), mix(), new Set(), { now: NOW.getTime() })).toEqual([]);
  });

  it("leaves out sources used in the last 14 days", () => {
    const used = new Set(pickDeck(pools(), mix(), new Set(), { now: NOW.getTime() }).map((c) => c.source!.key));
    const next = pickDeck(pools(), mix(), used, { now: NOW.getTime() });
    expect(next.length).toBe(10);
    expect(next.some((c) => used.has(c.source!.key))).toBe(false);
  });

  it("deals from trends alone, and brings a used source back only when the deck would be short", () => {
    const only = pools({ ads: [], winners: [], trends: Array.from({ length: 9 }, (_, i) => trend(i, "slideshow", 100 + i)) });
    const first = pickDeck(only, mix({ remix: 50 }), new Set(), { now: NOW.getTime() });
    expect(first).toHaveLength(9);
    const used = new Set(first.slice(0, 6).map((c) => c.source!.key));
    const next = pickDeck(only, mix(), used, { now: NOW.getTime() });
    // the 3 fresh ones first, then the used ones
    expect(next).toHaveLength(9);
    expect(next.slice(0, 3).some((c) => used.has(c.source!.key))).toBe(false);
    expect(next.slice(3).every((c) => used.has(c.source!.key))).toBe(true);
  });

  it("draws slideshows from your Media at the own-media share, and only when Media has pictures", () => {
    const deck = pickDeck(pools(), mix({ slideshow: 100, own: 30 }), new Set(), { media: true, now: NOW.getTime() });
    expect(deck.filter((c) => c.pictures === "mine")).toHaveLength(3);
    expect(pickDeck(pools(), mix({ slideshow: 100, own: 100 }), new Set(), { now: NOW.getTime() }).every((c) => c.pictures === "stock")).toBe(true);
  });

  it("spreads a share evenly", () => {
    expect(spread(10, 50)).toEqual([false, true, false, true, false, true, false, true, false, true]);
    expect(spread(4, 0).some(Boolean)).toBe(false);
    expect(spread(4, 100).every(Boolean)).toBe(true);
  });
});

describe("why this", () => {
  const digits = (t: string) => t.match(/\d+(\.\d+)?/g) ?? [];

  it("uses the source's own days, views or ratio and no number it was not given", () => {
    const [a] = candidatesOf({ ads: [ad(1, 32)], trends: [], winners: [] }, NOW.getTime());
    expect(whyLine(a.source)).toBe("Rival B has run this ad for 32 days. Same hook, your topic.");
    expect(digits(whyLine({ ...a.source, numbers: {} }))).toEqual([]);
    expect(whyLine({ ...a.source, numbers: { daysRunning: 1 } })).toContain("for 1 day.");
    const [t] = candidatesOf({ ads: [], trends: [trend(1, "slideshow", 380_800)], winners: [] });
    expect(whyLine(t.source)).toBe("380.8K views on TikTok, 10 likes. Same shape, your topic.");
    const [w] = candidatesOf({ ads: [], trends: [], winners: [winner(1, 3.4)] });
    expect(whyLine(w.source)).toBe("Your post did 3.4x your usual. Same idea, new words.");
    expect(digits(whyLine({ ...w.source, numbers: undefined }))).toEqual([]);
  });

  it("names the source on its chip", () => {
    const [a] = candidatesOf({ ads: [ad(1, 32)], trends: [], winners: [] }, NOW.getTime());
    expect(sourceChip({ source: a.source })).toBe("From Rival B's ad");
    expect(sourceChip({ source: null })).toBe("From your ideas");
  });
});

describe("nothing to deal", () => {
  const none = { competitors: 0, ads: 0, trends: 0, winners: 0, ideas: 0 };

  it("names what is actually missing, never a competitor that is already tracked", () => {
    expect(emptyReason(none, DEFAULT_MIX)).toEqual({ line: "Add a competitor so Blitz has ads to remix.", action: "competitor" });
    const tracked = emptyReason({ ...none, competitors: 3 }, DEFAULT_MIX);
    expect(tracked.line).toBe("Nothing to deal today: no running ads found for your competitors, no trending formats in the latest drop, no winning posts yet and no ideas yet.");
    expect(tracked.action).toBe("ideas");
    expect(tracked.line).not.toContain("Add a competitor");
  });

  it("points at Configure when a switched-off source has something in it", () => {
    const off = emptyReason({ ...none, competitors: 2, trends: 9 }, { ...DEFAULT_MIX, sources: { ads: true, trends: false, winners: true } });
    expect(off).toEqual({ line: "Nothing to deal today: no running ads found for your competitors, no winning posts yet, no ideas yet and Trends switched off in Configure.", action: "configure" });
  });
});

describe("the keys", () => {
  const key = (k: string, target: unknown = { tagName: "BODY", closest: () => null }, mods = {}) =>
    keyAction({ key: k, altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, target, ...mods });

  it("K keeps, S skips and E edits, and never while typing, in a dialog or with a modifier", () => {
    expect([key("k"), key("S"), key("e"), key("x")]).toEqual(["keep", "skip", "edit", null]);
    expect(key("k", { tagName: "INPUT", closest: () => null })).toBeNull();
    expect(key("k", { tagName: "TEXTAREA", closest: () => null })).toBeNull();
    expect(key("k", { tagName: "DIV", isContentEditable: true, closest: () => null })).toBeNull();
    expect(key("k", { tagName: "BUTTON", closest: (s: string) => (s.includes("dialog") ? {} : null) })).toBeNull();
    expect(key("k", undefined, { metaKey: true })).toBeNull();
  });
});

describe("the store", () => {
  let local: MemStorage;
  beforeEach(() => {
    local = new MemStorage();
    vi.stubGlobal("localStorage", local);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("keeps today's deck, drops another day's cards and keeps its mix", () => {
    const m = mix({ slideshow: 30 });
    saveBlitz("u1", { day: deckDay(NOW), mix: m, cards: [{ id: "c1", format: "wall", source: null, why: "", state: "new" }] });
    expect(loadBlitz("u1", NOW).cards).toHaveLength(1);
    const tomorrow = new Date(NOW.getTime() + 86_400_000);
    expect(loadBlitz("u1", tomorrow)).toMatchObject({ day: deckDay(tomorrow), cards: [], mix: { slideshow: 30 } });
    // the day turns at 8am Singapore time, with the caps
    expect(deckDay(new Date("2026-11-11T23:59:00.000Z"))).toBe("2026-11-11");
    expect(deckDay(new Date("2026-11-12T00:00:00.000Z"))).toBe("2026-11-12");
  });

  it("remembers used sources for 14 days on this device", () => {
    rememberUsed("u1", ["ad:a1"], NOW);
    expect(usedKeys("u1", new Date(NOW.getTime() + 13 * 86_400_000)).has("ad:a1")).toBe(true);
    expect(usedKeys("u1", new Date(NOW.getTime() + 15 * 86_400_000)).has("ad:a1")).toBe(false);
  });

  it("reads a damaged mix as the defaults", () => {
    expect(cleanMix({ slideshow: 140, remix: "x", mood: "neon", sources: { ads: false } })).toEqual({ ...DEFAULT_MIX, slideshow: 100, sources: { ads: false, trends: true, winners: true } });
  });
});

it("links a card and Configure", () => {
  expect(links.blitz()).toBe("/blitz");
  expect(links.blitz({ card: "bz-1" })).toBe("/blitz?card=bz-1");
  expect(links.blitz({ configure: true })).toBe("/blitz?configure=1");
});
