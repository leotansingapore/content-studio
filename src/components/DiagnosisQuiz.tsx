import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { QUESTIONS, type DiagnosisRecord } from "@/lib/diagnosis";
import { Gauge, ArrowRight, ArrowLeft, CheckCircle2 } from "lucide-react";

/**
 * The Content Diagnosis intake — an intro then a one-question-at-a-time stepper.
 * Collects answers only; the parent decides what to do with the record (persist,
 * score, navigate). Used as the Coach's first-run diagnosis.
 */
export default function DiagnosisQuiz({
  onComplete,
  title = "First, a quick diagnosis",
  intro = "So the Coach knows exactly where to focus. 14 quick questions across ideas, storytelling, camera confidence, consistency, strategy, conversion and compliance — about two minutes.",
}: {
  onComplete: (record: DiagnosisRecord) => void;
  title?: string;
  intro?: string;
}) {
  const [started, setStarted] = useState(false);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [step, setStep] = useState(0);
  const [role, setRole] = useState<string | undefined>();

  const question = QUESTIONS[step];
  const progress = Math.round((step / QUESTIONS.length) * 100);

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
      onComplete({
        answers: next,
        completedAt: new Date().toISOString(),
        role: nextRole,
      });
    }
  };

  if (!started) {
    return (
      <Card className="border-border/60 shadow-card">
        <CardContent className="space-y-5 py-8 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Gauge className="h-7 w-7" />
          </span>
          <div className="space-y-2">
            <h2 className="font-serif text-2xl font-semibold text-foreground">{title}</h2>
            <p className="mx-auto max-w-md text-sm text-muted-foreground">{intro}</p>
          </div>
          <Button
            size="lg"
            onClick={() => setStarted(true)}
            className="gap-2 bg-gradient-primary text-primary-foreground shadow-elegant hover:opacity-95"
          >
            Start the diagnosis <ArrowRight className="h-4 w-4" />
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
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
        <span className="text-xs text-muted-foreground">Tap an answer to continue</span>
      </div>
    </div>
  );
}
