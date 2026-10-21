import { describe, expect, it } from "vitest";
import type { JevAnswer } from "../_shared/jev.ts";
import { EMOJI } from "./motion";
import { EMOJI_AT, KEY_WORD_AT, MAX_KEYWORD_LINES, keyCandidates, keywordQuestions, parseKeywordsRequest, readKeywords, type KeywordLine } from "./keywords";

const line = (text: string, s = 0): KeywordLine => ({ text, words: keyCandidates(text.split(" ")), s });
const choice = (choice: string, p: number): JevAnswer => ({ type: "choice", choice, probabilities: { [choice]: p } });

describe("caption key words: candidates", () => {
  it("leave out stop words and short words, keep numbers with their signs, once each", () => {
    expect(keyCandidates("So you pay $500 for the cover, and that cover lapses at 65. Pay 3% more?".split(" "))).toEqual(["pay", "$500", "cover", "lapses", "65", "3%"]);
  });
  it("keep at most 12 and drop anything over 30 characters", () => {
    const many = Array.from({ length: 20 }, (_, i) => `word${String.fromCharCode(97 + i)}x`);
    expect(keyCandidates(many)).toHaveLength(12);
    expect(keyCandidates(["a".repeat(31), "premium"])).toEqual(["premium"]);
  });
});

describe("caption key words: the request", () => {
  it("takes at most 80 lines and cleans each line's words", () => {
    expect(parseKeywordsRequest({ lines: Array.from({ length: MAX_KEYWORD_LINES + 1 }, () => ({ text: "Check your cover", words: ["check"] })) })).toEqual({ ok: false, error: "Send at most 80 lines." });
    expect(parseKeywordsRequest({ lines: [] })).toEqual({ ok: false, error: "Caption the video first." });
    const r = parseKeywordsRequest({ lines: [{ text: "  Check your   cover ", words: ["Check", "your", "cover.", null], s: "x" }], emoji: "one" });
    expect(r).toEqual({ ok: true, lines: [{ text: "Check your cover", words: ["Check", "cover"], s: 0 }], emoji: "one" });
    expect(parseKeywordsRequest({ lines: [{ text: "Check", words: [] }], emoji: "yes" })).toMatchObject({ emoji: "off" });
    expect(parseKeywordsRequest({ lines: [{ text: "Check", words: [] }], emoji: true })).toMatchObject({ emoji: "on" });
  });
});

describe("caption key words: the questions", () => {
  const lines = [line("Most people never read their policy."), line("Ok."), line("Kebanyakan orang tidak membaca polisi.")];

  it("ask which word, in the spec's words, with a none option, only of lines worth asking", () => {
    const q = keywordQuestions(lines, "off", (l) => !l.text.startsWith("Kebanyakan"));
    expect(Object.keys(q)).toEqual(["w0"]);
    expect(q.w0).toEqual({
      type: "choice",
      instructions: "A Singapore financial adviser says this line in a short video: `Most people never read their policy.`. Which one word carries the meaning a viewer must catch, so it is worth showing bigger in the captions?",
      criteria: { c0: 'the word "people"', c1: 'the word "never"', c2: 'the word "read"', c3: 'the word "policy"', none: "No single word stands out; leave the line plain." },
    });
  });
  it("ask which emoji from the pop-ups' own set when emoji are on", () => {
    const q = keywordQuestions(lines, "on", () => true);
    expect(Object.keys(q)).toEqual(["w0", "e0", "w2", "e2"]);
    expect(q.e0.instructions).toBe("Which small picture fits this line from a financial adviser's video, if any: `Most people never read their policy.`?");
    expect(q.e0.criteria).toEqual({ ...Object.fromEntries(Object.entries(EMOJI).map(([k, v]) => [k, v.when])), none: "No picture fits, or it would look out of place." });
  });
});

describe("caption key words: reading the answers", () => {
  const lines = [line("Your premium jumps at 65.", 0), line("Check the rider today.", 3), line("Most plans have a gap.", 7), line("Book a review.", 14)];

  it("light a word at 0.35 or more, and nothing on none, a weaker pick or no answer", () => {
    const picks = readKeywords({ w0: choice("c2", KEY_WORD_AT), w1: choice("c1", 0.34), w2: choice("none", 0.9) }, lines, "off");
    expect(picks).toEqual([{ line: 0, word: "65" }, { line: 1, word: null }, { line: 2, word: null }, { line: 3, word: null }]);
    expect(readKeywords(null, lines, "on").every((p) => p.word === null && !p.emoji)).toBe(true);
    expect(readKeywords({ w0: choice("c9", 0.9) }, lines, "off")[0].word).toBeNull();
  });
  it("put an emoji on a lit line only at 0.5 or more, and only from the set", () => {
    const words = { w0: choice("c0", 0.8), w1: choice("c0", 0.8), w2: choice("c1", 0.8) };
    const picks = readKeywords({ ...words, e0: choice("money", EMOJI_AT), e1: choice("warning", 0.49), e2: choice("rocket", 0.9), e3: choice("idea", 0.9) }, lines, "on");
    expect(picks.map((p) => p.emoji)).toEqual([EMOJI.money.emoji, undefined, undefined, undefined]);
  });
  it("keep one emoji every 6 seconds, the strongest first, and one in all with the brand kit's one", () => {
    const all = { w0: choice("c0", 0.8), w1: choice("c0", 0.8), w2: choice("c0", 0.8), w3: choice("c0", 0.8) };
    const emoji = { e0: choice("money", 0.6), e1: choice("result", 0.9), e2: choice("idea", 0.7), e3: choice("time", 0.55) };
    expect(readKeywords({ ...all, ...emoji }, lines, "on").map((p) => p.emoji)).toEqual([undefined, EMOJI.result.emoji, undefined, EMOJI.time.emoji]);
    expect(readKeywords({ ...all, ...emoji }, lines, "one").map((p) => p.emoji)).toEqual([undefined, EMOJI.result.emoji, undefined, undefined]);
    expect(readKeywords({ ...all, ...emoji }, lines, "off").some((p) => p.emoji)).toBe(false);
  });
});
