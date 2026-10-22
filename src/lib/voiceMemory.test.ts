import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  FACTS_CHANGED,
  FACTS_LEAD,
  KEEP_LEAD,
  KEEP_ROWS,
  LEARNINGS_CHANGED,
  MAX_FACTS,
  MAX_LEARNINGS,
  MEMORY_HEADER,
  SAVE_FAILED,
  activeLearnings,
  addFact,
  addLearning,
  loadFacts,
  loadLearnings,
  memoryLine,
  notesFor,
  setFactOff,
  setLearningOff,
  undoLearning,
} from "@/lib/voiceMemory";
import { recordPreference } from "@/lib/coachProfile";

const UID = "6d80f027-3395-480c-86a1-8827d3d6cce3";
const store = new Map<string, string>();
const fired: string[] = [];
let full = false;
const at = (min: number) => new Date(Date.UTC(2026, 9, 21, 9, min));

beforeEach(() => {
  store.clear();
  fired.length = 0;
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
  vi.stubGlobal("window", { localStorage, dispatchEvent: (e: Event) => fired.push(e.type) });
});

const learn = (text: string, scope: "posts" | "videos" | "pictures" | "all" = "posts", min = 0) => {
  const r = addLearning(UID, { text, scope, source: "typed" }, null, at(min));
  if (!r.ok) throw new Error("not saved");
  return r.item;
};

describe("facts", () => {
  it("adds, cuts to 160, keeps one of the same words, and says when it changed", () => {
    const r = addFact(UID, `  12 years   as an adviser ${"x".repeat(200)}`, at(0));
    expect(r.ok && r.item.text.length).toBe(160);
    expect(r.ok && r.item.text.startsWith("12 years as an adviser")).toBe(true);
    expect(fired).toEqual([FACTS_CHANGED]);
    const again = addFact(UID, "Helped 300 families", at(1));
    expect(addFact(UID, "helped 300 FAMILIES", at(2))).toEqual({ ok: true, item: again.ok && again.item, existed: true });
    expect(loadFacts(UID)).toHaveLength(2);
    expect(addFact(UID, "   ").ok).toBe(false);
  });
  it("holds 20 on, Remove keeps the row, and Undo brings it back", () => {
    for (let i = 0; i < MAX_FACTS; i++) addFact(UID, `fact ${i}`, at(i));
    expect(addFact(UID, "one more")).toEqual({ ok: false, error: "20 is the most. Remove one to add another." });
    const first = loadFacts(UID)[0];
    expect(setFactOff(UID, first.id, true, at(30)).ok).toBe(true);
    expect(loadFacts(UID)).toHaveLength(MAX_FACTS);
    expect(loadFacts(UID)[0].offAt).toBe(at(30).toISOString());
    expect(addFact(UID, "one more", at(31)).ok).toBe(true);
    // 20 on again: the removed one can't come back until another goes
    expect(setFactOff(UID, first.id, false)).toEqual({ ok: false, error: "20 is the most. Remove one to add another." });
    setFactOff(UID, loadFacts(UID)[1].id, true);
    expect(setFactOff(UID, first.id, false).ok).toBe(true);
    expect(loadFacts(UID)[0].offAt).toBeUndefined();
  });
  it("reads bad JSON or bad rows as nothing", () => {
    store.set(`content-studio-facts-${UID}`, "{oops");
    expect(loadFacts(UID)).toEqual([]);
    store.set(`content-studio-facts-${UID}`, JSON.stringify([{ id: "f1", text: "ok", createdAt: "2026-10-21T00:00:00Z" }, { id: "f2", text: "" }, null, { text: "no id", createdAt: "2026-10-21T00:00:00Z" }]));
    expect(loadFacts(UID)).toEqual([{ id: "f1", text: "ok", createdAt: "2026-10-21T00:00:00Z" }]);
  });
  it("says it couldn't save when the device is full, and writes nothing", () => {
    full = true;
    expect(addFact(UID, "12 years as an adviser")).toEqual({ ok: false, error: SAVE_FAILED });
    expect(fired).toEqual([]);
  });
});

describe("learnings", () => {
  it("holds 30 on, newest first, and keeps at most 60 rows by dropping the oldest removed", () => {
    for (let i = 0; i < MAX_LEARNINGS; i++) learn(`note ${i}`, "posts", i);
    expect(addLearning(UID, { text: "one more", scope: "posts", source: "typed" })).toEqual({ ok: false, error: "30 is the most. Remove one to add another." });
    expect(activeLearnings(loadLearnings(UID))[0].text).toBe("note 29");
    // turn 30 off and add 30 more: 60 rows; one more drops the first one turned off
    loadLearnings(UID).forEach((l, i) => setLearningOff(UID, l.id, true, at(100 + i)));
    for (let i = 0; i < MAX_LEARNINGS; i++) learn(`later ${i}`, "posts", 200 + i);
    expect(loadLearnings(UID)).toHaveLength(KEEP_ROWS);
    setLearningOff(UID, loadLearnings(UID).find((l) => l.text === "later 0")!.id, true, at(400));
    learn("newest", "posts", 401);
    const texts = loadLearnings(UID).map((l) => l.text);
    expect(texts).toHaveLength(KEEP_ROWS);
    expect(texts).not.toContain("note 0");
    expect(texts).toContain("note 1");
    expect(fired.every((e) => e === LEARNINGS_CHANGED)).toBe(true);
  });
  it("replaces a note on now, and Undo puts it back in one step", () => {
    const old = learn("never use emoji in my posts");
    const r = addLearning(UID, { text: "use lots of emoji", scope: "posts", source: "assistant" }, old.id, at(5));
    expect(r.ok).toBe(true);
    const rows = loadLearnings(UID);
    expect(rows[0]).toMatchObject({ id: old.id, offAt: at(5).toISOString(), replacedBy: r.ok && r.item.id });
    expect(activeLearnings(rows).map((l) => l.text)).toEqual(["use lots of emoji"]);
    expect(undoLearning(UID, r.ok ? r.item.id : "")).toBe(true);
    const back = loadLearnings(UID);
    expect(activeLearnings(back).map((l) => l.text)).toEqual(["never use emoji in my posts"]);
    expect(back[0].replacedBy).toBeUndefined();
  });
  it("a replace at 30 on takes the place of the one it turns off", () => {
    for (let i = 0; i < MAX_LEARNINGS; i++) learn(`note ${i}`, "posts", i);
    const old = loadLearnings(UID)[3];
    expect(addLearning(UID, { text: "instead", scope: "posts", source: "assistant" }, old.id).ok).toBe(true);
  });
  it("Remove then Undo restores a learning", () => {
    const l = learn("end every post with a question");
    setLearningOff(UID, l.id, true);
    expect(activeLearnings(loadLearnings(UID))).toEqual([]);
    setLearningOff(UID, l.id, false);
    expect(activeLearnings(loadLearnings(UID)).map((x) => x.id)).toEqual([l.id]);
  });
  it("drops junk rows and keeps a rewrite's id only on a rewrite learning", () => {
    store.set(
      `content-studio-learnings-${UID}`,
      JSON.stringify([
        { id: "l1", text: "a", scope: "posts", source: "rewrite", rewrite: "shorter", createdAt: "2026-10-21T00:00:00Z" },
        { id: "l2", text: "b", scope: "music", source: "typed", createdAt: "2026-10-21T00:00:00Z" },
        { id: "l3", text: "c", scope: "all", source: "robot", createdAt: "2026-10-21T00:00:00Z" },
        { id: "l4", text: "d", scope: "all", source: "typed", rewrite: "shorter", createdAt: "2026-10-21T00:00:00Z" },
      ]),
    );
    expect(loadLearnings(UID).map((l) => [l.id, l.rewrite])).toEqual([
      ["l1", "shorter"],
      ["l4", undefined],
    ]);
  });
  it("checks a new note against its scope's notes and Everything's", () => {
    learn("posts note", "posts", 1);
    learn("video note", "videos", 2);
    learn("every note", "all", 3);
    expect(notesFor(UID, "posts").map((l) => l.text)).toEqual(["every note", "posts note"]);
    expect(notesFor(UID, "videos").map((l) => l.text)).toEqual(["every note", "video note"]);
    expect(notesFor(UID, "all").map((l) => l.text)).toEqual(["every note", "video note", "posts note"]);
  });
});

describe("memoryLine", () => {
  it("is empty with nothing saved", () => {
    expect(memoryLine(UID, "posts")).toBe("");
  });
  it("holds the facts, then the learnings on now in the scope or Everything, newest first, then Coach's lists", () => {
    addFact(UID, "12 years as an adviser", at(0));
    addFact(UID, "Helped 300 families", at(1));
    learn("never use emoji", "posts", 2);
    learn("use Asian presenters", "videos", 3);
    learn("keep it short", "all", 4);
    const gone = learn("old note", "posts", 5);
    setLearningOff(UID, gone.id, true);
    const off = addFact(UID, "removed fact", at(6));
    setFactOff(UID, off.ok ? off.item.id : "", true);
    recordPreference(UID, "like", "client stories");
    recordPreference(UID, "dislike", "jargon");
    expect(memoryLine(UID, "posts")).toBe(
      [MEMORY_HEADER, `${FACTS_LEAD}12 years as an adviser; Helped 300 families`, `${KEEP_LEAD}keep it short; never use emoji; Lean into: client stories; Steer clear of: jargon`].join("\n"),
    );
    expect(memoryLine(UID, "videos")).toBe(
      [MEMORY_HEADER, `${FACTS_LEAD}12 years as an adviser; Helped 300 families`, `${KEEP_LEAD}keep it short; use Asian presenters`].join("\n"),
    );
    expect(MEMORY_HEADER).toBe("ABOUT ME, FROM WHAT I HAVE TOLD YOU (follow these unless MY BRAND RULES say otherwise):");
    expect(FACTS_LEAD).toBe("- Facts you may state about me (state no other facts, numbers, awards or results about me): ");
  });
  it("leaves out a line with nothing in it", () => {
    learn("never use emoji");
    expect(memoryLine(UID, "posts")).toBe(`${MEMORY_HEADER}\n${KEEP_LEAD}never use emoji`);
    expect(memoryLine(UID, "pictures")).toBe("");
  });
  it("never passes max, leaving out whole items from the end: Coach's, then the oldest learnings, and facts last", () => {
    addFact(UID, "12 years as an adviser", at(0));
    learn("first note", "posts", 1);
    learn("second note", "posts", 2);
    recordPreference(UID, "like", "client stories");
    const whole = memoryLine(UID, "posts");
    expect(whole).toContain("Lean into: client stories");
    expect(memoryLine(UID, "posts", whole.length)).toBe(whole);
    const noCoach = memoryLine(UID, "posts", whole.length - 1);
    expect(noCoach).toBe([MEMORY_HEADER, `${FACTS_LEAD}12 years as an adviser`, `${KEEP_LEAD}second note; first note`].join("\n"));
    const one = memoryLine(UID, "posts", noCoach.length - 1);
    expect(one).toBe([MEMORY_HEADER, `${FACTS_LEAD}12 years as an adviser`, `${KEEP_LEAD}second note`].join("\n"));
    const factOnly = memoryLine(UID, "posts", one.length - 1);
    expect(factOnly).toBe([MEMORY_HEADER, `${FACTS_LEAD}12 years as an adviser`].join("\n"));
    expect(memoryLine(UID, "posts", factOnly.length - 1)).toBe("");
    expect(memoryLine(UID, "posts", 0)).toBe("");
    for (const max of [50, 200, 300, 1000]) expect(memoryLine(UID, "posts", max).length).toBeLessThanOrEqual(max);
  });
});

// Pinned before phase 6 adds thread, msg and the "correction" source: what the writers and /voice read off a fixed
// store today. Never update these with vitest -u; a change here changes every writer's prompt.
describe("pin: memoryLine and loadLearnings on a fixed store", () => {
  const FIXED_LEARNINGS = [
    { id: "l-a1", text: "never use emoji", scope: "posts", source: "typed", createdAt: "2026-10-01T01:00:00.000Z" },
    { id: "l-a2", text: "use a woman presenter", scope: "videos", source: "assistant", createdAt: "2026-10-02T01:00:00.000Z", offAt: "2026-10-05T01:00:00.000Z", replacedBy: "l-a5" },
    { id: "l-a3", text: "keep   it short ", scope: "all", source: "rewrite", rewrite: "shorter", createdAt: "2026-10-03T01:00:00.000Z" },
    { id: "l-a4", text: "warm colours", scope: "pictures", source: "typed", createdAt: "2026-10-04T01:00:00.000Z", rewrite: "shorter" },
    { id: "l-a5", text: "use an older man as my presenter", scope: "videos", source: "assistant", createdAt: "2026-10-05T01:00:00.000Z" },
    { id: "l-a6", text: "old note", scope: "posts", source: "typed", createdAt: "2026-10-06T01:00:00.000Z", offAt: "2026-10-07T01:00:00.000Z" },
    { id: "l-a7", text: "bad scope", scope: "music", source: "typed", createdAt: "2026-10-07T01:00:00.000Z" },
    { id: "l-a8", text: "bad source", scope: "posts", source: "robot", createdAt: "2026-10-08T01:00:00.000Z" },
    { id: "l-a9", text: "no date", scope: "posts", source: "typed" },
    null,
  ];
  const FIXED_FACTS = [
    { id: "f-a1", text: "12 years as an adviser", createdAt: "2026-10-01T01:00:00.000Z" },
    { id: "f-a2", text: "removed fact", createdAt: "2026-10-02T01:00:00.000Z", offAt: "2026-10-03T01:00:00.000Z" },
    { id: "f-a3", text: "Helped 300 families", createdAt: "2026-10-04T01:00:00.000Z" },
  ];
  beforeEach(() => {
    store.set(`content-studio-learnings-${UID}`, JSON.stringify(FIXED_LEARNINGS));
    store.set(`content-studio-facts-${UID}`, JSON.stringify(FIXED_FACTS));
    store.set(`content-studio-coachprofile-${UID}`, JSON.stringify({ likes: ["client stories"], dislikes: ["jargon"] }));
  });

  it("loadLearnings keeps the valid rows as they are stored, junk dropped", () => {
    expect(loadLearnings(UID)).toEqual([
      { id: "l-a1", text: "never use emoji", scope: "posts", source: "typed", createdAt: "2026-10-01T01:00:00.000Z" },
      { id: "l-a2", text: "use a woman presenter", scope: "videos", source: "assistant", createdAt: "2026-10-02T01:00:00.000Z", offAt: "2026-10-05T01:00:00.000Z", replacedBy: "l-a5" },
      { id: "l-a3", text: "keep it short", scope: "all", source: "rewrite", createdAt: "2026-10-03T01:00:00.000Z", rewrite: "shorter" },
      { id: "l-a4", text: "warm colours", scope: "pictures", source: "typed", createdAt: "2026-10-04T01:00:00.000Z" },
      { id: "l-a5", text: "use an older man as my presenter", scope: "videos", source: "assistant", createdAt: "2026-10-05T01:00:00.000Z" },
      { id: "l-a6", text: "old note", scope: "posts", source: "typed", createdAt: "2026-10-06T01:00:00.000Z", offAt: "2026-10-07T01:00:00.000Z" },
    ]);
  });

  it("memoryLine gives each scope's block byte for byte", () => {
    expect(memoryLine(UID, "posts")).toBe(
      "ABOUT ME, FROM WHAT I HAVE TOLD YOU (follow these unless MY BRAND RULES say otherwise):\n" +
        "- Facts you may state about me (state no other facts, numbers, awards or results about me): 12 years as an adviser; Helped 300 families\n" +
        "- Keep doing or avoid: keep it short; never use emoji; Lean into: client stories; Steer clear of: jargon",
    );
    expect(memoryLine(UID, "videos")).toBe(
      "ABOUT ME, FROM WHAT I HAVE TOLD YOU (follow these unless MY BRAND RULES say otherwise):\n" +
        "- Facts you may state about me (state no other facts, numbers, awards or results about me): 12 years as an adviser; Helped 300 families\n" +
        "- Keep doing or avoid: use an older man as my presenter; keep it short",
    );
    expect(memoryLine(UID, "pictures")).toBe(
      "ABOUT ME, FROM WHAT I HAVE TOLD YOU (follow these unless MY BRAND RULES say otherwise):\n" +
        "- Facts you may state about me (state no other facts, numbers, awards or results about me): 12 years as an adviser; Helped 300 families\n" +
        "- Keep doing or avoid: warm colours; keep it short",
    );
    expect(memoryLine(UID, "posts", 250)).toBe(
      "ABOUT ME, FROM WHAT I HAVE TOLD YOU (follow these unless MY BRAND RULES say otherwise):\n" +
        "- Facts you may state about me (state no other facts, numbers, awards or results about me): 12 years as an adviser; Helped 300 families",
    );
  });
});
