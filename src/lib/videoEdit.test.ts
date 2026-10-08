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

describe("clips", () => {
  it("splits sentences at punctuation and long pauses", async () => {
    const { sentencesOf } = await import("./videoEdit");
    const ws = [W("Most", 0, 0.3), W("people", 0.3, 0.6), W("think.", 0.6, 1), W("Then", 1.2, 1.4), W("again", 1.4, 1.8), W("here", 3.5, 3.8), W("we", 3.8, 4), W("go!", 4, 4.3)];
    expect(sentencesOf(ws)).toEqual([
      { s: 0, e: 1, text: "Most people think." },
      { s: 1.2, e: 1.8, text: "Then again" },
      { s: 3.5, e: 4.3, text: "here we go!" },
    ]);
  });
  it("turns a clip into trims on the same video", async () => {
    const { clipSettings } = await import("./videoEdit");
    const s = clipSettings(defaultSettings("bold"), { start: 30, end: 75, title: "t", hook: "Why most advisors quit" }, 600);
    expect([s.trimStart, s.trimEnd, s.hook]).toEqual([30, 525, "Why most advisors quit"]);
  });
});

describe("fit and landscape", () => {
  it("adds a blurred-background fit and a 16:9 size, and older saved settings default to fill", async () => {
    const { applyPatch, aspectSize, defaultSettings } = await import("./videoEdit");
    const s = defaultSettings("bold");
    expect(s.fit).toBe("fill");
    expect(applyPatch(s, { fit: "blur", aspect: "16:9" }).next).toMatchObject({ fit: "blur", aspect: "16:9" });
    expect(applyPatch(s, { fit: "stretch" }).next.fit).toBe("fill");
    expect(aspectSize("16:9", 720, 1280)).toEqual([1920, 1080]);
  });
});

describe("name tag", () => {
  it("shows after the hook for nameSeconds, and only when a name is set", async () => {
    const { nameTagVisible } = await import("./videoEdit");
    const s = { nameTag: "Leo Tan", hook: "Hook", hookSeconds: 3, nameSeconds: 4 };
    expect([2.9, 3, 6.9, 7].map((t) => nameTagVisible(s, t))).toEqual([false, true, true, false]);
    expect(nameTagVisible({ ...s, hook: "" }, 0.5)).toBe(true);
    expect(nameTagVisible({ ...s, nameTag: " " }, 4)).toBe(false);
  });
});

describe("dead air at the ends", () => {
  it("starts just before the first word and ends just after the last when pause cutting is on", async () => {
    const { keepSegments } = await import("./videoEdit");
    const ws = [W("Hello", 2.0, 2.4), W("there.", 2.4, 2.9)];
    expect(keepSegments(ws, 6, { trimStart: 0, trimEnd: 0, removeFillers: true, maxPause: 0.6 })).toEqual([{ start: 1.75, end: 3.25 }]);
    expect(keepSegments(ws, 6, { trimStart: 0, trimEnd: 0, removeFillers: true, maxPause: 0 })).toEqual([{ start: 0, end: 6 }]);
  });
});

describe("dragged captions", () => {
  it("a dragged height wins until a named position is picked again", async () => {
    const { applyPatch, captionCenter, defaultSettings } = await import("./videoEdit");
    const s = { ...defaultSettings("bold"), captionY: 0.4 };
    expect(captionCenter(s)).toBe(0.4);
    expect(captionCenter({ ...s, captionY: 2 })).toBe(0.92);
    const top = applyPatch(s, { position: "top" }).next;
    expect([top.captionY, captionCenter(top)]).toEqual([undefined, 0.26]);
  });
});

describe("caption pop-in", () => {
  it("eases from 0 to 1 over the first 150 ms", async () => {
    const { captionIntro } = await import("./videoEdit");
    expect(captionIntro(1.0, 1.0)).toBe(0);
    expect(captionIntro(1.15, 1.0)).toBe(1);
    expect(captionIntro(1.075, 1.0)).toBeGreaterThan(0.8);
    expect(captionIntro(0.9, 1.0)).toBe(0);
  });
});

describe("brand kit on video", () => {
  it("adds the end card to the length only when it is on and there is a brand", async () => {
    const { fullLength, END_CARD_SECONDS } = await import("@/lib/videoEdit");
    expect(fullLength(20, { endCard: true }, true)).toBe(20 + END_CARD_SECONDS);
    expect(fullLength(20, { endCard: true }, false)).toBe(20);
    expect(fullLength(20, {}, true)).toBe(20);
  });

  it("takes the end card line from the sign-off, skipping hashtag lines", async () => {
    const { endCardLine } = await import("@/lib/videoEdit");
    expect(endCardLine("#cpf #sg\nDM me PLAN for a free review.\nNot advice.")).toBe("DM me PLAN for a free review.");
    expect(endCardLine("#cpf")).toBe("");
    expect(endCardLine(undefined)).toBe("");
    expect(endCardLine("x".repeat(80))).toHaveLength(62);
  });

  it("lets a vibe edit switch the logo and end card", async () => {
    const { applyPatch, defaultSettings } = await import("@/lib/videoEdit");
    const { next, changed } = applyPatch(defaultSettings(), { logo: true, endCard: true });
    expect(next.logo && next.endCard).toBe(true);
    expect(changed).toEqual(["logo", "endCard"]);
  });
});

describe("saved look", () => {
  it("keeps how the video looks, not this video's hook, trims or framing", async () => {
    const { defaultSettings, lookOf, withLook, sameLook } = await import("@/lib/videoEdit");
    const mine = { ...defaultSettings("minimal"), size: 1.3, baseColor: "#FFEE00", captionY: 0.2, logo: true, endCard: true, nameTag: "Jane Tan", aspect: "4:5" as const, hook: "3 CPF mistakes", trimStart: 4, focusX: 0.2 };
    const look = lookOf(mine);
    expect(look).not.toHaveProperty("hook");
    expect(look).not.toHaveProperty("trimStart");
    expect(look).not.toHaveProperty("focusX");
    const fresh = withLook(defaultSettings("bold"), look);
    expect(fresh).toMatchObject({ style: "minimal", size: 1.3, baseColor: "#FFEE00", captionY: 0.2, logo: true, endCard: true, nameTag: "Jane Tan", aspect: "4:5", hook: "", trimStart: 0 });
    expect(sameLook(fresh, look)).toBe(true);
    expect(sameLook(defaultSettings("bold"), look)).toBe(false);
  });

  it("drops bad saved values instead of breaking the editor", async () => {
    const { defaultSettings, withLook } = await import("@/lib/videoEdit");
    const fresh = withLook(defaultSettings("bold"), { style: "neon", size: 99, baseColor: "red", aspect: "3:2", captionY: -4 });
    expect(fresh.style).toBe("bold");
    expect(fresh.size).toBe(1.6);
    expect(fresh.baseColor).toBe("#FFFFFF");
    expect(fresh.aspect).toBe("9:16");
    expect(fresh.captionY).toBe(0.08);
    expect(withLook(defaultSettings("bold"), null)).toEqual(defaultSettings("bold"));
  });
});
