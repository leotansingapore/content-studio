// The MAS check every server writer asks Jev (phase 3 decision 10), so the wording and the warn rule live once.
// It warns and never blocks. Pure, no imports: Deno, node and vitest all load it.

/** A Jev noul question's instructions, word for word from docs/north-star/items/formats-skits.md. */
export const MAS_QUESTION =
  "This is a script a licensed Singapore financial adviser will post on social media. Does any line promise or imply a return or result, call something guaranteed or risk-free, name an insurer or a specific policy, or tell the viewer what they personally should buy?";

/** Proposed cut (decision 11): the integrator sets the real number after reading the first runs. */
export const MAS_WARN = 0.5;

/** Warn when Jev's yes is at MAS_WARN or more; null when Jev gave nothing, so the client falls back to scanCompliance. */
export function masWarn(p: number | null | undefined): boolean | null {
  return typeof p === "number" && Number.isFinite(p) ? p >= MAS_WARN : null;
}
