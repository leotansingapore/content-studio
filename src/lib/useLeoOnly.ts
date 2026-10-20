// The north-star gate as hooks (docs/north-star/README.md, "The gate"). One shared getSession() read for the
// whole app, so fifty Remix buttons cost one read and no Auth round trip (getUser holds the client lock).
// Hiding is a convenience: every paid call is also gated on the server (NORTH_STAR_USERS).
//
// DEV only (dropped from production builds): ?asLeo=1 on any localhost URL marks this tab as Leo, so a demo
// sign-in can check north-star work. It sticks for the tab (sessionStorage) until ?asLeo=0.

import { useEffect, useState } from "react";
import { leoOnly } from "@/lib/leoOnly";
import { SUPABASE_URL, supabase } from "@/lib/supabase";

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

const asLeo = (u: { id?: string; email?: string } | undefined): LeoUser | null =>
  u?.id && (leoOnly(u.email) || devAsLeo()) ? { id: u.id, email: u.email ?? "" } : null;

// The session supabase-js keeps on this device (its default storage key), read without the auth lock. getSession
// can take a second or more on load, and Leo's cards would show today's link until then and jump to Remix.
function storedLeo(): LeoUser | null | undefined {
  try {
    const raw = globalThis.localStorage?.getItem(`sb-${new URL(SUPABASE_URL).hostname.split(".")[0]}-auth-token`);
    const user = raw ? JSON.parse(raw)?.user : undefined;
    return user?.id ? asLeo(user) : undefined;
  } catch {
    return undefined;
  }
}

let pending: Promise<LeoUser | null | undefined> | null = null;
// The last answer, so a hook paints the right state on its first frame: the stored session's until getSession confirms.
let known: LeoUser | null | undefined = storedLeo();
let watching = false;

function readLeo(): Promise<LeoUser | null | undefined> {
  if (!watching) {
    watching = true;
    // A sign-in or sign-out reads the session again on the next hook mount.
    supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") known = undefined;
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") pending = null;
    });
  }
  const read = () =>
    supabase.auth.getSession().then(({ data }) => {
      known = asLeo(data.session?.user);
      return known;
    });
  // A read that loses the auth lock to another call on page load is not an answer: answering null there drops
  // Leo's ?remix= on a reload. Try once more, then answer the last known state (undefined, still unknown, if
  // none) and read again on the next mount.
  pending ??= read()
    .catch(() => new Promise((r) => setTimeout(r, 300)).then(read))
    .catch(() => {
      pending = null;
      return known ?? undefined;
    });
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
