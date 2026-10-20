// The price table (supabase/functions/_shared/prices.ts) plus the words PriceChip and its callers show.

import { priceText, type Price } from "../../supabase/functions/_shared/prices.ts";

export * from "../../supabase/functions/_shared/prices.ts";

/**
 * The chip's text: "About US$2.75 | 1 left after this". `out` is true when this run can't go (0 left, or it needs
 * more uses than are left). For anyone but Leo it is today's "{n} left today" with no price.
 */
export function chipText(a: { price: Price | "pick" | null; left: number | null; uses?: number; leo: boolean }): { text: string; out: boolean } {
  const uses = Math.max(1, a.uses ?? 1);
  const left = a.left;
  const out = left !== null && (left === 0 || uses > left);
  if (!a.leo) return { text: left === null ? "" : left ? `${left} left today` : "None left today", out };
  if (left === 0) return { text: "None left today", out };
  const head = a.price === "pick" ? "Pick your options to see the price" : a.price ? priceText(a.price) : null;
  const after =
    left === null ? null
    : uses > left ? `${left} left today`
    : uses > 1 ? `${uses} uses, ${left - uses} left after this`
    : left === 1 ? "Last one today"
    : `${left - 1} left after this`;
  return { text: [head, after].filter(Boolean).join(" | "), out };
}

/** The line under a disabled button, for Leo only; null while the button can run. */
export function reasonText(a: { left: number | null; uses?: number }): string | null {
  if (a.left === null) return null;
  if (a.left === 0) return "Back at 8am Singapore time.";
  const uses = Math.max(1, a.uses ?? 1);
  if (uses <= a.left) return null;
  return `This needs ${uses} uses and ${a.left} ${a.left === 1 ? "is" : "are"} left today.`;
}
