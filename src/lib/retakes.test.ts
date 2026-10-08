import { describe, expect, it } from "vitest";
import { commonWords, findRetakes, saysAgain } from "./retakes";
import { keepSegments, listCuts, outputTime, type Word } from "./videoEdit";

/** Words for a line said from `at`, 0.3 s a word. */
const say = (text: string, at: number): Word[] => text.split(" ").map((w, i) => ({ w, s: at + i * 0.3, e: at + i * 0.3 + 0.28 }));
const base = { trimStart: 0, trimEnd: 0, removeFillers: true, removeRetakes: true, maxPause: 0.6 };

describe("measuring a line said again", () => {
  it("counts the words two lines share in order", () => {
    expect(commonWords(["a", "b", "c", "d"], ["a", "x", "c", "d"])).toBe(3);
    expect(commonWords([], ["a"])).toBe(0);
  });

  it("matches a re-said line with a word changed, and a cut-off false start", () => {
    expect(saysAgain("So today I want to talk about CPF.", "So today I want to talk about your CPF.")).toBe(true);
    expect(saysAgain("The main thing...", "The main thing is your CPF grows.")).toBe(true);
    // fillers don't count against a match
    expect(saysAgain("So um um the plan uh works um.", "So the plan works.")).toBe(true);
  });

  it("leaves two different lines alone, short ones and parallel ones included", () => {
    expect(saysAgain("You need to save more.", "You need to invest more.")).toBe(false);
    expect(saysAgain("Yes.", "Yes.")).toBe(false);
    expect(saysAgain("Your CPF grows every year.", "Insurance protects your family.")).toBe(false);
    expect(saysAgain("The main thing is your CPF.", "The main thing.")).toBe(false); // the later one is shorter: not a restart
  });
});

describe("retakes in an edit", () => {
  const first = say("So today I want to talk about CPF.", 0.5); // 0.5 to 2.88
  const again = say("So today I want to talk about your CPF.", 4.2);
  const rest = say("It grows.", 7.2);
  const words = [...first, ...again, ...rest];

  it("cuts the earlier take with the silence after it, down to the padding, and keeps the last", () => {
    const [r, ...more] = findRetakes(words);
    expect(more).toEqual([]);
    expect(r).toMatchObject({ s: 0.5, again: 4.2, text: "So today I want to talk about CPF." });
    expect(r.start).toBe(0.5);
    expect(r.end).toBeCloseTo(4.2 - 0.14);
    const segs = keepSegments(words, 9, base);
    expect(outputTime(segs, 1.5)).toBeNull();
    expect(outputTime(segs, 4.5)).not.toBeNull();
    expect(outputTime(segs, 7.5)).not.toBeNull();
  });

  it("keeps only the last of three takes", () => {
    const three = [...first, ...say("So today I want to talk about CPF.", 4), ...say("So today I want to talk about your CPF.", 8)];
    expect(findRetakes(three).map((r) => r.s)).toEqual([0.5, 4]);
  });

  it("leaves a line said again more than 20 s later", () => {
    expect(findRetakes([...first, ...say("So today I want to talk about CPF.", 23.5)])).toEqual([]);
  });

  it("lists each retake for review, and Keep or switching it off brings the take back", () => {
    const r = listCuts(words, 9, base).filter((c) => c.kind === "retake");
    expect(r.map((c) => [c.id, c.word, c.again])).toEqual([["r:0.50", "So today I want to talk about CPF.", 4.2]]);
    expect(outputTime(keepSegments(words, 9, { ...base, keepCuts: ["r:0.50"] }), 1.5)).not.toBeNull();
    expect(outputTime(keepSegments(words, 9, { ...base, removeRetakes: false }), 1.5)).not.toBeNull();
    expect(listCuts(words, 9, { ...base, removeRetakes: undefined }).some((c) => c.kind === "retake")).toBe(false);
  });
});
