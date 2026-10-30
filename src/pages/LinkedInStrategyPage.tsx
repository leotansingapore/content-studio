// LinkedIn strategy (/linkedin, Strategy): ten questions in four steps, then the linkedin-strategy function writes a
// three-month plan: who the posts are for, the top, middle and bottom of funnel split, 3 or 4 buckets per stage with
// post angles that open Write, and the rules, cadence and measures. Answers save as they're typed (src/lib/linkedinStrategy.ts).
// On for every sign-in (Leo, 30 Oct).
//
// URL (docs/deep-links.md): step=1|2|3|4|strategy replaces; strategy is the default once one is written, else 1.

import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, Linkedin, Loader2, PenLine, RotateCcw, Sparkles } from "lucide-react";
import PriceChip from "@/components/PriceChip";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useUsesLeft } from "@/lib/aiUsage";
import {
  MAX_ANSWER,
  MAX_VOICE,
  NEED_FIRST,
  REQUIRED,
  STAGES,
  STAGE_LABEL,
  STEPS,
  WRITE_FAILED,
  loadStrategy,
  requestStrategy,
  saveStrategy,
  writeLink,
  type AnswerKey,
  type Answers,
  type SavedStrategy,
  type Strategy,
} from "@/lib/linkedinStrategy";
import { useUrlState } from "@/lib/urlState";
import { useSignedInUser } from "@/lib/useLeoOnly";
import NotFoundPage from "@/pages/NotFoundPage";

const TOUCH = "[@media(pointer:coarse)]:min-h-11";
type View = "1" | "2" | "3" | "4" | "strategy";
const VIEWS: View[] = ["1", "2", "3", "4", "strategy"];
const words = (t: string) => t.split(/\s+/).filter(Boolean).length;
/** The first two answers have at least three words each, as the server checks. */
export const canWrite = (a: Answers) => REQUIRED.every((k) => words(a[k]) >= 3);

export default function LinkedInStrategyPage() {
  const user = useSignedInUser();
  if (user === undefined) return <div className="min-h-[40vh]" aria-busy="true" />;
  if (!user) return <NotFoundPage notOnAccount />;
  return <StrategyPlanner userId={user.id} />;
}

function StrategyPlanner({ userId }: { userId: string }) {
  const [saved, setSaved] = useState<SavedStrategy>(() => loadStrategy(userId));
  const [view, setView] = useUrlState<View>("step", saved.strategy ? "strategy" : "1", { allowed: VIEWS });
  const [run, setRun] = useState<{ state: "working" } | { state: "failed"; error: string } | null>(null);
  const working = run?.state === "working";
  const usesLeft = useUsesLeft(working);
  const keep = (next: SavedStrategy) => {
    setSaved(next);
    saveStrategy(userId, next);
  };
  const answer = (k: AnswerKey, v: string) => keep({ ...saved, answers: { ...saved.answers, [k]: v } });

  const write = async () => {
    if (working || !canWrite(saved.answers)) return;
    setRun({ state: "working" });
    try {
      const { strategy } = await requestStrategy(userId, saved.answers);
      keep({ ...saved, strategy, writtenAt: new Date().toISOString() });
      setRun(null);
      setView("strategy");
    } catch (e) {
      setRun({ state: "failed", error: e instanceof Error && e.message ? e.message : WRITE_FAILED });
    }
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="flex items-center gap-2 font-serif text-2xl font-semibold leading-tight tracking-tight text-foreground sm:text-3xl">
          <Linkedin className="h-6 w-6 shrink-0 text-primary" aria-hidden /> LinkedIn strategy
        </h1>
      </header>
      {view === "strategy" && saved.strategy ? (
        <StrategyView strategy={saved.strategy} onEdit={() => setView("1")} />
      ) : (
        <Interview
          step={view === "strategy" ? 0 : Number(view) - 1}
          answers={saved.answers}
          onAnswer={answer}
          onStep={(i) => setView(String(i + 1) as View)}
          onWrite={write}
          working={working}
          error={run?.state === "failed" ? run.error : null}
          left={usesLeft("linkedin-strategy")}
          hasStrategy={!!saved.strategy}
          onShow={() => setView("strategy")}
        />
      )}
    </div>
  );
}

function Interview(p: {
  step: number;
  answers: Answers;
  onAnswer: (k: AnswerKey, v: string) => void;
  onStep: (i: number) => void;
  onWrite: () => void;
  working: boolean;
  error: string | null;
  left: number | null;
  hasStrategy: boolean;
  onShow: () => void;
}) {
  const step = STEPS[p.step];
  const last = p.step === STEPS.length - 1;
  const ready = canWrite(p.answers);
  // a new step starts at its first question
  const top = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (p.step > 0) top.current?.scrollIntoView?.({ block: "start" });
  }, [p.step]);
  return (
    <Card ref={top} className="border-border/60 shadow-card">
      <CardHeader className="space-y-3">
        <div aria-hidden className="flex gap-1.5">
          {STEPS.map((s, i) => (
            <span key={s.id} className={`h-1.5 flex-1 rounded-full ${i <= p.step ? "bg-primary" : "bg-muted"}`} />
          ))}
        </div>
        <p className="text-xs font-medium text-muted-foreground">Step {p.step + 1} of {STEPS.length}</p>
        <CardTitle className="font-serif text-xl">{step.title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {step.questions.map((q) => (
          <div key={q.key} className="space-y-1.5">
            <Label htmlFor={`li-${q.key}`}>{q.label}</Label>
            <Textarea
              id={`li-${q.key}`}
              rows={q.key === "voice" ? 6 : 3}
              maxLength={q.key === "voice" ? MAX_VOICE : MAX_ANSWER}
              value={p.answers[q.key]}
              placeholder={q.placeholder}
              disabled={p.working}
              onChange={(e) => p.onAnswer(q.key, e.target.value)}
            />
          </div>
        ))}
        {p.error && (
          <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {p.error} Your answers are saved.
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {p.step > 0 && (
            <Button variant="ghost" onClick={() => p.onStep(p.step - 1)} disabled={p.working} className={`gap-1.5 ${TOUCH}`}>
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
          )}
          {last ? (
            <>
              <Button onClick={p.onWrite} disabled={!ready || p.working || p.left === 0} className={`gap-1.5 ${TOUCH}`}>
                {p.working ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {p.working ? "Writing your strategy..." : "Write my strategy"}
              </Button>
              <PriceChip feature="linkedin-strategy" left={p.left} />
            </>
          ) : (
            <Button onClick={() => p.onStep(p.step + 1)} className={`gap-1.5 ${TOUCH}`}>
              Next <ArrowRight className="h-4 w-4" />
            </Button>
          )}
          {p.hasStrategy && !p.working && (
            <Button variant="ghost" onClick={p.onShow} className={`ml-auto text-muted-foreground ${TOUCH}`}>
              See your strategy
            </Button>
          )}
        </div>
        {last && !ready && <p className="text-xs text-muted-foreground">{NEED_FIRST}</p>}
      </CardContent>
    </Card>
  );
}

function List({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <section className="space-y-1.5">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
        {items.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </section>
  );
}

function StrategyView({ strategy: s, onEdit }: { strategy: Strategy; onEdit: () => void }) {
  const first = s.top[0]?.angles[0];
  return (
    <div className="space-y-6">
      <Card className="border-border/60 shadow-card">
        <CardContent className="space-y-3 pt-5">
          <p className="text-sm text-foreground">
            <span className="font-semibold">For: </span>
            {s.icp}
          </p>
          <p className="text-sm text-foreground">
            <span className="font-semibold">Goal: </span>
            {s.outcome}
          </p>
          <p className="text-sm text-foreground">
            <span className="font-semibold">Mix: </span>
            {STAGES.map((st) => `${STAGE_LABEL[st].replace(" of funnel", "")} ${s.split[st]}%`).join(", ")}. <span className="text-muted-foreground">{s.splitWhy}</span>
          </p>
          {s.cadence && (
            <p className="text-sm text-foreground">
              <span className="font-semibold">Cadence: </span>
              {s.cadence}
            </p>
          )}
          {first && (
            <Button asChild className={`gap-1.5 ${TOUCH}`}>
              <Link to={writeLink("top", first)}>
                <PenLine className="h-4 w-4" /> Write your first post
              </Link>
            </Button>
          )}
        </CardContent>
      </Card>
      {STAGES.map((st) => (
        <section key={st} aria-label={STAGE_LABEL[st]} className="space-y-3">
          <h2 className="font-serif text-lg font-semibold text-foreground">
            {STAGE_LABEL[st]} <span className="text-sm font-normal text-muted-foreground">{s.split[st]}% of posts</span>
          </h2>
          <div className="grid gap-3 md:grid-cols-2">
            {s[st].map((b) => (
              <Card key={b.name} className="border-border/60">
                <CardContent className="space-y-2 pt-4">
                  <p className="font-semibold text-foreground">{b.name}</p>
                  <p className="text-xs text-muted-foreground">
                    For {b.reader}. {b.why} Format: {b.format}.
                  </p>
                  {b.proof && <p className="text-xs text-muted-foreground">Proof: {b.proof}</p>}
                  <ul className="space-y-1.5">
                    {b.angles.map((a) => (
                      <li key={a} className="flex items-start justify-between gap-2 text-sm text-foreground">
                        <span>{a}</span>
                        <Link to={writeLink(st, a)} className={`shrink-0 text-xs font-medium text-primary hover:underline ${TOUCH} inline-flex items-center`}>
                          Write this
                        </Link>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      ))}
      <Card className="border-border/60">
        <CardContent className="grid gap-4 pt-5 md:grid-cols-2">
          <List title="How your posts read" items={s.principles} />
          <List title="Signs it's working" items={s.measures} />
          <List title="What not to write" items={s.avoid} />
          <List title="What it still needs from you" items={s.questions} />
        </CardContent>
      </Card>
      <Button variant="outline" onClick={onEdit} className={`gap-1.5 ${TOUCH}`}>
        <RotateCcw className="h-4 w-4" /> Change your answers
      </Button>
    </div>
  );
}
