// Same edit's job (sameEditJob.ts): the pure parts, the read's stops before anything paid, the read itself, and the
// first version's make for I'll film it, a face (with its price check) and no face, plus the resume at no cost.
// Every provider is a fake; each test of a press says which calls ran.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { VoiceId } from "./textVoice";
import type { Word } from "./videoEdit";
import type { EditPicks, EditRead } from "../../supabase/functions/reel-visuals/edit";

const f = vi.hoisted(() => {
  const store = new Map<string, string>();
  const localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
  };
  (globalThis as { localStorage?: unknown }).localStorage = localStorage;
  (globalThis as { window?: unknown }).window = { localStorage, dispatchEvent: () => true, addEventListener: () => {}, removeEventListener: () => {} };
  (globalThis as { Image?: unknown }).Image = class {
    src = "";
    decode() {
      return Promise.resolve();
    }
  };
  const ai = {
    job: null as null | { kind: string; state: string; step: string; error?: string },
    listeners: new Set<(j: unknown) => void>(),
    emit(j: { kind: string; state: string; step: string; error?: string }) {
      ai.job = j;
      ai.listeners.forEach((l) => l(j));
    },
  };
  return { store, ai, calls: [] as string[], pending: null as null | { extra?: { toast?: string } } };
});

vi.mock("@/lib/supabase", () => ({ SUPABASE_URL: "https://abc.supabase.co", SUPABASE_ANON_KEY: "", supabase: { auth: { getSession: async () => ({ data: { session: null } }) }, functions: { invoke: vi.fn() } } }));
vi.mock("@/lib/aiVideo", () => ({
  aiBusy: () => f.ai.job?.state === "working",
  aiJob: () => f.ai.job,
  onAiJob: (fn: (j: unknown) => void) => {
    f.ai.listeners.add(fn);
    return () => f.ai.listeners.delete(fn);
  },
  pendingAvatar: () => f.pending,
  resumeAvatar: vi.fn(() => {
    f.calls.push("resumeAvatar");
    f.ai.emit({ kind: "avatar", state: "working", step: "Downloading your video..." });
  }),
  sliceVoiceover: vi.fn(),
  makeAvatar: vi.fn(async () => {
    f.calls.push("makeAvatar");
    f.ai.emit({ kind: "avatar", state: "working", step: "Sending your voiceover and photo..." });
  }),
}));
vi.mock("@/lib/carousel", () => ({ loadBrand: () => ({ color: "#123456", name: "ActivityTracker", handle: "" }) }));
vi.mock("@/lib/draftHistory", () => ({ newDraftId: () => "d-1", upsertDraft: vi.fn(() => []) }));
vi.mock("@/lib/edgeFn", async (actual) => ({ ...(await actual<typeof import("./edgeFn")>()), callFn: vi.fn() }));
vi.mock("@/lib/remix", () => ({ fullText: () => "the clone's words", requestMake: vi.fn(), tooLongLine: (s: number) => `The script runs ${Math.round(s)} s.` }));
vi.mock("@/lib/remixBrand", () => ({ brandPack: () => ({ facts: "Over 1,200 advisers use it." }) }));
vi.mock("@/lib/remixTeardown", () => ({ ensureTeardown: vi.fn() }));
vi.mock("@/lib/reelClone", () => ({ ReelCloneError: class extends Error {}, invokeFunction: vi.fn(), loadSavedClones: vi.fn(() => []) }));
vi.mock("@/lib/reelFrames", () => ({ fetchReelVideo: vi.fn() }));
vi.mock("@/lib/reelStyle", async (actual) => ({ ...(await actual<typeof import("./reelStyle")>()), measureReel: vi.fn() }));
vi.mock("@/lib/slideshowJob", () => ({
  makeBody: (_u: string, a: { source: unknown }, as: string) => ({ mode: "make", as, source: a.source ? { key: "clone:instagram:DQx1abc", text: "the clone's words" } : undefined, brand: { facts: "" } }),
  failure: (e: unknown, fallback: string) => ({ error: (e as { status?: number })?.status === 400 ? (e as Error).message : fallback }),
}));
vi.mock("@/lib/stockMedia", () => ({
  searchStock: vi.fn(async (_k: string, q: string) => ({ items: q === "nothing" ? [] : [{ id: `${q.length}01`, src: `https://stock/${q}.mp4`, thumb: "t", by: "b", byUrl: "u", url: "p", w: 1080, h: 1920, duration: 6 }], more: false })),
  downloadStock: vi.fn(async () => new Blob([new Uint8Array(4000)], { type: "video/mp4" })),
}));
vi.mock("@/lib/talkingHead", async (actual) => ({ ...(await actual<typeof import("./talkingHead")>()), speakers: vi.fn(), speakerFace: vi.fn() }));
vi.mock("@/lib/talkingHeadJob", () => ({ JOINING: "Putting your video together..." }));
vi.mock("@/lib/textVoice", async (actual) => ({ ...(await actual<typeof import("./textVoice")>()), audioSeconds: vi.fn(async () => 14) }));
vi.mock("@/lib/videoMedia", () => ({
  currentJoin: vi.fn(() => null),
  encodeWav: () => new Blob(["wav"]),
  getFile: vi.fn(async (k: string) => new Blob([k])),
  loadVideo: vi.fn(async () => ({ videoWidth: 1080, videoHeight: 1920, duration: 30, src: "blob:x" })),
  monoPcm: vi.fn(),
  putFile: vi.fn(async () => undefined),
  seek: vi.fn(async () => undefined),
  startSlides: vi.fn(async () => {
    f.calls.push("startSlides");
  }),
}));
vi.mock("@/lib/videoProjects", () => ({ transcribe: vi.fn() }));
vi.mock("@/lib/wallJob", () => ({ noteOf: () => undefined }));
vi.mock("@/lib/faceVision", () => ({ countFaces: vi.fn(async () => 1) }));

const { callFn } = await import("./edgeFn");
const { requestMake } = await import("./remix");
const { ensureTeardown } = await import("./remixTeardown");
const { invokeFunction, loadSavedClones } = await import("./reelClone");
const { fetchReelVideo } = await import("./reelFrames");
const { measureReel } = await import("./reelStyle");
const { makeAvatar, sliceVoiceover } = await import("./aiVideo");
const { scriptEstimate, scriptSeconds, speakers, speakerFace, videoEstimate } = await import("./talkingHead");
const { monoPcm, startSlides } = await import("./videoMedia");
const { transcribe } = await import("./videoProjects");
const { upsertDraft } = await import("./draftHistory");
const { loadPlans } = await import("./editPlan");
const J = await import("./sameEditJob");

const UID = "6d80f027-3395-480c-86a1-8827d3d6cce3";
const SOURCE = { key: "clone:instagram:DQx1abc", kind: "clone" as const, format: "video" as const, platform: "instagram", url: "https://www.instagram.com/reel/DQx1abc/", author: "@sgmoney", remixedAt: "" };
const timed = (text: string, start = 0): Word[] => text.split(" ").map((w, i) => ({ w, s: start + i * 0.4, e: start + i * 0.4 + 0.35 }));
const TRANSCRIPT = ["Most advisers check Medisave yearly.", "Here's the costly mistake hiding inside it.", "Your hospital bill doubles quietly every renewal.", "Comment REVIEW below for my checklist."];
const WORDS: Word[] = [...timed(TRANSCRIPT[0], 0), ...timed(TRANSCRIPT[1], 3), ...timed(TRANSCRIPT[2], 10), ...timed(TRANSCRIPT[3], 24)];
const READ: EditRead = {
  frames: [
    { t: 0.4, shows: "A woman talks to camera in an office", framing: "close", texts: [{ text: "Medisave yearly?", place: "top" }] },
    { t: 6.4, shows: "A hospital corridor", framing: "wide", texts: [{ text: "$1,200 gone", place: "middle" }] },
    { t: 12.4, shows: "A woman talks to camera in an office", framing: "close", texts: [] },
    { t: 24.4, shows: "A phone screen with a bill", framing: "top-card", texts: [{ text: "Comment REVIEW", place: "bottom" }] },
  ],
  captions: "Bold white capitals, three words at a time, bottom third.",
  layout: "The speaker fills the frame.",
};
const PICKS: EditPicks = {
  shots: [{ pick: "speaker", p: 0.9 }, { pick: "cutaway", p: 0.8 }, null, { pick: "screen", p: 0.4 }],
  texts: [[{ pick: "hook", p: 0.9 }], [{ pick: "number", p: 0.7 }], [], [{ pick: "ask", p: 0.9 }]],
  beats: [{ pick: 0, p: 0.9 }, { pick: 2, p: 0.8 }, { pick: 1, p: 0.95 }, { pick: 3, p: 0.9 }],
  roles: [null, null, { pick: "proof", p: 0.8 }, { pick: "point", p: 0.9 }],
};
const LOOK = { style: "bold" as const, uppercase: true, captionBox: "pill" as const, position: "bottom" as const, words: "3" as const, captions: true, framed: null, topHalf: null };
const FRAMES = READ.frames.map((x) => ({ t: x.t, image: "data:image/jpeg;base64,AAAA" }));
const b64 = Buffer.from(new Uint8Array(3000)).toString("base64");

const fns = () => vi.mocked(callFn).mock.calls.map((c) => `${c[0]}${(c[1] as { mode?: string })?.mode ? `:${(c[1] as { mode: string }).mode}` : ""}`);

function readFakes() {
  vi.mocked(loadSavedClones).mockReturnValue([{ id: "instagram:DQx1abc", result: { source: { durationSec: 30 } } }] as never);
  vi.mocked(invokeFunction).mockResolvedValue({ source: { videoUrl: "https://cdn.example/r.mp4", durationSec: 30 } });
  vi.mocked(fetchReelVideo).mockResolvedValue(new Blob([new Uint8Array(5000)], { type: "video/mp4" }));
  vi.mocked(measureReel).mockResolvedValue({ duration: 30, cuts: [6, 12, 24], cutKinds: ["flash", "hard", "dip"], zooms: [2, 15], flashes: 1, dips: 1, frames: FRAMES, pacing: { durationSec: 30, cuts: 3, avgShotSec: 7.5, cutsFirst3s: 0 } });
  vi.mocked(monoPcm).mockResolvedValue({ pcm: new Float32Array(30 * 16000), duration: 30 });
  vi.mocked(transcribe).mockResolvedValue({ words: WORDS, text: TRANSCRIPT.join(" "), duration: 30 });
  vi.mocked(ensureTeardown).mockResolvedValue({ beats: ["Opens on a habit", "Names the cost", "Shows the bill", "Asks for a comment"], cta: "Comment REVIEW", payoff: "A checklist" } as never);
  vi.mocked(callFn).mockImplementation(async (name: string) => (name === "reel-visuals" ? { read: READ, look: LOOK, picks: PICKS } : null) as never);
}

/** A read plan on this device, with what the read heard in memory. */
async function readPlan() {
  readFakes();
  await J.startRead(UID, SOURCE);
  const id = J.sameEditJob()!.planId!;
  vi.mocked(callFn).mockClear();
  vi.mocked(invokeFunction).mockClear();
  return loadPlans(UID).find((e) => e.plan.id === id)!.plan;
}

const EDIT = {
  as: "edit",
  lines: ["Most adviser apps hide your renewals.", "ActivityTracker shows every one in a list you can act on.", "Message me for a look."],
  marks: [{ k: 0, line: 0, word: 0 }, { k: 1, line: 1, word: 3 }],
  texts: [{ k: 0, text: "Renewals hiding?" }],
  searches: [{ k: 3, search: "office laptop" }],
  caption: "Your renewals, in one list.",
};
const makeFakes = (face = true) => {
  vi.mocked(requestMake).mockResolvedValue({ result: EDIT, flags: { copied: [], claim: false, invented: false, mas: true }, as: "post", usage: { used: 1, limit: 30 } } as never);
  vi.mocked(speakers).mockReturnValue({ face: face ? ({ id: "face-1", photo: "data:image/jpeg;base64,AA" } as never) : null, presenters: [], who: "me" });
  vi.mocked(speakerFace).mockResolvedValue(new Blob(["face"]));
  vi.mocked(callFn).mockImplementation(async (name: string) => (name === "text-voice" ? { audio: b64, words: timed(EDIT.lines.join(" ")) } : null) as never);
  vi.mocked(sliceVoiceover).mockResolvedValue({ pcm: new Float32Array(1), seconds: 14, slices: [{ start: 0, end: 7 }, { start: 7, end: 14 }] });
};
const ASK = { source: SOURCE, voice: "alice" as const, length: 15 as const, close: "balanced" as const, mention: true };

beforeEach(() => {
  f.store.clear();
  f.calls.length = 0;
  f.ai.job = null;
  f.ai.listeners.clear();
  f.pending = null;
  vi.clearAllMocks();
});
afterEach(() => J.resetSameEdit());

describe("the pure parts", () => {
  it("names the shape, the teardown's beats and each shot's words", () => {
    expect([J.aspectOf(1080, 1920), J.aspectOf(1080, 1350), J.aspectOf(1080, 1080), J.aspectOf(1920, 1080)]).toEqual(["9:16", "4:5", "1:1", "16:9"]);
    expect(J.teardownBeats({ beats: ["One"], payoff: "", cta: "Follow for more" })).toEqual(["One", "Follow for more"]);
    expect(J.teardownBeats({ beats: [], payoff: "", cta: "None" })).toEqual(["The opening", "The close"]);
    expect(J.teardownBeats({ beats: Array.from({ length: 10 }, (_, i) => `b${i}`), payoff: "", cta: "" })).toHaveLength(8);
    const shots = J.shotsFor(READ.frames, [6, 12, 24], [1, 0, 1, 2], WORDS, 30);
    expect(shots.map((s) => s.face)).toEqual([true, false, true, true]);
    expect(shots[0].said).toBe(`${TRANSCRIPT[0]} ${TRANSCRIPT[1]}`);
    // a sentence runs across the cut at 12 s: each shot carries the words said during it
    expect(shots[1].said).toBe("Your hospital bill doubles quietly");
    expect(shots[2].said).toBe("every renewal.");
    expect(shots[3].said).toBe(TRANSCRIPT[3]);
  });

  it("hears a music bed, the drops before a line and effects on the cuts", () => {
    const rate = 1000;
    const pcm = new Float32Array(30 * rate);
    const fill = (a: number, b: number, amp: number) => {
      for (let i = Math.floor(a * rate); i < Math.floor(b * rate); i++) pcm[i] = i % 2 ? amp : -amp;
    };
    const words = [...timed("One two three.", 1), ...timed("Four five six.", 10)];
    for (const w of words) fill(w.s, w.e, 0.3);
    expect(J.soundOf(pcm, rate, words, [5, 15])).toEqual({ bed: false, drops: 0, sfx: false });
    // a bed under everything but the 0.5 s before the second line, and a click on both cuts
    fill(0, 9.4, 0.06);
    fill(10 + 3 * 0.4, 30, 0.06);
    for (const w of words) fill(w.s, w.e, 0.3);
    fill(5, 5.02, 0.9);
    fill(15, 15.02, 0.9);
    expect(J.soundOf(pcm, rate, words, [5, 15])).toEqual({ bed: true, drops: 1, sfx: true });
  });

  it("briefs the writer: each beat's share of the length at the voice's same-edit pace, and every event as its marker", () => {
    const plan = { read: { wpm: 240, seconds: 30 }, beats: [{ role: "hook", share: 0.2 }, { role: "point", share: 0.5 }, { role: "ask", share: 0.3 }], events: [{ kind: "text", place: { b: 0, at: 0, span: 1 }, role: "hook", words: 40, y: 0.2 }, { kind: "zoom", place: { b: 1, at: 0.5, span: 0.1 } }] } as never;
    // the voice's plain read (talkingHead's readWps) slowed by the pauses between beats caps the source's pace
    expect(J.wpsOf(plan, "eric")).toBeCloseTo(2.48 * 0.92, 9);
    expect(J.wpsOf(plan, "alice")).toBeCloseTo(2.4 * 0.92, 9);
    expect(J.wpsOf({ read: { wpm: 60 } } as never, "alice")).toBeCloseTo(2.4 * 0.92, 9);
    expect(J.wpsOf({ read: { wpm: null } } as never, "george")).toBeCloseTo(2.4 * 0.92, 9);
    expect(J.editBrief(plan, 15, "eric")).toEqual({
      beats: [{ role: "hook", seconds: 3, words: 6 }, { role: "point", seconds: 7.5, words: 17 }, { role: "ask", seconds: 4.5, words: 11 }],
      events: [{ b: 0, kind: "text", role: "hook", words: 20 }, { b: 1, kind: "zoom" }],
    });
  });

  // live-p7a-fix (27 Oct): same-edit scripts read slower than plain ones, with pauses between beats. Eric read 39 words in
  // 17.0 s (2.29 a second against his plain 2.48) on the one-speaker reel's plan, Alice 42 words in 18.8 s (2.23 against
  // her plain 2.40) on the graphics reel's
  it("writes a 15 s version that reads in 15 s at the pace same-edit scripts were measured at (live-p7a-fix D1)", () => {
    expect(J.SAME_EDIT_PACE).toBe(Math.floor(Math.min(2.23 / 2.4, 2.29 / 2.48) * 100) / 100);
    const plans: [VoiceId, number, number[], number][] = [
      ["eric", 216, [0.21, 0.201, 0.142, 0.068, 0.225, 0.153], 2.29], // plan-read-DdsjSosgWYL.json
      ["alice", 181, [0.378, 0.123, 0.104, 0.396], 2.23], // plan-read-DeJS3taDEgI.json
    ];
    for (const [voice, wpm, shares, read] of plans) {
      const plan = { read: { wpm, seconds: 44 }, beats: shares.map((share) => ({ role: "point", share })), events: [] } as never;
      const words = J.editBrief(plan, 15, voice).beats.reduce((n, b) => n + b.words, 0);
      expect(words / read, voice).toBeLessThanOrEqual(15);
    }
    // the 39 words Eric's 15 s version was written to come down to the 34 that fit
    expect(J.editBrief({ read: { wpm: 216, seconds: 44 }, beats: plans[0][2].map((share) => ({ role: "point", share })), events: [] } as never, 15, "eric").beats.reduce((n, b) => n + b.words, 0)).toBe(34);
  });

  it("writes a 15 s version that the voice reads in 15 s, so Make's price check charges the chip's price (live-p7a D1)", () => {
    // live-p7a's talker plan (ep-mvoignkm, 216 words a minute): its 48-word brief ran 20.15 s in Eric's voice, 3 Speak parts
    const plan = { read: { wpm: 216, seconds: 44.4 }, beats: [0.21, 0.201, 0.142, 0.068, 0.225, 0.153].map((share) => ({ role: "point", share })), events: [] } as never;
    for (const voice of ["alice", "eric", "george"] as const) {
      const words = J.editBrief(plan, 15, voice).beats.reduce((n, b) => n + b.words, 0);
      expect(scriptSeconds(words, voice)).toBeLessThanOrEqual(15);
      expect(scriptEstimate(words, voice).usd).toBeLessThanOrEqual(videoEstimate(15).usd);
    }
  });

  it("speaks a presenter in a voice that fits their look, as the agent and a campaign do; anyone else in the voice remembered (live-p7a D2)", () => {
    // live-p7a's Raj, from the run's device state
    const people = { presenters: [{ id: "pr-mvk90x7t", name: "Raj", look: "An Indian Singaporean man in his mid 30s, a side-parted crop, dark suit and a plain tie" }, { id: "pr-2", name: "Mei", look: "A Chinese Singaporean woman in her 40s" }] } as never;
    expect(J.voiceFor(people, "pr-mvk90x7t", "alice")).toBe("eric");
    expect(J.voiceFor(people, "pr-2", "eric")).toBe("alice");
    expect(J.voiceFor(people, "pr-2", "lily")).toBe("lily");
    for (const who of ["mine", "none", "film"]) expect(J.voiceFor(people, who, "alice")).toBe("alice");
    expect(J.voiceFor(null, "pr-mvk90x7t", "alice")).toBe("alice");
  });

  it("cuts a no-face video's clips at their marked words, the first from 0 and the last to the end", () => {
    // b runs 0.1 s before c starts, too short to show: its time goes to the clip before it
    expect(J.cutawayScenes([{ key: "b", from: 6.2 }, { key: "a", from: 2 }, { key: "c", from: 6.3 }], 14)).toEqual([{ key: "a", seconds: 6.3 }, { key: "c", seconds: 7.7 }]);
    expect(J.cutawayScenes([], 14)).toEqual([]);
  });

  it("prices each press and asks first", () => {
    const face = J.makePrice("mine", 15);
    expect(face !== "pick" && face && Math.round(face.usd * 100) / 100).toBe(2.77);
    expect(J.makePrice("none", 30)).toMatchObject({ usd: 0.0205 });
    expect(J.makeCaps("pr-1")).toEqual({ cap: "ai-video", caps: ["remix-make", "ai-voice"] });
    expect(J.askLine("mine", face)).toBe("This makes a video and uses about US$2.77 of video credit. Make it?");
    expect(J.askLine("film", J.makePrice("film", 15))).toBe("This writes your script and uses under US$0.01. Make it?");
    expect(J.askLine("none", J.makePrice("none", 15))).toBe("This makes a video and uses about US$0.02. Make it?");
    expect(J.readCaps({ clone: true, teardown: false })).toEqual(["reel-style", "video-transcribe", "remix-teardown"]);
    const read = J.readPrice({ clone: true, seconds: 30, teardown: true });
    expect(read !== "pick" && read && Math.round(read.usd * 1000) / 1000).toBe(0.063);
    expect([J.defaultWho(true), J.defaultWho(false)]).toEqual(["mine", "film"]);
  });

  it("stops a TikTok, a photo and a known 2-minute reel before anything is paid", () => {
    vi.mocked(loadSavedClones).mockReturnValue([{ id: "instagram:LONG", result: { source: { durationSec: 120 } } }] as never);
    expect(J.sourceStop(UID, { ...SOURCE, platform: "tiktok", key: "clone:tiktok:1" })).toBe("tiktok");
    expect(J.sourceStop(UID, { ...SOURCE, format: "image" })).toBe("no-video");
    expect(J.sourceStop(UID, { ...SOURCE, key: "clone:instagram:LONG" })).toBe("too-long");
    expect(J.sourceStop(UID, SOURCE)).toBeNull();
    expect(J.sourceStop(UID, { ...SOURCE, kind: "upload", key: "upload:abc", platform: undefined })).toBeNull();
  });

  it("sends an Instagram video read through Remix a post to Clone a reel first, since only a clone or an upload has its file (live-p7a D20)", () => {
    const link = { key: "link:instagram:DeJS3taDEgI", kind: "link" as const, format: "video" as const, platform: "instagram", url: "https://www.instagram.com/reel/DeJS3taDEgI/", remixedAt: "" };
    expect(J.sourceStop(UID, link)).toBe("clone-first");
    expect(J.sourceStop(UID, { ...link, kind: "top-post", key: "top:a-b" })).toBe("clone-first");
    expect(J.stopLine("clone-first")).toBe("Only a cloned reel or an upload has a video to read. Clone this reel first, then tap Rebuild this edit.");
    // no link to clone from, or not a video: nothing to read
    expect(J.sourceStop(UID, { ...link, url: undefined })).toBe("no-video");
    expect(J.sourceStop(UID, { ...link, format: "image" })).toBe("no-video");
  });
});

describe("Read the edit", () => {
  it("a TikTok, a 2-minute reel and a reel with no words each stop with their line and call nothing paid after", async () => {
    await J.startRead(UID, { ...SOURCE, key: "clone:tiktok:1", platform: "tiktok" });
    expect(J.sameEditJob()).toMatchObject({ state: "stopped", stop: "tiktok" });
    expect(J.stopLine("tiktok")).toBe("TikTok doesn't share the video file, so its edit can't be read. Upload the video, or remix its words.");
    readFakes();
    vi.mocked(invokeFunction).mockClear();
    vi.mocked(loadSavedClones).mockReturnValue([{ id: "instagram:DQx1abc", result: { source: { durationSec: 120 } } }] as never);
    await J.startRead(UID, SOURCE);
    expect(J.sameEditJob()).toMatchObject({ state: "stopped", stop: "too-long" });
    expect(invokeFunction).not.toHaveBeenCalled();
    // an unknown length read as 2 minutes on the device stops before the cuts are even measured
    readFakes();
    vi.mocked(loadSavedClones).mockReturnValue([]);
    const { loadVideo } = await import("./videoMedia");
    vi.mocked(loadVideo).mockResolvedValueOnce({ videoWidth: 1080, videoHeight: 1920, duration: 120, src: "blob:x" } as never);
    await J.startRead(UID, SOURCE);
    expect(J.sameEditJob()).toMatchObject({ state: "stopped", stop: "too-long" });
    expect(measureReel).not.toHaveBeenCalled();
    readFakes();
    vi.mocked(transcribe).mockResolvedValue({ words: [], text: "", duration: 30 });
    await J.startRead(UID, SOURCE);
    expect(J.sameEditJob()).toMatchObject({ state: "stopped", stop: "no-words" });
    expect(J.stopLine("no-words")).toBe("This reel has no spoken words to build on. Try Wall of text or Montage for reels like this.");
    expect(ensureTeardown).not.toHaveBeenCalled();
    expect(fns()).toEqual([]);
    expect(loadPlans(UID)).toEqual([]);
  });

  it("an upload takes only the file it was read from", async () => {
    readFakes();
    const file = new Blob(["my reel"], { type: "video/mp4" });
    await J.startRead(UID, { ...SOURCE, kind: "upload", key: "upload:0000", platform: undefined }, file);
    expect(J.sameEditJob()).toMatchObject({ state: "failed", error: J.NOT_SAME_FILE });
    expect(fns()).toEqual([]);
    const key = `upload:${await J.sha1Of(file)}`;
    expect(await J.sameFile(file, key)).toBe(true);
    await J.startRead(UID, { ...SOURCE, kind: "upload", key, platform: undefined }, file);
    expect(invokeFunction).not.toHaveBeenCalled();
    expect(fns()).toEqual(["reel-visuals:edit"]);
    expect(J.sameEditJob()?.state).toBe("read");
  });

  it("reads the reel into a saved plan that holds no run of the reel's words", async () => {
    readFakes();
    const seen: string[] = [];
    const off = J.onSameEditJob((j) => j?.state === "reading" && !seen.includes(j.step) && seen.push(j.step));
    await J.startRead(UID, SOURCE);
    off();
    expect(seen).toEqual([...J.READ_STEPS]);
    expect(invokeFunction).toHaveBeenCalledWith("clone-reel", { url: SOURCE.url, style: true });
    expect(fns()).toEqual(["reel-visuals:edit"]);
    const body = vi.mocked(callFn).mock.calls[0][1] as { frames: unknown[]; shots: { face: boolean }[]; sentences: string[]; beats: string[]; cta: string };
    expect([body.frames.length, body.shots.map((s) => s.face), body.sentences, body.beats.length, body.cta]).toEqual([4, [true, true, true, true], TRANSCRIPT, 4, "Comment REVIEW"]);
    const j = J.sameEditJob()!;
    expect(j.state).toBe("read");
    const plan = loadPlans(UID)[0].plan;
    expect(plan.id).toBe(j.planId);
    expect(plan.read).toMatchObject({ aspect: "9:16", seconds: 30, look: LOOK, people: 1 });
    expect(J.planRows(plan).map((r) => r.label)).toEqual(["Hook", "Proof", "Ask"]);
    expect(J.planRows(plan)[0]).toEqual({ at: 0, label: "Hook", parts: ["speaker", "text: hook, 2 words", "zoom"] });
    expect(J.lookLine(plan.read)).toBe("Captions: Bold, 3 words, bottom, box.  6 cuts a minute.");
    // no 4-word run of the transcript or the overlays (sharedRuns' floor) anywhere in the saved JSON
    const saved = JSON.stringify(loadPlans(UID)).toLowerCase();
    const theirs = [...TRANSCRIPT, ...READ.frames.flatMap((x) => [x.shows, ...x.texts.map((t) => t.text)])].map((t) => t.toLowerCase().replace(/[^\p{L}\p{N}$ ]/gu, "").split(/\s+/));
    for (const w of theirs) for (let i = 0; i + 4 <= w.length; i++) expect(saved).not.toContain(w.slice(i, i + 4).join(" "));
    expect(saved).not.toContain("medisave");
    expect(J.sourceVideo(SOURCE.key)).toMatch(/^blob:/);
  });

  it("a 1-shot reel still sends the 2 frames the edit read needs", async () => {
    readFakes();
    vi.mocked(measureReel).mockResolvedValue({ duration: 20, cuts: [], cutKinds: [], zooms: [], flashes: 0, dips: 0, frames: [FRAMES[0]], pacing: { durationSec: 20, cuts: 0, avgShotSec: 20, cutsFirst3s: 0 } });
    (globalThis as { document?: unknown }).document = { createElement: () => ({ getContext: () => ({ drawImage: () => {} }), toDataURL: () => "data:image/jpeg;base64,BBBB" }) };
    await J.startRead(UID, SOURCE);
    const body = vi.mocked(callFn).mock.calls[0][1] as { frames: { t: number }[]; shots: unknown[] };
    expect([body.frames.map((x) => x.t), body.shots.length]).toEqual([[0.4, 10], 2]);
  });
});

describe("Make my version", () => {
  it("I'll film it writes the script into the plan and My posts, and calls nothing else", async () => {
    const plan = await readPlan();
    makeFakes();
    await J.startMake(UID, { ...ASK, planId: plan.id, who: "film" });
    expect(J.sameEditJob()).toMatchObject({ state: "filmed", flags: { mas: true } });
    expect(requestMake).toHaveBeenCalledTimes(1);
    const body = vi.mocked(requestMake).mock.calls[0][0] as unknown as { as: string; close: string; edit: { beats: unknown[]; events: unknown[]; overlays: string[] } };
    expect([body.as, body.close, body.edit.beats.length, body.edit.events.length]).toEqual(["edit", "balanced", 3, plan.events.length]);
    expect(body.edit.overlays).toEqual(["Medisave yearly?", "$1,200 gone", "Comment REVIEW"]);
    expect(fns()).toEqual([]);
    expect(makeAvatar).not.toHaveBeenCalled();
    const draft = vi.mocked(upsertDraft).mock.calls[0][1];
    expect(draft).toMatchObject({ id: "d-1", format: "short-video", set: { id: plan.id, kind: "versions", from: SOURCE.key }, source: { key: SOURCE.key } });
    expect(draft.draft).toBe(`${EDIT.lines.join("\n\n")}\n\n---\n\nCAPTION:\n${EDIT.caption}`);
    const v = loadPlans(UID)[0].versions[0];
    expect(v).toMatchObject({ host: { kind: "film" }, lines: EDIT.lines, marks: EDIT.marks, draft: "d-1", lang: "en" });
    expect(v.id).toMatch(/^ev-/);
  });

  it("your face: the voice with word times, the cutaways and the plan laid into the Speak run's hand-off", async () => {
    const plan = await readPlan();
    makeFakes();
    const run = J.startMake(UID, { ...ASK, planId: plan.id, who: "mine" });
    await vi.waitFor(() => expect(J.sameEditJob()?.state).toBe("video"));
    expect(fns()).toEqual(["text-voice"]);
    expect(vi.mocked(callFn).mock.calls[0][1]).toEqual({ text: EDIT.lines.join(" "), voice: "alice", timestamps: true });
    expect(f.calls).toEqual(["makeAvatar"]);
    const [, face, , extra] = vi.mocked(makeAvatar).mock.calls[0];
    expect(face).toBeInstanceOf(Blob);
    expect(extra).toMatchObject({ toast: J.SAME_EDIT_TOAST, said: EDIT.lines.join(" "), caption: EDIT.caption, draftId: "d-1", ai: { kind: "avatar", person: "mine", voice: "premade" }, plan: { id: plan.id } });
    expect(extra!.words).toHaveLength(EDIT.lines.join(" ").split(" ").length);
    // the hook text starts on its marked word; the music line rides in the note when the reel had a bed
    expect(extra!.settings).toMatchObject({ hook: "Renewals hiding?", style: "bold" });
    expect(J.sameEditJob()?.state).toBe("video");
    f.ai.emit({ kind: "avatar", state: "working", step: "Putting your video together..." });
    expect(J.sameEditJob()?.state).toBe("joining");
    f.ai.emit({ kind: "avatar", state: "done", step: "" });
    await run;
    expect(J.sameEditJob()?.state).toBe("done");
  });

  it("a voice that runs long stops at the price check, and going on pays for no second voiceover", async () => {
    const plan = await readPlan();
    makeFakes();
    vi.mocked(sliceVoiceover).mockResolvedValue({ pcm: new Float32Array(1), seconds: 25, slices: [{ start: 0, end: 9 }, { start: 9, end: 18 }, { start: 18, end: 25 }] });
    await J.startMake(UID, { ...ASK, planId: plan.id, who: "mine" });
    expect(J.sameEditJob()).toMatchObject({ state: "priced", real: { seconds: 25 } });
    expect(makeAvatar).not.toHaveBeenCalled();
    const run = J.goOnAtPrice(UID);
    await vi.waitFor(() => expect(makeAvatar).toHaveBeenCalledTimes(1));
    // a second press while it runs starts nothing
    await J.goOnAtPrice(UID);
    expect(makeAvatar).toHaveBeenCalledTimes(1);
    expect(fns()).toEqual(["text-voice"]);
    f.ai.emit({ kind: "avatar", state: "failed", step: "", error: "Higgsfield failed it." });
    await run;
    expect(J.sameEditJob()).toMatchObject({ state: "failed", error: "Higgsfield failed it.", waiting: false });
  });

  it("a face turned off or a presenter gone stops before anything is written or paid", async () => {
    const plan = await readPlan();
    makeFakes(false);
    await J.startMake(UID, { ...ASK, planId: plan.id, who: "mine" });
    expect(J.sameEditJob()).toMatchObject({ state: "failed", error: J.NO_FACE });
    await J.startMake(UID, { ...ASK, planId: plan.id, who: "pr-gone" });
    expect(J.sameEditJob()).toMatchObject({ state: "failed", error: J.PRESENTER_GONE });
    expect(requestMake).not.toHaveBeenCalled();
    expect(fns()).toEqual([]);
  });

  it("no face: the stock clips cut at their words under the voice, with the voiceover mark and no B-roll on top", async () => {
    const plan = await readPlan();
    makeFakes();
    await J.startMake(UID, { ...ASK, planId: plan.id, who: "none" });
    expect(makeAvatar).not.toHaveBeenCalled();
    expect(f.calls).toEqual(["startSlides"]);
    const [, scenes, voice, , opts] = vi.mocked(startSlides).mock.calls[0];
    expect(scenes.length).toBe(1);
    expect(scenes.reduce((t, s) => t + s.seconds, 0)).toBeCloseTo(14, 3);
    expect(voice.size).toBe(3000);
    expect(opts?.extra).toMatchObject({ toast: J.SAME_EDIT_TOAST, ai: { kind: "voiceover", voice: "premade" } });
    expect(opts?.extra?.settings?.broll).toBeUndefined();
    expect(J.sameEditJob()?.state).toBe("done");
  });

  it("a second Make my version while one is being written writes once", async () => {
    const plan = await readPlan();
    makeFakes();
    const first = J.startMake(UID, { ...ASK, planId: plan.id, who: "film" });
    const second = J.startMake(UID, { ...ASK, planId: plan.id, who: "film", length: 30 });
    await Promise.all([first, second]);
    expect(requestMake).toHaveBeenCalledTimes(1);
    expect(J.sameEditJob()).toMatchObject({ state: "filmed", ask: { length: 15 } });
    expect(loadPlans(UID)[0].versions).toHaveLength(1);
  });

  it("no face: a video that can't be put together ends failed in the join's words, and the written version stays", async () => {
    const plan = await readPlan();
    makeFakes();
    const { currentJoin } = await import("./videoMedia");
    vi.mocked(currentJoin).mockImplementation(() => (vi.mocked(startSlides).mock.calls.length ? { progress: 0, state: "failed", error: "This browser can't record video." } : null));
    try {
      await J.startMake(UID, { ...ASK, planId: plan.id, who: "none" });
    } finally {
      vi.mocked(currentJoin).mockReset().mockReturnValue(null);
    }
    expect(J.sameEditJob()).toMatchObject({ state: "failed", error: "This browser can't record video." });
    expect(J.sameEditBusy()).toBe(false);
    expect(loadPlans(UID)[0].versions).toHaveLength(1);
  });

  it("a reload picks up only this page's paid video, at no cost", () => {
    f.pending = { extra: { toast: "Your talking head video is ready. Export it when it looks right." } };
    expect(J.resumeSameEdit()).toBe(false);
    f.pending = { extra: { toast: J.SAME_EDIT_TOAST } };
    expect(J.resumeSameEdit()).toBe(true);
    expect(f.calls).toEqual(["resumeAvatar"]);
    expect(J.sameEditJob()?.state).toBe("video");
    expect(fns()).toEqual([]);
  });
});
