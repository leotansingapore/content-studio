// /connect is live for everyone: its first frame must draw exactly as it did before Leo's sections (pinned on
// a9d04b4e). Never update the pinned file with vitest -u.
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

// the shared tab row reads the rails store, which has no server snapshot; it is not this page's to pin
vi.mock("@/components/SectionTabs", () => ({ default: () => createElement("nav", { "data-pin": "section-tabs" }), PLAYBOOK_TABS: [] }));

import ConnectPage from "./ConnectPage";

const html = (path = "/connect") => renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [path] }, createElement(ConnectPage)));

afterEach(() => {
  as.user = null;
});

describe("/connect for everyone else", () => {
  it("draws today's page", async () => {
    await expect(html()).toMatchFileSnapshot("./__pins__/connect-page-everyone.html");
  });
  it("draws today's page while the sign-in is still being read", async () => {
    as.user = undefined;
    await expect(html()).toMatchFileSnapshot("./__pins__/connect-page-everyone.html");
  });
  it("draws today's page with an anchor in the address", async () => {
    await expect(html("/connect#tools")).toMatchFileSnapshot("./__pins__/connect-page-everyone.html");
  });
});
