// Apps like yours' tab under /swipe's h1, which already names it: no heading of its own, the count and the month's spend
// on its top row.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
vi.mock("@/lib/supabase", () => ({
  SUPABASE_URL: "https://abc.supabase.co",
  supabase: { auth: { getUser: () => new Promise(() => undefined), getSession: () => new Promise(() => undefined), onAuthStateChange: () => ({}) } },
}));

import AppsLikeYours from "./AppsLikeYours";

const html = () => renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: ["/swipe?tab=similar"] }, createElement(AppsLikeYours, { userId: "u1" })));
const account = (handle: string) => ({ platform: "tiktok", handle, name: handle, bio: "", followers: 9000, kind: "app_or_brand", score: 0.8, via: "@tiimoapp", addedAt: "2026-10-30T00:00:00Z" });

beforeEach(() => store.clear());

describe("Apps like yours under the page's heading", () => {
  it("has no heading of its own, and keeps the count and the month's spend on its top row", () => {
    store.set("content-studio-similar-u1", JSON.stringify({ accounts: [account("app_one"), account("app_two")], posts: {}, dismissed: [], month: { spent: 1.2, cap: 40 } }));
    const h = html();
    expect(h).not.toMatch(/<h2/);
    expect(h).toContain('aria-label="Apps like yours"');
    const top = h.slice(0, h.indexOf("Find apps like yours"));
    expect(top).toContain(">2 accounts</span>");
    expect(top).toContain("US$1.20 of US$40 this month");
  });

  it("starts on the find with no row above it before anything is found", () => {
    const h = html();
    expect(h).not.toContain("accounts</span>");
    expect(h).not.toContain("this month");
    expect(h).toContain("See how apps and creators like yours post");
  });
});
