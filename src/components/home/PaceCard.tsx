// Pace on Leo's Home (docs/north-star/items/learn-pace.md), in place of the This week card: views a day from the gains
// between real-number pulls (pace.ts), posts out against the weekly goal, and AI runs in the last 7 days. PaceView draws
// from props only; PaceCard reads the synced pace, the numbers job (realNumbers.ts, started by Home's open) and
// cs_ai_usage. /home#pace lands here.

import { useEffect, useMemo, useReducer, useState } from "react";
import { Link } from "react-router-dom";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";
import { readUsageWeek } from "@/lib/aiUsage";
import { links } from "@/lib/links";
import { changeLine, gaugeMax, loadPace, PACE_CHANGED, usualViews, viewsADay, type PaceState } from "@/lib/pace";
import { loadRealNumbers, numbersJob, onNumbers, refreshNumbers, type NumbersJob } from "@/lib/realNumbers";
import { socialConnectShown } from "@/lib/socialConnect";
import { cn } from "@/lib/utils";

export type AiWeek = Awaited<ReturnType<typeof readUsageWeek>>;

export const FAILED_LINE = "Couldn't read your views. Try again in a minute.";
const NO_ANALYTICS = "Analytics isn't on this Zernio plan.";
const TAG = "text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground";
const TAP = "[@media(pointer:coarse)]:min-h-11";
const DAY = 86_400_000;

export interface PaceProps {
  pace: PaceState;
  job: Pick<NumbersJob, "running" | "error">;
  /** Social accounts on for this sign-in and the open brand has one (false after a pull that found none). */
  connected: boolean;
  /** A 402 paused the pulls (it outlives the job's error across a reload). */
  paused: boolean;
  week: { posted: number; goal: number; scheduled: number };
  goalHit: boolean;
  /** undefined while it is read, null when it can't be. */
  runs: AiWeek | undefined;
  now: number;
  onEditGoal: () => void;
  onRetry: () => void;
}

const fmt = (n: number) => n.toLocaleString("en-GB");
const compact = (n: number) => new Intl.NumberFormat("en-GB", { notation: "compact" }).format(n);

/** "Updated 9:40 AM" inside a day, else "Updated Mon 19 Oct" (Singapore time). */
export function updatedLine(at: string, now: number): string {
  const t = Date.parse(at);
  const o: Intl.DateTimeFormatOptions =
    now - t > DAY ? { weekday: "short", day: "numeric", month: "short" } : { hour: "numeric", minute: "2-digit", hour12: true };
  return `Updated ${new Intl.DateTimeFormat(now - t > DAY ? "en-GB" : "en-US", { timeZone: "Asia/Singapore", ...o }).format(t).replace(",", "")}`;
}

/** The pull's trouble in words: the server's own line for 402 and 429 (the last number stays), else ours with a retry. */
function trouble(job: PaceProps["job"], paused: boolean): { line: string; retry: boolean } | null {
  const e = job.error;
  if (e?.status === 402 || e?.status === 429) return { line: e.message || NO_ANALYTICS, retry: false };
  if (e) return { line: FAILED_LINE, retry: true };
  return paused ? { line: NO_ANALYTICS, retry: false } : null;
}

/** A plain semicircle from 0 to max, the usual ticked, the needle coloured against it. */
function Gauge({ value, max, usual }: { value: number; max: number; usual: number | null }) {
  const at = (v: number, r: number) => {
    const a = Math.PI * (1 - Math.min(1, Math.max(0, v / max)));
    return [60 + r * Math.cos(a), 66 - r * Math.sin(a)];
  };
  const tone = !usual ? "text-muted-foreground" : value >= usual ? "text-success" : value < 0.7 * usual ? "text-warning" : "text-muted-foreground";
  const [nx, ny] = at(value, 40);
  const tick = usual ? [at(usual, 40), at(usual, 56), at(usual, 63)] : null;
  return (
    <svg viewBox="0 -8 120 88" className="h-auto w-32 shrink-0 sm:w-40" role="img" aria-label={`${fmt(value)} on a scale to ${fmt(max)}${usual ? `, usual ${fmt(usual)}` : ""}`}>
      <path d="M 12 66 A 48 48 0 0 1 108 66" fill="none" stroke="currentColor" strokeWidth="8" strokeLinecap="round" className="text-muted-foreground/25" />
      {tick && (
        <g className="text-foreground">
          <line x1={tick[0][0]} y1={tick[0][1]} x2={tick[1][0]} y2={tick[1][1]} stroke="currentColor" strokeWidth="2" />
          <text x={tick[2][0]} y={tick[2][1]} textAnchor="middle" fontSize="10" fill="currentColor">
            usual
          </text>
        </g>
      )}
      <line x1="60" y1="66" x2={nx} y2={ny} stroke="currentColor" strokeWidth="3" strokeLinecap="round" className={tone} />
      <circle cx="60" cy="66" r="4" fill="currentColor" className={tone} />
      <g className="text-muted-foreground" fill="currentColor" fontSize="10">
        <text x="12" y="79" textAnchor="middle">
          0
        </text>
        <text x="108" y="79" textAnchor="middle">
          {compact(max)}
        </text>
      </g>
    </svg>
  );
}

export function PaceView({ pace, job, connected, paused, week, goalHit, runs, now, onEditGoal, onRetry }: PaceProps) {
  const views = viewsADay(pace);
  const usual = usualViews(pace);
  const problem = trouble(job, paused);
  const loading = connected && !pace.last && !problem;
  const change = changeLine(views, usual);
  const booked = goalHit ? "Goal hit" : week.scheduled > 0 ? `${week.scheduled} booked` : week.posted === 0 ? "Nothing booked yet" : null;
  const number = (n: number) => (
    <Link to={links.analytics({ section: "real-numbers" })} className="font-serif text-4xl font-semibold leading-none tabular-nums text-foreground hover:underline">
      {fmt(n)}
    </Link>
  );

  return (
    <section id="pace" aria-labelledby="pace-label" className="scroll-mt-20 rounded-2xl border border-border/70 bg-card p-4 shadow-card">
      <div className="flex min-h-9 items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <h2 id="pace-label" className={TAG}>
            PACE
          </h2>
          <InfoTip label="About pace">Views your posts gained each day, from your connected accounts.</InfoTip>
        </div>
        {connected && pace.last && (
          <p className="text-xs tabular-nums text-muted-foreground" aria-live="polite">
            {job.running ? "Updating..." : updatedLine(pace.last.at, now)}
          </p>
        )}
      </div>

      <div className="mt-2 flex items-end justify-between gap-4" aria-live="polite">
        {loading ? (
          <div className="min-w-0 space-y-2" aria-busy="true">
            <span className="inline-flex rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">Reading your views...</span>
            <div className="h-9 w-28 animate-pulse rounded-md bg-muted" />
            <div className="h-3 w-40 animate-pulse rounded bg-muted" />
          </div>
        ) : !connected ? (
          <div className="min-w-0 space-y-2">
            <p className="font-serif text-4xl font-semibold leading-none text-muted-foreground">-</p>
            <p className="text-sm text-muted-foreground">Connect an account to see views a day.</p>
            <Button asChild variant="outline" size="sm" className={TAP}>
              <Link to={links.accounts()}>Connect an account</Link>
            </Button>
          </div>
        ) : (
          <div className="min-w-0 space-y-1">
            {!pace.last ? (
              <p className="font-serif text-4xl font-semibold leading-none text-muted-foreground">-</p>
            ) : views === null ? (
              <>
                <p className="text-sm font-semibold text-foreground">Counting from today.</p>
                <p className="text-xs text-muted-foreground">Views a day shows tomorrow.</p>
              </>
            ) : views === 0 ? (
              <>
                {number(0)}
                <p className="text-xs text-muted-foreground">No views yet.</p>
              </>
            ) : (
              <>
                {number(views)}
                <p className="text-xs text-muted-foreground">views a day, last 7 days</p>
                {change && <p className={cn("text-xs font-medium", usual && views >= usual ? "text-success" : "text-foreground")}>{change}</p>}
              </>
            )}
            {problem && (
              <p className="pt-1 text-xs text-muted-foreground">
                {problem.line}
                {problem.retry && (
                  <Button variant="link" size="sm" className={cn("ml-1 h-auto p-0 text-xs", TAP)} onClick={onRetry}>
                    Try again
                  </Button>
                )}
              </p>
            )}
          </div>
        )}
        {connected && pace.last && <Gauge value={views ?? 0} max={gaugeMax(views, usual)} usual={usual} />}
      </div>

      <div className="mt-4 grid grid-cols-2 border-t border-border/70 pt-3">
        <div className="min-w-0 pr-3">
          <div className="flex min-h-9 items-center justify-between gap-1">
            <h3 className={TAG}>POSTS OUT</h3>
            {week.goal > 0 && (
              <Button variant="ghost" size="icon" className="-my-1 -mr-2 h-9 w-9 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11" onClick={onEditGoal} aria-label="Edit weekly goal">
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
          <Link to={links.calendar({ view: "week" })} className={cn("inline-flex min-h-9 items-center text-sm font-semibold tabular-nums text-foreground hover:underline", TAP)}>
            {week.goal > 0 ? `${week.posted} of ${week.goal} this week` : `${week.posted} this week`}
          </Link>
          {booked && <p className={cn("text-xs", goalHit ? "font-medium text-success" : "text-muted-foreground")}>{booked}</p>}
          {week.goal === 0 && (
            <Button variant="link" size="sm" className="h-9 px-0 text-xs [@media(pointer:coarse)]:h-11" onClick={onEditGoal}>
              Set a weekly goal
            </Button>
          )}
        </div>
        <div className="min-w-0 border-l border-border/70 pl-3">
          <h3 className={cn(TAG, "flex min-h-9 items-center")}>AI RUNS, LAST 7 DAYS</h3>
          {runs === undefined ? (
            <div className="flex min-h-9 items-center" aria-busy="true">
              <div className="h-5 w-10 animate-pulse rounded bg-muted" />
            </div>
          ) : runs === null ? (
            <>
              <p className="flex min-h-9 items-center text-sm font-semibold text-muted-foreground">-</p>
              <p className="text-xs text-muted-foreground">Couldn't read</p>
            </>
          ) : (
            <>
              <p className="flex min-h-9 items-center text-sm font-semibold tabular-nums text-foreground">{fmt(runs.total)}</p>
              {runs.most && <p className="truncate text-xs text-muted-foreground">Most: {runs.most.feature.replace(/-/g, " ")} ({fmt(runs.most.n)})</p>}
            </>
          )}
        </div>
      </div>
    </section>
  );
}

interface Props {
  userId: string;
  week: PaceProps["week"];
  goalHit: boolean;
  /** Opens Home's weekly goal editor, which takes this card's place. */
  onEditGoal: () => void;
}

export default function PaceCard({ userId, week, goalHit, onEditGoal }: Props) {
  // the job's listeners and the pace saver both just say "read again"
  const [tick, reread] = useReducer((n: number) => n + 1, 0);
  const [runs, setRuns] = useState<AiWeek | undefined>(undefined);
  useEffect(() => {
    let live = true;
    void readUsageWeek().then((r) => live && setRuns(r));
    const off = onNumbers(reread);
    window.addEventListener(PACE_CHANGED, reread);
    return () => {
      live = false;
      off();
      window.removeEventListener(PACE_CHANGED, reread);
    };
  }, []);

  const now = Date.now();
  const { pace, pulled, paused } = useMemo(() => {
    const rn = loadRealNumbers(userId);
    return { pace: loadPace(userId), pulled: !!rn.at, paused: !!rn.pausedUntil && Date.parse(rn.pausedUntil) > Date.now() };
  }, [userId, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const job = numbersJob(userId);
  // a pull that landed with no account records no pace, so after a reload "pulled but no pace" means none connected
  const none = job.none || (pulled && !pace.last && !job.running && !job.error);

  return (
    <PaceView
      pace={pace}
      job={job}
      connected={socialConnectShown() && !none}
      paused={paused}
      week={week}
      goalHit={goalHit}
      runs={runs}
      now={now}
      onEditGoal={onEditGoal}
      onRetry={() => void refreshNumbers(userId)}
    />
  );
}
