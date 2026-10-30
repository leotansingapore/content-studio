// SeoNorthStarPage - /seo-north-star: postmosis.com's whole SEO plan, built from what eight competitors publish
// (src/data/seoNorthStar.ts, specs in docs/seo-north-star/), with live counts read from the site's sitemap and
// llms.txt (src/data/seoNorthStarCounts.ts). Leo, 30 Oct 2026: "btw is there like a seo-north-star, so I can see
// what is the full ideal comprehensive plan and see the progress bar towards that". Leo's sign-ins only, like
// /marketing-north-star; everyone else gets the not-found page, and the counts are read only after the gate.

import { useEffect, useState } from "react";
import NorthStarBook, { type Book, type BookMetric } from "@/components/NorthStarBook";
import { useLeoUser } from "@/lib/useLeoOnly";
import NotFoundPage from "@/pages/NotFoundPage";
import {
  SEO_AREAS,
  SEO_AREA_ORDER,
  SEO_ASKS,
  SEO_DECISIONS,
  SEO_ITEMS,
  SEO_PHASES,
  SEO_PRINCIPLES,
  SEO_SKIP,
  SEO_SOURCES,
  SEO_THESIS,
  seoBuildPrompt,
  seoSpecUrl,
} from "@/data/seoNorthStar";
import { readSeoMetrics, seoMetrics } from "@/data/seoNorthStarCounts";

const SEO_BOOK: Book = {
  path: "/seo-north-star",
  title: "Postmosis SEO",
  tip: "postmosis.com's whole SEO plan, from what eight competitors publish, with live counts from its sitemap.",
  testPrefix: "seo",
  whyLabel: "Competitors",
  searchPlaceholder: "Search cards and owners",
  items: SEO_ITEMS,
  areas: SEO_AREAS,
  areaOrder: SEO_AREA_ORDER,
  phases: SEO_PHASES,
  asks: SEO_ASKS,
  thesis: SEO_THESIS,
  principles: SEO_PRINCIPLES,
  decisions: SEO_DECISIONS,
  skip: SEO_SKIP,
  sources: SEO_SOURCES,
  specUrl: seoSpecUrl,
  buildPrompt: seoBuildPrompt,
};

function SeoNorthStar() {
  const [metrics, setMetrics] = useState<BookMetric[] | null>(null);
  useEffect(() => {
    let live = true;
    readSeoMetrics().then((m) => live && setMetrics(m));
    return () => {
      live = false;
    };
  }, []);
  return <NorthStarBook book={SEO_BOOK} metrics={metrics ?? seoMetrics(null, null)} metricsLoading={!metrics} />;
}

export default function SeoNorthStarPage() {
  const leo = useLeoUser();
  useEffect(() => {
    document.title = "Postmosis SEO - North star";
  }, []);
  if (leo === undefined) return <div className="h-40 animate-pulse rounded-xl bg-muted/40" aria-busy="true" />;
  if (!leo) return <NotFoundPage />;
  return <SeoNorthStar />;
}
