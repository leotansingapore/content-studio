// The Made with AI label's preset (aiMadePreset): on only for pictures ai-image made, wherever the post's media comes from.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { markAiFiles } from "@/lib/mediaLibrary";
import { aiMadePreset } from "@/lib/postSend";
import type { SavedCarousel } from "@/lib/carousel";
import type { Slideshow } from "@/lib/slideshow";

vi.mock("@/lib/supabase", () => ({ supabase: { functions: { invoke: vi.fn() } }, SUPABASE_URL: "", SUPABASE_ANON_KEY: "" }));

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  vi.stubGlobal("window", { localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) } });
  markAiFiles(["cimg-aipic01"]);
});
afterEach(() => vi.unstubAllGlobals());

const carousel = (images: (string | undefined)[]) => ({ slides: images.map((image) => ({ title: "", body: "", ...(image ? { image } : {}) })) }) as unknown as SavedCarousel;
const show = (slides: Partial<Slideshow["slides"][number]>[]) => ({ slides: slides.map((s) => ({ id: "s", boxes: [], ...s })) }) as unknown as Slideshow;

describe("aiMadePreset", () => {
  it("is on when any picture going out is AI-made", () => {
    expect(aiMadePreset("u1", { carousel: carousel([undefined, "cimg-aipic01"]) })).toBe(true);
    expect(aiMadePreset("u1", { slideshow: show([{ image: "cimg-aipic01" }]) })).toBe(true);
    // a collage: its drawn picture is new, the AI one is a cell
    expect(aiMadePreset("u1", { slideshow: show([{ image: "cimg-collage1", cells: [null, { image: "cimg-aipic01" }, null, null] }]) })).toBe(true);
    expect(aiMadePreset("u1", { files: ["cimg-upload01", "cimg-aipic01"] })).toBe(true);
  });

  it("is off for uploads, stock photos, layouts and nothing at all", () => {
    expect(aiMadePreset("u1", { carousel: carousel([undefined, "cimg-upload01"]) })).toBe(false);
    expect(aiMadePreset("u1", { slideshow: show([{ photo: { src: "https://images.pexels.com/1.jpg", by: "A", byUrl: "" } }, { fill: "#112233" }]) })).toBe(false);
    expect(aiMadePreset("u1", { files: [undefined, "cimg-upload01"] })).toBe(false);
    expect(aiMadePreset("u1", {})).toBe(false);
  });
});
