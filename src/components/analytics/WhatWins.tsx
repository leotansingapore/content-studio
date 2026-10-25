// Analytics > What wins for you (learn-format-winners, Leo only): your posted posts against your usual on the same
// network, by format, hook or angle (?wins=), with what you haven't tried yet and a button that starts the next post.
// The scoring, the Jev tag job and the weekly try-next pick live in src/lib/formatWinners.ts; this card only draws
// them. Other sign-ins draw nothing and make no call.

import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";
import { useLeoUser } from "@/lib/useLeoOnly";
import { useUrlState } from "@/lib/urlState";
import { scoped } from "@/lib/profiles";
import { hookFormula } from "@/lib/hookFormulas";
import { withReal } from "@/lib/analytics";
import { draftStatus, engagement, type DraftEntry } from "@/lib/draftHistory";
import {
  loadTags,
  makeAnotherUrl,
  onTags,
  subLine,
  tagJob,
  tagPosts,
  tryItUrl,
  tryNextHooks,
  untriedFormats,
  untriedHooks,
  winnerRows,
  type WinsBy,
} from "@/lib/formatWinners";
import { times } from "../../../supabase/functions/_shared/outlier.ts";

const TABS: { id: WinsBy; label: string }[] = [
  { id: "format", label: "Format" },
  { id: "hook", label: "Hook" },
  { id: "angle", label: "Angle" },
];
const MIN_POSTS = 5;
const WINDOW = 90 * 86_400_000;
const UNREAD = "Angles show once your posts are read. Try again later.";
const EMPTY: Record<WinsBy, string> = {
  format: "",
  hook: "None of your posts follow a hook formula yet.",
  angle: "None of your posts take a clear angle yet.",
};

// formatWinners' 90-day pool, for the count and the network you post on most (untriedFormats picks the same one)
const timeOf = (d: DraftEntry) => Date.parse(d.postedAt ?? d.scheduledFor ?? "");
const postedIn90 = (drafts: DraftEntry[], now: number) => drafts.filter((d) => draftStatus(d) === "posted" && now - timeOf(d) <= WINDOW);
const withNumbers = (d: DraftEntry) => !!d.metrics && !!(d.metrics.impressions || engagement(d.metrics));

function mostPosted(drafts: DraftEntry[], now: number): string {
  const count = new Map<string, number>();
  for (const d of postedIn90(drafts, now)) count.set(d.platform, (count.get(d.platform) ?? 0) + 1);
  return [...count].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "linkedin";
}

/** The niche figure per format: formatsWorkingNow over the swipe file, loaded only when an untried format needs it. */
async function nicheFigures(now: number): Promise<{ value: string; ratio: number }[]> {
  const [{ getAllTopPosts }, { buildCreatorAverages, enrich, formatsWorkingNow }] = await Promise.all([import("@/lib/topPosts"), import("@/lib/postInsights")]);
  const all = getAllTopPosts();
  const averages = buildCreatorAverages(all);
  return formatsWorkingNow(all.map((post) => ({ post, insight: enrich(post, averages) })), now).formats;
}

// One try-next ask per brand at a time: StrictMode and the sign-in read can mount the effect twice before Jev answers.
const asking = new Map<string, Promise<string[]>>();
function askTryNext(userId: string, scope: string): Promise<string[]> {
  let p = asking.get(scope);
  if (!p) asking.set(scope, (p = tryNextHooks(userId).finally(() => asking.delete(scope))));
  return p;
}

const TOUCH = "[@media(pointer:coarse)]:min-h-11";

function Row({ name, detail = [], muted, to, action }: { name: string; detail?: string[]; muted?: boolean; to?: string; action: string }) {
  return (
    <li className="flex items-center gap-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{name}</p>
        {detail.length > 0 && (
          <p className="flex flex-wrap gap-x-3 text-xs tabular-nums text-muted-foreground">
            {detail.map((t, i) => (
              <span key={t} className={muted && i > 0 ? "text-muted-foreground/70" : undefined}>
                {t}
              </span>
            ))}
          </p>
        )}
      </div>
      {to && (
        <Button asChild size="sm" variant="outline" className={`h-9 shrink-0 ${TOUCH}`}>
          <Link to={to}>{action}</Link>
        </Button>
      )}
    </li>
  );
}

export default function WhatWins({ userId, drafts }: { userId: string; drafts: DraftEntry[] }) {
  const leo = Boolean(useLeoUser());
  const { pathname, search } = useLocation();
  const [by, setBy] = useUrlState<WinsBy>("wins", "format", { allowed: TABS.map((t) => t.id) });
  // the open brand: tags, the tag job and the week's picks are per brand
  const scope = scoped(userId);
  const [tags, setTags] = useState(() => loadTags(userId));
  const [job, setJob] = useState(() => tagJob(userId));
  const [hooks, setHooks] = useState<string[]>([]);
  const [niche, setNiche] = useState<{ value: string; ratio: number }[]>([]);
  const now = Date.now();
  const pool = postedIn90(drafts, now).map(withReal).filter(withNumbers).length;
  const enough = pool >= MIN_POSTS;
  const anyUntriedFormat = untriedFormats(drafts, now).length > 0;

  // Jev reads the posts written without a formula (free, NO_PRICE): the job outlives the page and stops at the cap
  useEffect(() => {
    if (!leo || !enough) return;
    setTags(loadTags(userId));
    setJob(tagJob(userId));
    const off = onTags(() => {
      setTags(loadTags(userId));
      setJob(tagJob(userId));
    });
    void tagPosts(userId);
    let live = true;
    void askTryNext(userId, scope).then((h) => live && setHooks(h));
    return () => {
      live = false;
      off();
    };
  }, [leo, userId, scope, enough]);

  useEffect(() => {
    if (!leo || !enough || !anyUntriedFormat) return;
    let live = true;
    nicheFigures(Date.now())
      .then((f) => live && setNiche(f))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [leo, enough, anyUntriedFormat]);

  if (!leo) return null;

  const rows = enough ? winnerRows(drafts, by, tags, now) : [];
  const reading = by !== "format" && job.running && job.total > 0;
  const unread = by === "angle" && !job.running && job.error;
  const platform = mostPosted(drafts, now);
  const stillUntried = new Set(untriedHooks(drafts, tags, now));
  const tryHooks = hooks.filter((h) => stillUntried.has(h) && hookFormula(h));
  const tryFormats = enough ? untriedFormats(drafts, now, niche) : [];

  return (
    <Card id="what-wins" className="scroll-mt-20 border-border/60 shadow-card">
      <CardHeader className="space-y-2.5">
        <div className="space-y-0.5">
          <CardTitle className="flex items-center gap-1.5 font-serif text-lg">
            What wins for you
            <InfoTip label="About what wins">Each post against your usual on the same network.</InfoTip>
          </CardTitle>
          <p className="text-xs text-muted-foreground">{subLine(drafts, now)}</p>
        </div>
        {enough && (
          <div className="flex gap-1.5" role="group" aria-label="What wins by">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setBy(t.id)}
                aria-pressed={by === t.id}
                className={`h-9 rounded-full border px-3 text-xs font-semibold transition-colors ${TOUCH} ${
                  by === t.id ? "border-primary/60 bg-primary/10 text-primary" : "border-border/70 bg-background text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}
      </CardHeader>
      <CardContent>
        {!enough ? (
          <p className="text-sm text-muted-foreground">
            Add numbers to 5 posted posts to see what wins.{" "}
            <Link to={`${pathname}${search}#add-your-numbers`} className={`inline-flex items-center font-medium text-primary hover:underline ${TOUCH}`}>
              Add your numbers
            </Link>
          </p>
        ) : (
          <div className="space-y-4">
            {reading && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Reading your posts... {job.done} of {job.total}
              </p>
            )}
            {unread && (
              <div className="space-y-0.5">
                <p className="text-sm text-muted-foreground">{UNREAD}</p>
                {job.error?.code === "daily_limit" && <p className="text-xs text-muted-foreground/80">{job.error.message}</p>}
              </div>
            )}
            {rows.length > 0 ? (
              <ul className="divide-y divide-border/60">
                {rows.map((r) => (
                  <Row
                    key={r.key}
                    name={r.label}
                    detail={[`${r.posts} ${r.posts === 1 ? "post" : "posts"}`, r.score === null ? "Too few to say" : `${times(r.score)} your usual`]}
                    muted={r.score === null}
                    to={r.score === null ? undefined : makeAnotherUrl(by, r)}
                    action="Make another"
                  />
                ))}
              </ul>
            ) : (
              !reading && !unread && EMPTY[by] && <p className="text-sm text-muted-foreground">{EMPTY[by]}</p>
            )}
            {(tryHooks.length > 0 || tryFormats.length > 0) && (
              <div className="border-t border-border/60 pt-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Not tried yet</h3>
                <ul className="divide-y divide-border/60">
                  {tryHooks.map((h) => (
                    <Row key={h} name={`${hookFormula(h)!.name} hook`} to={tryItUrl("hook", h, platform)} action="Try it" />
                  ))}
                  {tryFormats.map((f) => (
                    <Row
                      key={f.format}
                      name={f.label}
                      detail={f.niche === null ? [] : [`${times(f.niche)} their usual in your niche`]}
                      to={tryItUrl("format", f.format, platform)}
                      action="Try it"
                    />
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
