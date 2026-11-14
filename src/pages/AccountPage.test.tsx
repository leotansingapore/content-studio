// /settings/account: the session's email, sign-in methods and sign-in time, the shell's Sign out and theme switch, and
// nothing that changes sign-in (email, password, delete) or scheduling (time zone).
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabase: { functions: { invoke: vi.fn() }, auth: { getSession: vi.fn(async () => ({ data: { session: null } })), onAuthStateChange: vi.fn() } }, SUPABASE_URL: "", SUPABASE_ANON_KEY: "" }));

import AccountPage, { signInMethods, signedInSince } from "./AccountPage";
import type { ThemeOutlet } from "@/lib/theme";

const b64url = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const token = (payload: unknown) => `${b64url({ alg: "HS256" })}.${b64url(payload)}.sig`;

describe("what the session says", () => {
  it("names each way the account signs in once, in the order added", () => {
    expect(signInMethods([{ provider: "email" }, { provider: "google" }, { provider: "google" }])).toEqual(["Email", "Google"]);
    expect(signInMethods([{ provider: "github" }])).toEqual(["github"]);
    expect(signInMethods(undefined)).toEqual([]);
  });

  it("reads when this browser signed in from the token's amr claim, the earliest method first", () => {
    expect(signedInSince(token({ sub: "u1", amr: [{ method: "otp", timestamp: 1763100000 }, { method: "password", timestamp: 1763000000 }] }))).toEqual(new Date(1763000000 * 1000));
    for (const t of [token({ sub: "u1" }), token({ amr: [{ method: "password" }] }), "not-a-token", "", null, undefined]) expect(signedInSince(t), String(t)).toBeNull();
  });
});

describe("the page", () => {
  const render = (ctx: ThemeOutlet | undefined) =>
    renderToStaticMarkup(
      createElement(MemoryRouter, { initialEntries: ["/settings/account"] },
        createElement(Routes, null,
          createElement(Route, { element: createElement(Outlet, { context: ctx }) },
            createElement(Route, { path: "/settings/account", element: createElement(AccountPage) })))),
    );

  it("shows the email, this browser with Sign out, and the shell's theme switch with the device's pick pressed", () => {
    const html = render({ theme: "dark", onTheme: () => {}, onSignOut: async () => {} });
    for (const s of [">Account</h1>", ">Sign-in</h2>", ">Email</dt>", ">Signs in with<", ">This browser</h2>", "Sign out", ">Appearance</h2>", 'aria-label="Theme"']) expect(html).toContain(s);
    expect(html).toMatch(/aria-pressed="true"[^>]*>.*?Dark/);
    // nothing that changes sign-in or scheduling
    for (const s of ["password", "Delete", "Time zone", "Timezone", "Change email"]) expect(html).not.toContain(s);
  });
});
