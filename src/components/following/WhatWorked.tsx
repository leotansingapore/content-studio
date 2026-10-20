// What worked for a followed account (docs/north-star/items/remix-patterns.md part A), Leo only: the button on an
// account card and the panel it opens under the card (?account=<platform>:<handle>&view=patterns). The run is
// patterns.ts's job outside React; this only draws it.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Check, Loader2, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import OutlierBadge from "@/components/OutlierBadge";
import PriceChip from "@/components/PriceChip";
import RemixButton from "@/components/remix/RemixButton";
import { remixUrl, type FollowedAccount } from "@/lib/following";
import {
  MIN_POSTS, accountKey, cancelPatterns, ideaSource, ideaWriteUrl, isStale, loadPatterns, onPatternRun, onPatternsChanged, patternFailure,
  patternName, patternRun, runPatterns, scoredPosts, stepAt, steps, type PatternEntry, type PatternsState,
} from "@/lib/patterns";
import { reasonText } from "@/lib/prices";
import { dayMonth, fromFollowPost } from "@/lib/remixSource";
import { useScrollToItem } from "@/lib/urlState";
import { cn } from "@/lib/utils";

const NEEDS_POSTS = `Needs ${MIN_POSTS} posts with numbers. Check the account again later.`;
const FORMAT_LABEL = { post: "Post", carousel: "Carousel", script: "Script" } as const;

/** This brand's cached results, redrawn when a run saves one or starts, steps or stops. null userId reads nothing. */
export function usePatterns(userId: string | null): PatternsState {
  const [state, setState] = useState<PatternsState>(() => (userId ? loadPatterns(userId) : {}));
  const [, tick] = useState(0);
  useEffect(() => {
    if (!userId) return;
    setState(loadPatterns(userId));
    const off = onPatternsChanged(() => setState(loadPatterns(userId)));
    const offRun = onPatternRun(() => tick((n) => n + 1));
    return () => {
      off();
      offRun();
    };
  }, [userId]);
  return state;
}

/** Starts a run unless a result or a run is already there; either way the panel opens. */
function open(userId: string, a: FollowedAccount, entry: PatternEntry | undefined, onOpen: () => void) {
  if (!entry && !patternRun(a)) void runPatterns(userId, a);
  onOpen();
}

/** "What worked" on a card: off under 8 posts with numbers, and priced unless a cached result opens free. */
export function WhatWorkedButton({ a, userId, entry, left, onOpen }: { a: FollowedAccount; userId: string; entry?: PatternEntry; left: number | null; onOpen: () => void }) {
  const ready = scoredPosts(a).scored.length >= MIN_POSTS;
  const why = entry ? null : reasonText({ left, leo: true });
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Button variant="outline" size="sm" className="h-10 gap-1.5 [@media(pointer:coarse)]:h-11" disabled={(!ready && !entry) || Boolean(why)} onClick={() => open(userId, a, entry, onOpen)}>
          <Sparkles className="h-3.5 w-3.5" /> What worked
        </Button>
        {!entry && ready && <PriceChip feature="remix-patterns" left={left} />}
      </div>
      {!ready && !entry && <p className="text-xs text-muted-foreground">{NEEDS_POSTS}</p>}
      {why && ready && <p className="text-xs text-destructive">{why}</p>}
    </div>
  );
}

export default function WhatWorked({ a, userId, entry, left, linked, onClose }: {
  a: FollowedAccount;
  userId: string;
  entry?: PatternEntry;
  left: number | null;
  /** Opened by a link: scrolled to. */
  linked: boolean;
  onClose: () => void;
}) {
  const ref = useScrollToItem<HTMLElement>(linked);
  const run = patternRun(a);
  const failure = patternFailure(a);
  const ready = scoredPosts(a).scored.length >= MIN_POSTS;
  const why = reasonText({ left, leo: true });
  const start = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <Button size="sm" className="h-10 [@media(pointer:coarse)]:h-11" disabled={!ready || Boolean(why)} onClick={() => void runPatterns(userId, a)}>
        {failure ? "Try again" : entry ? "Run again" : "What worked"}
      </Button>
      {ready && <PriceChip feature="remix-patterns" left={left} />}
      {!ready && <p className="basis-full text-xs text-muted-foreground">{NEEDS_POSTS}</p>}
      {why && ready && <p className="basis-full text-xs text-destructive">{why}</p>}
    </div>
  );
  return (
    <section ref={ref} id={`what-worked-${accountKey(a)}`} aria-labelledby={`what-worked-title-${accountKey(a)}`} className="space-y-4 rounded-xl border border-border/60 bg-card p-3 sm:p-4">
      <div className="flex items-start gap-2">
        <div className="mr-auto min-w-0">
          <h3 id={`what-worked-title-${accountKey(a)}`} className="text-sm font-semibold">What worked for @{a.handle}</h3>
          {entry && <p className="text-xs text-muted-foreground">From the check on {dayMonth(entry.checkedAt)}</p>}
        </div>
        <Button size="icon" variant="ghost" className="-mr-1 -mt-1 h-10 w-10" aria-label="Close What worked" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {run ? (
        <Steps a={a} at={run.at} n={run.n} />
      ) : failure ? (
        <div className="space-y-2">
          <p role="alert" className="text-sm text-destructive">{failure.message}</p>
          {failure.code !== "not_enabled" && start}
        </div>
      ) : !entry ? (
        start
      ) : (
        isStale(entry, a) && start
      )}

      {entry && !run && <Result a={a} entry={entry} />}
    </section>
  );
}

function Steps({ a, at, n }: { a: FollowedAccount; at: number; n: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  const step = stepAt(now - at);
  return (
    <div className="space-y-2" aria-live="polite">
      <ol className="space-y-1.5 text-sm">
        {steps(n).map((s, k) => (
          <li key={s} className={cn("flex items-center gap-2", k > step && "text-muted-foreground")}>
            {k < step ? <Check className="h-4 w-4 text-success" /> : k === step ? <Loader2 className="h-4 w-4 animate-spin" /> : <span className="h-4 w-4" />}
            {s}
          </li>
        ))}
      </ol>
      <div className="flex items-center gap-3">
        <span className="text-xs tabular-nums text-muted-foreground">{Math.max(0, Math.floor((now - at) / 1000))}s</span>
        <Button size="sm" variant="ghost" className="h-10 [@media(pointer:coarse)]:h-11" onClick={() => cancelPatterns(a)}>Cancel</Button>
      </div>
    </div>
  );
}

function Result({ a, entry }: { a: FollowedAccount; entry: PatternEntry }) {
  const { scored } = scoredPosts(a);
  // the posts the run called best that this check still holds; with none at 1.5x, the run read the top 3
  const best = entry.best.length ? scored.filter((s) => entry.best.includes(s.post.id)) : scored.slice(0, 3);
  const bestCount = entry.best.length || 3;
  return (
    <>
      {best.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold">{best.length === 1 ? "Their best post, against their usual" : `Their ${best.length} best posts, against their usual`}</h4>
          <ul className="space-y-2">
            {best.map(({ post: p, outlier }) => (
              <li key={p.id} className="space-y-1.5 rounded-lg bg-secondary/40 p-2.5">
                <div className="flex items-start gap-2">
                  <OutlierBadge outlier={outlier} />
                  <p className="line-clamp-2 min-w-0 text-xs">{p.caption || "No caption"}</p>
                </div>
                <RemixButton source={fromFollowPost(a, p)} label={`@${a.handle}'s post`}>
                  <Button asChild size="sm" variant="outline" className="h-9">
                    <Link to={remixUrl(a, p)}>Remix this</Link>
                  </Button>
                </RemixButton>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-1.5">
        <h4 className="text-xs font-semibold">What they share</h4>
        {entry.patterns.length ? (
          <ul className="space-y-1 text-sm">
            {entry.patterns.map((p) => (
              <li key={`${p.field}:${p.value}`}>
                <span className="font-medium">{patternName(p)}</span>{" "}
                <span className="text-muted-foreground">{p.inBest} of their {bestCount} best posts, {p.inRest} of the other {p.rest}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Their best posts don't share a pattern yet.</p>
        )}
      </div>

      {entry.ideas.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold">{entry.from === "best" ? "Ideas from their 3 best posts" : "Ideas for you"}</h4>
          <ol className="space-y-2">
            {entry.ideas.map((idea, k) => (
              <li key={k} className="space-y-1.5 rounded-lg bg-secondary/40 p-2.5">
                <p className="text-sm font-medium">{k + 1}. "{idea.hook}"</p>
                <p className="text-xs text-muted-foreground">
                  {/* the format label already says Carousel, so a format pattern isn't repeated */}
                  {[FORMAT_LABEL[idea.format], ...idea.patterns.filter((p) => !/^(Videos|Carousels|Photos)$/.test(p))].join(", ")}. {idea.angle}
                </p>
                <RemixButton source={ideaSource(a, idea, k + 1)} label={`idea ${k + 1}`}>
                  <Button asChild size="sm" variant="outline" className="h-9">
                    <Link to={ideaWriteUrl(a, idea, k + 1)}>Remix this</Link>
                  </Button>
                </RemixButton>
              </li>
            ))}
          </ol>
        </div>
      )}
    </>
  );
}
