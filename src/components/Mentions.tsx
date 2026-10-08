// Mentions: names, products or topics the adviser watches, checked against
// recent Singapore news on demand (each check is a paid lookup, capped daily).
// A result this device hasn't shown before is marked New.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ExternalLink, PenLine, Plus, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { safeExternalUrl } from "@/lib/embed";
import { storyWriteUrl } from "@/lib/feeds";
import { MAX_WATCH, checkMentions, countNew, loadSeen, loadWatch, markSeen, saveWatch, type MentionResult } from "@/lib/mentions";

const CACHE = "cs-mention-results";

export default function Mentions() {
  const { toast } = useToast();
  const [userId, setUserId] = useState<string | null>(null);
  const [watch, setWatch] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [results, setResults] = useState<MentionResult[]>([]);
  const [seen, setSeen] = useState<Set<string>>(new Set());
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const id = data.user?.id ?? null;
      setUserId(id);
      setWatch(loadWatch(id));
      if (id) setSeen(loadSeen(id));
      try {
        const c = JSON.parse(sessionStorage.getItem(CACHE) ?? "null");
        if (c?.uid === id && Array.isArray(c.results)) setResults(c.results);
      } catch {
        // no cache
      }
    });
  }, []);

  const uidNow = async () => userId ?? (await supabase.auth.getUser()).data.user?.id ?? null;

  const add = async () => {
    const k = draft.replace(/\s+/g, " ").trim();
    if (k.length < 2) return;
    const uid = await uidNow();
    if (!uid) return toast({ title: "Sign in again to watch keywords", variant: "destructive" });
    if (watch.length >= MAX_WATCH) return toast({ title: `Up to ${MAX_WATCH} at a time`, variant: "destructive" });
    setWatch(saveWatch(uid, [...watch, k]));
    setDraft("");
  };
  const remove = async (k: string) => {
    const uid = await uidNow();
    if (uid) setWatch(saveWatch(uid, watch.filter((x) => x !== k)));
    setResults((r) => r.filter((x) => x.keyword !== k));
  };

  const check = async () => {
    const uid = await uidNow();
    if (!uid || !watch.length) return;
    setChecking(true);
    try {
      const r = await checkMentions(watch);
      const before = loadSeen(uid);
      setSeen(before);
      setResults(r);
      markSeen(uid, r.flatMap((x) => x.items.map((i) => i.url)));
      try {
        sessionStorage.setItem(CACHE, JSON.stringify({ uid, results: r }));
      } catch {
        // fine
      }
      const fresh = countNew(r, before);
      toast({ title: fresh ? `${fresh} new ${fresh === 1 ? "mention" : "mentions"}` : "Nothing new since your last check" });
    } catch (e) {
      toast({ title: "Couldn't check mentions", description: (e as Error).message, variant: "destructive" });
    } finally {
      setChecking(false);
    }
  };

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto flex items-center gap-1 font-serif text-lg font-semibold tracking-tight text-foreground">
          Mentions
          <InfoTip label="About mentions">Recent Singapore news naming what you watch.</InfoTip>
        </h2>
        {watch.length > 0 && (
          <Button size="sm" className="h-9 gap-1.5" onClick={check} disabled={checking}>
            <Search className="h-3.5 w-3.5" /> {checking ? "Checking..." : "Check now"}
          </Button>
        )}
      </div>

      {watch.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="What you watch">
          {watch.map((k) => (
            <li key={k} className="flex items-center gap-1 rounded-full border border-border/70 bg-card py-1 pl-3 pr-1 text-xs font-medium">
              {k}
              <button type="button" aria-label={`Stop watching ${k}`} onClick={() => void remove(k)}
                className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {watch.length < MAX_WATCH && (
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void add(); }}>
          <input value={draft} maxLength={60} onChange={(e) => setDraft(e.target.value)} placeholder="Your name, a product or a topic" aria-label="Keyword to watch"
            className="h-10 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm" />
          <Button type="submit" variant="outline" className="h-10 gap-1.5" disabled={draft.trim().length < 2}><Plus className="h-4 w-4" /> Watch</Button>
        </form>
      )}

      {results.map((r) => (
        <div key={r.keyword} className="space-y-1.5">
          <p className="text-xs font-semibold text-muted-foreground">{r.keyword}{r.error ? `: ${r.error}` : r.items.length ? "" : ": nothing recent"}</p>
          {r.items.length > 0 && (
            <ul className="divide-y divide-border/60 rounded-xl border border-border/60">
              {r.items.map((m) => (
                <li key={m.url} className="space-y-1.5 p-3">
                  <p className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                    {!seen.has(m.url) && <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">New</span>}
                    {m.source.replace(/^www\./, "")}{m.date ? `, ${new Date(m.date).toLocaleDateString("en-SG", { day: "numeric", month: "short", year: "numeric" })}` : ""}
                  </p>
                  <a href={safeExternalUrl(m.url) ?? undefined} target="_blank" rel="noopener noreferrer" className="block text-sm font-semibold leading-snug text-foreground hover:text-primary">
                    {m.title} <ExternalLink className="ml-0.5 inline h-3 w-3 align-[-1px] text-muted-foreground" />
                  </a>
                  {m.snippet && <p className="line-clamp-2 text-xs text-muted-foreground">{m.snippet}</p>}
                  <Button asChild size="sm" variant="outline" className="h-9 gap-1.5">
                    <Link to={storyWriteUrl({ title: m.title, link: m.url, date: m.date, summary: m.snippet, source: m.source.replace(/^www\./, "") })}>
                      <PenLine className="h-3.5 w-3.5" /> Write about this
                    </Link>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </section>
  );
}
