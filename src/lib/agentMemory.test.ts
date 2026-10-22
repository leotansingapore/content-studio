import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  MEMORY_EMPTY,
  NOTHING_TO_UNDO,
  SEE_LEARNED,
  WHICH_ONE,
  correctionNudge,
  dismissNudge,
  followingLine,
  forgetPick,
  learningLines,
  loadCorrections,
  memoryAnswer,
  noteCorrection,
  videoPreferences,
  type MsgLike,
} from "@/lib/agentMemory";
import { addFact, addLearning, loadLearnings, setFactOff, setLearningOff, type LearningScope } from "@/lib/voiceMemory";
import { recordPreference } from "@/lib/coachProfile";

const UID = "6d80f027-3395-480c-86a1-8827d3d6cce3";
const store = new Map<string, string>();
let full = false;
const at = (day: number, min = 0) => new Date(Date.UTC(2026, 9, day, 9, min));

beforeEach(() => {
  store.clear();
  full = false;
  const localStorage = {
    get length() {
      return store.size;
    },
    key: (i: number) => [...store.keys()][i] ?? null,
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (full) throw new DOMException("full", "QuotaExceededError");
      store.set(k, v);
    },
    removeItem: (k: string) => void store.delete(k),
  };
  vi.stubGlobal("localStorage", localStorage);
  vi.stubGlobal("window", { localStorage, dispatchEvent: () => true });
});

const learn = (text: string, scope: LearningScope = "posts", min = 0) => {
  const r = addLearning(UID, { text, scope, source: "typed" }, null, at(1, min));
  if (!r.ok) throw new Error("not saved");
  return r.item;
};
const on = () => loadLearnings(UID).filter((l) => !l.offAt).map((l) => l.text);
const receipt = (id: string, title: string, o: { undo?: boolean; undone?: string } = {}): MsgLike => ({
  id,
  receipt: { title, ...(o.undo === false ? {} : { undo: { kind: "delete-drafts", ids: ["d1"] } }), ...(o.undone ? { undone: o.undone } : {}) },
});

describe("forgetPick", () => {
  it("l2 switches the second newest learning off and says which", () => {
    learn("first", "posts", 1);
    const second = learn("second", "videos", 2);
    learn("third", "all", 3);
    expect(learningLines(loadLearnings(UID))).toEqual(["third (all)", "second (videos)", "first (posts)"]);
    const r = forgetPick(UID, "l2", [], at(2));
    expect(r).toEqual({ kind: "removed", learning: expect.objectContaining({ id: second.id, text: "second", offAt: at(2).toISOString() }) });
    expect(on()).toEqual(["first", "third"]);
  });
  it("a chip's learning id removes that one with no index", () => {
    const a = learn("keep it short", "posts", 1);
    learn("older man", "videos", 2);
    expect(forgetPick(UID, a.id, [])).toMatchObject({ kind: "removed", learning: { id: a.id } });
    expect(on()).toEqual(["older man"]);
  });
  it("last returns the newest receipt that can still be undone", () => {
    learn("anything");
    const msgs = [receipt("m1", "Moved"), receipt("m2", "Competitor added"), receipt("m3", "Undone one", { undone: "2026-10-01T00:00:00Z" }), receipt("m4", "Video made", { undo: false }), { id: "m5" }];
    expect(forgetPick(UID, "last", msgs)).toEqual({ kind: "undo", msg: "m2", title: "Competitor added" });
    expect(on()).toEqual(["anything"]);
  });
  it("none, an unsure Jev or an index past what was sent gives the 3 newest learnings as chips", () => {
    for (let i = 0; i < 12; i++) learn(`note ${i}`, "posts", i);
    const ask = { kind: "ask", line: WHICH_ONE, chips: ["note 11", "note 10", "note 9"].map((label) => ({ label, which: expect.stringMatching(/^l-/) })) };
    expect(forgetPick(UID, "none", [receipt("m1", "Moved")])).toEqual(ask);
    expect(forgetPick(UID, null, [])).toEqual(ask);
    expect(forgetPick(UID, "l11", [])).toEqual(ask);
    expect(forgetPick(UID, "last", [])).toEqual(ask);
    expect(on()).toHaveLength(12);
  });
  it("offers the last change as the one chip when no learning is on", () => {
    expect(forgetPick(UID, null, [receipt("m1", "Moved")])).toEqual({ kind: "ask", line: WHICH_ONE, chips: [{ label: "Moved", which: "last" }] });
  });
  it("nothing saved and nothing to undo gives the nothing line", () => {
    const gone = learn("removed");
    setLearningOff(UID, gone.id, true);
    expect(forgetPick(UID, "l1", [receipt("m1", "Moved", { undo: false })])).toEqual({ kind: "nothing", line: NOTHING_TO_UNDO });
    expect(NOTHING_TO_UNDO).toBe("There's nothing to undo here.");
  });
  it("says it couldn't save when the device refuses, and changes nothing", () => {
    learn("keep it short");
    full = true;
    expect(forgetPick(UID, "l1", [])).toEqual({ kind: "failed", line: "Couldn't save that. Try again." });
    expect(on()).toEqual(["keep it short"]);
  });
});

describe("memoryAnswer", () => {
  it("lists at most 10 learnings on now, newest first, then Coach's lists labelled, then the facts count", () => {
    for (let i = 0; i < 12; i++) learn(`note ${i}`, i === 11 ? "videos" : i === 10 ? "all" : "posts", i);
    setLearningOff(UID, loadLearnings(UID)[9].id, true);
    recordPreference(UID, "like", "client stories");
    recordPreference(UID, "dislike", "jargon");
    addFact(UID, "12 years as an adviser");
    addFact(UID, "Helped 300 families");
    const off = addFact(UID, "removed fact");
    setFactOff(UID, off.ok ? off.item.id : "", true);
    expect(memoryAnswer(UID)).toBe(
      [
        "Here's what I follow when I make things:",
        "- note 11 (videos)",
        "- note 10 (posts, videos and pictures)",
        "- note 8 (posts)",
        "- note 7 (posts)",
        "- note 6 (posts)",
        "- note 5 (posts)",
        "- note 4 (posts)",
        "- note 3 (posts)",
        "- note 2 (posts)",
        "- note 1 (posts)",
        "- Lean into: client stories (from Coach)",
        "- Steer clear of: jargon (from Coach)",
        "And 2 facts you gave me.",
      ].join("\n"),
    );
  });
  it("gives the empty text with nothing on, and one fact in the singular", () => {
    const gone = learn("removed");
    setLearningOff(UID, gone.id, true);
    expect(memoryAnswer(UID)).toBe(MEMORY_EMPTY);
    expect(MEMORY_EMPTY).toBe('Nothing yet. Tell me something like "always end with a question" and I\'ll keep to it.');
    addFact(UID, "12 years as an adviser");
    expect(memoryAnswer(UID)).toBe(`${MEMORY_EMPTY}\nAnd 1 fact you gave me.`);
    expect(SEE_LEARNED).toEqual({ label: "See what the AI has learned", path: "/voice#learned" });
  });
});

describe("noteCorrection and correctionNudge", () => {
  const toCarousel = (card: string, day: number) => noteCorrection(UID, { kind: "format", from: "speaking", to: "carousel", card }, at(day));
  const nudge = (day: number) => correctionNudge(UID, { kind: "format", from: "speaking", to: "carousel" }, at(day));
  const CAROUSELS = { id: "video-carousel", line: "You often turn videos into carousels. Make carousels first?", learning: { text: "Make carousels unless I ask for something else.", scope: "all" } };

  it("nudges on the third card with the same change within 14 days, and not on the second", () => {
    toCarousel("k1", 1);
    toCarousel("k2", 5);
    expect(nudge(5)).toBeNull();
    toCarousel("k3", 14);
    expect(nudge(14)).toEqual(CAROUSELS);
    toCarousel("k4", 14);
    expect(nudge(14)).toBeNull();
  });
  it("does not nudge for the same card three times", () => {
    toCarousel("k1", 1);
    toCarousel("k1", 2);
    toCarousel("k1", 3);
    expect(nudge(3)).toBeNull();
  });
  it("does not nudge over a 15-day spread", () => {
    toCarousel("k1", 1);
    toCarousel("k2", 8);
    toCarousel("k3", 16);
    expect(nudge(16)).toBeNull();
  });
  it("No thanks hides it for 30 days, then it can come back", () => {
    toCarousel("k1", 1);
    toCarousel("k2", 2);
    toCarousel("k3", 3);
    expect(nudge(3)).toEqual(CAROUSELS);
    dismissNudge(UID, "video-carousel", at(3));
    expect(nudge(3)).toBeNull();
    // a fresh run of three, 29 days after the dismissal, then 31
    const later = (card: string, day: number) => noteCorrection(UID, { kind: "format", from: "explainer", to: "carousel", card }, at(day));
    later("k5", 30);
    later("k6", 31);
    later("k7", 32);
    expect(nudge(32)).toBeNull();
    store.delete(`cs-agent-corrections-${UID}`);
    later("k5", 33);
    later("k6", 34);
    later("k7", 34);
    expect(nudge(34)).toEqual(CAROUSELS);
  });
  it("covers the face changes and skips a learning already on", () => {
    for (const [card, day] of [["k1", 1], ["k2", 2], ["k3", 3]] as const) noteCorrection(UID, { kind: "face", from: "pr-abc", to: "mine", card }, at(day));
    const face = correctionNudge(UID, { kind: "face", from: "new", to: "mine" }, at(3));
    expect(face).toEqual({ id: "face-mine", line: "You often switch to your own face. Use it every time?", learning: { text: "Use my own face in videos.", scope: "videos" } });
    addLearning(UID, { ...face!.learning, source: "correction" });
    expect(correctionNudge(UID, { kind: "face", from: "new", to: "mine" }, at(3))).toBeNull();
    expect(correctionNudge(UID, { kind: "format", from: "post", to: "carousel" }, at(3))).toBeNull();
  });
  it("keeps the last 30 on this device, ignores a change to the same thing, and reads junk as nothing", () => {
    for (let i = 0; i < 35; i++) noteCorrection(UID, { kind: "format", from: "post", to: "carousel", card: `k${i}` }, at(1, i));
    noteCorrection(UID, { kind: "format", from: "speaking", to: "explainer", card: "kx" }, at(2));
    const rows = loadCorrections(UID);
    expect(rows).toHaveLength(30);
    expect(rows[0].card).toBe("k5");
    expect(Object.keys(Object.fromEntries(store)).filter((k) => k.startsWith("cs-agent-corrections-"))).toEqual([`cs-agent-corrections-${UID}`]);
    store.set(`cs-agent-corrections-${UID}`, "{oops");
    expect(loadCorrections(UID)).toEqual([]);
    store.set(`cs-agent-corrections-${UID}`, JSON.stringify([{ kind: "colour", from: "a", to: "b", card: "k", at: "x" }, null]));
    expect(loadCorrections(UID)).toEqual([]);
  });
});

describe("followingLine and videoPreferences", () => {
  it("names up to 2 learnings on now in the make's scope or all, and is empty when none apply", () => {
    learn("never use emoji", "posts", 1);
    learn("use an older man as my presenter", "videos", 2);
    learn("keep it short", "all", 3);
    learn("speak slowly", "videos", 4);
    const gone = learn("old video note", "videos", 5);
    setLearningOff(UID, gone.id, true);
    const rows = loadLearnings(UID);
    expect(followingLine(rows, "videos")).toBe("Following: speak slowly; keep it short");
    expect(followingLine(rows, "posts")).toBe("Following: keep it short; never use emoji");
    expect(followingLine(rows.filter((l) => l.scope !== "all"), "pictures")).toBe("");
    expect(videoPreferences(rows)).toBe("speak slowly; keep it short; use an older man as my presenter");
    expect(videoPreferences(rows.filter((l) => l.scope === "posts"))).toBe("");
  });
});
