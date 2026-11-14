/** A labelled native select, the Radar layout's Sort and filter pickers (the ad library, Apps like yours). */
export function Pick({ label, value, onChange, options }: { label: string; value: string; onChange(v: string): void; options: [string, string][] }) {
  return (
    <label className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border/60 bg-background px-2.5 text-xs [@media(pointer:coarse)]:h-11">
      <span className="font-semibold text-muted-foreground">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} className="h-full max-w-[9rem] bg-transparent font-medium text-foreground outline-none">
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}
