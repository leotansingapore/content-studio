// The frame every format page shares: its way back names where it goes, as Fastlane's "< Studio" chip.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

const who = vi.hoisted(() => ({ leo: null as { id: string; email: string } | null }));
vi.mock("@/lib/useLeoOnly", () => ({ useLeoUser: () => who.leo, useLeoOnly: () => !!who.leo, useSignedInUser: () => who.leo }));
vi.mock("@/lib/supabase", () => ({
  SUPABASE_URL: "https://abc.supabase.co",
  SUPABASE_ANON_KEY: "",
  supabase: { auth: { getUser: () => new Promise(() => undefined), getSession: () => new Promise(() => undefined), onAuthStateChange: () => ({}) }, functions: { invoke: vi.fn() } },
}));

const { default: FormatShell } = await import("./FormatShell");
const html = () =>
  renderToStaticMarkup(
    createElement(MemoryRouter, { initialEntries: ["/make/slideshow"] },
      createElement(FormatShell, {
        title: "Slideshow", blurb: "Photo slides.", options: null, result: null,
        footer: { cap: null, label: "Make it", busyLabel: "Making...", busy: false, onMake: () => {} },
      })),
  );

afterEach(() => {
  who.leo = null;
});

describe("a format page's way back", () => {
  it("is a Formats link to the catalogue on Leo's sign-ins", () => {
    who.leo = { id: "u1", email: "leo@example.com" };
    const page = html();
    expect(page).toMatch(/<a[^>]*href="\/make"[^>]*>.*Formats<\/a>/);
    expect(page).not.toContain("Back");
  });

  it("is Back for everyone else, who has no catalogue to go to", () => {
    const page = html();
    expect(page).toContain("Back");
    expect(page).not.toContain('href="/make"');
  });
});
