// Configure on a campaign page (?configure=1, Leo's sign-ins), after Fastlane's campaign settings: the name, kept
// when the field is left, then pace and length, saved together with Undo because a shorter plan drops posts. Written
// posts keep their words on the new days and new slots are written by the campaign job (campaigns.ts replanCampaign).
// Pace and length lock once a post is made or while words are being written (replanLock).

import { useState } from "react";
import { Minus, Plus, X } from "lucide-react";
import { ROW, dot, rowOn } from "@/components/campaign/WhoStep";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToastAction } from "@/components/ui/toast";
import { useToast } from "@/hooks/use-toast";
import { startDrafting } from "@/lib/campaignJob";
import { type Campaign, hasWords, loadCampaigns, replanCampaign, replanLock, restoreCampaign, saveCampaigns } from "@/lib/campaigns";
import { MAX_NAME, MAX_WEEKS, MIN_WEEKS, PACES, paceLabel } from "@/lib/campaignWizard";

const HEAD = "text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground";
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** What saving this pace and length does: the new count, then the written posts it drops and the new ones it writes. */
export function replanLine(c: Pick<Campaign, "posts">, weeks: number, perWeek: number): string {
  const count = weeks * perWeek;
  const dropped = c.posts.slice(count).filter(hasWords).length;
  const added = Math.max(0, count - c.posts.length);
  return [
    `${plural(count, "post")} over ${plural(weeks, "week")}.`,
    dropped > 0 && `Drops ${plural(dropped, "written post")} at the end.`,
    added > 0 && `${plural(added, "new post")} get written.`,
  ].filter(Boolean).join(" ");
}

export default function ConfigurePanel({ userId, campaign: c, onClose }: { userId: string; campaign: Campaign; onClose: () => void }) {
  const { toast } = useToast();
  const [weeks, setWeeks] = useState(c.weeks);
  const [perWeek, setPerWeek] = useState<Campaign["perWeek"]>(c.perWeek);
  const lock = replanLock(c);
  const changed = weeks !== c.weeks || perWeek !== c.perWeek;

  const rename = (value: string) => {
    const name = value.trim().slice(0, MAX_NAME);
    if (!name || name === c.name) return;
    const line = saveCampaigns(userId, loadCampaigns(userId).map((x) => (x.id === c.id ? { ...x, name } : x)));
    toast(line ? { title: line, variant: "destructive" } : { title: "Name saved." });
  };
  const save = () => {
    const before = c;
    const next = replanCampaign(userId, c, { weeks, perWeek });
    const line = saveCampaigns(userId, loadCampaigns(userId).map((x) => (x.id === c.id ? next : x)));
    if (line) return toast({ title: line, variant: "destructive" });
    // shortcut: an Undo while a batch is in flight can land its words on the old plan's post of the same number; fine while Leo-only
    startDrafting(userId, c.id);
    toast({
      title: `Now ${plural(next.posts.length, "post")} over ${plural(weeks, "week")}, ${paceLabel(perWeek)}.`,
      duration: 6000,
      action: (
        <ToastAction altText="Undo" onClick={() => {
          const undo = restoreCampaign(userId, before);
          if (undo) toast({ title: undo, variant: "destructive" });
          else {
            setWeeks(before.weeks);
            setPerWeek(before.perWeek);
          }
        }}>
          Undo
        </ToastAction>
      ),
    });
  };

  return (
    <section id="configure" aria-label="Campaign settings" className="scroll-mt-20 space-y-5 rounded-xl border border-border/60 p-4 shadow-card sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={HEAD}>Campaign settings</p>
          <p className="mt-1 text-sm text-muted-foreground">{plural(c.posts.length, "post")} | {paceLabel(c.perWeek)} | {plural(c.weeks, "week")}</p>
        </div>
        <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0 sm:h-10 sm:w-10" aria-label="Close campaign settings" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="campaign-name" className={HEAD}>Name</label>
        <Input
          id="campaign-name"
          key={c.name}
          defaultValue={c.name}
          maxLength={MAX_NAME}
          className="h-11"
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          onBlur={(e) => rename(e.currentTarget.value)}
        />
      </div>

      <fieldset disabled={!!lock} className="space-y-5 disabled:opacity-60">
        <div className="space-y-2">
          <p id="cfg-pace" className={HEAD}>Pace, per account</p>
          <div role="radiogroup" aria-labelledby="cfg-pace" className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            {PACES.map((n) => (
              <button key={n} type="button" role="radio" aria-checked={perWeek === n} onClick={() => setPerWeek(n)} className={`${ROW} items-center ${rowOn(perWeek === n)}`}>
                <span aria-hidden className={`${dot(perWeek === n)} mt-0`} />
                {paceLabel(n)}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <p id="cfg-length" className={HEAD}>Length</p>
          <div className="flex items-center gap-2" role="group" aria-labelledby="cfg-length">
            <Button type="button" variant="outline" size="icon" className="h-11 w-11 sm:h-10 sm:w-10" aria-label="One week shorter" disabled={weeks <= MIN_WEEKS} onClick={() => setWeeks(weeks - 1)}>
              <Minus />
            </Button>
            <span className="min-w-[5.5rem] text-center font-semibold tabular-nums" aria-live="polite">{plural(weeks, "week")}</span>
            <Button type="button" variant="outline" size="icon" className="h-11 w-11 sm:h-10 sm:w-10" aria-label="One week longer" disabled={weeks >= MAX_WEEKS} onClick={() => setWeeks(weeks + 1)}>
              <Plus />
            </Button>
          </div>
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <Button className="h-11 sm:h-10" disabled={!!lock || !changed} onClick={save}>Save pace and length</Button>
        <p className="min-w-0 flex-1 text-sm text-muted-foreground" aria-live="polite">{lock ?? (changed ? replanLine(c, weeks, perWeek) : replanLine(c, c.weeks, c.perWeek))}</p>
      </div>
    </section>
  );
}
