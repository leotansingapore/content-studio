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
