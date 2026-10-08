import { describe, expect, it } from "vitest";
import { composeChecks, measure, SPREAD_MIN } from "@/lib/humanCheck";

const even = "I plan my week on Sunday night. I check every renewal date twice. I call each client before the due date. I write notes after every single meeting.";
const varied = "Sundays used to be for renewals. Six hours of it. Laptop on the kitchen table while the kids kept asking when I would finally be done. Not any more. Now Thursday afternoon is for renewals.";

describe("measure", () => {
  it("measures the spread of sentence lengths, null under four sentences", () => {
    expect(measure(even).spread).toBeLessThan(SPREAD_MIN);
    expect(measure(varied).spread).toBeGreaterThanOrEqual(SPREAD_MIN);
    expect(measure("One short line here. And another one here.").spread).toBeNull();
  });

  it("counts stock words and typography from Clean AI tells' list", () => {
    const m = measure("A robust plan — it’s crucial. Moreover, it’s seamless.");
    expect(m.words).toEqual(["robust", "seamless", "crucial", "moreover"]);
    expect(m.typography).toBe(3);
  });
});

describe("composeChecks", () => {
  const clean = { spread: 0.5, words: [], typography: 0 };
  const judged = { aiSounding: false, specific: true, voiceMatch: null, shapes: [] };

  it("passes all five on a clean, human, specific draft", () => {
    const r = composeChecks(clean, judged);
    expect(r.checks.map((c) => c.id)).toEqual(["voice", "specifics", "variety", "stock", "typography"]);
    expect(r).toMatchObject({ passed: 5, counted: 5, fixFirst: null, skipped: null });
  });

  it("names the judged failure first, ahead of the one-tap ones", () => {
    const r = composeChecks({ spread: 0.1, words: ["robust", "robust"], typography: 2 }, { ...judged, specific: false });
    expect(r.passed).toBe(1);
    expect(r.fixFirst).toBe("specifics");
    expect(r.checks.find((c) => c.id === "stock")?.note).toBe("robust");
  });

  it("fails voice when it reads as AI, or when it doesn't sound like the saved posts", () => {
    expect(composeChecks(clean, { ...judged, aiSounding: true }).fixFirst).toBe("voice");
    const unlike = composeChecks(clean, { ...judged, voiceMatch: false });
    expect(unlike.fixFirst).toBe("voice");
    expect(unlike.checks[0].note).toBe("Doesn't sound like your saved posts");
  });

  it("still shows the measured checks without Jev, the judged ones not counted", () => {
    const r = composeChecks({ ...clean, typography: 1 }, null, "Unavailable.");
    expect(r.checks.slice(0, 2).map((c) => c.state)).toEqual(["skip", "skip"]);
    expect(r).toMatchObject({ passed: 2, counted: 3, fixFirst: "typography", skipped: "Unavailable." });
  });

  it("does not count variety on a draft too short to judge", () => {
    expect(composeChecks({ ...clean, spread: null }, judged)).toMatchObject({ passed: 4, counted: 4 });
  });
});
