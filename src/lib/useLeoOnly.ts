// The north-star gate as hooks (docs/north-star/README.md, "The gate"). One shared getSession() read for the
// whole app, so fifty Remix buttons cost one read and no Auth round trip (getUser holds the client lock).
// Hiding is a convenience: every paid call is also gated on the server (NORTH_STAR_USERS).
//
// DEV only (dropped from production builds): ?asLeo=1 on any localhost URL marks this tab as Leo, so a demo
// sign-in can check north-star work. It sticks for the tab (sessionStorage) until ?asLeo=0.

import { useEffect, useState } from "react";
import { leoOnly } from "@/lib/leoOnly";
import { supabase } from "@/lib/supabase";

export interface LeoUser {
  id: string;
  email: string;
}

const DEV_KEY = "cs-dev-as-leo";

function devAsLeo(): boolean {
  if (!import.meta.env.DEV || typeof window === "undefined") return false;
  try {
    const p = new URLSearchParams(window.location.search).get("asLeo");
    if (p === "1") sessionStorage.setItem(DEV_KEY, "1");
    if (p === "0") sessionStorage.removeItem(DEV_KEY);
    return sessionStorage.getItem(DEV_KEY) === "1";
  } catch {
    return false;
  }
}

let pending: Promise<LeoUser | null> | null = null;
// The last answer, so a hook mounted after the first read paints the right state on its first frame.
let known: LeoUser | null | undefined;
let watching = false;

function readLeo(): Promise<LeoUser | null> {
  if (!watching) {
    watching = true;
    // A sign-in or sign-out reads the session again on the next hook mount.
    supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") known = undefined;
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") pending = null;
    });
  }
  pending ??= supabase.auth.getSession().then(
    ({ data }) => {
      const u = data.session?.user;
      known = u && (leoOnly(u.email) || devAsLeo()) ? { id: u.id, email: u.email ?? "" } : null;
      return known;
    },
    () => null,
  );
  return pending;
}

/** Leo's user once the session is read; null for everyone else; undefined while it is still being read. */
export function useLeoUser(): LeoUser | null | undefined {
  const [user, setUser] = useState<LeoUser | null | undefined>(known);
  useEffect(() => {
    let live = true;
    readLeo().then((u) => live && setUser(u));
    return () => {
      live = false;
    };
  }, []);
  return user;
}

/** True only for Leo's sign-ins, once the session is read (false while loading). */
export function useLeoOnly(): boolean {
  return Boolean(useLeoUser());
}

/** For code outside React (job runners): the same answer as the hooks. */
export const leoUser = readLeo;
