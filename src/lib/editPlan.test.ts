import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  MAX_EVENTS,
  MAX_PLANS,
  MAX_VERSIONS,
  PLANS_CHANGED,
  PLANS_FULL,
  addVersion,
  compilePlan,
  loadPlans,
  partsToRemake,
  planFromRead,
  savePlan,
  type EditPlan,
  type ReadInput,
  type Version,
} from "./editPlan";
import type { Word } from "./videoEdit";
import type { EditPicks, EditRead } from "../../supabase/functions/reel-visuals/edit";

const UID = "6d80f027-3395-480c-86a1-8827d3d6cce3";
const NOW = new Date(Date.UTC(2026, 9, 25, 9, 0));

/** Words at 0.4 s each from `start`, in order. */
const timed = (text: string, start = 0): Word[] => text.split(" ").map((w, i) => ({ w, s: start + i * 0.4, e: start + i * 0.4 + 0.35 }));

// A 30 s reel's transcript, in four sentences; none of these words may reach the plan.
const TRANSCRIPT = [
  "Most advisers check Medisave yearly.",
  "Here's the costly mistake hiding inside it.",
  "Your hospital bill doubles quietly every renewal.",
  "Comment REVIEW below for my checklist.",
];
const WORDS: Word[] = [...timed(TRANSCRIPT[0], 0), ...timed(TRANSCRIPT[1], 3), ...timed(TRANSCRIPT[2], 10), ...timed(TRANSCRIPT[3], 24)];
const SHOWS = ["A woman talks to camera in an office", "A hospital corridor", "A woman talks to camera in an office", "A phone screen with a bill"];
const OVERLAYS = ["Medisave yearly?", "$1,200 gone", "Medisave yearly?", "Comment REVIEW"];
const READ: EditRead = {
  frames: [
    { t: 0.4, shows: SHOWS[0], framing: "close", texts: [{ text: OVERLAYS[0], place: "top" }, { text: "Most advisers check", place: "bottom" }] },
    { t: 6.4, shows: SHOWS[1], framing: "wide", texts: [{ text: OVERLAYS[1], place: "middle" }] },
    { t: 12.4, shows: SHOWS[2], framing: "close", texts: [] },
    { t: 24.4, shows: SHOWS[3], framing: "top-card", texts: [{ text: OVERLAYS[3], place: "bottom" }] },
  ],
  captions: "Bold white capitals, three words at a time, bottom third.",
  layout: "The speaker fills the frame.",
};
const PICKS: EditPicks = {
  shots: [{ pick: "speaker", p: 0.9 }, { pick: "cutaway", p: 0.8 }, null, { pick: "screen", p: 0.4 }],
  texts: [[{ pick: "hook", p: 0.9 }, { pick: "caption_repeat", p: 0.8 }], [{ pick: "number", p: 0.7 }], [], [{ pick: "ask", p: 0.9 }]],
  // sentence 3 is picked back at beat 1, which can't be: it stays on beat 2
  beats: [{ pick: 0, p: 0.9 }, { pick: 2, p: 0.8 }, { pick: 1, p: 0.95 }, { pick: 3, p: 0.9 }],
  roles: [null, null, { pick: "proof", p: 0.8 }, { pick: "point", p: 0.9 }],
};
const INPUT: ReadInput = {
  source: "clone:instagram:DQx1abc",
  seconds: 30,
  aspect: "9:16",
  cuts: [6, 12, 24],
  cutKinds: ["flash", "hard", "dip"],
  zooms: [2, 15],
  faces: [1, 0, 1, 1],
  words: WORDS,
  sound: { bed: true, drops: 1, sfx: false },
  teardown: { beats: ["Opens on a habit", "Names the cost", "Shows the bill", "Asks for a comment"], cta: "Comment REVIEW" },
  reply: { read: READ, look: { style: "bold", uppercase: true, captionBox: null, position: "bottom", words: "3", captions: true, framed: null, topHalf: null }, picks: PICKS },
};

describe("planFromRead", () => {
  const plan = planFromRead(INPUT, NOW);

  it("keeps the beats in order: never back to an earlier one, the hook first and the ask last", () => {
    expect(plan.beats.map((b) => b.role)).toEqual(["hook", "proof", "ask"]);
    expect(plan.beats.map((b) => b.share)).toEqual([0.1, 0.7, 0.2]);
    // beat 2 runs 3 to 24 s: the opening shot carries on into it, then the cutaway at 6 s and the speaker at 12 s
    expect(plan.beats[1].shots).toEqual([{ kind: "speaker", at: 0, framing: "close" }, { kind: "cutaway", at: 0.143, framing: "wide" }, { kind: "speaker", at: 0.429, framing: "close" }]);
    expect(plan.beats[2].shots).toEqual([{ kind: "speaker", at: 0, framing: "top-card" }]);
    expect(plan).toMatchObject({ v: 1, id: `ep-${NOW.getTime().toString(36)}`, source: "clone:instagram:DQx1abc", at: NOW.toISOString() });
  });

  it("falls back to the measured face below 0.5 or with no answer, and to the words' share with no beat answer", () => {
    expect(plan.beats[2].shots[0].kind).toBe("speaker"); // a screen at 0.4 is not sure: a face was measured
    const none = planFromRead({ ...INPUT, reply: { ...INPUT.reply, picks: { shots: [null, null, null, null], texts: [[], [], [], []], beats: [null, null, null, null], roles: [] } } }, NOW);
    expect(none.beats.map((b) => b.role)).toEqual(["hook", "point", "point", "ask"]);
    expect(none.beats.flatMap((b) => b.shots.map((s) => s.kind))).toEqual(["speaker", "speaker", "cutaway", "cutaway", "speaker", "speaker"]);
    expect(none.events.filter((e) => e.kind === "text")).toEqual([]);
  });

  it("places each overlay with a job, cutaway, zoom and flash or dip cut by share of its beat, the speech's repeats left out", () => {
    expect(plan.events).toEqual([
      { kind: "text", place: { b: 0, at: 0, span: 1 }, role: "hook", words: 2, y: 0.18 },
      { kind: "zoom", place: { b: 0, at: 0.667, span: 0.333 } },
      { kind: "text", place: { b: 1, at: 0.143, span: 0.286 }, role: "number", words: 2, y: 0.5 },
      { kind: "cutaway", place: { b: 1, at: 0.143, span: 0.286 }, picture: "stock" },
      { kind: "cut", place: { b: 1, at: 0.143, span: 0 }, as: "flash" },
      { kind: "zoom", place: { b: 1, at: 0.571, span: 0.1 } },
      { kind: "text", place: { b: 2, at: 0, span: 1 }, role: "ask", words: 2, y: 0.78 },
      { kind: "cut", place: { b: 2, at: 0, span: 0 }, as: "dip" },
    ]);
  });

  it("keeps a text still up across a cut as one event over both shots", () => {
    const merged = planFromRead({ ...INPUT, cuts: [3, 6, 12, 24], cutKinds: [], reply: { ...INPUT.reply, read: { ...READ, frames: [READ.frames[0], { ...READ.frames[0], t: 3.4 }, ...READ.frames.slice(1)] }, picks: { ...PICKS, shots: [PICKS.shots[0], PICKS.shots[0], ...PICKS.shots.slice(1)], texts: [PICKS.texts[0], [{ pick: "hook", p: 0.9 }, null], ...PICKS.texts.slice(1)] } }, faces: [1, 1, 0, 1, 0] }, NOW);
    expect(merged.events.filter((e) => e.kind === "text" && e.role === "hook")).toEqual([{ kind: "text", place: { b: 0, at: 0, span: 1 }, role: "hook", words: 2, y: 0.18 }]);
  });

  it("reads the rest of the edit: pace, sound, people, the look and where cutaways go", () => {
    expect(plan.read).toEqual({
      seconds: 30, aspect: "9:16", wpm: 50, look: INPUT.reply.look, cutsPerMin: 6, music: { bed: true, drops: 1 }, sfx: false, people: 1, cutaways: "full", skipped: [],
    });
    expect(planFromRead({ ...INPUT, faces: [2, 0, 1, 1] }, NOW).read.people).toBe(2);
    const topped = { ...READ, frames: READ.frames.map((f, i) => (i === 1 ? { ...f, framing: "top-card" as const } : f)) };
    expect(planFromRead({ ...INPUT, reply: { ...INPUT.reply, read: topped } }, NOW).read.cutaways).toBe("top");
  });

  it("caps the events at 40, texts and cutaways first", () => {
    const busy = planFromRead({ ...INPUT, zooms: Array.from({ length: 60 }, (_, i) => i * 0.5) }, NOW);
    expect(busy.events).toHaveLength(MAX_EVENTS);
    expect(busy.events.filter((e) => e.kind !== "zoom")).toHaveLength(4);
    expect(busy.events.every((e, i, all) => i === 0 || all[i - 1].place.b < e.place.b || (all[i - 1].place.b === e.place.b && all[i - 1].place.at <= e.place.at))).toBe(true);
  });

  it("holds no word of the reel: no transcript, no overlay, no shot sentence", () => {
    const json = JSON.stringify(plan).toLowerCase();
    const theirs = [...TRANSCRIPT, ...OVERLAYS, ...SHOWS, "Most advisers check"].join(" ").toLowerCase().match(/[\p{L}$][\p{L}\d,$']{3,}/gu)!;
    expect(theirs.length).toBeGreaterThan(20);
    for (const w of new Set(theirs)) expect(json, w).not.toContain(w.replace(/[.,?]$/, ""));
  });
});

const PLAN: EditPlan = {
  v: 1,
  id: "ep-mh3k2x1",
  source: "clone:instagram:DQx1abc",
  at: NOW.toISOString(),
  read: { seconds: 30, aspect: "9:16", wpm: 160, look: null, cutsPerMin: 22, music: { bed: true, drops: 1 }, sfx: true, people: 1, cutaways: "top", skipped: [] },
  beats: [
    { role: "hook", share: 0.2, shots: [{ kind: "speaker", at: 0, framing: "close" }] },
    { role: "point", share: 0.5, shots: [{ kind: "speaker", at: 0, framing: "close" }, { kind: "cutaway", at: 0.5, framing: "wide" }] },
    { role: "ask", share: 0.3, shots: [{ kind: "speaker", at: 0, framing: "close" }] },
  ],
  events: [
    { kind: "text", place: { b: 0, at: 0, span: 1 }, role: "hook", words: 4, y: 0.18 },
    { kind: "zoom", place: { b: 0, at: 0.5, span: 0.4 } },
    { kind: "cutaway", place: { b: 1, at: 0.5, span: 0.4 }, picture: "stock" },
    { kind: "text", place: { b: 1, at: 0.2, span: 0.3 }, role: "label", words: 2, y: 0.5 },
    { kind: "text", place: { b: 1, at: 0.6, span: 0.2 }, role: "number", words: 1, y: 0.5 },
    { kind: "popup", place: { b: 1, at: 0.8, span: 0.1 } },
    { kind: "text", place: { b: 2, at: 0, span: 0.5 }, role: "ask", words: 3, y: 0.78 },
    { kind: "cut", place: { b: 1, at: 0.5, span: 0 }, as: "flash" },
  ],
};
// line 0: words 0-4 (0 to 1.95 s), line 1: words 5-16 (2 to 6.75 s), line 2: words 17-20 (6.8 to 8.35 s), 0.4 s a word
const LINES = ["Most of you renew blind", "I checked forty plans and the cover was half what $500 buys", "Comment PLAN for mine"];
const VOICE = timed(LINES.join(" "));
const VERSION: Version = {
  id: "ev-mh3k2x9",
  host: { kind: "presenter", id: "pr-raj" },
  voice: "alice",
  lang: "en",
  offer: null,
  lines: LINES,
  marks: [{ k: 0, line: 0, word: 0 }, { k: 1, line: 0, word: 3 }, { k: 2, line: 1, word: 2 }, { k: 3, line: 1, word: 0 }, { k: 4, line: 1, word: 10 }, { k: 5, line: 1, word: 6 }, { k: 6, line: 2, word: 0 }],
  texts: [{ k: 0, text: "Renewing blind?" }, { k: 3, text: "Forty plans" }, { k: 4, text: "$500" }, { k: 5, text: "Half the cover" }, { k: 6, text: "Comment PLAN" }],
  searches: [{ k: 2, search: "insurance paperwork" }],
  caption: "",
  at: NOW.toISOString(),
};
const CLIP = { key: "stock-1", length: 6, thumb: "t.jpg", by: "Pexels user", byUrl: "https://pexels.com/u", url: "https://pexels.com/v" };

describe("compilePlan", () => {
  const out = compilePlan(PLAN, VERSION, VOICE, 8, { clips: { 2: CLIP }, facts: "Our review covers plans from $500 a year." });

  it("puts each event in its editor field, starting at its marked word", () => {
    expect([out.hook, out.hookSeconds]).toEqual(["Renewing blind?", 2]);
    // the cutaway's marker is before "forty" (word 2 of line 1, 2.8 s); it runs 0.4 of the 4.8 s beat
    expect(out.broll).toEqual([{ ...CLIP, id: "b-ep-mh3k2x1-2", from: 2.8, to: 4.72 }]);
    expect(out.brollLayout).toBe("top");
    expect(out.overlays?.map((o) => [o.text, o.from, o.to, o.y])).toEqual([["Forty plans", 2, 3.44, 0.5], ["Comment PLAN", 6.8, 7.8, 0.78]]);
    // the zoom runs to its beat's end; the pop-up at least a second
    expect(out.motion?.lines).toEqual([{ s: 1.2, e: 2, p: 1 }, { s: 4.4, e: 5.4, p: 1, pop: { text: "Half the cover", key: "", emoji: "" } }]);
    expect([out.keyZooms, out.popups, out.numberCards, out.transition]).toEqual([true, true, true, "flash"]);
    expect([out.sfx, out.musicDrop, out.maxPause]).toEqual([true, true, 0.3]);
  });

  it("makes a number a label when its figure isn't in the brand's facts", () => {
    const off = compilePlan(PLAN, VERSION, VOICE, 8, { facts: "Reviews are free." });
    expect(off.numberCards).toBeUndefined();
    expect(off.overlays?.map((o) => o.text)).toContain("$500");
    // a cutaway with no clip found is left out
    expect(off.broll).toBeUndefined();
  });

  it("falls back to the beat's start plus its share when the writer dropped a marker", () => {
    const dropped = compilePlan(PLAN, { ...VERSION, marks: VERSION.marks.filter((m) => m.k !== 3) }, VOICE, 8);
    // beat 1 runs 2 to 6.8 s: 2 + 0.2 x 4.8
    expect(dropped.overlays?.find((o) => o.text === "Forty plans")).toMatchObject({ from: 2.96, to: 4.4 });
  });

  it("lays the read's look on the captions as Copy a reel's style does", () => {
    const looked = compilePlan({ ...PLAN, read: { ...PLAN.read, look: INPUT.reply.look } }, VERSION, VOICE, 8);
    expect(looked).toMatchObject({ style: "bold", uppercase: true, position: "bottom", wordsPerCaption: 3, captions: true });
    expect(out.style).toBeUndefined();
  });
});

describe("partsToRemake", () => {
  // the base video's two Speak parts, 5 words and 7 words, over three lines of 4, 6 and 2
  const base: Version = { ...VERSION, lines: ["a b c d", "e f g h i j", "k l"] };
  const slices = [{ text: "a b c d e" }, { text: "f g h i j k l" }];

  it("remakes the parts under the hook, under the changed lines, or every part", () => {
    expect(partsToRemake(base, { ...base, change: "hook", lines: ["w x y z", "e f g h i j", "k l"] }, slices)).toEqual([0]);
    expect(partsToRemake(base, { ...base, change: "offer", lines: ["a b c d", "e f g h i j", "m n"] }, slices)).toEqual([1]);
    expect(partsToRemake(base, { ...base, change: "offer", lines: ["a b c d", "e q g h i j", "m n"] }, slices)).toEqual([0, 1]);
    expect(partsToRemake(base, { ...base, change: "host" }, slices)).toEqual([0, 1]);
    expect(partsToRemake(base, { ...base, change: "lang", lines: ["一 二", "三", "四"] }, slices)).toEqual([0, 1]);
  });

  it("remakes every part when the parts' words don't add up to the lines'", () => {
    expect(partsToRemake(base, { ...base, change: "hook", lines: ["w x y z", "e f g h i j", "k l"] }, [{ text: "a b c d e" }])).toEqual([0]);
    expect(partsToRemake(base, { ...base, change: "hook", lines: ["w", "e f g h i j", "k l"] }, [{ text: "a b c" }, { text: "d" }])).toEqual([0, 1]);
  });
});

describe("the plan store", () => {
  const store = new Map<string, string>();
  const fired: string[] = [];
  let full = 0;
  beforeEach(() => {
    store.clear();
    fired.length = 0;
    full = 0;
    const localStorage = {
      get length() {
        return store.size;
      },
      key: (i: number) => [...store.keys()][i] ?? null,
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        if (full && v.length > full) throw new DOMException("full", "QuotaExceededError");
        store.set(k, v);
      },
      removeItem: (k: string) => void store.delete(k),
    };
    vi.stubGlobal("localStorage", localStorage);
    vi.stubGlobal("window", { localStorage, dispatchEvent: (e: Event) => fired.push(e.type) });
  });
  const planAt = (min: number): EditPlan => ({ ...PLAN, id: `ep-p${min}`, at: new Date(NOW.getTime() + min * 60_000).toISOString() });

  it("keeps the newest 20 plans with their versions, newest first, and says so", () => {
    for (let m = 0; m < 22; m++) expect(savePlan(UID, planAt(m))).toBeNull();
    const list = loadPlans(UID);
    expect(list).toHaveLength(MAX_PLANS);
    expect([list[0].plan.id, list.at(-1)!.plan.id]).toEqual(["ep-p21", "ep-p2"]);
    expect(fired).toEqual(Array(22).fill(PLANS_CHANGED));
    expect(store.has(`content-studio-edit-plans-${UID}`)).toBe(true);
  });

  it("adds versions to their plan, 24 at most, and keeps them when the plan is saved again", () => {
    savePlan(UID, PLAN);
    for (let i = 0; i < 26; i++) addVersion(UID, PLAN.id, { ...VERSION, id: `ev-v${i}`, at: new Date(NOW.getTime() + i * 1000).toISOString() });
    addVersion(UID, PLAN.id, { ...VERSION, id: "ev-v25", caption: "edited" });
    savePlan(UID, PLAN);
    const [entry] = loadPlans(UID);
    expect(entry.versions).toHaveLength(MAX_VERSIONS);
    expect(entry.versions.find((v) => v.id === "ev-v25")?.caption).toBe("edited");
    expect(addVersion(UID, "ep-gone", VERSION)).toBe("That edit isn't on this device any more. Read the reel again.");
  });

  it("reads bad JSON and bad entries as none", () => {
    store.set(`content-studio-edit-plans-${UID}`, "{nope");
    expect(loadPlans(UID)).toEqual([]);
    store.set(`content-studio-edit-plans-${UID}`, JSON.stringify([{ plan: { ...PLAN, v: 2 } }, { plan: PLAN, versions: [VERSION, { id: "x" }] }, null]));
    expect(loadPlans(UID)).toEqual([{ plan: PLAN, versions: [VERSION] }]);
  });

  it("drops the oldest plan once when the device is full, then refuses with a line", () => {
    savePlan(UID, planAt(0));
    savePlan(UID, planAt(1));
    full = store.get(`content-studio-edit-plans-${UID}`)!.length + 10;
    expect(savePlan(UID, planAt(2))).toBeNull();
    expect(loadPlans(UID).map((e) => e.plan.id)).toEqual(["ep-p2", "ep-p1"]);
    full = 10;
    expect(savePlan(UID, planAt(3))).toBe(PLANS_FULL);
    expect(loadPlans(UID).map((e) => e.plan.id)).toEqual(["ep-p2", "ep-p1"]);
  });
});
