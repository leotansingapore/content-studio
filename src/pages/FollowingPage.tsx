import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ExternalLink, Loader2, RefreshCw, Shuffle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import EngageWeek from "@/components/EngageWeek";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { supabase } from "@/lib/supabase";
import { normalizeHandle } from "../../supabase/functions/_shared/socialAudit.ts";
import { DAILY_LIMITS } from "../../supabase/functions/_shared/usageCaps.ts";
import {
  MAX_FOLLOWED, checkFailure, followStats, isChecking, loadFollowing, onFollowing, remixUrl, runCheck, sameAccount, saveFollowing,
  type FollowPlatform, type FollowedAccount, type TrackedPost,
} from "@/lib/following";

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

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="mr-auto font-serif text-2xl font-semibold tracking-tight sm:text-3xl">Following</h1>
        {list.length > 0 && (
          <Button variant="outline" className="h-10 gap-2" onClick={checkAll} disabled={anyChecking}>
            {anyChecking ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Check all
          </Button>
        )}
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
          <p className="text-xs text-muted-foreground">Public accounts only. Each check uses 1 of your {LIMIT} a day.</p>
        </form>
      )}

      {list.length === 0 ? (
        <p className="text-sm text-muted-foreground">Follow a competitor or a creator you like to see their growth, how often they post, and their new posts to remix.</p>
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {list.map((a) => <AccountCard key={`${a.platform}:${a.handle}`} a={a} onCheck={() => userId && runCheck(userId, a)} onRemove={() => remove(a)} />)}
        </ul>
      )}
    </div>
  );
}

function AccountCard({ a, onCheck, onRemove }: { a: FollowedAccount; onCheck: () => void; onRemove: () => void }) {
  const s = followStats(a);
  const checking = isChecking(a);
  const failure = checkFailure(a);
  const fresh = a.posts.filter((p) => a.fresh.includes(p.id));
  const shown = (fresh.length ? fresh : a.posts).slice(0, 3);
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
        <Button size="icon" variant="ghost" className="h-10 w-10" aria-label={`Check @${a.handle} now`} onClick={onCheck} disabled={checking}>
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
            {shown.map((p) => <PostRow key={p.id} a={a} p={p} best={s.best?.id === p.id} />)}
          </ul>
        </div>
      )}
    </li>
  );
}

function PostRow({ a, p, best }: { a: FollowedAccount; p: TrackedPost; best: boolean }) {
  const numbers = [p.views !== null ? `${fmt(p.views)} views` : "", `${fmt(p.likes)} likes`, `${fmt(p.comments)} comments`].filter(Boolean).join(", ");
  return (
    <li className="space-y-1.5 rounded-xl bg-secondary/40 p-3">
      <p className="line-clamp-2 text-xs">{p.caption || "No caption"}</p>
      <p className="text-[11px] text-muted-foreground">
        {p.format === "video" ? "Video" : p.format === "carousel" ? "Carousel" : "Photo"}
        {p.postedAt ? `, ${new Date(p.postedAt).toLocaleDateString("en-SG", { day: "numeric", month: "short" })}` : ""}, {numbers}
        {best && <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 py-0.5 font-medium text-primary">Top post</span>}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button asChild size="sm" variant="outline" className="h-9">
          <Link to={remixUrl(a, p)}><Shuffle className="h-3.5 w-3.5" /> Remix</Link>
        </Button>
        <Button asChild size="sm" variant="ghost" className="h-9">
          <a href={p.url} target="_blank" rel="noreferrer"><ExternalLink className="h-3.5 w-3.5" /> Open</a>
        </Button>
      </div>
    </li>
  );
}
