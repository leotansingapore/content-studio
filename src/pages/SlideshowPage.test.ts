// /slideshow is Leo's only: everyone else gets the not-found page, with or without ?ask= (pinned on today's code at
// 4403dedf). Never update the pinned file with vitest -u.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/useLeoOnly", () => ({ useLeoUser: () => null, useLeoOnly: () => false }));
vi.mock("@/lib/supabase", () => ({
  SUPABASE_URL: "https://abc.supabase.co",
  SUPABASE_ANON_KEY: "",
  supabase: { auth: { getUser: () => new Promise(() => undefined), getSession: () => new Promise(() => undefined), onAuthStateChange: () => ({}) }, functions: { invoke: vi.fn() } },
}));

const { default: SlideshowPage } = await import("./SlideshowPage");
const html = (path = "/slideshow") => renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [path] }, createElement(SlideshowPage)));

describe("/slideshow for everyone else", () => {
  it("draws today's not-found page", async () => {
    await expect(html()).toMatchFileSnapshot("./__pins__/slideshow-page-everyone.html");
  });
  it("draws the same with an open slideshow and ?ask=", () => {
    expect(html("/slideshow?s=show1&ask=make%20it%20shorter")).toBe(html());
  });
});
