// Compliance chips under a post: one per scanCompliance flag, red for an error and amber for a warning, each
// dismissable. Moved out of Write (GeneratePage.tsx) unchanged, so every format page shows the same chips.

import { AlertTriangle, X as XIcon } from "lucide-react";
import type { ComplianceFlag } from "@/lib/compliance";

export default function ComplianceChips({
  flags,
  onDismiss,
}: {
  flags: ComplianceFlag[];
  onDismiss: (id: string) => void;
}) {
  if (flags.length === 0) return null;
  return (
    <div className="mb-3 flex flex-wrap gap-2">
      {flags.map((flag) => {
        const isError = flag.severity === "error";
        return (
          <div
            key={flag.id}
            className={`flex items-start gap-2 rounded-lg border px-2.5 py-1.5 text-[11px] ${
              isError
                ? "border-destructive/50 bg-destructive/10 text-red-700 dark:text-red-300"
                : "border-amber-500/50 bg-amber-500/10 text-amber-900 dark:text-amber-200"
            }`}
          >
            <AlertTriangle
              className={`mt-0.5 h-3 w-3 shrink-0 ${
                isError ? "text-destructive" : "text-amber-600"
              }`}
            />
            <div className="space-y-0.5">
              <div className="font-semibold uppercase tracking-[0.14em]">
                {isError ? "Compliance error" : "Compliance warning"}
                <span className="ml-1.5 rounded bg-background/60 px-1 py-0.5 font-mono text-[10px] normal-case tracking-normal">
                  {flag.match}
                </span>
              </div>
              <div className="text-[11px] leading-snug">{flag.message}</div>
            </div>
            <button
              type="button"
              onClick={() => onDismiss(flag.id)}
              className="-my-1 -mr-1.5 ml-auto flex h-7 w-7 shrink-0 items-center justify-center rounded hover:bg-background/40"
              aria-label="Dismiss flag"
            >
              <XIcon className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
