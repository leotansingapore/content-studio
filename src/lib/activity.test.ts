import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ACTIVITY_CHANGED,
  ACTIVITY_VIEWS,
  AI_USE_LABELS,
  MAX_EVENTS,
  absorbActivityInbox,
  activityMonths,
  aiUseRows,
  cleanEvent,
  deviceTag,
  groupByWhen,
  inView,
  loadActivity,
  logActivity,
  planRows,
  recentActivity,
  setActivityOn,
  whenWords,
  type ActivityEvent,
} from "@/lib/activity";
import { DAILY_LIMITS } from "../../supabase/functions/_shared/usageCaps.ts";

const UID = "6d80f027-3395-480c-86a1-8827d3d6cce3";
const store = new Map<string, string>();
const fired: string[] = [];
let full = false;
/** Local time, so the month rows and the words hold in any time zone. */
const local = (month: number, day: number, h = 10, min = 0) => new Date(2026, month - 1, day, h, min);
const rowOf = (key: string) => JSON.parse(store.get(key) ?? "[]") as ActivityEvent[];
const ev = (id: string, at: Date, o: Partial<ActivityEvent> = {}): ActivityEvent => ({ id, at: at.toISOString(), who: "you", kind: "post", title: `Event ${id}`, ...o });

beforeEach(() => {
  store.clear();
  fired.length = 0;
  full = false;
  setActivityOn(false);
  const localStorage = {
    get length() {
      return store.size;
    },
    key: (i: number) => [...store.keys()][i] ?? null,
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (full) throw new DOMException("full", "QuotaExceededError");
      store.set(k, v);
    },
    removeItem: (k: string) => void store.delete(k),
  };
  vi.stubGlobal("localStorage", localStorage);
  vi.stubGlobal("window", { localStorage, dispatchEvent: (e: Event) => fired.push(e.type) });
  store.set("cs-device-tag", "dev001");
});

describe("Corrections", () => {
  it("holds correction events only, and a correction is a kind the log keeps", () => {
    const fix = cleanEvent({ id: "fxk1", at: "2026-10-27T03:00:00.000Z", who: "agent", kind: "correction", title: '"A picture" wasn\'t made' });
    expect(fix).not.toBeNull();
    expect(inView(fix!, "corrections")).toBe(true);
    expect(inView({ ...fix!, kind: "make" }, "corrections")).toBe(false);
    expect(ACTIVITY_VIEWS.map((v) => v.id)).toContain("corrections");
  });
});

describe("recentActivity", () => {
  it("gives the newest events of the two latest months, newest first", () => {
    store.set(`content-studio-activity-2026-08-dev001-${UID}`, JSON.stringify([ev("old", local(8, 30))]));
    store.set(`content-studio-activity-2026-09-dev001-${UID}`, JSON.stringify([ev("s2", local(9, 20)), ev("s1", local(9, 2))]));
    store.set(`content-studio-activity-2026-10-dev002-${UID}`, JSON.stringify([ev("o2", local(10, 5)), ev("o1", local(10, 1))]));
    expect(recentActivity(UID, 3).map((e) => e.id)).toEqual(["o2", "o1", "s2"]);
    expect(recentActivity(UID, 10).map((e) => e.id)).toEqual(["o2", "o1", "s2", "s1"]);
  });
});

describe("logActivity", () => {
  const move = { who: "agent" as const, kind: "post" as const, title: 'Moved "3 CPF myths at 55"', detail: "To Tue 21 Oct, 9am.", link: "/calendar?post=d1" };

  it("writes nothing while off", () => {
    expect(logActivity(UID, move, local(10, 22))).toBeNull();
    expect([...store.keys()]).toEqual(["cs-device-tag"]);
    expect(fired).toEqual([]);
  });
  it("once on, writes to the month row for this device and brand, newest first", () => {
    setActivityOn(true);
    const a = logActivity(UID, move, local(10, 22, 9));
    const b = logActivity(UID, { who: "you", kind: "make", title: "Made a picture" }, local(10, 22, 10));
    const key = `content-studio-activity-2026-10-dev001-${UID}`;
    expect(rowOf(key).map((e) => e.title)).toEqual(["Made a picture", 'Moved "3 CPF myths at 55"']);
    expect(rowOf(key)[1]).toEqual({ ...move, id: a!.id, at: local(10, 22, 9).toISOString() });
    expect(a!.id).toMatch(/^a[a-z0-9]+$/);
    expect(a!.id.length).toBe(1 + local(10, 22, 9).getTime().toString(36).length + 4);
    expect(b!.id).not.toBe(a!.id);
    expect(fired).toEqual([ACTIVITY_CHANGED, ACTIVITY_CHANGED]);
  });
  it("files an event under its own month, and keeps the source's id once", () => {
    setActivityOn(true);
    const claude = { id: "claude-k3x9", at: local(9, 30, 21).toISOString(), who: "claude" as const, kind: "post" as const, title: 'Added a draft: "Why I stopped"' };
    logActivity(UID, claude, local(10, 1));
    logActivity(UID, claude, local(10, 1));
    expect(rowOf(`content-studio-activity-2026-09-dev001-${UID}`).map((e) => e.id)).toEqual(["claude-k3x9"]);
    expect(store.has(`content-studio-activity-2026-10-dev001-${UID}`)).toBe(false);
  });
  it("keeps 1,000, dropping the oldest", () => {
    setActivityOn(true);
    const key = `content-studio-activity-2026-10-dev001-${UID}`;
    store.set(key, JSON.stringify(Array.from({ length: MAX_EVENTS }, (_, i) => ev(`e${i}`, local(10, 1, 0, i)))));
    logActivity(UID, move, local(10, 22));
    const row = rowOf(key);
    expect(row).toHaveLength(MAX_EVENTS);
    expect(row[0].title).toBe(move.title);
    expect(row.map((e) => e.id)).not.toContain("e0");
    expect(row.at(-1)!.id).toBe("e1");
  });
  it("stores a link that leaves the app without it, clips the words, and refuses a uuid id or a bad who", () => {
    setActivityOn(true);
    for (const link of ["https://x", "//x", "/\\x", "javascript:alert(1)", "/x:y", "calendar"]) expect(logActivity(UID, { ...move, link }, local(10, 22))).not.toHaveProperty("link");
    const long = logActivity(UID, { ...move, title: "t".repeat(200), detail: "d".repeat(400) }, local(10, 22));
    expect([long!.title.length, long!.detail!.length]).toEqual([120, 300]);
    expect(logActivity(UID, { ...move, id: "6d80f027-3395-480c-86a1-8827d3d6cce3" }, local(10, 22))).toBeNull();
    expect(logActivity(UID, { ...move, who: "robot" as never }, local(10, 22))).toBeNull();
    expect(logActivity(UID, { ...move, uses: { feature: "ai-image", n: 1 } }, local(10, 22))!.uses).toEqual({ feature: "ai-image", n: 1 });
    expect(logActivity(UID, { ...move, uses: { feature: "nope" as never, n: 1 } }, local(10, 22))).not.toHaveProperty("uses");
  });
  it("returns null and writes nothing when storage refuses", () => {
    setActivityOn(true);
    full = true;
    expect(logActivity(UID, move, local(10, 22))).toBeNull();
    expect(fired).toEqual([]);
  });
});

describe("deviceTag", () => {
  it("makes a 6-character tag once and keeps it", () => {
    store.delete("cs-device-tag");
    const t = deviceTag();
    expect(t).toMatch(/^[a-z0-9]{6}$/);
    expect(store.get("cs-device-tag")).toBe(t);
    expect(deviceTag()).toBe(t);
    store.set("cs-device-tag", "abc123");
    expect(deviceTag()).toBe("abc123");
  });
});

describe("loadActivity", () => {
  it("merges two devices and two months, drops repeated ids and other brands, newest first", () => {
    store.set(`content-studio-activity-2026-10-dev001-${UID}`, JSON.stringify([ev("a3", local(10, 20)), ev("a1", local(10, 2))]));
    store.set(`content-studio-activity-2026-10-dev002-${UID}`, JSON.stringify([ev("a2", local(10, 15)), ev("a1", local(10, 2))]));
    store.set(`content-studio-activity-2026-09-dev002-${UID}`, JSON.stringify([ev("s1", local(9, 30)), { id: "junk" }]));
    store.set(`content-studio-activity-2026-08-dev001-${UID}`, JSON.stringify([ev("old", local(8, 1))]));
    store.set(`content-studio-activity-2026-10-dev001-${UID}~p1`, JSON.stringify([ev("other", local(10, 21))]));
    store.set(`content-studio-activity-2026-10-dev003-${UID}`, "{oops");
    expect(loadActivity(UID, ["2026-10", "2026-09"]).map((e) => e.id)).toEqual(["a3", "a2", "a1", "s1"]);
    expect(activityMonths(UID)).toEqual(["2026-10", "2026-09", "2026-08"]);
  });
});

describe("absorbActivityInbox", () => {
  it("moves inbox rows into this device's month rows, removes them, and skips an id already logged anywhere", () => {
    store.set(`content-studio-activity-2026-10-dev002-${UID}`, JSON.stringify([ev("claude-old", local(10, 3), { who: "claude" })]));
    const inbox = (id: string, at: Date, scope = UID) =>
      store.set(`content-studio-activityin-${id}-${scope}`, JSON.stringify({ at: at.toISOString(), who: "claude", kind: "post", title: `Added a draft: "${id}"`, detail: "Saved as a draft in My posts.", link: `/generate?draft=${id}` }));
    inbox("claude-new", local(10, 21));
    inbox("claude-sep", local(9, 29));
    inbox("claude-old", local(10, 3));
    inbox("claude-elsewhere", local(10, 21), `${UID}~p1`);
    store.set(`content-studio-activityin-claude-bad-${UID}`, "{oops");
    expect(absorbActivityInbox(UID)).toBe(2);
    expect(rowOf(`content-studio-activity-2026-10-dev001-${UID}`)).toEqual([
      { id: "claude-new", at: local(10, 21).toISOString(), who: "claude", kind: "post", title: 'Added a draft: "claude-new"', detail: "Saved as a draft in My posts.", link: "/generate?draft=claude-new" },
    ]);
    expect(rowOf(`content-studio-activity-2026-09-dev001-${UID}`).map((e) => e.id)).toEqual(["claude-sep"]);
    expect([...store.keys()].filter((k) => k.startsWith("content-studio-activityin-"))).toEqual([`content-studio-activityin-claude-elsewhere-${UID}~p1`]);
    expect(loadActivity(UID, ["2026-10"]).map((e) => e.id)).toEqual(["claude-new", "claude-old"]);
    expect(absorbActivityInbox(UID)).toBe(0);
  });
  it("keeps the inbox rows for the next load when storage is full", () => {
    store.set(`content-studio-activityin-claude-new-${UID}`, JSON.stringify({ at: local(10, 21).toISOString(), who: "claude", kind: "post", title: "Added a draft" }));
    full = true;
    expect(absorbActivityInbox(UID)).toBe(0);
    expect(store.has(`content-studio-activityin-claude-new-${UID}`)).toBe(true);
  });
});

describe("whenWords and groupByWhen", () => {
  const now = local(10, 22, 15, 0);
  it("says when in words", () => {
    expect(whenWords(new Date(now.getTime() - 30_000).toISOString(), now)).toBe("just now");
    expect(whenWords(local(10, 22, 14, 59).toISOString(), now)).toBe("1 min ago");
    expect(whenWords(new Date(now.getTime() + 60_000).toISOString(), now)).toBe("just now");
    expect(whenWords(local(10, 22, 14, 55).toISOString(), now)).toBe("5 min ago");
    expect(whenWords(local(10, 22, 12, 0).toISOString(), now)).toBe("3 h ago");
    expect(whenWords(local(10, 21, 21, 14).toISOString(), now)).toBe("9:14 pm");
    expect(whenWords(local(10, 21, 0, 5).toISOString(), now)).toBe("12:05 am");
    expect(whenWords(local(10, 12, 9, 0).toISOString(), now)).toBe("Mon 12 Oct");
    // 15 minutes ago, but yesterday by the calendar
    expect(whenWords(local(10, 21, 23, 50).toISOString(), local(10, 22, 0, 5))).toBe("11:50 pm");
  });
  it("groups around midnight and month ends", () => {
    const events = [ev("t", local(10, 22, 0, 1)), ev("y", local(10, 21, 23, 59)), ev("e", local(10, 2)), ev("s", local(9, 30, 23, 59)), ev("a", local(8, 31))];
    expect(groupByWhen(events, now).map((g) => [g.key, g.label, g.events.map((e) => e.id).join()])).toEqual([
      ["today", "Today", "t"],
      ["yesterday", "Yesterday", "y"],
      ["earlier", "Earlier this month", "e"],
      ["2026-09", "September 2026", "s"],
      ["2026-08", "August 2026", "a"],
    ]);
    // on the 1st, yesterday is last month's last day, and nothing is "earlier this month"
    expect(groupByWhen([ev("s2", local(9, 29)), ev("s", local(9, 30, 23, 59)), ev("t", local(10, 1, 0, 1))], local(10, 1, 9)).map((g) => [g.key, g.events.map((e) => e.id).join()])).toEqual([
      ["today", "t"],
      ["yesterday", "s"],
      ["2026-09", "s2"],
    ]);
    expect(groupByWhen([ev("d", local(12, 31, 23, 0))], new Date(2027, 0, 2, 9)).map((g) => g.label)).toEqual(["December 2026"]);
  });
});

describe("views", () => {
  it("each view returns only its events", () => {
    const events = [
      ev("1", local(10, 1), { who: "agent", kind: "post" }),
      ev("2", local(10, 1), { who: "you", kind: "learning" }),
      ev("3", local(10, 1), { who: "claude", kind: "post" }),
      ev("4", local(10, 1), { who: "autopilot", kind: "plan" }),
      ev("5", local(10, 1), { who: "schedule", kind: "run" }),
      ev("6", local(10, 1), { who: "you", kind: "plan" }),
      ev("7", local(10, 1), { who: "schedule", kind: "correction" }),
    ];
    const ids = (view: (typeof ACTIVITY_VIEWS)[number]["id"]) => events.filter((e) => inView(e, view)).map((e) => e.id).join();
    expect(ACTIVITY_VIEWS.map((v) => v.label)).toEqual(["All", "Agent", "You", "Claude", "Autopilot", "Corrections", "Scheduled runs", "Learnings", "Plan", "AI use"]);
    expect(ACTIVITY_VIEWS.map((v) => [v.id, ids(v.id)])).toEqual([
      ["all", "1,2,3,4,5,6,7"],
      ["agent", "1"],
      ["you", "2,6"],
      ["claude", "3"],
      ["autopilot", "4"],
      ["corrections", "7"],
      ["schedule", "5,7"],
      ["learnings", "2"],
      ["plan", "4,6"],
      ["ai-use", ""],
    ]);
  });
});

describe("aiUseRows", () => {
  it("drops the -global and ':' rows and refunded zeros, labels the rest, newest day first", () => {
    const rows = aiUseRows([
      { feature: "ai-image", day: "2026-10-21", count: 2 },
      { feature: "ai-video-global", day: "2026-10-22", count: 5 },
      { feature: "market-check:pabc", day: "2026-10-22", count: 1 },
      { feature: "refund:abc", day: "2026-10-22", count: 1 },
      { feature: "remix-make", day: "2026-10-22", count: 3 },
      { feature: "ai-voice", day: "2026-10-22", count: 0 },
      { feature: "ai-video", day: "2026-10-22", count: 1 },
      { feature: "retired-cap", day: "2026-10-20", count: 1 },
    ]);
    expect(rows).toEqual([
      { day: "2026-10-22", feature: "ai-video", label: "AI videos", uses: 1, limit: 2 },
      { day: "2026-10-22", feature: "remix-make", label: "Remixes", uses: 3, limit: 30 },
      { day: "2026-10-21", feature: "ai-image", label: "Pictures", uses: 2, limit: 5 },
      { day: "2026-10-20", feature: "retired-cap", label: "retired-cap", uses: 1, limit: null },
    ]);
  });
  it("labels every DAILY_LIMITS key, so a new cap cannot ship without one", () => {
    const labels = AI_USE_LABELS as Record<string, string>;
    expect(Object.keys(DAILY_LIMITS).filter((k) => !labels[k])).toEqual([]);
    expect(Object.values(labels).every((l) => /^[A-Z][A-Za-z0-9 ,'-]+$/.test(l))).toBe(true);
  });
  it("labels the phase-7 caps with the brief's words", () => {
    expect(AI_USE_LABELS).toMatchObject({
      "launch-film": "Launch films",
      "film-edit": "Launch film changes",
      "edit-read": "Edit reads",
      "edit-version": "Video versions",
      "winner-check": "Winner checks",
      "post-match": "Post matches",
      "post-grade": "Post grades",
      "post-angles": "Post tags",
    });
  });
});

describe("planRows", () => {
  const campaign = { id: "c-k1", name: "Young parents, October", createdAt: "2026-10-05T02:00:00.000Z", audienceName: "Young parents", weeks: 4, perWeek: 7 as const, posts: Array.from({ length: 28 }, () => ({}) as never) };
  it("leaves out a campaign whose Plan the agent logged itself, so it shows once (live-p6replay D6)", () => {
    const agent = { kind: "plan" as const, title: 'Planned "Young parents, October"', at: "2026-10-05T02:00:00.400Z" };
    expect(planRows([campaign], null, [agent])).toEqual([]);
    // another campaign of the same name a day later, or a row of another kind, still gets its own
    expect(planRows([{ ...campaign, createdAt: "2026-10-06T02:00:00.000Z" }], null, [agent])).toHaveLength(1);
    expect(planRows([campaign], null, [{ ...agent, kind: "make" }])).toHaveLength(1);
  });

  it("turns a campaign into one Plan event at its createdAt", () => {
    expect(planRows([campaign], null)).toEqual([
      { id: "plan-c-k1", at: "2026-10-05T02:00:00.000Z", who: "you", kind: "plan", title: 'Planned "Young parents, October"', detail: "28 posts for Young parents, 7 a week for 4 weeks.", link: "/campaigns/c-k1" },
    ]);
  });
  it("turns an autopilot week with an approved post into one Autopilot event, and skips the rest", () => {
    const post = (state: string) => ({ state }) as never;
    const rows = planRows([], {
      batches: [
        { week: "2026-10-26", startedAt: "2026-10-23T01:00:00.000Z", posts: [post("approved"), post("approved"), post("skipped")] },
        { week: "2026-10-19", startedAt: "2026-10-16T01:00:00.000Z", posts: [post("review"), post("skipped")] },
        { week: "2026-10-12", posts: [post("approved")] },
      ],
    });
    expect(rows).toEqual([
      { id: "autopilot-2026-10-26", at: "2026-10-23T01:00:00.000Z", who: "autopilot", kind: "plan", title: "Wrote the posts for the week of Mon 26 Oct", detail: "2 of 3 approved.", link: "/plan?week=2026-10-26#autopilot" },
      { id: "autopilot-2026-10-12", at: local(10, 12, 0).toISOString(), who: "autopilot", kind: "plan", title: "Wrote the posts for the week of Mon 12 Oct", detail: "1 of 1 approved.", link: "/plan?week=2026-10-12#autopilot" },
    ]);
    expect(rows.every((e) => inView(e, "autopilot") && inView(e, "plan"))).toBe(true);
  });
});
