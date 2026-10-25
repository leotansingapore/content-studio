import { afterEach, describe, expect, it, vi } from "vitest";
import { drawFilm, filmColors, type FilmAssets } from "./draw";
import { goodFilm } from "./fixtures";
import { filmLength, type Film } from "./timeline";

/** A 2D context that records every call and every property it is given; text is 0.55 em a letter. */
function recorder() {
  const calls: unknown[][] = [];
  const state: Record<string, unknown> = { font: "10px sans-serif" };
  const g = new Proxy({} as Record<string, unknown>, {
    get(_, k: string) {
      if (k === "measureText") {
        return (s: string) => {
          const size = Number(/(\d+(?:\.\d+)?)px/.exec(String(state.font))?.[1] ?? 10);
          calls.push(["measureText", s]);
          return { width: s.length * size * 0.55 };
        };
      }
      if (k === "createRadialGradient" || k === "createLinearGradient") {
        return (...a: unknown[]) => {
          calls.push([k, ...a]);
          return { addColorStop: (...b: unknown[]) => calls.push(["addColorStop", ...b]) };
        };
      }
      if (k in state) return state[k];
      return (...a: unknown[]) => void calls.push([k, ...a]);
    },
    set(_, k: string, v) {
      state[k] = v;
      calls.push(["set", k, v]);
      return true;
    },
  });
  return { g: g as unknown as CanvasRenderingContext2D, calls };
}

const pic = (width: number, height: number) => ({ source: { pic: `${width}x${height}` } as unknown as CanvasImageSource, width, height });
const assets: FilmAssets = { colors: { brand: "#2563EB", palette: { coral: "#F97361" } }, name: "Activity Tracker", logo: pic(600, 200), screens: { "cimg-app1": pic(1170, 2532), "cimg-app2": pic(1170, 2532) } };
const SIZE = { w: 1080, h: 1920 };

/** Hook, then the cards from 4 s, then the end: card 2 lands at 5.5 s. */
const cardsFilm = (): Film => {
  const f = goodFilm();
  return { ...f, scenes: [f.scenes[0], f.scenes.find((s) => s.id === "features")!, f.scenes[f.scenes.length - 1]] };
};

afterEach(() => vi.restoreAllMocks());

describe("drawFilm", () => {
  it("makes the same calls when it draws the same t twice", () => {
    for (const t of [0, 3.3, 7.2, 11.25, 16.8, 21.4, 27]) {
      const a = recorder(), b = recorder();
      drawFilm(a.g, goodFilm(), assets, t, SIZE);
      drawFilm(b.g, goodFilm(), assets, t, SIZE);
      expect(a.calls.length).toBeGreaterThan(10);
      expect(JSON.stringify(b.calls)).toBe(JSON.stringify(a.calls));
    }
  });

  it("marks the second card's title at 7.2 s", () => {
    const marks = drawFilm(recorder().g, cardsFilm(), assets, 7.2, SIZE);
    const title = marks.find((m) => m.id === "features.card2.title");
    expect(title).toMatchObject({ label: "Card 2 title", scene: "features" });
    expect(title!.w).toBeGreaterThan(0);
    expect(title!.y).toBeGreaterThan(210);
    // the third card has landed too; at 5 s only the first had
    expect(marks.map((m) => m.id)).toContain("features.card3.title");
    expect(drawFilm(recorder().g, cardsFilm(), assets, 5, SIZE).map((m) => m.id)).not.toContain("features.card2.title");
  });

  it("draws the cards' titles at one size and their lines at one size", () => {
    const { g, calls } = recorder();
    drawFilm(g, cardsFilm(), assets, 9.9, { w: 1920, h: 1080 });
    // a line may wrap, so its first drawn row starts with its first word
    const fontBefore = (text: string) => {
      const at = calls.findIndex((c) => c[0] === "fillText" && (c[1] === text || String(c[1]).startsWith(`${text.split(" ")[0]} `)));
      expect(at).toBeGreaterThan(0);
      return calls.slice(0, at).filter((c) => c[0] === "set" && c[1] === "font").pop()![2];
    };
    const cards = cardsFilm().scenes.find((s) => s.kind === "cards") as Extract<Film["scenes"][number], { kind: "cards" }>;
    expect(new Set(cards.cards.map((c) => fontBefore(c.title))).size).toBe(1);
    expect(new Set(["Ticks off as you go.", "One page for the month."].map(fontBefore)).size).toBe(1);
  });

  it("draws every scene with the clock and random replaced by throwing stubs", () => {
    const boom = () => {
      throw new Error("clock or random read while drawing");
    };
    vi.spyOn(Date, "now").mockImplementation(boom);
    vi.spyOn(performance, "now").mockImplementation(boom);
    vi.spyOn(Math, "random").mockImplementation(boom);
    const film = goodFilm();
    const seen = new Set<string>();
    for (let t = 0; t < filmLength(film); t += 1 / 3) {
      for (const m of drawFilm(recorder().g, film, assets, t, SIZE)) seen.add(m.id);
    }
    for (const id of ["hook.word1", "hook.word3", "app.screen", "app.highlight", "app.highlight.label", "burst.shot8", "burst.word8", "features.card1.icon", "features.card3.line", "proof.value", "proof.label", "end.logo", "end.line", "end.cta"]) expect(seen).toContain(id);
  });

  it("shows the first word on frame 0, already in place", () => {
    const { g, calls } = recorder();
    const marks = drawFilm(g, goodFilm(), assets, 0, SIZE);
    expect(marks.map((m) => m.id)).toEqual(["hook.word1"]);
    const at = calls.findIndex((c) => c[0] === "fillText" && c[1] === "Your week.");
    expect(at).toBeGreaterThan(0);
    // fully opaque and at full size, not caught at the start of its entrance
    const alpha = calls.slice(0, at).filter((c) => c[0] === "set" && c[1] === "globalAlpha").pop();
    expect(alpha).toEqual(["set", "globalAlpha", 1]);
    expect(calls.slice(0, at).some((c) => c[0] === "scale")).toBe(false);
  });

  it("draws the real logo file, and the brand name when there is none", () => {
    const end = filmLength(goodFilm()) - 1;
    const withLogo = recorder();
    drawFilm(withLogo.g, goodFilm(), assets, end, SIZE);
    expect(withLogo.calls.some((c) => c[0] === "drawImage" && c[1] === assets.logo!.source)).toBe(true);
    const named = recorder();
    drawFilm(named.g, goodFilm(), { ...assets, logo: undefined }, end, SIZE);
    expect(named.calls).toContainEqual(["fillText", "Activity Tracker", 0, 0]);
  });

  it("draws a screen that isn't on this device as a plain card in the brand colour", () => {
    const { g, calls } = recorder();
    drawFilm(g, goodFilm(), { ...assets, screens: {} }, 5, SIZE);
    expect(calls.some((c) => c[0] === "drawImage")).toBe(false);
    expect(calls).toContainEqual(["set", "fillStyle", "#2563EB"]);
  });

  it("falls back to ink for a brand ground with poor contrast, and picks readable text", () => {
    expect(filmColors({ ground: "brand", accent: "brand" }, { brand: "#777777" }).ground).toBe("#1C1917");
    expect(filmColors({ ground: "brand", accent: "brand" }, { brand: "#1D4ED8" })).toMatchObject({ ground: "#1D4ED8", text: "#FFFFFF" });
    expect(filmColors({ ground: "paper", accent: "palette:wine" }, { brand: "#2563EB", palette: { wine: "#9F1239" } })).toMatchObject({ text: "#1C1917", accent: "#9F1239" });
    // coral is too faint on paper to read, so the accent falls back to the text colour
    expect(filmColors({ ground: "paper", accent: "palette:coral" }, assets.colors).accent).toBe("#1C1917");
  });
});
