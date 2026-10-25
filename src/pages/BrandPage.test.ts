// Brand kit's Posting times for every sign-in but Leo's: the section as it drew on b248a057 (moved as it was into
// PostingTimes, since the page draws its form only once the kit has loaded), before Leo's per-network times
// (publish-queue). Never update the pinned files with vitest -u.
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
  return { user: null as null | undefined | { id: string; email: string } };
});
vi.mock("@/lib/useLeoOnly", async (actual) => ({ ...(await actual<typeof import("@/lib/useLeoOnly")>()), useLeoUser: () => as.user }));
vi.mock("@/lib/supabase", () => ({
  SUPABASE_URL: "https://abc.supabase.co",
  SUPABASE_ANON_KEY: "",
  supabase: { auth: { getUser: () => new Promise(() => undefined), getSession: () => new Promise(() => undefined), onAuthStateChange: () => ({}) } },
}));

const { PostingTimes } = await import("./BrandPage");
const { DEFAULT_BRAND } = await import("@/lib/carousel");

const SLOTS = ["0T08:30", "2T19:30", "4T12:00"];
const draw = (slots: string[], extra = {}) =>
  renderToStaticMarkup(
    createElement(MemoryRouter, { initialEntries: ["/brand"] }, createElement(PostingTimes, { brand: { ...DEFAULT_BRAND, slots, ...extra }, update: () => undefined, userId: "u1" })),
  );

afterEach(() => {
  as.user = null;
});

describe("Brand kit's Posting times for everyone else", () => {
  it("draws today's section with three times", async () => {
    await expect(draw(SLOTS)).toMatchFileSnapshot("./__pins__/brand-posting-times-everyone.html");
  });
  it("draws today's section with no times, offering a weekly goal", async () => {
    await expect(draw([])).toMatchFileSnapshot("./__pins__/brand-posting-times-empty-everyone.html");
  });
  it("draws today's section while the sign-in is still being read", async () => {
    as.user = undefined;
    await expect(draw(SLOTS)).toMatchFileSnapshot("./__pins__/brand-posting-times-everyone.html");
    await expect(draw([])).toMatchFileSnapshot("./__pins__/brand-posting-times-empty-everyone.html");
  });
});

describe("Brand kit's Posting times for Leo (publish-queue)", () => {
  const leo = { id: "u1", email: "leo@example.com" };

  it("offers Same times on every network, ticked, over the shared list", () => {
    as.user = leo;
    const out = draw(SLOTS);
    expect(out).toMatch(/<input type="checkbox"[^>]*checked=""[^>]*\/>Same times on every network/);
    expect(out.match(/aria-label="Day"/g)).toHaveLength(3);
    expect(out).not.toContain("<h3");
  });

  it("draws one list per network once unticked, in the platforms' order, with no weekly-goal start", () => {
    as.user = leo;
    const out = draw([], { slotsBy: { linkedin: ["1T08:00", "3T08:00"], instagram: ["0T19:30", "2T19:30", "5T10:00"] } });
    expect(out).not.toMatch(/<input type="checkbox"[^>]*checked=""/);
    expect([...out.matchAll(/<h3 id="brand-slots-(\w+)"[^>]*>([^<]+)<\/h3>/g)].map((m) => [m[1], m[2]])).toEqual([["instagram", "Instagram"], ["linkedin", "LinkedIn"]]);
    expect(out).toContain('aria-labelledby="brand-slots-linkedin"');
    expect(out.match(/aria-label="Day"/g)).toHaveLength(5);
    expect(out).not.toContain("Or start from a weekly goal");
  });
});
