import { describe, expect, it } from "vitest";
import { HOOK_CHARS, buildHooksMessages, cleanHook, hooksPick, hooksQuestions, hooksState, parseHooksReply, parseHooksRequest, type FormulaIn } from "./hooks";

const F = (id: string): FormulaIn => ({ id, name: id.toUpperCase(), template: `Shape of ${id}`, example: `Example of ${id}`, trap: `Trap of ${id}` });
const formulas = [F("number-reveal"), F("warning"), F("myth-bust")];
const lines = [
  { s: 0.2, e: 2.5, text: "I reviewed 40 young families this year." },
  { s: 2.9, e: 6, text: "31 had the same gap in their hospital cover." },
];

describe("hooks request", () => {
  it("keeps timed lines and up to three distinct formulas", () => {
    const r = parseHooksRequest({ sentences: [...lines, { s: 3, e: 2, text: "bad" }], duration: 30, formulas: [...formulas, F("extra")] });
    expect(r.ok && r.lines.length).toBe(2);
    expect(r.ok && r.formulas.map((f) => f.id)).toEqual(["number-reveal", "warning", "myth-bust"]);
  });
  it("refuses no captions, a tiny video, or fewer than two formulas", () => {
    expect(parseHooksRequest({ sentences: [], duration: 30, formulas }).ok).toBe(false);
    expect(parseHooksRequest({ sentences: lines, duration: 2, formulas }).ok).toBe(false);
    expect(parseHooksRequest({ sentences: lines, duration: 30, formulas: formulas.slice(0, 1) }).ok).toBe(false);
    expect(parseHooksRequest({ sentences: lines, duration: 30, formulas: [F("warning"), F("warning")] }).ok).toBe(false);
  });
});

describe("the prompt", () => {
  it("names every formula by id with its shape, and says to use only the speaker's facts", () => {
    const [sys, user] = buildHooksMessages(lines, formulas);
    expect(sys.content).toMatch(/Never invent a number/);
    expect(user.content).toContain("- warning (WARNING). Shape: Shape of warning");
    expect(user.content).toContain("31 had the same gap");
  });
});

describe("the reply", () => {
  it("keeps one hook per asked formula in the asked order, cleaned", () => {
    const reply = JSON.stringify({
      hooks: [
        { id: "warning", text: "Your hospital cover has a gap — check it #cpf" },
        { id: "number-reveal", text: '"31 of 40 families had this gap"' },
        { id: "made-up", text: "Ignored" },
        { id: "myth-bust", text: "x" },
      ],
    });
    expect(parseHooksReply(reply, formulas)).toEqual([
      { formula: "number-reveal", text: "31 of 40 families had this gap" },
      { formula: "warning", text: "Your hospital cover has a gap, check it" },
    ]);
  });
  it("gives up on fewer than two usable hooks or bad JSON", () => {
    expect(parseHooksReply(JSON.stringify({ hooks: [{ id: "warning", text: "One good hook here" }] }), formulas)).toBeNull();
    expect(parseHooksReply("not json", formulas)).toBeNull();
    expect(parseHooksReply(JSON.stringify({ hooks: [{ id: "warning", text: "Same hook" }, { id: "myth-bust", text: "same HOOK" }] }), formulas)).toBeNull();
  });
  it("keeps a long hook whole when it fits the card, else only its whole sentences that fit, never half a sentence", () => {
    expect(cleanHook("I reviewed 40 young families this year. 31 had the same gap.")).toBe("I reviewed 40 young families this year. 31 had the same gap.");
    const two = "I reviewed 40 young families this year and wrote down every gap. Thirty one had the very same gap in their hospital cover.";
    expect(two.length).toBeGreaterThan(HOOK_CHARS);
    expect(cleanHook(two)).toBe("I reviewed 40 young families this year and wrote down every gap.");
    expect(cleanHook("a ".repeat(60).trim())).toBe("");
  });
});

describe("Jev's pick", () => {
  const texts = ["31 of 40 families had this gap", "Your hospital cover has a gap", "Cover is not why claims fail"];
  it("asks Write's hook question in both orders, about the video's opening", () => {
    const q = hooksQuestions(texts) as Record<string, { criteria: Record<string, string> }>;
    expect(Object.keys(q)).toEqual(["pick_fwd", "pick_rev"]);
    expect(Object.values(q.pick_rev.criteria)).toEqual([...texts].reverse());
    expect(hooksState(texts, lines)).toMatchObject({ platform: "Instagram Reels, TikTok and YouTube Shorts", topic: expect.stringContaining("40 young families") });
  });
  it("picks the hook that leads on both orders, and none on a tie or no answer", () => {
    const answers = (a: number[], b: number[]) => ({
      pick_fwd: { type: "choice" as const, probabilities: { A: a[0], B: a[1], C: a[2] } },
      pick_rev: { type: "choice" as const, probabilities: { A: b[0], B: b[1], C: b[2] } },
    });
    expect(hooksPick(answers([0.1, 0.8, 0.1], [0.2, 0.7, 0.1]), 3)).toBe(1);
    expect(hooksPick(answers([0.45, 0.4, 0.15], [0.4, 0.45, 0.15]), 3)).toBeNull();
    expect(hooksPick(null, 3)).toBeNull();
  });
});
