// How B-roll shows on the video, for every clip: over the whole frame, or in a
// card at the top or the side with the shot dimmed behind it (brollCard.ts).

import { InfoTip } from "@/components/ui/info-tip";

const OPTIONS = [
  [undefined, "Full frame"],
  ["top", "Card on top"],
  ["side", "Card at the side"],
] as const;

export default function BrollLayout({ value, onChange }: {
  value: "top" | "side" | undefined;
  onChange: (v: "top" | "side" | undefined) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="flex items-center font-medium">Show B-roll
        <InfoTip label="About B-roll cards">A card keeps you in view, your shot dimmed behind it.</InfoTip></span>
      <span role="radiogroup" aria-label="Show B-roll" className="flex flex-wrap gap-1.5">
        {OPTIONS.map(([v, label]) => (
          <button key={label} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v)}
            className={`min-h-11 rounded-full border px-3 text-xs font-semibold sm:min-h-8 ${value === v ? "border-primary bg-primary/10 text-primary" : "border-border/70 text-muted-foreground"}`}>
            {label}
          </button>
        ))}
      </span>
    </div>
  );
}
