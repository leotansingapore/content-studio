import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The one filter chip for every Discover page (Top posts, News, Trends,
 * Inspiration, Creators): same look everywhere, 36px tall on phones.
 */
export function FilterChip({
  active,
  onClick,
  count,
  disabled,
  children,
}: {
  active: boolean;
  onClick: () => void;
  count?: number;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={cn(
        "inline-flex h-9 shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-3 text-xs font-medium transition-colors sm:h-7",
        active
          ? "border-primary/60 bg-primary/10 text-primary"
          : disabled
            ? "cursor-not-allowed border-border/50 bg-background text-muted-foreground/60"
            : "border-border/60 bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground",
      )}
    >
      {children}
      {typeof count === "number" && (
        <span className={cn("tabular-nums", active ? "text-primary/70" : "text-muted-foreground")}>{count}</span>
      )}
    </button>
  );
}
