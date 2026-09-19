// Client for "Tighten with AI" on the carousel maker. The carousel-copy edge
// function rewrites the slide text; validation and limits are shared with it.

import { supabase } from "@/lib/supabase";
import type { CarouselPlatform, CopySlide } from "../../supabase/functions/carousel-copy/logic.ts";

export type CarouselCopyErrorCode = "daily_limit" | "unavailable" | "failed";

export class CarouselCopyError extends Error {
  code: CarouselCopyErrorCode;
  constructor(code: CarouselCopyErrorCode, message: string) {
    super(message);
    this.name = "CarouselCopyError";
    this.code = code;
  }
}

const FAILED = "Couldn't tighten the slides. Try again in a minute.";

export async function tightenSlides(slides: CopySlide[], platform: CarouselPlatform): Promise<CopySlide[]> {
  const { data, error } = await supabase.functions.invoke("carousel-copy", {
    body: { slides: slides.map(({ title, body }) => ({ title, body })), platform },
  });
  if (error) {
    // FunctionsHttpError hides the status and JSON body behind error.context.
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") {
      const payload = (await ctx.json().catch(() => null)) as { error?: string; code?: string } | null;
      const message = payload?.error || FAILED;
      if (ctx.status === 429 || payload?.code === "daily_limit") throw new CarouselCopyError("daily_limit", message);
      if (ctx.status === 503) throw new CarouselCopyError("unavailable", message);
      throw new CarouselCopyError("failed", message);
    }
    throw new CarouselCopyError("failed", "Couldn't reach the AI service. Check your connection and try again.");
  }
  const res = data as { slides?: unknown; error?: string } | null;
  if (!Array.isArray(res?.slides) || res.slides.length !== slides.length) {
    throw new CarouselCopyError("failed", res?.error || FAILED);
  }
  return (res.slides as Partial<CopySlide>[]).map((s) => ({
    title: String(s?.title ?? ""),
    body: String(s?.body ?? ""),
  }));
}
