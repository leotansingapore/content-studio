// Answer questions (plan-interview, Leo only): five questions from a fixed bank, one at a time, with one follow-up
// when Jev reads an answer as thin; then every answer in one editable box, which becomes the long piece. Mounted by
// LongPiece, which owns Make 5 posts and the results. Logic: src/lib/interview.ts.

import { useEffect, useRef, useState } from "react";
import { Check, Mic, RotateCcw, Sparkles, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import PriceChip from "@/components/PriceChip";
import { useDictation } from "@/hooks/useDictation";
import { loadAudiences } from "@/lib/audiences";
import { appendDictation } from "@/lib/dictation";
import { loadPositioning } from "@/lib/positioning";
import { MAX_LONG_CHARS } from "@/lib/repurpose";
import { ideaIsThin } from "@/lib/writingJudge";
import {
  FOLLOW_UP,
  MAX_ANSWER_CHARS,
  MIN_WORDS,
  THIN_KIND,
  answerWords,
  fillFrom,
  loadInterview,
  nextStep,
  reviewWords,
  saveInterview,
  startSession,
  transcriptOf,
  type InterviewSession,
  type InterviewStore,
} from "@/lib/interview";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export default function Interview(p: {
  userId: string;
  /** The long piece is being written. */
  busy: boolean;
  /** repurpose-long uses left, and the line under a disabled Make. */
  left: number | null;
  why: string | null;
  /** Posts in the results below. */
  postsBelow: number;
  /** Runs Make 5 posts on the answers; true once the posts are below. */
  onMake: (text: string) => Promise<boolean>;
}) {
  const { userId } = p;
  const [store, setStore] = useState<InterviewStore>(() => loadInterview(userId));
  const [checking, setChecking] = useState(false);
  const checkRef = useRef(0);
  const answerRef = useRef<HTMLTextAreaElement>(null);
  const moved = useRef(false);

  // every change goes to the device as it happens, so a reload reopens the same question with the answer in place
  const patch = (fn: (c: InterviewSession) => Partial<InterviewSession>) =>
    setStore((prev) => {
      if (!prev.current) return prev;
      const next = { ...prev, current: { ...prev.current, ...fn(prev.current) } };
      saveInterview(userId, next);
      return next;
    });
  const setAnswer = (fn: (a: string) => string) =>
    patch((c) => ({ answers: c.answers.map((a, k) => (k === c.step ? fn(a) : a)) }));

  const dictation = useDictation((chunk) => setAnswer((a) => appendDictation(a, chunk, MAX_ANSWER_CHARS)));

  const begin = () => {
    // read from the device, so a second run of this (React's dev double effects) finds the session already there
    const next = startSession(loadInterview(userId), fillFrom(loadPositioning(userId), loadAudiences(userId)[0]), new Date());
    saveInterview(userId, next);
    setStore(next);
  };

  useEffect(() => {
    if (!loadInterview(userId).current) begin();
    // begin reads everything it needs from the device; it runs once per brand
  }, [userId]);

  const cur = store.current;
  const n = cur?.questions.length ?? 0;
  const step = cur?.step ?? 0;

  // the next question's box takes the cursor after Next or Skip, never on arrival
  useEffect(() => {
    if (!moved.current) return;
    moved.current = false;
    answerRef.current?.focus();
  }, [step]);

  if (!cur) return null;

  const go = (to: number) => {
    dictation.stop();
    checkRef.current++;
    setChecking(false);
    moved.current = true;
    patch(() => ({ step: to }));
  };

  const onNext = async () => {
    if (checking) return;
    dictation.stop();
    const i = cur.step;
    const answer = cur.answers[i];
    let next = nextStep(answer, undefined, cur.followed[i]);
    if (next === "check") {
      const token = ++checkRef.current;
      setChecking(true);
      const thin = await ideaIsThin(cur.questions[i], answer, THIN_KIND);
      if (token !== checkRef.current) return;
      setChecking(false);
      next = nextStep(answer, thin, cur.followed[i]);
    }
    if (next === "follow-up") patch((c) => ({ followed: c.followed.map((f, k) => f || k === i) }));
    else go(i + 1);
  };

  const addToAnswer = () => {
    const a = cur.answers[cur.step];
    const grown = a.trim() ? `${a.replace(/\s+$/, "")}\n\n` : "";
    setAnswer(() => grown);
    requestAnimationFrame(() => {
      const el = answerRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(grown.length, grown.length);
    });
  };

  const startOver = () => {
    if (!window.confirm("Clear your answers?")) return;
    dictation.stop();
    checkRef.current++;
    setChecking(false);
    begin();
  };

  const words = answerWords(cur.answers);
  const anyAnswer = cur.answers.some((a) => a.trim());

  // ---- Done ----
  if (step > n) {
    return (
      <div className="flex flex-wrap items-center gap-3" role="status" data-testid="interview-done">
        <p className="flex min-w-0 flex-1 items-center gap-2 text-sm font-medium text-success">
          <Check className="h-4 w-4 shrink-0" /> Done. Your {plural(p.postsBelow || 5, "post is", "posts are")} below.
        </p>
        <Button variant="outline" onClick={begin} className="h-11 gap-1.5 sm:h-10">
          <RotateCcw className="h-4 w-4" /> Start a new interview
        </Button>
      </div>
    );
  }

  // ---- Review ----
  if (step === n) {
    const text = cur.review ?? transcriptOf(cur.questions, cur.answers);
    const have = reviewWords(text);
    const short = have < MIN_WORDS;
    const make = async () => {
      if (short || p.busy || p.left === 0) return;
      const at = { ...store, current: { ...cur, review: text } };
      if (!(await p.onMake(text))) return;
      // saved straight to the device: leaving the page mid-run still finds the interview done
      const done = { ...at, current: { ...at.current, step: n + 1 } };
      saveInterview(userId, done);
      setStore(done);
    };
    return (
      <div className="space-y-3" data-testid="interview-review">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label htmlFor="interview-review" className="text-sm font-semibold">Your answers</Label>
          <Button variant="link" size="sm" onClick={startOver} disabled={p.busy} className="h-auto min-h-11 px-0 text-xs text-muted-foreground sm:min-h-0">
            Start over
          </Button>
        </div>
        <Textarea
          id="interview-review"
          value={text}
          onChange={(e) => patch(() => ({ review: e.target.value }))}
          readOnly={p.busy}
          rows={12}
          maxLength={MAX_LONG_CHARS}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={() => void make()}
            disabled={short || p.busy || p.left === 0}
            className="h-11 gap-1.5 bg-gradient-primary text-primary-foreground hover:opacity-95 sm:h-10"
          >
            <Sparkles className="h-4 w-4" /> Make 5 posts
          </Button>
          {!p.busy && <PriceChip feature="repurpose-long" left={p.left} />}
        </div>
        {short && <p className="text-xs text-muted-foreground">Add about {MIN_WORDS - have} more words so there is enough to write from.</p>}
        {p.why && <p className="text-xs text-destructive">{p.why}</p>}
      </div>
    );
  }

  // ---- A question ----
  const answer = cur.answers[step];
  const followed = cur.followed[step];
  return (
    <div className="space-y-3" data-testid="interview-question">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">
          Question {step + 1} of {n}
        </p>
        <div className="flex items-center gap-1.5" aria-hidden>
          {cur.questions.map((_, k) => (
            <span
              key={k}
              className={`h-2 w-2 rounded-full ${k < step ? "bg-primary" : k === step ? "bg-primary/60 ring-2 ring-primary/30" : "bg-muted-foreground/25"}`}
            />
          ))}
        </div>
      </div>
      <Label htmlFor="interview-answer" className="block font-serif text-lg font-semibold leading-snug text-foreground [overflow-wrap:anywhere]">
        {cur.questions[step]}
      </Label>
      <Textarea
        id="interview-answer"
        ref={answerRef}
        value={answer}
        onChange={(e) => setAnswer(() => e.target.value)}
        readOnly={checking}
        rows={5}
        maxLength={MAX_ANSWER_CHARS}
        placeholder="Say it the way you would to a friend."
      />
      {dictation.listening && (
        <p className="text-xs text-primary [overflow-wrap:anywhere]" aria-live="polite">
          Listening...{dictation.interim && <span className="text-muted-foreground"> "{dictation.interim}"</span>}
        </p>
      )}
      {dictation.error && <p className="text-xs text-destructive">{dictation.error}</p>}
      {followed && (
        <div
          className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3 animate-in fade-in-0 slide-in-from-top-2 motion-reduce:animate-none"
          role="status"
          data-testid="interview-follow-up"
        >
          <p className="text-sm text-foreground">{FOLLOW_UP}</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={addToAnswer} className="h-11 sm:h-9">
              Add to my answer
            </Button>
            <Button size="sm" variant="ghost" onClick={() => go(step + 1)} className="h-11 sm:h-9">
              Move on
            </Button>
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {dictation.supported && (
          <Button type="button" variant="outline" onClick={dictation.toggle} disabled={checking} aria-pressed={dictation.listening} className="h-11 gap-1.5 sm:h-10">
            {dictation.listening ? (
              <>
                <Square className="h-4 w-4" /> Stop
              </>
            ) : (
              <>
                <Mic className="h-4 w-4" /> Speak
              </>
            )}
          </Button>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" onClick={() => go(step + 1)} disabled={checking} className="h-11 sm:h-10">
            Skip
          </Button>
          <Button
            onClick={() => void onNext()}
            disabled={checking}
            className="h-11 min-w-24 bg-gradient-primary text-primary-foreground hover:opacity-95 sm:h-10"
          >
            {checking ? "Reading..." : "Next"}
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <p className="text-xs tabular-nums text-muted-foreground">{plural(words, "word", "words")} so far</p>
        <div className="ml-auto flex items-center gap-3">
          {(anyAnswer || step > 0) && (
            <Button variant="link" size="sm" onClick={startOver} className="h-auto min-h-11 px-0 text-xs text-muted-foreground sm:min-h-0">
              Start over
            </Button>
          )}
          {words >= MIN_WORDS && (
            <Button variant="link" size="sm" onClick={() => go(n)} className="h-auto min-h-11 px-0 text-xs sm:min-h-0">
              Make posts now
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
