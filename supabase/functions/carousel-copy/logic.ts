// Pure logic for carousel-copy ("Tighten with AI" on the carousel maker):
// checking the request, the prompt, the OpenAI request body and checking what
// comes back. No Deno or npm imports, so vitest covers it (logic.test.ts) and
// the app shares its types.

export const OPENAI_MODEL = "gpt-4.1";
export const MIN_SLIDES = 2;
export const MAX_SLIDES = 10;
export const MAX_TITLE_CHARS = 200;
export const MAX_BODY_CHARS = 600;
/** Hard caps on what comes back; the prompt asks for less (10 and 30). */
export const TITLE_MAX_WORDS = 14;
export const BODY_MAX_WORDS = 40;

export type CarouselPlatform = "instagram" | "linkedin";

export interface CopySlide {
  title: string;
  body: string;
}

export interface CarouselRequest {
  slides: CopySlide[];
  platform: CarouselPlatform;
}

export type ParsedRequest = { ok: true; request: CarouselRequest } | { ok: false; error: string };

export function parseCarouselRequest(body: unknown): ParsedRequest {
  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  const raw = b?.slides;
  if (!Array.isArray(raw) || raw.length < MIN_SLIDES) {
    return { ok: false, error: `Send at least ${MIN_SLIDES} slides.` };
  }
  if (raw.length > MAX_SLIDES) {
    return { ok: false, error: `A carousel can have at most ${MAX_SLIDES} slides.` };
  }
  const slides: CopySlide[] = [];
  for (let i = 0; i < raw.length; i++) {
    const s = raw[i] && typeof raw[i] === "object" ? (raw[i] as Record<string, unknown>) : null;
    const title = typeof s?.title === "string" ? s.title.trim() : "";
    const text = typeof s?.body === "string" ? s.body.trim() : "";
    if (!title && !text) return { ok: false, error: `Slide ${i + 1} is empty. Add text or delete it.` };
    if (title.length > MAX_TITLE_CHARS || text.length > MAX_BODY_CHARS) {
      return { ok: false, error: `Slide ${i + 1} has too much text. Shorten it first.` };
    }
    slides.push({ title, body: text });
  }
  return { ok: true, request: { slides, platform: b?.platform === "linkedin" ? "linkedin" : "instagram" } };
}

function roleOf(index: number, total: number): string {
  if (index === 0) return "cover";
  return index === total - 1 ? "call to action" : "point";
}

export function buildCarouselPrompt(req: CarouselRequest): { system: string; user: string } {
  const n = req.slides.length;
  const platform = req.platform === "linkedin" ? "LinkedIn" : "Instagram";
  const system = [
    `You edit ${platform} carousel slides for a licensed financial consultant in Singapore.`,
    "Tighten every slide so it reads fast on a phone: a short, punchy title and a plain-language body.",
    "Rules:",
    `- Return exactly ${n} slides in the same order. Slide 1 is the cover hook and the last slide is the call to action; keep those roles.`,
    "- Title: at most 10 words. Body: at most 30 words. The body can be empty when the title says it all.",
    "- Keep each slide's meaning and the consultant's voice. Don't add facts, numbers, statistics, product names or insurer names that aren't in the original.",
    "- Plain text only: no markdown, no hashtags, no slide numbers. Keep emojis only where the original has them.",
    '- MAS-safe wording: never promise or guarantee returns or outcomes; never say "risk-free", "100% safe", "easy money" or "act now"; no "best" or "number one" claims about products or insurers; label any return figure as projected or illustrated.',
    "- Use Singapore English spelling.",
    'Reply with JSON only: {"slides":[{"title":"...","body":"..."}]}.',
  ].join("\n");
  const user = `Tighten these slides:\n${JSON.stringify(
    req.slides.map((s, i) => ({ slide: i + 1, role: roleOf(i, n), title: s.title, body: s.body })),
    null,
    2,
  )}`;
  return { system, user };
}

/** Structured output: the model must return exactly this shape. */
export const CAROUSEL_RESPONSE_FORMAT = {
  type: "json_schema",
  json_schema: {
    name: "carousel_slides",
    strict: true,
    schema: {
      type: "object",
      properties: {
        slides: {
          type: "array",
          items: {
            type: "object",
            properties: { title: { type: "string" }, body: { type: "string" } },
            required: ["title", "body"],
            additionalProperties: false,
          },
        },
      },
      required: ["slides"],
      additionalProperties: false,
    },
  },
} as const;

export function buildOpenAiBody(prompt: { system: string; user: string }) {
  return {
    model: OPENAI_MODEL,
    temperature: 0.4,
    max_tokens: 1800,
    response_format: CAROUSEL_RESPONSE_FORMAT,
    messages: [
      { role: "system", content: prompt.system },
      { role: "user", content: prompt.user },
    ],
  };
}

/** The reply text of a chat completion, or null when missing or refused. */
export function messageContent(data: unknown): string | null {
  const choices = (data as { choices?: { message?: { content?: unknown; refusal?: unknown } }[] } | null)?.choices;
  const message = Array.isArray(choices) ? choices[0]?.message : undefined;
  if (!message || message.refusal) return null;
  return typeof message.content === "string" ? message.content : null;
}

function cleanCopy(text: unknown): string {
  return String(text ?? "")
    .replace(/\*\*|__|`/g, "")
    .replace(/^\s*#{1,6}\s+/gm, "")
    .replace(/^\s*(?:slide|page)\s*\d{1,2}\s*[:.\-–—]\s*/i, "")
    .replace(/(^|\s)#[\p{L}_][\p{L}\p{N}_]*/gu, "$1")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .trim();
}

function capWords(text: string, max: number): string {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= max) return text;
  const cut = words.slice(0, max).join(" ");
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  if (end >= cut.length / 2) return cut.slice(0, end + 1);
  return `${cut.replace(/[,;:\-–—]+$/, "")}…`;
}

/** Checks and tidies the model's slides. Null unless there is one usable slide per slide sent. */
export function validateCarouselCopy(content: string | null, expected: number): CopySlide[] | null {
  if (!content) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return null;
  }
  const slides = (parsed as { slides?: unknown } | null)?.slides;
  if (!Array.isArray(slides) || slides.length !== expected) return null;
  const out: CopySlide[] = [];
  for (const raw of slides) {
    if (!raw || typeof raw !== "object") return null;
    const s = raw as Record<string, unknown>;
    const title = capWords(cleanCopy(s.title), TITLE_MAX_WORDS).replace(/[.:;,]+$/, "");
    const body = capWords(cleanCopy(s.body), BODY_MAX_WORDS);
    if (!title && !body) return null;
    out.push({ title, body });
  }
  return out;
}
