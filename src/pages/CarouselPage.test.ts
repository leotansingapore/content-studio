// /carousel is live for everyone: its first frame must draw exactly as it did before edit-by-chat (pinned on
// today's code at 4403dedf), with or without ?ask= in the address. Never update the pinned file with vitest -u.
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
// the shared tab row reads the rails store, which has no server snapshot; it is not this page's to pin
vi.mock("@/components/SectionTabs", () => ({ default: () => createElement("nav", { "data-pin": "section-tabs" }), WRITE_TABS: [] }));
// the page's first frame asks the browser how wide it is and makes a canvas to measure words with
vi.stubGlobal("window", { matchMedia: () => ({ matches: true }) });
vi.mock("@/lib/carouselRender", async (actual) => ({ ...(await actual<typeof import("@/lib/carouselRender")>()), createCanvasMeasure: () => () => 0 }));
// the rewrite store has no server snapshot; nothing is being rewritten on a first frame
vi.mock("@/components/carousel/SlideFields", async (actual) => ({ ...(await actual<typeof import("@/components/carousel/SlideFields")>()), useRewriting: () => false }));

const { default: CarouselPage } = await import("./CarouselPage");
const html = (path = "/carousel") => renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [path] }, createElement(CarouselPage)));

describe("/carousel for everyone else", () => {
  it("draws today's page", async () => {
    await expect(html()).toMatchFileSnapshot("./__pins__/carousel-page-everyone.html");
  });
  it("draws the same page with ?ask= and an open carousel in the address", () => {
    expect(html("/carousel?carousel=d%3Ad1&ask=make%20slide%203%20shorter")).toBe(html("/carousel?carousel=d%3Ad1"));
    expect(html("/carousel?ask=end%20on%20a%20question")).toBe(html());
  });
});
