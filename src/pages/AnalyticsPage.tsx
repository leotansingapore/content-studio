import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import {
  getAnalytics,
  engagement,
  draftStatus,
  loadDrafts,
  type AnalyticsSummary,
} from "@/lib/draftHistory";
import {
  BarChart3,
  Eye,
  Heart,
  TrendingUp,
  Linkedin,
  Instagram,
  Lock,
  ArrowRight,
} from "lucide-react";

const PILLAR_LABEL: Record<string, string> = {
  interest: "Interest",
  identity: "Identity",
  topic: "Topic",
  market: "Market",
};
const FORMAT_LABEL: Record<string, string> = {
  "text-post": "Text posts",
  carousel: "Carousels",
  "short-video": "Short video",
  story: "Stories",
};
const PLATFORM_LABEL: Record<string, string> = {
  linkedin: "LinkedIn",
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
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

export default function AnalyticsPage() {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [postedCount, setPostedCount] = useState(0);

  useEffect(() => {
    document.title = "Analytics - Content Studio";
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      const id = data.user?.id ?? null;
      setSummary(getAnalytics(id));
      setPostedCount(
        loadDrafts(id).filter((d) => draftStatus(d) === "posted").length,
      );
    });
    return () => {
      active = false;
    };
  }, []);

  const hasData = (summary?.trackedCount ?? 0) > 0;
  const top = useMemo(() => summary?.top.slice(0, 5) ?? [], [summary]);

  return (
    <div className="space-y-6">
      <header className="space-y-1.5">
        <h1 className="font-serif text-2xl font-semibold leading-tight tracking-tight text-foreground sm:text-3xl">
          Analytics
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          See what's actually landing. Add the real numbers from your posts and
          the studio surfaces your top performers and the angles worth doubling
          down on.
        </p>
      </header>

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
            numbers by hand on your posted posts — it takes seconds.
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

      {hasData && summary ? (
        <>
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat
              icon={Eye}
              value={summary.totalImpressions.toLocaleString()}
              label="Impressions tracked"
              tint="bg-primary/10 text-primary"
            />
            <Stat
              icon={Heart}
              value={summary.totalEngagement.toLocaleString()}
              label="Total engagement"
              tint="bg-brand/10 text-brand"
            />
            <Stat
              icon={TrendingUp}
              value={`${summary.avgEngagementRate}%`}
              label="Engagement rate"
              tint="bg-success/10 text-success"
            />
          </section>

          {(summary.bestPillar || summary.bestFormat) && (
            <Card className="border-primary/20 bg-primary/[0.04] shadow-card">
              <CardContent className="py-4">
                <p className="text-sm font-semibold text-foreground">
                  What&apos;s working
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Your best engagement comes from{" "}
                  {summary.bestPillar && (
                    <span className="font-medium text-foreground">
                      {PILLAR_LABEL[summary.bestPillar] ?? summary.bestPillar}
                    </span>
                  )}
                  {summary.bestPillar && summary.bestFormat ? " posts as " : ""}
                  {summary.bestFormat && (
                    <span className="font-medium text-foreground">
                      {FORMAT_LABEL[summary.bestFormat] ?? summary.bestFormat}
                    </span>
                  )}
                  . Do more of that — and{" "}
                  <Link to="/generate" className="font-semibold text-primary hover:underline">
                    write the next one
                  </Link>
                  .
                </p>
              </CardContent>
            </Card>
          )}

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
                      {d.metrics?.impressions
                        ? ` · ${d.metrics.impressions.toLocaleString()} impressions`
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
