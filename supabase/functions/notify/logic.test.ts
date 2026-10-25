import { describe, expect, it } from "vitest";
import { weekProgress as appWeekProgress } from "@/lib/goals";
import type { DraftEntry } from "@/lib/draftHistory";
import { HOOK_FORMULAS } from "@/lib/hookFormulas";
import { labelForDimension } from "@/lib/analytics";
import { links } from "@/lib/links";
import {
  APP_URL,
  alertDay,
  BRIEF_ASK,
  briefAsk,
  briefBody,
  briefFindings,
  briefLines,
  findingLine,
  findingUrl,
  outlierAlert,
  outlierHits,
  pickedFindings,
  type Finding,
  FORMAT_NOUN,
  HOOK_NAME,
  PILLAR_NAME,
  moveAsk,
  moveBody,
  moverLine,
  pickedMove,
  reportFacts,
  reportLines,
  sharedLine,
  weekMoves,
  weekReport,
  type Followed,
  dueAt,
  dueMessage,
  duePosts,
  goalAlert,
  isPushEndpoint,
  marketAlert,
  marketOpen,
  parsePrefs,
  profilesFrom,
  weekProgress,
  weeklyEmail,
  type Post,
  type Profile,
} from "./logic";

const UID = "3f2b6c1e-8a4d-4c2b-9f1e-2a3b4c5d6e7f";
/** An instant given as Singapore wall time. */
const sg = (y: number, m: number, d: number, h = 0, min = 0) => Date.UTC(y, m - 1, d, h - 8, min);
// 2026-10-05 is a Monday, 2026-10-08 a Thursday.
const THU_6PM = sg(2026, 10, 8, 18);
const MON_8AM = sg(2026, 10, 12, 8);

const post = (over: Partial<Post> & { id: string }): Post => ({ hook: `Hook ${over.id}`, platform: "linkedin", ...over });
const profile = (over: Partial<Profile> = {}): Profile => ({ id: "me", name: "Me", posts: [], goals: {}, ...over });

describe("parsePrefs", () => {
  it("is on only for an explicit true", () => {
    const off = { email: false, push: false, brief: false, alerts: false };
    expect(parsePrefs('{"email":true,"push":false}')).toEqual({ ...off, email: true });
    expect(parsePrefs('{"email":"true","push":1}')).toEqual(off);
    expect(parsePrefs("not json")).toEqual(off);
    expect(parsePrefs(null)).toEqual(off);
    expect(parsePrefs('{"email":true,"brief":true,"alerts":"yes"}')).toEqual({ ...off, email: true, brief: true });
  });
});

describe("isPushEndpoint", () => {
  it("takes the known push services", () => {
    for (const url of [
      "https://fcm.googleapis.com/fcm/send/dev:APA91b_x-Y",
      "https://updates.push.services.mozilla.com/wpush/v2/gAAAAABk-x_y=",
      "https://web.push.apple.com/QGuQyavXutnMH-u0",
      "https://wns2-par02p.notify.windows.com/w/?token=BQYAAAB%2b5x%3d",
    ]) expect(isPushEndpoint(url), url).toBe(true);
  });
  it("refuses anything else", () => {
    for (const url of [
      "http://fcm.googleapis.com/fcm/send/x",
      "https://evil.example.com/fcm/send/x",
      "https://fcm.googleapis.com.evil.com/x",
      "https://fcm.googleapis.com@evil.com/x",
      "https://x.notify.windows.com.evil.com/w/",
      "https://fcm.googleapis.com/fcm/send/a b",
      "https://fcm.googleapis.com/",
      `https://fcm.googleapis.com/${"x".repeat(1100)}`,
      42,
    ]) expect(isPushEndpoint(url), String(url).slice(0, 60)).toBe(false);
  });
});

describe("profilesFrom", () => {
  it("reads every profile's posts and goals from its own keys", () => {
    const profiles = profilesFrom(UID, {
      [`content-studio-profiles-${UID}`]: JSON.stringify([
        { id: "pmb1", name: "MoneyBees" },
        { id: "BAD!", name: "Broken" },
        { id: "p2" },
      ]),
      [`content-studio-drafts-${UID}`]: JSON.stringify([{ id: "a", hook: "Mine", status: "scheduled" }, { hook: "no id" }, 7]),
      [`content-studio-drafts-${UID}~pmb1`]: JSON.stringify([{ id: "b", hook: "Theirs", metrics: { reactions: 4, comments: "x" } }]),
      [`content-studio-goals-${UID}`]: JSON.stringify({ linkedin: 3, instagram: 40, myspace: 2 }),
      [`content-studio-positioning-${UID}~pmb1`]: JSON.stringify({ platform: "instagram", cadence: 2 }),
    });
    expect(profiles.map((p) => [p.id, p.name])).toEqual([
      ["me", "Me"],
      ["pmb1", "MoneyBees"],
    ]);
    expect(profiles[0].posts.map((p) => p.id)).toEqual(["a"]);
    expect(profiles[0].goals).toEqual({ linkedin: 3, instagram: 21 });
    expect(profiles[1].posts[0].metrics).toEqual({ reactions: 4, comments: undefined, impressions: undefined, shares: undefined });
    // No saved goals: positioning's cadence on its platform, as goals.ts does.
    expect(profiles[1].goals).toEqual({ instagram: 2 });
  });

  it("reads each post's labels and the accounts each profile follows", () => {
    const [me] = profilesFrom(UID, {
      [`content-studio-drafts-${UID}`]: JSON.stringify([{ id: "a", hook: "x", format: "carousel", pillar: "topic", hookFormula: "contrarian" }]),
      [`content-studio-following-${UID}`]: JSON.stringify([
        { platform: "instagram", handle: "rival", history: [{ at: "2026-10-01T00:00:00Z", followers: 900 }, { at: 5 }, { at: "2026-10-08T00:00:00Z", followers: -1 }], posts: [{ postedAt: "2026-10-07T00:00:00Z" }, 3] },
        { handle: "no history" },
        "junk",
      ]),
    });
    expect(me.posts[0]).toMatchObject({ format: "carousel", pillar: "topic", hookFormula: "contrarian" });
    expect(me.followed).toEqual([
      { platform: "instagram", handle: "rival", history: [{ at: "2026-10-01T00:00:00Z", followers: 900 }, { at: "2026-10-08T00:00:00Z", followers: null }], posts: [{ postedAt: "2026-10-07T00:00:00Z" }] },
    ]);
  });

  it("reads the real numbers pulled for a post that went out through Zernio over the typed ones", () => {
    const [me] = profilesFrom(UID, {
      [`content-studio-drafts-${UID}`]: JSON.stringify([
        { id: "a", hook: "x", metrics: { impressions: 10, reactions: 1 }, zernio: { key: "k", postId: "p", numbers: { impressions: 0, reach: 900, views: 1500, likes: 40, comments: 6, shares: "3", saves: 11, at: "2026-10-11T01:00:00Z" } } },
        { id: "b", hook: "y", metrics: { impressions: 10, reactions: 1 }, zernio: { key: "k2", postId: "q" } },
      ]),
    });
    expect(me.posts.map((p) => p.metrics)).toEqual([
      { impressions: 900, reactions: 40, comments: 6, shares: 0 },
      { impressions: 10, reactions: 1, comments: undefined, shares: undefined },
    ]);
  });

  it("reads a hand-posted draft's linked live numbers, and the week's report counts them (learn-real-numbers)", () => {
    const [me] = profilesFrom(UID, {
      [`content-studio-drafts-${UID}`]: JSON.stringify([
        { id: "a", hook: "x", status: "posted", postedAt: "2026-10-07T02:00:00Z", metrics: { impressions: 10, reactions: 1 }, live: { postId: "ext1", platform: "linkedin", url: null, by: "jev", numbers: { impressions: 0, reach: 700, views: 0, likes: 30, comments: 4, shares: 2, saves: 0, at: "2026-10-08T01:00:00Z" } } },
        { id: "b", hook: "y", status: "posted", postedAt: "2026-10-07T03:00:00Z", metrics: { impressions: 10, reactions: 1 }, live: { postId: "ext2", platform: "linkedin", url: null, by: "auto" } },
      ]),
    });
    expect(me.posts.map((p) => p.metrics)).toEqual([
      { impressions: 700, reactions: 30, comments: 4, shares: 2 },
      { impressions: 10, reactions: 1, comments: undefined, shares: undefined },
    ]);
    expect(weekReport(me.posts, [], "2026-10-11")).toMatchObject({ posts: 2, impressions: 710, engagements: 37 });
  });

  it("gives an account with nothing synced one empty profile", () => {
    expect(profilesFrom(UID, {})).toEqual([{ id: "me", name: "Me", posts: [], goals: {}, followed: [] }]);
  });
});

describe("dueAt", () => {
  it("reads a Singapore time, or 9am for a day alone", () => {
    expect(dueAt("2026-10-08T19:30")).toEqual({ at: sg(2026, 10, 8, 19, 30), day: "2026-10-08", time: "19:30" });
    expect(dueAt("2026-10-08")).toEqual({ at: sg(2026, 10, 8, 9), day: "2026-10-08", time: null });
    // The board's older full ISO timestamps count as the day alone (dueDates.ts scheduleTime).
    expect(dueAt("2026-10-08T01:00:00.000Z")).toEqual({ at: sg(2026, 10, 8, 9), day: "2026-10-08", time: null });
    expect(dueAt("soon")).toBeNull();
    expect(dueAt(undefined)).toBeNull();
  });

  it("reads a stored 24:00 or 19:60 as the day alone, as the app does, not a 12pm or 7:60pm reminder", () => {
    expect(dueAt("2026-10-08T24:00")).toEqual({ at: sg(2026, 10, 8, 9), day: "2026-10-08", time: null });
    expect(dueAt("2026-10-08T19:60")).toEqual({ at: sg(2026, 10, 8, 9), day: "2026-10-08", time: null });
    expect(dueAt("2026-10-08T23:59")).toMatchObject({ time: "23:59" });
  });
});

describe("duePosts and dueMessage", () => {
  const now = sg(2026, 10, 8, 18, 0);
  const me = profile({
    posts: [
      post({ id: "in-60", status: "scheduled", scheduledFor: "2026-10-08T19:00" }),
      post({ id: "in-61", status: "scheduled", scheduledFor: "2026-10-08T19:01" }),
      post({ id: "late-9", status: "scheduled", scheduledFor: "2026-10-08T17:51" }),
      post({ id: "late-10", status: "scheduled", scheduledFor: "2026-10-08T17:50" }),
      post({ id: "draft", status: "draft", scheduledFor: "2026-10-08T18:30" }),
      post({ id: "posted", status: "posted", scheduledFor: "2026-10-08T18:30" }),
    ],
  });

  it("finds posts due from 10 minutes ago to an hour ahead, soonest first", () => {
    expect(duePosts([me], now).map((d) => d.post.id)).toEqual(["late-9", "in-60"]);
    expect(duePosts([me], now)[1].item).toBe("due:me:in-60:2026-10-08T19:00");
  });

  it("alerts a day-only post in the hour before 9am", () => {
    const p = profile({ posts: [post({ id: "d", status: "scheduled", scheduledFor: "2026-10-08" })] });
    expect(duePosts([p], sg(2026, 10, 8, 8, 0)).map((d) => d.item)).toEqual(["due:me:d:2026-10-08"]);
    expect(duePosts([p], sg(2026, 10, 8, 7, 59))).toEqual([]);
  });

  it("a moved post is a new item, so it alerts again", () => {
    const a = duePosts([profile({ posts: [post({ id: "x", status: "scheduled", scheduledFor: "2026-10-08T18:30" })] })], now);
    const b = duePosts([profile({ posts: [post({ id: "x", status: "scheduled", scheduledFor: "2026-10-08T18:45" })] })], now);
    expect(a[0].item).not.toBe(b[0].item);
  });

  it("caps one run at 10 posts", () => {
    const many = profile({
      posts: Array.from({ length: 14 }, (_, i) => post({ id: `m${i}`, status: "scheduled", scheduledFor: "2026-10-08T18:30" })),
    });
    expect(duePosts([many], now)).toHaveLength(10);
  });

  it("opens one post in Write, in its own profile", () => {
    const other = profile({ id: "pmb1", name: "MoneyBees", posts: [post({ id: "z/1", status: "scheduled", scheduledFor: "2026-10-08T18:30", platform: "instagram", hook: "  Why\nCPF  matters " })] });
    expect(dueMessage(duePosts([other], now))).toEqual({
      title: "Due at 6:30pm",
      body: "Instagram: Why CPF matters",
      url: "/generate?draft=z%2F1&profile=pmb1",
      tag: "due:pmb1:z/1:2026-10-08T18:30",
      ttl: 3600,
    });
    const mine = dueMessage(duePosts([profile({ posts: [post({ id: "d", status: "scheduled", scheduledFor: "2026-10-08" })] })], sg(2026, 10, 8, 8)));
    expect(mine?.title).toBe("Due today");
    expect(mine?.url).toBe("/generate?draft=d");
  });

  it("several posts make one alert that opens Home", () => {
    const m = dueMessage(duePosts([me], now));
    expect(m?.title).toBe("2 posts are due");
    expect(m?.url).toBe("/home");
    expect(dueMessage([])).toBeNull();
  });
});

describe("goalAlert", () => {
  const goals = { linkedin: 4 };
  const thisWeek = [
    post({ id: "p1", status: "posted", postedAt: "2026-10-06T02:00:00.000Z" }),
    post({ id: "s1", status: "scheduled", scheduledFor: "2026-10-10T09:00" }),
    post({ id: "old", status: "posted", postedAt: "2026-10-04T02:00:00.000Z" }),
  ];

  it("Thursday from 6pm, when the goal still has posts to do", () => {
    expect(goalAlert([profile({ goals, posts: thisWeek })], THU_6PM)).toEqual({
      item: "goal:2026-10-08",
      message: { title: "This week's goal is behind", body: "1 of 4 posted, 2 to do.", url: "/home", tag: "goal", ttl: 21600 },
    });
  });

  it("not before 6pm, not on other days, not when the rest is scheduled, not without a goal", () => {
    expect(goalAlert([profile({ goals, posts: thisWeek })], THU_6PM - 60_000)).toBeNull();
    expect(goalAlert([profile({ goals, posts: thisWeek })], sg(2026, 10, 7, 20))).toBeNull();
    expect(goalAlert([profile({ goals: { linkedin: 2 }, posts: thisWeek })], THU_6PM)).toBeNull();
    expect(goalAlert([profile({ posts: thisWeek })], THU_6PM)).toBeNull();
  });

  it("names each profile that is behind", () => {
    const alert = goalAlert(
      [profile({ goals: { linkedin: 1 }, posts: thisWeek }), profile({ id: "pmb1", name: "MoneyBees", goals: { instagram: 3 } })],
      THU_6PM,
    );
    expect(alert?.message.body).toBe("MoneyBees: 0 of 3 posted, 3 to do.");
  });
});

describe("weekProgress", () => {
  it("matches the app's weekly goal count", () => {
    const posts: Post[] = [
      post({ id: "a", status: "posted", postedAt: "2026-10-05T16:30:00.000Z" }), // Tue 00:30 in Singapore
      post({ id: "b", status: "posted", postedAt: "2026-10-04T15:59:00.000Z" }), // Sun 23:59, last week
      post({ id: "c", status: "posted", postedAt: "2026-10-07", platform: "instagram" }),
      post({ id: "d", status: "scheduled", scheduledFor: "2026-10-11T20:00", platform: "instagram" }),
      post({ id: "e", status: "scheduled", scheduledFor: "2026-10-12" }), // next week
      post({ id: "f", platform: "tiktok" }),
    ];
    const goals = { linkedin: 3, instagram: 1, tiktok: 2 };
    const app = appWeekProgress(posts as unknown as DraftEntry[], goals, "2026-10-08");
    const mine = weekProgress(posts, goals, "2026-10-08");
    expect(mine).toEqual({ goal: app.goal, posted: app.posted, scheduled: app.scheduled, toDo: app.toDo });
    expect(mine).toEqual({ goal: 6, posted: 2, scheduled: 1, toDo: 4 });
  });
});

describe("weeklyEmail", () => {
  const lastWeek = [
    post({ id: "a", hook: "Your CPF at 55", status: "posted", postedAt: "2026-10-06T03:00:00.000Z", metrics: { impressions: 1240, reactions: 38, comments: 6 } }),
    post({ id: "b", hook: "Term vs whole life", status: "posted", postedAt: "2026-10-07T03:00:00.000Z", metrics: { impressions: 5000, reactions: 10 } }),
    post({ id: "c", hook: "Bonus season", status: "posted", postedAt: "2026-10-09T03:00:00.000Z" }),
    post({ id: "x", hook: "Two weeks ago", status: "posted", postedAt: "2026-09-30T03:00:00.000Z", metrics: { reactions: 999 } }),
  ];
  const coming = [
    post({ id: "t2", hook: "Thursday one", status: "scheduled", scheduledFor: "2026-10-15", platform: "instagram" }),
    post({ id: "t1", hook: "Tuesday one", status: "scheduled", scheduledFor: "2026-10-13T19:30" }),
    post({ id: "n", hook: "Next week", status: "scheduled", scheduledFor: "2026-10-19T09:00" }),
  ];

  it("waits for Monday 8am Singapore", () => {
    const p = [profile({ goals: { linkedin: 4 }, posts: lastWeek })];
    expect(weeklyEmail(p, MON_8AM - 60_000)).toBeNull();
    expect(weeklyEmail(p, sg(2026, 10, 13, 9))).toBeNull();
    expect(weeklyEmail(p, MON_8AM)?.item).toBe("email:2026-10-12");
  });

  it("reports last week against the goal and the week before, best and weakest, the move Jev picked and this week's schedule", () => {
    const email = weeklyEmail([profile({ goals: { linkedin: 4 }, posts: [...lastWeek, ...coming] })], MON_8AM, { me: "numbers" })!;
    expect(email.subject).toBe("Last week: 3 of 4 posted");
    expect(email.text).toBe(
      [
        "Last week, 5 Oct to 11 Oct",
        "3 of 4 posted (+2 on the week before).",
        "6,240 impressions, 54 engagements (-95%).",
        "Best posts",
        '1. "Your CPF at 55" (LinkedIn): 1,240 impressions, 44 engagements',
        "Weakest",
        '1. "Term vs whole life" (LinkedIn): 5,000 impressions, 10 engagements',
        "",
        "One thing this week: Add the numbers for 1 recent post with none yet.",
        "",
        "This week",
        'Tue 13 Oct, 7:30pm, LinkedIn: "Tuesday one"',
        'Thu 15 Oct, Instagram: "Thursday one"',
        "",
        `Open Content Studio: ${APP_URL}/home`,
        "",
        "You get this every Monday because it is switched on in My Playbook. Switch it off there to stop.",
      ].join("\n"),
    );
  });

  it("leaves the move out when Jev picked none, or picked one the week does not support", () => {
    const posts = [...lastWeek, ...coming];
    for (const picks of [{}, { me: "rival" as const }, { other: "numbers" as const }]) {
      expect(weeklyEmail([profile({ goals: { linkedin: 4 }, posts })], MON_8AM, picks)!.text).not.toContain("One thing");
    }
  });

  it("says so when the goal was met, when nothing has numbers and when nothing is scheduled", () => {
    const met = weeklyEmail([profile({ goals: { linkedin: 2 }, posts: lastWeek.slice(2) })], MON_8AM)!;
    expect(met.subject).toBe("Last week: 1 of 2 posted");
    expect(met.text).toContain("Log the numbers for last week's posts in My posts to see your best one.");
    expect(met.text).toContain("This week\nNothing scheduled yet.");
    const exact = weeklyEmail([profile({ goals: { linkedin: 3 }, posts: lastWeek })], MON_8AM)!;
    expect(exact.subject).toBe("Last week: goal met, 3 of 3 posted");
    expect(exact.text).toContain("\nGoal met: 3 of 3 posted (+2 on the week before).\n");
    expect(weeklyEmail([profile()], MON_8AM)!.subject).toBe("Last week: 0 posts posted");
  });

  it("gives each profile with something to say its own block", () => {
    const email = weeklyEmail(
      [
        profile({ goals: { linkedin: 1 }, posts: lastWeek }),
        profile({ id: "p2", name: "Quiet" }),
        profile({ id: "pmb1", name: "MoneyBees", posts: coming }),
      ],
      MON_8AM,
    )!;
    expect(email.text.startsWith("ME\n\nLast week")).toBe(true);
    expect(email.text).toContain("\nMONEYBEES\n\nLast week");
    expect(email.text).not.toContain("QUIET");
    expect(email.subject).toBe("Last week: goal met, 3 of 1 posted");
  });

  it("writes plain ASCII with no em dashes", () => {
    const email = weeklyEmail([profile({ goals: { linkedin: 4 }, posts: [...lastWeek, ...coming] })], MON_8AM, { me: "reuse" })!;
    expect(email.text).toContain("One thing this week: Turn your best post");
    expect(`${email.subject}\n${email.text}`).toMatch(/^[\x20-\x7e\n]*$/);
  });
});

describe("weekReport (g44)", () => {
  const at = (day: string) => `${day}T03:00:00.000Z`; // 11am in Singapore
  const w = (id: string, day: string, impressions: number, reactions: number, labels: Partial<Post> = {}) =>
    post({ id, status: "posted", postedAt: at(day), metrics: { impressions, reactions }, ...labels });
  const posts: Post[] = [
    w("w1", "2026-10-06", 2000, 100, { format: "carousel", pillar: "interest", hookFormula: "contrarian" }),
    w("w2", "2026-10-07", 1500, 80, { format: "carousel", pillar: "topic", hookFormula: "contrarian" }),
    w("w3", "2026-10-08", 1200, 60, { format: "carousel", pillar: "interest", hookFormula: "made-up" }),
    w("w4", "2026-10-09", 1000, 10, { format: "text-post", pillar: "interest", hookFormula: "contrarian" }),
    w("w5", "2026-10-10", 800, 5, { format: "text-post", pillar: "topic", hookFormula: "mistake" }),
    w("w6", "2026-10-11", 700, 3, { format: "carousel", pillar: "market", hookFormula: "blunt" }),
    post({ id: "w7", status: "posted", postedAt: at("2026-10-10") }),
    w("p1", "2026-10-01", 1000, 50),
    w("old", "2026-09-20", 9000, 900),
    post({ id: "s", status: "scheduled", scheduledFor: "2026-10-09T09:00", metrics: { reactions: 500 } }),
  ];
  const followed: Followed[] = [
    { platform: "instagram", handle: "beta", history: [{ at: "2026-10-06T01:00:00Z", followers: 500 }, { at: "2026-10-10T01:00:00Z", followers: 480 }], posts: [] },
    {
      platform: "tiktok",
      handle: "alpha",
      history: [{ at: "2026-10-11T02:00:00Z", followers: 1150 }, { at: "2026-10-01T02:00:00Z", followers: 1000 }, { at: "2026-10-07T02:00:00Z", followers: 1100 }],
      posts: [{ postedAt: "2026-10-08T00:00:00Z" }, { postedAt: "2026-09-01T00:00:00Z" }, { postedAt: null }],
    },
    { platform: "instagram", handle: "gamma", history: [{ at: "2026-10-08T01:00:00Z", followers: 70 }], posts: [] },
    { platform: "instagram", handle: "delta", history: [{ at: "2026-09-20T01:00:00Z", followers: 10 }, { at: "2026-09-29T01:00:00Z", followers: 30 }], posts: [] },
    { platform: "instagram", handle: "hidden", history: [{ at: "2026-10-01T01:00:00Z", followers: null }, { at: "2026-10-09T01:00:00Z", followers: null }], posts: [] },
  ];
  const r = weekReport(posts, followed, "2026-10-11", 8);

  it("counts the 7 days against the 7 before, with the numbers typed in", () => {
    expect(r).toMatchObject({
      start: "2026-10-05", end: "2026-10-11",
      posts: 7, prevPosts: 1,
      impressions: 7200, prevImpressions: 1000,
      engagements: 258, prevEngagements: 50,
      missing: 1, goal: 8,
    });
  });

  it("ranks the best 3 and the weakest 3 by engagement, weakest first", () => {
    expect(r.best.map((p) => p.id)).toEqual(["w1", "w2", "w3"]);
    expect(r.worst.map((p) => p.id)).toEqual(["w6", "w5", "w4"]);
    expect(r.best[0]).toEqual({ id: "w1", hook: "Hook w1", platform: "linkedin", impressions: 2000, engagements: 100 });
    // on fewer than 6 posts with numbers, each takes half and none is in both
    const four = weekReport(posts.filter((p) => ["w1", "w2", "w5", "w6"].includes(p.id)), [], "2026-10-11");
    expect([four.best.map((p) => p.id), four.worst.map((p) => p.id)]).toEqual([["w1", "w2"], ["w6", "w5"]]);
    const one = weekReport(posts.filter((p) => p.id === "w3"), [], "2026-10-11");
    expect([one.best.length, one.worst.length]).toEqual([1, 0]);
  });

  it("never lists a post as weakest when it did as well as one of the best", () => {
    const tied = [w("t1", "2026-10-07", 1200, 60), w("t2", "2026-10-08", 1200, 60)];
    const two = weekReport(tied, [], "2026-10-11");
    expect([two.best.map((p) => p.id), two.worst]).toEqual([["t1"], []]);
    expect(reportLines(two).join("\n")).not.toMatch(/Weakest/);
    // four posts, the middle two level: only the lowest is weakest
    const four = weekReport([w("a", "2026-10-06", 2000, 100), ...tied, w("d", "2026-10-09", 700, 3)], [], "2026-10-11");
    expect([four.best.map((p) => p.id), four.worst.map((p) => p.id)]).toEqual([["a", "t1"], ["d"]]);
  });

  it("gives a week with one post that has numbers a Best post line and no empty Weakest list", () => {
    const lines = reportLines(weekReport(posts.filter((p) => p.id === "w3"), [], "2026-10-11"));
    expect(lines).toContain('Best post: "Hook w3" (LinkedIn): 1,200 impressions, 60 engagements');
    expect(lines.join("\n")).not.toMatch(/Weakest|Best posts/);
  });

  it("counts the labels the best posts share, and how many of the weakest had them", () => {
    expect(r.shared).toEqual([
      { label: "format", key: "carousel", count: 3, of: 3, inWorst: 1 },
      { label: "pillar", key: "interest", count: 2, of: 3, inWorst: 1 },
      { label: "hookFormula", key: "contrarian", count: 2, of: 3, inWorst: 1 },
    ]);
    expect(r.shared.map((x) => sharedLine(x, r.worst.length))).toEqual([
      "3 of your top 3 were carousels (1 of the weakest 3)",
      "2 of your top 3 were Interest pillar posts (1 of the weakest 3)",
      "2 of your top 3 opened with the Contrarian take hook (1 of the weakest 3)",
    ]);
    expect(sharedLine({ label: "format", key: "carousel", count: 2, of: 2, inWorst: 0 }, 2)).toBe("2 of your top 2 were carousels (none of the weakest)");
    expect(sharedLine({ label: "pillar", key: "topic", count: 2, of: 2, inWorst: 1 }, 1)).toBe("2 of your top 2 were Topic pillar posts (the weakest too)");
    expect(sharedLine({ label: "hookFormula", key: "blunt", count: 2, of: 2, inWorst: 0 }, 1)).toBe("2 of your top 2 opened with the Short and blunt hook (not the weakest)");
    expect(sharedLine({ label: "format", key: "story", count: 2, of: 2, inWorst: 0 }, 0)).toBe("2 of your top 2 were stories");
  });

  it("moves followed accounts from the last snapshot before the week to the last one in it", () => {
    expect(r.movers).toEqual([
      { handle: "alpha", platform: "tiktok", gained: 150, followers: 1150, posts: 1 },
      { handle: "beta", platform: "instagram", gained: -20, followers: 480, posts: 0 },
    ]);
    expect(r.movers.map(moverLine)).toEqual(["@alpha gained 150 followers (1,150 now), 1 new post", "@beta lost 20 followers (480 now)"]);
  });

  it("never counts growth from a snapshot older than the week before as this week's", () => {
    const stale: Followed[] = [
      { platform: "instagram", handle: "stale", history: [{ at: "2026-08-01T01:00:00Z", followers: 500 }, { at: "2026-10-09T01:00:00Z", followers: 900 }], posts: [] },
      { platform: "instagram", handle: "inweek", history: [{ at: "2026-08-01T01:00:00Z", followers: 100 }, { at: "2026-10-06T01:00:00Z", followers: 880 }, { at: "2026-10-10T01:00:00Z", followers: 900 }], posts: [] },
      { platform: "instagram", handle: "lastweek", history: [{ at: "2026-09-28T01:00:00Z", followers: 800 }, { at: "2026-10-10T01:00:00Z", followers: 900 }], posts: [] },
    ];
    expect(weekReport([], stale, "2026-10-11").movers.map((m) => [m.handle, m.gained])).toEqual([["lastweek", 100], ["inweek", 20]]);
  });

  it("builds one move per kind the week supports, for Jev to pick from", () => {
    expect(weekMoves(r)).toEqual([
      { id: "pattern", text: "Make 2 more carousels this week, like 3 of your top 3." },
      { id: "reuse", text: 'Turn your best post, "Hook w1", into a new post in another format.' },
      { id: "numbers", text: "Add the numbers for 1 recent post with none yet." },
      { id: "cadence", text: "Post 8 times this week, up from 7." },
      { id: "rival", text: "Remix a post from @alpha, who gained 150 followers." },
    ]);
    // a quiet week: nothing to build on and nobody gaining
    expect(weekMoves(weekReport([], followed.slice(0, 1), "2026-10-11"))).toEqual([]);
  });

  it("says 1 time and 1 follower, not 1 times and 1 followers", () => {
    const one = { ...r, shared: [], best: [], missing: 0, posts: 0, prevPosts: 1, goal: 0, movers: [{ ...r.movers[0], gained: 1 }] };
    expect(weekMoves(one)).toEqual([
      { id: "cadence", text: "Post 1 time this week, up from 0." },
      { id: "rival", text: "Remix a post from @alpha, who gained 1 follower." },
    ]);
  });

  it("asks Jev to choose only when there is a choice, and takes only an offered move", () => {
    const moves = weekMoves(r);
    const ask = moveAsk(reportFacts(r), moves)!;
    expect(ask.state).toContain("7 posts posted against a goal of 8, +6 on the week before.");
    expect(ask.state).toContain("Accounts you follow: @alpha gained 150 followers");
    expect(ask.questions.move).toMatchObject({ type: "choice", criteria: { pattern: moves[0].text, rival: moves[4].text } });
    expect(moveAsk("x", moves.slice(0, 1))).toBeNull();
    expect(pickedMove({ move: { type: "choice", choice: "cadence" } }, moves)).toEqual(moves[3]);
    expect(pickedMove({ move: { type: "choice", choice: "cadence" } }, moves.slice(0, 2))).toBeNull();
    expect(pickedMove({ move: { type: "choice", choice: "write a thread" } }, moves)).toBeNull();
    expect(pickedMove(null, moves)).toBeNull();
  });
});

describe("moveBody (week-pick's input)", () => {
  const moves = [{ id: "reuse", text: "Reuse it" }, { id: "numbers", text: "Add numbers" }];
  it("takes facts and 2 to 5 known moves", () => {
    expect(moveBody({ facts: "3 posts\nmore\u0007", moves })).toEqual({ facts: "3 posts\nmore ", moves });
    expect(moveBody({ facts: "x".repeat(3000), moves })!.facts.length).toBe(2500);
    expect(moveBody({ facts: "x", moves: [moves[0], { id: "rival", text: `@a ${"y".repeat(300)}` }] })!.moves[1].text.length).toBe(240);
  });
  it("refuses anything else", () => {
    for (const body of [
      null,
      { facts: 3, moves },
      { facts: "x", moves: moves.slice(0, 1) },
      { facts: "x", moves: [moves[0], moves[0]] },
      { facts: "x", moves: [moves[0], { id: "hack", text: "y" }] },
      { facts: "x", moves: [moves[0], { id: "rival", text: " " }] },
      { facts: "x", moves: [...moves, ...moves, moves[0]] },
    ]) expect(moveBody(body), JSON.stringify(body)).toBeNull();
  });
});

describe("the names in the report", () => {
  it("match the names the app shows", () => {
    expect(HOOK_NAME).toEqual(Object.fromEntries(HOOK_FORMULAS.map((f) => [f.id, f.name])));
    for (const [k, v] of Object.entries(PILLAR_NAME)) expect(labelForDimension("pillar", k)).toBe(v);
    for (const k of Object.keys(FORMAT_NOUN)) expect(labelForDimension("format", k)).not.toBe(k);
  });
});

describe("marketAlert: the weekly Your market reminder", () => {
  const MON_9AM = sg(2026, 10, 12, 9);
  const digest = (checkedAt: string) => ({ checkedAt, news: [], geo: [], posts: [] });
  const market = (checks: object[] = [], over: object = {}) => JSON.stringify({ audience: "Young families", questions: ["Is CPF enough for us?"], checks, ...over });
  const withMarket = (raw: string | undefined, id = "me") => profilesFrom(UID, raw === undefined ? {} : { [`content-studio-market-${id === "me" ? UID : `${UID}~${id}`}`]: raw });
  const message = { title: "This week's market check is open", body: "See the news and client questions to post about this week.", url: "/market", tag: "market", ttl: 43200 };

  it("reads the set-up and the latest check from the synced key", () => {
    expect(withMarket(market([digest("2026-10-01T02:00:00Z"), digest("2026-10-05T02:00:00Z")]))[0].market).toEqual({ ready: true, lastCheck: "2026-10-05T02:00:00Z" });
    expect(withMarket(market([], { audience: "" }))[0].market).toEqual({ ready: false, lastCheck: null });
    expect(withMarket("{junk")[0].market).toBeUndefined();
    expect(withMarket(undefined)[0].market).toBeUndefined();
  });

  it("Monday from 9am, once a week, when the week's check is open", () => {
    expect(marketAlert(withMarket(market([digest("2026-10-05T02:00:00Z")])), MON_9AM, true)).toEqual({ item: "market:2026-10-12", message });
    expect(marketAlert(withMarket(market()), MON_9AM, true)?.item).toBe("market:2026-10-12");
  });

  it("not while this week's check is used, not before 9am or on other days, not without a set-up, not when switched off", () => {
    expect(marketAlert(withMarket(market([digest("2026-10-08T02:00:00Z")])), MON_9AM, true)).toBeNull();
    expect(marketAlert(withMarket(market()), MON_9AM - 60_000, true)).toBeNull();
    expect(marketAlert(withMarket(market()), sg(2026, 10, 13, 9), true)).toBeNull();
    expect(marketAlert(withMarket(market([], { audience: "" })), MON_9AM, true)).toBeNull();
    expect(marketAlert(withMarket(undefined), MON_9AM, true)).toBeNull();
    expect(marketAlert(withMarket(market()), MON_9AM, false)).toBeNull();
  });

  it("goes when any set-up profile's week is open, since each profile has its own check", () => {
    const two = (me: object[], mb: object[]) => profilesFrom(UID, {
      [`content-studio-profiles-${UID}`]: JSON.stringify([{ id: "me", name: "Me" }, { id: "mb", name: "MoneyBees" }]),
      [`content-studio-market-${UID}`]: market(me),
      [`content-studio-market-${UID}~mb`]: market(mb),
    });
    expect(marketAlert(two([], [digest("2026-10-09T02:00:00Z")]), MON_9AM, true)?.item).toBe("market:2026-10-12");
    expect(marketAlert(two([digest("2026-10-10T02:00:00Z")], [digest("2026-10-09T02:00:00Z")]), MON_9AM, true)).toBeNull();
  });
});

describe("the Monday email's Your market line", () => {
  const MON_8AM_SG = sg(2026, 10, 12, 8);
  const ready = profilesFrom(UID, { [`content-studio-market-${UID}`]: JSON.stringify({ audience: "Young families", questions: ["Is CPF enough for us?"], checks: [] }) });
  const usedThisWeek = profilesFrom(UID, { [`content-studio-market-${UID}`]: JSON.stringify({ audience: "Young families", questions: ["Is CPF enough for us?"], checks: [{ checkedAt: "2026-10-09T02:00:00Z", news: [], geo: [], posts: [] }] }) });

  it("is open for an allowed account with a set-up profile whose week is unused, whatever the hour", () => {
    expect(marketOpen(ready, MON_8AM_SG, true)).toBe(true);
    expect(marketOpen(usedThisWeek, MON_8AM_SG, true)).toBe(false);
    expect(marketOpen(ready, MON_8AM_SG, false)).toBe(false);
  });

  it("adds the line with the link only when the check is open", () => {
    const line = "Your market: this week's check is open. See the news and client questions to post about: https://consultant-content-studio.vercel.app/market";
    expect(weeklyEmail(ready, MON_8AM_SG, {}, true)!.text).toContain(line);
    expect(weeklyEmail(ready, MON_8AM_SG, {}, false)!.text).not.toContain("Your market");
    expect(weeklyEmail(ready, MON_8AM_SG)!.text).not.toContain("Your market");
  });
});

describe("What moved (find-alerts-digest)", () => {
  const DAY = 86_400_000;
  const MON_9AM = sg(2026, 10, 12, 9);
  const at = (daysAgo: number, now = MON_9AM) => new Date(now - daysAgo * DAY).toISOString();
  const reel = (id: string, daysAgo: number, views: number | null, over: object = {}) => ({
    id, url: `https://www.instagram.com/reel/${id}/`, format: "video", caption: `Caption ${id}`, postedAt: at(daysAgo), views, likes: 5, comments: 1, ...over,
  });
  /** Five settled reels at 1,000 views, so the account's usual is 1,000. */
  const usual = [10, 12, 14, 16, 18].map((d, i) => reel(`u${i}`, d, 1000));
  const followed = (posts: object[], over: object = {}): Followed => ({ platform: "instagram", handle: "rival", history: [], posts, ...over } as Followed);
  const kinds = (fs: Finding[]) => fs.map((f) => f.id);

  describe("followedFrom (through profilesFrom)", () => {
    it("keeps each post's id, link, words and numbers, and the fresh ids", () => {
      const [me] = profilesFrom(UID, {
        [`content-studio-following-${UID}`]: JSON.stringify([
          { platform: "tiktok", handle: "rival", history: [], fresh: ["p1", 7], posts: [{ id: "p1", url: "https://www.tiktok.com/@rival/video/1", format: "video", caption: "Line one\nline two", postedAt: "2026-10-08T00:00:00Z", views: 900, likes: 30, comments: 2 }, { id: "p2", postedAt: null, views: null }] },
        ]),
      });
      expect(me.followed![0].fresh).toEqual(["p1"]);
      expect(me.followed![0].posts).toEqual([
        { id: "p1", url: "https://www.tiktok.com/@rival/video/1", format: "video", caption: "Line one line two", postedAt: "2026-10-08T00:00:00Z", views: 900, likes: 30, comments: 2 },
        { id: "p2", url: "", format: "", caption: "", postedAt: null, views: null, likes: 0, comments: 0 },
      ]);
    });

    it("still reads a list stored before posts had ids or fresh", () => {
      const [me] = profilesFrom(UID, { [`content-studio-following-${UID}`]: JSON.stringify([{ platform: "instagram", handle: "old", history: [], posts: [{ postedAt: "2026-10-07T00:00:00Z" }] }]) });
      expect(me.followed).toEqual([{ platform: "instagram", handle: "old", history: [], posts: [{ postedAt: "2026-10-07T00:00:00Z" }] }]);
      expect(briefFindings(me, MON_9AM)).toEqual([]);
    });

    it("reads Their posts and Their ads only when their keys exist, and the brand's facts from positioning", () => {
      expect(profilesFrom(UID, {})[0]).not.toHaveProperty("competitorAds");
      const [me] = profilesFrom(UID, {
        [`content-studio-competitor-ads-${UID}`]: JSON.stringify({
          "acme-x1": { checkedAt: "2026-10-10T00:00:00Z", pageName: "Acme", ads: [{ id: "a1", start: "2026-10-01" }, { id: "a2", start: "2026-10-09" }], fresh: ["a1", "a2"] },
          "quiet-x2": { checkedAt: "2026-10-10T00:00:00Z", pageName: "Quiet", ads: [], fresh: [] },
          broken: "x",
        }),
        [`content-studio-competitor-posts-${UID}`]: JSON.stringify({ "acme-x1:instagram": { platform: "instagram", handle: "acme", history: [], posts: [] } }),
        [`content-studio-positioning-${UID}`]: JSON.stringify({ oneLiner: "A sales app.", edge: "Built for field reps", audience: "general", audienceDetail: "" }),
        [`content-studio-market-${UID}`]: JSON.stringify({ audience: "Sales teams in Singapore" }),
      });
      expect(me.competitorAds).toEqual([{ competitorId: "acme-x1", name: "Acme", checkedAt: "2026-10-10T00:00:00Z", fresh: ["a1", "a2"], newest: "a2" }]);
      expect(me.competitorPosts).toEqual([{ platform: "instagram", handle: "acme", history: [], posts: [] }]);
      expect(me.brand).toEqual({ sells: "A sales app. Built for field reps", serves: "Sales teams in Singapore" });
    });
  });

  describe("briefFindings", () => {
    it("finds a followed post at exactly 3x its account's usual views, and none at 2.9x", () => {
      expect(kinds(briefFindings(profile({ followed: [followed([...usual, reel("hit", 3, 3000)])] }), MON_9AM))).toEqual(["outlier:instagram:hit"]);
      expect(briefFindings(profile({ followed: [followed([...usual, reel("hit", 3, 2900)])] }), MON_9AM)).toEqual([]);
    });

    it("needs 5 other posts with views to compare with", () => {
      expect(briefFindings(profile({ followed: [followed([...usual.slice(1), reel("hit", 3, 9000)])] }), MON_9AM)).toEqual([]);
    });

    it("skips posts under 48 hours old and over 7 days old", () => {
      for (const days of [1.9, 7.1]) expect(briefFindings(profile({ followed: [followed([...usual, reel("hit", days, 9000)])] }), MON_9AM)).toEqual([]);
      expect(briefFindings(profile({ followed: [followed([...usual, reel("hit", 2.1, 9000)])] }), MON_9AM)).toHaveLength(1);
    });

    it("scores competitors' posts the same way, picture posts on likes and comments", () => {
      const pic = (id: string, daysAgo: number, likes: number) => ({ id, url: `https://www.instagram.com/p/${id}/`, format: "image", caption: "", postedAt: at(daysAgo), views: null, likes, comments: 0 });
      const comp = followed([...[10, 12, 14, 16, 18].map((d, i) => pic(`c${i}`, d, 100)), pic("chit", 3, 400)], { handle: "acme" });
      const [f] = briefFindings(profile({ competitorPosts: [comp] }), MON_9AM);
      expect(findingLine(f)).toBe("@acme's post did 4x their usual engagement.");
    });

    it("makes one New ad finding per competitor with ads new on a check in the last 7 days", () => {
      const ads = [
        { competitorId: "a", name: "Acme", checkedAt: at(2), fresh: ["1"], newest: "1" },
        { competitorId: "b", name: "Beta", checkedAt: at(3), fresh: ["2", "3", "4"], newest: "4" },
        { competitorId: "c", name: "Stale", checkedAt: at(8), fresh: ["5"], newest: "5" },
      ];
      const fs = briefFindings(profile({ competitorAds: ads }), MON_9AM);
      expect(kinds(fs)).toEqual(["ad:b", "ad:a"]);
      expect(fs.map(findingLine)).toEqual(["Beta started 3 new ads this week.", "Acme started 1 new ad this week."]);
    });

    it("finds your own post of the last 7 days at 2x the median of the 8 weeks before, and not at 1.9x", () => {
      const mine = (id: string, daysAgo: number, reactions: number) => post({ id, status: "posted", postedAt: at(daysAgo), metrics: { reactions } });
      const before = [mine("b1", 10, 10), mine("b2", 20, 20), mine("b3", 40, 30), mine("old", 70, 1)];
      expect(kinds(briefFindings(profile({ posts: [...before, mine("w", 3, 40)] }), MON_9AM))).toEqual(["post:w"]);
      expect(briefFindings(profile({ posts: [...before, mine("w", 3, 38)] }), MON_9AM)).toEqual([]);
      // fewer than 3 posts with numbers before: no usual to beat
      expect(briefFindings(profile({ posts: [...before.slice(1), mine("w", 3, 400)] }), MON_9AM)).toEqual([]);
    });

    it("finds the fastest-growing account only at 3% and 250 followers", () => {
      const grew = (from: number, to: number) =>
        briefFindings(profile({ followed: [followed([], { history: [{ at: at(9), followers: from }, { at: at(2), followers: to }] })] }), MON_9AM);
      expect(grew(5000, 5250).map(findingLine)).toEqual(["@rival gained 250 followers this week."]);
      expect(grew(10000, 10250)).toEqual([]); // 2.5%
      expect(grew(1000, 1240)).toEqual([]); // 240
    });

    it("orders Outlier, Your post, New ad, Growing and asks about 10 at most", () => {
      const many = Array.from({ length: 12 }, (_, i) => ({ competitorId: `c${i}`, name: `C${i}`, checkedAt: at(1), fresh: ["x"], newest: "x" }));
      const fs = briefFindings(
        profile({ competitorAds: many, followed: [followed([...usual, reel("hit", 3, 5000)], { history: [{ at: at(9), followers: 5000 }, { at: at(2), followers: 6000 }] })] }),
        MON_9AM,
      );
      expect(fs).toHaveLength(BRIEF_ASK);
      expect(fs[0].kind).toBe("outlier");
    });
  });

  const hit = (over: object = {}) => briefFindings(profile({ followed: [followed([...usual, reel("hit", 3, 4100, { caption: "3 CPF mistakes at 25 that cost you later", ...over })])] }), MON_9AM)[0];
  const ad: Finding = { kind: "ad", id: "ad:acme", name: "Acme", n: 2, ad: "123" };
  const growing: Finding = { kind: "growing", id: "growing:instagram:jo", handle: "jo", gained: 1240 };

  describe("the words and links", () => {
    it("says what moved in the spec's lines", () => {
      expect(findingLine(hit())).toBe(`@rival's reel did 4.1x their usual views. "3 CPF mistakes at 25 that cost you later"`);
      expect(findingLine(growing)).toBe("@jo gained 1,240 followers this week.");
    });

    it("sends a video to Clone a reel and anything else to Write with the MAS line", () => {
      const video = hit();
      expect(findingUrl(video)).toBe(links.clone({ url: "https://www.instagram.com/reel/hit/" }));
      const picture = hit({ format: "image", caption: "Why your CPF is not enough. And what to do." });
      const url = findingUrl(picture);
      expect(url).toBe(
        links.generate({
          pillar: "topic",
          detail: "Why your CPF is not enough",
          ctx: `A post by @rival did 4.1x their usual views. What it says: "Why your CPF is not enough. And what to do.". Write my own take in my voice. Do not copy its wording. No promised returns, no named insurer products, no invented numbers.`,
          source: "follow:instagram:hit",
        }),
      );
      const own = findingUrl({ kind: "post", id: "post:a", post: post({ id: "a", hook: "Why I stopped selling", format: "text-post" }), ratio: 2.3 });
      expect(new URLSearchParams(own.split("?")[1]).get("ctx")).toBe(
        `My post "Why I stopped selling" did 2.3x my usual engagement. Write a new post on the same idea in a different format. No promised returns, no named insurer products, no invented numbers.`,
      );
      expect(new URLSearchParams(own.split("?")[1]).get("format")).toBe("carousel");
      expect(new URLSearchParams(findingUrl({ kind: "post", id: "post:b", post: post({ id: "b", format: "carousel" }), ratio: 2 }).split("?")[1]).get("format")).toBe("text-post");
      expect(findingUrl(ad)).toBe(links.competitors({ ad: "123" }));
      expect(findingUrl(growing)).toBe(links.following());
    });

    it("writes the WHAT MOVED block, and nothing for a single finding", () => {
      expect(briefLines([hit(), growing])).toEqual([
        "WHAT MOVED",
        `1. Outlier: @rival's reel did 4.1x their usual views. "3 CPF mistakes at 25 that cost you later"`,
        `   Make this: ${APP_URL}/clone?url=https%3A%2F%2Fwww.instagram.com%2Freel%2Fhit%2F`,
        "2. Growing: @jo gained 1,240 followers this week.",
        `   See them: ${APP_URL}/following`,
      ]);
      expect(briefLines([hit()])).toEqual([]);
      expect(briefLines([hit(), ad, growing]).join("\n")).toMatch(/^[\x20-\x7e\n]*$/);
    });
  });

  describe("Jev's pick", () => {
    const items = [hit(), ad, growing].map((f) => ({ id: f.id, kind: f.kind, line: findingLine(f) }));

    it("asks one yes or no per finding about this brand, never about a financial adviser", () => {
      const ask = briefAsk(items, { sells: "A sales app.", serves: "Self-employed salespeople" });
      expect(Object.keys(ask.questions)).toEqual(["f0", "f1", "f2"]);
      expect(Object.values(ask.questions).every((q) => q.type === "noul")).toBe(true);
      expect(ask.state).toBe(
        [
          "A business posts on social media to win clients.",
          "What it sells: A sales app.",
          "Who it serves: Self-employed salespeople.",
          "This week's findings:",
          `1. Outlier: ${items[0].line}`,
          "2. New ad: Acme started 2 new ads this week.",
          "3. Growing: @jo gained 1,240 followers this week.",
        ].join("\n"),
      );
      expect(briefAsk(items).state.startsWith("A business posts on social media to win clients.\nThis week's findings:")).toBe(true);
      expect(JSON.stringify(briefAsk(items))).not.toMatch(/adviser/i);
    });

    it("keeps 0.5 and up, surest first, at most 5, and falls back to the fixed order without an answer", () => {
      const seven = Array.from({ length: 7 }, (_, i) => `f${i}`);
      const yes = (...ps: number[]) => Object.fromEntries(ps.map((p, i) => [`f${i}`, { type: "noul" as const, noul: p }]));
      expect(pickedFindings(yes(0.49, 0.5, 0.9, 0.2), seven)).toEqual(["f2", "f1"]);
      expect(pickedFindings(yes(0.6, 0.7, 0.8, 0.9, 0.95, 0.55, 0.65), seven)).toEqual(["f4", "f3", "f2", "f1", "f6"]);
      expect(pickedFindings(null, seven)).toEqual(["f0", "f1", "f2", "f3", "f4"]);
    });

    it("checks week-pick's brief body", () => {
      expect(briefBody({ findings: items, brand: { sells: "x", serves: 5 } })).toEqual({ items, brand: { sells: "x", serves: "" } });
      for (const bad of [null, { findings: items.slice(0, 1) }, { findings: [...items, items[0]] }, { findings: [items[0], { ...items[1], kind: "rumour" }] }, { findings: Array.from({ length: 11 }, (_, i) => ({ ...items[0], id: `x${i}` })) }]) {
        expect(briefBody(bad)).toBeNull();
      }
    });
  });

  describe("the email block", () => {
    const week = [post({ id: "a", hook: "CPF at 55", status: "posted", postedAt: "2026-10-06T03:00:00.000Z", metrics: { reactions: 4 } })];

    it("opens the email with WHAT MOVED and leaves the rest as it was", () => {
      const plain = weeklyEmail([profile({ posts: week })], MON_8AM)!;
      const email = weeklyEmail([profile({ posts: week })], MON_8AM, {}, false, { me: [hit(), growing] })!;
      expect(email.text.startsWith("WHAT MOVED\n1. Outlier: @rival's reel")).toBe(true);
      expect(email.text).toBe([...briefLines([hit(), growing]), "", plain.text].join("\n"));
      expect(email.subject).toBe(plain.subject);
    });

    it("puts it under the brand's name, shows a brand that has only findings, and skips a thin week", () => {
      const brands = [profile({ posts: week }), profile({ id: "pat", name: "ActivityTracker" })];
      const email = weeklyEmail(brands, MON_8AM, {}, false, { pat: [ad, growing] })!;
      expect(email.text).toContain("\nACTIVITYTRACKER\n\nWHAT MOVED\n1. New ad: Acme started 2 new ads this week.\n");
      expect(weeklyEmail(brands, MON_8AM, {}, false, { pat: [ad], me: [growing] })!.text).toBe(weeklyEmail(brands, MON_8AM)!.text);
    });
  });

  describe("the phone alert", () => {
    const at10 = sg(2026, 10, 12, 10);
    const fresh = (days: number, fr = ["hit"]) => [profile({ followed: [followed([...usual.map((p) => ({ ...p, postedAt: at(Number(p.id.slice(1)) + 10, at10) })), reel("hit", 0, 4100, { postedAt: at(days, at10) })], { fresh: fr })] })];

    it("takes followed posts new on the last check, 2 to 5 days old", () => {
      expect(outlierHits(fresh(3), at10).map((h) => h.id)).toEqual(["outlier:instagram:hit"]);
      expect(outlierHits(fresh(5.1), at10)).toEqual([]);
      expect(outlierHits(fresh(3, []), at10)).toEqual([]);
    });

    it("sends one from 9am to 9pm Singapore, refused once the day's alert is claimed", () => {
      const hits = outlierHits(fresh(3), at10);
      expect(outlierAlert(hits, at10, new Set())).toEqual({
        items: ["alert-day:2026-10-12", "outlier:instagram:hit"],
        message: { title: "@rival posted a hit", body: "4.1x their usual views. Tap to make your own.", url: findingUrl(hits[0]), tag: "outlier", ttl: 10800 },
      });
      expect(outlierAlert(hits, sg(2026, 10, 12, 8, 59), new Set())).toBeNull();
      expect(outlierAlert(hits, sg(2026, 10, 12, 21), new Set())).toBeNull();
      expect(outlierAlert(hits, sg(2026, 10, 12, 20, 59), new Set())).not.toBeNull();
      expect(outlierAlert(hits, at10, new Set([alertDay(at10)]))).toBeNull();
      expect(outlierAlert(hits, at10, new Set(["outlier:instagram:hit"]))).toBeNull();
    });
  });
});
