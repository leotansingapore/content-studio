import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { FilterChip } from "@/components/ui/filter-chip";
import { FORMATS, alsoMakeList, formatHref } from "@/data/formats";
import { aiBusy as aiWorking, onAiJob, pendingAvatar } from "@/lib/aiVideo";
import { links } from "@/lib/links";
import { chipText, priceText } from "@/lib/prices";
import { AS_LABELS, MAKE_CHIPS, MAX_FORMATS, VIDEO_LIMITS, formatsAllowed, isVideo, videoBlock, videoPrice, type RemixAs } from "@/lib/remix";
import type { RemixSource } from "@/lib/remixSource";
import type { UsageFeature } from "../../../supabase/functions/_shared/usageCaps.ts";

/**
 * The formats one press makes (docs/north-star/items/remix-any-format.md): up to 3, one video at a time. The video
 * chips carry their price, and go off while another video is being made or a cap they spend is used up. Under them,
 * "Also make" links each ready format (src/data/formats.ts alsoMakeList) on this source; they open the page, they don't toggle.
 */
export default function MakeRow(p: {
  source: RemixSource;
  as: RemixAs[];
  setAs(next: RemixAs[]): void;
  busy: boolean;
  left: (f: UsageFeature) => number | null;
  /** The For row's Mention: off carries mention=no to the format page. */
  mention?: boolean;
}) {
  const [warn, setWarn] = useState(false);
  const aiBusy = useAiBusy();
  const picked = p.as.find(isVideo);
  const block = (a: "speaking" | "explainer") => videoBlock(a, { busy: aiBusy, waiting: !!pendingAvatar(), left: p.left });
  // a picked video that can't run says why under the button, so this line stays the plain hint then
  const blocked = picked && block(picked) ? null : (block("speaking") ?? block("explainer"));
  const line = blocked ?? (picked ? VIDEO_LIMITS.oneVideo : VIDEO_LIMITS.pickMore);
  useEffect(() => {
    if (!warn) return;
    const t = setTimeout(() => setWarn(false), 4000);
    return () => clearTimeout(t);
  }, [warn]);
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
        {!warn && line === VIDEO_LIMITS.waiting && <WaitingLink />}
      </p>
      <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        <span className="basis-full sm:basis-auto">Also make:</span>
        {/* a link that makes on arrival (navigation state, never a URL param), so it reads as a link with its price, not as one of the toggle chips above */}
        {alsoMakeList(FORMATS).map(({ f, go }) => {
          // the sheet is Leo's only; at 0 left the link opens the page, whose button is off with the reason
          const chip = chipText({ price: f.price(), left: f.cap ? p.left(f.cap) : null, leo: true });
          return (
            <Link
              key={f.slug}
              to={formatHref(f, { source: p.source.key, mention: p.mention === false ? "no" : undefined })}
              // Starting a paid make rides on navigation state, which a pasted or outside link cannot set; a format at
              // US$1 or more opens its page and waits for the press.
              state={go && !chip.out ? { go: true } : undefined}
              className="inline-flex items-center gap-1 font-semibold text-primary underline-offset-4 hover:underline [@media(pointer:coarse)]:min-h-11"
            >
              {f.name}
              {chip.text && <span className="font-normal tabular-nums text-muted-foreground">{chip.text}</span>}
              <ArrowRight className="h-3 w-3" aria-hidden />
            </Link>
          );
        })}
      </p>
    </section>
  );
}

/** Opens the editor, which finishes a paid avatar that is still waiting at no cost. */
export function WaitingLink() {
  return (
    <Link to={links.edit({ panel: ["ai"], kind: "avatar" })} className="ml-1 inline-flex items-center font-semibold text-primary hover:underline [@media(pointer:coarse)]:min-h-11">
      Open the editor
    </Link>
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
