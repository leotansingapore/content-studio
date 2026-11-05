// Every way to make something new, one tap from any page (after Hootsuite's Create menu and the centre + of YouTube,
// Instagram and TikTok). On computers it is the arrow beside the sidebar's main button, which still starts a post in
// one click; on phones it is Create in the middle of the bottom bar. A disclosure of links, not an ARIA menu: Tab
// moves through them, Escape or a tap outside closes it and hands focus back.
import { useEffect, useId, useRef, useState, type ReactElement } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation } from "react-router-dom";
import { ChevronDown, Plus } from "lucide-react";
import { CREATE_FORMATS } from "@/lib/createFormats";

export default function CreateMenu({ place }: { place: "sidebar" | "bar" }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const { pathname } = useLocation();
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLAnchorElement>("a")?.focus({ preventScroll: true });
    // the phone panel is portalled out of the bar, so it counts as inside too
    const away = (e: PointerEvent) => !wrap.current?.contains(e.target as Node) && !panel.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const bar = place === "bar";
  // the bar is its own stacking context (fixed, z-30): its panel goes to <body> so it sits above the chat button
  const portal = (el: ReactElement) => (bar ? createPortal(el, document.body) : el);
  return (
    <div ref={wrap} className="contents">
      {bar ? (
        <button
          ref={trigger}
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls={panelId}
          className={`flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors ${open ? "text-primary" : "text-muted-foreground"}`}
        >
          <span className="grid h-5 w-8 place-items-center rounded-full bg-gradient-primary text-primary-foreground">
            <Plus className={`h-4 w-4 transition-transform ${open ? "rotate-45" : ""}`} />
          </span>
          Create
        </button>
      ) : (
        <button
          ref={trigger}
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls={panelId}
          aria-label="More ways to create"
          title="More ways to create"
          className="grid w-10 shrink-0 place-items-center rounded-l-none rounded-r-md border-l border-primary-foreground/25 bg-gradient-primary text-primary-foreground shadow-sm hover:opacity-95 [@media(pointer:coarse)]:w-11"
        >
          <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      )}
      {open && portal(
        <div
          ref={panel}
          id={panelId}
          className={
            bar
              ? "fixed inset-x-3 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-[70] max-h-[70vh] overflow-y-auto rounded-2xl border border-border bg-popover p-1.5 shadow-xl"
              : "absolute left-0 top-full z-40 mt-1.5 w-72 rounded-xl border border-border bg-popover p-1 shadow-lg"
          }
        >
          <ul>
            {CREATE_FORMATS.map((f) => (
              <li key={f.to}>
                <Link
                  to={f.to}
                  onClick={() => setOpen(false)}
                  className="flex min-h-11 items-start gap-3 rounded-lg px-2.5 py-2 text-left hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                >
                  <f.icon aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-foreground">{f.name}</span>
                    <span className="block text-xs text-muted-foreground">{f.blurb}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>,
      )}
    </div>
  );
}
