// Hashtags on /trends (?view=hashtags, Leo only; docs/north-star/items/find-search-topics.md): the tags on the finance
// TikToks the morning trend scout reads, from src/data/hashtagStats.json. No calls. The open tag lives in the URL.
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { PenLine } from "lucide-react";
import CopyLinkButton from "@/components/CopyLinkButton";
import { TrendChart } from "@/components/charts/TrendChart";
import { Sparkline, TrendsDrawer } from "@/components/trends/SearchTopics";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FilterChip as Chip } from "@/components/ui/filter-chip";
import { InfoTip } from "@/components/ui/info-tip";
import { links } from "@/lib/links";
import { hashtagRows, hashtagWriteUrl, staleLine, weekLabel, type HashtagRow } from "@/lib/searchTopics";
import { compactNum } from "@/lib/topPosts";
import { useGoneItem, useUrlItem } from "@/lib/urlState";
import { dayWords } from "../../../supabase/functions/market/logic.ts";

const readOf = (r: HashtagRow) => (r.latest.day === new Date().toISOString().slice(0, 10) ? "today's read" : "the last read");

function OftenWith({ r, onOpen, known }: { r: HashtagRow; onOpen?: (tag: string) => void; known?: Set<string> }) {
  if (!r.related.length) return null;
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
      <span>Often with:</span>
      {r.related.map((x) =>
        onOpen && known?.has(x.tag) ? (
          <Chip key={x.tag} active={false} onClick={() => onOpen(x.tag)}>
            #{x.tag} {Math.round(x.overlap * 100)}%
          </Chip>
        ) : (
          <span key={x.tag} className="tabular-nums">
            #{x.tag} {Math.round(x.overlap * 100)}%
          </span>
        ),
      )}
    </span>
  );
}

function MakePost({ r, className = "" }: { r: HashtagRow; className?: string }) {
  return (
    <Button asChild variant="outline" size="sm" className={`gap-1.5 [@media(pointer:coarse)]:h-11 ${className}`}>
      <Link to={hashtagWriteUrl(r)}>
        <PenLine className="h-3.5 w-3.5" /> Make a post
      </Link>
    </Button>
  );
}

export default function HashtagStats() {
  const rows = useMemo(() => hashtagRows(), []);
  const known = useMemo(() => new Set(rows.map((r) => r.tag)), [rows]);
  const stale = staleLine();
  const [openTag, open, close] = useUrlItem("tag");
  const shown = openTag ? rows.find((r) => r.tag === openTag) ?? null : null;
  // bundled data: a tag that isn't in the newest read opens the page without it, saying so
  useGoneItem("tag", Boolean(shown), "hashtag");

  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <div className="flex items-center gap-1.5">
          <h2 className="font-serif text-lg font-semibold tracking-tight text-foreground">Finance hashtags on TikTok</h2>
          <InfoTip label="About these hashtags">From about 75 finance TikToks we read each morning, worldwide.</InfoTip>
        </div>
        {stale && <p className="text-xs text-muted-foreground">{stale}</p>}
      </div>

      {rows.length === 0 ? (
        <Card className="border-border/60 shadow-card">
          <CardContent className="py-8 text-center text-sm text-muted-foreground">No hashtag data yet.</CardContent>
        </Card>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.tag} className="flex flex-col gap-2 rounded-lg border border-border/60 bg-card p-3 sm:flex-row sm:items-center sm:gap-4">
              <div className="min-w-0 flex-1 space-y-1">
                <button type="button" onClick={() => open(r.tag)} className="block min-w-0 text-left [@media(pointer:coarse)]:min-h-11">
                  <span className="block break-words font-medium text-foreground hover:text-primary">#{r.tag}</span>
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span className="tabular-nums">{r.latest.videos} videos in {readOf(r)}</span>
                    <span className="tabular-nums">Median {compactNum(r.latest.medianViews)} views</span>
                    {weekLabel(r) && <span className="font-medium text-foreground">{weekLabel(r)}</span>}
                  </span>
                </button>
                <OftenWith r={r} />
              </div>
              <div className="flex items-center gap-3">
                <Sparkline values={r.history.map((h) => h.medianViews)} label={`Median views over time for #${r.tag}`} />
                <MakePost r={r} className="ml-auto" />
              </div>
            </li>
          ))}
        </ul>
      )}

      {shown && (
        <TrendsDrawer
          key={shown.tag}
          title={`#${shown.tag}`}
          onClose={close}
          actions={
            <>
              <MakePost r={shown} className="flex-1" />
              <CopyLinkButton path={links.trends({ view: "hashtags", tag: shown.tag })} label="Copy link to this hashtag" />
            </>
          }
        >
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <span className="font-medium text-foreground">{shown.latest.videos} videos in {readOf(shown)}</span>
            <span className="text-muted-foreground">Median {compactNum(shown.latest.medianViews)} views</span>
            {weekLabel(shown) && <span className="text-muted-foreground">{weekLabel(shown)}</span>}
          </div>
          {/* one day is one number, already above; a line needs two */}
          {shown.history.length > 1 && (
            <TrendChart
              points={shown.history.map((h) => ({ id: h.day, label: dayWords(h.day), value: h.medianViews, detail: `${h.videos} videos` }))}
              format={(v) => compactNum(v)}
              measure="median views"
              title={`Median views of #${shown.tag} videos, by day`}
              fit
              width={460}
              height={150}
            />
          )}
          <OftenWith r={shown} onOpen={open} known={known} />
        </TrendsDrawer>
      )}
    </section>
  );
}
