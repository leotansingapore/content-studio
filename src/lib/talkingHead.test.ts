import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabase: { functions: { invoke: vi.fn() } }, SUPABASE_URL: "", SUPABASE_ANON_KEY: "" }));

import { priceOf, sumPrices, type Price } from "./prices";
import type { SavedClone } from "./reelClone";
import {
  TALK_LENGTHS, asTopic, canWrite, clearScript, cloneTalkHref, cloneWords, loadTyped, needsPriceCheck, saveTyped, talkCaps, talkParams,
  talkPrice, videoEstimate, wordLine, writePlan,
} from "./talkingHead";

const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(" ");
const usd = (p: ReturnType<typeof talkPrice>) => (p as Price).usd;

describe("the word target per length (2.4 to 3.2 words a second)", () => {
  it.each([
    [8, 19, 26],
    [15, 36, 48],
    [20, 48, 64],
    [30, 72, 96],
  ] as const)("%i s aims for %i to %i words", (s, low, high) => {
    expect(wordLine(low, s)).toBe(`${low} words. Aim for ${low} to ${high} for ${s} seconds.`);
    expect(wordLine(high, s)).toBe(`${high} words. Aim for ${low} to ${high} for ${s} seconds.`);
    expect(wordLine(low - 1, s)).toBe(`${low - 1} words may be too short for ${s} seconds.`);
    expect(wordLine(high + 1, s)).toMatch(new RegExp(`^${high + 1} words\\. Over ${s} seconds, so `));
  });

  it("says what a long script does: runs longer, or past 30 s cannot be made", () => {
    expect(wordLine(60, 15)).toBe("60 words. Over 15 seconds, so it runs longer.");
    expect(wordLine(100, 30)).toBe("100 words. Over 30 seconds, so shorten it.");
  });

  it("says nothing while the box is empty", () => {
    expect(wordLine(0, 15)).toBe("");
  });
});

describe("when a press writes the script first", () => {
  it("writes from a topic: fewer words than the length needs, short enough to send", () => {
    expect(asTopic("Why most people skip their follow-ups", 15)).toBe(true);
    expect(writePlan("Why most people skip their follow-ups", 15, null)).toBe("topic");
    // the same words are a script at 8 s only once they reach 19
    expect(writePlan(words(19), 8, null)).toBeNull();
    expect(writePlan(words(18), 8, null)).toBe("topic");
  });

  it("speaks a long box as it is, even under the target, since it can't be sent as a topic", () => {
    const long = words(40).replace(/w/g, "word");
    expect(long.length).toBeGreaterThan(200);
    expect(writePlan(long, 30, null)).toBeNull();
  });

  it("writes nothing from an empty box with no post", () => {
    expect(writePlan("   ", 15, null)).toBeNull();
  });

  it("writes from the post when the box is empty or a short steer, and speaks a full script as it is", () => {
    expect(writePlan("", 15, { kind: "top-post" })).toBe("source");
    expect(writePlan("make it about follow-ups", 15, { kind: "top-post" })).toBe("source");
    expect(writePlan(words(40), 15, { kind: "top-post" })).toBeNull();
  });

  it("never writes over a Clone a reel result's own script", () => {
    expect(writePlan("", 15, { kind: "clone" })).toBeNull();
    expect(writePlan("short", 15, { kind: "clone" })).toBeNull();
    expect(canWrite("a topic", { kind: "clone" })).toBe(false);
  });

  it("Write it for me needs a post, or a topic of 3 to 200 characters", () => {
    expect(canWrite("", { kind: "trend" })).toBe(true);
    expect(canWrite("ab", null)).toBe(false);
    expect(canWrite("cpf", null)).toBe(true);
    expect(canWrite("x".repeat(201), null)).toBe(false);
  });
});

describe("the price of a press", () => {
  it("prices the video as the price table does for each length", () => {
    for (const s of TALK_LENGTHS) expect(videoEstimate(s)).toEqual(priceOf("ai-video", { seconds: s }));
    // 15 s is two 22-credit Speak slices
    expect(videoEstimate(15).usd).toBeCloseTo(2.75, 2);
  });

  it("adds the script, the voiceover and a new presenter only when the press spends them", () => {
    const all = talkPrice({ length: 15, write: true, presenter: true });
    expect(all).toEqual(sumPrices(priceOf("remix-make"), priceOf("ai-video", { seconds: 15 }), priceOf("ai-voice"), priceOf("ai-image")));
    expect(usd(talkPrice({ length: 15, write: false, presenter: false }))).toBeCloseTo((priceOf("ai-video", { seconds: 15 }) as Price).usd + (priceOf("ai-voice") as Price).usd, 6);
    expect(talkCaps({ length: 15, write: true, presenter: true })).toEqual(["remix-make", "ai-voice", "ai-image"]);
    expect(talkCaps({ length: 15, write: false, presenter: false })).toEqual(["ai-voice"]);
  });

  it("checks the price again only when the real slices cost more than the chip", () => {
    expect(needsPriceCheck(2.75, 3.4375)).toBe(true);
    expect(needsPriceCheck(2.75, 2.75)).toBe(false);
    expect(needsPriceCheck(2.75, 1.375)).toBe(false);
  });
});

describe("links", () => {
  it("leave defaults out of the page's params", () => {
    expect(talkParams({ who: "photo", setting: "car", length: 15, voice: "alice" })).toEqual({ source: undefined, who: undefined, setting: undefined, length: undefined, voice: undefined });
    expect(talkParams({ source: "trend:t1", who: "presenter", setting: "car", length: 30, voice: "george" })).toEqual({ source: "trend:t1", who: "presenter", setting: "car", length: "30", voice: "george" });
  });

  it("Make it as a talking head opens this page on the clone for Leo, and is nothing for anyone else", () => {
    expect(cloneTalkHref(true, { platform: "instagram", postId: "C1x" })).toBe("/make/talking-head?source=clone%3Ainstagram%3AC1x");
    expect(cloneTalkHref(false, { platform: "instagram", postId: "C1x" })).toBeNull();
  });
});

describe("a Clone a reel result's own words", () => {
  const clone = (script: string) =>
    ({ id: "instagram:C1x", savedAt: "", result: { source: { platform: "instagram", postId: "C1x" }, myVersion: { script, caption: " The caption " } } }) as unknown as SavedClone;

  it("fill the script by the clone's source key", () => {
    expect(cloneWords([clone(" Line one.\nLine two. ")], "clone:instagram:C1x")).toEqual({ script: "Line one.\nLine two.", caption: "The caption" });
    expect(cloneWords([clone("Hi")], "clone:tiktok:C1x")).toBeNull();
    expect(cloneWords([clone("  ")], "clone:instagram:C1x")).toBeNull();
  });
});

describe("what was typed", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });
  });

  it("survives a reload, reads bad JSON as empty, and loses only the script after a make", () => {
    expect(loadTyped("u1")).toEqual({ script: "", look: "" });
    saveTyped("u1", { script: "Hello there", look: "A man in a blue shirt", filled: "clone:instagram:C1x" });
    expect(loadTyped("u1")).toEqual({ script: "Hello there", look: "A man in a blue shirt", filled: "clone:instagram:C1x" });
    clearScript("u1");
    expect(loadTyped("u1")).toEqual({ script: "", look: "A man in a blue shirt" });
    localStorage.setItem("cs-make-talking-head-u1", "{not json");
    expect(loadTyped("u1")).toEqual({ script: "", look: "" });
  });
});
