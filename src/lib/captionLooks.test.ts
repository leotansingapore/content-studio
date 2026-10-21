import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { STYLE_IDS, defaultSettings, keyLines, lookOf, type EditSettings, type Word } from "./videoEdit";
import { drawFrame, planFor } from "./videoMedia";
import { CAPTION_LOOKS, captionLookIn, captionsAsDefault, keyCount, keyWordsFrom, keysStale, tapKeyWord, withCaptionLook } from "./captionLooks";
import { presetLabel, PRESETS } from "./stylePresets";

vi.mock("@/lib/fastExport", () => ({ exportFast: async () => ({ blob: new Blob(["mp4"]), ext: "mp4", seconds: 3, cap: 0, label: "Instagram" }) }));

/** A 1080x1920 context that keeps every call and every property set, in order; text is 0.5 em a character. */
function recorder() {
  const log: unknown[] = [];
  const state: Record<string, unknown> = { font: "10px sans-serif" };
  const px = () => Number(/(\d+(?:\.\d+)?)px/.exec(String(state.font))?.[1] ?? 10);
  const ctx: CanvasRenderingContext2D = new Proxy({} as CanvasRenderingContext2D, {
    get: (_, k) => {
      if (k === "canvas") return { width: 1080, height: 1920 };
      if (typeof k === "string" && k in state) return state[k];
      if (k === "measureText") return (t: string) => ({ width: Math.round(t.length * px() * 0.5 * 100) / 100 });
      if (k === "createLinearGradient" || k === "createRadialGradient") return () => ({ addColorStop: () => {} });
      return (...args: unknown[]) => {
        log.push([k, ...args.map((a) => (typeof a === "number" ? Math.round(a * 100) / 100 : a))]);
        return undefined;
      };
    },
    set: (_, k, v) => {
      state[k as string] = v;
      log.push([k, v]);
      return true;
    },
  });
  return { ctx, log };
}

// said with a number, a dollar figure, a sentence break and a pause, so every caption rule comes into play
const WORDS: Word[] = "Most people pay $500 for cover they never read. Here is the 3% rule I use with every client today."
  .split(" ")
  .map((w, i) => ({ w, s: i * 0.4 + (i > 8 ? 1.2 : 0), e: i * 0.4 + 0.32 + (i > 8 ? 1.2 : 0) }));
const VIDEO = { videoWidth: 1080, videoHeight: 1920 } as HTMLVideoElement;

function draw(s: EditSettings, src: number, still = false) {
  const { ctx, log } = recorder();
  const plan = planFor(WORDS, 10, s);
  drawFrame(ctx, { video: VIDEO, settings: s, ...plan, src, out: src, total: plan.total, still });
  return log;
}

describe("today's captions (pinned at c49a22ca, before key words)", () => {
  it("draw every style, box, animation, case and number rule the same way as before", () => {
    const out: string[] = [];
    for (const style of STYLE_IDS) {
      for (const extra of [{}, { captionBox: "pill" as const }, { captionBox: "word" as const, font: "clean" as const }, { captionAnim: "type" as const, uppercase: false }, { highlightNumbers: true, wordsPerCaption: 5, size: 1.3 }, { highlightNumbers: false, position: "top" as const, captionAnim: "slide" as const }]) {
        const s: EditSettings = { ...defaultSettings(style), progressBar: false, punchIn: false, ...extra };
        for (const [src, still] of [[0.1, false], [1.25, true], [1.3, false], [4.85, false], [6.05, true]] as const) out.push(JSON.stringify(draw(s, src, still)));
      }
    }
    expect(out.length).toBe(6 * 6 * 5);
    expect(out.join("").includes("fillText")).toBe(true);
    expect(createHash("sha256").update(out.join("\n")).digest("hex")).toBe("5088c03ada6d8a8a5e0a7a4881a09a9a4b277b4de4b7b8b2111f3ca3c4e9967a");
  });
});

describe("caption looks", () => {
  // an edit with its own cuts, hook and frame, in a style with its own box and font
  const mine: EditSettings = { ...defaultSettings("editorial"), hook: "3 CPF mistakes", hookSeconds: 4, trimStart: 1.5, trimEnd: 0.5, maxPause: 0.3, removed: [{ s: 2, e: 3 }], aspect: "4:5", fit: "blur", focusX: 0.3, captionBox: "pill", font: "serif", size: 1.4 };
  const kept = (s: EditSettings) => ({ hook: s.hook, hookSeconds: s.hookSeconds, trimStart: s.trimStart, trimEnd: s.trimEnd, maxPause: s.maxPause, removed: s.removed, aspect: s.aspect, fit: s.fit, focusX: s.focusX });

  it("apply through withLook without touching cuts, hook or frame", () => {
    for (const l of CAPTION_LOOKS) {
      const next = withCaptionLook(mine, l);
      expect(kept(next)).toEqual(kept(mine));
      expect(next).toMatchObject(l.look);
      expect(captionLookIn(next)?.id).toBe(l.id);
    }
  });
  it("are the spec's four", () => {
    expect(withCaptionLook(mine, CAPTION_LOOKS[0])).toMatchObject({ style: "bold", captionBox: "word", font: "clean", uppercase: false, wordsPerCaption: 4, size: 1 });
    expect(withCaptionLook(mine, CAPTION_LOOKS[1])).toMatchObject({ style: "native", keyWordsOn: true, activeColor: "#FFD92B", captionBox: undefined, font: undefined });
    expect(withCaptionLook(mine, CAPTION_LOOKS[2])).toMatchObject({ style: "bold", wordsPerCaption: 2, size: 1.3, captionBox: undefined });
    expect(withCaptionLook(mine, CAPTION_LOOKS[3])).toMatchObject({ style: "minimal", captionAnim: "type", size: 1 });
    expect(CAPTION_LOOKS.map((l) => l.label)).toEqual(["Boxed word", "Key word", "Two words", "Typewriter"]);
  });
  it("read as none once a colour changes, or on a plain style", () => {
    expect(captionLookIn({ ...withCaptionLook(mine, CAPTION_LOOKS[2]), baseColor: "#FF0000" })).toBeNull();
    expect(captionLookIn(defaultSettings("bold"))).toBeNull();
  });
  it("name the TikTok native preset Quick and plain for Leo only", () => {
    const native = PRESETS.find((p) => p.id === "native")!;
    expect(presetLabel(native, true)).toBe("Quick and plain");
    expect(presetLabel(native, false)).toBe("TikTok native");
    expect(presetLabel(PRESETS[0], true)).toBe(PRESETS[0].label);
  });
});

describe("Use for every new video", () => {
  const s: EditSettings = { ...withCaptionLook(defaultSettings("bold"), CAPTION_LOOKS[0]), captionEmoji: true, hook: "Mine", trimStart: 3 };

  it("replaces only the caption keys of today's default skill", () => {
    const def = { id: "k1", name: "Punchy", look: { ...lookOf(defaultSettings("editorial")), maxPause: 0.3, logo: true, captionAnim: "slide" }, prompt: "hook: my biggest number", isDefault: true, updatedAt: "2026-10-01" };
    const next = captionsAsDefault(def, s, "new");
    expect(next).toMatchObject({ id: "k1", name: "Punchy", prompt: "hook: my biggest number", isDefault: true });
    expect(next.look).toMatchObject({ style: "bold", captionBox: "word", font: "clean", wordsPerCaption: 4, captionEmoji: true, maxPause: 0.3, logo: true, grade: true });
    // the old default's own animation goes with its other caption keys
    expect(next.look).not.toHaveProperty("captionAnim");
    expect(next.look).not.toHaveProperty("hook");
  });
  it("makes a default skill My captions when there is none", () => {
    expect(captionsAsDefault(null, s, "skill-1")).toEqual({ id: "skill-1", name: "My captions", look: expect.objectContaining({ style: "bold", captionBox: "word" }), isDefault: true });
    expect(captionsAsDefault(null, s, "skill-1").look).not.toHaveProperty("maxPause");
  });
});

describe("key words on an edit", () => {
  const w = (word: string, s: number) => ({ w: word, s, e: s + 0.3 });
  const words = [w("Your", 0), w("premium", 0.4), w("jumps", 0.8), w("at", 1.2), w("65.", 1.5), w("Check", 3), w("the", 3.4), w("rider.", 3.8)];
  const lines = keyLines(words, [{ start: 0, end: 5 }], 1);

  it("keep the picked word by its source start, with its emoji", () => {
    expect(keyWordsFrom(lines, [{ line: 0, word: "65", emoji: "\u23F0" }, { line: 1, word: null }])).toEqual([{ at: 1.5, emoji: "\u23F0" }]);
    expect(keyWordsFrom(lines, [{ line: 1, word: "rider" }, { line: 5, word: "rider" }, { line: 0, word: "nope" }])).toEqual([{ at: 3.8 }]);
  });
  it("count the lines with a lit word, and ask to pick again once a lit word is cut", () => {
    const keys = [{ at: 1.5 }];
    expect(keyCount(lines, keys)).toEqual({ n: 1, m: 2 });
    expect(keysStale(lines, keys)).toBe(false);
    const cut = keyLines(words, [{ start: 0, end: 1.4 }, { start: 3, end: 5 }], 1);
    expect(keysStale(cut, keys)).toBe(true);
    expect(keyCount(cut, keys)).toEqual({ n: 0, m: 1 });
  });
  it("turn a tapped lit word off, and move a line's light to another tapped word, keeping its emoji", () => {
    const keys = [{ at: 1.5, emoji: "\u23F0" }, { at: 3.8 }];
    expect(tapKeyWord(lines, keys, words[4])).toEqual([{ at: 3.8 }]);
    expect(tapKeyWord(lines, keys, words[1])).toEqual([{ at: 3.8 }, { at: 0.4, emoji: "\u23F0" }]);
    expect(tapKeyWord(lines, [], words[5])).toEqual([{ at: 3 }]);
  });
});

describe("key words drawn", () => {
  const texts = (log: unknown[]) => log.filter((x) => (x as unknown[])[0] === "fillText").map((x) => (x as unknown[])[1]);
  // the font each word was filled in
  const filled = (log: unknown[]) => {
    let font = "";
    const out: Record<string, string> = {};
    for (const x of log as unknown[][]) {
      if (x[0] === "font") font = String(x[1]);
      if (x[0] === "fillText") out[String(x[1])] = font;
    }
    return out;
  };
  const lit = (style: Parameters<typeof defaultSettings>[0], emoji = false): EditSettings => ({ ...defaultSettings(style), progressBar: false, punchIn: false, keyWordsOn: true, captionEmoji: emoji, keyWords: [{ at: WORDS[3].s, emoji: "\u{1F4B0}" }] });

  it("bigger and in the highlight colour in word styles, with the emoji after it at 1.1 times", () => {
    const log = draw({ ...lit("bold", true), wordsPerCaption: 4 }, 1.3, true);
    const fonts = filled(log);
    expect(fonts.$500).toContain(" 110px ");
    expect(fonts.MOST).toContain(" 92px ");
    expect(fonts["\u{1F4B0}"]).toMatch(/^101px .*Emoji/);
    // a space in the caption font between the word and its emoji (the recorder's text is 0.5 em a character)
    const x = (t: string) => Number((log as unknown[][]).find((c) => c[0] === "fillText" && c[1] === t)?.[2]);
    expect(x("\u{1F4B0}")).toBe(x("$500") + 4 * 55 + 46);
    const at = (log as unknown[][]).findIndex((x) => x[0] === "fillText" && x[1] === "$500");
    expect((log as unknown[][]).slice(0, at).reverse().find((x) => x[0] === "fillStyle")).toEqual(["fillStyle", "#FFD92B"]);
  });
  it("in the highlight colour even when it is not a number or the word being said", () => {
    // at 1.0 s "pay" is being said and "$500" is next, in the same caption of 4
    const log = draw({ ...lit("bold"), highlightNumbers: false, wordsPerCaption: 4 }, 1.0, true) as unknown[][];
    const fill = (t: string) => {
      const at = log.findIndex((x) => x[0] === "fillText" && x[1] === t);
      expect(at).toBeGreaterThan(-1);
      return log.slice(0, at).reverse().find((x) => x[0] === "fillStyle")?.[1];
    };
    expect(fill("$500")).toBe("#FFD92B");
    expect(fill("MOST")).toBe("#FFFFFF");
  });
  it("underlined in line styles, the same size, and no emoji with emoji off", () => {
    const log = draw(lit("native"), 1.3, true);
    expect(filled(log)["$500"]).toContain(" 54px ");
    expect(texts(log).some((t) => String(t).includes("\u{1F4B0}"))).toBe(false);
    const at = (log as unknown[][]).findIndex((x) => x[0] === "fillText" && x[1] === "$500");
    expect(at).toBeGreaterThan(-1);
    expect((log as unknown[][])[at + 2]?.[0]).toBe("fillRect");
  });
  it("not at all with key words off, though picks are kept", () => {
    const off = { ...lit("bold", true), keyWordsOn: false };
    expect(JSON.stringify(draw(off, 1.3, true))).toBe(JSON.stringify(draw({ ...defaultSettings("bold"), progressBar: false, punchIn: false }, 1.3, true)));
  });
  it("keep a lit caption inside the frame and centred", () => {
    const log = draw({ ...lit("bold", true), wordsPerCaption: 6, size: 1.6 }, 1.3, true) as unknown[][];
    const words = log.filter((x) => x[0] === "fillText" && !String(x[1]).startsWith(" "));
    expect(Math.min(...words.map((x) => Number(x[2])))).toBeGreaterThan(0);
    // too wide for one line at 1.6 times with the bigger word: it wraps
    expect(new Set(words.map((x) => x[3])).size).toBeGreaterThan(1);
  });
});
