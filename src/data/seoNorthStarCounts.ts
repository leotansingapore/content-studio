// The live counts on /seo-north-star: what postmosis.com publishes today, read in Leo's browser from the site's own
// sitemap.xml and llms.txt on every load (both answer with Access-Control-Allow-Origin: *), measured against the
// competitor targets in SEO_TARGETS. A read that fails, or answers with something that is not a sitemap or an
// llms.txt, shows "not counted" (null), never a made-up 0.

import type { BookMetric } from "@/components/NorthStarBook";
import { SEO_SITE, SEO_TARGETS } from "@/data/seoNorthStar";

/** The path of every <loc> in a sitemap, or null when the text is not a sitemap. */
export function sitemapPaths(xml: string | null): string[] | null {
  if (!xml || !/<urlset[\s>]/.test(xml)) return null;
  const paths = new Set<string>();
  for (const m of xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)) {
    try {
      paths.add(new URL(m[1].replace(/&amp;/g, "&")).pathname.replace(/\/+$/, "") || "/");
    } catch {
      // a <loc> that is not a URL is not a page
    }
  }
  return [...paths];
}

/** A page one level under a section, such as /guides/<slug>; the hub itself is not counted. */
const under = (section: string) => new RegExp(`^/${section}/[^/]+$`);
const CONTENT = /^\/(guides|glossary|tools|templates|compare|vault|features|for)\/[^/]+$/;

export function seoMetrics(sitemap: string | null, llms: string | null): BookMetric[] {
  const paths = sitemapPaths(sitemap);
  const n = (re: RegExp) => (paths ? paths.filter((p) => re.test(p)).length : null);
  const content = n(CONTENT);
  // Markdown copies llms.txt links to, once each. An answer that is not an llms.txt is not counted.
  const twins = llms && llms.startsWith("# ") ? new Set(llms.match(/https:\/\/postmosis\.com\/[^\s)]+\.md\b/g) ?? []).size : null;
  return [
    { label: "Guides (Taplio's blog has 227 posts)", done: n(under("guides")), total: SEO_TARGETS.guides, item: "pm-seo-guides" },
    { label: "Glossary terms (Buffer defines 103)", done: n(under("glossary")), total: SEO_TARGETS.glossary, item: "pm-seo-glossary" },
    { label: "Free tools (Taplio has 33)", done: n(under("tools")), total: SEO_TARGETS.freeTools, item: "pm-seo-free-tools" },
    { label: "Templates (Later has 34)", done: n(under("templates")), total: SEO_TARGETS.templates, item: "pm-seo-templates" },
    { label: "Comparison pages (Supergrow has 11)", done: n(under("compare")), total: SEO_TARGETS.compare, item: "pm-seo-compare" },
    { label: "Vault playbooks on Leo's queue", done: n(under("vault")), total: SEO_TARGETS.vault, item: "pm-seo-vault" },
    { label: "Tool pages per audience and network", done: n(/^\/tools\/[^/]+\/[^/]+$/), total: SEO_TARGETS.toolVariants, item: "pm-seo-tool-variants" },
    { label: "Content pages with a Markdown copy in llms.txt", done: content === null ? null : twins, total: content ?? 0, item: "pm-seo-llms" },
  ];
}

async function read(url: string, f: typeof fetch): Promise<string | null> {
  try {
    const r = await f(url, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
    return r.ok ? await r.text() : null;
  } catch {
    return null;
  }
}

/** Fetches both files at once; each one that fails leaves its counts at "not counted". */
export async function readSeoMetrics(f: typeof fetch = fetch): Promise<BookMetric[]> {
  const [sitemap, llms] = await Promise.all([read(SEO_SITE.sitemap, f), read(SEO_SITE.llms, f)]);
  return seoMetrics(sitemap, llms);
}
