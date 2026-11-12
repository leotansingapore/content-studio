// /people?tab=presenters as Fastlane's Influencers: a grid of faces with the New presenter card first, the brand's
// Who appears under it. Drawn to markup in node.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  const store = new Map<string, string>();
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
  };
  (globalThis as { localStorage?: unknown }).localStorage = storage;
});
// markup in node has no server snapshot for the make's store: read the client one
vi.mock("react", async (actual) => {
  const r = await actual<typeof import("react")>();
  const useSyncExternalStore = <T,>(sub: (cb: () => void) => () => void, get: () => T, server?: () => T) => r.useSyncExternalStore(sub, get, server ?? get);
  return { ...r, default: { ...r, useSyncExternalStore }, useSyncExternalStore };
});
vi.mock("@/lib/supabase", () => ({
  SUPABASE_URL: "https://abc.supabase.co",
  SUPABASE_ANON_KEY: "",
  supabase: { auth: { getUser: () => new Promise(() => undefined), getSession: () => new Promise(() => undefined), onAuthStateChange: () => ({}) }, functions: { invoke: vi.fn() } },
}));

const { default: PresentersTab } = await import("./PresentersTab");
const U = "u1";
const JPEG = `data:image/jpeg;base64,${Buffer.from("face").toString("base64")}`;
const seed = (n: number) =>
  localStorage.setItem(
    `content-studio-presenters-${U}`,
    JSON.stringify({
      who: "ask",
      prefs: {},
      items: Array.from({ length: n }, (_, i) => ({ id: `pr-a${i}`, name: `P${i}`, look: "A woman", url: "https://x.example/p.png", photo: JPEG, createdAt: "2026-11-01T00:00:00Z", status: "on" })),
    }),
  );
const html = () => renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: ["/people?tab=presenters"] }, createElement(PresentersTab, { userId: U })));

afterEach(() => localStorage.clear());

describe("presenters as a face grid", () => {
  it("puts the New presenter card first in the grid, then each face, then Who appears", () => {
    seed(2);
    const page = html();
    const grid = page.indexOf("<ul");
    expect(page.indexOf("New presenter")).toBeGreaterThan(grid);
    expect(page.indexOf("New presenter")).toBeLessThan(page.indexOf('alt="P0, AI presenter"'));
    expect(page.indexOf('alt="P1, AI presenter"')).toBeLessThan(page.indexOf('id="who-appears"'));
  });

  it("starts with the New presenter card alone, and no second make button", () => {
    const page = html();
    expect(page).toContain("New presenter");
    expect(page).not.toContain("Make a presenter");
  });
});
