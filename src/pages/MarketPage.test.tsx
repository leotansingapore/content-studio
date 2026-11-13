// /market on a sign-in without Your market answers "not on your account", never a digest whose Check my market the
// server refuses. The device's last answer from the status probe (cs-market-shown) decides the first frame.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => {
  const s = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => s.get(k) ?? null,
    setItem: (k: string, v: string) => void s.set(k, v),
    removeItem: (k: string) => void s.delete(k),
    key: (i: number) => [...s.keys()][i] ?? null,
    get length() {
      return s.size;
    },
    clear: () => s.clear(),
  };
  return s;
});
vi.mock("@/lib/supabase", () => ({
  SUPABASE_URL: "https://abc.supabase.co",
  supabase: { auth: { getUser: () => new Promise(() => undefined), getSession: () => new Promise(() => undefined), onAuthStateChange: () => ({}) } },
}));

import MarketPage from "./MarketPage";

const html = () => renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: ["/market"] }, createElement(MarketPage)));
const known = (on: boolean) => store.set("cs-market-shown", JSON.stringify({ on, at: Date.now() }));

beforeEach(() => store.clear());

describe("Your market's gate", () => {
  it("answers a sign-in the server keeps it off for with the not-on-your-account page", () => {
    known(false);
    expect(html()).toContain("This page isn&#x27;t on your account yet");
  });

  it("waits, showing nothing, while the device has no answer or has it on", () => {
    expect(html()).toBe("");
    known(true);
    expect(html()).toBe("");
  });
});
