// Rail 3 (Leo 2026-10-24: "contextual navigation"): the open page's own navigation beside the nav. A page hands over its views,
// filters and counts with useContextNav (and hides its own copies while useContextRailShown() says the rail is up); under
// them, "On this page" lists its h2 headings when it has two or more. Nothing to show: no rail, the page keeps its width.
import { useEffect, useState, useSyncExternalStore } from "react";
import { useLocation } from "react-router-dom";

export type ContextItem = { id: string; label: string; count?: number; active?: boolean; onSelect: () => void };
export type ContextGroup = { title: string; items: ContextItem[] };

let groups: ContextGroup[] | null = null;
const subs = new Set<() => void>();
const subscribe = (cb: () => void) => (subs.add(cb), () => void subs.delete(cb));
const emit = () => subs.forEach((f) => f());

/** A page's context navigation; pass a memoised list (or null), it is cleared when the page goes. */
export function useContextNav(next: ContextGroup[] | null) {
  useEffect(() => {
    groups = next;
    emit();
  }, [next]);
  useEffect(
    () => () => {
      groups = null;
      emit();
    },
    [],
  );
}

const WIDE = "(min-width: 1280px)";
// No matchMedia (a bare test document): no rail.
const hasMedia = () => typeof window !== "undefined" && typeof window.matchMedia === "function";
const onWide = (cb: () => void) => {
  if (!hasMedia()) return () => {};
  const m = window.matchMedia(WIDE);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
};
const wide = () => hasMedia() && window.matchMedia(WIDE).matches;

/** True while the rail is on screen, so a page can drop the controls it moved there. */
export const useContextRailShown = () => useSyncExternalStore(onWide, wide, () => false);

type Heading = { id: string; text: string };

/** A heading as the rail lists it: an all-caps eyebrow phrase ("ASK THE AGENT FOR") in sentence case; one all-caps
 *  word is an acronym ("F.A.D.S.") and, like anything else, stays as written. */
export function headingLabel(text: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.includes(" ") && /[A-Z]/.test(t) && t === t.toUpperCase() ? t.charAt(0) + t.slice(1).toLowerCase() : t;
}

/** The page's groups, or else its h2 headings, re-read as the page changes. */
export function useContextRailContent(): { groups: ContextGroup[] | null; headings: Heading[] } {
  const g = useSyncExternalStore(subscribe, () => groups, () => null);
  const { pathname } = useLocation();
  const [headings, setHeadings] = useState<Heading[]>([]);
  useEffect(() => {
    const main = typeof document.getElementById === "function" ? document.getElementById("main-content") : null;
    if (!main || typeof MutationObserver === "undefined") return;
    const read = () => {
      const found = [...main.querySelectorAll("h2")]
        .filter((h) => h.offsetParent !== null && (h.textContent ?? "").trim())
        .map((h, i) => {
          if (!h.id) h.id = `section-${i}-${(h.textContent ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}`;
          return { id: h.id, text: headingLabel(h.textContent ?? "") };
        });
      setHeadings((prev) => (JSON.stringify(prev) === JSON.stringify(found) ? prev : found));
    };
    read();
    let frame = 0; // busy pages change many times a frame: read once per frame
    const mo = new MutationObserver(() => {
      if (!frame) frame = requestAnimationFrame(() => ((frame = 0), read()));
    });
    mo.observe(main, { childList: true, subtree: true });
    return () => {
      mo.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [pathname]);
  return { groups: g, headings: headings.length > 1 ? headings : [] }; // one heading is not a list worth showing
}

const itemClass = (active?: boolean) =>
  `flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] transition-colors [@media(pointer:coarse)]:py-3 ${
    active ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground"
  }`;

export default function ContextRail({ groups: g, headings }: { groups: ContextGroup[] | null; headings: Heading[] }) {
  return (
    <nav aria-label="On this page" className="flex w-52 flex-col gap-4 overflow-y-auto border-r border-border/70 bg-background/60 px-3 py-5">
      {(g ?? []).map((grp) => (
        <div key={grp.title} className="space-y-0.5">
          <p className="px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/80">{grp.title}</p>
          {grp.items.map((it) => (
            <button key={it.id} type="button" aria-pressed={!!it.active} onClick={it.onSelect} className={itemClass(it.active)}>
              <span className="truncate">{it.label}</span>
              {it.count !== undefined && <span className={`text-[11px] tabular-nums ${it.active ? "" : "opacity-70"}`}>{it.count}</span>}
            </button>
          ))}
        </div>
      ))}
      {headings.length > 0 && (
        <div className="space-y-0.5">
          <p className="px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/80">On this page</p>
          {headings.map((h) => (
            <button
              key={h.id}
              type="button"
              onClick={() => document.getElementById(h.id)?.scrollIntoView({ behavior: "smooth", block: "start" })}
              className={itemClass(false)}
            >
              <span className="line-clamp-2">{h.text}</span>
            </button>
          ))}
        </div>
      )}
    </nav>
  );
}
