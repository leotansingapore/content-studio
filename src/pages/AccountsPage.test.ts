// /accounts for every sign-in but Leo's: its first frame is pinned on today's code (b248a057), before the page
// groups accounts by platform (publish-accounts). Never update the pinned file with vitest -u.
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

const { default: AccountsPage } = await import("./AccountsPage");
const html = (path = "/accounts") => renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [path] }, createElement(AccountsPage)));

afterEach(() => {
  as.user = null;
});

describe("/accounts for everyone else", () => {
  it("draws today's page", async () => {
    await expect(html()).toMatchFileSnapshot("./__pins__/accounts-page-everyone.html");
  });
  it("draws today's page while the sign-in is still being read, and with a platform anchor or Zernio's return in the address", async () => {
    as.user = undefined;
    await expect(html()).toMatchFileSnapshot("./__pins__/accounts-page-everyone.html");
    as.user = null;
    expect(html("/accounts#tiktok")).toBe(html());
    expect(html("/accounts?connected=tiktok&username=activity_tracker_io")).toBe(html());
  });
});
