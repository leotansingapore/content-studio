import { describe, expect, it } from "vitest";
import templatesRaw from "@/data/designTemplates.json";
import { staleCutout } from "@/components/design/SlideView";
import {
  FORMAT_H,
  accentRuns,
  fontWeight,
  freshSlide,
  gradientCss,
  grainOpacity,
  loadTemplates,
  lookFilter,
  newDesign,
  newLayer,
  plainText,
  sanitizeDesign,
  sanitizeLayer,
  type DesignSlide,
  type ImageLayer,
} from "@/lib/design";
import { designToDraft } from "@/pages/DesignEditorPage";

describe("accent words", () => {
  it("splits [[ ]] runs and keeps the rest", () => {
    expect(accentRuns("a [[b c]] d")).toEqual([
      { text: "a ", accent: false },
      { text: "b c", accent: true },
      { text: " d", accent: false },
    ]);
    expect(accentRuns("plain")).toEqual([{ text: "plain", accent: false }]);
    expect(plainText("x [[y]] [[z]]")).toBe("x y z");
  });
});

describe("looks", () => {
  it("none has no filter and no grain", () => {
    expect(lookFilter("none")).toBeUndefined();
    expect(grainOpacity("none")).toBe(0);
  });
  it("scales with strength: 0 is plain, 100 is twice the listed change", () => {
    expect(lookFilter("bw", 0)).toBeUndefined();
    expect(lookFilter("bw", 50)).toBe("grayscale(1) contrast(1.08)");
    expect(lookFilter("vivid", 100)).toBe("saturate(1.8) contrast(1.16)");
  });
  it("grain only on grain looks, capped", () => {
    expect(grainOpacity("noir", 50)).toBeCloseTo(0.25);
    expect(grainOpacity("noir", 100)).toBeLessThanOrEqual(0.85);
    expect(grainOpacity("vivid", 100)).toBe(0);
  });
});

describe("gradients and fonts", () => {
  it("writes rgba stops with the colour's own alpha times the stop opacity", () => {
    expect(gradientCss(180, [{ at: 0, color: "#000000", opacity: 0 }, { at: 100, color: "#ff000080", opacity: 1 }])).toBe("linear-gradient(180deg, rgba(0, 0, 0, 0) 0%, rgba(255, 0, 0, 0.502) 100%)");
  });
  it("asks for the nearest weight a font has", () => {
    expect(fontWeight("Anton", 700)).toBe(400);
    expect(fontWeight("Inter", 650)).toBe(600);
    expect(fontWeight("Unknown", 650)).toBe(650);
  });
});

describe("sanitizing", () => {
  it("drops pictures from anywhere but https, template paths, device keys and the brand kit", () => {
    const bad = sanitizeLayer({ ...newLayer("image", "tiktok"), src: "javascript:alert(1)" }, "tiktok") as ImageLayer;
    expect(bad.src).toBe("");
    for (const ok of ["https://images.pexels.com/a.jpg", "/templates/behind/cover.jpg", "cimg-abc", "brand:logo", "brand:photo"])
      expect((sanitizeLayer({ ...newLayer("image", "tiktok"), src: ok }, "tiktok") as ImageLayer).src).toBe(ok);
    expect((sanitizeLayer({ ...newLayer("image", "tiktok"), src: "brand:logos" }, "tiktok") as ImageLayer).src).toBe("");
  });
  it("clamps numbers and refuses unknown types", () => {
    expect(sanitizeLayer({ type: "video" }, "tiktok")).toBeNull();
    const t = sanitizeLayer({ ...newLayer("text", "tiktok"), size: 99999, color: "red", opacity: 7 }, "tiktok");
    expect(t).toMatchObject({ size: 600, color: "#ffffff", opacity: 1 });
  });
  it("needs an id and at least one slide", () => {
    expect(sanitizeDesign({ id: "x", slides: [] })).toBeNull();
    expect(sanitizeDesign({ slides: [{}] })).toBeNull();
    expect(sanitizeDesign({ id: "x", slides: [{}] })?.slides[0]).toMatchObject({ background: "#000000", layers: [] });
  });
});

describe("templates", () => {
  it("all 16 load, each in both sizes but Classic TikTok", async () => {
    const list = await loadTemplates();
    expect(list).toHaveLength((templatesRaw as unknown[]).length);
    expect(list).toHaveLength(16);
    for (const t of list) {
      expect(t.docs.tiktok?.slides.length).toBeGreaterThan(0);
      if (t.id !== "classic-tiktok") expect(t.docs.instagram?.slides.length).toBeGreaterThan(0);
    }
  });
  it("lose nothing to the sanitizer", () => {
    for (const raw of templatesRaw as { id: string; docs: Record<string, { slides: { layers: unknown[] }[] }> }[])
      for (const [f, doc] of Object.entries(raw.docs)) {
        const d = sanitizeDesign({ id: raw.id, format: f, slides: doc.slides });
        expect(d?.slides.map((s) => s.layers.length)).toEqual(doc.slides.map((s) => s.layers.length));
      }
  });
  it("point only at pictures that render", async () => {
    const srcs = (await loadTemplates()).flatMap((t) => Object.values(t.docs).flatMap((d) => d!.slides.flatMap((s) => s.layers.flatMap((l) => (l.type === "image" ? [l.src] : [])))));
    expect(srcs.every((s) => s === "" || s.startsWith("https://images.pexels.com/") || s.startsWith("/templates/behind/"))).toBe(true);
  });
});

describe("copies and cutouts", () => {
  const slide = (photo: string): DesignSlide => ({
    id: "s",
    background: "#000000",
    layers: [
      { ...newLayer("image", "tiktok"), id: "img_a", src: photo } as ImageLayer,
      { ...newLayer("image", "tiktok"), id: "cut_b", src: "/templates/behind/cover-cut.webp", locked: true, cutout: { of: "img_a", src: "/templates/behind/cover.jpg" } } as ImageLayer,
    ],
  });
  it("gives every layer a new id and keeps the cutout pointing at its photo", () => {
    const f = freshSlide(slide("/templates/behind/cover.jpg"));
    expect(f.layers[0].id).not.toBe("img_a");
    expect((f.layers[1] as ImageLayer).cutout?.of).toBe(f.layers[0].id);
  });
  it("hides a cutout once its photo is swapped", () => {
    const keep = slide("/templates/behind/cover.jpg");
    const swapped = slide("https://images.pexels.com/x.jpg");
    expect(staleCutout(keep, keep.layers[1])).toBe(false);
    expect(staleCutout(swapped, swapped.layers[1])).toBe(true);
  });
});

describe("saving to My posts", () => {
  it("uses the caption, else the slides' words, and attaches the pictures", () => {
    const d = newDesign("instagram", "Five rules");
    d.slides[0].layers.push({ ...newLayer("text", "instagram"), text: "Rule [[one]]" } as never);
    const e = designToDraft(d, ["cimg-dz1"], null, "2026-10-31T00:00:00Z");
    expect(e).toMatchObject({ hook: "Five rules", draft: "Rule one", platform: "instagram", format: "carousel", attached: ["cimg-dz1"], status: "draft" });
    expect(designToDraft({ ...d, caption: "Mine" }, [], null, "").draft).toBe("Mine");
  });
  it("sizes: TikTok 1920 tall, Instagram 1350", () => {
    expect(FORMAT_H).toEqual({ tiktok: 1920, instagram: 1350 });
  });
});
