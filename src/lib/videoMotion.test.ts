import { describe, expect, it } from "vitest";
import { defaultSettings, keepSegments, sentencesOf, type EditSettings, type Word } from "./videoEdit";
import { KEY_ZOOM, ZOOM_GAP, cardText, cueTicker, cutTimes, dropGain, faceBand, findFigures, fitBlock, hookTop, sfxCues, keyBeats, keyLinesFrom, keyZoom, medianBox, motionOf, numberCards, outOfSpan, placeBlock, sanitizeMotion, type KeyLine } from "./videoMotion";

const K = (s: number, e: number, p: number): KeyLine => ({ s, e, p });
const one = [{ start: 0, end: 60 }];

describe("key lines on the edit", () => {
  it("takes the strongest lines first, at most one every 6 s, about 3 a minute", () => {
    const lines = [K(10, 12, 0.9), K(12, 14, 0.95), K(30, 33, 0.7), K(40, 42, 0.8), K(50, 52, 0.6)];
    const beats = keyBeats(lines, one, 1, 60, 0);
    expect(beats.map((b) => b.at)).toEqual([12, 30, 40]);
    for (let i = 1; i < beats.length; i++) expect(beats[i].at - beats[i - 1].at).toBeGreaterThanOrEqual(ZOOM_GAP);
  });
  it("never zooms under the hook card, on a weak line, or too close to the end", () => {
    const lines = [K(1, 2, 0.99), K(8, 9, 0.3), K(20, 22, 0.8), K(59, 59.8, 0.9)];
    expect(keyBeats(lines, one, 1, 60, 3).map((b) => b.at)).toEqual([20]);
  });
  it("follows the cuts: a line after a cut moves up, a line cut out is dropped, speed shortens it", () => {
    const segs = [{ start: 0, end: 10 }, { start: 20, end: 60 }];
    expect(outOfSpan(segs, 25, 27)).toBe(15);
    expect(outOfSpan(segs, 12, 15)).toBeNull();
    expect(outOfSpan(segs, 8, 22, 2)).toBe(4);
    expect(keyBeats([K(12, 15, 0.9), K(25, 27, 0.8)], segs, 1, 50, 0).map((b) => b.at)).toEqual([15]);
  });
  it("gives a 30 s reel 2 zooms and a 9 s one 1", () => {
    const lines = [K(2, 3, 0.4), K(10, 11, 0.9), K(20, 21, 0.7)];
    expect(keyBeats(lines, [{ start: 0, end: 30 }], 1, 29.4, 0).map((b) => b.at)).toEqual([10, 20]);
    expect(keyBeats([K(1, 2, 0.8), K(5, 6, 0.9)], [{ start: 0, end: 9 }], 1, 9, 0)).toHaveLength(1);
  });
});

describe("the zoom itself", () => {
  const beats = [{ at: 10, p: 0.9 }];
  it("eases in over 0.25 s, holds at 1.15x, eases out over 0.55 s", () => {
    expect(keyZoom(beats, 9.9)).toBe(1);
    expect(keyZoom(beats, 10.125)).toBeCloseTo(1.075, 3);
    expect(keyZoom(beats, 10.5)).toBe(KEY_ZOOM.peak);
    expect(keyZoom(beats, 11.5)).toBe(KEY_ZOOM.peak);
    const out = keyZoom(beats, 11.8);
    expect(out).toBeGreaterThan(1);
    expect(out).toBeLessThan(KEY_ZOOM.peak);
    expect(keyZoom(beats, 12.1)).toBe(1);
  });
});

describe("keeping Jev's picks", () => {
  const W = (w: string, s: number, e: number): Word => ({ w, s, e });
  const words = [W("Most", 0.5, 0.8), W("people", 0.8, 1.2), W("wait.", 1.2, 1.6), W("Start", 4.0, 4.3), W("your", 4.3, 4.5), W("top", 4.5, 4.7), W("up", 4.7, 4.9), W("now.", 4.9, 5.4)];
  it("turns picks on the edited timeline back into source times", () => {
    const segs = keepSegments(words, 6, { trimStart: 0, trimEnd: 0, removeFillers: true, maxPause: 0.6 });
    const sent = sentencesOf(words).map((x) => ({ ...x, s: outOfSpan(segs, x.s, x.e)!, e: outOfSpan(segs, x.s, x.e)! + (x.e - x.s) }));
    const lines = keyLinesFrom([{ i: 1, p: 0.8 }, { i: 7, p: 0.9 }], sent, segs, 1)!;
    expect(lines).toHaveLength(1);
    expect(lines[0].s).toBeCloseTo(4.0, 1);
    expect(lines[0].p).toBe(0.8);
    expect(keyLinesFrom(null, sent, segs, 1)).toBeNull();
  });
  it("drops malformed stored picks", () => {
    expect(sanitizeMotion({ lines: [{ s: 1, e: 2, p: 0.5 }, { s: 3, e: 2, p: 0.5 }, { s: 1, e: 2, p: 3 }, "x"] })).toEqual({ lines: [{ s: 1, e: 2, p: 0.5 }] });
    expect(sanitizeMotion(null)).toBeUndefined();
  });
});

describe("motionOf", () => {
  const segs = [{ start: 0, end: 30 }];
  const base = (p: Partial<EditSettings>): EditSettings => ({ ...defaultSettings("bold"), ...p });
  it("zooms only with the toggle on and picks kept, so the old punch-in stays otherwise", () => {
    const motion = { lines: [K(10, 12, 0.9)] };
    expect(motionOf(base({ motion }), segs, [], 30).zooms).toEqual([]);
    expect(motionOf(base({ keyZooms: true }), segs, [], 30).zooms).toEqual([]);
    expect(motionOf(base({ keyZooms: true, motion }), segs, [], 30).zooms).toEqual([{ at: 10, p: 0.9 }]);
  });
  it("keeps zooms off the hook card", () => {
    const motion = { lines: [K(2, 4, 0.9)] };
    expect(motionOf(base({ keyZooms: true, motion, hook: "CPF mistakes", hookSeconds: 3 }), segs, [], 30).zooms).toEqual([]);
    expect(motionOf(base({ keyZooms: true, motion, hook: "", hookSeconds: 3 }), segs, [], 30).zooms).toHaveLength(1);
  });
});

describe("figures said in the video", () => {
  const W = (w: string, s: number, e: number): Word => ({ w, s, e });
  const said = (text: string) => text.split(" ").map((w, i) => W(w, i * 0.4, i * 0.4 + 0.35));
  const show = (text: string) => findFigures(said(text)).map((f) => [cardText({ from: 0, land: 1, to: 3, fig: f }, 0, true), f.label]);
  it("finds money, percentages, sizes and ratios with the words after them", () => {
    expect(show("Your SA earns 4% a year, which is good.")).toEqual([["4%", "a year"]]);
    expect(show("Many get only $500 a month.")).toEqual([["$500", "a month"]]);
    expect(show("That is about 3 in 10 Singaporeans.")).toEqual([["3 in 10", "Singaporeans"]]);
    expect(show("Some built S$1.2 million this way.")).toEqual([["S$1.2 million", "this way"]]);
    expect(show("A $1,000 top up today")).toEqual([["$1,000", "top up today"]]);
    expect(show("It pays 5 percent and 20k dollars")).toEqual([["5%", "and"], ["$20k", ""]]);
    expect(show("Or 6 per cent.")).toEqual([["6%", ""]]);
  });
  it("leaves bare numbers alone: an age, a count, a year", () => {
    expect(findFigures(said("At 65 you get 3 things from 2024 onwards."))).toEqual([]);
  });
  it("counts up from 0, eased, landing on the figure as it is said", () => {
    const fig = findFigures(said("only $500 a month"))[0];
    const c = { from: 0, land: 2, to: 3, fig };
    expect(cardText(c, 1.0)).toBe("$0");
    expect(cardText(c, 1.6)).toBe("$250");
    expect(cardText(c, 1.4)).toBe("$73"); // eased: slow off the mark
    expect(cardText(c, 2.0)).toBe("$500");
    expect(cardText({ ...c, fig: { ...fig, value: 12500 } }, 2)).toBe("$12,500");
  });
});

describe("number cards on the edit", () => {
  const W = (w: string, s: number, e: number): Word => ({ w, s, e });
  const words = [
    W("It", 4.0, 4.2), W("earns", 4.2, 4.5), W("4%", 4.5, 5.0), W("a", 5.0, 5.1), W("year.", 5.1, 5.5),
    W("Then", 6.0, 6.2), W("$500", 6.2, 6.8), W("a", 6.8, 6.9), W("month.", 6.9, 7.3),
    W("And", 12.0, 12.2), W("3", 12.2, 12.4), W("in", 12.4, 12.5), W("10", 12.5, 12.8), W("people.", 12.8, 13.2),
  ];
  const segs = [{ start: 0, end: 20 }];
  it("lands each card as its figure is said and keeps them 3 s on screen, at most one every 5 s", () => {
    const cards = numberCards(words, segs, 1, 20, 0);
    expect(cards.map((c) => [c.from, c.land, c.to])).toEqual([[4, 5, 7], [11.8, 12.8, 14.8]]);
  });
  it("skips a figure under the hook card, one cut out, and one too close to the end", () => {
    expect(numberCards(words, segs, 1, 20, 4.5).map((c) => c.fig.value)).toEqual([500, 3]);
    expect(numberCards(words, [{ start: 0, end: 4.4 }, { start: 5.6, end: 20 }], 1, 20 - 1.2, 0).map((c) => c.fig.value)).toEqual([500, 3]);
    expect(numberCards(words, segs, 1, 13.5, 0).map((c) => c.fig.value)).toEqual([4]);
  });
  it("shows them only with the toggle on", () => {
    const s = { ...defaultSettings("bold"), numberCards: false };
    const caps = [{ words, s: 4, e: 13.2 }];
    expect(motionOf(s, segs, caps, 20).cards).toEqual([]);
    expect(motionOf({ ...s, numberCards: true }, segs, caps, 20).cards).toHaveLength(2);
  });
});

describe("keeping clear of the face and the captions", () => {
  it("takes the middle of the face boxes found", () => {
    const b = (y0: number) => ({ x0: 0.3, y0, x1: 0.7, y1: y0 + 0.3 });
    expect(medianBox([b(0.1), b(0.2), b(0.9)])).toEqual(b(0.2));
    expect(medianBox([])).toBeNull();
  });
  it("puts the face on the frame with room for hair, for each fit", () => {
    const box = { x0: 0.3, y0: 0.2, x1: 0.7, y1: 0.5 };
    const [a, z] = faceBand(box, { fit: "fill" }, 1080, 1920, 720, 1280)!;
    expect(a).toBeCloseTo(0.11, 2);
    expect(z).toBeCloseTo(0.53, 2);
    // a landscape video over a blurred copy sits in the middle band of a tall frame
    const [b0] = faceBand(box, { fit: "blur" }, 1080, 1920, 1920, 1080)!;
    expect(b0).toBeGreaterThan(0.3);
    expect(faceBand(null, { fit: "fill" }, 1080, 1920, 720, 1280)).toBeNull();
  });
  it("uses the preferred spot when clear, else goes under or over what is in the way", () => {
    expect(placeBlock(0.1, [null, null], [0.12])).toBe(0.12);
    expect(placeBlock(0.1, [[0.11, 0.53], [0.58, 0.7]], [0.12])).toBeCloseTo(0.72, 5);
    expect(placeBlock(0.1, [[0.2, 0.45], [0.75, 0.85]], [0.12])).toBeCloseTo(0.47, 5);
    expect(placeBlock(0.5, [[0.1, 0.84]], [0.12])).toBeNull();
  });
  it("shrinks a card a little to fit a gap rather than cover the face", () => {
    // a close-up: face 0.1-0.58, captions 0.58-0.7, only 0.72-0.84 left
    const fit = fitBlock(0.15, [[0.1, 0.58], [0.58, 0.7]], [0.12]);
    expect(fit.scale).toBe(0.7);
    expect(fit.top).toBeCloseTo(0.72, 5);
    expect(fitBlock(0.15, [null], [0.12])).toEqual({ top: 0.12, scale: 1 });
    expect(fitBlock(0.5, [[0.1, 0.84]], [0.12])).toEqual({ top: 0.12, scale: 1 });
  });
});

describe("the hook card clear of the face", () => {
  const s = (p: Partial<EditSettings>): EditSettings => ({ ...defaultSettings("bold"), punchIn: false, ...p });
  const closeUp = { x0: 0.2, y0: 0.2, x1: 0.8, y1: 0.54 };
  it("stays at today's place without a face found, or when the face is lower down", () => {
    expect(hookTop(s({}), 1080, 1920, 720, 1280, 0.1, null)).toBe(0.11);
    expect(hookTop(s({ faceBox: null }), 1080, 1920, 720, 1280, 0.1, null)).toBe(0.11);
    expect(hookTop(s({ faceBox: { x0: 0.3, y0: 0.45, x1: 0.7, y1: 0.7 } }), 1080, 1920, 720, 1280, 0.1, null)).toBe(0.11);
  });
  it("moves under a face that fills the top, and under the captions when they are in the way", () => {
    const under = hookTop(s({ faceBox: closeUp }), 1080, 1920, 720, 1280, 0.1, null);
    expect(under).toBeGreaterThan(0.57);
    expect(hookTop(s({ faceBox: closeUp }), 1080, 1920, 720, 1280, 0.1, [0.58, 0.7])).toBeCloseTo(0.72, 5);
  });
  it("allows for the punch-in on cuts, which makes the face bigger under the hook", () => {
    const face = { x0: 0.3, y0: 0.3, x1: 0.7, y1: 0.5 };
    expect(hookTop(s({ faceBox: face }), 1080, 1920, 720, 1280, 0.1, null)).toBe(0.11);
    expect(hookTop(s({ faceBox: face, punchIn: true }), 1080, 1920, 720, 1280, 0.1, null)).not.toBe(0.11);
  });
});

describe("sound effects", () => {
  const fig = findFigures([{ w: "$500", s: 0, e: 0.4 }])[0];
  const m = { zooms: [{ at: 10, p: 0.9 }], cards: [{ from: 4, land: 5, to: 7, fig }] };
  const segs = [{ start: 0, end: 6 }, { start: 8, end: 20 }];
  it("whooshes on cards and zooms, pops on stickers, and on cuts only with a transition set", () => {
    const sticker = { id: "o1", kind: "text" as const, text: "Hi", x: 0.5, y: 0.3, size: 1, turn: 0, color: "#FFD92B", from: 12, to: 15 };
    expect(sfxCues(m, { overlays: [sticker] }, segs)).toEqual([{ at: 4, kind: "whoosh" }, { at: 10, kind: "whoosh" }, { at: 12, kind: "pop" }]);
    expect(sfxCues(m, { transition: "soft" }, segs).map((c) => c.at)).toEqual([4, 6, 10]);
    expect(cutTimes(segs, 2)).toEqual([3]);
  });
  it("plays one sound at a time", () => {
    expect(sfxCues({ zooms: [{ at: 4.1, p: 1 }], cards: m.cards }, {}, segs)).toEqual([{ at: 4, kind: "whoosh" }]);
  });
  it("plays the cues the playhead passes, never on a jump", () => {
    const tick = cueTicker();
    const cues = [{ at: 1, kind: "pop" as const }, { at: 5, kind: "whoosh" as const }];
    expect(tick(cues, 0.9)).toEqual([]);
    expect(tick(cues, 1.02)).toEqual([cues[0]]);
    expect(tick(cues, 1.05)).toEqual([]);
    expect(tick(cues, 6.0)).toEqual([]); // a seek past the whoosh plays nothing
    expect(tick(cues, 4.8)).toEqual([]); // nor one back
    expect(tick(cues, 5.01)).toEqual([cues[1]]);
    expect(tick(cues, null)).toEqual([]);
    expect(tick(cues, 0.95)).toEqual([]);
  });
  it("are made only with the toggle on", () => {
    const words = [{ w: "only", s: 3.6, e: 4.0 }, { w: "$500.", s: 4.0, e: 4.6 }];
    const base = { ...defaultSettings("bold"), numberCards: true };
    const caps = [{ words, s: 3.6, e: 4.6 }];
    expect(motionOf(base, [{ start: 0, end: 20 }], caps, 20).cues).toEqual([]);
    expect(motionOf({ ...base, sfx: true }, [{ start: 0, end: 20 }], caps, 20).cues).toEqual([{ at: 3.6, kind: "whoosh" }]);
  });
});

describe("the music drop", () => {
  it("drops out over 0.15 s, stays out 2 s and comes back over 0.5 s", () => {
    expect(dropGain(null, 10)).toBe(1);
    expect(dropGain(10, 9.8)).toBe(1);
    expect(dropGain(10, 9.925)).toBeCloseTo(0.5, 5);
    expect(dropGain(10, 10.5)).toBe(0);
    expect(dropGain(10, 11.9)).toBe(0);
    expect(dropGain(10, 12.25)).toBeCloseTo(0.5, 5);
    expect(dropGain(10, 12.5)).toBe(1);
  });
  it("lands on the strongest key line, only with music, and can be switched off", () => {
    const segs = [{ start: 0, end: 60 }];
    const motion = { lines: [K(10, 12, 0.7), K(30, 32, 0.95), K(45, 47, 0.8)] };
    const music = { key: "mu-qa-1234", name: "Bed", level: 0.35 };
    const s = { ...defaultSettings("bold"), motion };
    expect(motionOf(s, segs, [], 60).drop).toBeNull();
    expect(motionOf({ ...s, music }, segs, [], 60).drop).toBe(30);
    expect(motionOf({ ...s, music, musicDrop: false }, segs, [], 60).drop).toBeNull();
    // zooms off does not stop it: the drop is its own switch
    expect(motionOf({ ...s, music, keyZooms: false }, segs, [], 60).zooms).toEqual([]);
  });
});
