// Searches on /trends (?view=search, Leo only; docs/north-star/items/find-search-topics.md): what people in Singapore
// search for around the brand's topics, read once a week. The check runs outside React (src/lib/searchTopics.ts);
// the filter (show) and the open topic (topic) live in the URL.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { ExternalLink, Loader2, PenLine, Plus, Search, X } from "lucide-react";
import CopyLinkButton from "@/components/CopyLinkButton";
import PriceChip from "@/components/PriceChip";
import { TrendChart } from "@/components/charts/TrendChart";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FilterChip as Chip } from "@/components/ui/filter-chip";
import { InfoTip } from "@/components/ui/info-tip";
import { Input } from "@/components/ui/input";
import { useUsesLeft } from "@/lib/aiUsage";
import { links } from "@/lib/links";
import { reasonText } from "@/lib/prices";
import {
  changeLabel, checkedLine, defaultSeeds, latestCheck, loadSearches, MAX_SEEDS, nextCheckDay, onSearchesChanged, onSearchJob, relatedTopics, runSearchCheck,
  saveSeeds, searchJob, searchWriteUrl, showTopics, type SearchCheck, type SearchTopic, type Show,
} from "@/lib/searchTopics";
import { useGoneItem, useUrlItem, useUrlState } from "@/lib/urlState";
import { dayWords } from "../../../supabase/functions/market/logic.ts";

// Refusals another press today can't fix, so they get no Try again.
const FINAL = ["daily_limit", "global_limit", "weekly_limit", "not_enabled", "not_configured"];
const SHOWS: Show[] = ["all", "rising", "gap"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const count = (n: number) => n.toLocaleString("en-SG");

/** A small line of the values, a fixed width on every screen; an empty box of the same size for fewer than 2. */
export function Sparkline({ values, label }: { values: number[]; label: string }) {
  const w = 96;
  const h = 28;
  const max = Math.max(...values, 1);
  const pts = values.map((v, i) => `${((i / Math.max(values.length - 1, 1)) * (w - 4) + 2).toFixed(1)},${(h - 2 - (v / max) * (h - 4)).toFixed(1)}`);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} className="shrink-0" role="img" aria-label={label}>
      {values.length > 1 && <polyline points={pts.join(" ")} fill="none" stroke="hsl(var(--primary))" strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />}
    </svg>
  );
}

/** The drawer both views open an item in: full screen on a phone, a centred panel from sm up, Escape and Back close it. */
export function TrendsDrawer({ title, onClose, children, actions }: { title: string; onClose: () => void; children: ReactNode; actions: ReactNode }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCloseRef.current();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      opener?.focus?.();
    };
  }, []);
  // Portalled to <body> like PostDetailDrawer: inside the page the sidebar's stacking context sits over the backdrop.
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-stretch justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" tabIndex={-1} aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" />
      <div className="relative flex h-full w-full flex-col overflow-hidden bg-background shadow-xl sm:h-auto sm:max-h-[92vh] sm:max-w-lg sm:rounded-2xl sm:border sm:border-border/70">
        <div className="flex items-start gap-3 border-b border-border/60 p-4">
          <h2 className="min-w-0 flex-1 break-words font-serif text-lg font-semibold leading-snug text-foreground">{title}</h2>
          <Button ref={closeRef} type="button" variant="ghost" size="icon" className="-mr-1 -mt-1 h-11 w-11 shrink-0" aria-label="Close" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">{children}</div>
        <div className="flex flex-wrap items-center gap-2 border-t border-border/60 p-4">{actions}</div>
      </div>
    </div>,
    document.body,
  );
}

function ChangeChip({ t }: { t: SearchTopic }) {
  const tone = t.trend === "rising" || t.trend === "new" ? "bg-success/10 text-success" : "bg-muted text-muted-foreground";
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${tone}`}>{changeLabel(t)}</span>;
}

const GapBadge = () => (
  <span title="Few YouTube videos on this from the last 90 days." className="inline-flex items-center rounded-full bg-warning/15 px-2 py-0.5 text-[11px] font-semibold text-warning">
    Few videos
  </span>
);

/** "Sep 26" for each of the 12 points, from the month the series ends on; "n months ago" without it. */
function monthLabels(lastMonth: string | null): string[] {
  if (!lastMonth) return Array.from({ length: 12 }, (_, i) => (i === 11 ? "Latest month" : `${11 - i} months before`));
  const [y, m] = lastMonth.split("-").map(Number);
  return Array.from({ length: 12 }, (_, i) => {
    const k = y * 12 + (m - 1) - (11 - i);
    return `${MONTHS[k % 12]} ${String(Math.floor(k / 12)).slice(2)}`;
  });
}

function TopicDrawer({ check, t, onOpen, onClose }: { check: SearchCheck; t: SearchTopic; onOpen: (slug: string) => void; onClose: () => void }) {
  const labels = monthLabels(t.lastMonth);
  const related = relatedTopics(check, t);
  return (
    <TrendsDrawer
      title={t.keyword}
      onClose={onClose}
      actions={
        <>
          <Button asChild className="flex-1 gap-1.5 [@media(pointer:coarse)]:h-11">
            <Link to={searchWriteUrl(t)}>
              <PenLine className="h-4 w-4" /> Make a post
            </Link>
          </Button>
          <CopyLinkButton path={links.trends({ view: "search", topic: t.slug })} label="Copy link to this topic" />
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium text-foreground">{count(t.volume)} searches a month</span>
        <ChangeChip t={t} />
        {t.gap && <GapBadge />}
      </div>
      <TrendChart
        points={t.series.map((v, i) => ({ id: String(i), label: labels[i], value: v, detail: "Google, Singapore" }))}
        format={(v) => v.toLocaleString("en-SG")}
        measure="searches"
        title={`Searches a month for ${t.keyword} over 12 months`}
        width={460}
        height={150}
      />
      <section className="space-y-1.5">
        <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">On YouTube</h3>
        {t.recentVideos === null ? (
          <p className="text-sm text-muted-foreground">Only the 10 most searched topics are checked on YouTube.</p>
        ) : (
          <>
            <p className="text-sm text-foreground">{t.recentVideos} of the top 20 videos are from the last 90 days.</p>
            {t.videos.length > 0 && (
              <ul className="space-y-1">
                {t.videos.map((v) => (
                  <li key={v.url}>
                    <a href={v.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-start gap-1.5 py-1 text-sm text-primary hover:underline sm:min-h-0">
                      <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span className="break-words">{v.title}</span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>
      {related.length > 0 && (
        <section className="space-y-1.5">
          <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Also searched, from "{t.seed}"</h3>
          <div className="flex flex-wrap gap-1.5">
            {related.map((o) => (
              <Chip key={o.slug} active={false} onClick={() => onOpen(o.slug)}>
                {o.keyword}
              </Chip>
            ))}
          </div>
        </section>
      )}
    </TrendsDrawer>
  );
}

function TopicRow({ t, onOpen }: { t: SearchTopic; onOpen: () => void }) {
  return (
    <li className="flex flex-col gap-2 rounded-lg border border-border/60 bg-card p-3 sm:flex-row sm:items-center sm:gap-4">
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 space-y-1 text-left [@media(pointer:coarse)]:min-h-11">
        <span className="block break-words font-medium text-foreground hover:text-primary">{t.keyword}</span>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span className="tabular-nums">{count(t.volume)} searches a month</span>
          <ChangeChip t={t} />
          {t.gap && <GapBadge />}
        </span>
      </button>
      <div className="flex items-center gap-3">
        <Sparkline values={t.series} label={`Searches over 12 months for ${t.keyword}`} />
        <Button asChild variant="outline" size="sm" className="ml-auto gap-1.5 [@media(pointer:coarse)]:h-11">
          <Link to={searchWriteUrl(t)}>
            <PenLine className="h-3.5 w-3.5" /> Make a post
          </Link>
        </Button>
      </div>
    </li>
  );
}

function TopicsField({ seeds, onChange, disabled }: { seeds: string[]; onChange: (next: string[]) => void; disabled: boolean }) {
  const [draft, setDraft] = useState("");
  const words = draft.replace(/\s+/g, " ").trim();
  const add = () => {
    if (words.length < 2 || seeds.some((s) => s.toLowerCase() === words.toLowerCase())) return;
    onChange([...seeds, words].slice(0, MAX_SEEDS));
    setDraft("");
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-sm text-muted-foreground">Your topics:</span>
      {seeds.map((s) => (
        <span key={s} className="inline-flex items-center gap-0.5 rounded-full border border-border/60 bg-muted/40 py-0.5 pl-3 pr-0.5 text-xs font-medium text-foreground">
          {s}
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange(seeds.filter((x) => x !== s))}
            aria-label={`Remove ${s}`}
            className="inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:text-foreground disabled:opacity-50 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </span>
      ))}
      {seeds.length < MAX_SEEDS && (
        <form
          className="flex items-center gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <Input value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={60} placeholder="Add a topic" aria-label="Add a topic" disabled={disabled} className="h-8 w-36 text-xs [@media(pointer:coarse)]:h-11" />
          <Button type="submit" variant="ghost" size="icon" aria-label="Add topic" disabled={disabled || words.length < 2} className="h-8 w-8 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11">
            <Plus className="h-4 w-4" />
          </Button>
        </form>
      )}
    </div>
  );
}

export default function SearchTopics({ userId }: { userId: string }) {
  const [show, setShow] = useUrlState<Show>("show", "all", { allowed: SHOWS });
  const [openSlug, openTopic, closeTopic] = useUrlItem("topic");
  // the job and the store live outside React: re-read both whenever either moves
  const [, setTick] = useState(0);
  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    const offJob = onSearchJob(bump);
    const offStore = onSearchesChanged(bump);
    return () => {
      offJob();
      offStore();
    };
  }, []);
  const [seeds, setSeeds] = useState(() => defaultSeeds(userId));
  const state = loadSearches(userId);
  const check = latestCheck(state);
  const job = searchJob();
  const running = job?.state === "running";
  const left = useUsesLeft(running)("search-topics");
  const next = nextCheckDay(state);
  const why = next ? `Checked this week. Next check from ${dayWords(next)}.` : !seeds.length ? "Add a topic first." : reasonText({ left, leo: true });
  const open = check && openSlug ? check.topics.find((t) => t.slug === openSlug) ?? null : null;
  // undefined until a check is here (it may still be syncing), so a link never drops its topic too early
  useGoneItem("topic", check ? Boolean(open) : undefined, "topic");

  const editSeeds = (nextSeeds: string[]) => {
    setSeeds(nextSeeds);
    saveSeeds(userId, nextSeeds);
  };
  const run = () => {
    if (running || !seeds.length || left === 0 || next) return;
    saveSeeds(userId, seeds);
    void runSearchCheck(userId);
  };

  const topics = check ? showTopics(check.topics, show) : [];
  const counts = check ? Object.fromEntries(SHOWS.map((s) => [s, showTopics(check.topics, s).length])) : {};

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-1.5">
        <h2 className="font-serif text-lg font-semibold tracking-tight text-foreground">What people in Singapore search for</h2>
        <InfoTip label="About these searches">Monthly Google searches in Singapore, read once a week.</InfoTip>
      </div>

      <Card className="border-border/60 shadow-card">
        <CardContent className="space-y-3 pt-5">
          {!check && <p className="text-sm text-foreground">Add up to {MAX_SEEDS} topics you post about.</p>}
          <TopicsField seeds={seeds} onChange={editSeeds} disabled={running} />
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <Button type="button" onClick={run} disabled={running || !seeds.length || left === 0 || Boolean(next)} className="gap-1.5 [@media(pointer:coarse)]:h-11">
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              {running ? "Checking..." : "Check searches"}
            </Button>
            {!running && !next && <PriceChip feature="search-topics" left={left} />}
            {why && !running && <span className="text-xs text-muted-foreground">{why}</span>}
          </div>
          {running && job && (
            <p className="text-sm text-muted-foreground" role="status" aria-live="polite">
              Reading searches for {job.seeds} topic{job.seeds === 1 ? "" : "s"}. This takes about 30 seconds.
            </p>
          )}
          {job?.state === "failed" && (
            <div className="flex flex-wrap items-center gap-2 text-sm" role="alert">
              <span className="text-destructive">{job.error}</span>
              {!FINAL.includes(job.code ?? "") && (
                <Button type="button" variant="outline" size="sm" onClick={run} disabled={!seeds.length || left === 0 || Boolean(next)} className="[@media(pointer:coarse)]:h-11">
                  Try again
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {check && (
        <div className="space-y-3">
          {check.topics.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter searches">
              <Chip active={show === "all"} count={counts.all} onClick={() => setShow("all")}>All</Chip>
              <Chip active={show === "rising"} count={counts.rising} onClick={() => setShow("rising")}>Rising</Chip>
              <Chip active={show === "gap"} count={counts.gap} onClick={() => setShow("gap")}>Few videos</Chip>
              <InfoTip label="About Few videos">Few YouTube videos on this from the last 90 days.</InfoTip>
            </div>
          )}
          {check.topics.length > 0 && !check.filtered && <p className="text-xs text-muted-foreground">Not filtered for fit this time.</p>}

          {check.topics.length === 0 ? (
            <Card className="border-border/60 shadow-card">
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                {check.filtered ? "None of the searches on these topics fit what you sell. Try other topics." : "Google has no Singapore search numbers for these topics. Try shorter, broader words."}
              </CardContent>
            </Card>
          ) : topics.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {show === "rising" ? "No rising topics this week." : "No gaps this week."}{" "}
              <button type="button" onClick={() => setShow("all")} className="font-medium text-primary hover:underline [@media(pointer:coarse)]:min-h-11">
                See all
              </button>
            </p>
          ) : (
            <ul className="space-y-2">
              {topics.map((t) => (
                <TopicRow key={t.slug} t={t} onOpen={() => openTopic(t.slug)} />
              ))}
            </ul>
          )}
          <p className="text-xs text-muted-foreground">{checkedLine(state)}</p>
        </div>
      )}

      {check && open && <TopicDrawer key={open.slug} check={check} t={open} onOpen={openTopic} onClose={closeTopic} />}
    </section>
  );
}
