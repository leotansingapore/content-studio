import { describe, expect, it } from "vitest";
import {
  agentPrompt,
  applyFilters,
  countNiches,
  filtersFrom,
  formatLines,
  missingTable,
  nicheLabel,
  saveRate,
  saveRateLabel,
  slideUrl,
  type WorkingQuery,
  type WorkingRow,
} from "./workingLibrary";

/** Records every builder call, so a test reads the query the filters make. */
class Recorder implements WorkingQuery<Recorder> {
  calls: [string, ...unknown[]][] = [];
  private add(...c: [string, ...unknown[]]) {
    this.calls.push(c);
    return this;
  }
  eq(c: string, v: string) { return this.add("eq", c, v); }
  like(c: string, p: string) { return this.add("like", c, p); }
  order(c: string, o: { ascending: boolean; nullsFirst?: boolean }) { return this.add("order", c, o); }
}
const query = (qs: string) => applyFilters(new Recorder(), filtersFrom(new URLSearchParams(qs))).calls;

const row = (over: Partial<WorkingRow> = {}): WorkingRow => ({
  id: "7412345678901234567", url: "https://www.tiktok.com/@jane.doe/photo/7412345678901234567", author: "jane.doe", niche: "nutrition",
  format: "classic text", slides: 6, ratio: 12.34, views: 120_000, saves: 4_200, working_now: true, followers: 9_800,
  hook: "list", hook_text: "5 foods  I\nnever skip", structure: "one item per slide", caption: "Eat this #food", summary: "Five foods a dietitian eats every week.",
  slide_text: [], likes: 9_000, shares: 300, posted_at: "2026-10-01T00:00:00Z", ...over,
});

describe("filters from the address", () => {
  it("defaults to working now: working_now first, then the biggest multiple, nulls last, then the id", () => {
    expect(query("")).toEqual([
      ["order", "working_now", { ascending: false }],
      ["order", "ratio", { ascending: false, nullsFirst: false }],
      ["order", "id", { ascending: true }],
    ]);
  });

  it("sorts by views or saves, searches the lower-cased search column with like and its wildcards escaped, and filters the niche", () => {
    expect(query("sort=views&niche=ai_tools&q=50%25 off_ME")).toEqual([
      ["like", "search", "%50\\% off\\_me%"],
      ["eq", "niche", "ai_tools"],
      ["order", "views", { ascending: false }],
      ["order", "id", { ascending: true }],
    ]);
    expect(query("sort=saves")).toEqual([["order", "saves", { ascending: false }], ["order", "id", { ascending: true }]]);
  });

  it("ignores a sort or niche that isn't one, and caps the search", () => {
    expect(filtersFrom(new URLSearchParams("sort=nope&niche=Food%20%26%20nutrition"))).toEqual({ q: "", niche: "", sort: "working" });
    expect(filtersFrom(new URLSearchParams(`q=${"a".repeat(300)}`)).q).toHaveLength(100);
  });
});

describe("niche names", () => {
  it("capitalises the first word only, keeps and lower case, and writes AI tools", () => {
    expect(nicheLabel("ai_tools")).toBe("AI tools");
    expect(nicheLabel("nutrition")).toBe("Food and nutrition");
    expect(nicheLabel("creative")).toBe("Photography and design");
    expect(nicheLabel("business")).toBe("Business");
    expect(nicheLabel("home_and_garden")).toBe("Home and garden");
    expect(nicheLabel("mental_health")).toBe("Mental health");
  });

  it("falls back to the slug with underscores as spaces when it isn't a slug", () => {
    expect(nicheLabel("Weird_Slug-2")).toBe("Weird Slug-2");
  });

  it("counts each niche, most first, then by name", () => {
    expect(countNiches([{ niche: "sleep" }, { niche: "fitness" }, { niche: "ai_tools" }, { niche: "fitness" }])).toEqual([
      { niche: "fitness", count: 2 },
      { niche: "ai_tools", count: 1 },
      { niche: "sleep", count: 1 },
    ]);
  });
});

describe("numbers and addresses", () => {
  it("gives the save rate as saves per view, and nothing with no views", () => {
    expect(saveRate(34, 1000)).toBeCloseTo(0.034);
    expect(saveRateLabel(34, 1000)).toBe("3.4%");
    expect(saveRate(5, 0)).toBeNull();
    expect(saveRateLabel(5, 0)).toBe("");
  });

  it("reads a missing table as an empty library, not an error", () => {
    expect(missingTable({ code: "PGRST205" })).toBe(true);
    expect(missingTable({ code: "42P01" })).toBe(true);
    expect(missingTable({ code: "42501" })).toBe(false);
    expect(missingTable(null)).toBe(false);
  });

  it("builds a slide's public address in cs-working", () => {
    expect(slideUrl("7412345678901234567", 3)).toMatch(/\/storage\/v1\/object\/public\/cs-working\/7412345678901234567\/3\.webp$/);
  });
});

describe("the agent prompt", () => {
  it("describes the format: slide count, hook, structure, summary, the proof and the original", () => {
    const p = agentPrompt(row());
    expect(p).toContain('A 6-slide TikTok photo slideshow (classic text) in Food and nutrition.');
    expect(p).toContain('Hook: list, the cover reads "5 foods I never skip".');
    expect(p).toContain("Structure: one item per slide.");
    expect(p).toContain("What it says: Five foods a dietitian eats every week.");
    expect(p).toContain("It got 12.3x @jane.doe's usual views (120K views, 3.5% saved).");
    expect(p).toContain("Original: https://www.tiktok.com/@jane.doe/photo/7412345678901234567");
    expect(p).toContain("the 6 slides");
    expect(p).toMatch(/^[\x20-\x7E\n]+$/);
  });

  it("leaves out what the row doesn't have, and never carries the slides' words", () => {
    const p = agentPrompt(row({ hook: null, hook_text: "", structure: null, summary: "", format: null, ratio: null, views: 0, slide_text: ["secret words"] }));
    expect(p).not.toMatch(/Hook:|Structure:|What it says:|saved|secret words/);
    expect(p).toContain("A 6-slide TikTok photo slideshow in Food and nutrition.");
    expect(p).toContain("It got 0 views.");
    expect(formatLines(row({ hook: null }))[1]).toBe('Hook: the cover reads "5 foods I never skip".');
  });
});
