import { describe, expect, it } from "vitest";
import { weekProgress as appWeekProgress } from "@/lib/goals";
import type { DraftEntry } from "@/lib/draftHistory";
import { HOOK_FORMULAS } from "@/lib/hookFormulas";
import { labelForDimension } from "@/lib/analytics";
import {
  APP_URL,
  FORMAT_NOUN,
  HOOK_NAME,
  PILLAR_NAME,
  moveAsk,
  moveBody,
  moverLine,
  pickedMove,
  reportFacts,
  sharedLine,
  weekMoves,
  weekReport,
  type Followed,
  dueAt,
  dueMessage,
  duePosts,
  goalAlert,
  isPushEndpoint,
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
    expect(parsePrefs('{"email":true,"push":false}')).toEqual({ email: true, push: false });
    expect(parsePrefs('{"email":"true","push":1}')).toEqual({ email: false, push: false });
    expect(parsePrefs("not json")).toEqual({ email: false, push: false });
    expect(parsePrefs(null)).toEqual({ email: false, push: false });
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
