import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Compass, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useTourUser } from "@/lib/useTourUser";
import {
  nextStep,
  onTour,
  pauseTour,
  resumeTour,
  skipTour,
  startTour,
  stepForPath,
  stepOf,
  takeFocus,
  tourParam,
  tourState,
} from "@/lib/tour";

// The agent's tour (north star agent-tour) on Leo's sign-ins and the studio tour on everyone else's, mounted once in
// StudioLayout. The page stays usable under it:
// no backdrop, below the dock's button, and the body gets room at the bottom so nothing on a page stays hidden behind it.
// On its step's page it shows the step; anywhere else, or after Esc, a pill to resume or skip. While the dock's panel is
// open (html[data-agent-dock]) it sits above the panel, so Next and Skip always take a press (live-p6replay D9): left of
// the panel on wide screens, and over the panel's messages, clear of its composer, on phones.

// bottom centre of the content area; 144 px up on phones clears the bottom nav and the dock's button
const PLACE = cn(
  "fixed inset-x-0 z-[45] mx-auto bottom-[144px] lg:bottom-6 lg:left-[var(--nav-w)]",
  "[html[data-agent-dock]_&]:z-[61] [html[data-agent-dock]_&]:bottom-[196px] lg:[html[data-agent-dock]_&]:bottom-6",
  // the panel is 400 px wide, 20 px in from the right: the popover centres in what is left, and narrows to fit
  "lg:[html[data-agent-dock]_&]:right-[436px] lg:[html[data-agent-dock]_&]:max-w-[min(520px,calc(100vw-var(--nav-w)-452px))]",
);
const bottomGap = () => (window.innerWidth >= 1024 ? 24 : 144);
const RING = ["ring-2", "ring-primary", "ring-offset-4", "ring-offset-background", "rounded-lg"];
const RINGED = "data-tour-ring";
const SKIPPED = "Tour closed. Replay it from How the studio works.";
const DONE = "That's the tour. Replay it any time from How the studio works.";

function unring() {
  document.querySelectorAll<HTMLElement>(`[${RINGED}]`).forEach((el) => {
    el.classList.remove(...(el.getAttribute(RINGED) ?? "").split(" ").filter(Boolean));
    el.removeAttribute(RINGED);
  });
}

export default function TourPopover() {
  const who = useTourUser();
  const steps = who?.steps;
  const { pathname, search, hash } = useLocation();
  const navigate = useNavigate();
  const [, bump] = useState(0);
  // bottom offset that lifts the popover above its step's target when the two would overlap
  const [lift, setLift] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const nextBtn = useRef<HTMLButtonElement>(null);
  const resumeBtn = useRef<HTMLButtonElement>(null);
  const focusResume = useRef(false);

  useEffect(() => onTour(() => bump((n) => n + 1)), []);

  // ?tour= is read once and removed with a replace, and signed out only removed. It stays while the sign-in is
  // still being read, as ?remix= does.
  useEffect(() => {
    const p = tourParam(search, steps);
    if (!p || who === undefined) return;
    if (!who) return navigate(pathname + p.search + hash, { replace: true });
    const step = startTour(who.id, p.step, who.steps);
    navigate(step.path === pathname ? pathname + p.search + hash : step.path + p.search, { replace: true });
  }, [who, steps, pathname, search, hash, navigate]);

  const rec = who ? tourState(who.id) : null;
  const live = rec && (rec.state === "running" || rec.state === "paused") ? rec : null;
  const { step, n } = live ? stepOf(live.step, steps) : { step: null, n: 0 };
  const TOTAL = steps?.length ?? 0;
  const view = !live ? null : live.state === "running" && stepForPath(pathname, steps) === live.step ? "popover" : "pill";

  // Focus moves only after a press (start, Next, Resume, Esc), so it never leaves a field someone is typing in.
  useEffect(() => {
    // read only once something is drawn: a ?tour= start sets it in this same commit, before the popover exists
    const press = view !== null && takeFocus();
    if (view === "popover" && press) nextBtn.current?.focus();
    if (view === "pill" && focusResume.current) resumeBtn.current?.focus();
    focusResume.current = false;
  }, [view, step?.id]);

  // Room under the page for the popover or pill, so no button on the page stays covered.
  useEffect(() => {
    const b = box.current;
    if (!view || !b) return;
    const pad = () => {
      document.body.style.paddingBottom = `${b.offsetHeight + bottomGap() + 16}px`;
    };
    pad();
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(pad);
    ro?.observe(b);
    window.addEventListener("resize", pad);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", pad);
      document.body.style.paddingBottom = "";
    };
  }, [view]);

  // The step's target gets a ring while the step shows, and the popover sits above it rather than over it. The
  // target can mount late (its page's chunk) or again (a new thread), so it is looked for every frame.
  const target = view === "popover" ? step?.target : undefined;
  useEffect(() => {
    if (!target) return;
    let frame = 0;
    let last: number | null = null;
    const tick = () => {
      const t = document.querySelector<HTMLElement>(`main [data-tour="${target}"]`);
      if (t && !t.hasAttribute(RINGED)) {
        const added = RING.filter((c) => !t.classList.contains(c));
        t.classList.add(...added);
        t.setAttribute(RINGED, added.join(" "));
      }
      const b = box.current;
      let l: number | null = null;
      if (t && b) {
        const r = t.getBoundingClientRect();
        const h = b.offsetHeight;
        const floor = window.innerHeight - bottomGap();
        if (r.bottom > floor - h && r.top < floor && r.top - 12 - h >= 8) l = window.innerHeight - r.top + 12;
      }
      if (l !== last) setLift((last = l));
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => {
      cancelAnimationFrame(frame);
      setLift(null);
      unring();
    };
  }, [target]);

  const toMain = () => document.getElementById("main-content")?.focus({ preventScroll: true });
  const onNext = () => {
    if (!who) return;
    const to = nextStep(who.id, who.steps);
    if (to) return navigate(to.path);
    toMain();
    toast({ title: DONE });
  };
  const onSkip = () => {
    if (!who) return;
    skipTour(who.id, who.steps);
    toMain();
    toast({ title: SKIPPED });
  };
  const onResume = () => {
    if (!who) return;
    const s = resumeTour(who.id, who.steps);
    if (s && stepForPath(pathname, who.steps) !== s.id) navigate(s.path);
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Escape" || !who) return;
    e.preventDefault(); // the dock's Esc stays put
    focusResume.current = true;
    pauseTour(who.id);
  };

  if (!who || !view || !step) return null;

  if (view === "pill")
    return (
      <div
        ref={box}
        role="group"
        aria-label="Tour"
        className={cn(
          PLACE,
          "flex w-fit max-w-[calc(100vw-32px)] items-center gap-1 rounded-full border border-border bg-background py-1 pl-4 pr-1 text-sm text-foreground shadow-lg",
        )}
      >
        <span className="min-w-0 truncate">
          Tour paused at step {n} of {TOTAL}
        </span>
        <Button ref={resumeBtn} type="button" variant="ghost" onClick={onResume} className="h-11 shrink-0 rounded-full px-3 font-semibold text-primary">
          Resume
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={onSkip}
          aria-label="Skip tour"
          title="Skip tour"
          className="h-11 w-11 shrink-0 rounded-full p-0 text-muted-foreground"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    );

  return (
    <div
      ref={box}
      role="dialog"
      aria-modal="false"
      aria-label={`Tour, step ${n} of ${TOTAL}`}
      onKeyDown={onKey}
      style={lift === null ? undefined : { bottom: lift }}
      className={cn(
        PLACE,
        "w-[calc(100vw-32px)] max-w-[520px] rounded-2xl border border-border bg-background p-4 text-foreground shadow-2xl motion-safe:duration-150 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2",
      )}
    >
      <p className="flex items-center gap-2 text-sm font-semibold">
        <span aria-hidden className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
          {who.agent ? <Sparkles className="h-3.5 w-3.5" /> : <Compass className="h-3.5 w-3.5" />}
        </span>
        {who.agent ? "Agent" : "Tour"} <span className="font-normal text-muted-foreground">{step.page}</span>
      </p>
      <p aria-live="polite" className="mt-2 text-sm leading-relaxed">
        {step.text}
      </p>
      <div className="mt-3 flex items-center justify-end gap-2">
        <span className="mr-auto text-xs text-muted-foreground">
          {n} of {TOTAL}
        </span>
        <Button type="button" variant="ghost" onClick={onSkip} className="h-11">
          Skip tour
        </Button>
        <Button ref={nextBtn} type="button" onClick={onNext} className="h-11 px-5">
          {n === TOTAL ? "Done" : "Next"}
        </Button>
      </div>
    </div>
  );
}
