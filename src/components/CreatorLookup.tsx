import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RankBars, type RankBarRow } from "@/components/charts/RankBars";
import {
  analyzeCreator,
  findAdvisor,
  searchAdvisors,
  ANALYZABLE_COUNT,
  type CreatorAnalysis,
  type CreatorInsightTone,
} from "@/lib/creatorAnalysis";
import { buildRemixUrl } from "@/lib/topPosts";
import {
  Search,
  UserSearch,
  TrendingUp,
  Lightbulb,
  Info,
  Wand2,
  ExternalLink,
  Heart,
  MessageCircle,
} from "lucide-react";

const TONE_STYLE: Record<
  CreatorInsightTone,
  { icon: typeof TrendingUp; card: string; icon_: string }
> = {
  positive: {
    icon: TrendingUp,
    card: "border-success/30 bg-success/[0.05]",
    icon_: "bg-success/10 text-success",
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

function AnalysisResult({ analysis }: { analysis: CreatorAnalysis }) {
  const { advisor, bestPost, avgLikes, avgComments, formatStats, insights, posts } =
    analysis;

  const formatRows: RankBarRow[] = formatStats.map((f) => ({
    key: f.format,
    label: f.label,
    value: f.avgScore,
    count: f.count,
  }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border/70 bg-card p-4">
        <div>
          <p className="text-sm font-semibold text-foreground">{advisor.name}</p>
          <p className="text-xs text-muted-foreground">
            {advisor.handle} · {posts.length} top post{posts.length === 1 ? "" : "s"}{" "}
            analyzed
          </p>
        </div>
        <Button asChild variant="outline" size="sm" className="gap-1.5">
          <a href={advisor.platform_url} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-3.5 w-3.5" /> Profile
          </a>
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Card className="border-border/60 shadow-card">
          <CardContent className="flex items-center gap-2.5 py-3">
            <Heart className="h-4 w-4 text-muted-foreground" />
            <div>
              <div className="font-serif text-lg font-semibold text-foreground">
                {avgLikes.toLocaleString()}
              </div>
              <div className="text-[10px] text-muted-foreground">avg likes</div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/60 shadow-card">
          <CardContent className="flex items-center gap-2.5 py-3">
            <MessageCircle className="h-4 w-4 text-muted-foreground" />
            <div>
              <div className="font-serif text-lg font-semibold text-foreground">
                {avgComments}
              </div>
              <div className="text-[10px] text-muted-foreground">avg comments</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {formatRows.length > 1 && (
        <div className="rounded-xl border border-border/60 p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Format performance
          </p>
          <RankBars rows={formatRows} valueSuffix=" score" minSample={2} />
        </div>
      )}

      <div className="space-y-2.5">
        {insights.map((insight, i) => {
          const style = TONE_STYLE[insight.tone];
          const Icon = style.icon;
          return (
            <Card key={i} className={`shadow-card ${style.card}`}>
              <CardContent className="flex items-start gap-3 py-3.5">
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${style.icon_}`}
                >
                  <Icon className="h-3.5 w-3.5" />
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

      <div className="flex flex-col gap-2 sm:flex-row">
        {bestPost && (
          <Button
            asChild
            size="sm"
            className="flex-1 gap-1.5 bg-gradient-primary text-primary-foreground shadow-sm hover:opacity-95"
          >
            <Link to={buildRemixUrl(bestPost, advisor)}>
              <Wand2 className="h-3.5 w-3.5" /> Remix their best post in Write
            </Link>
          </Button>
        )}
        <Button asChild size="sm" variant="outline" className="flex-1 gap-1.5">
          <Link to={`/plan?competitor=${encodeURIComponent(advisor.id)}`}>
            <UserSearch className="h-3.5 w-3.5" /> Use as competitor in my plan
          </Link>
        </Button>
      </div>
    </div>
  );
}

export default function CreatorLookup() {
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState<string | null>(null);

  const suggestions = useMemo(
    () => (submitted ? [] : searchAdvisors(query)),
    [query, submitted],
  );

  const analysis = useMemo(() => {
    if (!submitted) return null;
    const advisor = findAdvisor(submitted);
    return advisor ? analyzeCreator(advisor) : null;
  }, [submitted]);

  const notFound = submitted !== null && !analysis;

  const handleSubmit = (value: string) => {
    const v = value.trim();
    if (!v) return;
    setQuery(v);
    setSubmitted(v);
  };

  const reset = () => {
    setSubmitted(null);
    setQuery("");
  };

  return (
    <Card className="border-border/60 shadow-card">
      <CardContent className="space-y-4 py-5">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <UserSearch className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-semibold text-foreground">
              Analyze a creator
            </p>
            <p className="text-xs text-muted-foreground">
              Enter a handle to see what's working, what to steal, and where the
              gaps are.
            </p>
          </div>
        </div>

        <div className="relative">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSubmitted(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSubmit(query);
              }}
              placeholder="e.g. @thewokesalaryman"
              className="pl-9"
            />
          </div>
          {suggestions.length > 0 && (
            <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-border/70 bg-popover shadow-elegant">
              {suggestions.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => handleSubmit(a.handle)}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
                >
                  <span className="font-medium text-foreground">{a.name}</span>
                  <span className="text-xs text-muted-foreground">{a.handle}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {!submitted && (
          <p className="text-[11px] text-muted-foreground">
            Covers {ANALYZABLE_COUNT} curated SG finance/insurance creators today
            — start typing to see matches.
          </p>
        )}

        {analysis && <AnalysisResult analysis={analysis} />}

        {notFound && (
          <div className="space-y-2 rounded-lg border border-border/60 bg-muted/20 p-3.5 text-sm">
            <p className="font-medium text-foreground">
              No match for "{submitted}" in our curated set.
            </p>
            <p className="text-xs text-muted-foreground">
              This looks up {ANALYZABLE_COUNT} SG finance/insurance creators we've
              already researched — it's not a live scrape of any handle. Live
              lookup for arbitrary accounts would need paid scraping access
              (Apify or similar) plus a backend to hold the credentials, which
              isn't wired up yet.
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button asChild variant="outline" size="sm" className="gap-1.5">
                <Link to="/profiles">Browse covered creators</Link>
              </Button>
              <Button variant="ghost" size="sm" onClick={reset}>
                Try another handle
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Looking up your own account instead? Track your real posts in{" "}
              <Link to="/drafts" className="font-semibold text-primary hover:underline">
                My posts
              </Link>{" "}
              and the numbers below will analyze those.
            </p>
          </div>
        )}

        {submitted && analysis && (
          <button
            type="button"
            onClick={reset}
            className="text-xs font-semibold text-primary hover:underline"
          >
            Look up another creator
          </button>
        )}
      </CardContent>
    </Card>
  );
}
