// /make (Fastlane's Studio > Create): the order of its blocks and what each card carries, drawn to markup in node.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

const as = vi.hoisted(() => {
  const store = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
  };
  return { user: { id: "u1", email: "leo@example.com" } as null | { id: string; email: string } };
});
vi.mock("@/lib/useLeoOnly", async (actual) => ({ ...(await actual<typeof import("@/lib/useLeoOnly")>()), useLeoUser: () => as.user, useLeoOnly: () => !!as.user }));
vi.mock("@/lib/supabase", () => ({
  SUPABASE_URL: "https://abc.supabase.co",
  supabase: { auth: { getUser: () => new Promise(() => undefined), getSession: () => new Promise(() => undefined), onAuthStateChange: () => ({}) } },
}));

import MakePage from "./MakePage";
import { STATIC_FORMATS } from "@/data/staticFormats";
import { priceOf, priceText, type Price } from "@/lib/prices";

const html = (url: string) => renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [url] }, createElement(MakePage)));
const at = (page: string, bit: string) => page.indexOf(bit);

afterEach(() => localStorage.clear());

describe("Create, as Fastlane lays it out", () => {
  it("puts the tabs, the chips and the search in one row under the title, the video price note after them", () => {
    const page = html("/make");
    const row = page.slice(at(page, 'role="tablist"'), at(page, 'aria-label="Search formats"'));
    expect(row).toContain('aria-label="Filter formats"');
    // the note comes after the search, before the first section
    expect(at(page, "Video prices are for the default length")).toBeGreaterThan(at(page, 'aria-label="Search formats"'));
    expect(at(page, "Video prices are for the default length")).toBeLessThan(at(page, 'id="make-own"'));
    expect(html("/make?tab=static")).not.toContain("Video prices are for the default length");
  });

  it("prices every static ad card, as its own page does", () => {
    const page = html("/make?tab=static");
    const chip = priceText(priceOf("remix-make") as Price);
    const ready = STATIC_FORMATS.filter((f) => f.ready).length;
    expect(page.split(chip).length - 1).toBe(ready);
  });
});
