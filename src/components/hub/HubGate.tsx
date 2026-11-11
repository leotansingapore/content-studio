import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { fetchMembership, hubAccess, type HubMembership } from "@/lib/hub";
import HubPaywallPage from "@/pages/hub/HubPaywallPage";

type HubCtx = {
  membership: HubMembership | null;
  access: "admin" | "member" | "locked";
  refresh: () => Promise<void>;
};

const Ctx = createContext<HubCtx | null>(null);

export function useHub() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useHub outside HubGate");
  return v;
}

export default function HubGate() {
  const [membership, setMembership] = useState<HubMembership | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setMembership(await fetchMembership());
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  const retry = () => {
    setLoading(true);
    refresh().finally(() => setLoading(false));
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (failed && !membership) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3 text-center">
        <p className="text-sm text-muted-foreground">Couldn't load your hub access. Check your connection.</p>
        <Button variant="outline" size="sm" onClick={retry}>
          Try again
        </Button>
      </div>
    );
  }

  const access = hubAccess(membership);
  return (
    <Ctx.Provider value={{ membership, access, refresh }}>
      {access === "locked" ? <HubPaywallPage /> : <Outlet />}
    </Ctx.Provider>
  );
}
