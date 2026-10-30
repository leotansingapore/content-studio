// The north stars, one tab each: what Postmosis should become (/north-star), how we market the apps
// (/marketing-north-star, the hub that links each app's own page), and postmosis.com's own marketing and SEO plans
// (/marketing-north-star/postmosis, /seo-north-star). Leo, 2026-10-26: "place it on .../north-star (so that I can
// see the progress)"; 2026-10-30: "include it for https://postmosis.com/ also, same. marketing and seo north-star".

import { useEffect, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";

const TABS: [string, string][] = [
  ["/north-star", "Postmosis"],
  ["/marketing-north-star", "App marketing"],
  ["/marketing-north-star/postmosis", "Postmosis marketing"],
  ["/seo-north-star", "Postmosis SEO"],
];

export default function NorthStarTabs() {
  const { pathname } = useLocation();
  const current = pathname.replace(/\/+$/, "") || "/";
  const nav = useRef<HTMLElement>(null);
  // On a phone the row scrolls sideways; bring the open tab into view so the page you are on is never hidden.
  useEffect(() => {
    const el = nav.current?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!el || !nav.current) return;
    const box = nav.current.getBoundingClientRect();
    const tab = el.getBoundingClientRect();
    nav.current.scrollLeft += tab.left - box.left - (box.width - tab.width) / 2;
  }, [current]);
  return (
    <nav ref={nav} aria-label="North stars" className="flex gap-1 overflow-x-auto rounded-full border bg-muted/30 p-1 text-xs font-semibold sm:w-fit">
      {TABS.map(([to, label]) => (
        <Link
          key={to}
          to={to}
          aria-current={current === to ? "page" : undefined}
          className={cn(
            "inline-flex min-h-9 shrink-0 items-center justify-center whitespace-nowrap rounded-full px-4 transition-colors [@media(pointer:coarse)]:min-h-11",
            current === to ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
