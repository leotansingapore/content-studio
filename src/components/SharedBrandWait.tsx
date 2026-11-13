// Shown in place of the studio when a brand shared with this account is open but this device has never loaded it
// (docs/shared-brands.md): nobody types into an empty copy that the owner's real one would then replace.
import { useState } from "react";
import { CircleNotchIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { DEFAULT_PROFILE_ID, setActiveProfile } from "@/lib/profiles";

export default function SharedBrandWait({ userId, name }: { userId: string; name: string }) {
  const [busy, setBusy] = useState(false);
  const go = (own: boolean) => {
    setBusy(true);
    if (own) setActiveProfile(userId, DEFAULT_PROFILE_ID);
    window.location.reload();
  };
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md space-y-5 rounded-xl border border-border/70 bg-card p-6 text-center sm:p-8">
        <h1 className="font-serif text-2xl font-semibold tracking-tight text-foreground">Can't reach {name} right now</h1>
        <p className="text-sm text-muted-foreground">Check your connection, then try again.</p>
        <Button type="button" size="lg" className="w-full" disabled={busy} onClick={() => go(false)}>
          {busy && <CircleNotchIcon className="mr-2 h-4 w-4 animate-spin" />}
          Try again
        </Button>
        <button
          type="button"
          disabled={busy}
          onClick={() => go(true)}
          className="inline-flex min-h-11 items-center text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          Open my own brand
        </button>
      </div>
    </main>
  );
}
