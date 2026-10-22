// The campaign wizard's step 4 (plan-campaign, Leo only): what gets made and how often. Formats are chips (text
// post, carousel and short video script cost nothing to make; a slideshow or a wall of text is one remix make at
// Make; an AI video is priced from the table), the length a 1 to 8 week stepper, the pace four radios, and a live
// summary under them. The wizard page draws the step's header, Back and Confirm.

import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AI_VIDEO, type Campaign, type CampaignFormat } from "@/lib/campaigns";
import { FORMAT_HINT, FORMAT_NAME, MAX_WEEKS, MIN_WEEKS, PACES, paceLabel } from "@/lib/campaignWizard";
import { priceText } from "@/lib/prices";
import { ROW, dot, rowOn } from "@/components/campaign/WhoStep";

const ORDER = Object.keys(FORMAT_NAME) as CampaignFormat[];
const HEAD = "text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground";
const CHIP = "flex min-h-11 items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors";

export default function PaceStep(p: {
  formats: CampaignFormat[];
  onFormats: (f: CampaignFormat[]) => void;
  weeks: number;
  onWeeks: (n: number) => void;
  perWeek: Campaign["perWeek"];
  onPerWeek: (n: Campaign["perWeek"]) => void;
  pictures: Campaign["pictures"];
  onPictures: (p: Campaign["pictures"]) => void;
  /** Media holds photos: a slideshow may use them. */
  hasMedia: boolean;
  /** Who speaks in an AI video, in words. */
  who: string;
  summary: string[];
}) {
  const on = (f: CampaignFormat) => p.formats.includes(f);
  // keep the picked ones in the chips' order
  const toggle = (f: CampaignFormat) => p.onFormats(ORDER.filter((x) => (x === f ? !on(f) : on(x))));
  return (
    <div className="space-y-5">
      <fieldset className="space-y-2">
        <legend className={HEAD}>Formats</legend>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {ORDER.map((f) => (
            <button key={f} type="button" aria-pressed={on(f)} onClick={() => toggle(f)} className={`${CHIP} ${rowOn(on(f))}`}>
              <span aria-hidden className={`h-3.5 w-3.5 shrink-0 rounded-[3px] border ${on(f) ? "border-primary bg-primary" : "border-muted-foreground/60"}`} />
              <span className="min-w-0">
                <span className="font-medium">{FORMAT_NAME[f]}</span> <span className="text-xs text-muted-foreground">{FORMAT_HINT[f]}</span>
                {f === "ai-video" && <span className="block text-[11px] tabular-nums text-muted-foreground">{priceText(AI_VIDEO)} each</span>}
              </span>
            </button>
          ))}
        </div>
        {on("slideshow") && p.hasMedia && (
          <div className="space-y-1.5 pt-1">
            <p id="pictures-q" className="text-sm font-medium">Slideshow pictures</p>
            <div role="radiogroup" aria-labelledby="pictures-q" className="flex flex-wrap gap-1.5">
              {(["stock", "mine"] as const).map((v) => (
                <button key={v} type="button" role="radio" aria-checked={p.pictures === v} onClick={() => p.onPictures(v)} className={`${CHIP} ${rowOn(p.pictures === v)}`}>
                  <span aria-hidden className={dot(p.pictures === v)} />
                  {v === "stock" ? "Stock photos" : "Your Media"}
                </button>
              ))}
            </div>
          </div>
        )}
        {on("ai-video") && <p className="pt-1 text-sm text-muted-foreground">{p.who}</p>}
      </fieldset>

      <div className="space-y-2">
        <p id="length-q" className={HEAD}>Campaign length</p>
        <div className="flex items-center gap-2" role="group" aria-labelledby="length-q">
          <Button type="button" variant="outline" size="icon" aria-label="One week shorter" disabled={p.weeks <= MIN_WEEKS} onClick={() => p.onWeeks(p.weeks - 1)}>
            <Minus />
          </Button>
          <span className="min-w-[5.5rem] text-center font-semibold tabular-nums" aria-live="polite">{p.weeks} {p.weeks === 1 ? "week" : "weeks"}</span>
          <Button type="button" variant="outline" size="icon" aria-label="One week longer" disabled={p.weeks >= MAX_WEEKS} onClick={() => p.onWeeks(p.weeks + 1)}>
            <Plus />
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <p id="pace-q" className={HEAD}>How often</p>
        <div role="radiogroup" aria-labelledby="pace-q" className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          {PACES.map((n) => (
            <button key={n} type="button" role="radio" aria-checked={p.perWeek === n} onClick={() => p.onPerWeek(n)} className={`${ROW} items-center ${rowOn(p.perWeek === n)}`}>
              <span aria-hidden className={`${dot(p.perWeek === n)} mt-0`} />
              {paceLabel(n)}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1 rounded-lg border border-border/60 bg-muted/30 px-4 py-3 text-sm" aria-live="polite">
        {p.summary.map((line, i) => <p key={i} className={i ? "text-muted-foreground" : "font-medium"}>{line}</p>)}
      </div>
    </div>
  );
}
