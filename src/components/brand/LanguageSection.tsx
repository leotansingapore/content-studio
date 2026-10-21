// Post language (edit-translate, wave 3). After posting times on /brand, #language, Leo only (BrandPage mounts it).
// A stub until its task builds it: renders nothing.

import type { CarouselBrand } from "@/lib/carousel";

/** setBrand goes through BrandPage's own save, so two writers never race on the kit (phase4-build-brief.md, decision 14). */
export default function LanguageSection(_: { userId: string; brand: CarouselBrand; setBrand: (patch: Partial<CarouselBrand>) => void }) {
  return null;
}
