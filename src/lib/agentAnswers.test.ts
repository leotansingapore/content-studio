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

import {
  addAngles, anglesAnswer, answerOf, bestAnswer, fullLine, groupsOf, pickedLine, roomFor, seedWizard, suggestAngles, trendingAnswer, BUSY_LINE, type Answer,
} from "@/lib/agentAnswers";
import { MAX_PER_AUDIENCE, anglesFor, confirmAngles } from "@/lib/angles";
import { loadWork, startSuggest, stepRows } from "@/lib/angleSuggest";
import { newMsg, newThread, loadThreads } from "@/lib/agentThreads";
import { loadAudiences, saveAudience } from "@/lib/audiences";
import { saveBrand } from "@/lib/carousel";
import { saveDrafts, type DraftEntry } from "@/lib/draftHistory";
import { FORMAT_TRENDS } from "@/lib/formatTrends";
import { formatItemId, formatTrendsFor, hideItem } from "@/lib/nicheFeed";

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
  it("puts the template drop under its own heading, never in the niche list, and says how to get niche posts", () => {
    const a = trendingAnswer(UID);
    if (a.kind !== "trending") throw new Error("kind");
    expect(a.niche).toBe(false);
    expect(a.rows).toEqual([]);
    expect(a.formats).toHaveLength(Math.min(3, FORMAT_TRENDS.items.length));
    const t = FORMAT_TRENDS.items[0];
    expect(a.formats![0]).toMatchObject({ id: `ft:${t.id}`, title: t.hook, who: `@${t.author}`, cover: t.cover });
    expect(a.formats![0].why).toMatch(/views, TikTok$/);
    // Remix opens the template's own format page with it attached
    expect(a.formats![0].remix).toMatch(/^\/make\//);
  });

  it("shows a brand that isn't an adviser's no personal finance format", () => {
    const finance = FORMAT_TRENDS.items.filter((t) => (t.finance ?? 1) >= 0.5).map((t) => `ft:${t.id}`);
    // the bundled drop has some, or this proves nothing
    expect(finance.length).toBeGreaterThan(0);
    saveBrand(UID, { color: "#1E3A8A", name: "Tok Tok Kueh", handle: "", profession: "kueh shop" });
    const a = trendingAnswer(UID);
    if (a.kind !== "trending") throw new Error("kind");
    expect(a.formats!.length).toBeGreaterThan(0);
    for (const r of a.formats!) expect(finance).not.toContain(r.id);
  });

  it("a hidden item never comes back, in the answer or in Studio's row", () => {
    const a = trendingAnswer(UID);
    if (a.kind !== "trending") throw new Error("kind");
    const gone = a.formats![0];
    hideItem(UID, gone.id!);
    const b = trendingAnswer(UID);
    if (b.kind !== "trending") throw new Error("kind");
    expect(b.formats!.map((r) => r.id)).not.toContain(gone.id);
    expect(formatTrendsFor(UID).map((t) => formatItemId(t.id))).not.toContain(gone.id);
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
  const audience = (name: string, saved = 0) => {
    const r = saveAudience(UID, { name, who: `${name} who order lunch`, cares: ["lunch"] });
    if (r.ok === false) throw new Error(r.error);
    const id = loadAudiences(UID).find((x) => x.name === name)!.id;
    if (saved) confirmAngles(UID, id, Array.from({ length: saved }, (_, k) => ({ title: `${name} saved ${k}`, line: "", origin: "suggested" as const })));
    return id;
  };
  const ask = () => {
    const a = anglesAnswer(UID);
    const t = newThread(UID, [newMsg("user", { text: "Find new angles" }), newMsg("agent", { answer: a })]);
    if (t.ok === false) throw new Error(t.error);
    return { a, thread: t.item.id, msg: t.item.messages[1].id };
  };
  const answerIn = (thread: string, msg: string) => loadThreads(UID).find((t) => t.id === thread)!.messages.find((m) => m.id === msg)!.answer as Extract<Answer, { kind: "angles" }>;
  const five = (p: string) => ({ angles: [1, 2, 3, 4, 5].map((n) => ({ title: `${p} ${n}`, line: `Line ${n}` })) });

  it("has no audience until the brand has one, and spends nothing until the press", () => {
    expect(anglesAnswer(UID)).toEqual({ kind: "angles", groups: [], full: [] });
    audience("Office admins");
    const { a } = ask();
    expect(a).toMatchObject({ kind: "angles", groups: [{ name: "Office admins", saved: 0 }] });
    expect(fn.calls).toEqual([]);
  });

  it("picks the 2 audiences with the fewest saved angles and says why in one line", () => {
    audience("First-time parents", 4);
    audience("Office admins and HR");
    audience("Retirees", 1);
    const a = anglesAnswer(UID);
    if (a.kind !== "angles") throw new Error("kind");
    expect(a.groups!.map((g) => [g.name, g.saved])).toEqual([["Office admins and HR", 0], ["Retirees", 1]]);
    expect(pickedLine(a.groups!)).toBe("Office admins and HR has none yet. Retirees has 1.");
  });

  it("skips an audience at its most and says so", () => {
    audience("Retirees", MAX_PER_AUDIENCE);
    audience("Office admins");
    const a = anglesAnswer(UID);
    if (a.kind !== "angles") throw new Error("kind");
    expect(a.groups!.map((g) => g.name)).toEqual(["Office admins"]);
    expect(a.full).toEqual(["Retirees"]);
    expect(fullLine("Retirees", 0)).toBe(`Retirees already has ${MAX_PER_AUDIENCE} angles, the most it keeps.`);
  });

  it("one press suggests for each audience, writing each one's angles into the message", async () => {
    audience("Office admins");
    audience("Retirees");
    const { thread, msg } = ask();
    fn.answers.push(five("First"), five("Second"));
    await suggestAngles(UID, thread, msg);
    expect(fn.calls).toEqual(["idea-dump", "idea-dump"]);
    const groups = answerIn(thread, msg).groups!;
    // a tie keeps the audiences' own order
    expect(groups.map((g) => g.name)).toEqual(loadAudiences(UID).map((x) => x.name));
    expect(groups.map((g) => g.angles?.map((x) => x.title))).toEqual([1, 2].map((k) => [1, 2, 3, 4, 5].map((n) => `${k === 1 ? "First" : "Second"} ${n}`)));
    // nothing saved until Add
    expect(anglesFor(UID, loadAudiences(UID)[0].id)).toEqual([]);
  });

  it("Add saves the ticked angles to that audience, says how many, and Plan ticks them in the wizard once", async () => {
    const id = audience("Office admins");
    const { thread, msg } = ask();
    fn.answers.push(five("Admins"));
    await suggestAngles(UID, thread, msg);
    const got = answerIn(thread, msg).groups![0].angles!;
    expect(loadWork(UID, id)).toHaveLength(5);
    expect(addAngles(UID, thread, msg, id, got.slice(0, 3))).toBeNull();
    expect(anglesFor(UID, id).map((x) => x.title).sort()).toEqual(["Admins 1", "Admins 2", "Admins 3"]);
    const g = answerIn(thread, msg).groups![0];
    expect(g.added!.map((x) => x.title)).toEqual(["Admins 1", "Admins 2", "Admins 3"]);
    expect(g.added!.every((x) => x.id)).toBe(true);
    // the wizard's rows for them go: they are saved now
    expect(loadWork(UID, id)).toBeNull();
    seedWizard(UID, id, g.added!);
    const rows = stepRows(anglesFor(UID, id), loadWork(UID, id));
    expect(rows.map((r) => [r.title, r.picked])).toEqual(expect.arrayContaining([["Admins 1", true], ["Admins 2", true], ["Admins 3", true]]));
    expect(rows).toHaveLength(3);
  });

  it("Add refuses what would take an audience past its most, saving nothing", async () => {
    const id = audience("Office admins", MAX_PER_AUDIENCE - 2);
    const { thread, msg } = ask();
    fn.answers.push(five("Admins"));
    await suggestAngles(UID, thread, msg);
    const got = answerIn(thread, msg).groups![0].angles!;
    expect(roomFor(UID, id)).toBe(2);
    expect(addAngles(UID, thread, msg, id, got)).toBe(fullLine("Office admins", 2));
    expect(anglesFor(UID, id)).toHaveLength(MAX_PER_AUDIENCE - 2);
    expect(answerIn(thread, msg).groups![0]).toMatchObject({ error: fullLine("Office admins", 2) });
    expect(addAngles(UID, thread, msg, id, got.slice(0, 2))).toBeNull();
    expect(anglesFor(UID, id)).toHaveLength(MAX_PER_AUDIENCE);
  });

  it("an answer from before 14 Nov still plans with its angles, as new rows ticked, without doubling", async () => {
    const id = audience("Office admins");
    seedWizard(UID, id, [{ title: "Angle 1", line: "Line 1" }]);
    seedWizard(UID, id, [{ title: "Angle 1", line: "Line 1" }, { title: "Angle 2", line: "Line 2" }]);
    expect(loadWork(UID, id)?.map((r) => [r.title, r.picked])).toEqual([["Angle 2", true], ["Angle 1", true]]);
    expect(groupsOf({ kind: "angles", audience: { id, name: "Office admins" }, angles: [{ title: "A", line: "" }] })).toEqual([{ id, name: "Office admins", saved: -1, angles: [{ title: "A", line: "" }] }]);
  });

  it("a refused call says why in the chat's words, and a job already running is not doubled", async () => {
    audience("Office admins");
    const { thread, msg } = ask();
    const { EdgeError } = await import("@/lib/edgeFn");
    fn.answers.push(new (EdgeError as unknown as new (m: string, s: number) => Error)("capped", 429));
    await suggestAngles(UID, thread, msg);
    expect(answerIn(thread, msg).groups![0]).toMatchObject({ error: "You've used all 10 angle suggestions for today. It resets at 8am Singapore time." });
    const other = { id: "au-x", name: "Other", who: "", cares: [], says: "" };
    fn.answers.push(new Promise(() => {}));
    void startSuggest(UID, other);
    await suggestAngles(UID, thread, msg);
    expect(answerIn(thread, msg)).toMatchObject({ error: BUSY_LINE });
  });
});
