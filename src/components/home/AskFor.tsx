// "Ask the agent for" on Leo's Home (docs/north-star/items/agent-home.md): five tiles, each putting its example in the
// composer without sending, or, folded, one line of words that do the same. The fold is remembered on this device.

import { useState } from "react";
import { CalendarRange, Layers, PenLine, Repeat2, Video } from "lucide-react";
import { askForExamples } from "@/lib/askFor";
import { loadPositioning } from "@/lib/positioning";
import { scoped } from "@/lib/profiles";
import { speakerFor } from "@/lib/remixBrand";
import { cn } from "@/lib/utils";

const ICONS = [Repeat2, Layers, Video, CalendarRange, PenLine];
const LINK = "inline-flex min-h-9 items-center rounded-md px-2 text-sm font-medium text-primary hover:bg-accent [@media(pointer:coarse)]:min-h-11";

export default function AskFor({ userId, onPick, className }: { userId: string; onPick: (text: string) => void; className?: string }) {
  const key = `cs-home-askfor-${scoped(userId)}`;
  const [compact, setCompact] = useState(() => {
    try {
      return localStorage.getItem(key) === "compact";
    } catch {
      return false;
    }
  });
  const fold = (on: boolean) => {
    setCompact(on);
    try {
      if (on) localStorage.setItem(key, "compact");
      else localStorage.removeItem(key);
    } catch {
      /* blocked storage: folded for this visit only */
    }
  };
  const tiles = askForExamples(loadPositioning(userId), speakerFor(userId));

  return (
    <section id="ask" aria-labelledby="ask-label" className={cn("scroll-mt-20", className)}>
      {compact ? (
        <div className="flex flex-wrap items-center gap-x-1 gap-y-1">
          <h2 id="ask-label" className="mr-1 text-sm font-semibold text-foreground">
            Ask the agent for
          </h2>
          {tiles.map((t) => (
            <button key={t.short} type="button" onClick={() => onPick(t.example)} className={LINK}>
              {t.short}
            </button>
          ))}
          <button type="button" onClick={() => fold(false)} aria-expanded={false} className={cn(LINK, "ml-auto text-xs text-muted-foreground")}>
            Show examples
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h2 id="ask-label" className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              ASK THE AGENT FOR
            </h2>
            <button type="button" onClick={() => fold(true)} aria-expanded className={cn(LINK, "text-xs text-muted-foreground")}>
              Hide
            </button>
          </div>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {tiles.map((t, i) => {
              const Icon = ICONS[i];
              return (
                <li key={t.title}>
                  <button
                    type="button"
                    onClick={() => onPick(t.example)}
                    className="flex h-full min-h-11 w-full items-start gap-3 rounded-xl border border-border/70 bg-card p-3 text-left shadow-card transition-colors hover:border-primary/40 hover:bg-accent/60"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-foreground">{t.title}</span>
                      <span className="block text-xs text-muted-foreground">"{t.example}"</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-muted-foreground">Tap one to start it in the box. Anything paid shows its price first.</p>
        </div>
      )}
    </section>
  );
}
