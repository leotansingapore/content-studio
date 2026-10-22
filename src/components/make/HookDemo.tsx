// /make/hook-demo (docs/north-star/items/formats-hook-demo.md): a hook that stops the scroll, then the adviser's demo.
// The demo is a file kept on this device (never in a link); the hooks are written from what it shows or from a post
// (?source=, which MakeFormatPage resolves), Jev's pick marked; the hook plays as words on a stock clip, your own
// clip, or an AI person saying it. The run is src/lib/hookDemoJob.ts (outside React, so leaving the page keeps it
// going); the video opens in the editor (/edit), which this page pushes once it is being put together.
//
// URL (docs/deep-links.md): play=mine|spoken (stock left out) and mention=no replace; topic=<words> fills what it
// shows once, then leaves the address. Device hints: cs-make-hook-play (the last way picked) and cs-make-hook-demo
// (the typed words); the demo's key and name ride in sessionStorage for this tab (hookDemoJob.ts). The brand's saved
// demos (/brand#demo-videos) are listed first and the first is picked when this tab has none, so a saved demo makes
// a video with no file picked again; it plays its window and is never cleared from this device here.

import { useEffect, useReducer, useRef, useState, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AlertTriangle, Loader2 } from "lucide-react";
import { DemoThumb, SavedDemos } from "@/components/brand/DemoVideosSection";
import FormatShell from "@/components/make/FormatShell";
import { metaOf } from "@/components/make/PickList";
import PriceChip from "@/components/PriceChip";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FilterChip } from "@/components/ui/filter-chip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { formatBySlug } from "@/data/formats";
import { onAiJob } from "@/lib/aiVideo";
import { useUsesLeft } from "@/lib/aiUsage";
import { demoVideos, type DemoVideo } from "@/lib/demoVideos";
import {
  HOOK_PLAYS, MAX_HOOK_CHARS, PLAY_LABELS, SPOKEN_TOO_LONG, clock, demoIssue, hookClipIssue, hookIssue, pressSpend, type HookPlay,
} from "@/lib/hookDemo";
import {
  hookDemoBusy, hookDemoJob, hookSet, hooksFailure, hooksFor, hooksWriting, keepOnlyDemo, loadDemo, makeHookDemo, newDemoKey, onHookDemo,
  pendingDemo, pendingDemoKey, pendingHook, repickDemo, resumeHookDemo, saveDemo, stepText, writeHooks, type DemoRef, type HookDemoAsk,
} from "@/lib/hookDemoJob";
import { links } from "@/lib/links";
import { mediaLength } from "@/lib/longAudio";
import type { RemixSource } from "@/lib/remixSource";
import { cn } from "@/lib/utils";
import { useUrlState, useUrlUpdate } from "@/lib/urlState";
import { loadVideo, putFile, stills } from "@/lib/videoMedia";
import { paidClipBlock } from "@/lib/wallJob";

const TYPED_KEY = "cs-make-hook-demo";
const PLAY_KEY = "cs-make-hook-play";
const FIELD_LABEL = "text-xs font-semibold text-muted-foreground";
const TOUCH = "[@media(pointer:coarse)]:min-h-11";
const DEMO_LIMITS = "MP4 or MOV, up to 100 MB and 30 seconds. Stays on this device.";
const UNREADABLE = "Couldn't read that video. Try an MP4 or MOV.";
const HOOK_WAITING = "Your last spoken hook is paid for and waiting. Finish it at no cost first.";

/** A saved demo as this page plays it: its window's start and length. */
const savedRef = (d: DemoVideo): DemoRef => ({ key: d.key, name: d.name, seconds: Math.round((d.end - d.start) * 100) / 100, ...(d.start > 0 ? { start: d.start } : {}) });

/** Redraws on every change to the run, the hooks, and any AI video (one running or waiting stops a spoken hook). */
function useHookDemo(): void {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    const offs = [onHookDemo(bump), onAiJob(bump)];
    return () => offs.forEach((off) => void off());
  }, []);
}

type Typed = { topic: string; own: string };

/** What it shows and a typed hook, kept on this device so leaving the page never loses them. */
function useTyped(): [Typed, (t: Typed) => void] {
  const [typed, setTyped] = useState<Typed>(() => {
    try {
      const t = JSON.parse(localStorage.getItem(TYPED_KEY) ?? "{}");
      return { topic: typeof t.topic === "string" ? t.topic : "", own: typeof t.own === "string" ? t.own : "" };
    } catch {
      return { topic: "", own: "" };
    }
  });
  const save = (t: Typed) => {
    setTyped(t);
    try {
      localStorage.setItem(TYPED_KEY, JSON.stringify(t));
    } catch {
      // the field still holds it for this visit
    }
  };
  return [typed, save];
}

export default function HookDemo({ userId, source }: { userId: string; source: RemixSource | null }) {
  const def = formatBySlug("hook-demo")!;
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const update = useUrlUpdate();
  useHookDemo();
  const job = hookDemoJob();
  const busy = hookDemoBusy();
  const writing = hooksWriting();
  const leftOf = useUsesLeft(busy || writing);
  const [play, setPlay] = useUrlState<HookPlay>("play", "stock", { allowed: HOOK_PLAYS, remember: PLAY_KEY });
  const [mention] = useUrlState("mention", "yes", { allowed: ["yes", "no"] });
  const [typed, setTyped] = useTyped();
  const [saved] = useState(() => demoVideos(userId));
  // this tab's demo, else the one a waiting spoken hook joins, else the brand's newest saved demo
  const [demo, setDemo] = useState<DemoRef | null>(() => loadDemo() ?? pendingDemo() ?? (saved[0] ? savedRef(saved[0]) : null));
  const [demoError, setDemoError] = useState<string | null>(null);
  const [readingDemo, setReadingDemo] = useState(false);
  const [mine, setMine] = useState<{ file: File; name: string; seconds: number } | null>(null);
  const [mineError, setMineError] = useState<string | null>(null);
  // the hook picked: a written one by index, or the typed one; null takes Jev's pick
  const [choice, setChoice] = useState<number | "own" | null>(null);
  const demoInput = useRef<HTMLInputElement>(null);
  const mineInput = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const seen = useRef<string | null>(null);

  const topic = source ? "" : typed.topic;
  const forKey = hooksFor({ source, topic });
  const all = hookSet();
  const set = all && all.for === forKey ? all : null;
  const failed = hooksFailure();
  const picked = choice === "own" || !set ? typed.own.trim() : (set.hooks[choice ?? set.pick ?? 0]?.text ?? "");
  const selected = choice ?? (set ? (set.pick ?? 0) : typed.own.trim() ? "own" : null);
  const askWith = (d: DemoRef): HookDemoAsk => ({ source, topic, mention: mention !== "no", play, hook: picked, demo: d, mine: play === "mine" && mine ? { file: mine.file, seconds: mine.seconds } : null });
  const ask = demo ? askWith(demo) : null;
  // a picked or typed hook writes nothing, so the press spends only what its play does
  const spend = pressSpend(play, !picked);
  const reason =
    !demo ? "Pick your demo first."
    : !picked && !source && topic.trim().length < 3 ? "Type what your demo shows first."
    : play === "mine" && !mine ? "Pick your hook clip first."
    : picked && hookIssue(picked, play) ? hookIssue(picked, play)
    : play === "spoken" && !busy ? (pendingHook() ? HOOK_WAITING : paidClipBlock())
    : null;
  const toResult = () => {
    if (!window.matchMedia("(min-width: 1024px)").matches) resultRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  };

  // ?topic= fills what it shows once, then leaves the address
  useEffect(() => {
    const t = params.get("topic");
    if (!t) return;
    setTyped({ ...typed, topic: t.slice(0, 200) });
    update({ topic: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A spoken hook paid for and waiting on this device is picked up on arrival, at no cost, demo and all (in a new
  // tab too, where only the waiting clip knows its demo).
  useEffect(() => {
    const d = demo ?? pendingDemo();
    if (hookDemoJob() || !pendingHook() || !d) return;
    if (!demo) setDemo(d);
    resumeHookDemo(askWith(d));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // a new set of hooks starts on Jev's pick
  useEffect(() => {
    setChoice((c) => (c === "own" ? c : null));
  }, [set?.set, set?.for]);

  // once per step, while this page is open: a start or failure scrolls into view on a phone, and a run being put
  // together opens the editor, which shows the join's progress and opens the video when it is done
  useEffect(() => {
    if (!job) return;
    const step = `${job.id}:${job.state}`;
    if (seen.current === step) return;
    const live = seen.current !== null;
    seen.current = step;
    if (!live) return;
    if (job.state === "writing" || job.state === "failed") toResult();
    if (job.state === "joining" || job.state === "done") navigate(links.edit());
  }, [job, navigate]);

  const makeIt = () => {
    if (reason || !ask || hookDemoBusy()) return;
    seen.current ??= "start";
    void makeHookDemo(userId, ask);
  };
  const write = () => void writeHooks(userId, { source, topic, mention: mention !== "no", play, demo });

  const onDemo = async (f: File | undefined) => {
    if (!f) return;
    setDemoError(null);
    setReadingDemo(true);
    try {
      const seconds = await mediaLength(f);
      const issue = demoIssue(f, seconds);
      if (issue) return setDemoError(issue);
      // a spoken hook waiting for its demo takes it under the key it was paid with, and then joins it
      const waiting = job?.demoGone ? pendingDemoKey() : null;
      const ref: DemoRef = { key: waiting ?? newDemoKey(), name: f.name, seconds, thumb: await stills(f, [0.3], 120).then((t) => t[0], () => undefined) };
      if (!waiting) await putFile(ref.key, f);
      // earlier demos leave this device, unless a waiting clip still joins one
      void keepOnlyDemo(ref.key);
      saveDemo(ref);
      setDemo(ref);
      if (waiting) {
        seen.current ??= "start";
        await repickDemo(f, askWith(ref));
        return;
      }
      // the hooks are written once there is a demo and something to write them from (one remix use)
      if (!set && !writing && !typed.own.trim() && (source || topic.trim().length >= 3)) void writeHooks(userId, { source, topic, mention: mention !== "no", play, demo: ref });
    } catch {
      setDemoError(UNREADABLE);
    } finally {
      setReadingDemo(false);
    }
  };

  const pickSaved = (d: DemoVideo) => {
    const ref = savedRef(d);
    setDemoError(null);
    // a demo picked here earlier leaves this device; the saved one never does (keepOnlyDemo skips cvid- keys)
    void keepOnlyDemo(ref.key);
    saveDemo(ref);
    setDemo(ref);
    if (!set && !writing && !typed.own.trim() && (source || topic.trim().length >= 3)) void writeHooks(userId, { source, topic, mention: mention !== "no", play, demo: ref });
  };
  const isSaved = !!demo && saved.some((d) => d.key === demo.key);

  const onMine = async (f: File | undefined) => {
    if (!f) return;
    setMineError(null);
    try {
      const v = await loadVideo(f);
      const [w, h, seconds] = [v.videoWidth, v.videoHeight, v.duration];
      URL.revokeObjectURL(v.src);
      const issue = hookClipIssue(w, h, seconds);
      if (issue) {
        setMine(null);
        return setMineError(issue);
      }
      setMine({ file: f, name: f.name, seconds });
    } catch {
      setMine(null);
      setMineError(UNREADABLE);
    }
  };

  const options = (
    <>
      <Card className={cn("border-border/60 shadow-card", !demo && "ring-2 ring-primary/50")}>
        <CardContent className="space-y-2 pt-4 sm:pt-5">
          <p className={FIELD_LABEL}>Your demo</p>
          {saved.length > 0 && <SavedDemos list={saved} selected={demo?.key} onPick={pickSaved} disabled={readingDemo || busy} />}
          {demo && !isSaved ? (
            <div className="flex items-center gap-3 rounded-lg border border-border/60 p-2">
              {demo.thumb ? <img src={demo.thumb} alt="" className="h-14 w-14 shrink-0 rounded object-cover" />
              : demo.key.startsWith("cvid-") ? <DemoThumb demoKey={demo.key} />
              : <span className="h-14 w-14 shrink-0 rounded bg-muted" />}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{demo.name}</span>
                <span className="block text-xs text-muted-foreground tabular-nums">{clock(demo.seconds)}</span>
              </span>
              <Button size="sm" variant="ghost" onClick={() => demoInput.current?.click()} disabled={readingDemo || busy} className={TOUCH}>
                Change
              </Button>
            </div>
          ) : (
            <Button size="sm" variant="outline" onClick={() => demoInput.current?.click()} disabled={readingDemo || (isSaved && busy)} className={cn("gap-1.5", TOUCH)}>
              {readingDemo && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {saved.length ? "Use another video" : "Pick a video"}
            </Button>
          )}
          <p className="text-xs text-muted-foreground">{DEMO_LIMITS}</p>
          {demoError && <p role="alert" className="text-xs text-destructive">{demoError}</p>}
          <input
            ref={demoInput}
            type="file"
            accept="video/mp4,video/quicktime,.mp4,.mov"
            hidden
            onChange={(e) => {
              void onDemo(e.target.files?.[0]);
              // the same file picked again still fires
              e.target.value = "";
            }}
          />
        </CardContent>
      </Card>
      <Card className="border-border/60 shadow-card">
        <CardContent className="space-y-4 pt-4 sm:pt-5">
          {source ? (
            <div className="space-y-1.5">
              <p className={FIELD_LABEL}>Hooks from</p>
              <div className="flex items-center gap-3 rounded-lg border border-border/60 p-2">
                {source.cover && <img src={source.cover} alt="" className="h-14 w-11 shrink-0 rounded object-cover" />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{source.title || source.caption || "A post"}</span>
                  <span className="block truncate text-xs text-muted-foreground">{metaOf(source)}</span>
                </span>
                <Button size="sm" variant="ghost" onClick={() => update({ source: null })} className={TOUCH}>
                  Remove
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="make-hook-topic" className={FIELD_LABEL}>What it shows</Label>
              <Textarea
                id="make-hook-topic"
                rows={2}
                value={typed.topic}
                maxLength={200}
                placeholder="Like how I log every client call in one place"
                onChange={(e) => setTyped({ ...typed, topic: e.target.value })}
              />
            </div>
          )}
          <div className="space-y-2">
            <p className={FIELD_LABEL}>Hook</p>
            {set && (
              <RadioGroup value={selected === null ? undefined : String(selected)} onValueChange={(v) => setChoice(v === "own" ? "own" : Number(v))} className="gap-1">
                {set.hooks.map((h, i) => (
                  <label key={`${set.set}-${i}`} className={cn("flex min-h-11 cursor-pointer items-start gap-2.5 rounded-lg px-2 py-2 hover:bg-muted/60", selected === i && "bg-primary/5")}>
                    <RadioGroupItem value={String(i)} className="mt-0.5 shrink-0" />
                    <span className="min-w-0 text-sm leading-snug">
                      {h.text}
                      {set.pick === i && <span className="ml-2 whitespace-nowrap rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">Recommended</span>}
                    </span>
                  </label>
                ))}
              </RadioGroup>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" onClick={write} disabled={writing || busy || (!source && topic.trim().length < 3)} className={cn("gap-1.5", TOUCH)}>
                {writing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {writing ? "Writing the hooks..." : set ? "Write 3 more" : "Write 3 hooks"}
              </Button>
              <PriceChip feature="remix-make" left={leftOf("remix-make")} />
            </div>
            {failed && !writing && <p role="alert" className="text-xs text-destructive">{failed.error}</p>}
            <Input
              aria-label="Your own hook"
              value={typed.own}
              maxLength={MAX_HOOK_CHARS}
              placeholder="Or type your own hook"
              onFocus={() => typed.own.trim() && setChoice("own")}
              onChange={(e) => {
                setTyped({ ...typed, own: e.target.value });
                setChoice(e.target.value.trim() ? "own" : null);
              }}
              className={cn(selected === "own" && "border-primary/60")}
            />
          </div>
        </CardContent>
      </Card>
      <Card className="border-border/60 shadow-card">
        <CardContent className="space-y-2 pt-4 sm:pt-5">
          <p className={FIELD_LABEL}>How the hook plays</p>
          <div className="flex flex-wrap gap-1.5">
            {HOOK_PLAYS.map((p) => (
              <FilterChip key={p} active={play === p} onClick={() => setPlay(p)}>
                {PLAY_LABELS[p]}
              </FilterChip>
            ))}
          </div>
          {play === "spoken" && (
            <div className="space-y-1 text-xs text-muted-foreground">
              <p>{SPOKEN_TOO_LONG}</p>
              <p>The person is made by AI.</p>
            </div>
          )}
          {play === "mine" && (
            <div className="space-y-1.5">
              <div className="flex min-w-0 items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => mineInput.current?.click()} className={cn("shrink-0", TOUCH)}>
                  {mine ? "Change clip" : "Pick your hook clip"}
                </Button>
                {mine && <span className="min-w-0 truncate text-sm text-muted-foreground">{mine.name}</span>}
              </div>
              <p className="text-xs text-muted-foreground">An upright clip of you saying it, 2 to 5 seconds.</p>
              {mineError && <p role="alert" className="text-xs text-destructive">{mineError}</p>}
            </div>
          )}
          <input
            ref={mineInput}
            type="file"
            accept="video/*"
            hidden
            onChange={(e) => {
              void onMine(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </CardContent>
      </Card>
    </>
  );

  const result = (
    <div ref={resultRef} className="scroll-mt-16 space-y-3 lg:scroll-mt-0">
      {busy && job ? (
        <Placeholder>
          <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden />
          <span role="status">{stepText(job)}</span>
          {job.state === "joining" && (
            <Button variant="link" onClick={() => navigate(links.edit())} className={TOUCH}>
              Open the editor
            </Button>
          )}
        </Placeholder>
      ) : job?.state === "failed" ? (
        <div role="alert" className="space-y-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">
          <p className="flex items-start gap-2 text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {job.error}
          </p>
          <div className="flex flex-wrap gap-2">
            {/* the ways forward that spend nothing lead; a refusal or the cap gets no Try again */}
            {job.demoGone ? (
              <Button size="sm" onClick={() => demoInput.current?.click()} className={TOUCH}>Pick it again</Button>
            ) : pendingHook() && ask ? (
              <Button size="sm" onClick={() => resumeHookDemo(ask)} className={TOUCH}>Try again at no cost</Button>
            ) : (
              !job.refused && !job.capped && !job.noClip && (
                <Button size="sm" variant="outline" onClick={makeIt} disabled={!!reason} className={TOUCH}>Try again</Button>
              )
            )}
          </div>
        </div>
      ) : job?.state === "done" ? (
        <Placeholder>
          <p className="font-medium text-foreground">Your video is ready.</p>
          <Button onClick={() => navigate(links.edit())} className={TOUCH}>
            Open it in the editor
          </Button>
        </Placeholder>
      ) : (
        <Placeholder>Your result shows here once you make it.</Placeholder>
      )}
    </div>
  );

  const freeWay = job?.state === "failed" && (!!job.demoGone || pendingHook());
  return (
    <FormatShell
      title={def.name}
      blurb={def.blurb}
      options={options}
      result={result}
      footer={{
        ...spend,
        label: "Make the video",
        // the press waits while hooks are written too, and its uses left are read again after
        busyLabel: busy ? "Making..." : "Writing the hooks...",
        busy: busy || writing,
        reason,
        disabled: !!reason,
        secondary: !busy && (job?.state === "done" || freeWay),
        onMake: makeIt,
      }}
    />
  );
}

/** A dashed 9:16 frame: before the first make, while one runs, and once the video is waiting for the editor. */
function Placeholder({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex aspect-[9/16] w-full max-w-[300px] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border px-6 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}
