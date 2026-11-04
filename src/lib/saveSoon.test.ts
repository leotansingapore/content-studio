import { afterEach, describe, expect, it, vi } from "vitest";
import { saveSoon } from "@/lib/saveSoon";

afterEach(() => vi.useRealTimers());

describe("saveSoon", () => {
  it("sends only the newest save, once, after the pause", async () => {
    vi.useFakeTimers();
    const sent: string[] = [];
    const s = saveSoon(500);
    s.later(async () => void sent.push("a"));
    s.later(async () => void sent.push("b"));
    await vi.advanceTimersByTimeAsync(499);
    expect(sent).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(sent).toEqual(["b"]);
    await vi.advanceTimersByTimeAsync(5000);
    expect(sent).toEqual(["b"]);
  });

  it("now() sends a waiting save at once (leaving the page) and the timer doesn't send it again", async () => {
    vi.useFakeTimers();
    const sent: string[] = [];
    const s = saveSoon(500);
    s.later(async () => void sent.push("last edit"));
    await s.now();
    expect(sent).toEqual(["last edit"]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(sent).toEqual(["last edit"]);
  });

  it("now() resolves only once the save in flight is done, so an action after it reads the newest copy", async () => {
    vi.useFakeTimers();
    const log: string[] = [];
    const s = saveSoon(500);
    s.later(() => new Promise((done) => setTimeout(() => (log.push("saved"), done(null)), 300)));
    await vi.advanceTimersByTimeAsync(500); // the timer fired: the save is in flight
    const action = s.now().then(() => log.push("action"));
    await vi.advanceTimersByTimeAsync(300);
    await action;
    expect(log).toEqual(["saved", "action"]);
  });

  it("an edit saved while a slow save is still out goes after it, so the server ends with the newest copy", async () => {
    vi.useFakeTimers();
    let server = "";
    const s = saveSoon(500);
    const save = (copy: string, ms: number) => () => new Promise((done) => setTimeout(() => ((server = copy), done(null)), ms));
    s.later(save("older", 2000));
    await vi.advanceTimersByTimeAsync(500); // the older save is out
    s.later(save("newer", 100));
    await vi.advanceTimersByTimeAsync(500); // the newer one's pause is over while the older is still out
    await vi.advanceTimersByTimeAsync(5000);
    expect(server).toBe("newer");
  });

  it("a failed save doesn't stop the next one or the action", async () => {
    const sent: string[] = [];
    const s = saveSoon(500);
    s.later(() => Promise.reject(new Error("offline")));
    await expect(s.now()).resolves.toBeUndefined();
    s.later(async () => void sent.push("next"));
    await s.now();
    expect(sent).toEqual(["next"]);
  });
});
