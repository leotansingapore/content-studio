// The close of Write: what a finished draft opens with, how long it is against
// the platform's limit and when to post it, in one place under the draft, with
// the copy that posts it. Anything still in the way (a blank, too many
// characters) is said here too.

import { AlertTriangle, Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function PostReceipt({
  formula,
  chars,
  maxChars,
  platformName,
  when,
  blanks,
  copyLabel,
  onCopy,
  copyBlocked,
}: {
  /** The hook formula's name, when the hook was written with one. */
  formula?: string;
  chars: number;
  maxChars: number;
  platformName: string;
  /** When to post it, ready to read ("Tue 14 Oct, 8:30 am"); null when there is nothing to say. */
  when: string | null;
  blanks: string[];
  copyLabel: string;
  onCopy: () => void;
  /** Why Copy is locked (a team approval rule), or null. */
  copyBlocked: string | null;
}) {
  const over = chars > maxChars;
  const ready = !over && blanks.length === 0;
  return (
    <section
      aria-label="Ready to post"
      className={`mt-4 space-y-2.5 rounded-xl border p-3 ${ready ? "border-success/40 bg-success/5" : "border-warning/50 bg-warning/5"}`}
    >
      <p className="flex items-center gap-1.5 text-sm font-semibold">
        {ready ? <Check className="h-4 w-4 text-success" /> : <AlertTriangle className="h-4 w-4 text-warning" />}
        {ready ? "Ready to post" : "Nearly ready"}
      </p>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
        {formula && (
          <>
            <dt className="text-muted-foreground">Hook</dt>
            <dd className="font-medium">{formula}</dd>
          </>
        )}
        <dt className="text-muted-foreground">Length</dt>
        <dd className={over ? "font-medium text-red-700 dark:text-red-300" : "font-medium"}>
          {chars.toLocaleString("en-US")} of {platformName}'s {maxChars.toLocaleString("en-US")} characters
        </dd>
        {when && (
          <>
            <dt className="text-muted-foreground">Post at</dt>
            <dd className="font-medium">{when}</dd>
          </>
        )}
      </dl>
      {blanks.length > 0 && (
        <p className="flex items-start gap-1.5 text-xs font-medium text-amber-800 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Fill {blanks.join(", ")} first.
        </p>
      )}
      <Button size="sm" onClick={onCopy} disabled={copyBlocked !== null} title={copyBlocked ?? undefined} className="h-11 gap-1.5 sm:h-9">
        <Copy className="h-3.5 w-3.5" /> {copyLabel}
      </Button>
    </section>
  );
}
