// Demo videos (brand-demo-videos, wave 4). After products on /brand, #demo-videos, Leo only (BrandPage mounts it).
// A stub until its task builds it: renders nothing.

import type { CarouselBrand } from "@/lib/carousel";

/** setBrand goes through BrandPage's own save, so two writers never race on the kit (phase4-build-brief.md, decision 14). */
export default function DemoVideosSection(_: { userId: string; brand: CarouselBrand; setBrand: (patch: Partial<CarouselBrand>) => void }) {
  return null;
}
