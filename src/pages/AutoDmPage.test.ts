// /recruit/auto-dm is Leo's: posting switched on for a customer (SOCIAL_CONNECT_USERS) never opens Auto-DM.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

const as = vi.hoisted(() => ({ user: null as null | undefined | { id: string; email: string } }));
vi.mock("@/lib/useLeoOnly", async (actual) => ({ ...(await actual<typeof import("@/lib/useLeoOnly")>()), useLeoUser: () => as.user }));
vi.mock("@/lib/supabase", () => ({
  SUPABASE_URL: "https://abc.supabase.co",
  supabase: { auth: { getUser: () => new Promise(() => undefined), getSession: () => new Promise(() => undefined), onAuthStateChange: () => ({}) } },
}));

const { default: AutoDmPage } = await import("./AutoDmPage");
const html = () => renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: ["/recruit/auto-dm"] }, createElement(AutoDmPage)));
const NOT_ON = "This page isn&#x27;t on your account yet";

afterEach(() => {
  as.user = null;
});

describe("/recruit/auto-dm", () => {
  it("is not on a customer's account, even with Social accounts switched on", () => {
    vi.stubGlobal("localStorage", { getItem: (k: string) => (k === "cs-social-connect" ? JSON.stringify({ on: true, at: Date.now() }) : null), setItem: () => {} });
    expect(html()).toContain(NOT_ON);
    vi.unstubAllGlobals();
  });

  it("shows nothing while the sign-in is still being read", () => {
    as.user = undefined;
    expect(html()).not.toContain(NOT_ON);
    expect(html()).toContain('aria-busy="true"');
  });

  it("opens for Leo", () => {
    as.user = { id: "40f07a18-b087-4c95-ba1f-d5444222968a", email: "tanjunsing@gmail.com" };
    expect(html()).not.toContain(NOT_ON);
    expect(html()).not.toContain('aria-busy="true"');
  });
});
