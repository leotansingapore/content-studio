// Their posts (/competitors?view=posts; docs/north-star/items/find-competitor-posts.md): every watched competitor's
// Instagram and TikTok posts, ranked by the outlier score (each post against its own account's usual), with a pace
// table per account and the weekly check (opening the view checks whatever is 7+ days old). Checks run outside React
// in src/lib/competitorPosts.ts. ?c= is the pill, ?platform= and ?sort= the filters, ?post= marks one post.
import { Fragment, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ExternalLink, Loader2, RefreshCw, Shuffle } from "lucide-react";
import CopyLinkButton from "@/components/CopyLinkButton";
import OutlierBadge, { OutlierScoreTip } from "@/components/OutlierBadge";
import PriceChip from "@/components/PriceChip";
import RemixButton from "@/components/remix/RemixButton";
import { Button } from "@/components/ui/button";
import { FilterChip } from "@/components/ui/filter-chip";
import { useUsesLeft } from "@/lib/aiUsage";
import {
  type CompetitorPostsState, type FeedPost, type PostSort, bestRatio, checkCompetitorPosts, checkingAnyPosts, duePosts, entryKey, feedPosts, handlesOf,
  isCheckingPosts, onCompetitorPosts, postsCheckFailure, postsStopped, runDuePosts, runPostsCheck,
} from "@/lib/competitorPosts";
import type { Competitor } from "@/lib/competitors";
import { safeExternalUrl } from "@/lib/embed";
import { type FollowPlatform, followStats, remixUrl } from "@/lib/following";
import { links } from "@/lib/links";
import { priceOf, reasonText, sumPrices } from "@/lib/prices";
import { dayMonth, fromFollowPost } from "@/lib/remixSource";
import { useGoneItem, useScrollToItem, useUrlItem, useUrlState } from "@/lib/urlState";
import { times } from "../../../supabase/functions/_shared/outlier.ts";

const TOUCH = "[@media(pointer:coarse)]:min-h-11";
const PAGE = 24;
const SORTS: { id: PostSort; label: string }[] = [{ id: "outlier", label: "Outlier score" }, { id: "views", label: "Views" }, { id: "newest", label: "Newest" }];
const PLATFORMS: { id: FollowPlatform; label: string }[] = [{ id: "instagram", label: "Instagram" }, { id: "tiktok", label: "TikTok" }];
const NAME = { instagram: "Instagram", tiktok: "TikTok" } as const;
const SHORT = { instagram: "IG", tiktok: "TT" } as const;
/** Refusals for the whole account (shown once, under Check now), not for one handle. */
const ACCOUNT_WIDE = [403, 429, 503];
const fmt = (n: number) => (n >= 10_000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "-" : ""}${fmt(Math.abs(n))}`;

export default function TheirPosts({ userId, list, store, openEdit }: {
  userId: string;
  list: Competitor[];
  store: CompetitorPostsState;
  openEdit: (id: string) => void;
}) {
  const [, tick] = useState(0);
  const [c, setC] = useUrlState<string>("c", "all");
  const [platform, setPlatform] = useUrlState<FollowPlatform | "all">("platform", "all", { allowed: ["all", "instagram", "tiktok"] });
  const [sort, setSort] = useUrlState<PostSort>("sort", "outlier", { allowed: ["outlier", "views", "newest"] });
  const [linked] = useUrlItem("post");
  const [limit, setLimit] = useState(PAGE);
  const busy = checkingAnyPosts();
  const left = useUsesLeft(busy)("competitor-posts");
  // an empty store may still be syncing, so it decides nothing
  useGoneItem("post", Object.keys(store).length ? feedPosts(list, store).some((f) => f.key === linked) : undefined);

  useEffect(() => onCompetitorPosts(() => tick((n) => n + 1)), []);
  // opening the view, and any change to the list while it is open (an add, a handle found), checks what is 7+ days old
  useEffect(() => {
    void runDuePosts(userId);
  }, [userId, list]);

  if (!list.length) {
    return (
      <p className="text-sm text-muted-foreground">
        Add a competitor to see their posts here. <Link to={links.competitors({ view: "list" })} className="font-medium text-primary hover:underline">Who you watch</Link>
      </p>
    );
  }

  const selected = list.find((x) => x.id === c) ?? null;
  const only = platform === "all" ? undefined : platform;
  const feed = feedPosts(list, store, { c: selected?.id, platform, sort });
  const total = feedPosts(list, store).length;
  const scope = selected ? [selected] : list;
  const rows = scope.flatMap((x) => handlesOf(x)
    .filter((h) => !only || h.platform === only)
    .map((h) => {
      const k = entryKey(x.id, h.platform);
      return { k, c: x, ...h, a: store[k]?.handle === h.handle ? store[k] : undefined };
    }));
  const missing = scope.filter((x) => !handlesOf(x).length);
  const at = feed.findIndex((f) => f.key === linked);
  const shown = feed.slice(0, Math.max(limit, at + 1));
  const reading = rows.find((r) => isCheckingPosts(r.k));
  const skeletons = rows.some((r) => isCheckingPosts(r.k) && !r.a);
  const growthDays = Math.max(0, ...rows.map((r) => (r.a ? followStats(r.a) : null)).filter((s) => s?.growth != null).map((s) => s!.growthDays));

  // Check now: the picked competitor's handles, or every due handle under All
  const due = selected ? handlesOf(selected).filter((h) => !only || h.platform === only) : duePosts(userId);
  const checkNow = () => (selected ? void checkCompetitorPosts(userId, selected, only) : void runDuePosts(userId, true));
  const why = reasonText({ left, leo: true }) ?? (!selected && !due.length && rows.length ? "Every account was checked in the last 7 days. Pick one to check it again." : null);
  const stopped = postsStopped();

  return (
    <section className="space-y-4" aria-labelledby="their-posts">
      <div className="flex items-center gap-3">
        <h2 id="their-posts" className="font-serif text-lg font-semibold tracking-tight">Their posts</h2>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums text-muted-foreground">{total}</span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Competitor">
          <FilterChip active={!selected} onClick={() => { setC("all"); setLimit(PAGE); }}>All</FilterChip>
          {list.filter((x) => handlesOf(x).length).map((x) => (
            <FilterChip key={x.id} active={selected?.id === x.id} onClick={() => { setC(x.id); setLimit(PAGE); }}>{x.name}</FilterChip>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5 sm:ml-auto" role="group" aria-label="Platform">
          {PLATFORMS.map((p) => (
            <FilterChip key={p.id} active={platform === p.id} onClick={() => { setPlatform(platform === p.id ? "all" : p.id); setLimit(PAGE); }}>{p.label}</FilterChip>
          ))}
        </div>
      </div>

      {missing.map((x) => (
        <p key={x.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          Add {x.name}'s Instagram or TikTok to see their posts.
          <Button size="sm" variant="outline" className={`h-8 ${TOUCH}`} onClick={() => openEdit(x.id)}>Add a handle</Button>
        </p>
      ))}

      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-border/60">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/40 text-[11px] text-muted-foreground">
              <tr>
                <th scope="col" className="p-2 font-medium">Who</th>
                <th scope="col" className="p-2 text-right font-medium">Followers</th>
                <th scope="col" className="p-2 text-right font-medium">{growthDays ? `In ${growthDays} days` : "Growth"}</th>
                <th scope="col" className="p-2 text-right font-medium">Posts a week</th>
                <th scope="col" className="p-2 text-right font-medium">Best lately</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const s = r.a ? followStats(r.a) : null;
                const best = r.a ? bestRatio(r.a) : null;
                const f = postsCheckFailure(r.k);
                const fix = f && !ACCOUNT_WIDE.includes(f.status) ? f : null;
                return (
                  <Fragment key={r.k}>
                    <tr className="border-t border-border/60">
                      <td className="max-w-[8rem] p-2 sm:max-w-none">
                        <span className="flex items-center gap-1.5 font-medium">
                          <span className="truncate">{r.c.name} ({SHORT[r.platform]})</span>
                          {isCheckingPosts(r.k) && <Loader2 className="h-3 w-3 shrink-0 animate-spin text-muted-foreground" aria-label={`Reading @${r.handle}`} />}
                        </span>
                      </td>
                      <td className="p-2 text-right tabular-nums">{s?.followers == null ? "-" : fmt(s.followers)}</td>
                      <td className="p-2 text-right tabular-nums">
                        {!s ? "-" : s.growth === null ? <span className="text-muted-foreground">next check</span> : signed(s.growth)}
                      </td>
                      <td className="p-2 text-right tabular-nums">{s?.perWeek ?? "-"}</td>
                      <td className="whitespace-nowrap p-2 text-right tabular-nums">
                        {best === null ? "-" : <>{times(best)}<span className="hidden sm:inline"> their usual</span></>}
                      </td>
                    </tr>
                    {fix && (
                      <tr>
                        <td colSpan={5} className="px-2 pb-2">
                          <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-destructive">
                            {fix.message}
                            {fix.code === "failed" || fix.status === 0 ? (
                              <Button size="sm" variant="outline" className={`h-8 ${TOUCH}`} disabled={busy} onClick={() => void runPostsCheck(userId, r.c.id, r.platform, r.handle)}>Try again</Button>
                            ) : (
                              <Button size="sm" variant="outline" className={`h-8 ${TOUCH}`} onClick={() => openEdit(r.c.id)}>Edit</Button>
                            )}
                          </span>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {(feed.length > 0 || skeletons) && (
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Sort">
          <span className="mr-1 text-xs text-muted-foreground">Sort</span>
          {SORTS.map((o) => (
            <FilterChip key={o.id} active={sort === o.id} onClick={() => setSort(o.id)}>{o.label}</FilterChip>
          ))}
          <OutlierScoreTip />
        </div>
      )}
      {(shown.length > 0 || skeletons) && (
        <div className="grid items-start gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {skeletons && Array.from({ length: 3 }, (_, k) => <SkeletonCard key={`s${k}`} />)}
          {shown.map((f) => <PostCard key={f.key} f={f} linked={f.key === linked} />)}
        </div>
      )}
      {feed.length > shown.length && (
        <div className="flex justify-center">
          <Button variant="outline" className={`h-10 ${TOUCH}`} onClick={() => setLimit(shown.length + PAGE)}>
            Show {Math.min(PAGE, feed.length - shown.length)} more of {feed.length - shown.length}
          </Button>
        </div>
      )}

      <div className="space-y-2 border-t border-border/60 pt-4">
        {reading && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground" aria-live="polite">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading @{reading.handle}, about a minute...
          </p>
        )}
        {stopped && !busy && <p role="alert" className="text-xs text-destructive">{stopped.message}</p>}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <p className="mr-auto text-xs text-muted-foreground">We check each account once a week, when you open Competitors.</p>
          <div className="flex items-center gap-3">
            <Button variant="outline" className={`h-10 gap-2 ${TOUCH}`} onClick={checkNow} disabled={busy || Boolean(why) || !due.length}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Check now
            </Button>
            {!busy && due.length > 0 && (
              <PriceChip feature="competitor-posts" price={due.length > 1 ? sumPrices(...due.map(() => priceOf("competitor-posts"))) : undefined} uses={due.length} left={left} />
            )}
          </div>
        </div>
        {why && !busy && <p className="text-xs text-muted-foreground">{why}</p>}
      </div>
    </section>
  );
}

function SkeletonCard() {
  return (
    <div aria-hidden className="space-y-2 rounded-xl border border-border/60 p-3">
      <div className="h-4 w-24 animate-pulse rounded-full bg-muted" />
      <div className="h-3 w-full animate-pulse rounded bg-muted" />
      <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
    </div>
  );
}

function PostCard({ f, linked }: { f: FeedPost; linked: boolean }) {
  const ref = useScrollToItem<HTMLElement>(linked);
  const { post: p, account: a, competitor: c } = f;
  const kind = p.format === "video" ? (a.platform === "instagram" ? "Reel" : "Video") : p.format === "carousel" ? "Carousel" : "Photo";
  const numbers = [p.views !== null ? `${fmt(p.views)} views` : "", `${fmt(p.likes)} likes`, `${fmt(p.comments)} comments`].filter(Boolean).join(", ");
  const open = safeExternalUrl(p.url);
  return (
    <article ref={ref} className={`flex min-w-0 flex-col gap-1.5 rounded-xl border bg-card p-3 shadow-card ${linked ? "border-primary ring-2 ring-primary/30" : "border-border/60"}`}>
      <div className="flex items-center gap-1.5">
        <OutlierBadge outlier={f.outlier} />
        {f.fresh && <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">New</span>}
        <CopyLinkButton path={links.competitors({ view: "posts", post: f.key })} label={`Copy link to ${c.name}'s post`} className="-my-2 -mr-2 ml-auto" />
      </div>
      <p className="text-[11px] text-muted-foreground">{[kind, p.postedAt ? dayMonth(p.postedAt) : "", NAME[a.platform]].filter(Boolean).join(", ")}</p>
      <p className="truncate text-[11px] font-medium">{c.name} <span className="font-normal text-muted-foreground">@{a.handle}</span></p>
      <p className="line-clamp-2 text-xs">{p.caption || "No caption"}</p>
      <p className="text-[11px] tabular-nums text-muted-foreground">{numbers}</p>
      <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
        <RemixButton source={fromFollowPost(a, p)} label={`${c.name}'s post`}>
          <Button asChild size="sm" variant="outline" className="h-9 gap-1.5">
            <Link to={remixUrl(a, p)}><Shuffle className="h-3.5 w-3.5" /> Remix</Link>
          </Button>
        </RemixButton>
        {open && (
          <Button asChild size="sm" variant="ghost" className={`h-9 gap-1.5 px-2 ${TOUCH}`}>
            <a href={open} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-3.5 w-3.5" /> Open</a>
          </Button>
        )}
      </div>
    </article>
  );
}
