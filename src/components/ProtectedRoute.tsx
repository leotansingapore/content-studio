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

export default function ProtectedRoute({
  children,
}: {
  children: React.ReactNode;
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
