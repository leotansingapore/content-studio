// Research (/research, Leo's sign-ins only; wave 2): the reels beating their creator's usual among up to 100 watched
// Instagram creators, ranked (?tab=feed), the watch list (?tab=creators) and finding creators (?tab=find, a search
// or Suggested creators). Leo's Mac reads Instagram's public pages (src/lib/research.ts): while this page is open it
// re-reads every creator not read in 2 days, two at a time, and picks up reads still running when the page was left.
// Each reel opens in Clone a reel, where the script desk takes it from there. Everyone else gets the 404 page.

import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { FilmSlateIcon, ArrowSquareOutIcon, CircleNotchIcon, MagnifyingGlassIcon, SparkleIcon, TrashIcon, UserPlusIcon } from "@phosphor-icons/react";
import OutlierBadge, { OutlierScoreTip } from "@/components/OutlierBadge";
import { DeskError, TOUCH } from "@/components/ScriptDeskParts";
import { Button } from "@/components/ui/button";
import { FilterChip } from "@/components/ui/filter-chip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToastAction } from "@/components/ui/toast";
import { useToast } from "@/hooks/use-toast";
import { activeProfileId } from "@/lib/profiles";
import {
  MAX_WATCHED, READS_AT_ONCE, aboutCreator, addCreators, cloneUrl, dueCreators, feedOf, findCreators, handlesIn, keepRead, loadList, loadPause, loadPending,
  loadReads, markFailed, pickReads, pollRead, readCreator, saveList, savePause, savePending, suggestedOf, unreadable, type DiscoverCreator, type IgPause,
  type ResearchList,
} from "@/lib/research";
import { deskContext } from "@/lib/scriptContext";
import { useLeoUser } from "@/lib/useLeoOnly";
import { useUrlState } from "@/lib/urlState";
import NotFoundPage from "@/pages/NotFoundPage";

type Tab = "feed" | "creators" | "find";
const TABS: { id: Tab; label: string }[] = [{ id: "feed", label: "Feed" }, { id: "creators", label: "Creators" }, { id: "find", label: "Find creators" }];
const FEED_MAX = 60;

const fmt = (n: number | null | undefined) =>
  n == null ? "?" : n >= 1_000_000 ? `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M` : n >= 10_000 ? `${Math.round(n / 1000)}K` : n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n);
const ago = (iso?: string | null) => {
  if (!iso) return "";
  const d = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  return d <= 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`;
};
const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

export default function ResearchPage() {
  const leo = useLeoUser();
  if (leo === undefined) return <div className="min-h-[40vh]" aria-busy="true" />;
  if (!leo) return <NotFoundPage notOnAccount />;
  return <Research userId={leo.id} />;
}

function Research({ userId }: { userId: string }) {
  const { toast } = useToast();
  const [tab, setTab] = useUrlState<Tab>("tab", "feed", { allowed: TABS.map((t) => t.id) });
  const [list, setListState] = useState<ResearchList>(() => loadList(userId));
  const [reads, setReads] = useState(() => loadReads(userId));
  const [pending, setPendingState] = useState(() => loadPending(userId));
  const [pause, setPause] = useState<IgPause | null>(() => loadPause());
  const [readError, setReadError] = useState("");
  const pendingRef = useRef(pending);
  const readsRef = useRef(reads);
  // reads started but not yet filed, each with its own token, so a render in between (or StrictMode's second run)
  // never starts the same one twice, and a read only ever clears its own entry
  const starting = useRef(new Map<string, object>());
  // creators whose page couldn't be read this visit: tried again on the next visit, not again and again now
  const failed = useRef(new Set<string>());
  const alive = useRef<AbortController | null>(null);
  // the brand this page opened on: a switch in another tab stops reads before they save into the wrong brand
  const brand = useRef(activeProfileId(userId));
  useEffect(() => {
    const ctl = new AbortController();
    alive.current = ctl;
    return () => ctl.abort();
  }, []);

  const setList = (l: ResearchList) => setListState(saveList(userId, l));
  // pending is shared with other tabs through storage: always merged with what they saved
  const setPending = (change: (p: typeof pending) => typeof pending) => {
    const next = change(loadPending(userId));
    pendingRef.current = next;
    setPendingState(next);
    savePending(userId, next);
  };
  const paused = (p: IgPause) => (savePause(p), setPause(p));

  // one read: filed (or picked back up), then folded into this device's reads
  const read = async (handle: string, resume?: string) => {
    const signal = alive.current?.signal;
    if (!signal || signal.aborted) return;
    const token = {};
    starting.current.set(handle, token);
    const opts = { userId, signal, onFiled: (job: string) => setPending((p) => ({ ...p, [handle]: { job, at: Date.now() } })) };
    try {
      const known = (readsRef.current[handle]?.reels ?? []).map((r) => r.code);
      const r = resume ? await pollRead(resume, opts) : await readCreator(handle, known, opts);
      if (signal.aborted || activeProfileId(userId) !== brand.current) return;
      if (r.paused) paused(r.paused);
      if (r.profile) {
        readsRef.current = keepRead(userId, handle, r, readsRef.current);
        setReads(readsRef.current);
        const c = loadList(userId).creators.find((x) => x.handle === handle);
        if (c?.error) setList({ ...loadList(userId), creators: loadList(userId).creators.map((x) => (x.handle === handle ? { ...x, error: undefined, readAt: undefined } : x)) });
      }
    } catch (e) {
      if (signal.aborted || activeProfileId(userId) !== brand.current) return;
      const why = e instanceof Error ? e.message : "That read didn't go through.";
      // an account that can't be read for good waits 2 days; one page that wouldn't load waits for the next visit;
      // anything else (the Mac, the worker) stops the reads until Try again
      if (unreadable(why)) setListState(markFailed(userId, handle, why));
      else if (aboutCreator(why, handle)) failed.current.add(handle);
      else setReadError(why);
    } finally {
      if (starting.current.get(handle) === token) starting.current.delete(handle);
      if (!signal.aborted) {
        setPending(({ [handle]: _done, ...rest }) => rest);
      }
    }
  };

  // reads left running on another visit: picked up on arrival (StrictMode's second run finds them starting already)
  useEffect(() => {
    for (const [handle, p] of Object.entries(loadPending(userId))) {
      if (Date.now() - p.at > 8 * 60_000) setPending(({ [handle]: _old, ...rest }) => rest);
      else if (!starting.current.has(handle)) void read(handle, p.job);
    }
    // once, on arrival
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // while the page is open: the next creator due, one at a time (the Mac's other read slot stays free for a search),
  // unless the Mac is paused or a read failed in a way Try again has to clear
  const due = dueCreators(list, reads, pending).filter((h) => !failed.current.has(h));
  useEffect(() => {
    if (pause || readError || !due.length) return;
    const busy = new Set([...Object.keys(loadPending(userId)), ...starting.current.keys()]);
    pickReads(due, busy, failed.current, READS_AT_ONCE).forEach((h) => void read(h));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [due.join(","), Object.keys(pending).join(","), Boolean(pause), readError]);

  // a pause ends by itself: look again when it should be over
  useEffect(() => {
    if (!pause) return;
    const t = setTimeout(() => setPause(loadPause()), Math.max(1000, Date.parse(pause.until) - Date.now() + 1000));
    return () => clearTimeout(t);
  }, [pause]);

  const reading = Object.keys(pending);
  const status = pause ? (
    <p role="status" className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
      Instagram stopped this Mac's reads ({pause.why === "login" ? "it showed a login wall" : "it asked to wait"}). They start again by themselves at {clock(pause.until)}.
    </p>
  ) : readError ? (
    <div className="flex flex-wrap items-center gap-2">
      <DeskError text={readError} />
      <Button type="button" variant="outline" size="sm" className={TOUCH} onClick={() => setReadError("")}>Try again</Button>
    </div>
  ) : reading.length ? (
    <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
      <CircleNotchIcon className="h-4 w-4 animate-spin text-primary" aria-hidden />
      Reading @{reading.join(" and @")} on your Mac.{due.length ? ` ${due.length} more due.` : ""}
    </p>
  ) : due.length ? (
    <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
      <CircleNotchIcon className="h-4 w-4 animate-spin text-primary" aria-hidden />
      Sending {due.length === 1 ? `@${due[0]}` : `${due.length} creators`} to your Mac to read.
    </p>
  ) : list.creators.length ? (
    <p className="text-sm text-muted-foreground">All {list.creators.length} read in the last 2 days.</p>
  ) : null;

  const remove = (handle: string) => {
    const now = loadList(userId);
    const at = now.creators.findIndex((c) => c.handle === handle);
    const gone = now.creators[at];
    if (!gone) return;
    setList({ ...now, creators: now.creators.filter((c) => c.handle !== handle) });
    // Undo puts back this one creator where it was, keeping anything changed since
    const undo = () => {
      const l = loadList(userId);
      if (l.creators.some((c) => c.handle === handle)) return;
      setList({ ...l, creators: [...l.creators.slice(0, at), gone, ...l.creators.slice(at)] });
    };
    toast({ title: `Stopped watching @${handle}.`, action: <ToastAction altText="Undo" onClick={undo}>Undo</ToastAction> });
  };
  const watch = (handles: string[]) => {
    const r = addCreators(loadList(userId), handles);
    setList(r.list);
    return r;
  };

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <h1 className="font-serif text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">Research</h1>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Research">
          {TABS.map((t) => <FilterChip key={t.id} active={tab === t.id} onClick={() => setTab(t.id)}>{t.label}</FilterChip>)}
        </div>
        {status}
      </header>

      {tab === "feed" && <Feed list={list} reads={reads} onAdd={() => setTab("creators")} />}
      {tab === "creators" && <Creators list={list} reads={reads} pending={pending} onWatch={watch} onRemove={remove} />}
      {/* kept mounted, so a search keeps running while another tab is open */}
      <div hidden={tab !== "find"}>
        <Find userId={userId} list={list} onWatch={watch} onSkip={(h) => setList({ ...loadList(userId), skipped: [...loadList(userId).skipped, h] })} onPaused={paused} />
      </div>
    </div>
  );
}

// only the reels at least 1.5x their creator's usual (the badge's green tiers)
const BEATING = new Set(["above", "viral", "mega"]);

function Feed({ list, reads, onAdd }: { list: ResearchList; reads: ReturnType<typeof loadReads>; onAdd: () => void }) {
  const feed = feedOf(list, reads).filter((f) => BEATING.has(f.outlier.tier ?? ""));
  if (!feed.length) {
    const read = list.creators.some((c) => reads[c.handle]);
    return (
      <div className="space-y-3 rounded-xl border border-dashed border-border p-6 text-center">
        <p className="text-sm text-muted-foreground">
          {!list.creators.length ? "Watch 10 to 20 Instagram creators in your niche to see which of their reels beat their usual."
            : read ? "None of their latest reels beat their creator's usual yet. Watch more creators to widen the feed."
            : "Your Mac is reading your creators. Their reels show here as they come in."}
        </p>
        {!list.creators.length && <Button type="button" className={`gap-1.5 ${TOUCH}`} onClick={onAdd}><UserPlusIcon className="h-4 w-4" /> Add creators</Button>}
      </div>
    );
  }
  return (
    <section aria-labelledby="feed-title" className="space-y-3">
      <div className="flex items-center gap-1.5">
        <h2 id="feed-title" className="text-sm font-semibold">Beating their usual</h2>
        <OutlierScoreTip />
      </div>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {feed.slice(0, FEED_MAX).map(({ creator, reel, outlier }) => (
          <li key={creator.handle + reel.code} className="flex gap-3 rounded-xl border border-border/60 p-3 shadow-card">
            <Thumb src={reel.thumb} />
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <OutlierBadge outlier={outlier} />
                <span className="text-xs text-muted-foreground">{ago(reel.takenAt)}</span>
              </div>
              <p className="truncate text-sm font-medium">@{creator.handle}</p>
              <p className="text-xs tabular-nums text-muted-foreground">{fmt(reel.views)} views · {fmt(reel.likes)} likes · {fmt(reel.comments)} comments</p>
              {reel.caption && <p className="line-clamp-2 text-xs text-muted-foreground [overflow-wrap:anywhere]">{reel.caption}</p>}
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <Button asChild size="sm" variant="outline" className={`gap-1.5 ${TOUCH}`}>
                  <Link to={cloneUrl(reel.code)}><FilmSlateIcon className="h-3.5 w-3.5" /> Clone a reel</Link>
                </Button>
                <Button asChild size="sm" variant="ghost" className={`${TOUCH} [@media(pointer:coarse)]:min-w-11`}>
                  <a href={`https://www.instagram.com/reel/${reel.code}/`} target="_blank" rel="noreferrer" aria-label={`@${creator.handle}'s reel on Instagram`}><ArrowSquareOutIcon className="h-3.5 w-3.5" /></a>
                </Button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** A cover from Instagram's own image hosts; a plain box when it has expired. */
function Thumb({ src, round = false }: { src?: string; round?: boolean }) {
  const [broken, setBroken] = useState(false);
  const box = round ? "h-10 w-10 rounded-full" : "h-28 w-20 rounded-lg";
  if (!src || broken) return <div className={`${box} shrink-0 bg-muted`} aria-hidden />;
  return <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} className={`${box} shrink-0 bg-muted object-cover`} />;
}

function Creators(p: { list: ResearchList; reads: ReturnType<typeof loadReads>; pending: Record<string, unknown>; onWatch: (h: string[]) => ReturnType<typeof addCreators>; onRemove: (h: string) => void }) {
  const [text, setText] = useState("");
  const [note, setNote] = useState("");
  const full = p.list.creators.length >= MAX_WATCHED;
  const add = () => {
    const r = p.onWatch(handlesIn(text));
    setText(r.bad.length ? r.bad.join(" ") : "");
    setNote(
      [r.added.length ? `Watching ${r.added.length} more.` : "", r.bad.length ? `${r.bad.join(", ")} ${r.bad.length === 1 ? "isn't" : "aren't"} an Instagram username.` : "", r.full ? `That's ${MAX_WATCHED}: remove one to add another.` : ""]
        .filter(Boolean).join(" "),
    );
  };
  return (
    <section aria-labelledby="creators-title" className="space-y-4">
      <form className="space-y-1.5" onSubmit={(e) => (e.preventDefault(), add())}>
        <Label htmlFor="research-add">Watch creators</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input id="research-add" value={text} onChange={(e) => setText(e.target.value)} placeholder="@username or a profile link, several at once" disabled={full} />
          <Button type="submit" className={`shrink-0 gap-1.5 ${TOUCH}`} disabled={full || !text.trim()}><UserPlusIcon className="h-4 w-4" /> Watch</Button>
        </div>
        {note && <p role="status" className="text-xs text-muted-foreground">{note}</p>}
      </form>

      <h2 id="creators-title" className="text-sm font-semibold">Watching {p.list.creators.length} of {MAX_WATCHED}</h2>
      {p.list.creators.length > 0 && (
        <ul className="divide-y divide-border/60 rounded-xl border border-border/60">
          {[...p.list.creators].reverse().map((c) => {
            const kept = p.reads[c.handle];
            const state = p.pending[c.handle] ? "Reading now" : c.error ? c.error : kept ? `Read ${ago(kept.at)}` : "Waiting to be read";
            const name = kept?.name || c.name;
            const followers = kept?.followers ?? c.followers;
            return (
              <li key={c.handle} className="flex items-center gap-3 px-3 py-2">
                <Thumb src={kept?.avatar} round />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{name || `@${c.handle}`}</p>
                  <p className="truncate text-xs text-muted-foreground">{[name ? `@${c.handle}` : "", followers != null ? `${fmt(followers)} followers` : "", state].filter(Boolean).join(" · ")}</p>
                </div>
                <Button type="button" variant="ghost" size="icon" className="h-11 w-11 shrink-0" aria-label={`Stop watching @${c.handle}`} onClick={() => p.onRemove(c.handle)}><TrashIcon className="h-4 w-4" /></Button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Find(p: { userId: string; list: ResearchList; onWatch: (h: string[]) => unknown; onSkip: (h: string) => void; onPaused: (x: IgPause) => void }) {
  const [topic, setTopic] = useUrlState<string>("q", "");
  const [draft, setDraft] = useState(topic);
  const [busy, setBusy] = useState<"" | "search" | "suggest">("");
  const [error, setError] = useState("");
  const [found, setFound] = useState<DiscoverCreator[] | null>(null);
  const [suggested, setSuggested] = useState<DiscoverCreator[] | null>(null);
  // made in the effect, so StrictMode's pretend unmount doesn't leave a stopped one behind
  const alive = useRef<AbortController | null>(null);
  useEffect(() => {
    const ctl = new AbortController();
    alive.current = ctl;
    return () => ctl.abort();
  }, []);
  const ctx = deskContext(p.userId);
  const canSuggest = Boolean(ctx.niche || ctx.avatar);
  const watched = new Set(p.list.creators.map((c) => c.handle));
  const full = p.list.creators.length >= MAX_WATCHED;

  const run = async (q: { topic: string } | { suggest: true }) => {
    const signal = alive.current?.signal;
    if (!signal) return;
    setBusy("suggest" in q ? "suggest" : "search");
    setError("");
    try {
      const r = await findCreators(q, { userId: p.userId, signal });
      if (r.paused) p.onPaused(r.paused);
      if ("suggest" in q) setSuggested(suggestedOf(r.creators, p.list));
      else setFound(r.creators);
    } catch (e) {
      if (!signal.aborted) setError(e instanceof Error ? e.message : "That didn't go through. Try again.");
    } finally {
      if (!signal.aborted) setBusy("");
    }
  };
  const search = () => {
    const t = draft.trim();
    if (!t) return;
    setTopic(t);
    void run({ topic: t });
  };

  return (
    <div className="space-y-6">
      <section aria-labelledby="find-title" className="space-y-3">
        <form className="space-y-1.5" onSubmit={(e) => (e.preventDefault(), search())}>
          <Label htmlFor="research-topic" id="find-title">Find creators on a topic</Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input id="research-topic" value={draft} maxLength={300} onChange={(e) => setDraft(e.target.value)} placeholder="Money habits for nurses" />
            <Button type="submit" className={`shrink-0 gap-1.5 ${TOUCH}`} disabled={Boolean(busy) || !draft.trim()}>
              {busy === "search" ? <CircleNotchIcon className="h-4 w-4 animate-spin" /> : <MagnifyingGlassIcon className="h-4 w-4" />} Find
            </Button>
          </div>
        </form>
        {busy === "search" && <p role="status" className="text-sm text-muted-foreground">Your Mac is searching and reading what it finds. Usually under 2 minutes.</p>}
        {full && <p className="text-xs text-muted-foreground">You're watching {MAX_WATCHED}: remove one on Creators to watch another.</p>}
        {found && <Results creators={found} watched={watched} full={full} onWatch={(h) => p.onWatch([h])} empty="Nothing found on that topic. Try a broader one." />}
      </section>

      <section aria-labelledby="suggested-title" className="space-y-3 border-t border-border/60 pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="suggested-title" className="text-sm font-semibold">Suggested creators</h2>
          <Button type="button" variant="outline" size="sm" className={`gap-1.5 ${TOUCH}`} disabled={Boolean(busy) || !canSuggest} onClick={() => void run({ suggest: true })}>
            {busy === "suggest" ? <CircleNotchIcon className="h-4 w-4 animate-spin" /> : <SparkleIcon className="h-4 w-4" />} {suggested ? "Find more" : "Suggest creators"}
          </Button>
        </div>
        {!canSuggest && (
          <p className="text-xs text-muted-foreground">
            Needs your niche (<Link to="/voice" className="text-primary underline underline-offset-2">Your voice</Link>) or a main audience (<Link to="/audiences" className="text-primary underline underline-offset-2">Audiences</Link>).
          </p>
        )}
        {busy === "suggest" && <p role="status" className="text-sm text-muted-foreground">Your Mac is searching your niche. Usually under 2 minutes.</p>}
        {suggested && (
          <Results creators={suggested} watched={watched} full={full} onWatch={(h) => p.onWatch([h])} onSkip={(h) => (p.onSkip(h), setSuggested(suggested.filter((c) => c.handle !== h)))}
            empty="No new creators in those follower ranges this time. Try Find more." />
        )}
      </section>
      <DeskError text={error} />
    </div>
  );
}

function Results({ creators, watched, full, onWatch, onSkip, empty }: { creators: DiscoverCreator[]; watched: Set<string>; full: boolean; onWatch: (h: string) => void; onSkip?: (h: string) => void; empty: string }) {
  if (!creators.length) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="divide-y divide-border/60 rounded-xl border border-border/60">
      {creators.map((c) => (
        <li key={c.handle} className="flex flex-wrap items-center gap-3 px-3 py-2">
          <Thumb src={c.profile?.avatar} round />
          <div className="min-w-0 flex-1 basis-48">
            <p className="truncate text-sm font-medium">{c.profile?.name || `@${c.handle}`}</p>
            <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
              @{c.handle}{c.profile?.followers != null ? ` · ${fmt(c.profile.followers)} followers` : ""}{c.reels[0] ? ` · best reel ${fmt(c.reels[0].views)} views` : ""}
              {c.why ? ` · ${c.why}` : ""}{c.error ? ` · ${c.error}` : ""}
            </p>
          </div>
          <div className="flex shrink-0 gap-1.5">
            {onSkip && !watched.has(c.handle) && <Button type="button" variant="ghost" size="sm" className={TOUCH} onClick={() => onSkip(c.handle)}>Skip</Button>}
            <Button type="button" variant={watched.has(c.handle) ? "ghost" : "outline"} size="sm" className={TOUCH} disabled={watched.has(c.handle) || full || unreadable(c.error)} onClick={() => onWatch(c.handle)}>
              {watched.has(c.handle) ? "Watching" : "Watch"}
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}
