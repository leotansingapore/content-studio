import { beforeEach, describe, expect, it, vi } from "vitest";
import { changeLine, emptyPace, gaugeMax, loadPace, niceCeil, PACE_CHANGED, postViews, recordPull, savePace, usualViews, viewsADay, type PaceState } from "./pace";
import type { MetricsPost, Numbers } from "./realNumbers";

const UID = "6d80f027-3395-480c-86a1-8827d3d6cce3";
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
// 00:00 on 1 Oct 2026 in Singapore
const MIDNIGHT = Date.parse("2026-09-30T16:00:00Z");
const iso = (t: number) => new Date(t).toISOString();

const n = (x: Partial<Numbers>): Numbers => ({ impressions: 0, reach: 0, views: 0, likes: 0, comments: 0, shares: 0, saves: 0, ...x });
const post = (id: string, views: number, publishedAt = "2026-09-01T00:00:00Z"): MetricsPost =>
  ({ id, zernioPostId: null, platform: "tiktok", accountId: "65000000000000000000a001", publishedAt, text: "", url: null, numbers: n({ views }) });

const pulls = (...steps: [number, MetricsPost[]][]): PaceState =>
  steps.reduce((s, [t, posts]) => recordPull(s, posts, iso(t)), emptyPace());

class MemStorage {
  m = new Map<string, string>();
  get length() { return this.m.size; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
}

describe("views a day from the gains between pulls", () => {
  it("only sets since and last on the first pull, so the card counts from today", () => {
    const s = pulls([MIDNIGHT + 9 * HOUR, [post("a", 100)]]);
    expect(s).toEqual({ since: iso(MIDNIGHT + 9 * HOUR), last: { at: iso(MIDNIGHT + 9 * HOUR), views: { a: 100 } }, days: {} });
    expect(viewsADay(s)).toBeNull();
  });

  it("reads 110 a day from pulls 24 hours apart: post A 100 then 160, new post B 50", () => {
    const t0 = MIDNIGHT + 10 * HOUR;
    const s = pulls([t0, [post("a", 100)]], [t0 + DAY, [post("a", 160), post("b", 50, iso(t0 + 2 * HOUR))]]);
    expect(viewsADay(s)).toBe(110);
  });

  it("is null under 20 hours of history", () => {
    const t0 = MIDNIGHT + 1 * HOUR;
    expect(viewsADay(pulls([t0, [post("a", 100)]], [t0 + 19 * HOUR, [post("a", 200)]]))).toBeNull();
    expect(viewsADay(pulls([t0, [post("a", 100)]], [t0 + 20 * HOUR, [post("a", 200)]]))).not.toBeNull();
  });

  it("spreads a 72-hour gain by hours over the Singapore days: 100 on each of 3 days, not 300 on the last", () => {
    const s = pulls([MIDNIGHT, [post("a", 0)]], [MIDNIGHT + 3 * DAY, [post("a", 300)]]);
    expect(s.days).toEqual({ "2026-10-01": 100, "2026-10-02": 100, "2026-10-03": 100 });
  });

  it("splits a gap across midnight by its hours on each side", () => {
    const s = pulls([MIDNIGHT - 6 * HOUR, [post("a", 0)]], [MIDNIGHT + 18 * HOUR, [post("a", 240)]]);
    expect(s.days).toEqual({ "2026-09-30": 60, "2026-10-01": 180 });
  });

  it("adds nothing for a post first seen now but published before the last pull", () => {
    const t0 = MIDNIGHT + 10 * HOUR;
    const s = pulls([t0, [post("a", 100)]], [t0 + DAY, [post("a", 100), post("late", 900, iso(t0 - HOUR))]]);
    expect(viewsADay(s)).toBe(0);
    expect(s.last?.views.late).toBe(900);
  });

  it("never lowers the number for a deleted post or a post whose views dropped", () => {
    const t0 = MIDNIGHT + 10 * HOUR;
    const s = pulls([t0, [post("gone", 5000), post("drop", 400), post("a", 10)]], [t0 + DAY, [post("drop", 300), post("a", 40)]]);
    expect(viewsADay(s)).toBe(30);
    expect(Object.values(s.days).every((v) => v >= 0)).toBe(true);
  });

  it("adds nothing for a pull older than the last one", () => {
    const t0 = MIDNIGHT + 10 * HOUR;
    const s = pulls([t0, [post("a", 100)]]);
    expect(recordPull(s, [post("a", 900)], iso(t0 - HOUR))).toBe(s);
  });

  it("keeps 40 days of gains", () => {
    let s = pulls([MIDNIGHT, [post("a", 0)]]);
    for (let d = 1; d <= 45; d++) s = recordPull(s, [post("a", d * 10)], iso(MIDNIGHT + d * DAY));
    const keys = Object.keys(s.days).sort();
    expect(keys).toHaveLength(40);
    expect(keys[39]).toBe("2026-11-14");
  });

  it("takes views, else impressions, else reach", () => {
    const p = (x: Partial<Numbers>) => ({ ...post("a", 0), numbers: n(x) });
    expect(postViews(p({ views: 5, impressions: 9, reach: 7 }))).toBe(5);
    expect(postViews(p({ impressions: 9, reach: 7 }))).toBe(9);
    expect(postViews(p({ reach: 7 }))).toBe(7);
  });
});

describe("your usual", () => {
  // a pull every Singapore midnight for 35 days: 100 a day up to 29 Oct, then 150 a day
  const history = () => {
    let s = pulls([MIDNIGHT, [post("a", 0)]]);
    let views = 0;
    for (let d = 1; d <= 35; d++) s = recordPull(s, [post("a", (views += d <= 29 ? 100 : 150))], iso(MIDNIGHT + d * DAY));
    return s;
  };

  it("is the average over the 28 days before the 7-day window, against which the change line reads", () => {
    const s = history();
    // the window is the 7 days ending on the day of the last pull (that day has no hours yet)
    expect(usualViews(s)).toBe(100);
    expect(viewsADay(s)).toBe(150);
    expect(changeLine(viewsADay(s), usualViews(s))).toBe("+50% on your usual");
  });

  it("needs 7 days of history before the window", () => {
    let s = pulls([MIDNIGHT, [post("a", 0)]]);
    for (let d = 1; d <= 12; d++) s = recordPull(s, [post("a", d * 100)], iso(MIDNIGHT + d * DAY));
    expect(usualViews(s)).toBeNull();
    s = recordPull(s, [post("a", 1300)], iso(MIDNIGHT + 13 * DAY));
    expect(usualViews(s)).toBe(100);
  });

  it("words the change, with about your usual inside 5%", () => {
    expect(changeLine(118, 100)).toBe("+18% on your usual");
    expect(changeLine(88, 100)).toBe("-12% on your usual");
    expect(changeLine(104, 100)).toBe("About your usual");
    expect(changeLine(96, 100)).toBe("About your usual");
    expect(changeLine(100, null)).toBeNull();
  });
});

describe("the gauge", () => {
  it("rounds up to 1, 2 or 5 times a power of ten", () => {
    expect([niceCeil(101), niceCeil(500), niceCeil(501), niceCeil(1999), niceCeil(0.3)]).toEqual([200, 500, 1000, 2000, 1]);
  });
  it("runs to twice the usual, else 1.5 times today's number with a floor of 100", () => {
    expect(gaugeMax(1240, 1000)).toBe(2000);
    expect(gaugeMax(300, 220)).toBe(500);
    expect(gaugeMax(600, null)).toBe(1000);
    expect(gaugeMax(10, null)).toBe(100);
    expect(gaugeMax(null, null)).toBe(100);
  });
});

describe("the pace store", () => {
  beforeEach(() => {
    (globalThis as { window?: unknown }).window = { localStorage: new MemStorage(), dispatchEvent: vi.fn() };
  });
  const storage = () => (globalThis as unknown as { window: { localStorage: MemStorage; dispatchEvent: ReturnType<typeof vi.fn> } }).window;

  it("saves per brand, says it changed, and reads back", () => {
    const s = pulls([MIDNIGHT, [post("a", 1)]]);
    expect(savePace(UID, s)).toBeNull();
    expect(storage().localStorage.getItem(`content-studio-pace-${UID}`)).toBe(JSON.stringify(s));
    expect(storage().dispatchEvent.mock.calls[0][0].type).toBe(PACE_CHANGED);
    expect(loadPace(UID)).toEqual(s);
  });

  it("reads empty for bad JSON or a wrong shape", () => {
    storage().localStorage.setItem(`content-studio-pace-${UID}`, "{nope");
    expect(loadPace(UID)).toEqual(emptyPace());
    storage().localStorage.setItem(`content-studio-pace-${UID}`, JSON.stringify({ since: 4, last: { at: "x" }, days: { "2026-10-01": "a" } }));
    expect(loadPace(UID)).toEqual(emptyPace());
  });
});
