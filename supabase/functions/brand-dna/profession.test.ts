import { describe, expect, it } from "vitest";
import { PROFESSION_CHOICES } from "../_shared/profession";
import { aboutText, PROFESSION_MIN, PROFESSION_PICKS, professionAnswer, professionAsk, professionFrom } from "./profession";

const answer = (choice: unknown, probabilities: Record<string, unknown> = {}) => ({ profession: { type: "choice" as const, choice: choice as string, probabilities: probabilities as Record<string, number> } });

describe("the profession pick", () => {
  it("fills only at 0.85 or more, the cut set from the 13 Nov shadow run (0.6 named postmosis.com a freelancer at 0.80)", () => {
    expect(PROFESSION_MIN).toBe(0.85);
    expect(professionFrom(answer("freelancer", { freelancer: 0.8, other: 0.12 }))).toBe("");
    expect(professionFrom(answer("adviser", { adviser: 0.85 }))).toBe("Financial adviser");
  });

  it("offers exactly the work step's chips, plus a way out", () => {
    expect(Object.values(PROFESSION_PICKS)).toEqual([...PROFESSION_CHOICES]);
    expect(Object.keys(professionAsk.criteria)).toEqual([...Object.keys(PROFESSION_PICKS), "other"]);
  });

  it("prefills a chip only when Jev is sure enough", () => {
    expect(professionFrom(answer("realtor", { realtor: 0.91 }))).toBe("Real estate agent");
    expect(professionFrom(answer("adviser", { adviser: PROFESSION_MIN }))).toBe("Financial adviser");
    expect(professionFrom(answer("coach", { coach: PROFESSION_MIN - 0.01 }))).toBe("");
    expect(professionFrom(answer("coach", { coach: 0.5 }), 0.4)).toBe("Coach");
  });

  it("leaves the step empty for anything else, a missing answer or a strange one", () => {
    expect(professionFrom(answer("other", { other: 0.99 }))).toBe("");
    expect(professionFrom(null)).toBe("");
    expect(professionFrom({})).toBe("");
    expect(professionFrom(answer("coach"))).toBe("");
    expect(professionFrom(answer("toString", { toString: 0.99 }))).toBe("");
    expect(professionFrom(answer(7, { 7: 0.99 }))).toBe("");
    expect(professionFrom(answer("coach", { coach: Number.NaN }))).toBe("");
  });

  it("reads the pick and its probability for the report", () => {
    expect(professionAnswer(answer("lawyer", { lawyer: 0.7, other: 0.2 }))).toEqual({ key: "lawyer", p: 0.7 });
    expect(professionAnswer(null)).toEqual({ key: null, p: null });
  });

  it("asks about the same words the audience pick reads", () => {
    expect(aboutText({ oneLiner: "We sell homes.", audienceDetail: "First-time buyers" }, "Property agents in Singapore")).toBe("We sell homes. First-time buyers Property agents in Singapore");
    expect(aboutText(null, "Only a description")).toBe("Only a description");
    expect(aboutText(null, "")).toBe("");
    expect(aboutText({ oneLiner: "x".repeat(2000) }, "")).toHaveLength(1500);
  });
});
