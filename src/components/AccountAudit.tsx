// "Your account audit" on the Analytics page. Reads the consultant's last 30
// Instagram / TikTok posts (audit-social-account edge function), shows how each
// did against their own usual numbers, and lists what to double down on, fix
// and stop, citing the posts behind each point. Opening the page refreshes an
// audit at most once a day; a weekly job refreshes it in the background.
//
// Kept deliberately calm: three headline numbers, the advice, the top three
// posts to remix. The per-post chart and the flops sit behind a disclosure.

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  BREAKOUT_RATIO,
  MIN_POSTS_FOR_ADVICE,
  MIN_POSTS_FOR_IDEAS,
  POSTS_TO_READ,
  WEAK_RATIO,
  firstLine,
  formatCount,
  formatWord,
  freshnessOf,
  ideaWriteUrl,
  loadAudit,
  loadLatestIdeas,
  loadSnapshots,
  normalizeHandle,
  openAudit,
  profileUrl,
  refreshDecision,
  remixUrl,
  removeAudit,
  requestIdeas,
  setIdeaStatus,
  shortDate,
  timeAgo,
  timeUntil,
  type AdvicePoint,
  type AuditAdvice,
  type AuditPlatform,
  type AuditRow,
  type AuditSnapshot,
  type AuditStats,
  type IdeaRow,
  type RatedPost,
} from "@/lib/accountAudit";
import type { SocialAccounts } from "@/lib/socialAccounts";
import {
  AlertTriangle,
  Ban,
  ChevronDown,
  ExternalLink,
  Instagram,
  Loader2,
  RefreshCw,
  Sparkles,
  Trash2,
  TrendingUp,
  Video,
  Wand2,
  Wrench,
} from "lucide-react";

const AUDITABLE: AuditPlatform[] = ["instagram", "tiktok"];
const PLATFORM_NAME: Record<AuditPlatform, string> = { instagram: "Instagram", tiktok: "TikTok" };
const PLATFORM_ICON: Record<AuditPlatform, typeof Instagram> = { instagram: Instagram, tiktok: Video };
const POLL_MS = 5000;
const POLL_GIVE_UP_MS = 4 * 60_000;
const BEST_POSTS_SHOWN = 3;

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** 26.72 → "27×", 2.46 → "2.5×". */
function times(ratio: number): string {
  return `${ratio >= 10 ? Math.round(ratio) : Math.round(ratio * 10) / 10}×`;
}

export default function AccountAudit({
  accounts,
  onSaveAccount,
}: {
  accounts: SocialAccounts;
  onSaveAccount: (platform: AuditPlatform, handle: string) => void;
}) {
  const connected = AUDITABLE.flatMap((platform) => {
    const handle = normalizeHandle(platform, accounts[platform]?.handle ?? "");
    return handle ? [{ platform, handle }] : [];
  });
  const missing = AUDITABLE.filter((p) => !connected.some((c) => c.platform === p));

  return (
    <section className="space-y-3" aria-labelledby="account-audit-heading">
      <div className="space-y-1">
        <h2 id="account-audit-heading" className="font-serif text-lg font-semibold text-foreground">
          Your account audit
        </h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Your last {POSTS_TO_READ} posts, compared with your own usual. Updates when you open this
          page and every week.
        </p>
      </div>
      {connected.map((a) => (
        <AuditPanel
          key={`${a.platform}:${a.handle}`}
          platform={a.platform}
          handle={a.handle}
          onRemove={() => onSaveAccount(a.platform, "")}
        />
      ))}
      {missing.length > 0 && (
        <AddAccount
          platforms={missing}
          first={connected.length === 0}
          onAdd={(platform, handle) => onSaveAccount(platform, `@${handle}`)}
        />
      )}
    </section>
  );
}

function AddAccount({
  platforms,
  first,
  onAdd,
}: {
  platforms: AuditPlatform[];
  first: boolean;
  onAdd: (platform: AuditPlatform, handle: string) => void;
}) {
  const [picked, setPicked] = useState<AuditPlatform>(platforms[0]);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const platform = platforms.includes(picked) ? picked : platforms[0];

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const handle = normalizeHandle(platform, value);
    if (!handle) {
      setError(`Enter your ${PLATFORM_NAME[platform]} handle, like @yourname, or paste your profile link.`);
      return;
    }
    setError(null);
    setValue("");
    onAdd(platform, handle);
  };

  return (
    <Card className="border-dashed border-border/80 shadow-none">
      <CardContent className="space-y-3 py-4">
        <p className="text-sm font-semibold text-foreground">
          {first ? "Audit your account" : `Add your ${PLATFORM_NAME[platform]} too`}
        </p>
        {platforms.length > 1 && (
          <div className="flex gap-1.5" role="radiogroup" aria-label="Platform">
            {platforms.map((p) => {
              const Icon = PLATFORM_ICON[p];
              const active = p === platform;
              return (
                <button
                  key={p}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setPicked(p)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                    active
                      ? "border-primary/60 bg-primary/10 text-primary"
                      : "border-border/70 bg-background text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" /> {PLATFORM_NAME[p]}
                </button>
              );
            })}
          </div>
        )}
        <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="account-audit-handle"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              if (error) setError(null);
            }}
            placeholder={platform === "instagram" ? "@yourhandle or your Instagram link" : "@yourhandle or your TikTok link"}
            aria-label={`Your ${PLATFORM_NAME[platform]} handle`}
            aria-invalid={error ? true : undefined}
            className="sm:flex-1"
          />
          <Button type="submit" size="sm" className="h-10 gap-1.5">
            <Sparkles className="h-3.5 w-3.5" /> Audit my {PLATFORM_NAME[platform]}
          </Button>
        </form>
        {error && <p className="text-xs font-medium text-destructive">{error}</p>}
        <p className="text-[11px] text-muted-foreground">
          Public accounts only. We read your posts and their public numbers. We never log in or
          post for you.
        </p>
      </CardContent>
    </Card>
  );
}

function AuditPanel({
  platform,
  handle,
  onRemove,
}: {
  platform: AuditPlatform;
  handle: string;
  onRemove: () => void;
}) {
  const [audit, setAudit] = useState<AuditRow | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [stalled, setStalled] = useState(false);
  const [snapshots, setSnapshots] = useState<AuditSnapshot[]>([]);
  const [removing, setRemoving] = useState(false);

  const open = useCallback(async () => {
    setLoading(true);
    setFailure(null);
    setNotice(null);
    setStalled(false);
    try {
      const res = await openAudit(platform, handle);
      setAudit(res.audit);
      setNotice(res.notice);
    } catch (e) {
      setFailure(e instanceof Error ? e.message : "Couldn't load your audit. Try again.");
    } finally {
      setLoading(false);
    }
  }, [platform, handle]);

  useEffect(() => {
    void open();
  }, [open]);

  // While a refresh runs on the server, re-read the row until it finishes.
  const auditId = audit?.id;
  const refreshing = audit?.status === "refreshing";
  useEffect(() => {
    if (!auditId || !refreshing) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const began = Date.now();
    const tick = async () => {
      const row = await loadAudit(auditId).catch(() => null);
      if (cancelled) return;
      if (row) setAudit(row);
      if (row && row.status !== "refreshing") return;
      if (Date.now() - began > POLL_GIVE_UP_MS) {
        setStalled(true);
        return;
      }
      timer = setTimeout(tick, POLL_MS);
    };
    timer = setTimeout(tick, POLL_MS);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [auditId, refreshing]);

  const fetchedAt = audit?.fetched_at ?? null;
  useEffect(() => {
    if (!auditId || !fetchedAt) return;
    let cancelled = false;
    loadSnapshots(auditId)
      .then((rows) => {
        if (!cancelled) setSnapshots(rows);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [auditId, fetchedAt]);

  const posts = useMemo(() => audit?.posts ?? [], [audit]);
  const byId = useMemo(() => new Map(posts.map((p) => [p.id, p])), [posts]);
  const stats = audit?.stats ?? null;
  const profile = audit?.profile ?? null;
  const hasData = stats !== null && posts.length > 0;
  const decision = audit ? refreshDecision(freshnessOf(audit), Date.now()) : null;
  const busy = loading || refreshing;
  const Icon = PLATFORM_ICON[platform];

  const remove = async () => {
    if (!window.confirm(`Stop auditing @${handle}? Its audit history is deleted too.`)) return;
    setRemoving(true);
    try {
      if (audit) await removeAudit(audit.id);
      onRemove();
    } catch (e) {
      setFailure(e instanceof Error ? e.message : "Couldn't remove it. Try again.");
      setRemoving(false);
    }
  };

  return (
    <Card className="border-border/60 shadow-card">
      <CardContent className="space-y-5 py-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">
                {profile?.fullName || `@${handle}`}
              </p>
              <a
                href={profile?.url || profileUrl(platform, handle)}
                target="_blank"
                rel="noopener noreferrer"
                className="block truncate text-xs text-muted-foreground hover:text-primary hover:underline"
              >
                @{handle} · {PLATFORM_NAME[platform]}
              </a>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {busy && audit ? (
              <span className="inline-flex items-center gap-1.5 px-1 text-[11px] text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> Updating
              </span>
            ) : (
              fetchedAt && (
                <span
                  className="hidden px-1 text-[11px] text-muted-foreground sm:inline"
                  title={
                    decision?.action === "serve" && decision.nextRefreshAt
                      ? `Next update ${timeUntil(decision.nextRefreshAt)}`
                      : undefined
                  }
                >
                  Updated {timeAgo(fetchedAt)}
                </span>
              )
            )}
            {!busy && decision?.action === "refresh" && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={open}
                aria-label="Refresh audit"
                title="Refresh"
                className="h-8 w-8 p-0 text-muted-foreground"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={remove}
              disabled={removing}
              aria-label={`Stop auditing @${handle}`}
              title="Stop auditing"
              className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {notice && <p className="text-xs text-muted-foreground">{notice}</p>}
        {failure && audit && <ErrorNote message={failure} />}

        {!audit && loading && <StatusLine text="Checking your audit…" />}
        {!audit && !loading && failure && <ErrorBox message={failure} onRetry={open} />}

        {audit && !hasData && refreshing && (
          <StatusLine
            text={
              stalled
                ? "Still working. Check back in a few minutes."
                : `Reading your last ${POSTS_TO_READ} posts on ${PLATFORM_NAME[platform]}. The first audit takes about a minute.`
            }
          />
        )}
        {audit && !hasData && audit.status === "error" && (
          <ErrorBox
            message={audit.error ?? "The audit didn't finish."}
            onRetry={decision?.action === "refresh" ? open : undefined}
          />
        )}

        {audit && hasData && stats && (
          <>
            {audit.status === "error" && audit.error && (
              <ErrorNote message={`The latest update didn't finish, so this is from ${shortDate(fetchedAt)}.`} />
            )}
            <Headline stats={stats} followers={profile?.followers ?? null} snapshots={snapshots} />
            <AdviceBlock advice={audit.advice} stats={stats} byId={byId} />
            {stats.postsAnalyzed >= MIN_POSTS_FOR_IDEAS && (
              <PostIdeas auditId={audit.id} platform={platform} handle={handle} byId={byId} />
            )}
            <BestPosts platform={platform} handle={handle} audit={audit} stats={stats} byId={byId} />
            <details className="group rounded-xl border border-border/60">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3.5 py-2.5 text-sm font-medium text-foreground [&::-webkit-details-marker]:hidden">
                See how all {posts.length} posts did
                <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
              </summary>
              <div className="space-y-5 border-t border-border/60 p-3.5">
                <RatioChart platform={platform} posts={posts} />
                <WeakPosts stats={stats} byId={byId} />
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  Views are plays. Each post is compared with your own median across these posts.
                  {platform === "instagram"
                    ? " Instagram doesn't show views for photos and carousels, so those are compared on likes and comments."
                    : ""}{" "}
                  Posts under 2 days old are still growing, so they aren't judged yet.
                </p>
              </div>
            </details>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function StatusLine({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/20 p-3.5 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" /> {text}
    </div>
  );
}

function ErrorNote({ message }: { message: string }) {
  return (
    <p className="flex items-start gap-1.5 text-xs text-destructive">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {message}
    </p>
  );
}

function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="space-y-2 rounded-lg border border-destructive/30 bg-destructive/[0.05] p-3.5">
      <p className="flex items-start gap-2 text-sm text-foreground">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" /> {message}
      </p>
      {onRetry ? (
        <Button size="sm" variant="outline" onClick={onRetry} className="h-8 gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" /> Try again
        </Button>
      ) : (
        <p className="text-xs text-muted-foreground">You can try again in a couple of minutes.</p>
      )}
    </div>
  );
}

/** Three plain numbers, plus follower growth once there's a week to compare. */
function Headline({
  stats,
  followers,
  snapshots,
}: {
  stats: AuditStats;
  followers: number | null;
  snapshots: AuditSnapshot[];
}) {
  const items: { value: string; label: string }[] = [];
  if (followers !== null) items.push({ value: formatCount(followers), label: "followers" });
  if (stats.medianViews !== null) {
    items.push({ value: formatCount(stats.medianViews), label: "typical views" });
  } else {
    items.push({ value: formatCount(stats.medianInteractions), label: "typical likes + comments" });
  }
  if (stats.daysSinceLastPost !== null && stats.daysSinceLastPost > 14) {
    items.push({ value: String(stats.daysSinceLastPost), label: "days since your last post" });
  } else if (stats.postsPerWeek !== null) {
    items.push({ value: String(stats.postsPerWeek), label: stats.postsPerWeek === 1 ? "post a week" : "posts a week" });
  }

  const [current, previous] = snapshots;
  const growth =
    current && previous && current.followers !== null && previous.followers !== null
      ? current.followers - previous.followers
      : 0;

  return (
    <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1.5">
      {items.map((item) => (
        <p key={item.label} className="text-sm text-muted-foreground">
          <span className="font-serif text-lg font-semibold tabular-nums text-foreground">{item.value}</span>{" "}
          {item.label}
        </p>
      ))}
      {growth !== 0 && previous && (
        <p className={`text-xs font-medium ${growth > 0 ? "text-success" : "text-destructive"}`}>
          {growth > 0 ? "+" : "−"}
          {formatCount(Math.abs(growth))} followers since {shortDate(previous.taken_at)}
        </p>
      )}
    </div>
  );
}

const ADVICE_GROUPS: {
  key: "doubleDown" | "fix" | "stop";
  label: string;
  icon: typeof TrendingUp;
  iconClass: string;
  empty: string;
}[] = [
  { key: "doubleDown", label: "Double down", icon: TrendingUp, iconClass: "text-success", empty: "No clear winner yet." },
  { key: "fix", label: "Fix", icon: Wrench, iconClass: "text-warning", empty: "Nothing obvious to fix." },
  { key: "stop", label: "Stop now", icon: Ban, iconClass: "text-destructive", empty: "Nothing is holding you back." },
];

function AdviceBlock({
  advice,
  stats,
  byId,
}: {
  advice: AuditAdvice | null;
  stats: AuditStats;
  byId: Map<string, RatedPost>;
}) {
  if (!advice) {
    return (
      <p className="text-sm text-muted-foreground">
        {stats.postsAnalyzed < MIN_POSTS_FOR_ADVICE
          ? `Advice starts once you have ${MIN_POSTS_FOR_ADVICE} public posts. We found ${stats.postsAnalyzed}.`
          : "The advice couldn't be written this time. It will try again the next time you open this page."}
      </p>
    );
  }
  return (
    <div className="space-y-3">
      {advice.summary && <p className="max-w-3xl text-sm leading-relaxed text-foreground">{advice.summary}</p>}
      <div className="grid gap-3 md:grid-cols-3">
        {ADVICE_GROUPS.map((g) => {
          const items: AdvicePoint[] = advice[g.key];
          const GroupIcon = g.icon;
          return (
            <div key={g.key} className="space-y-3 rounded-xl bg-muted/30 p-3.5">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                <GroupIcon className={`h-4 w-4 ${g.iconClass}`} /> {g.label}
              </p>
              {items.length === 0 ? (
                <p className="text-xs text-muted-foreground">{g.empty}</p>
              ) : (
                <ul className="space-y-3">
                  {items.map((pt, i) => (
                    <li key={i} className="space-y-0.5">
                      <p className="text-sm font-medium leading-snug text-foreground">{pt.title}</p>
                      <p className="text-xs leading-relaxed text-muted-foreground">{pt.detail}</p>
                      <SeePosts posts={pt.postIds.map((id) => byId.get(id)).filter((p): p is RatedPost => !!p)} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** "See post" or "See posts 1 2 3", each linking to the post it cites. */
function SeePosts({ posts }: { posts: RatedPost[] }) {
  if (posts.length === 0) return null;
  const linkClass = "inline-flex items-center gap-0.5 font-medium text-primary hover:underline";
  return (
    <p className="flex flex-wrap items-center gap-x-2 pt-0.5 text-[11px] text-muted-foreground">
      {posts.length === 1 ? (
        <a href={posts[0].url} target="_blank" rel="noopener noreferrer" className={linkClass}>
          See post <ExternalLink className="h-2.5 w-2.5" />
        </a>
      ) : (
        <>
          <span>See posts</span>
          {posts.map((p, i) => (
            <a
              key={p.id}
              href={p.url}
              target="_blank"
              rel="noopener noreferrer"
              title={firstLine(p.caption, 80) || "Open post"}
              aria-label={`Post ${i + 1}: ${firstLine(p.caption, 80) || "open post"}`}
              className={linkClass}
            >
              {i + 1}
            </a>
          ))}
        </>
      )}
    </p>
  );
}

function BestPosts({
  platform,
  handle,
  audit,
  stats,
  byId,
}: {
  platform: AuditPlatform;
  handle: string;
  audit: AuditRow;
  stats: AuditStats;
  byId: Map<string, RatedPost>;
}) {
  const top = stats.topIds
    .map((id) => byId.get(id))
    .filter((p): p is RatedPost => p !== undefined)
    .slice(0, BEST_POSTS_SHOWN);
  if (top.length === 0) return null;
  const picks = new Map((audit.advice?.remix ?? []).map((r) => [r.postId, r]));
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-foreground">Your best posts to remix</h3>
      <ul className="divide-y divide-border/60 rounded-xl border border-border/60">
        {top.map((p) => {
          const pick = picks.get(p.id);
          const breakout = p.ratio !== null && p.ratio >= BREAKOUT_RATIO;
          return (
            <li key={p.id} className="space-y-2 p-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium leading-snug text-foreground">
                    {firstLine(p.caption, 110) || "No caption"}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {capitalize(formatWord(platform, p.format))} · {shortDate(p.postedAt)}
                  </p>
                </div>
                {p.ratio !== null && (
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ${
                      breakout ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {times(p.ratio)} your usual
                  </span>
                )}
              </div>
              {pick && (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  <span className="font-medium text-foreground">Remix idea:</span> {pick.newAngle}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button asChild size="sm" className="h-8 gap-1.5">
                  <Link to={remixUrl(p, platform, handle, pick?.newAngle)}>
                    <Wand2 className="h-3.5 w-3.5" /> Remix this
                  </Link>
                </Button>
                <Button asChild size="sm" variant="ghost" className="h-8 gap-1.5 text-muted-foreground">
                  <a href={p.url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-3.5 w-3.5" /> View post
                  </a>
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Five fresh post ideas built from what went furthest on this account. Each
 * new batch avoids every idea shown before and every post already made.
 */
function PostIdeas({
  auditId,
  platform,
  handle,
  byId,
}: {
  auditId: string;
  platform: AuditPlatform;
  handle: string;
  byId: Map<string, RatedPost>;
}) {
  const [ideas, setIdeas] = useState<IdeaRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadLatestIdeas(auditId)
      .then((rows) => {
        if (!cancelled) setIdeas(rows);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [auditId]);

  const visible = ideas.filter((i) => i.status !== "dismissed");
  const formula = visible.find((i) => i.formula)?.formula ?? null;

  const generate = async () => {
    setWorking(true);
    setError(null);
    try {
      setIdeas(await requestIdeas(auditId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't get ideas. Try again.");
    } finally {
      setWorking(false);
    }
  };

  const skip = (id: string) => {
    setIdeas((list) => list.map((i) => (i.id === id ? { ...i, status: "dismissed" } : i)));
    setIdeaStatus(id, "dismissed").catch(() => {});
  };

  return (
    <div className="space-y-3 rounded-xl border border-primary/20 bg-primary/[0.03] p-3.5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 max-w-2xl">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <Sparkles className="h-4 w-4 text-primary" /> Post ideas in your style
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            {formula
              ? `What works for you: ${formula}`
              : "Fresh ideas built from your best posts: new topics or new twists, never ones you've already done."}
          </p>
        </div>
        <Button
          size="sm"
          variant={visible.length ? "outline" : "default"}
          onClick={generate}
          disabled={working || !loaded}
          className="h-8 shrink-0 gap-1.5"
        >
          {working ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : visible.length ? (
            <RefreshCw className="h-3.5 w-3.5" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
          {working ? "Thinking…" : visible.length ? "5 different ideas" : "Get 5 post ideas"}
        </Button>
      </div>

      {working && visible.length === 0 && (
        <p className="text-xs text-muted-foreground">Studying your best posts. This takes about 15 seconds.</p>
      )}
      {error && <p className="text-xs font-medium text-destructive">{error}</p>}

      {visible.length > 0 && (
        <ul className={`space-y-2 transition-opacity ${working ? "opacity-50" : ""}`} aria-busy={working}>
          {visible.map((idea) => {
            const source = idea.based_on_post_id ? byId.get(idea.based_on_post_id) : undefined;
            return (
              <li key={idea.id} className="space-y-1.5 rounded-lg border border-border/60 bg-background p-3">
                <p className="text-sm font-medium leading-snug text-foreground">{idea.hook}</p>
                <p className="text-xs leading-relaxed text-muted-foreground">{idea.idea}</p>
                <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
                  <p className="min-w-0 text-[11px] text-muted-foreground">
                    {capitalize(formatWord(platform, idea.format))}
                    {source && (
                      <>
                        {" · in the style of "}
                        <a
                          href={source.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline"
                        >
                          “{firstLine(source.caption, 48) || "your best post"}”
                        </a>
                      </>
                    )}
                  </p>
                  <div className="flex shrink-0 gap-1.5">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => skip(idea.id)}
                      title="Hide this idea. It won't come back."
                      className="h-7 px-2.5 text-xs text-muted-foreground"
                    >
                      Skip
                    </Button>
                    <Button asChild size="sm" className="h-7 gap-1.5 px-2.5 text-xs">
                      <Link
                        to={ideaWriteUrl(idea, platform, handle, source)}
                        onClick={() => {
                          setIdeaStatus(idea.id, "used").catch(() => {});
                        }}
                      >
                        <Wand2 className="h-3 w-3" /> Write this
                      </Link>
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {loaded && !working && ideas.length > 0 && visible.length === 0 && (
        <p className="text-xs text-muted-foreground">You skipped all of these. Get 5 more whenever you like.</p>
      )}
    </div>
  );
}

const CHART_CAP = 4;

function RatioChart({ platform, posts }: { platform: AuditPlatform; posts: RatedPost[] }) {
  const ordered = posts
    .filter((p) => p.postedAt)
    .sort((a, b) => Date.parse(a.postedAt as string) - Date.parse(b.postedAt as string));
  if (ordered.length < 3) return null;
  const usualPct = `${100 / CHART_CAP}%`;
  return (
    <div className="space-y-2">
      <div>
        <h3 className="text-sm font-semibold text-foreground">Every post against your usual</h3>
        <p className="text-[11px] text-muted-foreground">
          Oldest to newest. Green beat your usual, red fell well short. Tap a bar to open the post.
        </p>
      </div>
      <div className="relative h-32">
        <div className="absolute inset-x-0 bottom-5 top-0">
          <div
            className="absolute left-0 right-14 border-t border-dashed border-muted-foreground/50"
            style={{ bottom: usualPct }}
            aria-hidden
          />
          <span
            className="absolute right-0 w-14 translate-y-1/2 text-right text-[10px] text-muted-foreground"
            style={{ bottom: usualPct }}
          >
            your usual
          </span>
          <div className="absolute bottom-0 left-0 right-14 top-0 flex items-end gap-[2px] border-b border-border">
            {ordered.map((p) => {
              const r = p.ratio;
              const height = r === null ? 3 : Math.max(2, (Math.min(r, CHART_CAP) / CHART_CAP) * 100);
              const tone =
                r === null
                  ? "bg-muted-foreground/25"
                  : r >= BREAKOUT_RATIO
                    ? "bg-success"
                    : r <= WEAK_RATIO
                      ? "bg-destructive/70"
                      : "bg-primary/35";
              const label = `${capitalize(formatWord(platform, p.format))}, ${shortDate(p.postedAt)}: ${
                r === null ? "too new to judge" : `${times(r)} your usual`
              }${p.views !== null ? `, ${formatCount(p.views)} views` : ""}`;
              return (
                <a
                  key={p.id}
                  href={p.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={label}
                  aria-label={label}
                  className={`min-w-0 flex-1 rounded-t-sm transition-opacity hover:opacity-75 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary ${tone}`}
                  style={{ height: `${height}%` }}
                />
              );
            })}
          </div>
        </div>
        <div className="absolute bottom-0 left-0 right-14 flex justify-between text-[10px] text-muted-foreground">
          <span>{shortDate(ordered[0].postedAt)}</span>
          <span>{shortDate(ordered[ordered.length - 1].postedAt)}</span>
        </div>
      </div>
    </div>
  );
}

function WeakPosts({ stats, byId }: { stats: AuditStats; byId: Map<string, RatedPost> }) {
  const weak = stats.weakIds
    .map((id) => byId.get(id))
    .filter((p): p is RatedPost => p !== undefined)
    .slice(0, 3);
  if (weak.length === 0) return null;
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-foreground">Fell well short</h3>
      <ul className="space-y-1.5">
        {weak.map((p) => (
          <li key={p.id} className="flex items-center gap-3 text-sm">
            <a
              href={p.url}
              target="_blank"
              rel="noopener noreferrer"
              className="min-w-0 flex-1 truncate text-foreground hover:text-primary hover:underline"
            >
              {firstLine(p.caption) || "No caption"}
            </a>
            {p.ratio !== null && (
              <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                {times(p.ratio)} your usual
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
