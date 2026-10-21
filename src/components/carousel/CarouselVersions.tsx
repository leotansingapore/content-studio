// Versions of this carousel in Chinese, Malay and Tamil (edit-translate, wave 5), under the slides on /carousel,
// Leo only (CarouselPage mounts it). A stub until its task builds it: renders nothing.

import type { SavedCarousel } from "@/lib/carousel";

/** carousel is the one on screen, as saveCarousel takes it: its id is what a version's translationOf points at. */
export default function CarouselVersions(_: { userId: string; carousel: Omit<SavedCarousel, "updatedAt"> }) {
  return null;
}
