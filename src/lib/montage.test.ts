import { afterEach, describe as suite, expect, it, vi } from "vitest";

vi.mock("@/lib/edgeFn", () => ({ callFn: vi.fn() }));
vi.mock("@/lib/stockMedia", () => ({ searchStock: vi.fn(), downloadStock: vi.fn() }));
vi.mock("@/lib/deviceFiles", () => ({ putFile: vi.fn(async () => {}), getFile: vi.fn(async () => undefined) }));
vi.mock("@/lib/videoMedia", () => ({ currentJoin: vi.fn(() => null), monoPcm: vi.fn(), startJoin: vi.fn(async () => {}) }));

import { callFn } from "@/lib/edgeFn";
import { downloadStock, searchStock } from "@/lib/stockMedia";
import { getFile } from "@/lib/deviceFiles";
import { currentJoin, startJoin } from "@/lib/videoMedia";
import type { MediaItem } from "@/lib/mediaLibrary";
import { SHORTEST, SNAP, beatTimes, chooseFor, chooseFromSet, describe, montageBusy, montageJob, noteOf, setCandidates, snapCuts, startMontage } from "./montage";
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

suite("everyone's montage", () => {
  // pinned on today's code (7cd872f4): a montage with no set searches stock per beat, asks Jev twice and joins
  it("asks for the plan, searches and picks stock as before, the broader search only where nothing fit", async () => {
    const beats = [
      { say: "Kopi at dawn", search: "coffee morning", fallback: "coffee", text: "Start slow", seconds: 4 },
      { say: "The MRT fills up", search: "train commute", fallback: "city crowd", text: "", seconds: 4 },
      { say: "Rain on the window", search: "rain window", fallback: "rain window", text: "Then rain", seconds: 4 },
      { say: "Hawker lunch", search: "hawker food", fallback: "street food", text: "", seconds: 6 },
    ];
    let picks = 0;
    vi.mocked(callFn).mockImplementation(async (_fn, body) => ((body as { mode: string }).mode === "montage" ? { beats, grade: "warm" } : { picks: ++picks === 1 ? [0, -1, null, null] : [null, 1, null, null] }));
    const queries = ["coffee morning", "train commute", "rain window", "hawker food", "city crowd"];
    vi.mocked(searchStock).mockImplementation(async (_k, q) => {
      const n = queries.indexOf(q) + 1;
      const it = (id: string) => ({ ...item(id, q.replace(/ /g, "-")), src: `https://p/${id}.mp4` });
      return { items: q === "rain window" ? [] : [it(`${n}1`), it(`${n}2`)], more: false };
    });
    vi.mocked(downloadStock).mockImplementation(async (src: string) => new Blob([src]));
    await startMontage({ theme: "Singapore mornings", seconds: 20, words: true, music: null });
    expect(vi.mocked(callFn).mock.calls).toEqual([
      ["video-assist", { mode: "montage", theme: "Singapore mornings", seconds: 20 }, "Couldn't plan the montage right now. Try again in a minute."],
      ["video-assist", { mode: "montage-pick", theme: "Singapore mornings", beats: [
        { say: "Kopi at dawn", candidates: [{ desc: "coffee morning" }, { desc: "coffee morning" }] },
        { say: "The MRT fills up", candidates: [{ desc: "train commute" }, { desc: "train commute" }] },
        { say: "Rain on the window", candidates: [] },
        { say: "Hawker lunch", candidates: [{ desc: "hawker food" }, { desc: "hawker food" }] },
      ] }],
      ["video-assist", { mode: "montage-pick", theme: "Singapore mornings", beats: [
        { say: "Kopi at dawn", candidates: [] },
        { say: "The MRT fills up", candidates: [{ desc: "city crowd" }, { desc: "city crowd" }] },
        { say: "Rain on the window", candidates: [] },
        { say: "Hawker lunch", candidates: [] },
      ] }],
    ]);
    expect(vi.mocked(searchStock).mock.calls.map(([k, q, page, o]) => [k, q, page, o])).toEqual([
      ["video", "coffee morning", 1, "portrait"], ["video", "train commute", 1, "portrait"], ["video", "rain window", 1, "portrait"], ["video", "hawker food", 1, "portrait"],
      ["video", "city crowd", 1, "portrait"],
    ]);
    expect(montageJob()).toMatchObject({ state: "done" });
    const [name, takes, label, opts] = vi.mocked(startJoin).mock.calls[0];
    expect([name, label]).toEqual(["Singapore mornings", "Putting your montage together"]);
    expect(await Promise.all(takes.map(async (t) => [await (t.file as Blob).text(), t.start, t.end]))).toEqual([
      ["https://p/11.mp4", 0, 4], ["https://p/52.mp4", 0, 4], ["https://p/41.mp4", 0, 6],
    ]);
    expect(opts).toMatchObject({ mute: true, extra: { note: 'Left out for lack of a clip: "Rain on the window".', settings: { filter: "warm", captions: false } } });
    expect(opts?.extra?.settings?.overlays?.map((o) => [o.text, o.from, o.to])).toEqual([["Start slow", 0.1, 3.9]]);
    expect(opts?.extra && "draftId" in opts.extra).toBe(false);
  });
});

suite("a montage from a clip set", () => {
  const clip = (n: number, seconds: number, alt = `clip ${n}`): MediaItem => ({ key: `cvid-clip00${n}`, name: `c${n}`, folder: "City clips", alt, width: 720, height: 1280, addedAt: `2026-10-1${n}`, kind: "video", seconds });

  it("offers each beat only the set's clips at least as long as it, the ones with no words last", () => {
    const clips = [clip(1, 3), clip(2, 8, ""), clip(3, 5), clip(4, 12)];
    const got = setCandidates(clips, [4, 6, 10, 20]);
    expect(got.map((xs) => xs.map((c) => c.key))).toEqual([
      ["cvid-clip003", "cvid-clip004", "cvid-clip002"],
      ["cvid-clip004", "cvid-clip002"],
      ["cvid-clip004"],
      [],
    ]);
    for (const [i, len] of [4, 6, 10, 20].entries()) for (const c of got[i]) expect(c.seconds).toBeGreaterThanOrEqual(len);
  });

  it("takes Jev's pick or the first unused, never a clip twice, and sends a none to stock", () => {
    const a = [clip(1, 9), clip(2, 9)];
    expect(chooseFromSet([a, a, a, []], [1, 1, -1, null]).map((c) => c?.key ?? null)).toEqual(["cvid-clip002", "cvid-clip001", null, null]);
    expect(chooseFromSet([a, a, a], [null, null, null]).map((c) => c?.key ?? null)).toEqual(["cvid-clip001", "cvid-clip002", null]);
  });

  it("with Jev's scores gives a clip that tops two beats to the one it fits best, and a none still goes to stock", () => {
    const a = [clip(1, 9), clip(2, 9), clip(3, 9)];
    const keys = (xs: (MediaItem | null)[]) => xs.map((c) => c?.key ?? null);
    // clip 1 tops beats 0 and 1, best for beat 1; beat 2 said none, though it rates clip 1 highest of all
    expect(keys(chooseFromSet([a, a, a], [0, 0, -1], [[0.5, 0.1, 0.4], [0.7, 0.2, 0.1], [0.9, 0, 0]]))).toEqual(["cvid-clip003", "cvid-clip001", null]);
  });

  it("says which beats came from stock", () => {
    expect(noteOf({ swapped: [], missed: [], stock: { set: "City clips", beats: [] } })).toBe("");
    expect(noteOf({ swapped: [], missed: [], stock: { set: "City clips", beats: ["Rain on the window", "Hawker lunch"] } })).toBe('From stock, as nothing in City clips fit: "Rain on the window", "Hawker lunch".');
  });

  it("fills the beats from the set with one set pick, and only the rest from stock, labelled stock", async () => {
    vi.mocked(callFn).mockReset();
    vi.mocked(searchStock).mockReset();
    vi.mocked(startJoin).mockReset();
    const beats = [
      { say: "Kopi at dawn", search: "coffee morning", fallback: "coffee", text: "", seconds: 4 },
      { say: "The MRT fills up", search: "train commute", fallback: "city crowd", text: "", seconds: 4 },
      { say: "Night lights", search: "city night", fallback: "city night", text: "", seconds: 4 },
      { say: "Hawker lunch", search: "hawker food", fallback: "street food", text: "", seconds: 6 },
    ];
    let picks = 0;
    vi.mocked(callFn).mockImplementation(async (_fn, body) => ((body as { mode: string }).mode === "montage" ? { beats, grade: "warm" } : { picks: ++picks === 1 ? [0, -1, 1, null] : [0, 0, 0, 0] }));
    vi.mocked(searchStock).mockImplementation(async (_k, q) => ({ items: [{ ...item(String(q.length), q.replace(/ /g, "-")), src: `https://p/${q}.mp4` }], more: false }));
    vi.mocked(downloadStock).mockImplementation(async (src: string) => new Blob([src]));
    vi.mocked(getFile).mockImplementation(async (k: string) => new Blob([`file ${k}`]));
    const clips = [clip(1, 9, "busy train platform"), clip(2, 5, "city lights at night"), clip(3, 2, "too short")];
    await startMontage({ theme: "Singapore mornings", seconds: 20, words: false, music: null, set: { name: "City clips", clips } });
    const asked = vi.mocked(callFn).mock.calls.map(([, b]) => b as { mode: string; set?: boolean; beats: { say: string; candidates: { desc: string }[] }[] });
    expect(asked[1]).toEqual({ mode: "montage-pick", theme: "Singapore mornings", set: true, beats: [
      { say: "Kopi at dawn", candidates: [{ desc: "busy train platform" }, { desc: "city lights at night" }] },
      { say: "The MRT fills up", candidates: [{ desc: "busy train platform" }, { desc: "city lights at night" }] },
      { say: "Night lights", candidates: [{ desc: "busy train platform" }, { desc: "city lights at night" }] },
      { say: "Hawker lunch", candidates: [{ desc: "busy train platform" }] },
    ] });
    // stock only for the beat Jev said nothing in the set shows, and the one the set had no clip left for
    expect(vi.mocked(searchStock).mock.calls.map(([, q]) => q)).toEqual(["train commute", "hawker food"]);
    expect(asked[2].set).toBeUndefined();
    const [, takes, , opts] = vi.mocked(startJoin).mock.calls[0];
    expect(await Promise.all(takes.map(async (t) => [await (t.file as Blob).text(), t.end]))).toEqual([
      ["file cvid-clip001", 4], ["https://p/train commute.mp4", 4], ["file cvid-clip002", 4], ["https://p/hawker food.mp4", 6],
    ]);
    expect(opts?.extra?.note).toBe('From stock, as nothing in City clips fit: "The MRT fills up", "Hawker lunch".');
  });
});

suite("the montage job", () => {
  const beats = ["coffee morning", "train commute", "hawker food"].map((q) => ({ say: q, search: q, fallback: q, text: "", seconds: 4 }));
  const stocked = () => {
    vi.mocked(callFn).mockReset().mockImplementation(async (_fn, body) => ((body as { mode: string }).mode === "montage" ? { beats, grade: "warm" } : { picks: [0, 0, 0] }));
    vi.mocked(searchStock).mockReset().mockImplementation(async (_k, q) => ({ items: [{ ...item(q, q.replace(/ /g, "-")), src: `https://p/${q}.mp4` }], more: false }));
    vi.mocked(downloadStock).mockReset().mockImplementation(async (src: string) => new Blob([src]));
    vi.mocked(startJoin).mockReset().mockResolvedValue(undefined);
  };
  const ASK = { theme: "Singapore mornings", seconds: 15, words: false, music: null };
  afterEach(() => void vi.mocked(currentJoin).mockReset().mockReturnValue(null));

  it("ends failed in the join's own words when the video can't be put together, so Make the montage works again", async () => {
    stocked();
    vi.mocked(currentJoin).mockImplementation(() => (vi.mocked(startJoin).mock.calls.length ? { progress: 0, state: "failed", error: "This browser can't record video." } : null));
    await startMontage(ASK);
    expect(montageJob()).toMatchObject({ state: "failed", error: "This browser can't record video." });
    expect(montageBusy()).toBe(false);
  });
});
