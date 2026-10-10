// Pure logic for text-voice: "Voiceover from text" in the video editor turns a
// script into speech with ElevenLabs, and "Music for me" makes a background track
// in the mood Jev picks. No Deno or npm imports, so vitest covers it.

import { choiceOf, type JevAnswer, type JevQuestion } from "../_shared/jev.ts";
import { GLOBAL_COUNTER_USER, consumeUsage, usageRefusal, type RpcClient } from "../_shared/usageCaps.ts";

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

// ---------- background music: an instrumental track in the video's mood (Eleven Music) ----------

/** The moods on offer. `about` is what Jev reads to pick one; `style` is what Eleven Music is asked for. */
export const MOODS = {
  calm: {
    label: "Calm",
    about: "Gentle and unhurried: explaining, teaching or reassuring",
    style: "Soft lo-fi piano with warm pads and light brushed percussion, 75 BPM, gentle and unhurried, clean modern production",
  },
  warm: {
    label: "Warm",
    about: "Personal and heartfelt: stories about family, clients or life moments",
    style: "Warm fingerpicked acoustic guitar and soft piano with a light shaker, 90 BPM, heartfelt and intimate, modern folk production",
  },
  upbeat: {
    label: "Upbeat",
    about: "Bright and energetic: quick tips, lists, wins and good news",
    style: "Bright modern pop groove with plucked synths, claps and a bouncy bassline, 118 BPM, positive and energetic, polished production",
  },
  inspiring: {
    label: "Inspiring",
    about: "Rising and hopeful: goals, milestones, motivation and big life plans",
    style: "Uplifting cinematic piano with swelling strings and a steady pulsing drum, 100 BPM, hopeful and rising, modern film-score production",
  },
  serious: {
    label: "Serious",
    about: "Steady and weighty: risks, illness, death, claims, scams or warnings",
    style: "Minimal low piano and soft cello over a muted steady pulse, 80 BPM, thoughtful and serious, restrained modern score",
  },
  playful: {
    label: "Playful",
    about: "Light and fun: jokes, skits, trends and everyday humour",
    style: "Playful pizzicato strings, ukulele and marimba with finger snaps, 110 BPM, cheeky and fun, clean modern production",
  },
} as const;

export type Mood = keyof typeof MOODS;
export const MOOD_IDS = Object.keys(MOODS) as Mood[];
/** Used when Jev has no answer: no key, a timeout, no captions, or no uses left. */
export const DEFAULT_MOOD: Mood = "calm";

export const MUSIC_MODEL = "music_v2_5";
/** Eleven Music makes 3 s to 5 min. Tracks stop at 2 min, a long reel, since the credits are shared with
 * voiceovers and dubs; a longer video loops the track. */
export const MIN_MUSIC_SECONDS = 3;
export const MAX_MUSIC_SECONDS = 120;
/** Below this there is too little said to read a mood from. */
export const MIN_MOOD_TEXT = 40;
export const MAX_MOOD_TEXT = 4000;

/** Streamed, so the reply starts before a long track is finished. */
export const MUSIC_URL = "https://api.elevenlabs.io/v1/music/stream?output_format=mp3_44100_128";

export function parseMusicRequest(raw: unknown): { ok: true; mood: Mood; ms: number } | { ok: false; error: string } {
  const b = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const mood = MOOD_IDS.find((m) => m === b.mood);
  if (!mood) return { ok: false, error: "Pick a mood." };
  const secs = typeof b.seconds === "number" && Number.isFinite(b.seconds) ? b.seconds : 0;
  if (secs < 1) return { ok: false, error: "Open a video first." };
  const ms = Math.round(Math.min(MAX_MUSIC_SECONDS, Math.max(MIN_MUSIC_SECONDS, secs)) * 1000);
  return { ok: true, mood, ms };
}

/**
 * A track counts on the adviser's own daily cap, then on the whole studio's: the ElevenLabs credits are
 * shared with voiceovers and dubs, so many accounts together must not drain them. The refusal to send,
 * or null to go ahead.
 */
export async function musicRefusal(admin: RpcClient, uid: string): Promise<{ status: number; body: { error: string; code: string } } | null> {
  // "reason" in: narrows in the app's non-strict tsconfig too
  const mine = await consumeUsage(admin, uid, "ai-music");
  if ("reason" in mine) return usageRefusal(mine);
  const everyone = await consumeUsage(admin, GLOBAL_COUNTER_USER, "ai-music-global");
  if (!("reason" in everyone)) return null;
  return everyone.reason === "limit"
    ? { status: 429, body: { code: "daily_limit", error: "Today's music for the whole studio is used up. Try again after 8am Singapore time." } }
    : usageRefusal(everyone);
}

/** What to tell the adviser when Eleven Music says no. The free ElevenLabs plan has no music API at all. */
export function musicFailure(status: number, detail: string): string {
  if (detail.includes("paid_plan_required")) return "Music for me isn't switched on yet. Tell your studio admin.";
  if ([401, 402, 403].includes(status)) return "Music credits have run out. Tell your studio admin.";
  return "Couldn't make the music right now. Try again in a minute.";
}

export function musicBody(mood: Mood, ms: number): Record<string, unknown> {
  return {
    prompt: `${MOODS[mood].style}. Instrumental only, no vocals. Background music under someone talking: even level from start to end, no sudden drops, no big builds.`,
    music_length_ms: ms,
    model_id: MUSIC_MODEL,
    force_instrumental: true,
  };
}

/** What is said in the video, tidied and cut to a length Jev reads quickly; "" when too little is said. */
export function moodText(raw: unknown): string {
  const b = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const text = typeof b.text === "string" ? b.text.replace(/\s+/g, " ").trim().slice(0, MAX_MOOD_TEXT) : "";
  return text.length < MIN_MOOD_TEXT ? "" : text;
}

export function moodState(text: string) {
  return { video: "A short social video by a Singapore financial adviser.", transcript: text };
}

export function moodQuestions(): Record<string, JevQuestion> {
  return {
    mood: {
      type: "choice",
      instructions: { question: "Which mood of background music best fits what is said in `transcript`?" },
      criteria: Object.fromEntries(MOOD_IDS.map((m) => [m, MOODS[m].about])),
    },
  };
}

/** Jev's pick, or calm when there is none. */
export const readMood = (answers: Record<string, JevAnswer> | null): Mood => choiceOf(answers, "mood", MOOD_IDS) ?? DEFAULT_MOOD;
