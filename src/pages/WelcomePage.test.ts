// /welcome is live for everyone: its first frame must draw exactly as it did before Leo's tour button (pinned on
// today's code). Never update the pinned file with vitest -u.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

const as = vi.hoisted(() => ({ user: null as null | undefined | { id: string; email: string } }));
vi.mock("@/lib/useLeoOnly", async (actual) => ({ ...(await actual<typeof import("@/lib/useLeoOnly")>()), useLeoUser: () => as.user }));
const signedIn = vi.hoisted(() => ({ uid: null as string | null }));
vi.mock("@/lib/socialConnect", async (actual) => ({ ...(await actual<typeof import("@/lib/socialConnect")>()), storedUserId: () => signedIn.uid }));
const cloud = vi.hoisted(() => ({ pulled: true }));
vi.mock("@/lib/cloudSync", async (actual) => ({ ...(await actual<typeof import("@/lib/cloudSync")>()), cloudSyncPulled: () => cloud.pulled }));
vi.mock("@/lib/supabase", () => ({
  SUPABASE_URL: "https://abc.supabase.co",
  supabase: { auth: { getUser: () => new Promise(() => undefined), getSession: () => new Promise(() => undefined), onAuthStateChange: () => ({}) } },
}));

import WelcomePage from "./WelcomePage";

const html = () => renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: ["/welcome"] }, createElement(WelcomePage)));

afterEach(() => {
  as.user = null;
  signedIn.uid = null;
  cloud.pulled = true;
  vi.unstubAllGlobals();
});

const storage = (rows: Record<string, string>) => {
  const m = new Map(Object.entries(rows));
  const store = {
    get length() {
      return m.size;
    },
    key: (i: number) => [...m.keys()][i] ?? null,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
  };
  vi.stubGlobal("localStorage", store);
  vi.stubGlobal("window", { localStorage: store, history: { state: null }, location: { pathname: "/welcome", search: "", hash: "" } });
};

describe("/welcome for a new account", () => {
  it("opens the brand set-up on the account's own brand, in place of today's page", () => {
    signedIn.uid = "u1";
    storage({});
    const out = html();
    expect(out).toContain("set up your brand");
    expect(out).toContain("Skip set-up for now");
    expect(out).not.toContain("Write my first post");
  });

  it("picks up a set-up left half done, even once a profession is saved", () => {
    signedIn.uid = "u1";
    storage({ "content-studio-onboarding-u1": JSON.stringify({ v: 1, address: "acme.sg", profession: "Coach" }), "content-studio-carousel-brand-u1": JSON.stringify({ color: "#1E3A8A", name: "", handle: "", profession: "Coach" }) });
    expect(html()).toContain("set up your brand");
  });

  it("keeps today's page for an account already in use, and before the cloud has answered", async () => {
    signedIn.uid = "u1";
    storage({ "content-studio-drafts-u1": JSON.stringify([{ id: "d1", content: "A post", createdAt: "2026-11-01T00:00:00.000Z" }]) });
    await expect(html()).toMatchFileSnapshot("./__pins__/welcome-page-everyone.html");
    storage({ "content-studio-positioning-u1": JSON.stringify({ oneLiner: "I help nurses retire early." }) });
    await expect(html()).toMatchFileSnapshot("./__pins__/welcome-page-everyone.html");
    storage({ "content-studio-carousel-brand-u1": JSON.stringify({ color: "#0F766E", name: "Mei Tan Advisory", handle: "@meitan" }) });
    await expect(html()).toMatchFileSnapshot("./__pins__/welcome-page-everyone.html");
    cloud.pulled = false;
    storage({});
    await expect(html()).toMatchFileSnapshot("./__pins__/welcome-page-everyone.html");
  });

  it("keeps today's page for an onboarded account, a brand with a profession, or another brand open", async () => {
    signedIn.uid = "u1";
    storage({ "content-studio-onboarded-u1": "1" });
    await expect(html()).toMatchFileSnapshot("./__pins__/welcome-page-everyone.html");
    storage({ "content-studio-carousel-brand-u1": JSON.stringify({ color: "#1E3A8A", name: "", handle: "", profession: "Coach" }) });
    await expect(html()).toMatchFileSnapshot("./__pins__/welcome-page-everyone.html");
    storage({ "cs-active-profile-u1": "p123", "content-studio-profiles-u1": JSON.stringify([{ id: "me", name: "Me", createdAt: "" }, { id: "p123", name: "Acme", createdAt: "2026-11-01T00:00:00.000Z" }]) });
    await expect(html()).toMatchFileSnapshot("./__pins__/welcome-page-everyone.html");
  });
});

describe("/welcome for everyone else", () => {
  it("draws today's page", async () => {
    await expect(html()).toMatchFileSnapshot("./__pins__/welcome-page-everyone.html");
  });
  it("draws today's page while the sign-in is still being read", async () => {
    as.user = undefined;
    await expect(html()).toMatchFileSnapshot("./__pins__/welcome-page-everyone.html");
  });
});

describe("/welcome: one way forward", () => {
  it("has one filled button, before every other path, and no emoji in the heading", () => {
    const out = html();
    expect(out.match(/bg-gradient-primary text-primary-foreground shadow-elegant hover:opacity-95/g)).toHaveLength(1);
    const main = out.indexOf("Write my first post");
    for (const quiet of ["Set my voice first", "Plan a week", "Skip to Home"]) expect(out.indexOf(quiet)).toBeGreaterThan(main);
    expect(out.match(/<button/g)).toHaveLength(4);
    expect(out).toMatch(/<h1[^>]*>Welcome<\/h1>/);
  });
  it("adds Show me around as one more quiet link where there is a tour", () => {
    as.user = { id: "u1", email: "leo@example.com" };
    const out = html();
    expect(out.indexOf("Write my first post")).toBeLessThan(out.indexOf("Show me around"));
    expect(out.match(/bg-gradient-primary text-primary-foreground shadow-elegant hover:opacity-95/g)).toHaveLength(1);
  });
});

describe("onboardThenGo", () => {
  it("marks the account from the device's session when tapped before the sign-in lookup answers", async () => {
    const store = new Map<string, string>();
    vi.stubGlobal("window", { localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) } });
    const { onboardThenGo } = await import("./WelcomePage");
    const { isOnboarded } = await import("@/lib/onboarding");
    const to: string[] = [];
    await onboardThenGo(null, "/generate", (p) => to.push(p), async () => "u-fast-tap");
    expect(isOnboarded("u-fast-tap")).toBe(true);
    expect(to).toEqual(["/generate"]);
    await onboardThenGo("u-known", "/plan", (p) => to.push(p), async () => "never-used");
    expect(isOnboarded("u-known")).toBe(true);
    expect(isOnboarded("never-used")).toBe(false);
    vi.unstubAllGlobals();
  });
});
