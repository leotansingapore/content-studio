// /welcome is live for everyone: its first frame must draw exactly as it did before Leo's tour button (pinned on
// today's code). Never update the pinned file with vitest -u.
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

import WelcomePage from "./WelcomePage";

const html = () => renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: ["/welcome"] }, createElement(WelcomePage)));

afterEach(() => {
  as.user = null;
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
