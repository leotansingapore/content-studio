// MarketingNorthStarPage - /marketing-north-star: how we market the apps, and how far each piece is. Leo,
// 2026-10-26: "I really want to make this app marketing work". Fed by src/data/marketingNorthStar.ts; the long
// spec per card is docs/marketing-north-star/items/<id>.md (start at docs/marketing-north-star/README.md).
//
// Every view lives in the URL: ?q= ?status= ?area= ?phase= ?ask= ?app= ?open= (expanded parts), and every card
// has an anchor (#<id>). Leo's sign-ins only (src/lib/leoOnly.ts), like /north-star.

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { ChevronRight, ClipboardCopy, ExternalLink, FileText, Search, X } from "lucide-react";
import CopyLinkButton from "@/components/CopyLinkButton";
import NorthStarTabs from "@/components/NorthStarTabs";
import { FilterChip } from "@/components/ui/filter-chip";
import { InfoTip } from "@/components/ui/info-tip";
import { useToast } from "@/hooks/use-toast";
import { useLeoUser } from "@/lib/useLeoOnly";
import { useUrlList, useUrlSearch, useUrlState, useUrlUpdate } from "@/lib/urlState";
import { cn } from "@/lib/utils";
import NotFoundPage from "@/pages/NotFoundPage";
import {
  MK_APPS,
  MK_APP_PAGES,
  MK_AREAS,
  MK_AREA_ORDER,
  MK_ASKS,
  MK_DECISIONS,
  MK_ITEMS,
  MK_PHASES,
  MK_PRINCIPLES,
  MK_SKIP,
  MK_SOURCES,
  MK_STATUS_ORDER,
  MK_THESIS,
  mkBuildPrompt,
  mkSpecUrl,
  rollupMk,
  type MkApp,
  type MkItem,
  type MkStatus,
} from "@/data/marketingNorthStar";

const STATUS_META: Record<MkStatus, { label: string; chip: string; bar: string }> = {
  done: { label: "Done", chip: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300", bar: "bg-emerald-500" },
  started: { label: "Started", chip: "bg-amber-500/15 text-amber-800 dark:text-amber-300", bar: "bg-amber-400" },
  todo: { label: "Not started", chip: "bg-muted text-muted-foreground", bar: "bg-muted-foreground/25" },
};
const APP_ORDER = Object.keys(MK_APPS) as MkApp[];
/** Apps with cards on this page; the app filter shows only when there are two or more to pick between. */
const APP_CHIPS = APP_ORDER.filter((a) => a !== "all" && MK_ITEMS.some((i) => i.app === a));
/** Touch screens get 44 px targets (UX law 2) without bloating the desktop layout. */
const TOUCH = "[@media(pointer:coarse)]:min-h-11";

function StatusChip({ status }: { status: MkStatus }) {
  const s = STATUS_META[status];
  return <span className={cn("shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-bold", s.chip)}>{s.label}</span>;
}

/** One bar, three segments: done, started, not started. */
function ProgressBar({ items, className }: { items: MkItem[]; className?: string }) {
  const r = rollupMk(items);
  const total = items.length || 1;
  return (
    <div className={cn("flex h-2 w-full overflow-hidden rounded-full bg-muted", className)} aria-hidden>
      {(["done", "started", "todo"] as MkStatus[]).map((s) => (
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

function Section({ id, title, tip, children }: { id: string; title: string; tip?: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 space-y-2" aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`} className="text-sm font-bold">
        {title}
        {tip && (
          <span className="ml-1 inline-block align-middle">
            <InfoTip label={`About ${title.toLowerCase()}`}>{tip}</InfoTip>
          </span>
        )}
      </h2>
      {children}
    </section>
  );
}

function ItemCard({ item, highlighted }: { item: MkItem; highlighted: boolean }) {
  const { toast } = useToast();
  // Three lines a row until opened; a card a link points at (#id) arrives open.
  const [open, setOpen] = useState(highlighted);
  useEffect(() => {
    if (highlighted) setOpen(true);
  }, [highlighted]);
  const asks = MK_ASKS.filter((a) => a.items.includes(item.id));
  const copyPrompt = () =>
    navigator.clipboard.writeText(mkBuildPrompt(item)).then(
      () => toast({ title: "Prompt copied", description: "Paste it into a Claude session." }),
      () => toast({ title: "Copy failed", variant: "destructive" }),
    );
  return (
    <article
      id={item.id}
      data-testid="marketing-item"
      className={cn("scroll-mt-24 space-y-2.5 rounded-xl border bg-card p-3.5", highlighted && "ring-2 ring-primary")}
    >
      <div className="flex items-start gap-2">
        <h4 className="flex-1 text-sm font-bold leading-snug">{item.title}</h4>
        <StatusChip status={item.status} />
      </div>
      <dl className="space-y-1.5">
        <Row label="Why" clamp={!open}>
          {item.why}
        </Row>
        <Row label="We have" clamp={!open}>
          {item.ours}
        </Row>
        <Row label="To do" clamp={!open}>
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
      <div className="flex flex-wrap items-center gap-1.5">
        <a
          href={`#phase-${item.phase}`}
          className={cn("inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground hover:text-foreground", TOUCH)}
        >
          Phase {item.phase}
        </a>
        <span className="rounded-full border px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{MK_APPS[item.app]}</span>
        <span className="rounded-full border px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{item.owner}</span>
        {asks.map((a) => (
          <span key={a.id} className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
            Leo: {a.short}
          </span>
        ))}
      </div>
      <div className="-mx-1 flex items-center gap-1 border-t pt-1.5">
        <a
          href={mkSpecUrl(item.id)}
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
          Copy prompt
        </button>
        <span className="flex-1" />
        <CopyLinkButton path={`/marketing-north-star#${item.id}`} label={`Copy a link to ${item.title}`} />
      </div>
    </article>
  );
}

export default function MarketingNorthStarPage() {
  const leo = useLeoUser();
  useEffect(() => {
    document.title = "App marketing - North star";
  }, []);
  if (leo === undefined) return <div className="h-40 animate-pulse rounded-xl bg-muted/40" aria-busy="true" />;
  if (!leo) return <NotFoundPage />;
  return <MarketingNorthStar />;
}

const JUMPS: [string, string][] = [
  ["asks", "Asks"],
  ["apps", "App pages"],
  ["build-order", "Build order"],
  ["plan", "Plan"],
  ["decisions", "Decisions"],
  ["leave-out", "Left out"],
  ["sources", "Sources"],
];

function MarketingNorthStar() {
  const { hash } = useLocation();
  const update = useUrlUpdate();
  const [text, setText, q] = useUrlSearch("q");
  const [statusRaw] = useUrlState<string>("status", "");
  const [areaRaw] = useUrlState<string>("area", "");
  const [phaseRaw] = useUrlState<string>("phase", "");
  const [askRaw] = useUrlState<string>("ask", "");
  const [appRaw] = useUrlState<string>("app", "");
  const [openAreas, setOpenAreas] = useUrlList("open", { allowed: MK_AREA_ORDER });
  const status = MK_STATUS_ORDER.find((s) => s === statusRaw);
  const area = MK_AREA_ORDER.find((a) => a === areaRaw);
  const phase = MK_PHASES.find((p) => String(p.n) === phaseRaw);
  const ask = MK_ASKS.find((a) => a.id === askRaw);
  const app = APP_ORDER.find((a) => a === appRaw);
  const filtered = Boolean(q || status || area || phase || ask || app);
  const target = hash.slice(1);
  const targetArea = MK_ITEMS.find((i) => i.id === target)?.area;

  const planRef = useRef<HTMLElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  /** Filters above the list scroll it into view and move focus to it, or the tap looks like it did nothing. */
  const toPlan = () =>
    requestAnimationFrame(() => {
      planRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
      document.getElementById("plan-h")?.focus({ preventScroll: true });
    });
  const showOnly = (key: string, value: string) => {
    const on = new URLSearchParams(window.location.search).get(key) !== value;
    update({ [key]: on ? value : null });
    if (on) toPlan();
  };
  /** A removed filter's chip disappears under the pointer; focus goes to the search box instead of the body. */
  const unset = (changes: Record<string, string | null>) => {
    update(changes);
    searchRef.current?.focus();
  };
  const clearFilters = () => {
    setText("");
    unset({ q: null, status: null, area: null, phase: null, ask: null, app: null });
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
    return MK_ITEMS.filter((i) => {
      if (area && i.area !== area) return false;
      if (phase && i.phase !== phase.n) return false;
      if (ask && !ask.items.includes(i.id)) return false;
      if (app && i.app !== app) return false;
      if (!words.length) return true;
      const hay = [i.title, i.why, i.ours, i.build, i.question ?? "", i.id, i.owner, MK_APPS[i.app]].join(" ").toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [q, area, phase, ask, app]);
  const shown = status ? base.filter((i) => i.status === status) : base;
  const counts = rollupMk(base);
  const byArea = MK_AREA_ORDER.map((a) => ({ area: a, items: shown.filter((i) => i.area === a) })).filter((g) => g.items.length);
  const isOpen = (a: string) => filtered || openAreas.includes(a) || a === targetArea;
  const allOpen = MK_AREA_ORDER.every((a) => openAreas.includes(a));
  const all = rollupMk(MK_ITEMS);
  const next = MK_ITEMS.find((i) => i.status !== "done");

  return (
    <div className="mx-auto max-w-5xl space-y-8 pb-16" data-testid="marketing-north-star-page">
      <header className="space-y-3">
        <NorthStarTabs />
        <div className="flex items-start gap-2">
          <h1 className="flex flex-1 items-center gap-1.5 font-serif text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">
            App marketing
            <InfoTip label="About the marketing north star">How we market the apps, card by card, from the four videos Leo sent.</InfoTip>
          </h1>
          <CopyLinkButton />
        </div>
        <div className="space-y-1.5" data-testid="marketing-progress">
          <ProgressBar items={MK_ITEMS} className="h-2.5" />
          <p className="text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">
              {all.done} of {MK_ITEMS.length} done
            </span>
            , {all.started} started, {all.todo} not started
          </p>
        </div>
        {next && (
          <a href={`#${next.id}`} className="block rounded-xl border border-primary/40 bg-primary/5 p-3 transition-colors hover:bg-primary/10">
            <p className="text-[10px] font-bold uppercase tracking-wider text-primary">Next up</p>
            <p className="text-sm font-semibold leading-snug">{next.title}</p>
            <p className="text-xs text-muted-foreground">
              Phase {next.phase}, {next.owner}
            </p>
          </a>
        )}
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
          {MK_ASKS.map((a, n) => {
            const items = MK_ITEMS.filter((i) => a.items.includes(i.id));
            // An ask answered by the app pages, not by cards here, links to them instead of showing 0/0.
            if (!items.length)
              return (
                <li key={a.id}>
                  <a href="#apps" className="flex min-h-12 w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/40">
                    <span className="w-5 shrink-0 text-xs font-bold tabular-nums text-muted-foreground">{n + 1}</span>
                    <span className="min-w-0 flex-1 break-words text-sm leading-snug">
                      "{a.text}" <span className="whitespace-nowrap text-xs text-muted-foreground">{a.date}</span>
                    </span>
                    <span className="shrink-0 text-[11px] font-semibold text-primary">App pages</span>
                  </a>
                </li>
              );
            return (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => showOnly("ask", a.id)}
                  aria-pressed={ask?.id === a.id}
                  className={cn("flex min-h-12 w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/40", ask?.id === a.id && "bg-primary/5")}
                >
                  <span className="w-5 shrink-0 text-xs font-bold tabular-nums text-muted-foreground">{n + 1}</span>
                  <span className="min-w-0 flex-1 break-words text-sm leading-snug">
                    "{a.text}" <span className="whitespace-nowrap text-xs text-muted-foreground">{a.date}</span>
                  </span>
                  <span className="hidden w-24 sm:block">
                    <ProgressBar items={items} />
                  </span>
                  <span className="w-12 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                    {rollupMk(items).done}/{items.length}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </Section>

      <div className="space-y-2 rounded-2xl border bg-muted/20 p-4">
        {MK_THESIS.map((p) => (
          <p key={p.slice(0, 32)} className="text-sm leading-relaxed">
            {p}
          </p>
        ))}
      </div>

      <Section id="how-we-work" title="How we work">
        <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-muted-foreground">
          {MK_PRINCIPLES.map((p) => (
            <li key={p.slice(0, 32)}>{p}</li>
          ))}
        </ul>
      </Section>

      <Section id="apps" title="Each app's own page" tip="The cards for one app live in that app's repo, at /marketing-north-star.">
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {MK_APP_PAGES.map((p) => (
            <li key={p.app}>
              <a
                href={p.url}
                target="_blank"
                rel="noreferrer"
                className="flex h-full flex-col gap-1 rounded-xl border bg-card p-3 transition-colors hover:border-primary/50"
              >
                <span className="flex items-center gap-1.5 text-sm font-bold leading-snug">
                  <span className="flex-1">{p.label}</span>
                  {p.live ? <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden /> : <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">Being built</span>}
                </span>
                <span className="text-xs leading-snug text-muted-foreground">{p.note}</span>
              </a>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="build-order" title="Build order" tip="Tap a phase to see only its cards.">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {MK_PHASES.map((p) => {
            const items = MK_ITEMS.filter((i) => i.phase === p.n);
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
                  {rollupMk(items).done} of {items.length} done
                </p>
              </button>
            );
          })}
        </div>
      </Section>

      <section ref={planRef} id="plan" className="scroll-mt-24 space-y-3" aria-labelledby="plan-h">
        <div className="flex items-center gap-2">
          <h2 id="plan-h" tabIndex={-1} className="flex-1 text-sm font-bold outline-none">
            The plan <span className="font-normal tabular-nums text-muted-foreground">{shown.length}</span>
          </h2>
          {filtered ? (
            <button type="button" onClick={clearFilters} className="inline-flex min-h-11 items-center gap-1 text-xs font-semibold text-primary hover:underline">
              <X className="h-3.5 w-3.5" aria-hidden />
              Clear filters
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setOpenAreas(allOpen ? [] : MK_AREA_ORDER)}
              className="inline-flex min-h-11 items-center text-xs font-semibold text-primary hover:underline"
            >
              {allOpen ? "Close every part" : "Open every part"}
            </button>
          )}
        </div>
        <p className="sr-only" aria-live="polite">
          {shown.length} cards shown
        </p>
        <label className="flex h-11 items-center gap-2 rounded-lg border bg-background px-3 focus-within:ring-2 focus-within:ring-primary/40">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <input
            ref={searchRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Search cards, apps, owners"
            aria-label="Search the plan"
            className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none"
          />
        </label>
        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" role="group" aria-label="Filter by status">
          <FilterChip active={!status} onClick={() => update({ status: null })} count={base.length}>
            All
          </FilterChip>
          {MK_STATUS_ORDER.map((s) => (
            <FilterChip key={s} active={status === s} disabled={!counts[s] && status !== s} onClick={() => update({ status: status === s ? null : s })} count={counts[s]}>
              {STATUS_META[s].label}
            </FilterChip>
          ))}
        </div>
        {APP_CHIPS.length > 1 && (
          <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" role="group" aria-label="Filter by app">
            <FilterChip active={!app} onClick={() => update({ app: null })}>
              Every app
            </FilterChip>
            {APP_CHIPS.map((a) => (
              <FilterChip key={a} active={app === a} onClick={() => update({ app: app === a ? null : a })}>
                {MK_APPS[a]}
              </FilterChip>
            ))}
          </div>
        )}
        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" role="group" aria-label="Filter by part">
          <FilterChip active={!area} onClick={() => update({ area: null })}>
            Every part
          </FilterChip>
          {MK_AREA_ORDER.map((a) => (
            <FilterChip key={a} active={area === a} onClick={() => update({ area: area === a ? null : a })}>
              {MK_AREAS[a].label}
            </FilterChip>
          ))}
        </div>
        {(ask || phase) && (
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
              return (
                <div key={a} id={`area-${a}`} className="scroll-mt-24 rounded-xl border bg-muted/10" data-testid={`marketing-area-${a}`}>
                  <h3>
                    <button
                      type="button"
                      onClick={() => !filtered && setOpenAreas(openAreas.includes(a) ? openAreas.filter((x) => x !== a) : [...openAreas, a])}
                      aria-expanded={open}
                      aria-disabled={filtered}
                      className="flex min-h-12 w-full items-center gap-3 px-3 py-2.5 text-left"
                    >
                      <ChevronRight className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} aria-hidden />
                      <span className="flex-1 text-base font-bold">{MK_AREAS[a].label}</span>
                      <span className="hidden w-24 sm:block">
                        <ProgressBar items={items} />
                      </span>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {rollupMk(items).done}/{items.length}
                      </span>
                    </button>
                  </h3>
                  {open && (
                    <div className="space-y-2 px-3 pb-3">
                      <p className="text-xs text-muted-foreground">{MK_AREAS[a].hint}</p>
                      <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
                        {items.map((item) => (
                          <ItemCard key={item.id} item={item} highlighted={item.id === target} />
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

      <Section id="decisions" title="Decisions">
        <ol className="space-y-2">
          {MK_DECISIONS.map((d) => (
            <li key={d.id} id={d.id} className="scroll-mt-24 space-y-1 rounded-xl border bg-card p-3">
              <p className="text-sm font-semibold leading-snug">{d.question}</p>
              {d.decided ? (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  <span className="font-semibold text-emerald-700 dark:text-emerald-400">Decided:</span> {d.decided}
                </p>
              ) : (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  <span className="font-semibold text-foreground">Recommended:</span> {d.recommendation}
                </p>
              )}
              <p className="flex flex-wrap gap-1 pt-0.5">
                {d.items.map((id) => (
                  <a key={id} href={`#${id}`} className={cn("rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground hover:text-foreground", TOUCH)}>
                    {MK_ITEMS.find((i) => i.id === id)?.title ?? id}
                  </a>
                ))}
              </p>
            </li>
          ))}
        </ol>
      </Section>

      <Section id="leave-out" title="What we leave out">
        <ul className="divide-y rounded-xl border bg-card">
          {MK_SKIP.map((s) => (
            <li key={s.what} className="space-y-0.5 px-3 py-2.5">
              <p className="text-sm font-semibold leading-snug">{s.what}</p>
              <p className="text-xs leading-relaxed text-muted-foreground">{s.why}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="sources" title="Sources">
        <ul className="space-y-1">
          {MK_SOURCES.map((s) => (
            <li key={s.url}>
              <a href={s.url} target="_blank" rel="noreferrer" className={cn("inline-flex min-h-9 items-center gap-1.5 text-sm text-primary hover:underline", TOUCH)}>
                <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
                {s.label}
              </a>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
