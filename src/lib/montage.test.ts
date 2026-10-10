import { describe as suite, expect, it } from "vitest";
import { SHORTEST, SNAP, beatTimes, chooseFor, describe, noteOf, snapCuts } from "./montage";
import type { StockItem } from "./stockMedia";

const item = (id: string, slug = "x"): StockItem => ({ id, w: 720, h: 1280, alt: "", thumb: "", src: "", by: "", byUrl: "", url: `https://www.pexels.com/video/${slug}-${id}/`, duration: 10 });

/** A click every `gap` seconds: a short loud burst that fades, over faint hiss. */
function clicks(gap: number, seconds: number, rate = 8000, offset = 0): Float32Array {
  const pcm = new Float32Array(Math.round(seconds * rate)).map((_, i) => 0.003 * Math.sin(i * 0.7));
  for (let t = offset; t < seconds; t += gap) {
    const at = Math.round(t * rate);
    for (let i = 0; i < 400 && at + i < pcm.length; i++) pcm[at + i] += 0.8 * Math.exp(-i / 120) * Math.sin(i * 0.9);
  }
  return pcm;
}

suite("beats of a track", () => {
  it("finds the hits of a steady pulse", () => {
    const b = beatTimes(clicks(0.5, 6), 8000);
    expect(b.length).toBeGreaterThanOrEqual(10);
    for (const t of b) expect(Math.abs(t / 0.5 - Math.round(t / 0.5)) * 0.5).toBeLessThan(0.06);
  });
  it("hears nothing in hiss or silence", () => {
    expect(beatTimes(new Float32Array(8000 * 4), 8000)).toEqual([]);
    expect(beatTimes(new Float32Array(8000 * 4).map((_, i) => 0.01 * Math.sin(i * 0.3)), 8000)).toEqual([]);
  });
  it("keeps hits at least 0.3 s apart", () => {
    const b = beatTimes(clicks(0.1, 3), 8000);
    for (let i = 1; i < b.length; i++) expect(b[i] - b[i - 1]).toBeGreaterThanOrEqual(0.29);
  });
});

suite("cuts on the beat", () => {
  const lengths = [4, 4, 4, 4, 4, 4, 4];
  it("moves a cut to a beat within reach and leaves the rest", () => {
    const out = snapCuts(lengths, [4.3, 12.1, 20]);
    expect(out[0]).toBeCloseTo(4.3, 2);
    expect(out[1]).toBeCloseTo(3.7, 2); // 8 had no beat within reach
    expect(out[2]).toBeCloseTo(4.1, 2); // 12.1
  });
  it("never moves a cut further than SNAP", () => {
    expect(snapCuts(lengths, [4 + SNAP + 0.1])).toEqual(lengths);
  });
  it("keeps the total, and never leaves a beat under the shortest", () => {
    const beats = Array.from({ length: 60 }, (_, i) => i * 0.5 + 0.1);
    const out = snapCuts(lengths, beats);
    expect(out.reduce((n, x) => n + x, 0)).toBeCloseTo(28, 1);
    for (const x of out) expect(x).toBeGreaterThanOrEqual(SHORTEST);
  });
  it("skips a beat that would leave the one before it too short", () => {
    const out = snapCuts([2, 2, 2, 2], [2.5, 3.5]);
    expect(out[0]).toBeCloseTo(2.5, 2);
    expect(out[1]).toBeCloseTo(1.5, 2); // 3.5 is only 1 s on from the last cut
  });
  it("is the lengths as they were with no beats", () => {
    expect(snapCuts(lengths, [])).toEqual(lengths);
  });
});

suite("the clip for each beat", () => {
  it("describes a stock video by its page name", () => {
    expect(describe(item("99", "woman-walking-on-street"))).toBe("woman walking on street");
    expect(describe({ url: "" })).toBe("");
  });
  it("takes the clip Jev picked, or the first when it gave no answer", () => {
    const a = [item("1"), item("2"), item("3")];
    expect(chooseFor([[a, []]], [[2, null]])[0]).toMatchObject({ item: { id: "3" }, fits: true });
    expect(chooseFor([[a, []]], [[null, null]])[0]).toMatchObject({ item: { id: "1" }, fits: true });
  });
  it("never uses a clip twice", () => {
    const a = [item("1"), item("2")];
    const out = chooseFor([[a, []], [a, []]], [[0, null], [0, null]]);
    expect(out.map((c) => c?.item.id)).toEqual(["1", "2"]);
  });
  it("tries the broader search when none of the first fits, and says it fits", () => {
    const out = chooseFor([[[item("1")], [item("5")]]], [[-1, 0]]);
    expect(out[0]).toMatchObject({ item: { id: "5" }, fits: true });
  });
  it("lets the best found stand in when nothing fits, marked as a stand-in", () => {
    const out = chooseFor([[[item("1")], [item("5")]]], [[-1, -1]]);
    expect(out[0]).toMatchObject({ item: { id: "5" }, fits: false });
    expect(chooseFor([[[item("1")], []]], [[-1, null]])[0]).toMatchObject({ item: { id: "1" }, fits: false });
  });
  it("leaves a beat out when there is no clip at all", () => {
    expect(chooseFor([[[], []]], [[null, null]])).toEqual([null]);
  });
});

suite("what the adviser is told", () => {
  it("says nothing when every beat had its clip", () => {
    expect(noteOf({ swapped: [], missed: [] })).toBe("");
  });
  it("names the beats that had no good clip and what stood in", () => {
    const n = noteOf({ swapped: [{ beat: "A hawker stall at dawn", used: "city skyline" }], missed: ["Rain on a window"] });
    expect(n).toContain('No good clip for "A hawker stall at dawn", used "city skyline" instead.');
    expect(n).toContain('Left out for lack of a clip: "Rain on a window".');
  });
});
