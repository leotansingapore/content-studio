// My hooks (/hooks, Studio > Create): write 5 to 30 hooks about a topic at once (hook-writer), Keep the good ones and
// say Not this to the rest so the next batch learns, add your own, and see the six reaction formats that work with
// their median views. Kept hooks are the brand's hook snippets, offered in Write's Pick a hook and in slideshow
// campaigns (src/lib/hookWriter.ts). Folded from BuilderCult's My hooks (owner's agreement, Leo 6 Nov 2026).
//
// URL (docs/deep-links.md): n=5|10|20|30 and format=<id>|any replace; topic= (the launch plan's link-in) fills the box
// once, then leaves the address.

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CheckIcon, CopyIcon, CircleNotchIcon, QuotesIcon, SparkleIcon, TrashIcon, XIcon } from "@phosphor-icons/react";
import PriceChip from "@/components/PriceChip";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ToastAction } from "@/components/ui/toast";
import { useToast } from "@/hooks/use-toast";
import { useUsesLeft } from "@/lib/aiUsage";
import {
  addOwn,
  bringBack,
  COUNTS,
  FORMATS,
  HOOKS_CHANGED,
  keepHook,
  keptHooks,
  loadDesk,
  MAX_TOPIC,
  NEED_TOPIC,
  removeHook,
  saveDesk,
  turnDown,
  WRITE_FAILED,
  writeHooks,
  type HookDesk,
} from "@/lib/hookWriter";
import { MAX_PER_KIND, saveSnippet, type Snippet } from "@/lib/replySnippets";
import { useUrlState, useUrlUpdate } from "@/lib/urlState";
import { useSignedInUser } from "@/lib/useLeoOnly";
import NotFoundPage from "@/pages/NotFoundPage";

const TOUCH = "[@media(pointer:coarse)]:min-h-11";
const COUNT_VALUES = COUNTS.map(String) as readonly string[];
const FORMAT_VALUES = ["any", ...FORMATS.map((f) => f.id)];
const formatName = (id: string) => FORMATS.find((f) => f.id === id)?.name ?? "Other";
const FULL = `My hooks holds ${MAX_PER_KIND}. Remove one to keep another.`;
const big = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M` : `${Math.round(n / 1000)}K`);
const pill = (on: boolean) =>
  `h-9 rounded-full border px-3 text-xs font-medium transition-colors ${TOUCH} ${on ? "border-primary/60 bg-primary/10 text-primary" : "border-border/70 text-muted-foreground hover:text-foreground"}`;

export default function HooksPage() {
  const user = useSignedInUser();
  if (user === undefined) return <div className="min-h-[40vh]" aria-busy="true" />;
  if (!user) return <NotFoundPage notOnAccount />;
  return <HookDeskView userId={user.id} />;
}

function HookDeskView({ userId }: { userId: string }) {
  const { toast } = useToast();
  const [desk, setDesk] = useState<HookDesk>(() => loadDesk(userId));
  const [kept, setKept] = useState<Snippet[]>(() => keptHooks(userId));
  const [n, setN] = useUrlState("n", "10", { allowed: COUNT_VALUES });
  const [format, setFormat] = useUrlState("format", "any", { allowed: FORMAT_VALUES });
  const [run, setRun] = useState<{ state: "working" } | { state: "failed"; error: string } | null>(null);
  const [problem, setProblem] = useState("");
  const [own, setOwn] = useState("");
  const [copied, setCopied] = useState("");
  const working = run?.state === "working";
  const usesLeft = useUsesLeft(working);
  const topicBox = useRef<HTMLInputElement>(null);
  const [params] = useSearchParams();
  const update = useUrlUpdate();
  const topicParam = params.get("topic");
  useEffect(() => {
    if (topicParam === null) return;
    const next = { ...loadDesk(userId), topic: topicParam.slice(0, MAX_TOPIC) };
    setDesk(next);
    saveDesk(userId, next);
    update({ topic: null });
  }, [userId, topicParam, update]);

  // another tab or a synced device changed the batch or the kept list
  useEffect(() => {
    const reread = () => (setDesk(loadDesk(userId)), setKept(keptHooks(userId)));
    window.addEventListener(HOOKS_CHANGED, reread);
    window.addEventListener("content-studio-snippets-changed", reread);
    return () => (window.removeEventListener(HOOKS_CHANGED, reread), window.removeEventListener("content-studio-snippets-changed", reread));
  }, [userId]);
  useEffect(() => {
    document.title = "My hooks - Postmosis";
  }, []);

  const setTopic = (topic: string) => {
    const next = { ...desk, topic };
    setDesk(next);
    saveDesk(userId, next);
  };

  const write = async (count = Number(n), fmt = format) => {
    if (working) return;
    if (desk.topic.trim().length < 3) {
      setRun({ state: "failed", error: NEED_TOPIC });
      topicBox.current?.focus();
      return;
    }
    setRun({ state: "working" });
    setProblem("");
    try {
      setDesk(await writeHooks(userId, desk.topic.trim(), count, fmt === "any" ? null : fmt));
      setRun(null);
    } catch (e) {
      setRun({ state: "failed", error: e instanceof Error && e.message ? e.message : WRITE_FAILED });
    }
  };

  const keep = (id: string) => {
    const p = keepHook(userId, id);
    setProblem(p === "full" ? FULL : "");
    setDesk(loadDesk(userId));
    setKept(keptHooks(userId));
  };
  const notThis = (ids: string[]) => {
    const gone = turnDown(userId, ids);
    setDesk(loadDesk(userId));
    // a whole batch goes in one tap: it can come back
    if (gone.length > 1)
      toast({
        title: `Turned down ${gone.length} hooks.`,
        action: (
          <ToastAction altText="Undo" onClick={() => (bringBack(userId, gone), setDesk(loadDesk(userId)))}>
            Undo
          </ToastAction>
        ),
      });
  };
  const remove = (s: Snippet) => {
    removeHook(userId, s.id);
    setKept(keptHooks(userId));
    toast({
      title: "Hook removed.",
      action: (
        <ToastAction altText="Undo" onClick={() => (saveSnippet(userId, { name: s.name, text: s.text, kind: "hook" }), setKept(keptHooks(userId)))}>
          Undo
        </ToastAction>
      ),
    });
  };
  const addMine = () => {
    const r = addOwn(userId, own);
    setProblem(r.full ? FULL : "");
    if (r.added || !r.full) setOwn("");
    setKept(keptHooks(userId));
  };
  const copy = async (s: Snippet) => {
    try {
      await navigator.clipboard.writeText(s.text);
      setCopied(s.id);
      window.setTimeout(() => setCopied((c) => (c === s.id ? "" : c)), 1500);
    } catch {
      // clipboard blocked: the text is on screen to select
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="flex items-center gap-2 font-serif text-2xl font-semibold leading-tight tracking-tight text-foreground sm:text-3xl">
          <QuotesIcon className="h-6 w-6 shrink-0 text-primary" aria-hidden /> My hooks
        </h1>
      </header>

      <Card className="border-border/60 shadow-card">
        <CardContent className="space-y-4 pt-6">
          <label className="block space-y-1.5 text-sm font-medium">
            What are they about?
            <Input
              ref={topicBox}
              value={desk.topic}
              maxLength={MAX_TOPIC}
              onChange={(e) => setTopic(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void write()}
              placeholder="e.g. planning a week that keeps falling apart"
              className="font-normal"
            />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">How many</span>
            {COUNTS.map((c) => (
              <button key={c} type="button" aria-pressed={n === String(c)} className={pill(n === String(c))} onClick={() => setN(String(c))}>
                {c}
              </button>
            ))}
            <select value={format} onChange={(e) => setFormat(e.target.value)} aria-label="Format" className={`ml-auto h-9 rounded-md border border-input bg-background px-2 text-sm ${TOUCH}`}>
              <option value="any">Any format</option>
              {FORMATS.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => void write()} disabled={working || usesLeft("hook-writer") === 0} className="gap-1.5">
              {working ? <CircleNotchIcon className="h-4 w-4 animate-spin" /> : <SparkleIcon className="h-4 w-4" />}
              {working ? "Writing..." : `Write ${n} hooks`}
            </Button>
            <PriceChip feature="hook-writer" left={usesLeft("hook-writer")} />
          </div>
          {run?.state === "failed" && <p className="text-sm text-destructive" role="alert">{run.error}</p>}
        </CardContent>
      </Card>

      {desk.fresh.length > 0 && (
        <Card className="border-primary/40 shadow-card" data-testid="fresh-hooks">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
            <CardTitle className="flex items-center gap-1 text-base">
              New hooks ({desk.fresh.length})
              <InfoTip label="About Not this">Not this steers the next batch away from it.</InfoTip>
            </CardTitle>
            {desk.fresh.length > 1 && (
              <Button variant="ghost" size="sm" onClick={() => notThis(desk.fresh.map((h) => h.id))} className="text-muted-foreground">
                Not this to all
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-2">
            {problem && <p className="text-sm text-destructive" role="alert">{problem}</p>}
            {desk.fresh.map((h) => (
              <div key={h.id} className="flex flex-col gap-2 rounded-lg border border-border/60 p-3 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="whitespace-pre-line text-sm font-medium">{h.text}</p>
                  <p className="text-xs text-muted-foreground">{formatName(h.format)}</p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => keep(h.id)} className={`gap-1 ${TOUCH}`}>
                    <CheckIcon className="h-3.5 w-3.5" /> Keep
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => notThis([h.id])} className={`gap-1 text-muted-foreground ${TOUCH}`}>
                    <XIcon className="h-3.5 w-3.5" /> Not this
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card className="border-border/60 shadow-card" data-testid="kept-hooks">
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle className="flex items-center gap-1 text-base">
            Kept
            <InfoTip label="Where kept hooks go">Write's Pick a hook and slideshow campaigns offer these.</InfoTip>
          </CardTitle>
          <span className="text-xs font-medium text-muted-foreground">{kept.length} of {MAX_PER_KIND}</span>
        </CardHeader>
        <CardContent className="space-y-3">
          {kept.length > 0 && (
            <ul className="space-y-2">
              {kept.map((s) => (
                <li key={s.id} className="flex items-start gap-2 rounded-lg border border-border/60 p-3">
                  <p className="min-w-0 flex-1 whitespace-pre-line text-sm">{s.text}</p>
                  <Button size="icon" variant="ghost" onClick={() => void copy(s)} aria-label={`Copy ${s.text}`} className={`h-8 w-8 shrink-0 ${TOUCH}`}>
                    {copied === s.id ? <CheckIcon className="h-3.5 w-3.5 text-success" /> : <CopyIcon className="h-3.5 w-3.5" />}
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => remove(s)} aria-label={`Remove ${s.text}`} className={`h-8 w-8 shrink-0 text-muted-foreground ${TOUCH}`}>
                    <TrashIcon className="h-3.5 w-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <div className="space-y-2">
            <Textarea
              rows={3}
              value={own}
              onChange={(e) => setOwn(e.target.value)}
              placeholder={"Add your own: a blank line between hooks.\n\n3 years of this\nand i only just found out"}
              aria-label="Add your own hooks"
              className="text-sm"
            />
            <Button size="sm" variant="outline" onClick={addMine} disabled={!own.trim()}>
              Add to kept
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/60 shadow-card" data-testid="hook-formats">
        <CardHeader>
          <CardTitle className="flex items-center gap-1 text-base">
            What works in reaction videos
            <InfoTip label="Where the numbers come from">Median views and engagement from BuilderCult's reaction-video research.</InfoTip>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          {FORMATS.map((f) => (
            <div key={f.id} className="flex flex-col gap-2 rounded-lg border border-border/60 p-3">
              <p className="text-sm font-semibold">{f.name}</p>
              <p className="text-xs text-muted-foreground">{f.how}</p>
              <p className="rounded bg-muted/50 px-2 py-1 font-mono text-xs">{f.template}</p>
              <p className="text-xs text-muted-foreground">
                {big(f.medianViews)} median views, {Math.round(f.engagement * 1000) / 10}% engagement
              </p>
              <Button size="sm" variant="ghost" disabled={working} onClick={() => (setFormat(f.id), void write(5, f.id))} className={`mt-auto self-start px-0 text-primary ${TOUCH}`}>
                Write 5 like this
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
