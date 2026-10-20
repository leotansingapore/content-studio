// The frame every format page shares (/make/<slug>, docs/north-star/items/formats-slideshow.md): back, title and
// one line, the option cards with a sticky footer (price, uses left, the one main button), and the result panel.
// Two columns from 1024 px; on a phone the result sits under the options and the footer stays above the tab bar.

import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, Loader2 } from "lucide-react";
import PriceChip from "@/components/PriceChip";
import { Button } from "@/components/ui/button";
import { useUsesLeft } from "@/lib/aiUsage";
import { reasonText } from "@/lib/prices";
import type { UsageFeature } from "../../../supabase/functions/_shared/usageCaps.ts";

export interface ShellFooter {
  cap: UsageFeature;
  label: string;
  busyLabel: string;
  busy: boolean;
  disabled?: boolean;
  /** Why the button is off, shown under it; the cap's own line when it is used up. */
  reason?: string | null;
  /** A result is on screen: its own Schedule or Download is the main action, so this button steps down to outline. */
  secondary?: boolean;
  onMake(): void;
}

export default function FormatShell(p: { title: string; blurb: string; options: ReactNode; result: ReactNode; footer: ShellFooter }) {
  const navigate = useNavigate();
  const f = p.footer;
  const left = useUsesLeft(f.busy)(f.cap);
  const reason = f.reason ?? reasonText({ left, leo: true });
  // a page opened straight from a link has nothing to go back to in the app
  const back = () => ((window.history.state as { idx?: number } | null)?.idx ? navigate(-1) : navigate("/home"));
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <Button variant="ghost" size="sm" onClick={back} className="-ml-2 gap-1 text-muted-foreground">
          <ChevronLeft className="h-4 w-4" /> Back
        </Button>
        <h1 className="font-serif text-2xl font-semibold leading-tight tracking-tight text-foreground sm:text-3xl">{p.title}</h1>
        <p className="text-sm text-muted-foreground">{p.blurb}</p>
      </header>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] lg:items-start">
        <div className="min-w-0">
          <div className="space-y-5">{p.options}</div>
          {/* on a phone the right edge stays clear for the Ask button that floats there */}
          <div className="sticky bottom-[calc(3.75rem+env(safe-area-inset-bottom))] z-20 -mx-4 mt-5 border-t border-border/70 bg-background/95 py-3 pl-4 pr-[4.5rem] backdrop-blur-md sm:-mx-6 sm:pl-6 lg:bottom-0 lg:mx-0 lg:rounded-lg lg:border lg:px-4">
            <div className="flex items-center gap-3">
              <span className="min-w-0 flex-1" aria-live="polite">
                <PriceChip feature={f.cap} left={left} />
              </span>
              <Button onClick={f.onMake} disabled={f.busy || f.disabled || left === 0} variant={f.secondary ? "outline" : "default"} className="shrink-0 gap-1.5">
                {f.busy && <Loader2 className="h-4 w-4 animate-spin" />}
                {f.busy ? f.busyLabel : f.label}
              </Button>
            </div>
            {reason && !f.busy && <p className="mt-1.5 text-xs text-muted-foreground">{reason}</p>}
          </div>
        </div>
        <div className="min-w-0">{p.result}</div>
      </div>
    </div>
  );
}
