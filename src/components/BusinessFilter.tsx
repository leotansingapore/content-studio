import { useCallback, useMemo, useState } from "react";
import { FilterChip } from "@/components/ui/filter-chip";
import { businessKey } from "@/lib/channelFeeds";

// One remembered pick (per device) for every Pipeline view, so the calendar and the board show the same business.
const KEY = "cs-calendar-business";

/**
 * Leo 2026-10-13: "sort the posts based on business, since I manage multiple businesses". Names are the businesses
 * on the page (the open profile, reels brands, channel feeds); a remembered pick that is no longer there falls
 * back to all of them.
 */
export function useBusinessFilter(names: string[]) {
  const [biz, setBiz] = useState<string>(() => {
    try {
      return localStorage.getItem(KEY) || "all";
    } catch {
      return "all";
    }
  });
  const joined = names.join("\u0000");
  const businesses = useMemo(() => {
    const m = new Map<string, string>();
    for (const name of joined.split("\u0000")) if (name && !m.has(businessKey(name))) m.set(businessKey(name), name);
    return [...m.entries()].map(([key, label]) => ({ key, label }));
  }, [joined]);
  const pick = useCallback((key: string) => {
    setBiz(key);
    try {
      localStorage.setItem(KEY, key);
    } catch {
      /* the filter still works for this visit */
    }
  }, []);
  const bizOn = biz === "all" || businesses.some((b) => b.key === biz) ? biz : "all";
  const shows = useCallback((name: string) => bizOn === "all" || businessKey(name) === bizOn, [bizOn]);
  return { businesses, bizOn, pick, shows };
}

/** The chip row; hidden when the page has only one business. */
export function BusinessChips({ filter }: { filter: ReturnType<typeof useBusinessFilter> }) {
  if (filter.businesses.length < 2) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Business">
      <FilterChip active={filter.bizOn === "all"} onClick={() => filter.pick("all")}>
        All businesses
      </FilterChip>
      {filter.businesses.map((b) => (
        <FilterChip key={b.key} active={filter.bizOn === b.key} onClick={() => filter.pick(b.key)}>
          {b.label}
        </FilterChip>
      ))}
    </div>
  );
}
