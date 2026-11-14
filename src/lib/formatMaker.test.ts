import { describe, expect, it } from "vitest";
import { clipWordLine, lengthsOf, makeCaps, makePrice, makerOf, spokenKeys, startLength, talkLine } from "./formatMaker";
import { priceOf, sumPrices } from "./prices";
import { lengthFor } from "./talkingHead";
import { templateById } from "../../supabase/functions/ai-video/templates.ts";

describe("which formats are made on their own page", () => {
  it("reads a presenter talk or an editor template from the card's editor link, and nothing else", () => {
    expect(makerOf("/edit?panel=ai&kind=avatar&talk=news")).toEqual({ kind: "talk", talk: "news" });
    expect(makerOf("/edit?panel=ai&kind=template&template=street-interview")).toMatchObject({ kind: "template", template: { id: "street-interview" } });
    // plain You speaking, an unknown template, the narrated video, a montage and your own footage stay in the editor
    for (const href of ["/edit?panel=ai&kind=avatar", "/edit?panel=ai&kind=template&template=nope", "/edit?panel=ai&kind=explainer&look=clay", "/edit?panel=ai&kind=montage", "/edit?panel=own", "/edit", "/carousel"]) {
      expect(makerOf(href), href).toBeNull();
    }
    expect(makerOf(undefined)).toBeNull();
  });

  it("offers the lengths each maker takes: a talk's voiceover up to 30 seconds, a clip 4 or 8", () => {
    expect(lengthsOf({ kind: "talk", talk: "news" })).toEqual([8, 15, 20, 30]);
    expect(lengthsOf({ kind: "template", template: templateById("street-interview")! })).toEqual([4, 8]);
  });

  it("moves a talk to the longest length a written script fills", () => {
    expect([10, 20, 55, 71, 75].map(lengthFor)).toEqual([8, 8, 20, 20, 30]);
  });

  it("starts a talk at 20 seconds, where its writer lands, and a clip at the editor's 8", () => {
    expect(startLength({ kind: "talk", talk: "stage" })).toBe(20);
    expect(startLength({ kind: "template", template: templateById("food-asmr")! })).toBe(8);
  });
});

describe("the words against the length", () => {
  it("aims a talk at the length's words, and says when it runs short or long", () => {
    expect(talkLine(0, 20)).toBe("Aim for 48 to 64 words for 20 seconds.");
    expect(talkLine(30, 20)).toBe("30 words may be too short for 20 seconds.");
    expect(talkLine(55, 20)).toBe("55 words. Aim for 48 to 64 for 20 seconds.");
    expect(talkLine(70, 20)).toBe("70 words. Over 20 seconds, so it runs longer.");
    expect(talkLine(100, 30)).toBe("100 words. Over 30 seconds, so shorten it.");
  });

  it("caps a clip's spoken lines at what fits its length, with no floor: a short line still makes the clip", () => {
    expect(clipWordLine(0, 8)).toBe("Up to 26 spoken words fit 8 seconds.");
    expect(clipWordLine(3, 8)).toBe("3 words. Up to 26 fit 8 seconds.");
    expect(clipWordLine(14, 4)).toBe("14 words. Over 4 seconds, so cut some.");
  });

  it("counts only the blanks someone says out loud, and none in a silent scene", () => {
    expect(spokenKeys(templateById("street-interview")!)).toEqual(["question", "answer"]);
    expect(spokenKeys(templateById("food-asmr")!)).toEqual([]);
    expect(spokenKeys(templateById("scene-kitchen")!)).toEqual([]);
  });
});

describe("the price of a Make press", () => {
  const talk = { kind: "talk", talk: "news" } as const;
  const clip = { kind: "template", template: templateById("street-interview")! } as const;

  it("prices a talk's voiceover and video at the length from the price table, and a new presenter's picture only when one is made", () => {
    for (const length of [8, 15, 20, 30]) {
      expect(makePrice(talk, { length, quality: "720p", presenter: false })).toEqual(sumPrices(priceOf("ai-video", { seconds: length }), priceOf("ai-voice")));
    }
    expect(makePrice(talk, { length: 20, quality: "720p", presenter: true })).toEqual(sumPrices(priceOf("ai-video", { seconds: 20 }), priceOf("ai-voice"), priceOf("ai-image")));
    expect((makePrice(talk, { length: 30, quality: "720p", presenter: false }) as { usd: number }).usd).toBeGreaterThan((makePrice(talk, { length: 8, quality: "720p", presenter: false }) as { usd: number }).usd);
    expect(makeCaps(talk, false)).toEqual(["ai-voice"]);
    expect(makeCaps(talk, true)).toEqual(["ai-voice", "ai-image"]);
  });

  it("prices a clip at its length and quality, as the editor's Make the clip does", () => {
    expect(makePrice(clip, { length: 4, quality: "480p", presenter: false })).toEqual(priceOf("ai-clip", { seconds: 4, quality: "480p" }));
    expect(makePrice(clip, { length: 8, quality: "720p", presenter: true })).toEqual(priceOf("ai-clip", { seconds: 8, quality: "720p" }));
    expect(makeCaps(clip, true)).toEqual([]);
  });
});
