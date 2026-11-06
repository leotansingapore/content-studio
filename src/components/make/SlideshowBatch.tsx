// The batch card on /make/slideshow (src/lib/slideshowBatch.ts): pick kept hooks (My hooks) and looks, see what the
// batch spends before it runs, then follow each slideshow as it is made. batch=open opens the card (replace).

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FilterChip } from "@/components/ui/filter-chip";
import { keptHooks, HOOKS_CHANGED } from "@/lib/hookWriter";
import { links } from "@/lib/links";
import { PRICES, priceText, type Price } from "@/lib/prices";
import { AI_SETS, BATCH_LOOKS, MAKES, MAX_BATCH_HOOKS, batchBusy, batchPairs, batchPlan, lookLabel, onSlideshowBatch, slideshowBatch, startBatch, type BatchLook, type SlideshowBatch as Batch } from "@/lib/slideshowBatch";
import { onSlideshowJob, slideshowBusy, slideshowJob, stepText, type SlideshowAsk } from "@/lib/slideshowJob";
import { useUrlFlag } from "@/lib/urlState";


export function useBatch(): Batch | null {
  const [b, setB] = useState(slideshowBatch);
  useEffect(() => onSlideshowBatch(setB), []);
  return b;
}

export default function SlideshowBatchCard({ userId, base, hasMedia, onOpen }: { userId: string; base: Pick<SlideshowAsk, "mention" | "inside" | "note" | "size">; hasMedia: boolean; onOpen: (showId: string) => void }) {
  const [open, setOpen] = useUrlFlag("batch", "open");
  const [hooks, setHooks] = useState(() => keptHooks(userId));
  useEffect(() => {
    const read = () => setHooks(keptHooks(userId));
    window.addEventListener(HOOKS_CHANGED, read);
    return () => window.removeEventListener(HOOKS_CHANGED, read);
  }, [userId]);
  const [picked, setPicked] = useState<string[]>([]);
  const [looks, setLooks] = useState<BatchLook[]>(["stock"]);
  const batch = useBatch();
  const [job, setJob] = useState(slideshowJob);
  useEffect(() => onSlideshowJob(setJob), []);
  const running = !!batch && batchBusy();
  const offered = useMemo(() => BATCH_LOOKS.filter((l) => l !== "mine" || hasMedia), [hasMedia]);
  const chosen = picked.filter((t) => hooks.some((h) => h.text === t));
  const plan = batchPlan(chosen.length, looks);
  const reason = plan.reason ?? (slideshowBusy() ? "Wait for the slideshow being made." : null);
  const ai = PRICES["slide-pictures"] as Price;

  const toggleHook = (t: string) => setPicked((p) => (p.includes(t) ? p.filter((x) => x !== t) : p.length >= MAX_BATCH_HOOKS ? p : [...p, t]));
  const toggleLook = (l: BatchLook) => setLooks((ls) => (ls.includes(l) ? ls.filter((x) => x !== l) : [...ls, l]));
  const made = batch?.runs.filter((r) => r.state === "done").length ?? 0;

  return (
    <Card className="border-border/60 shadow-card">
      <CardContent className="space-y-4 pt-4 sm:pt-5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold">Make a batch</p>
            <p className="text-xs text-muted-foreground">Each hook you pick, made in each look you pick.</p>
          </div>
          <Button size="sm" variant="ghost" onClick={() => setOpen(!open)} aria-expanded={open}>
            {open ? "Hide" : "Open"}
          </Button>
        </div>
        {open && !running && (
          <>
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-muted-foreground">Hooks, up to {MAX_BATCH_HOOKS}</p>
              {hooks.length ? (
                <ul className="space-y-1">
                  {hooks.map((h) => (
                    <li key={h.id}>
                      <label className="flex cursor-pointer items-start gap-2 rounded-md p-1.5 text-sm hover:bg-muted/50 [@media(pointer:coarse)]:py-2.5">
                        <input
                          type="checkbox"
                          checked={chosen.includes(h.text)}
                          disabled={!chosen.includes(h.text) && chosen.length >= MAX_BATCH_HOOKS}
                          onChange={() => toggleHook(h.text)}
                          className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
                        />
                        <span className="min-w-0 break-words">{h.text}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">
                  <Link to="/hooks" className="font-semibold text-primary hover:underline [@media(pointer:coarse)]:py-3">Keep hooks on My hooks</Link> to batch them here.
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-muted-foreground">Looks</p>
              <div className="flex flex-wrap gap-1.5">
                {offered.map((l) => (
                  <FilterChip key={l} active={looks.includes(l)} onClick={() => toggleLook(l)}>{lookLabel(l)}</FilterChip>
                ))}
              </div>
            </div>
            {/* the spend before the press: makes and, for AI looks, picture credit and today's picture sets */}
            {plan.count > 0 && !plan.reason && (
              <p className="text-xs text-muted-foreground">
                {plan.count} slideshows, made one after another, using {plan.count} of today&apos;s {MAKES} slideshow makes.
                {plan.ai > 0 ? ` ${priceText({ ...ai, usd: ai.usd * plan.ai })} of AI picture credit, using ${plan.ai} of today's ${AI_SETS} sets.` : ""}
              </p>
            )}
            {reason && chosen.length > 0 && <p className="text-xs font-medium text-amber-700 dark:text-amber-300">{reason}</p>}
            <Button variant="outline" disabled={!!reason} onClick={() => void startBatch(userId, base, batchPairs(chosen, looks))}>
              Make {plan.count || ""} slideshows
            </Button>
          </>
        )}
        {batch && (open || running) && (
          <div className="space-y-2" aria-live="polite">
            <p className="text-xs font-semibold text-muted-foreground">
              {running ? `Making ${made + 1} of ${batch.runs.length}` : `Made ${made} of ${batch.runs.length}`}
            </p>
            <ul className="divide-y divide-border/60 rounded-lg border border-border/60">
              {batch.runs.map((r, i) => (
                <li key={i} className="flex items-center gap-2 p-2 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{r.hook}</span>
                    <span className="block text-xs text-muted-foreground">
                      {lookLabel(r.look)}
                      {r.state === "making" && job ? ` · ${stepText(job)}` : r.state === "waiting" ? " · Waiting" : r.state === "skipped" ? " · Skipped" : r.state === "failed" ? ` · ${r.error}` : r.note ? ` · ${r.note}` : ""}
                    </span>
                  </span>
                  {r.state === "making" && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" aria-hidden />}
                  {r.state === "done" && r.showId && (
                    <Button size="sm" variant="ghost" className="shrink-0" onClick={() => onOpen(r.showId!)}>
                      <Check className="mr-1 h-3.5 w-3.5 text-primary" aria-hidden /> Open
                    </Button>
                  )}
                </li>
              ))}
            </ul>
            {batch.stopped && <p className="text-xs font-medium text-amber-700 dark:text-amber-300">{batch.stopped} The rest were skipped.</p>}
            {!running && made > 0 && (
              <p className="text-xs text-muted-foreground">
                Each one is saved in your <Link to={links.library({ format: "carousel" })} className="font-semibold text-primary hover:underline [@media(pointer:coarse)]:py-3">Library</Link>. Open one to download, copy the caption or schedule it.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
