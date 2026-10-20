import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import CreatorInsights from "@/components/CreatorInsights";
import {
  analyzeCreator,
  findAdvisor,
  searchAdvisors,
  fetchLiveIgProfile,
  liveCreatorAnalysis,
  ANALYZABLE_COUNT,
  type CreatorAnalysis,
} from "@/lib/creatorAnalysis";
import { parseInstagramInput } from "@/components/CompetitorReference";
import {
  Search,
  UserSearch,
  Radio,
  Loader2,
} from "lucide-react";

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
      setLiveError(e instanceof Error ? e.message : "Lookup failed. Try again.");
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
          <p className="text-sm font-semibold text-foreground">
            Analyze a creator
          </p>
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
            public Instagram handle. Paste @handle or a profile URL for a live
            analysis.
          </p>
        )}

        {analysis && <CreatorInsights analysis={analysis} />}
        {!analysis && liveAnalysis && (
          <>
            <p className="flex items-center gap-1.5 text-[11px] font-medium text-primary">
              <Radio className="h-3 w-3" /> Live from Instagram: latest posts,
              refreshed weekly
            </p>
            <CreatorInsights analysis={liveAnalysis} live />
          </>
        )}

        {liveLoading && (
          <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/20 p-3.5 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            Pulling {liveCandidate?.handle} from Instagram. Takes 10 to 30 seconds
            on first lookup...
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
