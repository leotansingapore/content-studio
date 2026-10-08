import { describe, expect, it } from "vitest";
import { EMOJI, KEY_CHUNK, buildPopupMessages, eligibleLines, emojiQuestions, keyQuestions, keyState, parseMotionRequest, parsePopupReply, popupLines, readKeyLines, withEmoji, type MotionLine } from "./motion";

const L = (s: number, e: number, text: string): MotionLine => ({ s, e, text });
const lines = [
  L(0.2, 2.5, "Most people get CPF wrong."),
  L(3.1, 5.0, "Here is why."),
  L(5.2, 9.0, "Your Special Account earns 4% a year, guaranteed."),
  L(9.5, 10.1, "Okay."),
  L(10.5, 14.0, "Top it up before 55 and it compounds for you."),
];

describe("motion request", () => {
  it("keeps well-formed lines and clamps the hook time", () => {
    const r = parseMotionRequest({ sentences: [...lines, { s: 4, e: 3, text: "bad" }, { s: 1, e: 2, text: "" }], duration: 20, hookSeconds: 40 });
    expect(r.ok && r.lines.length).toBe(5);
    expect(r.ok && r.hookSeconds).toBe(10);
  });
  it("refuses a video too short or not captioned", () => {
    expect(parseMotionRequest({ sentences: lines, duration: 3 }).ok).toBe(false);
    expect(parseMotionRequest({ sentences: lines.slice(0, 1), duration: 20 }).ok).toBe(false);
  });
});

describe("which lines Jev is asked about", () => {
  it("skips lines under the hook card and lines under 3 words", () => {
    expect(eligibleLines(lines, 3)).toEqual([1, 2, 4]);
    expect(eligibleLines(lines, 3.2)).toEqual([2, 4]);
  });
  it("asks one Noul per line, in chunks, with the line before for context", () => {
    const many = Array.from({ length: KEY_CHUNK + 5 }, (_, i) => L(i * 3, i * 3 + 2, `Line number ${i} here.`));
    const chunks = keyQuestions(many, eligibleLines(many, 0));
    expect(chunks.map((c) => Object.keys(c).length)).toEqual([KEY_CHUNK, 5]);
    const q = chunks[0].key_1;
    expect(q.type).toBe("noul");
    expect((q.instructions as { line_before: string }).line_before).toBe("Line number 0 here.");
  });
  it("tags every line in the state so Jev reads the whole video", () => {
    expect(keyState(lines).transcript.split("\n")[2]).toBe("L2| Your Special Account earns 4% a year, guaranteed.");
  });
});

describe("reading Jev's answers", () => {
  it("returns each judged line's probability, rounded and clamped", () => {
    expect(readKeyLines({ key_2: { type: "noul", noul: 0.876 }, key_4: { type: "noul", noul: 1.2 } }, [2, 4])).toEqual([{ i: 2, p: 0.88 }, { i: 4, p: 1 }]);
  });
  it("is null when Jev gave nothing usable, so the editor keeps its old punch-in", () => {
    expect(readKeyLines(null, [2, 4])).toBeNull();
    expect(readKeyLines({ key_2: { type: "noul" } }, [2, 4])).toBeNull();
  });
});

describe("pop-ups", () => {
  const many = Array.from({ length: 20 }, (_, i) => L(i * 3, i * 3 + 2.5, `Line ${i} says something.`));
  it("are written for the strongest lines, 6 s apart, up to 3 a minute", () => {
    const picks = [{ i: 2, p: 0.9 }, { i: 3, p: 0.95 }, { i: 10, p: 0.8 }, { i: 15, p: 0.7 }, { i: 18, p: 0.4 }];
    expect(popupLines(many, picks, 60)).toEqual([3, 10, 15]);
    expect(popupLines(many, picks, 20)).toEqual([3]);
    expect(popupLines(many, picks, 120)).toEqual([3, 10, 15]); // a weak line never gets one
  });
  it("asks the LLM only for the words, line by line with the one before", () => {
    const msgs = buildPopupMessages(many, [3]);
    expect(msgs[1].content).toBe("L3: Line 3 says something.\n(said just before: Line 2 says something.)");
  });
  it("keeps pop-ups for the asked lines, cut at a word to 28 characters, key only when it is in the text", () => {
    const reply = JSON.stringify({ popups: [
      { id: "L3", text: "Top up before 55, it compounds for decades", key: "before 55" },
      { id: "L10", text: "“Check it” — every year.", key: "monthly" },
      { id: "L4", text: "Not asked for", key: "" },
      { id: "L3", text: "Twice", key: "" },
    ] });
    expect(parsePopupReply(reply, [3, 10])).toEqual([
      { i: 3, text: "Top up before 55, it", key: "before 55" },
      { i: 10, text: "Check it, every year", key: "" },
    ]);
    expect(parsePopupReply("not json", [3])).toEqual([]);
  });
  it("gets the emoji Jev picks by the feeling of the line, or none without an answer", () => {
    const written = [{ i: 3, text: "Top up early", key: "early" }];
    const q = emojiQuestions(many, written).emoji_3;
    expect(q.type).toBe("choice");
    expect(Object.keys((q as { criteria: Record<string, unknown> }).criteria)).toContain("money");
    expect(withEmoji({ emoji_3: { type: "choice", choice: "time" } }, written)[0].emoji).toBe(EMOJI.time.emoji);
    expect(withEmoji({ emoji_3: { type: "choice", choice: "rocket" } }, written)[0].emoji).toBe("");
    expect(withEmoji(null, written)[0].emoji).toBe("");
  });
});
