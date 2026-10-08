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

export type ImageRequest = { mode: "start"; prompt: string } | { mode: "status"; token: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseImageRequest(raw: unknown): { ok: true; request: ImageRequest } | { ok: false; error: string } {
  const b = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  if (b.mode === "status") {
    // the owner check (openJobToken) needs the caller's uid, so it happens in index.ts
    return typeof b.token === "string" && b.token.length <= 120 ? { ok: true, request: { mode: "status", token: b.token } } : { ok: false, error: "That image job isn't known." };
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

async function hmacHex(secret: string, message: string): Promise<string> {
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
