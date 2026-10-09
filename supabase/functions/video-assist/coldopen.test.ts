import { describe, expect, it } from "vitest";
import { COLD_CHUNK, COLD_MARGIN, COLD_MIN, coldQuestions, coldState, parseColdOpenRequest, rateColdLines, readColdPick } from "./coldopen";

const L = (s: number, text: string) => ({ s, e: s + 2, text });
const lines = [L(0, "But I think most of the time, I don't think so."), L(3, "You pay $100,000 just to get started."), L(6, "And that is why."), L(9, "Start something where the cost is low.")];

const answers = (rate: Record<number, [number, number]>) =>
  Object.fromEntries(Object.entries(rate).flatMap(([i, [hook, alone]]) => [[`hook_${i}`, { type: "score" as const, score: hook }], [`alone_${i}`, { type: "noul" as const, noul: alone }]]));

describe("cold open request", () => {
  it("keeps the timed lines, candidates that point at lines, and the opening when it isn't a candidate", () => {
    const r = parseColdOpenRequest({ sentences: lines, candidates: [1, 3, 3, 9, -1, "2"], opening: 0, title: " Hook " });
    expect(r.ok && r.candidates).toEqual([1, 3, 2]);
    expect(r.ok && r.opening).toBe(0);
    expect(r.ok && r.title).toBe("Hook");
    expect(parseColdOpenRequest({ sentences: lines, candidates: [1], opening: 1 })).toMatchObject({ opening: null });
  });
  it("refuses no captions or no candidates", () => {
    expect(parseColdOpenRequest({ sentences: [], candidates: [0] }).ok).toBe(false);
    expect(parseColdOpenRequest({ sentences: lines, candidates: [] }).ok).toBe(false);
  });
});

describe("the questions", () => {
  it("asks Leo's two openers questions per line, in chunks", () => {
    const many = Array.from({ length: COLD_CHUNK + 2 }, (_, i) => L(i * 3, `Line ${i} is here now.`));
    const chunks = coldQuestions(many, many.map((_, i) => i));
    expect(chunks.map((c) => Object.keys(c).length)).toEqual([COLD_CHUNK * 2, 4]);
    expect(chunks[0].hook_0.type).toBe("score");
    expect((chunks[0].hook_0 as { criteria: string[] }).criteria).toHaveLength(4);
    expect(chunks[0].alone_0.type).toBe("noul");
    expect(coldState("").title).toBe("(no title on screen)");
  });
});

describe("rating and the pick", () => {
  it("weighs the hook score 0.7 and standing alone 0.3, best first", () => {
    expect(rateColdLines(answers({ 1: [3, 1], 3: [1.5, 0] }), [1, 3])).toEqual([{ i: 1, p: 1 }, { i: 3, p: 0.35 }]);
    expect(rateColdLines(answers({ 1: [3, 1] }), [1, 3])).toEqual([{ i: 1, p: 1 }]);
  });
  it("opens on the best line only when it is good enough and beats the video's own start", () => {
    // the best later line 0.46 against an opening of 0.23 (Leo's take)
    expect(readColdPick(answers({ 0: [0.25, 0.57], 1: [1.63, 0.26] }), [1], 0)).toEqual({ i: 1, p: 0.46 });
    // the video already opens on its hook: 0.60 at the start, 0.49 later
    expect(readColdPick(answers({ 0: [1.73, 0.67], 1: [1.7, 0.31] }), [1], 0)).toBeNull();
    // not good enough on its own
    expect(readColdPick(answers({ 1: [1.2, 0.2] }), [1], null)?.p ?? 0).toBeLessThan(COLD_MIN);
    expect(readColdPick(answers({ 1: [1.2, 0.2] }), [1], null)).toBeNull();
    expect(readColdPick(null, [1], 0)).toBeNull();
    expect(COLD_MARGIN).toBeGreaterThan(0);
  });
});
