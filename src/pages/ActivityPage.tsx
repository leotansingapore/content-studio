// Activity (/activity, Leo's sign-ins only; docs/north-star/items/agent-activity.md): everything that ran for the open
// brand, read from its synced rows (src/lib/activity.ts) with Plan and Autopilot events worked out from campaigns and
// autopilot weeks. view filters (replace); month loads back to that month and scrolls to it (replace); event opens
// one row (push, so Back closes it). The page loads this month and last; Show <Month> reaches older ones. The AI use
// tab reads 30 days of the account's own cs_ai_usage rows. Everyone else gets the 404 page.

import { useEffect, useReducer, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, Loader2 } from "lucide-react";
import CopyLinkButton from "@/components/CopyLinkButton";
import { Button } from "@/components/ui/button";
import {
  ACTIVITY_VIEWS,
  WHO_LABELS,
  absorbActivityInbox,
  activityMonths,
  aiUseRows,
  groupByWhen,
  inView,
  loadActivity,
  onActivityChanged,
  planRows,
  whenWords,
  type ActivityEvent,
  type ActivityView,
  type AiUseRow,
} from "@/lib/activity";
import { utcDay } from "@/lib/aiUsage";
import { AUTOPILOT_CHANGED, loadAutopilot } from "@/lib/autopilot";
import { loadCampaigns, onCampaignsChanged } from "@/lib/campaigns";
import { keyToDate, localDateKey } from "@/lib/dueDates";
import { links } from "@/lib/links";
import { priceOf, priceText } from "@/lib/prices";
import { supabase } from "@/lib/supabase";
import { useLeoUser } from "@/lib/useLeoOnly";
import { useGoneItem, useUrlItem, useUrlState } from "@/lib/urlState";
import { cn } from "@/lib/utils";
import NotFoundPage from "@/pages/NotFoundPage";
import type { UsageFeature } from "../../supabase/functions/_shared/usageCaps.ts";

const HEAD = "text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground";
const CELL = "px-2 py-2 sm:px-3";
const TOUCH = "[@media(pointer:coarse)]:min-h-11";
const VIEW_IDS = ACTIVITY_VIEWS.map((v) => v.id);
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const EMPTY_VIEW: Partial<Record<ActivityView, string>> = {
  agent: "Nothing from the agent yet.",
  you: "Nothing from you yet.",
  claude: "Nothing from Claude yet.",
  autopilot: "Nothing from autopilot yet.",
  schedule: "Nothing from scheduled runs yet.",
  learnings: "No learnings yet.",
  plan: "No plans yet.",
};
// shortcut: More shows past about two lines' worth of words, not a measured clamp; measure the box if it misjudges.
const LONG_DETAIL = 90;

const monthOf = (iso: string) => localDateKey(new Date(iso)).slice(0, 7);
const monthName = (m: string) => `${MONTH_NAMES[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
const prevMonth = (m: string) => {
  const y = Number(m.slice(0, 4));
  const n = Number(m.slice(5, 7));
  return n === 1 ? `${y - 1}-12` : `${y}-${String(n - 1).padStart(2, "0")}`;
};
/** Every month from `to` back to `from`, newest first. */
function monthsBack(to: string, from: string): string[] {
  const out: string[] = [];
  for (let m = to; m >= from && out.length < 240; m = prevMonth(m)) out.push(m);
  return out;
}
const fullTime = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true });

export default function ActivityPage() {
  const leo = useLeoUser();
  if (leo === undefined) return <div className="min-h-[40vh]" aria-busy="true" />;
  if (!leo) return <NotFoundPage notOnAccount />;
  return <Activity userId={leo.id} />;
}

function Activity({ userId }: { userId: string }) {
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    // rows Claude or a server run left since the last visit join this device's log
    absorbActivityInbox(userId);
    redraw();
    window.addEventListener(AUTOPILOT_CHANGED, redraw);
    const offs = [onActivityChanged(redraw), onCampaignsChanged(redraw), () => window.removeEventListener(AUTOPILOT_CHANGED, redraw)];
    // "5 min ago" moves on while the page is open
    const tick = window.setInterval(redraw, 60_000);
    return () => {
      offs.forEach((off) => off());
      window.clearInterval(tick);
    };
  }, [userId]);

  const [view, setView] = useUrlState<ActivityView>("view", "all", { allowed: VIEW_IDS });
  const [monthParam, setMonth] = useUrlState<string>("month", "");
  const [eventId, openEvent, closeEvent] = useUrlItem("event");

  const now = new Date();
  const thisMonth = localDateKey(now).slice(0, 7);
  const linkedMonth = /^\d{4}-(0[1-9]|1[0-2])$/.test(monthParam) && monthParam <= thisMonth ? monthParam : null;
  const plans = planRows(loadCampaigns(userId), loadAutopilot(userId), loadActivity(userId, activityMonths(userId)));
  const months = [...new Set([...activityMonths(userId), ...plans.map((e) => monthOf(e.at))])].sort().reverse();
  // a linked event in an older month loads back to it
  const linked = eventId ? [...loadActivity(userId, months), ...plans].find((e) => e.id === eventId) : undefined;
  const from = [prevMonth(thisMonth), linkedMonth, linked && monthOf(linked.at)].filter((m): m is string => !!m).sort()[0];
  const loaded = monthsBack(thisMonth, from);
  const events = [...loadActivity(userId, loaded), ...plans.filter((e) => loaded.includes(monthOf(e.at)))];
  const older = months.find((m) => m < from);
  const shown = events.filter((e) => inView(e, view));
  const groups = groupByWhen(shown, now);
  const tabs = ACTIVITY_VIEWS.filter((v) => v.id === "all" || v.id === "ai-use" || v.id === view || events.some((e) => inView(e, v.id)));

  useGoneItem("event", eventId ? !!linked : undefined, "event");
  // a pasted ?event= scrolls to its row and rings it for 2 seconds; More on the row opens it in place
  const tapped = useRef(false);
  const [ring, setRing] = useState<string | null>(null);
  const found = !!linked && shown.some((e) => e.id === linked.id);
  useEffect(() => {
    if (!eventId || !found) return;
    if (tapped.current) return void (tapped.current = false);
    document.getElementById(`event-${eventId}`)?.scrollIntoView({ block: "center" });
    setRing(eventId);
    const t = window.setTimeout(() => setRing(null), 2000);
    return () => window.clearTimeout(t);
  }, [eventId, found]);
  useEffect(() => {
    if (linkedMonth) document.getElementById(`group-${linkedMonth}`)?.scrollIntoView({ block: "start" });
  }, [linkedMonth]);
  const toggle = (id: string) => {
    tapped.current = true;
    if (eventId === id) closeEvent();
    else openEvent(id);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2">
        <h1 className="font-serif text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">Activity</h1>
        <CopyLinkButton label="Copy link to this view" />
      </div>

      <div className="-mx-1 overflow-x-auto px-1">
        <div className="flex w-max gap-1 border-b border-border/60" role="tablist" aria-label="Activity by who or what">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={view === t.id}
              onClick={() => setView(t.id)}
              className={cn(
                "-mb-px min-h-11 whitespace-nowrap border-b-2 px-3 text-sm font-medium",
                view === t.id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {view === "ai-use" ? (
        <AiUse />
      ) : !months.length && view === "all" ? (
        <div className="space-y-3 rounded-xl border border-border/60 bg-card p-5 shadow-card">
          <p className="text-sm">Nothing here yet. What you make, schedule or ask the agent to do shows up here.</p>
          <Button asChild>
            <Link to={links.generate()}>Write a post</Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          {!shown.length && view !== "all" && (
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm text-muted-foreground">{EMPTY_VIEW[view]}</p>
              <Button variant="outline" size="sm" className={TOUCH} onClick={() => setView("all")}>
                Show everything
              </Button>
            </div>
          )}
          {groups.length > 0 && (
            <div aria-hidden className={cn("hidden gap-x-4 px-3 md:grid md:grid-cols-[7.5rem_minmax(0,1.1fr)_6rem_minmax(0,1.3fr)_4.5rem]", HEAD)}>
              <span>When</span>
              <span>What happened</span>
              <span>Who</span>
              <span>Details</span>
            </div>
          )}
          {groups.map((g) => (
            <section key={g.key} id={`group-${g.key}`} aria-label={g.label} className="scroll-mt-20 space-y-1">
              <h2 className={cn(HEAD, "px-3")}>{g.label}</h2>
              <ul className="divide-y divide-border/60 rounded-xl border border-border/60 bg-card shadow-card">
                {g.events.map((e) => (
                  <Row key={e.id} e={e} now={now} open={eventId === e.id} ringed={ring === e.id} onToggle={() => toggle(e.id)} />
                ))}
              </ul>
            </section>
          ))}
          <div className="flex justify-center pt-1">
            {older ? (
              <Button variant="outline" className={TOUCH} onClick={() => setMonth(older)}>
                Show {monthName(older)}
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">That's everything.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ e, now, open, ringed, onToggle }: { e: ActivityEvent; now: Date; open: boolean; ringed: boolean; onToggle: () => void }) {
  const long = (e.detail?.length ?? 0) > LONG_DETAIL;
  return (
    <li
      id={`event-${e.id}`}
      className={cn(
        "grid scroll-mt-24 gap-x-4 gap-y-1 px-3 py-3 transition-shadow md:grid-cols-[7.5rem_minmax(0,1.1fr)_6rem_minmax(0,1.3fr)_4.5rem] md:items-baseline",
        ringed && "relative rounded-lg ring-2 ring-primary",
      )}
    >
      <p className="break-words text-sm font-medium md:col-start-2 md:row-start-1">{e.title}</p>
      <div className="flex items-center gap-2 md:contents">
        <span className="w-fit rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground md:col-start-3 md:row-start-1">{WHO_LABELS[e.who]}</span>
        <time dateTime={e.at} title={fullTime(e.at)} className="text-xs tabular-nums text-muted-foreground md:col-start-1 md:row-start-1">
          {whenWords(e.at, now)}
        </time>
      </div>
      <div className="min-w-0 md:col-start-4 md:row-start-1">
        {e.detail && <p className={cn("break-words text-sm text-muted-foreground", !open && "line-clamp-2")}>{e.detail}</p>}
        {long && (
          <button type="button" onClick={onToggle} aria-expanded={open} className={cn("min-h-9 text-xs font-semibold text-primary hover:underline", TOUCH)}>
            {open ? "Less" : "More"}
          </button>
        )}
      </div>
      {e.link && (
        <Link to={e.link} className={cn("inline-flex min-h-9 w-fit items-center gap-0.5 text-sm font-semibold text-primary hover:underline md:col-start-5 md:row-start-1 md:justify-self-end", TOUCH)}>
          Open<span className="sr-only">: {e.title}</span>
          <ChevronRight aria-hidden className="h-4 w-4" />
        </Link>
      )}
    </li>
  );
}

/** "About US$0.06" for the day's uses; Varies when the price needs the run's options; - for a cap with no price. */
function costText(feature: string, uses: number): string {
  const p = priceOf(feature as UsageFeature);
  if (p === "pick") return "Varies";
  return p ? priceText({ ...p, usd: p.usd * uses }) : "-";
}

const dayName = (day: string) => keyToDate(day).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });

function AiUse() {
  const [state, setState] = useState<AiUseRow[] | "loading" | "failed">("loading");
  const [tries, setTries] = useState(0);
  useEffect(() => {
    let live = true;
    setState("loading");
    const since = utcDay(new Date(Date.now() - 29 * 86_400_000));
    // the counters and claimOnce rows are left out here too, so they never crowd the 1,000-row page
    supabase
      .from("cs_ai_usage")
      .select("feature,day,count")
      .gte("day", since)
      .not("feature", "like", "%:%")
      .not("feature", "like", "%-global")
      .then(
        ({ data, error }) => live && setState(error || !Array.isArray(data) ? "failed" : aiUseRows(data)),
        () => live && setState("failed"),
      );
    return () => {
      live = false;
    };
  }, [tries]);

  if (state === "failed")
    return (
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-destructive">Couldn't read your AI use.</p>
        <Button variant="outline" size="sm" className={TOUCH} onClick={() => setTries((n) => n + 1)}>
          Try again
        </Button>
      </div>
    );
  return (
    <div className="space-y-3">
      <div className="relative overflow-x-auto rounded-xl border border-border/60 bg-card shadow-card">
        {state === "loading" && (
          <span className="absolute left-1/2 top-1/2 z-10 inline-flex -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 rounded-full border border-border/60 bg-background px-3 py-1 text-xs font-medium shadow-sm" role="status">
            <Loader2 aria-hidden className="h-3.5 w-3.5 animate-spin" /> Loading your AI use
          </span>
        )}
        {state !== "loading" && !state.length ? (
          <p className="p-5 text-sm text-muted-foreground">No AI used in the last 30 days.</p>
        ) : (
          <table className="w-full text-sm" aria-busy={state === "loading"}>
            <thead>
              <tr className={cn("border-b border-border/60 text-left", HEAD)}>
                <th scope="col" className={cn(CELL, "font-semibold")}>Day</th>
                <th scope="col" className={cn(CELL, "font-semibold")}>What</th>
                <th scope="col" className={cn(CELL, "text-right font-semibold")}>Uses</th>
                <th scope="col" className={cn(CELL, "text-right font-semibold")}>Daily limit</th>
                <th scope="col" className={cn(CELL, "text-right font-semibold")}>Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {state === "loading"
                ? Array.from({ length: 5 }, (_, i) => (
                    <tr key={i}>
                      <td colSpan={5} className={CELL}>
                        <div className="h-4 animate-pulse rounded bg-muted" />
                      </td>
                    </tr>
                  ))
                : state.map((r) => (
                    <tr key={`${r.day}-${r.feature}`}>
                      <td className={cn(CELL, "text-muted-foreground sm:whitespace-nowrap")}>{dayName(r.day)}</td>
                      <td className={CELL}>{r.label}</td>
                      <td className={cn(CELL, "text-right tabular-nums")}>{r.uses}</td>
                      <td className={cn(CELL, "text-right tabular-nums text-muted-foreground")}>{r.limit ?? "-"}</td>
                      <td className={cn(CELL, "text-right tabular-nums sm:whitespace-nowrap")}>{costText(r.feature, r.uses)}</td>
                    </tr>
                  ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="text-xs text-muted-foreground">Counts reset at 8am Singapore time. Failed jobs give their use back, so they are not counted.</p>
    </div>
  );
}
