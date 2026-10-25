// /marketing-north-star is Leo's only: everyone else gets the not-found page, with no hint the page exists.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

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
  return { user: null as null | undefined | { id: string; email: string } };
});
vi.mock("@/lib/useLeoOnly", async (actual) => ({ ...(await actual<typeof import("@/lib/useLeoOnly")>()), useLeoUser: () => as.user, useLeoOnly: () => !!as.user }));
vi.mock("@/lib/supabase", () => ({
  SUPABASE_URL: "https://abc.supabase.co",
  supabase: { auth: { getUser: () => new Promise(() => undefined), getSession: () => new Promise(() => undefined), onAuthStateChange: () => ({}) } },
}));

import MarketingNorthStarPage from "./MarketingNorthStarPage";
import { MK_ITEMS } from "@/data/marketingNorthStar";

const html = (path = "/marketing-north-star") => renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [path] }, createElement(MarketingNorthStarPage)));
const cards = (h: string) => h.split('data-testid="marketing-item"').length - 1;

afterEach(() => {
  as.user = null;
});

describe("the marketing north star gate", () => {
  it("shows a placeholder while the session loads", () => {
    as.user = undefined;
    const h = html();
    expect(h).toContain('aria-busy="true"');
    expect(h).not.toContain("App marketing");
  });

  it("answers anyone who is not Leo with the not-found page", () => {
    as.user = null;
    const h = html();
    expect(h).not.toContain("marketing-north-star-page");
    expect(h).not.toContain("App marketing");
  });

  it("shows Leo the progress, both tabs and every card once a filter opens the parts", () => {
    as.user = { id: "leo", email: "tanjunsing@gmail.com" };
    const h = html("/marketing-north-star?status=todo");
    expect(h).toContain("marketing-north-star-page");
    expect(h).toContain(`of ${MK_ITEMS.length} done`);
    expect(h).toContain('href="/north-star"');
    expect(cards(h)).toBe(MK_ITEMS.filter((i) => i.status === "todo").length);
  });

  it("filters by app from the URL", () => {
    as.user = { id: "leo", email: "tanjunsing@gmail.com" };
    expect(cards(html("/marketing-north-star?app=sb"))).toBe(MK_ITEMS.filter((i) => i.app === "sb").length);
  });
});
