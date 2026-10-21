import { describe, expect, it } from "vitest";
import { HISTORY_STEPS, emptyHistory, newTypingStep, record, redo, undo } from "./carouselHistory";

describe("carousel undo and redo", () => {
  it("undoes and redoes in order", () => {
    let h = record(record(emptyHistory<string>(), "a"), "b");
    const u1 = undo(h, "c");
    expect(u1?.to).toBe("b");
    const u2 = undo(u1!.h, "b");
    expect(u2?.to).toBe("a");
    expect(undo(u2!.h, "a")).toBeNull();
    const r1 = redo(u2!.h, "a");
    expect(r1?.to).toBe("b");
    expect(redo(r1!.h, "b")?.to).toBe("c");
    h = redo(r1!.h, "b")!.h;
    expect(redo(h, "c")).toBeNull();
  });

  it("a change after Undo drops Redo", () => {
    const back = undo(record(emptyHistory<string>(), "a"), "b")!;
    expect(back.h.future).toEqual(["b"]);
    const h = record(back.h, "a");
    expect(h.future).toEqual([]);
    expect(redo(h, "x")).toBeNull();
  });

  it("keeps the last 20 steps", () => {
    let h = emptyHistory<number>();
    for (let i = 0; i < 25; i++) h = record(h, i);
    expect(h.past).toHaveLength(HISTORY_STEPS);
    expect(h.past[0]).toBe(5);
    let now = 25;
    let steps = 0;
    for (let u = undo(h, now); u; u = undo(h, now)) {
      h = u.h;
      now = u.to;
      steps++;
    }
    expect([steps, now]).toEqual([20, 5]);
  });

  it("typing joins one step until a pause of 800 ms or another field", () => {
    expect(newTypingStep(null, 1000, "s1:title")).toBe(true);
    expect(newTypingStep({ at: 1000, field: "s1:title" }, 1799, "s1:title")).toBe(false);
    expect(newTypingStep({ at: 1000, field: "s1:title" }, 1800, "s1:title")).toBe(true);
    expect(newTypingStep({ at: 1000, field: "s1:title" }, 1100, "s1:body")).toBe(true);
  });
});
