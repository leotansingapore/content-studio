// The one folded row on a person-on-camera page (/make/talking-head, /make/green-screen; Leo 12 Nov: "stupidly simple
// to use"): the choices a first make never needs, behind "More settings", with every current pick named in one line so
// nothing is hidden silently. Open or shut lives in the address (?more=open, replace), so a reload or a shared link keeps it.

import { useId, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { useUrlState } from "@/lib/urlState";
import { cn } from "@/lib/utils";

const STATES = ["shut", "open"] as const;

/** The line under "More settings": the picks in order, empty ones left out. */
export const settingsLine = (picks: (string | null | undefined | false)[]) => picks.filter(Boolean).join(", ");

export default function MoreSettings({ picks, children }: { picks: (string | null | undefined | false)[]; children: ReactNode }) {
  const [state, setState] = useUrlState<(typeof STATES)[number]>("more", "shut", { allowed: STATES });
  const open = state === "open";
  const id = useId();
  const line = settingsLine(picks);
  return (
    <div className="space-y-4">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setState(open ? "shut" : "open")}
        className="flex min-h-11 w-full items-center gap-3 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-semibold text-muted-foreground">More settings</span>
          {line && <span className="block truncate text-sm text-foreground">{line}</span>}
        </span>
        <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary">
          {open ? "Hide" : "Show"}
          <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} aria-hidden />
        </span>
      </button>
      {open && (
        <div id={id} className="space-y-4">
          {children}
        </div>
      )}
    </div>
  );
}
