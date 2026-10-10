import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { DAILY_LIMITS, GLOBAL_COUNTER_USER, type RpcClient } from "../_shared/usageCaps";
import {
  MAX_SCRIPT, TTS_MODEL, VOICES, VOICE_IDS, parseVoiceRequest, ttsBody, ttsUrl, parseDubRequest, dubUrl, dubBody, lineSpans,
  DEFAULT_EMOTION, EMOTIONS, EMOTION_IDS, PACE_IDS, voiceSettings,
  DEFAULT_MOOD, MAX_MOOD_TEXT, MAX_MUSIC_SECONDS, MIN_MUSIC_SECONDS, MOODS, MOOD_IDS, MUSIC_MODEL, MUSIC_URL,
  moodQuestions, moodState, moodText, musicBody, musicFailure, musicRefusal, parseMusicRequest, readMood,
} from "./logic";

describe("parseVoiceRequest", () => {
  it("tidies the script and takes a known voice", () => {
    expect(parseVoiceRequest({ text: "  Most people  think\n\n\n\ninsurance is expensive. ", voice: "alice" })).toEqual({
      ok: true,
      text: "Most people think\n\ninsurance is expensive.",
      voice: "alice",
      emotion: "warm",
      pace: "normal",
    });
  });

  it("takes how it sounds and the pace, and falls back to warm and normal", () => {
    expect(parseVoiceRequest({ text: "Hello there", voice: "george", emotion: "serious", pace: "slower" })).toMatchObject({ ok: true, voice: "george", emotion: "serious", pace: "slower" });
    expect(parseVoiceRequest({ text: "Hello there", voice: "lily", emotion: "angry", pace: "toString" })).toMatchObject({ ok: true, emotion: DEFAULT_EMOTION, pace: "normal" });
  });

  it("refuses an empty or overlong script and an unknown voice", () => {
    expect(parseVoiceRequest({ text: "hi", voice: "alice" })).toMatchObject({ ok: false });
    expect(parseVoiceRequest({ text: "x".repeat(MAX_SCRIPT + 1), voice: "alice" })).toMatchObject({ ok: false, error: "Keep the script under 2,500 characters." });
    expect(parseVoiceRequest({ text: "Hello there", voice: "morgan" })).toMatchObject({ ok: false, error: "Pick a voice." });
    expect(parseVoiceRequest({ text: "Hello there", voice: "toString" })).toMatchObject({ ok: false });
    expect(parseVoiceRequest(null)).toMatchObject({ ok: false });
  });
});

describe("the ElevenLabs call", () => {
  it("asks for an MP3 in the chosen voice with the cheaper turbo model", () => {
    expect(ttsUrl("eric")).toBe(`https://api.elevenlabs.io/v1/text-to-speech/${VOICES.eric.id}?output_format=mp3_44100_128`);
    expect(ttsBody("Hello")).toMatchObject({ text: "Hello", model_id: TTS_MODEL });
    expect(TTS_MODEL).toBe("eleven_turbo_v2_5");
  });

  it("sounds as before when no feeling or pace is sent (the AI presenter sends none)", () => {
    // ElevenLabs' default voice settings, read from the account on 2026-10-10
    expect(ttsBody("Hello").voice_settings).toEqual({ stability: 0.5, similarity_boost: 0.75, style: 0, speed: 1 });
  });

  it("makes energetic livelier and serious steadier than warm, and moves the pace", () => {
    const s = (emotion: (typeof EMOTION_IDS)[number]) => EMOTIONS[emotion].settings.stability;
    expect(s("energetic")).toBeLessThan(s("warm"));
    expect(s("warm")).toBeLessThan(s("calm"));
    expect(s("calm")).toBeLessThan(s("serious"));
    expect(EMOTIONS.energetic.settings.style).toBeGreaterThan(0);
    expect(ttsBody("Hi", { emotion: "energetic", pace: "faster" }).voice_settings).toMatchObject({ stability: s("energetic"), speed: 1.1 });
    expect(ttsBody("Hi", { emotion: "serious", pace: "slower" }).voice_settings).toMatchObject({ stability: s("serious"), speed: 0.9 });
  });

  it("keeps every setting inside the ranges ElevenLabs takes", () => {
    for (const emotion of EMOTION_IDS) {
      for (const pace of PACE_IDS) {
        for (const base of [1, 1.15]) {
          const v = voiceSettings({ emotion, pace }, base);
          for (const k of ["stability", "similarity_boost", "style"] as const) {
            expect(v[k]).toBeGreaterThanOrEqual(0);
            expect(v[k]).toBeLessThanOrEqual(1);
          }
          expect(v.speed).toBeGreaterThanOrEqual(0.7);
          expect(v.speed).toBeLessThanOrEqual(1.2);
        }
      }
    }
  });

  it("sends the feeling and pace the adviser picked to ElevenLabs", () => {
    const source = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
    expect(source).toContain("ttsBody(parsed.text, parsed)");
    expect(source).toContain("dubBody(dub.lines, dub.lang, dub)");
  });

  it("offers each voice once", () => {
    expect(VOICE_IDS.length).toBeGreaterThanOrEqual(7);
    expect(new Set(VOICE_IDS.map((v) => VOICES[v].id)).size).toBe(VOICE_IDS.length);
  });
});

describe("dubbing", () => {
  it("takes the lines in place, a language and a voice", () => {
    expect(parseDubRequest({ lang: "zh", voice: "eric", lines: ["你好 世界", "", 7, "  再见  "] })).toEqual({ ok: true, lang: "zh", voice: "eric", lines: ["你好 世界", "", "", "再见"], emotion: "warm", pace: "normal" });
    expect(parseDubRequest({ lang: "ms", voice: "sarah", lines: ["Selamat pagi semua"], emotion: "calm", pace: "slower" })).toMatchObject({ ok: true, emotion: "calm", pace: "slower" });
    expect(parseDubRequest({ lang: "fr", voice: "eric", lines: ["Bonjour tout le monde"] }).ok).toBe(false);
    expect(parseDubRequest({ lang: "ms", voice: "bob", lines: ["Selamat pagi semua"] }).ok).toBe(false);
    expect(parseDubRequest({ lang: "ms", voice: "alice", lines: [] }).ok).toBe(false);
    expect(parseDubRequest({ lang: "ms", voice: "alice", lines: ["x".repeat(300), ...Array(10).fill("y".repeat(300))] }).ok).toBe(false);
  });

  it("asks ElevenLabs for times per character and enforces the language", () => {
    expect(dubUrl("alice")).toContain("/with-timestamps?");
    expect(dubBody(["一", "二"], "zh")).toMatchObject({ text: "一\n二", language_code: "zh", model_id: TTS_MODEL, voice_settings: { stability: 0.5, speed: 1.15 } });
  });

  it("moves the dub's pace from its faster start, no further than ElevenLabs allows", () => {
    expect(dubBody(["一"], "zh", { emotion: "calm", pace: "slower" }).voice_settings).toMatchObject({ stability: EMOTIONS.calm.settings.stability, speed: 1.05 });
    expect(dubBody(["一"], "zh", { emotion: "warm", pace: "faster" }).voice_settings).toMatchObject({ speed: 1.2 });
  });

  it("finds each line in the audio from the character times", () => {
    const lines = ["ab", "", "cd"];
    // text "ab\n\ncd": 6 characters
    const al = { character_start_times_seconds: [0, 0.2, 0.4, 0.45, 0.5, 0.9], character_end_times_seconds: [0.2, 0.4, 0.45, 0.5, 0.9, 1.3] };
    expect(lineSpans(lines, al, 1.3)).toEqual([{ s: 0, e: 0.4 }, null, { s: 0.5, e: 1.3 }]);
  });

  it("shares the audio by length when the times don't match the text", () => {
    expect(lineSpans(["ab", "cd"], { character_start_times_seconds: [0] }, 5)).toEqual([{ s: 0, e: 2 }, { s: 3, e: 5 }]);
  });
});

describe("background music", () => {
  it("takes a known mood and the video's length, kept to what Eleven Music makes", () => {
    expect(parseMusicRequest({ mood: "upbeat", seconds: 42.4 })).toEqual({ ok: true, mood: "upbeat", ms: 42400 });
    expect(parseMusicRequest({ mood: "calm", seconds: 1.5 })).toEqual({ ok: true, mood: "calm", ms: MIN_MUSIC_SECONDS * 1000 });
    expect(parseMusicRequest({ mood: "calm", seconds: 7200 })).toEqual({ ok: true, mood: "calm", ms: MAX_MUSIC_SECONDS * 1000 });
    expect(MAX_MUSIC_SECONDS).toBe(120);
  });

  it("refuses an unknown mood or no length", () => {
    expect(parseMusicRequest({ mood: "angry", seconds: 30 })).toEqual({ ok: false, error: "Pick a mood." });
    expect(parseMusicRequest({ mood: "toString", seconds: 30 }).ok).toBe(false);
    expect(parseMusicRequest({ mood: "calm", seconds: Infinity }).ok).toBe(false);
    expect(parseMusicRequest({ mood: "calm", seconds: "30" }).ok).toBe(false);
    expect(parseMusicRequest(null).ok).toBe(false);
  });

  it("asks for an instrumental track of that length in the mood's style", () => {
    const body = musicBody("serious", 30000);
    expect(body).toMatchObject({ music_length_ms: 30000, model_id: MUSIC_MODEL, force_instrumental: true });
    expect(body.prompt).toContain(MOODS.serious.style);
    expect(body.prompt).toContain("Instrumental only, no vocals.");
    expect(MUSIC_URL).toBe("https://api.elevenlabs.io/v1/music/stream?output_format=mp3_44100_128");
  });
});

describe("the mood Jev picks", () => {
  it("offers every mood as a choice over the transcript", () => {
    const q = moodQuestions().mood;
    expect(q.type).toBe("choice");
    expect(Object.keys((q as { criteria: Record<string, unknown> }).criteria)).toEqual(MOOD_IDS);
    expect(moodState("hello")).toMatchObject({ transcript: "hello" });
  });

  it("takes Jev's pick and falls back to calm without one", () => {
    expect(readMood({ mood: { type: "choice", choice: "playful" } })).toBe("playful");
    expect(readMood({ mood: { type: "choice", choice: "angry" } })).toBe(DEFAULT_MOOD);
    expect(readMood(null)).toBe("calm");
  });

  it("reads a mood only when enough is said", () => {
    expect(moodText({ text: "Too short." })).toBe("");
    expect(moodText({ text: 7 })).toBe("");
    const long = "Most people think insurance is expensive.  ".repeat(200);
    expect(moodText({ text: long }).length).toBe(MAX_MOOD_TEXT);
    expect(moodText({ text: "Most people  think\ninsurance is expensive, but here is why." })).toBe("Most people think insurance is expensive, but here is why.");
  });
});

describe("when Eleven Music says no", () => {
  it("says music isn't switched on when the account's plan has no music API", () => {
    // the reply the live account gave on 2026-10-10
    const free = '{"detail":{"type":"payment_required","code":"paid_plan_required","message":"Music API is not available for free users."}}';
    expect(musicFailure(402, free)).toBe("Music for me isn't switched on yet. Tell your studio admin.");
    expect(musicFailure(402, '{"detail":{"code":"quota_exceeded"}}')).toBe("Music credits have run out. Tell your studio admin.");
    expect(musicFailure(500, "")).toBe("Couldn't make the music right now. Try again in a minute.");
  });
});

describe("the music caps", () => {
  // cs_consume_ai_usage: counts the use, or null once the day's limit is reached
  const counter = (): RpcClient & { calls: string[] } => {
    const used = new Map<string, number>();
    const calls: string[] = [];
    return {
      calls,
      rpc(_fn, a) {
        const k = `${a.p_user}/${a.p_feature}`;
        calls.push(k);
        const n = (used.get(k) ?? 0) + 1;
        if (n > (a.p_limit as number)) return Promise.resolve({ data: null, error: null });
        used.set(k, n);
        return Promise.resolve({ data: n, error: null });
      },
    };
  };

  it("counts a track on the adviser's cap, then on the whole studio's", async () => {
    const db = counter();
    expect(await musicRefusal(db, "u1")).toBeNull();
    expect(db.calls).toEqual(["u1/ai-music", `${GLOBAL_COUNTER_USER}/ai-music-global`]);
  });

  it("refuses once the adviser's own tracks are used up, without spending the studio's", async () => {
    const db = counter();
    for (let i = 0; i < DAILY_LIMITS["ai-music"]; i++) expect(await musicRefusal(db, "u1")).toBeNull();
    expect(await musicRefusal(db, "u1")).toMatchObject({ status: 429, body: { code: "daily_limit" } });
    expect(db.calls.filter((c) => c.endsWith("ai-music-global"))).toHaveLength(DAILY_LIMITS["ai-music"]);
  });

  it("refuses everyone once the studio's tracks are used up, even with their own left", async () => {
    const db = counter();
    const global = DAILY_LIMITS["ai-music-global"];
    for (let i = 0; i < global; i++) expect(await musicRefusal(db, `u${Math.floor(i / DAILY_LIMITS["ai-music"])}`)).toBeNull();
    expect(await musicRefusal(db, "someone-new")).toEqual({
      status: 429,
      body: { code: "daily_limit", error: "Today's music for the whole studio is used up. Try again after 8am Singapore time." },
    });
    expect(global).toBeLessThanOrEqual(20);
  });

  it("refuses when the counter can't be read", async () => {
    const down: RpcClient = { rpc: () => Promise.resolve({ data: null, error: { message: "down" } }) };
    expect(await musicRefusal(down, "u1")).toMatchObject({ status: 503 });
  });

  it("checks both caps before it calls Eleven Music", () => {
    const source = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
    const caps = source.indexOf("await musicRefusal(admin, uid)");
    expect(caps).toBeGreaterThan(0);
    expect(source.indexOf("fetch(MUSIC_URL")).toBeGreaterThan(caps);
  });
});
