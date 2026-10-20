import { AlertTriangle, Loader2 } from "lucide-react";
import { FIT_COPY, fitReasonLine, type FitResult } from "@/lib/remixFit";

/**
 * One line under "What Remix does" (docs/north-star/items/remix-fit-check.md): checking, good, or the one reason a
 * weak or poor fit gives, plus the text-heavy line with a switch to a carousel when a video is picked. Unknown shows
 * nothing, as if there were no check.
 */
export default function FitLine(p: { fit: FitResult | "checking"; brand: string; video: boolean; disabled: boolean; onCarousel(): void }) {
  if (p.fit === "checking") {
    return (
      <p role="status" className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> {FIT_COPY.checking}
      </p>
    );
  }
  const warning = fitReasonLine(p.fit);
  const textHeavy = p.video && p.fit.reasons.includes("textHeavy");
  if (p.fit.verdict === "unknown" || (!warning && p.fit.verdict !== "good" && !textHeavy)) return null;
  const amber = "flex items-start gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-300";
  return (
    <div className="space-y-1.5">
      {p.fit.verdict === "good" ? (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" /> {FIT_COPY.good(p.brand)}
        </p>
      ) : (
        warning && (
          <p className={amber}>
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden /> {warning}
          </p>
        )
      )}
      {textHeavy && (
        <div className="flex flex-wrap items-center gap-x-3">
          <p className={amber}>
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden /> {FIT_COPY.textHeavy}
          </p>
          <button
            type="button"
            onClick={p.onCarousel}
            disabled={p.disabled}
            className="inline-flex items-center py-1 text-xs font-semibold text-primary hover:underline disabled:opacity-50 [@media(pointer:coarse)]:min-h-11"
          >
            {FIT_COPY.switch}
          </button>
        </div>
      )}
    </div>
  );
}
