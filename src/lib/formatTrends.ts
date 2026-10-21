// Trending formats on /trends (?view=formats, Leo only; docs/north-star/items/find-trending-formats.md): the TikTok
// slideshows and walls of text the weekly format scout (scripts/format-scout.mjs) writes to src/data/formatTrends.json.
// Bundled, so nothing here calls the network. "Remix this" opens that format's own page with the post as its source
// (source=format:<id>, which resolveSource reads back from this file).

import data from "@/data/formatTrends.json";
import { links } from "@/lib/links";
import { sourceKey } from "@/lib/remixSource";

export type FormatTrendKind = "slideshow" | "wall-of-text";
export const FORMAT_TREND_KINDS: readonly FormatTrendKind[] = ["slideshow", "wall-of-text"];

export interface FormatTrend {
  /** tiktok-<post id> */
  id: string;
  kind: FormatTrendKind;
  url: string;
  author: string;
  /** At most 240 characters. Shown on the card, never sent to a remix. */
  caption: string;
  views: number;
  likes: number;
  /** null for a wall of text. */
  slides: number | null;
  /** /format-trends/<post id>.jpg */
  cover: string;
  /** The first slide's words. */
  hook: string;
  /** What each slide (or part of the text) does, never its words. */
  structure: string[];
  postedAt: string;
  /** Jev's reusable probability; null sorts last. */
  fit: number | null;
}
export interface FormatTrendsFile {
  fetched: string | null;
  items: FormatTrend[];
}

type Raw = Record<string, unknown>;
const obj = (v: unknown): v is Raw => !!v && typeof v === "object" && !Array.isArray(v);
const count = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);
const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function cleanItem(raw: unknown): FormatTrend | null {
  if (!obj(raw)) return null;
  const kind = FORMAT_TREND_KINDS.find((k) => k === raw.kind);
  const id = text(raw.id, 40);
  const url = text(raw.url, 300);
  const cover = text(raw.cover, 80);
  const structure = (Array.isArray(raw.structure) ? raw.structure : []).map((l) => text(l, 120)).filter(Boolean).slice(0, 10);
  const views = count(raw.views);
  const likes = count(raw.likes);
  const hook = text(raw.hook, 100);
  const postedAt = text(raw.postedAt, 10);
  if (!kind || !/^tiktok-\d{5,25}$/.test(id) || !/^https:\/\/www\.tiktok\.com\//.test(url) || !/^\/format-trends\/\d{5,25}\.jpg$/.test(cover)) return null;
  if (views === null || likes === null || !hook || structure.length < 2 || !DAY_RE.test(postedAt)) return null;
  const slides = count(raw.slides);
  const fit = count(raw.fit);
  return {
    id,
    kind,
    url,
    author: text(raw.author, 40).replace(/^@/, ""),
    caption: text(raw.caption, 240),
    views,
    likes,
    slides: kind === "slideshow" ? slides : null,
    cover,
    hook,
    structure,
    postedAt,
    fit: fit !== null && fit <= 1 ? fit : null,
  };
}

/** The file as bundled, rebuilt field by field: a malformed item is dropped, never shown half. */
export function cleanFormatTrends(raw: unknown): FormatTrendsFile {
  if (!obj(raw)) return { fetched: null, items: [] };
  return {
    fetched: typeof raw.fetched === "string" && DAY_RE.test(raw.fetched) ? raw.fetched : null,
    items: (Array.isArray(raw.items) ? raw.items : []).map(cleanItem).filter((i): i is FormatTrend => i !== null),
  };
}

export const FORMAT_TRENDS: FormatTrendsFile = cleanFormatTrends(data);

const STALE_DAYS = 21;

/** This week's cards: none before the first drop, or when the newest drop is over 21 days old (the scout stopped). */
export function currentFormatTrends(file: FormatTrendsFile = FORMAT_TRENDS, now = new Date()): FormatTrend[] {
  if (!file.fetched) return [];
  return now.getTime() - Date.parse(`${file.fetched}T00:00:00Z`) > STALE_DAYS * 86_400_000 ? [] : file.items;
}

export const kindCounts = (items: FormatTrend[]): Record<"all" | FormatTrendKind, number> => ({
  all: items.length,
  slideshow: items.filter((t) => t.kind === "slideshow").length,
  "wall-of-text": items.filter((t) => t.kind === "wall-of-text").length,
});

/** The card's tag: "Slideshow, 8" or "Wall of text". */
export const formatTag = (t: Pick<FormatTrend, "kind" | "slides">) => (t.kind === "wall-of-text" ? "Wall of text" : t.slides ? `Slideshow, ${t.slides}` : "Slideshow");

/** "Remix this": the format's own page with this post as its source. No go state, so nothing starts until Make. */
export const formatRemixUrl = (t: Pick<FormatTrend, "id" | "kind">) => links.makeFormat(t.kind, { source: sourceKey.format(t.id) });
