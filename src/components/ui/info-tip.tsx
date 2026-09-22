// A descriptor kept out of the way: a small info mark beside a heading or a
// control that opens one short sentence (UX law 21: show, do not narrate).
//
// A tap-friendly bubble, not a hover tooltip: a hover-only tooltip never opens
// on a phone tap, which would make the explanation unreachable there. A mouse
// gets hover; a click or a tap pins it open until the next click, Escape or a
// tap outside. The repo has no Popover, so the bubble is portalled and placed
// by hand, clamped to the viewport.
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

const EDGE = 12;
const GAP = 6;

export function InfoTip({
  children,
  label = "More info",
  className,
}: {
  children: ReactNode;
  /** What a screen reader hears for the icon, e.g. "About Hooks". */
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const pinned = useRef(false);
  const timer = useRef<number>();
  const trigger = useRef<HTMLButtonElement>(null);
  const bubble = useRef<HTMLDivElement>(null);
  const contentId = useId();

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const close = () => {
    pinned.current = false;
    setOpen(false);
  };

  // Below the icon, centred, kept inside the viewport; above it when the
  // bottom edge has no room.
  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const place = () => {
      const t = trigger.current?.getBoundingClientRect();
      const b = bubble.current;
      if (!t || !b) return;
      const w = b.offsetWidth;
      const h = b.offsetHeight;
      const left = Math.max(
        EDGE,
        Math.min(t.left + t.width / 2 - w / 2, window.innerWidth - w - EDGE),
      );
      let top = t.bottom + GAP;
      if (top + h > window.innerHeight - EDGE && t.top - GAP - h >= EDGE) {
        top = t.top - GAP - h;
      }
      setPos({ top, left });
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (trigger.current?.contains(target) || bubble.current?.contains(target)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      close();
      trigger.current?.focus();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // The gap between the icon and the bubble would close it on the way across,
  // so leaving waits a moment for the pointer to arrive in the bubble.
  const hover = (next: boolean) => (e: ReactPointerEvent) => {
    if (e.pointerType !== "mouse" || pinned.current) return;
    window.clearTimeout(timer.current);
    if (next) setOpen(true);
    else timer.current = window.setTimeout(() => setOpen(false), 120);
  };

  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-describedby={open ? contentId : undefined}
        data-testid="info-tip"
        className={cn(
          "inline-grid h-6 w-6 shrink-0 place-items-center rounded-full align-middle text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          // A 24px mark is a 24px tap target, which a thumb misses. The halo
          // gives the same button 44x44 of reach on touch without moving the
          // heading it sits in; a mouse never gets it.
          "relative before:absolute before:left-1/2 before:top-1/2 before:h-11 before:w-11 before:-translate-x-1/2 before:-translate-y-1/2 before:content-[''] [@media(pointer:fine)]:before:hidden",
          className,
        )}
        onPointerEnter={hover(true)}
        onPointerLeave={hover(false)}
        onClick={(e) => {
          // Safe inside a clickable row or a form: the click stops here.
          e.preventDefault();
          e.stopPropagation();
          window.clearTimeout(timer.current);
          pinned.current = !pinned.current;
          setOpen(pinned.current);
        }}
      >
        <Info className="h-3.5 w-3.5" aria-hidden />
      </button>
      {open &&
        createPortal(
          <div
            ref={bubble}
            id={contentId}
            role="tooltip"
            className="fixed z-50 w-max max-w-[260px] rounded-md border border-border bg-popover px-3 py-2 text-left text-xs font-normal normal-case leading-relaxed tracking-normal text-popover-foreground shadow-md"
            style={{
              top: pos?.top ?? 0,
              left: pos?.left ?? 0,
              visibility: pos ? "visible" : "hidden",
            }}
            // React events bubble through portals to the icon's ancestors.
            onClick={(e) => e.stopPropagation()}
            onPointerEnter={hover(true)}
            onPointerLeave={hover(false)}
          >
            {children}
          </div>,
          document.body,
        )}
    </>
  );
}
