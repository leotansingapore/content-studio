import { useId } from "react";
import { InfoTip } from "@/components/ui/info-tip";
import { Input } from "@/components/ui/input";
import { ADVISER, MAX_PROFESSION_CHARS, PROFESSION_CHOICES, isAdviser } from "@/lib/profession";

/**
 * "What do you do?": a few common answers, or the person's own words. On a brand that exists, nothing set reads as a
 * financial adviser and shows that chip picked; a new brand (`emptyIsAdviser` false) starts with none picked.
 */
export default function ProfessionField({ value, onChange, emptyIsAdviser = true }: { value: string; onChange: (v: string) => void; emptyIsAdviser?: boolean }) {
  const id = useId();
  const picked = (c: string) => (c === ADVISER ? (emptyIsAdviser || value.trim() !== "") && isAdviser(value) : value.trim().toLowerCase() === c.toLowerCase());
  return (
    <div className="space-y-1.5" data-testid="profession">
      <div className="flex items-center gap-1">
        <label id={`${id}-q`} htmlFor={`${id}-own`} className="text-sm font-medium">What do you do?</label>
        <InfoTip label="About what you do">The AI writers write your posts for this.</InfoTip>
      </div>
      <div role="group" aria-labelledby={`${id}-q`} className="flex flex-wrap gap-1.5">
        {PROFESSION_CHOICES.map((c) => (
          <button
            key={c}
            type="button"
            aria-pressed={picked(c)}
            onClick={() => onChange(c)}
            className={`min-h-9 rounded-full border px-3 text-xs font-medium transition-colors [@media(pointer:coarse)]:min-h-11 ${picked(c) ? "border-primary/60 bg-primary/10 text-primary" : "border-border/70 text-muted-foreground hover:text-foreground"}`}
          >
            {c}
          </button>
        ))}
      </div>
      <Input id={`${id}-own`} value={value} maxLength={MAX_PROFESSION_CHARS} placeholder="Or type your own, like photographer" onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
