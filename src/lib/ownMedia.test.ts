import { beforeEach, describe, expect, it, vi } from "vitest";

// every paid or device step is stubbed: the words, the voiceover and putting the video together
const io = vi.hoisted(() => ({
  steps: [] as string[],
  words: { hook: "Your cover changed. Did you notice?", lines: ["Coffee with a client", "Her plan from 2019"], say: ["We met.", "Her plan was six years old, never read."] } as Record<string, unknown>,
  voiceFails: false,
  extra: null as unknown,
  scenes: [] as { seconds: number }[],
}));
vi.mock("@/lib/supabase", () => ({ supabase: {}, SUPABASE_ANON_KEY: "", SUPABASE_URL: "" }));
vi.mock("@/lib/edgeFn", () => ({
  EdgeError: class extends Error {},
  callFn: async (_n: string, body: Record<string, unknown>) => {
    io.steps.push(`write ${body.kind} ${body.count}`);
    return io.words;
  },
}));
vi.mock("@/lib/textVoice", () => ({
  speak: async () => {
    io.steps.push("voice");
    if (io.voiceFails) throw new Error("Couldn't make the voiceover. Try again in a minute.");
    return new Blob(["mp3"]);
  },
  audioSeconds: async () => 10,
}));
vi.mock("@/lib/videoMedia", () => ({
  currentJoin: () => null,
  encodeWav: () => new Blob(["wav"]),
  putFile: async (k: string) => void io.steps.push(`put ${k.split("-").slice(0, 2).join("-")}`),
  startSlides: async (_name: string, scenes: { seconds: number }[], _t: Blob, _l: string, o: { extra: unknown }) => {
    io.steps.push("join");
    io.scenes = scenes;
    io.extra = o.extra;
  },
}));
vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => "blob:x", revokeObjectURL: () => {} }));
const mem = new Map<string, string>();
vi.stubGlobal("localStorage", { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) });

import {
  LEO_PANELS, MAX_PICTURES, START_PANELS, footageCount, readsLonger, footageWords, lineOverlays, makeOwn, movePicture, mutedWithMusic, ownState, pickFiles, pictureExtra, pictureSeconds,
  setOwn, sortDrop, withPanel, writeOwn,
} from "./ownMedia";
import { formatJobs } from "./formatJob";

const file = (name: string, type: string) => new File(["x"], name, { type });
const pics = (n: number) => Array.from({ length: n }, (_, i) => file(`p${i}.jpg`, "image/jpeg"));

beforeEach(() => {
  io.steps.length = 0;
  io.voiceFails = false;
  io.extra = null;
  setOwn({ pictures: [], video: null, written: null, music: null, error: "", note: "", step: "", sound: "voice", words: true, about: "why I check my clients' cover every year" });
});

describe("the start panels", () => {
  it("adds own and clips for Leo only, and opens one of them at a time", () => {
    expect(LEO_PANELS).toEqual(expect.arrayContaining(["own", "clips", "wall", "join", "ai"]));
    expect(START_PANELS).not.toContain("own");
    expect(START_PANELS).not.toContain("clips");
    expect(withPanel(["join", "clips"], "own")).toEqual(["join", "own"]);
    expect(withPanel(["own"], "clips")).toEqual(["clips"]);
    expect(withPanel(["own"], "join")).toEqual(["own", "join"]);
  });
});

describe("what a drop does", () => {
  it("keeps the first 10 pictures and says so", () => {
    const d = sortDrop(pics(13), 0);
    expect(d).toMatchObject({ kind: "pictures", over: true });
    expect(d?.kind === "pictures" && d.files.map((f) => f.name)).toEqual(pics(10).map((f) => f.name));
    // 8 already in the grid: room for 2
    expect(sortDrop(pics(3), 8)).toMatchObject({ kind: "pictures", over: true, files: [{ name: "p0.jpg" }, { name: "p1.jpg" }] });
    expect(sortDrop(pics(2), 0)).toMatchObject({ over: false });
    expect(MAX_PICTURES).toBe(10);
  });

  it("sends several videos to Join takes, takes one video on its own, and ignores anything else", () => {
    expect(sortDrop([file("a.mp4", "video/mp4"), file("b.mov", "video/quicktime")], 0)).toEqual({ kind: "join" });
    expect(sortDrop([file("a.mp4", "video/mp4"), ...pics(2)], 0)).toMatchObject({ kind: "video", file: { name: "a.mp4" } });
    expect(sortDrop([file("a.pdf", "application/pdf")], 0)).toBeNull();
  });
});

describe("timing", () => {
  it("gives pictures 3 seconds each with a 6-second floor without a voice", () => {
    expect(pictureSeconds(5)).toEqual([3, 3, 3, 3, 3]);
    expect(pictureSeconds(2)).toEqual([3, 3]);
    expect(pictureSeconds(1)).toEqual([6]);
  });

  it("follows the voiceover's words with one", () => {
    expect(pictureSeconds(2, { say: ["one two", "three four five six"], seconds: 12 })).toEqual([4, 8]);
  });

  it("gives footage a line per 5 seconds, 1 to 12", () => {
    expect([footageCount(20), footageCount(2), footageCount(300)]).toEqual([4, 1, 12]);
  });

  it("puts each line over its own stretch", () => {
    const o = lineOverlays(["One", "Two"], [3, 4]);
    expect(o.map((x) => [x.kind, x.text, x.from, x.to])).toEqual([["text", "One", 0.1, 2.9], ["text", "Two", 3.1, 6.9]]);
  });
});

describe("what the video carries to the editor", () => {
  const written = { hook: "Hook", lines: ["One", "Two"] };
  it("opens music only at once with its track and no captions", () => {
    const music = { key: "mu-own-1", name: "Song", level: 0.35 };
    const e = pictureExtra({ written, words: true, seconds: [3, 3], voice: false, music });
    expect(e.settings).toMatchObject({ captions: false, music, hook: "Hook" });
    expect(e.settings?.overlays).toHaveLength(2);
    expect(e.toast).toBe("Your video is ready. Export it when it looks right.");
    expect(mutedWithMusic(music)).toEqual({ volume: 0, captions: false, music });
  });

  it("captions a voiceover, and leaves the words out when they are off", () => {
    const e = pictureExtra({ written, words: false, seconds: [3, 3], voice: true });
    expect(e.settings).toEqual({});
  });
});

describe("the pictures' make", () => {
  it("writes the words for the pictures, then the voiceover, then puts it together with a picture per spoken line", async () => {
    pickFiles({ kind: "pictures", files: pics(2), over: false });
    await writeOwn("u1");
    expect(ownState().written?.say).toHaveLength(2);
    await makeOwn();
    expect(io.steps).toEqual(["write pictures 2", "voice", "join"]);
    expect(io.scenes.map((s) => s.seconds)).toEqual([2, 8]);
    expect(io.extra).toMatchObject({ settings: { hook: "Your cover changed. Did you notice?" } });
    expect((io.extra as { settings: Record<string, unknown> }).settings.captions).toBeUndefined();
    // done: the panel is empty again, the about kept
    expect(ownState().pictures).toEqual([]);
    expect(ownState().about).toContain("cover");
    expect(formatJobs().find((j) => j.slug === "own-media")).toBeUndefined();
  });

  it("stops before putting anything together when the voiceover fails, keeping the pictures and words", async () => {
    pickFiles({ kind: "pictures", files: pics(2), over: false });
    await writeOwn("u1");
    io.voiceFails = true;
    await makeOwn();
    expect(io.steps).toEqual(["write pictures 2", "voice"]);
    expect(ownState()).toMatchObject({ step: "", error: "Couldn't make the voiceover. Try again in a minute." });
    expect(ownState().pictures).toHaveLength(2);
    expect(ownState().written).not.toBeNull();
    expect(formatJobs().find((j) => j.slug === "own-media")).toMatchObject({ state: "failed", href: "/edit?panel=own" });
  });

  it("puts music-only pictures together on a silent track, 15 seconds for five", async () => {
    pickFiles({ kind: "pictures", files: pics(5), over: false });
    setOwn({ sound: "music", music: file("song.mp3", "audio/mpeg"), words: false });
    await makeOwn();
    expect(io.steps).toEqual(["put mu-own", "join"]);
    expect(io.scenes.reduce((a, s) => a + s.seconds, 0)).toBe(15);
    expect(io.extra).toMatchObject({ settings: { captions: false, music: { name: "song" } } });
  });

  it("moves a picture with its own lines, and a new about asks for the words again", async () => {
    pickFiles({ kind: "pictures", files: pics(2), over: false });
    await writeOwn("u1");
    movePicture(0, 1);
    expect(ownState().pictures.map((p) => p.file.name)).toEqual(["p1.jpg", "p0.jpg"]);
    expect(ownState().written?.lines).toEqual(["Her plan from 2019", "Coffee with a client"]);
    movePicture(1, 0);
    expect(ownState().written?.say).toEqual(["Her plan was six years old, never read."]);
    setOwn({ about: "something else" });
    expect(ownState().written).toBeNull();
  });
});

describe("words for footage", () => {
  it("asks for a line per 5 seconds and lays them over the clip", async () => {
    io.words = { hook: "H", lines: ["a", "b", "c", "d"] };
    const w = await footageWords("u1", "what happens at a client review", 20);
    expect(io.steps).toEqual(["write video 4"]);
    expect(w.hook).toBe("H");
    expect(w.overlays.map((o) => [o.from, o.to])).toEqual([[0.1, 4.9], [5.1, 9.9], [10.1, 14.9], [15.1, 19.9]]);
  });
});

describe("words over a video: time to read", () => {
  it("reads a made 8 s clip (7.999 s) as 8 s, so 25 to 28 words that need 8 s don't warn", () => {
    expect(readsLonger(8, 7.999)).toBeNull();
    expect(readsLonger(8, 8)).toBeNull();
    // too long still warns, naming the same seconds it compares
    expect(readsLonger(9, 7.999)).toBe(8);
    expect(readsLonger(8, 7.4)).toBe(7);
    expect(readsLonger(0, 0)).toBeNull();
  });
});
