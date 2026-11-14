// A Library thumb for an /image design saved before its words (a campaign's "Us vs them" ad on Tok Tok Kueh, 13 Nov)
// drew a blank tile: the thumb left out /image's sample words, and an empty layout has nothing else to draw.
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_BRAND } from "@/lib/carousel";
import type { Measure } from "@/lib/carouselLayout";
import { layoutImage } from "@/lib/imageLayout";
import { sanitizeSavedImage } from "@/lib/images";
import { imageInput } from "./LibraryThumb";

vi.mock("@/lib/supabase", () => ({ SUPABASE_URL: "https://abc.supabase.co", supabase: { auth: { getSession: () => new Promise(() => undefined) } } }));

const measure: Measure = (text, font) => Array.from(text).length * font.size * 0.5;
const brand = { ...DEFAULT_BRAND, name: "Tok Tok Kueh", color: "#C2410C" };
const texts = (input: ReturnType<typeof imageInput>) => layoutImage(input, "4x5", measure).nodes.filter((n) => n.type === "text").length;

describe("an /image design's Library thumb", () => {
  it("draws an empty Us vs them with the layout's sample words instead of a blank tile", () => {
    const g = sanitizeSavedImage({ id: "img-abcd1234", layout: "us-vs-them", words: {}, updatedAt: "2026-11-13T00:00:00Z" })!;
    expect(imageInput(g, brand).samples).toBe(true);
    expect(texts(imageInput(g, brand))).toBeGreaterThan(5);
  });

  it("draws a finished design with its own words only", () => {
    const g = sanitizeSavedImage({ id: "img-abcd1234", layout: "us-vs-them", words: { headline: "Fresh every morning", them: "Others", us: "Tok Tok Kueh" }, updatedAt: "2026-11-13T00:00:00Z" })!;
    expect(imageInput(g, brand).samples).toBe(false);
  });
});
