// /make/slideshow: what to say and how to mention the brand show; the size and where the pictures come from fold under
// More settings, named in its line, while money and a missing requirement stay in view. Rendered to markup.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({
  SUPABASE_URL: "https://abc.supabase.co",
  SUPABASE_ANON_KEY: "",
  supabase: { auth: { getUser: () => new Promise(() => undefined), getSession: () => new Promise(() => undefined), onAuthStateChange: () => ({}) }, functions: { invoke: vi.fn() } },
}));
vi.mock("@/lib/useLeoOnly", () => ({ useLeoUser: () => null, useLeoOnly: () => false, useSignedInUser: () => null }));

const { default: Slideshow, showPicks } = await import("./Slideshow");

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  const ls = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k), key: () => null, length: 0 };
  vi.stubGlobal("localStorage", ls);
  vi.stubGlobal("window", { localStorage: ls, matchMedia: () => ({ matches: false }), addEventListener: () => {}, removeEventListener: () => {}, history: { state: null } });
});
afterEach(() => vi.unstubAllGlobals());

const html = (path: string) => renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [path] }, createElement(Slideshow, { userId: "u2", source: null })));

describe("the slideshow page's More settings", () => {
  it("folds the size and pictures, named in one line, and opens them from the address", () => {
    const shut = html("/make/slideshow");
    expect(shut).toContain("4:5, stock photos");
    expect(shut).not.toContain("Stock photos for me");
    expect(shut).toContain("Steer it");
    const open = html("/make/slideshow?more=open");
    expect(open).toContain("Stock photos for me");
    expect(open).toContain("One for each point");
  });

  it("keeps the AI pictures' price in view while folded", () => {
    const page = html("/make/slideshow?pictures=ai&look=clay");
    expect(page).toContain("4:5, AI pictures, clay");
    expect(page).toContain("of picture credit a slideshow");
    expect(page).not.toContain("AI pictures, one look");
  });

  it("names a picked photo mood, and leaves the default one out", () => {
    expect(showPicks("9x16", "stock", null)).toEqual(["9:16", "stock photos"]);
    expect(showPicks("4x5", "mine", null)).toEqual(["4:5", "from my media"]);
  });
});
