// MarketingNorthStarPage - /marketing-north-star: how we market the apps, and how far each piece is. Leo,
// 2026-10-26: "I really want to make this app marketing work". Fed by src/data/marketingNorthStar.ts; the long
// spec per card is docs/marketing-north-star/items/<id>.md (start at docs/marketing-north-star/README.md).
// The view is shared with the other plan pages (src/components/NorthStarBook.tsx). Leo's sign-ins only
// (src/lib/leoOnly.ts), like /north-star.

import { useEffect } from "react";
import NorthStarBook, { type Book } from "@/components/NorthStarBook";
import { useLeoUser } from "@/lib/useLeoOnly";
import NotFoundPage from "@/pages/NotFoundPage";
import {
  MK_APPS,
  MK_APP_PAGES,
  MK_AREAS,
  MK_AREA_ORDER,
  MK_ASKS,
  MK_DECISIONS,
  MK_ITEMS,
  MK_PHASES,
  MK_PRINCIPLES,
  MK_SKIP,
  MK_SOURCES,
  MK_THESIS,
  mkBuildPrompt,
  mkSpecUrl,
} from "@/data/marketingNorthStar";

const HUB: Book = {
  path: "/marketing-north-star",
  title: "App marketing",
  tip: "How we market the apps, card by card, from the four videos Leo sent.",
  testPrefix: "marketing",
  whyLabel: "Why",
  searchPlaceholder: "Search cards, apps, owners",
  items: MK_ITEMS,
  areas: MK_AREAS,
  areaOrder: MK_AREA_ORDER,
  phases: MK_PHASES,
  asks: MK_ASKS,
  thesis: MK_THESIS,
  principles: MK_PRINCIPLES,
  decisions: MK_DECISIONS,
  skip: MK_SKIP,
  sources: MK_SOURCES,
  specUrl: mkSpecUrl,
  buildPrompt: mkBuildPrompt,
  apps: MK_APPS,
  appPages: MK_APP_PAGES,
};

export default function MarketingNorthStarPage() {
  const leo = useLeoUser();
  useEffect(() => {
    document.title = "App marketing - North star";
  }, []);
  if (leo === undefined) return <div className="h-40 animate-pulse rounded-xl bg-muted/40" aria-busy="true" />;
  if (!leo) return <NotFoundPage />;
  return <NorthStarBook book={HUB} />;
}
