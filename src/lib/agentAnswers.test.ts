import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fn = vi.hoisted(() => ({ calls: [] as string[], answers: [] as unknown[] }));
vi.mock("@/lib/edgeFn", async () => {
  class EdgeError extends Error {
    constructor(message: string, public status: number, public code = "") {
      super(message);
    }
  }
  return {
    EdgeError,
    // each call answers from `answers` in turn: a value, or an Error to throw
    callFn: async (name: string) => {
      fn.calls.push(name);
      const a = fn.answers.shift();
      if (a instanceof Error) throw a;
      return a;
    },
  };
});

import { anglesAnswer, answerOf, bestAnswer, seedWizard, suggestAngles, trendingAnswer, BUSY_LINE } from "@/lib/agentAnswers";
import { loadWork, startSuggest } from "@/lib/angleSuggest";
import { newMsg, newThread, loadThreads } from "@/lib/agentThreads";
import { saveAudience } from "@/lib/audiences";
import { saveDrafts, type DraftEntry } from "@/lib/draftHistory";
import { FORMAT_TRENDS } from "@/lib/formatTrends";

const UID = "6d80f027-3395-480c-86a1-8827d3d6cce3";
const store = new Map<string, string>();
const session = new Map<string, string>();
const mem = (m: Map<string, string>) => ({
  get length() {
    return m.size;
  },
  key: (i: number) => [...m.keys()][i] ?? null,
  getItem: (k: string) => m.get(k) ?? null,
  setItem: (k: string, v: string) => void m.set(k, v),
  removeItem: (k: string) => void m.delete(k),
});
const post = (extra: Partial<DraftEntry>): DraftEntry => ({ id: "a", createdAt: "2026-10-01T00:00:00.000Z", hook: "Hook", draft: "Body", pillar: "topic", pillarDetail: "", audience: "general", format: "text-post", platform: "linkedin", ctaType: "dm-keyword", ...extra });

beforeEach(() => {
  store.clear();
  session.clear();
  fn.calls.length = 0;
  fn.answers.length = 0;
  vi.stubGlobal("localStorage", mem(store));
  vi.stubGlobal("sessionStorage", mem(session));
  vi.stubGlobal("window", { localStorage: mem(store), sessionStorage: mem(session), dispatchEvent: () => true, addEventListener: () => {}, removeEventListener: () => {} });
});
afterEach(() => vi.unstubAllGlobals());

describe("answerOf", () => {
  it("reads a starter only when it is sent unchanged, and the slash with anything after it", () => {
    expect(answerOf("What is trending in my niche?")).toBe("trending");
    expect(answerOf("  Which post did best?  ")).toBe("best");
    expect(answerOf("Find new angles")).toBe("angles");
    expect(answerOf("/trending")).toBe("trending");
    expect(answerOf("/BEST this month")).toBe("best");
    expect(answerOf("/angles")).toBe("angles");
    // typed variants are Jev's to read
    for (const t of ["what's trending for me", "my best post", "Which post did best? On LinkedIn", "/bestest", "/check"]) expect(answerOf(t), t).toBeNull();
  });
});

describe("trending", () => {
  it("tops up with the template drop when the brand has no niche posts, and says how to get them", () => {
    const a = trendingAnswer(UID);
    if (a.kind !== "trending") throw new Error("kind");
    expect(a.niche).toBe(false);
    expect(a.rows).toHaveLength(Math.min(5, FORMAT_TRENDS.items.length));
    const t = FORMAT_TRENDS.items[0];
    expect(a.rows[0]).toMatchObject({ title: t.hook, who: `@${t.author}`, cover: t.cover });
    expect(a.rows[0].why).toMatch(/views, TikTok$/);
    // Remix opens the template's own format page with it attached
    expect(a.rows[0].remix).toMatch(/^\/make\//);
  });
});

describe("best post", () => {
  it("picks the posted post with the most engagement, real numbers first, with when it went out", () => {
    saveDrafts(UID, [
      post({ id: "low", hook: "Low", status: "posted", postedAt: "2026-10-03T00:00:00.000Z", metrics: { impressions: 5000, reactions: 10 } }),
      post({ id: "top", hook: "Top post", platform: "instagram", status: "posted", postedAt: "2026-10-05T00:00:00.000Z", metrics: { impressions: 900, reactions: 40, comments: 6, shares: 2 } }),
      // a draft with numbers never counts
      post({ id: "draft", hook: "Draft", metrics: { reactions: 999 } }),
    ]);
    expect(bestAnswer(UID)).toEqual({ kind: "best", posted: true, post: { id: "top", title: "Top post", platform: "instagram", at: "2026-10-05T00:00:00.000Z", numbers: "900 impressions, 40 reactions, 6 comments, 2 shares" } });
  });

  it("says what to do when nothing is posted, or nothing posted has numbers", () => {
    expect(bestAnswer(UID)).toEqual({ kind: "best", post: null, posted: false });
    saveDrafts(UID, [post({ status: "posted", postedAt: "2026-10-03T00:00:00.000Z" })]);
    expect(bestAnswer(UID)).toEqual({ kind: "best", post: null, posted: true });
  });
});

describe("angles", () => {
  const ask = () => {
    saveAudience(UID, { name: "Office admins", who: "Admins who order lunch for the team", cares: ["lunch"] });
    const a = anglesAnswer(UID);
    const t = newThread(UID, [newMsg("user", { text: "Find new angles" }), newMsg("agent", { answer: a })]);
    if (t.ok === false) throw new Error(t.error);
    return { a, thread: t.item.id, msg: t.item.messages[1].id };
  };
  const answerIn = (thread: string, msg: string) => loadThreads(UID).find((t) => t.id === thread)!.messages.find((m) => m.id === msg)!.answer;

  it("has no audience until the brand has one, and spends nothing until the press", () => {
    expect(anglesAnswer(UID)).toEqual({ kind: "angles", audience: null });
    const { a } = ask();
    expect(a).toMatchObject({ kind: "angles", audience: { name: "Office admins" } });
    expect(fn.calls).toEqual([]);
  });

  it("the press writes the wizard's angles into the message and into that audience's wizard rows", async () => {
    const { a, thread, msg } = ask();
    const audience = a.kind === "angles" ? a.audience! : null;
    fn.answers.push({ angles: [1, 2, 3, 4, 5].map((n) => ({ title: `Angle ${n}`, line: `Line ${n}` })) });
    await suggestAngles(UID, thread, msg);
    expect(fn.calls).toEqual(["idea-dump"]);
    expect(answerIn(thread, msg)).toMatchObject({ angles: [1, 2, 3, 4, 5].map((n) => ({ title: `Angle ${n}`, line: `Line ${n}` })) });
    expect(loadWork(UID, audience!.id)?.map((r) => r.title)).toEqual(["Angle 1", "Angle 2", "Angle 3", "Angle 4", "Angle 5"]);
    // Plan a campaign with these on another tab: the rows come back, ticked, without doubling here
    seedWizard(UID, audience!.id, [{ title: "Angle 1", line: "Line 1" }]);
    expect(loadWork(UID, audience!.id)).toHaveLength(5);
    session.clear();
    vi.resetModules();
    const fresh = await import("@/lib/angleSuggest");
    const again = await import("@/lib/agentAnswers");
    again.seedWizard(UID, audience!.id, [{ title: "Angle 1", line: "Line 1" }, { title: "Angle 2", line: "Line 2" }]);
    expect(fresh.loadWork(UID, audience!.id)?.map((r) => [r.title, r.picked])).toEqual([["Angle 1", true], ["Angle 2", true]]);
  });

  it("a refused call says why in the chat's words, and a job already running is not doubled", async () => {
    const { thread, msg } = ask();
    const { EdgeError } = await import("@/lib/edgeFn");
    fn.answers.push(new (EdgeError as unknown as new (m: string, s: number) => Error)("capped", 429));
    await suggestAngles(UID, thread, msg);
    expect(answerIn(thread, msg)).toMatchObject({ error: "You've used all 10 angle suggestions for today. It resets at 8am Singapore time." });
    const other = { id: "au-x", name: "Other", who: "", cares: [], says: "" };
    fn.answers.push(new Promise(() => {}));
    void startSuggest(UID, other);
    await suggestAngles(UID, thread, msg);
    expect(answerIn(thread, msg)).toMatchObject({ error: BUSY_LINE });
  });
});
