import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/edgeFn", () => ({ callFn: vi.fn() }));

import advisorsData from "@/data/advisors.json";
import type { AdvisorEntry } from "@/components/AdvisorProfiles";
import { BRAND_KEY_PREFIX } from "@/lib/carousel";
import { analyzeCreator } from "@/lib/creatorAnalysis";
import { callFn } from "@/lib/edgeFn";
import { EMPTY_POSITIONING, type Positioning } from "@/lib/positioning";
import {
  CAP_LINE,
  FOLLOW_ONLY,
  fitHash,
  fitInput,
  fitRun,
  followButton,
  loadFit,
  runFit,
  saveFit,
  showsInsights,
  similarCreators,
  sortByAudience,
  sortByFit,
  usedMost,
} from "@/lib/creatorFit";

const ENTRIES = advisorsData as AdvisorEntry[];
const byId = (id: string) => ENTRIES.find((e) => e.id === id)!;
const entry = (id: string, audience: string[] = [], niche = ["cpf"], handle = `@${id}`) => ({ id, audience, niche, handle });

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  const ls = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
  vi.stubGlobal("localStorage", ls);
  vi.stubGlobal("window", { localStorage: ls });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.mocked(callFn).mockReset();
});

describe("Best for you", () => {
  it("orders by fit, keeps data order on a tie and puts unscored creators last", () => {
    const list = [entry("a"), entry("b"), entry("c"), entry("d")];
    expect(sortByFit(list, { a: 0.2, b: 0.9, c: 0.9 }).map((e) => e.id)).toEqual(["b", "c", "a", "d"]);
  });

  it("falls back to creators who share the Plan's audience first, in data order", () => {
    const list = [entry("a", ["parent"]), entry("b", ["young-adult"]), entry("c", ["parent", "young-adult"]), entry("d")];
    expect(sortByAudience(list, "young-adult").map((e) => e.id)).toEqual(["b", "c", "a", "d"]);
    expect(sortByAudience(list, "general").map((e) => e.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("reuses a fit for 7 days and drops it when the brand's audience or topics change", () => {
    const now = Date.parse("2026-10-20T00:00:00Z");
    const input = { serves: "Young families", sells: "Plans", topics: ["CPF"] };
    saveFit("u1", fitHash(input), { a: 0.7 }, now);
    expect(loadFit("u1", fitHash(input), now + 6 * 86_400_000)).toEqual({ a: 0.7 });
    expect(loadFit("u1", fitHash(input), now + 7 * 86_400_000)).toBeNull();
    expect(loadFit("u1", fitHash({ ...input, topics: ["CPF", "Retirement"] }), now)).toBeNull();
    expect(loadFit("u1", fitHash({ ...input, serves: "Retirees" }), now)).toBeNull();
    expect(store.has("cs-creator-fit-u1")).toBe(true);
  });

  it("names the brand's own audience and offer, from the Plan, the brand kit or Your market", () => {
    const plan: Positioning = { ...EMPTY_POSITIONING, oneLiner: "I help reps hit their numbers.", audience: "working-adult", audienceDetail: "", topics: [" Prospecting ", ""] };
    store.set(`${BRAND_KEY_PREFIX}u1`, JSON.stringify({ offers: [{ name: "ActivityTracker", url: "https://activity-tracker.io" }] }));
    const got = fitInput("u1", plan);
    expect(got.sells).toBe("ActivityTracker. I help reps hit their numbers.");
    expect(got.serves).toBe("working adult");
    expect(got.topics).toEqual(["Prospecting"]);
    expect(fitInput("u1", { ...plan, audienceDetail: "Self-employed sales coaches" }).serves).toBe("Self-employed sales coaches");
    store.set("content-studio-market-u1", JSON.stringify({ audience: "Sales teams in SG" }));
    expect(fitInput("u1", { ...plan, audience: "general" }).serves).toBe("Sales teams in SG");
  });

  it("asks remix once, keeps the answer, and says when the cap is spent", async () => {
    const input = { serves: "Young families", sells: "", topics: [] };
    vi.mocked(callFn).mockResolvedValueOnce({ fit: { [ENTRIES[0].id]: 0.8 } });
    await runFit("u1", input, ENTRIES);
    const sent = vi.mocked(callFn).mock.calls[0][1] as { mode: string; creators: unknown[] };
    expect(sent.mode).toBe("creator-fit");
    expect(sent.creators).toHaveLength(ENTRIES.length);
    expect(fitRun(fitHash(input))).toMatchObject({ state: "done" });
    expect(loadFit("u1", fitHash(input))).toEqual({ [ENTRIES[0].id]: 0.8 });

    const capped = { ...input, serves: "Retirees" };
    vi.mocked(callFn).mockRejectedValueOnce(Object.assign(new Error("You've used all 5 for today."), { code: "daily_limit" }));
    await runFit("u1", capped, ENTRIES);
    expect(fitRun(fitHash(capped))).toMatchObject({ state: "capped", fit: null });

    const down = { ...input, serves: "Parents" };
    vi.mocked(callFn).mockResolvedValueOnce({ fit: null });
    await runFit("u1", down, ENTRIES);
    expect(fitRun(fitHash(down))).toMatchObject({ state: "done", fit: null });
    expect(loadFit("u1", fitHash(down))).toBeNull();

    const nobody = { ...input, serves: "" };
    await runFit("u1", nobody, ENTRIES);
    expect(fitRun(fitHash(nobody))).toMatchObject({ state: "done", fit: null });
    expect(callFn).toHaveBeenCalledTimes(3);
  });
});

describe("Follow on a creator", () => {
  it("shows nothing to anyone but Leo", () => {
    expect(followButton("instagram", { leo: false, where: "card" })).toBeNull();
    expect(followButton("instagram", { leo: false, where: "page" })).toBeNull();
  });

  it("puts Follow on an Instagram or TikTok card and none on a YouTube or LinkedIn card", () => {
    expect(followButton("instagram", { leo: true, where: "card" })).toEqual({ label: "Follow", disabled: false, reason: null });
    expect(followButton("tiktok", { leo: true, where: "card" })?.label).toBe("Follow");
    expect(followButton("youtube", { leo: true, where: "card" })).toBeNull();
    expect(followButton("linkedin", { leo: true, where: "card" })).toBeNull();
  });

  it("disables Follow with its reason on a LinkedIn creator's page", () => {
    expect(followButton("linkedin", { leo: true, where: "page" })).toEqual({ label: "Follow", disabled: true, reason: FOLLOW_ONLY });
  });

  it("reads Following once followed, with the cap line or the check's own failure under it", () => {
    expect(followButton("instagram", { leo: true, where: "page", followed: true })).toEqual({ label: "Following", disabled: false, reason: null });
    expect(followButton("instagram", { leo: true, where: "page", followed: true, capped: true, failure: "You've used all 10" })?.reason).toBe(CAP_LINE);
    expect(followButton("tiktok", { leo: true, where: "card", followed: true, failure: "@x is private" })?.reason).toBe("@x is private");
  });
});

describe("a creator's page", () => {
  it("shows What works for them to Leo for a creator with top posts, the empty line without, nothing to others", () => {
    const withPosts = analyzeCreator(byId("the-woke-salaryman-instagram"));
    expect(withPosts?.posts.length).toBeGreaterThan(0);
    expect(showsInsights(true, withPosts)).toBe("insights");
    expect(showsInsights(true, null)).toBe("empty");
    expect(showsInsights(false, withPosts)).toBeNull();
  });

  it("counts the angles and builds their read posts use, in plain ASCII", () => {
    const a = analyzeCreator(byId("the-woke-salaryman-instagram"))!;
    const { angles, structures } = usedMost(a);
    expect(structures.length).toBeGreaterThan(0);
    expect(structures.reduce((n, [, c]) => n + c, 0)).toBeLessThanOrEqual(a.posts.length);
    for (const [label] of [...angles, ...structures]) expect(label).toMatch(/^[\x20-\x7e]+$/);
  });

  it("lists up to 4 others from the first niche's group, never the same person, by fit when cached", () => {
    const list = [entry("me", [], ["cpf"], "@me"), entry("me-yt", [], ["retirement"], "@me"), entry("a", [], ["srs"]), entry("b", [], ["etfs"]), entry("c", [], ["insurance", "fire"]), entry("c-yt", [], ["cpf"], "@c"), entry("d", [], ["cpf"]), entry("e", [], ["cpf"]), entry("f", [], ["cpf"])];
    const plain = similarCreators(list[0], list, null);
    expect(plain?.group).toBe("CPF and retirement");
    expect(plain?.list.map((e) => e.id)).toEqual(["a", "c", "d", "e"]);
    expect(similarCreators(list[0], list, { f: 0.9, e: 0.8 })?.list.map((e) => e.id)).toEqual(["f", "e", "a", "c"]);
    expect(similarCreators(entry("x", [], ["not-a-niche"]), list, null)).toBeNull();
  });
});
