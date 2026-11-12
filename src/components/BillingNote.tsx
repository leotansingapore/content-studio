// The studio's one quiet line of billing state (docs/postmosis-billing.md): a trial's days left with the charge
// date and amount, or a failed payment, with the way to Stripe's portal beside it. Nothing for everyone else.
import { useState } from "react";
import { billingLine, openBillingPortal, subscriptionNow } from "@/lib/subscription";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export default function BillingNote() {
  const [busy, setBusy] = useState(false);
  const line = billingLine(subscriptionNow(), Date.now());
  if (!line) return null;
  const open = async () => {
    setBusy(true);
    try {
      await openBillingPortal();
    } catch (e) {
      toast({ title: "Couldn't open billing", description: e instanceof Error ? e.message : "Try again in a minute.", variant: "destructive" });
      setBusy(false);
    }
  };
  return (
    <div
      role={line.warn ? "alert" : "status"}
      className={cn(
        "mb-4 flex items-center justify-between gap-x-3 rounded-lg border px-3 py-1.5 text-xs",
        line.warn ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200" : "border-border/60 text-muted-foreground",
      )}
    >
      <span className="min-w-0">{line.text}</span>
      <button type="button" onClick={open} disabled={busy} className="inline-flex min-h-11 shrink-0 items-center whitespace-nowrap font-semibold text-primary underline-offset-4 hover:underline disabled:opacity-60 sm:min-h-8">
        {busy ? "Opening..." : line.warn ? "Update your card" : "Manage billing"}
      </button>
    </div>
  );
}
