// Your own news sources as post ideas (gap s54): which feed addresses may be
// fetched, and a small tolerant RSS / Atom reader. Pure, so vitest covers it.

export const MAX_FEEDS = 10;
export const MAX_ITEMS = 20;

/**
 * An address the server may fetch, or null. https or http on the default port
 * only, no credentials, no IP literals and no local or internal hostnames, so
 * a feed address can't be used to reach anything inside a network.
 */
export function safeFeedUrl(raw: unknown): URL | null {
  if (typeof raw !== "string" || raw.length > 500) return null;
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (u.username || u.password || u.port) return null;
  // "localhost." and "db.internal." name the same hosts as without the dot
  const host = u.hostname.toLowerCase().replace(/\.+$/, "");
  if (!host.includes(".") || host.startsWith("[") || /^[\d.]+$/.test(host) || /^[0-9a-f:]+$/.test(host)) return null;
  if (/(^|\.)(localhost|local|internal|intranet|lan|home|corp|arpa)$/.test(host)) return null;
  return u;
}

export interface FeedItem {
  title: string;
  link: string;
  date: string;
  summary: string;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

// a code point past Unicode's end (&#99999999;) would throw: keep the text as written
const point = (n: number, raw: string) => (n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : raw);

/** CDATA sections unwrapped in one pass with indexOf: a page of unclosed "<![CDATA[" can't make it scan again and again. */
function unwrapCdata(s: string): string {
  let out = "";
  let at = 0;
  for (let open = s.indexOf("<![CDATA["); open >= 0; open = s.indexOf("<![CDATA[", at)) {
    const close = s.indexOf("]]>", open + 9);
    if (close < 0) break;
    out += s.slice(at, open) + s.slice(open + 9, close);
    at = close + 3;
  }
  return out + s.slice(at);
}

export function decode(s: string): string {
  return unwrapCdata(s)
    .replace(/&#x([0-9a-f]{1,6});/gi, (m, h) => point(parseInt(h, 16), m))
    .replace(/&#(\d{1,7});/g, (m, d) => point(Number(d), m))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
}

const plain = (s: string) =>
  decode(decode(s).replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();

function tag(block: string, names: string[]): string {
  for (const n of names) {
    const m = block.match(new RegExp(`<${n}(?:\\s[^>]*)?>([\\s\\S]*?)</${n}>`, "i"));
    if (m) return m[1];
  }
  return "";
}

function linkOf(block: string, base: string): string {
  // Atom: <link href="..."/> (prefer rel="alternate" or no rel); RSS: <link>url</link>
  const atom = [...block.matchAll(/<link\b([^>]*)\/?>/gi)].map((m) => m[1]);
  const pick = atom.find((a) => /href=/.test(a) && (!/rel=/.test(a) || /rel=["']alternate["']/.test(a)));
  const raw = pick ? (pick.match(/href=["']([^"']+)["']/)?.[1] ?? "") : plain(tag(block, ["link", "guid"]));
  if (!raw.trim()) return "";
  try {
    const u = new URL(decode(raw).trim(), base);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : "";
  } catch {
    return "";
  }
}

/** The feed's title and newest items. Unknown shapes give no items rather than throwing. */
export function parseFeed(xml: string, base: string): { title: string; items: FeedItem[] } {
  const head = xml.split(/<(?:item|entry)\b/i)[0] ?? "";
  const title = plain(tag(head, ["title"])).slice(0, 120);
  const blocks = xml.match(/<(item|entry)\b[\s\S]*?<\/\1>/gi) ?? [];
  const items = blocks
    .map((b) => {
      const date = plain(tag(b, ["pubDate", "published", "updated", "dc:date"]));
      const t = Date.parse(date);
      return {
        title: plain(tag(b, ["title"])).slice(0, 200),
        link: linkOf(b, base),
        date: Number.isNaN(t) ? "" : new Date(t).toISOString(),
        summary: plain(tag(b, ["description", "summary", "content:encoded", "content"])).slice(0, 280),
      };
    })
    .filter((i) => i.title && i.link);
  items.sort((a, b) => b.date.localeCompare(a.date));
  return { title, items: items.slice(0, MAX_ITEMS) };
}
