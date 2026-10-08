import { describe, expect, it } from "vitest";
import { MAX_SCRIPT, TTS_MODEL, VOICES, parseVoiceRequest, ttsBody, ttsUrl, parseDubRequest, dubUrl, dubBody, lineSpans } from "./logic";

describe("parseVoiceRequest", () => {
  it("tidies the script and takes a known voice", () => {
    expect(parseVoiceRequest({ text: "  Most people  think\n\n\n\ninsurance is expensive. ", voice: "alice" })).toEqual({
      ok: true,
      text: "Most people think\n\ninsurance is expensive.",
      voice: "alice",
    });
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
});

describe("dubbing", () => {
  it("takes the lines in place, a language and a voice", () => {
    expect(parseDubRequest({ lang: "zh", voice: "eric", lines: ["你好 世界", "", 7, "  再见  "] })).toEqual({ ok: true, lang: "zh", voice: "eric", lines: ["你好 世界", "", "", "再见"] });
    expect(parseDubRequest({ lang: "fr", voice: "eric", lines: ["Bonjour tout le monde"] }).ok).toBe(false);
    expect(parseDubRequest({ lang: "ms", voice: "bob", lines: ["Selamat pagi semua"] }).ok).toBe(false);
    expect(parseDubRequest({ lang: "ms", voice: "alice", lines: [] }).ok).toBe(false);
    expect(parseDubRequest({ lang: "ms", voice: "alice", lines: ["x".repeat(300), ...Array(10).fill("y".repeat(300))] }).ok).toBe(false);
  });

  it("asks ElevenLabs for times per character and enforces the language", () => {
    expect(dubUrl("alice")).toContain("/with-timestamps?");
    expect(dubBody(["一", "二"], "zh")).toMatchObject({ text: "一\n二", language_code: "zh", model_id: TTS_MODEL, voice_settings: { stability: 0.5, speed: 1.15 } });
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
