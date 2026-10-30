// The live counts on /seo-north-star: pages are counted from postmosis.com's sitemap by section (hubs left out),
// Markdown copies from llms.txt once each, and a read that fails or answers with the wrong kind of file shows
// "not counted" (null), never 0.
import { describe, expect, it, vi } from "vitest";
import { readSeoMetrics, seoMetrics, sitemapPaths } from "./seoNorthStarCounts";
import { SEO_ITEMS, SEO_SITE, SEO_TARGETS } from "./seoNorthStar";

const loc = (path: string) => `<url><loc>https://postmosis.com${path}</loc></url>`;
const SITEMAP = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${[
  "/",
  "/guides",
  "/guides/instagram-post-size",
  "/guides/talking-head-video",
  "/glossary/hook",
  "/tools",
  "/tools/hook-generator",
  "/tools/hook-generator/coaches",
  "/templates/content-calendar",
  "/compare/buffer-alternative",
  "/vault/video-hooks",
  "/features/video-editor",
  "/for/coaches",
  "/privacy",
]
  .map(loc)
  .join("")}</urlset>`;
const LLMS = [
  "# Postmosis",
  "- [TikTok hooks](https://postmosis.com/vault/video-hooks.md): Ten hook formulas.",
  "- [TikTok hooks again](https://postmosis.com/vault/video-hooks.md): the same copy, listed twice.",
  "- [Talking head](https://postmosis.com/guides/talking-head-video.md): Film on your phone.",
  "- [Hook](https://postmosis.com/glossary/hook): a page, not a Markdown copy.",
].join("\n");

const byItem = (m: ReturnType<typeof seoMetrics>, item: string) => m.find((x) => x.item === item)!;

describe("sitemapPaths", () => {
  it("reads every <loc> as a path without a trailing slash, once each", () => {
    expect(sitemapPaths(`<urlset>${loc("/guides/")}${loc("/guides")}${loc("/")}</urlset>`)).toEqual(["/guides", "/"]);
  });

  it("answers null for anything that is not a sitemap, so an HTML error page is not read as zero pages", () => {
    expect(sitemapPaths("<!doctype html><title>404</title>")).toBeNull();
    expect(sitemapPaths("")).toBeNull();
    expect(sitemapPaths(null)).toBeNull();
  });
});

describe("seoMetrics", () => {
  it("counts the pages under each section, leaving the hub out", () => {
    const m = seoMetrics(SITEMAP, LLMS);
    expect(byItem(m, "pm-seo-guides")).toMatchObject({ done: 2, total: SEO_TARGETS.guides });
    expect(byItem(m, "pm-seo-glossary").done).toBe(1);
    expect(byItem(m, "pm-seo-free-tools").done).toBe(1);
    expect(byItem(m, "pm-seo-templates").done).toBe(1);
    expect(byItem(m, "pm-seo-compare").done).toBe(1);
    expect(byItem(m, "pm-seo-vault")).toMatchObject({ done: 1, total: SEO_TARGETS.vault });
    expect(byItem(m, "pm-seo-tool-variants")).toMatchObject({ done: 1, total: SEO_TARGETS.toolVariants });
  });

  it("measures Markdown copies in llms.txt, once each, against every content page in the sitemap", () => {
    // content pages: 2 guides, 1 glossary, 1 tool, 1 template, 1 compare, 1 vault, 1 feature, 1 audience
    expect(byItem(seoMetrics(SITEMAP, LLMS), "pm-seo-llms")).toMatchObject({ done: 2, total: 9 });
  });

  it("shows not counted, never 0, when a file could not be read or is the wrong kind", () => {
    for (const m of seoMetrics(null, null)) expect(m.done, m.label).toBeNull();
    expect(byItem(seoMetrics(SITEMAP, "<!doctype html>"), "pm-seo-llms").done).toBeNull();
    expect(byItem(seoMetrics("<html></html>", LLMS), "pm-seo-guides").done).toBeNull();
  });

  it("links every count to a card that exists", () => {
    const ids = new Set(SEO_ITEMS.map((i) => i.id));
    for (const m of seoMetrics(SITEMAP, LLMS)) expect(ids.has(m.item), m.item).toBe(true);
  });
});

describe("readSeoMetrics", () => {
  it("reads the live sitemap and llms.txt, and a failed read leaves only its own counts uncounted", async () => {
    const f = vi.fn(async (url: string) => {
      if (url === SEO_SITE.sitemap) return new Response(SITEMAP, { status: 200 });
      throw new TypeError("Failed to fetch");
    });
    const m = await readSeoMetrics(f as unknown as typeof fetch);
    expect(f).toHaveBeenCalledWith(SEO_SITE.llms, expect.anything());
    expect(byItem(m, "pm-seo-guides").done).toBe(2);
    expect(byItem(m, "pm-seo-llms").done).toBeNull();
  });

  it("treats a non-200 answer as unread", async () => {
    const f = vi.fn(async () => new Response("gone", { status: 503 }));
    for (const m of await readSeoMetrics(f as unknown as typeof fetch)) expect(m.done).toBeNull();
  });
});
