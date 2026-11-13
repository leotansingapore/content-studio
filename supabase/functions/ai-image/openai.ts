import { KEEP_RULE, PEOPLE_RULE, WORDS_PEOPLE_RULE, type Refs } from "./logic.ts";

export const GPT_IMAGE_MODEL = "gpt-image-2.6-flare";
export const OPENAI_IMAGES = "https://api.openai.com/v1/images";
export const IMAGE_BUCKET = "cs-ai-images";
export const KEEP_DAYS = 7;

const OUTPUT = { size: "1152x1536", quality: "medium", output_format: "jpeg", output_compression: 90, n: 1 };

export const picturePath = (uid: string, id: string) => `${uid}/${id.toLowerCase()}.jpg`;

/** words: a picture that prints the prompt's quoted lines gets the people rule without its "No text" clause. */
export const gptImageBody = (prompt: string, uid: string, words = false): Record<string, unknown> => ({
  model: GPT_IMAGE_MODEL,
  prompt: `${prompt}\n\n${words ? WORDS_PEOPLE_RULE : PEOPLE_RULE}`,
  ...OUTPUT,
  safety_identifier: uid,
});

/** What each reference picture is, after "The picture given": GPT Image keeps them in the order sent. */
export const REF_LINES: Record<keyof Refs, string> = {
  logo: "is the brand's logo. Put that exact logo on the ad once, unaltered: the same shape, colours and lettering, never redrawn or restyled. Place it where this kind of ad carries its brand mark: a poster's footer bar, a page's header or masthead, or a corner.",
  product: "is the product the ad is about. Show that exact product in the scene as it really looks, never a look-alike or a stand-in.",
};

/** A photo ad with reference pictures: an edit that makes a whole new picture from the prompt, with each picture said once. */
export const gptRefBody = (prompt: string, uid: string, refs: Refs): Record<string, unknown> => {
  const given = (Object.keys(REF_LINES) as (keyof Refs)[]).filter((k) => refs[k]);
  const lines = given.map((k, i) => `The ${given.length > 1 ? `${["first", "second"][i]} ` : ""}picture given ${REF_LINES[k]}`);
  return {
    model: GPT_IMAGE_MODEL,
    prompt: [prompt, ...lines, WORDS_PEOPLE_RULE].join("\n\n"),
    images: given.map((k) => ({ image_url: refs[k] })),
    ...OUTPUT,
    safety_identifier: uid,
  };
};

export const gptFixBody = (imageUrl: string, fix: string, uid: string): Record<string, unknown> => ({
  model: GPT_IMAGE_MODEL,
  prompt: `${fix}\n\n${KEEP_RULE}`,
  images: [{ image_url: imageUrl }],
  ...OUTPUT,
  safety_identifier: uid,
});

export type GptImage = { ok: true; jpeg: Uint8Array } | { ok: false; blocked: boolean };

export const readGptImage = (status: number, data: unknown): GptImage => {
  const d = (data ?? {}) as { data?: { b64_json?: unknown }[]; error?: { code?: unknown } };
  const b64 = d.data?.[0]?.b64_json;
  if (status === 200 && typeof b64 === "string" && b64) return { ok: true, jpeg: Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)) };
  return { ok: false, blocked: d.error?.code === "moderation_blocked" };
};

export const stalePictures = (uid: string, files: { name: string; created_at?: string | null }[], now: number): string[] =>
  files.filter((f) => f.created_at && now - Date.parse(f.created_at) > KEEP_DAYS * 86_400_000).map((f) => `${uid}/${f.name}`);
