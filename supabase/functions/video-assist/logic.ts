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
  aspect: '"9:16" | "4:5" | "1:1" | "16:9" | "original"',
  fit: '"fill" (crop to the frame) | "blur" (whole video over a blurred copy, for landscape footage)',
  focusX: "horizontal crop centre 0 (left) to 1 (right)",
  punchIn: "boolean, zoom in on alternate cuts",
  progressBar: "boolean",
  grade: "boolean, the style's colour grade",
  nameTag: "lower-third name shown after the hook, max 40 chars, empty = off (only the person's real name if they gave it)",
  roleTag: "the role line under the name tag, max 50 chars",
  highlightNumbers: "boolean, numbers and $ or % words shown in the highlight colour",
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

// ---------- clips: one long video -> a few standalone reels ----------

export const MAX_SENTENCES = 600;
export interface ClipSentence {
  s: number;
  e: number;
  text: string;
}
export interface FoundClip {
  start: number;
  end: number;
  title: string;
  hook: string;
}

export function parseClipsRequest(body: unknown): { ok: true; sentences: ClipSentence[]; duration: number } | { ok: false; error: string } {
  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const duration = Number(b.duration);
  const sentences = (Array.isArray(b.sentences) ? b.sentences : [])
    .slice(0, MAX_SENTENCES)
    .map((x) => (x && typeof x === "object" ? (x as Record<string, unknown>) : {}))
    .map((x) => ({ s: Number(x.s), e: Number(x.e), text: String(x.text ?? "").slice(0, 400) }))
    .filter((x) => Number.isFinite(x.s) && Number.isFinite(x.e) && x.e > x.s && x.text);
  if (!Number.isFinite(duration) || duration < 45) return { ok: false, error: "Clips need a video of at least 45 seconds." };
  if (sentences.length < 5) return { ok: false, error: "Caption the video first, then find clips." };
  return { ok: true, sentences, duration };
}

export function buildClipsMessages(sentences: ClipSentence[], duration: number): { role: string; content: string }[] {
  const lines = sentences.map((x) => `[${x.s.toFixed(1)}-${x.e.toFixed(1)}] ${x.text}`).join("\n");
  return [
    {
      role: "system",
      content: [
        "You cut short-form reels out of a long talking video by a Singapore financial adviser (podcast, talk or explainer).",
        "Pick 3 to 5 clips that each stand alone: a viewer with no context understands it, it opens on a strong line (a claim, a question, a number, a story beat) and ends on a complete thought.",
        "Each clip is 25 to 75 seconds (aim for 30 to 60): join consecutive sentences until the thought is complete. It starts at the start time of a sentence and ends at the end time of a sentence. Clips never overlap. Best clip first.",
        "For each: a 3-6 word working title in sentence case (only the first word capitalised) and a hook card of 8 words or fewer made only of the speaker's own words or their plain meaning. No em dashes. Never promise returns.",
        'Reply with JSON only: {"clips":[{"start":number,"end":number,"title":string,"hook":string}]}',
      ].join("\n"),
    },
    { role: "user", content: `Video length: ${duration.toFixed(1)}s\nTranscript with sentence times in seconds:\n${lines}` },
  ];
}

/** Keeps only clips that fit the video, run 18-120 s and do not overlap, best first as given, at most 5. */
export function parseClipsReply(content: string | null, duration: number): FoundClip[] | null {
  if (!content) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    return null;
  }
  const list = Array.isArray((raw as { clips?: unknown })?.clips) ? (raw as { clips: unknown[] }).clips : [];
  const out: FoundClip[] = [];
  for (const c of list) {
    const o = c && typeof c === "object" ? (c as Record<string, unknown>) : {};
    const start = Math.max(0, Number(o.start));
    const end = Math.min(duration, Number(o.end));
    if (!Number.isFinite(start) || !Number.isFinite(end) || end - start < 18 || end - start > 120) continue;
    if (out.some((x) => start < x.end && end > x.start)) continue;
    const clean = (v: unknown, n: number) => String(v ?? "").replace(/—/g, ",").trim().slice(0, n);
    out.push({ start, end, title: clean(o.title, 60) || "Clip", hook: clean(o.hook, 90) });
    if (out.length === 5) break;
  }
  return out;
}
