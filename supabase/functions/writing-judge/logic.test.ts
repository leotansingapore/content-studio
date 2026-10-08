import { describe, expect, it } from "vitest";
import {
  AI_MAX,
  MAX_SENTENCES,
  SHAPE_MIN,
  SPECIFIC_MIN,
  VOICE_MIN,
  humanQuestions,
  humanState,
  parseJudgeRequest,
  readHuman,
  splitSentences,
} from "./logic";

const post = "My client paid $0 for his ward stay.\nHis colleague paid $11,400.\n\nThe result? One rider at 3.5% of his premium. Thoughts?";

describe("splitSentences", () => {
  it("splits on lines and on . ! ? before a space, keeping decimals and amounts whole", () => {
    expect(splitSentences(post)).toEqual([
      "My client paid $0 for his ward stay.",
      "His colleague paid $11,400.",
      "The result?",
      "One rider at 3.5% of his premium.",
      "Thoughts?",
    ]);
  });

  it("drops units with no letters and keeps a line with no full stop", () => {
    expect(splitSentences("Start here\n\n🔥🔥\n$300!!! Then wait...  and see")).toEqual(["Start here", "Then wait...", "and see"]);
  });
});

describe("parseJudgeRequest", () => {
  it("takes a known mode, the draft and up to three trimmed samples", () => {
    const r = parseJudgeRequest({ mode: "human", text: `  ${post} `, samples: ["a", " ", 4, "b", "c", "d"] });
    expect(r).toEqual({ ok: true, request: { mode: "human", text: post, samples: ["a", "b", "c"] } });
  });

  it("refuses an unknown mode and a draft too short or too long", () => {
    expect(parseJudgeRequest({ mode: "poem", text: post })).toMatchObject({ ok: false });
    expect(parseJudgeRequest({ mode: "human", text: "Too short" })).toMatchObject({ ok: false });
    expect(parseJudgeRequest({ mode: "human", text: "x ".repeat(2600) })).toMatchObject({ ok: false });
    expect(parseJudgeRequest(null)).toMatchObject({ ok: false });
  });
});

describe("the human questions", () => {
  it("asks about voice only with samples, and one shape question per sentence with the one before it", () => {
    const { sentences, state } = humanState(post, []);
    expect(state).toEqual({ draft: post });
    const q = humanQuestions(sentences, false);
    expect(Object.keys(q)).toEqual(["ai", "specific", ...sentences.map((_, i) => `shape_${i}`)]);
    expect(q.shape_2).toMatchObject({ type: "choice", instructions: { sentence: "The result?", sentence_before: "His colleague paid $11,400." } });
    expect(Object.keys((q.shape_0 as { criteria: object }).criteria)[0]).toBe("none");
    expect(Object.keys(humanQuestions(sentences, true))).toContain("voice");
    expect(humanState(post, ["mine"]).state).toEqual({ draft: post, voice_samples: ["mine"] });
  });

  it("judges at most MAX_SENTENCES sentences", () => {
    expect(humanState("One two three. ".repeat(60).trim(), []).sentences).toHaveLength(MAX_SENTENCES);
  });
});

describe("readHuman", () => {
  const sentences = splitSentences(post);
  const shape = (choice: string, p: number) => ({ type: "choice" as const, choice, probabilities: { none: 1 - p, [choice]: p } });

  it("turns probabilities into yes or no at the thresholds and keeps only confident shapes", () => {
    const answers = {
      ai: { type: "noul" as const, noul: AI_MAX },
      specific: { type: "noul" as const, noul: SPECIFIC_MIN - 0.01 },
      voice: { type: "noul" as const, noul: VOICE_MIN },
      shape_0: shape("none", 0.9),
      shape_2: shape("reveal", SHAPE_MIN),
      shape_3: shape("triad", SHAPE_MIN - 0.01),
      shape_4: shape("bait", 0.99),
    };
    expect(readHuman(answers, sentences)).toEqual({
      aiSounding: true,
      specific: false,
      voiceMatch: true,
      shapes: [
        { text: "The result?", shape: "reveal" },
        { text: "Thoughts?", shape: "bait" },
      ],
    });
  });

  it("gives null for anything Jev did not answer, and nothing at all when Jev is down", () => {
    expect(readHuman({ ai: { type: "noul", noul: 0.1 } }, sentences)).toEqual({ aiSounding: false, specific: null, voiceMatch: null, shapes: [] });
    expect(readHuman(null, sentences)).toBeNull();
  });
});
