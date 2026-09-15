import { describe, expect, it } from "vitest";
import {
  AREAS,
  MISSIONS,
  SCORED_QUESTIONS,
  isComplete,
  nextAction,
  scoreArea,
  scoreDiagnosis,
  type AreaId,
} from "./diagnosis";

// Pick the option index whose value matches a target (strongest = 0 by
// convention, weakest = last), so tests don't hard-code indices.
function pick(qid: string, want: "best" | "worst"): number {
  const q = SCORED_QUESTIONS.find((x) => x.id === qid)!;
  let idx = 0;
  for (let i = 1; i < q.options.length; i++) {
    const better = q.options[i].value > q.options[idx].value;
    const worse = q.options[i].value < q.options[idx].value;
    if (want === "best" && better) idx = i;
    if (want === "worst" && worse) idx = i;
  }
  return idx;
}

function answerAll(want: "best" | "worst"): Record<string, number> {
  const a: Record<string, number> = {};
  for (const q of SCORED_QUESTIONS) a[q.id] = pick(q.id, want);
  return a;
}

describe("scoreArea", () => {
  it("returns null when an area has no answers", () => {
    expect(scoreArea("ideas", {})).toBeNull();
  });

  it("averages answered questions in the area to 0..100", () => {
    // Both ideas questions answered 'best' -> 100.
    const best = answerAll("best");
    expect(scoreArea("ideas", best)).toBe(100);
    const worst = answerAll("worst");
    expect(scoreArea("ideas", worst)).toBeLessThan(30);
  });
});

describe("scoreDiagnosis", () => {
  it("all-best answers score high and leave no weak area", () => {
    const r = scoreDiagnosis(answerAll("best"));
    expect(r.overall).toBe(100);
    expect(r.levelLabel).toBe("In flow");
    expect(r.areas).toHaveLength(AREAS.length);
    expect(r.weaknesses[0].score).toBeGreaterThanOrEqual(75);
  });

  it("all-worst answers score low", () => {
    const r = scoreDiagnosis(answerAll("worst"));
    expect(r.overall).toBeLessThan(40);
    expect(r.levelLabel).toBe("Getting started");
  });

  it("orders weaknesses ascending and strengths descending", () => {
    const a = answerAll("best");
    // Knock camera down to the floor.
    a["camera-feel"] = pick("camera-feel", "worst");
    a["camera-cringe"] = pick("camera-cringe", "worst");
    const r = scoreDiagnosis(a);
    expect(r.weaknesses[0].id).toBe("camera");
    expect(r.strengths[0].score).toBeGreaterThanOrEqual(r.weaknesses[0].score);
  });

  it("scores only the areas that were answered", () => {
    const partial = { "ideas-ready": pick("ideas-ready", "best") };
    const r = scoreDiagnosis(partial);
    expect(r.areas).toHaveLength(1);
    expect(r.areas[0].id).toBe("ideas");
  });
});

describe("isComplete", () => {
  it("is false until every scored question is answered", () => {
    expect(isComplete({})).toBe(false);
    const all = answerAll("best");
    expect(isComplete(all)).toBe(true);
    delete all[SCORED_QUESTIONS[0].id];
    expect(isComplete(all)).toBe(false);
  });
});

describe("nextAction", () => {
  it("asks for a diagnosis when there is none", () => {
    expect(nextAction(null).kind).toBe("diagnose");
    expect(nextAction(scoreDiagnosis({})).kind).toBe("diagnose");
  });

  it("targets the weakest area with its mission", () => {
    const a = answerAll("best");
    a["conversion-track"] = pick("conversion-track", "worst");
    a["conversion-cta"] = pick("conversion-cta", "worst");
    const action = nextAction(scoreDiagnosis(a));
    expect(action.kind).toBe("mission");
    expect(action.mission?.area).toBe("conversion");
    expect(action.area?.id).toBe("conversion");
  });

  it("switches to maintain when even the weakest area is strong", () => {
    expect(nextAction(scoreDiagnosis(answerAll("best"))).kind).toBe("maintain");
  });
});

describe("MISSIONS", () => {
  it("has one mission per area, each with a route", () => {
    for (const area of AREAS) {
      const m = MISSIONS[area.id as AreaId];
      expect(m).toBeDefined();
      expect(m.area).toBe(area.id);
      expect(m.to.startsWith("/")).toBe(true);
      expect(m.title.length).toBeGreaterThan(0);
    }
  });
});
