import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabase: { functions: { invoke: vi.fn() } } }));

import { supabase } from "@/lib/supabase";
import { HOOK_FORMULAS } from "@/lib/hookFormulas";
import { rememberClone, type CloneResponse, type SavedClone } from "@/lib/reelClone";
import type { RemixSource } from "@/lib/remixSource";
import {
  MAX_TEARDOWNS,
  ensureTeardown,
  loadTeardown,
  localTeardown,
  saveTeardown,
  teardownError,
  teardownFooter,
  teardownFromClone,
  type Teardown,
} from "@/lib/remixTeardown";

const invoke = supabase.functions.invoke as unknown as ReturnType<typeof vi.fn>;

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  vi.stubGlobal("window", { localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) } });
});
afterEach(() => {
  vi.unstubAllGlobals();
  invoke.mockReset();
});

const NOW = new Date("2026-10-20T00:00:00.000Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();
// Made now by default, so a stored teardown never ages out of these tests.
const teardown = (key: string, at = new Date().toISOString()): Teardown => ({
  v: 1,
  key,
  format: "carousel",
  hook: { line: "5 signs your plan is stale", pattern: "[N] signs your [thing] is [problem]", formula: "list" },
  beats: ["a", "b", "c"],
  payoff: "p",
  cta: "None",
  pacing: null,
  whyItWorked: "w",
  dontReuse: ["$12,000"],
  basedOn: "caption",
  at,
});

const cloneResult = (over: Partial<CloneResponse["source"]> = {}): CloneResponse => ({
  source: {
    platform: "instagram",
    postId: "C8xYz12AbCd",
    url: "https://www.instagram.com/reel/C8xYz12AbCd/",
    author: "sam",
    caption: "Stop paying this fee",
    transcript: "Most people pay this fee without knowing.",
    isVideo: true,
    postedAt: null,
    durationSec: 35,
    metrics: null,
    metricsAsOf: null,
    ...over,
  },
  breakdown: { hook: "Most people pay this fee.", beats: ["Names the fee", "Shows the cost", "Gives the fix"], payoff: "A way out", cta: "", whyItWorked: "It names a cost." },
  myVersion: { hook: "h", script: "s", caption: "c", cta: "c", filmingNotes: "f" },
  cached: false,
  usage: null,
});
const clone = (over: Partial<SavedClone> = {}): SavedClone => ({ id: "instagram:C8xYz12AbCd", savedAt: "2026-10-18T00:00:00.000Z", result: cloneResult(), ...over });

const topReel: RemixSource = { key: "top:adv-C8xYz12AbCd", kind: "top-post", format: "video", platform: "instagram", url: "https://www.instagram.com/reel/C8xYz12AbCd/", author: "@sam", remixedAt: "" };
const topCarousel: RemixSource = { key: "top:adv-XYZ", kind: "top-post", format: "carousel", platform: "instagram", url: "https://www.instagram.com/p/XYZabc12/", remixedAt: "" };

describe("teardownFromClone", () => {
  it("maps a stored clone with no pattern, nothing to avoid and pacing from the measured cuts", () => {
    const t = teardownFromClone(clone({ visuals: { measured: { durationSec: 34.6, cuts: 16, avgShotSec: 2.14, cutsFirst3s: 2 } } as SavedClone["visuals"] }));
    expect(t).toEqual({
      v: 1,
      key: "clone:instagram:C8xYz12AbCd",
      format: "video",
      hook: { line: "Most people pay this fee.", pattern: "", formula: null },
      beats: ["Names the fee", "Shows the cost", "Gives the fix"],
      payoff: "A way out",
      cta: "None",
      pacing: "35 s, cuts every 2.1 s",
      whyItWorked: "It names a cost.",
      dontReuse: [],
      basedOn: "transcript",
      at: "2026-10-18T00:00:00.000Z",
    });
  });

  it("says caption when the clone had no transcript, and counts beats without visuals", () => {
    const t = teardownFromClone(clone({ result: cloneResult({ transcript: null, isVideo: false }) }));
    expect(t.basedOn).toBe("caption");
    expect(t.format).toBe("image");
    expect(t.pacing).toBe("35 s, 3 beats");
  });
});

describe("the store", () => {
  it("drops the oldest when a 41st arrives", () => {
    for (let i = 0; i < MAX_TEARDOWNS; i++) saveTeardown("u1", teardown(`k${i}`, daysAgo(20 - i * 0.1)));
    expect(loadTeardown("u1", "k0", NOW)).not.toBeNull();
    saveTeardown("u1", teardown("k40", NOW.toISOString()));
    expect(loadTeardown("u1", "k0", NOW)).toBeNull();
    expect(loadTeardown("u1", "k1", NOW)).not.toBeNull();
    expect(loadTeardown("u1", "k40", NOW)).not.toBeNull();
    expect(Object.keys(JSON.parse([...store.values()][0]))).toHaveLength(MAX_TEARDOWNS);
  });

  it("treats one older than 30 days as missing", () => {
    saveTeardown("u1", teardown("old", daysAgo(31)));
    saveTeardown("u1", teardown("recent", daysAgo(29)));
    expect(loadTeardown("u1", "old", NOW)).toBeNull();
    expect(loadTeardown("u1", "recent", NOW)?.key).toBe("recent");
  });

  it("keeps one made without reading its video for 10 minutes only", () => {
    const minsAgo = (n: number) => new Date(NOW.getTime() - n * 60_000).toISOString();
    saveTeardown("u1", { ...teardown("slow", minsAgo(11)), format: "video", unread: true });
    saveTeardown("u1", { ...teardown("fresh", minsAgo(5)), format: "video", unread: true });
    expect(loadTeardown("u1", "slow", NOW)).toBeNull();
    expect(loadTeardown("u1", "fresh", NOW)?.unread).toBe(true);
  });

  it("keeps each brand's own and skips rows that aren't teardowns", () => {
    saveTeardown("u1", teardown("k"));
    expect(loadTeardown("u2", "k", NOW)).toBeNull();
    store.set("content-studio-remix-teardowns-u1", JSON.stringify({ k: { v: 2 }, j: teardown("other") }));
    expect(loadTeardown("u1", "k", NOW)).toBeNull();
    expect(loadTeardown("u1", "j", NOW)).toBeNull();
  });
});

describe("ensureTeardown", () => {
  it("uses the stored teardown with no call", async () => {
    saveTeardown("u1", teardown(topCarousel.key));
    expect((await ensureTeardown("u1", topCarousel, "text")).key).toBe(topCarousel.key);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("turns a reel already cloned into its teardown with no call, and keeps it", async () => {
    rememberClone("u1", clone());
    expect(localTeardown("u1", topReel)?.hook.line).toBe("Most people pay this fee.");
    const t = await ensureTeardown("u1", topReel, "text");
    expect(t.key).toBe(topReel.key);
    expect(invoke).not.toHaveBeenCalled();
    expect(loadTeardown("u1", topReel.key, new Date("2026-10-19T00:00:00.000Z"))?.beats).toHaveLength(3);
  });

  it("calls remix once for two callers, sends every formula and the text, and saves the answer", async () => {
    invoke.mockResolvedValue({ data: { teardown: teardown(topCarousel.key) }, error: null });
    const [a, b] = await Promise.all([ensureTeardown("u1", topCarousel, "5 signs"), ensureTeardown("u1", topCarousel, "5 signs")]);
    expect(a).toEqual(b);
    expect(invoke).toHaveBeenCalledTimes(1);
    const body = invoke.mock.calls[0][1].body;
    expect(invoke.mock.calls[0][0]).toBe("remix");
    expect(body.mode).toBe("teardown");
    expect(body.source).toMatchObject({ key: topCarousel.key, kind: "top-post", format: "carousel", text: "5 signs" });
    expect(body.formulas).toHaveLength(HOOK_FORMULAS.length);
    expect(loadTeardown("u1", topCarousel.key)).not.toBeNull();
  });

  it("saves nothing on a refusal and calls again on the next try", async () => {
    invoke.mockResolvedValueOnce({ data: null, error: { context: { status: 429, json: async () => ({ code: "daily_limit", error: "used up" }) } } });
    const e = await ensureTeardown("u1", topCarousel, "x").catch((err) => err);
    expect(teardownError(e)).toEqual({ text: "No breakdowns left today. Remix still works from the caption.", retry: false });
    expect(loadTeardown("u1", topCarousel.key)).toBeNull();
    invoke.mockResolvedValueOnce({ data: { teardown: { v: 1 } }, error: null });
    const bad = await ensureTeardown("u1", topCarousel, "x").catch((err) => err);
    expect(teardownError(bad)).toEqual({ text: "Couldn't break this one down. Remix still works from the caption.", retry: true });
    expect(invoke).toHaveBeenCalledTimes(2);
  });
});

describe("teardownFooter", () => {
  it("says what the breakdown came from", () => {
    expect(teardownFooter({ basedOn: "caption", format: "carousel" })).toBe("Based on the caption only.");
    expect(teardownFooter({ basedOn: "caption", format: "video" })).toBe("This video has no captions we can read, so this is from the caption.");
    expect(teardownFooter({ basedOn: "caption", format: "video", unread: true })).toBe("Based on the caption only.");
    expect(teardownFooter({ basedOn: "ad", format: "video" })).toBe("Based on the ad's copy.");
    expect(teardownFooter({ basedOn: "transcript", format: "video" })).toBeNull();
    expect(teardownFooter({ basedOn: "kit", format: "text" })).toBeNull();
  });
});
