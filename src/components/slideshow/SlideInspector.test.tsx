// The Slide tab's picture controls: a 2x2 collage's four cells, the picked one marked, and its photographer credited.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ SUPABASE_URL: "https://abc.supabase.co", SUPABASE_ANON_KEY: "", supabase: { auth: {}, functions: { invoke: vi.fn() } } }));

const { default: SlideInspector } = await import("./SlideInspector");
const { blankSlideshow, STICKERS } = await import("@/lib/slideshow");

const noop = () => undefined;
const act = { size: noop, swap: noop, media: noop, upload: noop, plain: noop, collage: noop, cell: noop, addSlide: noop, duplicate: noop, deleteSlide: noop, addText: noop, sticker: noop, words: noop, style: noop, overlay: noop };
const draw = (slide: Record<string, unknown>, cell = 0, panel = "slide") =>
  renderToStaticMarkup(
    createElement(MemoryRouter, null,
      createElement(SlideInspector, {
        userId: "u1", show: { ...blankSlideshow(), slides: [slide as never, { id: "s2", boxes: [] }] }, slide: slide as never, box: null, panel: panel as never,
        onPanel: noop, allBoxes: false, onAllBoxes: noop, swap: { busy: false, note: null }, cell, brand: { handle: false, logo: false }, act,
      })),
  );
const photo = (by: string) => ({ src: `https://images.pexels.com/photos/${by.length}/p.jpeg`, by, byUrl: "" });

describe("the Slide tab's pictures", () => {
  it("offers a 2x2 collage on a one-picture slide, with no cell buttons", () => {
    const html = draw({ id: "s1", photo: photo("Ann"), boxes: [] });
    expect(html).toContain("2x2 collage");
    expect(html).not.toContain("Collage picture 1");
    expect(html).toContain("Photo by");
  });

  it("shows a collage's four cells, the picked one pressed, and credits that cell's photographer", () => {
    const slide = { id: "s1", image: "cimg-composed1", cells: [{ photo: photo("Ann") }, { photo: photo("Bea Lim") }, null, null], boxes: [] };
    const html = draw(slide, 1);
    expect(html).toContain("One picture");
    for (const n of [1, 2, 3, 4]) expect(html).toContain(`aria-label="Collage picture ${n}"`);
    expect(html).toMatch(/aria-label="Collage picture 2" aria-pressed="true"/);
    expect(html).toMatch(/aria-label="Collage picture 1" aria-pressed="false"/);
    expect(html).toContain("Bea Lim");
    expect(html).not.toContain(">Ann<");
  });
});

describe("the Text tab's stickers", () => {
  it("offers every sticker, and none once the slide holds 6 boxes", () => {
    const html = draw({ id: "s1", boxes: [] }, 0, "text");
    for (const s of STICKERS) expect(html).toMatch(new RegExp(`aria-label="Add ${s.name} sticker"(?![^>]*disabled="")`));
    const box = (i: number) => ({ id: `b${i}`, text: "x", x: 0.5, y: 0.5, w: 0.8, font: "clean", size: 40, color: "#111111", stroke: 0, strokeColor: "#FFFFFF", bg: "white" });
    const full = draw({ id: "s1", boxes: [0, 1, 2, 3, 4, 5].map(box) }, 0, "text");
    expect(full.match(/sticker" title="[^"]+" disabled=""/g)).toHaveLength(STICKERS.length);
  });
});
