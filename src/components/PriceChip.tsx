import type { ReactNode } from "react";
import { chipText, priceOf, type Price, type PriceOpts } from "@/lib/prices";
import { useLeoOnly } from "@/lib/useLeoOnly";
import type { UsageFeature } from "../../supabase/functions/_shared/usageCaps.ts";

/**
 * A paid button's price and what is left after this run (business-cost-preview). Leo sees the chip; everyone else
 * sees `fallback`, today's uses-left element, unchanged. Disabling the button and the reasonText line are the caller's.
 * `price` overrides the table for a button that spends from several caps (sumPrices) or for WRITE_PRICE.
 */
export default function PriceChip(p: {
  feature?: UsageFeature;
  opts?: PriceOpts;
  price?: Price | "pick" | null;
  left: number | null;
  uses?: number;
  fallback?: ReactNode;
}): JSX.Element | null {
  const leo = useLeoOnly();
  if (!leo) return p.fallback == null ? null : <>{p.fallback}</>;
  const price = p.price !== undefined ? p.price : p.feature ? priceOf(p.feature, p.opts) : null;
  const { text, out } = chipText({ price, left: p.left, uses: p.uses, leo: true });
  if (!text) return null;
  return <span className={`text-[11px] tabular-nums ${out ? "font-medium text-destructive" : "text-muted-foreground"}`}>{text}</span>;
}
