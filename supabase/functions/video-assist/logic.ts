// Pure logic for video-assist (the video editor at /edit): cleaning Whisper's
// word timings, and the "vibe edit" prompt and reply. No Deno or npm imports, so
// vitest covers it (logic.test.ts).

export const MAX_AUDIO_BYTES = 24 * 1024 * 1024; // Whisper takes 25 MB
export const VIBE_MODEL = "gpt-4.1";
export const MAX_INSTRUCTION = 500;
export const MAX_TRANSCRIPT = 3000;
export const MAX_FRAMES = 3;
export const MAX_FRAME_CHARS = 400_000;

export interface Word {
  w: string;
  s: number;
  e: number;
}

const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9']/g, "");

/**
 * Whisper's word list has no punctuation or casing; its full text does. Walk the
 * text's tokens alongside the words and take each token's written form, so
 * captions keep "think." and sentence breaks. A word with no match keeps its own form.
 */
export function cleanWords(raw: unknown, text: string): Word[] {
  const list = Array.isArray(raw) ? raw : [];
  const tokens = String(text ?? "").split(/\s+/).filter(Boolean);
  let ti = 0;
  const out: Word[] = [];
  for (const r of list) {
    const o = r && typeof r === "object" ? (r as Record<string, unknown>) : {};
    const w = String(o.word ?? "").trim();
    const s = Number(o.start);
    const e = Number(o.end);
    if (!w || !Number.isFinite(s) || !Number.isFinite(e) || e < s) continue;
    let form = w;
    for (let k = ti; k < Math.min(tokens.length, ti + 4); k++) {
      if (norm(tokens[k]) === norm(w)) {
        form = tokens[k];
        ti = k + 1;
        break;
      }
    }
    out.push({ w: form.replace(/—/g, ","), s: Math.round(s * 1000) / 1000, e: Math.round(e * 1000) / 1000 });
  }
  return out;
}

/** The settings keys the model may change, with what each means. Mirrors src/lib/videoEdit.ts applyPatch. */
export const VIBE_KEYS: Record<string, string> = {
  style: 'caption style: "bold" (huge 2-3 word Hormozi captions, spoken word highlighted), "cutout" (golden serif 1-3 words), "minimal" (sentence in a dark pill), "editorial" (serif lines, warm film look), "native" (TikTok-style outlined lines), "documentary" (plain subtitles, cinematic bars)',
  position: '"top" | "middle" | "bottom"',
  size: "caption size multiplier 0.6-1.6 (1 = the style's size)",
  wordsPerCaption: "words shown at once in bold/cutout styles, 1-6",
  baseColor: "caption colour, #RRGGBB",
  activeColor: "colour of the word being spoken, #RRGGBB",
  uppercase: "boolean",
  captions: "boolean, captions on or off",
  hook: "title text shown at the top for the first seconds, max 90 chars, plain words, no em dashes",
  hookSeconds: "0-10",
  removeFillers: "boolean, cut um/uh",
  maxPause: "pauses longer than this many seconds are cut down, 0 keeps every pause, 0.3 is tight, 0.6 is natural",
  trimStart: "seconds cut from the start",
  trimEnd: "seconds cut from the end",
  aspect: '"9:16" | "4:5" | "1:1" | "original"',
  focusX: "horizontal crop centre 0 (left) to 1 (right)",
  punchIn: "boolean, zoom in on alternate cuts",
  progressBar: "boolean",
  grade: "boolean, the style's colour grade",
};

export interface VibeRequest {
  instruction: string;
  settings: Record<string, unknown>;
  transcript: string;
  duration: number;
  frames: string[];
}

export function parseVibeRequest(body: unknown): { ok: true; request: VibeRequest } | { ok: false; error: string } {
  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const instruction = String(b.instruction ?? "").trim().slice(0, MAX_INSTRUCTION);
  const frames = (Array.isArray(b.frames) ? b.frames : [])
    .filter((f): f is string => typeof f === "string" && /^data:image\/(jpeg|png);base64,/.test(f) && f.length <= MAX_FRAME_CHARS)
    .slice(0, MAX_FRAMES);
  if (!instruction && !frames.length) return { ok: false, error: "Say what to change, or add a reference video." };
  return { ok: true, request: { instruction, settings: cleanSettings(b.settings), transcript: String(b.transcript ?? "").slice(0, MAX_TRANSCRIPT), duration: Number(b.duration) || 0, frames } };
}

/**
 * Only the known keys, only short plain values, at most 2 KB: the settings go
 * into a paid prompt, and the daily cap counts calls, not tokens.
 */
export function cleanSettings(raw: unknown): Record<string, unknown> {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(VIBE_KEYS)) {
    const v = src[k];
    if (typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v))) out[k] = v;
    else if (typeof v === "string") out[k] = v.slice(0, 100);
  }
  return JSON.stringify(out).length <= 2048 ? out : {};
}

function unused() {
  return {
    ok: true,
    request: {
      instruction,
      settings,
      transcript: String(b.transcript ?? "").slice(0, MAX_TRANSCRIPT),
      duration: Number(b.duration) || 0,
      frames,
    },
  };
}

export function buildVibeMessages(r: VibeRequest): { role: string; content: unknown }[] {
  const system = [
    "You are the editor inside a short-form video editor for Singapore financial advisers. The edit is a settings object; you change it to do what the person asks.",
    "Reply with JSON only: {\"patch\": {...only the keys that change...}, \"reply\": \"one short plain sentence saying what you changed\"}.",
    "Allowed keys:",
    ...Object.entries(VIBE_KEYS).map(([k, v]) => `- ${k}: ${v}`),
    "If something asked for is not possible with these keys (music, B-roll, stickers, transitions), change what you can and say plainly in the reply what you could not do.",
    "When reference frames are attached, match their caption look: style, position, colours, case and size. Say which look you matched.",
    "Never invent facts for a hook; use words from the transcript. No em dashes.",
  ].join("\n");
  const text = [
    `Current settings: ${JSON.stringify(r.settings)}`,
    `Video length: ${r.duration.toFixed(1)}s`,
    r.transcript ? `Transcript: ${r.transcript}` : "",
    r.instruction ? `Request: ${r.instruction}` : "Request: match the caption look of the reference frames.",
  ].filter(Boolean).join("\n\n");
  const content = r.frames.length
    ? [{ type: "text", text }, ...r.frames.map((url) => ({ type: "image_url", image_url: { url, detail: "low" } }))]
    : text;
  return [{ role: "system", content: system }, { role: "user", content }];
}

export function parseVibeReply(content: string | null): { patch: Record<string, unknown>; reply: string } | null {
  if (!content) return null;
  try {
    const o = JSON.parse(content);
    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(o?.patch ?? {})) if (k in VIBE_KEYS) patch[k] = v;
    const reply = String(o?.reply ?? "").replace(/—/g, ",").slice(0, 300);
    return { patch, reply: reply || "Done." };
  } catch {
    return null;
  }
}
