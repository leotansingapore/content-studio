// The formats a remix can become on their own page, /make/<slug> (docs/north-star/items/formats-slideshow.md).
// One entry per format: MakeFormatPage finds it by slug, and the Remix sheet's Make row lists each one under
// "Also make". A new format adds one entry here; formats-gallery lists them at /make later.

import { lazy, type ComponentType, type LazyExoticComponent } from "react";
import type { RemixSource } from "@/lib/remixSource";
import type { UsageFeature } from "../../supabase/functions/_shared/usageCaps.ts";

export interface FormatDef {
  slug: "slideshow" | "wall-of-text";
  name: string;
  blurb: string;
  kind: "slides" | "video" | "text";
  /** The daily cap the main button spends. */
  cap: UsageFeature;
  Component: LazyExoticComponent<ComponentType<{ userId: string; source: RemixSource | null }>>;
}

export const FORMATS: FormatDef[] = [
  {
    slug: "slideshow",
    name: "Slideshow",
    blurb: "Photo slides with words on them, for Instagram and TikTok.",
    kind: "slides",
    cap: "remix-make",
    Component: lazy(() => import("@/components/make/Slideshow")),
  },
  {
    slug: "wall-of-text",
    name: "Wall of text",
    blurb: "Bold words over a video, the kind people stop to read.",
    kind: "video",
    cap: "remix-make",
    Component: lazy(() => import("@/components/make/WallOfText")),
  },
];

export const formatBySlug = (slug: string | undefined) => FORMATS.find((f) => f.slug === slug) ?? null;
