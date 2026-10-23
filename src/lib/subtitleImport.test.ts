import { describe, expect, it } from "vitest";
import { scriptWords, subtitleWords } from "@/lib/subtitleImport";

describe("subtitleWords", () => {
  it("reads an SRT: each line's words spread over its time by their length", () => {
    const srt = "﻿1\r\n00:00:01,000 --> 00:00:03,000\r\nMost people lose\r\n\r\n2\r\n00:00:03,500 --> 00:00:05,000\r\n<i>$40,000</i> to one &amp; only mistake.\r\n\r\n";
    const ws = subtitleWords(srt);
    expect(ws.map((w) => w.w)).toEqual(["Most", "people", "lose", "$40,000", "to", "one", "&", "only", "mistake."]);
    // "Most " is 5 of the line's 17 characters: 0.59 of its 2 s, the word itself 90% of that
    expect(ws[0]).toEqual({ w: "Most", s: 1, e: 1.529 });
    expect(ws[1].s).toBe(1.588);
    expect(ws[2].e).toBeLessThanOrEqual(3);
    expect(ws[3].s).toBe(3.5);
    expect(ws.every((w, i) => w.e > w.s && (i === 0 || w.s >= ws[i - 1].e))).toBe(true);
  });

  it("reads a WebVTT with hours, cue ids, settings, notes and a two-line cue", () => {
    const vtt = "WEBVTT\nKind: captions\n\nNOTE made by Zoom\n\nintro\n01:00:00.000 --> 01:00:02.000 align:start position:0%\nSo here is\nthe fix.\n\n01:00:02.500 --> 01:00:03.000\n<v Leo>Write it down.</v>\n";
    const ws = subtitleWords(vtt);
    expect(ws.map((w) => w.w)).toEqual(["So", "here", "is", "the", "fix.", "Write", "it", "down."]);
    expect(ws[0].s).toBe(3600);
    // the second line of a cue takes its second half
    expect(ws[3].s).toBe(3601);
  });

  it("keeps YouTube's word times and says each rolling line once", () => {
    const vtt = [
      "WEBVTT", "",
      "00:00:00.320 --> 00:00:02.000 align:start position:0%", " ", "most<00:00:00.800><c> people</c><00:00:01.200><c> lose</c>", "",
      "00:00:02.000 --> 00:00:02.010 align:start position:0%", "most people lose", " ", "",
      "00:00:02.010 --> 00:00:04.000 align:start position:0%", "most people lose", "money<00:00:02.600><c> early</c>", "",
    ].join("\n");
    const ws = subtitleWords(vtt);
    expect(ws.map((w) => [w.w, w.s])).toEqual([["most", 0.32], ["people", 0.8], ["lose", 1.2], ["money", 2.01], ["early", 2.6]]);
  });

  it("stops at the end of the video and gives nothing for a file with no timed lines", () => {
    const srt = "1\n00:00:01,000 --> 00:00:02,000\nIn the video\n\n2\n00:00:09,000 --> 00:00:10,000\nAfter it ends\n";
    expect(subtitleWords(srt, 5).map((w) => w.w)).toEqual(["In", "the", "video"]);
    expect(subtitleWords("Just some notes\nwith no times")).toEqual([]);
    expect(subtitleWords("1\n00:00:05,000 --> 00:00:04,000\nBackwards\n")).toEqual([]);
  });
});

describe("scriptWords (live-p5dog D8: an AI video is captioned from its script, never transcribed on its own)", () => {
  it("spreads the script's words over the whole video by their length, in order and inside it", () => {
    const ws = scriptWords("Before, follow-ups sit apart.\nNow they stay with the client.", 6);
    expect(ws.map((w) => w.w)).toEqual(["Before,", "follow-ups", "sit", "apart.", "Now", "they", "stay", "with", "the", "client."]);
    expect(ws[0].s).toBe(0);
    expect(ws[ws.length - 1].e).toBeLessThanOrEqual(6);
    expect(ws[ws.length - 1].e).toBeGreaterThan(5.5);
    expect(ws.every((w, i) => w.e > w.s && (i === 0 || w.s >= ws[i - 1].e))).toBe(true);
  });

  it("gives nothing for no words or no length", () => {
    expect(scriptWords("   ", 10)).toEqual([]);
    expect(scriptWords("Some words.", 0)).toEqual([]);
    expect(scriptWords("Some words.", Number.NaN)).toEqual([]);
  });
});
