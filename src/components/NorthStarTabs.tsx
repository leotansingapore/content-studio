// The two north stars, one tab each: what Content Studio should become (/north-star) and how we market the
// apps (/marketing-north-star, the hub that links each app's own page). Leo, 2026-10-26: "place it on .../north-star (so that I can see the progress)".

import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";

const TABS: [string, string][] = [
  ["/north-star", "Postmosis"],
  ["/marketing-north-star", "App marketing"],
];

export default function NorthStarTabs() {
  const { pathname } = useLocation();
  const current = pathname.replace(/\/+$/, "") || "/";
  return (
    <nav aria-label="North stars" className="flex gap-1 rounded-full border bg-muted/30 p-1 text-xs font-semibold sm:w-fit">
      {TABS.map(([to, label]) => (
        <Link
          key={to}
          to={to}
          aria-current={current === to ? "page" : undefined}
          className={cn(
            "inline-flex min-h-9 flex-1 items-center justify-center rounded-full px-4 transition-colors sm:flex-none [@media(pointer:coarse)]:min-h-11",
            current === to ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
