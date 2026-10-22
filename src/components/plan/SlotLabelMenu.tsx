// A /plan slot's label (Leo only): the chip it counts toward, and Change to move the slot to another label or off any.
// The options open inline under the slot's chips, so nothing floats over the plan.
import { useState } from "react";
import { Check } from "lucide-react";
import { LabelChip } from "@/components/Labels";
import { LABEL_CHIP, LABEL_SWATCH, type Label } from "@/lib/labels";

export default function SlotLabelMenu({ label, labels, onPick }: { label: Label | null; labels: Label[]; onPick: (label: Label | null) => void }) {
  const [open, setOpen] = useState(false);
  if (!labels.length && !label) return null;
  const pick = (next: Label | null) => {
    setOpen(false);
    if ((next?.id ?? null) !== (label?.id ?? null)) onPick(next);
  };
  const option = (on: boolean, extra: string) =>
    `inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors [@media(pointer:coarse)]:h-11 ${
      on ? extra : "border-border/70 bg-background text-muted-foreground hover:text-foreground"
    }`;
  return (
    <>
      {label && <LabelChip label={label} />}
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="rounded px-1 text-[11px] font-medium text-primary hover:underline [@media(pointer:coarse)]:min-h-11"
      >
        {label ? "Change" : "Add label"}
      </button>
      {open && (
        <div
          role="group"
          aria-label="Move this slot to a label"
          onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
          className="flex basis-full flex-wrap gap-1.5 pt-1"
        >
          {labels.map((l) => {
            const on = l.id === label?.id;
            return (
              <button key={l.id} type="button" aria-pressed={on} onClick={() => pick(l)} className={option(on, LABEL_CHIP[l.color])}>
                {on ? <Check className="h-3.5 w-3.5" /> : <span className={`h-2.5 w-2.5 rounded-full ${LABEL_SWATCH[l.color]}`} />}
                {l.name}
              </button>
            );
          })}
          <button type="button" aria-pressed={!label} onClick={() => pick(null)} className={option(!label, "border-foreground/30 bg-muted text-foreground")}>
            No label
          </button>
        </div>
      )}
    </>
  );
}
