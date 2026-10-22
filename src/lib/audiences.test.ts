import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type Audience, AUDIENCES_CHANGED, audienceFromParams, audienceLine, audiencesKey, FULL_LINE, loadAudiences, MAX_ACTIVE, removeAudience,
  sanitizeAudience, saveAudience, seedAudience, setMain,
} from "./audiences";
import { EMPTY_POSITIONING, type Positioning } from "./positioning";

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
const NOW = new Date("2026-10-22T08:00:00.000Z");
const LATER = new Date("2026-10-22T09:00:00.000Z");
const positioning = (o: Partial<Positioning> = {}): Positioning => ({
  ...EMPTY_POSITIONING, oneLiner: "I help young parents plan.", topics: ["CPF"], audience: "parent", audienceDetail: "Young parents in HDB flats", ...o,
});
const setPositioning = (p: Positioning) => storage.setItem(`content-studio-positioning-${UID}`, JSON.stringify(p));
const stored = (): Audience[] => JSON.parse(storage.getItem(audiencesKey(UID)) ?? "[]");
const add = (name: string, o: Partial<Audience> = {}) => {
  const r = saveAudience(UID, { name, who: `${name} who`, lifeStage: "general", cares: [], ...o }, NOW);
  if (r.ok === false) throw new Error(r.error);
  return r.audience;
};

describe("sanitizeAudience", () => {
  it("clips every field and caps cares at 5", () => {
    const a = sanitizeAudience({
      id: "au-1", name: ` ${"n".repeat(80)} `, who: "w".repeat(300), lifeStage: "parent",
      cares: Array.from({ length: 7 }, (_, i) => `${i}${"c".repeat(100)}`), says: "s".repeat(200), source: "website", createdAt: NOW.toISOString(),
    });
    expect([a?.name.length, a?.who.length, a?.cares.length, a?.cares[0].length, a?.says?.length]).toEqual([60, 240, 5, 80, 160]);
    expect(a?.source).toBe("website");
  });

  it("drops a row with no id or name, and reads unknown values as general and you", () => {
    expect(sanitizeAudience({ id: "au-1", name: " " })).toBeNull();
    expect(sanitizeAudience({ name: "x" })).toBeNull();
    const a = sanitizeAudience({ id: "au-1", name: "x", lifeStage: "martian", source: "robot", cares: "no" });
    expect([a?.lifeStage, a?.source, a?.cares]).toEqual(["general", "you", []]);
  });
});

describe("seeding from positioning", () => {
  it("makes one main audience from positioning on the first load, with no AI call", () => {
    setPositioning(positioning());
    const list = loadAudiences(UID, NOW);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ name: "Young parents in HDB flats", who: "Young parents in HDB flats", lifeStage: "parent", main: true, source: "profile", cares: [] });
    expect(stored()).toHaveLength(1);
    expect(events).toContain(AUDIENCES_CHANGED);
  });

  it("seeds only once", () => {
    setPositioning(positioning());
    const first = loadAudiences(UID, NOW)[0];
    expect(loadAudiences(UID, LATER).map((a) => a.id)).toEqual([first.id]);
    expect(stored()).toHaveLength(1);
  });

  it("never seeds again after the seed is removed", () => {
    setPositioning(positioning());
    const seed = loadAudiences(UID, NOW)[0];
    expect(removeAudience(UID, seed.id, LATER)).toBeNull();
    expect(loadAudiences(UID, LATER)).toEqual([]);
    expect(stored()).toHaveLength(1);
    expect(stored()[0].offAt).toBe(LATER.toISOString());
  });

  it("waits for usable positioning, and seeds nothing without it", () => {
    expect(loadAudiences(UID, NOW)).toEqual([]);
    setPositioning(positioning({ topics: [] }));
    expect(loadAudiences(UID, NOW)).toEqual([]);
    expect(storage.getItem(audiencesKey(UID))).toBeNull();
  });

  it("cuts the seed name at a word break, and falls back to the life stage as a group", () => {
    const long = "Young parents in their thirties living in HDB flats in the east of Singapore";
    const name = seedAudience({ audience: "parent", audienceDetail: long }, NOW).name;
    expect(name).toBe("Young parents in their thirties living in HDB flats in the");
    expect(name.length).toBeLessThanOrEqual(60);
    expect(seedAudience({ audience: "pre-retiree", audienceDetail: " " }, NOW).name).toBe("Pre-retirees");
    expect(seedAudience({ audience: "general", audienceDetail: "" }, NOW).name).toBe("Everyone I serve");
  });

  it("reads bad JSON as no rows and never seeds over it", () => {
    setPositioning(positioning());
    storage.setItem(audiencesKey(UID), "{not json");
    expect(loadAudiences(UID, NOW)).toEqual([]);
    expect(storage.getItem(audiencesKey(UID))).toBe("{not json");
  });
});

describe("saving", () => {
  it("caps active audiences at 6, and a removed one frees a place", () => {
    const made = Array.from({ length: MAX_ACTIVE }, (_, i) => add(`A${i}`));
    const r = saveAudience(UID, { name: "Seventh" }, NOW);
    expect(r).toEqual({ ok: false, error: FULL_LINE });
    removeAudience(UID, made[2].id, LATER);
    expect(saveAudience(UID, { name: "Seventh" }, NOW).ok).toBe(true);
    expect(loadAudiences(UID)).toHaveLength(MAX_ACTIVE);
  });

  it("changes a row in place, even at 6 active", () => {
    const made = Array.from({ length: MAX_ACTIVE }, (_, i) => add(`A${i}`));
    const r = saveAudience(UID, { id: made[3].id, name: "Renamed", cares: ["fees"] }, LATER);
    expect(r.ok && r.audience).toMatchObject({ id: made[3].id, name: "Renamed", cares: ["fees"], createdAt: NOW.toISOString() });
    expect(loadAudiences(UID).map((a) => a.name)).toContain("Renamed");
  });

  it("keeps exactly one main: the first kept, a new main, and after removing the main", () => {
    const a = add("First");
    const b = add("Second");
    const c = add("Third");
    const mains = () => loadAudiences(UID).filter((x) => x.main).map((x) => x.id);
    expect(mains()).toEqual([a.id]);
    add("Fourth", { id: b.id, main: true });
    expect(mains()).toEqual([b.id]);
    expect(setMain(UID, c.id)).toBeNull();
    expect(mains()).toEqual([c.id]);
    removeAudience(UID, c.id, LATER);
    expect(mains()).toHaveLength(1);
    expect(loadAudiences(UID)[0].main).toBe(true);
  });

  it("leaves removed rows out of the list but keeps them stored, 20 at most", () => {
    for (let i = 0; i < 25; i++) {
      const x = add(`A${i}`);
      removeAudience(UID, x.id, new Date(NOW.getTime() + i * 1000));
    }
    const keep = add("Live");
    expect(loadAudiences(UID).map((a) => a.id)).toEqual([keep.id]);
    expect(stored()).toHaveLength(20);
    // the oldest removed rows went first
    expect(stored().some((a) => a.name === "A0")).toBe(false);
    expect(stored().some((a) => a.name === "A24")).toBe(true);
  });

  it("refuses with a line when the device is full", () => {
    storage.full = true;
    const r = saveAudience(UID, { name: "X" }, NOW);
    expect(r.ok).toBe(false);
  });
});

describe("audienceLine", () => {
  it("is the writer line, exact", () => {
    const a = { name: "Young parents in their 30s", who: "Both working, kids under 10, HDB flat.", cares: ["childcare costs", "hospital bills", "school fees"], says: "They say 'money for the kids' first" };
    expect(audienceLine(a, "person")).toBe(
      "WRITE FOR THIS AUDIENCE: Young parents in their 30s. Both working, kids under 10, HDB flat. They care about: childcare costs, hospital bills, school fees. How they talk about money: They say 'money for the kids' first",
    );
    // talk about money only for an adviser's brand: a business's buyers, or a caller that doesn't say, talk about it
    expect(audienceLine(a, "business")).toBe(
      "WRITE FOR THIS AUDIENCE: Young parents in their 30s. Both working, kids under 10, HDB flat. They care about: childcare costs, hospital bills, school fees. How they talk about it: They say 'money for the kids' first",
    );
    expect(audienceLine(a)).toContain(" How they talk about it: ");
    expect(audienceLine({ ...a, says: undefined })).toBe(
      "WRITE FOR THIS AUDIENCE: Young parents in their 30s. Both working, kids under 10, HDB flat. They care about: childcare costs, hospital bills, school fees.",
    );
  });

  it("closes a who with no full stop, and leaves out cares a seed doesn't have yet", () => {
    expect(audienceLine({ name: "Parents", who: "Young parents in HDB flats", cares: [] })).toBe("WRITE FOR THIS AUDIENCE: Parents. Young parents in HDB flats.");
  });

  it("says a seeded audience's name once (wave 2 live check: ActivityTracker's au-mvj95233mdet)", () => {
    const now = new Date("2026-10-22T08:00:00Z");
    const at = seedAudience({ audience: "working-adult", audienceDetail: "Sales-oriented self-employed professionals and coaches" }, now);
    expect(audienceLine(at, "business")).toBe("WRITE FOR THIS AUDIENCE: Sales-oriented self-employed professionals and coaches.");
    // a detail past 60 characters: the name is cut from it, so the full detail is the line
    const me = seedAudience({ audience: "working-adult", audienceDetail: "Auditor / Accountant, aged 30-48, Middle to upper-middle income" }, now);
    expect(audienceLine(me, "person")).toBe("WRITE FOR THIS AUDIENCE: Auditor / Accountant, aged 30-48, Middle to upper-middle income.");
    // a name that only starts a word of who is not a repeat
    expect(audienceLine({ name: "Par", who: "Parents in HDB flats", cares: [] })).toBe("WRITE FOR THIS AUDIENCE: Par. Parents in HDB flats.");
  });
});

describe("audienceFromParams", () => {
  const saved: Audience[] = [
    { id: "au-a", name: "A", who: "", lifeStage: "pre-retiree", cares: [], source: "you", createdAt: "", main: true },
    { id: "au-off", name: "Off", who: "", lifeStage: "parent", cares: [], source: "you", createdAt: "", offAt: "2026-10-01" },
  ];
  it("aud beats audience", () => {
    const r = audienceFromParams(new URLSearchParams("aud=au-a&audience=parent"), saved);
    expect(r.aud?.id).toBe("au-a");
    expect(r.audience).toBe("pre-retiree");
  });
  it("an unknown or removed id gives null and falls back to the life stage", () => {
    expect(audienceFromParams(new URLSearchParams("aud=au-zzz&audience=parent"), saved)).toEqual({ aud: null, audience: "parent" });
    expect(audienceFromParams(new URLSearchParams("aud=au-off"), saved)).toEqual({ aud: null, audience: null });
    expect(audienceFromParams(new URLSearchParams("audience=martian"), saved)).toEqual({ aud: null, audience: null });
  });
});
