// Keyword alerts (gap s52): who is talking about the adviser's name, a product
// or a topic, from Google News in Singapore via DataForSEO. Pure, so vitest
// covers the keyword rules and the response parsing.

export const MAX_KEYWORDS = 5;

/** Keywords as sent: trimmed, 2-60 characters, no duplicates, at most 5. */
export function cleanKeywords(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const k of raw) {
    if (typeof k !== "string") continue;
    const t = k.replace(/\s+/g, " ").replace(/["%]/g, "").trim();
    if (t.length < 2 || t.length > 60 || seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase());
    out.push(t);
    if (out.length === MAX_KEYWORDS) break;
  }
  return out;
}

/** A name or phrase is searched exactly ("Leo Tan"), a single word as is. */
export const searchTerm = (k: string) => (k.includes(" ") ? `"${k}"` : k);

export interface Mention {
  title: string;
  url: string;
  source: string;
  snippet: string;
  date: string;
}

function toIso(ts: unknown): string {
  if (typeof ts !== "string") return "";
  const t = Date.parse(ts.replace(" +00:00", "Z").replace(" ", "T"));
  return Number.isNaN(t) ? "" : new Date(t).toISOString();
}

const httpUrl = (u: unknown) => {
  if (typeof u !== "string") return "";
  try {
    const x = new URL(u);
    return x.protocol === "https:" || x.protocol === "http:" ? x.href : "";
  } catch {
    return "";
  }
};

/** The news items in a DataForSEO google/news/live/advanced response, newest first, once each. */
export function parseNews(body: unknown): Mention[] {
  const items = (body as { tasks?: { result?: { items?: unknown[] }[] }[] })?.tasks?.[0]?.result?.[0]?.items ?? [];
  const flat: Record<string, unknown>[] = [];
  for (const it of items as Record<string, unknown>[]) {
    if (it?.type === "top_stories" && Array.isArray(it.items)) flat.push(...(it.items as Record<string, unknown>[]));
    else if (it) flat.push(it);
  }
  const seen = new Set<string>();
  return flat
    .map((i) => ({
      title: String(i.title ?? "").trim().slice(0, 200),
      url: httpUrl(i.url),
      source: String(i.source ?? i.domain ?? "").trim().slice(0, 80),
      snippet: String(i.snippet ?? "").trim().slice(0, 280),
      date: toIso(i.timestamp),
    }))
    .filter((m) => m.title && m.url && (seen.has(m.url) ? false : (seen.add(m.url), true)))
    .sort((a, b) => b.date.localeCompare(a.date));
}
