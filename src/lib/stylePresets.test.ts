import { describe, expect, it } from "vitest";
import { PRESETS, RECIPE_KEYS, applyRecipe, isRecipe, needsKeyLines } from "./stylePresets";
import { STYLES, applyPatch, defaultSettings, keepSegments, totalLength, type Word } from "./videoEdit";

// five different sentences of 8 words, a 0.5 s pause between them
const words: Word[] = Array.from({ length: 40 }, (_, i) => {
  const s = i * 0.5 + Math.floor(i / 8) * 0.4;
  return { w: i % 8 === 7 ? `end${i}.` : `word${i}`, s, e: s + 0.4 };
});

describe("ready-made styles", () => {
  it("6 to 8 of them, each setting look and pace with values the editor accepts", () => {
    expect(PRESETS.length).toBeGreaterThanOrEqual(6);
    expect(PRESETS.length).toBeLessThanOrEqual(8);
    expect(new Set(PRESETS.map((p) => p.id)).size).toBe(PRESETS.length);
    for (const p of PRESETS) {
      const s = applyRecipe(defaultSettings(), p.recipe);
      // whatever the vibe editor's checks keep is what a preset may set
      const { next } = applyPatch(s, s as unknown as Record<string, unknown>);
      expect(next, p.id).toEqual(s);
      expect(p.recipe.maxPause, p.id).toBeGreaterThan(0);
      expect(p.recipe.speed, p.id).toBeGreaterThanOrEqual(1);
      expect(p.about.length, p.id).toBeLessThanOrEqual(90);
    }
  });
  it("sets every recipe key and clears the ones it leaves out", () => {
    const busy = { ...defaultSettings("minimal"), captionBox: "pill" as const, transition: "flash" as const, filter: "vivid" as const, brollLayout: "side" as const, font: "serif" as const };
    const punchy = PRESETS.find((p) => p.id === "punchy")!;
    const s = applyRecipe(busy, punchy.recipe);
    expect(s.style).toBe("bold");
    expect([s.captionBox, s.transition, s.filter, s.brollLayout, s.font]).toEqual([undefined, undefined, undefined, undefined, undefined]);
    expect(s.speed).toBe(1.1);
    expect(isRecipe(s, punchy.recipe)).toBe(true);
    expect(isRecipe(s, PRESETS.find((p) => p.id === "calm")!.recipe)).toBe(false);
    // the same caption style, a different pace
    expect(isRecipe(s, PRESETS.find((p) => p.id === "numbers")!.recipe)).toBe(false);
    // a new style brings its own colours
    expect([s.baseColor, s.activeColor]).toEqual([STYLES.bold.base, STYLES.bold.active]);
    // and touches nothing about this video
    expect({ ...s, ...Object.fromEntries(RECIPE_KEYS.map((k) => [k, busy[k]])), baseColor: busy.baseColor, activeColor: busy.activeColor, position: busy.position }).toEqual(busy);
  });
  it("the pace changes the cut: a tighter pause limit keeps less", () => {
    const tight = applyRecipe(defaultSettings(), PRESETS.find((p) => p.id === "punchy")!.recipe);
    const loose = applyRecipe(defaultSettings(), PRESETS.find((p) => p.id === "podcast")!.recipe);
    expect(totalLength(keepSegments(words, 21, tight))).toBeLessThan(totalLength(keepSegments(words, 21, loose)));
  });
  it("asks for key lines only when zooms or pop-ups have none to work on", () => {
    const golden = PRESETS.find((p) => p.id === "golden")!.recipe;
    const podcast = PRESETS.find((p) => p.id === "podcast")!.recipe;
    expect(needsKeyLines(defaultSettings(), golden)).toBe(true);
    expect(needsKeyLines(defaultSettings(), podcast)).toBe(false);
    expect(needsKeyLines(defaultSettings(), PRESETS.find((p) => p.id === "calm")!.recipe)).toBe(true);
    expect(needsKeyLines({ ...defaultSettings(), motion: { lines: [{ s: 1, e: 2, p: 0.8 }] } }, golden)).toBe(true);
    expect(needsKeyLines({ ...defaultSettings(), motion: { lines: [{ s: 1, e: 2, p: 0.8, pop: { text: "Hi", key: "hi", emoji: "x" } }] } }, golden)).toBe(false);
  });
});
