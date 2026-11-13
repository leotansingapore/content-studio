import { describe, expect, it } from "vitest";
import { MAX_CANDIDATES, SHOWN, pickAsk, pickBody, ranked } from "./logic.ts";

const c = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `f-${i}`, line: `Format ${i}: what it shows` }));

describe("make-pick", () => {
  it("reads a message and 2 to 40 formats, dropping bad ids, blanks and repeats", () => {
    expect(pickBody({ message: "  a static ad  about follow-ups ", candidates: c(3) })).toMatchObject({ message: "a static ad about follow-ups", brand: { sells: "", serves: "" } });
    expect(pickBody({ message: "x", candidates: [...c(1), { id: "Bad Id", line: "y" }, { id: "f-0", line: "again" }, { id: "f-9", line: " " }] })).toBeNull();
    expect(pickBody({ message: "", candidates: c(3) })).toBeNull();
    expect(pickBody({ message: "x", candidates: c(60) })!.candidates).toHaveLength(MAX_CANDIDATES);
  });

  it("asks one choice over the formats with the brand in the state", () => {
    const ask = pickAsk(pickBody({ message: "make an ad", brand: { sells: "Kueh", serves: "Office workers" }, candidates: c(2) })!);
    expect(ask.state).toEqual({ message: "make an ad", sells: "Kueh", serves: "Office workers" });
    expect(ask.questions.format).toMatchObject({ type: "choice", criteria: { f1: "Format 0: what it shows", f2: "Format 1: what it shows" } });
  });

  it("ranks by Jev's probabilities, its pick first, at most four, and nothing without an answer", () => {
    const b = pickBody({ message: "make an ad", candidates: c(6) })!;
    expect(ranked({ format: { type: "choice", choice: "f3", probabilities: { f1: 0.1, f2: 0.3, f3: 0.25, f4: 0.2, f5: 0.1, f6: 0.05 } } }, b)).toEqual(["f-2", "f-1", "f-3", "f-0"]);
    expect(ranked({ format: { type: "choice", choice: "f9" } }, b)).toBeNull();
    expect(ranked(null, b)).toBeNull();
    expect(ranked({ format: { type: "choice", choice: "f2" } }, b)).toEqual(["f-1"]);
    expect(SHOWN).toBe(4);
  });
});
