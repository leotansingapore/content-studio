// How a post did against its own account's usual (docs/north-star/items/find-outlier-score.md), on any post card that
// has numbers. ASCII only: "3.2x their usual", never a multiplication sign.
import { Flame } from "lucide-react";
import { InfoTip } from "@/components/ui/info-tip";
import { cn } from "@/lib/utils";
import { times, type Outlier } from "../../supabase/functions/_shared/outlier.ts";

export default function OutlierBadge({ outlier: o, whose = "their" }: { outlier: Outlier; whose?: "their" | "your" }) {
  const hot = o.tier === "mega" || o.tier === "viral";
  const text =
    o.reason === "young" ? "Too new to judge"
    : o.tier === null ? "Not enough posts to judge"
    : o.tier === "usual" ? `About ${whose} usual`
    : o.tier === "below" ? `Below ${whose} usual`
    : `${times(o.ratio ?? 0)} ${whose} usual`;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums",
        hot || o.tier === "above" ? "bg-success/10 text-success" : "bg-muted text-muted-foreground",
      )}
    >
      {hot && <Flame className="h-3 w-3" aria-hidden />}
      {o.confidence === "low" ? `${text} (few posts)` : text}
    </span>
  );
}

/** Beside the "Outlier score" sort label: one tip per screen rather than one per card (UX law 21). */
export function OutlierScoreTip() {
  return <InfoTip label="About the outlier score">{"This post's views against the account's median of its last 20 posts."}</InfoTip>;
}
