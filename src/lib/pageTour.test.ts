import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CAMPAIGN_TOUR, DESIGN_TOUR, finishPageTour, pageTourDone } from "@/lib/pageTour";

describe("page tours", () => {
  beforeEach(() => {
    const m = new Map<string, string>();
    vi.stubGlobal("localStorage", { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) });
  });

  it("shows until finished, then stays finished for that person only", () => {
    expect(pageTourDone("u1", "design-editor")).toBe(false);
    finishPageTour("u1", "design-editor");
    expect(pageTourDone("u1", "design-editor")).toBe(true);
    expect(pageTourDone("u1", "campaign")).toBe(false);
    expect(pageTourDone("u2", "design-editor")).toBe(false);
  });

  it("points every step at a target its page has", () => {
    for (const [page, steps] of [["src/pages/DesignEditorPage.tsx", DESIGN_TOUR], ["src/pages/SlideCampaignPage.tsx", CAMPAIGN_TOUR]] as const) {
      const src = readFileSync(page, "utf8");
      for (const s of steps) expect(src, `${page} ${s.target}`).toContain(`data-tour="${s.target}"`);
    }
  });
});
