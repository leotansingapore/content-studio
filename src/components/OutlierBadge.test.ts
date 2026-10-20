// The badge rendered to markup in node: every state's words, ASCII only, green from 1.5x up and a flame from 3x.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import OutlierBadge from "./OutlierBadge";
import { rankOf, tierOf, type Outlier } from "../../supabase/functions/_shared/outlier.ts";

const scored = (ratio: number, confidence: "high" | "low" = "high"): Outlier => ({
  ratio, tier: tierOf(ratio), basis: "views", baseline: 1000, posts: confidence === "high" ? 19 : 3, confidence, reason: null, rank: rankOf(ratio, 1000),
});
const unscored = (reason: Outlier["reason"]): Outlier => ({ ratio: null, tier: null, basis: "views", baseline: null, posts: 2, confidence: null, reason, rank: -1 });
const html = (outlier: Outlier, whose?: "their" | "your") => renderToStaticMarkup(createElement(OutlierBadge, { outlier, whose }));
const text = (markup: string) => markup.replace(/<[^>]+>/g, "");

describe("OutlierBadge", () => {
  it("says each state in ASCII", () => {
    const cases: [Outlier, string][] = [
      [scored(14.6), "15x their usual"],
      [scored(3.24), "3.2x their usual"],
      [scored(1.6), "1.6x their usual"],
      [scored(1), "About their usual"],
      [scored(0.3), "Below their usual"],
      [unscored("young"), "Too new to judge"],
      [unscored("few-posts"), "Not enough posts to judge"],
      [unscored("no-numbers"), "Not enough posts to judge"],
      [scored(3.24, "low"), "3.2x their usual (few posts)"],
    ];
    for (const [o, words] of cases) {
      const markup = html(o);
      expect(text(markup)).toBe(words);
      expect(markup).toMatch(/^[\x20-\x7e]*$/);
    }
  });

  it("says your on your own posts", () => {
    expect(text(html(scored(3.24), "your"))).toBe("3.2x your usual");
    expect(text(html(scored(0.3), "your"))).toBe("Below your usual");
  });

  it("is green from 1.5x and carries a flame from 3x", () => {
    const look = (o: Outlier) => ({ green: html(o).includes("bg-success/10"), flame: html(o).includes("<svg") });
    expect(look(scored(10))).toEqual({ green: true, flame: true });
    expect(look(scored(3))).toEqual({ green: true, flame: true });
    expect(look(scored(1.5))).toEqual({ green: true, flame: false });
    expect(look(scored(1.49))).toEqual({ green: false, flame: false });
    expect(look(unscored("young"))).toEqual({ green: false, flame: false });
  });
});
