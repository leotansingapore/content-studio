// "Your account audit" on the Analytics page. Reads the consultant's last 30
// Instagram / TikTok posts (audit-social-account edge function), shows how each
// did against their own usual numbers, and lists what to double down on, fix
// and stop, citing the posts behind each point. Opening the page refreshes an
// audit at most once a day; a weekly job refreshes it in the background.

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  BREAKOUT_RATIO,
  MIN_POSTS_FOR_ADVICE,
  POSTS_TO_READ,
  WEAK_RATIO,
  firstLine,
  formatCount,
  formatWord,
  freshnessOf,
  loadAudit,
  loadSnapshots,
  normalizeHandle,
  openAudit,
  profileUrl,
  refreshDecision,
  remixUrl,
  removeAudit,
  shortDate,
  timeAgo,
  timeUntil,
  type AdvicePoint,
  type AuditAdvice,
  type AuditPlatform,
  type AuditRow,
  type AuditSnapshot,
  type AuditStats,
  type RatedPost,
  type RefreshDecision,
} from "@/lib/accountAudit";
import type { SocialAccounts } from "@/lib/socialAccounts";
import {
  AlertTriangle,
  Ban,
  CalendarDays,
  Check,
  ExternalLink,
  Eye,
  Heart,
  Instagram,
  Loader2,
  RefreshCw,
  Sparkles,
  Trash2,
  TrendingUp,
  Users,
  Video,
  Wand2,
  Wrench,
} from "lucide-react";

const AUDITABLE: AuditPlatform[] = ["instagram", "tiktok"];
const PLATFORM_NAME: Record<AuditPlatform, string> = { instagram: "Instagram", tiktok: "TikTok" };
const PLATFORM_ICON: Record<AuditPlatform, typeof Instagram> = { instagram: Instagram, tiktok: Video };
const POLL_MS = 5000;
const POLL_GIVE_UP_MS = 4 * 60_000;

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function metricLine(p: RatedPost): string {
  return [
    p.views !== null ? `${formatCount(p.views)} views` : "",
    `${formatCount(p.likes)} likes`,
    `${formatCount(p.comments)} comments`,
    p.shares !== null ? `${formatCount(p.shares)} shares` : "",
    p.saves !== null ? `${formatCount(p.saves)} saves` : "",
  ]
    .filter(Boolean)
    .join(" · ");
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
          We read your last {POSTS_TO_READ} posts, compare each one with your own usual numbers,
          and tell you what to double down on, what to fix and what to stop. It updates when you
          open this page (at most once a day) and every week.
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
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">
                {profile?.fullName || `@${handle}`}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                <a
                  href={profile?.url || profileUrl(platform, handle)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-primary hover:underline"
                >
                  @{handle}
                </a>{" "}
                on {PLATFORM_NAME[platform]}
                {profile?.followers != null ? ` · ${formatCount(profile.followers)} followers` : ""}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {fetchedAt && (
              <span className="text-[11px] text-muted-foreground">Updated {timeAgo(fetchedAt)}</span>
            )}
            <RefreshControl
              decision={decision}
              loading={loading}
              refreshing={refreshing}
              onRefresh={open}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={remove}
              disabled={removing}
              aria-label={`Stop auditing @${handle}`}
              className="h-8 px-2 text-muted-foreground hover:text-destructive"
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
            {refreshing && (
              <p className="flex items-center gap-1.5 text-[11px] font-medium text-primary">
                <Loader2 className="h-3 w-3 animate-spin" /> Updating with your latest posts…
              </p>
            )}
            {audit.status === "error" && audit.error && (
              <ErrorNote
                message={`The latest update didn't finish: ${audit.error} Showing your audit from ${shortDate(fetchedAt)}.`}
              />
            )}
            <StatTiles platform={platform} stats={stats} followers={profile?.followers ?? null} />
            {snapshots.length >= 2 && <Changes current={snapshots[0]} previous={snapshots[1]} />}
            <AdviceBlock platform={platform} advice={audit.advice} stats={stats} byId={byId} />
            <BestPosts platform={platform} handle={handle} audit={audit} stats={stats} byId={byId} />
            <RatioChart platform={platform} posts={posts} />
            <WeakPosts platform={platform} stats={stats} byId={byId} />
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Views are plays. Each post is compared with your own median across these posts.
              {platform === "instagram"
                ? " Instagram doesn't show views for photos and carousels, so those are compared on likes and comments."
                : ""}{" "}
              Posts under 2 days old are still growing, so they aren't judged yet.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function RefreshControl({
  decision,
  loading,
  refreshing,
  onRefresh,
}: {
  decision: RefreshDecision | null;
  loading: boolean;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  if (loading || refreshing) {
    return (
      <Button size="sm" variant="outline" disabled className="h-8 gap-1.5">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> {refreshing ? "Updating" : "Checking"}
      </Button>
    );
  }
  if (decision?.action === "refresh") {
    return (
      <Button size="sm" variant="outline" onClick={onRefresh} className="h-8 gap-1.5">
        <RefreshCw className="h-3.5 w-3.5" /> Refresh
      </Button>
    );
  }
  const label =
    decision?.action === "serve" && decision.nextRefreshAt
      ? `Next update ${timeUntil(decision.nextRefreshAt)}`
      : "Up to date";
  return (
    <span className="inline-flex h-8 items-center gap-1 rounded-md border border-border/60 px-2.5 text-[11px] text-muted-foreground">
      <Check className="h-3 w-3" /> {label}
    </span>
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
    <p className="flex items-start gap-1.5 rounded-md border border-destructive/30 bg-destructive/[0.05] px-3 py-2 text-xs text-destructive">
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

function StatTiles({
  platform,
  stats,
  followers,
}: {
  platform: AuditPlatform;
  stats: AuditStats;
  followers: number | null;
}) {
  const lastPost =
    stats.daysSinceLastPost === null
      ? ""
      : stats.daysSinceLastPost === 0
        ? " · last post today"
        : ` · last post ${stats.daysSinceLastPost}d ago`;
  const tiles = [
    { icon: Users, label: "Followers", value: followers !== null ? formatCount(followers) : "Hidden" },
    stats.medianViews !== null
      ? { icon: Eye, label: "Median views", value: formatCount(stats.medianViews) }
      : { icon: Heart, label: "Median likes + comments", value: formatCount(stats.medianInteractions) },
    {
      icon: Heart,
      label: platform === "instagram" ? "Engagement per follower" : "Engagement per view",
      value: stats.medianEngagementRate !== null ? `${stats.medianEngagementRate}%` : "n/a",
    },
    {
      icon: CalendarDays,
      label: `Posts a week${lastPost}`,
      value: stats.postsPerWeek !== null ? String(stats.postsPerWeek) : "n/a",
    },
  ];
  return (
    <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
      {tiles.map((t) => {
        const TileIcon = t.icon;
        return (
          <div key={t.label} className="rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5">
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <TileIcon className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{t.label}</span>
            </div>
            <div className="mt-1 font-serif text-xl font-semibold tabular-nums text-foreground">
              {t.value}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Changes({ current, previous }: { current: AuditSnapshot; previous: AuditSnapshot }) {
  const parts: string[] = [];
  if (current.followers !== null && previous.followers !== null) {
    const d = current.followers - previous.followers;
    if (d !== 0) parts.push(`followers ${d > 0 ? "+" : "−"}${formatCount(Math.abs(d))}`);
  }
  const nowViews = Number(current.median_views);
  const prevViews = Number(previous.median_views);
  if (current.median_views !== null && previous.median_views !== null && prevViews > 0) {
    const pct = Math.round(((nowViews - prevViews) / prevViews) * 100);
    if (pct !== 0) parts.push(`median views ${pct > 0 ? "+" : "−"}${Math.abs(pct)}%`);
  }
  if (current.posts_per_week !== null && previous.posts_per_week !== null) {
    const d = Math.round((Number(current.posts_per_week) - Number(previous.posts_per_week)) * 10) / 10;
    if (d !== 0) parts.push(`posts a week ${d > 0 ? "+" : "−"}${Math.abs(d)}`);
  }
  if (parts.length === 0) return null;
  return (
    <p className="text-xs text-muted-foreground">
      <span className="font-semibold text-foreground">Since {shortDate(previous.taken_at)}:</span>{" "}
      {parts.join(" · ")}
    </p>
  );
}

const ADVICE_GROUPS: {
  key: "doubleDown" | "fix" | "stop";
  label: string;
  hint: string;
  icon: typeof TrendingUp;
  iconClass: string;
  dotClass: string;
  empty: string;
}[] = [
  {
    key: "doubleDown",
    label: "Double down",
    hint: "Working. Do more of it.",
    icon: TrendingUp,
    iconClass: "text-success",
    dotClass: "bg-success",
    empty: "No clear winner yet. Keep posting and check back next week.",
  },
  {
    key: "fix",
    label: "Fix",
    hint: "Worth keeping, done better.",
    icon: Wrench,
    iconClass: "text-warning",
    dotClass: "bg-warning",
    empty: "Nothing obvious to fix right now.",
  },
  {
    key: "stop",
    label: "Stop now",
    hint: "Holding your account back.",
    icon: Ban,
    iconClass: "text-destructive",
    dotClass: "bg-destructive",
    empty: "Nothing is clearly dragging you down.",
  },
];

function AdviceBlock({
  platform,
  advice,
  stats,
  byId,
}: {
  platform: AuditPlatform;
  advice: AuditAdvice | null;
  stats: AuditStats;
  byId: Map<string, RatedPost>;
}) {
  if (!advice) {
    return (
      <div className="rounded-xl border border-border/60 bg-muted/20 p-3.5 text-sm text-muted-foreground">
        {stats.postsAnalyzed < MIN_POSTS_FOR_ADVICE
          ? `Advice starts once you have ${MIN_POSTS_FOR_ADVICE} public posts. We found ${stats.postsAnalyzed}.`
          : "The advice couldn't be written this time. It will try again the next time you open this page."}
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {advice.summary && <p className="text-sm leading-relaxed text-foreground">{advice.summary}</p>}
      <div className="grid gap-3 lg:grid-cols-3">
        {ADVICE_GROUPS.map((g) => {
          const items: AdvicePoint[] = advice[g.key];
          const GroupIcon = g.icon;
          return (
            <div key={g.key} className="rounded-xl border border-border/60 p-3.5">
              <div className="mb-2.5">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                  <GroupIcon className={`h-4 w-4 ${g.iconClass}`} /> {g.label}
                </p>
                <p className="text-[11px] text-muted-foreground">{g.hint}</p>
              </div>
              {items.length === 0 ? (
                <p className="text-xs text-muted-foreground">{g.empty}</p>
              ) : (
                <ul className="space-y-3">
                  {items.map((pt, i) => {
                    const cited = pt.postIds
                      .map((id) => byId.get(id))
                      .filter((p): p is RatedPost => p !== undefined);
                    return (
                      <li key={i} className="space-y-1">
                        <p className="flex gap-2 text-sm font-medium text-foreground">
                          <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${g.dotClass}`} aria-hidden />
                          {pt.title}
                        </p>
                        <p className="pl-3.5 text-xs leading-relaxed text-muted-foreground">{pt.detail}</p>
                        {cited.length > 0 && (
                          <div className="flex flex-wrap gap-1 pl-3.5">
                            {cited.map((p) => (
                              <PostChip key={p.id} platform={platform} post={p} />
                            ))}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PostChip({ platform, post }: { platform: AuditPlatform; post: RatedPost }) {
  return (
    <a
      href={post.url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-background px-2 py-0.5 text-[10px] font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
    >
      {capitalize(formatWord(platform, post.format))} · {shortDate(post.postedAt)}
      {post.ratio !== null ? ` · ${post.ratio}×` : ""}
      <ExternalLink className="h-2.5 w-2.5" />
    </a>
  );
}

function RatioPill({ ratio }: { ratio: number | null }) {
  if (ratio === null) {
    return (
      <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
        New
      </span>
    );
  }
  const tone =
    ratio >= BREAKOUT_RATIO
      ? "bg-success/10 text-success"
      : ratio <= WEAK_RATIO
        ? "bg-destructive/10 text-destructive"
        : "bg-muted text-foreground";
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums ${tone}`}>
      {ratio}× your usual
    </span>
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
  const top = stats.topIds.map((id) => byId.get(id)).filter((p): p is RatedPost => p !== undefined);
  if (top.length === 0) return null;
  const picks = new Map((audit.advice?.remix ?? []).map((r) => [r.postId, r]));
  return (
    <div className="space-y-2.5">
      <div>
        <h3 className="text-sm font-semibold text-foreground">Your best posts</h3>
        <p className="text-[11px] text-muted-foreground">
          Ranked against your own usual numbers. Remix a winner: same idea, new hook and example.
        </p>
      </div>
      <ul className="space-y-2">
        {top.map((p) => {
          const pick = picks.get(p.id);
          return (
            <li key={p.id} className="rounded-xl border border-border/70 bg-card p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] text-muted-foreground">
                  {capitalize(formatWord(platform, p.format))}
                  {p.durationSec ? ` · ${p.durationSec}s` : ""} · {shortDate(p.postedAt)}
                  {p.pinned ? " · pinned" : ""}
                </p>
                <RatioPill ratio={p.ratio} />
              </div>
              <p className="mt-1 text-sm text-foreground">{firstLine(p.caption, 160) || "No caption"}</p>
              <p className="mt-1 text-[11px] tabular-nums text-muted-foreground">{metricLine(p)}</p>
              {pick && (
                <p className="mt-2 rounded-lg bg-primary/[0.05] px-2.5 py-1.5 text-xs text-foreground">
                  <span className="font-semibold">Remix idea:</span> {pick.newAngle}{" "}
                  <span className="text-muted-foreground">{pick.why}</span>
                </p>
              )}
              <div className="mt-2.5 flex flex-wrap gap-2">
                <Button asChild size="sm" className="h-8 gap-1.5">
                  <Link to={remixUrl(p, platform, handle, pick?.newAngle)}>
                    <Wand2 className="h-3.5 w-3.5" /> Remix this
                  </Link>
                </Button>
                <Button asChild size="sm" variant="outline" className="h-8 gap-1.5">
                  <a href={p.url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-3.5 w-3.5" /> Open post
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
          Oldest to newest. The dashed line is your usual; taller bars beat it. Tap a bar to open the post.
        </p>
      </div>
      <div className="relative h-40">
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
          <span className="absolute right-0 top-0 w-14 text-right text-[10px] text-muted-foreground">
            {CHART_CAP}× or more
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
                      : "bg-primary/45";
              const label = `${capitalize(formatWord(platform, p.format))}, ${shortDate(p.postedAt)}: ${
                r === null ? "too new to judge" : `${r}× your usual`
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
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-success" aria-hidden /> {BREAKOUT_RATIO}× your usual or more
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-destructive/70" aria-hidden /> Half your usual or less
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-muted-foreground/25" aria-hidden /> Too new to judge
        </span>
      </div>
    </div>
  );
}

function WeakPosts({
  platform,
  stats,
  byId,
}: {
  platform: AuditPlatform;
  stats: AuditStats;
  byId: Map<string, RatedPost>;
}) {
  const weak = stats.weakIds
    .map((id) => byId.get(id))
    .filter((p): p is RatedPost => p !== undefined)
    .slice(0, 3);
  if (weak.length === 0) return null;
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-foreground">Underperformed</h3>
      <ul className="divide-y divide-border/50 rounded-xl border border-border/60">
        {weak.map((p) => (
          <li key={p.id} className="flex items-center gap-3 px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-foreground">{firstLine(p.caption) || "No caption"}</p>
              <p className="truncate text-[11px] text-muted-foreground">
                {capitalize(formatWord(platform, p.format))} · {shortDate(p.postedAt)} · {metricLine(p)}
              </p>
            </div>
            <RatioPill ratio={p.ratio} />
            <a
              href={p.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open post"
              className="shrink-0 text-muted-foreground transition-colors hover:text-primary"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
