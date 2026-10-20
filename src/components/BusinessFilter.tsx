import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { FilterChip } from "@/components/ui/filter-chip";
import { businessKey } from "@/lib/channelFeeds";
import { slug } from "@/lib/links";
import { useUrlState } from "@/lib/urlState";

// One remembered pick (per device) for every Pipeline view, so the calendar and the board show the same business.
const KEY = "cs-calendar-business";

/**
 * Leo 2026-10-13: "sort the posts based on business, since I manage multiple businesses". Names are the businesses
 * on the page (the open profile, reels brands, channel feeds); a pick that is no longer there falls back to all.
 * The pick lives in ?business= (`all` or the business name as a slug, "team-posts"), then the remembered pick.
 * `linked`: the business a link implies when it names none (a team post link shows the team posts).
 */
export function useBusinessFilter(names: string[], linked?: string) {
  const [params] = useSearchParams();
  const [picked, setPicked] = useUrlState("business", "all", { remember: KEY });
  // Remembered picks from before links were keys ("teamposts"); businessKey reads both forms the same.
  const raw = linked && !params.get("business") ? linked : picked;
  const biz = raw === "all" ? "all" : businessKey(raw);
  const joined = names.join("\u0000");
  const businesses = useMemo(() => {
    const m = new Map<string, string>();
    for (const name of joined.split("\u0000")) if (name && !m.has(businessKey(name))) m.set(businessKey(name), name);
    return [...m.entries()].map(([key, label]) => ({ key, label }));
  }, [joined]);
  const pick = useCallback(
    (key: string) => setPicked(key === "all" ? "all" : slug(businesses.find((b) => b.key === key)?.label ?? key)),
    [businesses, setPicked],
  );
  const bizOn = biz === "all" || businesses.some((b) => b.key === biz) ? biz : "all";
  const shows = useCallback((name: string) => bizOn === "all" || businessKey(name) === bizOn, [bizOn]);
  /** The pick as it goes in a link: "all" or a slug. */
  const bizSlug = bizOn === "all" ? "all" : slug(businesses.find((b) => b.key === bizOn)?.label ?? bizOn);
  return { businesses, bizOn, bizSlug, pick, shows };
}

/** The chip row; hidden when the page has only one business. `label`: a chip's text, when it differs from the name its link and memory use. */
export function BusinessChips({
  filter,
  label = (name) => name,
}: {
  filter: ReturnType<typeof useBusinessFilter>;
  label?: (name: string) => string;
}) {
  if (filter.businesses.length < 2) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Business">
      <FilterChip active={filter.bizOn === "all"} onClick={() => filter.pick("all")}>
        All businesses
      </FilterChip>
      {filter.businesses.map((b) => (
        <FilterChip key={b.key} active={filter.bizOn === b.key} onClick={() => filter.pick(b.key)}>
          {label(b.label)}
        </FilterChip>
      ))}
    </div>
  );
}
