import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Clapperboard, ExternalLink, Loader2, RefreshCw, Shuffle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import CopyLinkButton from "@/components/CopyLinkButton";
import EngageWeek from "@/components/EngageWeek";
import RemixButton from "@/components/remix/RemixButton";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { supabase } from "@/lib/supabase";
import { normalizeHandle } from "../../supabase/functions/_shared/socialAudit.ts";
import { DAILY_LIMITS } from "../../supabase/functions/_shared/usageCaps.ts";
import {
  MAX_FOLLOWED, checkFailure, followStats, isChecking, loadFollowing, onFollowing, remixUrl, runCheck, sameAccount, saveFollowing,
  type FollowPlatform, type FollowedAccount, type TrackedPost,
} from "@/lib/following";
import { links } from "@/lib/links";
import { fromFollowPost } from "@/lib/remixSource";
import { useScrollToItem, useUrlItem } from "@/lib/urlState";
import { useLeoOnly } from "@/lib/useLeoOnly";
import { useUsesLeft } from "@/lib/aiUsage";
import PriceChip from "@/components/PriceChip";
import { chipText, priceOf, reasonText, sumPrices } from "@/lib/prices";

const LIMIT = DAILY_LIMITS["track-accounts"];
const fmt = (n: number) => (n >= 10_000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
const ago = (iso?: string) => {
  if (!iso) return "";
  const d = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  return d <= 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`;
};

export default function FollowingPage() {
  const { toast } = useToast();
  const [userId, setUserId] = useState<string | null>(null);
  const [list, setList] = useState<FollowedAccount[]>([]);
  const [platform, setPlatform] = useState<FollowPlatform>("instagram");
  const [handle, setHandle] = useState("");
  const [, tick] = useState(0);
  // read once for the page: Leo's video rows keep Clone beside the Remix button
  const leo = useLeoOnly();
  // ?post=<platform>:<post id> (docs/deep-links.md): that post is shown, scrolled to and marked
  const [linked] = useUrlItem("post");

  useEffect(() => {
    document.title = "Following - Content Studio";
    supabase.auth.getUser().then(({ data }) => {
      const id = data.user?.id ?? null;
      setUserId(id);
      if (id) setList(loadFollowing(id));
    });
  }, []);
  useEffect(() => onFollowing(() => {
    tick((n) => n + 1);
    if (userId) setList(loadFollowing(userId));
  }), [userId]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    // A tap before the sign-in check finished must not be dropped.
    const uid = userId ?? (await supabase.auth.getUser()).data.user?.id ?? null;
    if (!uid) return toast({ title: "Sign in again to follow accounts", variant: "destructive" });
    const h = normalizeHandle(platform, handle);
    if (!h) return toast({ title: "That doesn't look like an account name", description: "Paste @name or a profile link.", variant: "destructive" });
    const current = loadFollowing(uid);
    if (current.some((a) => sameAccount(a, { platform, handle: h }))) return toast({ title: `You already follow @${h}` });
    if (current.length >= MAX_FOLLOWED) return toast({ title: `You can follow up to ${MAX_FOLLOWED} accounts`, description: "Remove one first.", variant: "destructive" });
    const a: FollowedAccount = { platform, handle: h, addedAt: new Date().toISOString(), history: [], posts: [], seen: [], fresh: [] };
    setList(saveFollowing(uid, [...current, a]));
    setHandle("");
    void runCheck(uid, a);
  };

  const remove = (a: FollowedAccount) => {
    if (!userId) return;
    setList(saveFollowing(userId, loadFollowing(userId).filter((x) => !sameAccount(x, a))));
    toast({
      title: `Stopped following @${a.handle}`,
      action: (
        <ToastAction altText="Undo" onClick={() => setList(saveFollowing(userId, [...loadFollowing(userId).filter((x) => !sameAccount(x, a)), a]))}>
          Undo
        </ToastAction>
      ),
    });
  };

  const checkAll = () => {
    if (userId) for (const a of list) void runCheck(userId, a);
  };
  const anyChecking = list.some(isChecking);
  // Leo's price chips: only his sessions read today's uses, so everyone else's stays null
  const left = useUsesLeft(anyChecking || !leo)("track-accounts");
  // Check all spends one check per account
  const allWhy = reasonText({ left, uses: list.length, leo });

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="mr-auto font-serif text-2xl font-semibold tracking-tight sm:text-3xl">Following</h1>
        {list.length > 0 && (
          // the chip sits under Check all on phones, beside it from sm
          <div className="flex flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-3">
            <Button variant="outline" className="h-10 gap-2" onClick={checkAll} disabled={anyChecking || Boolean(allWhy)}>
              {anyChecking ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Check all
            </Button>
            {!anyChecking && <PriceChip price={sumPrices(...list.map(() => priceOf("track-accounts")))} uses={list.length} left={left} />}
          </div>
        )}
        {list.length > 0 && allWhy && <p className="basis-full text-right text-xs text-destructive">{allWhy}</p>}
      </header>

      <EngageWeek userId={userId} />

      {list.length < MAX_FOLLOWED && (
        <form onSubmit={add} className="space-y-2 rounded-2xl border border-border/60 p-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="inline-flex shrink-0 rounded-md border border-border p-0.5" role="group" aria-label="Platform">
              {(["instagram", "tiktok"] as const).map((p) => (
                <button key={p} type="button" aria-pressed={platform === p} onClick={() => setPlatform(p)}
                  className={`h-10 rounded px-3 text-sm font-medium sm:h-9 [@media(pointer:coarse)]:h-11 ${platform === p ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                  {p === "instagram" ? "Instagram" : "TikTok"}
                </button>
              ))}
            </div>
            <Input value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="@name or profile link" aria-label="Account to follow" className="h-11 sm:h-10" />
            <Button type="submit" className="h-11 shrink-0 sm:h-10" disabled={!handle.trim()}>Follow</Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Public accounts only. Each check uses 1 of your {LIMIT} a day.
            {leo && !anyChecking && <> <PriceChip feature="track-accounts" left={left} /></>}
          </p>
        </form>
      )}

      {list.length === 0 ? (
        <p className="text-sm text-muted-foreground">Follow a competitor or a creator you like to see their growth, how often they post, and their new posts to remix.</p>
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {list.map((a) => <AccountCard key={`${a.platform}:${a.handle}`} a={a} leo={leo} linked={linked} left={left} onCheck={() => userId && runCheck(userId, a)} onRemove={() => remove(a)} />)}
        </ul>
      )}
    </div>
  );
}

function AccountCard({ a, leo, linked, left, onCheck, onRemove }: { a: FollowedAccount; leo: boolean; linked: string | null; left: number | null; onCheck: () => void; onRemove: () => void }) {
  const s = followStats(a);
  const checking = isChecking(a);
  // Leo only (left is null for everyone else): the check's price as the icon's title, and off at 0 (the header says why)
  const price = leo ? chipText({ price: priceOf("track-accounts"), left, leo }).text : "";
  const failure = checkFailure(a);
  const fresh = a.posts.filter((p) => a.fresh.includes(p.id));
  const first = (fresh.length ? fresh : a.posts).slice(0, 3);
  // a linked post past the first three is shown too
  const extra = a.posts.find((p) => postId(a, p) === linked && !first.includes(p));
  const shown = extra ? [...first, extra] : first;
  return (
    <li className="space-y-3 rounded-2xl border border-border/60 p-4">
      <div className="flex items-start gap-2">
        <div className="mr-auto min-w-0">
          <a href={a.url || (a.platform === "instagram" ? `https://www.instagram.com/${a.handle}/` : `https://www.tiktok.com/@${a.handle}`)}
            target="_blank" rel="noreferrer" className="block truncate text-sm font-semibold hover:underline [@media(pointer:coarse)]:relative [@media(pointer:coarse)]:-my-3 [@media(pointer:coarse)]:py-3">
            {a.name || `@${a.handle}`}
          </a>
          <span className="text-xs text-muted-foreground">
            @{a.handle} on {a.platform === "instagram" ? "Instagram" : "TikTok"}{a.checkedAt ? `, checked ${ago(a.checkedAt)}` : ""}
          </span>
        </div>
        <Button size="icon" variant="ghost" className="h-10 w-10" aria-label={`Check @${a.handle} now`} title={price || undefined} onClick={onCheck} disabled={checking || (leo && left === 0)}>
          {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </Button>
        <Button size="icon" variant="ghost" className="h-10 w-10 text-muted-foreground hover:text-destructive" aria-label={`Stop following @${a.handle}`} onClick={onRemove}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {failure && <p role="alert" className="text-xs text-destructive">{failure}</p>}
      {checking && !a.checkedAt && <p className="text-xs text-muted-foreground" aria-live="polite">Reading the account, about a minute...</p>}

      {a.checkedAt && (
        <dl className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-secondary/50 p-2">
            <dt className="text-[11px] text-muted-foreground">Followers</dt>
            <dd className="text-base font-semibold tabular-nums">{s.followers === null ? "-" : fmt(s.followers)}</dd>
          </div>
          <div className="rounded-xl bg-secondary/50 p-2">
            <dt className="text-[11px] text-muted-foreground">{s.growth === null ? "Growth" : `In ${Math.max(1, s.growthDays)} days`}</dt>
            <dd className={`text-base font-semibold tabular-nums ${s.growth && s.growth > 0 ? "text-emerald-600 dark:text-emerald-400" : ""}`}>
              {s.growth === null ? <span className="text-xs font-normal text-muted-foreground">next check</span> : `${s.growth > 0 ? "+" : s.growth < 0 ? "-" : ""}${fmt(Math.abs(s.growth))}`}
            </dd>
          </div>
          <div className="rounded-xl bg-secondary/50 p-2">
            <dt className="text-[11px] text-muted-foreground">Posts a week</dt>
            <dd className="text-base font-semibold tabular-nums">{s.perWeek ?? "-"}</dd>
          </div>
        </dl>
      )}

      {shown.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold">{fresh.length ? `${fresh.length} new since the last check` : "Latest posts"}</h3>
          <ul className="space-y-2">
            {shown.map((p) => <PostRow key={p.id} a={a} p={p} best={s.best?.id === p.id} leo={leo} linked={postId(a, p) === linked} />)}
          </ul>
        </div>
      )}
    </li>
  );
}

/** A followed post's id in links, the same <platform>:<post id> Your market uses. */
const postId = (a: FollowedAccount, p: TrackedPost) => `${a.platform}:${p.id}`;

function PostRow({ a, p, best, leo, linked }: { a: FollowedAccount; p: TrackedPost; best: boolean; leo: boolean; linked: boolean }) {
  const row = useScrollToItem<HTMLLIElement>(linked);
  const numbers = [p.views !== null ? `${fmt(p.views)} views` : "", `${fmt(p.likes)} likes`, `${fmt(p.comments)} comments`].filter(Boolean).join(", ");
  return (
    <li ref={row} className={`space-y-1.5 rounded-xl bg-secondary/40 p-3 ${linked ? "ring-2 ring-primary/40" : ""}`}>
      <div className="flex items-start gap-1">
        <p className="mr-auto line-clamp-2 text-xs">{p.caption || "No caption"}</p>
        <CopyLinkButton path={links.following({ post: postId(a, p) })} label={`Copy link to @${a.handle}'s post`} className="-my-2 -mr-2" />
      </div>
      <p className="text-[11px] text-muted-foreground">
        {p.format === "video" ? "Video" : p.format === "carousel" ? "Carousel" : "Photo"}
        {p.postedAt ? `, ${new Date(p.postedAt).toLocaleDateString("en-SG", { day: "numeric", month: "short" })}` : ""}, {numbers}
        {best && <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 py-0.5 font-medium text-primary">Top post</span>}
      </p>
      <div className="flex flex-wrap gap-2">
        <RemixButton source={fromFollowPost(a, p)}>
          <Button asChild size="sm" variant="outline" className="h-9">
            <Link to={remixUrl(a, p)}><Shuffle className="h-3.5 w-3.5" /> Remix</Link>
          </Button>
        </RemixButton>
        {/* a video's link above is Clone a reel; Leo's Remix button replaced it, so it stays as its own link */}
        {leo && p.format === "video" && (
          <Button asChild size="sm" variant="ghost" className="h-9 [@media(pointer:coarse)]:h-11">
            <Link to={remixUrl(a, p)}><Clapperboard className="h-3.5 w-3.5" /> Clone</Link>
          </Button>
        )}
        <Button asChild size="sm" variant="ghost" className="h-9">
          <a href={p.url} target="_blank" rel="noreferrer"><ExternalLink className="h-3.5 w-3.5" /> Open</a>
        </Button>
      </div>
    </li>
  );
}
