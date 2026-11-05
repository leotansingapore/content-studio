// /hooks for any sign-in: the composer with its count and format in the URL, the waiting batch with Keep and Not this,
// the kept list with its count, and the six formats with their numbers. Rendered to markup (no effects run); Keep and
// Not this themselves are covered in src/lib/hookWriter.test.ts.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const who = vi.hoisted(() => ({ user: { id: "u2", email: "someone@example.com" } as { id: string; email: string } | null }));
vi.mock("@/lib/useLeoOnly", () => ({ useLeoUser: () => null, useLeoOnly: () => false, useSignedInUser: () => who.user }));
vi.mock("@/lib/supabase", () => ({
  SUPABASE_URL: "https://abc.supabase.co",
  SUPABASE_ANON_KEY: "",
  supabase: { auth: { getUser: () => new Promise(() => undefined), getSession: () => new Promise(() => undefined), onAuthStateChange: () => ({}) }, functions: { invoke: vi.fn() } },
}));

const { default: HooksPage } = await import("./HooksPage");

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  const ls = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) };
  vi.stubGlobal("localStorage", ls);
  vi.stubGlobal("window", { localStorage: ls, matchMedia: () => ({ matches: false }) });
});
afterEach(() => {
  vi.unstubAllGlobals();
  who.user = { id: "u2", email: "someone@example.com" };
});

const html = (path = "/hooks") => renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [path] }, createElement(HooksPage)));

describe("/hooks", () => {
  it("opens on the composer and the six formats for anyone signed in", () => {
    const page = html();
    expect(page).toContain("What are they about?");
    expect(page).toContain("Write 10 hooks");
    expect(page).toContain("1.5M median views, 13.7% engagement");
    expect(page).toContain("Write 5 like this");
    expect(page).toContain("0 of 30");
    expect(page).not.toContain('data-testid="fresh-hooks"');
    who.user = null;
    expect(html()).toContain("on your account yet");
  });

  it("takes the count and the format from the address", () => {
    const page = html("/hooks?n=20&format=pov");
    expect(page).toContain("Write 20 hooks");
    expect(page).toMatch(/<option value="pov" selected="">POV<\/option>/);
    expect(html("/hooks?n=7")).toContain("Write 10 hooks");
  });

  it("shows a waiting batch with Keep and Not this, and the kept hooks with their count", () => {
    store.set("content-studio-hookwriter-u2", JSON.stringify({ topic: "busy weeks", fresh: [{ id: "a", text: "POV: Monday ate your plan", format: "pov" }, { id: "b", text: "my week like a fire drill", format: "analogy" }], no: [] }));
    store.set("content-studio-snippets-u2", JSON.stringify([{ id: "k1", name: "kept", text: "been planning on paper for 10 years", kind: "hook" }]));
    const page = html();
    expect(page).toContain("New hooks (2)");
    expect(page).toContain("POV: Monday ate your plan");
    expect(page).toContain("Tell me without telling me");
    expect(page).toContain("Not this to all");
    expect(page).toContain("been planning on paper for 10 years");
    expect(page).toContain("1 of 30");
    expect(page).toContain('value="busy weeks"');
  });
});
