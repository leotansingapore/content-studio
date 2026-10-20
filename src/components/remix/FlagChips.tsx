import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import type { Flags } from "@/lib/remix";

/** Warnings on a finished remix; the draft is saved either way. */
export default function FlagChips({ flags }: { flags: Flags }) {
  const [open, setOpen] = useState(false);
  if (!flags.copied.length && !flags.claim && !flags.invented) return null;
  const chip = "flex items-start gap-1.5 rounded-lg border border-amber-500/50 bg-amber-500/10 px-2.5 py-1.5 text-left text-[11px] text-amber-900 dark:text-amber-200";
  return (
    <div className="space-y-1.5">
      {flags.copied.length > 0 && (
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className={`${chip} w-full [@media(pointer:coarse)]:min-h-11`}>
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-600" />
          <span className="space-y-1">
            <span className="block font-semibold">Shares words with the original</span>
            {open && flags.copied.map((l) => <span key={l} className="block font-mono text-[10px]">{l}</span>)}
          </span>
        </button>
      )}
      {flags.claim && (
        <p className={chip}>
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-600" /> Uses a figure or claim from the original. Check it or take it out.
        </p>
      )}
      {flags.invented && (
        <p className={chip}>
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-600" /> Says something about you that isn't in your profile. Check it.
        </p>
      )}
    </div>
  );
}
