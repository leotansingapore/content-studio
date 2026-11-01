import { afterEach, beforeEach, describe, expect, it } from "vitest";
import templatesRaw from "../../supabase/functions/_shared/designTemplates.json" with { type: "json" };
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
import { FOLLOW_QUIET_MS, MAX_DESIGNS, followStep, loadDesigns, saveDesign } from "@/lib/design";
import * as shared from "../../supabase/functions/_shared/design.ts";

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

describe("one model for the app and Connect Claude", () => {
  it("re-exports the shared sanitizer itself, so Claude's edits are cleaned by the same rules", () => {
    expect(sanitizeDesign).toBe(shared.sanitizeDesign);
    expect(sanitizeLayer).toBe(shared.sanitizeLayer);
  });
});

describe("following Claude in the open editor", () => {
  const open = { ...newDesign("tiktok", "Deck"), updatedAt: "2026-11-01T10:00:00.000Z" };
  const claude = { ...open, title: "Claude's deck", updatedAt: "2026-11-01T10:00:08.000Z" };
  const t0 = Date.parse("2026-11-01T10:00:10.000Z");
  const at = (editedAgo: number) => ({ savedAt: open.updatedAt, editedAt: t0 - editedAgo, now: t0 });

  it("applies a newer, different copy when the user has been still a while", () => {
    expect(followStep(open, claude, at(FOLLOW_QUIET_MS))).toBe("apply");
    expect(followStep(open, claude, { ...at(0), editedAt: 0 })).toBe("apply");
  });
  it("offers it instead while the user edited in the last few seconds", () => {
    expect(followStep(open, claude, at(FOLLOW_QUIET_MS - 1))).toBe("offer");
    expect(followStep(open, claude, at(0))).toBe("offer");
  });
  it("re-saves the screen over a missing copy or one no newer than the editor's last save (another device's stale list)", () => {
    expect(followStep(open, null, at(60_000))).toBe("resave");
    expect(followStep(open, { ...claude, updatedAt: open.updatedAt }, at(60_000))).toBe("resave");
    expect(followStep(open, { ...claude, updatedAt: "2026-11-01T09:00:00.000Z" }, at(0))).toBe("resave");
  });
  it("ignores a copy that only differs in its stamp", () => {
    expect(followStep(open, { ...open, updatedAt: "2026-11-01T09:00:00.000Z" }, at(60_000))).toBe("ignore");
    expect(followStep(open, { ...open, updatedAt: claude.updatedAt }, at(60_000))).toBe("ignore");
    // the same document with its keys in another order is the same document
    const reordered = { updatedAt: claude.updatedAt, slides: open.slides, format: open.format, caption: open.caption, title: open.title, id: open.id };
    expect(followStep(open, reordered, at(60_000))).toBe("ignore");
  });
});

describe("saving slideshows", () => {
  const UID = "11111111-2222-4333-8444-555555555555";
  beforeEach(() => {
    const m = new Map<string, string>();
    (globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
  });
  afterEach(() => delete (globalThis as { localStorage?: unknown }).localStorage);

  it("refuses a new one past MAX_DESIGNS instead of dropping the oldest, and still saves the ones it has", () => {
    const decks = Array.from({ length: MAX_DESIGNS }, (_, i) => ({ ...newDesign("tiktok", `Deck ${i}`), id: `dsg_${i}` }));
    for (const d of decks) expect(saveDesign(UID, d)).not.toBeNull();
    expect(saveDesign(UID, newDesign("tiktok", "One too many"))).toBeNull();
    expect(loadDesigns(UID)).toHaveLength(MAX_DESIGNS);
    expect(loadDesigns(UID).some((d) => d.id === "dsg_0")).toBe(true);
    // the editor's own save of a design it has goes through
    expect(saveDesign(UID, { ...decks[0], title: "Renamed" })?.[0]).toMatchObject({ id: "dsg_0", title: "Renamed" });
    expect(loadDesigns(UID)).toHaveLength(MAX_DESIGNS);
  });
});

describe("palette", () => {
  it("keeps up to 16 distinct hex colours and only the editor's fonts", async () => {
    const { sanitizePalette, MAX_PALETTE } = await import("@/lib/design");
    const many = Array.from({ length: 20 }, (_, i) => `#0000${(10 + i).toString(16).padStart(2, "0")}`);
    const p = sanitizePalette({ colors: ["#FFAA00", "#ffaa00", "red", 3, ...many], heading: "Anton", body: "Comic Sans" });
    expect(p.colors[0]).toBe("#ffaa00");
    expect(p.colors).toHaveLength(MAX_PALETTE);
    expect(new Set(p.colors).size).toBe(MAX_PALETTE);
    expect(p.heading).toBe("Anton");
    expect(p.body).toBeNull();
    expect(sanitizePalette(null)).toEqual({ colors: [], heading: null, body: null });
  });

  it("takes an uploaded font's family only when the brand has that font, never any other name", async () => {
    const { sanitizePalette } = await import("@/lib/design");
    expect(sanitizePalette({ heading: "BrandFont2", body: "Lora" }, ["BrandFont", "BrandFont2"])).toMatchObject({ heading: "BrandFont2", body: "Lora" });
    // removed or never uploaded: dropped, as is any other string
    expect(sanitizePalette({ heading: "BrandFont3", body: "Comic Sans" }, ["BrandFont", "BrandFont2"])).toMatchObject({ heading: null, body: null });
    expect(sanitizePalette({ heading: "BrandFont" })).toMatchObject({ heading: null });
  });
});
