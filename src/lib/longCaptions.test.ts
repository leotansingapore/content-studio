import { describe, expect, it } from "vitest";
import { OVERLAP_SECONDS, captionPlan, hoursMinutes, stitchParts } from "@/lib/longCaptions";
import type { Word } from "@/lib/videoEdit";

/** Words of `text`, one every 0.5 s from `at`, each 0.4 s long. */
const say = (text: string, at: number): Word[] => text.split(" ").map((w, i) => ({ w, s: at + i * 0.5, e: at + i * 0.5 + 0.4 }));
/** Part-relative words: the whole talk's words inside the part, timed from its start. */
const heard = (talk: Word[], from: number, to: number, skew = 0) =>
  talk.filter((w) => w.s >= from && w.s < to).map((w) => ({ ...w, s: w.s - from + skew, e: w.e - from + skew }));

describe("captionPlan", () => {
  it("keeps a recording up to 12 minutes in one part, as before", () => {
    expect(captionPlan(300)).toEqual([{ from: 0, to: 300 }]);
    expect(captionPlan(720)).toEqual([{ from: 0, to: 720 }]);
  });

  it("splits a longer one into equal parts of about 10 minutes, each running a few seconds into the next", () => {
    const two = captionPlan(721);
    expect(two).toEqual([{ from: 0, to: 360.5 + OVERLAP_SECONDS }, { from: 360.5, to: 721 }]);
    const hours = captionPlan(2 * 3600);
    expect(hours).toHaveLength(12);
    expect(hours[2]).toEqual({ from: 1200, to: 1805 });
    expect(hours[11].to).toBe(7200);
    // no part runs past 12 minutes and 5 seconds (Whisper takes 25 MB, a part is under 24)
    for (const d of [721, 1500, 3599, 3600, 4000, 7500]) {
      const plan = captionPlan(d);
      expect(Math.max(...plan.map((p) => p.to - p.from))).toBeLessThanOrEqual(725);
      expect(plan[plan.length - 1].to).toBe(d);
    }
  });
});

describe("stitchParts", () => {
  it("puts each part's words on the recording's clock and keeps each overlapped word once", () => {
    // a talk with no pause at the seam: words every 0.5 s across 595-605
    const talk = say(Array.from({ length: 40 }, (_, i) => `w${i}`).join(" "), 590);
    const plan = [{ from: 0, to: 605 }, { from: 600, to: 1200 }];
    const out = stitchParts(plan, [heard(talk, 0, 605), heard(talk, 600, 1200)]);
    expect(out.map((w) => w.w)).toEqual(talk.map((w) => w.w));
    expect(out[0].s).toBe(590);
  });

  it("cuts in a pause in the overlap, so timings a little apart still keep each word once", () => {
    const talk = [...say("Cover first then", 598), ...say("compare plans after that", 602)];
    const plan = [{ from: 0, to: 605 }, { from: 600, to: 1200 }];
    // the later part hears every word 0.2 s late
    const out = stitchParts(plan, [heard(talk, 0, 605), heard(talk, 600, 1200, 0.2)]);
    expect(out.map((w) => w.w)).toEqual(["Cover", "first", "then", "compare", "plans", "after", "that"]);
    expect(out[3].s).toBeCloseTo(602.2);
  });

  it("keeps each word once when the later part hears the talk a little early or late", () => {
    // the longest pause in the overlap is between b and c, so the earlier part's words stop at b
    const talk = [...say("Start here. a b", 599.6), ...say("c d e f g", 602), ...say("more after", 606)];
    const plan = [{ from: 0, to: 605 }, { from: 600, to: 1200 }];
    for (const skew of [-0.3, -0.2, 0, 0.2, 0.3]) {
      expect(stitchParts(plan, [heard(talk, 0, 605), heard(talk, 600, 1200, skew)]).map((w) => w.w), `skew ${skew}`).toEqual(talk.map((w) => w.w));
    }
    // a piece of b the later part heard as a word of its own, and "B" heard again after b
    const later = [{ w: "lump", s: 1.2, e: 1.4 }, { w: "B", s: 1.5, e: 1.9 }, ...heard(talk, 600, 1200).filter((w) => w.s > 1.5)];
    expect(stitchParts(plan, [heard(talk, 0, 605), later]).map((w) => w.w)).toEqual(talk.map((w) => w.w));
  });

  it("keeps a part that came back empty as a gap, and clips words past a part's end", () => {
    const plan = captionPlan(1500);
    const out = stitchParts(plan, [say("one two", 10), [], [{ w: "late", s: 499, e: 600 }]]);
    expect(out.map((w) => [w.w, w.s])).toEqual([["one", 10], ["two", 10.5], ["late", plan[2].from + 499]]);
    expect(out[2].e).toBe(1500);
  });
});

it("says a length in hours and minutes", () => {
  expect([hoursMinutes(38 * 60), hoursMinutes(112 * 60 + 20), hoursMinutes(3600)]).toEqual(["38 min", "1 h 52 min", "1 h 0 min"]);
});
