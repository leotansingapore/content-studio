// /launch for any sign-in: the three questions when there is no plan, then the month grouped by week with each
// post's date, its maker and a Make it link that opens that maker with the words filled in. Markup only.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const who = vi.hoisted(() => ({ user: { id: "u2", email: "someone@example.com" } as { id: string; email: string } | null }));
vi.mock("@/lib/useLeoOnly", () => ({ useLeoUser: () => null, useLeoOnly: () => false, useSignedInUser: () => who.user }));
vi.mock("@/lib/supabase", () => ({
  SUPABASE_URL: "https://abc.supabase.co",
  SUPABASE_ANON_KEY: "",
  supabase: { auth: { getUser: () => new Promise(() => undefined), getSession: () => new Promise(() => undefined), onAuthStateChange: () => ({}) }, functions: { invoke: vi.fn() } },
}));

const { default: LaunchPlanPage } = await import("./LaunchPlanPage");

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  const ls = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) };
  vi.stubGlobal("localStorage", ls);
  vi.stubGlobal("window", { localStorage: ls, matchMedia: () => ({ matches: false }) });
});
afterEach(() => {
  vi.unstubAllGlobals();
  who.user = { id: "u2", email: "someone@example.com" };
});

const html = () => renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: ["/launch"] }, createElement(LaunchPlanPage)));

describe("/launch", () => {
  it("asks what launches, when and where people go, before there is a plan", () => {
    const page = html();
    expect(page).toContain("What are you launching?");
    expect(page).toContain("Launch date");
    expect(page).toContain("Lay out my month");
    who.user = null;
    expect(html()).toContain("on your account yet");
  });

  it("lays out the month by week, each post opening its maker", () => {
    store.set("content-studio-launchplan-u2", JSON.stringify({ thing: "Tidy", date: "2099-12-04", link: "https://tidy.app/join", done: ["why"] }));
    const page = html();
    expect(page).toContain("Tidy launches Fri 4 Dec");
    expect(page).toContain("1 of 12 made");
    for (const g of ["4 weeks out", "Launch week", "Launch day", "After launch"]) expect(page).toContain(g);
    expect(page).toContain('href="/hooks?topic=The+problem+Tidy+fixes');
    expect(page).toContain('href="/make/slideshow?from=topic&amp;topic=A+day+with+the+problem+Tidy+fixes"');
    expect(page).toContain('href="/make/hook-demo?topic=A+first+look+at+Tidy');
    expect(page).toContain("End by sending people to https://tidy.app/join");
    // a made post has no Make it button
    expect(page).not.toContain("Why+I%27m+making+Tidy");
  });
});
