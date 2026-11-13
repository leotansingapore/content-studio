import { useCallback, useEffect, useState } from "react";
import { ArrowSquareOutIcon, ArrowsClockwiseIcon, CircleNotchIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { heldWhen, loadHeld, reasonWords, type HeldList } from "@/lib/heldPayments";
import { useLeoUser } from "@/lib/useLeoOnly";
import NotFoundPage from "@/pages/NotFoundPage";

export default function HeldPaymentsPage() {
  const leo = useLeoUser();
  if (leo === undefined) return <div className="min-h-[40vh]" aria-busy="true" />;
  if (!leo) return <NotFoundPage notOnAccount />;
  return <HeldPayments />;
}

function HeldPayments() {
  const [list, setList] = useState<HeldList | null>(null);
  const [problem, setProblem] = useState("");
  const [busy, setBusy] = useState(true);
  const read = useCallback(async () => {
    setBusy(true);
    setProblem("");
    try {
      setList(await loadHeld());
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "Couldn't load held payments. Try again in a minute.");
    } finally {
      setBusy(false);
    }
  }, []);
  useEffect(() => {
    void read();
  }, [read]);
  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1.5">
          <h1 className="font-serif text-2xl font-semibold tracking-tight sm:text-3xl">Held payments</h1>
          <p className="text-sm text-muted-foreground">Paid checkouts that weren't attached to an account. Attach or refund each one in Stripe. This page only reads.</p>
        </div>
        <Button type="button" variant="outline" className="h-11 gap-1.5 sm:h-9" disabled={busy} onClick={() => void read()}>
          {busy ? <CircleNotchIcon className="h-4 w-4 animate-spin" /> : <ArrowsClockwiseIcon className="h-4 w-4" />} Refresh
        </Button>
      </div>
      {list?.test && <p className="w-fit rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900 dark:bg-amber-500/15 dark:text-amber-200">Stripe test mode</p>}
      {problem && (
        <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {problem}
        </p>
      )}
      {!list && busy && <div className="h-24 animate-pulse rounded-xl bg-muted/60" aria-busy="true" />}
      {list && list.rows.length === 0 && <p className="rounded-xl border border-border/70 bg-card px-4 py-6 text-center text-sm text-muted-foreground">Nothing is held. Every paid checkout is on its account.</p>}
      {list && list.rows.length > 0 && (
        <ul className="divide-y divide-border/70 overflow-hidden rounded-xl border border-border/70 bg-card" aria-label="Held payments">
          {list.rows.map((r) => (
            <li key={r.subscription} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <div className="min-w-0 space-y-1">
                <p className="truncate text-sm font-semibold text-foreground">{r.email}</p>
                <p className="text-sm text-muted-foreground">{reasonWords(r.reason)}</p>
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  <span className="rounded-full bg-muted px-2 py-0.5 font-medium text-foreground">{r.status}</span>
                  <span>{heldWhen(r.at)}</span>
                  <span className="font-mono">{r.subscription}</span>
                </p>
              </div>
              <a href={r.link} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 shrink-0 items-center gap-1 text-sm font-semibold text-primary hover:underline sm:min-h-9">
                Open in Stripe <ArrowSquareOutIcon className="h-4 w-4" aria-hidden="true" />
              </a>
            </li>
          ))}
        </ul>
      )}
      {list?.more && <p className="text-xs text-muted-foreground">Showing the newest 200. The rest are in cs_held_checkouts.</p>}
    </div>
  );
}
