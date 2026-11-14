// Apps like yours (/swipe?tab=similar, Leo's sign-ins on every brand;
// docs/north-star/items/find-similar-accounts.md): Instagram and TikTok accounts like the brand, found or added by hand,
// and their posts, best outlier score first, laid out as the ad library is (Radar's layout): search with Filters and
// Sort, a chip per account, the count line and the card grid. ?q=, ?scope= (an account), ?sort= and ?f= live in the URL;
// ?post= marks one post. Finding and reading run outside React (src/lib/similarAccounts.ts); this draws the store and
// the jobs.
import { refreshCloudKeys } from "@/lib/cloudSync";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowSquareOutIcon, CircleNotchIcon, FunnelIcon, MagnifyingGlassIcon, ShuffleIcon, WarningCircleIcon } from "@phosphor-icons/react";
import CopyLinkButton from "@/components/CopyLinkButton";
import { SkeletonCard } from "@/components/competitors/TheirPosts";
import OutlierBadge, { OutlierScoreTip } from "@/components/OutlierBadge";
import PriceChip from "@/components/PriceChip";
import RemixButton from "@/components/remix/RemixButton";
import SaveButton from "@/components/SaveButton";
import VideoEmbed from "@/components/VideoEmbed";
import { Button } from "@/components/ui/button";
import { FilterChip } from "@/components/ui/filter-chip";
import { Input } from "@/components/ui/input";
import { Pick } from "@/components/ui/pick";
import { useUsesLeft } from "@/lib/aiUsage";
import { safeExternalUrl } from "@/lib/embed";
import { type FollowPlatform, postKind, remixUrl, watchText } from "@/lib/following";
import { links } from "@/lib/links";
import { priceOf, readLabel, reasonText, sumPrices } from "@/lib/prices";
import { dayMonth, fromFollowPost } from "@/lib/remixSource";
import {
  accountKey, addAccount, type AddResult, autoFindDue, dismissAccount, isFinding, isReading, lastFind, loadMedia, loadSimilar, onSimilar, onSimilarChanged, readsAhead, refreshSimilar,
  readAddInput, readFailure, readingAny, readsStopped, readWaitingSimilar, runDueSimilar, runFind, SIMILAR_FILTERS, SIMILAR_SORTS, type SimilarEntry, type SimilarFilter, type SimilarPost,
  type SimilarSort, similarBusy, similarFeed, similarKey, similarView, waitingSimilar,
} from "@/lib/similarAccounts";
import { useGoneItem, useScrollToItem, useUrlItem, useUrlSearch, useUrlState, useUrlUpdate } from "@/lib/urlState";
import { SIMILAR_KEEP } from "../../../supabase/functions/competitors/logic.ts";

const TOUCH = "[@media(pointer:coarse)]:min-h-11";
const PAGE = 24;
const FILTER_LABEL: Record<SimilarFilter, string> = { all: "All", slideshows: "Slideshows", carousels: "Carousels", reels: "Reels", ugc: "UGC" };
const SORT_OPTIONS: [SimilarSort, string][] = [["outlier", "Outlier score"], ["views", "Most views"], ["newest", "Newest"]];
const NAME = { instagram: "Instagram", tiktok: "TikTok" } as const;
const KIND = { app_or_brand: "App or brand", creator: "Creator" } as const;
const ADD_LINE: Record<Exclude<AddResult, "added">, string> = {
  already: "That account is already on your list.",
  full: "You can add up to 10. Take one out with Not this one first.",
  invalid: "That doesn't look like an account name.",
};
const fmt = (n: number) => (n >= 10_000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

export default function AppsLikeYours({ userId }: { userId: string }) {
  // the store: read again when it is saved; the jobs only redraw
  const [version, bump] = useState(0);
  const [, tick] = useState(0);
  useEffect(() => onSimilarChanged(() => bump((v) => v + 1)), []);
  useEffect(() => onSimilar(() => tick((n) => n + 1)), []);
  // opening the tab reads whatever is 7+ days old, the newest 10 posts each, and starts the brand's first find; an
  // added account's first read waits for Read N accounts
  useEffect(() => {
    void runDueSimilar(userId);
  }, [userId]);
  // coming back to the tab: take the list other tabs or devices saved meanwhile, before anything here writes over it
  useEffect(() => {
    const back = () => document.visibilityState === "visible" && void refreshSimilar(userId);
    document.addEventListener("visibilitychange", back);
    return () => document.removeEventListener("visibilitychange", back);
  }, [userId]);

  const [f, setF] = useUrlState<SimilarFilter>("f", "all", { allowed: SIMILAR_FILTERS });
  const [text, setText, q] = useUrlSearch("q");
  const [scope] = useUrlState<string>("scope", "all");
  const [sort, setSort] = useUrlState<SimilarSort>("sort", "outlier", { allowed: SIMILAR_SORTS });
  const update = useUrlUpdate();
  const [showFilters, setShowFilters] = useState(f !== "all");
  const [linked] = useUrlItem("post");
  const [limit, setLimit] = useState(PAGE);
  const state = useMemo(() => loadSimilar(userId), [userId, version]);
  // the best posts' covers, kept on this device by the reads, behind each card's play button
  const media = useMemo(() => loadMedia(userId), [userId, version]);
  const all = useMemo(() => similarFeed(state), [state]);
  const view = useMemo(() => similarView(state, { f, q, account: scope, sort }), [state, f, q, scope, sort]);
  useEffect(() => setLimit(PAGE), [f, q, view.account, sort]);
  // an empty store may still be syncing, so it decides nothing
  useGoneItem("post", state.accounts.length ? all.some((p) => p.key === linked) : undefined);

  const finding = isFinding();
  const reading = readingAny();
  const left = useUsesLeft(finding)("similar-find");
  const foundCount = state.accounts.filter((a) => a.via !== "added").length;
  const room = SIMILAR_KEEP - foundCount;
  const why = reasonText({ left, leo: true }) ?? (room <= 0 ? "You have 40. Take some out with Not this one to find others." : null);
  // the brand's first find starts by itself, after its synced list is pulled, so a find from another device never repeats
  const autoTried = useRef(false);
  useEffect(() => {
    if (autoTried.current || why) return;
    autoTried.current = true;
    void refreshCloudKeys([similarKey(userId)]).then(() => {
      if (autoFindDue(loadSimilar(userId))) void runFind(userId);
    });
  }, [userId, why]);
  // a find reads each new account's posts too
  const price = sumPrices(priceOf("similar-find"), ...Array.from({ length: Math.max(0, room) }, () => priceOf("similar-posts")));
  const note = lastFind();
  const stopped = readsStopped();
  const now = state.accounts.find((a) => isReading(accountKey(a)));
  const waiting = reading ? readsAhead(userId) : 0;
  const unread = useMemo(() => waitingSimilar(userId), [userId, version]);
  const readLeft = useUsesLeft(reading)("similar-posts");
  const readWhy = reasonText({ left: readLeft, uses: unread.length, leo: true });
  const busy = similarBusy();
  const at = view.cards.findIndex((p) => p.key === linked);
  const shown = view.cards.slice(0, Math.max(limit, at + 1));
  const skeletons = Boolean(now && !state.posts[accountKey(now)] && (view.account === "all" || view.account === accountKey(now)));
  const has = state.accounts.length > 0;
  const picked = view.accounts.find((a) => a.key === view.account);
  const pickAccount = (key: string) => update({ scope: key === "all" ? null : key });
  const clear = () => {
    setText("");
    update({ q: null, f: null, scope: null });
  };
  const sortPick = <Pick label="Sort" value={sort} onChange={(v) => setSort(v as SimilarSort)} options={SORT_OPTIONS} />;

  const find = (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Button variant={unread.length || has ? "outline" : "default"} className={`h-10 gap-2 ${TOUCH}`} onClick={() => void runFind(userId)} disabled={finding || Boolean(why)}>
          {finding ? <CircleNotchIcon className="h-4 w-4 animate-spin" /> : <MagnifyingGlassIcon className="h-4 w-4" />} Find apps like yours
        </Button>
        {!finding && <PriceChip feature="similar-find" price={price} left={left} />}
        {state.month && <span className="text-xs tabular-nums text-muted-foreground sm:ml-auto">US${state.month.spent.toFixed(2)} of US${state.month.cap} this month</span>}
      </div>
      {why && !finding && <p className="text-xs text-muted-foreground">{why}</p>}
      {finding && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground" aria-live="polite">
          <CircleNotchIcon className="h-3.5 w-3.5 animate-spin" /> Looking on Instagram and TikTok, about two minutes...
        </p>
      )}
      {note && !finding && <p role={note.error ? "alert" : undefined} className={`text-xs ${note.error ? "text-destructive" : "text-muted-foreground"}`}>{note.text}</p>}
      {(state.searches?.length ?? 0) > 0 && !finding && <p className="text-xs text-muted-foreground">Searched TikTok for {state.searches?.join(", ")}.</p>}
    </div>
  );
  // finding and adding fill the chip row: first on an empty tab, under the posts once there are accounts (as the ad
  // library keeps Your space's words under its cards)
  const tools = (
    <div className="space-y-3">
      {find}
      <AddAccount userId={userId} />
    </div>
  );

  return (
    <section className="min-w-0 space-y-4" aria-label="Apps like yours">
      {!has ? tools : (
        <div className="space-y-3">
          <div className="flex gap-2">
            <div className="relative min-w-0 flex-1">
              <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Search captions and accounts" aria-label="Search posts"
                className="pl-9 [@media(pointer:coarse)]:h-11" />
            </div>
            <Button variant={showFilters || f !== "all" ? "secondary" : "outline"} onClick={() => setShowFilters((v) => !v)} aria-expanded={showFilters}
              className={`shrink-0 gap-1.5 ${TOUCH}`}>
              <FunnelIcon className="h-3.5 w-3.5" /> Filters
              {f !== "all" && <span className="ml-0.5 rounded-full bg-primary/15 px-1.5 text-[10px] font-bold text-primary">1</span>}
            </Button>
            <span className="hidden sm:inline-flex">{sortPick}</span>
          </div>

          <div className="scrollbar-none -mx-1 flex gap-1.5 overflow-x-auto px-1" role="group" aria-label="Whose posts">
            <FilterChip active={view.account === "all"} onClick={() => pickAccount("all")} count={view.all}>All</FilterChip>
            {view.accounts.map((a) => {
              const busyOne = isReading(a.key);
              return (
                <FilterChip key={a.key} active={view.account === a.key} onClick={() => pickAccount(a.key)} count={busyOne ? undefined : a.n}>
                  {busyOne ? (
                    <CircleNotchIcon className="h-3 w-3 animate-spin" aria-label={`Reading @${a.entry.handle}`} />
                  ) : (
                    <span aria-hidden className="flex h-4 w-4 items-center justify-center rounded-full bg-muted text-[9px] font-bold uppercase text-foreground">
                      {Array.from(a.entry.name.trim())[0] ?? "@"}
                    </span>
                  )}
                  <span className="max-w-[10rem] truncate">{a.entry.name}</span>
                  {readFailure(a.key) && <WarningCircleIcon className="h-3.5 w-3.5 text-destructive" aria-label="Couldn't read it" />}
                </FilterChip>
              );
            })}
          </div>
          {/* the picked account's details, and Not this one beside the account it takes out */}
          {picked && <AccountRow userId={userId} a={picked.entry} />}

          {(showFilters || f !== "all") && (
            <div className="flex flex-wrap items-center gap-1.5 border-t border-border/60 pt-3" role="group" aria-label="Format">
              {SIMILAR_FILTERS.map((id) => <FilterChip key={id} active={f === id} onClick={() => setF(id)}>{FILTER_LABEL[id]}</FilterChip>)}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <span aria-live="polite">{view.line}</span>
              <OutlierScoreTip />
            </div>
            {/* a phone has no room beside the search: sort sits with the count there */}
            <span className="ml-auto sm:hidden">{sortPick}</span>
          </div>
        </div>
      )}

      {unread.length > 0 && (
        <div className="space-y-1.5">
          <Button className={`h-10 gap-2 ${TOUCH}`} onClick={() => void readWaitingSimilar(userId)} disabled={busy || Boolean(readWhy)}>
            {busy && <CircleNotchIcon className="h-4 w-4 animate-spin" />} {readLabel(unread.length, "similar-posts")}
          </Button>
          {readWhy && <p className="text-xs text-muted-foreground">{readWhy}</p>}
        </div>
      )}

      {has && (shown.length > 0 || skeletons ? (
        <>
          <div className="grid grid-cols-2 items-start gap-x-3 gap-y-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {skeletons && Array.from({ length: 3 }, (_, k) => <SkeletonCard key={`s${k}`} />)}
            {shown.map((p) => <SimilarCard key={p.key} p={p} linked={p.key === linked} poster={media[accountKey(p.entry)]?.[p.post.id]?.cover} />)}
          </div>
          {view.cards.length > shown.length && (
            <div className="flex justify-center">
              <Button variant="outline" className={`h-10 ${TOUCH}`} onClick={() => setLimit(shown.length + PAGE)}>
                Show {Math.min(PAGE, view.cards.length - shown.length)} more of {view.cards.length - shown.length}
              </Button>
            </div>
          )}
        </>
      ) : all.length > 0 && (
        <div className="space-y-3 py-8 text-center text-sm text-muted-foreground">
          <p>{picked && !state.posts[picked.key] ? `Nothing read from @${picked.entry.handle} yet.` : "No posts match these filters."}</p>
          <Button variant="outline" className={`h-10 ${TOUCH}`} onClick={clear}>Clear</Button>
        </div>
      ))}

      {has && (
        <div className="space-y-3 border-t border-border/60 pt-4">
          {now && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground" aria-live="polite">
              <CircleNotchIcon className="h-3.5 w-3.5 animate-spin" /> Reading @{now.handle}, about a minute{waiting > 1 ? `, ${waiting - 1} more after it` : ""}...
            </p>
          )}
          {stopped && !reading && <p role="alert" className="text-xs text-destructive">{stopped.message}</p>}
          {tools}
          <div className="space-y-1 text-xs text-muted-foreground">
            <p>
              The formats that win among these:{" "}
              <Link to={links.socialNorthStar()} className="font-medium text-primary hover:underline [@media(pointer:coarse)]:py-3">Social north star</Link>
            </p>
            <p>We read each account's newest posts once a week, when you open this tab.</p>
          </div>
        </div>
      )}
    </section>
  );
}

function AccountRow({ userId, a }: { userId: string; a: SimilarEntry }) {
  const key = accountKey(a);
  const failed = readFailure(key);
  const badge = a.via === "added" ? "Added" : a.kind ? KIND[a.kind] : null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
      <span className="min-w-0 truncate font-medium text-foreground">@{a.handle} <span className="font-normal text-muted-foreground">{NAME[a.platform]}</span></span>
      {badge && <span className="rounded-full bg-muted px-1.5 py-0.5 font-medium text-foreground">{badge}</span>}
      {a.followers !== null && <span className="tabular-nums">{fmt(a.followers)} followers</span>}
      {failed && <span role="alert" className="text-destructive">{failed.message}</span>}
      <Button size="sm" variant="ghost" className={`h-8 px-2 text-xs ${TOUCH}`} onClick={() => dismissAccount(userId, key)}>Not this one</Button>
    </div>
  );
}

function SimilarCard({ p, linked, poster }: { p: SimilarPost; linked: boolean; poster?: string }) {
  const ref = useScrollToItem<HTMLElement>(linked);
  const { entry: e, account: a, post } = p;
  const open = safeExternalUrl(post.url);
  const numbers = [post.views !== null ? `${fmt(post.views)} views` : "", `${fmt(post.likes)} likes`, `${fmt(post.comments)} comments`].filter(Boolean).join(", ");
  // the ad library's card: the post with its tags and Remix over it, then whose post, what it says and the numbers.
  // Remix drops under the player once it plays, so it never covers the player's controls.
  return (
    <article ref={ref} className={`relative flex min-w-0 flex-col overflow-hidden rounded-xl border bg-card shadow-card ${linked ? "border-primary ring-2 ring-primary/30" : "border-border/60"}`}>
      <div className="group relative">
        <VideoEmbed url={post.url} label={`${e.name}'s post`} poster={poster} text={watchText(e.platform, post.format)} className="max-w-none rounded-none border-0" />
        <span className="pointer-events-none absolute left-2 top-2 flex max-w-[calc(100%-1rem)] flex-wrap gap-1 group-has-[iframe]:hidden">
          <span className="rounded-full bg-background/90"><OutlierBadge outlier={p.outlier} /></span>
          {p.fresh && <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">New</span>}
        </span>
        <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center group-has-[iframe]:static group-has-[iframe]:pt-2">
          <span className="pointer-events-auto rounded-full bg-background/90 p-0.5 shadow-sm backdrop-blur">
            <RemixButton source={fromFollowPost(a, post)} label={`${e.name}'s post`} variant="ghost" className="h-8 rounded-full px-3 [@media(pointer:coarse)]:h-11">
              <Button asChild size="sm" variant="ghost" className="h-8 gap-1.5 rounded-full px-3 [@media(pointer:coarse)]:h-11">
                <Link to={remixUrl(a, post)}><ShuffleIcon className="h-3.5 w-3.5" /> Remix</Link>
              </Button>
            </RemixButton>
          </span>
        </div>
      </div>
      <div className="space-y-1 px-3 pb-2 pt-2.5">
        <div className="flex items-center gap-1">
          <p className="min-w-0 flex-1 truncate text-[11px] font-medium text-muted-foreground">{e.name} <span className="font-normal">@{e.handle}</span></p>
          <CopyLinkButton path={links.swipe({ tab: "similar", post: p.key })} label={`Copy link to ${e.name}'s post`} className="-my-2 -mr-2 h-8 w-8" />
        </div>
        <p className="line-clamp-2 text-xs font-semibold text-foreground">{post.caption || "No caption"}</p>
        <p className="text-[11px] text-muted-foreground">{[`${NAME[e.platform]} ${postKind(e.platform, post.format).toLowerCase()}`, post.postedAt ? dayMonth(post.postedAt) : ""].filter(Boolean).join(" | ")}</p>
        <p className="text-[11px] tabular-nums text-muted-foreground">{numbers}</p>
        <div className="-mx-1 flex flex-wrap items-center gap-1 pt-1">
          <SaveButton source={fromFollowPost(a, post)} />
          {open && (
            <Button asChild size="sm" variant="ghost" className={`h-8 gap-1.5 px-2 ${TOUCH}`}>
              <a href={open} target="_blank" rel="noopener noreferrer"><ArrowSquareOutIcon className="h-3.5 w-3.5" /> Open</a>
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}

/** "Add an account you like": a profile link adds at once; an @handle asks which platform. */
function AddAccount({ userId }: { userId: string }) {
  const [text, setText] = useState("");
  const [pick, setPick] = useState<{ handle: string; platforms: FollowPlatform[] } | null>(null);
  const [line, setLine] = useState<{ text: string; error: boolean } | null>(null);
  const add = (platform: FollowPlatform, handle: string) => {
    const r = addAccount(userId, platform, handle);
    setPick(null);
    if (r === "added") {
      setText("");
      setLine({ text: `Added @${handle}.`, error: false });
    } else setLine({ text: ADD_LINE[r], error: true });
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const r = readAddInput(text);
    if (!r) return setLine({ text: "Paste an @handle or an Instagram or TikTok profile link.", error: true });
    setLine(null);
    if (r.platforms.length === 1) add(r.platforms[0], r.handle);
    else setPick(r);
  };
  return (
    <form onSubmit={submit} className="space-y-1.5" aria-label="Add an account you like">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setPick(null);
          }}
          placeholder="Add an account you like: @handle or profile link"
          aria-label="Add an account you like"
          className={`h-10 min-w-0 flex-1 basis-56 ${TOUCH}`}
        />
        {pick ? (
          <span className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">@{pick.handle} on</span>
            {pick.platforms.map((p) => (
              <Button key={p} type="button" variant="outline" className={`h-10 ${TOUCH}`} onClick={() => add(p, pick.handle)}>{NAME[p]}</Button>
            ))}
          </span>
        ) : (
          <Button type="submit" variant="outline" className={`h-10 ${TOUCH}`} disabled={!text.trim()}>Add</Button>
        )}
      </div>
      {line && <p role={line.error ? "alert" : "status"} className={`text-xs ${line.error ? "text-destructive" : "text-muted-foreground"}`}>{line.text}</p>}
    </form>
  );
}
