// /settings/account (Settings > You; Fastlane's Settings > Account, the safe parts): the email and the ways this account
// signs in, read from the session; since when this browser is signed in, and Sign out (the shell's own, as in the account
// menu); and Appearance (the account menu's ThemeSwitch). Changing the email or password, the time zone and deleting the
// account are left out: they touch sign-in or scheduling. Nothing here is a view or filter, so the page has no URL params.
import { useEffect, useState, type ReactNode } from "react";
import { useOutletContext } from "react-router-dom";
import { CircleNotchIcon, SignOutIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import type { ThemeOutlet } from "@/lib/theme";
import { ThemeSwitch } from "@/pages/StudioLayout";

const METHOD: Record<string, string> = { email: "Email", google: "Google", apple: "Apple", azure: "Microsoft", linkedin_oidc: "LinkedIn", phone: "Phone" };

/** The ways the session says this account signs in ("Email", "Google"), once each, in the order they were added. */
export function signInMethods(identities: { provider: string }[] | null | undefined): string[] {
  return [...new Set((identities ?? []).map((i) => METHOD[i.provider] ?? i.provider))];
}

/** When this browser signed in: the first method's time in the access token's amr claim, or null when it has none. */
export function signedInSince(accessToken: string | null | undefined): Date | null {
  try {
    const part = accessToken?.split(".")[1];
    if (!part) return null;
    const amr = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/")))?.amr;
    const t = Array.isArray(amr) ? Math.min(...amr.map((a: { timestamp?: unknown }) => (typeof a?.timestamp === "number" ? a.timestamp : Infinity))) : Infinity;
    return Number.isFinite(t) ? new Date(t * 1000) : null;
  } catch {
    return null;
  }
}

const DAY = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="space-y-3 rounded-xl border border-border/70 bg-card p-4 sm:p-5">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      {children}
    </section>
  );
}

export default function AccountPage() {
  const shell = useOutletContext<ThemeOutlet | undefined>();
  const [me, setMe] = useState<{ email: string; methods: string[]; since: Date | null } | null>(null);
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    // getSession reads the stored session: no Auth round trip under the client lock
    void supabase.auth.getSession().then(({ data }) => {
      const s = data.session;
      setMe({ email: s?.user.email ?? "", methods: signInMethods(s?.user.identities), since: signedInSince(s?.access_token) });
    });
  }, []);
  const signOut = () => {
    if (!shell?.onSignOut || leaving) return;
    setLeaving(true);
    void shell.onSignOut();
  };

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="font-serif text-2xl font-semibold tracking-tight sm:text-3xl">Account</h1>
      <Card title="Sign-in">
        <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[8rem_1fr]">
          <dt className="text-muted-foreground">Email</dt>
          <dd className="min-w-0 font-medium text-foreground [overflow-wrap:anywhere]">{me ? me.email || "Not on this sign-in" : "..."}</dd>
          <dt className="text-muted-foreground">Signs in with</dt>
          <dd className="text-foreground">{me ? me.methods.join(", ") || "Email" : "..."}</dd>
        </dl>
      </Card>
      <Card title="This browser">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-foreground">{me?.since ? `Signed in since ${DAY.format(me.since)}` : "Signed in"}</p>
          <Button type="button" variant="outline" className="h-11 gap-2 sm:h-10" disabled={!shell?.onSignOut || leaving} onClick={signOut}>
            {leaving ? <CircleNotchIcon className="h-4 w-4 animate-spin" /> : <SignOutIcon className="h-4 w-4" />}
            {leaving ? "Signing out..." : "Sign out"}
          </Button>
        </div>
      </Card>
      {shell && (
        <Card title="Appearance">
          <div className="max-w-sm">
            <ThemeSwitch theme={shell.theme} onTheme={shell.onTheme} />
          </div>
        </Card>
      )}
    </div>
  );
}
