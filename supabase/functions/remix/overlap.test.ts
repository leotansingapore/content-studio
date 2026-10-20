import { describe, expect, it } from "vitest";
import { numbersIn, reusedItems, sharedRuns } from "./overlap";

describe("sharedRuns", () => {
  const source = "Most people in Singapore never check their CPF statement until it is too late. #cpf @mrbrown";

  it("finds a 6-word run and ignores a 5-word one", () => {
    expect(sharedRuns("Honestly, never check their CPF statement until retirement.", source)).toEqual(["never check their CPF statement until"]);
    expect(sharedRuns("They never check their CPF statement, ever.", source)).toEqual([]);
  });

  it("ignores case and punctuation", () => {
    expect(sharedRuns("MOST PEOPLE, in singapore! never check their stuff", source)).toEqual(["MOST PEOPLE in singapore never check their"]);
  });

  it("skips hashtags and handles, so they never make or join a run", () => {
    expect(sharedRuns("#cpf @mrbrown is too late #cpf @mrbrown", source)).toEqual([]);
    expect(sharedRuns("until it #tag is too late now", "until it is too late now")).toEqual(["until it is too late now"]);
  });

  it("returns each run once, longest first", () => {
    const b = "one two three four five six. alpha beta gamma delta epsilon zeta eta theta";
    const a = "alpha beta gamma delta epsilon zeta eta theta and one two three four five six and one two three four five six";
    expect(sharedRuns(a, b)).toEqual(["alpha beta gamma delta epsilon zeta eta theta", "one two three four five six"]);
  });

  it("honours a lower floor", () => {
    expect(sharedRuns("you might not realise it", "You might not realise this", 4)).toEqual(["you might not realise"]);
  });
});

describe("reusedItems", () => {
  it("matches a figure with and without separators", () => {
    for (const text of ["You could save $12,000 a year.", "That's 12,000 saved.", "Imagine 12000 more.", "S$12,000 back"]) {
      expect(reusedItems(text, ["$12,000"]), text).toEqual(["$12,000"]);
    }
    expect(reusedItems("That's 1,200 saved.", ["$12,000"])).toEqual([]);
    expect(reusedItems("about 12000", ["S$12,000"])).toEqual(["S$12,000"]);
  });

  it("counts a small amount or percent only when it comes back with its unit", () => {
    const items = numbersIn("Just $5 a day. Save 4% of pay.");
    expect(items).toEqual(["$5", "4%"]);
    expect(reusedItems("5 ways in 4 steps", items)).toEqual([]);
    expect(reusedItems("My 10 tips", ["10%"])).toEqual([]);
    expect(reusedItems("Only S$5 a day, about 4 percent", items)).toEqual(["$5", "4%"]);
    expect(reusedItems("SGD 5 and 4 %", items)).toEqual(["$5", "4%"]);
    expect(reusedItems("$50, $5.50, $5,000 and 14%", items)).toEqual([]);
  });

  it("matches names case-insensitively, as whole words", () => {
    expect(reusedItems("Ask about singlife today", ["Singlife", "AIA"])).toEqual(["Singlife"]);
    expect(reusedItems("Saying hi to aiad", ["AIA"])).toEqual([]);
  });
});

describe("numbersIn", () => {
  it("keeps money, percentages and big figures, not small counts or years", () => {
    expect(numbersIn("5 signs: save $12,000 by 2030, earn 4.5% or get 300 back. SGD 50 too, and 1,000.")).toEqual([
      "$12,000",
      "4.5%",
      "300",
      "SGD 50",
      "1,000",
    ]);
  });
});
