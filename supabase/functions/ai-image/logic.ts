// Pure logic for ai-image: "Make the image" on Write turns the post's image
// prompt into one picture with Higgsfield Soul v2. No Deno or npm imports, so
// vitest covers it.

export const HF_BASE = "https://api.higgsfield.ai";
export const HF_MODEL = "higgsfield-ai/soul/v2/standard";
export const MIN_PROMPT = 10;
export const MAX_PROMPT = 1200;

/** Leo's standing rule: people default to Singaporeans in Singapore, each one distinct. */
export const PEOPLE_RULE =
  "Set in Singapore. Any people shown are Singaporean or other Asian (a natural mix of Chinese, Malay, Indian and Eurasian), " +
  "each one clearly different from the others in age, build, face, hair and clothes; good-looking, well-groomed, natural expressions. " +
  "Polished lifestyle photograph. No text, no words, no logos, no watermarks.";

export type ImageRequest = { mode: "start"; prompt: string } | { mode: "status"; id: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseImageRequest(raw: unknown): { ok: true; request: ImageRequest } | { ok: false; error: string } {
  const b = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  if (b.mode === "status") {
    return typeof b.id === "string" && UUID.test(b.id) ? { ok: true, request: { mode: "status", id: b.id.toLowerCase() } } : { ok: false, error: "That image job isn't known." };
  }
  const prompt = typeof b.prompt === "string" ? b.prompt.replace(/\s+/g, " ").trim() : "";
  if (prompt.length < MIN_PROMPT) return { ok: false, error: "Write a longer image prompt first." };
  if (prompt.length > MAX_PROMPT) return { ok: false, error: `Keep the image prompt under ${MAX_PROMPT} characters.` };
  return { ok: true, request: { mode: "start", prompt } };
}

/** The body for Soul v2: the post's prompt plus the people rule, 3:4 (the nearest to a 4:5 slide), 1080p. */
export function buildImageBody(prompt: string): Record<string, unknown> {
  return { prompt: `${prompt}\n\n${PEOPLE_RULE}`, aspect_ratio: "3:4", resolution: "1080p", batch_size: 1 };
}

export type JobState = { state: "working" } | { state: "done"; url: string } | { state: "failed"; error: string };

/** Higgsfield's request status in the studio's words. Only an https image link counts as done. */
export function readStatus(data: unknown): JobState {
  const d = (data ?? {}) as Record<string, unknown>;
  const status = String(d.status ?? "");
  if (status === "queued" || status === "in_progress") return { state: "working" };
  if (status === "completed") {
    const url = (d.images as { url?: unknown }[] | undefined)?.[0]?.url;
    return typeof url === "string" && /^https:\/\//.test(url) ? { state: "done", url } : { state: "failed", error: "The image came back empty. Try again." };
  }
  if (status === "nsfw") return { state: "failed", error: "The image was blocked by the safety filter. Change the prompt and try again." };
  return { state: "failed", error: "The image didn't come through. Try again." };
}
