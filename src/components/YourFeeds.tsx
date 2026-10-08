// Your feeds: news sources the adviser follows, merged into one list of stories
// to write about. Stories are kept for this tab for 30 minutes so going back
// and forth doesn't spend the daily feed allowance.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ExternalLink, PenLine, Plus, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { safeExternalUrl } from "@/lib/embed";
import { MAX_FEEDS, SUGGESTED_FEEDS, fetchFeeds, labelFor, loadFeeds, mergeStories, saveFeeds, storyWriteUrl, type Feed, type FeedStory } from "@/lib/feeds";

const CACHE = "cs-feed-stories";
const FRESH_MS = 30 * 60_000;

export default function YourFeeds() {
  const { toast } = useToast();
  const [userId, setUserId] = useState<string | null>(null);
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [stories, setStories] = useState<FeedStory[]>([]);
  const [problems, setProblems] = useState<{ url: string; error: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [paste, setPaste] = useState("");

  const load = async (list: Feed[], force = false) => {
    if (!list.length) return setStories([]);
    const key = list.map((f) => f.url).join("|");
    if (!force) {
      try {
        const c = JSON.parse(sessionStorage.getItem(CACHE) ?? "null");
        if (c && c.key === key && Date.now() - c.at < FRESH_MS) {
          setStories(c.stories);
          setProblems(c.problems ?? []);
          return;
        }
      } catch {
        // no cache: fetch
      }
    }
    setLoading(true);
    try {
      const results = await fetchFeeds(list.map((f) => f.url));
      // a pasted feed gets its own title once it is known
      const named = list.map((f) => (f.label ? f : { ...f, label: labelFor(f.url, results.find((r) => r.url === f.url)?.title) }));
      if (userId && named.some((f, i) => f.label !== list[i].label)) setFeeds(saveFeeds(userId, named));
      const merged = mergeStories(named, results);
      const bad = results.filter((r) => r.error).map((r) => ({ url: r.url, error: r.error! }));
      setStories(merged);
      setProblems(bad);
      try {
        sessionStorage.setItem(CACHE, JSON.stringify({ key, at: Date.now(), stories: merged, problems: bad }));
      } catch {
        // storage blocked: fine
      }
    } catch (e) {
      toast({ title: "Couldn't read your feeds", description: (e as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const id = data.user?.id ?? null;
      setUserId(id);
      const list = loadFeeds(id);
      setFeeds(list);
      void load(list);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const add = async (feed: Feed) => {
    // a tap before the sign-in check finishes must not be dropped
    const uid = userId ?? (await supabase.auth.getUser()).data.user?.id ?? null;
    if (!uid) return toast({ title: "Sign in again to add feeds", variant: "destructive" });
    if (feeds.some((f) => f.url === feed.url)) return;
    if (feeds.length >= MAX_FEEDS) return toast({ title: `Up to ${MAX_FEEDS} feeds`, variant: "destructive" });
    const next = saveFeeds(uid, [...feeds, feed]);
    setFeeds(next);
    void load(next, true);
  };
  const addPasted = () => {
    const url = paste.trim();
    if (!/^https?:\/\/\S+\.\S+/.test(url)) return toast({ title: "Paste the feed's full address, starting https://", variant: "destructive" });
    setPaste("");
    void add({ url, label: "" });
  };
  const remove = (url: string) => {
    if (!userId) return;
    const next = saveFeeds(userId, feeds.filter((f) => f.url !== url));
    setFeeds(next);
    setStories((s) => s.filter((x) => x.source !== (feeds.find((f) => f.url === url)?.label ?? "")));
  };

  const suggestions = SUGGESTED_FEEDS.filter((s) => !feeds.some((f) => f.url === s.url));

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto font-serif text-lg font-semibold tracking-tight text-foreground">Your feeds</h2>
        {feeds.length > 0 && (
          <Button size="sm" variant="outline" className="h-9 gap-1.5" onClick={() => void load(feeds, true)} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> {loading ? "Reading..." : "Refresh"}
          </Button>
        )}
      </div>

      {feeds.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Feeds you follow">
          {feeds.map((f) => (
            <li key={f.url} className="flex items-center gap-1 rounded-full border border-border/70 bg-card py-1 pl-3 pr-1 text-xs font-medium">
              {f.label || labelFor(f.url)}
              <button type="button" aria-label={`Stop following ${f.label || labelFor(f.url)}`} onClick={() => remove(f.url)}
                className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {suggestions.length > 0 && feeds.length < MAX_FEEDS && (
        <div className="flex flex-wrap items-center gap-1.5">
          {suggestions.map((s) => (
            <button key={s.url} type="button" onClick={() => void add(s)}
              className="flex min-h-9 items-center gap-1 rounded-full border border-dashed border-border px-3 text-xs font-semibold text-muted-foreground hover:border-primary/50 hover:text-foreground">
              <Plus className="h-3.5 w-3.5" /> {s.label}
            </button>
          ))}
        </div>
      )}

      {feeds.length < MAX_FEEDS && (
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); addPasted(); }}>
          <input value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="Paste an RSS link" aria-label="Feed address"
            className="h-10 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm" />
          <Button type="submit" variant="outline" className="h-10" disabled={!paste.trim()}>Add</Button>
        </form>
      )}

      {problems.length > 0 && (
        <ul className="space-y-1 text-xs text-muted-foreground">
          {problems.map((p) => (
            <li key={p.url}>{labelFor(p.url)}: {p.error}</li>
          ))}
        </ul>
      )}

      {stories.length > 0 && (
        <ul className="divide-y divide-border/60 rounded-xl border border-border/60">
          {stories.slice(0, 40).map((s) => (
            <li key={s.link} className="space-y-1.5 p-3">
              <p className="text-[11px] font-medium text-muted-foreground">
                {s.source}{s.date ? `, ${new Date(s.date).toLocaleDateString("en-SG", { day: "numeric", month: "short" })}` : ""}
              </p>
              <a href={safeExternalUrl(s.link) ?? undefined} target="_blank" rel="noopener noreferrer" className="block text-sm font-semibold leading-snug text-foreground hover:text-primary">
                {s.title} <ExternalLink className="ml-0.5 inline h-3 w-3 align-[-1px] text-muted-foreground" />
              </a>
              {s.summary && <p className="line-clamp-2 text-xs text-muted-foreground">{s.summary}</p>}
              <Button asChild size="sm" variant="outline" className="h-9 gap-1.5">
                <Link to={storyWriteUrl(s)}><PenLine className="h-3.5 w-3.5" /> Write about this</Link>
              </Button>
            </li>
          ))}
        </ul>
      )}
      {!loading && feeds.length > 0 && stories.length === 0 && problems.length === 0 && (
        <p className="text-sm text-muted-foreground">No stories yet. Try Refresh in a moment.</p>
      )}
    </section>
  );
}
