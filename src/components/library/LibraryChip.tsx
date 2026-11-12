// A quiet filter chip for the Library's views, as Fastlane's Library draws them (11 Nov): plain words at rest, a tint
// when on, a count beside it when there is one. Not the shared FilterChip, which the Discover pages keep bordered.
import type { ReactNode } from "react";

export default function LibraryChip({ on, onClick, count, children }: { on: boolean; onClick: () => void; count?: number; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`inline-flex h-8 shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-3 text-xs font-medium transition-colors [@media(pointer:coarse)]:min-h-11 ${
        on ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground"
      }`}
    >
      {children}
      {count !== undefined && count > 0 && <span className="tabular-nums opacity-70">{count}</span>}
    </button>
  );
}
