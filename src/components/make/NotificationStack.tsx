// /make/notification-stack: a client's worries pop up one by one as phone notification cards, then one big word
// (src/lib/notifyStack.ts). The adviser types 2 to 6 lines, the word and the cards' label; no AI writes them. The
// background is a stock clip Jev picks or the adviser's own video, as on /make/wall-of-text. The run is
// src/lib/notifyJob.ts (outside React, so leaving the page keeps it going); the video opens in the editor (/edit),
// which this page pushes once the clip is being put together.
//
// URL (docs/deep-links.md): bg=mine replace. Device hint: cs-make-notify (the typed lines, word and label).

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Loader2, Plus, X } from "lucide-react";
import FormatShell from "@/components/make/FormatShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FilterChip } from "@/components/ui/filter-chip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatBySlug } from "@/data/formats";
import { links } from "@/lib/links";
import { notifyBusy, notifyJob, onNotifyJob, startNotify, type NotifyAsk, type NotifyJob } from "@/lib/notifyJob";
import { LABEL_MAX, LINE_MAX, STACK_MAX, STACK_MIN, WORD_MAX, stackLines, stackTimes } from "@/lib/notifyStack";
import { useUrlState, useUrlUpdate } from "@/lib/urlState";
import { loadProjects } from "@/lib/videoProjects";
import type { RemixSource } from "@/lib/remixSource";
import type { WallBg } from "@/lib/wallJob";

const KEY = "cs-make-notify";
const FIELD_LABEL = "text-xs font-semibold text-muted-foreground";
const TOUCH = "[@media(pointer:coarse)]:min-h-11";
const EXAMPLES = ["What if I get retrenched?", "Who pays if I end up in hospital?", "Am I saving enough for the kids?", "Will my CPF last?", "What if something happens to me?", "Is my family covered?"];

type Typed = { lines: string[]; word: string; label: string };
const START: Typed = { lines: ["", "", ""], word: "", label: "Brain" };

/** The lines, word and label typed here, kept on this device so leaving the page never loses them. */
function useTyped(): [Typed, (t: Typed) => void] {
  const [typed, setTyped] = useState<Typed>(() => {
    try {
      const t = JSON.parse(localStorage.getItem(KEY) ?? "null");
      const lines = Array.isArray(t?.lines) ? t.lines.filter((l: unknown): l is string => typeof l === "string").slice(0, STACK_MAX) : [];
      return {
        lines: lines.length >= STACK_MIN ? lines : START.lines,
        word: typeof t?.word === "string" ? t.word : "",
        label: typeof t?.label === "string" ? t.label : START.label,
      };
    } catch {
      return START;
    }
  });
  const save = (t: Typed) => {
    setTyped(t);
    try {
      localStorage.setItem(KEY, JSON.stringify(t));
    } catch {
      // the fields still hold it for this visit
    }
  };
  return [typed, save];
}

function useJob(): NotifyJob | null {
  const [job, setJob] = useState(notifyJob);
  useEffect(() => onNotifyJob(setJob), []);
  return job;
}

export default function NotificationStack({ userId }: { userId: string; source: RemixSource | null }) {
  const def = formatBySlug("notification-stack")!;
  const navigate = useNavigate();
  const update = useUrlUpdate();
  const job = useJob();
  const busy = !!job && notifyBusy();
  const [bg] = useUrlState<WallBg>("bg", "stock", { allowed: ["stock", "mine"] });
  const [typed, setTyped] = useTyped();
  const [file, setFile] = useState<File | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  // a file picked from the failure's "Pick my video" makes it at once; one picked in the setup waits for Make it
  const makeOnPick = useRef(false);
  const resultRef = useRef<HTMLDivElement>(null);
  // the step already on screen when the page opened is not acted on: only a run's later steps open the editor
  const seen = useRef<string | null>(job ? `${job.id}:${job.state}` : null);
  const toResult = () => {
    if (!window.matchMedia("(min-width: 1024px)").matches) resultRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  };

  const lines = stackLines(typed.lines);
  const seconds = stackTimes(Math.max(STACK_MIN, lines.length)).total;
  const ask: NotifyAsk = { lines: typed.lines, word: typed.word, label: typed.label, bg, file: bg === "mine" ? file : null };
  const reason = whyNot(ask);
  const made = useMemo(
    () => (job?.state === "done" ? loadProjects(userId).find((p) => p.settings?.wall && p.caption === job.extra?.caption)?.id : undefined),
    [job, userId],
  );

  const makeIt = (over: Partial<NotifyAsk> = {}) => {
    const next = { ...ask, ...over };
    if (notifyBusy() || whyNot(next)) return;
    void startNotify(next);
    toResult();
  };

  useEffect(() => {
    if (!job) return;
    const step = `${job.id}:${job.state}`;
    if (seen.current === step) return;
    seen.current = step;
    // the editor shows the join's progress and opens the video when it is done
    if (job.state === "joining") navigate(links.edit());
    if (job.state === "failed") toResult();
  }, [job, navigate]);

  const setLine = (i: number, v: string) => setTyped({ ...typed, lines: typed.lines.map((l, j) => (j === i ? v : l)) });
  const pickBg = (v: WallBg) => update({ bg: v === "stock" ? null : v });
  const chooseFile = (make: boolean) => {
    makeOnPick.current = make;
    fileInput.current?.click();
  };
  const onFile = (f: File | undefined) => {
    if (!f) return;
    setFile(f);
    if (bg !== "mine") pickBg("mine");
    if (makeOnPick.current) makeIt({ bg: "mine", file: f });
  };

  const options = (
    <>
      <Card className="border-border/60 shadow-card">
        <CardContent className="space-y-4 pt-4 sm:pt-5">
          <div className="space-y-2">
            <p className={FIELD_LABEL}>Their worries, one per card</p>
            {typed.lines.map((l, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <Input value={l} maxLength={LINE_MAX} placeholder={EXAMPLES[i]} aria-label={`Card ${i + 1}`} onChange={(e) => setLine(i, e.target.value)} />
                {typed.lines.length > STACK_MIN && (
                  <Button size="icon" variant="ghost" aria-label={`Remove card ${i + 1}`} onClick={() => setTyped({ ...typed, lines: typed.lines.filter((_, j) => j !== i) })}
                    className={`shrink-0 text-muted-foreground ${TOUCH}`}>
                    <X className="h-4 w-4" aria-hidden />
                  </Button>
                )}
              </div>
            ))}
            <div className="flex flex-wrap items-center gap-2">
              {typed.lines.length < STACK_MAX && (
                <Button size="sm" variant="outline" onClick={() => setTyped({ ...typed, lines: [...typed.lines, ""] })} className={`gap-1 ${TOUCH}`}>
                  <Plus className="h-3.5 w-3.5" aria-hidden /> Add a card
                </Button>
              )}
              {lines.length >= STACK_MIN && <p className="text-xs text-muted-foreground" aria-live="polite">{lines.length} cards, a {seconds} s video</p>}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="make-notify-word" className={FIELD_LABEL}>Closing word</Label>
              <Input id="make-notify-word" value={typed.word} maxLength={WORD_MAX} placeholder="Covered." onChange={(e) => setTyped({ ...typed, word: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="make-notify-label" className={FIELD_LABEL}>Label on each card</Label>
              <Input id="make-notify-label" value={typed.label} maxLength={LABEL_MAX} placeholder="Brain" onChange={(e) => setTyped({ ...typed, label: e.target.value })} />
            </div>
          </div>
        </CardContent>
      </Card>
      <Card className="border-border/60 shadow-card">
        <CardContent className="space-y-3 pt-4 sm:pt-5">
          <div className="space-y-1.5">
            <p className={FIELD_LABEL}>Background</p>
            <div className="flex flex-wrap gap-1.5">
              <FilterChip active={bg === "stock"} onClick={() => pickBg("stock")}>Stock clip</FilterChip>
              <FilterChip active={bg === "mine"} onClick={() => pickBg("mine")}>My video</FilterChip>
            </div>
            {bg === "mine" && <p className="text-xs text-muted-foreground">Only the first {seconds} seconds are used.</p>}
          </div>
          {bg === "mine" && (
            <div className="flex min-w-0 items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => chooseFile(false)} className={`shrink-0 ${TOUCH}`}>
                {file ? "Change video" : "Pick a video"}
              </Button>
              {file && <span className="min-w-0 truncate text-sm text-muted-foreground">{file.name}</span>}
            </div>
          )}
          <input
            ref={fileInput}
            type="file"
            accept="video/*"
            hidden
            onChange={(e) => {
              onFile(e.target.files?.[0]);
              // the same file picked again still fires
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
          <span role="status">{job.state === "joining" ? "Putting it together..." : job.ask.file ? "Reading your video..." : "Finding a clip..."}</span>
          {job.state === "joining" && (
            <Button variant="link" onClick={() => navigate(links.edit())} className={TOUCH}>Open the editor</Button>
          )}
        </Placeholder>
      ) : job?.state === "failed" ? (
        <div role="alert" className="space-y-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">
          <p className="flex items-start gap-2 text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {job.error}
          </p>
          {/* Make it below tries again; with no stock clip, the adviser's own video leads */}
          {job.noClip && <Button size="sm" onClick={() => chooseFile(true)} className={TOUCH}>Pick my video</Button>}
        </div>
      ) : job?.state === "done" ? (
        <Placeholder>
          <p className="font-medium text-foreground">Your video is ready.</p>
          <Button onClick={() => navigate(links.edit(made ? { p: made } : {}))} className={TOUCH}>Open it in the editor</Button>
        </Placeholder>
      ) : (
        <Placeholder>Your result shows here once you make it.</Placeholder>
      )}
    </div>
  );

  return (
    <FormatShell
      title={def.name}
      blurb={def.blurb}
      options={options}
      result={result}
      footer={{
        cap: bg === "stock" ? def.cap : null,
        label: "Make it",
        busyLabel: "Making...",
        busy,
        reason,
        disabled: !!reason,
        secondary: !busy && (job?.state === "done" || (job?.state === "failed" && !!job.noClip)),
        onMake: () => makeIt(),
      }}
    />
  );
}

/** Why Make it is off for this setup, or null. */
function whyNot(a: NotifyAsk): string | null {
  if (stackLines(a.lines).length < STACK_MIN) return `Type at least ${STACK_MIN} worries first.`;
  if (!a.word.trim()) return "Type the closing word first.";
  return a.bg === "mine" && !a.file ? "Pick your video first." : null;
}

/** A dashed 9:16 frame: before the first make, while one runs, and once the video is ready. */
function Placeholder({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex aspect-[9/16] w-full max-w-[300px] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border px-6 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}
