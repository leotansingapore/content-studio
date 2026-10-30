// /make/:format: a format marked `everyone` (the slideshow, on for everyone 30 Oct) opens for any sign-in; every
// other format stays on Leo's, and signed out sees the not-on-your-account card.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

const who = vi.hoisted(() => ({ leo: null as { id: string; email: string } | null, user: null as { id: string; email: string } | null }));
vi.mock("@/lib/useLeoOnly", () => ({ useLeoUser: () => who.leo, useLeoOnly: () => !!who.leo, useSignedInUser: () => who.user }));
vi.mock("@/lib/supabase", () => ({
  SUPABASE_URL: "https://abc.supabase.co",
  SUPABASE_ANON_KEY: "",
  supabase: { auth: { getUser: () => new Promise(() => undefined), getSession: () => new Promise(() => undefined), onAuthStateChange: () => ({}) }, functions: { invoke: vi.fn() } },
}));

const { default: MakeFormatPage } = await import("./MakeFormatPage");
const html = (path: string) =>
  renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [path] }, createElement(Routes, null, createElement(Route, { path: "/make/:format", element: createElement(MakeFormatPage) }))));
const OFF = "on your account yet";

describe("/make/:format", () => {
  afterEach(() => {
    who.leo = who.user = null;
  });

  it("opens the slideshow for anyone signed in, and keeps every other format on Leo's sign-ins", () => {
    who.user = { id: "u2", email: "someone@example.com" };
    expect(html("/make/slideshow")).not.toContain(OFF);
    expect(html("/make/wall-of-text")).toContain(OFF);
    who.user = who.leo = { id: "u1", email: "tanjunsing@gmail.com" };
    expect(html("/make/wall-of-text")).not.toContain(OFF);
  });

  it("shows the not-on-your-account card on the slideshow when signed out", () => {
    expect(html("/make/slideshow")).toContain(OFF);
  });
});
