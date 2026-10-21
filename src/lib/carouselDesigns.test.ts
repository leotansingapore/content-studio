import { describe, expect, it } from "vitest";
import { CAROUSEL_DESIGNS, CAROUSEL_SIZES, DESIGNS, SAFE_9X16, SLIDE_SIZES, designLook, isDesign, isSize } from "@/lib/carouselDesigns";
import { CONTENT_TOP, FOOTER_RULE_Y, SLIDE_HEIGHT, SLIDE_IMAGE, SLIDE_WIDTH } from "@/lib/carouselLayout";

describe("carousel designs", () => {
  it("has the eight designs in the link order, with the spec's labels and starting looks", () => {
    expect(Object.keys(DESIGNS)).toEqual([...CAROUSEL_DESIGNS]);
    expect(CAROUSEL_DESIGNS.map((d) => DESIGNS[d].label)).toEqual(["Clean", "Bold cover", "Numbered", "Checklist", "Post card", "Photo cover", "Quote", "Notebook"]);
    expect(Object.fromEntries(CAROUSEL_DESIGNS.map((d) => [d, `${DESIGNS[d].font ?? "-"} ${DESIGNS[d].paper ?? "-"}`]))).toEqual({
      clean: "- -",
      bold: "modern light",
      numbered: "modern light",
      checklist: "classic tint",
      "post-card": "modern light",
      "photo-cover": "classic dark",
      quote: "serif light",
      notebook: "serif light",
    });
  });

  it("starts a picked design on its own font and paper, and Clean on the carousel's", () => {
    const current = { font: "serif", paper: "dark" } as const;
    expect(designLook("numbered", current)).toEqual({ font: "modern", paper: "light" });
    expect(designLook("clean", current)).toEqual(current);
  });

  it("reads only known designs and sizes", () => {
    expect(isDesign("post-card")).toBe(true);
    expect(isDesign("comic")).toBe(false);
    expect(isDesign(undefined)).toBe(false);
    expect(isSize("9x16")).toBe(true);
    expect(isSize("16x9")).toBe(false);
  });
});

describe("slide sizes", () => {
  it("keeps 4:5 as today's frame", () => {
    expect(SLIDE_SIZES["4x5"]).toMatchObject({ width: SLIDE_WIDTH, height: SLIDE_HEIGHT, top: CONTENT_TOP, footer: FOOTER_RULE_Y, footerEnd: SLIDE_HEIGHT, image: SLIDE_IMAGE.height, pdf: true });
  });

  it("offers 1:1 and 9:16, the PDF at 4:5 and 1:1 only, and keeps 9:16's footer clear of the bottom 250 px", () => {
    expect(CAROUSEL_SIZES.map((s) => [SLIDE_SIZES[s].label, SLIDE_SIZES[s].width, SLIDE_SIZES[s].height, SLIDE_SIZES[s].pdf])).toEqual([
      ["4:5", 1080, 1350, true],
      ["1:1", 1080, 1080, true],
      ["9:16", 1080, 1920, false],
    ]);
    const tall = SLIDE_SIZES["9x16"];
    expect(tall.top).toBeGreaterThanOrEqual(SAFE_9X16 + 50);
    expect(tall.footerEnd).toBe(1920 - SAFE_9X16);
    expect(tall.footerEnd - tall.footer).toBe(SLIDE_HEIGHT - FOOTER_RULE_Y);
  });
});
