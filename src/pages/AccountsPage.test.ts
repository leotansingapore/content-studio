// /accounts (Connections) for every sign-in but Leo's: its first frame is pinned as of the one-page Connections
// build (13 Nov, holo-conn). Never update the pinned file with vitest -u.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AccountView, SocialStatus } from "@/lib/socialConnect";

const as = vi.hoisted(() => ({ user: null as null | undefined | { id: string; email: string } }));
vi.mock("@/lib/useLeoOnly", async (actual) => ({ ...(await actual<typeof import("@/lib/useLeoOnly")>()), useLeoUser: () => as.user }));
vi.mock("@/lib/supabase", () => ({
  SUPABASE_URL: "https://abc.supabase.co",
  supabase: { auth: { getUser: () => new Promise(() => undefined), getSession: () => new Promise(() => undefined), onAuthStateChange: () => ({}) } },
}));

const { default: AccountsPage, SocialRows } = await import("./AccountsPage");
const { LEO_EMAILS } = await import("@/lib/leoOnly");
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

const status = (over: Partial<SocialStatus> = {}): SocialStatus => ({ accounts: [], removed: [], team: 2, teamCap: 10, user: 2, userCap: 10, ...over } as SocialStatus);
const account = (over: Partial<AccountView>): AccountView => ({ id: "a1", platform: "instagram", username: "moneybees.sg", name: "", health: "healthy", needsReconnect: false, issues: [], ...over } as AccountView);
const rows = (s: SocialStatus, leo = false) =>
  renderToStaticMarkup(createElement(MemoryRouter, null, createElement(SocialRows, { status: s, leo, defaults: {}, pickDefault: () => undefined, busy: "", connect: () => undefined, disconnect: () => undefined })));
const count = (out: string, re: RegExp) => (out.match(re) ?? []).length;

describe("Connections", () => {
  it("lists the link tools for everyone, AdLauncher for Leo only, and Telegram never before the sign-in is read", () => {
    const out = html();
    for (const to of ["/bio", "/links", "/connect"]) expect(out).toContain(`href="${to}"`);
    expect(out).not.toContain('href="/adlauncher"');
    expect(out).not.toContain("telegram");
    as.user = { id: "u1", email: LEO_EMAILS[0] };
    expect(html()).toContain('href="/adlauncher"');
  });

  it("draws one row and one Connect per platform when nothing is connected, with the price only for Leo", () => {
    const out = rows(status());
    expect(count(out, /Not connected/g)).toBe(6);
    expect(count(out, /<button/g)).toBe(6);
    expect(out).not.toContain('disabled=""');
    expect(out).not.toContain("Zernio");
    expect(rows(status(), true)).toMatch(/2 of 10 accounts connected\..*Zernio: first 2 free, then US\$6 a month each\./s);
  });

  it("says who a platform is connected as, keeps Add another, and offers Reconnect only when it stopped working", () => {
    const out = rows(status({ accounts: [account({})] }));
    expect(out).toContain("Connected as @moneybees.sg");
    expect(out).toContain("Add another Instagram account");
    expect(count(out, /Not connected/g)).toBe(5);
    expect(out).not.toContain("Reconnect");
    expect(rows(status({ accounts: [account({ needsReconnect: true })] }))).toMatch(/Reconnect needed.*>Reconnect<.*Disconnect/s);
  });

  it("disables every connect and says why once the cap is reached", () => {
    const out = rows(status({ user: 3, userCap: 3 }));
    expect(out).toContain("You can have 3 accounts connected. Disconnect one to connect another.");
    expect(count(out, /disabled=""/g)).toBe(6);
  });
});
