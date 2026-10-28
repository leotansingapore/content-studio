// Tests only: a device signed in as `uid` (the session supabase-js keeps), whose open brand answers "What do you do?"
// with `profession` (undefined: a kit with nothing set; null: no kit at all). Stubs window and localStorage; undo
// with vi.unstubAllGlobals().
import { vi } from "vitest";
import { SUPABASE_URL } from "@/lib/supabase";
import { BRAND_KEY_PREFIX } from "@/lib/carousel";

export const COACH = "Coach";

export function brandDevice(uid: string, profession?: string | null) {
  const m = new Map<string, string>();
  const local = {
    get length() {
      return m.size;
    },
    key: (i: number) => [...m.keys()][i] ?? null,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
  };
  local.setItem(`sb-${new URL(SUPABASE_URL).hostname.split(".")[0]}-auth-token`, JSON.stringify({ user: { id: uid } }));
  if (profession !== null) local.setItem(BRAND_KEY_PREFIX + uid, JSON.stringify(profession === undefined ? {} : { profession }));
  vi.stubGlobal("localStorage", local);
  vi.stubGlobal("sessionStorage", { ...local, getItem: () => null, setItem: () => {} });
  vi.stubGlobal("window", {
    localStorage: local,
    sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    location: new URL("http://localhost/"),
    history: { state: null, replaceState() {} },
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => true,
  });
  return local;
}
