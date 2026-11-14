import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { CircleNotchIcon } from "@phosphor-icons/react";

import { supabase } from "@/lib/supabase";
import { brandSyncReady } from "@/lib/brandSync";
import { cloudSyncOutOfRoom, initCloudSync, SHARED_LOST_EVENT } from "@/lib/cloudSync";
import { returnTo } from "@/lib/magicLink";
import { activeProfile, rememberUser } from "@/lib/profiles";
import { lostMessage } from "@/lib/sharedBrands";
import { loadSubscription, paywallRow, type SubRow } from "@/lib/subscription";
import Paywall from "@/components/Paywall";
import SharedBrandWait from "@/components/SharedBrandWait";
import { toast } from "@/hooks/use-toast";

let toldOutOfRoom = false;

/** The studio's panels, empty, while the session and the sync pull are read: the frame StudioLayout draws (its widths
 * and colours), so the page fills in where the person is already looking rather than after a lone spinner. */
function StudioShell() {
  return (
    <div className="min-h-screen bg-canvas lg:bg-rail" aria-busy="true">
      <span role="status" className="sr-only">Loading your studio</span>
      <div className="fixed inset-y-0 left-0 hidden w-[var(--nav-w)] p-2.5 lg:flex">
        <div className="w-full rounded-[20px] bg-sidebar">
          <div className="flex pl-2 pt-4">
            <span className="grid h-10 w-10 place-items-center">
              <span className="h-9 w-9 rounded-xl bg-gradient-primary shadow-elegant" />
            </span>
          </div>
        </div>
      </div>
      <div className="flex items-center border-b border-border/70 bg-background/85 px-4 py-1.5 lg:hidden">
        <span className="flex min-h-11 items-center">
          <span className="h-9 w-9 rounded-xl bg-gradient-primary shadow-elegant" />
        </span>
      </div>
      <div className="lg:py-2.5 lg:pl-[var(--nav-w)] lg:pr-2.5">
        <div className="lg:min-h-[calc(100vh-1.25rem)] lg:rounded-[20px] lg:bg-canvas">
          <div className="mx-auto max-w-5xl space-y-3 px-4 pt-6 sm:px-6 sm:pt-8 lg:px-6 xl:px-10">
            <div className="h-8 w-48 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />
            <div className="h-4 w-72 max-w-full animate-pulse rounded bg-muted/70 motion-reduce:animate-none" />
          </div>
        </div>
      </div>
      <div className="fixed inset-x-0 bottom-0 h-14 border-t border-border/70 bg-background/95 lg:hidden" />
    </div>
  );
}

export default function ProtectedRoute({
  children,
  shell,
}: {
  children: React.ReactNode;
  /** Draw the studio's empty frame while loading, not a spinner (the routes inside StudioLayout). */
  shell?: boolean;
}) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  // the row the paywall shows (docs/postmosis-billing.md, and docs/shared-brands.md for an invited account); null opens
  const [wall, setWall] = useState<SubRow | null>(null);
  // a brand shared with this account that is open but this device has never loaded
  const [waitFor, setWaitFor] = useState<string | null>(null);
  const location = useLocation();

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      // Pull cloud workspace data before the app renders, so every feature
      // reads the freshest cross-device state from localStorage.
      if (data.session) {
        // known before any page draws, so a page can tell a pending brand switch from the brand already open
        rememberUser(data.session.user.id);
        const user = data.session.user;
        const [, row] = await Promise.all([initCloudSync(user.id).catch(() => undefined), loadSubscription(user.id)]);
        const shown = await paywallRow(row, !!user.app_metadata?.postmosis_invited_by);
        const open = activeProfile(user.id);
        if (mounted) {
          setWall(shown);
          setWaitFor(open.shared && !brandSyncReady(user.id, open.shared.brand, window.localStorage) ? open.name : null);
        }
        if (cloudSyncOutOfRoom() && !toldOutOfRoom) {
          toldOutOfRoom = true;
          toast({
            title: "This device is out of room",
            description: "Some of your work from other devices isn't on this one. Clear some space, then reload.",
            variant: "destructive",
          });
        }
      }
      if (!mounted) return;
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, sess) => {
      setSession(sess);
    });
    // a save to a shared brand that didn't land: the person hears why, and the copy on screen is the cloud's
    const lost = (e: Event) => toast({ title: "Not saved", description: lostMessage((e as CustomEvent<{ why: string }>).detail?.why ?? ""), variant: "destructive" });
    window.addEventListener(SHARED_LOST_EVENT, lost);
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
      window.removeEventListener(SHARED_LOST_EVENT, lost);
    };
  }, []);

  if (loading && shell) return <StudioShell />;
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        <CircleNotchIcon className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (!session) {
    // Remember where they were heading so login returns them there.
    return (
      <Navigate
        to="/auth"
        replace
        state={returnTo(location.pathname, location.search, location.hash)}
      />
    );
  }

  if (wall) return <Paywall row={wall} email={session.user.email ?? ""} />;
  if (waitFor) return <SharedBrandWait userId={session.user.id} name={waitFor} />;

  return <>{children}</>;
}
