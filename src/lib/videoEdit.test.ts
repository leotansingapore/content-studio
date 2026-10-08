import { describe, expect, it } from "vitest";
import {
  applyPatch,
  buildCaptions,
  captionAt,
  defaultSettings,
  keepSegments,
  outputTime,
  sourceTime,
  totalLength,
  withStyle,
  type Word,
} from "./videoEdit";

const W = (w: string, s: number, e: number): Word => ({ w, s, e });
const words = [
  W("So", 0.5, 0.7), W("um", 0.8, 1.1), W("most", 1.2, 1.5), W("people", 1.5, 1.9), W("think.", 1.9, 2.3),
  W("This", 4.0, 4.2), W("job", 4.2, 4.5), W("uh", 4.6, 4.9), W("is", 5.0, 5.1), W("different.", 5.1, 5.7),
];
const base = { trimStart: 0, trimEnd: 0, removeFillers: true, maxPause: 0.6 };

describe("keepSegments", () => {
  it("cuts fillers and shortens long pauses, keeping everything said", () => {
    const segs = keepSegments(words, 6, base);
    for (const w of words.filter((x) => !["um", "uh"].includes(x.w))) {
      expect(outputTime(segs, (w.s + w.e) / 2)).not.toBeNull();
    }
    expect(outputTime(segs, 0.95)).toBeNull(); // the "um"
    expect(outputTime(segs, 3.0)).toBeNull(); // the 1.7 s pause
    expect(totalLength(segs)).toBeLessThan(6 - 1.4);
  });
  it("keeps the raw video when every cut is off, inside the trims", () => {
    const segs = keepSegments(words, 6, { trimStart: 0.4, trimEnd: 0.2, removeFillers: false, maxPause: 0 });
    expect(segs).toEqual([{ start: 0.4, end: 5.8 }]);
  });
  it("maps output time back to source time across cuts", () => {
    const segs = keepSegments(words, 6, base);
    const t = outputTime(segs, 4.1)!;
    expect(sourceTime(segs, t)).toBeCloseTo(4.1, 5);
    expect(sourceTime(segs, 999)).toBe(segs[segs.length - 1].end);
  });
});

describe("captions", () => {
  it("shows n words at a time in word styles and skips fillers", () => {
    const caps = buildCaptions(words, { style: "bold", wordsPerCaption: 3, removeFillers: true });
    expect(caps.map((c) => c.words.map((w) => w.w).join(" "))).toEqual(["So most people", "think.", "This job is", "different."]);
    expect(captionAt(caps, 4.3)?.words[0].w).toBe("This");
  });
  it("shows sentence lines in line styles", () => {
    const caps = buildCaptions(words, { style: "minimal", wordsPerCaption: 3, removeFillers: true });
    expect(caps.map((c) => c.words.map((w) => w.w).join(" "))).toEqual(["So most people think.", "This job is different."]);
  });
});

describe("applyPatch", () => {
  it("keeps only known keys with sane values", () => {
    const s = defaultSettings("bold");
    const { next, changed } = applyPatch(s, {
      activeColor: "#00ff88", size: 9, position: "top", hook: "Most people get this wrong — here is why", evil: "x", aspect: "3:2", maxPause: -1,
    });
    expect(next.activeColor).toBe("#00FF88");
    expect(next.size).toBe(1.6);
    expect(next.position).toBe("top");
    expect(next.hook).toBe("Most people get this wrong , here is why");
    expect(next.aspect).toBe("9:16");
    expect(next.maxPause).toBe(0);
    expect(changed).toEqual(expect.arrayContaining(["activeColor", "size", "position", "hook", "maxPause"]));
    expect((next as unknown as Record<string, unknown>).evil).toBeUndefined();
  });
  it("toggles number highlighting and older saved settings still load", () => {
    const s = defaultSettings("bold");
    expect(s.highlightNumbers).toBe(true);
    expect(defaultSettings("minimal").highlightNumbers).toBe(false);
    expect(applyPatch(s, { highlightNumbers: false }).next.highlightNumbers).toBe(false);
  });
  it("switching style keeps cuts, hook and frame", () => {
    const s = { ...defaultSettings("bold"), hook: "Hook", trimStart: 2, focusX: 0.3 };
    const m = withStyle(s, "minimal");
    expect(m).toMatchObject({ style: "minimal", hook: "Hook", trimStart: 2, focusX: 0.3, position: "bottom", uppercase: false });
    expect(applyPatch(s, { style: "minimal" }).next.style).toBe("minimal");
  });
});
