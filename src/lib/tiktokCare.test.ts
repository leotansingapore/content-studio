import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabase: {}, SUPABASE_ANON_KEY: "", SUPABASE_URL: "" }));

import { TIKTOK_CHANGED, isNewTikTok, loadTikTokCare, markWarmed, modeOf, postsStale, saveMode, savePostCount } from "./tiktokCare";
import { isSyncedKeyFor } from "./cloudSync";

const ME = "6d80f027-3395-480c-86a1-8827d3d6cce3";
const ACCOUNT = "65000000000000000000a001";
const NOW = new Date("2026-10-25T02:00:00.000Z");

let m: Map<string, string>;
let fired: string[];
beforeEach(() => {
  m = new Map();
  fired = [];
  const storage = {
    get length() { return m.size; },
    clear: () => m.clear(),
    getItem: (k: string) => m.get(k) ?? null,
    key: (i: number) => [...m.keys()][i] ?? null,
    removeItem: (k: string) => void m.delete(k),
    setItem: (k: string, v: string) => void m.set(k, String(v)),
  };
  vi.stubGlobal("window", { localStorage: storage, dispatchEvent: (e: Event) => fired.push(e.type) });
  vi.stubGlobal("localStorage", storage);
});

describe("a new TikTok account", () => {
  it("is new under 5 posts, and not when the count was never read", () => {
    expect([0, 4, 5, 25].map(isNewTikTok)).toEqual([true, true, false, false]);
    expect(isNewTikTok(undefined)).toBe(false);
    expect(isNewTikTok(null)).toBe(false);
  });

  it("asks for a new read when the count is missing or older than 7 days", () => {
    savePostCount(ME, ACCOUNT, 3, NOW);
    const rec = loadTikTokCare(ME)[ACCOUNT];
    expect(rec).toEqual({ mode: "inbox", posts: 3, checkedAt: NOW.toISOString() });
    expect(postsStale(rec, NOW.getTime() + 6 * 86_400_000)).toBe(false);
    expect(postsStale(rec, NOW.getTime() + 7 * 86_400_000)).toBe(true);
    expect(postsStale(undefined, NOW.getTime())).toBe(true);
    expect(postsStale({ mode: "inbox", posts: 3 }, NOW.getTime())).toBe(true);
  });
});

describe("the posting mode", () => {
  it("sends to the inbox until a mode is saved, then remembers the last one per account", () => {
    expect(modeOf(loadTikTokCare(ME), ACCOUNT)).toBe("inbox");
    saveMode(ME, ACCOUNT, "direct");
    expect(modeOf(loadTikTokCare(ME), ACCOUNT)).toBe("direct");
    expect(modeOf(loadTikTokCare(ME), "65000000000000000000a002")).toBe("inbox");
    expect(fired).toEqual([TIKTOK_CHANGED]);
  });

  it("keeps warmedAt only when set through the warmed path, and a later mode or count keeps it", () => {
    saveMode(ME, ACCOUNT, "direct");
    expect(loadTikTokCare(ME)[ACCOUNT].warmedAt).toBeUndefined();
    markWarmed(ME, ACCOUNT, NOW);
    expect(loadTikTokCare(ME)[ACCOUNT]).toEqual({ mode: "direct", warmedAt: NOW.toISOString() });
    saveMode(ME, ACCOUNT, "inbox");
    savePostCount(ME, ACCOUNT, 12, NOW);
    expect(loadTikTokCare(ME)[ACCOUNT]).toEqual({ mode: "inbox", warmedAt: NOW.toISOString(), posts: 12, checkedAt: NOW.toISOString() });
  });

  it("lives in one synced key per brand, so warmed up holds on another device", () => {
    markWarmed(ME, ACCOUNT, NOW);
    const keys = [...m.keys()].filter((k) => k.startsWith("content-studio-tiktok-"));
    expect(keys).toEqual([`content-studio-tiktok-${ME}`]);
    expect(isSyncedKeyFor(keys[0], ME)).toBe(true);
  });
});

describe("what is stored", () => {
  it("reads bad JSON as empty and drops records it can't trust", () => {
    m.set(`content-studio-tiktok-${ME}`, "{not json");
    expect(loadTikTokCare(ME)).toEqual({});
    m.set(
      `content-studio-tiktok-${ME}`,
      JSON.stringify({ a: { mode: "direct", warmedAt: "yesterday", posts: -1 }, b: { mode: "loud" }, c: "x", d: { mode: "inbox", posts: 3.5, checkedAt: NOW.toISOString() } }),
    );
    expect(loadTikTokCare(ME)).toEqual({ a: { mode: "direct" }, b: { mode: "inbox" }, d: { mode: "inbox", checkedAt: NOW.toISOString() } });
  });

  it("says when this device's storage is full and keeps what was there", () => {
    saveMode(ME, ACCOUNT, "direct");
    vi.stubGlobal("localStorage", { getItem: (k: string) => m.get(k) ?? null, setItem: () => { throw new DOMException("full", "QuotaExceededError"); } });
    expect(saveMode(ME, ACCOUNT, "inbox")).toBe(false);
    expect(modeOf(loadTikTokCare(ME), ACCOUNT)).toBe("direct");
  });
});
