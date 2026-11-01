// Apps like yours (/swipe?tab=similar, Leo's sign-ins on every brand;
// docs/north-star/items/find-similar-accounts.md): Instagram and TikTok accounts like the brand, found or added by hand,
// and their posts, best outlier score first. ?f= filters, ?post= marks one post. Finding and reading run outside React
// (src/lib/similarAccounts.ts); this draws the store and the jobs.
import { refreshCloudKeys } from "@/lib/cloudSync";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Search } from "lucide-react";
import { PostCard, SkeletonCard } from "@/components/competitors/TheirPosts";
import { OutlierScoreTip } from "@/components/OutlierBadge";
import PriceChip from "@/components/PriceChip";
import SaveButton from "@/components/SaveButton";
import VideoEmbed from "@/components/VideoEmbed";
import { Button } from "@/components/ui/button";
import { FilterChip } from "@/components/ui/filter-chip";
import { Input } from "@/components/ui/input";
import { useUsesLeft } from "@/lib/aiUsage";
import { type FollowPlatform, watchText } from "@/lib/following";
import { links } from "@/lib/links";
import { priceOf, reasonText, sumPrices } from "@/lib/prices";
import { fromFollowPost } from "@/lib/remixSource";
import {
  accountKey, addAccount, type AddResult, autoFindDue, dismissAccount, dueSimilar, isFinding, isReading, lastFind, loadMedia, loadSimilar, onSimilar, onSimilarChanged, refreshSimilar,
  readAddInput, readFailure, readingAny, readsStopped, runDueSimilar, runFind, SIMILAR_FILTERS, type SimilarEntry, type SimilarFilter, similarFeed, similarKey,
} from "@/lib/similarAccounts";
import { useGoneItem, useUrlItem, useUrlState } from "@/lib/urlState";
import { SIMILAR_KEEP } from "../../../supabase/functions/competitors/logic.ts";

const TOUCH = "[@media(pointer:coarse)]:min-h-11";
const PAGE = 24;
const FILTER_LABEL: Record<SimilarFilter, string> = { all: "All", slideshows: "Slideshows", carousels: "Carousels", reels: "Reels", ugc: "UGC" };
const SHORT = { instagram: "IG", tiktok: "TT" } as const;
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
  // opening the tab reads whatever is 7+ days old, the newest 10 posts each, and starts the brand's first find
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
  const [linked] = useUrlItem("post");
  const [limit, setLimit] = useState(PAGE);
  const state = useMemo(() => loadSimilar(userId), [userId, version]);
  // the best posts' covers, kept on this device by the reads, behind each card's play button
  const media = useMemo(() => loadMedia(userId), [userId, version]);
  const all = useMemo(() => similarFeed(state), [state]);
  const feed = f === "all" ? all : similarFeed(state, f);
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
  const waiting = reading ? dueSimilar(userId).length : 0;
  const at = feed.findIndex((p) => p.key === linked);
  const shown = feed.slice(0, Math.max(limit, at + 1));
  const skeletons = Boolean(now && !state.posts[accountKey(now)]);

  const find = (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Button className={`h-10 gap-2 ${TOUCH}`} onClick={() => void runFind(userId)} disabled={finding || Boolean(why)}>
          {finding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Find apps like yours
        </Button>
        {!finding && <PriceChip feature="similar-find" price={price} left={left} />}
      </div>
      {why && !finding && <p className="text-xs text-muted-foreground">{why}</p>}
      {finding && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground" aria-live="polite">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Looking on Instagram and TikTok, about two minutes...
        </p>
      )}
      {note && !finding && <p role={note.error ? "alert" : undefined} className={`text-xs ${note.error ? "text-destructive" : "text-muted-foreground"}`}>{note.text}</p>}
      {(state.searches?.length ?? 0) > 0 && !finding && <p className="text-xs text-muted-foreground">Searched TikTok for {state.searches?.join(", ")}.</p>}
    </div>
  );

  return (
    // the page's h1 names the tab, so its top row is the count and the month's spend
    <section className="min-w-0 space-y-4" aria-label="Apps like yours">
      {(state.accounts.length > 0 || state.month) && (
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          {state.accounts.length > 0 && <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums text-muted-foreground">{state.accounts.length} {state.accounts.length === 1 ? "account" : "accounts"}</span>}
          {state.accounts.length > 0 && (
            <p className="text-xs text-muted-foreground">
              The formats that win among these:{" "}
              <Link to={links.socialNorthStar()} className="font-medium text-primary hover:underline [@media(pointer:coarse)]:py-3">Social north star</Link>
            </p>
          )}
          {state.month && (
            <span className="ml-auto text-xs tabular-nums text-muted-foreground">US${state.month.spent.toFixed(2)} of US${state.month.cap} this month</span>
          )}
        </div>
      )}

      {!state.accounts.length && <p className="text-sm text-muted-foreground">See how apps and creators like yours post on Instagram and TikTok, then remix their best.</p>}
      {find}
      <AddAccount userId={userId} />

      {state.accounts.length > 0 && (
        <ul className="scrollbar-none -mx-1 flex gap-2 overflow-x-auto px-1 pb-1" aria-label="Accounts">
          {state.accounts.map((a) => <AccountCard key={accountKey(a)} userId={userId} a={a} />)}
        </ul>
      )}

      {(all.length > 0 || skeletons) && (
        <>
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter">
            {SIMILAR_FILTERS.map((id) => (
              <FilterChip key={id} active={f === id} onClick={() => { setF(id); setLimit(PAGE); }}>{FILTER_LABEL[id]}</FilterChip>
            ))}
            <OutlierScoreTip />
          </div>
          {shown.length === 0 && !skeletons ? (
            <p className="text-sm text-muted-foreground">No {FILTER_LABEL[f].toLowerCase()} yet. <button type="button" className="font-medium text-primary hover:underline" onClick={() => setF("all")}>Show all</button></p>
          ) : (
            <div className="grid items-start gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {skeletons && Array.from({ length: 3 }, (_, k) => <SkeletonCard key={`s${k}`} />)}
              {shown.map((p) => (
                <PostCard
                  key={p.key} f={p} name={p.entry.name} path={links.swipe({ tab: "similar", post: p.key })} linked={p.key === linked}
                  media={<VideoEmbed url={p.post.url} label={`${p.entry.name}'s post`} poster={media[accountKey(p.entry)]?.[p.post.id]?.cover} text={watchText(p.entry.platform, p.post.format)} className="max-w-none" />}
                >
                  <SaveButton source={fromFollowPost(p.account, p.post)} />
                </PostCard>
              ))}
            </div>
          )}
          {feed.length > shown.length && (
            <div className="flex justify-center">
              <Button variant="outline" className={`h-10 ${TOUCH}`} onClick={() => setLimit(shown.length + PAGE)}>
                Show {Math.min(PAGE, feed.length - shown.length)} more of {feed.length - shown.length}
              </Button>
            </div>
          )}
        </>
      )}

      {state.accounts.length > 0 && (
        <div className="space-y-1 border-t border-border/60 pt-4 text-xs text-muted-foreground">
          {now && (
            <p className="flex items-center gap-1.5" aria-live="polite">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading @{now.handle}, about a minute{waiting > 1 ? `, ${waiting - 1} more after it` : ""}...
            </p>
          )}
          {stopped && !reading && <p role="alert" className="text-destructive">{stopped.message}</p>}
          <p>We read each account's newest posts once a week, when you open this tab.</p>
        </div>
      )}
    </section>
  );
}

function AccountCard({ userId, a }: { userId: string; a: SimilarEntry }) {
  const key = accountKey(a);
  const failed = readFailure(key);
  const badge = a.via === "added" ? "Added" : a.kind ? KIND[a.kind] : null;
  return (
    <li className="flex w-48 shrink-0 flex-col gap-1 rounded-xl border border-border/60 bg-card p-2.5">
      <p className="flex items-center gap-1.5 text-xs font-medium">
        <span className="truncate">{a.name}</span>
        {isReading(key) && <Loader2 className="h-3 w-3 shrink-0 animate-spin text-muted-foreground" aria-label={`Reading @${a.handle}`} />}
      </p>
      <p className="truncate text-[11px] text-muted-foreground">@{a.handle} <span title={NAME[a.platform]}>{SHORT[a.platform]}</span></p>
      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        {badge && <span className="rounded-full bg-muted px-1.5 py-0.5 font-medium text-foreground">{badge}</span>}
        {a.followers !== null && <span className="tabular-nums">{fmt(a.followers)} followers</span>}
      </p>
      {failed && <p className="line-clamp-2 text-[11px] text-destructive">{failed.message}</p>}
      <Button size="sm" variant="ghost" className={`mt-auto h-8 self-start px-2 text-xs ${TOUCH}`} onClick={() => dismissAccount(userId, key)}>
        Not this one
      </Button>
    </li>
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
      setLine({ text: `Added @${handle}. Reading its posts now.`, error: false });
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
