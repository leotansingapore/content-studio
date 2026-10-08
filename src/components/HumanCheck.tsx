// "Sounds human?" under a draft in Write: five checks with the one to fix
// first, and the lines Jev flags as AI sentence shapes, for rewriting. The
// measured checks still show when Jev can't answer (outage, daily limit, a
// draft not in English); the judged ones then read "Not checked".

import { useState } from "react";
import { AlertTriangle, Check, Eraser, Fingerprint, Minus, Wand2 } from "lucide-react";
import { ThinkingOrb } from "thinking-orbs";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";
import { composeChecks, judgeHuman, measure, mostlyEnglish, SHAPES, type HumanResult } from "@/lib/humanCheck";
import { textKey } from "@/lib/postScore";

export default function HumanCheck({
  draft,
  samples,
  disabled,
  onClean,
  onRewriteLines,
}: {
  draft: string;
  /** Saved voice posts to compare with; empty when there are none. */
  samples: string[];
  disabled: boolean;
  onClean: () => void;
  onRewriteLines: (lines: string[]) => void;
}) {
  const [result, setResult] = useState<{ key: string; value: HumanResult } | null>(null);
  const [running, setRunning] = useState(false);
  const keyNow = textKey("human", draft);

  const run = async () => {
    if (running) return;
    const text = draft;
    const key = textKey("human", text);
    const measured = measure(text);
    if (!mostlyEnglish(text)) {
      setResult({ key, value: composeChecks(measured, null, "Voice and specifics are checked on English posts only.") });
      return;
    }
    setRunning(true);
    try {
      setResult({ key, value: composeChecks(measured, await judgeHuman(text, samples)) });
    } catch (e) {
      setResult({ key, value: composeChecks(measured, null, (e as Error).message) });
    } finally {
      setRunning(false);
    }
  };

  const button = (label: string) => (
    <Button
      size="sm"
      variant="outline"
      className={`h-11 gap-1.5 sm:h-9 ${running ? "disabled:opacity-100" : ""}`}
      onClick={() => void run()}
      disabled={running || disabled}
    >
      {running ? <ThinkingOrb state="working" size={20} theme="light" aria-hidden /> : <Fingerprint className="h-3.5 w-3.5" />}
      {running ? "Checking..." : label}
    </Button>
  );

  if (!result) {
    return <div className="mt-3 rounded-xl border border-border/60 bg-muted/20 p-3">{button("Does it sound human?")}</div>;
  }

  const r = result.value;
  const stale = result.key !== keyNow;
  const oneTap = r.checks.some((c) => (c.id === "stock" || c.id === "typography") && c.state === "fix");
  return (
    <section aria-label="Sounds human" aria-live="polite" className="mt-3 space-y-2.5 rounded-xl border border-border/60 bg-muted/20 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Fingerprint className="h-4 w-4 text-primary" />
        <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Sounds human</span>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-bold ${
            r.passed === r.counted ? "bg-success/15 text-success" : r.passed >= r.counted - 1 ? "bg-primary/15 text-primary" : "bg-warning/15 text-warning"
          }`}
        >
          {r.passed} of {r.counted} checks
        </span>
        <InfoTip label="About the checks">Variety, stock words and typography are counted. Voice and specifics are judged by Jev.</InfoTip>
      </div>
      {stale && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          This was an earlier version. {button("Check again")}
        </div>
      )}
      {r.skipped && <p className="text-xs text-muted-foreground">{r.skipped}</p>}
      <ul className="space-y-1.5" aria-label="The five checks">
        {r.checks.map((c) => {
          const first = c.id === r.fixFirst;
          return (
            <li key={c.id} className={`text-xs ${first ? "rounded-lg border border-warning/50 bg-warning/10 p-2" : ""}`}>
              <span className="flex items-start gap-1.5">
                {c.state === "pass" ? (
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" aria-label="Passes" />
                ) : c.state === "fix" ? (
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" aria-label="To fix" />
                ) : (
                  <Minus className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label="Not checked" />
                )}
                <span className="min-w-0">
                  <span className="font-semibold">{c.label}:</span> <span className="text-muted-foreground">{c.note}</span>
                  {first && (
                    <span className="mt-0.5 block">
                      <span className="font-semibold text-amber-800 dark:text-amber-300">Fix first.</span> {c.tip}
                    </span>
                  )}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
      {oneTap && (
        <Button size="sm" variant="outline" className="h-11 gap-1.5 sm:h-9" onClick={onClean}>
          <Eraser className="h-3.5 w-3.5" /> Clean AI tells
        </Button>
      )}
      {r.shapes.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold">Lines that sound like AI</p>
          <ul className="space-y-1.5">
            {r.shapes.map((s, i) => (
              <li key={i} className="text-xs">
                <mark className="rounded bg-amber-200/70 px-1 text-foreground dark:bg-amber-500/30">{s.text}</mark>
                <span className="mt-0.5 block text-muted-foreground">
                  <span className="font-semibold text-foreground">{SHAPES[s.shape].label}.</span> {SHAPES[s.shape].tip}
                </span>
              </li>
            ))}
          </ul>
          <Button size="sm" variant="outline" className="h-11 gap-1.5 sm:h-9" disabled={disabled} onClick={() => onRewriteLines(r.shapes.map((s) => s.text))}>
            <Wand2 className="h-3.5 w-3.5" /> Rewrite {r.shapes.length === 1 ? "this line" : "these lines"}
          </Button>
        </div>
      )}
    </section>
  );
}
