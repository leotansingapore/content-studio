import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";
import { RankBars, type RankBarRow } from "@/components/charts/RankBars";
import RemixButton from "@/components/remix/RemixButton";
import type { CreatorAnalysis, CreatorInsight, CreatorInsightTone } from "@/lib/creatorAnalysis";
import { usedMost } from "@/lib/creatorFit";
import { links } from "@/lib/links";
import { fromTopPost } from "@/lib/remixSource";
import { buildRemixUrl, topAdvisorId } from "@/lib/topPosts";
import {
  TrendingUp,
  Lightbulb,
  Info,
  Wand2,
  ExternalLink,
  Heart,
  MessageCircle,
  UserSearch,
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

/**
 * What works for a creator, from analyzeCreator (Creator lookup on /analytics) or the live Instagram read. Moved out
 * of CreatorLookup unchanged, so a creator's page can show the same numbers.
 */
export default function CreatorInsights({
  analysis,
  live = false,
}: {
  analysis: CreatorAnalysis;
  live?: boolean;
}) {
  const { advisor, bestPost, avgLikes, avgComments, formatStats, insights, posts } =
    analysis;

  const remixLink = bestPost && (
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
  );

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

      <InsightCards insights={insights} />

      <div className="flex flex-col gap-2 sm:flex-row">
        {bestPost && (live ? remixLink : <RemixButton className="flex-1" source={fromTopPost(bestPost, { ...advisor, id: topAdvisorId(advisor.handle) ?? advisor.id })}>{remixLink}</RemixButton>)}
        <Button asChild size="sm" variant="outline" className="flex-1 gap-1.5">
          <Link
            to={links.plan({ competitor: live ? advisor.handle : advisor.id })}
          >
            <UserSearch className="h-3.5 w-3.5" /> Use as competitor in my plan
          </Link>
        </Button>
      </div>
    </div>
  );
}

/** The insight lines, one card each, coloured by tone. */
function InsightCards({ insights }: { insights: CreatorInsight[] }) {
  return (
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
  );
}

/**
 * "What works for them" on a creator's page (Leo only, #works): the numbers Creator lookup shows for the same
 * creator, the angles and builds their read posts use most, the insight lines, and Remix on their best post.
 */
export function WhatWorks({ analysis }: { analysis: CreatorAnalysis | null }) {
  return (
    <section id="works" aria-labelledby="works-title" className="scroll-mt-20 space-y-3">
      <div className="flex items-center gap-1.5 border-b border-border/60 pb-1.5">
        <h2 id="works-title" className="font-serif text-lg font-semibold tracking-tight text-foreground">
          What works for them
        </h2>
        <InfoTip label="About What works for them">From their top posts we keep, not every post they made.</InfoTip>
      </div>
      {analysis ? <Works analysis={analysis} /> : <p className="text-sm text-muted-foreground">No posts read for this creator yet.</p>}
    </section>
  );
}

function Works({ analysis }: { analysis: CreatorAnalysis }) {
  const { advisor, bestPost, avgLikes, avgComments, formatStats, insights, posts } = analysis;
  const { angles, structures } = usedMost(analysis);
  const stats: [string, string][] = [
    ["Average likes", avgLikes.toLocaleString()],
    ["Average comments", String(avgComments)],
    ["Best format", formatStats[0]?.label ?? "-"],
    ["Posts read", String(posts.length)],
  ];
  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {stats.map(([label, value]) => (
          <div key={label} className="rounded-xl bg-secondary/50 p-2.5">
            <dt className="text-[11px] text-muted-foreground">{label}</dt>
            <dd className="text-sm font-semibold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      {(angles.length > 0 || structures.length > 0) && (
        <div className="space-y-1 text-sm">
          {angles.length > 0 && (
            <p>
              <span className="font-semibold">Angles they use most:</span> {angles.map(([a, n]) => `${a} (${n})`).join(", ")}
            </p>
          )}
          {structures.length > 0 && (
            <p>
              <span className="font-semibold">How their posts are built:</span> {structures.map(([s]) => s).join(", ")}
            </p>
          )}
        </div>
      )}
      <InsightCards insights={insights} />
      {bestPost && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">Their best post</span>
          <RemixButton source={fromTopPost(bestPost, { ...advisor, id: topAdvisorId(advisor.handle) ?? advisor.id })} label={`${advisor.name}'s best post`}>
            <Button asChild size="sm" variant="outline" className="gap-1.5 [@media(pointer:coarse)]:h-11">
              <Link to={buildRemixUrl(bestPost, advisor)}>
                <Wand2 className="h-3.5 w-3.5" /> Remix their best post
              </Link>
            </Button>
          </RemixButton>
        </div>
      )}
    </div>
  );
}
