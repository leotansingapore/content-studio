// The campaign wizard's step 1 rows (live-p5w3 D3: /campaigns/new on ActivityTracker showed the seeded main audience's
// name twice, as the name and again as the line under it, because a seed's who is its name).
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import WhoStep from "./WhoStep";
import { seedAudience, type Audience } from "@/lib/audiences";

const html = (audiences: Audience[]) =>
  renderToStaticMarkup(createElement(MemoryRouter, null, createElement(WhoStep, { audiences, picked: null, onPick: () => {} })));
const count = (s: string, part: string) => s.split(part).length - 1;
const now = new Date("2026-10-22T08:00:00Z");

describe("WhoStep", () => {
  it("shows a seeded audience's name once (ActivityTracker's seed: who is its name)", () => {
    const seed = seedAudience({ audience: "working-adult", audienceDetail: "Sales-oriented self-employed professionals and coaches" }, now);
    expect(count(html([seed]), "Sales-oriented self-employed professionals and coaches")).toBe(1);
    // a detail past 60 characters: the name is cut from who, so who would repeat it too
    const cut = seedAudience({ audience: "working-adult", audienceDetail: "Auditor / Accountant, aged 30-48, Middle to upper-middle income" }, now);
    expect(count(html([cut]), "Auditor / Accountant, aged 30-48")).toBe(1);
  });

  it("keeps the line under the name when it says something else", () => {
    const sales: Audience = { id: "au-1", name: "Sales representatives", who: "Sales reps who track calls, deals, follow-ups and weekly goals.", lifeStage: "general", cares: [], source: "you", createdAt: "" };
    const out = html([sales, { ...sales, id: "au-2", name: "Par", who: "Parents in HDB flats" }]);
    expect(out).toContain(">Sales representatives<");
    expect(out).toContain(">Sales reps who track calls, deals, follow-ups and weekly goals.<");
    expect(out).toContain(">Parents in HDB flats<");
  });
});
