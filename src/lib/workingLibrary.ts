// What's working (/working): TikTok photo slideshows that beat their creator's usual views, copied in from Volume
// (tryvolume.app) with its founders' permission into cs_working_slideshows (supabase/hub/032) and the public
// cs-working bucket (<id>/<n>.webp). This file holds what the page reads: the filters as URL params, the query they
// make, the niche names, the save rate and the prompt an agent rebuilds a format from.

import { PAGE_SIZE, compact, likeTerm, multipleLabel, type Query } from "@/lib/carouselLibrary";
import { scoped } from "@/lib/profiles";
import { supabase } from "@/lib/supabase";

export const SORTS = [
  { value: "working", label: "Working now" },
  { value: "views", label: "Most views" },
  { value: "saves", label: "Most saved" },
] as const;
export type Sort = (typeof SORTS)[number]["value"];

export interface Filters {
  q: string;
  niche: string;
  sort: Sort;
}

const NICHE = /^[a-z_]{1,40}$/;

export function filtersFrom(params: URLSearchParams): Filters {
  const sort = params.get("sort");
  const niche = params.get("niche") ?? "";
  return {
    q: (params.get("q") ?? "").trim().slice(0, 100),
    niche: NICHE.test(niche) ? niche : "",
    sort: SORTS.some((s) => s.value === sort) ? (sort as Sort) : "working",
  };
}

/** ?pages=: how many pages Show more has opened, so Back from a slideshow comes back to the same list. */
export const MAX_PAGES = 40;
export const pagesFrom = (params: URLSearchParams): number => Math.min(MAX_PAGES, Math.max(1, Math.floor(Number(params.get("pages"))) || 1));

/**
 * The rows to fetch for `pages` pages of the list `key` (search, niche and sort), given the list last asked for: only
 * the next page after a Show more, else every page from the top (arriving on ?pages=3 from Back). null for a new
 * search, niche or sort while ?pages= is past 1: it starts again at the first page.
 */
export function pageFetch(asked: { key: string; pages: number }, key: string, pages: number): { from: number; to: number; more: boolean } | null {
  if (asked.key && asked.key !== key && pages > 1) return null;
  const more = asked.key === key && asked.pages === pages - 1;
  return { from: more ? (pages - 1) * PAGE_SIZE : 0, to: pages * PAGE_SIZE - 1, more };
}

/** The builder calls the filters use, so the query is tested without a network. */
export type WorkingQuery<Self> = Pick<Query<Self>, "eq" | "order"> & { like(col: string, pattern: string): Self };

/**
 * The search, the niche and the sort on the query; the id last, so a page boundary never repeats or skips a row.
 * search is lower-cased by the importer, so a lower-cased term with like (not ilike) matches it; ratio nulls go last.
 */
export function applyFilters<Q extends WorkingQuery<Q>>(query: Q, f: Filters): Q {
  let q = query;
  if (f.q.trim()) q = q.like("search", likeTerm(f.q));
  if (f.niche) q = q.eq("niche", f.niche);
  if (f.sort === "working") q = q.order("working_now", { ascending: false }).order("ratio", { ascending: false, nullsFirst: false });
  else q = q.order(f.sort === "views" ? "views" : "saves", { ascending: false });
  return q.order("id", { ascending: true });
}

export const TABLE = "cs_working_slideshows";
export const CARD_COLUMNS = "id, url, author, niche, format, slides, ratio, views, saves, working_now";
export const DETAIL_COLUMNS = `${CARD_COLUMNS}, followers, hook, hook_text, structure, caption, summary, slide_text, likes, shares, posted_at`;

export interface WorkingCard {
  id: string;
  url: string;
  author: string;
  niche: string;
  format: string | null;
  slides: number;
  ratio: number | null;
  views: number;
  saves: number;
  working_now: boolean;
}

export interface WorkingRow extends WorkingCard {
  followers: number | null;
  hook: string | null;
  hook_text: string;
  structure: string | null;
  caption: string;
  summary: string;
  slide_text: string[];
  likes: number;
  shares: number;
  posted_at: string | null;
}

/** Volume's names for its niches, read off its /working chips on 1 Nov 2026. */
const NICHE_NAMES: Record<string, string> = {
  business_marketing: "Business and marketing",
  nutrition: "Food and nutrition",
  self_improvement: "Self-improvement",
  ai_tools: "AI tools",
  tech: "Apps and tech",
  language: "Language learning",
  mental_health: "Mental health",
  skincare: "Skincare and beauty",
  home_garden: "Home and garden",
  gaming: "Gaming and collectibles",
  creative: "Photography and design",
};

/** A niche's name: Volume's where it differs from the slug, else "ai_tools" style slugs read as "AI tools". */
export function nicheLabel(slug: string): string {
  if (NICHE_NAMES[slug]) return NICHE_NAMES[slug];
  if (!NICHE.test(slug)) return slug.replace(/_/g, " ");
  const words = slug.split("_").filter(Boolean).map((w) => (w === "ai" ? "AI" : w));
  const text = words.join(" ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Volume's names for its formats, hook kinds and structures, where the slug alone reads badly. */
const TAG_NAMES: Record<string, string> = {
  classic_tiktok: "Classic text",
  item_per_slide: "One item per slide",
  story_photos: "Story in photos",
  tweet_style: "Tweet style",
  story_pov: "Story or POV",
  how_to: "How-to",
  before_after: "Before and after",
};
/** A format, hook kind or structure slug as words: "bold_captions" is "Bold captions". */
export function tagLabel(slug: string | null | undefined): string {
  if (!slug) return "";
  if (TAG_NAMES[slug]) return TAG_NAMES[slug];
  const text = slug.replace(/_/g, " ").trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Each niche with its slideshows, most first; the same count goes by name. */
export function countNiches(rows: { niche: string }[]): { niche: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.niche, (counts.get(r.niche) ?? 0) + 1);
  return [...counts].map(([niche, count]) => ({ niche, count })).sort((a, b) => b.count - a.count || nicheLabel(a.niche).localeCompare(nicheLabel(b.niche)));
}

// shortcut: reads every row's niche (about 4 requests at 3,500 rows); a grouped view or RPC past ~20k
const MAX_COUNT_ROWS = 20_000;

/** Each niche with its slideshows, most first (only the working-now ones with `now`); none when the table is missing. */
export async function loadNiches(now = false): Promise<{ niche: string; count: number }[]> {
  const all: { niche: string }[] = [];
  // advances by what came back, so a server row cap below 1000 still counts every row
  while (all.length < MAX_COUNT_ROWS) {
    const q = supabase.from(TABLE).select("niche");
    const { data: rows, error } = await (now ? q.eq("working_now", true) : q).order("id").range(all.length, all.length + 999);
    if (error || !rows?.length) break;
    all.push(...(rows as { niche: string }[]));
  }
  return countNiches(all);
}

/** Design's Working right now row keeps its niche per brand ("" for All), synced; "" when unset or unreadable. */
const NOW_NICHE_PREFIX = "content-studio-working-now-niche-";
export function loadNowNiche(userId: string): string {
  try {
    const n = localStorage.getItem(NOW_NICHE_PREFIX + scoped(userId)) ?? "";
    return NICHE.test(n) ? n : "";
  } catch {
    return "";
  }
}
/** All is stored as "", never removed: the sync has no tombstones and would bring a removed key back. */
export function saveNowNiche(userId: string, niche: string): void {
  try {
    localStorage.setItem(NOW_NICHE_PREFIX + scoped(userId), niche);
  } catch {
    // storage blocked (private mode): the choice lasts this visit only
  }
}

/** Saves per view, or null with no views. */
export const saveRate = (saves: number, views: number): number | null => (views > 0 ? saves / views : null);
/** "3.4%", "" with no views. */
export function saveRateLabel(saves: number, views: number): string {
  const r = saveRate(saves, views);
  return r === null ? "" : `${(r * 100).toFixed(1)}%`;
}

/** The table isn't on this database yet (032 not applied): the page reads that as an empty library. */
export const missingTable = (error: { code?: string } | null | undefined) => ["PGRST205", "42P01"].includes(error?.code ?? "");

/** A slide's address in the public cs-working bucket, n from 1 (no request: the client builds it). */
export const slideUrl = (id: string, n: number) => supabase.storage.from("cs-working").getPublicUrl(`${id}/${n}.webp`).data.publicUrl;

const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();

/** What the format is, in a few lines: the agent prompt and Make one like this both start from these. */
export function formatLines(r: Pick<WorkingRow, "slides" | "format" | "niche" | "hook" | "hook_text" | "structure" | "summary">): string[] {
  const hookText = oneLine(r.hook_text);
  return [
    `A ${r.slides}-slide TikTok photo slideshow${r.format ? ` (${tagLabel(r.format).toLowerCase()})` : ""} in ${nicheLabel(r.niche)}.`,
    (r.hook || hookText) && `Hook: ${[tagLabel(r.hook).toLowerCase(), hookText && `the cover reads "${hookText}"`].filter(Boolean).join(", ")}.`,
    r.structure && `Structure: ${tagLabel(r.structure).toLowerCase()}.`,
    oneLine(r.summary) && `What it says: ${oneLine(r.summary)}`,
  ].filter((l): l is string => Boolean(l));
}

/** A short prompt for Claude (or any agent) to rebuild this format for the user's own brand. */
export function agentPrompt(r: WorkingRow): string {
  const rate = saveRateLabel(r.saves, r.views);
  const proof = [`${compact(r.views)} views`, rate && `${rate} saved`].filter(Boolean).join(", ");
  return [
    "Rebuild this TikTok slideshow format for my brand.",
    "",
    ...formatLines(r),
    r.ratio !== null ? `It got ${multipleLabel(r.ratio)} @${r.author}'s usual views (${proof}).` : `It got ${proof}.`,
    `Original: ${r.url}`,
    "",
    `Keep the hook type, the structure and the ${r.slides} slides. Write new words for my brand and my audience, never the original's. Give me the text for each slide and a caption.`,
  ].join("\n");
}
