import { describe, expect, it } from "vitest";
import { CARD, STACK_MOVE, STACK_SHOW, cardPose, notifyPose, stackLines, stackPlace, stackSettings, stackTimes, wordSize } from "./notifyStack";
import { BLOCK_W, overlayHit, sanitizeOverlays, type Overlay } from "./videoEdit";

// every character 0.55 em wide, so a font's px decides the width
const measure = (text: string, css: string) => text.length * 0.55 * Number(css.match(/([\d.]+)px/)![1]);
const { lag, enter, push } = STACK_MOVE;

describe("stackTimes", () => {
  it("spaces the cards evenly, lands the word one gap after the last card and holds it before the end", () => {
    expect(stackTimes(2)).toEqual({ cards: [0.6, 2.1], word: 3.6, total: 6.1 });
    expect(stackTimes(6)).toEqual({ cards: [0.6, 2.1, 3.6, 5.1, 6.6, 8.1], word: 9.6, total: 12.1 });
    expect(stackTimes(9).cards).toHaveLength(6);
  });
});

describe("cardPose", () => {
  const starts = stackTimes(6).cards;
  const at = (i: number, t: number) => cardPose(starts, i, t);

  it("keeps a card hidden until 0.12 s after its push starts, then drops it in at the top slot", () => {
    expect(at(0, 0.6)).toBeNull();
    expect(at(0, 0.6 + lag - 0.01)).toBeNull();
    const mid = at(0, 0.6 + lag + enter / 2)!;
    expect(mid.dy).toBeLessThan(0);
    expect(mid.alpha).toBeGreaterThan(0);
    expect(mid.alpha).toBeLessThan(1);
    expect(at(0, 0.6 + lag + enter)).toEqual({ dy: 0, alpha: 1, scale: 1 });
  });

  it("puts the newest on top and pushes each older card down one slot per newer card", () => {
    const t = 3.6 + 1; // three cards in, every move finished
    expect(at(2, t)).toEqual({ dy: 0, alpha: 1, scale: 1 });
    expect(at(1, t)).toEqual({ dy: CARD.pitch, alpha: 1, scale: 1 });
    expect(at(0, t)).toEqual({ dy: 2 * CARD.pitch, alpha: 1, scale: 1 });
  });

  it("starts the push before the new card shows, so the old card is moving when the new one enters", () => {
    const enterAt = 2.1 + lag;
    expect(at(1, enterAt - 0.01)).toBeNull();
    expect(at(0, enterAt)!.dy).toBeGreaterThan(CARD.pitch * 0.5);
    // the new card is still clear by the time it is half visible
    const half = 2.1 + lag + enter / 2;
    expect(at(0, half)!.dy - at(1, half)!.dy).toBeGreaterThan(CARD.h * 0.8);
  });

  it("shows at most 4: the fifth card slides the oldest off and fades it, the sixth the next", () => {
    const shown = (t: number) => starts.map((_, i) => at(i, t)).filter((p) => p && p.alpha > 0.99).length;
    expect(shown(5.1 + 1)).toBe(4);
    const leaving = at(0, 6.6 + push / 2)!;
    expect(leaving.alpha).toBeLessThan(1);
    expect(leaving.scale).toBeLessThan(1);
    expect(leaving.dy).toBeGreaterThan(3 * CARD.pitch);
    expect(at(0, 6.6 + push)).toBeNull();
    expect(at(1, 8.1 + push)).toBeNull();
    expect(shown(8.1 + 1)).toBe(STACK_SHOW);
    expect(at(5, 8.1 + 1)).toEqual({ dy: 0, alpha: 1, scale: 1 });
    expect(at(2, 8.1 + 1)).toEqual({ dy: 3 * CARD.pitch, alpha: 1, scale: 1 });
  });

  it("orders notify stickers by start, whatever their list order", () => {
    const card = (id: string, from: number): Overlay => ({ id, kind: "notify", text: id, x: 0.5, y: 0.3, size: 1, turn: 0, color: "#2563EB", from, to: 10 });
    const list = [card("b", 2.1), { ...card("t", 0), kind: "text" as const }, card("a", 0.6)];
    expect(notifyPose(list, list[2], 4)).toEqual({ dy: CARD.pitch, alpha: 1, scale: 1 });
    expect(notifyPose(list, list[0], 4)).toEqual({ dy: 0, alpha: 1, scale: 1 });
    expect(notifyPose(list, list[1], 4)).toBeNull();
  });
});

describe("stackSettings", () => {
  const s = stackSettings({ lines: [" What if I get retrenched? ", "", "Who pays the hospital bill?", "Is CPF enough at 65?"], word: " Covered. ", label: " Brain " }, measure);
  const cards = s.overlays!.filter((o) => o.kind === "notify");
  const word = s.overlays!.find((o) => o.kind === "block")!;

  it("makes one card per typed line at its even start, all at the top slot, to the end of the video", () => {
    expect(cards.map((c) => [c.text, c.label, c.from, c.to])).toEqual([
      ["What if I get retrenched?", "Brain", 0.6, 7.6],
      ["Who pays the hospital bill?", "Brain", 2.1, 7.6],
      ["Is CPF enough at 65?", "Brain", 3.6, 7.6],
    ]);
    expect(new Set(cards.map((c) => c.y)).size).toBe(1);
    expect(new Set(cards.map((c) => c.id)).size).toBe(3);
  });

  it("lands the word last, under the stack, as a serif words block over a muted 9:16 clip", () => {
    expect(word).toMatchObject({ text: "Covered.", from: 5.1, to: 7.6, font: "serif" });
    const top = cards[0].y * 1920 - CARD.h / 2;
    const stackBottom = top + 2 * CARD.pitch + CARD.h;
    expect(word.y * 1920 - (52 * word.size * 1.3) / 2).toBeGreaterThan(stackBottom);
    expect(s).toMatchObject({ wall: true, volume: 0, aspect: "9:16", captions: false });
  });

  it("keeps the stack and the word inside the frame at 6 lines and the biggest word", () => {
    const p = stackPlace(6, 52 * 2.5);
    expect(p.cardY * 1920 - CARD.h / 2).toBeGreaterThan(200);
    expect(p.wordY * 1920 + (52 * 2.5 * 1.3) / 2).toBeLessThan(1920 * 0.8);
  });

  it("survives the editor's save and reload with its label", () => {
    const back = sanitizeOverlays(s.overlays);
    expect(back.filter((o) => o.kind === "notify").map((o) => o.label)).toEqual(["Brain", "Brain", "Brain"]);
    expect(sanitizeOverlays([{ ...cards[0], label: "x".repeat(40) }])[0].label).toHaveLength(20);
    expect(sanitizeOverlays([{ ...word, label: "no" }])[0].label).toBeUndefined();
  });

  it("is never picked on the preview by its x/y, where the stack has moved it from", () => {
    expect(overlayHit(cards, 1, cards[0].x, cards[0].y, 9 / 16)).toBeNull();
  });
});

describe("stackLines and wordSize", () => {
  it("keeps up to 6 lines of 45 characters, dropping empty ones", () => {
    expect(stackLines(["a", " ", "b  c", "x".repeat(60), "d", "e", "f", "g"])).toEqual(["a", "b c", "x".repeat(45), "d", "e", "f"]);
  });

  it("sets a short word as big as a block goes and steps a long one down until it fits", () => {
    expect(wordSize("Calm", measure)).toBe(2.5);
    const long = wordSize("Responsibility", measure);
    expect(long).toBeLessThan(2.5);
    expect(measure("Responsibility", `600 ${52 * long}px Fraunces`)).toBeLessThanOrEqual(BLOCK_W * 1080);
  });
});
