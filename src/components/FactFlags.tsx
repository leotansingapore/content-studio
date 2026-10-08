// "Check this before you post": the sentences in a post that state a checkable
// fact about CPF, SRS, HDB, MediShield Life, insurance rules, schemes, rates or
// caps (Jev, writing-judge mode "facts"), each line highlighted. It flags only:
// nothing is rewritten or blocked. Used in Write, on Clone a reel's version and
// on each post from one long piece.

import { useEffect, useState } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { ThinkingOrb } from "thinking-orbs";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";
import { textKey } from "@/lib/postScore";
import { mostlyEnglish } from "@/lib/humanCheck";
import { factLines } from "@/lib/writingJudge";

type Result = { lines: string[] } | { skipped: string; retry: boolean };
// Checked texts for this visit, so a card shown again is not checked twice.
const checked = new Map<string, Result>();

export default function FactFlags({ text, live = true }: {
  text: string;
  /** Check every new text on its own (a finished post). Off in Write: the first text is checked, later edits get Check again. */
  live?: boolean;
}) {
  const key = textKey("facts", text);
  const [shown, setShown] = useState<{ key: string; result: Result } | null>(() => (checked.has(key) ? { key, result: checked.get(key)! } : null));
  const [running, setRunning] = useState(false);

  const run = async (t: string) => {
    const k = textKey("facts", t);
    if (checked.has(k)) return setShown({ key: k, result: checked.get(k)! });
    if (!mostlyEnglish(t)) return setShown({ key: k, result: { skipped: "Facts not checked: English posts only.", retry: false } });
    setRunning(true);
    try {
      const result = { lines: await factLines(t) };
      checked.set(k, result);
      setShown({ key: k, result });
    } catch (e) {
      setShown({ key: k, result: { skipped: (e as Error).message, retry: true } });
    } finally {
      setRunning(false);
    }
  };

  useEffect(() => {
    if (!text.trim() || running || shown?.key === key) return;
    if (checked.has(key)) setShown({ key, result: checked.get(key)! });
    else if (live || shown === null) void run(text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (running)
    return (
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground" role="status">
        <ThinkingOrb state="working" size={20} theme="light" aria-hidden /> Checking stated facts...
      </p>
    );
  if (!shown) return null;
  const stale = shown.key !== key;
  const again = (
    <Button size="sm" variant="ghost" className="h-11 gap-1.5 px-2 text-xs sm:h-8" onClick={() => void run(text)}>
      <RotateCcw className="h-3.5 w-3.5" /> Check again
    </Button>
  );
  if ("skipped" in shown.result)
    return (
      <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
        {shown.result.skipped} {(shown.result.retry || stale) && again}
      </div>
    );
  // after an edit, keep flagging the lines that are still in the post
  const lines = stale ? shown.result.lines.filter((l) => text.includes(l)) : shown.result.lines;
  if (!lines.length)
    return (
      <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
        {stale ? "Edited since the facts check." : "No stated facts to check."} {stale && again}
      </div>
    );
  return (
    <section aria-label="Check this before you post" className="space-y-1.5 rounded-xl border border-warning/50 bg-warning/5 p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <AlertTriangle className="h-4 w-4 text-warning" aria-hidden />
        <p className="text-sm font-semibold">Check this before you post</p>
        <InfoTip label="About the facts check">Lines that state a CPF, insurance or scheme fact. Check each against the official source.</InfoTip>
        {stale && <span className="ml-auto">{again}</span>}
      </div>
      <ul className="space-y-1">
        {lines.map((l, i) => (
          <li key={i} className="text-xs leading-relaxed">
            <mark className="rounded bg-amber-200/70 px-1 text-foreground [overflow-wrap:anywhere] dark:bg-amber-500/30">{l}</mark>
          </li>
        ))}
      </ul>
    </section>
  );
}
