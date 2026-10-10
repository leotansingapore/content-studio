// The brand kit's writing rules (My Playbook > Brand kit): the offers a post may
// link to, an emoji policy and a hashtag policy. Write, Batch, the carousel's
// Tighten and the video captions pass them to the writer as one line, then keep
// the countable parts in code: emoji and hashtags over the policy are taken out,
// and a link that is not one of the offers is flagged (checkLimits). Counting
// and matching only, no judgment.

import { dmFields, dmLinks } from "@/lib/bioPage";
import type { CarouselBrand } from "@/lib/carousel";
import { countHashtags } from "@/lib/platformCounters";
import { capHashtags } from "../../supabase/functions/video-assist/captions.ts";

type Rules = Pick<CarouselBrand, "offers" | "emojiPolicy" | "hashtagPolicy" | "instagram" | "facebook" | "whatsapp" | "whatsappText"> | null | undefined;

export const EMOJI_MAX = { one: 1, none: 0 } as const;
export const HASHTAG_MAX = { ten: 10, few: 4, none: 0 } as const;

/** An http(s) link from what was typed ("site.sg/x" gets https://), or null. */
export function offerUrl(raw: string): string | null {
  const t = String(raw ?? "").trim();
  if (!t || /\s/.test(t)) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(t) ? t : `https://${t}`;
  try {
    const u = new URL(withScheme);
    return /^https?:$/.test(u.protocol) && u.hostname.includes(".") ? withScheme : null;
  } catch {
    return null;
  }
}

/** The offers that have a usable link, the link cleaned. */
export function brandOffers(brand: Rules): { name: string; url: string }[] {
  return (brand?.offers ?? []).flatMap((o) => {
    const url = offerUrl(o.url);
    return url ? [{ name: o.name.trim() || url, url }] : [];
  });
}

/** The links a post may carry: the offers and the brand kit's DM links. Empty when there are no offers, so nothing is flagged. */
export function allowedLinks(brand: Rules): string[] {
  const offers = brandOffers(brand).map((o) => o.url);
  return offers.length ? [...offers, ...dmLinks(dmFields(brand ?? null, {})).map((l) => l.url)] : [];
}

/** The rules as one line for the writer's request, or "" when the kit sets none. */
export function brandRulesLine(brand: Rules): string {
  const parts: string[] = [];
  if (brand?.emojiPolicy === "none") parts.push("Use no emoji at all.");
  if (brand?.emojiPolicy === "one") parts.push("Use one emoji at most in the whole post.");
  if (brand?.hashtagPolicy === "none") parts.push("Use no hashtags.");
  if (brand?.hashtagPolicy === "few") parts.push("End with 2 to 4 relevant hashtags, never more.");
  if (brand?.hashtagPolicy === "ten") parts.push("Use 10 hashtags at most.");
  const offers = brandOffers(brand);
  if (offers.length) {
    parts.push(`When the post points people somewhere, use one of these links exactly as written and never any other link: ${offers.map((o) => `${o.name}: ${o.url}`).join("; ")}.`);
  }
  return parts.length ? `MY BRAND RULES (these win over any other emoji, hashtag or link guidance): ${parts.join(" ")}` : "";
}

// One emoji as the reader sees it: skin tone, variation selector, tag letters and joined
// sequences included, a flag's two letters, a keycap. (c), (r) and TM are not counted.
const EMOJI_SRC =
  "(?:[0-9#*]\\uFE0F?\\u20E3|[\\u{1F1E6}-\\u{1F1FF}]{2}|(?![\\u00A9\\u00AE\\u2122])\\p{Extended_Pictographic}\\uFE0F?\\p{Emoji_Modifier}?[\\u{E0020}-\\u{E007F}]*(?:\\u200D\\p{Extended_Pictographic}\\uFE0F?\\p{Emoji_Modifier}?)*)";

export function countEmoji(text: string): number {
  return (String(text ?? "").match(new RegExp(EMOJI_SRC, "gu")) ?? []).length;
}

/** The text with at most `max` emoji (the first ones kept); a removed one takes one side's space with it. */
export function capEmoji(text: string, max: number): string {
  if (countEmoji(text) <= max) return text;
  let n = 0;
  return text
    .replace(new RegExp(`([ \\t]*)${EMOJI_SRC}([ \\t]?)`, "gu"), (m, before: string, after: string) => (++n <= max ? m : before && after ? after : ""))
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Generated text inside the kit's emoji and hashtag policies; unchanged when it already is. */
export function applyBrandRules(text: string, brand: Rules): string {
  let out = text;
  const e = brand?.emojiPolicy ? EMOJI_MAX[brand.emojiPolicy] : undefined;
  const h = brand?.hashtagPolicy ? HASHTAG_MAX[brand.hashtagPolicy] : undefined;
  if (e !== undefined) out = capEmoji(out, e);
  if (h !== undefined && countHashtags(out) > h) out = capHashtags(out, h);
  return out;
}
