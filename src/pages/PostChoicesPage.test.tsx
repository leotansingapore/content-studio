// /settings/post-choices' Post labels: Leo sees what each network shows for the Made with AI label Post it for me
// sends; everyone else keeps today's line.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

const as = vi.hoisted(() => {
  const store = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
  };
  return { leo: null as null | { id: string; email: string } };
});
vi.mock("@/lib/supabase", () => ({ supabase: { functions: { invoke: vi.fn() }, auth: { getSession: vi.fn(), onAuthStateChange: vi.fn() } }, SUPABASE_URL: "", SUPABASE_ANON_KEY: "" }));
vi.mock("@/lib/useLeoOnly", async (actual) => ({
  ...(await actual<typeof import("@/lib/useLeoOnly")>()),
  useLeoUser: () => as.leo,
  useSignedInUser: () => ({ id: "u1", email: "someone@example.com" }),
}));

import PostChoicesPage from "./PostChoicesPage";

const render = () => renderToStaticMarkup(createElement(MemoryRouter, null, createElement(PostChoicesPage)));

describe("Post labels", () => {
  it("everyone else: the Made with AI label is not sent, as today", () => {
    as.leo = null;
    const html = render();
    expect(html).toContain("Not sent with a post yet. Set it in the network&#x27;s own app.");
    expect(html).toContain("Nothing is added unless you pick it.");
    expect(html).not.toContain("LinkedIn has no AI label.");
  });

  it("Leo: on for AI-made media, and what each network shows, TikTok on videos only", () => {
    as.leo = { id: "u1", email: "leo@example.com" };
    const html = render();
    expect(html).not.toContain("Not sent with a post yet");
    expect(html).toContain("On for AI-made media, off for real footage and photos.");
    for (const n of ["Instagram", "Facebook", "TikTok", "YouTube", "LinkedIn", "Threads"]) expect(html).toContain(`<dt class="font-medium text-foreground">${n}</dt>`);
    expect(html).toContain("An AI-generated label on videos only.");
    expect(html).toContain("LinkedIn has no AI label.");
  });
});
