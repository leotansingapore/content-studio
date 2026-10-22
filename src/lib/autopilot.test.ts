// Autopilot's arithmetic and store (plan-autopilot). Every date is passed in; nothing reads the clock.
import { beforeEach, describe, expect, it, vi } from "vitest";

class MemStorage {
  s = new Map<string, string>();
  get length() { return this.s.size; }
  key(i: number) { return [...this.s.keys()][i] ?? null; }
  getItem(k: string) { return this.s.get(k) ?? null; }
  setItem(k: string, v: string) { this.s.set(k, String(v)); }
  removeItem(k: string) { this.s.delete(k); }
}
const local = new MemStorage();
vi.stubGlobal("localStorage", local);
vi.stubGlobal("window", { localStorage: local, dispatchEvent: () => true, addEventListener: () => {}, removeEventListener: () => {} });

const a = await import("./autopilot");
const { EMPTY_POSITIONING } = await import("./positioning");
const { addProfile, setActiveProfile } = await import("./profiles");
import type { DraftEntry } from "./draftHistory";

const UID = "u1";
const POS = {
  ...EMPTY_POSITIONING,
  oneLiner: "I help young parents protect their income.",
  audienceDetail: "parents of kids under 7",
  topics: ["CPF top-ups", "Critical illness"],
  platform: "linkedin" as const,
  cadence: 3,
};
const OPTS = { postingTime: () => "09:00", formats: a.AUTO_FORMATS };
const WEEKLY = { ...a.DEFAULT_SETTINGS, on: true };
// 2026: Thu 22 Oct, Fri 23, Sat 24, Mon 26
const week = (monday = "2026-10-26", o = POS, windowDays = 2) => ({ week: monday, posts: a.layoutWeek(o, OPTS, monday, windowDays) });
const draft = (o: Partial<DraftEntry>): DraftEntry => ({ id: "d", createdAt: "2026-10-01T00:00:00.000Z", hook: "h", draft: "", pillar: "topic", pillarDetail: "", audience: "", format: "text-post", platform: "linkedin", ctaType: "", ...o });

beforeEach(() => local.s.clear());

describe("targetWeek", () => {
  it("lands opening on the write day, the day after or the next Monday on the same week", () => {
    expect(a.targetWeek(WEEKLY, "2026-10-23")).toBe("2026-10-26");
    expect(a.targetWeek(WEEKLY, "2026-10-24")).toBe("2026-10-26");
    expect(a.targetWeek(WEEKLY, "2026-10-26")).toBe("2026-10-26");
  });
  it("gives the week before when the write day has not come yet", () => {
    expect(a.targetWeek(WEEKLY, "2026-10-22")).toBe("2026-10-19");
    expect(a.targetWeek({ writeDay: 0 }, "2026-10-26")).toBe("2026-11-02");
  });
});

describe("reviewBy", () => {
  it("is the day minus the window", () => {
    expect(a.reviewBy("2026-10-28", 1)).toBe("2026-10-27");
    expect(a.reviewBy("2026-10-28", 2)).toBe("2026-10-26");
    expect(a.reviewBy("2026-11-02", 3)).toBe("2026-10-30");
  });
});

describe("layoutWeek", () => {
  it("dates the week's slots in funnel order on the posting days, with ap_ ids and review dates", () => {
    const posts = a.layoutWeek(POS, OPTS, "2026-10-26", 2);
    expect(posts.map((p) => [p.n, p.day, p.time, p.slot.stage, p.draftId, p.reviewBy, p.state])).toEqual([
      [1, "2026-10-26", "09:00", "attraction", "ap_2026-10-26_1", "2026-10-24", "waiting"],
      [2, "2026-10-28", "09:00", "trust", "ap_2026-10-26_2", "2026-10-26", "waiting"],
      [3, "2026-10-30", "09:00", "conversion", "ap_2026-10-26_3", "2026-10-28", "waiting"],
    ]);
  });
  it("uses only the picked formats, and the next week takes other slots", () => {
    const one = a.layoutWeek(POS, { ...OPTS, formats: ["carousel"] }, "2026-10-26", 2);
    expect(one.map((p) => p.slot.format)).toEqual(["carousel", "carousel", "carousel"]);
    const next = a.layoutWeek({ ...POS, cadence: 5 }, OPTS, "2026-11-02", 2).map((p) => p.slot.format + p.slot.pillarDetail);
    expect(next).not.toEqual(a.layoutWeek({ ...POS, cadence: 5 }, OPTS, "2026-10-26", 2).map((p) => p.slot.format + p.slot.pillarDetail));
  });
});

describe("postsToWrite", () => {
  it("writes every slot on the write day, in funnel order", () => {
    expect(a.postsToWrite(week(), [], "2026-10-23", WEEKLY).map((p) => p.slot.stage)).toEqual(["attraction", "trust", "conversion"]);
  });
  it("leaves a day holding a written scheduled post, and writes a day holding only an empty plan placeholder", () => {
    const drafts = [
      draft({ id: "mine", draft: "Written by hand", status: "scheduled", scheduledFor: "2026-10-26T10:00" }),
      draft({ id: "plan_plan-1-1-1", draft: "", status: "scheduled", scheduledFor: "2026-10-28" }),
      draft({ id: "idea", draft: "Words but not scheduled", scheduledFor: undefined }),
    ];
    expect(a.postsToWrite(week(), drafts, "2026-10-23", WEEKLY).map((p) => p.day)).toEqual(["2026-10-28", "2026-10-30"]);
    expect(a.daysPlanned(week(), drafts)).toBe(1);
  });
  it("opened on Monday with a 2-day window, drops the days whose review date passed", () => {
    expect(a.postsToWrite(week(), [], "2026-10-26", WEEKLY).map((p) => p.day)).toEqual(["2026-10-28", "2026-10-30"]);
    const seven = week("2026-10-26", { ...POS, cadence: 7 });
    expect(a.postsToWrite(seven, [], "2026-10-26", WEEKLY).map((p) => p.day)).toEqual(["2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01"]);
  });
  it("never writes a slot the batch already wrote, approved, skipped or missed", () => {
    const b = week();
    const states = ["review", "approved", "skipped"] as const;
    b.posts = b.posts.map((p, i) => ({ ...p, state: states[i] }));
    expect(a.postsToWrite(b, [], "2026-10-23", WEEKLY)).toEqual([]);
    b.posts[0].state = "missed";
    b.posts[1].state = "writing"; // a run cut short by a reload
    expect(a.postsToWrite(b, [], "2026-10-23", WEEKLY).map((p) => p.n)).toEqual([2]);
  });
});

describe("daily mode", () => {
  const DAILY = { ...WEEKLY, when: "daily" as const, windowDays: 2 as const };
  const seven = () => week("2026-10-26", { ...POS, cadence: 7 });
  it("writes the slots dated up to today + window + 1 that can still be approved", () => {
    expect(a.postsToWrite(seven(), [], "2026-10-27", DAILY).map((p) => p.day)).toEqual(["2026-10-29", "2026-10-30"]);
  });
  it("still writes today a slot a missed morning would have written yesterday", () => {
    // Tue 27 would have written Thu 29 and Fri 30; opened only on Wed 28, Fri 30 is still approvable
    expect(a.postsToWrite(seven(), [], "2026-10-28", DAILY).map((p) => p.day)).toEqual(["2026-10-30", "2026-10-31"]);
  });
  it("lays out next week too when the range crosses Sunday", () => {
    expect(a.targetWeeks(DAILY, "2026-10-28")).toEqual(["2026-10-26"]);
    expect(a.targetWeeks(DAILY, "2026-10-30")).toEqual(["2026-10-26", "2026-11-02"]);
    expect(a.targetWeeks(WEEKLY, "2026-10-29")).toEqual(["2026-10-26"]);
    const next = week("2026-11-02", { ...POS, cadence: 7 });
    expect(a.postsToWrite(next, [], "2026-10-30", DAILY).map((p) => p.day)).toEqual(["2026-11-02"]);
  });
});

describe("the writer request", () => {
  it("sends the slot's topic as the angle title, its angle as the line, and no em dash anywhere", () => {
    const posts = a.layoutWeek({ ...POS, topics: ["CPF top-ups — the 2026 rules"] }, OPTS, "2026-10-26", 2);
    const topic = posts.find((p) => p.slot.angle.includes("—"))!;
    expect(topic).toBeTruthy();
    const ask = a.postAsk(topic, 1);
    expect(ask.angle.title).toBe("CPF top-ups: the 2026 rules");
    expect(ask.angle.line).toContain("CPF top-ups: the 2026 rules: ");
    expect(ask).toMatchObject({ n: 1, format: topic.slot.format, stage: topic.slot.stage, ctaType: topic.slot.ctaType, platforms: ["linkedin"] });
    expect(ask.formula).toEqual({ name: expect.any(String), template: expect.any(String) });
    expect(JSON.stringify(posts.map((p, i) => a.postAsk(p, i + 1)))).not.toContain("—");
  });
  it("keeps a long social subject's title at a word inside 40 characters", () => {
    const social = a.layoutWeek(POS, OPTS, "2026-10-26", 2).find((p) => p.slot.pillar === "identity" || p.slot.pillar === "interest")!;
    const t = a.postAsk({ ...social, slot: { ...social.slot, pillarDetail: "a lesson from your first year that you'd tell your younger self" } }, 1).angle.title;
    expect(t).toBe("a lesson from your first year that you'd");
  });
});

describe("the draft a written post becomes", () => {
  const [post] = a.layoutWeek(POS, OPTS, "2026-10-26", 2);
  it("holds the whole post, inside the brand's emoji rule, unscheduled", () => {
    const d = a.draftFor({ ...post, slot: { ...post.slot, format: "text-post" } }, { hook: "Most people skip this \u{1F600}", body: "Body line.", cta: "Ask me \u{1F600}", ctaType: "open-question" }, { emojiPolicy: "none" } as never, new Date("2026-10-23T01:00:00Z"), "lb-1");
    expect(d).toMatchObject({ id: "ap_2026-10-26_1", hook: "Most people skip this", draft: "Most people skip this\n\nBody line.\n\nAsk me", status: "draft", labels: ["lb-1"], createdAt: "2026-10-23T01:00:00.000Z" });
    expect(d.scheduledFor).toBeUndefined();
  });
  it("is the script for a short video", () => {
    const d = a.draftFor({ ...post, slot: { ...post.slot, format: "short-video" } }, { hook: "Hook", script: "HOOK: Hook\nBODY: b\nCTA: c", cta: "c", ctaType: "open-question" }, null, new Date("2026-10-23T01:00:00Z"));
    expect(d.draft).toBe("HOOK: Hook\nBODY: b\nCTA: c");
    expect(d.labels).toBeUndefined();
  });
});

describe("settings", () => {
  it("round-trip per brand", () => {
    expect(a.loadAutopilot(UID).settings).toEqual(a.DEFAULT_SETTINGS);
    expect(a.saveSettings(UID, { ...WEEKLY, writeDay: 2, windowDays: 3, formats: ["carousel"] })).toBeNull();
    const other = addProfile(UID, "Shop");
    setActiveProfile(UID, other.id);
    expect(a.loadAutopilot(UID).settings.on).toBe(false);
    expect(a.saveSettings(UID, { ...WEEKLY, when: "daily" })).toBeNull();
    setActiveProfile(UID, "me");
    expect(a.loadAutopilot(UID).settings).toEqual({ on: true, when: "weekly", writeDay: 2, formats: ["carousel"], windowDays: 3 });
    setActiveProfile(UID, other.id);
    expect(a.loadAutopilot(UID).settings.when).toBe("daily");
  });
  it("always keeps one format on", () => {
    expect(a.toggleFormat(["carousel"], "carousel")).toEqual(["carousel"]);
    expect(a.toggleFormat(["carousel", "text-post"], "carousel")).toEqual(["text-post"]);
    expect(a.toggleFormat(["short-video"], "text-post")).toEqual(["text-post", "short-video"]);
    expect(a.saveSettings(UID, { ...WEEKLY, formats: [] })).toBe(a.FORMAT_LINE);
    expect(a.cleanSettings({ formats: [] }).formats).toEqual(a.AUTO_FORMATS);
  });
  it("reads bad JSON as off with no batches, and keeps the newest 8 batches", () => {
    local.setItem(a.autopilotKey(UID), "{nope");
    expect(a.loadAutopilot(UID)).toEqual({ settings: a.DEFAULT_SETTINGS, batches: [] });
    const batches = Array.from({ length: 10 }, (_, i) => ({ week: `2026-0${(i % 9) + 1}-0${(i % 7) + 1}`, posts: [] }));
    a.saveAutopilot(UID, { settings: WEEKLY, batches });
    const kept = a.loadAutopilot(UID).batches.map((b) => b.week);
    expect(kept).toHaveLength(8);
    expect(kept).toEqual([...kept].sort().reverse());
  });
});

describe("dates on the card", () => {
  it("read as the app writes them", () => {
    expect(a.dayText("2026-10-24")).toBe("Sat 24 Oct");
    expect(a.weekText("2026-10-26")).toBe("26 OCT TO 1 NOV");
    expect(a.nextReset(new Date("2026-10-23T03:00:00Z"))).toBe("2026-10-24T00:00:00.000Z");
    expect(a.nextReset(new Date("2026-10-23T20:00:00Z"))).toBe("2026-10-24T00:00:00.000Z");
  });
});
