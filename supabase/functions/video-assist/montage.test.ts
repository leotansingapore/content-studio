import { describe, expect, it } from "vitest";
import { FILTERS } from "../../../src/lib/videoEdit";
import { BEAT_MAX, BEAT_MIN, DEFAULT_GRADE, GRADES, MAX_BEATS, MAX_SET_CANDIDATES, MIN_BEATS, buildMontageMessages, fitBeats, gradeQuestion, parseMontageReply, parseMontageRequest, parsePickRequest, pickQuestions, readGrade, readPicks, readScores, type Beat } from "./montage";

const beat = (n: number, seconds = 4, over: Partial<Beat> = {}): Beat => ({ say: `Shot ${n}`, search: `shot ${n}`, fallback: "city", text: "", seconds, ...over });
const reply = (beats: unknown[]) => JSON.stringify({ beats });

describe("montage request", () => {
  it("needs a theme and keeps the length between 20 and 45 s", () => {
    expect(parseMontageRequest({ theme: "  Singapore   mornings ", seconds: 30 })).toEqual({ ok: true, theme: "Singapore mornings", seconds: 30 });
    expect(parseMontageRequest({ theme: "ab" }).ok).toBe(false);
    expect(parseMontageRequest({ theme: "x".repeat(81) }).ok).toBe(false);
    expect(parseMontageRequest({ theme: "abc", seconds: 5 })).toMatchObject({ seconds: 20 });
    expect(parseMontageRequest({ theme: "abc", seconds: 500 })).toMatchObject({ seconds: 45 });
    expect(parseMontageRequest({ theme: "abc" })).toMatchObject({ seconds: 30 });
  });
  it("tells the LLM that people and places default to Singapore", () => {
    expect(buildMontageMessages("mornings", 30)[0].content).toMatch(/Singaporean or Asian/);
  });
});

describe("the grades match the editor's colour looks", () => {
  it("has exactly the editor's filter ids", () => {
    expect(Object.keys(GRADES).sort()).toEqual(Object.keys(FILTERS).sort());
  });
  it("asks one Choice and falls back to warm", () => {
    expect(gradeQuestion("x").grade.type).toBe("choice");
    expect(readGrade({ grade: { type: "choice", choice: "mono" } })).toBe("mono");
    expect(readGrade({ grade: { type: "choice", choice: "sparkly" } })).toBe(DEFAULT_GRADE);
    expect(readGrade(null)).toBe(DEFAULT_GRADE);
  });
});

describe("beats", () => {
  it("cleans what the LLM wrote", () => {
    const b = parseMontageReply(reply(Array.from({ length: 7 }, (_, i) => ({ say: `A shot — ${i}`, search: "Hawker Centre!! at night now", fallback: "", text: i ? "" : "Good morning." , seconds: 4 }))), 28)!;
    expect(b).toHaveLength(7);
    expect(b[0]).toMatchObject({ search: "hawker centre at", fallback: "hawker centre at", text: "Good morning" });
    expect(b[0].say).not.toContain("—");
  });
  it("cuts on-screen words at a word, 32 characters at most", () => {
    const b = parseMontageReply(reply(Array.from({ length: 6 }, () => ({ say: "s", search: "x", text: "Start where you are with what you have today", seconds: 4 }))), 24)!;
    expect(b[0].text).toBe("Start where you are with what");
  });
  it("needs at least 6 usable beats", () => {
    expect(parseMontageReply(reply(Array.from({ length: 5 }, (_, i) => beat(i))), 30)).toBeNull();
    expect(parseMontageReply(reply([...Array.from({ length: 5 }, (_, i) => beat(i)), { say: "", search: "" }]), 30)).toBeNull();
    expect(parseMontageReply("nope", 30)).toBeNull();
    expect(parseMontageReply(null, 30)).toBeNull();
  });
  it("keeps every beat between 2 and 6 s", () => {
    const f = fitBeats([beat(1, 1), beat(2, 9), beat(3), beat(4), beat(5), beat(6)], 26);
    for (const b of f) expect(b.seconds >= BEAT_MIN && b.seconds <= BEAT_MAX).toBe(true);
  });
  it("drops the surplus from the end but never below 6 beats, and stretches a shortfall", () => {
    const long = fitBeats(Array.from({ length: 10 }, (_, i) => beat(i, 6)), 30);
    expect(long.length).toBeLessThan(MAX_BEATS);
    expect(long.length).toBeGreaterThanOrEqual(MIN_BEATS);
    expect(long.length).toBeLessThanOrEqual(MAX_BEATS);
    expect(long.reduce((n, b) => n + b.seconds, 0)).toBeLessThanOrEqual(33);
    const short = fitBeats(Array.from({ length: 6 }, (_, i) => beat(i, 2)), 30);
    expect(short.reduce((n, b) => n + b.seconds, 0)).toBeGreaterThan(20);
  });
});

describe("which clip fits a beat", () => {
  const asks = [
    { say: "A woman rides the MRT", candidates: [{ desc: "woman riding train" }, { desc: "cat on a sofa" }] },
    { say: "Coffee", candidates: [] },
  ];
  it("asks one Choice per beat that has candidates, with a none option", () => {
    const q = pickQuestions(asks);
    expect(Object.keys(q)).toEqual(["pick_0"]);
    expect(Object.keys((q.pick_0 as { criteria: object }).criteria)).toEqual(["c0", "c1", "none"]);
  });
  it("reads an index, -1 for none, null for no answer or an index that is not there", () => {
    expect(readPicks({ pick_0: { type: "choice", choice: "c1" } }, asks)).toEqual([1, null]);
    expect(readPicks({ pick_0: { type: "choice", choice: "none" } }, asks)).toEqual([-1, null]);
    expect(readPicks({ pick_0: { type: "choice", choice: "c9" } }, asks)).toEqual([null, null]);
    expect(readPicks(null, asks)).toEqual([null, null]);
  });
  it("refuses an empty request", () => {
    expect(parsePickRequest({ beats: [] }).ok).toBe(false);
    expect(parsePickRequest({ beats: [{ say: "x", candidates: [{ desc: "a" }] }] }).ok).toBe(true);
  });
  it("asks about a stock photo only when the slideshow says photo; the montage's question is unchanged", () => {
    const question = (q: ReturnType<typeof pickQuestions>) => (q.pick_0 as { instructions: { question: string } }).instructions.question;
    expect(question(pickQuestions(asks))).toBe("Which stock clip, described by its page name, best shows `beat`?");
    expect(question(pickQuestions(asks, "clip"))).toBe("Which stock clip, described by its page name, best shows `beat`?");
    expect(question(pickQuestions(asks, "photo"))).toContain("stock photo");
    // the montage sends no noun and anything else reads as a clip, so today's callers ask exactly what they asked before
    const say = { beats: [{ say: "x", candidates: [{ desc: "" }] }] };
    expect(parsePickRequest(say)).toMatchObject({ ok: true, noun: "clip" });
    expect(parsePickRequest({ ...say, noun: "sticker" })).toMatchObject({ ok: true, noun: "clip" });
    expect(parsePickRequest({ ...say, noun: "photo" })).toMatchObject({ ok: true, noun: "photo" });
    const p = parsePickRequest({ ...say, noun: "photo" });
    if (!p.ok) throw new Error("refused");
    expect((pickQuestions(p.beats, p.noun).pick_0 as { criteria: Record<string, string> }).criteria.c0).toBe("an unlabelled photo");
    expect((pickQuestions(p.beats).pick_0 as { criteria: Record<string, string> }).criteria.c0).toBe("an unlabelled clip");
  });
});

// Pinned on today's code before media sets: what the montage, the slideshow and the explainer send today must parse
// and ask Jev exactly this, whatever the request carries beside it.
describe("today's montage pick, pinned", () => {
  const body = {
    theme: "  Saving   for a home ",
    beats: [
      { say: "A couple — counting coins at the table", candidates: Array.from({ length: 8 }, (_, j) => ({ desc: j === 2 ? "" : `couple-counting-coins-${j} "jar"` })) },
      { say: "x".repeat(120), candidates: [{ desc: "y".repeat(140) }] },
    ],
  };
  const pinned = {
    ok: true,
    theme: "Saving for a home",
    noun: "clip",
    beats: [
      { say: "A couple, counting coins at the table", candidates: [0, 1, 2, 3, 4, 5].map((j) => ({ desc: j === 2 ? "" : `couple-counting-coins-${j} jar` })) },
      { say: "x".repeat(90), candidates: [{ desc: "y".repeat(100) }] },
    ],
  };
  it("parses to 6 candidates a beat, cut and cleaned as before", () => {
    expect(parsePickRequest(body)).toEqual(pinned);
    expect(parsePickRequest({ ...body, set: true })).toEqual(pinned);
  });
  it("asks the same questions", () => {
    const p = parsePickRequest(body);
    if (!p.ok) throw new Error("refused");
    expect(pickQuestions(p.beats, p.noun)).toEqual({
      pick_0: {
        type: "choice",
        instructions: { beat: "A couple, counting coins at the table", question: "Which stock clip, described by its page name, best shows `beat`?" },
        criteria: { c0: "couple-counting-coins-0 jar", c1: "couple-counting-coins-1 jar", c2: "an unlabelled clip", c3: "couple-counting-coins-3 jar", c4: "couple-counting-coins-4 jar", c5: "couple-counting-coins-5 jar", none: "None of these shows the beat; they are about something else." },
      },
      pick_1: {
        type: "choice",
        instructions: { beat: "x".repeat(90), question: "Which stock clip, described by its page name, best shows `beat`?" },
        criteria: { c0: "y".repeat(100), none: "None of these shows the beat; they are about something else." },
      },
    });
  });
});

describe("a media set's pick (listed callers only)", () => {
  const body = { theme: "Money", set: true, beats: [{ say: "Coins in a jar", candidates: Array.from({ length: 15 }, (_, j) => ({ desc: `photo ${j}` })) }] };
  const question = (q: ReturnType<typeof pickQuestions>) => (q.pick_0 as { instructions: { question: string } }).instructions.question;
  it("keeps 12 candidates with set for a listed uid, 6 otherwise", () => {
    expect(MAX_SET_CANDIDATES).toBe(12);
    const listed = parsePickRequest(body, true);
    expect(listed).toMatchObject({ ok: true, set: true });
    if (!listed.ok) throw new Error("refused");
    expect(listed.beats[0].candidates).toHaveLength(12);
    for (const p of [parsePickRequest(body), parsePickRequest(body, false), parsePickRequest({ ...body, set: undefined }, true), parsePickRequest({ ...body, set: "yes" }, true)]) {
      if (!p.ok) throw new Error("refused");
      expect(p.beats[0].candidates).toHaveLength(6);
      expect("set" in p).toBe(false);
    }
  });
  it("asks about a photo or clip described in words only with set", () => {
    const listed = parsePickRequest(body, true);
    if (!listed.ok) throw new Error("refused");
    expect(question(pickQuestions(listed.beats, listed.noun, listed.set))).toBe("Which photo or clip, described in words, best shows `beat`?");
    expect(Object.keys((pickQuestions(listed.beats, listed.noun, listed.set).pick_0 as { criteria: object }).criteria)).toHaveLength(13);
    const other = parsePickRequest(body, false);
    if (!other.ok) throw new Error("refused");
    expect(question(pickQuestions(other.beats, other.noun, other.set))).toBe("Which stock clip, described by its page name, best shows `beat`?");
    expect(question(pickQuestions(other.beats, "photo", other.set))).toBe("Which stock photo, described in words, best shows `beat`?");
  });
  it("reads Jev's probability for every candidate, in order, so a file that tops several beats can go to one", () => {
    const asks = [{ say: "a", candidates: [{ desc: "x" }, { desc: "y" }, { desc: "z" }] }, { say: "b", candidates: [{ desc: "x" }] }, { say: "c", candidates: [] }];
    const answers = { pick_0: { type: "choice" as const, choice: "c1", probabilities: { c0: 0.1234, c1: 0.6, none: 0.2766 } }, pick_1: { type: "choice" as const, choice: "none" } };
    // c2 left out reads 0; a beat with no probabilities, or no candidates, has none
    expect(readScores(answers, asks)).toEqual([[0.123, 0.6, 0], null, null]);
    expect(readScores(null, asks)).toEqual([null, null, null]);
  });
});
