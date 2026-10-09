import { describe, expect, it } from "vitest";
import { focusAt } from "./videoEdit";
import { smoothTrack } from "./faceFollow";
import { attribute, faceOf, holdSpeaker, normaliseActivity, peopleOf, speakerPlan, turnStart, type SeenFace } from "./speakers";

// a repeatable wobble, so the tests do not depend on Math.random
const wobble = (i: number) => Math.sin(i * 12.9898) * 0.5 + 0.5;

/** Two people on a sofa (left at 0.3, right at 0.7), a look every half second; `talker(i)` is who talks in look i (0, 1 or null). */
function sofa(n: number, talker: (i: number) => number | null): SeenFace[][] {
  return Array.from({ length: n }, (_, i) =>
    [0.3, 0.7].map((x, p) => ({
      x: x + (wobble(i + p) - 0.5) * 0.01,
      y: 0.4,
      w: 0.1,
      // a talking mouth opens and closes; a listening one barely moves
      open: talker(i) === p ? 0.02 + 0.1 * wobble(i * 7 + p) : 0.03 + 0.002 * wobble(i * 3 + p),
    })),
  );
}
/** A word every 0.4 s through [a, b) seconds. */
const talk = (a: number, b: number) => Array.from({ length: Math.floor((b - a) / 0.4) }, (_, k) => ({ w: "word", s: +(a + k * 0.4).toFixed(2), e: +(a + k * 0.4 + 0.3).toFixed(2) }));

describe("who is in the shot", () => {
  it("finds the people who stay, left to right, and leaves out the background and a passer-by", () => {
    const looks = sofa(20, () => null).map((l, i) => [
      ...l,
      { x: 0.9, y: 0.2, w: 0.02 }, // a photo on the wall: too small
      ...(i < 2 ? [{ x: 0.5, y: 0.4, w: 0.1 }] : []), // walks through in 2 of 20 looks
    ]);
    const people = peopleOf(looks);
    expect(people.map((p) => Math.round(p.x * 10) / 10)).toEqual([0.3, 0.7]);
    expect(people.every((p) => p.share === 1)).toBe(true);
    expect(peopleOf([null, null])).toEqual([]);
  });

  it("knows which face in a look is which person", () => {
    const [left, right] = peopleOf(sofa(10, () => null));
    const look = [{ x: 0.71, y: 0.4, w: 0.1 }, { x: 0.29, y: 0.4, w: 0.1 }];
    expect(faceOf(look, left)?.x).toBe(0.29);
    expect(faceOf(look, right)?.x).toBe(0.71);
    expect(faceOf([{ x: 0.5, y: 0.4, w: 0.1 }], left)).toBeNull();
    expect(faceOf(null, left)).toBeNull();
  });
});

describe("who is talking", () => {
  it("puts each person's mouth on their own scale, so a bigger or better lit face does not win every look", () => {
    const big = [0.1, 0.1, 0.1, 0.5, 0.5, 0.1, 0.1, 0.5, 0.1, 0.1];
    const small = big.map((v) => v / 5);
    const [a, b] = normaliseActivity([big, small]);
    a.forEach((v, i) => expect(v).toBeCloseTo(b[i]!, 6));
    // a mouth that barely moves stays small instead of being stretched to look busy
    const still = normaliseActivity([[0.001, 0.002, 0.001, 0.003, 0.002]])[0];
    expect(Math.max(...(still as number[]))).toBeLessThan(0.15);
    expect(normaliseActivity([[null, 0.2]])[0][0]).toBeNull();
  });

  it("names a talker only while someone speaks, and only when one mouth clearly leads", () => {
    const cols = [[2, 2, 1, 0.1], [0.1, 0.1, 0.95, 0.1]];
    expect(attribute(cols, [true, false, true, true])).toEqual([0, null, null, null]);
    expect(attribute([[2], [null]], [true])).toEqual([null]); // one mouth read: nothing to compare
  });

  it("holds the speaker through a one-look blip and switches from the first look of a real turn", () => {
    expect(holdSpeaker([0, 0, 1, 0, 0, null, 0], 3)).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(holdSpeaker([0, 0, 0, 1, null, 1, 1, 0], 3)).toEqual([0, 0, 0, 1, 1, 1, 1, 1]);
    // before anyone is clear: the first speaker
    expect(holdSpeaker([null, null, 1, 1], 3)).toEqual([1, 1, 1, 1]);
    expect(holdSpeaker([null, null], 3)).toEqual([null, null]);
  });
});

describe("the crop on a conversation", () => {
  it("goes to whoever talks, switching as they start", () => {
    // left talks 0-10 s, right 10-20 s, left again 20-30 s
    const who = (i: number) => (i < 20 || i >= 40 ? 0 : 1);
    // each turn starts after a short pause, as people do
    const plan = speakerPlan(sofa(60, who), 0, 0.5, [...talk(0, 9.5), ...talk(10, 19.5), ...talk(20, 30)])!;
    expect(plan).not.toBeNull();
    const at = (t: number) => plan.x[t * 2]!;
    expect(at(5)).toBeCloseTo(0.3, 1);
    expect(at(15)).toBeCloseTo(0.7, 1);
    expect(at(25)).toBeCloseTo(0.3, 1);
    expect(plan.switches).toEqual([10, 20]);
    expect(plan.x[19]).toBeCloseTo(0.3, 1);
    expect(plan.x[20]).toBeCloseTo(0.7, 1);
  });

  it("steps over looks whose mouths were not read (frames dropped while the video played through)", () => {
    const who = (i: number) => (i < 20 || i >= 40 ? 0 : 1);
    // a look in three repeats the one before without its mouths, as when looking falls behind the video
    const looks = sofa(60, who).map((l, i) => (i % 3 === 2 ? l.map(({ open: _, ...f }) => f) : l));
    const plan = speakerPlan(looks, 0, 0.5, [...talk(0, 9.5), ...talk(10, 19.5), ...talk(20, 30)])!;
    expect(plan.switches).toEqual([10, 20]);
  });

  it("jumps at the switch instead of panning across the sofa", () => {
    const who = (i: number) => (i < 20 ? 0 : 1);
    const plan = speakerPlan(sofa(40, who), 0, 0.5, talk(0, 20))!;
    const sw = plan.switches[0];
    const x = smoothTrack(plan.x.map((v) => v ?? 0.5), 0.5, 0.04, [Math.ceil(sw / 0.5 - 1e-6)])!;
    const s = { focusX: 0.5, followFace: true, faceTrack: { step: 0.5, x, cuts: [sw] } };
    expect(focusAt(s, sw - 0.01)).toBeCloseTo(0.3, 1);
    expect(focusAt(s, sw)).toBeCloseTo(0.7, 1);
  });

  it("does not hand the frame to a listener for one word, or to a mouth moving while nobody speaks", () => {
    // right says "yeah" in one look at 7 s
    const blip = speakerPlan(sofa(40, (i) => (i === 14 ? 1 : 0)), 0, 0.5, talk(0, 20))!;
    expect(blip.switches).toEqual([]);
    expect(blip.x.every((v) => Math.abs(v! - 0.3) < 0.05)).toBe(true);
    // right chews from 10 s while nobody says a word: the left speaker keeps the frame
    const chew = speakerPlan(sofa(40, (i) => (i < 20 ? 0 : 1)), 0, 0.5, talk(0, 10))!;
    expect(chew.switches).toEqual([]);
  });

  it("leaves a shot with one person, or two who are never in the frame together, to follow the face as before", () => {
    const one = sofa(30, () => 0).map((l) => [l[0]]);
    expect(speakerPlan(one, 0, 0.5, talk(0, 15))).toBeNull();
    // two cameras: one person per shot, swapping every 2 s
    const cams = sofa(30, () => 0).map((l, i) => [l[Math.floor(i / 4) % 2]]);
    expect(speakerPlan(cams, 0, 0.5, talk(0, 15))).toBeNull();
    // the second person is in only 2 looks of every 5: not a conversation
    const partly = sofa(30, () => 0).map((l, i) => (i % 5 < 3 ? [l[0]] : l));
    expect(speakerPlan(partly, 0, 0.5, talk(0, 15))).toBeNull();
    // no words at all: nobody is known to be talking
    expect(speakerPlan(sofa(30, () => 0), 0, 0.5, [])).toBeNull();
  });

  it("works shot by shot: a solo shot after a camera cut is left alone", () => {
    const looks = [...sofa(30, (i) => (i < 15 ? 0 : 1)), ...sofa(20, () => 0).map((l) => [l[1]])];
    const plan = speakerPlan(looks, 0, 0.5, talk(0, 25), [30])!;
    expect(plan.x.slice(0, 30).every((v) => v !== null)).toBe(true);
    expect(plan.x.slice(30).every((v) => v === null)).toBe(true);
  });

  it("starts a turn at the word after the longest pause, and switches between looks when there is none", () => {
    const words = [...talk(0, 9.5), ...talk(10, 12)];
    expect(turnStart(words, 9, 10.5)).toBe(10);
    expect(turnStart(words, 13, 14)).toBeNull();
    expect(turnStart(words, 1, 3)).toBeNull(); // words run on with no pause
    // continuous talk with no pause: the turn goes in the stretch before the look it was first clear in
    const plan = speakerPlan(sofa(40, (i) => (i < 20 ? 0 : 1)), 0, 0.5, talk(0, 20))!;
    expect(plan.switches[0]).toBeGreaterThan(8.9);
    expect(plan.switches[0]).toBeLessThan(10.6);
  });

  it("counts looks from where the look started", () => {
    const who = (i: number) => (i < 20 ? 0 : 1);
    const plan = speakerPlan(sofa(40, who), 100, 0.5, [...talk(100, 109.5), ...talk(110, 120)])!;
    expect(plan.switches).toEqual([110]);
  });
});
