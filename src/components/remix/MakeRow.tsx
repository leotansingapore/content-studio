import { useEffect, useState } from "react";
import { FilterChip } from "@/components/ui/filter-chip";
import { aiBusy as aiWorking, onAiJob } from "@/lib/aiVideo";
import { priceText } from "@/lib/prices";
import { AS_LABELS, MAKE_CHIPS, MAX_FORMATS, VIDEO_LIMITS, formatsAllowed, isVideo, videoBlock, videoPrice, type RemixAs } from "@/lib/remix";
import type { RemixSource } from "@/lib/remixSource";
import type { UsageFeature } from "../../../supabase/functions/_shared/usageCaps.ts";

/**
 * The formats one press makes (docs/north-star/items/remix-any-format.md): up to 3, one video at a time. The video
 * chips carry their price, and go off while another video is being made or a cap they spend is used up.
 */
export default function MakeRow(p: { source: RemixSource; as: RemixAs[]; setAs(next: RemixAs[]): void; busy: boolean; left: (f: UsageFeature) => number | null }) {
  const [warn, setWarn] = useState(false);
  const aiBusy = useAiBusy();
  const picked = p.as.find(isVideo);
  const block = (a: "speaking" | "explainer") => videoBlock(a, { busy: aiBusy, left: p.left });
  const blocked = block("speaking") ?? block("explainer");
  const line = blocked ?? (picked ? VIDEO_LIMITS.oneVideo : VIDEO_LIMITS.pickMore);
  const pick = (a: RemixAs) => {
    const next = formatsAllowed(p.as, a);
    // a fourth pick is ignored, and the line under the row says why
    setWarn(next === p.as && !p.as.includes(a) && p.as.length >= MAX_FORMATS);
    if (next !== p.as) p.setAs(next);
  };
  return (
    <section className="space-y-2" aria-labelledby="remix-make">
      <h3 id="remix-make" className="text-xs font-semibold text-muted-foreground">
        Make
      </h3>
      <div className="flex flex-wrap gap-1.5">
        {MAKE_CHIPS.map((a) => {
          const on = p.as.includes(a);
          const price = videoPrice(a);
          const off = isVideo(a) && !on && (!!block(a) || (!!picked && picked !== a));
          return (
            <FilterChip key={a} active={on} disabled={p.busy || off} onClick={() => pick(a)}>
              {AS_LABELS[a]}
              {price && <span className="ml-1 tabular-nums opacity-75">{priceText(price)}</span>}
            </FilterChip>
          );
        })}
      </div>
      <p role={warn ? "alert" : undefined} className={`text-xs ${warn || blocked ? "font-medium text-amber-700 dark:text-amber-300" : "text-muted-foreground"}`}>
        {warn ? VIDEO_LIMITS.pickMore : line}
      </p>
    </section>
  );
}

/** True while an AI video is being made anywhere in the app (aiVideo.ts runs one at a time). */
export function useAiBusy(): boolean {
  const [busy, setBusy] = useState(aiWorking);
  useEffect(() => {
    const off = onAiJob((j) => setBusy(j?.state === "working"));
    return () => {
      off();
    };
  }, []);
  return busy;
}
