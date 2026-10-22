import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DraftEntry } from "@/lib/draftHistory";

const callFn = vi.fn();
vi.mock("@/lib/edgeFn", async (orig) => ({ ...(await orig<typeof import("@/lib/edgeFn")>()), callFn: (...a: unknown[]) => callFn(...a) }));

const { EdgeError } = await import("@/lib/edgeFn");
const { getDraftById, loadDrafts, MAX_DRAFTS, saveDrafts } = await import("@/lib/draftHistory");
const { loadCarousels, saveCarousel } = await import("@/lib/carousel");
const { textKey } = await import("@/lib/postScore");
const { isStale, sourceOf } = await import("@/lib/translate");
const job = await import("./translateJob");

const UID = "6d80f027-3395-480c-86a1-8827d3d6cce3";
class MemStorage {
  private m = new Map<string, string>();
  get length() { return this.m.size; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
}

const ENGLISH = "Most people pay twice for a hospital stay.\n\nThe co-pay was $3,000.\nComment PLAN.";
const post = (extra: Partial<DraftEntry> = {}): DraftEntry => ({
  id: "en-1", createdAt: "2026-10-20T03:00:00.000Z", hook: "Most people pay twice", draft: ENGLISH, pillar: "topic", pillarDetail: "Hospital co-pays",
  audience: "general", format: "text-post", platform: "linkedin", ctaType: "comment-keyword", status: "scheduled", scheduledFor: "2026-10-30",
  labels: ["l1"], attached: ["cimg-a"], disclosure: ["ad"], metrics: { impressions: 9 } as DraftEntry["metrics"], ...extra,
});
const reply = (lines: string[], same: number | null = 0.9) => ({ lines: lines.map((l) => (l ? `ZH ${l}` : "")), back: lines.map((l) => (l ? `EN ${l}` : "")), same });
const answer = () => callFn.mockImplementation(async (_n: string, body: { lines: string[] }) => reply(body.lines));
// a call that answers only when told, so a test can look while it runs
const held = () => {
  let release!: () => void;
  callFn.mockImplementation((_n: string, body: { lines: string[] }) => new Promise((ok) => (release = () => ok(reply(body.lines)))));
  return () => release();
};

beforeEach(() => {
  (globalThis as { window?: unknown }).window = { localStorage: new MemStorage(), history: { state: null, replaceState: vi.fn() } };
  callFn.mockReset();
  saveDrafts(UID, [post()]);
});

describe("translateDraft", () => {
  it("saves the version with its link, the brief, labels and attachments, as a draft", async () => {
    answer();
    const done = await job.translateDraft(UID, "en-1", "zh");
    expect(done).toMatchObject({ state: "done", kind: "post", sourceId: "en-1", lang: "zh", text: ENGLISH });
    expect(callFn).toHaveBeenCalledWith("video-assist", { mode: "translate", kind: "post", back: true, lang: "zh", lines: ENGLISH.split("\n") }, expect.any(String));
    const v = getDraftById(UID, done!.versionId!)!;
    expect(v.draft).toBe("ZH Most people pay twice for a hospital stay.\n\nZH The co-pay was $3,000.\nZH Comment PLAN.");
    expect(v.hook).toBe("ZH Most people pay twice for a hospital stay.");
    expect(v).toMatchObject({ lang: "zh", back: ["EN Most people pay twice for a hospital stay.", "", "EN The co-pay was $3,000.", "EN Comment PLAN."], sameP: 0.9 });
    expect(v).toMatchObject({ platform: "linkedin", format: "text-post", pillarDetail: "Hospital co-pays", labels: ["l1"], attached: ["cimg-a"], disclosure: ["ad"], status: "draft" });
    expect(v.scheduledFor).toBeUndefined();
    expect(v.metrics).toBeUndefined();
    expect(sourceOf(v)).toEqual({ id: "en-1", key: textKey("linkedin", ENGLISH), at: expect.any(String) });
    expect(isStale(v, getDraftById(UID, "en-1"))).toBe(false);
    expect(loadDrafts(UID).map((d) => d.id)).toEqual([v.id, "en-1"]);
    expect(job.versionsOf(loadDrafts(UID), "en-1").map((d) => d.id)).toEqual([v.id]);
  });

  it("runs one job per source: a second tap while it runs makes no second call", async () => {
    const release = held();
    const first = job.translateDraft(UID, "en-1", "zh");
    const second = await job.translateDraft(UID, "en-1", "ms");
    expect(second).toMatchObject({ state: "running", lang: "zh" });
    expect(job.translateJob("en-1")).toMatchObject({ state: "running" });
    expect(callFn).toHaveBeenCalledTimes(1);
    release();
    expect(await first).toMatchObject({ state: "done", lang: "zh" });
    expect(loadDrafts(UID)).toHaveLength(2);
  });

  it("saves nothing when the call is refused, and keeps the server's line", async () => {
    for (const [e, line] of [
      [new EdgeError("This isn't switched on for your account yet.", 403, "not_enabled"), "This isn't switched on for your account yet."],
      [new EdgeError(job.INCOMPLETE, 422, "incomplete"), job.INCOMPLETE],
      [new EdgeError("Couldn't translate it right now. Try again in a minute.", 502, "failed"), job.FAILED],
    ] as const) {
      callFn.mockRejectedValueOnce(e);
      expect(await job.translateDraft(UID, "en-1", "ta")).toMatchObject({ state: "failed", error: line });
      expect(loadDrafts(UID).map((d) => d.id)).toEqual(["en-1"]);
    }
  });

  it("tells subscribers, and forgets a finished job once shown", async () => {
    answer();
    const seen = vi.fn();
    const off = job.onTranslateJobs(seen);
    const done = (await job.translateDraft(UID, "en-1", "zh"))!;
    expect(seen).toHaveBeenCalledTimes(2); // running, done
    job.ackJob(done);
    expect(job.translateJob("en-1")).toBeNull();
    off();
  });

  it("never translates a version, or an empty post", async () => {
    saveDrafts(UID, [post({ id: "v", lang: "zh" }), post({ id: "blank", draft: "  " })]);
    expect(await job.translateDraft(UID, "v", "ms")).toBeNull();
    expect(await job.translateDraft(UID, "blank", "ms")).toBeNull();
    expect(callFn).not.toHaveBeenCalled();
  });

  it("says when one more post would drop the oldest", () => {
    expect(job.draftsFull(UID)).toBe(false);
    saveDrafts(UID, Array.from({ length: MAX_DRAFTS }, (_, i) => post({ id: `p${i}` })));
    expect(job.draftsFull(UID)).toBe(true);
  });
});

describe("translateAgain", () => {
  it("makes the stale version's words again from the English as it is now, sets Jev's answer afresh, and Undo puts it back", async () => {
    answer();
    const v = getDraftById(UID, (await job.translateDraft(UID, "en-1", "zh"))!.versionId!)!;
    const edited = `${ENGLISH}\nNew line.`;
    saveDrafts(UID, loadDrafts(UID).map((d) => (d.id === "en-1" ? { ...d, draft: edited } : d)));
    expect(isStale(v, getDraftById(UID, "en-1"))).toBe(true);
    callFn.mockImplementationOnce(async (_n: string, body: { lines: string[] }) => reply(body.lines, null));
    const again = (await job.translateAgain(UID, v.id))!;
    expect(again).toMatchObject({ state: "done", kind: "again", sourceId: "en-1", versionId: v.id, text: edited });
    const now = getDraftById(UID, v.id)!;
    expect(now.draft.endsWith("ZH New line.")).toBe(true);
    expect(now.sameP).toBeNull();
    expect(isStale(now, getDraftById(UID, "en-1"))).toBe(false);
    expect(again.before).toEqual(v);
    job.undoAgain(UID, again);
    expect(getDraftById(UID, v.id)).toEqual(v);
  });

  it("never brings back a version deleted while it ran", async () => {
    answer();
    const v = (await job.translateDraft(UID, "en-1", "zh"))!.versionId!;
    const release = held();
    const again = job.translateAgain(UID, v);
    saveDrafts(UID, loadDrafts(UID).filter((d) => d.id !== v));
    release();
    expect(await again).toMatchObject({ state: "done" });
    expect(getDraftById(UID, v)).toBeNull();
  });
});

describe("translateCarousel", () => {
  const slides = [
    { id: "s1", title: "Pay twice?", body: "Most people do.\nHere is why.", image: "cimg-lq3k9z01" },
    { id: "s2", title: "The fix", body: "Check the co-pay." },
  ];
  const carousel = { id: "p:abc", title: "Hospital", platform: "instagram" as const, slides, draftId: "en-1", font: "modern" as const };

  it("saves a v: carousel with its language, its link and the slides' words swapped, pictures kept", async () => {
    saveCarousel(UID, carousel);
    answer();
    const done = (await job.translateCarousel(UID, carousel, "ms"))!;
    expect(callFn.mock.calls[0][1]).toEqual({ mode: "translate", kind: "post", back: true, lang: "ms", lines: ["Pay twice?", "Most people do.", "Here is why.", "The fix", "Check the co-pay."] });
    expect(done.versionId).toMatch(/^v:/);
    const v = loadCarousels(UID).find((c) => c.id === done.versionId)!;
    expect(v).toMatchObject({ title: "Hospital (Malay)", lang: "ms", translationOf: { id: "p:abc", at: expect.any(String) }, font: "modern", platform: "instagram" });
    expect(v.draftId).toBeUndefined();
    expect(v.slides).toEqual([
      { id: "s1", title: "ZH Pay twice?", body: "ZH Most people do.\nZH Here is why.", image: "cimg-lq3k9z01" },
      { id: "s2", title: "ZH The fix", body: "ZH Check the co-pay." },
    ]);
    expect(job.carouselMeaning(UID, v.id)).toEqual({ back: ["EN Pay twice?", "EN Most people do.", "EN Here is why.", "EN The fix", "EN Check the co-pay."], same: 0.9 });
    expect(loadCarousels(UID).find((c) => c.id === "p:abc")).toMatchObject({ draftId: "en-1" });
  });

  it("saves nothing when a line is missing from the answer", async () => {
    callFn.mockResolvedValueOnce({ lines: ["a"], back: ["a"], same: null });
    expect(await job.translateCarousel(UID, carousel, "zh")).toMatchObject({ state: "failed", error: job.INCOMPLETE });
    expect(loadCarousels(UID)).toEqual([]);
  });
});

describe("takeNavTranslate", () => {
  it("reads My posts' request once and clears it, so a reload never spends again", () => {
    const history = { state: { usr: { translate: { id: "en-1", lang: "ta" } }, key: "k" }, replaceState: vi.fn() };
    (window as unknown as { history: unknown }).history = history;
    expect(job.takeNavTranslate()).toEqual({ id: "en-1", lang: "ta" });
    expect(history.replaceState).toHaveBeenCalledWith({ usr: null, key: "k" }, "");
    history.state = { usr: { translate: { id: "en-1", lang: "fr" } }, key: "k" };
    expect(job.takeNavTranslate()).toBeNull();
  });
});
