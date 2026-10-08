// YouTube link to clips (gap v16): read a video's captions through DataForSEO,
// never the video itself, and turn them into sentences the clip finder takes.
// Pure, so vitest covers the link parsing and the caption shaping.

/** The 11-character video id from a watch, youtu.be, shorts, live or embed link. */
export function youtubeId(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let u: URL;
  try {
    u = new URL(raw.trim().replace(/^(?!https?:\/\/)/i, "https://"));
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase().replace(/^(www|m|music)\./, "");
  let id: string | null = null;
  if (host === "youtu.be") id = u.pathname.split("/")[1] ?? null;
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    const [, first, second] = u.pathname.split("/");
    id = first === "watch" ? u.searchParams.get("v") : ["shorts", "live", "embed", "v"].includes(first) ? second ?? null : null;
  }
  return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
}

export interface CaptionSentence {
  s: number;
  e: number;
  text: string;
}

const MAX_SENTENCE_SECONDS = 20;

/**
 * DataForSEO subtitle items to sentences: sound tags like [Music] or ♪ dropped,
 * lines joined until one ends a sentence, a pause passes a second or the
 * sentence reaches 20 s (auto captions carry no punctuation).
 */
export function captionSentences(payload: unknown): { title: string; duration: number; sentences: CaptionSentence[] } {
  const result = (payload as { tasks?: { result?: { title?: unknown; items?: unknown }[] }[] })?.tasks?.[0]?.result?.[0];
  const items = Array.isArray(result?.items) ? result.items : [];
  const lines: CaptionSentence[] = [];
  for (const raw of items) {
    const it = (raw ?? {}) as Record<string, unknown>;
    const s = Number(it.start_time);
    const e = Number(it.end_time);
    const text = String(it.text ?? "")
      .replace(/\[[^\]]*\]|\([^)]*\)|♪/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s || !/[A-Za-z0-9]/.test(text)) continue;
    const prevEnd = lines.length ? lines[lines.length - 1].e : 0;
    lines.push({ s: Math.max(s, prevEnd), e: Math.max(e, prevEnd + 0.1), text });
  }
  const sentences: CaptionSentence[] = [];
  let cur: CaptionSentence | null = null;
  for (const l of lines) {
    if (cur && (l.s - cur.e > 1 || l.e - cur.s > MAX_SENTENCE_SECONDS)) {
      sentences.push(cur);
      cur = null;
    }
    cur = cur ? { s: cur.s, e: l.e, text: `${cur.text} ${l.text}` } : { ...l };
    if (/[.!?]["')\]]?$/.test(l.text)) {
      sentences.push(cur);
      cur = null;
    }
  }
  if (cur) sentences.push(cur);
  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    title: typeof result?.title === "string" ? result.title.slice(0, 200) : "",
    duration: round(lines.length ? lines[lines.length - 1].e : 0),
    sentences: sentences.map((x) => ({ s: round(x.s), e: round(x.e), text: x.text.slice(0, 400) })),
  };
}
