import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type Angle, ANGLES_CHANGED, anglesFor, anglesKey, confirmAngles, loadAngleStore, MAX_PER_AUDIENCE, removeAngle, restoreAngle, trimAngles,
} from "./angles";
import { addProfile, setActiveProfile } from "./profiles";

class MemStorage {
  s = new Map<string, string>();
  full = false;
  getItem(k: string) { return this.s.get(k) ?? null; }
  setItem(k: string, v: string) { if (this.full) throw new Error("QuotaExceededError"); this.s.set(k, v); }
  removeItem(k: string) { this.s.delete(k); }
}
let storage: MemStorage;
const events: string[] = [];
beforeEach(() => {
  storage = new MemStorage();
  events.length = 0;
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("window", { localStorage: storage, dispatchEvent: (e: Event) => events.push(e.type) });
});
afterEach(() => vi.unstubAllGlobals());

const UID = "u1";
const day = (d: number) => new Date(Date.UTC(2026, 9, d, 8));
const pick = (title: string, o: Partial<Angle> = {}) => ({ title, line: `${title} line`, origin: "suggested" as const, ...o });
const at = (minute: number) => new Date(Date.UTC(2026, 9, 1, 8, minute)).toISOString();
const angle = (i: number, o: Partial<Angle> = {}): Angle => ({ id: `an-${i}`, title: `Angle ${i}`, line: "", origin: "suggested", createdAt: at(i), ...o });

describe("confirmAngles", () => {
  it("keeps each audience's angles apart, newest first, with usedAt set", () => {
    const a = confirmAngles(UID, "au-a", [pick("Fees are not the whole story"), pick("Start before 30", { origin: "mine" })], day(1));
    confirmAngles(UID, "au-b", [pick("Your CPF is already working")], day(2));
    expect(a.error).toBeNull();
    expect(a.angles.map((x) => x.title)).toEqual(["Fees are not the whole story", "Start before 30"]);
    expect(a.angles.every((x) => x.usedAt === day(1).toISOString() && x.id.startsWith("an-"))).toBe(true);
    expect(anglesFor(UID, "au-a").map((x) => x.title).sort()).toEqual(["Fees are not the whole story", "Start before 30"]);
    expect(anglesFor(UID, "au-a").find((x) => x.title === "Start before 30")?.origin).toBe("mine");
    expect(anglesFor(UID, "au-b").map((x) => x.title)).toEqual(["Your CPF is already working"]);
    expect(anglesFor(UID, "au-c")).toEqual([]);
    expect(events).toContain(ANGLES_CHANGED);
  });

  it("updates a used-before angle in place by id or by the same title, never twice", () => {
    const first = confirmAngles(UID, "au-a", [pick("Start before 30"), pick("The hospital bill question")], day(1)).angles;
    const again = confirmAngles(UID, "au-a", [
      pick("Start before 25", { id: first[0].id }), pick("the HOSPITAL bill question ", { line: "New line" }), pick("Start before 25", { id: first[0].id }),
    ], day(5)).angles;
    expect(again.map((x) => x.id)).toEqual([first[0].id, first[1].id]);
    const saved = anglesFor(UID, "au-a");
    expect(saved).toHaveLength(2);
    expect(saved.find((x) => x.id === first[0].id)).toMatchObject({ title: "Start before 25", createdAt: day(1).toISOString(), usedAt: day(5).toISOString() });
    expect(saved.find((x) => x.id === first[1].id)?.line).toBe("New line");
  });

  it("clips the title at 40 and the line at 140", () => {
    const [a] = confirmAngles(UID, "au-a", [pick("t".repeat(60), { line: "l".repeat(200) })], day(1)).angles;
    expect([a.title.length, a.line.length]).toEqual([40, 140]);
  });

  it("keeps each brand's angles apart", () => {
    confirmAngles(UID, "au-a", [pick("Brand one angle")], day(1));
    const other = addProfile(UID, "Second brand");
    setActiveProfile(UID, other.id);
    expect(anglesKey(UID)).toBe(`content-studio-angles-${UID}~${other.id}`);
    expect(anglesFor(UID, "au-a")).toEqual([]);
    setActiveProfile(UID, "me");
    expect(anglesFor(UID, "au-a").map((x) => x.title)).toEqual(["Brand one angle"]);
  });

  it("still returns the picked angles when the device is full, with the line", () => {
    storage.full = true;
    const r = confirmAngles(UID, "au-a", [pick("A"), pick("B")], day(1));
    expect(r.angles).toHaveLength(2);
    expect(r.error).toMatch(/out of room/);
  });
});

describe("the 30 per audience trim", () => {
  it("drops the oldest unused first, then the least recently used", () => {
    const used = Array.from({ length: 28 }, (_, i) => angle(i, { usedAt: at(200 + i) }));
    const unused = [angle(100, { createdAt: at(2) }), angle(101, { createdAt: at(1) }), angle(102, { createdAt: at(3) })];
    const kept = trimAngles([...used, ...unused]).map((a) => a.id);
    expect(kept).toHaveLength(MAX_PER_AUDIENCE);
    expect(kept).not.toContain("an-101");
    expect(kept).toContain("an-100");

    // all used: the one used longest ago goes, though it was made last
    const allUsed = Array.from({ length: 31 }, (_, i) => angle(i, { usedAt: at(i === 30 ? 0 : 100 + i) }));
    expect(trimAngles(allUsed).map((a) => a.id)).not.toContain("an-30");
    expect(trimAngles(allUsed)).toHaveLength(MAX_PER_AUDIENCE);
  });

  it("applies when Confirm passes 30", () => {
    const stored = [...Array.from({ length: 29 }, (_, i) => angle(i, { usedAt: day(2).toISOString() })), angle(99)];
    storage.setItem(anglesKey(UID), JSON.stringify({ "au-a": stored }));
    confirmAngles(UID, "au-a", [pick("Brand new")], day(20));
    const ids = anglesFor(UID, "au-a").map((a) => a.id);
    expect(ids).toHaveLength(30);
    expect(ids).not.toContain("an-99");
  });
});

describe("remove and restore", () => {
  it("removes a used-before angle, and Undo puts it back in its place", () => {
    const [a, b, c] = [1, 2, 3].map((d) => confirmAngles(UID, "au-a", [pick(`Angle on day ${d}`)], day(d)).angles[0]);
    const gone = removeAngle(UID, "au-a", b.id);
    expect(gone?.id).toBe(b.id);
    expect(anglesFor(UID, "au-a").map((x) => x.id)).toEqual([c.id, a.id]);
    expect(restoreAngle(UID, "au-a", gone as Angle)).toBeNull();
    expect(anglesFor(UID, "au-a").map((x) => x.id)).toEqual([c.id, b.id, a.id]);
    expect(removeAngle(UID, "au-a", "an-nope")).toBeNull();
  });
});

describe("loadAngleStore", () => {
  it("reads bad JSON and bad rows as empty", () => {
    storage.setItem(anglesKey(UID), "{nope");
    expect(loadAngleStore(UID)).toEqual({});
    storage.setItem(anglesKey(UID), JSON.stringify(["x"]));
    expect(loadAngleStore(UID)).toEqual({});
    storage.setItem(anglesKey(UID), JSON.stringify({ "au-a": [{ id: "an-1" }, { title: "no id" }, angle(2), angle(2)], "au-b": "x" }));
    expect(loadAngleStore(UID)).toEqual({ "au-a": [angle(2)] });
  });
});
