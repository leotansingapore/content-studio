import { describe, expect, it } from "vitest";
import { weekProgress as appWeekProgress } from "@/lib/goals";
import type { DraftEntry } from "@/lib/draftHistory";
import {
  APP_URL,
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

  it("gives an account with nothing synced one empty profile", () => {
    expect(profilesFrom(UID, {})).toEqual([{ id: "me", name: "Me", posts: [], goals: {} }]);
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

  it("reports last week against the goal, the best post and this week's schedule", () => {
    const email = weeklyEmail([profile({ goals: { linkedin: 4 }, posts: [...lastWeek, ...coming] })], MON_8AM)!;
    expect(email.subject).toBe("Last week: 3 of 4 posted");
    expect(email.text).toBe(
      [
        "Last week, 5 Oct to 11 Oct",
        "3 of 4 posted.",
        'Best post: "Your CPF at 55" (1,240 impressions, 38 reactions, 6 comments)',
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

  it("says so when the goal was met, when nothing has numbers and when nothing is scheduled", () => {
    const met = weeklyEmail([profile({ goals: { linkedin: 2 }, posts: lastWeek.slice(2) })], MON_8AM)!;
    expect(met.subject).toBe("Last week: 1 of 2 posted");
    expect(met.text).toContain("Log the numbers for last week's posts in My posts to see your best one.");
    expect(met.text).toContain("This week\nNothing scheduled yet.");
    const exact = weeklyEmail([profile({ goals: { linkedin: 3 }, posts: lastWeek })], MON_8AM)!;
    expect(exact.subject).toBe("Last week: goal met, 3 of 3 posted");
    expect(exact.text).toContain("\nGoal met: 3 of 3 posted.\n");
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
    const email = weeklyEmail([profile({ goals: { linkedin: 4 }, posts: [...lastWeek, ...coming] })], MON_8AM)!;
    expect(`${email.subject}\n${email.text}`).toMatch(/^[\x20-\x7e\n]*$/);
  });
});
