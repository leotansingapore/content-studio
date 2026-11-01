// /design/libraries for an owner without posting switched on: the server refuses library-save, so New library is off.
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
  };
  return m;
});
vi.mock("@/lib/supabase", () => ({ SUPABASE_URL: "http://localhost", supabase: { auth: { getSession: () => new Promise(() => undefined), onAuthStateChange: () => undefined } } }));
vi.mock("@/lib/edgeFn", () => ({ callFn: vi.fn(() => new Promise(() => undefined)) }));
import SlideLibrariesPage from "./SlideLibrariesPage";

const html = (on: boolean) => {
  store.set("cs-social-connect", JSON.stringify({ on, at: Date.now() }));
  return renderToStaticMarkup(createElement(MemoryRouter, null, createElement(SlideLibrariesPage)));
};
const newButton = (h: string) => h.match(/<button[^>]*>(?:(?!<\/button>).)*New library<\/button>/)?.[0] ?? "";

afterEach(() => store.clear());

describe("New library", () => {
  it("is off, with the reason, while posting isn't switched on", () => {
    const h = html(false);
    expect(newButton(h)).toContain(` disabled=""`);
    expect(h).toContain("Posting isn&#x27;t switched on for your account yet.");
  });
  it("is on once posting is", () => {
    const h = html(true);
    expect(newButton(h)).not.toContain(` disabled=""`);
    expect(h).not.toContain("switched on");
  });
});
