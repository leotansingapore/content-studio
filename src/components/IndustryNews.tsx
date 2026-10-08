import { useMemo, useState } from "react";
import { safeExternalUrl } from "@/lib/embed";
import { Link } from "react-router-dom";
import { ChevronDown, ChevronUp, Copy, ExternalLink, PenLine, Search, Share2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { NEWS, buildNewsWriteUrl, byMonth, clientMessageText, searchStories, topicCounts, type NewsStory } from "@/lib/industryNews";

const when = (iso: string) =>
  new Date(iso).toLocaleDateString("en-SG", { day: "numeric", month: "short", timeZone: "Asia/Singapore" });

function StoryCard({ s }: { s: NewsStory }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const message = clientMessageText(s);
  // The share sheet only on phones; a desktop share sheet hides the copy everyone expects.
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function" && window.matchMedia("(pointer: coarse)").matches;
  const share = async () => {
    if (!message) return;
    try {
      await navigator.share({ text: message });
    } catch {
      // closed the share sheet: nothing to do
    }
  };
  const copy = async () => {
    if (!message) return;
    try {
      await navigator.clipboard.writeText(message);
      toast({ title: "Client message copied", description: "Fill in [Client name] and [Your name] before you send it." });
    } catch {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  };

  return (
    <article className="flex h-full min-w-0 flex-col overflow-hidden rounded-xl border border-border/60 bg-card shadow-card">
      {s.clipping && (
        <a href={safeExternalUrl(s.url) ?? undefined} target="_blank" rel="noopener noreferrer" tabIndex={-1} aria-hidden="true" className="block aspect-[5/3] overflow-hidden bg-muted">
          <img src={s.clipping} alt="" loading="lazy" className="h-full w-full object-cover object-top" />
        </a>
      )}
      <div className="flex flex-1 flex-col gap-2.5 p-4">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-medium text-muted-foreground">
          <span>{when(s.publishedAt)}</span>
          <span aria-hidden className="h-1 w-1 rounded-full bg-current opacity-60" />
          <span className="truncate">{s.source}</span>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px]">{s.topic}</span>
        </p>
        <a
          href={safeExternalUrl(s.url) ?? undefined}
          target="_blank"
          rel="noopener noreferrer"
          className="font-serif text-base font-semibold leading-snug text-foreground hover:text-primary"
        >
          {s.title}
          <ExternalLink className="ml-1 inline h-3.5 w-3.5 align-[-2px] text-muted-foreground" />
        </a>
        <p className="text-xs leading-relaxed text-muted-foreground">{s.gist}</p>
        <p className="rounded-lg bg-primary/[0.06] p-2.5 text-xs leading-relaxed text-foreground/90">
          <span className="font-semibold text-primary">Talking point: </span>
          {s.talkingPoint}
        </p>
        {s.clientMessage && (
          <div className="text-xs">
            <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
              className="inline-flex items-center gap-1 py-1 font-semibold text-primary hover:underline">
              {open ? "Hide the client message" : "Read the client message"}
              {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
            {open && (
              <div className="mt-1 rounded-lg border border-border/60 p-2.5">
                <p className="whitespace-pre-line leading-relaxed text-foreground/85">{s.clientMessage}</p>
                {canShare && (
                  <button type="button" onClick={copy} className="mt-2 inline-flex items-center gap-1 font-semibold text-primary hover:underline">
                    <Copy className="h-3 w-3" /> Copy this message
                  </button>
                )}
              </div>
            )}
          </div>
        )}
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
          <Button asChild size="sm" className="flex-1 gap-1.5 bg-gradient-primary text-primary-foreground shadow-sm hover:opacity-95">
            <Link to={buildNewsWriteUrl(s)}>
              <PenLine className="h-3.5 w-3.5" /> Write about this
            </Link>
          </Button>
          {message && (
            <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={canShare ? share : copy}>
              {canShare ? <Share2 className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {canShare ? "Send to a client" : "Copy client message"}
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}

export default function IndustryNews() {
  const [query, setQueryRaw] = useState("");
  const [topic, setTopicRaw] = useState("all");
  const found = useMemo(() => searchStories(NEWS, query), [query]);
  const topics = useMemo(() => topicCounts(found), [found]);
  const shown = topic === "all" || !topics.some((t) => t.topic === topic) ? found : found.filter((s) => s.topic === topic);
  // 39+ stories made a 33,000px page on a phone: start with the newest 12.
  const [limit, setLimit] = useState(12);
  const setTopic = (t: string) => { setTopicRaw(t); setLimit(12); };
  const setQuery = (q: string) => { setQueryRaw(q); setLimit(12); };
  const months = useMemo(() => byMonth(shown.slice(0, limit)), [shown, limit]);

  if (NEWS.length === 0) {
    return (
      <Card className="border-border/60 shadow-card">
        <CardContent className="py-10 text-center text-sm text-muted-foreground">No industry news yet.</CardContent>
      </Card>
    );
  }
  const chip = (id: string, label: string, n: number) => (
    <button key={id} type="button" onClick={() => setTopic(id)} aria-pressed={topic === id}
      className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
        topic === id ? "border-primary/50 bg-primary/10 text-primary" : "border-border/70 text-muted-foreground hover:text-foreground"
      }`}>
      {label} <span className="font-normal">{n}</span>
    </button>
  );
  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search the news (e.g. MediShield, CPF, scams)"
          aria-label="Search industry news" className="pl-9" />
      </div>
      {topics.length > 1 && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Topic">
          {chip("all", "All", found.length)}
          {topics.map((t) => chip(t.topic, t.topic, t.n))}
        </div>
      )}
      {shown.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No stories match.{" "}
          <button type="button" className="font-semibold text-primary" onClick={() => { setQuery(""); setTopic("all"); }}>Clear the search</button>
        </p>
      ) : (
        <>
        {months.map((m) => (
          <section key={m.label} className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              {m.label} <span className="font-normal">{m.stories.length}</span>
            </h3>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {m.stories.map((s) => <StoryCard key={s.id} s={s} />)}
            </div>
          </section>
        ))}
        {shown.length > limit && (
          <div className="flex justify-center">
            <button type="button" onClick={() => setLimit((n) => n + 12)}
              className="h-10 rounded-lg border border-border/70 px-4 text-sm font-semibold hover:border-primary/40">
              Show {Math.min(12, shown.length - limit)} more of {shown.length - limit}
            </button>
          </div>
        )}
        </>
      )}
    </div>
  );
}
