// A static ad format's example picture: its own layout drawn with made-up words (STATIC_EXAMPLE's coffee shop), as a
// data URL. The format page and the Create gallery's cards both show it; drawn once per format and kept for the visit.
import { STATIC_EXAMPLE, type StaticFormat } from "@/data/staticFormats";
import { renderSvg } from "@/lib/carouselLayout";
import { createCanvasMeasure, svgDataUrl } from "@/lib/carouselRender";
import { isStatic, layoutImage } from "@/lib/imageLayout";

const drawn = new Map<string, string | null>();

export function staticExampleUrl(def: StaticFormat): string | null {
  if (drawn.has(def.slug)) return drawn.get(def.slug)!;
  let url: string | null = null;
  if (isStatic(def.slug)) {
    const usesPhoto = def.best === "photo" || def.needs === "photo";
    const d = layoutImage({ layout: def.slug, words: def.example ?? {}, brand: STATIC_EXAMPLE.brand, picture: usesPhoto ? STATIC_EXAMPLE.picture : undefined, samples: true }, "4x5", createCanvasMeasure());
    url = svgDataUrl(renderSvg(d));
  }
  drawn.set(def.slug, url);
  return url;
}
