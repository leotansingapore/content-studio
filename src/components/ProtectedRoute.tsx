import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { CircleNotchIcon } from "@phosphor-icons/react";

import { supabase } from "@/lib/supabase";
import { cloudSyncOutOfRoom, initCloudSync } from "@/lib/cloudSync";
import { returnTo } from "@/lib/magicLink";
import { rememberUser } from "@/lib/profiles";
import { toast } from "@/hooks/use-toast";

let toldOutOfRoom = false;

export default function ProtectedRoute({
  children,
}: {
  children: React.ReactNode;
}) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
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
        await initCloudSync(data.session.user.id).catch(() => undefined);
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
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
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

  return <>{children}</>;
}
