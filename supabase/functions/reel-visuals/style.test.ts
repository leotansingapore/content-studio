import { describe, expect, it } from "vitest";
import { STYLE_OPTIONS, buildStylePrompt, parseStyleRequest, readLook, styleQuestions, validateStyle } from "./style";

const jpeg = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";
const frames = [{ t: 1.5, image: jpeg }, { t: 0.3, image: jpeg }];
const pacing = { durationSec: 30, cuts: 12, avgShotSec: 2.3, cutsFirst3s: 2 };

describe("style request", () => {
  it("takes frames and pacing, no beats needed", () => {
    const r = parseStyleRequest({ mode: "style", frames, pacing });
    expect(r.ok && r.value.frames.map((f) => f.t)).toEqual([0.3, 1.5]);
    expect(r.ok && r.value.pacing.cuts).toBe(12);
    expect(parseStyleRequest({ frames: frames.slice(0, 1), pacing }).ok).toBe(false);
    expect(parseStyleRequest({ frames, pacing: {} }).ok).toBe(false);
  });
  it("sends every frame after its time", () => {
    const r = parseStyleRequest({ frames, pacing });
    const { parts } = buildStylePrompt(r.ok ? r.value : { frames: [], pacing });
    expect(parts.filter((p) => p.type === "image_url")).toHaveLength(2);
    expect(parts[1]).toEqual({ type: "text", text: "Frame at 0.3s:" });
  });
});

describe("the description", () => {
  it("keeps the captions, layout and overlays inside the video, without em dashes", () => {
    const d = validateStyle(JSON.stringify({ captions: "Yellow — bold words", layout: "Full frame", onScreenText: [{ t: 0.3, text: "3 CPF mistakes" }, { t: 99, text: "late" }, { t: 2, text: " " }] }), 30);
    expect(d).toEqual({ captions: "Yellow, bold words", layout: "Full frame", onScreenText: [{ t: 0.3, text: "3 CPF mistakes" }] });
    expect(validateStyle("not json", 30)).toBeNull();
    expect(validateStyle({ captions: "", layout: "x", onScreenText: [] }, 30)).toBeNull();
  });
});

describe("Jev's look", () => {
  it("asks one question per setting, with the six caption styles as choices", () => {
    const q = styleQuestions();
    expect(Object.keys(q).sort()).toEqual(["box", "caps", "framed", "position", "shown", "style", "top", "words"]);
    expect(q.style.type === "choice" && Object.keys(q.style.criteria)).toEqual(Object.keys(STYLE_OPTIONS));
  });
  it("reads clear answers and leaves unclear or unknown ones out", () => {
    const look = readLook({
      style: { type: "choice", choice: "cutout" },
      caps: { type: "noul", noul: 0.15 },
      box: { type: "choice", choice: "glow" },
      position: { type: "choice", choice: "middle" },
      words: { type: "choice", choice: "2" },
      shown: { type: "noul", noul: 0.97 },
      framed: { type: "noul", noul: 0.5 },
      top: { type: "noul", noul: 0.81 },
    });
    expect(look).toEqual({ style: "cutout", uppercase: false, captionBox: null, position: "middle", words: "2", captions: true, framed: null, topHalf: true });
    expect(readLook(null)).toBeNull();
  });
});
