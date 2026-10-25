// Analytics > Your real numbers: pulls the year's post numbers and daily follower counts for the open
// brand's connected accounts (src/lib/realNumbers.ts). Posts sent with Post it for me get them in place of
// typed numbers; the rest are listed as posted outside the app. Follower counts join the audit's growth
// chart for an audited account and get their own chart here otherwise. Shown only while Social accounts is on.

import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ExternalLink, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";
import { FollowerGrowth } from "@/components/AccountAudit";
import { useToast } from "@/hooks/use-toast";
import { connectedFor, timeAgo } from "@/lib/accountAudit";
import { draftStatus, loadDrafts, setDraftNumbers, type DraftEntry } from "@/lib/draftHistory";
import { wordOverlap } from "@/lib/nearDuplicate";
import { toPlainText } from "@/lib/plainText";
import { activeProfileId } from "@/lib/profiles";
import { isNotEnabled, platformName } from "@/lib/socialConnect";
import { useLeoUser } from "@/lib/useLeoOnly";
import { useUrlItem } from "@/lib/urlState";
import {
  linkPost,
  loadRealNumbers,
  markNotMine,
  matchPulled,
  numbersJob,
  numbersLine,
  onNumbers,
  pullFollowers,
  pullNumbers,
  realNumbersOn,
  refreshIfStale,
  refreshNumbers,
  rememberRealNumbers,
  unlinkPost,
  type FollowerSeries,
  type MetricsPost,
  type NumbersJob,
} from "@/lib/realNumbers";

type State =
  | { at: "idle" }
  | { at: "pulling" }
  | { at: "none" }
  | { at: "done"; matched: number; outside: MetricsPost[]; followers: FollowerSeries[]; when: Date }
  | { at: "error"; message: string }
  | { at: "off" };

const TOUCH = "[@media(pointer:coarse)]:h-11";

const postLine = (p: MetricsPost) => numbersLine(p.numbers, ["views", "reach", "likes", "comments", "shares", "saves"]) || "No numbers yet";

const dayLabel = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-SG", { day: "numeric", month: "short", timeZone: "Asia/Singapore" }) : "");

interface Props {
  userId: string;
  /** The audit panels on the page: their accounts' follower counts go on the audit's own chart. */
  audited: { platform: string; handle: string }[];
  onChange: () => void;
  onFollowers: (f: FollowerSeries[]) => void;
}

/** Leo's card runs on the shared numbers job; every other sign-in keeps today's card, word for word. */
export default function RealNumbers(props: Props) {
  const leo = useLeoUser();
  if (leo === undefined) return <Skeleton />;
  return leo ? <LeoNumbers {...props} /> : <TodayNumbers {...props} />;
}

function Skeleton() {
  return (
    <Card className="border-border/60 shadow-card">
      <CardHeader className="pb-3">
        <CardTitle className="font-serif text-lg">Your real numbers</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-9 w-40 animate-pulse rounded-md bg-muted" />
      </CardContent>
    </Card>
  );
}

function TodayNumbers({ userId, audited, onChange, onFollowers }: Props) {
  const [state, setState] = useState<State>({ at: "idle" });

  const pull = useCallback(async () => {
    setState({ at: "pulling" });
    try {
      const profileId = activeProfileId(userId);
      const { accounts, posts } = await pullNumbers(profileId);
      if (!accounts.length) {
        onFollowers([]);
        return setState({ at: "none" });
      }
      // the post numbers still show when the follower counts can't be read
      const followers = await pullFollowers(profileId).catch(() => [] as FollowerSeries[]);
      const { byDraft, outside } = matchPulled(loadDrafts(userId), posts);
      setDraftNumbers(userId, byDraft, new Date().toISOString());
      rememberRealNumbers(userId);
      setState({ at: "done", matched: byDraft.size, outside, followers, when: new Date() });
      onFollowers(followers);
      onChange();
    } catch (e) {
      onFollowers([]);
      setState(isNotEnabled(e) ? { at: "off" } : { at: "error", message: e instanceof Error ? e.message : "Couldn't read your numbers. Try again in a minute." });
    }
  }, [userId, onChange, onFollowers]);

  // once used for this brand, every visit pulls again so the numbers stay fresh
  useEffect(() => {
    setState({ at: "idle" });
    if (realNumbersOn(userId)) void pull();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  if (state.at === "off") return null;
  const busy = state.at === "pulling";

  return (
    <Card className="border-border/60 shadow-card">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-1 font-serif text-lg">
          Your real numbers
          <InfoTip label="About real numbers">Posts sent with Post it for me show these instead of typed numbers.</InfoTip>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div aria-live="polite" className="space-y-3">
          {(state.at === "idle" || busy) && (
            <p className="text-sm text-muted-foreground">Views, reach, likes, comments, shares and saves for the last 12 months, from your connected accounts.</p>
          )}
          {state.at === "none" && <p className="text-sm text-muted-foreground">No accounts are connected for this brand yet.</p>}
          {state.at === "error" && <p className="text-sm text-destructive">{state.message}</p>}
          {state.at === "done" && (
            <p className="text-sm text-muted-foreground">
              {state.matched
                ? `${state.matched === 1 ? "1 post" : `${state.matched} posts`} from Post it for me now ${state.matched === 1 ? "shows" : "show"} real numbers. `
                : "None of your Post it for me posts have numbers yet. "}
              Updated {state.when.toLocaleTimeString("en-SG", { hour: "numeric", minute: "2-digit" })}.
            </p>
          )}
        </div>

        {state.at === "none" ? (
          <Button asChild variant="outline" size="sm" className={TOUCH}>
            <Link to="/accounts">Connect an account</Link>
          </Button>
        ) : (
          <Button type="button" size="sm" variant={state.at === "done" ? "outline" : "default"} onClick={pull} disabled={busy} className={`gap-1.5 ${TOUCH}`}>
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {busy ? "Pulling your numbers..." : state.at === "done" ? "Update" : state.at === "error" ? "Try again" : "Use my real numbers"}
          </Button>
        )}

        {state.at === "done" && (
          <FollowerCharts followers={state.followers.filter((f) => f.series.length > 1 && !audited.some((a) => connectedFor([f], a.platform, a.handle)))} />
        )}

        {state.at === "done" && state.outside.length > 0 && (
          <details className="group" open={state.outside.length <= 5}>
            <summary className={`inline-flex h-9 cursor-pointer list-none items-center text-sm font-medium text-foreground ${TOUCH} [&::-webkit-details-marker]:hidden`}>
              Posted outside the app ({state.outside.length})
            </summary>
            <ul className="space-y-2">
              {state.outside.map((p) => (
                <li key={p.id} className="flex items-center gap-3 rounded-lg border border-border/60 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{p.text.split("\n").find((l) => l.trim()) || "A post"}</p>
                    <p className="text-[11px] text-muted-foreground">{[platformName(p.platform), dayLabel(p.publishedAt)].filter(Boolean).join(", ")}</p>
                    <p className="text-xs text-foreground">{postLine(p)}</p>
                  </div>
                  {p.url && (
                    <a
                      href={p.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Open the post on ${platformName(p.platform)}`}
                      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-primary [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </details>
        )}
      </CardContent>
    </Card>
  );
}

// ---- Leo's card (learn-real-numbers): the shared job, its states, and linking an outside post by hand ----

/** The status line over Leo's card: the job's run, refusal or failure. Null once a run has landed cleanly. */
export function jobChip(job: NumbersJob, paused: boolean): { text: string; tone: "muted" | "error"; retry?: true } | null {
  const e = job.error;
  if (job.running) return { text: "Updating your numbers...", tone: "muted" };
  // 402 no_analytics pauses the job for 24 hours, so the line stays after a reload
  if (e?.status === 402 || (!e && paused)) return { text: e?.message || "Analytics isn't on this Zernio plan.", tone: "muted" };
  if (e?.status === 429) return { text: e.message, tone: "muted" };
  if (e) return { text: "Couldn't update your numbers.", tone: "error", retry: true };
  return null;
}

const WEEK = 7 * 86_400_000;

/** "Which post is this?": up to 10 posted drafts on the post's platform within 7 days, not already linked, closest words first. */
export function pickerDrafts(drafts: DraftEntry[], post: MetricsPost): DraftEntry[] {
  const at = Date.parse(post.publishedAt ?? "");
  return drafts
    .filter((d) => draftStatus(d) === "posted" && d.platform === post.platform && !d.zernio?.postId && !d.live && Math.abs(Date.parse(d.postedAt ?? d.scheduledFor ?? "") - at) <= WEEK)
    .map((d) => ({ d, overlap: wordOverlap(toPlainText(d.draft).slice(0, post.text.length), post.text) }))
    .sort((a, b) => b.overlap - a.overlap)
    .slice(0, 10)
    .map((c) => c.d);
}

const firstLine = (text: string) => text.split("\n").find((l) => l.trim()) || "A post";

function useNumbersJob(userId: string): NumbersJob {
  const [, tick] = useState(0);
  useEffect(() => onNumbers(() => tick((n) => n + 1)), []);
  return numbersJob(userId);
}

function LeoNumbers({ userId, audited, onChange, onFollowers }: Props) {
  const job = useNumbersJob(userId);
  const [linkId, openLink, closeLink] = useUrlItem("link");
  const { toast } = useToast();
  // posts linked by hand on this visit: they keep their row, reading "Linked" with Unlink
  const [here, setHere] = useState<Record<string, string>>({});

  // the outside list and the follower counts live in memory only, so a cold load pulls once; after that the 6-hour rule
  useEffect(() => {
    setHere({});
    if (numbersJob(userId).at) refreshIfStale(userId);
    else void refreshNumbers(userId);
  }, [userId]);

  const landed = job.running ? null : job.at;
  useEffect(() => {
    if (!landed) return;
    onFollowers(numbersJob(userId).followers);
    onChange();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [landed, userId]);

  // ?link= for a post the latest pull doesn't have: drop it and say so
  const missing = !!linkId && !!landed && !job.outside.some((p) => p.id === linkId);
  useEffect(() => {
    if (!missing) return;
    closeLink();
    toast({ title: "That post isn't in your latest numbers." });
  }, [missing, closeLink, toast]);

  const s = loadRealNumbers(userId);
  const paused = !!s.pausedUntil && Date.parse(s.pausedUntil) > Date.now();
  if (job.error?.status === 404 && /not enabled/i.test(job.error.message)) return null;

  const drafts = loadDrafts(userId);
  const linked = new Set(drafts.flatMap((d) => (d.live ? [d.live.postId] : [])));
  const outside = job.outside.filter((p) => here[p.id] || !linked.has(p.id));
  const withNumbers = drafts.filter((d) => d.zernio?.numbers || d.live?.numbers).length;
  const chip = jobChip(job, paused);
  const capped = !!chip && !chip.retry && !job.running;
  const reading = !!linkId && !job.outside.some((p) => p.id === linkId) && (job.running || (!job.at && !job.error && !paused));

  const link = (post: MetricsPost, d: DraftEntry) => {
    linkPost(userId, d.id, post, "you");
    setHere((h) => ({ ...h, [post.id]: d.id }));
    closeLink();
    onChange();
  };
  const unlink = (post: MetricsPost) => {
    unlinkPost(userId, here[post.id]);
    setHere(({ [post.id]: _gone, ...rest }) => rest);
    onChange();
  };
  const notMine = (post: MetricsPost) => {
    markNotMine(userId, post.id);
    closeLink();
  };

  return (
    <Card className="border-border/60 shadow-card">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-1 font-serif text-lg">
          Your real numbers
          <InfoTip label="About real numbers">Posts you put out yourself are matched to their drafts too.</InfoTip>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div aria-live="polite" className="space-y-3">
          {chip ? (
            <p className={`flex items-center gap-1.5 text-sm ${chip.tone === "error" ? "text-destructive" : "text-muted-foreground"}`}>
              {job.running && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {chip.text}
            </p>
          ) : job.none ? (
            <p className="text-sm text-muted-foreground">No accounts are connected for this brand yet.</p>
          ) : job.at ? (
            <p className="text-sm text-muted-foreground">
              {withNumbers ? `${withNumbers === 1 ? "1 post shows" : `${withNumbers} posts show`} real numbers. ` : "None of your posts have numbers yet. "}
              Updated {timeAgo(job.at)}.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">Views, reach, likes, comments, shares and saves for the last 12 months, from your connected accounts.</p>
          )}
          {reading && <p className="text-sm text-muted-foreground">Reading your numbers...</p>}
        </div>

        {job.none && !job.running && !job.error ? (
          <Button asChild variant="outline" size="sm" className={TOUCH}>
            <Link to="/accounts">Connect an account</Link>
          </Button>
        ) : chip?.retry ? (
          <Button type="button" size="sm" onClick={() => void refreshNumbers(userId)} className={TOUCH}>
            Try again
          </Button>
        ) : capped ? null : (
          <Button type="button" size="sm" variant="outline" onClick={() => void refreshNumbers(userId)} disabled={job.running} className={TOUCH}>
            Update
          </Button>
        )}

        <FollowerCharts followers={job.followers.filter((f) => f.series.length > 1 && !audited.some((a) => connectedFor([f], a.platform, a.handle)))} />

        {outside.length > 0 && (
          <details className="group" open={outside.length <= 5 || outside.some((p) => p.id === linkId)}>
            <summary className={`inline-flex h-9 cursor-pointer list-none items-center text-sm font-medium text-foreground ${TOUCH} [&::-webkit-details-marker]:hidden`}>
              Posted outside the app ({outside.length})
            </summary>
            <ul className="space-y-2">
              {outside.map((p) => (
                <li key={p.id} className="rounded-lg border border-border/60 px-3 py-2">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <div className="min-w-0 flex-1 basis-48">
                      <p className="truncate text-sm font-medium text-foreground">{firstLine(p.text)}</p>
                      <p className="text-[11px] text-muted-foreground">{[platformName(p.platform), dayLabel(p.publishedAt)].filter(Boolean).join(", ")}</p>
                      <p className="text-xs text-foreground">{postLine(p)}</p>
                    </div>
                    {here[p.id] ? (
                      <span className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground">Linked</span>
                        <Button type="button" size="sm" variant="ghost" onClick={() => unlink(p)} className={TOUCH}>
                          Unlink
                        </Button>
                      </span>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        aria-expanded={linkId === p.id}
                        onClick={() => (linkId === p.id ? closeLink() : openLink(p.id))}
                        className={TOUCH}
                      >
                        Link to a post
                      </Button>
                    )}
                    {p.url && (
                      <a
                        href={p.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Open the post on ${platformName(p.platform)}`}
                        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-primary [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    )}
                  </div>
                  {linkId === p.id && !here[p.id] && <Picker post={p} drafts={pickerDrafts(drafts, p)} onLink={(d) => link(p, d)} onNone={() => notMine(p)} />}
                </li>
              ))}
            </ul>
          </details>
        )}
      </CardContent>
    </Card>
  );
}

function Picker({ post, drafts, onLink, onNone }: { post: MetricsPost; drafts: DraftEntry[]; onLink: (d: DraftEntry) => void; onNone: () => void }) {
  return (
    <div role="group" aria-label="Which post is this?" className="mt-2 space-y-2 border-t border-border/60 pt-2">
      <p className="text-sm font-medium text-foreground">Which post is this?</p>
      {drafts.length > 0 && (
        <ul className="space-y-1">
          {drafts.map((d) => (
            <li key={d.id} className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-foreground">{d.hook || firstLine(toPlainText(d.draft))}</p>
                <p className="text-[11px] text-muted-foreground">{[platformName(post.platform), dayLabel(d.postedAt ?? d.scheduledFor ?? null)].filter(Boolean).join(", ")}</p>
              </div>
              <Button type="button" size="sm" variant="outline" onClick={() => onLink(d)} aria-label={`Link "${d.hook || "this post"}"`} className={TOUCH}>
                Link
              </Button>
            </li>
          ))}
        </ul>
      )}
      <Button type="button" size="sm" variant="ghost" onClick={onNone} className={TOUCH}>
        None of these
      </Button>
    </div>
  );
}

/** Follower growth for the connected accounts no audit panel shows. */
function FollowerCharts({ followers }: { followers: FollowerSeries[] }) {
  if (!followers.length) return null;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {followers.map((f) => (
        <div key={f.id} className="min-w-0 space-y-1">
          <p className="truncate text-sm font-medium text-foreground">
            {platformName(f.platform)}
            {f.username ? `: ${f.username}` : ""}
          </p>
          <FollowerGrowth zernio={f.series} />
        </div>
      ))}
    </div>
  );
}
