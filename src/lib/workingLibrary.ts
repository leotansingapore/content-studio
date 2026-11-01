// What's working (/working): TikTok photo slideshows that beat their creator's usual views, copied in from Volume
// (tryvolume.app) with its founders' permission into cs_working_slideshows (supabase/hub/032) and the public
// cs-working bucket (<id>/<n>.webp). This file holds what the page reads: the filters as URL params, the query they
// make, the niche names, the save rate and the prompt an agent rebuilds a format from.

import { compact, likeTerm, multipleLabel, type Query } from "@/lib/carouselLibrary";
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

/** Each niche with its slideshows, most first; the same count goes by name. */
export function countNiches(rows: { niche: string }[]): { niche: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.niche, (counts.get(r.niche) ?? 0) + 1);
  return [...counts].map(([niche, count]) => ({ niche, count })).sort((a, b) => b.count - a.count || nicheLabel(a.niche).localeCompare(nicheLabel(b.niche)));
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
    `A ${r.slides}-slide TikTok photo slideshow${r.format ? ` (${r.format})` : ""} in ${nicheLabel(r.niche)}.`,
    (r.hook || hookText) && `Hook: ${[r.hook, hookText && `the cover reads "${hookText}"`].filter(Boolean).join(", ")}.`,
    r.structure && `Structure: ${r.structure}.`,
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
