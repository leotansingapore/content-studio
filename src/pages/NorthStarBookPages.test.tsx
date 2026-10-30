// /seo-north-star and /marketing-north-star/postmosis behind the real gate (useLeoUser, not a mock): signed out
// and any other sign-in get the not-found page with no hint the page exists; Leo sees every card. The SEO page's
// live-count strip says "counting" until the read lands and "not counted" when it fails, never 0.
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => {
  (globalThis as { localStorage?: unknown }).localStorage = { getItem: () => null, setItem: () => undefined, removeItem: () => undefined };
  return { getSession: (() => Promise.resolve({ data: { session: null } })) as () => Promise<unknown> };
});
vi.mock("@/lib/supabase", () => ({
  SUPABASE_URL: "https://abc.supabase.co",
  supabase: { auth: { getSession: () => auth.getSession(), getUser: () => new Promise(() => undefined), onAuthStateChange: () => ({}) } },
}));

import NorthStarBook from "@/components/NorthStarBook";
import { PM_ITEMS } from "@/data/postmosisMarketingNorthStar";
import { SEO_ITEMS } from "@/data/seoNorthStar";
import { seoMetrics } from "@/data/seoNorthStarCounts";

const LOAD = {
  SeoNorthStarPage: () => import("@/pages/SeoNorthStarPage"),
  PostmosisMarketingNorthStarPage: () => import("@/pages/PostmosisMarketingNorthStarPage"),
  MarketingNorthStarPage: () => import("@/pages/MarketingNorthStarPage"),
};

/** Signs in as `email` (or out, with null), reads the session the way a page load does, then renders `path`. */
async function visit(email: string | null, page: keyof typeof LOAD, path: string) {
  auth.getSession = () => Promise.resolve({ data: { session: email ? { user: { id: "u1", email } } : null } });
  vi.resetModules();
  const { leoUser } = await import("@/lib/useLeoOnly");
  await leoUser();
  const Page = (await LOAD[page]()).default as ComponentType;
  return renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [path] }, createElement(Page)));
}

const PAGES: { page: keyof typeof LOAD; path: string; prefix: string; title: string; items: { status: string }[] }[] = [
  { page: "SeoNorthStarPage", path: "/seo-north-star", prefix: "seo", title: "Postmosis SEO", items: SEO_ITEMS },
  { page: "PostmosisMarketingNorthStarPage", path: "/marketing-north-star/postmosis", prefix: "pm-marketing", title: "Postmosis marketing", items: PM_ITEMS },
];
const count = (html: string, prefix: string) => html.split(`data-testid="${prefix}-item"`).length - 1;

describe.each(PAGES)("$path", ({ page, path, prefix, title, items }) => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("answers a signed-out visitor with the not-found page", async () => {
    const h = await visit(null, page, path);
    expect(h).not.toContain(`${prefix}-north-star-page`);
    expect(h).not.toContain(title);
  });

  it("answers any other sign-in with the not-found page", async () => {
    const h = await visit("someone@example.com", page, path);
    expect(h).not.toContain(`${prefix}-north-star-page`);
    expect(h).not.toContain(title);
  });

  it("shows Leo the progress, the tabs and every card", async () => {
    let shown = 0;
    for (const s of ["todo", "started", "done"]) {
      const h = await visit("tanjunsing@gmail.com", page, `${path}?status=${s}`);
      expect(h).toContain(`${prefix}-north-star-page`);
      expect(h).toContain(`of ${items.length} done`);
      expect(h).toContain('href="/seo-north-star"');
      expect(h).toContain('href="/marketing-north-star/postmosis"');
      expect(count(h, prefix), s).toBe(items.filter((i) => i.status === s).length);
      shown += count(h, prefix);
    }
    expect(shown).toBe(items.length);
  });
});

describe("the SEO page's live counts", () => {
  it("say counting before the read lands", async () => {
    const h = await visit("leotanjs95@gmail.com", "SeoNorthStarPage", "/seo-north-star");
    expect(h).toContain('data-testid="seo-metrics"');
    expect(h).toContain("counting");
  });

  it("say not counted when the read fails, and done of total when it lands, each linked to its card", async () => {
    const book = { path: "/x", title: "T", tip: "", testPrefix: "t", whyLabel: "Why", searchPlaceholder: "", items: SEO_ITEMS, areas: {}, areaOrder: [], phases: [], asks: [], thesis: [], principles: [], decisions: [], skip: [], sources: [], specUrl: (id: string) => id, buildPrompt: () => "" };
    const render = (metrics: ReturnType<typeof seoMetrics>) =>
      renderToStaticMarkup(createElement(MemoryRouter, null, createElement(NorthStarBook, { book, metrics })));
    const failed = render(seoMetrics(null, null));
    expect(failed.split("not counted").length - 1).toBe(seoMetrics(null, null).length);
    expect(failed).not.toMatch(/>0 of /);
    const sitemap = `<urlset><url><loc>https://postmosis.com/guides/a</loc></url><url><loc>https://postmosis.com/guides/b</loc></url></urlset>`;
    const landed = render(seoMetrics(sitemap, "# Postmosis"));
    expect(landed).toContain("2 of 227");
    expect(landed).toContain('href="#pm-seo-guides"');
  });
});

describe("the hub", () => {
  it("links the postmosis.com marketing page in this app", async () => {
    const h = await visit("tanjunsing@gmail.com", "MarketingNorthStarPage", "/marketing-north-star");
    expect(h).toContain("marketing-north-star-page");
    expect(h).toContain("postmosis.com: every booking held");
  });
});
