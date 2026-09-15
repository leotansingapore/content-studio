import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  SCORED_QUESTIONS,
  nextAction,
  type DiagnosisResult,
} from "@/lib/diagnosis";
import { Target, ArrowRight, RefreshCw, Clock, Sparkles } from "lucide-react";

/** Score → semantic colour, shared by the ring and the bars. */
export function scoreTint(score: number): { text: string; bar: string; ring: string } {
  if (score < 40)
    return { text: "text-destructive", bar: "bg-destructive", ring: "text-destructive" };
  if (score < 60)
    return { text: "text-warning", bar: "bg-warning", ring: "text-warning" };
  if (score < 80)
    return { text: "text-primary", bar: "bg-primary", ring: "text-primary" };
  return { text: "text-success", bar: "bg-success", ring: "text-success" };
}

export function ScoreRing({ score }: { score: number }) {
  const tint = scoreTint(score);
  const r = 52;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - Math.min(100, Math.max(0, score)) / 100);
  return (
    <div className="relative h-32 w-32 shrink-0">
      <svg viewBox="0 0 120 120" className="h-32 w-32 -rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" strokeWidth="10" className="stroke-muted" />
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

/**
 * The Content Score readout: ring, per-area bars, and the single recommended
 * next mission. Reused as the Coach's diagnosis section and anywhere a score
 * needs showing. Pass onRetake to offer a re-run.
 */
export default function DiagnosisSummary({
  result,
  role,
  onRetake,
}: {
  result: DiagnosisResult;
  role?: string;
  onRetake?: () => void;
}) {
  const action = nextAction(result);

  return (
    <div className="space-y-6">
      <Card className="border-border/60 shadow-card">
        <CardContent className="flex flex-col items-center gap-5 py-6 sm:flex-row sm:gap-7">
          <ScoreRing score={result.overall} />
          <div className="min-w-0 flex-1 text-center sm:text-left">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Your Content Score
            </p>
            <h2 className="mt-1 font-serif text-2xl font-semibold text-foreground">
              {result.levelLabel}
            </h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {role ? `${role} · ` : ""}
              Based on {SCORED_QUESTIONS.length} questions across {result.areas.length}{" "}
              areas. The lower an area, the more it's holding the rest back.
            </p>
          </div>
        </CardContent>
      </Card>

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
                <p className="text-sm font-semibold text-foreground">{action.headline}</p>
              </div>
            </div>
            <p className="text-sm font-semibold text-foreground">
              Mission: {action.mission.title}
            </p>
            <p className="text-sm text-muted-foreground">{action.mission.objective}</p>
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
              <p className="text-sm font-semibold text-foreground">{action.headline}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">{action.detail}</p>
            </div>
          </CardContent>
        </Card>
      )}

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

      {onRetake && (
        <Button variant="outline" size="sm" className="gap-1.5" onClick={onRetake}>
          <RefreshCw className="h-3.5 w-3.5" /> Retake the diagnosis
        </Button>
      )}
    </div>
  );
}
