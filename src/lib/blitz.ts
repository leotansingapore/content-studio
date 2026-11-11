// Blitz (/blitz, Leo's sign-ins only; docs/north-star/items/plan-blitz.md): a deck of up to 10 ready drafts a day,
// after Fastlane's Studio > Blitz (11 Nov walk). This file is the deck's rules and its store; blitzJob.ts makes the
// cards outside React. Each card is one run of an existing maker on the remix-make cap: a slideshow (slideshowJob)
// or a wall of text's words (the wall maker's own make call). Sources are the brand's rivals' ads, this week's
// format drop and its own winners, best outlier first within each; Configure sets the mix the way Fastlane's does.
//   synced: content-studio-blitz-${scoped(userId)}: today's deck (the UTC day, when the caps reset) and the mix.
//   device: cs-blitz-used-${scoped(userId)}: source key -> the day a deck used it, so 14 days never repeat one.

import { fromAd, fromDraft, fromFormatTrend, sourceNoun, type RemixSource } from "@/lib/remixSource";
import { PHOTO_MOOD_IDS, type PhotoMood } from "@/lib/slideshowJob";
import { scoped } from "@/lib/profiles";
import type { FormatTrend } from "@/lib/formatTrends";
import type { AdLike } from "@/lib/adsSwipe";
import type { Winner } from "@/lib/winners";

export type BlitzFormat = "slideshow" | "wall";
export type BlitzSourceKind = "ads" | "trends" | "winners";
export const SOURCE_KINDS: BlitzSourceKind[] = ["ads", "trends", "winners"];
export const SOURCE_LABELS: Record<BlitzSourceKind, string> = { ads: "Rivals' ads", trends: "Trends", winners: "Your winners" };
export const FORMAT_LABELS: Record<BlitzFormat, string> = { slideshow: "Slideshow", wall: "Wall of text" };

export const DECK_SIZE = 10;
export const USED_DAYS = 14;

/** Configure: Fastlane's settings that our two makers have an option for. */
export interface BlitzMix {
  /** Where the remixed cards come from (Change mix). */
  sources: Record<BlitzSourceKind, boolean>;
  /** Content mix: the share of slideshows, 0 to 100; walls of text are the rest. */
  slideshow: number;
  /** Remix ratio: the share remixed from a source, 0 to 100; the rest are written from your ideas (/ideas). */
  remix: number;
  /** Own-media mix: the share of slideshows drawn from your Media, 0 to 100; the rest take stock photos. */
  own: number;
  /** Slide rules: every slide's picture from one mood (the slideshow maker's photo mood), "" for one per point. */
  mood: PhotoMood | "";
}

export const DEFAULT_MIX: BlitzMix = { sources: { ads: true, trends: true, winners: true }, slideshow: 50, remix: 50, own: 50, mood: "" };

export type CardState = "waiting" | "making" | "new" | "kept" | "skipped" | "failed";

export interface BlitzCard {
  id: string;
  format: BlitzFormat;
  /** null: written from `topic`, one of your ideas. */
  source: RemixSource | null;
  topic?: { title: string; angle: string };
  why: string;
  /** Slideshows: where the pictures come from. */
  pictures?: "stock" | "mine";
  state: CardState;
  /** A made slideshow (src/lib/slideshow.ts). */
  showId?: string;
  /** A made wall of text's words. */
  wall?: { text: string; caption: string };
  /** The My posts entry a kept card became. */
  draftId?: string;
  error?: string;
}

export interface BlitzState {
  day: string;
  mix: BlitzMix;
  cards: BlitzCard[];
  /** The day's remixes ran out mid-deck: the deck holds only what it made. */
  capped?: boolean;
}

export const FAILED_LINE = "Couldn't make this one.";
export const CAPPED_LINE = "Today's remixes are used up. More at 8am Singapore time.";
export const NO_SOURCES_LINE = "Add a competitor so Blitz has ads to remix.";

/** The deck's day: the UTC date, so it turns over at 8am Singapore time with the daily caps. */
export const deckDay = (now = new Date()) => now.toISOString().slice(0, 10);

// ---- the store ----

const KEY = "content-studio-blitz-";
const USED = "cs-blitz-used-";
const CHANGED = "content-studio-blitz-changed";
export const blitzKey = (userId: string) => KEY + scoped(userId);

const pct = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(100, Math.max(0, Math.round(v))) : fallback);

export function cleanMix(raw: unknown): BlitzMix {
  const m = (raw ?? {}) as Partial<BlitzMix>;
  const src = (m.sources ?? {}) as Partial<Record<BlitzSourceKind, unknown>>;
  return {
    sources: Object.fromEntries(SOURCE_KINDS.map((k) => [k, typeof src[k] === "boolean" ? src[k] : DEFAULT_MIX.sources[k]])) as BlitzMix["sources"],
    slideshow: pct(m.slideshow, DEFAULT_MIX.slideshow),
    remix: pct(m.remix, DEFAULT_MIX.remix),
    own: pct(m.own, DEFAULT_MIX.own),
    mood: PHOTO_MOOD_IDS.includes(m.mood as PhotoMood) ? (m.mood as PhotoMood) : "",
  };
}

/** What is stored, whatever its day (yesterday's deck is read once more, to clear its unreviewed slideshows). */
export function loadStored(userId: string): BlitzState | null {
  try {
    const v = JSON.parse(globalThis.localStorage?.getItem(blitzKey(userId)) ?? "null");
    if (!v || typeof v !== "object" || typeof v.day !== "string") return null;
    return { day: v.day, mix: cleanMix(v.mix), cards: Array.isArray(v.cards) ? v.cards.filter((c: BlitzCard) => c && typeof c.id === "string") : [], ...(v.capped ? { capped: true } : {}) };
  } catch {
    return null;
  }
}

/** Today's deck and the mix; another day's cards are gone, its mix stays. */
export function loadBlitz(userId: string, now = new Date()): BlitzState {
  const s = loadStored(userId);
  const day = deckDay(now);
  if (!s) return { day, mix: DEFAULT_MIX, cards: [] };
  return s.day === day ? s : { day, mix: s.mix, cards: [] };
}

export function saveBlitz(userId: string, s: BlitzState): void {
  try {
    globalThis.localStorage?.setItem(blitzKey(userId), JSON.stringify(s));
  } catch {
    // storage full or blocked: the deck still shows for this visit
  }
  globalThis.dispatchEvent?.(new Event(CHANGED));
}

export function onBlitzChanged(cb: () => void): () => void {
  globalThis.addEventListener?.(CHANGED, cb);
  return () => globalThis.removeEventListener?.(CHANGED, cb);
}

/** Changes one card of today's deck and saves; null when it is not there any more. */
export function patchCard(userId: string, id: string, patch: Partial<BlitzCard>, now = new Date()): BlitzCard | null {
  const s = loadBlitz(userId, now);
  const card = s.cards.find((c) => c.id === id);
  if (!card) return null;
  const next = { ...card, ...patch };
  saveBlitz(userId, { ...s, cards: s.cards.map((c) => (c.id === id ? next : c)) });
  return next;
}

export function saveMix(userId: string, mix: BlitzMix, now = new Date()): void {
  saveBlitz(userId, { ...loadBlitz(userId, now), mix: cleanMix(mix) });
}

/** Source keys a deck used in the last 14 days, on this device. */
export function usedKeys(userId: string, now = new Date()): Set<string> {
  try {
    const v = JSON.parse(globalThis.localStorage?.getItem(USED + scoped(userId)) ?? "{}") as Record<string, string>;
    const since = now.getTime() - USED_DAYS * 86_400_000;
    return new Set(Object.entries(v).filter(([, day]) => Date.parse(`${day}T00:00:00Z`) > since).map(([k]) => k));
  } catch {
    return new Set();
  }
}

export function rememberUsed(userId: string, keys: string[], now = new Date()): void {
  try {
    const k = USED + scoped(userId);
    const v = JSON.parse(globalThis.localStorage?.getItem(k) ?? "{}") as Record<string, string>;
    const since = now.getTime() - USED_DAYS * 86_400_000;
    const kept = Object.fromEntries(Object.entries(v).filter(([, day]) => Date.parse(`${day}T00:00:00Z`) > since));
    for (const key of keys) kept[key] = deckDay(now);
    globalThis.localStorage?.setItem(k, JSON.stringify(kept));
  } catch {
    // a hint only: the next deck may repeat a source
  }
}

// ---- picking the deck ----

export interface Candidate {
  kind: BlitzSourceKind;
  source: RemixSource;
  /** Its outlier score within its kind: days an ad has run, a trend's views, a winner's ratio. */
  score: number;
  /** A trending format remixes best in its own format. */
  prefers?: BlitzFormat;
}

export interface Idea {
  title: string;
  angle: string;
  /** "Idea Dump, Mon 20 Oct" */
  from: string;
}

export interface Pools {
  ads: { ad: AdLike }[];
  trends: FormatTrend[];
  winners: Winner[];
  ideas: Idea[];
}

/** Every candidate source, best outlier first within its kind. */
export function candidatesOf(p: Pick<Pools, "ads" | "trends" | "winners">, now = Date.now()): Candidate[] {
  const ads = p.ads.map(({ ad }): Candidate => {
    const source = fromAd(ad, now);
    const days = source.numbers?.daysRunning;
    return { kind: "ads", source, score: Number.isFinite(days) ? (days as number) : 0 };
  });
  const trends = p.trends.map((t): Candidate => ({ kind: "trends", source: fromFormatTrend(t), score: t.views, prefers: t.kind === "wall-of-text" ? "wall" : "slideshow" }));
  const winners = p.winners.map((w): Candidate => ({
    kind: "winners",
    source: { ...fromDraft(w.draft), ...(w.ratio ? { numbers: { ratio: w.ratio } } : {}) },
    score: w.ratio ?? 0,
  }));
  return [...ads, ...trends, ...winners].sort((a, b) => b.score - a.score);
}

/** `n` slots with round(n * share / 100) of them true, spread evenly. */
export function spread(n: number, share: number): boolean[] {
  const k = Math.round((n * pct(share, 0)) / 100);
  return Array.from({ length: n }, (_, i) => Math.floor(((i + 1) * k) / n) > Math.floor((i * k) / n));
}

const DAY = (n: number) => `${n} day${n === 1 ? "" : "s"}`;
const compact = (n: number) => new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);

/** Why this: one line from the source's own numbers, written in code. A number it was not given never shows. */
export function whyLine(s: RemixSource): string {
  const n = s.numbers ?? {};
  const who = s.author || "This account";
  if (s.kind === "ad") {
    const d = n.daysRunning;
    return typeof d === "number" && Number.isFinite(d) && d > 0 ? `${who} has run this ad for ${DAY(d)}. Same hook, your topic.` : `${who} is running this ad now. Same hook, your topic.`;
  }
  if (s.kind === "own") return n.ratio ? `Your post did ${n.ratio}x your usual. Same idea, new words.` : "One of your best posts lately. Same idea, new words.";
  if (n.views) return `${compact(n.views)} views on TikTok${n.likes ? `, ${compact(n.likes)} likes` : ""}. Same shape, your topic.`;
  return "Trending this week. Same shape, your topic.";
}

export const ideaWhy = (from: string) => `From ${from}. Written fresh, not remixed.`;

/** The source chip: "From Pipedrive's ad", "From your post", "From your ideas". */
export function sourceChip(c: Pick<BlitzCard, "source">): string {
  const s = c.source;
  if (!s) return "From your ideas";
  if (s.kind === "own") return "From your post";
  return s.author ? `From ${s.author}'s ${sourceNoun(s)}` : `From a trending ${sourceNoun(s)}`;
}

let seq = 0;
const cardId = () => `bz-${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

/**
 * Today's deck: up to `n` cards in the mix's formats, its remix share from the sources (round robin over the kinds
 * switched on, best outlier first in each, a trend matched to its own format when one fits) and the rest from your
 * ideas; either side fills in when the other runs dry. Sources used in the last 14 days are left out.
 */
export function pickDeck(pools: Pools, mix: BlitzMix, used: Set<string>, o: { n?: number; media?: boolean; now?: number } = {}): BlitzCard[] {
  const n = o.n ?? DECK_SIZE;
  const all = candidatesOf(pools, o.now);
  const left: Record<BlitzSourceKind, Candidate[]> = { ads: [], trends: [], winners: [] };
  for (const c of all) if (mix.sources[c.kind] && !used.has(c.source.key) && !left[c.kind].some((x) => x.source.key === c.source.key)) left[c.kind].push(c);
  const ideas = pools.ideas.filter((i) => i.title.trim() && !used.has(ideaKey(i)));
  const shows = spread(n, mix.slideshow);
  const fresh = spread(n, 100 - mix.remix);
  let turn = 0;
  const nextSource = (format: BlitzFormat): Candidate | null => {
    for (let k = 0; k < SOURCE_KINDS.length; k++) {
      const kind = SOURCE_KINDS[(turn + k) % SOURCE_KINDS.length];
      const list = left[kind];
      if (!list.length) continue;
      turn = (turn + k + 1) % SOURCE_KINDS.length;
      const i = Math.max(0, list.findIndex((c) => !c.prefers || c.prefers === format));
      return list.splice(i, 1)[0];
    }
    return null;
  };
  const cards: BlitzCard[] = [];
  for (let i = 0; i < n; i++) {
    const format: BlitzFormat = shows[i] ? "slideshow" : "wall";
    const pick = fresh[i] && ideas.length ? null : nextSource(format);
    if (pick) {
      cards.push({ id: cardId(), format, source: pick.source, why: whyLine(pick.source), state: "waiting" });
      continue;
    }
    const idea = ideas.shift();
    if (!idea) break;
    cards.push({ id: cardId(), format, source: null, topic: { title: idea.title.slice(0, 200), angle: idea.angle.slice(0, 300) }, why: ideaWhy(idea.from), state: "waiting" });
  }
  const own = spread(cards.filter((c) => c.format === "slideshow").length, o.media ? mix.own : 0);
  let s = 0;
  return cards.map((c) => (c.format === "slideshow" ? { ...c, pictures: own[s++] ? "mine" : "stock" } : c));
}

/** The key a deck remembers an idea by, so tomorrow's deck writes a different one. */
export const ideaKey = (i: Pick<Idea, "title">) => `idea:${i.title.trim().toLowerCase().slice(0, 80)}`;
export const usedKeyOf = (c: Pick<BlitzCard, "source" | "topic">) => c.source?.key ?? (c.topic ? ideaKey(c.topic) : "");

// ---- reading the deck ----

/** Cards still to review: made and not decided, or failed with Try again. */
export const openCards = (cards: BlitzCard[]) => cards.filter((c) => c.state === "new" || c.state === "failed");
export const madeCount = (cards: BlitzCard[]) => cards.filter((c) => c.state === "new" || c.state === "kept" || c.state === "skipped").length;
export const keptCount = (cards: BlitzCard[]) => cards.filter((c) => c.state === "kept").length;
export const pending = (cards: BlitzCard[]) => cards.some((c) => c.state === "waiting" || c.state === "making");

export type BlitzAction = "keep" | "skip" | "edit";
const KEYS: Record<string, BlitzAction> = { k: "keep", s: "skip", e: "edit" };

/** K, S and E on the open card; null while typing, inside a dialog, or with a modifier held (campaigns.ts keyAction's rule). */
export function keyAction(e: Pick<KeyboardEvent, "key" | "altKey" | "ctrlKey" | "metaKey" | "shiftKey"> & { target: unknown }): BlitzAction | null {
  if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return null;
  const el = e.target as { tagName?: string; isContentEditable?: boolean; closest?: (s: string) => unknown } | null;
  if (el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName ?? "") || el.isContentEditable || el.closest?.('[role="dialog"], [role="alertdialog"], dialog'))) return null;
  return KEYS[e.key.toLowerCase()] ?? null;
}
