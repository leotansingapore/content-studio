// How the score did (edit-score part 4): the card's first frame for each state, drawn on the server, and the
// "Score my last 30 posts" job with post-score faked.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DraftEntry } from "@/lib/draftHistory";

const as = vi.hoisted(() => {
  const store = new Map<string, string>();
  const ls = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
  };
  (globalThis as { localStorage?: unknown }).localStorage = ls;
  (globalThis as { window?: unknown }).window = { localStorage: ls, dispatchEvent: () => true, addEventListener: () => undefined, removeEventListener: () => undefined };
  return { user: null as null | undefined | { id: string; email: string }, left: null as number | null, busy: [] as boolean[], store };
});
const callFn = vi.fn();
vi.mock("@/lib/useLeoOnly", async (actual) => ({ ...(await actual<typeof import("@/lib/useLeoOnly")>()), useLeoUser: () => as.user, useLeoOnly: () => Boolean(as.user) }));
vi.mock("@/lib/supabase", () => ({
  SUPABASE_URL: "https://abc.supabase.co",
  supabase: { auth: { getUser: () => new Promise(() => undefined), getSession: () => new Promise(() => undefined), onAuthStateChange: () => ({}) } },
}));
vi.mock("@/lib/edgeFn", async (orig) => ({ ...(await orig<typeof import("@/lib/edgeFn")>()), callFn: (...a: unknown[]) => callFn(...a) }));
vi.mock("@/lib/aiUsage", async (actual) => ({
  ...(await actual<typeof import("@/lib/aiUsage")>()),
  useUsesLeft: (busy: boolean) => {
    as.busy.push(busy);
    return () => as.left;
  },
}));

import ScoreCheck, { cancelScoring, onScoreJob, scoreJob, scoreLast30, toScore } from "./ScoreCheck";
import { EdgeError } from "@/lib/edgeFn";
import { loadDrafts, saveDrafts } from "@/lib/draftHistory";
import { currentScore, textKey } from "@/lib/postScore";

const UID = "6d80f027-3395-480c-86a1-8827d3d6cce3";
const LEO = { id: UID, email: "leo@example.com" };
const DAY = 86_400_000;
const NOW = Date.parse("2026-10-25T04:00:00Z");
const ago = (days: number) => new Date(NOW - days * DAY).toISOString();

let seq = 0;
const body = (n: number) => `Three CPF moves to make before 55, number ${n}.\nMost people wait too long. Here is the first one.`;
const d = (reactions: number, days: number, extra: Partial<DraftEntry> = {}): DraftEntry => {
  const n = seq++;
  return { id: `d${n}`, createdAt: ago(days + 1), hook: "Hook", draft: body(n), pillar: "topic", pillarDetail: "", audience: "", format: "text-post",
    platform: "linkedin", ctaType: "", status: "posted", postedAt: ago(days), metrics: { reactions, impressions: 1000 }, ...extra } as DraftEntry;
};
const scored = (x: DraftEntry, v: number): DraftEntry => ({ ...x, score: { v, down: [], key: textKey(x.platform, x.draft), at: ago(1) } });
const many = (n: number, f: (i: number) => DraftEntry) => Array.from({ length: n }, (_, i) => f(i));

const html = (drafts: DraftEntry[]) =>
  renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: ["/analytics"] }, createElement(ScoreCheck, { userId: UID, drafts })));
const text = (out: string) => out.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");

beforeEach(() => {
  as.user = LEO;
  as.left = 40;
  as.busy = [];
  callFn.mockReset();
});
afterEach(() => as.store.clear());

describe("How the score did for everyone else", () => {
  it("draws nothing and never reads the uses left", () => {
    as.user = null;
    expect(html(many(3, (i) => d(10, 3 + i)))).toBe("");
    as.user = undefined;
    expect(html(many(3, (i) => d(10, 3 + i)))).toBe("");
    // useUsesLeft reads cs_ai_usage only when not busy
    expect(as.busy).toEqual([true, true]);
  });
});

describe("How the score did for Leo", () => {
  it("gives the ratio of the higher-scored half to the lower half once 10 posts have a score", () => {
    // five scored 8 with 40 engagements on 1,000 views, five scored 4 with 20
    const drafts = [...many(5, (i) => scored(d(40, 3 + i), 8)), ...many(5, (i) => scored(d(20, 9 + i), 4)), d(10, 20)];
    const raw = html(drafts);
    const out = text(raw);
    expect(raw).toContain('id="score-check"');
    expect(out).toContain("How the score did");
    expect(out).toContain("Of your 10 posted posts with numbers, the higher-scored half got 2x the engagement of the lower half.");
    expect(out).not.toContain("Score my last 30 posts");
    expect(as.busy).toEqual([true]);
  });

  it("asks for 10 and offers to score the posts that have numbers, with its uses", () => {
    const drafts = [...many(3, (i) => scored(d(40, 3 + i), 8)), ...many(12, (i) => d(20, 9 + i))];
    const out = text(html(drafts));
    expect(out).toContain("Needs 10 posted posts with numbers.");
    expect(out).toContain("Score my last 30 posts");
    expect(out).toContain("12 uses, 28 left after this");
    expect(as.busy).toEqual([false]);
  });

  it("disables the button with the reset line when no uses are left, and drops it when nothing is left to score", () => {
    as.left = 0;
    const out = html(many(4, (i) => d(20, 3 + i)));
    expect(out).toMatch(/<button[^>]*disabled=""[^>]*>Score my last 30 posts/);
    expect(text(out)).toContain("Back at 8am Singapore time.");
    as.left = 40;
    const none = text(html(many(4, (i) => scored(d(20, 3 + i), 6))));
    expect(none).toContain("Needs 10 posted posts with numbers.");
    expect(none).not.toContain("Score my last 30 posts");
  });
});

describe("which posts get scored", () => {
  it("takes posted posts with views and no current score, newest first, at most 30, never a translation or a too-short one", () => {
    const newest = d(10, 1);
    const drafts = [
      ...many(32, (i) => d(10, 3 + i)),
      newest,
      d(10, 2, { status: "draft" }),
      d(10, 2, { metrics: { reactions: 10 } }),
      d(10, 2, { lang: "ms" }),
      d(10, 2, { draft: "Too short to score." }),
      scored(d(10, 2), 7),
    ];
    const picked = toScore(drafts);
    expect(picked).toHaveLength(30);
    expect(picked[0]).toBe(newest);
    expect(picked.map((x) => x.id)).toEqual([newest, ...drafts.slice(0, 29)].map((x) => x.id));
  });

  it("scores again a post whose text changed after it was scored", () => {
    const x = scored(d(10, 2), 7);
    expect(toScore([{ ...x, draft: `${x.draft} Edited.` }])).toHaveLength(1);
  });
});

describe("Score my last 30 posts", () => {
  it("scores each post as its own format, saves the score on the draft in place, and counts up", async () => {
    const drafts = [d(10, 2), d(10, 3, { format: "carousel", platform: "instagram" }), d(10, 4, { format: "short-video", platform: "tiktok" }), d(10, 5, { status: "draft" })];
    saveDrafts(UID, drafts);
    callFn.mockResolvedValue({ score: 7.2, down: ["cta"] });
    const seen: string[] = [];
    const off = onScoreJob(() => seen.push(`${scoreJob(UID).done}/${scoreJob(UID).total}`));
    await scoreLast30(UID);
    off();
    expect(callFn.mock.calls.map(([name, b]) => [name, b.platform, b.format])).toEqual([
      ["post-score", "linkedin", "text-post"],
      ["post-score", "instagram", "carousel"],
      ["post-score", "tiktok", "short-video"],
    ]);
    expect(callFn.mock.calls[0][1].text).toBe(drafts[0].draft);
    const after = loadDrafts(UID);
    expect(after.map((x) => x.id)).toEqual(drafts.map((x) => x.id));
    expect(after.slice(0, 3).map((x) => currentScore(x)?.v)).toEqual([7.2, 7.2, 7.2]);
    expect(currentScore(after[0])?.down).toEqual(["cta"]);
    expect(after[3].score).toBeUndefined();
    expect(seen).toEqual(["0/3", "1/3", "2/3", "3/3", "3/3"]);
    expect(scoreJob(UID)).toMatchObject({ running: false, error: null });
    // nothing is left to score: a second press makes no call
    await scoreLast30(UID);
    expect(callFn).toHaveBeenCalledTimes(3);
  });

  it("skips a post the score can't read and stops on the cap with its own line", async () => {
    saveDrafts(UID, many(4, (i) => d(10, 2 + i)));
    callFn
      .mockRejectedValueOnce(new EdgeError("The score reads English posts only.", 422, "not_english"))
      .mockResolvedValueOnce({ score: 6, down: [] })
      .mockRejectedValueOnce(new EdgeError("You've used all 40 for today. It resets at 8am Singapore time.", 429, "daily_limit"));
    await scoreLast30(UID);
    expect(callFn).toHaveBeenCalledTimes(3);
    expect(loadDrafts(UID).map((x) => currentScore(x)?.v ?? null)).toEqual([null, 6, null, null]);
    expect(scoreJob(UID)).toMatchObject({ running: false, error: "You've used all 40 for today. It resets at 8am Singapore time." });
    const out = text(html(loadDrafts(UID)));
    expect(out).toContain("You've used all 40 for today. It resets at 8am Singapore time.");
  });

  it("keeps the score in flight on Cancel, then stops; a draft edited meanwhile keeps no stale score", async () => {
    const drafts = many(3, (i) => d(10, 2 + i));
    saveDrafts(UID, drafts);
    let release: (v: unknown) => void = () => undefined;
    callFn.mockImplementationOnce(() => new Promise((r) => (release = r)));
    const run = scoreLast30(UID);
    expect(scoreJob(UID)).toMatchObject({ running: true, done: 0, total: 3 });
    expect(text(html(loadDrafts(UID)))).toMatch(/Scoring 1 of 3 Cancel/);
    // a second press while it runs starts nothing
    await scoreLast30(UID);
    cancelScoring(UID);
    expect(scoreJob(UID).stopping).toBe(true);
    expect(html(loadDrafts(UID))).toMatch(/<button[^>]*disabled=""[^>]*>Cancel/);
    // the first draft is edited while Jev reads it
    saveDrafts(UID, loadDrafts(UID).map((x, i) => (i === 0 ? { ...x, draft: `${x.draft} Edited.` } : x)));
    release({ score: 9, down: [] });
    await run;
    expect(callFn).toHaveBeenCalledTimes(1);
    expect(loadDrafts(UID).every((x) => !x.score)).toBe(true);
    expect(scoreJob(UID)).toMatchObject({ running: false, stopping: false, done: 1 });
  });
});
