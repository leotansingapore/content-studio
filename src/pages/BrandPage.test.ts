// Brand kit's Posting times for every sign-in but Leo's: the section as it drew on b248a057 (moved as it was into
// PostingTimes, since the page draws its form only once the kit has loaded), before Leo's per-network times
// (publish-queue). Never update the pinned files with vitest -u.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

const as = vi.hoisted(() => ({ user: null as null | undefined | { id: string; email: string } }));
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
