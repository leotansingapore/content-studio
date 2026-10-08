// Pure logic for text-voice: "Voiceover from text" in the video editor turns a
// script into speech with ElevenLabs. No Deno or npm imports, so vitest covers it.

export const TTS_MODEL = "eleven_turbo_v2_5"; // half the credits of multilingual v2, close in quality
export const MAX_SCRIPT = 2500; // about three minutes of speech
export const MIN_SCRIPT = 5;

/** The voices on offer: ElevenLabs premade voices, ids checked against the account on 2026-10-08. */
export const VOICES = {
  alice: { id: "Xb7hH8MSUJpSbSDYk0k2", label: "Alice", note: "clear, female" },
  eric: { id: "cjVigY5qzO86Huf0OWal", label: "Eric", note: "warm, male" },
  matilda: { id: "XrExE9yKIg1WjnnlVkGX", label: "Matilda", note: "upbeat, female" },
} as const;

export type VoiceId = keyof typeof VOICES;
export const VOICE_IDS = Object.keys(VOICES) as VoiceId[];

export function parseVoiceRequest(raw: unknown): { ok: true; text: string; voice: VoiceId } | { ok: false; error: string } {
  const b = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const text = typeof b.text === "string" ? b.text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim() : "";
  if (text.length < MIN_SCRIPT) return { ok: false, error: "Write the script first." };
  if (text.length > MAX_SCRIPT) return { ok: false, error: `Keep the script under ${MAX_SCRIPT.toLocaleString("en-US")} characters.` };
  const voice = VOICE_IDS.find((v) => v === b.voice);
  if (!voice) return { ok: false, error: "Pick a voice." };
  return { ok: true, text, voice };
}

export function ttsUrl(voice: VoiceId): string {
  return `https://api.elevenlabs.io/v1/text-to-speech/${VOICES[voice].id}?output_format=mp3_44100_128`;
}

export function ttsBody(text: string): Record<string, unknown> {
  return { text, model_id: TTS_MODEL, voice_settings: { stability: 0.5, similarity_boost: 0.75 } };
}

// ---------- dubbing: the video's lines, translated, spoken in one call ----------

export const DUB_LANGS = { zh: "Chinese", ms: "Malay", ta: "Tamil" } as const;
export type DubLang = keyof typeof DUB_LANGS;
export const MAX_DUB_LINES = 300;

export function parseDubRequest(raw: unknown): { ok: true; lines: string[]; voice: VoiceId; lang: DubLang } | { ok: false; error: string } {
  const b = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const lang = (Object.keys(DUB_LANGS) as DubLang[]).find((l) => l === b.lang);
  if (!lang) return { ok: false, error: "Pick Chinese, Malay or Tamil." };
  const voice = VOICE_IDS.find((v) => v === b.voice);
  if (!voice) return { ok: false, error: "Pick a voice." };
  if (!Array.isArray(b.lines) || !b.lines.length) return { ok: false, error: "Caption the video first." };
  if (b.lines.length > MAX_DUB_LINES) return { ok: false, error: "This video is too long to dub in one go." };
  // every line keeps its place, so the times line up with the video's lines; an empty one stays empty
  const lines = b.lines.map((l) => (typeof l === "string" ? l.replace(/\s+/g, " ").trim().slice(0, 300) : ""));
  const total = lines.join("\n").length;
  if (total < MIN_SCRIPT) return { ok: false, error: "Caption the video first." };
  if (total > MAX_SCRIPT) return { ok: false, error: `This video has too much speech to dub in one go (over ${MAX_SCRIPT.toLocaleString("en-US")} characters). Trim it first.` };
  return { ok: true, lines, voice, lang };
}

export function dubUrl(voice: VoiceId): string {
  return `https://api.elevenlabs.io/v1/text-to-speech/${VOICES[voice].id}/with-timestamps?output_format=mp3_44100_128`;
}

/** Translations run longer than the English they replace, so the dub voice talks a little faster (ElevenLabs allows up to 1.2). */
export const DUB_SPEED = 1.15;

export function dubBody(lines: string[], lang: DubLang): Record<string, unknown> {
  const base = ttsBody(lines.join("\n"));
  return { ...base, language_code: lang, voice_settings: { ...(base.voice_settings as object), speed: DUB_SPEED } };
}

interface Alignment {
  characters?: unknown;
  character_start_times_seconds?: unknown;
  character_end_times_seconds?: unknown;
}

/**
 * Where each line is spoken in the returned audio, from ElevenLabs' per-character
 * times (the lines were joined with "\n"). When the alignment doesn't match the
 * text, lines share the audio by their length instead. An empty line gets null.
 */
export function lineSpans(lines: string[], alignment: Alignment | null | undefined, duration: number): ({ s: number; e: number } | null)[] {
  const text = lines.join("\n");
  const starts = Array.isArray(alignment?.character_start_times_seconds) ? (alignment!.character_start_times_seconds as number[]) : [];
  const ends = Array.isArray(alignment?.character_end_times_seconds) ? (alignment!.character_end_times_seconds as number[]) : [];
  const exact = starts.length === text.length && ends.length === text.length;
  const out: ({ s: number; e: number } | null)[] = [];
  let off = 0;
  for (const l of lines) {
    if (!l) out.push(null);
    else if (exact) out.push({ s: Number(starts[off]) || 0, e: Number(ends[off + l.length - 1]) || 0 });
    else out.push({ s: (off / text.length) * duration, e: ((off + l.length) / text.length) * duration });
    off += l.length + 1;
  }
  return out;
}
