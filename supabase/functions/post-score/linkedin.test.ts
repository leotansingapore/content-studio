import { describe, expect, it } from "vitest";
import {
  LINKEDIN_CHECKS,
  LINKEDIN_CHECK_IDS,
  LINKEDIN_QUESTIONS,
  LINKEDIN_SHIP_MISSES,
  MAX_TEXT,
  composeLinkedInCheck,
  linkedInState,
  parseLinkedInCheck,
  type LinkedInCheckId,
} from "./logic.ts";

const all = (p: number) => Object.fromEntries(LINKEDIN_CHECK_IDS.map((id) => [id, p])) as Record<LinkedInCheckId, number>;
const post = "Most coaches lose the client in the first call, not the last one.\n\nHere's the question I ask instead.";

describe("LinkedIn post check", () => {
  it("asks one question per check and gives every check a label and a tip", () => {
    expect(Object.keys(LINKEDIN_QUESTIONS).sort()).toEqual([...LINKEDIN_CHECK_IDS].sort());
    expect(LINKEDIN_CHECK_IDS).toHaveLength(11);
    for (const id of LINKEDIN_CHECK_IDS) {
      expect(LINKEDIN_CHECKS[id].label.length, id).toBeGreaterThan(3);
      expect(LINKEDIN_CHECKS[id].tip.length, id).toBeGreaterThan(20);
      expect(LINKEDIN_QUESTIONS[id].type).toBe("noul");
    }
    expect(LINKEDIN_CHECK_IDS.filter((id) => LINKEDIN_CHECKS[id].must)).toEqual(["hook", "cold"]);
  });

  it("ships a draft that passes everything, with no fix", () => {
    expect(composeLinkedInCheck(all(0.9))).toEqual({ verdict: "ship", passed: 11, missed: [], fix: null });
  });

  it("still ships with two ordinary misses, and the first miss in fix order is the fix", () => {
    const r = composeLinkedInCheck({ ...all(0.9), flow: 0.2, objection: 0.3 });
    expect(r).toEqual({ verdict: "ship", passed: 9, missed: ["objection", "flow"], fix: "objection" });
    expect(r!.missed.length).toBe(LINKEDIN_SHIP_MISSES);
  });

  it("revises on a third ordinary miss", () => {
    expect(composeLinkedInCheck({ ...all(0.9), flow: 0.2, objection: 0.3, simple: 0.1 })?.verdict).toBe("revise");
  });

  it("revises whenever a must misses, even alone, and the must is the fix", () => {
    expect(composeLinkedInCheck({ ...all(0.9), hook: 0.4 })).toMatchObject({ verdict: "revise", fix: "hook" });
    expect(composeLinkedInCheck({ ...all(0.9), cold: 0.49, saveable: 0.1 })).toMatchObject({ verdict: "revise", fix: "cold" });
  });

  it("treats 0.5 as a pass", () => {
    expect(composeLinkedInCheck({ ...all(0.9), hook: 0.5 })?.verdict).toBe("ship");
  });

  it("gives no verdict when any answer is missing, so a partial outage never ships a post", () => {
    expect(composeLinkedInCheck({ ...all(0.9), tight: null })).toBeNull();
    const { skimmable: _, ...short } = all(0.9);
    expect(composeLinkedInCheck(short)).toBeNull();
  });

  it("reads the first non-empty line as the first line", () => {
    expect(linkedInState(`\n  ${post}`)).toEqual({ platform: "LinkedIn", first_line: "Most coaches lose the client in the first call, not the last one.", post: `\n  ${post}` });
  });

  it("only takes requests that ask for it, and refuses drafts too short or too long", () => {
    expect(parseLinkedInCheck({ text: post, platform: "linkedin" })).toBeNull();
    expect(parseLinkedInCheck({ check: "linkedin", text: `  ${post}  ` })).toEqual({ ok: true, text: post });
    expect(parseLinkedInCheck({ check: "linkedin", text: "too short" })).toMatchObject({ ok: false });
    expect(parseLinkedInCheck({ check: "linkedin", text: "x".repeat(MAX_TEXT + 1) })).toMatchObject({ ok: false });
  });
});
