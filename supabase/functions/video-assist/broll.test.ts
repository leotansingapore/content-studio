import { describe, expect, it } from "vitest";
import { BROLL_GAP, KINDS, brollLines, brollQuestions, buildBrollMessages, kindQuestions, parseBrollReply, parseBrollRequest, pickBrollLines, readBroll, readKinds } from "./broll";
import type { MotionLine } from "./motion";

const L = (s: number, e: number, text: string): MotionLine => ({ s, e, text });
// a line every 3 s for a minute
const many = Array.from({ length: 20 }, (_, i) => L(i * 3, i * 3 + 2.5, `Line ${i} says something here.`));

describe("broll request", () => {
  it("keeps the lines, the stretches already covered and the room left", () => {
    const r = parseBrollRequest({ sentences: many, duration: 60, hookSeconds: 2, taken: [{ s: 9, e: 12 }, { s: 5, e: 4 }], room: 4 });
    expect(r.ok && r.request.taken).toEqual([{ s: 9, e: 12 }]);
    expect(r.ok && r.request.room).toBe(4);
  });
  it("refuses a video too short, not captioned, or already full", () => {
    expect(parseBrollRequest({ sentences: many, duration: 3 })).toEqual({ ok: false, error: "The video is too short for B-roll." });
    expect(parseBrollRequest({ sentences: many.slice(0, 1), duration: 60 }).ok).toBe(false);
    expect(parseBrollRequest({ sentences: many, duration: 60, room: 0 }).ok).toBe(false);
  });
});

describe("which lines Jev is asked about", () => {
  it("never the hook: not the first line, nothing in the first 3 s or under the hook card", () => {
    expect(brollLines({ lines: many, hookSeconds: 0, taken: [] }).slice(0, 2)).toEqual([1, 2]);
    expect(brollLines({ lines: many, hookSeconds: 7, taken: [] })[0]).toBe(3);
    // a video whose first words come late: its first line is still the hook
    const late = many.map((l) => L(l.s + 4, l.e + 4, l.text));
    expect(brollLines({ lines: late, hookSeconds: 0, taken: [] })[0]).toBe(1);
  });
  it("skips short lines and lines under B-roll already placed", () => {
    const lines = [L(0, 2, "Hi there friends."), L(4, 5, "Okay."), L(6, 8, "Buy a home early."), L(9, 11, "Save in a jar.")];
    expect(brollLines({ lines, hookSeconds: 0, taken: [{ s: 8.5, e: 10 }] })).toEqual([2]);
  });
  it("asks one Noul per line with the line before", () => {
    const q = brollQuestions(many, [1, 2])[0];
    expect(Object.keys(q)).toEqual(["broll_1", "broll_2"]);
    expect(q.broll_2.type).toBe("noul");
    expect((q.broll_2.instructions as { line_before: string }).line_before).toBe("Line 1 says something here.");
  });
  it("reads Jev's answers, null when there are none", () => {
    expect(readBroll({ broll_2: { type: "noul", noul: 0.8 } }, [1, 2])).toEqual([{ i: 2, p: 0.8 }]);
    expect(readBroll(null, [1, 2])).toBeNull();
    expect(readBroll({ broll_2: { type: "noul" } }, [1, 2])).toBeNull();
  });
});

describe("picking the lines", () => {
  it("takes the likeliest, 5 s apart, 3 a minute, in script order", () => {
    const probs = [{ i: 2, p: 0.9 }, { i: 3, p: 0.95 }, { i: 10, p: 0.8 }, { i: 15, p: 0.7 }, { i: 18, p: 0.6 }];
    expect(pickBrollLines(many, probs, 60, 10)).toEqual([3, 10, 15]);
    expect(Math.abs(many[3].s - many[2].s)).toBeLessThan(BROLL_GAP);
  });
  it("never takes a weak line, and stops at the room left", () => {
    expect(pickBrollLines(many, [{ i: 4, p: 0.49 }], 60, 10)).toEqual([]);
    expect(pickBrollLines(many, [{ i: 2, p: 0.9 }, { i: 10, p: 0.8 }], 60, 1)).toEqual([2]);
  });
});

describe("what each line shows", () => {
  it("asks Jev one Choice per picked line among scene, idea and product", () => {
    const q = kindQuestions(many, [3, 10]);
    expect(Object.keys(q)).toEqual(["kind_3", "kind_10"]);
    expect(q.kind_3.type).toBe("choice");
    expect(Object.keys((q.kind_3 as { criteria: Record<string, unknown> }).criteria)).toEqual(Object.keys(KINDS));
  });
  it("reads each kind, a scene clip when Jev has no answer or picks something else", () => {
    expect(readKinds({ kind_3: { type: "choice", choice: "idea" }, kind_10: { type: "choice", choice: "chart" } }, [3, 10, 15])).toEqual({ 3: "idea", 10: "scene", 15: "scene" });
    expect(readKinds(null, [3])).toEqual({ 3: "scene" });
  });
});

describe("the words for each line", () => {
  const kinds = { 3: "scene", 10: "scene", 12: "idea", 15: "product" } as const;
  it("asks the LLM for the words only, each line tagged with its kind and the line before", () => {
    expect(buildBrollMessages(many, [3, 12], kinds)[1].content).toBe("L3 [scene]: Line 3 says something here.\n(said just before: Line 2 says something here.)\nL12 [idea]: Line 12 says something here.\n(said just before: Line 11 says something here.)");
  });
  it("keeps a clean 1 to 3 word search for a scene and card text for the rest, in order", () => {
    const reply = JSON.stringify({ items: [
      { id: "L10", search: "Hospital bed, ward & nurse" },
      { id: "L3", search: "Family Dinner" },
      { id: "L4", search: "not asked" },
      { id: "L3", search: "twice" },
      { id: "L12", callout: "\u201cStart at 25\u201d \u2014 it costs you less over time." },
      { id: "L15", callout: "MediShield Life" },
    ] });
    expect(parseBrollReply(reply, [3, 10, 12, 15], kinds)).toEqual([
      { i: 3, kind: "scene", search: "family dinner" },
      { i: 10, kind: "scene", search: "hospital bed ward" },
      { i: 12, kind: "idea", callout: "Start at 25, it costs you less" },
      { i: 15, kind: "product", callout: "MediShield Life" },
    ]);
  });
  it("drops a line whose words did not come back, and a reply that is not JSON", () => {
    expect(parseBrollReply(JSON.stringify({ items: [{ id: "L12", search: "jar" }, { id: "L3", callout: "x" }] }), [3, 12], kinds)).toEqual([]);
    expect(parseBrollReply("not json", [3], kinds)).toEqual([]);
  });
});
