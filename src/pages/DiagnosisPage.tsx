import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import {
  QUESTIONS,
  SCORED_QUESTIONS,
  scoreDiagnosis,
  nextAction,
  loadDiagnosis,
  saveDiagnosis,
  type DiagnosisRecord,
  type DiagnosisResult,
} from "@/lib/diagnosis";
import {
  Gauge,
  Target,
  ArrowRight,
  ArrowLeft,
  RefreshCw,
  CheckCircle2,
  Clock,
  Sparkles,
} from "lucide-react";

/** Score → semantic colour, shared by the ring and the bars. */
function scoreTint(score: number): { text: string; bar: string; ring: string } {
  if (score < 40)
    return { text: "text-destructive", bar: "bg-destructive", ring: "text-destructive" };
  if (score < 60)
    return { text: "text-warning", bar: "bg-warning", ring: "text-warning" };
  if (score < 80)
    return { text: "text-primary", bar: "bg-primary", ring: "text-primary" };
  return { text: "text-success", bar: "bg-success", ring: "text-success" };
}

function ScoreRing({ score }: { score: number }) {
  const tint = scoreTint(score);
  const r = 52;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - Math.min(100, Math.max(0, score)) / 100);
  return (
    <div className="relative h-32 w-32 shrink-0">
      <svg viewBox="0 0 120 120" className="h-32 w-32 -rotate-90">
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          strokeWidth="10"
          className="stroke-muted"
        />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          className={`${tint.ring} transition-[stroke-dashoffset] duration-700`}
          stroke="currentColor"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`font-serif text-3xl font-semibold leading-none ${tint.text}`}>
          {score}
        </span>
        <span className="mt-0.5 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          / 100
        </span>
      </div>
    </div>
  );
}

function Results({
  result,
  role,
  onRetake,
}: {
  result: DiagnosisResult;
  role?: string;
  onRetake: () => void;
}) {
  const action = nextAction(result);

  return (
    <div className="space-y-6">
      <Card className="border-border/60 shadow-card">
        <CardContent className="flex flex-col items-center gap-5 py-6 sm:flex-row sm:items-center sm:gap-7">
          <ScoreRing score={result.overall} />
          <div className="min-w-0 flex-1 text-center sm:text-left">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Your Content Score
            </p>
            <h1 className="mt-1 font-serif text-2xl font-semibold text-foreground">
              {result.levelLabel}
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {role ? `${role} · ` : ""}
              Based on {SCORED_QUESTIONS.length} questions across{" "}
              {result.areas.length} areas. The lower an area, the more it's
              holding the rest of your content back.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Recommended next action */}
      {action.mission && (
        <Card className="border-primary/30 bg-primary/[0.04] shadow-card">
          <CardContent className="space-y-3 py-5">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Target className="h-4 w-4" />
              </span>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">
                  Start here
                </p>
                <p className="text-sm font-semibold text-foreground">
                  {action.headline}
                </p>
              </div>
            </div>
            <p className="text-sm font-semibold text-foreground">
              Mission: {action.mission.title}
            </p>
            <p className="text-sm text-muted-foreground">
              {action.mission.objective}
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Button
                asChild
                className="gap-2 bg-gradient-primary text-primary-foreground shadow-sm hover:opacity-95"
              >
                <Link to={action.mission.to}>
                  {action.mission.cta} <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3.5 w-3.5" /> ~{action.mission.effortMins} min
              </span>
            </div>
          </CardContent>
        </Card>
      )}
      {action.kind === "maintain" && (
        <Card className="border-success/30 bg-success/[0.05] shadow-card">
          <CardContent className="flex items-start gap-3 py-5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-success/10 text-success">
              <Sparkles className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-semibold text-foreground">
                {action.headline}
              </p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {action.detail}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Per-area breakdown */}
      <div className="space-y-3 rounded-xl border border-border/60 bg-card p-5 shadow-card">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Where you stand
        </p>
        <div className="space-y-3">
          {result.areas.map((a) => {
            const tint = scoreTint(a.score);
            return (
              <div key={a.id} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-foreground">{a.label}</span>
                  <span className={`font-semibold ${tint.text}`}>{a.score}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full ${tint.bar} transition-all duration-700`}
                    style={{ width: `${a.score}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="outline" size="sm" className="gap-1.5" onClick={onRetake}>
          <RefreshCw className="h-3.5 w-3.5" /> Retake the diagnosis
        </Button>
        <Button asChild variant="ghost" size="sm" className="gap-1.5">
          <Link to="/home">
            Back to Home <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </Button>
      </div>
    </div>
  );
}

export default function DiagnosisPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [mode, setMode] = useState<"loading" | "intro" | "quiz" | "results">(
    "loading",
  );
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [step, setStep] = useState(0);
  const [role, setRole] = useState<string | undefined>();

  useEffect(() => {
    document.title = "Content Diagnosis - Content Studio";
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      const id = data.user?.id ?? null;
      setUserId(id);
      const existing = loadDiagnosis(id);
      if (existing && Object.keys(existing.answers).length > 0) {
        setAnswers(existing.answers);
        setRole(existing.role);
        setMode("results");
      } else {
        setMode("intro");
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const result = useMemo(
    () => (mode === "results" ? scoreDiagnosis(answers) : null),
    [mode, answers],
  );

  const question = QUESTIONS[step];
  const progress = Math.round((step / QUESTIONS.length) * 100);

  const finish = (finalAnswers: Record<string, number>, finalRole?: string) => {
    if (userId) {
      const record: DiagnosisRecord = {
        answers: finalAnswers,
        completedAt: new Date().toISOString(),
        role: finalRole,
      };
      saveDiagnosis(userId, record);
    }
    setMode("results");
  };

  const select = (optionIndex: number) => {
    const next = { ...answers, [question.id]: optionIndex };
    let nextRole = role;
    if (question.area === null) {
      nextRole = question.options[optionIndex]?.label;
      setRole(nextRole);
    }
    setAnswers(next);
    if (step < QUESTIONS.length - 1) {
      setStep(step + 1);
    } else {
      finish(next, nextRole);
    }
  };

  const startFresh = () => {
    setAnswers({});
    setRole(undefined);
    setStep(0);
    setMode("quiz");
  };

  if (mode === "loading") {
    return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  }

  if (mode === "results" && result) {
    return (
      <div className="mx-auto max-w-2xl">
        <Results result={result} role={role} onRetake={startFresh} />
      </div>
    );
  }

  if (mode === "intro") {
    return (
      <div className="mx-auto max-w-2xl">
        <Card className="border-border/60 shadow-card">
          <CardContent className="space-y-5 py-8 text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Gauge className="h-7 w-7" />
            </span>
            <div className="space-y-2">
              <h1 className="font-serif text-2xl font-semibold text-foreground">
                What's actually holding your content back?
              </h1>
              <p className="mx-auto max-w-md text-sm text-muted-foreground">
                {QUESTIONS.length} quick questions. We'll score you across ideas,
                storytelling, camera confidence, consistency, strategy,
                conversion and compliance — then hand you the single thing to
                work on next. Takes about two minutes.
              </p>
            </div>
            <Button
              size="lg"
              onClick={startFresh}
              className="gap-2 bg-gradient-primary text-primary-foreground shadow-elegant hover:opacity-95"
            >
              Start the diagnosis <ArrowRight className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Quiz
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Question {step + 1} of {QUESTIONS.length}
          </span>
          <span>{progress}%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-gradient-primary transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <Card className="border-border/60 shadow-card">
        <CardContent className="space-y-4 py-6">
          <div>
            <h2 className="font-serif text-xl font-semibold leading-snug text-foreground">
              {question.prompt}
            </h2>
            {question.help && (
              <p className="mt-1 text-sm text-muted-foreground">{question.help}</p>
            )}
          </div>
          <div className="space-y-2">
            {question.options.map((opt, i) => {
              const active = answers[question.id] === i;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => select(i)}
                  className={`flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left text-sm transition-colors ${
                    active
                      ? "border-primary/50 bg-primary/10 text-foreground"
                      : "border-border/70 bg-card text-foreground hover:border-primary/40 hover:bg-accent/50"
                  }`}
                >
                  <span className="font-medium">{opt.label}</span>
                  {active ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
                  ) : (
                    <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5"
          disabled={step === 0}
          onClick={() => setStep((s) => Math.max(0, s - 1))}
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </Button>
        <span className="text-xs text-muted-foreground">
          Tap an answer to continue
        </span>
      </div>
    </div>
  );
}
