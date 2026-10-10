// Client for "Tighten with AI" on the carousel maker. The carousel-copy edge
// function rewrites the slide text, and writes a recap slide when asked;
// validation and limits are shared with it.

import { supabase } from "@/lib/supabase";
import { EMOJI_MAX, capEmoji, countEmoji } from "@/lib/brandRules";
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

export async function tightenSlides(
  slides: CopySlide[],
  platform: CarouselPlatform,
  recap = false,
  /** The brand kit's emoji policy, kept across the whole carousel (first ones kept). */
  emoji?: keyof typeof EMOJI_MAX,
): Promise<{ slides: CopySlide[]; recap: CopySlide | null }> {
  const { data, error } = await supabase.functions.invoke("carousel-copy", {
    body: { slides: slides.map(({ title, body }) => ({ title, body })), platform, recap },
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
  const res = data as { slides?: unknown; recap?: Partial<CopySlide> | null; error?: string } | null;
  if (!Array.isArray(res?.slides) || res.slides.length !== slides.length) {
    throw new CarouselCopyError("failed", res?.error || FAILED);
  }
  const r = res.recap;
  let left = emoji ? EMOJI_MAX[emoji] : Infinity;
  const keep = (t: unknown) => {
    const out = capEmoji(String(t ?? ""), left);
    left -= countEmoji(out);
    return out;
  };
  return {
    slides: (res.slides as Partial<CopySlide>[]).map((s) => ({
      title: keep(s?.title),
      body: keep(s?.body),
    })),
    recap: recap && r && typeof r.body === "string" && r.body.trim() ? { title: keep(r.title), body: keep(r.body) } : null,
  };
}
