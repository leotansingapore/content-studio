import { describe, expect, it } from "vitest";
import { appendDictation, speechRecognition } from "./dictation";

describe("appendDictation", () => {
  it("joins chunks with one space, as Idea Dump did", () => {
    expect(appendDictation("", "  hello there ", 4000)).toBe("hello there");
    expect(appendDictation("first", "second", 4000)).toBe("first second");
    expect(appendDictation("first ", "second", 4000)).toBe("first second");
    expect(appendDictation("first\n", "second", 4000)).toBe("first\nsecond");
    expect(appendDictation("first", "   ", 4000)).toBe("first");
  });
  it("stops at the cap it is given", () => {
    expect(appendDictation("abcd", "efgh", 6)).toBe("abcd e");
    expect(appendDictation("x".repeat(1998), "yes", 2000)).toHaveLength(2000);
    expect(appendDictation("x".repeat(3998), "yes", 4000)).toHaveLength(4000);
  });
});

describe("speechRecognition", () => {
  class Plain {}
  class Prefixed {}
  it("is null for a window with neither constructor, and with no window", () => {
    expect(speechRecognition({})).toBeNull();
    expect(speechRecognition(undefined)).toBeNull();
  });
  it("takes the prefixed one when only webkitSpeechRecognition exists, and the plain one first", () => {
    expect(speechRecognition({ webkitSpeechRecognition: Prefixed })).toBe(Prefixed);
    expect(speechRecognition({ SpeechRecognition: Plain, webkitSpeechRecognition: Prefixed })).toBe(Plain);
  });
});
