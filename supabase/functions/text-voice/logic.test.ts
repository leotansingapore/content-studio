import { describe, expect, it } from "vitest";
import { MAX_SCRIPT, TTS_MODEL, VOICES, parseVoiceRequest, ttsBody, ttsUrl } from "./logic";

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
