import { beforeEach, describe, expect, it, vi } from "vitest";
import { NOT_AI, limitFor, ownerSignedIn, readUsageWeek, usesLeft, utcDay } from "@/lib/aiUsage";
import { DAILY_LIMITS, OWNER_AI_IMAGE_LIMIT, type UsageFeature } from "../../supabase/functions/_shared/usageCaps";

const db = vi.hoisted(() => ({ rows: [] as unknown[] | null, error: null as unknown, asked: [] as unknown[][] }));
vi.mock("@/lib/supabase", () => {
  const query = {
    select: (...a: unknown[]) => (db.asked.push(["select", ...a]), query),
    gte: async (...a: unknown[]) => (db.asked.push(["gte", ...a]), { data: db.rows, error: db.error }),
  };
  return { SUPABASE_URL: "https://abc.supabase.co", supabase: { from: (t: string) => (db.asked.push(["from", t]), query) } };
});

describe("uses left today", () => {
  const now = new Date("2026-10-08T03:00:00Z");
  it("counts today's uses against the daily cap, never below zero", () => {
    const u = { day: "2026-10-08", used: { "video-clips": 7, "ai-voice": 12 } };
    expect(usesLeft(u, "video-clips", now)).toBe(DAILY_LIMITS["video-clips"] - 7);
    expect(usesLeft(u, "ai-voice", now)).toBe(0);
    expect(usesLeft(u, "video-publish", now)).toBe(DAILY_LIMITS["video-publish"]);
  });
  it("gives the full cap once the day has turned over (8am Singapore), and nothing before a read", () => {
    expect(usesLeft({ day: "2026-10-07", used: { "video-clips": 20 } }, "video-clips", now)).toBe(DAILY_LIMITS["video-clips"]);
    expect(usesLeft(null, "video-clips", now)).toBeNull();
  });
  it("uses the UTC date, as the counter does", () => {
    expect(utcDay(new Date("2026-10-08T23:30:00+08:00"))).toBe("2026-10-08");
    expect(utcDay(new Date("2026-10-09T07:59:00+08:00"))).toBe("2026-10-08");
    expect(utcDay(new Date("2026-10-09T08:00:00+08:00"))).toBe("2026-10-09");
  });
});

beforeEach(() => {
  db.rows = [];
  db.error = null;
  db.asked = [];
});

describe("AI runs in the last 7 days", () => {
  const now = new Date("2026-10-25T02:00:00Z");

  it("reads the last 7 UTC days of the account's own rows", async () => {
    await readUsageWeek(now);
    expect(db.asked).toEqual([["from", "cs_ai_usage"], ["select", "feature,day,count"], ["gte", "day", "2026-10-19"]]);
  });

  it("leaves out the -global counters, claimOnce and per-brand ':' rows, caps that aren't AI and unknown features", async () => {
    db.rows = [
      { feature: "reel-clone", day: "2026-10-24", count: 4 },
      { feature: "reel-clone", day: "2026-10-25", count: 2 },
      { feature: "carousel", day: "2026-10-22", count: 5 },
      { feature: "ai-video-global", day: "2026-10-24", count: 9 },
      { feature: "market-check:prof-1", day: "2026-10-24", count: 7 },
      { feature: "social-read", day: "2026-10-24", count: 40 },
      { feature: "reel-style", day: "2026-10-24", count: 12 },
      { feature: "gone-cap", day: "2026-10-24", count: 30 },
    ];
    expect(await readUsageWeek(now)).toEqual({ total: 11, most: { feature: "reel-clone", n: 6 } });
  });

  it("leaves out Telegram's connect codes, queued posts and upload links, as it does Zernio's", async () => {
    db.rows = [
      { feature: "carousel", day: "2026-10-24", count: 3 },
      { feature: "telegram-schedule", day: "2026-10-24", count: 12 },
      { feature: "telegram-presign", day: "2026-10-24", count: 12 },
      { feature: "telegram-connect", day: "2026-10-23", count: 2 },
      { feature: "social-schedule", day: "2026-10-24", count: 12 },
    ];
    expect(await readUsageWeek(now)).toEqual({ total: 3, most: { feature: "carousel", n: 3 } });
  });

  it("is zero with nothing, and null when the rows can't be read", async () => {
    expect(await readUsageWeek(now)).toEqual({ total: 0, most: null });
    db.error = { message: "down" };
    expect(await readUsageWeek(now)).toBeNull();
  });

  it("names only caps that exist, so renaming one fails here", () => {
    for (const f of NOT_AI) expect(DAILY_LIMITS).toHaveProperty(f);
  });
});

describe("the owner's picture cap", () => {
  const now = new Date("2026-10-08T03:00:00Z");
  const FEATURES = Object.keys(DAILY_LIMITS) as UsageFeature[];

  it("leaves Leo the server's 40 pictures a day, less what he used", () => {
    const u = { day: "2026-10-08", used: { "ai-image": 7 } };
    expect(usesLeft(u, "ai-image", now, true)).toBe(OWNER_AI_IMAGE_LIMIT - 7);
    expect(usesLeft(u, "ai-image", now, false)).toBe(0);
    expect(limitFor("ai-image", true)).toBe(40);
  });

  it("changes no other cap, for Leo or anyone, and no cap at all for anyone else", () => {
    const none = { day: "2026-10-08", used: {} };
    for (const f of FEATURES) {
      expect(usesLeft(none, f, now, false), f).toBe(DAILY_LIMITS[f]);
      expect(limitFor(f, false), f).toBe(DAILY_LIMITS[f]);
      if (f !== "ai-image") expect([usesLeft(none, f, now, true), limitFor(f, true)], f).toEqual([DAILY_LIMITS[f], DAILY_LIMITS[f]]);
    }
  });

  it("is Leo's when this device's stored session is one of his emails, and nobody else's", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null });
    const u = { day: "2026-10-08", used: { "ai-image": 7 } };
    try {
      expect([ownerSignedIn(), usesLeft(u, "ai-image", now)]).toEqual([false, 0]);
      store.set("sb-abc-auth-token", JSON.stringify({ user: { id: "u2", email: "someone@example.com" } }));
      expect([ownerSignedIn(), usesLeft(u, "ai-image", now)]).toEqual([false, 0]);
      store.set("sb-abc-auth-token", JSON.stringify({ user: { id: "u1", email: "TanJunSing@gmail.com" } }));
      expect([ownerSignedIn(), usesLeft(u, "ai-image", now)]).toEqual([true, 33]);
      expect(usesLeft(u, "ai-voice", now)).toBe(DAILY_LIMITS["ai-voice"]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
