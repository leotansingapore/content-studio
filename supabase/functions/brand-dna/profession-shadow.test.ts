import { describe, expect, it } from "vitest";
import sites from "./fixtures/profession-sites.json";
import { report, rowOf, runnerUp } from "./profession-shadow";
import { professionAsk } from "./profession";

const said = (profession: string, probabilities: Record<string, number>, audience = "general") => ({
  profession: { type: "choice" as const, choice: profession, probabilities },
  audience: { type: "choice" as const, choice: audience },
});

describe("the profession shadow run", () => {
  it("labels every site with one of the pick's own options", () => {
    const keys = Object.keys(professionAsk.criteria);
    expect(sites.length).toBeGreaterThanOrEqual(20);
    for (const s of sites) expect(keys).toContain(s.expect);
    expect(new Set(sites.map((s) => s.url)).size).toBe(sites.length);
  });

  it("reads each answer into a row: the pick, its p, the next best and the prefill", () => {
    const row = rowOf({ url: "propnex.com", expect: "realtor" }, "written", "Property agents", said("realtor", { realtor: 0.82, consultant: 0.1, other: 0.08 }));
    expect(row).toMatchObject({ key: "realtor", p: 0.82, second: "consultant 0.10", prefill: "Real estate agent", audience: "general" });
    expect(runnerUp(null, null)).toBe("-");
    expect(rowOf({ url: "x.sg", expect: "other" }, "none", "", null, "didn't open")).toMatchObject({ key: null, prefill: "", error: "didn't open" });
  });

  it("puts wrong prefills and near cuts first, and lists every site", () => {
    const rows = [
      rowOf({ url: "a.sg", expect: "lawyer" }, "written", "Law firm", said("lawyer", { lawyer: 0.9 })),
      rowOf({ url: "b.sg", expect: "other" }, "description", "A shop", said("consultant", { consultant: 0.7 })),
      rowOf({ url: "c.sg", expect: "coach" }, "written", "Coaching", said("coach", { coach: 0.5 })),
      rowOf({ url: "d.sg", expect: "adviser" }, "none", "", null, "didn't open"),
    ];
    const text = report(rows);
    expect(text).toContain("4 sites, 3 answered by Jev. Jev's pick matches the label on 2 of 3.");
    expect(text).toContain("2 would prefill the work step, 1 of them wrong. 1 right picks fall under the cut.");
    expect(text).toContain('- b.sg: label other, would prefill "Consultant" (consultant 0.70, next -)');
    expect(text).toContain("- c.sg: coach 0.50, label coach");
    expect(text).toContain("| d.sg | adviser | - ? | - | - | none: didn't open |");
  });
});
