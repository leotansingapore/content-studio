import { describe, expect, it } from "vitest";
import { sanitizeBackdrop } from "./faceVision";
import {
  brandFixes,
  sanitizeStand,
  standBox,
  standOf,
  aspectSize,
  dubPlacement,
  peaksFrom,
  waveAt,
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
  sentencesOf,
  clipSettings,
  nameTagVisible,
  captionCenter,
  captionIntro,
  fullLength,
  END_CARD_SECONDS,
  endCardLine,
  lookOf,
  withLook,
  sameLook,
  toSrt,
  findPhrase,
  captionBoxOf,
  captionFont,
  FONTS,
  platformFit,
  trimToLength,
  fmtTime,
  listCuts,
  gradeOf,
  FILTERS,
  STYLES,
  distanceToCut,
  newOverlay,
  sanitizeOverlays,
  OVERLAY_LABELS,
  BANNER_WORD,
  MAX_OVERLAYS,
  overlaysAt,
  overlayHit,
  outAt,
  srcAt,
  speedOf,
  wordRange,
  addRemoved,
  removedAt,
  sanitizeRemoved,
  voiceAt,
  sanitizeVoiceover,
  animOf,
  appCover,
  clearOfApp,
  frameRect,
  applyFixes,
  fixFromEdit,
  sanitizeFixes,
  MAX_FIXES,
  soundStats,
  exportIssues,
  kWeighting,
  integratedLoudness,
  truePeak,
  nextGain,
  levelFits,
  sanitizeLevel,
  newBroll,
  brollAt,
  sanitizeBroll,
  speechSpans,
  musicGainAt,
  MUSIC_DUCK,
  duckSpans,
  sanitizeMusic,
  targetOf,
  exportSize,
  MIN_VIDEO_BPS,
  fmtBytes,
  editedSentences,
  sanitizeCutaways,
  sanitizePublish,
  wideForUpright,
  trimTake,
  moveTake,
  joinIssue,
  joinedLength,
  MAX_JOIN_SECONDS,
  makeupDb,
  wrapBlock,
  readSeconds,
  wallSettings,
  blockGrip,
} from "./videoEdit";
import { links } from "./links";

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
    const ws = [W("Most", 0, 0.3), W("people", 0.3, 0.6), W("think.", 0.6, 1), W("Then", 1.2, 1.4), W("again", 1.4, 1.8), W("here", 3.5, 3.8), W("we", 3.8, 4), W("go!", 4, 4.3)];
    expect(sentencesOf(ws)).toEqual([
      { s: 0, e: 1, text: "Most people think." },
      { s: 1.2, e: 1.8, text: "Then again" },
      { s: 3.5, e: 4.3, text: "here we go!" },
    ]);
  });
  it("turns a clip into trims on the same video", async () => {
    const s = clipSettings(defaultSettings("bold"), { start: 30, end: 75, title: "t", hook: "Why most advisors quit" }, 600);
    expect([s.trimStart, s.trimEnd, s.hook]).toEqual([30, 525, "Why most advisors quit"]);
    // a skipped tangent is cut like words cut by hand, after any the video already had
    const base = { ...defaultSettings("bold"), removed: [{ s: 5, e: 6 }] };
    expect(clipSettings(base, { start: 30, end: 120, title: "t", hook: "", skip: { start: 50, end: 70 } }, 600).removed).toEqual([{ s: 5, e: 6 }, { s: 50, e: 70 }]);
    expect(clipSettings(base, { start: 30, end: 120, title: "t", hook: "" }, 600).removed).toEqual([{ s: 5, e: 6 }]);
  });
});

describe("fit and landscape", () => {
  it("adds a blurred-background fit and a 16:9 size, and older saved settings default to fill", async () => {
    const s = defaultSettings("bold");
    expect(s.fit).toBe("fill");
    expect(applyPatch(s, { fit: "blur", aspect: "16:9" }).next).toMatchObject({ fit: "blur", aspect: "16:9" });
    expect(applyPatch(s, { fit: "stretch" }).next.fit).toBe("fill");
    expect(aspectSize("16:9", 720, 1280)).toEqual([1920, 1080]);
  });
});

describe("name tag", () => {
  it("shows after the hook for nameSeconds, and only when a name is set", async () => {
    const s = { nameTag: "Leo Tan", hook: "Hook", hookSeconds: 3, nameSeconds: 4 };
    expect([2.9, 3, 6.9, 7].map((t) => nameTagVisible(s, t))).toEqual([false, true, true, false]);
    expect(nameTagVisible({ ...s, hook: "" }, 0.5)).toBe(true);
    expect(nameTagVisible({ ...s, nameTag: " " }, 4)).toBe(false);
  });
});

describe("dead air at the ends", () => {
  it("starts just before the first word and ends just after the last when pause cutting is on", async () => {
    const ws = [W("Hello", 2.0, 2.4), W("there.", 2.4, 2.9)];
    expect(keepSegments(ws, 6, { trimStart: 0, trimEnd: 0, removeFillers: true, maxPause: 0.6 })).toEqual([{ start: 1.75, end: 3.25 }]);
    expect(keepSegments(ws, 6, { trimStart: 0, trimEnd: 0, removeFillers: true, maxPause: 0 })).toEqual([{ start: 0, end: 6 }]);
  });
});

describe("dragged captions", () => {
  it("a dragged height wins until a named position is picked again", async () => {
    const s = { ...defaultSettings("bold"), captionY: 0.4 };
    expect(captionCenter(s)).toBe(0.4);
    expect(captionCenter({ ...s, captionY: 2 })).toBe(0.92);
    const top = applyPatch(s, { position: "top" }).next;
    expect([top.captionY, captionCenter(top)]).toEqual([undefined, 0.26]);
  });
});

describe("caption pop-in", () => {
  it("eases from 0 to 1 over the first 150 ms", async () => {
    expect(captionIntro(1.0, 1.0)).toBe(0);
    expect(captionIntro(1.15, 1.0)).toBe(1);
    expect(captionIntro(1.075, 1.0)).toBeGreaterThan(0.8);
    expect(captionIntro(0.9, 1.0)).toBe(0);
  });
});

describe("brand kit on video", () => {
  it("adds the end card to the length only when it is on and there is a brand", async () => {
    expect(fullLength(20, { endCard: true }, true)).toBe(20 + END_CARD_SECONDS);
    expect(fullLength(20, { endCard: true }, false)).toBe(20);
    expect(fullLength(20, {}, true)).toBe(20);
  });

  it("takes the end card line from the sign-off, skipping hashtag lines", async () => {
    expect(endCardLine("#cpf #sg\nDM me PLAN for a free review.\nNot advice.")).toBe("DM me PLAN for a free review.");
    expect(endCardLine("#cpf")).toBe("");
    expect(endCardLine(undefined)).toBe("");
    expect(endCardLine("x".repeat(80))).toHaveLength(62);
  });

  it("lets a vibe edit switch the logo and end card", async () => {
    const { next, changed } = applyPatch(defaultSettings(), { logo: true, endCard: true });
    expect(next.logo && next.endCard).toBe(true);
    expect(changed).toEqual(["logo", "endCard"]);
  });
});

describe("saved look", () => {
  it("keeps how the video looks, not this video's hook, trims or framing", async () => {
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
    const fresh = withLook(defaultSettings("bold"), { style: "neon", size: 99, baseColor: "red", aspect: "3:2", captionY: -4 });
    expect(fresh.style).toBe("bold");
    expect(fresh.size).toBe(1.6);
    expect(fresh.baseColor).toBe("#FFFFFF");
    expect(fresh.aspect).toBe("9:16");
    expect(fresh.captionY).toBe(0.08);
    expect(withLook(defaultSettings("bold"), null)).toEqual(defaultSettings("bold"));
  });
});

describe("subtitle file and search", () => {
  const w = (word: string, s: number, e: number) => ({ w: word, s, e });
  const words = [w("Most", 0, 0.3), w("people", 0.3, 0.7), w("um", 0.8, 1.0), w("think", 1.1, 1.4), w("CPF", 1.5, 1.8), w("is", 1.8, 1.9), w("boring.", 1.9, 2.4), w("It's", 4.0, 4.2), w("not.", 4.2, 4.6)];

  it("writes SRT cues on the edited timeline, without cut words", async () => {
    // kept: 0-0.75 and 1.05-2.5 and 3.9-4.7 (the um and the long pause cut)
    const segs = [{ start: 0, end: 0.75 }, { start: 1.05, end: 2.5 }, { start: 3.9, end: 4.7 }];
    const srt = toSrt(words, segs, true);
    expect(srt).toBe(
      "1\n00:00:00,000 --> 00:00:02,100\nMost people think CPF is boring.\n\n" +
      "2\n00:00:02,300 --> 00:00:02,900\nIt's not.\n",
    );
    expect(srt).not.toContain("um");
  });

  it("finds a phrase anywhere, ignoring case and punctuation, with the last word as a prefix", async () => {
    expect(findPhrase(words, "cpf IS")).toEqual([4]);
    expect(findPhrase(words, "bor")).toEqual([6]);
    expect(findPhrase(words, "it's not")).toEqual([7]);
    expect(findPhrase(words, "  ")).toEqual([]);
    expect(findPhrase(words, "pension")).toEqual([]);
  });
});

describe("caption background and font", () => {
  it("uses the style's own until overridden, and a style switch resets the override", async () => {
    expect(captionBoxOf(defaultSettings("minimal"))).toBe("pill");
    expect(captionBoxOf(defaultSettings("bold"))).toBe("none");
    const set = applyPatch(defaultSettings("bold"), { captionBox: "word", font: "serif" }).next;
    expect(captionBoxOf(set)).toBe("word");
    expect(captionFont(set)).toBe(FONTS.serif.css);
    // a word highlight needs a word style
    expect(captionBoxOf({ ...defaultSettings("minimal"), captionBox: "word" })).toBe("pill");
    const switched = withStyle(set, "editorial");
    expect(switched.captionBox).toBeUndefined();
    expect(switched.font).toBeUndefined();
    expect(applyPatch(defaultSettings("bold"), { captionBox: "neon", font: "comic" }).changed).toEqual([]);
  });
});

describe("platform length rules", () => {
  it("says which platforms a length fits", async () => {
    const fit = (s: number) => Object.fromEntries(platformFit(s).map((p) => [p.id, p.fit]));
    expect(fit(45)).toEqual({ reels: "ok", shorts: "ok", tiktok: "ok" });
    expect(fit(240)).toEqual({ reels: "reach", shorts: "over", tiktok: "ok" });
    expect(fit(900)).toEqual({ reels: "reach", shorts: "over", tiktok: "over" });
  });

  it("trims the end so the edit lands exactly on the limit, keeping the cuts", async () => {
    const segs = [{ start: 0, end: 100 }, { start: 110, end: 250 }]; // 240 s kept of 250
    const trimEnd = trimToLength(segs, 250, 180, { trimEnd: 0 });
    expect(trimEnd).toBe(60); // keep 0-100 and 110-190
    expect(totalLength([{ start: 0, end: 100 }, { start: 110, end: 250 - trimEnd }])).toBe(180);
    expect(trimToLength([{ start: 0, end: 60 }], 60, 180, { trimEnd: 2 })).toBe(2);
  });
});

describe("fmtTime", () => {
  it("never shows 60 seconds", async () => {
    expect(fmtTime(179.99)).toBe("3:00.0");
    expect(fmtTime(59.96)).toBe("1:00.0");
    expect(fmtTime(65.24)).toBe("1:05.2");
    expect(fmtTime(-2)).toBe("0:00.0");
  });
});

describe("reviewing cuts", () => {
  const w = (word: string, s: number, e: number) => ({ w: word, s, e });
  // "I think [1.2 s] um [1.0 s] this works"
  const words = [w("I", 0, 0.2), w("think", 0.2, 0.6), w("um", 1.8, 2.0), w("this", 3.0, 3.3), w("works.", 3.3, 3.8)];
  const base = { trimStart: 0, trimEnd: 0, removeFillers: true, maxPause: 0.6 };

  it("lists each filler and long pause with the words around it", async () => {
    const cuts = listCuts(words, 4, base);
    expect(cuts.map((c) => [c.id, c.kind, c.before, c.word, c.after])).toEqual([
      ["p:0.60", "pause", "think", "", "this"],
      ["f:1.80", "filler", "think", "um", "this"],
    ]);
  });

  it("keeps a reviewed pause", async () => {
    const all = totalLength(keepSegments(words, 4, base));
    const kept = keepSegments(words, 4, { ...base, keepCuts: ["p:0.60"] });
    expect(totalLength(kept)).toBeGreaterThan(all + 2);
  });

  it("keeps a reviewed um, and the pause cut around it no longer swallows it", async () => {
    const segs = keepSegments(words, 4, { ...base, keepCuts: ["f:1.80"] });
    expect(segs.some((g) => g.start <= 1.8 && g.end >= 2.0)).toBe(true);
    // the long pause is now two pauses either side of the kept um
    expect(listCuts(words, 4, { ...base, keepCuts: ["f:1.80"] }).filter((c) => c.kind === "pause").map((c) => c.id)).toEqual(["p:0.60", "p:2.00"]);
  });
});

describe("colour looks and cut transitions", () => {
  it("grades with the chosen look, the style's own, or nothing", async () => {
    expect(gradeOf(defaultSettings("bold"))).toBe(STYLES.bold.grade);
    expect(gradeOf({ ...defaultSettings("bold"), filter: "mono" })).toBe(FILTERS.mono.css);
    expect(gradeOf({ ...defaultSettings("bold"), filter: "mono", grade: false })).toBe("none");
  });

  it("measures the distance to the nearest join between kept segments", async () => {
    const segs = [{ start: 0, end: 2 }, { start: 3, end: 5 }, { start: 6, end: 7 }]; // joins at 2 and 4 out
    expect(distanceToCut(segs, 2.03)).toBeCloseTo(0.03);
    expect(distanceToCut(segs, 3.9)).toBeCloseTo(0.1);
    expect(distanceToCut([{ start: 0, end: 5 }], 1)).toBe(Infinity);
  });

  it("takes looks and transitions from a vibe edit and drops unknown ones", async () => {
    expect(applyPatch(defaultSettings(), { filter: "warm", transition: "soft" }).changed).toEqual(["filter", "transition"]);
    expect(applyPatch(defaultSettings(), { filter: "sepia", transition: "spin" }).changed).toEqual([]);
  });
});

describe("stickers", () => {
  it("makes a sticker at the playhead for 3 seconds", async () => {
    const o = newOverlay("arrow", 4.26, "#123abc");
    expect(o).toMatchObject({ kind: "arrow", from: 4.2, to: 7.2, color: "#123ABC", size: 1, turn: 0 });
    // a playhead a hair under a tenth still shows the new sticker
    expect(newOverlay("circle", 4.99999, "#FFFFFF").from).toBeLessThanOrEqual(4.99999);
    expect(newOverlay("text", 0, "red").color).toBe("#FFD92B");
  });

  it("keeps only well-formed stickers from storage, clamped", async () => {
    const list = sanitizeOverlays([
      { id: "a", kind: "text", text: "Hi", x: 2, y: -1, size: 9, turn: 7, color: "nope", from: 1, to: 0 },
      { id: "b", kind: "bomb" },
      null,
      "x",
    ]);
    expect(list).toEqual([{ id: "a", kind: "text", text: "Hi", x: 1, y: 0, size: 2.5, turn: 3, color: "#FFD92B", from: 1, to: 1.3 }]);
    expect(sanitizeOverlays(Array.from({ length: 30 }, (_, i) => ({ id: `o${i}`, kind: "circle" })))).toHaveLength(MAX_OVERLAYS);
    expect(sanitizeOverlays("nope")).toEqual([]);
  });

  it("names every sticker kind storage keeps, so the Stickers list has a name for each", () => {
    for (const [kind, label] of Object.entries(OVERLAY_LABELS)) {
      // sentence case, a word or two
      expect(label).toMatch(/^[A-Z][a-z]+( [a-z]+)?$/);
      expect(sanitizeOverlays([{ id: "a", kind }]).map((o) => o.kind)).toEqual([kind]);
    }
  });

  it("finds what is showing and what is under a tap", async () => {
    const a = { ...newOverlay("circle", 1, "#FFFFFF"), id: "a", x: 0.3, y: 0.3 };
    const b = { ...newOverlay("arrow", 2, "#FFFFFF"), id: "b", x: 0.32, y: 0.31 };
    expect(overlaysAt([a, b], 1.5).map((o) => o.id)).toEqual(["a"]);
    expect(overlayHit([a, b], 2.5, 0.31, 0.3, 9 / 16)?.id).toBe("b"); // topmost wins
    expect(overlayHit([a, b], 2.5, 0.9, 0.9, 9 / 16)).toBeNull();
    expect(overlayHit([a, b], 9, 0.3, 0.3, 9 / 16)).toBeNull(); // not showing
  });
});

describe("the news banner (formats-presenter)", () => {
  it("survives sanitising with its headline cut to 50 characters, and is named News banner", () => {
    const headline = "Most people in Singapore pay for their hospital stay twice";
    const [b] = sanitizeOverlays([{ id: "n", kind: "banner", text: headline, x: 0.5, y: 0.8, size: 1, color: "#D62828", from: 0, to: 4, w: 0.6, box: "white" }]);
    expect(b).toEqual({ id: "n", kind: "banner", text: headline.slice(0, 50), x: 0.5, y: 0.8, size: 1, turn: 0, color: "#D62828", from: 0, to: 4 });
    expect(b.text).toHaveLength(50);
    expect(sanitizeOverlays([b])).toEqual([b]);
    expect(OVERLAY_LABELS.banner).toBe("News banner");
    expect(BANNER_WORD).toBe("EXPLAINER");
  });

  it("starts in the lower third for 4 seconds", () => {
    expect(newOverlay("banner", 0, "#D62828")).toMatchObject({ kind: "banner", text: "", x: 0.5, y: 0.8, from: 0, to: 4, color: "#D62828" });
    expect(newOverlay("banner", 0, "#D62828")).not.toHaveProperty("w");
  });
});

describe("words over a video", () => {
  it("keeps a block's 400 characters, still cuts a text sticker at 60, clamps the width and drops an unknown box", () => {
    const long = "word ".repeat(100);
    const [block, text] = sanitizeOverlays([
      { id: "b", kind: "block", text: long, w: 2, box: "neon", font: "comic", from: 0, to: 9 },
      { id: "t", kind: "text", text: long, w: 0.6, box: "white" },
    ]);
    expect(block.text).toHaveLength(400);
    expect(block.w).toBe(0.95);
    expect(block).not.toHaveProperty("box");
    expect(block).not.toHaveProperty("font");
    expect(text.text).toHaveLength(60);
    expect(text).not.toHaveProperty("w");
    expect(sanitizeOverlays([{ id: "b", kind: "block", w: 0.1, box: "bar", font: "serif" }])[0]).toMatchObject({ w: 0.5, box: "bar", font: "serif" });
  });

  it("makes a block that spans the whole edit, centred, while other stickers keep 3 seconds", () => {
    expect(newOverlay("block", 4, "#FFFFFF", 12.5)).toMatchObject({ kind: "block", from: 0, to: 12.5, x: 0.5, y: 0.5, w: 0.84, box: "none" });
    expect(newOverlay("text", 4, "#FFFFFF", 12.5)).toMatchObject({ from: 4, to: 7 });
  });

  it("wraps at the width, keeps line breaks and never splits a word", () => {
    const measure = (t: string) => t.length * 10;
    // 100 px wide, 0.3 em clear each side at 10 px: 94 px for words
    expect(wrapBlock("aaa bbb ccc dd", 100, 10, measure)).toEqual(["aaa bbb", "ccc dd"]);
    expect(wrapBlock("one\n\ntwo three", 200, 10, measure)).toEqual(["one", "", "two three"]);
    expect(wrapBlock("a supercalifragilistic b", 100, 10, measure)).toEqual(["a", "supercalifragilistic", "b"]);
    expect(wrapBlock("  ", 100, 10, measure)).toEqual([]);
  });

  it("reads at 3.5 words a second, rounded up", () => {
    expect(readSeconds(Array.from({ length: 47 }, (_, i) => `w${i}`).join(" "))).toBe(14);
    expect(readSeconds("")).toBe(0);
  });

  it("makes a muted 9:16 project with no captions and one centred block", () => {
    const s = wallSettings("POV: it's year-end", 9, { font: "clean", box: "white", size: 0.8 });
    expect(s).toMatchObject({ wall: true, captions: false, volume: 0, aspect: "9:16" });
    expect(s.overlays).toHaveLength(1);
    expect(s.overlays![0]).toMatchObject({ kind: "block", text: "POV: it's year-end", from: 0, to: 9, x: 0.5, y: 0.5, font: "clean", box: "white", size: 0.8 });
    expect(sanitizeOverlays(s.overlays)).toEqual(s.overlays);
  });

  it("never carries the wall switch in a look, and a look keeps a wall's captions off, its 9:16 and no progress bar", () => {
    const wall = { ...defaultSettings("bold"), ...wallSettings("Hi", 5) };
    expect(lookOf(wall)).not.toHaveProperty("wall");
    expect(withLook(wall, { captions: true, style: "minimal" })).toMatchObject({ captions: false, wall: true, style: "minimal" });
    // a skill saved on a bold 16:9 project
    expect(withLook(wall, lookOf({ ...defaultSettings("bold"), aspect: "16:9" }))).toMatchObject({ aspect: "9:16", progressBar: false, captions: false });
    expect(withLook(defaultSettings("bold"), { aspect: "16:9", progressBar: false })).toMatchObject({ aspect: "16:9", progressBar: false });
    expect(withLook(defaultSettings("bold"), { captions: false }).captions).toBe(false);
    expect(withLook({ ...defaultSettings("bold"), captions: false }, { captions: true }).captions).toBe(true);
  });

  it("hits a block anywhere on its box and finds its side and corner handles", () => {
    const block = { ...newOverlay("block", 0, "#FFFFFF", 10), id: "b" };
    const box = { x: 0.5, y: 0.5, w: 0.84, h: 0.3 };
    // far from the centre but on the box: the plain sticker reach (0.09) would miss it
    expect(overlayHit([block], 1, 0.15, 0.62, 9 / 16, () => box)?.id).toBe("b");
    expect(overlayHit([block], 1, 0.5, 0.9, 9 / 16, () => box)).toBeNull();
    expect(blockGrip(box, 0.92, 0.5, 0.05, 0.03)).toBe("side");
    expect(blockGrip(box, 0.08, 0.65, 0.05, 0.03)).toBe("corner");
    expect(blockGrip(box, 0.5, 0.5, 0.05, 0.03)).toBeNull();
  });

  it("links the start panel and the full set of tools", () => {
    expect(links.edit({ panel: ["wall"] })).toBe("/edit?panel=wall");
    expect(links.edit({ p: "v1", view: "all" })).toBe("/edit?p=v1&view=all");
    expect(links.edit({ panel: ["wall"], view: "all" })).toBe("/edit?panel=wall&view=all");
  });
});

describe("speed", () => {
  const segs = [{ start: 0, end: 10 }, { start: 12, end: 24 }]; // 22 s kept

  it("maps both ways at a speed", async () => {
    expect(outAt(segs, 13, 1.1)).toBeCloseTo(11 / 1.1);
    expect(srcAt(segs, 10, 1.1)).toBeCloseTo(12 + 1);
    expect(outAt(segs, 11, 1.5)).toBeNull(); // inside the cut
  });

  it("speeds the length, the subtitle times and the trim-to-fit", async () => {
    expect(speedOf({})).toBe(1);
    expect(speedOf({ speed: 9 })).toBe(1);
    // 22 s at 1.1x is 20 s: already under 20.5
    expect(trimToLength(segs, 24, 20.5, { trimEnd: 0, speed: 1.1 })).toBe(0);
    // to land on 10 s at 2 sources' worth: 10 s out at 1.2x is 12 s of source, ending at 14 s
    expect(trimToLength(segs, 24, 10, { trimEnd: 0, speed: 1.2 })).toBe(10);
    const srt = toSrt([{ w: "Hi.", s: 12, e: 12.5 }], segs, true, 2);
    expect(srt).toContain("00:00:05,000 --> 00:00:05,250");
  });

  it("takes a speed from a vibe edit, kept between 1 and 1.5", async () => {
    expect(applyPatch(defaultSettings(), { speed: 1.17 }).next.speed).toBe(1.15);
    expect(applyPatch(defaultSettings(), { speed: 4 }).next.speed).toBe(1.5);
  });
});

describe("cutting words from the transcript", () => {
  const w = (word: string, s: number, e: number) => ({ w: word, s, e });
  const words = [w("So", 0.2, 0.4), w("the", 0.5, 0.6), w("wrong", 0.7, 1.0), w("bit", 1.1, 1.3), w("CPF", 1.4, 1.7), w("matters.", 1.8, 2.3)];
  const base = { trimStart: 0, trimEnd: 0, removeFillers: true, maxPause: 0.6 };

  it("cuts a stretch of words, and its ends are padded", async () => {
    const r = wordRange(words, 3, 1); // "the wrong bit", picked last word first
    expect(r.s).toBeCloseTo(0.46);
    expect(r.e).toBeCloseTo(1.34);
    const all = totalLength(keepSegments(words, 3, base));
    const cut = keepSegments(words, 3, { ...base, removed: [r] });
    expect(totalLength(cut)).toBeCloseTo(all - (r.e - r.s));
    expect(cut.some((g) => g.start < 0.8 && g.end > 0.8)).toBe(false); // "wrong" never plays
  });

  it("trims dead air after a cut last word", async () => {
    const segs = keepSegments(words, 4, { ...base, removed: [wordRange(words, 5, 5)] });
    // playback stops where the cut starts: no tail of silence after the cut word
    expect(segs[segs.length - 1].end).toBeCloseTo(1.76);
    expect(segs.some((g) => g.end > 2.3)).toBe(false);
  });

  it("merges overlapping stretches, finds a word's stretch and cleans stored ones", async () => {
    const list = addRemoved(addRemoved(undefined, { s: 1, e: 2 }), { s: 1.5, e: 3 });
    expect(list).toEqual([{ s: 1, e: 3 }]);
    expect(addRemoved(list, { s: 5, e: 6 })).toHaveLength(2);
    expect(removedAt(list, words[4])).toEqual({ s: 1, e: 3 });
    expect(removedAt(list, words[0])).toBeNull();
    expect(sanitizeRemoved([{ s: 2, e: 1 }, { s: "x" }, null, { s: 3, e: 4 }, { s: -1, e: 0.5 }])).toEqual([{ s: 0, e: 0.5 }, { s: 3, e: 4 }]);
  });
});

describe("volume and export kind", () => {
  it("takes them from a patch within range and drops nonsense", async () => {
    expect(applyPatch(defaultSettings(), { volume: 0.333, exportAs: "audio" }).next).toMatchObject({ volume: 0.33, exportAs: "audio" });
    expect(applyPatch(defaultSettings(), { volume: 3 }).next.volume).toBe(1);
    expect(applyPatch(defaultSettings(), { exportAs: "gif" }).changed).toEqual([]);
  });
});

describe("voiceover", () => {
  it("knows where in the take a point of the edit falls", async () => {
    const vo = { key: "vo-abc-123", start: 2, length: 3 };
    expect(voiceAt(vo, 1.9)).toBeNull();
    expect(voiceAt(vo, 2)).toBe(0);
    expect(voiceAt(vo, 4.5)).toBe(2.5);
    expect(voiceAt(vo, 5)).toBeNull();
    expect(voiceAt(undefined, 3)).toBeNull();
  });

  it("keeps only a well-formed stored voiceover", async () => {
    expect(sanitizeVoiceover({ key: "vo-v1-abc", start: 1, length: 4, gain: 9 })).toEqual({ key: "vo-v1-abc", start: 1, length: 4, gain: 1.5 });
    for (const bad of [null, "x", { key: "../x", start: 0, length: 2 }, { key: "vo-ok-1", start: "x", length: 2 }, { key: "vo-ok-1", start: 0, length: 0.1 }]) {
      expect(sanitizeVoiceover(bad)).toBeUndefined();
    }
  });
});

describe("caption animation", () => {
  it("defaults to pop for word styles and none for line styles, and a style switch resets it", async () => {
    expect(animOf(defaultSettings("bold"))).toBe("pop");
    expect(animOf(defaultSettings("minimal"))).toBe("none");
    const typed = applyPatch(defaultSettings("bold"), { captionAnim: "type" }).next;
    expect(animOf(typed)).toBe("type");
    expect(withStyle(typed, "cutout").captionAnim).toBeUndefined();
    expect(applyPatch(defaultSettings(), { captionAnim: "spin" }).changed).toEqual([]);
  });
});

describe("app buttons over a 9:16 video", () => {
  it("flags captions dragged under the app's caption area, and the fix clears it", async () => {
    const s = defaultSettings();
    expect(appCover(s, "instagram")).toEqual({ captions: false, stickers: 0 }); // bottom captions sit clear
    const low = { ...s, captionY: 0.9 };
    expect(appCover(low, "instagram").captions).toBe(true);
    expect(appCover({ ...low, captions: false }, "instagram").captions).toBe(false);
    expect(appCover({ ...s, captionY: 0.08 }, "tiktok").captions).toBe(true);
    for (const app of ["instagram", "tiktok"] as const) {
      expect(appCover({ ...s, captionY: clearOfApp(0.9, app) }, app).captions).toBe(false);
      expect(appCover({ ...s, captionY: clearOfApp(0.08, app) }, app).captions).toBe(false);
    }
  });

  it("counts stickers under the top bar, the bottom area or the button column", async () => {
    const at = (x: number, y: number) => ({ ...newOverlay("text", 0, "#FFFFFF"), x, y });
    const s = { ...defaultSettings(), overlays: [at(0.5, 0.5), at(0.5, 0.95), at(0.97, 0.5), at(0.3, 0.03)] };
    expect(appCover(s, "instagram").stickers).toBe(3);
  });
});

describe("framed layout", () => {
  it("fits a landscape clip across a vertical frame with a margin, and a tall one by height", async () => {
    const r = frameRect(1080, 1920, 1920, 1080);
    expect(r.w).toBeCloseTo(950.4);
    expect(r.h).toBeCloseTo(534.6);
    expect(r.x).toBeCloseTo(64.8);
    const tall = frameRect(1080, 1920, 1080, 1920);
    expect(tall.h).toBeCloseTo(1152);
    expect(tall.x + tall.w).toBeLessThanOrEqual(1080);
    expect(applyPatch(defaultSettings(), { fit: "framed" }).next.fit).toBe("framed");
  });
});

describe("saved caption fixes", () => {
  const w = (word: string, s: number, e: number) => ({ w: word, s, e });

  it("fixes a word or a run of words everywhere, keeping timing and the full stop", async () => {
    const words = [w("Your", 0, 0.2), w("Medi", 0.3, 0.5), w("Shield", 0.5, 0.8), w("and", 0.9, 1), w("kpf.", 1.1, 1.4), w("medi", 2, 2.2), w("shield.", 2.2, 2.6)];
    const out = applyFixes(words, [{ from: "medi shield", to: "MediShield" }, { from: "KPF", to: "CPF" }]);
    expect(out.count).toBe(3);
    expect(out.words.map((x) => x.w)).toEqual(["Your", "MediShield", "and", "CPF.", "MediShield."]);
    expect(out.words[1]).toEqual({ w: "MediShield", s: 0.3, e: 0.8 });
    expect(out.words[4]).toEqual({ w: "MediShield.", s: 2, e: 2.6 });
  });

  it("leaves words that already read right, and counts nothing", async () => {
    const words = [w("MediShield", 0, 0.5), w("works.", 0.5, 1)];
    expect(applyFixes(words, [{ from: "medishield", to: "MediShield" }])).toEqual({ words, count: 0 });
    expect(applyFixes(words, []).count).toBe(0);
  });

  it("turns a spelling fix into a saved fix, and cleans a stored list", async () => {
    expect(fixFromEdit("lio,", "Leo,")).toEqual({ from: "lio", to: "Leo" });
    expect(fixFromEdit("CPF.", "CPF.")).toBeNull();
    expect(fixFromEdit("so", "")).toBeNull();
    expect(sanitizeFixes([{ from: " Lio ", to: "Leo" }, { from: "lio", to: "Leon" }, { from: "", to: "x" }, { from: "a b c d e", to: "x" }, "x", null, { from: "kpf", to: "CPF" }]))
      .toEqual([{ from: "Lio", to: "Leo" }, { from: "kpf", to: "CPF" }]);
    expect(sanitizeFixes("nope")).toEqual([]);
  });

  it("keeps a new caption fix once the list is full, dropping the oldest", () => {
    const full = Array.from({ length: MAX_FIXES }, (_, i) => ({ from: `w${i}`, to: `W${i}` }));
    const kept = sanitizeFixes([...full, { from: "kpf", to: "CPF" }]);
    expect(kept).toHaveLength(MAX_FIXES);
    expect(kept.at(-1)).toEqual({ from: "kpf", to: "CPF" });
    expect(kept[0]).toEqual({ from: "w1", to: "W1" });
  });
});

describe("checking an exported file", () => {
  // 8 kHz mono: a tone at the given level for each [seconds, amplitude] stretch
  const pcm = (parts: [number, number][]) => {
    const rate = 8000;
    const out: number[] = [];
    for (const [sec, amp] of parts) for (let i = 0; i < sec * rate; i++) out.push(amp * Math.sin(i / 3));
    return { samples: Float32Array.from(out), rate };
  };

  it("measures the sound level and the longest silence inside the file, not at its ends", async () => {
    const { samples, rate } = pcm([[0.6, 0], [3, 0.3], [2.5, 0], [3, 0.3], [2.5, 0]]);
    const s = soundStats(samples, rate);
    expect(s.seconds).toBeCloseTo(11.6, 1);
    expect(s.level!).toBeGreaterThan(-14);
    expect(s.level!).toBeLessThan(-12);
    expect(s.gap!.at).toBeCloseTo(3.6, 1);
    expect(s.gap!.length).toBeCloseTo(2.5, 1);
    expect(soundStats(pcm([[2, 0]]).samples, 8000).level).toBeNull();
    expect(soundStats(pcm([[2, 0.3]]).samples, 8000).gap).toBeNull();
  });

  it("says what is wrong with a file and stays quiet when it is fine", async () => {
    const want: Parameters<typeof exportIssues>[1] = { seconds: 20, kind: "video", captions: true, hasWords: true, sound: true };
    expect(exportIssues({ seconds: 20.4, level: -18, gap: null }, want)).toEqual([]);
    const ids = (c: Parameters<typeof exportIssues>[0], w = want) => exportIssues(c, w).map((i) => i.id);
    expect(ids({ seconds: 26, level: -18, gap: null })).toEqual(["length"]);
    expect(ids({ seconds: 20, level: null, gap: null })).toEqual(["silent"]);
    expect(ids({ seconds: 20, level: null, gap: null }, { ...want, sound: false })).toEqual([]);
    expect(ids({ seconds: 20, level: -38, gap: { at: 4, length: 2.6 } })).toEqual(["quiet", "gap"]);
    expect(ids({ seconds: 20, level: -18, gap: { at: 4, length: 1.2 } })).toEqual([]);
    expect(ids({ seconds: 20, level: -18, gap: null }, { ...want, hasWords: false })).toEqual(["captions"]);
    expect(ids({ seconds: 20, level: -18, gap: null }, { ...want, kind: "audio", hasWords: false })).toEqual([]);
    expect(ids({ seconds: null, level: null, gap: null })).toEqual([]); // the sound could not be read back: nothing claimed
  });
});

describe("loudness", () => {
  // Signals are built once, while the file is collected, and only as long as each reading needs:
  // this is the heaviest test in the suite and it must stay inside 5 s on a busy machine.
  const tone = (amp: number, seconds: number, rate = 48000, hz = 997) => {
    const out = new Float32Array(Math.round(seconds * rate));
    for (let i = 0; i < out.length; i++) out[i] = amp * Math.sin((2 * Math.PI * hz * i) / rate);
    return out;
  };
  const join = (...parts: Float32Array[]) => {
    const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
    let at = 0;
    for (const p of parts) { out.set(p, at); at += p.length; }
    return out;
  };
  // 4 s so the blocks across a join weigh as little as on a real recording; 1 s does for the rest
  const t = tone(0.1, 4);
  const short = tone(0.1, 1);
  const afterSilence = join(t, new Float32Array(48000));
  const afterQuiet = join(t, tone(0.01, 1));
  const at44 = tone(0.1, 1, 44100);
  const half = tone(0.5, 0.1);

  it("builds BS.1770's K-weighting filters, matching the standard's 48 kHz table", async () => {
    const [shelf, hp] = kWeighting(48000);
    const close = (got: number[], want: number[]) => got.forEach((v, i) => expect(v).toBeCloseTo(want[i], 6));
    close(shelf.b, [1.53512485958697, -2.69169618940638, 1.19839281085285]);
    close(shelf.a, [1, -1.69065929318241, 0.73248077421585]);
    close(hp.b, [1, -2, 1]);
    close(hp.a, [1, -1.99004745483398, 0.99007225036621]);
  });

  it("reads a 1 kHz tone at its level less 3 dB, counts both channels, and gates out silence and quiet bits", async () => {
    expect(integratedLoudness([t], 48000)!).toBeCloseTo(-23.01, 1);
    expect(integratedLoudness([short, short], 48000)!).toBeCloseTo(-20.0, 1);
    // ungated, these would read about -26; the blocks across the join pull a touch under -23
    expect(integratedLoudness([afterSilence], 48000)!).toBeGreaterThan(-23.3);
    expect(integratedLoudness([afterQuiet], 48000)!).toBeGreaterThan(-23.3);
    expect(integratedLoudness([at44], 44100)!).toBeCloseTo(-23.01, 1);
    expect(integratedLoudness([new Float32Array(48000 * 2)], 48000)).toBeNull();
  });

  it("finds a peak that falls between samples", async () => {
    // a quarter-rate wave sampled 45 degrees off its crests: every sample reads 0.707, the wave reaches 1
    const off = Float32Array.from({ length: 4800 }, (_, i) => Math.sin((Math.PI / 2) * i + Math.PI / 4));
    expect(truePeak([off])).toBeGreaterThan(-0.2);
    expect(truePeak([off])).toBeLessThan(0.1);
    expect(truePeak([half])).toBeCloseTo(-6.02, 1);
    expect(truePeak([new Float32Array(100)])).toBe(-Infinity);
  });

  it("steers the gain to -14 LUFS within half a LU, never lifting more than 20 dB", async () => {
    expect(nextGain(0, -21)).toBe(7);
    expect(nextGain(7, -11.2)).toBeCloseTo(4.2, 5);
    expect(nextGain(4.2, -14.3)).toBeNull();
    expect(nextGain(0, -50)).toBe(20);
  });

  it("keeps a measurement only while voice polish is as it was, and is part of the look", async () => {
    const level = { polish: true, before: -21.4, after: -14.1, peak: -1.2, gain: 6.8, trim: 0 };
    expect(levelFits(sanitizeLevel(level), true)).toBe(true);
    expect(levelFits(level, false)).toBe(false);
    expect(levelFits(undefined, false)).toBe(false);
    expect(sanitizeLevel({ ...level, gain: 99 })).toBeUndefined();
    expect(sanitizeLevel("loud")).toBeUndefined();
    const on = applyPatch(defaultSettings(), { loudness: true }).next;
    expect(on.loudness).toBe(true);
    expect(lookOf({ ...on, level }).loudness).toBe(true);
    expect(lookOf({ ...on, level })).not.toHaveProperty("level");
  });
});

describe("B-roll cutaways", () => {
  const credit = { thumb: "https://images.pexels.com/videos/1/p.jpeg", by: "Richard L", byUrl: "https://www.pexels.com/@r", url: "https://www.pexels.com/video/x-1/" };

  it("starts at the playhead for up to 4 seconds and stays inside the edit", async () => {
    expect(newBroll("br-1-abc", 2.37, 9, 30, credit)).toMatchObject({ key: "br-1-abc", from: 2.3, to: 6.3, length: 9, by: "Richard L" });
    expect(newBroll("br-1-abc", 1, 2, 30, credit)).toMatchObject({ from: 1, to: 3 }); // a 2 s clip covers 2 s
    expect(newBroll("br-1-abc", 29.9, 9, 30, credit)).toMatchObject({ from: 29.5, to: 30 });
  });

  it("shows the later cutaway where two overlap, and loops a short clip", async () => {
    const a = { id: "a", key: "br-a-1111", from: 1, to: 6, length: 2, ...credit };
    const b = { id: "b", key: "br-b-2222", from: 4, to: 5, length: 8, ...credit };
    expect(brollAt([a, b], 0.9)).toBeNull();
    expect(brollAt([a, b], 1.5)).toEqual({ b: a, t: 0.5 });
    expect(brollAt([a, b], 3.5)?.t).toBeCloseTo(0.5); // 2.5 s in, looped on a 2 s clip
    expect(brollAt([a, b], 4.2)?.b.id).toBe("b");
    expect(brollAt([a, b], 6)).toBeNull();
    expect(brollAt(undefined, 2)).toBeNull();
  });

  it("drops malformed cutaways and links that aren't Pexels", async () => {
    const ok = { id: "a", key: "br-a-1111", from: 1, to: 0, length: 0, ...credit, byUrl: "javascript:alert(1)" };
    expect(sanitizeBroll([ok, { ...ok, key: "../x" }, { ...ok, from: "soon" }, null])).toEqual([
      { id: "a", key: "br-a-1111", from: 1, to: 1.5, length: 0.5, thumb: credit.thumb, by: "Richard L", byUrl: "", url: credit.url },
    ]);
    expect(sanitizeBroll("x")).toEqual([]);
  });
});

describe("background music", () => {
  it("finds when someone is talking on the edited timeline, joining short gaps and skipping cut words", async () => {
    const ws = [W("So", 1, 1.4), W("this", 1.6, 2), W("works.", 2.1, 2.5), W("Next", 4, 4.5), W("um", 6, 6.3), W("bit.", 8, 8.4)];
    expect(speechSpans(ws, [{ start: 0, end: 10 }])).toEqual([{ s: 1, e: 2.5 }, { s: 4, e: 4.5 }, { s: 6, e: 6.3 }, { s: 8, e: 8.4 }]);
    // the um cut out, the rest moved up by its length; at 2x everything halves
    const segs = [{ start: 0, end: 5.9 }, { start: 6.4, end: 10 }];
    expect(speechSpans(ws, segs).map((x) => x.s)).toEqual([1, 4, 7.5]);
    const late = speechSpans([W("um", 0.2, 0.5), W("Hi", 1, 1.3)], [{ start: 0.6, end: 5 }]);
    expect(late).toHaveLength(1);
    expect(late[0].s).toBeCloseTo(0.4, 5);
    expect(late[0].e).toBeCloseTo(0.7, 5);
    // at 2x the gaps halve too, so more of it joins up
    expect(speechSpans(ws, [{ start: 0, end: 10 }], 2)).toEqual([{ s: 0.5, e: 3.15 }, { s: 4, e: 4.2 }]);
  });

  it("plays at its level, drops to a quarter under speech with short ramps, and fades out at the end", async () => {
    const spans = [{ s: 2, e: 4 }, { s: 8, e: 9 }];
    expect(musicGainAt(spans, 1, 0.4, 20)).toBeCloseTo(0.4, 5);
    expect(musicGainAt(spans, 3, 0.4, 20)).toBeCloseTo(0.4 * MUSIC_DUCK, 5);
    expect(musicGainAt(spans, 2 - 0.075, 0.4, 20)).toBeCloseTo(0.4 * (MUSIC_DUCK + (1 - MUSIC_DUCK) * 0.5), 5);
    expect(musicGainAt(spans, 4.25, 0.4, 20)).toBeCloseTo(0.4 * (MUSIC_DUCK + (1 - MUSIC_DUCK) * 0.5), 5);
    expect(musicGainAt(spans, 6, 0.4, 20)).toBeCloseTo(0.4, 5);
    expect(musicGainAt([], 19.5, 0.4, 20)).toBeCloseTo(0.2, 5);
    expect(musicGainAt([], 21, 0.4, 20)).toBe(0);
  });

  it("drops under the voiceover too, in time order", async () => {
    const spans = duckSpans([W("Hi", 1, 1.5), W("there", 9, 9.5)], [{ start: 0, end: 12 }], { voiceover: { key: "vo-abcd", start: 4, length: 2 } });
    expect(spans).toEqual([{ s: 1, e: 1.5 }, { s: 4, e: 6 }, { s: 9, e: 9.5 }]);
    expect(musicGainAt(spans, 5, 0.4, 20)).toBeCloseTo(0.4 * MUSIC_DUCK, 5);
    expect(duckSpans([W("Hi", 2, 3)], [{ start: 0, end: 12 }], { speed: 2 })).toEqual([{ s: 1, e: 1.5 }]);
  });

  it("keeps only a well-formed stored track", async () => {
    expect(sanitizeMusic({ key: "mu-v1-abc", name: "Lofi.mp3", level: 0.5 })).toEqual({ key: "mu-v1-abc", name: "Lofi.mp3", level: 0.5 });
    expect(sanitizeMusic({ key: "mu-v1-abc", level: 7 })).toEqual({ key: "mu-v1-abc", name: "Music", level: 1 });
    expect(sanitizeMusic({ key: "../etc", name: "x" })).toBeUndefined();
    expect(sanitizeMusic(null)).toBeUndefined();
  });
});

describe("export size per platform", () => {
  it("keeps the old WhatsApp choice and falls back to Instagram", async () => {
    expect(targetOf({ exportAs: "small", exportFor: "tiktok" })).toBe("whatsapp");
    expect(targetOf({})).toBe("reels");
    expect(targetOf({ exportFor: "linkedin" })).toBe("linkedin");
    expect(targetOf({ exportFor: "myspace" as never })).toBe("reels");
  });

  it("sizes WhatsApp at 720p, lowering the bitrate to land under 16 MB, and says when it can't", async () => {
    const short = exportSize({ exportAs: "small", aspect: "9:16" }, 20, 1080, 1920);
    expect([short.w, short.h]).toEqual([720, 1280]);
    expect(short.videoBps).toBe(2_500_000);
    expect(short.fits).toBe(true);
    const minute = exportSize({ exportFor: "whatsapp", aspect: "9:16" }, 60, 1080, 1920);
    expect(minute.videoBps).toBeLessThan(2_500_000);
    expect(minute.bytes).toBeLessThanOrEqual(16_000_000 * 0.9 + 1);
    expect(minute.bytes).toBeGreaterThan(16_000_000 * 0.85);
    const long = exportSize({ exportFor: "whatsapp", aspect: "9:16" }, 600, 1080, 1920);
    expect(long.videoBps).toBe(MIN_VIDEO_BPS);
    expect(long.fits).toBe(false);
    expect(long.maxSeconds).toBe(165);
    expect(exportSize({ exportFor: "whatsapp", aspect: "16:9" }, 10, 1920, 1080)).toMatchObject({ w: 1280, h: 720 });
  });

  it("keeps full quality where the cap is far off, and fits a long TikTok under 72 MB", async () => {
    expect(exportSize({ aspect: "9:16" }, 600, 1080, 1920)).toMatchObject({ w: 1080, h: 1920, videoBps: 8_000_000, fits: true, capBytes: 0 });
    const tt = exportSize({ exportFor: "tiktok", aspect: "9:16" }, 180, 1080, 1920);
    expect(tt.videoBps).toBeLessThan(8_000_000);
    expect(tt.bytes).toBeLessThanOrEqual(72_000_000 * 0.9 + 1);
    expect(exportSize({ exportFor: "tiktok", aspect: "9:16" }, 30, 1080, 1920).videoBps).toBe(8_000_000);
    expect(exportSize({ exportAs: "audio", aspect: "9:16" }, 80, 1080, 1920)).toMatchObject({ videoBps: 0, bytes: 1_280_000, fits: true });
  });

  it("reads sizes plainly and flags a file over the cap", async () => {
    expect([fmtBytes(850_000), fmtBytes(4_260_000), fmtBytes(14_400_000), fmtBytes(1_230_000_000)]).toEqual(["850 KB", "4.3 MB", "14 MB", "1.2 GB"]);
    const base = { seconds: 10, kind: "small" as const, captions: false, hasWords: true, sound: true };
    const m = { seconds: 10, level: -14, gap: null };
    expect(exportIssues(m, { ...base, size: { bytes: 17_300_000, cap: 16_000_000, label: "WhatsApp" } }).map((i) => i.text)).toEqual(["The file is 17 MB, over the 16 MB WhatsApp takes. Trim it, then export again."]);
    expect(exportIssues(m, { ...base, size: { bytes: 15_000_000, cap: 16_000_000, label: "WhatsApp" } })).toEqual([]);
    expect(exportIssues(m, { ...base, size: { bytes: 90_000_000, cap: 0, label: "Instagram" } })).toEqual([]);
  });
});

describe("callouts and cutaways", () => {
  it("times sentences on the edited timeline, leaving out what was cut", async () => {
    const ws = [W("Most", 1, 1.3), W("people.", 1.3, 1.8), W("um", 2, 2.4), W("CPF", 4, 4.4), W("grows.", 4.4, 5)];
    expect(editedSentences(ws, [{ start: 0, end: 1.9 }, { start: 2.5, end: 6 }])).toEqual([
      { s: 1, e: 1.8, text: "Most people." },
      { s: 3.4, e: 4.4, text: "CPF grows." },
    ]);
    expect(editedSentences(ws, [{ start: 0, end: 6 }], 2)[0]).toEqual({ s: 0.5, e: 0.9, text: "Most people." });
  });

  it("keeps only well-formed stored suggestions", async () => {
    expect(sanitizeCutaways([{ at: 4, until: 9, callout: "4% a year", show: "A chart" }, { at: "x", callout: "y" }, { at: 2, callout: "" }, null])).toEqual([
      { at: 4, until: 9, callout: "4% a year", show: "A chart" },
    ]);
    expect(sanitizeCutaways({})).toEqual([]);
    expect(sanitizeCutaways([{ at: 5, until: 1, callout: "Back to front" }])[0].until).toBe(5);
  });
});

describe("title and cover ideas", () => {
  it("keeps only a well-formed stored idea", async () => {
    expect(sanitizePublish({ titles: ["One", 5, "Two", "Three", "Four"], cover: "Cover line", at: 4.2 })).toEqual({ titles: ["One", "Two", "Three"], cover: "Cover line", at: 4.2 });
    expect(sanitizePublish({ titles: ["One"], cover: "x", at: "soon" })).toEqual({ titles: ["One"], cover: "x", at: null });
    expect(sanitizePublish({ titles: [], cover: "x" })).toBeUndefined();
    expect(sanitizePublish({ titles: ["One"], cover: "x", at: 1, line2: "Before you sign anything at all, read this" })?.line2).toBe("Before you sign anything at al");
    expect(sanitizePublish(null)).toBeUndefined();
  });
});

describe("joining takes", () => {
  const take = (duration: number, start = 0, end = duration) => ({ duration, start, end });
  it("moves a trim edge to the playhead, keeping at least half a second and inside the take", async () => {
    expect(trimTake(take(10), "start", 3)).toEqual(take(10, 3, 10));
    expect(trimTake(take(10, 3, 10), "end", 2)).toEqual(take(10, 3, 3.5));
    expect(trimTake(take(10, 0, 4), "start", 9)).toEqual(take(10, 3.5, 4));
    expect(trimTake(take(10), "end", 12)).toEqual(take(10, 0, 10));
    expect(trimTake(take(10), "start", -1)).toEqual(take(10, 0, 10));
  });
  it("moves a take up or down and stays put at either end", async () => {
    expect(moveTake(["a", "b", "c"], 2, -1)).toEqual(["a", "c", "b"]);
    expect(moveTake(["a", "b", "c"], 0, 1)).toEqual(["b", "a", "c"]);
    expect(moveTake(["a", "b", "c"], 0, -1)).toEqual(["a", "b", "c"]);
    expect(moveTake(["a", "b", "c"], 2, 1)).toEqual(["a", "b", "c"]);
  });
  it("needs two takes and a joined length that can still be captioned", async () => {
    expect(joinIssue([take(10)])).toBe("Add at least 2 takes.");
    expect(joinedLength([take(10, 2, 6), take(5)])).toBe(9);
    expect(joinIssue([take(10, 2, 6), take(5)])).toBeNull();
    expect(joinIssue([take(MAX_JOIN_SECONDS), take(5)])).toBe("Together they run 12:05.0. Trim them under 12 minutes so they can be captioned.");
  });
});

describe("audio-only sources", () => {
  it("reads loudness per 1/20 s, scaled to the loud end", () => {
    const rate = 1000;
    const pcm = new Float32Array(rate); // 1 s: quiet first half, loud second half
    for (let i = 500; i < 1000; i++) pcm[i] = i % 2 ? 0.5 : -0.5;
    const p = peaksFrom(pcm, rate);
    expect(p).toHaveLength(20);
    expect(p.slice(0, 10).every((x) => x === 0)).toBe(true);
    expect(p.slice(10).every((x) => x === 1)).toBe(true);
    expect(peaksFrom(new Float32Array(100), rate).every((x) => x === 0)).toBe(true);
  });

  it("centres the bars on the moment, empty past either end", () => {
    const peaks = [0.1, 0.2, 0.3, 0.4, 0.5];
    expect(waveAt(peaks, 0.1, 3)).toEqual([0.2, 0.3, 0.4]);
    expect(waveAt(peaks, 0, 3)).toEqual([0, 0.1, 0.2]);
    expect(waveAt(peaks, 1, 3)).toEqual([0, 0, 0]);
  });

  it("gives a sound-only source the vertical frame when it asks for the original size", () => {
    expect(aspectSize("original", 0, 0)).toEqual([1080, 1920]);
    expect(aspectSize("original", 1920, 1080)).toEqual([1920, 1080]);
  });
});

describe("dubbing", () => {
  it("lays each dubbed line where the original starts, never over the one before, and stops at the end", () => {
    const cues = [{ s: 0.5 }, { s: 2 }, { s: 3 }, { s: 9.95 }];
    const spans = [{ s: 0, e: 2.5 }, null, { s: 2.6, e: 3.6 }, { s: 3.7, e: 4.5 }];
    expect(dubPlacement(spans, cues, 10)).toEqual([
      { at: 0.5, from: 0, dur: 2.5 },
      { at: 3.05, from: 2.6, dur: 1 },
    ]);
    expect(dubPlacement([{ s: 0, e: 20 }], [{ s: 1 }], 10)).toEqual([{ at: 1, from: 0, dur: 9 }]);
  });
});

describe("videos made without filming", () => {
  it("cuts a voiceover at its quietest moment before each 9.5 second limit", async () => {
    const { planSlices } = await import("@/lib/videoEdit");
    const frame = 0.02;
    const total = 26;
    const energy = Array.from({ length: total / frame }, (_, i) => ([420, 860].includes(i) ? 0.001 : 0.2));
    const slices = planSlices(energy, frame, total, 9.5);
    expect(slices.map((s) => [s.start, s.end].map((t) => Math.round(t * 100) / 100))).toEqual([[0, 8.41], [8.41, 17.21], [17.21, 26]]);
    expect(slices.every((s) => s.end - s.start <= 9.5)).toBe(true);
  });

  it("keeps a short voiceover whole, cuts flat sound at the limit and never leaves a tail under half a second", async () => {
    const { planSlices } = await import("@/lib/videoEdit");
    expect(planSlices([], 0.02, 6, 9.5)).toEqual([{ start: 0, end: 6 }]);
    const flat = new Array(1000).fill(0.1);
    const s = planSlices(flat, 0.02, 19.7, 9.5);
    expect(s.length).toBe(3);
    expect(s.every((x) => x.end - x.start <= 9.5 && x.end - x.start >= 0.5)).toBe(true);
    const tail = planSlices(flat, 0.02, 9.8, 9.5);
    expect(tail[1].end - tail[1].start).toBeGreaterThanOrEqual(0.5);
  });

  it("shares the voiceover across scenes by their words", async () => {
    const { sceneSeconds } = await import("@/lib/videoEdit");
    expect(sceneSeconds(["one two three", "four", "five six seven eight nine ten"], 20)).toEqual([6, 2, 12]);
    expect(sceneSeconds(["", "a b"], 9)).toEqual([3, 6]);
  });
});

describe("makeupDb", () => {
  // Web Audio's compressor lifts its output by 0.6 of a full-scale sound's cut; measured in Chrome 154 offline (2026-10-10)
  it("matches the make-up gain the voice limiter and the mix limiter add", () => {
    expect(makeupDb(-6, 20)).toBeCloseTo(3.42, 2);
    expect(makeupDb(-1, 20)).toBeCloseTo(0.57, 2);
  });
});

describe("a wide export for an upright feed", () => {
  const wide = (s: Parameters<typeof exportSize>[0], w = 1920, h = 1080) => wideForUpright(exportSize(s, 30, w, h));
  it("is flagged for Instagram, TikTok and YouTube Shorts", () => {
    expect(wide({ aspect: "16:9" })).toBe(true);
    expect(wide({ aspect: "16:9", exportFor: "tiktok" })).toBe(true);
    expect(wide({ aspect: "16:9", exportFor: "shorts" })).toBe(true);
    // the original shape of a landscape recording is wide too
    expect(wide({ aspect: "original" })).toBe(true);
  });
  it("is not flagged for an upright or square frame, LinkedIn, WhatsApp or sound only", () => {
    expect(wide({ aspect: "9:16" })).toBe(false);
    expect(wide({ aspect: "1:1" })).toBe(false);
    expect(wide({ aspect: "original" }, 1080, 1920)).toBe(false);
    expect(wide({ aspect: "16:9", exportFor: "linkedin" })).toBe(false);
    expect(wide({ aspect: "16:9", exportAs: "small" })).toBe(false);
    expect(wide({ aspect: "16:9", exportAs: "audio" })).toBe(false);
  });
});

describe("green screen: a video behind you and where you stand", () => {
  it("keeps a video backdrop with a bd- key and drops one without", () => {
    expect(sanitizeBackdrop({ kind: "video", key: "bd-gs-x2abc" })).toEqual({ kind: "video", key: "bd-gs-x2abc" });
    expect(sanitizeBackdrop({ kind: "video", key: "v1abc-x2" })).toBeUndefined();
    expect(sanitizeBackdrop({ kind: "video" })).toBeUndefined();
    expect(sanitizeBackdrop({ kind: "film", key: "bd-gs-x2abc" })).toBeUndefined();
  });

  it("keeps bottom and corner and drops anything else, so settings saved before load unchanged", () => {
    expect(sanitizeStand("bottom")).toBe("bottom");
    expect(sanitizeStand("corner")).toBe("corner");
    expect(sanitizeStand("left")).toBeUndefined();
    expect(sanitizeStand(undefined)).toBeUndefined();
    const before = { ...defaultSettings("bold"), backdrop: { kind: "picture", key: "bd-v1abc-x2" } };
    expect(sanitizeBackdrop(before.backdrop)).toEqual(before.backdrop);
    expect(sanitizeStand((before as { stand?: unknown }).stand)).toBeUndefined();
    expect(standOf(before as Parameters<typeof standOf>[0])).toBeUndefined();
  });

  it("moves the speaker only over a backdrop that covers the frame", () => {
    expect(standOf({ backdrop: { kind: "video", key: "bd-gs-x2abc" }, stand: "corner" })).toBe("corner");
    expect(standOf({ backdrop: { kind: "colour", color: "#111827" }, stand: "bottom" })).toBe("bottom");
    expect(standOf({ backdrop: { kind: "blur", amount: 0.6 }, stand: "bottom" })).toBeUndefined();
    expect(standOf({ stand: "bottom" })).toBeUndefined();
  });

  const inside = (b: { x: number; y: number; w: number; h: number }, W: number, H: number) =>
    b.x >= -1e-9 && b.y >= -1e-9 && b.x + b.w <= W + 1e-9 && b.y + b.h <= H + 1e-9;

  it("puts the speaker at 70% height on the bottom edge, centred, at 9:16 and 4:5", () => {
    for (const [W, H] of [[1080, 1920], [1080, 1350]]) {
      const b = standBox("bottom", W, H, W, H);
      expect(b.h).toBeCloseTo(H * 0.7);
      expect(b.w).toBeCloseTo(W * 0.7);
      expect(b.y + b.h).toBeCloseTo(H);
      expect(b.x + b.w / 2).toBeCloseTo(W / 2);
      expect(inside(b, W, H)).toBe(true);
    }
  });

  it("puts the speaker at 45% width in the bottom left corner with a 4% margin, at 9:16 and 4:5", () => {
    for (const [W, H] of [[1080, 1920], [1080, 1350]]) {
      const b = standBox("corner", W, H, W, H);
      expect(b.w).toBeCloseTo(W * 0.45);
      expect(b.x).toBeCloseTo(W * 0.04);
      expect(b.y + b.h).toBeCloseTo(H - W * 0.04);
      expect(inside(b, W, H)).toBe(true);
    }
  });

  it("keeps a picture too wide or too tall for the box inside the frame", () => {
    for (const stand of ["bottom", "corner"] as const) {
      for (const [pw, ph] of [[1920, 1080], [400, 4000], [1, 1]]) {
        expect(inside(standBox(stand, 1080, 1920, pw, ph), 1080, 1920)).toBe(true);
        expect(inside(standBox(stand, 1080, 1350, pw, ph), 1080, 1350)).toBe(true);
      }
    }
  });
});

describe("the brand's name in the captions", () => {
  const w = (word: string, s: number, e: number) => ({ w: word, s, e });

  it("writes the name back as the brand kit has it, spaced or in any case", () => {
    const words = [w("Try", 0, 0.2), w("Activity", 0.3, 0.6), w("Tracker", 0.6, 0.9), w("or", 1, 1.1), w("activitytracker.", 1.2, 1.8)];
    const out = applyFixes(words, brandFixes("ActivityTracker"));
    expect(out.count).toBe(2);
    expect(out.words.map((x) => x.w)).toEqual(["Try", "ActivityTracker", "or", "ActivityTracker."]);
    expect(out.words[1]).toEqual({ w: "ActivityTracker", s: 0.3, e: 0.9 });
    // already right: nothing counted
    expect(applyFixes([w("ActivityTracker", 0, 1)], brandFixes("ActivityTracker")).count).toBe(0);
  });

  it("fixes a spaced name run together or in lower case", () => {
    const out = applyFixes([w("moneybees", 0, 1), w("money", 1, 1.2), w("bees!", 1.2, 1.5)], brandFixes("Money Bees"));
    expect(out.words.map((x) => x.w)).toEqual(["Money Bees", "Money Bees!"]);
  });

  it("leaves a one-word name, an empty one and a name too long to save alone", () => {
    expect(brandFixes("AT")).toEqual([]);
    expect(brandFixes("Fastlane")).toEqual([]);
    expect(brandFixes("")).toEqual([]);
    expect(brandFixes(undefined)).toEqual([]);
    expect(brandFixes("The Very Long Brand Name Of Some Company Pte Ltd")).toEqual([]);
  });

  it("lets the adviser's own fix win over the brand's", () => {
    const words = [w("Activity", 0, 0.3), w("Tracker", 0.3, 0.6)];
    const out = applyFixes(words, [{ from: "activity tracker", to: "Activity Tracker app" }, ...brandFixes("ActivityTracker")]);
    expect(out.words[0].w).toBe("Activity Tracker app");
  });
});

describe("caption key words and the caption look (edit-captions)", () => {
  const w = (word: string, s: number, e: number) => ({ w: word, s, e });

  it("keeps stored key words only when well formed: a time each, emoji from the pop-ups' set, at most 200", async () => {
    const { sanitizeKeyWords, MAX_KEY_WORDS } = await import("./videoEdit");
    expect(sanitizeKeyWords([{ at: 1.2, emoji: "⏰" }, { at: 2, emoji: "\u{1F680}" }, { at: -1 }, { at: "x" }, null, { at: 3, emoji: 5 }])).toEqual([{ at: 1.2, emoji: "⏰" }, { at: 2 }, { at: 3 }]);
    expect(sanitizeKeyWords(Array.from({ length: 250 }, (_, i) => ({ at: i })))).toHaveLength(MAX_KEY_WORDS);
    expect(sanitizeKeyWords(undefined)).toBeUndefined();
    expect(sanitizeKeyWords([])).toEqual([]);
  });

  it("saves the two switches in a look, never this video's key words", async () => {
    const { captionLookOf } = await import("./videoEdit");
    const mine = { ...defaultSettings("native"), keyWordsOn: true, captionEmoji: true, keyWords: [{ at: 1 }], hook: "3 CPF mistakes", trimStart: 2, aspect: "4:5" as const, logo: true };
    expect(lookOf(mine)).toMatchObject({ keyWordsOn: true, captionEmoji: true });
    expect(lookOf(mine)).not.toHaveProperty("keyWords");
    expect(withLook(defaultSettings("bold"), lookOf(mine))).toMatchObject({ style: "native", keyWordsOn: true, captionEmoji: true });
    expect(withLook(defaultSettings("bold"), lookOf(mine)).keyWords).toBeUndefined();
    // the captions alone: none of the cut, frame, hook or brand keys
    expect(Object.keys(captionLookOf(mine)).sort()).toEqual(["activeColor", "baseColor", "captionEmoji", "captions", "highlightNumbers", "keyWordsOn", "position", "size", "style", "uppercase", "wordsPerCaption"]);
    // an edit with neither switch has the same look as before they existed
    expect(Object.keys(lookOf(defaultSettings("bold")))).not.toContain("keyWordsOn");
  });

  it("names the TikTok style Outline for Leo only", async () => {
    const { styleLabel } = await import("./videoEdit");
    expect(styleLabel("native", true)).toBe("Outline");
    expect(styleLabel("native", false)).toBe("TikTok");
    expect(styleLabel("bold", true)).toBe("Bold");
  });

  it("lights a word by its start, with its emoji only when emoji are on", async () => {
    const { keyWordOf } = await import("./videoEdit");
    const s = { keyWordsOn: true, captionEmoji: false, keyWords: [{ at: 1.5, emoji: "⏰" }] };
    expect(keyWordOf(s, { s: 1.5 })).toEqual({ emoji: "" });
    expect(keyWordOf({ ...s, captionEmoji: true }, { s: 1.5 })).toEqual({ emoji: "⏰" });
    expect(keyWordOf(s, { s: 1.6 })).toBeNull();
    expect(keyWordOf({ ...s, keyWordsOn: false }, { s: 1.5 })).toBeNull();
  });

  it("reads the lines as the edit plays them, each with its words from the source", async () => {
    const { keyLines } = await import("./videoEdit");
    const words = [w("Most", 0, 0.3), w("people", 0.3, 0.7), w("um", 0.8, 1.0), w("overpay.", 1.1, 1.6), w("Check", 4.0, 4.3), w("yours.", 4.3, 4.8)];
    const segs = keepSegments(words, 6, { trimStart: 0, trimEnd: 0, removeFillers: true, maxPause: 0.6 });
    const lines = keyLines(words, segs, 1);
    expect(lines.map((l) => l.text)).toEqual(editedSentences(words, segs, 1).map((x) => x.text));
    expect(lines.map((l) => l.words.map((x) => x.w))).toEqual([["Most", "people", "overpay."], ["Check", "yours."]]);
    expect(lines[1].words[0]).toBe(words[4]);
  });

  it("gives Whisper the right spelling of each saved fix, newest first, at most 20 of up to 30 characters", async () => {
    const { captionTerms } = await import("./videoEdit");
    expect(captionTerms([{ from: "medi shield", to: "MediShield" }, { from: "activity tracker", to: "ActivityTracker" }, { from: "x", to: "a".repeat(31) }, { from: "y", to: "Tan, Leo" }, { from: "medishield", to: "mediShield" }])).toEqual(["mediShield", "ActivityTracker"]);
    expect(captionTerms(Array.from({ length: 30 }, (_, i) => ({ from: `w${i}`, to: `W${i}` })))).toHaveLength(20);
  });
});

describe("fixing a line in an AI video (people-dub-lipsync)", () => {
  // three Speak parts with their captions: 0-4, 4-9 and 9-13 seconds
  const parts = [
    { text: "Most people overpay.", start: 0, end: 4, clip: "ai-slice-j1-0-0" },
    { text: "They need a plan.", start: 4, end: 9, clip: "ai-slice-j1-1-0" },
    { text: "Check yours today.", start: 9, end: 13, clip: "ai-slice-j1-2-0" },
  ];
  const words = [
    W("Most", 0.2, 0.6), W("people", 0.6, 1.1), W("overpay.", 1.1, 2), W("They", 4.3, 4.7), W("need", 4.7, 5), W("a", 5, 5.1), W("plan.", 5.1, 6),
    W("Check", 9.2, 9.6), W("yours", 9.6, 10), W("today.", 10, 10.8),
  ];

  it("replaces part 2 of 3 and keeps parts 1 and 3 at their times when the new line runs as long", async () => {
    const { replaceParts } = await import("./videoEdit");
    const r = replaceParts(words, parts, [{ i: 1, text: "They need one plan they understand.", seconds: 5, clip: "ai-slice-j1-1-1" }]);
    expect(r.parts).toEqual([parts[0], { text: "They need one plan they understand.", start: 4, end: 9, clip: "ai-slice-j1-1-1" }, parts[2]]);
    expect(r.words.slice(0, 3)).toEqual(words.slice(0, 3));
    expect(r.words.slice(-3)).toEqual(words.slice(-3));
    const mid = r.words.slice(3, -3);
    expect(mid.map((x) => x.w)).toEqual(["They", "need", "one", "plan", "they", "understand."]);
    // laid over the part in order, end to end
    expect(mid[0].s).toBe(4);
    expect(mid.at(-1)!.e).toBe(9);
    for (let k = 1; k < mid.length; k++) expect(mid[k].s).toBe(mid[k - 1].e);
  });

  it("moves part 3 and its captions by what part 2 grew, and leaves part 1 alone", async () => {
    const { replaceParts } = await import("./videoEdit");
    const r = replaceParts(words, parts, [{ i: 1, text: "They need a plan they understand.", seconds: 6.5, clip: "ai-slice-j1-1-1" }]);
    expect(r.parts.map((p) => [p.start, p.end])).toEqual([[0, 4], [4, 10.5], [10.5, 14.5]]);
    expect(r.parts[2]).toMatchObject({ text: "Check yours today.", clip: "ai-slice-j1-2-0" });
    expect(r.words.slice(0, 3)).toEqual(words.slice(0, 3));
    expect(r.words.slice(-3)).toEqual([W("Check", 10.7, 11.1), W("yours", 11.1, 11.5), W("today.", 11.5, 12.3)]);
  });

  it("finds the part a moment falls in, and lays typed words by their letters", async () => {
    const { partAt, spreadWords } = await import("./videoEdit");
    expect([0, 3.99, 4, 12, 99].map((t) => partAt(parts, t))).toEqual([0, 0, 1, 2, 2]);
    expect(spreadWords("ab cd", 2, 4)).toEqual([W("ab", 2, 3), W("cd", 3, 4)]);
    expect(spreadWords("   ", 0, 1)).toEqual([]);
  });
});
