// NorthStarPage - /north-star: the app we keep building towards. Leo, 2026-10-19: "the idea is that one can
// remix any content format and the ai will regenerate", measured against 126 competitors and his screen
// recording of Fastlane. Fed by src/data/northStar.ts; a session that ships an item flips its status there.
// The long spec per card is docs/north-star/items/<id>.md (start at docs/north-star/README.md).
//
// Every view lives in the URL (docs/deep-links.md): ?q= ?status= ?area= ?phase= ?ask= ?seen= (a competitor)
// ?open= (expanded parts) ?cat= (competitor category, slug) ?competitors=all ?frame= (the open recording
// frame) ?at= (the scrubber's second), and every card has an anchor (#<id>). Leo's sign-ins only
// (src/lib/leoOnly.ts).

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import { ChevronLeft, ChevronRight, ClipboardCopy, ExternalLink, FileText, Search, X } from "lucide-react";
import CopyLinkButton from "@/components/CopyLinkButton";
import NorthStarTabs from "@/components/NorthStarTabs";
import { FilterChip } from "@/components/ui/filter-chip";
import { InfoTip } from "@/components/ui/info-tip";
import { useToast } from "@/hooks/use-toast";
import { leoOnly } from "@/lib/leoOnly";
import { supabase } from "@/lib/supabase";
import { useUrlFlag, useUrlItem, useUrlLabel, useUrlList, useUrlSearch, useUrlState, useUrlUpdate } from "@/lib/urlState";
import { cn } from "@/lib/utils";
import NotFoundPage from "@/pages/NotFoundPage";
import {
  NS_AREAS,
  NS_AREA_ORDER,
  NS_ASKS,
  NS_DECISIONS,
  NS_ITEMS,
  NS_PHASES,
  NS_PRINCIPLES,
  NS_SKIP,
  NS_SOURCES,
  NS_THESIS,
  NS_DOGFOOD,
  RECORDINGS,
  buildPrompt,
  frameRef,
  frameSrc,
  parseFrame,
  frameLabel,
  rollup,
  specUrl,
  type NsDogfoodPost,
  type NsItem,
  type NsRecording,
  type NsStatus,
} from "@/data/northStar";
import { NS_COMPETITORS, NS_COMPETITOR_CATEGORIES } from "@/data/northStarCompetitors";

const STATUS_ORDER: NsStatus[] = ["missing", "partial", "live"];
const STATUS_META: Record<NsStatus, { label: string; chip: string; bar: string }> = {
  live: { label: "Built", chip: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300", bar: "bg-emerald-500" },
  partial: { label: "Partly built", chip: "bg-amber-500/15 text-amber-800 dark:text-amber-300", bar: "bg-amber-400" },
  missing: { label: "Not built", chip: "bg-muted text-muted-foreground", bar: "bg-muted-foreground/25" },
};
const competitorName = new Map(NS_COMPETITORS.map((c) => [c.id, c.name]));

function StatusChip({ status }: { status: NsStatus }) {
  const s = STATUS_META[status];
  return <span className={cn("shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-bold", s.chip)}>{s.label}</span>;
}

/** One bar, three segments: built, partly built, to build. */
function ProgressBar({ items, className }: { items: NsItem[]; className?: string }) {
  const r = rollup(items);
  const total = items.length || 1;
  return (
    <div className={cn("flex h-2 w-full overflow-hidden rounded-full bg-muted", className)} aria-hidden>
      {(["live", "partial", "missing"] as NsStatus[]).map((s) => (
        <div key={s} className={STATUS_META[s].bar} style={{ width: `${(r[s] / total) * 100}%` }} />
      ))}
    </div>
  );
}

function Row({ label, children, clamp }: { label: string; children: ReactNode; clamp?: boolean }) {
  return (
    <div className="grid grid-cols-[72px_1fr] gap-2 text-xs sm:grid-cols-[88px_1fr]">
      <dt className="font-semibold text-muted-foreground">{label}</dt>
      <dd className={cn("leading-relaxed", clamp && "line-clamp-3")}>{children}</dd>
    </div>
  );
}

function Section({ id, title, tip, children, action }: { id: string; title: string; tip?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 space-y-2" aria-labelledby={`${id}-h`}>
      <div className="flex items-center gap-1.5">
        <h2 id={`${id}-h`} className="flex-1 text-sm font-bold">
          {title}
          {tip && (
            <span className="ml-1 inline-block align-middle">
              <InfoTip label={`About ${title.toLowerCase()}`}>{tip}</InfoTip>
            </span>
          )}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Touch screens get 44 px targets (UX law 2) without bloating the desktop layout. */
const TOUCH = "[@media(pointer:coarse)]:min-h-11";

/** The listed second at or after `t` in a recording ("t011" -> "t013"); past the end, the last one. */
function nearestIn(rec: NsRecording, t: string): string {
  const s = Number(t.replace(/^t/, ""));
  if (!Number.isFinite(s)) return rec.frames[0];
  return rec.frames.find((x) => Number(x.slice(1)) >= s) ?? rec.frames[rec.frames.length - 1];
}

/** A frame ref that lands on a listed frame, so an old or hand-typed second still opens. */
function nearestFrame(ref: string | null): string | null {
  if (!ref) return null;
  const [id, t] = ref.includes(":") ? ref.split(":") : ["tour", ref];
  const rec = RECORDINGS.find((r) => r.id === id) ?? null;
  if (!rec || !t) return null;
  return frameRef(rec, nearestIn(rec, t));
}

function ItemCard({
  item,
  highlighted,
  seenId,
  onSeen,
  onFrame,
}: {
  item: NsItem;
  highlighted: boolean;
  seenId: string | undefined;
  onSeen: (id: string) => void;
  onFrame: (f: string) => void;
}) {
  const { toast } = useToast();
  // Three lines a row until opened; a card a link points at (#id) arrives open.
  const [open, setOpen] = useState(highlighted);
  useEffect(() => {
    if (highlighted) setOpen(true);
  }, [highlighted]);
  const asks = NS_ASKS.filter((a) => a.items.includes(item.id));
  const copyPrompt = () =>
    navigator.clipboard.writeText(buildPrompt(item)).then(
      () => toast({ title: "Build prompt copied", description: "Paste it into a Claude session." }),
      () => toast({ title: "Copy failed", variant: "destructive" }),
    );
  return (
    <article
      id={item.id}
      data-testid="north-star-item"
      className={cn("scroll-mt-24 space-y-2.5 rounded-xl border bg-card p-3.5", highlighted && "ring-2 ring-primary")}
    >
      <div className="flex items-start gap-2">
        <h4 className="flex-1 text-sm font-bold leading-snug">{item.title}</h4>
        <StatusChip status={item.status} />
      </div>
      {item.frames && item.frames.length > 0 && (
        <div className="-m-1 flex gap-1.5 overflow-x-auto p-1">
          {item.frames.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => onFrame(f)}
              className="relative shrink-0 overflow-hidden rounded-md border bg-muted transition-opacity hover:opacity-90"
              aria-label={`Open the Fastlane recording at ${frameLabel(f)}`}
            >
              <img src={frameSrc(f)} alt="" loading="lazy" width={160} height={90} className="h-[72px] w-[128px] object-cover object-top" />
              <span className="absolute bottom-0.5 right-0.5 rounded bg-black/70 px-1 text-[9px] font-semibold tabular-nums text-white">
                {frameLabel(f)}
              </span>
            </button>
          ))}
        </div>
      )}
      <dl className="space-y-1.5">
        <Row label="Best seen" clamp={!open}>
          {item.they}
        </Row>
        <Row label="We have" clamp={!open}>
          {item.ours}
        </Row>
        <Row label="To build" clamp={!open}>
          {item.build}
        </Row>
        {item.question && open && (
          <Row label="Your call">
            <span className="text-muted-foreground">{item.question}</span>
          </Row>
        )}
      </dl>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={cn("min-h-9 text-xs font-semibold text-muted-foreground hover:text-foreground", TOUCH)}
      >
        {open ? "Show less" : item.question ? "Show more and your call" : "Show more"}
      </button>
      {item.seenIn.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-0.5 text-[10px] font-semibold text-muted-foreground">Seen in</span>
          {item.seenIn.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => onSeen(c)}
              aria-pressed={seenId === c}
              className={cn(
                "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium hover:border-primary/40 hover:text-foreground",
                seenId === c ? "border-primary/60 bg-primary/10 text-primary" : "text-muted-foreground",
                TOUCH,
              )}
            >
              {competitorName.get(c) ?? c}
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        <a
          href={`#phase-${item.phase}`}
          className={cn("inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground hover:text-foreground", TOUCH)}
        >
          Phase {item.phase}
        </a>
        {asks.map((a) => (
          <span key={a.id} className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
            Leo: {a.short}
          </span>
        ))}
      </div>
      <div className="-mx-1 flex items-center gap-1 border-t pt-1.5">
        <a
          href={specUrl(item.id)}
          target="_blank"
          rel="noreferrer"
          className={cn("inline-flex min-h-9 items-center gap-1 rounded-md px-2 text-xs font-semibold text-primary hover:underline", TOUCH)}
        >
          <FileText className="h-3.5 w-3.5" aria-hidden />
          Spec
        </a>
        <button
          type="button"
          onClick={copyPrompt}
          className={cn("inline-flex min-h-9 items-center gap-1 rounded-md px-2 text-xs font-semibold text-primary hover:underline", TOUCH)}
        >
          <ClipboardCopy className="h-3.5 w-3.5" aria-hidden />
          Copy build prompt
        </button>
        <span className="flex-1" />
        <CopyLinkButton path={`/north-star#${item.id}`} label={`Copy a link to ${item.title}`} />
      </div>
    </article>
  );
}

/**
 * The open recording frame, full size. Moving shows the next second at once and writes ?frame= 300 ms after
 * the last move: WebKit (Safari, every iPhone browser) throws past 100 history.replaceState calls in 10 s.
 */
function FrameViewer({ frame, onSettle, onClose }: { frame: string; onSettle: (f: string) => void; onClose: () => void }) {
  const [cur, setCur] = useState(frame);
  useEffect(() => setCur(frame), [frame]);
  useEffect(() => {
    if (cur === frame) return;
    const t = window.setTimeout(() => onSettle(cur), 300);
    return () => window.clearTimeout(t);
  }, [cur, frame, onSettle]);
  const p = parseFrame(cur);
  const list = p ? p.rec.frames.map((t) => frameRef(p.rec, t)) : [];
  const i = list.indexOf(cur);
  const prev = i > 0 ? list[i - 1] : null;
  const next = i >= 0 && i < list.length - 1 ? list[i + 1] : null;
  const closeRef = useRef<HTMLButtonElement>(null);
  // Once: focus Close, park the page behind (inert keeps Tab inside the dialog), and give focus back on close.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const root = document.getElementById("root");
    root?.setAttribute("inert", "");
    closeRef.current?.focus();
    return () => {
      root?.removeAttribute("inert");
      opener?.focus?.();
    };
  }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.repeat) return;
      if (e.key === "ArrowLeft" && prev) setCur(prev);
      if (e.key === "ArrowRight" && next) setCur(next);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [prev, next, onClose]);
  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();
  // Portalled to the body so the studio header, the phone tab bar and the Ask button stay underneath.
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Fastlane recording at ${frameLabel(cur)}`}
      className="fixed inset-0 z-[200] flex flex-col bg-black/95 p-3 sm:p-6"
      onClick={onClose}
    >
      <div className="mx-auto flex w-full max-w-6xl items-center gap-2 pb-2 text-white" onClick={stop}>
        <p className="min-w-0 flex-1 truncate text-sm font-semibold tabular-nums">
          {p?.rec.label ?? "Fastlane"}, {frameLabel(cur)}
        </p>
        <a href={frameSrc(cur)} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-1 rounded-md px-2 text-xs font-semibold hover:bg-white/10">
          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          Full size
        </a>
        <button
          type="button"
          disabled={!prev}
          onClick={() => prev && setCur(prev)}
          aria-label={prev ? `Back to ${frameLabel(prev)}` : "Back"}
          className="grid h-11 w-11 place-items-center rounded-md hover:bg-white/10 disabled:opacity-30"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <button
          type="button"
          disabled={!next}
          onClick={() => next && setCur(next)}
          aria-label={next ? `On to ${frameLabel(next)}` : "On"}
          className="grid h-11 w-11 place-items-center rounded-md hover:bg-white/10 disabled:opacity-30"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
        <button ref={closeRef} type="button" onClick={onClose} aria-label="Close" className="grid h-11 w-11 place-items-center rounded-md hover:bg-white/10">
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <img src={frameSrc(cur)} alt={`Fastlane screen at ${frameLabel(cur)}`} onClick={stop} className="max-h-full max-w-full rounded-md object-contain" />
      </div>
    </div>,
    document.body,
  );
}

/** Leo's Fastlane recordings, one frame a second. ?rec= picks one, ?at= keeps the second, written once a drag settles. */
function Recording({ onOpen }: { onOpen: (f: string) => void }) {
  const [recId] = useUrlState<string>("rec", RECORDINGS[0].id, { allowed: RECORDINGS.map((r) => r.id) });
  const update = useUrlUpdate();
  const rec = RECORDINGS.find((r) => r.id === recId) ?? RECORDINGS[0];
  const [at, setAt] = useUrlState<string>("at", rec.frames[0]);
  const fromUrl = Math.max(0, rec.frames.indexOf(nearestIn(rec, at)));
  const [pos, setPos] = useState(fromUrl);
  useEffect(() => setPos(fromUrl), [fromUrl]);
  useEffect(() => {
    if (pos === fromUrl) return;
    const t = window.setTimeout(() => setAt(rec.frames[pos]), 300);
    return () => window.clearTimeout(t);
  }, [pos, fromUrl, setAt, rec]);
  const t = rec.frames[Math.min(pos, rec.frames.length - 1)];
  const ref = frameRef(rec, t);
  const chapter = [...rec.chapters].reverse().find((c) => c.at <= Number(t.slice(1)));
  return (
    <div className="space-y-2 rounded-xl border bg-card p-3">
      <div className="-mx-3 flex gap-1.5 overflow-x-auto px-3 pb-1" role="group" aria-label="Pick a recording">
        {RECORDINGS.map((r) => (
          <FilterChip key={r.id} active={r.id === rec.id} onClick={() => update({ rec: r.id === RECORDINGS[0].id ? null : r.id, at: null })}>
            {r.label} <span className="text-muted-foreground">{r.date.replace(" 2026", "")}</span>
          </FilterChip>
        ))}
      </div>
      <button type="button" onClick={() => onOpen(ref)} className="block w-full overflow-hidden rounded-md border bg-muted" aria-label={`Open the frame at ${frameLabel(t)} full size`}>
        <img src={frameSrc(ref)} alt={`${rec.label} at ${frameLabel(t)}`} className="aspect-video w-full object-cover object-top" />
      </button>
      <div className="flex items-center gap-3">
        <span className="w-10 shrink-0 text-xs font-semibold tabular-nums">{frameLabel(t)}</span>
        <input
          type="range"
          min={0}
          max={rec.frames.length - 1}
          value={Math.min(pos, rec.frames.length - 1)}
          onChange={(e) => setPos(Number(e.target.value))}
          aria-label="Second of the recording"
          aria-valuetext={frameLabel(t)}
          className="h-11 flex-1 accent-primary"
        />
        <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{frameLabel(rec.frames[rec.frames.length - 1])}</span>
      </div>
      <ol className="max-h-56 space-y-0.5 overflow-y-auto border-t pt-2" aria-label="Chapters">
        {rec.chapters.map((c) => {
          const near = nearestIn(rec, `t${c.at}`);
          return (
            <li key={c.at}>
              <button
                type="button"
                onClick={() => setPos(rec.frames.indexOf(near))}
                aria-current={chapter?.at === c.at}
                className={cn(
                  "flex min-h-9 w-full items-baseline gap-2 rounded-md px-2 py-1 text-left text-xs hover:bg-muted/50",
                  TOUCH,
                  chapter?.at === c.at ? "font-semibold text-foreground" : "text-muted-foreground",
                )}
              >
                <span className="w-9 shrink-0 tabular-nums">{frameLabel(`t${c.at}`)}</span>
                <span>{c.text}</span>
              </button>
            </li>
          );
        })}
      </ol>
      <a href={rec.notes} target="_blank" rel="noreferrer" className={cn("inline-flex min-h-9 items-center gap-1 text-xs font-semibold text-primary hover:underline", TOUCH)}>
        <FileText className="h-3.5 w-3.5" aria-hidden />
        Second-by-second notes
      </a>
    </div>
  );
}

function DogfoodRow({ p, onFrame }: { p: NsDogfoodPost; onFrame: (f: string) => void }) {
  return (
    <li className="grid grid-cols-[2rem_1fr] gap-2 px-3 py-2 text-xs sm:grid-cols-[2rem_7rem_1fr]">
      <span className="font-semibold tabular-nums text-muted-foreground">{p.n}</span>
      <span className="col-start-2 text-muted-foreground sm:col-start-auto">
        {p.date}
        <br className="hidden sm:block" />
        <span className="sm:hidden">, </span>
        {p.format}
      </span>
      <span className="col-start-2 min-w-0 sm:col-start-auto">
        <span className={cn(p.kind === "ai" && "text-muted-foreground")}>{p.hook}</span>{" "}
        <span className="text-muted-foreground">{p.angle}.</span>
        {p.note && <span className="block text-muted-foreground">{p.note}.</span>}
        {p.frame && (
          <button type="button" onClick={() => onFrame(p.frame!)} className={cn("ml-1 inline-flex items-center font-semibold text-primary hover:underline", TOUCH)}>
            See it
          </button>
        )}
        {p.slides && (
          <span className="mt-1.5 flex gap-1 overflow-x-auto pb-1">
            {p.slides.map((src, i) => (
              <a key={src} href={src} target="_blank" rel="noreferrer" className="shrink-0" aria-label={`Open slide ${i + 1} of ${p.hook}`}>
                <img src={src} alt="" loading="lazy" className="h-24 w-[3.375rem] rounded border object-cover" />
              </a>
            ))}
          </span>
        )}
      </span>
    </li>
  );
}

export default function NorthStarPage() {
  const [email, setEmail] = useState<string | null>(null);
  useEffect(() => {
    document.title = "North star - Postmosis";
    // getSession reads the stored session; no Auth round trip just to read an email.
    supabase.auth.getSession().then(({ data }) => setEmail(data.session?.user.email ?? ""));
  }, []);
  if (email === null) return <div className="h-40 animate-pulse rounded-xl bg-muted/40" aria-busy="true" />;
  // DEV only (dropped from production builds): ?asLeo=1 lets a demo sign-in check the page on localhost.
  const devAsLeo = import.meta.env.DEV && new URLSearchParams(window.location.search).has("asLeo");
  if (!leoOnly(email) && !devAsLeo) return <NotFoundPage />;
  return <NorthStar />;
}

const JUMPS: [string, string][] = [
  ["asks", "Asks"],
  ["areas", "Parts"],
  ["build-order", "Build order"],
  ["spec", "Spec"],
  ["recording", "Recording"],
  ["competitors", "Competitors"],
  ["dogfood", "Dogfood"],
  ["decisions", "Decisions"],
  ["leave-out", "Left out"],
];
const FIRST_COMPETITORS = 12;

function NorthStar() {
  const { hash } = useLocation();
  const update = useUrlUpdate();
  const [text, setText, q] = useUrlSearch("q");
  const [statusRaw] = useUrlState<string>("status", "");
  const [areaRaw] = useUrlState<string>("area", "");
  const [phaseRaw] = useUrlState<string>("phase", "");
  const [askRaw] = useUrlState<string>("ask", "");
  const [seenRaw] = useUrlState<string>("seen", "");
  const [cat, setCat] = useUrlLabel("cat", NS_COMPETITOR_CATEGORIES);
  const [allCompetitors, setAllCompetitors] = useUrlFlag("competitors", "all");
  const [openAreas, setOpenAreas] = useUrlList("open", { allowed: NS_AREA_ORDER });
  const [frameRaw, openFrame, closeFrame] = useUrlItem("frame");
  const frame = nearestFrame(frameRaw);
  const status = STATUS_ORDER.find((s) => s === statusRaw);
  const area = NS_AREA_ORDER.find((a) => a === areaRaw);
  const phase = NS_PHASES.find((p) => String(p.n) === phaseRaw);
  const ask = NS_ASKS.find((a) => a.id === askRaw);
  const seen = NS_COMPETITORS.find((c) => c.id === seenRaw);
  const filtered = Boolean(q || status || area || phase || ask || seen);
  const target = hash.slice(1);
  const targetArea = NS_ITEMS.find((i) => i.id === target)?.area;

  const specRef = useRef<HTMLElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  /** Filters below the fold scroll the list into view and move focus to it, or the tap looks like it did nothing. */
  const toSpec = () =>
    requestAnimationFrame(() => {
      specRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
      document.getElementById("spec-h")?.focus({ preventScroll: true });
    });
  const showOnly = (key: string, value: string) => {
    const on = new URLSearchParams(window.location.search).get(key) !== value;
    update({ [key]: on ? value : null });
    if (on) toSpec();
  };
  /** A removed filter's chip disappears under the pointer; focus goes to the search box instead of the body. */
  const unset = (changes: Record<string, string | null>) => {
    update(changes);
    searchRef.current?.focus();
  };
  const clearFilters = () => {
    setText("");
    unset({ q: null, status: null, area: null, phase: null, ask: null, seen: null });
  };

  // A shared link lands on its card (#id) once the list has painted.
  useEffect(() => {
    if (!target) return;
    const t = window.setTimeout(() => document.getElementById(target)?.scrollIntoView({ block: "start" }), 60);
    return () => window.clearTimeout(t);
  }, [target]);

  /** Everything but the status filter, so the status chips count what the other filters leave. */
  const base = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return NS_ITEMS.filter((i) => {
      if (area && i.area !== area) return false;
      if (phase && i.phase !== phase.n) return false;
      if (ask && !ask.items.includes(i.id)) return false;
      if (seen && !i.seenIn.includes(seen.id)) return false;
      if (!words.length) return true;
      const hay = [i.title, i.they, i.ours, i.build, i.question ?? "", i.id, ...i.seenIn.map((c) => competitorName.get(c) ?? c)].join(" ").toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [q, area, phase, ask, seen]);
  const shown = status ? base.filter((i) => i.status === status) : base;
  const counts = rollup(base);
  const byArea = NS_AREA_ORDER.map((a) => ({ area: a, items: shown.filter((i) => i.area === a) })).filter((g) => g.items.length);
  const isOpen = (a: string) => filtered || openAreas.includes(a) || a === targetArea;
  const allOpen = NS_AREA_ORDER.every((a) => openAreas.includes(a));
  const all = rollup(NS_ITEMS);
  const itemsOf = (id: string) => NS_ITEMS.filter((i) => i.seenIn.includes(id)).length;
  const catList = NS_COMPETITORS.filter((c) => !cat || c.categories.includes(cat));
  const showAllCompetitors = Boolean(cat) || allCompetitors || target.startsWith("competitor-");
  const competitors = showAllCompetitors ? catList : catList.slice(0, FIRST_COMPETITORS);
  const onSettle = useCallback((f: string) => update({ frame: f }), [update]);

  return (
    <div className="mx-auto max-w-5xl space-y-8 pb-16" data-testid="north-star-page">
      <header className="space-y-3">
        <NorthStarTabs />
        <div className="flex items-start gap-2">
          <h1 className="flex flex-1 items-center gap-1.5 font-serif text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">
            North star
            <InfoTip label="About the north star">The app we keep building towards, measured against 126 competitors.</InfoTip>
          </h1>
          <CopyLinkButton />
        </div>
        <div className="space-y-1.5" data-testid="north-star-progress">
          <ProgressBar items={NS_ITEMS} className="h-2.5" />
          <p className="text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">
              {all.live} of {NS_ITEMS.length} built
            </span>
            , {all.partial} partly built, {all.missing} not built
          </p>
        </div>
        <nav aria-label="On this page" className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
          {JUMPS.map(([id, label]) => (
            <a
              key={id}
              href={`#${id}`}
              className={cn("inline-flex min-h-9 shrink-0 items-center whitespace-nowrap rounded-full border px-3 text-xs font-medium text-muted-foreground hover:border-primary/40 hover:text-foreground", TOUCH)}
            >
              {label}
            </a>
          ))}
        </nav>
      </header>

      <Section id="asks" title="What Leo asked for">
        <ol className="divide-y rounded-xl border bg-card">
          {NS_ASKS.map((a, n) => {
            const items = NS_ITEMS.filter((i) => a.items.includes(i.id));
            return (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => showOnly("ask", a.id)}
                  aria-pressed={ask?.id === a.id}
                  className={cn("flex min-h-12 w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/40", ask?.id === a.id && "bg-primary/5")}
                >
                  <span className="w-5 shrink-0 text-xs font-bold tabular-nums text-muted-foreground">{n + 1}</span>
                  <span className="flex-1 text-sm leading-snug">
                    "{a.text}" <span className="whitespace-nowrap text-xs text-muted-foreground">{a.date}</span>
                  </span>
                  <span className="hidden w-24 sm:block">
                    <ProgressBar items={items} />
                  </span>
                  <span className="w-12 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                    {rollup(items).live}/{items.length}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </Section>

      <div className="space-y-2 rounded-2xl border bg-muted/20 p-4">
        {NS_THESIS.map((p) => (
          <p key={p.slice(0, 32)} className="text-sm leading-relaxed">
            {p}
          </p>
        ))}
      </div>

      <Section id="how-we-build" title="How we build it">
        <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-muted-foreground">
          {NS_PRINCIPLES.map((p) => (
            <li key={p.slice(0, 32)}>{p}</li>
          ))}
        </ul>
      </Section>

      <Section id="areas" title="The parts" tip="Tap a part to see only its items.">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {NS_AREA_ORDER.map((a) => {
            const items = NS_ITEMS.filter((i) => i.area === a);
            return (
              <button
                key={a}
                type="button"
                onClick={() => showOnly("area", a)}
                aria-pressed={area === a}
                className={cn("space-y-1.5 rounded-xl border bg-card p-3 text-left transition-colors hover:border-primary/50", area === a && "border-primary ring-1 ring-primary")}
              >
                <p className="text-sm font-bold leading-snug">{NS_AREAS[a].label}</p>
                <p className="line-clamp-2 text-xs leading-snug text-muted-foreground">{NS_AREAS[a].hint}</p>
                <ProgressBar items={items} />
                <p className="text-[11px] tabular-nums text-muted-foreground">
                  {rollup(items).live} of {items.length} built
                </p>
              </button>
            );
          })}
        </div>
      </Section>

      <Section id="build-order" title="Build order">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {NS_PHASES.map((p) => {
            const items = NS_ITEMS.filter((i) => i.phase === p.n);
            return (
              <button
                key={p.n}
                id={`phase-${p.n}`}
                type="button"
                onClick={() => showOnly("phase", String(p.n))}
                aria-pressed={phase?.n === p.n}
                className={cn("scroll-mt-24 space-y-1.5 rounded-xl border bg-card p-3 text-left transition-colors hover:border-primary/50", phase?.n === p.n && "border-primary ring-1 ring-primary")}
              >
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Phase {p.n}</p>
                <p className="text-sm font-bold leading-snug">{p.title}</p>
                <p className="text-xs leading-snug text-muted-foreground">{p.goal}</p>
                <ProgressBar items={items} />
                <p className="text-[11px] tabular-nums text-muted-foreground">
                  {rollup(items).live} of {items.length} built
                </p>
              </button>
            );
          })}
        </div>
      </Section>

      <section ref={specRef} id="spec" className="scroll-mt-24 space-y-3" aria-labelledby="spec-h">
        <div className="flex items-center gap-2">
          <h2 id="spec-h" tabIndex={-1} className="flex-1 text-sm font-bold outline-none">
            The spec <span className="font-normal tabular-nums text-muted-foreground">{shown.length}</span>
          </h2>
          {filtered ? (
            <button type="button" onClick={clearFilters} className="inline-flex min-h-11 items-center gap-1 text-xs font-semibold text-primary hover:underline">
              <X className="h-3.5 w-3.5" aria-hidden />
              Clear filters
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setOpenAreas(allOpen ? [] : NS_AREA_ORDER)}
              className="inline-flex min-h-11 items-center text-xs font-semibold text-primary hover:underline"
            >
              {allOpen ? "Close every part" : "Open every part"}
            </button>
          )}
        </div>
        <p className="sr-only" aria-live="polite">
          {shown.length} items shown
        </p>
        <label className="flex h-11 items-center gap-2 rounded-lg border bg-background px-3 focus-within:ring-2 focus-within:ring-primary/40">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <input
            ref={searchRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Search items, competitors, files"
            aria-label="Search the spec"
            className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none"
          />
        </label>
        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" role="group" aria-label="Filter by status">
          <FilterChip active={!status} onClick={() => update({ status: null })} count={base.length}>
            All
          </FilterChip>
          {STATUS_ORDER.map((s) => (
            <FilterChip
              key={s}
              active={status === s}
              disabled={!counts[s] && status !== s}
              onClick={() => update({ status: status === s ? null : s })}
              count={counts[s]}
            >
              {STATUS_META[s].label}
            </FilterChip>
          ))}
        </div>
        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" role="group" aria-label="Filter by part">
          <FilterChip active={!area} onClick={() => update({ area: null })}>
            Every part
          </FilterChip>
          {NS_AREA_ORDER.map((a) => (
            <FilterChip key={a} active={area === a} onClick={() => update({ area: area === a ? null : a })}>
              {NS_AREAS[a].label}
            </FilterChip>
          ))}
        </div>
        {(ask || phase || seen) && (
          <div className="flex flex-wrap gap-1.5">
            {ask && (
              <FilterChip active onClick={() => unset({ ask: null })}>
                Leo: {ask.short} <X className="h-3 w-3" aria-hidden />
              </FilterChip>
            )}
            {phase && (
              <FilterChip active onClick={() => unset({ phase: null })}>
                Phase {phase.n}: {phase.title} <X className="h-3 w-3" aria-hidden />
              </FilterChip>
            )}
            {seen && (
              <FilterChip active onClick={() => unset({ seen: null })}>
                Seen in {seen.name} <X className="h-3 w-3" aria-hidden />
              </FilterChip>
            )}
          </div>
        )}

        {byArea.length === 0 ? (
          <div className="space-y-2 rounded-xl border border-dashed p-6 text-center">
            <p className="text-sm text-muted-foreground">Nothing matches these filters.</p>
            <button type="button" onClick={clearFilters} className="min-h-11 text-xs font-semibold text-primary hover:underline">
              Clear filters
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {byArea.map(({ area: a, items }) => {
              const open = isOpen(a);
              const r = rollup(items);
              return (
                <div key={a} id={`area-${a}`} className="scroll-mt-24 rounded-xl border bg-muted/10" data-testid={`north-star-area-${a}`}>
                  <h3>
                    <button
                      type="button"
                      onClick={() => !filtered && setOpenAreas(openAreas.includes(a) ? openAreas.filter((x) => x !== a) : [...openAreas, a])}
                      aria-expanded={open}
                      aria-disabled={filtered}
                      className="flex min-h-12 w-full items-center gap-3 px-3 py-2.5 text-left"
                    >
                      <ChevronRight className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} aria-hidden />
                      <span className="flex-1 text-base font-bold">{NS_AREAS[a].label}</span>
                      <span className="hidden w-24 sm:block">
                        <ProgressBar items={items} />
                      </span>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {r.live}/{items.length}
                      </span>
                    </button>
                  </h3>
                  {open && (
                    <div className="space-y-2 px-3 pb-3">
                      <p className="text-xs text-muted-foreground">{NS_AREAS[a].hint}</p>
                      <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
                        {items.map((item) => (
                          <ItemCard
                            key={item.id}
                            item={item}
                            highlighted={item.id === target}
                            seenId={seen?.id}
                            onSeen={(c) => showOnly("seen", c)}
                            onFrame={openFrame}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <Section id="recording" title="The Fastlane recordings" tip="Leo's screen recordings of Fastlane on 19 and 20 Oct, one frame a second.">
        <Recording onOpen={openFrame} />
      </Section>

      <Section id="competitors" title={`Competitors (${NS_COMPETITORS.length})`} tip="Tap a count to see the items where that competitor sets the bar.">
        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" role="group" aria-label="Filter competitors by kind">
          <FilterChip active={!cat} onClick={() => setCat(null)} count={NS_COMPETITORS.length}>
            All
          </FilterChip>
          {NS_COMPETITOR_CATEGORIES.map((c) => (
            <FilterChip key={c} active={cat === c} onClick={() => setCat(cat === c ? null : c)} count={NS_COMPETITORS.filter((x) => x.categories.includes(c)).length}>
              {c}
            </FilterChip>
          ))}
        </div>
        <ul className="divide-y rounded-xl border bg-card">
          {competitors.map((c) => {
            const n = itemsOf(c.id);
            return (
              <li key={c.id} id={`competitor-${c.id}`} className="grid scroll-mt-24 gap-1 px-3 py-2.5 sm:grid-cols-[180px_1fr_auto] sm:gap-3">
                <div className="min-w-0">
                  <a href={c.url} target="_blank" rel="noreferrer" className={cn("inline-flex items-center gap-1 text-sm font-semibold hover:underline", TOUCH)}>
                    {c.name}
                    <ExternalLink className="h-3 w-3 text-muted-foreground" aria-hidden />
                  </a>
                  <p className="text-[11px] text-muted-foreground">{c.categories.join(", ")}</p>
                </div>
                <div className="min-w-0 space-y-0.5 text-xs leading-relaxed">
                  <p>{c.positioning}</p>
                  {c.pricing && <p className="text-muted-foreground">{c.pricing}</p>}
                </div>
                {n ? (
                  <button
                    type="button"
                    onClick={() => showOnly("seen", c.id)}
                    aria-pressed={seen?.id === c.id}
                    className={cn("inline-flex min-h-9 items-center self-start whitespace-nowrap rounded-md px-2 text-xs font-semibold text-primary hover:underline", TOUCH)}
                  >
                    In {n} item{n === 1 ? "" : "s"}
                  </button>
                ) : (
                  <span className="self-start whitespace-nowrap px-2 py-2 text-xs text-muted-foreground">{c.features} features</span>
                )}
              </li>
            );
          })}
        </ul>
        {!cat && catList.length > FIRST_COMPETITORS && (
          <button
            type="button"
            onClick={() => setAllCompetitors(!allCompetitors)}
            aria-expanded={showAllCompetitors}
            className="inline-flex min-h-11 items-center text-xs font-semibold text-primary hover:underline"
          >
            {showAllCompetitors ? `Show the first ${FIRST_COMPETITORS}` : `Show all ${catList.length}`}
          </button>
        )}
      </Section>

      <Section id="dogfood" title="Dogfood: activity-tracker.io" tip="Our posts for Activity Tracker against the 28 Fastlane made for it.">
        <div className="space-y-3 rounded-xl border bg-card p-3">
          <p className="text-sm leading-relaxed">{NS_DOGFOOD.fastlane.summary}</p>
          <div>
            <p className="text-xs font-bold">What we have to beat</p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-xs leading-relaxed text-muted-foreground">
              {NS_DOGFOOD.toBeat.map((x) => (
                <li key={x.slice(0, 24)}>{x}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-lg border border-dashed p-3 text-xs leading-relaxed">
            <p className="font-bold">Ours</p>
            {NS_DOGFOOD.ours.length ? (
              <>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground">
                  {NS_DOGFOOD.results.map((x) => (
                    <li key={x.slice(0, 24)}>{x}</li>
                  ))}
                </ul>
                <ol className="mt-2 divide-y">
                  {NS_DOGFOOD.ours.map((p) => (
                    <DogfoodRow key={p.n} p={p} onFrame={openFrame} />
                  ))}
                </ol>
              </>
            ) : (
              <p className="mt-1 text-muted-foreground">{NS_DOGFOOD.plan}</p>
            )}
          </div>
        </div>
        <details className="group rounded-xl border bg-card">
          <summary className={cn("flex min-h-12 cursor-pointer list-none items-center gap-2 px-3 text-sm font-semibold", TOUCH)}>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" aria-hidden />
            Fastlane's {NS_DOGFOOD.fastlane.posts.length} posts, as drafted on 20 Oct
          </summary>
          <ol className="divide-y border-t">
            {NS_DOGFOOD.fastlane.posts.map((p) => (
              <DogfoodRow key={p.n} p={p} onFrame={openFrame} />
            ))}
          </ol>
        </details>
      </Section>

      <Section id="decisions" title="Decisions">
        <ol className="space-y-2">
          {NS_DECISIONS.map((d) => (
            <li key={d.id} id={d.id} className="scroll-mt-24 space-y-1 rounded-xl border bg-card p-3">
              <p className="text-sm font-semibold leading-snug">{d.question}</p>
              {d.decided ? (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  <span className="font-semibold text-emerald-700 dark:text-emerald-400">Decided:</span> {d.decided}
                </p>
              ) : (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  <span className="font-semibold text-foreground">Recommended:</span> {d.recommend}
                </p>
              )}
            </li>
          ))}
        </ol>
      </Section>

      <Section id="leave-out" title="What we leave out">
        <ul className="divide-y rounded-xl border bg-card">
          {NS_SKIP.map((s) => (
            <li key={s.what} className="space-y-0.5 px-3 py-2.5">
              <p className="text-sm font-semibold">{s.what}</p>
              <p className="text-xs leading-relaxed text-muted-foreground">{s.why}</p>
            </li>
          ))}
        </ul>
      </Section>

      <footer className="space-y-1 border-t pt-4">
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Sources</h2>
        <ul className="space-y-1 text-xs text-muted-foreground">
          {NS_SOURCES.map((s) => (
            <li key={s.url}>
              <a href={s.url} target="_blank" rel="noreferrer" className={cn("inline-flex items-center font-semibold text-primary hover:underline", TOUCH)}>
                {s.label}
              </a>{" "}
              {s.note}
            </li>
          ))}
        </ul>
      </footer>

      {frame && <FrameViewer frame={frame} onSettle={onSettle} onClose={closeFrame} />}
    </div>
  );
}
