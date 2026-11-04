// Scriptwriter (/script, Leo's sign-ins only; script desk, wave 1): the dials (12 of them), hook ideas and a script
// from a topic, on one page. The editor is on the left and the panel on the right
// (?tab=dials | hooks | topic); every write runs as a script-desk job on Leo's Mac (src/lib/scriptDesk.ts). The
// editor, the dials, the hook ideas and a wait in progress are kept per brand on this device, so leaving the page loses
// nothing and a wait picks up again on return. Everyone else gets the 404 page.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { RotateCcw, Sparkles } from "lucide-react";
import { DeskError, DeskWait, ScriptExtras, TOUCH, useDeskRun, withHook } from "@/components/ScriptDeskParts";
import { Button } from "@/components/ui/button";
import { FilterChip } from "@/components/ui/filter-chip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ToastAction } from "@/components/ui/toast";
import { useToast } from "@/hooks/use-toast";
import { scoped } from "@/lib/profiles";
import { hasAvatar } from "@/lib/scriptContext";
import {
  BANDS, DEFAULT_BAND, DEFAULT_DIALS, DEFAULT_LENGTH, DIAL_META, SECONDS, WORDS, levelOf, pollDesk, runDesk, saveScriptDraft, secondsOf, wordsOf,
  type Band, type DialId, type Dials, type HookIdea, type Script,
} from "@/lib/scriptDesk";
import { useLeoUser } from "@/lib/useLeoOnly";
import { useUrlState } from "@/lib/urlState";
import NotFoundPage from "@/pages/NotFoundPage";

type Tab = "dials" | "hooks" | "topic";
const TABS: { id: Tab; label: string }[] = [{ id: "dials", label: "Dials" }, { id: "hooks", label: "Hook ideas" }, { id: "topic", label: "From a topic" }];

interface Desk {
  about: string;
  title: string;
  script: string;
  extras: Pick<Script, "hooks" | "flags" | "notes">;
  dials: Dials;
  length: number;
  hookTopic: string;
  ideas: HookIdea[];
  topic: string;
  band: Band;
  /** A write still waiting on the Mac when the page was left: picked up again on return. */
  pending?: { job: string; kind: "script" | "hooks"; at: number };
  /** The My posts draft this script was saved as, so saving again updates it. */
  savedId?: string;
}

const NO_EXTRAS = { hooks: [], flags: [], notes: [] };
const FRESH: Desk = { about: "", title: "", script: "", extras: NO_EXTRAS, dials: DEFAULT_DIALS, length: DEFAULT_LENGTH, hookTopic: "", ideas: [], topic: "", band: DEFAULT_BAND };
// this device only: an unsaved draft, not something to sync
const keyOf = (userId: string) => `cs-scriptwriter-${scoped(userId)}`;

function loadDesk(userId: string): Desk {
  try {
    const raw = JSON.parse(localStorage.getItem(keyOf(userId)) ?? "null");
    return raw && typeof raw === "object" ? { ...FRESH, ...raw, dials: { ...DEFAULT_DIALS, ...raw.dials }, extras: { ...NO_EXTRAS, ...raw.extras } } : FRESH;
  } catch {
    return FRESH;
  }
}

export default function ScriptwriterPage() {
  const leo = useLeoUser();
  if (leo === undefined) return <div className="min-h-[40vh]" aria-busy="true" />;
  if (!leo) return <NotFoundPage notOnAccount />;
  return <Scriptwriter userId={leo.id} />;
}

function Scriptwriter({ userId }: { userId: string }) {
  const { toast } = useToast();
  const [tab, setTab] = useUrlState<Tab>("tab", "dials", { allowed: TABS.map((t) => t.id) });
  const [desk, setDeskState] = useState<Desk>(() => loadDesk(userId));
  const deskRef = useRef(desk);
  const setDesk = (patch: Partial<Desk>) => {
    const next = { ...deskRef.current, ...patch };
    deskRef.current = next;
    setDeskState(next);
    try {
      localStorage.setItem(keyOf(userId), JSON.stringify(next));
    } catch {
      // storage full or blocked: the page still works, it just won't survive a reload
    }
  };
  const { busy, error, run, cancel } = useDeskRun();
  const [saved, setSaved] = useState(false);
  const scriptRef = useRef<HTMLTextAreaElement>(null);
  const avatar = hasAvatar(userId);

  // a new script replaces the editor's; one already there comes back with Undo
  const takeScript = (s: Script) => {
    const before = deskRef.current;
    setDesk({ title: s.title, script: s.script, extras: { hooks: s.hooks, flags: s.flags, notes: s.notes }, pending: undefined, savedId: undefined });
    setSaved(false);
    // on a phone the editor is above the panel: bring the new script into view
    if (window.matchMedia?.("(max-width: 1023px)").matches) scriptRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    if (before.script.trim() && before.script !== s.script) {
      toast({ title: "New script in. Yours was replaced.", action: <ToastAction altText="Undo" onClick={() => setDesk({ title: before.title, script: before.script, extras: before.extras, savedId: before.savedId })}>Undo</ToastAction> });
    }
  };
  const write = (what: string, body: Record<string, unknown>) =>
    run(what, (o) => runDesk<Script>({ action: "write", ...body }, { userId, ...o, onFiled: (job) => setDesk({ pending: { job, kind: "script", at: Date.now() } }) })).then((s) => {
      if (s) takeScript(s);
      // a failure ends the wait; a wait cut off by leaving the page keeps it, to pick up on return
      else if (s === null) setDesk({ pending: undefined });
    });

  // a wait left behind on another page: pick it up (the server fails it after 45 s unclaimed or 4 minutes unanswered)
  useEffect(() => {
    const p = deskRef.current.pending;
    if (!p) return;
    if (Date.now() - p.at > 6 * 60_000) return setDesk({ pending: undefined });
    if (p.kind === "hooks") {
      void run("Hook ideas", (o) => pollDesk<{ hooks: HookIdea[] }>(p.job, o), p.at).then((r) => r !== undefined && setDesk(r ? { ideas: r.hooks, pending: undefined } : { pending: undefined }));
    } else {
      void run("Your script", (o) => pollDesk<Script>(p.job, o), p.at).then((r) => (r ? takeScript(r) : r === null && setDesk({ pending: undefined })));
    }
    // once, on arrival
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const generate = () => write("Your script", { entry: "dials", topic: desk.about, dials: { ...desk.dials, length: desk.length } });
  const hookIdeas = () =>
    run("Hook ideas", (o) => runDesk<{ hooks: HookIdea[] }>({ action: "hooks", topic: desk.hookTopic }, { userId, ...o, onFiled: (job) => setDesk({ pending: { job, kind: "hooks", at: Date.now() } }) })).then((r) =>
      r !== undefined && setDesk(r ? { ideas: r.hooks, pending: undefined } : { pending: undefined }),
    );
  const fromHook = (hook: string) => write("Your script", { entry: "hook", hook, about: desk.hookTopic, band: desk.band });
  const fromTopic = () => write("Your script", { entry: "topic", topic: desk.topic, band: desk.band });

  const save = () => {
    const d = saveScriptDraft(userId, { title: desk.title, script: desk.script }, desk.savedId);
    setDesk({ savedId: d.id });
    setSaved(true);
  };
  const useHook = (hook: string) => {
    const before = deskRef.current.script;
    setDesk({ script: withHook(before, hook) });
    toast({ title: "New first line.", action: <ToastAction altText="Undo" onClick={() => setDesk({ script: before })}>Undo</ToastAction> });
  };
  const clear = () => {
    const before = deskRef.current;
    setDesk({ about: "", title: "", script: "", extras: NO_EXTRAS, savedId: undefined });
    setSaved(false);
    toast({ title: "Cleared.", action: <ToastAction altText="Undo" onClick={() => setDesk({ about: before.about, title: before.title, script: before.script, extras: before.extras, savedId: before.savedId })}>Undo</ToastAction> });
  };

  const words = wordsOf(desk.script);
  const running = Boolean(busy);
  // the wait and any failure, right by the button that started it (on a phone the panel is below the editor)
  const status = (
    <>
      {busy && <DeskWait busy={busy} onStop={() => (cancel(), setDesk({ pending: undefined }))} />}
      <DeskError text={error} />
    </>
  );

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-serif text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">Scriptwriter</h1>
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
        <section aria-label="Script" className="min-w-0 space-y-4 rounded-xl border border-border/60 p-4 shadow-card">
          <div className="space-y-1.5">
            <Label htmlFor="sw-about">Topic <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <Input id="sw-about" value={desk.about} maxLength={300} placeholder="Empty picks one from your niche" onChange={(e) => setDesk({ about: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sw-title">Title</Label>
            <Input id="sw-title" value={desk.title} maxLength={120} placeholder="Filled in by the writer" onChange={(e) => setDesk({ title: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-2">
              <Label htmlFor="sw-script">Script, read out as written</Label>
              <span className="text-xs tabular-nums text-muted-foreground">{words} words, about {secondsOf(desk.script)}s</span>
            </div>
            <Textarea id="sw-script" ref={scriptRef} rows={14} value={desk.script} placeholder="Your script shows here." onChange={(e) => (setDesk({ script: e.target.value }), setSaved(false))} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" onClick={save} disabled={!desk.script.trim() || running}>{desk.savedId ? "Save changes to My posts" : "Save to My posts"}</Button>
            <Button type="button" variant="ghost" onClick={clear} disabled={running || (!desk.script && !desk.title && !desk.about)}>Clear</Button>
            {saved && desk.savedId && (
              <span role="status" className="text-sm text-muted-foreground">
                Saved. <Link to="/drafts" className="font-medium text-primary underline underline-offset-2">Open My posts</Link>
              </span>
            )}
          </div>
          <ScriptExtras s={desk.extras} onUseHook={running ? undefined : useHook} />
        </section>

        <section aria-label="How to write it" className="min-w-0 space-y-4 rounded-xl border border-border/60 p-4 shadow-card lg:sticky lg:top-20">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Write from">
            {TABS.map((t) => <FilterChip key={t.id} active={tab === t.id} onClick={() => setTab(t.id)}>{t.label}</FilterChip>)}
          </div>

          {tab === "dials" && (
            <DialsPanel
              dials={desk.dials}
              length={desk.length}
              avatar={avatar}
              running={running}
              onDial={(id, v) => setDesk({ dials: { ...desk.dials, [id]: v } })}
              onLength={(length) => setDesk({ length })}
              onReset={() => setDesk({ dials: DEFAULT_DIALS, length: DEFAULT_LENGTH })}
              onGenerate={generate}
              status={status}
            />
          )}

          {tab === "hooks" && (
            <div className="space-y-3">
              <form className="space-y-1.5" onSubmit={(e) => (e.preventDefault(), void hookIdeas())}>
                <Label htmlFor="sw-hook-topic">Topic</Label>
                <div className="flex gap-2">
                  <Input id="sw-hook-topic" value={desk.hookTopic} maxLength={300} placeholder="Cafe owners who dread tax season" onChange={(e) => setDesk({ hookTopic: e.target.value })} />
                  <Button type="submit" className="shrink-0" disabled={running || !desk.hookTopic.trim()}>Get hooks</Button>
                </div>
              </form>
              {status}
              <BandChips band={desk.band} onBand={(band) => setDesk({ band })} />
              {desk.ideas.length > 0 && (
                <ul className="divide-y divide-border/60 rounded-lg border border-border/60">
                  {desk.ideas.map((h) => (
                    <li key={h.hook} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
                      <span className="min-w-0 flex-1 basis-48 [overflow-wrap:anywhere]">{h.hook}</span>
                      {h.pattern && <span className="rounded-full border border-border/70 px-2 py-0.5 text-[11px] text-muted-foreground">{h.pattern}</span>}
                      <Button type="button" variant="outline" size="sm" className={TOUCH} disabled={running} onClick={() => void fromHook(h.hook)}>Write it</Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {tab === "topic" && (
            <form className="space-y-3" onSubmit={(e) => (e.preventDefault(), void fromTopic())}>
              <div className="space-y-1.5">
                <Label htmlFor="sw-topic">Topic</Label>
                <Input id="sw-topic" value={desk.topic} maxLength={300} placeholder="Why monthly books beat a yearly scramble" onChange={(e) => setDesk({ topic: e.target.value })} />
              </div>
              <BandChips band={desk.band} onBand={(band) => setDesk({ band })} />
              {status}
              <Button type="submit" className="w-full gap-1.5" disabled={running || !desk.topic.trim()}><Sparkles className="h-4 w-4" /> Write it</Button>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}

function BandChips({ band, onBand }: { band: Band; onBand: (b: Band) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Length">
      {BANDS.map((b) => (
        <FilterChip key={b.join("-")} active={b[0] === band[0] && b[1] === band[1]} onClick={() => onBand(b)}>{b[0]} to {b[1]} s</FilterChip>
      ))}
    </div>
  );
}

function DialsPanel(p: {
  dials: Dials;
  length: number;
  avatar: boolean;
  running: boolean;
  onDial: (id: DialId, v: number) => void;
  onLength: (s: number) => void;
  onReset: () => void;
  onGenerate: () => void;
  status: ReactNode;
}) {
  const at = Math.max(0, SECONDS.findIndex((s) => s === p.length));
  const [lo, hi] = WORDS[p.length] ?? WORDS[DEFAULT_LENGTH];
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Dials</h2>
        <Button type="button" variant="ghost" size="sm" className={`gap-1 ${TOUCH}`} onClick={p.onReset} disabled={p.running}><RotateCcw className="h-3.5 w-3.5" /> Reset</Button>
      </div>
      <div className="grid grid-cols-3 gap-x-2 gap-y-4 sm:grid-cols-4">
        <Dial id="sw-dial-length" label="Script length" shown={`${p.length}s`} sub={`${lo}-${hi} words`} pct={at / (SECONDS.length - 1)}
          input={<input id="sw-dial-length" type="range" min={0} max={SECONDS.length - 1} step={1} value={at} onChange={(e) => p.onLength(SECONDS[Number(e.target.value)])} aria-valuetext={`${p.length} seconds`} className="w-full accent-primary [@media(pointer:coarse)]:h-11" />} />
        {DIAL_META.map((d) => (
          <Dial key={d.id} id={`sw-dial-${d.id}`} label={d.label} shown={String(p.dials[d.id])} sub={levelOf(p.dials[d.id])} pct={p.dials[d.id] / 100}
            input={<input id={`sw-dial-${d.id}`} type="range" min={0} max={100} step={10} value={p.dials[d.id]} onChange={(e) => p.onDial(d.id, Number(e.target.value))} aria-valuetext={`${p.dials[d.id]}, ${levelOf(p.dials[d.id])}`} className="w-full accent-primary [@media(pointer:coarse)]:h-11" />} />
        ))}
      </div>
      {!p.avatar && (
        <p className="text-xs text-muted-foreground">
          No audience yet, so scripts aim at founders in general. Add one in <Link to="/audiences" className="text-primary underline underline-offset-2">Audiences</Link>.
        </p>
      )}
      {p.status}
      <Button type="button" className="w-full gap-1.5 bg-gradient-primary text-primary-foreground" onClick={p.onGenerate} disabled={p.running}>
        <Sparkles className="h-4 w-4" /> Generate
      </Button>
    </div>
  );
}

/** One round gauge: the ring shows the value, the slider under it sets it. */
function Dial({ id, label, shown, sub, pct, input }: { id: string; label: string; shown: string; sub: string; pct: number; input: ReactNode }) {
  const r = 22;
  const c = 2 * Math.PI * r;
  return (
    <div className="flex min-w-0 flex-col items-center gap-1 text-center">
      <svg viewBox="0 0 56 56" className="h-14 w-14" aria-hidden="true">
        <circle cx="28" cy="28" r={r} fill="none" strokeWidth="5" className="stroke-muted" />
        <circle cx="28" cy="28" r={r} fill="none" strokeWidth="5" strokeLinecap="round" className="stroke-primary" strokeDasharray={`${c * pct} ${c}`} transform="rotate(-90 28 28)" />
        <text x="28" y="32" textAnchor="middle" className="fill-foreground text-[12px] font-semibold">{shown}</text>
      </svg>
      {/* two lines held for every label so "Template match" can wrap and the row of gauges stays level */}
      <label htmlFor={id} className="flex min-h-[2.5em] w-full items-center justify-center text-xs font-medium leading-tight">{label}</label>
      <span className="text-[11px] text-muted-foreground">{sub}</span>
      {input}
    </div>
  );
}
