// The open section's tabs as one row at the top of every page (docs/nav-overhaul.md). A tab that holds several pages
// carries a small arrow when it is open: pressing it lists them (the picker), so there is never a second row. The
// shell renders it once, above the page. Routes stay intact (deep links, query params keep working).
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation } from "react-router-dom";
import { Check, ChevronDown, ChevronLeft } from "lucide-react";
import { sectionTabs, type Tab } from "@/lib/nav";

export const tabClass = (active: boolean) =>
  `flex min-h-9 shrink-0 items-center whitespace-nowrap rounded-lg border px-3 text-sm font-medium transition-colors [@media(pointer:coarse)]:min-h-11 ${
    active ? "border-border bg-background text-foreground shadow-sm" : "border-transparent text-muted-foreground hover:text-foreground"
  }`;

/** How far to scroll a tab row so the open tab shows whole, with a little of its neighbour: 0 when it already does. */
export const revealBy = (row: { left: number; right: number }, tab: { left: number; right: number }, pad = 24) =>
  tab.right > row.right ? tab.right - row.right + pad : tab.left < row.left ? tab.left - row.left - pad : 0;

/**
 * The fade on a scrolling row's edges: a phone shows the first few tabs only, and a tab fading out says more follow
 * that way. Nothing when the row fits, and no fade on a side with nothing past it.
 */
export function edgeFade(scrollLeft: number, clientWidth: number, scrollWidth: number, px = 28): string | undefined {
  const left = scrollLeft > 1;
  const right = scrollLeft + clientWidth < scrollWidth - 1;
  if (!left && !right) return undefined;
  return `linear-gradient(to right, ${left ? "transparent" : "#000"}, #000 ${px}px, #000 calc(100% - ${px}px), ${right ? "transparent" : "#000"})`;
}

/**
 * The open tab when it holds several pages: its name, the open page's name and an arrow. Pressing it lists the pages.
 * A disclosure of links, not an ARIA menu: Tab moves through them, Escape or a press outside closes it and hands focus
 * back. The list is drawn on <body> at the button's place, so the scrolling row and its edge fade never clip it.
 */
function Picker({ tab, pages }: { tab: Tab; pages: Tab[] }) {
  const [at, setAt] = useState<{ left: number; top: number } | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const { pathname } = useLocation();
  useEffect(() => setAt(null), [pathname]);
  useEffect(() => {
    if (!at) return;
    list.current?.querySelector<HTMLAnchorElement>('[aria-current="page"]')?.focus({ preventScroll: true });
    const shut = () => setAt(null);
    const away = (e: PointerEvent) => !list.current?.contains(e.target as Node) && !button.current?.contains(e.target as Node) && shut();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && (shut(), button.current?.focus());
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    window.addEventListener("resize", shut);
    window.addEventListener("scroll", shut, true);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
      window.removeEventListener("resize", shut);
      window.removeEventListener("scroll", shut, true);
    };
  }, [at]);
  const open = pages.find((p) => p.active);
  const toggle = () => {
    const r = button.current!.getBoundingClientRect();
    // kept on screen: a tab near the right edge of a phone opens its list leftwards
    setAt(at ? null : { left: Math.max(8, Math.min(r.left, window.innerWidth - 248)), top: r.bottom + 6 });
  };
  return (
    <>
      <button ref={button} type="button" aria-current="page" aria-haspopup="true" aria-expanded={!!at} onClick={toggle} className={`${tabClass(true)} gap-1.5`}>
        {tab.label}
        {open && open.label !== tab.label && <span className="font-normal text-muted-foreground">{open.label}</span>}
        <ChevronDown aria-hidden className={`h-4 w-4 text-muted-foreground transition-transform ${at ? "rotate-180" : ""}`} />
      </button>
      {at && createPortal(
        <div ref={list} data-nav style={at} className="fixed z-40 w-60 rounded-xl border border-border bg-popover p-1 shadow-lg">
          {pages.map((p) => (
            <Link
              key={p.to}
              to={p.to}
              aria-current={p.active ? "page" : undefined}
              onClick={() => setAt(null)}
              className={`flex min-h-11 items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm transition-colors hover:bg-accent ${p.active ? "font-semibold text-foreground" : "text-foreground"}`}
            >
              <span className="min-w-0 flex-1">
                {p.label}
                {p.hint && <span className="block text-xs font-normal text-muted-foreground">{p.hint}</span>}
              </span>
              {p.active && <Check aria-hidden className="h-4 w-4 shrink-0 text-primary" />}
            </Link>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}

function Row({ tabs, picker }: { tabs: Tab[]; picker: Tab[] }) {
  const row = useRef<HTMLDivElement>(null);
  const open = tabs.find((t) => t.active)?.to;
  const [fade, setFade] = useState<string>();
  const measure = () => row.current && setFade(edgeFade(row.current.scrollLeft, row.current.clientWidth, row.current.scrollWidth));
  // a phone shows the first few tabs only: scroll the row (never the page) so the page you are on is not cut off, and
  // again once the web font is in, since it widens the tabs
  useLayoutEffect(() => {
    const reveal = () => {
      const tab = row.current?.querySelector('[aria-current="page"]');
      if (row.current && tab) row.current.scrollLeft += revealBy(row.current.getBoundingClientRect(), tab.getBoundingClientRect());
    };
    reveal();
    measure();
    void document.fonts?.ready.then(() => (reveal(), measure()));
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [open, tabs.length]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div ref={row} onScroll={measure} style={fade ? { maskImage: fade, WebkitMaskImage: fade } : undefined} className="flex gap-1.5 overflow-x-auto [scrollbar-width:none]">
      {tabs.map((t) =>
        t.active && picker.length ? (
          <Picker key={t.to} tab={t} pages={picker} />
        ) : (
          <Link key={t.to} to={t.to} aria-current={t.active ? "page" : undefined} className={tabClass(t.active)}>
            {t.label}
          </Link>
        ),
      )}
    </div>
  );
}

export default function SectionTabs({ email }: { email: string }) {
  const { pathname } = useLocation();
  const { tabs, picker, back } = sectionTabs(pathname, email);
  if (back)
    return (
      <nav aria-label="Section" data-nav className="mb-4">
        <Link to={back.to} className="inline-flex min-h-9 items-center gap-1 rounded-lg pr-2 text-sm text-muted-foreground transition-colors hover:text-foreground [@media(pointer:coarse)]:min-h-11">
          <ChevronLeft className="h-4 w-4" /> {back.label}
        </Link>
      </nav>
    );
  if (!tabs.length) return null;
  return (
    <nav aria-label="Section" data-nav className="mb-6">
      <Row tabs={tabs} picker={picker} />
    </nav>
  );
}
