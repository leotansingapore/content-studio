import { describe, expect, it } from "vitest";
import { FILTERS } from "../../../src/lib/videoEdit";
import { BEAT_MAX, BEAT_MIN, DEFAULT_GRADE, GRADES, MAX_BEATS, MIN_BEATS, buildMontageMessages, fitBeats, gradeQuestion, parseMontageReply, parseMontageRequest, parsePickRequest, pickQuestions, readGrade, readPicks, type Beat } from "./montage";

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
});
