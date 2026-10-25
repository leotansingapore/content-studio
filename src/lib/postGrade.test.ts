import { beforeEach, describe, expect, it, vi } from "vitest";
import { EdgeError } from "@/lib/edgeFn";
import type { TrackedPost } from "@/lib/analytics";

const callFn = vi.fn();
vi.mock("@/lib/edgeFn", async (orig) => ({ ...(await orig<typeof import("@/lib/edgeFn")>()), callFn: (...a: unknown[]) => callFn(...a) }));

const { bandOf, bestSlotLabel, BAND_LABEL, fixLine, gradeContext, gradePost, loadGrades, offeredReasons, reasonFor, saveGrade, tryVersionUrl } = await import("./postGrade");

const UID = "6d80f027-3395-480c-86a1-8827d3d6cce3";
const DAY = 86_400_000;
const NOW = Date.parse("2026-10-25T04:00:00Z");
const ago = (days: number) => new Date(NOW - days * DAY).toISOString();

const p = (id: string, engaged: number, days: number, extra: Partial<TrackedPost> = {}): TrackedPost =>
  ({ id, hook: `Hook ${id}`, draft: `Hook ${id}\nBody of ${id}.`, pillar: "topic", pillarDetail: "CPF top-ups", audience: "", platform: "linkedin", format: "text-post",
     ctaType: "", createdAt: ago(days + 1), status: "posted", postedAt: ago(days), metrics: { reactions: engaged }, impressions: 0, engagementTotal: engaged,
     engagementRate: 0, ...extra }) as TrackedPost;

class MemStorage {
  m = new Map<string, string>();
  get length() { return this.m.size; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
}

beforeEach(() => {
  (globalThis as { window?: unknown }).window = { localStorage: new MemStorage(), dispatchEvent: () => true };
  callFn.mockReset();
});

// five LinkedIn posts 3 to 60 days old: median 140
const usualFive = () => [p("a", 100, 3), p("b", 120, 10), p("c", 140, 20), p("d", 160, 40), p("e", 180, 60)];

describe("the grade, measured", () => {
  it("is against the median of the same network's other posts in 90 days, at least 48 hours old", () => {
    const post = p("x", 280, 5);
    const noise = [p("young", 1000, 1), p("old", 1000, 91), p("ig", 1000, 5, { platform: "instagram" })];
    expect(gradePost(post, [post, ...usualFive(), ...noise], NOW)).toEqual({ kind: "graded", ratio: 2, band: "well-above", engagements: 280, usual: 140, of: 5, impressions: null });
  });

  it("needs 5 posts to compare and a usual above 0", () => {
    const post = p("x", 50, 5);
    expect(gradePost(post, [post, ...usualFive().slice(0, 4)], NOW)).toEqual({ kind: "few", have: 4 });
    const zeros = usualFive().map((q) => ({ ...q, engagementTotal: 0 }));
    expect(gradePost(post, [post, ...zeros], NOW)).toEqual({ kind: "few", have: 5 });
  });

  it("waits 48 hours on a new post", () => {
    const post = p("x", 50, 1);
    expect(gradePost(post, [post, ...usualFive()], NOW)).toEqual({ kind: "young", ready: new Date(NOW - DAY + 2 * DAY).toISOString() });
  });

  it("adds the impressions ratio when this post and 5 others have impressions", () => {
    const withImp = usualFive().map((q, i) => ({ ...q, impressions: 1000 + i * 100 }));
    const post = p("x", 140, 5, { impressions: 3600 });
    expect(gradePost(post, [post, ...withImp], NOW)).toMatchObject({ band: "about", impressions: 3 });
    expect(gradePost(post, [post, ...withImp.slice(0, 4), usualFive()[4]], NOW)).toMatchObject({ impressions: null });
  });

  it("puts each lower edge in the higher band, from the unrounded ratio", () => {
    expect([2, 1.25, 0.8, 0.5, 0.4999].map(bandOf)).toEqual(["well-above", "above", "about", "below", "well-below"]);
    expect(bandOf(1.999)).toBe("above");
    expect(bandOf(1.249)).toBe("about");
    expect(BAND_LABEL[bandOf(1.249)]).toBe("About your usual");
  });
});

describe("the reason's fix line", () => {
  const ctx = { network: "LinkedIn", bestFirstLine: "I lost $40k on one policy.", format: "carousel", bestFormat: "text-post", weekday: "Tue", time: "8:30 AM", bestSlot: "Tue morning" };

  it("fills every placeholder for every reason and direction", () => {
    for (const reason of ["hook", "topic", "format", "timing", "ask"] as const)
      for (const direction of ["above", "below"] as const) {
        const line = fixLine(reason, direction, ctx);
        expect(line, `${reason} ${direction}`).toBeTruthy();
        expect(line).not.toMatch(/[{}]/);
      }
    expect(fixLine("hook", "below", ctx)).toBe('The first line didn\'t stop people. Your best LinkedIn post opened with: "I lost $40k on one policy.".');
    expect(fixLine("format", "above", ctx)).toBe("Carousels suit you on LinkedIn. Make the next one a carousel too.");
    expect(fixLine("format", "below", ctx)).toBe("Carousels do less well for you on LinkedIn. Your best posts there are text posts.");
    expect(fixLine("timing", "above", ctx)).toBe("It went out at a good time: Tue, 8:30 AM.");
    expect(fixLine("timing", "above", { ...ctx, time: undefined })).toBe("It went out at a good time: Tue.");
    expect(fixLine("timing", "below", ctx)).toBe("It went out at a quiet time. Your best LinkedIn posts went out on Tue morning.");
  });

  it("gives no line rather than one with a hole in it", () => {
    expect(fixLine("hook", "below", { ...ctx, bestFirstLine: undefined })).toBeNull();
    expect(fixLine("timing", "below", { ...ctx, bestSlot: undefined })).toBeNull();
    expect(fixLine("format", "below", { ...ctx, bestFormat: undefined })).toBeNull();
  });
});

describe("the reasons Jev is offered", () => {
  const timed = (q: TrackedPost, at: string) => ({ ...q, impressions: 500, scheduledFor: at });

  it("keeps all five when each line can be filled", () => {
    const posts = [
      timed(p("x", 400, 5, { format: "carousel" }), "2026-10-20T08:30"),
      timed(p("a", 100, 6), "2026-10-13T08:00"),
      timed(p("b", 120, 7), "2026-10-20T09:00"),
      p("c", 300, 8, { draft: "\n\nBest opener here\nmore" }),
    ];
    expect(offeredReasons(posts[0], posts, "below")).toEqual(["hook", "topic", "format", "timing", "ask"]);
    expect(gradeContext(posts[0], posts)).toMatchObject({ network: "LinkedIn", bestFirstLine: "Best opener here", bestFormat: "text-post", weekday: "Tue", time: "8:30 AM", bestSlot: "Tue morning" });
  });

  it("drops timing with no best slot, format with one format, and hook below with no best first line", () => {
    const posts = [p("x", 50, 5), p("a", 0, 6, { draft: "  " })];
    expect(offeredReasons(posts[0], posts, "below")).toEqual(["topic", "ask"]);
    expect(offeredReasons(posts[0], posts, "above")).toEqual(["hook", "topic", "ask"]);
  });
});

describe("the best slot", () => {
  it("names the day and part of day, as Analytics' Best so far line does", () => {
    const at = (id: string, when: string, eng: number) => ({ ...p(id, eng, 5), impressions: 1000, scheduledFor: when });
    const timed = [at("a", "2026-10-20T08:30", 90), at("b", "2026-10-13T09:00", 80), at("c", "2026-10-21T20:00", 10), at("d", "2026-10-14T21:00", 10)];
    expect(bestSlotLabel(timed)).toBe("Tue morning");
    const days = timed.map((q) => ({ ...q, scheduledFor: q.scheduledFor!.slice(0, 10), postedAt: q.scheduledFor!.slice(0, 10) }));
    expect(bestSlotLabel(days)).toBe("Tue");
    expect(bestSlotLabel(timed.slice(0, 1))).toBeNull();
  });
});

describe("Try a new version", () => {
  const long = p("x", 40, 5, { draft: `Hook x\n${"A long line about CPF. ".repeat(80)}`, hookFormula: "contrarian" });
  const ctx = { network: "LinkedIn", bestFirstLine: "Best opener", bestFormula: "number-reveal", format: "text-post", bestFormat: "carousel" };
  const params = (url: string) => new URLSearchParams(url.split("?")[1]);

  it("opens Write on the post's topic with the fix, the MAS line and the original, under 1,800 characters", () => {
    const url = tryVersionUrl(long, 0.4, "topic", ctx)!;
    expect(url.startsWith("/generate?")).toBe(true);
    expect(url.length).toBeLessThan(1800);
    const q = params(url);
    expect(q.get("source")).toBe("own:x");
    expect(q.get("pillar")).toBe("topic");
    expect(q.get("detail")).toBe("CPF top-ups");
    expect(q.get("platform")).toBe("linkedin");
    expect(q.get("format")).toBe("text-post");
    expect(q.get("formula")).toBeNull();
    expect(q.get("ctx")).toContain("This post of mine got 0.4x my usual engagement on LinkedIn. The likely reason: the topic.");
    expect(q.get("ctx")).toContain("no promised returns, no named insurer products, no invented numbers");
    expect(q.get("ctx")).toContain(`Original: "${long.draft.slice(0, 300)}"`);
  });

  it("carries the best post's formula for a hook reason, and the best format for a format reason", () => {
    expect(params(tryVersionUrl(long, 0.4, "hook", ctx)!).get("formula")).toBe("number-reveal");
    expect(params(tryVersionUrl(long, 0.4, "hook", ctx)!).get("format")).toBe("text-post");
    expect(params(tryVersionUrl(long, 0.4, "format", ctx)!).get("format")).toBe("carousel");
    expect(params(tryVersionUrl(long, 0.4, "format", ctx)!).get("formula")).toBeNull();
  });
});

describe("the cached reason", () => {
  const posts = [p("x", 400, 5), ...usualFive()];
  const graded = (r: number) => ({ kind: "graded" as const, ratio: r, band: bandOf(r), engagements: 0, usual: 1, of: 5, impressions: null });

  it("makes no Jev call at about your usual", async () => {
    expect(await reasonFor(UID, posts[0], graded(1), posts, NOW)).toEqual({ state: "none", reason: null });
    expect(callFn).not.toHaveBeenCalled();
  });

  it("asks once per band, and again only when the band changes", async () => {
    callFn.mockResolvedValue({ reason: "hook", p: 0.7 });
    expect(await reasonFor(UID, posts[0], graded(2.4), posts, NOW)).toEqual({ state: "found", reason: "hook" });
    expect(await reasonFor(UID, posts[0], graded(2.2), posts, NOW)).toEqual({ state: "found", reason: "hook" });
    expect(callFn).toHaveBeenCalledTimes(1);
    expect(callFn.mock.calls[0][0]).toBe("writing-judge");
    expect(callFn.mock.calls[0][1]).toMatchObject({ mode: "grade", platform: "linkedin", format: "text-post", ratio: 2.4, direction: "above", reasons: ["hook", "topic", "ask"] });
    expect(callFn.mock.calls[0][1].best).toHaveLength(3);
    callFn.mockResolvedValue({ reason: null, p: 0.3 });
    expect(await reasonFor(UID, posts[0], graded(1.5), posts, NOW)).toEqual({ state: "none", reason: null });
    expect(loadGrades(UID).x).toEqual({ band: "above", reason: null, p: 0.3, at: new Date(NOW).toISOString() });
  });

  it("stores nothing for a Jev null or a capped day, and remembers a post that isn't in English", async () => {
    callFn.mockResolvedValue({ reason: null, p: null });
    expect(await reasonFor(UID, posts[0], graded(0.4), posts, NOW)).toEqual({ state: "none", reason: null });
    callFn.mockRejectedValue(new EdgeError("Reasons are used up.", 429, "daily_limit"));
    expect(await reasonFor(UID, posts[0], graded(0.4), posts, NOW)).toEqual({ state: "capped", reason: null, message: "Reasons are used up." });
    expect(loadGrades(UID)).toEqual({});
    callFn.mockRejectedValue(new EdgeError("This check reads English posts only.", 422, "not_english"));
    expect(await reasonFor(UID, posts[0], graded(0.4), posts, NOW)).toEqual({ state: "not-english", reason: null });
    expect(await reasonFor(UID, posts[0], graded(0.4), posts, NOW)).toEqual({ state: "not-english", reason: null });
    expect(callFn).toHaveBeenCalledTimes(3);
  });

  it("keeps the newest 200", () => {
    for (let i = 0; i < 205; i++) saveGrade(UID, `d${i}`, { band: "above", reason: "hook", p: 0.5, at: new Date(NOW + i * 1000).toISOString() });
    const kept = Object.keys(loadGrades(UID));
    expect(kept).toHaveLength(200);
    expect(kept).not.toContain("d4");
    expect(kept).toContain("d204");
  });
});
