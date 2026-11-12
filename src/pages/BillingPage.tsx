// /settings/billing (Settings > You): the plan as it stands and the way to Stripe's portal, where the card, the
// invoices and cancelling live (docs/postmosis-billing.md). The tile shows only for an account with a
// cs_subscriptions row; the address still opens for anyone and says there is nothing to pay.
import { useState } from "react";
import { CircleNotchIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { billingSummary, openBillingPortal, subscriptionNow } from "@/lib/subscription";

export default function BillingPage() {
  const row = subscriptionNow();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const open = async () => {
    setBusy(true);
    setProblem("");
    try {
      await openBillingPortal();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "Couldn't open billing. Try again in a minute.");
      setBusy(false);
    }
  };
  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="font-serif text-2xl font-semibold tracking-tight sm:text-3xl">Billing</h1>
      <div className="space-y-4 rounded-xl border border-border/70 bg-card p-4 sm:p-5">
        <p className="text-sm text-foreground">{billingSummary(row, Date.now())}</p>
        {row?.stripe_customer_id && (
          <div className="space-y-2">
            <Button type="button" className="h-11 sm:h-10" disabled={busy} onClick={open}>
              {busy && <CircleNotchIcon className="mr-2 h-4 w-4 animate-spin" />}
              Manage billing
            </Button>
            <p className="text-xs text-muted-foreground">Change your card, see invoices or cancel. Opens Stripe.</p>
            {problem && <p role="alert" className="text-sm text-destructive">{problem}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
