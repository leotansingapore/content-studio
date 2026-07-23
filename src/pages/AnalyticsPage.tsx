import { useEffect, useMemo, useState } from "react";
import SectionTabs, { PERFORMANCE_TABS } from "@/components/SectionTabs";
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
  getDayOfWeekBreakdown,
  getInsights,
  labelForDimension,
  MIN_GROUP_SAMPLE,
  type BreakdownDimension,
  type Insight,
} from "@/lib/analytics";
import { RankBars, type RankBarRow } from "@/components/charts/RankBars";
import { TrendChart, type TrendChartPoint } from "@/components/charts/TrendChart";
import CreatorLookup from "@/components/CreatorLookup";
import {
  BarChart3,
  Eye,
  Heart,
  TrendingUp,
  TrendingDown,
  Linkedin,
  Instagram,
  Lock,
  ArrowRight,
  Lightbulb,
  Info,
  Ruler,
  CalendarDays,
} from "lucide-react";

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

const DIMENSION_TABS: { id: BreakdownDimension; label: string }[] = [
  { id: "platform", label: "Platform" },
  { id: "pillar", label: "Pillar" },
  { id: "format", label: "Format" },
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

function Stat({
  icon: Icon,
  value,
  label,
  tint,
}: {
  icon: typeof Eye;
  value: string;
  label: string;
  tint: string;
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
          <div className="mt-1 truncate text-xs text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

// Editable number cell for the bulk metrics table.
function MetricInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <input
      type="number"
      min="0"
      inputMode="numeric"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full min-w-14 rounded-md border border-border/70 bg-background px-2 py-1 text-right text-xs tabular-nums outline-none focus:border-primary/40"
    />
  );
}

export default function AnalyticsPage() {
  const [userId, setUserId] = useState<string | null | undefined>(undefined);
  const [postedCount, setPostedCount] = useState(0);
  const [dimension, setDimension] = useState<BreakdownDimension>("platform");
  // Bumps whenever bulk metrics are saved so every derived memo recomputes.
  const [metricsVersion, setMetricsVersion] = useState(0);
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

  const saveRow = (id: string) => {
    if (!userId) return;
    const row = bulkEdits[id];
    if (!row) return;
    const metrics: PostMetrics = {};
    (["impressions", "reactions", "comments", "shares"] as const).forEach((f) => {
      if (row[f] !== undefined && row[f] !== "") {
        const n = Number(row[f]);
        if (Number.isFinite(n) && n >= 0) metrics[f] = Math.round(n);
      }
    });
    setDraftMetrics(userId, id, metrics);
    setBulkEdits((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setMetricsVersion((v) => v + 1);
  };

  useEffect(() => {
    document.title = "Analytics - Content Studio";
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      const id = data.user?.id ?? null;
      setUserId(id);
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

  const top = useMemo(
    () =>
      [...tracked]
        .sort((a, b) => b.engagementTotal - a.engagementTotal)
        .slice(0, 5),
    [tracked],
  );

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

  const dayRows: RankBarRow[] = useMemo(
    () =>
      getDayOfWeekBreakdown(userId).map((r) => ({
        key: r.day,
        label: r.day,
        value: r.avgEngagementRate,
        count: r.count,
      })),
    [userId, metricsVersion],
  );

  return (
    <div className="space-y-6">
      <SectionTabs tabs={PERFORMANCE_TABS} />
      <header className="space-y-1.5">
        <h1 className="font-serif text-2xl font-semibold leading-tight tracking-tight text-foreground sm:text-3xl">
          Analytics
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          See what's actually landing. Add the real numbers from your posts and
          the studio surfaces your top performers, what's underperforming, and
          what to double down on.
        </p>
      </header>

      <CreatorLookup />

      {/* Connect — coming soon (honest about the gate) */}
      <Card className="border-border/60 shadow-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-serif text-lg">
            <Lock className="h-4 w-4 text-muted-foreground" /> Auto-sync — coming
            soon
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Connecting your accounts will pull impressions and engagement
            automatically. It needs platform approval first, so for now add
            numbers by hand on your posted posts in My posts — it takes
            seconds and everything below runs off those numbers.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" disabled className="gap-1.5">
              <Linkedin className="h-3.5 w-3.5" /> Connect LinkedIn
            </Button>
            <Button variant="outline" size="sm" disabled className="gap-1.5">
              <Instagram className="h-3.5 w-3.5" /> Connect Instagram
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Bulk metrics entry — add real numbers for every posted post in one place */}
      {postedDrafts.length > 0 && (
        <Card className="border-border/60 shadow-card">
          <CardHeader>
            <CardTitle className="font-serif text-lg">Add your numbers</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Fill in what each posted post actually did. Everything below
              recalculates as soon as you save a row.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-xs">
                <thead>
                  <tr className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                    <th className="py-1.5 pr-2 font-semibold">Post</th>
                    <th className="w-20 px-1 py-1.5 font-semibold">Impressions</th>
                    <th className="w-20 px-1 py-1.5 font-semibold">Reactions</th>
                    <th className="w-20 px-1 py-1.5 font-semibold">Comments</th>
                    <th className="w-20 px-1 py-1.5 font-semibold">Shares</th>
                    <th className="w-16 px-1 py-1.5" />
                  </tr>
                </thead>
                <tbody>
                  {postedDrafts.map((d) => (
                    <tr key={d.id} className="border-t border-border/50">
                      <td className="max-w-[220px] py-1.5 pr-2">
                        <p className="truncate font-medium text-foreground">
                          {d.hook || d.draft.slice(0, 50) || "Untitled"}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {PLATFORM_LABEL[d.platform] ?? d.platform}
                        </p>
                      </td>
                      {(["impressions", "reactions", "comments", "shares"] as const).map(
                        (f) => (
                          <td key={f} className="px-1 py-1.5">
                            <MetricInput
                              value={editValue(d, f)}
                              onChange={(v) => setEdit(d.id, f, v)}
                              placeholder="0"
                            />
                          </td>
                        ),
                      )}
                      <td className="px-1 py-1.5 text-right">
                        <Button
                          size="sm"
                          variant={bulkEdits[d.id] ? "default" : "outline"}
                          disabled={!bulkEdits[d.id]}
                          onClick={() => saveRow(d.id)}
                          className="h-7 px-2.5 text-[11px]"
                        >
                          Save
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {hasData ? (
        <>
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat
              icon={BarChart3}
              value={String(tracked.length)}
              label="Posts tracked"
              tint="bg-muted text-foreground"
            />
            <Stat
              icon={Eye}
              value={totals.totalImpressions.toLocaleString()}
              label="Impressions tracked"
              tint="bg-primary/10 text-primary"
            />
            <Stat
              icon={Heart}
              value={totals.totalEngagement.toLocaleString()}
              label="Total engagement"
              tint="bg-brand/10 text-brand"
            />
            <Stat
              icon={TrendingUp}
              value={`${totals.avgEngagementRate}%`}
              label="Avg engagement rate"
              tint="bg-success/10 text-success"
            />
          </section>

          {/* Insights */}
          <section className="space-y-3">
            <h2 className="font-serif text-lg font-semibold text-foreground">
              What's working, what's not
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
              <CardTitle className="font-serif text-lg">
                Engagement rate over time
              </CardTitle>
            </CardHeader>
            <CardContent>
              <TrendChart points={trendPoints} />
            </CardContent>
          </Card>

          {/* Breakdown by dimension */}
          <Card className="border-border/60 shadow-card">
            <CardHeader className="space-y-2.5">
              <CardTitle className="font-serif text-lg">
                Engagement rate by {DIMENSION_TABS.find((t) => t.id === dimension)?.label.toLowerCase()}
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
              <RankBars rows={breakdownRows} minSample={MIN_GROUP_SAMPLE} />
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Length correlation */}
            <Card className="border-border/60 shadow-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 font-serif text-lg">
                  <Ruler className="h-4 w-4 text-muted-foreground" /> Length vs
                  engagement
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

            {/* Day of week */}
            <Card className="border-border/60 shadow-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 font-serif text-lg">
                  <CalendarDays className="h-4 w-4 text-muted-foreground" /> By
                  day posted
                </CardTitle>
              </CardHeader>
              <CardContent>
                <RankBars
                  rows={dayRows}
                  minSample={MIN_GROUP_SAMPLE}
                  emptyLabel="Add impressions on a few posted posts to see this."
                />
              </CardContent>
            </Card>
          </div>

          {/* Top posts */}
          <section className="space-y-3">
            <h2 className="font-serif text-lg font-semibold text-foreground">
              Top posts
            </h2>
            <div className="space-y-2">
              {top.map((d) => (
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
                      {PLATFORM_LABEL[d.platform] ?? d.platform}
                      {d.impressions
                        ? ` · ${d.impressions.toLocaleString()} impressions`
                        : ""}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="font-serif text-lg font-semibold text-foreground">
                      {engagement(d.metrics)}
                    </div>
                    <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                      engagements
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
                ? "You've marked posts as posted — now add their numbers in My posts to see what's working."
                : "Once you publish and mark posts as posted, add their real numbers to track what lands."}
            </p>
            <Button asChild size="sm" className="gap-1.5">
              <Link to="/drafts">
                Go to My posts <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
