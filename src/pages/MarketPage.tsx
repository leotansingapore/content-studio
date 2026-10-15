// Your market (Discover > Your market): set up once, check once a week, write from what moved. Leo only while the
// market function's MARKET_USERS lists him; the nav hides it for everyone else.
// Design: docs/superpowers/specs/2026-10-15-market-watch-design.md.

import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ExternalLink, Loader2, PenLine, Plus, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FilterChip } from "@/components/ui/filter-chip";
import { InfoTip } from "@/components/ui/info-tip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ToastAction } from "@/components/ui/toast";
import { useToast } from "@/hooks/use-toast";
import { loadBrand } from "@/lib/carousel";
import {
  EMPTY_MARKET, POSITION_LABEL, actCount, alsoReported, geoKey, geoWriteUrl, loadMarket, marketJob, newsKey, newsWriteUrl, nextCheckDay,
  dismissQuestion, newsByTopic, onMarketJob, pickingUp, postKey, postWriteUrl, runMarketCheck, saveMarket, suggestSetup, siteList, visibleGeo, visibleNews, visiblePosts,
  weekNote, withKey, type GeoRead, type MarketState, type Show,
} from "@/lib/market";
import { loadFollowing } from "@/lib/following";
import { MAX_WATCH, loadWatch, saveWatch } from "@/lib/mentions";
import { loadPositioning } from "@/lib/positioning";
import { supabase } from "@/lib/supabase";
import { useUrlState } from "@/lib/urlState";

const ago = (iso: string) => {
  const d = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  return d <= 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`;
};

export default function MarketPage() {
  const [uid, setUid] = useState<string | null>(null);
  const [state, setState] = useState<MarketState>(EMPTY_MARKET);
  const [view, setView] = useUrlState<"digest" | "setup">("view", "digest", { allowed: ["digest", "setup"] });

  useEffect(() => {
    document.title = "Your market - Content Studio";
    supabase.auth.getUser().then(({ data }) => {
      const id = data.user?.id ?? null;
      setUid(id);
      if (id) setState(loadMarket(id));
    });
  }, []);

  if (!uid) return null;
  const ready = !!state.audience && (state.questions.length > 0 || loadWatch(uid).length > 0);
  return view === "setup" || !ready
    ? <SetupForm uid={uid} state={state} onSaved={(s, check) => { setState(s); setView("digest"); if (check) void runMarketCheck(uid); }} />
    : <Digest uid={uid} state={state} setState={setState} />;
}

function SetupForm({ uid, state, onSaved }: { uid: string; state: MarketState; onSaved: (s: MarketState, check: boolean) => void }) {
  const { toast } = useToast();
  const positioning = loadPositioning(uid);
  const [name, setName] = useState(state.name || loadBrand(uid)?.name || "");
  const [site, setSite] = useState(state.site);
  const [audience, setAudience] = useState(state.audience || positioning?.audienceDetail || positioning?.oneLiner || "");
  const [keywords, setKeywords] = useState<string[]>(loadWatch(uid));
  const [questions, setQuestions] = useState<string[]>(state.questions);
  const [kwDraft, setKwDraft] = useState("");
  const [qDraft, setQDraft] = useState("");
  const [suggesting, setSuggesting] = useState(false);
  const topics = state.topics.length ? state.topics : positioning?.topics ?? [];

  const suggest = async () => {
    if (!audience.trim()) return toast({ title: "Say who you serve first", variant: "destructive" });
    setSuggesting(true);
    try {
      const s = await suggestSetup({ name, site, audience, topics });
      setKeywords((k) => [...new Set([...k, ...s.keywords])].slice(0, MAX_WATCH));
      setQuestions((q) => [...new Set([...q, ...s.questions])].slice(0, 5));
      if (!s.keywords.length && !s.questions.length) toast({ title: "Nothing to suggest yet", description: "Add your own below." });
    } catch (e) {
      toast({ title: (e as Error).message, variant: "destructive" });
    } finally {
      setSuggesting(false);
    }
  };
  const add = (list: string[], set: (l: string[]) => void, draft: string, clear: () => void, max: number, min: number) => {
    const t = draft.replace(/\s+/g, " ").trim();
    if (t.length < min || list.length >= max || list.some((x) => x.toLowerCase() === t.toLowerCase())) return;
    set([...list, t]);
    clear();
  };
  const save = () => {
    const kw = saveWatch(uid, keywords);
    const next = saveMarket(uid, { ...loadMarket(uid), name: name.trim(), site: site.trim(), audience: audience.trim(), topics, questions });
    onSaved(next, next.checks.length === 0 && (kw.length > 0 || questions.length > 0));
  };
  const canSave = audience.trim().length > 0 && (keywords.length > 0 || questions.length > 0);
  const firstTime = state.checks.length === 0;

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 sm:p-6">
      <h1 className="text-2xl font-semibold">Set up your market</h1>
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="market-name">Your name or business</Label>
            <Input id="market-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="Leo Tan" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="market-site">Website (optional)</Label>
            <Input id="market-site" value={site} maxLength={300} onChange={(e) => setSite(e.target.value)} placeholder="yoursite.sg" inputMode="url" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="market-audience">Who you serve</Label>
          <Textarea id="market-audience" value={audience} maxLength={300} rows={2} onChange={(e) => setAudience(e.target.value)} placeholder="Young families in Singapore buying their first home" />
        </div>
        <Button type="button" variant="outline" onClick={suggest} disabled={suggesting} className="gap-1.5">
          {suggesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {suggesting ? "Suggesting..." : "Suggest topics and questions"}
        </Button>
      </div>

      <ListField
        title={`News topics to watch (${keywords.length}/${MAX_WATCH})`}
        tip="Shared with Mentions, so both pages watch the same topics."
        items={keywords}
        onRemove={(k) => setKeywords(keywords.filter((x) => x !== k))}
        draft={kwDraft}
        setDraft={setKwDraft}
        placeholder="CPF LIFE"
        onAdd={() => add(keywords, setKeywords, kwDraft, () => setKwDraft(""), MAX_WATCH, 2)}
        min={2}
        full={keywords.length >= MAX_WATCH}
      />
      <ListField
        title={`Questions your clients ask AI (${questions.length}/5)`}
        tip="Each check reads ChatGPT's answer and where you stand in it."
        items={questions}
        onRemove={(q) => setQuestions(questions.filter((x) => x !== q))}
        draft={qDraft}
        setDraft={setQDraft}
        placeholder="How much insurance does a young family need in Singapore?"
        onAdd={() => add(questions, setQuestions, qDraft, () => setQDraft(""), 5, 8)}
        min={8}
        full={questions.length >= 5}
      />
      <p className="text-sm text-muted-foreground">
        Competitors come from <Link to="/following" className="underline underline-offset-2">Following</Link>.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={save} disabled={!canSave}>{firstTime ? "Save and check my market" : "Save"}</Button>
        {!canSave && <span className="text-sm text-muted-foreground">Add who you serve and at least one topic or question.</span>}
      </div>
    </div>
  );
}

function ListField(props: {
  title: string; tip: string; items: string[]; onRemove: (v: string) => void; draft: string; setDraft: (v: string) => void;
  placeholder: string; onAdd: () => void; full: boolean;
  /** Shortest entry the server keeps: 8 letters for a question, 2 for a topic. */
  min: number;
}) {
  const tooShort = props.draft.trim().length < props.min;
  return (
    <section className="space-y-2">
      <h2 className="flex items-center gap-1.5 text-base font-medium">{props.title}<InfoTip>{props.tip}</InfoTip></h2>
      <ul className="space-y-1.5">
        {props.items.map((v) => (
          <li key={v} className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm">
            <span className="min-w-0 break-words">{v}</span>
            <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0" aria-label={`Remove ${v}`} onClick={() => props.onRemove(v)}>
              <X className="h-4 w-4" />
            </Button>
          </li>
        ))}
      </ul>
      {!props.full && (
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); props.onAdd(); }}>
          <Input value={props.draft} onChange={(e) => props.setDraft(e.target.value)} placeholder={props.placeholder} maxLength={160} aria-label={props.title} />
          <Button type="submit" variant="outline" size="icon" className="h-10 w-10 shrink-0" aria-label="Add" disabled={tooShort}><Plus className="h-4 w-4" /></Button>
        </form>
      )}
    </section>
  );
}

function Digest({ uid, state, setState }: { uid: string; state: MarketState; setState: (s: MarketState) => void }) {
  const { toast } = useToast();
  const [show, setShow] = useUrlState<Show>("show", "act", { allowed: ["act", "all"] });
  const [, tick] = useState(0);
  const job = marketJob();
  const running = job?.state === "running";
  const latest = state.checks[state.checks.length - 1];
  const nextDay = nextCheckDay(state);
  const rising = pickingUp(state.checks);

  useEffect(() => onMarketJob((j) => {
    setState(loadMarket(uid));
    tick((n) => n + 1);
    if (j?.state === "failed") toast({ title: "Check didn't run", description: j.error, variant: "destructive" });
  }), [uid, setState, toast]);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    // the result only comes back to this tab, and the week's check is already counted: ask before it closes
    const keep = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", keep);
    return () => {
      clearInterval(t);
      window.removeEventListener("beforeunload", keep);
    };
  }, [running]);

  const update = (next: MarketState) => setState(saveMarket(uid, next));
  const dismiss = (key: string) => {
    const before = loadMarket(uid);
    update({ ...before, dismissed: withKey(before.dismissed, key, true) });
    toast({ title: "Hidden for good", action: <ToastAction altText="Undo" onClick={() => update({ ...loadMarket(uid), dismissed: withKey(loadMarket(uid).dismissed, key, false) })}>Undo</ToastAction> });
  };
  const dismissAsked = (x: GeoRead) => {
    const before = loadMarket(uid);
    const at = before.questions.findIndex((q) => q.toLowerCase() === x.question.toLowerCase());
    update(dismissQuestion(before, x, true));
    toast({
      title: "Hidden, and not asked again",
      action: <ToastAction altText="Undo" onClick={() => update(dismissQuestion(loadMarket(uid), x, false, at < 0 ? undefined : at))}>Undo</ToastAction>,
    });
  };
  const following = loadFollowing(uid).length;
  const wrote = (key: string) => update({ ...loadMarket(uid), written: withKey(loadMarket(uid).written, key, true) });

  const news = latest ? visibleNews(latest, state, show) : [];
  const geo = latest ? visibleGeo(latest, state, show) : [];
  const posts = latest ? visiblePosts(latest, state, show) : [];
  const acts = latest ? actCount(latest, state) : 0;

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-1.5 text-2xl font-semibold">
          Your market<InfoTip>One check a week: news, AI answers and competitors' best posts.</InfoTip>
        </h1>
        <Button asChild variant="outline" size="sm"><Link to="/market?view=setup">Edit set-up</Link></Button>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={() => void runMarketCheck(uid)} disabled={running || !!nextDay} className="gap-1.5">
          {running && <Loader2 className="h-4 w-4 animate-spin" />}
          {running ? `Checking... ${Math.round((Date.now() - job!.startedAt) / 1000)}s` : "Check my market"}
        </Button>
        <span className="text-sm text-muted-foreground" aria-live="polite">
          {running ? "Reading the news and asking ChatGPT. About a minute; other pages are fine, but keep this tab open." : weekNote(state, job)}
        </span>
      </div>

      {!latest && !running && <p className="text-muted-foreground">No check yet.</p>}

      {latest && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-sm text-muted-foreground">Checked {ago(latest.checkedAt)}.</span>
            <FilterChip active={show === "act"} onClick={() => setShow("act")} count={acts}>Act</FilterChip>
            <FilterChip active={show === "all"} onClick={() => setShow("all")}>All</FilterChip>
          </div>

          {!news.length && !geo.length && !posts.length && (
            <p className="text-muted-foreground">
              Nothing to act on from this check. {show === "act" && <button type="button" className="underline underline-offset-2" onClick={() => setShow("all")}>See all</button>}
            </p>
          )}

          {news.length > 0 && (
            <Section title="News on your topics">
              {newsByTopic(news, rising).map((t) => (
                <li key={t.keyword} className="space-y-3">
                  <h3 className="flex flex-wrap items-center gap-2 text-sm font-medium text-muted-foreground">
                    {t.keyword}, {t.items.length} {t.items.length === 1 ? "story" : "stories"}
                    {rising.includes(t.keyword) && <span className="rounded-full border border-primary px-2 py-0.5 text-xs text-primary">Picking up</span>}
                  </h3>
                  <ul className="space-y-3">
                    {t.items.map((x) => {
                      const also = alsoReported(latest, x);
                      return (
                        <Card key={x.url} label={x.title} tag={x.relevant === null ? "Not judged" : x.tag === "act" ? "Act" : "Watch"} act={x.tag === "act"}
                          written={state.written.includes(newsKey(x))} writeUrl={newsWriteUrl(x)} writeLabel="Write a post from this"
                          onWrite={() => wrote(newsKey(x))} onDismiss={() => dismiss(newsKey(x))}>
                          <a href={x.url} target="_blank" rel="noreferrer" className="block py-1.5 font-medium hover:underline">{x.title}</a>
                          <p className="text-sm text-muted-foreground">
                            {x.source}{x.date ? `, ${x.date.slice(0, 10)}` : ""}
                            {also.length > 0 && <>, also in {also.map((o) => o.source).join(", ")}</>}
                          </p>
                        </Card>
                      );
                    })}
                  </ul>
                </li>
              ))}
            </Section>
          )}

          {geo.length > 0 && (
            <Section title="Your clients' questions in ChatGPT">
              {geo.map((x) => (
                <Card key={x.question} label={x.question} tag={x.position ? POSITION_LABEL[x.position] : "No answer"} act={x.position === "not-mentioned" || x.position === "passing"}
                  written={state.written.includes(geoKey(x))} writeUrl={x.error ? undefined : geoWriteUrl(x)} writeLabel="Write a post that answers this"
                  onWrite={() => wrote(geoKey(x))} onDismiss={() => dismissAsked(x)}>
                  <p className="font-medium">"{x.question}"</p>
                  {!x.error && (x.named?.length ?? 0) > 0 && (
                    <p className="text-sm">Recommended instead: {x.named!.slice(0, 5).join(", ")}</p>
                  )}
                  {x.error ? <p className="text-sm text-muted-foreground">{x.error}</p> : x.sources.length > 0 && (
                    <p className="text-sm text-muted-foreground">
                      Sources it used:{" "}
                      {siteList(x.sources).slice(0, 5).map((s, k) => (
                        <span key={s.url}>{k > 0 && ", "}<a href={s.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">{s.domain}</a></span>
                      ))}
                    </p>
                  )}
                </Card>
              ))}
            </Section>
          )}

          {following === 0 && posts.length === 0 && (
            <p className="text-sm text-muted-foreground">
              <Link to="/following" className="underline underline-offset-2">Follow up to 5 competitor accounts</Link> to see their best posts here.
            </p>
          )}

          {posts.length > 0 && (
            <Section title="Competitors doing well">
              {posts.map((x) => (
                <Card key={x.id} label={`@${x.handle}'s post`} tag={x.tag === "act" ? "Act" : "Watch"} act={x.tag === "act"} written={state.written.includes(postKey(x))}
                  writeUrl={postWriteUrl(x)} writeLabel="Write your take" onWrite={() => wrote(postKey(x))} onDismiss={() => dismiss(postKey(x))}>
                  <a href={x.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 py-1.5 font-medium hover:underline">@{x.handle}<ExternalLink className="h-3.5 w-3.5" /></a>
                  <p className="line-clamp-3 text-sm text-muted-foreground">{x.caption}</p>
                </Card>
              ))}
            </Section>
          )}
        </>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      <ul className="space-y-3">{children}</ul>
    </section>
  );
}

function Card(props: {
  /** Names the item in each control's accessible name, so a screen reader can tell one card's Dismiss from the next. */
  label: string;
  tag: string; act: boolean; written: boolean; writeUrl?: string; writeLabel: string; onWrite: () => void; onDismiss: () => void; children: ReactNode;
}) {
  return (
    <li className="space-y-3 rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1 break-words">{props.children}</div>
        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs ${props.act ? "border-primary text-primary" : "border-border text-muted-foreground"}`}>{props.tag}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {props.writeUrl && (
          <Button asChild size="sm" className="gap-1.5">
            <Link to={props.writeUrl} onClick={props.onWrite} aria-label={`${props.written ? "Write another" : props.writeLabel}: ${props.label}`}><PenLine className="h-3.5 w-3.5" />{props.written ? "Write another" : props.writeLabel}</Link>
          </Button>
        )}
        <Button type="button" size="sm" variant="ghost" onClick={props.onDismiss} aria-label={`Dismiss: ${props.label}`}>Dismiss</Button>
        {props.written && <span className="text-xs text-muted-foreground">Written</span>}
      </div>
    </li>
  );
}
