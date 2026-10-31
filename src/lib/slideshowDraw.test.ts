import { describe, expect, it, vi } from "vitest";
import { CELL_GAP, LINE_HEIGHT, MissingPictureError, boxCss, cellRects, paintSlide, layoutBoxes, lookOf, pictureKey, slidePicture, slideshowPngs } from "@/lib/slideshowDraw";
import { BOX_FONTS, blankSlideshow, makeBox, type ShowSlide, type ShowSize } from "@/lib/slideshow";

// slideshowPngs on a device that has none of the pictures and no network: it must stop before drawing anything
const media = vi.hoisted(() => ({
  getFile: vi.fn(async (_key: string): Promise<Blob | undefined> => undefined),
  downloadStock: vi.fn(async (_src: string): Promise<Blob> => Promise.reject(new Error("offline"))),
}));
vi.mock("@/lib/videoMedia", () => ({ ensureCaptionFonts: async () => {} }));
vi.mock("@/lib/deviceFiles", () => ({ getFile: media.getFile }));
vi.mock("@/lib/stockMedia", () => ({ downloadStock: media.downloadStock }));

// Every character is half the font size wide; the size is read back out of the css string.
const measure = (text: string, css: string) => text.length * Number(css.match(/(\d+)px/)![1]) * 0.5;
const slide = (...boxes: ReturnType<typeof makeBox>[]): ShowSlide => ({ id: "s1", boxes });

describe("layoutBoxes", () => {
  it("wraps at the box width with a line height of 1.25", () => {
    // 40 px font: 20 px a character; box 0.5 x 1080 = 540 wide less 28 px padding a side = 484, so 24 characters a line
    const b = makeBox("aaaa bbbb cccc dddd eeee ffff gggg", { size: 40, w: 0.5 });
    const { boxes, overflow } = layoutBoxes(slide(b), "4x5", measure);
    expect(boxes[0].lines).toEqual(["aaaa bbbb cccc dddd eeee", "ffff gggg"]);
    for (const l of boxes[0].lines) expect(measure(l, "40px")).toBeLessThanOrEqual(484);
    expect(boxes[0].px).toBe(40);
    expect(LINE_HEIGHT).toBe(1.25);
    expect(boxes[0].rect.h).toBeCloseTo(2 * 40 * 1.25 + 2 * 0.15 * 40);
    expect(boxes[0].rect).toMatchObject({ x: 270, w: 540 });
    expect(overflow).toBe(false);
  });

  it("keeps a typed line break", () => {
    const { boxes } = layoutBoxes(slide(makeBox("One\nTwo", { size: 40 })), "1x1", measure);
    expect(boxes[0].lines).toEqual(["One", "Two"]);
  });

  it("sets overflow when the block passes the frame", () => {
    const long = "word ".repeat(120).trim();
    expect(layoutBoxes(slide(makeBox(long, { size: 80, y: 0.5 })), "1x1", measure).overflow).toBe(true);
    expect(layoutBoxes(slide(makeBox("Short", { y: 0.99 })), "4x5", measure).overflow).toBe(true);
    expect(layoutBoxes(slide(makeBox("Short", { x: 0.02 })), "4x5", measure).overflow).toBe(true);
    expect(layoutBoxes(slide(makeBox("Short")), "4x5", measure).overflow).toBe(false);
  });

  it("counts the words, not the box, sideways", () => {
    // a 3-word line in a wide box nudged 10% right: the box passes the edge, the words don't
    const short = layoutBoxes(slide(makeBox("Your words here", { x: 0.6, w: 0.84 })), "4x5", measure);
    expect(short.boxes[0].rect.x + short.boxes[0].rect.w).toBeGreaterThan(1080);
    expect(short.overflow).toBe(false);
    // 160 px words in a 216 px box: the rect grows to the sticker, and the sticker passing the left edge is overflow
    const big = layoutBoxes(slide(makeBox("OK", { size: 160, w: 0.2, x: 0.1, font: "heavy" })), "4x5", measure).boxes[0];
    expect(big.rect.w).toBeCloseTo(160 + 2 * 0.35 * 160);
    expect(big.rect.x).toBeLessThan(0);
    expect(layoutBoxes(slide(makeBox("OK", { size: 160, w: 0.2, x: 0.1, font: "heavy" })), "4x5", measure).overflow).toBe(true);
  });

  it("gives the same lines at every size for a box placed by shares", () => {
    const b = makeBox("The same words wrap the same way on every size of slide", { size: 52, x: 0.5, y: 0.4, w: 0.7 });
    const sizes: [ShowSize, number][] = [["1x1", 1080], ["4x5", 1350], ["3x4", 1440], ["9x16", 1920]];
    const out = sizes.map(([s]) => layoutBoxes(slide(b), s, measure).boxes[0]);
    for (const [i, [, H]] of sizes.entries()) {
      expect(out[i].lines).toEqual(out[0].lines);
      expect(out[i].px).toBe(52);
      expect(out[i].rect.x).toBe(out[0].rect.x);
      expect(out[i].rect.w).toBe(out[0].rect.w);
      expect(out[i].rect.h).toBe(out[0].rect.h);
      expect(out[i].rect.y + out[i].rect.h / 2).toBeCloseTo(0.4 * H);
    }
  });
});

describe("slideshowPngs", () => {
  it("refuses a slide whose picture isn't here instead of drawing it grey", async () => {
    const s = blankSlideshow();
    const device = { ...s, slides: [{ ...s.slides[0], image: "cimg-abc1234" }, s.slides[1]] };
    await expect(slideshowPngs("u1", device)).rejects.toThrow("Slide 1's picture is on the device you added it from.");
    const stock = { ...s, slides: [{ ...s.slides[0], photo: { src: "https://images.pexels.com/a.jpg", by: "", byUrl: "" } }, s.slides[1]] };
    await expect(slideshowPngs("u1", stock)).rejects.toBeInstanceOf(MissingPictureError);
  });
});

describe("pictureKey", () => {
  it("prefers the device picture, then the Pexels link", () => {
    expect(pictureKey({ id: "s", boxes: [], image: "cimg-abc1234", photo: { src: "https://images.pexels.com/a", by: "", byUrl: "" } })).toBe("cimg-abc1234");
    expect(pictureKey({ id: "s", boxes: [], photo: { src: "https://images.pexels.com/a", by: "", byUrl: "" } })).toBe("https://images.pexels.com/a");
    expect(pictureKey({ id: "s", boxes: [] })).toBeNull();
  });
});

describe("slidePicture", () => {
  const photo = { src: "https://images.pexels.com/photos/9/b.jpeg", by: "Ann", byUrl: "" };

  it("uses the picture on this device first, else fetches the Pexels photo again, and tries again after a failed download", async () => {
    const own = new Blob(["own"]);
    const stock = new Blob(["stock"]);
    media.downloadStock.mockClear();
    media.getFile.mockResolvedValueOnce(own);
    expect(await slidePicture({ id: "s", boxes: [], image: "cimg-abc1234", photo })).toBe(own);
    expect(media.downloadStock).not.toHaveBeenCalled();
    // offline: no picture this time, and the next try downloads again
    expect(await slidePicture({ id: "s", boxes: [], image: "cimg-abc1234", photo })).toBeNull();
    media.downloadStock.mockResolvedValueOnce(stock);
    expect(await slidePicture({ id: "s", boxes: [], photo })).toBe(stock);
    expect(media.downloadStock).toHaveBeenCalledTimes(2);
    expect(await slidePicture({ id: "s", boxes: [] })).toBeNull();
  });
});

describe("lookOf", () => {
  it("adds the handle or logo only when Overlay picked it and the brand kit has one", () => {
    const store = new Map([["content-studio-carousel-brand-u1", JSON.stringify({ color: "#000000", name: "Ada", handle: "@ada.tan" })]]);
    vi.stubGlobal("window", { localStorage: { getItem: (k: string) => store.get(k) ?? null } });
    try {
      expect(lookOf("u1", { overlay: { darken: 0.3, mark: "handle" } })).toEqual({ darken: 0.3, handle: "@ada.tan" });
      expect(lookOf("u1", { overlay: { darken: 0.3, mark: "off" } })).toEqual({ darken: 0.3 });
      // no logo in the kit: nothing is drawn rather than an empty mark
      expect(lookOf("u1", { overlay: { darken: 0, mark: "logo" } })).toEqual({ darken: 0 });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("cellRects", () => {
  it("splits the frame into four equal cells, left to right then down, with the gap between and none at the edges", () => {
    const [a, b, c, d] = cellRects(1080, 1350);
    expect(a).toEqual({ x: 0, y: 0, w: (1080 - CELL_GAP) / 2, h: (1350 - CELL_GAP) / 2 });
    expect(b.x).toBe(a.w + CELL_GAP);
    expect(c).toMatchObject({ x: 0, y: a.h + CELL_GAP });
    expect(d.x + d.w).toBe(1080);
    expect(d.y + d.h).toBe(1350);
  });
});

describe("boxCss", () => {
  it("draws each font with its own face at the box's size", () => {
    const faces = BOX_FONTS.map((font) => boxCss({ font, size: 72 }));
    for (const css of faces) expect(css).toMatch(/ 72px /);
    expect(new Set(faces.map((css) => css.match(/72px "?([^",]+)/)![1])).size).toBe(BOX_FONTS.length);
    expect(boxCss({ font: "classic", size: 40 })).toContain('"TikTok Sans"');
    expect(boxCss({ font: "condensed", size: 40 })).toContain("Anton");
    expect(boxCss({ font: "italic", size: 40 })).toMatch(/^italic 800 40px Poppins/);
  });
});

describe("paintSlide shadow", () => {
  it("puts a soft shadow under a shadowed box's words only", () => {
    const fills: { text: string; blur: number }[] = [];
    const state: Record<string | symbol, unknown> = {};
    const ctx = new Proxy(state, {
      get: (t, k) =>
        k in t
          ? t[k]
          : k === "measureText"
            ? (text: string) => ({ width: text.length * 20 })
            : k === "fillText"
              ? (text: string) => fills.push({ text, blur: Number(t.shadowBlur ?? 0) })
              : () => undefined,
      set: (t, k, v) => ((t[k] = v), true),
    }) as unknown as CanvasRenderingContext2D;
    paintSlide(ctx, slide(makeBox("Soft", { shadow: true, bg: "none" }), makeBox("Flat", { y: 0.8, bg: "none" })), "9x16", null);
    expect(fills.find((f) => f.text === "Soft")!.blur).toBeGreaterThan(0);
    expect(fills.find((f) => f.text === "Flat")!.blur).toBe(0);
  });
});
