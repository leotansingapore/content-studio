import { describe, expect, it } from "vitest";
import { KEY_CHUNK, eligibleLines, keyQuestions, keyState, parseMotionRequest, readKeyLines, type MotionLine } from "./motion";

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
