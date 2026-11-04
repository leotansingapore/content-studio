// Research drawn from what this device holds: the feed's best reel first with its way into Clone a reel, the Mac's
// pause said plainly, and the watch list. Static render, so no read is filed.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
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
const UID = "6d80f027-3395-480c-86a1-8827d3d6cce3";
vi.mock("@/lib/useLeoOnly", async (actual) => ({ ...(await actual<typeof import("@/lib/useLeoOnly")>()), useLeoUser: () => ({ id: UID, email: "x" }) }));

import ResearchPage from "./ResearchPage";
import { scoped } from "@/lib/profiles";

const day = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();
const reel = (code: string, views: number, d: number) => ({ code, views, likes: 10, comments: 2, pinned: false, takenAt: day(d), thumb: "", caption: `caption ${code}` });
const html = (q = "") => renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [`/research${q}`] }, createElement(ResearchPage)));
const seed = () => {
  store.set(`content-studio-research-${scoped(UID)}`, JSON.stringify({ creators: [{ handle: "made.up_creator", addedAt: day(5), name: "Made Up", followers: 120400 }], skipped: [] }));
  store.set(`cs-research-reads-${scoped(UID)}`, JSON.stringify({ "made.up_creator": { at: day(0), avatar: "", reels: [reel("DA00000001", 1000, 5), reel("DA00000002", 1100, 6), reel("DA00000003", 900, 7), reel("DA00000004", 40_000, 8)] } }));
};

afterEach(() => store.clear());

describe("Research", () => {
  it("puts the reel furthest over its creator's usual first, with Clone a reel one tap away", () => {
    seed();
    const out = html();
    expect(out).toContain("caption DA00000004");
    // a reel at about its creator's usual isn't beating it
    expect(out).not.toContain("caption DA00000001");
    expect(out).toContain(`href="/clone?url=https%3A%2F%2Fwww.instagram.com%2Freel%2FDA00000004%2F"`);
    expect(out).toContain("All 1 read in the last 2 days.");
  });

  it("says plainly when Instagram paused the Mac's reads and when they start again", () => {
    seed();
    store.set("cs-research-pause", JSON.stringify({ until: new Date(Date.now() + 3_600_000).toISOString(), why: "login" }));
    expect(html()).toContain("Instagram stopped this Mac&#x27;s reads (it showed a login wall). They start again by themselves at");
  });

  it("lists who is watched, out of 100, and asks for creators when there are none", () => {
    seed();
    expect(html("?tab=creators")).toContain("Watching 1 of 100");
    store.clear();
    expect(html()).toContain("Add creators");
  });
});
