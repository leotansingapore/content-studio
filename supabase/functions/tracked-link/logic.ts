// Pure helpers for the tracked-link edge function (tested in logic.test.ts).
// Bot detection, URL re-parsing and JSON escaping come from link-in-bio.

export { isBot, safeJson, safeRedirectUrl } from "../link-in-bio/logic.ts";

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;
const REPORT_RE = /^[a-z0-9]{20}$/;

export type Route = { kind: "link"; slug: string } | { kind: "report"; slug: string };

/** /tracked-link/<slug> or /tracked-link/report/<report slug>; null for anything else. */
export function parsePath(pathname: string): Route | null {
  const parts = pathname.split("/").filter(Boolean);
  const at = parts.lastIndexOf("tracked-link");
  const rest = at >= 0 ? parts.slice(at + 1) : parts;
  let seg: string[];
  try {
    seg = rest.map((p) => decodeURIComponent(p).toLowerCase());
  } catch {
    return null;
  }
  if (seg.length === 1 && SLUG_RE.test(seg[0])) return { kind: "link", slug: seg[0] };
  if (seg.length === 2 && seg[0] === "report" && REPORT_RE.test(seg[1])) return { kind: "report", slug: seg[1] };
  return null;
}

const IPV4_RE = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
const IPV6_RE = /^[0-9a-f:.]{2,45}$/i;
const ipOrNull = (v: string | null | undefined) => {
  const t = (v ?? "").trim();
  return IPV4_RE.test(t) || (t.includes(":") && IPV6_RE.test(t)) ? t.toLowerCase() : null;
};

/**
 * The visitor's IP. Supabase's gateway rewrites x-forwarded-for (first entry:
 * whoever called it) and cf-connecting-ip, so a forged one is dropped on a
 * direct call. Through the app's /t/ rewrite that caller is a Vercel server,
 * and Vercel names the visitor in x-vercel-forwarded-for. That header can be
 * forged on a direct call; it then only makes one more "person", like a
 * changed user agent, and the SQL caps bound it.
 */
export function clientIp(h: Headers): string | null {
  return ipOrNull(h.get("x-vercel-forwarded-for")?.split(",")[0]) ??
    ipOrNull(h.get("x-forwarded-for")?.split(",")[0]) ?? ipOrNull(h.get("cf-connecting-ip"));
}

/** SHA-256 hex of "v:<ip>|<user agent>", the key cs_tracked_link_click hashes again with its salt; null without an IP. */
export async function visitorKey(ip: string | null, userAgent: string | null): Promise<string | null> {
  if (!ip) return null;
  const bytes = new TextEncoder().encode(`v:${ip}|${userAgent ?? ""}`);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** What an unknown link answers. Supabase serves text/html as text/plain, so this is plain text. */
export const NOT_FOUND_TEXT = "This link isn't available. Check the address, or ask the person who shared it.\n";
