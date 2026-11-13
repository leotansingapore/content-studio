import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

const as = vi.hoisted(() => ({
  leo: null as null | { id: string; email: string },
  user: null as null | { id: string; email: string },
  left: {} as Record<string, number>,
}));
vi.mock("@/lib/useLeoOnly", async (actual) => ({
  ...(await actual<typeof import("@/lib/useLeoOnly")>()),
  useLeoUser: () => as.leo,
  useLeoOnly: () => !!as.leo,
  useSignedInUser: () => as.user,
}));
vi.mock("@/lib/aiUsage", async (actual) => ({ ...(await actual<typeof import("@/lib/aiUsage")>()), useUsesLeft: () => (f: string) => as.left[f] ?? null }));
vi.mock("@/lib/supabase", () => ({
  SUPABASE_URL: "https://abc.supabase.co",
  supabase: { auth: { getUser: () => new Promise(() => undefined), getSession: () => new Promise(() => undefined), onAuthStateChange: () => ({}) } },
}));

import MakeFormatPage from "./MakeFormatPage";
import VideoFormatPage, { needLine } from "./VideoFormatPage";
import { FORMATS, explainerPrice } from "@/data/formats";
import { priceOf, priceText, type Price } from "@/lib/prices";

const LEO = { id: "u1", email: "leo@x.sg" };
const OFF = "on your account yet";
const PRIMARY = "bg-primary text-primary-foreground";
const render = (page: ComponentType, slug: string) =>
  renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [`/make/${slug}`] }, createElement(Routes, null, createElement(Route, { path: "/make/:format", element: createElement(page) })))).replace(/&amp;/g, "&");
const html = (slug: string) => render(VideoFormatPage, slug);
const button = (page: string) => page.match(/<a[^>]*>(?:(?!<\/a>).)*Use this format<\/a>/)?.[0] ?? "";
const target = (page: string) => button(page).match(/href="([^"]+)"/)?.[1];
const routed = async (slug: string) => {
  let page = render(MakeFormatPage, slug);
  for (let i = 0; i < 250 && page.includes('aria-busy="true"'); i++) {
    await new Promise((r) => setTimeout(r, 20));
    page = render(MakeFormatPage, slug);
  }
  return page;
};

afterEach(() => {
  as.leo = as.user = null;
  as.left = {};
  vi.unstubAllGlobals();
});

describe("a video format's page", () => {
  it("is Leo's only, as every format page but the slideshow, and opens for Leo at /make/<slug>", async () => {
    expect(render(MakeFormatPage, "look-clay")).toContain(OFF);
    as.user = { id: "u2", email: "someone@example.com" };
    expect(render(MakeFormatPage, "look-clay")).toContain(OFF);
    expect(render(MakeFormatPage, "template-unboxing")).toContain(OFF);
    as.user = as.leo = LEO;
    const page = await routed("look-clay");
    expect(page).not.toContain(OFF);
    expect(page).toContain(">Clay</h1>");
    expect(page).toContain("Use this format");
  });

  it("shows the name, the line, the example clip, what it works with, and the price and uses left its card shows", () => {
    as.leo = LEO;
    let page = html("look-clay");
    expect(page).toMatch(/<a[^>]*href="\/make"[^>]*>(?:(?!<\/a>).)*Videos<\/a>/);
    expect(page).toContain(">Clay</h1>");
    expect(page).toContain("A narrated video in handmade clay figures and sets.");
    expect(page).toContain('src="/formats/look-clay.mp4"');
    expect(page).toContain('poster="/formats/look-clay.webp"');
    expect(page).toContain("Works with");
    expect(page).toContain("Nothing extra needed.");
    expect(page).toContain(priceText(explainerPrice() as Price));
    expect(page).toContain("It opens in the video editor.");
    expect(page).not.toContain("left today");

    as.left = { "ai-video": 3 };
    expect(html("look-clay")).toContain("3 left today");
    as.left = { "ai-video": 0 };
    page = html("look-clay");
    expect(page).toContain("None left today");
    expect(target(page)).toBe("/edit?panel=ai&kind=explainer&look=clay");
    expect(button(page)).not.toContain('disabled=""');
    expect(html("template-food-asmr")).toContain(priceText(priceOf("ai-clip", { seconds: 8, quality: "720p" }) as Price));
  });

  it("says what a format needs in the card's own words", () => {
    as.leo = LEO;
    expect(html("template-unboxing")).toContain("Needs a product photo.");
    expect(html("template-character-reference-lock")).toContain("Needs a photo of the person.");
    expect(needLine({})).toBe("Nothing extra needed.");
    expect(needLine({ needs: "demo-video" })).toBe("Needs a demo video.");
  });

  it("has one primary button, which opens exactly what the card opened", () => {
    as.leo = LEO;
    expect(target(html("look-clay"))).toBe("/edit?panel=ai&kind=explainer&look=clay");
    expect(target(html("explainer"))).toBe("/edit?panel=ai&kind=explainer");
    expect(target(html("montage"))).toBe("/edit?panel=ai&kind=montage");
    expect(target(html("news-anchor"))).toBe("/edit?panel=ai&kind=avatar&talk=news");
    expect(target(html("template-unboxing"))).toBe("/edit?panel=ai&kind=template&template=unboxing");
    const pages = FORMATS.filter((f) => f.opens);
    expect(pages.length).toBeGreaterThan(40);
    for (const f of pages) {
      const page = html(f.slug);
      expect(page.match(/Use this format/g), f.slug).toHaveLength(1);
      expect(button(page), f.slug).toContain(PRIMARY);
      expect(target(page), f.slug).toBe(f.opens!());
    }
  });

  it("plays its example on arrival for a mouse with motion allowed, and always shows controls so it can be paused", () => {
    as.leo = LEO;
    vi.stubGlobal("window", { matchMedia: (q: string) => ({ matches: q === "(hover: hover) and (prefers-reduced-motion: no-preference)" }) });
    let page = html("stage-talk");
    expect(page).toContain('autoplay=""');
    expect(page).toContain('controls=""');
    vi.stubGlobal("window", { matchMedia: () => ({ matches: false }) });
    page = html("stage-talk");
    expect(page).not.toContain('autoplay=""');
    expect(page).toContain('controls=""');
  });

  it("says in red when today's uses are gone and when they come back, and shows no uses line for a format with no cap", async () => {
    as.leo = LEO;
    as.left = { "ai-video": 0 };
    const empty = html("stage-talk");
    expect(empty).toMatch(/<p class="[^"]*font-medium text-destructive[^"]*">None left today<\/p>/);
    expect(empty).toContain("Back at 8am Singapore time.");
    expect(target(empty)).toBe("/edit?panel=ai&kind=avatar&talk=stage");
    as.left = { "ai-video": 2 };
    expect(html("stage-talk")).not.toContain("Back at 8am");
    const own = html("edit-own");
    expect(target(own)).toBe("/edit");
    expect(own).not.toContain("left today");
    as.user = LEO;
    expect(await routed("edit-own")).toContain(">Edit your own video</h1>");
  });

  it("is not found for a format with no editor panel to open, or no format at all", () => {
    as.leo = LEO;
    expect(html("slideshow")).toContain("Page not found");
    expect(html("carousel")).toContain("Page not found");
    expect(html("nope")).toContain("Page not found");
  });
});
