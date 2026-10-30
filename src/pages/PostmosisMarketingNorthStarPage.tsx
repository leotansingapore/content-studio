// PostmosisMarketingNorthStarPage - /marketing-north-star/postmosis: how postmosis.com gets booked walkthroughs,
// card by card, from a teardown of eight competitors (src/data/postmosisMarketingNorthStar.ts, specs in
// docs/marketing-north-star/postmosis/). Leo, 30 Oct 2026: "include it for https://postmosis.com/ also, same.
// marketing and seo north-star". Linked from the hub's app pages. Leo's sign-ins only, like /marketing-north-star.

import { useEffect } from "react";
import NorthStarBook, { type Book } from "@/components/NorthStarBook";
import { useLeoUser } from "@/lib/useLeoOnly";
import NotFoundPage from "@/pages/NotFoundPage";
import {
  PM_AREAS,
  PM_AREA_ORDER,
  PM_ASKS,
  PM_DECISIONS,
  PM_ITEMS,
  PM_PHASES,
  PM_PRINCIPLES,
  PM_SKIP,
  PM_SOURCES,
  PM_THESIS,
  pmBuildPrompt,
  pmSpecUrl,
} from "@/data/postmosisMarketingNorthStar";

const PM_BOOK: Book = {
  path: "/marketing-north-star/postmosis",
  title: "Postmosis marketing",
  tip: "How postmosis.com gets booked walkthroughs, card by card, from how eight competitors get customers.",
  testPrefix: "pm-marketing",
  whyLabel: "Why",
  searchPlaceholder: "Search cards and owners",
  items: PM_ITEMS,
  areas: PM_AREAS,
  areaOrder: PM_AREA_ORDER,
  phases: PM_PHASES,
  asks: PM_ASKS,
  thesis: PM_THESIS,
  principles: PM_PRINCIPLES,
  decisions: PM_DECISIONS,
  skip: PM_SKIP,
  sources: PM_SOURCES,
  specUrl: pmSpecUrl,
  buildPrompt: pmBuildPrompt,
};

export default function PostmosisMarketingNorthStarPage() {
  const leo = useLeoUser();
  useEffect(() => {
    document.title = "Postmosis marketing - North star";
  }, []);
  if (leo === undefined) return <div className="h-40 animate-pulse rounded-xl bg-muted/40" aria-busy="true" />;
  if (!leo) return <NotFoundPage />;
  return <NorthStarBook book={PM_BOOK} />;
}
