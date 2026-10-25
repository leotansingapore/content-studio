// Analytics' Your real numbers card. Its first frame for any session that is not Leo's is pinned on today's code
// (learn-real-numbers is Leo's only). Never update the pinned file with vitest -u.
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

import RealNumbers from "./RealNumbers";

const html = (path = "/analytics") =>
  renderToStaticMarkup(
    createElement(MemoryRouter, { initialEntries: [path] }, createElement(RealNumbers, { userId: "u1", audited: [], onChange: () => undefined, onFollowers: () => undefined })),
  );

afterEach(() => {
  as.user = null;
  localStorage.clear();
});

describe("Your real numbers for everyone else", () => {
  it("draws today's card", async () => {
    await expect(html()).toMatchFileSnapshot("./__pins__/real-numbers-everyone.html");
  });
  it("draws today's card with a ?link= in the URL", async () => {
    await expect(html("/analytics?link=p1")).toMatchFileSnapshot("./__pins__/real-numbers-everyone.html");
  });
});
