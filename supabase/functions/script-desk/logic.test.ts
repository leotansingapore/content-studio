import { describe, expect, it } from "vitest";
import {
  DEFAULT_DIALS, DIAL_META, EMPTY_CONTEXT, applyClaims, cleanBand, cleanDials, cleanBreakdown, cleanHandle, cut, jsonOf, knownCodes, levelOf, ownersOf, readBreakdown,
  readClaims, readDiscover, readHooks, readIgReel, readIgReels, readRescript, readScript, reelCode, sanitizeContext,
} from "./logic.ts";

// What a job carries and how its answer is read. The words sent to the model are built on Leo's Mac by private
// templates (scripts/script-worker/worker.mjs), so nothing here holds prompt text; every answer below is made up.

describe("the dials", () => {
  it("has the eleven dials after the length, with its defaults and word labels", () => {
    expect(DIAL_META.map((d) => [d.label, d.value, levelOf(d.value)])).toEqual([
      ["Avatar use", 70, "Strong"], ["Template match", 60, "Strong"], ["Hook strength", 70, "Strong"], ["Contrarian", 50, "Medium"],
      ["Story", 40, "Medium"], ["Tactics", 60, "Strong"], ["Proof & numbers", 50, "Medium"], ["Personal", 40, "Medium"],
      ["Product", 20, "Light"], ["Humor", 20, "Light"], ["Call to action", 0, "Off"],
    ]);
    expect([0, 1, 30, 31, 55, 56, 85, 86, 100].map(levelOf)).toEqual(["Off", "Light", "Light", "Medium", "Medium", "Strong", "Strong", "Max", "Max"]);
  });

  it("files each dial as a whole number from 0 to 100, a broken one as its default, and only a known length", () => {
    const { dials, length } = cleanDials({ cta: 100, humor: -5, hook: 33.6, story: "loud", length: 90 });
    expect(length).toBe(90);
    expect(dials).toEqual({ ...DEFAULT_DIALS, cta: 100, humor: 0, hook: 34 });
    expect(cleanDials({ length: 50 }).length).toBe(60);
    expect(cleanDials(null)).toEqual({ dials: DEFAULT_DIALS, length: 60 });
  });

  it("offers Research's length bands and falls back to 60 to 75 seconds", () => {
    expect(cleanBand([45, 60])).toEqual([45, 60]);
    expect(cleanBand([10, 500])).toEqual([60, 75]);
    expect(cleanBand("x")).toEqual([60, 75]);
  });
});

describe("context", () => {
  it("drops empty sections, clips fields and cleans lists", () => {
    const full = sanitizeContext({
      avatar: { name: "Agency owners", who: "Run a 5-person studio", pains: "Feast or famine\nLate payers", fears: ["Losing the big client"], desires: [], days: [] },
      me: { name: "Priya", handle: "@priyabooks", results: ["$40k a month in revenue", ""], beliefs: [] },
    });
    expect(full.avatar?.pains).toEqual(["Feast or famine", "Late payers"]);
    expect(full.me?.results).toEqual(["$40k a month in revenue"]);
    expect(sanitizeContext({ me: { name: " " }, product: {}, avatar: { pains: ["x"] } })).toEqual(EMPTY_CONTEXT);
    expect(sanitizeContext({ niche: "a".repeat(5000) }).niche.length).toBe(600);
    expect(sanitizeContext(null)).toEqual(EMPTY_CONTEXT);
  });
});

describe("the gate and the clips", () => {
  it("lets in NORTH_STAR_USERS' real ids only, never a wildcard", () => {
    const leo = "00000000-0000-0000-0000-00000000a001";
    expect(ownersOf(`*, ${leo}, someone`)).toEqual([leo]);
    expect(ownersOf("*")).toEqual([]);
    expect(ownersOf(undefined)).toEqual([]);
  });

  it("never cuts through an emoji", () => {
    expect(cut("ab\u{1F92C}", 3)).toBe("ab");
    expect(cut("ab\u{1F92C}", 4)).toBe("ab\u{1F92C}");
    expect(sanitizeContext({ niche: `${"a".repeat(599)}\u{1F92C}` }).niche).toBe("a".repeat(599));
  });
});

describe("reading the answers", () => {
  it("reads each kind's answer in its JSON shape, clipped, and drops entries with nothing in them", () => {
    const s = readScript(JSON.stringify({ title: "Price first", script: "Raise the price.\nThen sell.", hooks: [{ hook: "Charge more.", formula: "Contrarian claim" }, { hook: "" }], flags: ["x"], notes: [] }))!;
    expect(s).toEqual({ title: "Price first", script: "Raise the price.\nThen sell.", hooks: [{ hook: "Charge more.", formula: "Contrarian claim" }], flags: ["x"], notes: [] });
    expect(readHooks(JSON.stringify({ hooks: [{ hook: "One.", pattern: "Bleak stat" }, {}] }))).toEqual([{ hook: "One.", pattern: "Bleak stat" }]);
    const b = readBreakdown(JSON.stringify({ hook: { line: "I quit.", type: "Story open", why: "w" }, idea: "i", format: { name: "Story", beats: ["a", "b"] }, visual: "v", why: ["1"], remix: ["r"] }))!;
    expect([b.hook.type, b.format.beats, b.remix]).toEqual(["Story open", ["a", "b"], ["r"]]);
    expect(cleanBreakdown({ idea: "no hook line" })).toBeNull();
    expect(readRescript(JSON.stringify({ script: "s", changes: [{ from: "a", to: "b", why: "their name" }, {}], fill: ["[x]"] }))).toEqual({ script: "s", changes: [{ from: "a", to: "b", why: "their name" }], fill: ["[x]"] });
    expect(readClaims('{"unsupported": []}')).toEqual([]);
  });

  it("finds the JSON inside a fence or around words, and refuses an answer that has none", () => {
    expect(jsonOf('Here it is:\n```json\n{"a": 1}\n```')).toEqual({ a: 1 });
    expect(jsonOf('Sure. {"script": "x"} Done.')).toEqual({ script: "x" });
    expect(jsonOf("no json")).toBeNull();
    expect(jsonOf("[1,2]")).toBeNull();
    expect(readScript('{"title": "t"}')).toBeNull();
    expect(readHooks('{"hooks": []}')).toBeNull();
    expect(readClaims('{"unsupported": "none"}')).toBeNull();
  });

  it("swaps each unbacked sentence for its placeholder version, where the script has it", () => {
    const script = "I'm Priya. Counterbook keeps the books for 90 cafes. Ask me anything.";
    const fixed = applyClaims(script, [
      { sentence: "Counterbook keeps the books for 90 cafes.", claim: "90 cafes", fixed: "Counterbook keeps the books for [how many cafes]." },
      { sentence: "Not in the script.", claim: "x", fixed: "y" },
    ]);
    expect(fixed).toBe("I'm Priya. Counterbook keeps the books for [how many cafes]. Ask me anything.");
    // a $& in the fix is text, not a replace pattern
    expect(applyClaims("A b.", [{ sentence: "A b.", claim: "", fixed: "$& [x]" }])).toBe("$& [x]");
  });
});

describe("research inputs", () => {
  it("reads a username from @name, a profile link or a bare name, and refuses anything else", () => {
    expect(["@Made.Up_Creator", "https://www.instagram.com/made.up_creator/reels/", "made.up_creator"].map(cleanHandle)).toEqual(["made.up_creator", "made.up_creator", "made.up_creator"]);
    expect(["", "a", "no spaces here", "https://www.instagram.com/reel/DMadeUp0001/", 7].map(cleanHandle)).toEqual([null, null, null, null, null]);
  });

  it("reads a reel's code from its link or the bare code, and keeps the known codes valid and unique", () => {
    expect(reelCode("https://www.instagram.com/reel/DMadeUp0001/?igsh=x")).toBe("DMadeUp0001");
    expect(reelCode("https://www.instagram.com/made.up/reel/DMadeUp0001/")).toBe("DMadeUp0001");
    expect(reelCode("https://www.instagram.com/p/DMadeUp0002/")).toBe("DMadeUp0002");
    expect([reelCode("https://example.com/x"), reelCode("../../etc"), reelCode(null)]).toEqual([null, null, null]);
    expect(knownCodes(["DMadeUp0001", "DMadeUp0001", "bad code", 3, "DMadeUp0002"])).toEqual(["DMadeUp0001", "DMadeUp0002"]);
    expect(knownCodes(Array.from({ length: 600 }, (_, i) => `DCode${String(i).padStart(4, "0")}`))).toHaveLength(500);
  });
});

describe("research answers", () => {
  const profile = { handle: "made.up_creator", name: "Made Up", followers: 120400, posts: null, avatar: "https://scontent.cdninstagram.com/a.jpg", bio: "b" };
  const reel = { code: "DMadeUp0001", owner: "made.up_creator", views: 51000, likes: 2100, comments: 88, pinned: false, takenAt: "2026-10-01T13:14:31.890Z", thumb: "https://scontent.cdninstagram.com/t.jpg", caption: "c", video: "" };

  it("reads a grid with its profile and reels, keeping Instagram's own image hosts only", () => {
    const r = readIgReels(JSON.stringify({ profile: { ...profile, avatar: "https://evil.example/a.jpg" }, reels: [reel, { ...reel, code: "bad code" }, { ...reel, code: "DMadeUp0002", thumb: "javascript:alert(1)", views: -4 }] }));
    expect(r).toEqual({
      paused: null,
      profile: { ...profile, avatar: "" },
      reels: [
        { ...reel, url: "https://www.instagram.com/reel/DMadeUp0001/" },
        { ...reel, code: "DMadeUp0002", url: "https://www.instagram.com/reel/DMadeUp0002/", thumb: "", views: null },
      ],
    });
    expect(readIgReels('{"reels": []}')).toBeNull();
  });

  it("passes a pause on as it is, for a grid, a reel and a search", () => {
    const paused = { until: "2026-11-04T18:40:00.000Z", why: "login" };
    expect(readIgReels(JSON.stringify({ paused }))).toEqual({ profile: null, reels: [], paused });
    // a wall part way through the embed pages keeps the grid that was read
    expect(readIgReels(JSON.stringify({ profile, reels: [reel], paused }))).toMatchObject({ profile: { handle: "made.up_creator" }, reels: [{ code: "DMadeUp0001" }], paused });
    expect(readIgReel(JSON.stringify({ paused: { ...paused, why: "wait" } }))).toEqual({ reel: null, paused: { ...paused, why: "wait" } });
    expect(readIgReel(JSON.stringify({ paused: { until: "soon" } }))).toBeNull();
    expect(readDiscover(JSON.stringify({ creators: [], paused }))).toEqual({ creators: [], paused });
  });

  it("reads a search's creators, read or not, and drops a made-up username", () => {
    const r = readDiscover(JSON.stringify({ creators: [{ handle: "made.up_creator", why: "money tips", profile, reels: [reel] }, { handle: "second.one", why: "w", error: "That account is private." }, { handle: "not valid!" }] }));
    expect(r?.creators.map((c) => [c.handle, c.profile?.followers ?? null, c.reels.length, c.error])).toEqual([["made.up_creator", 120400, 1, ""], ["second.one", null, 0, "That account is private."]]);
    expect(r?.paused).toBeNull();
    expect(readDiscover('{"creators": "none"}')).toBeNull();
  });
});
