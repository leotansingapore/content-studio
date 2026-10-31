// Small controls the design editor's panels share.

import { useState } from "react";

export const field = "h-8 w-full rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring";

export function ColorField({ value, onChange, swatches = [] }: { value: string; onChange: (c: string) => void; swatches?: string[] }) {
  const [typed, setTyped] = useState<string | null>(null);
  const six = /^#[0-9a-f]{6}$/i.test(value) ? value : "#000000";
  return (
    <span className="flex items-center gap-1.5">
      <input type="color" aria-label="Colour" value={six} onChange={(e) => onChange(e.target.value)} className="h-8 w-8 shrink-0 cursor-pointer rounded border border-input bg-transparent p-0.5" />
      <input
        className="h-8 w-[5.5rem] rounded-md border border-input bg-background px-2 font-mono text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        aria-label="Hex colour"
        value={typed ?? value}
        onChange={(e) => {
          setTyped(e.target.value);
          if (/^#[0-9a-f]{3,8}$/i.test(e.target.value.trim())) onChange(e.target.value.trim());
        }}
        onBlur={() => setTyped(null)}
      />
      {swatches.map((c) => (
        <button key={c} type="button" title={c} aria-label={`Use ${c}`} onClick={() => onChange(c)} className="h-6 w-6 shrink-0 rounded-full border border-border" style={{ background: c }} />
      ))}
    </span>
  );
}
export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: readonly { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <span className="flex flex-wrap rounded-md border border-input p-0.5" role="group">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={`flex-1 whitespace-nowrap rounded px-2 py-1 text-xs ${value === o.value ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}
        >
          {o.label}
        </button>
      ))}
    </span>
  );
}
