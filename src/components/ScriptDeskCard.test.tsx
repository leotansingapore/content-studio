// The script desk card on Clone a reel, drawn from what the device kept for a post: a re-script whose claim check
// never came back is shown, with the check to run again, never thrown away.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => {
  const m = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
  };
  return m;
});
vi.mock("@/lib/edgeFn", async (orig) => ({ ...(await orig<typeof import("@/lib/edgeFn")>()), callFn: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { auth: { getSession: () => new Promise(() => undefined) } }, SUPABASE_URL: "https://x.supabase.co" }));

import ScriptDeskCard from "./ScriptDeskCard";
import { scoped } from "@/lib/profiles";

const UID = "6d80f027-3395-480c-86a1-8827d3d6cce3";
const POST = "instagram-DMadeUp0001";
const html = () => renderToStaticMarkup(createElement(ScriptDeskCard, { userId: UID, url: "https://www.instagram.com/reel/DMadeUp0001/", postId: POST, hasWords: true }));
const kept = (v: unknown) => store.set(`cs-desk-reel-${POST}-${scoped(UID)}`, JSON.stringify(v));

afterEach(() => store.clear());

describe("the script desk card", () => {
  it("keeps a re-script whose claim check failed, says it isn't checked, and offers the check again", () => {
    kept({ at: 1, rescript: { script: "I'm Priya and Counterbook keeps 90 cafes.", changes: [], fill: [], job: "re1", check: null } });
    const out = html();
    expect(out).toContain("I&#x27;m Priya and Counterbook keeps 90 cafes.");
    expect(out).toContain("Claims not checked yet");
    expect(out).toContain("Check claims");
  });

  it("shows the checked script once the check came back, and no check button", () => {
    kept({ at: 1, rescript: { script: "a", changes: [], fill: [], job: "re1", check: { unsupported: [{ sentence: "a", claim: "90 cafes", fixed: "[how many]" }], script: "[how many]" } } });
    const out = html();
    expect(out).toContain("[how many]");
    expect(out).toContain("90 cafes");
    expect(out).not.toContain("Check claims");
  });
});
