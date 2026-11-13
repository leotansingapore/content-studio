// Pure logic for ai-image: "Make the image" on Write turns the post's image
// prompt into one picture with Higgsfield Soul v2. No Deno or npm imports, so
// vitest covers it.

export const HF_BASE = "https://api.higgsfield.ai";
export const HF_MODEL = "higgsfield-ai/soul/v2/standard";
export const MIN_PROMPT = 10;
export const MAX_PROMPT = 1200;

/**
 * PEOPLE_RULE without its "No text" clause, for a picture that carries words ({mode: "start", words: true}: a static
 * format made as a photo, whose prompt quotes every line to print and bars other logos itself).
 */
export const WORDS_PEOPLE_RULE =
  "Set in Singapore. Any people shown are Singaporean or other Asian (a natural mix of Chinese, Malay, Indian and Eurasian), " +
  "each one clearly different from the others in age, build, face, hair and clothes; good-looking, well-groomed, natural expressions. " +
  "Polished lifestyle photograph.";
/** Leo's standing rule: people default to Singaporeans in Singapore, each one distinct. */
export const PEOPLE_RULE = `${WORDS_PEOPLE_RULE} No text, no words, no logos, no watermarks.`;

/** "Fix it" under a finished picture: Qwen Image 3 edits it from one instruction (the web stand-in for
 * Higgsfield's Photoshop /image-fixer skill, which needs a desktop app). */
export const FIX_MODEL = "alibaba/qwen-image-3/edit";
export const MIN_FIX = 3;
export const MAX_FIX = 300;
export const KEEP_RULE = "Change only what is asked and keep everything else in the picture exactly as it is. Anyone added is Singaporean or other Asian.";

/** A photo ad's reference pictures (openai.ts REF_LINES): the brand kit's logo. */
export type Refs = { logo?: string };
/** A reference picture: a PNG, JPEG or WebP data URL, at most this long (remix-link's own limit for a picture). */
export const MAX_REF_CHARS = 1_500_000;
const REF = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

export type ImageRequest =
  /**
   * words: the picture prints the prompt's quoted lines, so no "No text" rule and no Soul v2, which can't print them.
   * refs (only with words): pictures GPT Image copies into the ad; one that isn't a picture is left out.
   */
  | { mode: "start"; prompt: string; words?: true; refs?: Refs }
  | { mode: "status"; token: string }
  | { mode: "fix"; token: string; fix: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseImageRequest(raw: unknown): { ok: true; request: ImageRequest } | { ok: false; error: string } {
  const b = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  if (b.mode === "status") {
    // the owner check (openJobToken) needs the caller's uid, so it happens in index.ts
    return typeof b.token === "string" && b.token.length <= 120 ? { ok: true, request: { mode: "status", token: b.token } } : { ok: false, error: "That image job isn't known." };
  }
  if (b.mode === "fix") {
    if (typeof b.token !== "string" || b.token.length > 120) return { ok: false, error: "That picture isn't known." };
    const fix = typeof b.fix === "string" ? b.fix.replace(/\s+/g, " ").trim() : "";
    if (fix.length < MIN_FIX) return { ok: false, error: "Say what to fix." };
    if (fix.length > MAX_FIX) return { ok: false, error: `Keep it under ${MAX_FIX} characters.` };
    return { ok: true, request: { mode: "fix", token: b.token, fix } };
  }
  const prompt = typeof b.prompt === "string" ? b.prompt.replace(/\s+/g, " ").trim() : "";
  if (prompt.length < MIN_PROMPT) return { ok: false, error: "Write a longer image prompt first." };
  if (prompt.length > MAX_PROMPT) return { ok: false, error: `Keep the image prompt under ${MAX_PROMPT} characters.` };
  if (b.words !== true) return { ok: true, request: { mode: "start", prompt } };
  const r = b.refs && typeof b.refs === "object" ? (b.refs as Record<string, unknown>) : {};
  const refs = Object.fromEntries((["logo"] as const).flatMap((k) => (typeof r[k] === "string" && (r[k] as string).length <= MAX_REF_CHARS && REF.test(r[k] as string) ? [[k, r[k] as string]] : [])));
  return { ok: true, request: { mode: "start", prompt, words: true, ...(Object.keys(refs).length ? { refs } : {}) } };
}

/** The body for Soul v2: the post's prompt plus the people rule, 3:4 (the nearest to a 4:5 slide), 1080p. */
export function buildImageBody(prompt: string): Record<string, unknown> {
  return { prompt: `${prompt}\n\n${PEOPLE_RULE}`, aspect_ratio: "3:4", resolution: "1080p", batch_size: 1 };
}

/** The edit body: the adviser's fix plus the keep-the-rest rule, on the 3:4 picture Make the image made. */
export function buildFixBody(imageUrl: string, fix: string): Record<string, unknown> {
  return { prompt: `${fix}\n\n${KEEP_RULE}`, image_urls: [imageUrl], aspect_ratio: "3:4", resolution: "2k" };
}

/** A finished job's picture link, or null (still working, failed, or a B-roll video, which can't be fixed). */
export function pictureUrl(data: unknown): string | null {
  const d = (data ?? {}) as Record<string, unknown>;
  const url = d.status === "completed" ? (d.images as { url?: unknown }[] | undefined)?.[0]?.url : null;
  return typeof url === "string" && /^https:\/\//.test(url) ? url : null;
}

export type JobState = { state: "working" } | { state: "done"; url: string } | { state: "failed"; error: string };

/** Higgsfield's request status in the studio's words. Only an https image (or, for a B-roll clip, video) link counts as done. */
export function readStatus(data: unknown): JobState {
  const d = (data ?? {}) as Record<string, unknown>;
  const status = String(d.status ?? "");
  if (status === "queued" || status === "in_progress") return { state: "working" };
  if (status === "completed") {
    const url = (d.images as { url?: unknown }[] | undefined)?.[0]?.url ?? (d.video as { url?: unknown } | undefined)?.url;
    return typeof url === "string" && /^https:\/\//.test(url) ? { state: "done", url } : { state: "failed", error: "The image came back empty. Try again." };
  }
  if (status === "nsfw") return { state: "failed", error: "The image was blocked by the safety filter. Change the prompt and try again." };
  return { state: "failed", error: "The image didn't come through. Try again." };
}

// ---------- job tokens ----------
// A Higgsfield request id alone would let anyone signed in read any job made with
// the shared key. Start hands back id.HMAC(uid:id) instead; status recomputes it
// for the caller and refuses a token made for someone else. No table needed.

const enc = new TextEncoder();

export async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(message)));
  return Array.from(sig, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** The signing secret, derived from a server-only key under a fixed label (so no extra secret to manage). */
export const tokenSecret = (serverKey: string) => hmacHex(serverKey, "content-studio ai-image job token v1");

export async function jobToken(secret: string, uid: string, id: string): Promise<string> {
  const lower = id.toLowerCase();
  return `${lower}.${await hmacHex(secret, `${uid}:${lower}`)}`;
}

/** The job id when the token was made for this user, else null. Compared in constant time. */
export async function openJobToken(secret: string, uid: string, token: string): Promise<string | null> {
  const m = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.([0-9a-f]{64})$/.exec(token.toLowerCase());
  if (!m || !UUID.test(m[1])) return null;
  const want = await hmacHex(secret, `${uid}:${m[1]}`);
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ m[2].charCodeAt(i);
  return diff === 0 ? m[1] : null;
}
