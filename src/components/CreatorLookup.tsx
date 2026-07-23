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
  fetchLiveIgProfile,
  liveCreatorAnalysis,
  ANALYZABLE_COUNT,
  type CreatorAnalysis,
  type CreatorInsightTone,
} from "@/lib/creatorAnalysis";
import { parseInstagramInput } from "@/components/CompetitorReference";
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
  Radio,
  Loader2,
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

function AnalysisResult({
  analysis,
  live = false,
}: {
  analysis: CreatorAnalysis;
  live?: boolean;
}) {
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
            <Link
              to={
                live
                  ? `/generate?ctx=${encodeURIComponent(
                      `Remix this angle from ${advisor.handle} (adapt to my niche and voice, never copy): "${bestPost.caption.slice(0, 220)}"`,
                    )}`
                  : buildRemixUrl(bestPost, advisor)
              }
            >
              <Wand2 className="h-3.5 w-3.5" /> Remix their best post in Write
            </Link>
          </Button>
        )}
        <Button asChild size="sm" variant="outline" className="flex-1 gap-1.5">
          <Link
            to={`/plan?competitor=${encodeURIComponent(
              live ? advisor.handle : advisor.id,
            )}`}
          >
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
  // Live Instagram fallback (analyze-ig-creator edge function via Apify).
  const [liveAnalysis, setLiveAnalysis] = useState<CreatorAnalysis | null>(null);
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);

  const suggestions = useMemo(
    () => (submitted ? [] : searchAdvisors(query)),
    [query, submitted],
  );

  const analysis = useMemo(() => {
    if (!submitted) return null;
    const advisor = findAdvisor(submitted);
    return advisor ? analyzeCreator(advisor) : null;
  }, [submitted]);

  const notFound = submitted !== null && !analysis && !liveAnalysis && !liveLoading;
  // Curated entry that exists but has no analyzed posts (directory-only).
  const curatedNoData = notFound && submitted ? findAdvisor(submitted) : null;
  // Fall back to the curated entry's own handle so directory-only Instagram
  // creators can still be analyzed live.
  const liveCandidate = submitted
    ? parseInstagramInput(submitted) ??
      (curatedNoData && /instagram/i.test(curatedNoData.platform_url)
        ? parseInstagramInput(curatedNoData.handle)
        : null)
    : null;

  const handleSubmit = (value: string) => {
    const v = value.trim();
    if (!v) return;
    setQuery(v);
    setSubmitted(v);
    setLiveAnalysis(null);
    setLiveError(null);
  };

  const runLiveLookup = async () => {
    if (!liveCandidate) return;
    setLiveLoading(true);
    setLiveError(null);
    try {
      const profile = await fetchLiveIgProfile(liveCandidate.handle);
      const built = liveCreatorAnalysis(profile);
      if (!built) {
        setLiveError(
          "That account has no public posts to analyze (private or empty).",
        );
      } else {
        setLiveAnalysis(built);
      }
    } catch (e) {
      setLiveError(e instanceof Error ? e.message : "Lookup failed — try again.");
    } finally {
      setLiveLoading(false);
    }
  };

  const reset = () => {
    setSubmitted(null);
    setQuery("");
    setLiveAnalysis(null);
    setLiveError(null);
    setLiveLoading(false);
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
            {ANALYZABLE_COUNT} curated SG finance/insurance creators, or any
            public Instagram handle — paste @handle or a profile URL for a live
            analysis.
          </p>
        )}

        {analysis && <AnalysisResult analysis={analysis} />}
        {!analysis && liveAnalysis && (
          <>
            <p className="flex items-center gap-1.5 text-[11px] font-medium text-primary">
              <Radio className="h-3 w-3" /> Live from Instagram — latest posts,
              refreshed weekly
            </p>
            <AnalysisResult analysis={liveAnalysis} live />
          </>
        )}

        {liveLoading && (
          <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/20 p-3.5 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            Pulling {liveCandidate?.handle} from Instagram — takes 10–30 seconds
            on first lookup…
          </div>
        )}

        {notFound && (
          <div className="space-y-2 rounded-lg border border-border/60 bg-muted/20 p-3.5 text-sm">
            <p className="font-medium text-foreground">
              {curatedNoData
                ? `${curatedNoData.name} is in our directory, but we haven't analyzed their posts yet.`
                : `No match for "${submitted}" in our curated set.`}
            </p>
            {liveCandidate ? (
              <>
                <p className="text-xs text-muted-foreground">
                  We can pull {liveCandidate.handle}'s latest public posts from
                  Instagram and run the same analysis. First lookup takes
                  10–30 seconds; results are cached for a week.
                </p>
                {liveError && (
                  <p className="text-xs font-medium text-destructive">{liveError}</p>
                )}
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button size="sm" onClick={runLiveLookup} className="gap-1.5">
                    <Radio className="h-3.5 w-3.5" /> Analyze {liveCandidate.handle}{" "}
                    live from Instagram
                  </Button>
                  <Button variant="ghost" size="sm" onClick={reset}>
                    Try another handle
                  </Button>
                </div>
              </>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">
                  This covers {ANALYZABLE_COUNT} curated SG finance/insurance
                  creators. For anyone else, paste their Instagram handle
                  (like @handle) or profile URL and we'll analyze their latest
                  posts live.
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button asChild variant="outline" size="sm" className="gap-1.5">
                    <Link to="/profiles">Browse covered creators</Link>
                  </Button>
                  <Button variant="ghost" size="sm" onClick={reset}>
                    Try another handle
                  </Button>
                </div>
              </>
            )}
            <p className="text-xs text-muted-foreground">
              Looking up your own account instead? Track your real posts in{" "}
              <Link to="/drafts" className="font-semibold text-primary hover:underline">
                My posts
              </Link>{" "}
              and the numbers below will analyze those.
            </p>
          </div>
        )}

        {submitted && (analysis || liveAnalysis) && (
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
