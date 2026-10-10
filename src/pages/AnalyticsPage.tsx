import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import {
  engagement,
  draftStatus,
  loadDrafts,
  setDraftMetrics,
  type PostMetrics,
} from "@/lib/draftHistory";
import {
  getTrackedPosts,
  getTrend,
  getBreakdown,
  getLengthCorrelation,
  getInsights,
  hashtagRanking,
  postingTimeGrid,
  bestCell,
  bestTimePosts,
  MIN_PLATFORM_POSTS,
  DAYPARTS,
  DAY_LABELS,
  comparePeriods,
  rankPosts,
  withinDays,
  postsCsv,
  reachMultiple,
  commentRatio,
  type Followers,
  type RankMetric,
  type TrackedPost,
  labelForDimension,
  MIN_GROUP_SAMPLE,
  type BreakdownDimension,
  type Insight,
} from "@/lib/analytics";
import { RankBars, type RankBarRow } from "@/components/charts/RankBars";
import { TrendChart, type TrendChartPoint } from "@/components/charts/TrendChart";
import { TimeHeatmap } from "@/components/charts/TimeHeatmap";
import { InfoTip } from "@/components/ui/info-tip";
import LabelMixCard from "@/components/LabelMixCard";
import { labelMix, loadLabels, type Label as ContentLabel } from "@/lib/labels";
import { timeLabel } from "@/lib/dueDates";
import { loadGoals, sgDay } from "@/lib/goals";
import { loadFollowing } from "@/lib/following";
import { scoped } from "@/lib/profiles";
import { callFn } from "@/lib/edgeFn";
import {
  moverLine,
  pctChange,
  reportFacts,
  sharedLine,
  weekMoves,
  weekReport,
  type MoveId,
  type ReportPost,
} from "../../supabase/functions/notify/logic.ts";
import CreatorLookup from "@/components/CreatorLookup";
import AccountAudit from "@/components/AccountAudit";
import RecruitNumbers from "@/components/recruit/RecruitNumbers";
import { normalizeHandle, type AuditPlatform } from "@/lib/accountAudit";
import {
  SOCIAL_PLATFORMS,
  loadFollowers,
  loadSocialAccounts,
  setFollowers,
  setSocialAccount,
  type FollowerCounts,
  connectedCount,
  accountUrl,
  type SocialAccounts,
  type SocialPlatform,
} from "@/lib/socialAccounts";
import {
  BarChart3,
  Eye,
  Heart,
  TrendingUp,
  TrendingDown,
  Linkedin,
  Instagram,
  Facebook,
  Video,
  Plug,
  Check,
  ExternalLink,
  ArrowRight,
  Lightbulb,
  Info,
  Ruler,
  CalendarDays,
  Download,
  Hash,
} from "lucide-react";

const HOUR_NAMES = Array.from({ length: 24 }, (_, h) => timeLabel(`${String(h).padStart(2, "0")}:00`));
const HOUR_HEADS = HOUR_NAMES.map((n, h) => (h % 3 === 0 ? n : ""));
const DAYPART_NAMES = DAYPARTS.map((d) => d.label);

const ACCOUNT_ICON: Record<SocialPlatform, typeof Linkedin> = {
  linkedin: Linkedin,
  tiktok: Video,
  instagram: Instagram,
  facebook: Facebook,
};

const PLATFORM_LABEL: Record<string, string> = {
  linkedin: "LinkedIn",
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
};

const LENGTH_LABEL: Record<string, string> = {
  good: "Sweet spot",
  warn: "A bit long",
  over: "Too long",
};

// Top posts show the number they are ranked by.
const RANK_UNIT: Record<RankMetric, string> = {
  engagementTotal: "engagements",
  engagementRate: "engagement rate",
  impressions: "impressions",
  reactions: "reactions",
  comments: "comments",
  shares: "shares",
  reachMultiple: "your followers",
  commentRatio: "comments per like",
};
function rankValue(d: TrackedPost, metric: RankMetric, followers: Followers): string {
  if (metric === "engagementRate") return `${d.engagementRate}%`;
  if (metric === "reachMultiple") return `${reachMultiple(d, followers)}x`;
  if (metric === "commentRatio") return String(commentRatio(d));
  const n = metric === "engagementTotal" ? engagement(d.metrics) : metric === "impressions" ? d.impressions : d.metrics?.[metric] ?? 0;
  return n.toLocaleString();
}

const DIMENSION_TABS: { id: BreakdownDimension; label: string }[] = [
  { id: "platform", label: "Platform" },
  { id: "pillar", label: "Pillar" },
  { id: "format", label: "Format" },
  { id: "hookFormula", label: "Hook formula" },
];

const INSIGHT_STYLE: Record<
  Insight["tone"],
  { icon: typeof Lightbulb; card: string; icon_: string }
> = {
  positive: {
    icon: TrendingUp,
    card: "border-success/30 bg-success/[0.05]",
    icon_: "bg-success/10 text-success",
  },
  negative: {
    icon: TrendingDown,
    card: "border-destructive/30 bg-destructive/[0.05]",
    icon_: "bg-destructive/10 text-destructive",
  },
  tip: {
    icon: Lightbulb,
    card: "border-primary/20 bg-primary/[0.04]",
    icon_: "bg-primary/10 text-primary",
  },
  neutral: {
    icon: Info,
    card: "border-border/60 bg-muted/20",
    icon_: "bg-muted text-muted-foreground",
  },
};

// On the cards the period pills don't filter.
function AllTimeTag() {
  return (
    <span className="whitespace-nowrap rounded-full border border-border/70 bg-muted/40 px-2 py-0.5 font-sans text-[10px] font-semibold leading-4 uppercase tracking-[0.12em] text-muted-foreground">
      All time
    </span>
  );
}

function Stat({
  icon: Icon,
  value,
  label,
  tint,
  delta,
}: {
  icon: typeof Eye;
  value: string;
  label: string;
  tint: string;
  /** % change against the previous period; null = nothing to compare to. */
  delta?: number | null;
}) {
  return (
    <Card className="border-border/60 shadow-card">
      <CardContent className="flex items-center gap-3 py-4">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tint}`}>
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <div className="font-serif text-2xl font-semibold leading-none text-foreground">
            {value}
          </div>
          <div className="mt-1 text-xs leading-tight text-muted-foreground">{label}</div>
          {delta !== undefined && delta !== null && (
            <div className={`mt-0.5 text-[11px] font-semibold ${delta > 0 ? "text-success" : delta < 0 ? "text-destructive" : "text-muted-foreground"}`}>
              {delta > 0 ? "+" : ""}{delta}% vs previous
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

const METRIC_FIELDS = [
  ["impressions", "Impressions"],
  ["reactions", "Reactions"],
  ["comments", "Comments"],
  ["shares", "Shares"],
] as const;

// Editable number cell for the bulk metrics table. Saves when you leave it.
function MetricInput({
  value,
  onChange,
  onSave,
  placeholder,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  onSave: () => void;
  placeholder: string;
  label: string;
}) {
  return (
    <input
      type="number"
      min="0"
      inputMode="numeric"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onSave}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      aria-label={label}
      placeholder={placeholder}
      className="h-9 w-full min-w-14 rounded-md border border-border/70 bg-background px-2 text-right text-xs tabular-nums outline-none focus:border-primary/40 sm:h-8 [@media(pointer:coarse)]:h-11"
    />
  );
}

function WeekStat({ value, label, change }: { value: number; label: string; change: string | null }) {
  return (
    <div className="min-w-0 rounded-lg bg-muted/40 px-2.5 py-2">
      <div className="font-serif text-xl font-semibold leading-none text-foreground">{value.toLocaleString()}</div>
      <div className="mt-1 truncate text-[11px] text-muted-foreground">{label}</div>
      {change && (
        <div className={`text-[11px] font-semibold ${change.startsWith("+") ? "text-success" : change.startsWith("-") ? "text-destructive" : "text-muted-foreground"}`}>
          {change}
        </div>
      )}
    </div>
  );
}

function WeekPosts({ title, posts }: { title: string; posts: ReportPost[] }) {
  return (
    <div className="min-w-0 space-y-1.5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{title}</p>
      {posts.map((p) => (
        <Link
          key={p.id}
          to={`/generate?draft=${encodeURIComponent(p.id)}`}
          className="flex min-h-11 flex-col justify-center rounded-lg border border-border/60 px-3 py-1.5 transition-colors hover:border-primary/40"
        >
          <span className="truncate text-sm font-medium text-foreground">{p.hook || "Untitled"}</span>
          <span className="text-[11px] text-muted-foreground">
            {[PLATFORM_LABEL[p.platform] ?? p.platform, p.impressions ? `${p.impressions.toLocaleString()} impressions` : null, `${p.engagements.toLocaleString()} engagements`]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </Link>
      ))}
    </div>
  );
}

// Jev's pick for the week, kept per day and set of moves so a visit doesn't ask again.
const WEEK_PICK_KEY = "content-studio-weekpick-";

/** This week (g44): the same report and moves as the Monday email, for the last 7 days. */
function ThisWeekCard({ userId, version }: { userId: string; version: number }) {
  const report = useMemo(() => {
    const goal = Object.values(loadGoals(userId)).reduce((s, n) => s + (n ?? 0), 0);
    return weekReport(loadDrafts(userId), loadFollowing(userId), sgDay(), goal);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, version]);
  const moves = useMemo(() => weekMoves(report), [report]);
  const ids = moves.map((m) => m.id).join(",");
  const [pick, setPick] = useState<MoveId | null>(null);
  const [picking, setPicking] = useState(false);
  useEffect(() => {
    setPick(null);
    setPicking(false);
    if (moves.length < 2) return;
    const key = WEEK_PICK_KEY + scoped(userId);
    const sig = `${report.end}:${ids}`;
    try {
      const saved = JSON.parse(localStorage.getItem(key) ?? "null");
      if (saved?.sig === sig && ids.split(",").includes(saved.pick)) {
        setPick(saved.pick);
        return;
      }
    } catch {
      // unreadable: ask again
    }
    let live = true;
    setPicking(true);
    callFn<{ pick: MoveId | null }>("week-pick", { facts: reportFacts(report), moves })
      .then(({ pick: picked }) => {
        if (!live || !picked) return;
        setPick(picked);
        try {
          localStorage.setItem(key, JSON.stringify({ sig, pick: picked }));
        } catch {
          // full storage: still shows until the page reloads
        }
      })
      // no move rather than a guess
      .catch(() => {})
      .finally(() => live && setPicking(false));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, report.end, ids]);

  if (!report.posts && !report.prevPosts) return null;
  const move = moves.find((m) => m.id === pick);
  const postsDelta = report.posts - report.prevPosts;
  return (
    <Card className="border-border/60 shadow-card">
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 font-serif text-lg">
          This week
          <span className="font-sans text-xs font-normal text-muted-foreground">Last 7 days against the 7 before</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-2">
          <WeekStat value={report.posts} label="posts" change={postsDelta ? `${postsDelta > 0 ? "+" : ""}${postsDelta}` : "same"} />
          <WeekStat value={report.impressions} label="impressions" change={pctChange(report.impressions, report.prevImpressions)} />
          <WeekStat value={report.engagements} label="engagements" change={pctChange(report.engagements, report.prevEngagements)} />
        </div>
        <div aria-live="polite">
          {(move || picking) && (
            <div className="flex items-start gap-3 rounded-lg border border-primary/25 bg-primary/[0.05] p-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Lightbulb className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-primary">One thing this week</p>
                <p className={`text-sm font-medium ${move ? "text-foreground" : "text-muted-foreground"}`}>{move ? move.text : "Picking..."}</p>
              </div>
            </div>
          )}
        </div>
        {report.best.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <WeekPosts title="Best" posts={report.best} />
            {report.worst.length > 0 && <WeekPosts title="Weakest" posts={report.worst} />}
          </div>
        ) : (
          report.posts > 0 && <p className="text-sm text-muted-foreground">Add the numbers for these posts in Add your numbers to see what worked.</p>
        )}
        {report.shared.length > 0 && (
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Your best posts share: </span>
            {report.shared.map((x) => sharedLine(x, report.worst.length)).join("; ")}.
          </p>
        )}
        {report.movers.length > 0 && (
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Accounts you follow: </span>
            {report.movers.map(moverLine).join("; ")}.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default function AnalyticsPage() {
  const [userId, setUserId] = useState<string | null | undefined>(undefined);
  const [postedCount, setPostedCount] = useState(0);
  const [dimension, setDimension] = useState<BreakdownDimension>("platform");
  // Bumps whenever bulk metrics are saved so every derived memo recomputes.
  const [metricsVersion, setMetricsVersion] = useState(0);
  const [accounts, setAccounts] = useState<SocialAccounts>({});
  const [labels, setLabels] = useState<ContentLabel[]>([]);
  // Followers per platform: typed in Add your numbers, else from the account audit.
  const [typedFollowers, setTypedFollowers] = useState<FollowerCounts>({});
  const [auditFollowers, setAuditFollowers] = useState<Followers>({});
  const [followerEdits, setFollowerEdits] = useState<Partial<Record<SocialPlatform, string>>>({});
  const followers = useMemo(() => ({ ...auditFollowers, ...typedFollowers }), [auditFollowers, typedFollowers]);
  const saveFollowers = (p: SocialPlatform) => {
    const v = followerEdits[p];
    if (!userId || v === undefined) return;
    setTypedFollowers(setFollowers(userId, p, v.trim() === "" ? null : Number(v)));
    setFollowerEdits((e) => {
      const next = { ...e };
      delete next[p];
      return next;
    });
  };

  const saveAccount = (platform: SocialPlatform, handle: string) => {
    if (!userId) return;
    setAccounts(setSocialAccount(userId, platform, handle));
  };
  // Draft edits in the bulk table, keyed by draft id then metric field.
  const [bulkEdits, setBulkEdits] = useState<Record<string, Record<string, string>>>({});

  const postedDrafts = useMemo(
    () =>
      userId
        ? loadDrafts(userId).filter((d) => draftStatus(d) === "posted")
        : [],
    [userId, metricsVersion],
  );

  const editValue = (d: (typeof postedDrafts)[number], field: keyof PostMetrics): string => {
    const edited = bulkEdits[d.id]?.[field];
    if (edited !== undefined) return edited;
    const existing = d.metrics?.[field];
    return existing !== undefined ? String(existing) : "";
  };

  const setEdit = (id: string, field: string, v: string) =>
    setBulkEdits((prev) => ({ ...prev, [id]: { ...prev[id], [field]: v } }));

  // The row just saved shows "Saved" for a moment.
  const [savedId, setSavedId] = useState<string | null>(null);
  useEffect(() => {
    if (!savedId) return;
    const t = setTimeout(() => setSavedId(null), 2000);
    return () => clearTimeout(t);
  }, [savedId]);
  const saveRow = (id: string) => {
    if (!userId) return;
    const row = bulkEdits[id];
    if (!row) return;
    const metrics: PostMetrics = {};
    (["impressions", "reactions", "comments", "shares"] as const).forEach((f) => {
      if (row[f] === undefined) return;
      if (row[f] === "") {
        // Explicitly cleared — zero it out so a typo can be undone.
        metrics[f] = 0;
        return;
      }
      const n = Number(row[f]);
      if (Number.isFinite(n) && n >= 0) metrics[f] = Math.round(n);
    });
    setDraftMetrics(userId, id, metrics);
    setBulkEdits((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setMetricsVersion((v) => v + 1);
    setSavedId(id);
  };

  useEffect(() => {
    document.title = "Analytics - Content Studio";
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      const id = data.user?.id ?? null;
      setUserId(id);
      const accts = loadSocialAccounts(id);
      setAccounts(accts);
      setLabels(loadLabels(id));
      setTypedFollowers(loadFollowers(id));
      // the audit's follower count for the audited handle (a read of the user's own rows)
      if (id) {
        void supabase
          .from("cs_social_audits")
          .select("platform, handle, profile")
          .then(({ data }) => {
            if (!active || !data) return;
            const out: Followers = {};
            for (const row of data as { platform: AuditPlatform; handle: string; profile: { followers: number | null } | null }[]) {
              const mine = normalizeHandle(row.platform, accts[row.platform]?.handle ?? "");
              if (row.profile?.followers && mine === row.handle) out[row.platform] = row.profile.followers;
            }
            setAuditFollowers(out);
          });
      }
      setPostedCount(
        loadDrafts(id).filter((d) => draftStatus(d) === "posted").length,
      );
    });
    return () => {
      active = false;
    };
  }, []);

  const tracked = useMemo(() => getTrackedPosts(userId), [userId, metricsVersion]);
  const hasData = tracked.length > 0;

  const totals = useMemo(() => {
    const totalImpressions = tracked.reduce((s, d) => s + d.impressions, 0);
    const totalEngagement = tracked.reduce((s, d) => s + d.engagementTotal, 0);
    return {
      totalImpressions,
      totalEngagement,
      avgEngagementRate:
        totalImpressions > 0
          ? Math.round((totalEngagement / totalImpressions) * 1000) / 10
          : 0,
    };
  }, [tracked]);

  const [period, setPeriod] = useState<0 | 7 | 30 | 90>(30);
  const [rankBy, setRankBy] = useState<RankMetric>("engagementTotal");
  const cmp = useMemo(() => (period ? comparePeriods(tracked, period) : null), [tracked, period]);
  const ranked = useMemo(() => rankPosts(withinDays(tracked, period), rankBy, 5, followers), [tracked, rankBy, period, followers]);
  const followerPlatforms = useMemo(
    () => SOCIAL_PLATFORMS.map((p) => p.key).filter((k) => postedDrafts.some((d) => d.platform === k)),
    [postedDrafts],
  );
  const allTime = period !== 0 && <AllTimeTag />;
  const mix = useMemo(() => labelMix(loadDrafts(userId), labels, period), [userId, labels, period, metricsVersion]);
  // Shown once there are labels and anything posted, whether or not numbers were logged.
  const showMix = labels.length > 0 && postedCount > 0;
  const exportCsv = () => {
    const blob = new Blob([postsCsv(tracked)], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `content-studio-posts-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  };

  const insights = useMemo(() => getInsights(userId), [userId, metricsVersion]);

  const trendPoints: TrendChartPoint[] = useMemo(
    () =>
      getTrend(userId).map((p) => ({
        id: p.id,
        label: p.label,
        value: p.engagementRate,
        detail: `${PLATFORM_LABEL[p.platform] ?? p.platform} · ${p.impressions.toLocaleString()} impressions`,
      })),
    [userId, metricsVersion],
  );

  const breakdownRows: RankBarRow[] = useMemo(
    () =>
      getBreakdown(userId, dimension).map((r) => ({
        key: r.key,
        label: labelForDimension(dimension, r.key),
        value: r.avgEngagementRate,
        count: r.count,
      })),
    [userId, dimension, metricsVersion],
  );

  const lengthRows: RankBarRow[] = useMemo(
    () =>
      getLengthCorrelation(userId).map((r) => ({
        key: r.status,
        label: LENGTH_LABEL[r.status],
        value: r.avgEngagementRate,
        count: r.count,
        tone: r.status,
      })),
    [userId, metricsVersion],
  );

  const tagRows: RankBarRow[] = useMemo(
    () => hashtagRanking(tracked).map((r) => ({ key: r.tag, label: `#${r.tag}`, value: r.rate, count: r.count })),
    [tracked],
  );
  // Best time for one platform (null = all): its own posts once it has enough, else every platform's.
  const [timePlatform, setTimePlatform] = useState<string | null>(null);
  const timePlatforms = useMemo(() => Object.keys(PLATFORM_LABEL).filter((k) => tracked.some((d) => d.platform === k)), [tracked]);
  const timePool = useMemo(() => bestTimePosts(tracked, timePlatform), [tracked, timePlatform]);
  const placedAll = useMemo(() => postingTimeGrid(tracked).placed, [tracked]);
  const timeGrid = useMemo(() => postingTimeGrid(timePool.posts), [timePool]);
  // The best slot by daypart (or by day), which has enough posts per cell to mean something.
  const bestTime = useMemo(() => {
    const rows = timeGrid.hasTimes ? timeGrid.dayparts : timeGrid.days.map((c) => [c]);
    const at = bestCell(rows);
    if (!at) return null;
    const c = rows[at[0]][at[1]];
    const when = `${DAY_LABELS[at[0]]}${timeGrid.hasTimes ? ` ${DAYPART_NAMES[at[1]].toLowerCase()}` : ""}`;
    const scope = timePool.own ? ` on ${PLATFORM_LABEL[timePlatform!]}` : timePlatforms.length > 1 ? ", all platforms" : "";
    return `Best so far${scope}: ${when}, ${c.rate}% across ${c.count} posts`;
  }, [timeGrid, timePool, timePlatform, timePlatforms]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-serif text-2xl font-semibold leading-tight tracking-tight text-foreground sm:text-3xl">
          Analytics
        </h1>
      </header>

      {userId && <ThisWeekCard userId={userId} version={metricsVersion} />}

      <RecruitNumbers />

      {userId && <AccountAudit accounts={accounts} onSaveAccount={saveAccount} />}

      <CreatorLookup />

      {/* Your accounts — register a handle per platform. */}
      <Card className="border-border/60 shadow-card">
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-2 font-serif text-lg">
            <span className="flex items-center gap-2">
              <Plug className="h-4 w-4 text-primary" /> Your accounts
            </span>
            <span className="text-xs font-normal text-muted-foreground">
              {connectedCount(accounts)}/{SOCIAL_PLATFORMS.length} connected
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Instagram and TikTok are audited automatically above. LinkedIn and
            Facebook don't allow that, so add those numbers by hand below.
          </p>
          <div className="space-y-2">
            {SOCIAL_PLATFORMS.map((p) => {
              const Icon = ACCOUNT_ICON[p.key];
              const acct = accounts[p.key];
              const url = acct ? accountUrl(p.key, acct.handle) : null;
              return (
                <div
                  key={p.key}
                  className="flex items-center gap-2.5 rounded-lg border border-border/60 bg-muted/20 p-2"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-background text-muted-foreground shadow-sm">
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs font-medium text-foreground">
                        {p.label}
                      </p>
                      {acct && (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-success/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-success">
                          <Check className="h-2.5 w-2.5" /> Connected
                        </span>
                      )}
                    </div>
                    <input
                      // Remount when the audit section adds or removes a handle.
                      key={acct?.handle ?? ""}
                      defaultValue={acct?.handle ?? ""}
                      placeholder={p.placeholder}
                      onBlur={(e) => saveAccount(p.key, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") e.currentTarget.blur();
                      }}
                      aria-label={`Your ${p.label} handle`}
                      className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                    />
                  </div>
                  {url && (
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Open ${p.label} profile`}
                      className="shrink-0 text-muted-foreground transition-colors hover:text-primary"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Bulk metrics entry — add real numbers for every posted post in one place */}
      {postedDrafts.length > 0 && (
        <Card className="border-border/60 shadow-card">
          <CardHeader>
            <CardTitle className="font-serif text-lg">Add your numbers</CardTitle>
          </CardHeader>
          <CardContent>
            {/* Follower counts, for how far each post travelled past them. */}
            {followerPlatforms.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-3 border-b border-border/50 pb-3">
              {followerPlatforms.map((p) => (
                <label key={p} className="w-36 space-y-1">
                  <span className="block text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
                    {PLATFORM_LABEL[p]} followers
                  </span>
                  <MetricInput
                    value={followerEdits[p] ?? (typedFollowers[p] !== undefined ? String(typedFollowers[p]) : "")}
                    onChange={(v) => setFollowerEdits((e) => ({ ...e, [p]: v }))}
                    onSave={() => saveFollowers(p)}
                    placeholder={auditFollowers[p] !== undefined ? String(auditFollowers[p]) : "0"}
                    label={`${PLATFORM_LABEL[p]} followers`}
                  />
                  {typedFollowers[p] === undefined && auditFollowers[p] !== undefined && (
                    <span className="block text-[10px] text-muted-foreground">From your account audit</span>
                  )}
                </label>
              ))}
            </div>
            )}
            {/* One row per post: a table from sm up, stacked on phones (title, then the four numbers). */}
            <div className="hidden grid-cols-[minmax(0,1fr)_repeat(4,5.5rem)] gap-x-2 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground sm:grid">
              <span>Post</span>
              {METRIC_FIELDS.map(([f, label]) => (
                <span key={f}>{label}</span>
              ))}
            </div>
            {postedDrafts.map((d) => (
              <div
                key={d.id}
                className="grid grid-cols-2 gap-2 border-t border-border/50 py-3 sm:grid-cols-[minmax(0,1fr)_repeat(4,5.5rem)] sm:items-center sm:py-1.5"
              >
                <div className="col-span-2 min-w-0 sm:col-span-1">
                  <p className="truncate text-sm font-medium text-foreground sm:text-xs">
                    {d.hook || d.draft.slice(0, 50) || "Untitled"}
                  </p>
                  <p className="text-[11px] text-muted-foreground sm:text-[10px]">
                    {PLATFORM_LABEL[d.platform] ?? d.platform}
                    <span aria-live="polite">
                      {savedId === d.id && (
                        <span className="ml-2 inline-flex items-center gap-1 font-medium text-success">
                          <Check className="h-3 w-3" /> Saved
                        </span>
                      )}
                    </span>
                  </p>
                </div>
                {METRIC_FIELDS.map(([f, label]) => (
                  <label key={f} className="space-y-1 sm:space-y-0">
                    <span className="block text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground sm:sr-only">
                      {label}
                    </span>
                    <MetricInput
                      value={editValue(d, f)}
                      onChange={(v) => setEdit(d.id, f, v)}
                      onSave={() => saveRow(d.id)}
                      placeholder="0"
                      label={`${f} for ${d.hook || "this post"}`}
                    />
                  </label>
                ))}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {(hasData || showMix) && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Period">
          {([[7, "7 days"], [30, "30 days"], [90, "90 days"], [0, "All time"]] as const).map(([d, label]) => (
            <button key={d} type="button" onClick={() => setPeriod(d)} aria-pressed={period === d}
              className={`h-9 rounded-full border px-3 text-xs font-semibold ${period === d ? "border-primary/50 bg-primary/10 text-primary" : "border-border/70 text-muted-foreground hover:text-foreground"}`}>
              {label}
            </button>
          ))}
        </div>
      )}
      {hasData && (
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat
            icon={BarChart3}
            value={String(cmp ? cmp.current.posts : tracked.length)}
            label="Posts tracked"
            tint="bg-muted text-foreground"
            delta={cmp?.change.posts}
          />
          <Stat
            icon={Eye}
            value={(cmp ? cmp.current.impressions : totals.totalImpressions).toLocaleString()}
            label="Impressions tracked"
            tint="bg-primary/10 text-primary"
            delta={cmp?.change.impressions}
          />
          <Stat
            icon={Heart}
            value={(cmp ? cmp.current.engagements : totals.totalEngagement).toLocaleString()}
            label="Total engagement"
            tint="bg-brand/10 text-brand"
            delta={cmp?.change.engagements}
          />
          <Stat
            icon={TrendingUp}
            value={`${cmp ? cmp.current.rate : totals.avgEngagementRate}%`}
            label="Avg engagement rate"
            tint="bg-success/10 text-success"
            delta={cmp?.change.rate}
          />
        </section>
      )}
      {showMix && userId && (
        <LabelMixCard userId={userId} rows={mix.rows} posts={mix.posts} unlabelled={mix.unlabelled} onLabelsChange={setLabels} />
      )}

      {hasData ? (
        <>

          {/* Insights */}
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 font-serif text-lg font-semibold text-foreground">
              What's working, what's not {allTime}
            </h2>
            <div className="space-y-2.5">
              {insights.map((insight, i) => {
                const style = INSIGHT_STYLE[insight.tone];
                const Icon = style.icon;
                return (
                  <Card key={i} className={`shadow-card ${style.card}`}>
                    <CardContent className="flex items-start gap-3 py-4">
                      <span
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${style.icon_}`}
                      >
                        <Icon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground">
                          {insight.title}
                        </p>
                        <p className="mt-0.5 text-sm text-muted-foreground">
                          {insight.body}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>

          {/* Trend */}
          <Card className="border-border/60 shadow-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 font-serif text-lg">
                Engagement rate over time {allTime}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <TrendChart points={trendPoints} />
            </CardContent>
          </Card>

          {/* Breakdown by dimension */}
          <Card className="border-border/60 shadow-card">
            <CardHeader className="space-y-2.5">
              <CardTitle className="flex items-center gap-2 font-serif text-lg">
                Engagement rate by {DIMENSION_TABS.find((t) => t.id === dimension)?.label.toLowerCase()} {allTime}
              </CardTitle>
              <div className="flex gap-1.5">
                {DIMENSION_TABS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setDimension(t.id)}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                      dimension === t.id
                        ? "border-primary/60 bg-primary/10 text-primary"
                        : "border-border/70 bg-background text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </CardHeader>
            <CardContent>
              <RankBars
                rows={breakdownRows}
                minSample={MIN_GROUP_SAMPLE}
                emptyLabel={
                  dimension === "hookFormula"
                    ? "Shows once posts written from a formula hook in Write have numbers."
                    : undefined
                }
              />
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Length correlation */}
            <Card className="border-border/60 shadow-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 font-serif text-lg">
                  <Ruler className="h-4 w-4 text-muted-foreground" /> Length vs
                  engagement {allTime}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <RankBars
                  rows={lengthRows}
                  minSample={MIN_GROUP_SAMPLE}
                  emptyLabel="Add impressions on a few posted posts to see this."
                />
              </CardContent>
            </Card>

            {tagRows.length > 0 && (
              <Card className="border-border/60 shadow-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 font-serif text-lg">
                    <Hash className="h-4 w-4 text-muted-foreground" /> Hashtags {allTime}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <RankBars rows={tagRows} minSample={MIN_GROUP_SAMPLE} />
                </CardContent>
              </Card>
            )}
          </div>

          {placedAll >= 3 && (
            <Card className="border-border/60 shadow-card">
              <CardHeader className="space-y-2.5">
                <CardTitle className="flex items-center gap-1.5 font-serif text-lg">
                  <CalendarDays className="mr-0.5 h-4 w-4 text-muted-foreground" /> Best time to post
                  <InfoTip label="About best time to post">From the scheduled time, or else when you marked it posted.</InfoTip>
                  {allTime && <span className="ml-1.5 flex">{allTime}</span>}
                </CardTitle>
                {timePlatforms.length > 1 && (
                  <div className="flex flex-wrap gap-1.5" role="group" aria-label="Best time for">
                    {[null, ...timePlatforms].map((k) => (
                      <button key={k ?? "all"} type="button" onClick={() => setTimePlatform(k)} aria-pressed={timePlatform === k}
                        className={`h-9 rounded-full border px-3 text-xs font-semibold [@media(pointer:coarse)]:h-11 ${timePlatform === k ? "border-primary/50 bg-primary/10 text-primary" : "border-border/70 text-muted-foreground hover:text-foreground"}`}>
                        {k ? PLATFORM_LABEL[k] : "All platforms"}
                      </button>
                    ))}
                  </div>
                )}
              </CardHeader>
              <CardContent className="space-y-2">
                {timePlatform && !timePool.own && (
                  <p className="text-xs text-muted-foreground">
                    Fewer than {MIN_PLATFORM_POSTS} {PLATFORM_LABEL[timePlatform]} posts with numbers, so this shows all platforms.
                  </p>
                )}
                {timeGrid.hasTimes ? (
                  <>
                    <div className="hidden md:block">
                      <TimeHeatmap rows={timeGrid.hours} columns={HOUR_HEADS} columnNames={HOUR_NAMES} summary={bestTime} />
                    </div>
                    <div className="md:hidden">
                      <TimeHeatmap rows={timeGrid.dayparts} columns={DAYPART_NAMES} columnNames={DAYPART_NAMES.map((n) => n.toLowerCase())} showValues summary={bestTime} />
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-xs text-muted-foreground">
                      {timeGrid.timed ? `Only ${timeGrid.timed} of ${timeGrid.placed}` : `None of your ${timeGrid.placed}`} posts have a posting time, so this shows days only.
                    </p>
                    <TimeHeatmap rows={timeGrid.days.map((c) => [c])} columns={[""]} showValues summary={bestTime} />
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {/* Top posts */}
          <section className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="mr-auto font-serif text-lg font-semibold text-foreground">
                Top posts
              </h2>
              <select value={rankBy} onChange={(e) => setRankBy(e.target.value as RankMetric)} aria-label="Rank top posts by"
                className="h-9 rounded-md border border-input bg-background px-2 text-sm">
                <option value="engagementTotal">By engagements</option>
                <option value="engagementRate">By engagement rate</option>
                <option value="impressions">By impressions</option>
                <option value="reactions">By reactions</option>
                <option value="comments">By comments</option>
                <option value="shares">By shares</option>
                <option value="reachMultiple">By reach past followers</option>
                <option value="commentRatio">By comments per like</option>
              </select>
              <Button variant="outline" size="sm" onClick={exportCsv} className="h-9 gap-1.5">
                <Download className="h-3.5 w-3.5" /> Export CSV
              </Button>
            </div>
            <div className="space-y-2">
              {ranked.length === 0 && (
                <p className="rounded-xl border border-dashed border-border/70 p-4 text-center text-sm text-muted-foreground">
                  {rankBy === "reachMultiple" && !followerPlatforms.some((p) => followers[p])
                    ? "Add your follower count in Add your numbers to see reach."
                    : `No posts with ${rankBy === "commentRatio" ? "likes" : "numbers"} ${period ? `in the last ${period} days` : "yet"}.`}
                </p>
              )}
              {ranked.map((d) => (
                <Link
                  key={d.id}
                  to={`/generate?draft=${encodeURIComponent(d.id)}`}
                  className="flex items-center gap-3 rounded-xl border border-border/70 bg-card p-3 shadow-card transition-colors hover:border-primary/40"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {d.hook || d.draft.slice(0, 60)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {[
                        PLATFORM_LABEL[d.platform] ?? d.platform,
                        d.impressions ? `${d.impressions.toLocaleString()} impressions` : null,
                        d.impressions && rankBy !== "engagementRate" ? `${d.engagementRate}% engagement` : null,
                        rankBy !== "reachMultiple" && reachMultiple(d, followers) !== null ? `${reachMultiple(d, followers)}x followers` : null,
                        rankBy !== "commentRatio" && commentRatio(d) !== null ? `${commentRatio(d)} comments per like` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="font-serif text-lg font-semibold text-foreground">
                      {rankValue(d, rankBy, followers)}
                    </div>
                    <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                      {RANK_UNIT[rankBy]}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        </>
      ) : (
        <Card className="border-border/60 shadow-card">
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <BarChart3 className="h-5 w-5" />
            </span>
            <p className="max-w-sm text-sm text-muted-foreground">
              {postedCount > 0
                ? "Add the numbers for a posted post in Add your numbers above to see what's working."
                : "Once you publish and mark posts as posted, add their real numbers to track what lands."}
            </p>
            {postedCount === 0 && (
              <Button asChild size="sm" className="gap-1.5">
                <Link to="/drafts">
                  Go to My posts <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
