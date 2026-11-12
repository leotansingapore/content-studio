// /auth's first frame for a plain sign-in must draw exactly as it did before the paid arrival screen (pinned on the
// code before that change), and a finished checkout's arrival must open on its own screen. Never update the pinned
// files with vitest -u.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({
  SUPABASE_URL: "https://abc.supabase.co",
  supabase: { auth: { getUser: () => new Promise(() => undefined), getSession: () => new Promise(() => undefined), onAuthStateChange: () => ({}) } },
}));

import Auth from "./Auth";

const html = (at: string) => renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [at] }, createElement(Auth)));

describe("/auth", () => {
  it("draws today's sign-in page", async () => {
    await expect(html("/auth")).toMatchFileSnapshot("./__pins__/auth-page-plain.html");
  });

  it("draws today's sign-in page for a typed address that is not a finished checkout", async () => {
    await expect(html("/auth?email=mei%40example.com")).toMatchFileSnapshot("./__pins__/auth-page-plain-email.html");
  });

  it("opens a finished checkout's arrival on its own check-your-email screen from the first frame", async () => {
    const out = html("/auth?email=mei%2Bx%40example.com&checkout=done");
    await expect(out).toMatchFileSnapshot("./__pins__/auth-page-paid.html");
    expect(out).toMatch(/<h1[^>]*>Check your email<\/h1>/);
    expect(out).toContain("Your payment went through.");
    expect(out).toContain("mei+x@example.com");
    for (const gone of ["Sign in to your studio", "FINternship", "Use a password instead", "Use a different email"]) expect(out).not.toContain(gone);
  });
});
