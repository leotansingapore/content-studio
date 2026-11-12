// The one screen an account sees in place of the studio when its cs_subscriptions row gives no access
// (docs/postmosis-billing.md): what happened, one button to put it right, and sign out.
import { useState } from "react";
import { CircleNotchIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { stopCloudSync } from "@/lib/cloudSync";
import { forgetMarketShown } from "@/lib/market";
import { disablePushHere } from "@/lib/notify";
import { forgetMe } from "@/lib/reelsBoard";
import { forgetSocialConnect } from "@/lib/socialConnect";
import { openBillingPortal, paywallFor, type SubRow } from "@/lib/subscription";
import { supabase } from "@/lib/supabase";

export default function Paywall({ row, email }: { row: SubRow; email: string }) {
  const p = paywallFor(row);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");

  const go = async () => {
    setBusy(true);
    setProblem("");
    try {
      await openBillingPortal(p.action === "restart");
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "Couldn't open billing. Try again in a minute.");
      setBusy(false);
    }
  };

  // the same steps as the studio's own Sign out (StudioLayout handleSignOut)
  const signOut = async () => {
    await Promise.race([disablePushHere().catch(() => undefined), new Promise((r) => setTimeout(r, 2_000))]);
    await stopCloudSync().catch(() => undefined);
    forgetSocialConnect();
    forgetMarketShown();
    forgetMe();
    await supabase.auth.signOut({ scope: "local" });
    window.location.replace("/auth");
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md space-y-5 rounded-xl border border-border/70 bg-card p-6 text-center sm:p-8">
        <h1 className="font-serif text-2xl font-semibold tracking-tight text-foreground">{p.title}</h1>
        <p className="text-sm text-muted-foreground">{p.body}</p>
        <Button type="button" size="lg" className="w-full" disabled={busy} onClick={go}>
          {busy && <CircleNotchIcon className="mr-2 h-4 w-4 animate-spin" />}
          {p.button}
        </Button>
        {problem && <p role="alert" className="text-sm text-destructive">{problem}</p>}
        <button type="button" onClick={signOut} className="inline-flex min-h-11 items-center text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
          Sign out{email ? ` of ${email}` : ""}
        </button>
      </div>
    </main>
  );
}
