import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  answerWords,
  fillFrom,
  loadInterview,
  nextStep,
  pickQuestions,
  reviewWords,
  saveInterview,
  startSession,
  transcriptOf,
  type InterviewStore,
} from "./interview";
import { seedAudience } from "./audiences";

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() { return m.size; },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, String(v)),
  };
}

const FULL = { topic: "CPF top-ups", who: "fresh grads" };
const NOW = new Date("2026-10-22T09:00:00Z");

describe("pickQuestions", () => {
  it("asks 5, starting at sessions % 8, so the next session opens differently", () => {
    const first = pickQuestions(0, FULL);
    expect(first).toHaveLength(5);
    expect(first[0]).toBe("What did a client or a friend ask you about money this week?");
    expect(first[1]).toBe("What is one thing people get wrong about CPF top-ups?");
    expect(first[3]).toBe("What would you tell fresh grads who are just starting to plan?");
    const next = pickQuestions(1, FULL);
    expect(next[0]).toBe(first[1]);
    expect(next[0]).not.toBe(first[0]);
    expect(pickQuestions(9, FULL)).toEqual(next);
    // wraps round the bank: session 6 starts at question 7, then 8, then 1
    expect(pickQuestions(6, FULL).slice(0, 3)).toEqual([
      "What happened this week that surprised you?",
      "What question do you get so often you could answer it in your sleep?",
      "What did a client or a friend ask you about money this week?",
    ]);
  });

  it("skips a question whose blank it cannot fill, and still asks 5", () => {
    const q = pickQuestions(0, {});
    expect(q).toHaveLength(5);
    expect(q.some((x) => x.includes("wrong about"))).toBe(false);
    expect(q.some((x) => x.includes("starting to plan"))).toBe(false);
    expect(pickQuestions(1, { who: "parents" })[0]).toBe("Tell me about a client situation that stayed with you. Leave out names and anything that could identify them.");
  });
});

describe("fillFrom", () => {
  it("takes the first topic that reads as one and the main audience's name, else the life stage's group, never 'general'", () => {
    expect(fillFrom({ topics: ["", " CPF top-ups ", "wills"], audience: "parent" }, { name: "Nurses in their thirties" })).toEqual({ topic: "CPF top-ups", who: "nurses in their thirties" });
    expect(fillFrom({ topics: [], audience: "parent" })).toEqual({ topic: undefined, who: "parents" });
    expect(fillFrom({ topics: [], audience: "general" }, { name: "Everyone I serve" })).toEqual({ topic: undefined, who: undefined });
    expect(fillFrom(null)).toEqual({ topic: undefined, who: undefined });
  });

  // wave 2 live check (22 Oct), live-p5w2 calls/014: the Me brand's profile as the interview read it
  const ME = {
    topics: ["Not taking action", "Letting money sit in bank", "Afraid of >5yr commitment", "Lack of time to invest", "Too much information and jargon"],
    audienceDetail: "Auditor / Accountant, aged 30-48, Middle to upper-middle income",
    audience: "working-adult" as const,
  };

  it("never pastes raw profile text into a question (calls/014)", () => {
    const main = seedAudience(ME, NOW);
    expect(main.name).toBe("Auditor / Accountant, aged 30-48, Middle to upper-middle");
    const fill = fillFrom(ME, main);
    expect(fill).toEqual({ topic: undefined, who: "working adults" });
    const asked = [0, 1, 2, 3, 4, 5, 6, 7].flatMap((k) => pickQuestions(k, fill));
    expect(asked.some((q) => /Not taking action|Auditor|aged 30-48/i.test(q))).toBe(false);
    expect(asked.some((q) => q.includes("wrong about"))).toBe(false);
    expect(asked).toContain("What would you tell working adults who are just starting to plan?");
  });

  it("fills from a business brand's topics and saved audience in lower case, keeping acronyms and brand names", () => {
    const at = { topics: ["Sales follow-ups", "WhatsApp workflows"], audience: "working-adult" as const };
    expect(fillFrom(at, { name: "Sales representatives" })).toEqual({ topic: "sales follow-ups", who: "sales representatives" });
    expect(fillFrom({ topics: ["WhatsApp workflows"], audience: "general" }, seedAudience({ audience: "working-adult", audienceDetail: "Sales-oriented self-employed professionals and coaches" }, NOW)))
      .toEqual({ topic: "WhatsApp workflows", who: "sales-oriented self-employed professionals and coaches" });
    expect(fillFrom({ topics: ["Activity tracking", "CPF top-ups"], audience: "general" })).toMatchObject({ topic: "activity tracking" });
    expect(fillFrom({ topics: ["Building wealth", "CPF top-ups"], audience: "general" })).toMatchObject({ topic: "CPF top-ups" });
  });
});

describe("transcriptOf and the word counts", () => {
  const questions = ["Q one?", "Q two?", "Q three?"];
  it("builds the Q:/A: text and leaves skipped questions out", () => {
    expect(transcriptOf(questions, ["First answer. ", "", "Third\n\nanswer"])).toBe("Q: Q one?\nA: First answer.\n\nQ: Q three?\nA: Third\n\nanswer");
    expect(transcriptOf(questions, ["", " ", ""])).toBe("");
  });
  it("counts only the answers' words, in the session and in the review's text", () => {
    expect(answerWords(["one two", "", "three  four\nfive"])).toBe(5);
    expect(reviewWords(transcriptOf(questions, ["one two", "", "three four\n\nfive"]))).toBe(5);
    expect(reviewWords("Q: a long question with many words?\nA:   ")).toBe(0);
  });
});

describe("nextStep", () => {
  it("asks Jev first, shows the follow-up for a thin answer once, and moves on otherwise", () => {
    expect(nextStep("people don't plan", undefined, false)).toBe("check");
    expect(nextStep("people don't plan", true, false)).toBe("follow-up");
    expect(nextStep("people don't plan", false, false)).toBe("next");
    expect(nextStep("people don't plan", null, false)).toBe("next");
  });
  it("never checks an answer that already had its follow-up, or an empty one", () => {
    expect(nextStep("people don't plan", undefined, true)).toBe("next");
    expect(nextStep("people don't plan", true, true)).toBe("next");
    expect(nextStep("   ", undefined, false)).toBe("next");
    expect(nextStep("", true, false)).toBe("next");
  });
});

describe("the stored session", () => {
  beforeEach(() => vi.stubGlobal("localStorage", memoryStorage()));

  it("starts one round the bank further each time", () => {
    const one = startSession({ sessions: 0 }, FULL, NOW);
    expect(one.sessions).toBe(1);
    expect(one.current).toMatchObject({ step: 0, startedAt: "2026-10-22T09:00:00.000Z", answers: ["", "", "", "", ""], followed: [false, false, false, false, false] });
    const two = startSession(one, FULL, NOW);
    expect(two.current!.questions[0]).toBe(pickQuestions(1, FULL)[0]);
  });

  it("round trips, the answers, follow-ups, step and review kept", () => {
    const s = startSession({ sessions: 3 }, FULL, NOW);
    const store: InterviewStore = { ...s, current: { ...s.current!, answers: ["a", "", "c", "", ""], followed: [true, false, false, false, false], step: 2, review: "Q: x\nA: y" } };
    expect(saveInterview("u1", store)).toBe(true);
    expect(loadInterview("u1")).toEqual(store);
    expect(loadInterview("u2")).toEqual({ sessions: 0 });
    expect(loadInterview(null)).toEqual({ sessions: 0 });
  });

  it("drops a broken session and keeps the count, and reads bad JSON as empty", () => {
    localStorage.setItem("cs-interview-u1", JSON.stringify({ sessions: 4, current: { questions: ["a"], answers: [], followed: [false], step: 0, startedAt: "x" } }));
    expect(loadInterview("u1")).toEqual({ sessions: 4 });
    localStorage.setItem("cs-interview-u1", JSON.stringify({ sessions: 4, current: { questions: ["a"], answers: ["b"], followed: [false], step: 3, startedAt: "x" } }));
    expect(loadInterview("u1")).toEqual({ sessions: 4 });
    localStorage.setItem("cs-interview-u1", "{not json");
    expect(loadInterview("u1")).toEqual({ sessions: 0 });
  });

  it("says when the device refuses the write", () => {
    vi.stubGlobal("localStorage", { ...memoryStorage(), setItem: () => { throw new Error("QuotaExceededError"); } });
    expect(saveInterview("u1", { sessions: 1 })).toBe(false);
  });
});
