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

describe("/welcome for Leo", () => {
  it("adds Show me around beside the main button, which stays the one primary", () => {
    as.user = { id: "u1", email: "leo@example.com" };
    const out = html();
    expect(out).toContain("Show me around");
    expect(out.indexOf("Start with my first post")).toBeLessThan(out.indexOf("Show me around"));
    expect(out.match(/bg-gradient-primary text-primary-foreground shadow-elegant hover:opacity-95/g)).toHaveLength(1);
  });
});
