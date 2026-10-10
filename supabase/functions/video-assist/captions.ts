// video-assist mode "captions": the post caption written again for TikTok,
// LinkedIn and Facebook, each in its own length and with its own hashtag limit
// (src/lib/platformCounters.ts holds the same numbers), from what the speaker
// says and the Instagram caption when there is one. The LLM writes; the
// hashtag limits and character caps are then kept mechanically. Pure, so
// vitest covers it (captions.test.ts).

export const CAPTION_PLATFORMS = ["tiktok", "linkedin", "facebook"] as const;
export type CaptionPlatform = (typeof CAPTION_PLATFORMS)[number];

export const PLATFORM_RULES: Record<CaptionPlatform, { name: string; shape: string; hashtags: number; maxChars: number }> = {
  tiktok: { name: "TikTok", shape: "one or two short lines, 150 characters or fewer before the hashtags, then 3 to 5 hashtags", hashtags: 5, maxChars: 2200 },
  linkedin: { name: "LinkedIn", shape: "a first line that earns the 'see more' tap, 3 to 6 short paragraphs, 100 to 180 words, a question to close, then 3 hashtags at most, no links", hashtags: 3, maxChars: 3000 },
  facebook: { name: "Facebook", shape: "40 to 80 words in 2 or 3 short paragraphs, a question to close, then 2 hashtags at most", hashtags: 2, maxChars: 63206 },
};

const MAX_TRANSCRIPT = 6000;
const str = (v: unknown, n: number) => String(v ?? "").replace(/\r/g, "").trim().slice(0, n);

export function parseCaptionsRequest(body: unknown): { ok: true; transcript: string; instagram: string; title: string; rules: string } | { ok: false; error: string } {
  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const transcript = str(b.transcript, MAX_TRANSCRIPT).replace(/\s+/g, " ");
  if (transcript.split(" ").length < 8) return { ok: false, error: "Caption the video first." };
  // rules: the brand kit's emoji, hashtag and offer-link rules, one line (src/lib/brandRules.ts)
  return { ok: true, transcript, instagram: str(b.instagram, 2200), title: str(b.title, 90).replace(/\s+/g, " "), rules: str(b.rules, 1200).replace(/\s+/g, " ") };
}

export function buildCaptionsMessages(transcript: string, instagram: string, title: string, rules = ""): { role: string; content: string }[] {
  return [
    {
      role: "system",
      content: [
        "You write the post caption that goes with a short video a licensed financial consultant in Singapore filmed, once for each platform, each in that platform's own shape:",
        ...CAPTION_PLATFORMS.map((p) => `- ${p}: ${PLATFORM_RULES[p].name}, ${PLATFORM_RULES[p].shape}.`),
        "Use only what the speaker says: their facts, figures and stories. Never promise returns, name an insurer's product or a fund, or give a personal recommendation.",
        "Write as the speaker, in plain words, first person. Plain punctuation, never an em dash.",
        ...(rules ? [rules] : []),
        'Return JSON: {"tiktok": "...", "linkedin": "...", "facebook": "..."}.',
      ].join("\n"),
    },
    {
      role: "user",
      content: [title ? `Video title: ${title}` : "", instagram ? `The Instagram caption already written for it:\n${instagram}` : "", `What the speaker says:\n${transcript}`].filter(Boolean).join("\n\n"),
    },
  ];
}

/** The text with at most `max` hashtags (the first ones kept), spacing tidied where one was taken out. */
export function capHashtags(text: string, max: number): string {
  let n = 0;
  return text
    .replace(/(^|\s)#[\p{L}\p{N}_]+/gu, (m) => (++n <= max ? m : ""))
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Each platform's caption within its limits, or null when none came back. */
export function parseCaptionsReply(raw: unknown): Partial<Record<CaptionPlatform, string>> | null {
  let o: Record<string, unknown> | null = null;
  try {
    const v = typeof raw === "string" ? JSON.parse(raw) : raw;
    o = v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
  if (!o) return null;
  const out: Partial<Record<CaptionPlatform, string>> = {};
  for (const p of CAPTION_PLATFORMS) {
    const text = typeof o[p] === "string" ? capHashtags((o[p] as string).replace(/\s*—\s*/g, ", "), PLATFORM_RULES[p].hashtags).slice(0, PLATFORM_RULES[p].maxChars) : "";
    if (text) out[p] = text;
  }
  return Object.keys(out).length ? out : null;
}
