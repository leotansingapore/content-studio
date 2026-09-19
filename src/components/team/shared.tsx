// Small building blocks shared by the team review screens.
import type { ReactNode } from "react";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  REVIEW_STATE_LABEL,
  type DraftReviewState,
  type SubmittedFlag,
} from "@/lib/teamReview";

export const PLATFORM_LABEL: Record<string, string> = {
  linkedin: "LinkedIn",
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
};

export const FORMAT_LABEL: Record<string, string> = {
  carousel: "Carousel",
  "short-video": "Short video",
  "text-post": "Text post",
  story: "Story",
  unknown: "Post",
};

const WHEN = new Intl.DateTimeFormat("en-SG", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

export function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : WHEN.format(d);
}

export function LoadingBlock({ label = "Loading…" }: { label?: string }) {
  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground"
    >
      <Loader2 className="h-4 w-4 animate-spin" />
      {label}
    </div>
  );
}

export function ErrorBlock({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-6 text-center text-sm"
    >
      <p className="max-w-md break-words text-foreground">{message}</p>
      {onRetry && (
        <Button size="sm" variant="outline" onClick={onRetry} className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" /> Try again
        </Button>
      )}
    </div>
  );
}

export function EmptyBlock({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-8 text-center text-sm text-muted-foreground">
      <span className="text-primary">{icon}</span>
      {children}
    </div>
  );
}

const STATE_STYLE: Record<DraftReviewState, string> = {
  none: "border-border/60 bg-background text-muted-foreground",
  pending: "border-amber-500/40 bg-amber-500/10 text-amber-700",
  approved: "border-success/40 bg-success/10 text-success",
  edited_since_approval: "border-amber-500/40 bg-amber-500/10 text-amber-700",
  changes_requested: "border-destructive/40 bg-destructive/10 text-destructive",
};

export function ReviewStateBadge({ state }: { state: DraftReviewState }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${STATE_STYLE[state]}`}
    >
      {REVIEW_STATE_LABEL[state]}
    </span>
  );
}

export function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex shrink-0 items-center rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
      {children}
    </span>
  );
}

export function PostChips({ platform, format }: { platform: string; format: string }) {
  return (
    <>
      <Chip>{PLATFORM_LABEL[platform] ?? platform}</Chip>
      <Chip>{FORMAT_LABEL[format] ?? format}</Chip>
    </>
  );
}

export function FlagList({ flags }: { flags: SubmittedFlag[] | null | undefined }) {
  if (!flags || flags.length === 0) {
    return <p className="text-[11px] text-muted-foreground">No compliance flags when submitted.</p>;
  }
  return (
    <ul className="flex flex-col gap-1.5" aria-label="Compliance flags when submitted">
      {flags.map((f, i) => {
        const isError = f.severity === "error";
        return (
          <li
            key={`${f.ruleId ?? "flag"}-${i}`}
            className={`flex items-start gap-1.5 rounded-lg border px-2 py-1.5 text-[11px] leading-snug ${
              isError
                ? "border-destructive/40 bg-destructive/10 text-destructive"
                : "border-amber-500/40 bg-amber-500/10 text-amber-800"
            }`}
          >
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
            <span className="min-w-0 break-words">
              <span className="font-semibold">{isError ? "Compliance error" : "Compliance warning"}</span>
              {f.match ? <span className="font-mono"> “{f.match}”</span> : null}
              {f.message ? <span className="text-foreground/80"> {f.message}</span> : null}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
