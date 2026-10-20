// The "Breakdown" row in the Remix sheet, under the source card (docs/north-star/items/remix-teardown.md). Collapsed
// by default; nothing runs until it is opened (or Remix is pressed, through the job's own ensureTeardown). The open
// state is the sheet's ?breakdown=open flag, passed in. Leo only, like the sheet that mounts it.

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";
import PriceChip from "@/components/PriceChip";
import { useUsesLeft } from "@/lib/aiUsage";
import { hookFormula } from "@/lib/hookFormulas";
import { ensureTeardown, localTeardown, teardownError, teardownFooter, type Teardown } from "@/lib/remixTeardown";
import type { RemixSource } from "@/lib/remixSource";

const LABEL = "pt-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground";
const TEXT = "min-w-0 text-sm leading-relaxed text-foreground/85 [overflow-wrap:anywhere]";

export default function BreakdownRow(p: { userId: string; source: RemixSource; text: string; open: boolean; onOpen(open: boolean): void }) {
  const { userId, source, text, open, onOpen } = p;
  const [teardown, setTeardown] = useState<Teardown | null>(() => localTeardown(userId, source));
  const [phase, setPhase] = useState<"idle" | "loading" | "failed">("idle");
  const [error, setError] = useState<{ text: string; retry: boolean } | null>(null);
  const [slow, setSlow] = useState(false);
  const left = useUsesLeft(phase === "loading");
  const current = useRef(source.key);

  // Another source in the same sheet starts from what this device has for it.
  useEffect(() => {
    current.current = source.key;
    setTeardown(localTeardown(userId, source));
    setPhase("idle");
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, source.key]);

  const load = useCallback(() => {
    const key = source.key;
    setPhase("loading");
    setError(null);
    ensureTeardown(userId, source, text).then(
      (t) => {
        if (current.current !== key) return;
        setTeardown(t);
        setPhase("idle");
      },
      (e) => {
        if (current.current !== key) return;
        setError(teardownError(e));
        setPhase("failed");
      },
    );
  }, [userId, source, text]);

  useEffect(() => {
    if (open && !teardown && phase === "idle") load();
  }, [open, teardown, phase, load]);

  // A fresh reel read can take up to 55 s, so the loading line says so after 5 s.
  useEffect(() => {
    setSlow(false);
    if (phase !== "loading") return;
    const id = window.setTimeout(() => setSlow(true), 5000);
    return () => window.clearTimeout(id);
  }, [phase]);

  const bodyId = `breakdown-${source.key}`;
  return (
    <section aria-label="Breakdown" className="rounded-lg border border-border/60 bg-card">
      <div className="flex items-center justify-between gap-2 py-1.5 pl-3 pr-1.5">
        <h3 className="text-sm font-semibold text-foreground">Breakdown</h3>
        <div className="flex min-w-0 items-center gap-2">
          {!teardown && (
            // wraps to two right-aligned lines beside "See it" on a phone
            <span className="min-w-0 text-right leading-tight">
              <PriceChip feature="remix-teardown" left={left("remix-teardown")} />
            </span>
          )}
          <Button type="button" variant="ghost" size="sm" aria-expanded={open} aria-controls={bodyId} onClick={() => onOpen(!open)}>
            {open ? "Hide it" : "See it"}
            <ChevronDown className={`transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
          </Button>
        </div>
      </div>

      {open && (
        <div id={bodyId} className="border-t border-border/60 px-3 pb-3 pt-3">
          {phase === "loading" ? (
            <div role="status" className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Breaking it down...
                {slow && source.format === "video" && " Reading the video. This can take up to a minute."}
              </p>
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-3">
                  <div className="h-3 w-14 animate-pulse rounded bg-muted" />
                  <div className={`h-3 animate-pulse rounded bg-muted ${i % 2 ? "w-2/3" : "w-full"}`} />
                </div>
              ))}
            </div>
          ) : phase === "failed" && error ? (
            <div className="space-y-2">
              <p className="text-sm text-foreground/85">{error.text}</p>
              {error.retry && (
                <Button type="button" variant="outline" size="sm" onClick={load}>
                  Try again
                </Button>
              )}
            </div>
          ) : teardown ? (
            <Rows t={teardown} />
          ) : null}
        </div>
      )}
    </section>
  );
}

function Rows({ t }: { t: Teardown }) {
  const formula = hookFormula(t.hook.formula ?? undefined);
  const footer = teardownFooter(t);
  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-3 gap-y-3">
        <dt className={LABEL}>Hook</dt>
        <dd className={`${TEXT} text-foreground`}>"{t.hook.line}"</dd>
        {t.hook.pattern && (
          <>
            <dt className={LABEL}>Pattern</dt>
            <dd className={TEXT}>
              {t.hook.pattern}
              {formula && (
                <span className="ml-2 inline-flex rounded-full border border-primary/30 bg-primary/5 px-2 py-0.5 align-middle text-[11px] font-medium text-primary">
                  {formula.name}
                </span>
              )}
            </dd>
          </>
        )}
        <dt className={LABEL}>Beats</dt>
        <dd className="min-w-0">
          <ol className="space-y-1.5">
            {t.beats.map((beat, i) => (
              <li key={i} className={`flex gap-2 ${TEXT}`}>
                <span className="tabular-nums text-muted-foreground">{i + 1}.</span>
                <span className="min-w-0">{beat}</span>
              </li>
            ))}
          </ol>
        </dd>
        {t.payoff && (
          <>
            <dt className={LABEL}>Payoff</dt>
            <dd className={TEXT}>{t.payoff}</dd>
          </>
        )}
        <dt className={LABEL}>Asks for</dt>
        <dd className={TEXT}>{t.cta}</dd>
        {t.pacing && (
          <>
            <dt className={LABEL}>Pacing</dt>
            <dd className={TEXT}>{t.pacing}</dd>
          </>
        )}
        {t.whyItWorked && (
          <>
            <dt className={LABEL}>Why it worked</dt>
            <dd className={TEXT}>{t.whyItWorked}</dd>
          </>
        )}
        {t.dontReuse.length > 0 && (
          <>
            <dt className={`${LABEL} flex items-start gap-0.5`}>
              <span>Won't reuse</span>
              <InfoTip label="About Won't reuse" className="-mt-1.5 h-5 w-5">
                Numbers, claims and names from the original stay out of your version.
              </InfoTip>
            </dt>
            <dd className="flex min-w-0 flex-wrap gap-1.5">
              {t.dontReuse.map((item) => (
                <span key={item} className="rounded-md bg-muted px-2 py-0.5 text-xs text-foreground/85 [overflow-wrap:anywhere]">
                  "{item}"
                </span>
              ))}
            </dd>
          </>
        )}
      </dl>
      {footer && <p className="text-xs text-muted-foreground">{footer}</p>}
    </div>
  );
}
