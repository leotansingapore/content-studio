import { describe, expect, it } from "vitest";
import { BUDGET_MS, confirmedEmail, EMAIL_RETAKE, PAGE, runAlerts, runPage, runUser, type Deps, type Options, type Sub } from "./run";
import type { Zernio } from "../_shared/zernio";
import type { JevAnswer } from "../_shared/jev";
import before from "./fixtures/busy-week-before.json";

const UID = "3f2b6c1e-8a4d-4c2b-9f1e-2a3b4c5d6e7f";
const sg = (y: number, m: number, d: number, h = 0, min = 0) => Date.UTC(y, m - 1, d, h - 8, min);
const MON_8AM = sg(2026, 10, 12, 8); // a Monday
const THU_6PM = sg(2026, 10, 8, 18); // a Thursday
const DAY = 86_400_000;

const sub = (id: number, ageDays: number, now: number): Sub => ({
  id,
  endpoint: `https://fcm.googleapis.com/fcm/send/d${id}`,
  p256dh: "B".repeat(87),
  auth: "k".repeat(22),
  updated_at: new Date(now - ageDays * DAY).toISOString(),
});

/** Synced rows for one adviser: a goal of 3 a week and one post due at 6:30pm Thursday. */
const rows = {
  [`content-studio-goals-${UID}`]: JSON.stringify({ linkedin: 3 }),
  [`content-studio-drafts-${UID}`]: JSON.stringify([{ id: "p1", hook: "Due one", platform: "linkedin", status: "scheduled", scheduledFor: "2026-10-08T18:30" }]),
};

function fake(over: Partial<Deps> & { subsList?: Sub[]; user?: object | null; sent?: boolean; delivered?: number; answers?: Record<string, JevAnswer> | null } = {}) {
  const calls: string[] = [];
  const log = (s: string) => calls.push(s);
  let t = 0;
  const deps: Deps = {
    listPrefs: async () => [],
    userRows: async () => rows,
    subs: async () => (log("subs"), over.subsList ?? []),
    authUser: async () => (log("authUser"), over.user === undefined ? { email: "ada@example.test", email_confirmed_at: "2026-01-01" } : (over.user as never)),
    logged: async (_u, items) => (log(`logged ${items}`), new Set()),
    claim: async (_u, items, retake) => (log(`claim ${items} ${retake}`), new Set(items)),
    markSent: async (_u, items) => void log(`markSent ${items}`),
    sendPush: async (subs, m) => (log(`push ${subs.map((s) => s.id)} ${m.title}`), over.delivered ?? subs.length),
    sendEmail: async (to, e, key) => (log(`email ${to} ${key}`), over.sent ?? true),
    pick: async (_u, ask) => (log(`pick ${Object.keys(ask.questions)}`), over.answers ?? null),
    briefPick: async (_u, ask) => (log(`briefPick ${Object.keys(ask.questions)}`), null),
    next: async (b) => void log(`next ${JSON.stringify(b)}`),
    clock: () => t,
    ...over,
  };
  return { deps, calls, tick: (ms: number) => (t += ms) };
}

const opts = (over: Partial<Options> = {}): Options => ({
  dryRun: false,
  now: MON_8AM,
  only: null,
  after: null,
  upTo: null,
  testTo: null,
  ...over,
});
const both = { email: true, push: true };

describe("confirmedEmail", () => {
  it("gives the address only once it is confirmed", () => {
    expect(confirmedEmail({ email: "a@x.test", email_confirmed_at: "2026-01-01" })).toBe("a@x.test");
    expect(confirmedEmail({ email: "a@x.test", confirmed_at: "2026-01-01" })).toBe("a@x.test");
    expect(confirmedEmail({ email: "a@x.test", email_confirmed_at: null, confirmed_at: null })).toBeNull();
    expect(confirmedEmail({ email_confirmed_at: "2026-01-01" })).toBeNull();
    expect(confirmedEmail(null)).toBeNull();
  });

  it("never mails the shared demo logins on demo.com", () => {
    expect(confirmedEmail({ email: "user@demo.com", email_confirmed_at: "2026-01-01" })).toBeNull();
    expect(confirmedEmail({ email: "Admin@Demo.com", email_confirmed_at: "2026-01-01" })).toBeNull();
    expect(confirmedEmail({ email: "user@notdemo.com", email_confirmed_at: "2026-01-01" })).toBe("user@notdemo.com");
  });
});

describe("runUser: the Monday email", () => {
  it("claims with a 30-minute retake, sends to the confirmed address and marks it sent", async () => {
    const { deps, calls } = fake();
    const r = await runUser(deps, UID, { email: true, push: false }, opts());
    expect(calls).toEqual([
      "authUser",
      `claim email:2026-10-12 ${EMAIL_RETAKE}`,
      `email ada@example.test cs-email:2026-10-12-${UID}`,
      "markSent email:2026-10-12",
    ]);
    expect(r.email).toMatchObject({ to: "a***@example.test", sent: true });
  });

  it("never mails an unconfirmed address, and claims nothing for it", async () => {
    const { deps, calls } = fake({ user: { email: "victim@example.test", email_confirmed_at: null } });
    const r = await runUser(deps, UID, { email: true, push: false }, opts());
    expect(calls).toEqual(["authUser"]);
    expect(r.email).toEqual({ skipped: "no confirmed sign-in email" });
  });

  it("a failed send stays unmarked, so the claim is taken again next hour", async () => {
    const { deps, calls } = fake({ sent: false });
    await runUser(deps, UID, { email: true, push: false }, opts());
    expect(calls.some((c) => c.startsWith("markSent"))).toBe(false);
  });

  it("a claim another run holds means no send", async () => {
    const { deps, calls } = fake({ claim: async () => new Set() });
    await runUser(deps, UID, { email: true, push: false }, opts());
    expect(calls.some((c) => c.startsWith("email"))).toBe(false);
  });
});

describe("runUser: the one move for the week (g44)", () => {
  // last week: two posts with numbers and one without, so reuse and numbers are both on offer
  const week = {
    [`content-studio-goals-${UID}`]: JSON.stringify({ linkedin: 3 }),
    [`content-studio-drafts-${UID}`]: JSON.stringify([
      { id: "a", hook: "CPF at 55", platform: "linkedin", status: "posted", postedAt: "2026-10-06T03:00:00.000Z", metrics: { impressions: 900, reactions: 40 } },
      { id: "b", hook: "Term or whole", platform: "linkedin", status: "posted", postedAt: "2026-10-08T03:00:00.000Z", metrics: { impressions: 400, reactions: 5 } },
      { id: "c", hook: "Bonus", platform: "linkedin", status: "posted", postedAt: "2026-10-09T03:00:00.000Z" },
    ]),
  };
  const choice = (id: string) => ({ move: { type: "choice" as const, choice: id } });

  it("asks Jev once the email is claimed, and writes the move it picked", async () => {
    const { deps, calls } = fake({ userRows: async () => week, answers: choice("numbers") });
    const r = await runUser(deps, UID, { email: true, push: false }, opts());
    expect(calls).toEqual(["authUser", `claim email:2026-10-12 ${EMAIL_RETAKE}`, "pick move", `email ada@example.test cs-email:2026-10-12-${UID}`, "markSent email:2026-10-12"]);
    expect((r.email as { text: string }).text).toContain("\nOne thing this week: Add the numbers for 1 recent post with none yet.\n");
  });

  it("sends with no move when Jev has no answer", async () => {
    const { deps, calls } = fake({ userRows: async () => week, answers: null });
    const r = await runUser(deps, UID, { email: true, push: false }, opts());
    expect(calls).toContain(`email ada@example.test cs-email:2026-10-12-${UID}`);
    expect((r.email as { text: string }).text).not.toContain("One thing");
  });

  it("never asks for an email it will not send", async () => {
    for (const over of [{ claim: async () => new Set<string>() }, { user: { email: "x@example.test", email_confirmed_at: null } }]) {
      const { deps, calls } = fake({ userRows: async () => week, ...over });
      await runUser(deps, UID, { email: true, push: false }, opts());
      expect(calls.some((c) => c.startsWith("pick"))).toBe(false);
    }
  });
});

describe("runUser: a test send", () => {
  it("mails only the test inbox, sends no phone alert, and claims, logs or marks nothing", async () => {
    const { deps, calls } = fake({ subsList: [sub(1, 0, THU_6PM)] });
    const r = await runUser(deps, UID, both, opts({ testTo: "delivered@resend.dev", now: MON_8AM }));
    expect(calls).toEqual([`email delivered@resend.dev cs-email:2026-10-12-${UID}-test`]);
    expect(r.push).toEqual([]);
  });

  it("does the same on a Thursday evening with a post due: no push at all", async () => {
    const { deps, calls } = fake({ subsList: [sub(1, 0, THU_6PM)] });
    await runUser(deps, UID, both, opts({ testTo: "delivered@resend.dev", now: THU_6PM }));
    expect(calls).toEqual([]);
  });
});

describe("runUser: phone alerts", () => {
  it("claims for good (no retake), pushes to fresh devices only, then marks sent", async () => {
    const { deps, calls } = fake({ subsList: [sub(1, 0, THU_6PM), sub(2, 61, THU_6PM), sub(3, 59, THU_6PM)] });
    const r = await runUser(deps, UID, { email: false, push: true }, opts({ now: THU_6PM }));
    expect(calls).toEqual([
      "subs",
      "claim due:me:p1:2026-10-08T18:30,goal:2026-10-08 null",
      "push 1,3 Due at 6:30pm",
      "markSent due:me:p1:2026-10-08T18:30",
      "push 1,3 This week's goal is behind",
      "markSent goal:2026-10-08",
    ]);
    expect(r.push).toHaveLength(2);
  });

  it("claims nothing when every device is stale", async () => {
    const { deps, calls } = fake({ subsList: [sub(2, 61, THU_6PM)] });
    await runUser(deps, UID, { email: false, push: true }, opts({ now: THU_6PM }));
    expect(calls).toEqual(["subs"]);
  });

  it("an alert no device took is not marked sent (and not retried)", async () => {
    const { deps, calls } = fake({ subsList: [sub(1, 0, THU_6PM)], delivered: 0 });
    await runUser(deps, UID, { email: false, push: true }, opts({ now: THU_6PM }));
    expect(calls.filter((c) => c.startsWith("markSent"))).toEqual([]);
    expect(calls.filter((c) => c.startsWith("claim"))).toHaveLength(1);
  });
});

describe("runUser: a dry run", () => {
  it("reads the log but claims, sends and marks nothing", async () => {
    const { deps, calls } = fake({ subsList: [sub(1, 0, THU_6PM)] });
    const r = await runUser(deps, UID, both, opts({ dryRun: true, now: THU_6PM }));
    expect(calls).toEqual(["subs", "logged due:me:p1:2026-10-08T18:30,goal:2026-10-08"]);
    expect(r.push).toHaveLength(2);
  });
});

describe("runPage", () => {
  const pref = (n: number, data = '{"email":true,"push":false}') => {
    const uid = `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
    return { user_id: uid, key: `content-studio-notify-${uid}`, data };
  };
  const full = Array.from({ length: PAGE }, (_, i) => pref(i + 1));

  it("starts the next page before working on this one", async () => {
    const { deps, calls } = fake({ listPrefs: async () => full });
    const r = await runPage(deps, opts());
    expect(calls[0]).toBe(`next ${JSON.stringify({ after: full[PAGE - 1].user_id })}`);
    expect(r.next).toBe(full[PAGE - 1].user_id);
    expect(calls.filter((c) => c.startsWith("email"))).toHaveLength(PAGE);
  });

  it("past the budget, hands the rest of the page to a fresh request and stops", async () => {
    const f = fake({ listPrefs: async () => full });
    f.deps.sendEmail = async () => (f.tick(BUDGET_MS / 2 + 1), true);
    const r = await runPage(f.deps, opts());
    expect(r.handedOff).toBe(true);
    expect(f.calls.filter((c) => c.startsWith("next"))).toEqual([
      `next ${JSON.stringify({ after: full[PAGE - 1].user_id })}`,
      `next ${JSON.stringify({ job: "social" })}`,
      `next ${JSON.stringify({ after: full[1].user_id, upTo: full[PAGE - 1].user_id })}`,
    ]);
    expect(f.calls.filter((c) => c.startsWith("authUser"))).toHaveLength(2);
  });

  it("a hand-off works up to its page end and starts no next page", async () => {
    const { deps, calls } = fake({ listPrefs: async () => full });
    await runPage(deps, opts({ after: "x", upTo: full[PAGE - 1].user_id }));
    expect(calls.some((c) => c.startsWith("next"))).toBe(false);
  });

  it("a dry run, a test send and a single adviser never chain", async () => {
    for (const o of [opts({ dryRun: true }), opts({ only: full[0].user_id, testTo: "delivered@resend.dev" }), opts({ only: full[0].user_id })]) {
      const f = fake({ listPrefs: async () => full });
      f.deps.sendEmail = async () => (f.tick(BUDGET_MS), true);
      const r = await runPage(f.deps, o);
      expect(f.calls.some((c) => c.startsWith("next"))).toBe(false);
      expect(r.handedOff).toBe(false);
    }
  });

  it("skips switches that are off and keys naming someone else", async () => {
    const other = pref(2);
    const { deps, calls } = fake({
      listPrefs: async () => [pref(1, '{"email":false,"push":false}'), { ...other, key: `content-studio-notify-${UID}` }],
    });
    const r = await runPage(deps, opts());
    expect(r.reports).toEqual([]);
    // the hourly call's only other work: starting the connected-accounts pass
    expect(calls).toEqual([`next ${JSON.stringify({ job: "social" })}`]);
  });
});

describe("runUser: the Your market reminder", () => {
  const MON_9AM = sg(2026, 10, 12, 9);
  const marketRows = { ...rows, [`content-studio-market-${UID}`]: JSON.stringify({ audience: "Young families", questions: ["Is CPF enough for us?"], checks: [] }) };

  it("goes to an allowed account's phone on Monday, claimed once for the week", async () => {
    const { deps, calls } = fake({ userRows: async () => marketRows, subsList: [sub(1, 1, MON_9AM)] });
    await runUser(deps, UID, { email: false, push: true }, opts({ now: MON_9AM, marketUsers: UID }));
    expect(calls).toContain("claim market:2026-10-12 null");
    expect(calls).toContain("push 1 This week's market check is open");
    expect(calls).toContain("markSent market:2026-10-12");
  });

  it("never goes to an account Your market is not switched on for", async () => {
    const { deps, calls } = fake({ userRows: async () => marketRows, subsList: [sub(1, 1, MON_9AM)] });
    await runUser(deps, UID, { email: false, push: true }, opts({ now: MON_9AM, marketUsers: "someone-else" }));
    expect(calls.some((c) => c.includes("market"))).toBe(false);
  });
});

describe("runUser: the Monday email mentions Your market", () => {
  const MON_8AM_SG = sg(2026, 10, 12, 8);
  const marketRows = { ...rows, [`content-studio-market-${UID}`]: JSON.stringify({ audience: "Young families", questions: ["Is CPF enough for us?"], checks: [] }) };
  it("for an allowed account, and not for others", async () => {
    let body = "";
    const on = fake({ userRows: async () => marketRows, sendEmail: async (_to, e) => ((body = e.text), true) });
    await runUser(on.deps, UID, { email: true, push: false }, opts({ now: MON_8AM_SG, marketUsers: UID }));
    expect(body).toContain("Your market: this week's check is open");
    const off = fake({ userRows: async () => marketRows, sendEmail: async (_to, e) => ((body = e.text), true) });
    await runUser(off.deps, UID, { email: true, push: false }, opts({ now: MON_8AM_SG, marketUsers: "someone-else" }));
    expect(body).not.toContain("Your market");
  });
});

describe("runUser: a busy week, frozen before What moved", () => {
  // fixtures/busy-week-before.json was captured from this function before What moved existed: a followed account's
  // 4.1x reel, a competitor's fresh ads and posts, your own 3.6x post, a growing account and a post due within the hour.
  const busy = (over: Partial<Deps> & { kept?: Record<string, JevAnswer> | null; done?: string[] } = {}) => {
    const calls: string[] = [];
    const log = (s: string) => calls.push(s);
    let text = "";
    const deps: Deps = {
      listPrefs: async () => [],
      userRows: async () => before.rows,
      subs: async () => (log("subs"), [{ id: 1, endpoint: "https://fcm.googleapis.com/fcm/send/d1", p256dh: "B".repeat(87), auth: "k".repeat(22), updated_at: "2026-10-11T00:00:00Z" }]),
      authUser: async () => (log("authUser"), { email: "ada@example.test", email_confirmed_at: "2026-01-01" }),
      logged: async (_u, items) => (log(`logged ${items}`), new Set(over.done ?? [])),
      claim: async (_u, items, retake) => (log(`claim ${items} ${retake}`), new Set(items)),
      markSent: async (_u, items) => void log(`markSent ${items}`),
      sendPush: async (subs, m) => (log(`push ${subs.map((s) => s.id)} ${m.title} | ${m.body} | ${m.url}`), 1),
      sendEmail: async (to, e, key) => ((text = e.text), log(`email ${to} ${key} ${e.subject}`), true),
      pick: async (_u, ask) => (log(`pick ${Object.keys(ask.questions)}`), null),
      briefPick: async (_u, ask) => (log(`briefPick ${Object.keys(ask.questions)}`), over.kept ?? null),
      next: async () => {},
      clock: () => 0,
      ...over,
    };
    return { deps, calls, text: () => text };
  };
  const all = { email: true, push: true, brief: true, alerts: true };
  const now = Date.parse(before.now);
  const beforeText = before.report.email.text;
  /** The numbered lines of the WHAT MOVED block (the report's best and weakest are numbered too). */
  const moved = (text: string) => text.slice(0, text.indexOf("Last week, ")).split("\n").filter((l) => /^\d\. /.test(l));

  it("gives a uid off NORTH_STAR_USERS the same alerts and the same email, byte for byte, even with both switches on", async () => {
    for (const northStarUsers of [undefined, "", "someone-else,another"]) {
      const { deps, calls } = busy();
      const r = await runUser(deps, UID, all, opts({ now, northStarUsers }));
      expect(calls).toEqual(before.calls);
      expect(r).toEqual(before.report);
    }
  });

  it("gives a listed uid the alert claim and What moved first in the email, the rest unchanged", async () => {
    const { deps, calls, text } = busy();
    const r = await runUser(deps, UID, all, opts({ now, northStarUsers: `x,${UID}` }));
    const hit = "alert-day:2026-10-12,outlier:instagram:hit";
    expect(calls).toEqual([
      "subs",
      `logged ${hit}`,
      `claim due:me:d1:2026-10-12T10:30,${hit} null`,
      ...before.calls.slice(2, 4),
      "push 1 @sgmoneybro posted a hit | 4.1x their usual views. Tap to make your own. | /clone?url=https%3A%2F%2Fwww.instagram.com%2Freel%2Fhit%2F",
      `markSent ${hit}`,
      ...before.calls.slice(4, 7),
      "briefPick f0,f1,f2,f3,f4",
      ...before.calls.slice(7),
    ]);
    // Jev had no answer: the fallback order, Outlier, Your post, New ad, Growing
    expect(moved(text())).toEqual([
      `1. Outlier: @sgmoneybro's reel did 4.1x their usual views. "3 CPF mistakes at 25 that cost you later"`,
      `2. Outlier: @pipedrive's post did 5x their usual engagement. "Picture c-hit"`,
      `3. Your post: "Why I stopped selling on the first call" got 3.6x your usual engagement.`,
      "4. New ad: Pipedrive started 2 new ads this week.",
      "5. Growing: @sgmoneybro gained 1,240 followers this week.",
    ]);
    expect(text().startsWith("WHAT MOVED\n1. Outlier:")).toBe(true);
    expect(text().slice(text().indexOf("Last week, "))).toBe(beforeText);
    expect((r.email as { brief: unknown }).brief).toEqual([{ profile: "me", findings: expect.arrayContaining([{ id: "ad:pipedrive-ab12", line: "Pipedrive started 2 new ads this week.", p: null }]) }]);
  });

  it("keeps what Jev keeps, surest first, and spends one brief-pick per email", async () => {
    const yes = (...ps: number[]) => Object.fromEntries(ps.map((p, i) => [`f${i}`, { type: "noul" as const, noul: p }]));
    const { deps, calls, text } = busy({ kept: yes(0.4, 0.2, 0.9, 0.6, 0.55) });
    await runUser(deps, UID, { ...all, push: false }, opts({ now, northStarUsers: UID }));
    expect(calls.filter((c) => c.startsWith("briefPick"))).toHaveLength(1);
    expect(moved(text()).map((l) => l.split(":")[0])).toEqual(["1. Your post", "2. New ad", "3. Growing"]);
    // an hourly rerun that finds the email claimed asks nothing
    const again = busy({ claim: async () => new Set<string>() });
    await runUser(again.deps, UID, all, opts({ now, northStarUsers: UID }));
    expect(again.calls.some((c) => c.startsWith("briefPick"))).toBe(false);
  });

  it("sends no block when Jev keeps fewer than 2", async () => {
    const { deps, text } = busy({ kept: { f0: { type: "noul", noul: 0.9 } } });
    await runUser(deps, UID, { ...all, push: false }, opts({ now, northStarUsers: UID }));
    expect(text()).toBe(beforeText);
  });

  it("asks nothing and alerts nothing for a listed uid with the switches off, or after today's alert", async () => {
    const off = busy();
    const r = await runUser(off.deps, UID, { email: true, push: true, brief: false, alerts: false }, opts({ now, northStarUsers: UID }));
    expect(off.calls).toEqual(before.calls);
    expect(r).toEqual(before.report);
    const sent = busy({ done: ["alert-day:2026-10-12"] });
    await runUser(sent.deps, UID, { ...all, email: false }, opts({ now, northStarUsers: UID }));
    expect(sent.calls).toEqual(["subs", "logged alert-day:2026-10-12,outlier:instagram:hit", ...before.calls.slice(1, 4)]);
    // another run took the day's claim between the look-up and this claim: no second alert
    const raced = busy({ claim: async (_u, items) => new Set(items.filter((i) => !i.startsWith("alert-day"))) });
    await runUser(raced.deps, UID, { ...all, email: false }, opts({ now, northStarUsers: UID }));
    expect(raced.calls.filter((c) => c.startsWith("push"))).toEqual([before.calls[2]]);
  });
});

describe("runUser: a hand-posted draft's linked numbers (learn-real-numbers)", () => {
  // a post last week with typed numbers, linked to its live post; only Leo's sign-ins ever link one
  const typed = { id: "p1", hook: "Linked post", platform: "linkedin", status: "posted", postedAt: "2026-10-07T02:00:00Z", metrics: { impressions: 10, reactions: 1 } };
  const live = { postId: "ext1", platform: "linkedin", url: null, by: "jev", numbers: { impressions: 0, reach: 700, views: 0, likes: 30, comments: 4, shares: 2, saves: 0, at: "2026-10-08T01:00:00Z" } };
  const email = async (drafts: object[], northStarUsers?: string) => {
    let text = "";
    const { deps } = fake({ userRows: async () => ({ [`content-studio-drafts-${UID}`]: JSON.stringify(drafts) }), sendEmail: async (_to, e) => ((text = e.text), true) });
    await runUser(deps, UID, { email: true, push: false }, opts({ northStarUsers }));
    return text;
  };

  it("count in a listed uid's Monday email", async () => {
    const text = await email([{ ...typed, live }], `x,${UID}`);
    expect(text).toContain("700 impressions");
    expect(text).not.toBe(await email([typed], `x,${UID}`));
  });

  it("never reach anyone else's email: it reads as the typed numbers alone", async () => {
    for (const northStarUsers of [undefined, "", "someone-else"]) expect(await email([{ ...typed, live }], northStarUsers)).toBe(await email([typed], northStarUsers));
  });
});

describe("runAlerts: failed posts and accounts to reconnect", () => {
  // Zernio as it answers for one brand with Instagram, Facebook and LinkedIn connected (shapes from its openapi.json):
  // a reel that failed on Instagram, a post that went out on LinkedIn but failed on Instagram, and LinkedIn's token revoked.
  const ZP = "6650f1a2b3c4d5e6f7a8b9c0";
  const IG = "6650f1a2b3c4d5e6f7a8b9c1";
  const FB = "6650f1a2b3c4d5e6f7a8b9c2";
  const LI = "6650f1a2b3c4d5e6f7a8b9c3";
  const P1 = "6651aaaaaaaaaaaaaaaaaaa1";
  const P2 = "6651aaaaaaaaaaaaaaaaaaa2";
  const NOW = sg(2026, 10, 12, 10); // a Monday, 10am
  const account = (_id: string, platform: string, username: string, needsReconnection = false) => ({ _id, platform, username, profileId: { _id: ZP }, enabled: true, needsReconnection });
  const zernioData = {
    accounts: [account(IG, "instagram", "sgmoneybro"), account(FB, "facebook", "sgmoneybro.page"), account(LI, "linkedin", "Ada Tan", true)],
    failed: [{
      _id: P1, status: "failed", content: "5 CPF myths", updatedAt: "2026-10-12T01:00:00Z",
      platforms: [{ platform: "instagram", accountId: { _id: IG, platform: "instagram" }, status: "failed", errorMessage: "The video is longer than Instagram allows (90 seconds).", errorCategory: "user_content" }],
    }],
    partial: [{
      _id: P2, status: "partial", content: "Term or whole life?", updatedAt: "2026-10-12T01:30:00Z",
      platforms: [
        { platform: "linkedin", accountId: { _id: LI }, status: "published", platformPostUrl: "https://www.linkedin.com/feed/update/1" },
        { platform: "instagram", accountId: { _id: IG }, status: "failed", errorMessage: "Instagram couldn't fetch the picture." },
      ],
    }],
    health: [
      { accountId: IG, platform: "instagram", username: "sgmoneybro", status: "healthy", needsReconnect: false },
      { accountId: LI, platform: "linkedin", username: "Ada Tan", status: "error", needsReconnect: true, disconnectionType: "unintentional", unhealthySince: "2026-10-12T00:10:00Z", issues: ["Token revoked"] },
    ],
  };
  const drafts = {
    [`content-studio-drafts-${UID}`]: JSON.stringify([
      { id: "d1", hook: "5 CPF myths at 25", status: "scheduled", zernio: { key: "k1", postId: P1, status: "scheduled" } },
      { id: "d2", hook: "Term or whole life?", status: "scheduled", zernio: { key: "k2", postId: P2 } },
    ]),
  };
  const PUSH = [`fail:${P1}:${IG}`, `fail:${P2}:${IG}`, `reconnect:${LI}:2026-10-12`];
  const MAIL = PUSH.map((i) => `mail:${i}`);

  function alerts(over: Partial<Deps> & { data?: Partial<typeof zernioData>; done?: string[]; held?: string[]; broken?: string[] } = {}) {
    const calls: string[] = [];
    const log = (c: string) => calls.push(c);
    const data = { ...zernioData, ...over.data };
    const z: Zernio = async (method, path, req = {}) => {
      const q = req.query ?? {};
      log(`zernio ${method} ${path} ${new URLSearchParams(q as Record<string, string>)}`);
      if (q.profileId && over.broken?.includes(q.profileId)) throw new Error("boom");
      if (path === "/accounts") return { accounts: data.accounts };
      if (path === "/posts") return { posts: q.status === "failed" ? data.failed : data.partial, pagination: { pages: 1 } };
      if (path === "/accounts/health") return { accounts: data.health };
      throw new Error(`unexpected ${path}`);
    };
    const { deps } = fake({
      socialRows: async () => (log("socialRows"), [{ profile_id: "me", zernio_profile_id: ZP }]),
      draftRows: async () => (log("draftRows"), drafts),
      zernio: z,
      subs: async () => (log("subs"), [sub(1, 1, NOW)]),
      authUser: async () => (log("authUser"), { email: "ada@example.test", email_confirmed_at: "2026-01-01" }),
      markSent: async (_u, items) => void log(`markSent ${items}`),
      logged: async (_u, items) => (log(`logged ${items}`), new Set(items.filter((i) => over.done?.includes(i)))),
      claim: async (_u, items, retake) => (log(`claim ${items} ${retake}`), new Set(items.filter((i) => !over.done?.includes(i) && !over.held?.includes(i)))),
      sendPush: async (subs, m) => (log(`push ${m.title} | ${m.body} | ${m.url}`), 1),
      sendEmail: async (to, e, key) => (log(`email ${to} ${key} ${e.subject}`), true),
      ...over,
    });
    return { deps, calls };
  }
  const on = { failed: true, accounts: true, push: true };
  const reads = (since = "2026-10-10T02:00:00.000Z") => [
    "socialRows",
    `zernio GET /accounts profileId=${ZP}&includeOverLimit=true`,
    `zernio GET /posts status=failed&updatedSince=${encodeURIComponent(since)}&limit=50&profileId=${ZP}`,
    `zernio GET /posts status=partial&updatedSince=${encodeURIComponent(since)}&limit=50&profileId=${ZP}`,
    `zernio GET /accounts/health profileId=${ZP}`,
  ];

  it("a new failure, a partial one and a broken account: one alert per batch, then the day's email, each claimed first", async () => {
    const { deps, calls } = alerts();
    const r = await runAlerts(deps, UID, on, opts({ now: NOW }));
    expect(calls).toEqual([
      ...reads(),
      "draftRows",
      "subs",
      `claim ${PUSH} null`,
      `push 2 posts failed to go out | Instagram: "5 CPF myths at 25" / Instagram: "Term or whole life?" | /calendar?post=d1&profile=me`,
      `markSent ${PUSH.slice(0, 2)}`,
      "push Reconnect LinkedIn | LinkedIn, Ada Tan needs reconnecting before it can post again. | /accounts?profile=me",
      `markSent ${PUSH[2]}`,
      `logged ${MAIL}`,
      "authUser",
      `claim alerts-mail:2026-10-12 ${EMAIL_RETAKE}`,
      `claim ${MAIL} ${EMAIL_RETAKE}`,
      `email ada@example.test cs-alerts-mail:2026-10-12-${UID} 2 posts didn't go out, 1 account needs reconnecting`,
      `markSent alerts-mail:2026-10-12,${MAIL}`,
    ]);
    expect((r.email as { text: string }).text).toContain(`Instagram: "5 CPF myths at 25"\nThe video is longer than Instagram allows (90 seconds).\nOpen it: https://app.postmosis.com/calendar?post=d1&profile=me`);
    expect((r.email as { text: string }).text).toContain(`Instagram: "Term or whole life?"\nInstagram couldn't fetch the picture.\nIt went out on LinkedIn.`);
  });

  it("never tells the same failure twice: alerted and emailed already, nothing goes", async () => {
    const { deps, calls } = alerts({ done: [...PUSH, ...MAIL] });
    const r = await runAlerts(deps, UID, on, opts({ now: NOW }));
    expect(calls.filter((c) => /^(push|email|markSent|authUser)/.test(c))).toEqual([]);
    expect(r).toEqual({ user: UID.slice(0, 8), push: [], email: null });
  });

  it("a phone alert already sent still reaches the day's email, once", async () => {
    const { deps, calls } = alerts({ done: PUSH });
    await runAlerts(deps, UID, on, opts({ now: NOW }));
    expect(calls.filter((c) => c.startsWith("push"))).toEqual([]);
    expect(calls.filter((c) => c.startsWith("email"))).toHaveLength(1);
  });

  it("one email a day: once today's has gone, a new failure gets its phone alert and waits for tomorrow's email", async () => {
    const { deps, calls } = alerts({ done: [PUSH[0], PUSH[2], "mail:" + PUSH[0], "mail:" + PUSH[2]], held: ["alerts-mail:2026-10-12"] });
    await runAlerts(deps, UID, on, opts({ now: NOW }));
    expect(calls.filter((c) => c.startsWith("push"))).toEqual([`push Post failed on Instagram | "Term or whole life?" Went out on LinkedIn. Instagram couldn't fetch the picture. | /calendar?post=d2&profile=me`]);
    expect(calls.filter((c) => c.startsWith("claim"))).toEqual([`claim ${PUSH} null`, `claim alerts-mail:2026-10-12 ${EMAIL_RETAKE}`]);
    expect(calls.some((c) => c.startsWith("email"))).toBe(false);
    // the next day it is in the email, alone
    const next = alerts({ done: [...PUSH, "mail:" + PUSH[0], "mail:" + PUSH[2]] });
    const r = await runAlerts(next.deps, UID, on, opts({ now: NOW + DAY }));
    expect(next.calls.filter((c) => c.startsWith("email"))).toEqual([`email ada@example.test cs-alerts-mail:2026-10-13-${UID} 1 post didn't go out`]);
    expect((r.email as { text: string }).text.startsWith(`This post didn't go out:\n\nInstagram: "Term or whole life?"`)).toBe(true);
  });

  it("with phone alerts off, the email alone; with Failed posts off, no posts read; with Social accounts off, no health read", async () => {
    const quiet = alerts();
    await runAlerts(quiet.deps, UID, { ...on, push: false }, opts({ now: NOW }));
    expect(quiet.calls.some((c) => c === "subs" || c.startsWith("push"))).toBe(false);
    expect(quiet.calls.filter((c) => c.startsWith("email"))).toHaveLength(1);

    const noFails = alerts();
    const r = await runAlerts(noFails.deps, UID, { ...on, failed: false }, opts({ now: NOW }));
    expect(noFails.calls.some((c) => c.includes("/posts") || c === "draftRows")).toBe(false);
    expect(noFails.calls.filter((c) => c.startsWith("push"))).toEqual(["push Reconnect LinkedIn | LinkedIn, Ada Tan needs reconnecting before it can post again. | /accounts?profile=me"]);
    expect((r.email as { subject: string }).subject).toBe("1 account needs reconnecting");

    const noAccounts = alerts();
    await runAlerts(noAccounts.deps, UID, { ...on, accounts: false }, opts({ now: NOW }));
    expect(noAccounts.calls.some((c) => c.includes("/accounts/health"))).toBe(false);
    expect(noAccounts.calls.filter((c) => c.startsWith("push"))).toHaveLength(1);
  });

  it("a quiet day: nothing failed and nothing broken, so nothing claimed or sent, and no health or drafts read", async () => {
    const { deps, calls } = alerts({ data: { failed: [], partial: [], accounts: zernioData.accounts.map((a) => ({ ...a, needsReconnection: false })) } });
    const r = await runAlerts(deps, UID, on, opts({ now: NOW }));
    expect(calls).toEqual(reads().slice(0, 4));
    expect(r).toEqual({ user: UID.slice(0, 8), push: [], email: null });
  });

  it("a dry run reads the log and sends, claims and marks nothing", async () => {
    const { deps, calls } = alerts();
    const r = await runAlerts(deps, UID, on, opts({ now: NOW, dryRun: true }));
    expect(calls.filter((c) => /^(claim|markSent|push|email)/.test(c))).toEqual([]);
    expect(calls).toContain(`logged ${PUSH}`);
    expect(calls).toContain("logged alerts-mail:2026-10-12");
    expect(r.push).toHaveLength(2);
    expect(r.email).toMatchObject({ to: "a***@example.test", subject: "2 posts didn't go out, 1 account needs reconnecting", sent: null });
  });

  it("a test send goes to the test inbox only: no phone alert, nothing claimed or marked", async () => {
    const { deps, calls } = alerts({ done: MAIL });
    await runAlerts(deps, UID, on, opts({ now: NOW, only: UID, testTo: "delivered@resend.dev" }));
    expect(calls.filter((c) => /^(claim|markSent|push|subs|logged|authUser)/.test(c))).toEqual([]);
    expect(calls.filter((c) => c.startsWith("email"))).toEqual([`email delivered@resend.dev cs-alerts-mail:2026-10-12-${UID}-test 2 posts didn't go out, 1 account needs reconnecting`]);
  });

  it("a brand Zernio can't answer leaves the other brands' alerts alone", async () => {
    const OTHER = "6650f1a2b3c4d5e6f7a8b9ff";
    const { deps, calls } = alerts({
      broken: [OTHER],
      socialRows: async () => [{ profile_id: "pold", zernio_profile_id: OTHER }, { profile_id: "me", zernio_profile_id: ZP }],
    });
    const r = await runAlerts(deps, UID, on, opts({ now: NOW }));
    expect(r.errors).toEqual(["pold: Error"]);
    expect(calls.filter((c) => c.startsWith("email"))).toHaveLength(1);
  });

  it("never reads another profile's posts: a post naming an account outside the brand is dropped", async () => {
    const stranger = { ...zernioData.failed[0], _id: "6651aaaaaaaaaaaaaaaaaaa9", platforms: [{ ...zernioData.failed[0].platforms[0], accountId: { _id: "6650f1a2b3c4d5e6f7a8b9ee" } }] };
    const { deps, calls } = alerts({ data: { failed: [stranger], partial: [], accounts: zernioData.accounts.map((a) => ({ ...a, needsReconnection: false })) } });
    await runAlerts(deps, UID, on, opts({ now: NOW }));
    expect(calls.some((c) => /^(claim|push|email|draftRows)/.test(c))).toBe(false);
  });
});

describe("runPage: the social job", () => {
  const owner = (n: number, data = "") => {
    const uid = `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
    return { user_id: uid, key: `content-studio-notify-${uid}`, data };
  };
  const zernio: Zernio = async () => ({ accounts: [] });

  it("pages through owners with a connected account, switches on without a key, and chains as the social job", async () => {
    const full = Array.from({ length: PAGE }, (_, i) => owner(i + 1, i === 1 ? '{"failed":false,"accounts":false}' : ""));
    const seen: string[] = [];
    const { deps, calls } = fake({ listOwners: async () => full, socialRows: async (uid) => (seen.push(uid), []), zernio });
    const r = await runPage(deps, opts({ job: "social" }));
    expect(calls.filter((c) => c.startsWith("next"))).toEqual([`next ${JSON.stringify({ after: full[PAGE - 1].user_id, job: "social" })}`]);
    // the one with both switched off is skipped; the rest had no key, so theirs are on
    expect(seen).toEqual(full.filter((_, i) => i !== 1).map((o) => o.user_id));
    expect(r.reports).toHaveLength(PAGE - 1);
  });

  it("hands off as the social job too", async () => {
    const full = Array.from({ length: PAGE }, (_, i) => owner(i + 1));
    const f = fake({ listOwners: async () => full, zernio });
    f.deps.socialRows = async () => (f.tick(BUDGET_MS + 1), []);
    await runPage(f.deps, opts({ job: "social" }));
    expect(f.calls.filter((c) => c.startsWith("next"))).toEqual([
      `next ${JSON.stringify({ after: full[PAGE - 1].user_id, job: "social" })}`,
      `next ${JSON.stringify({ after: full[0].user_id, upTo: full[PAGE - 1].user_id, job: "social" })}`,
    ]);
  });

  it("does nothing without a Zernio key, and never starts itself again", async () => {
    const off = fake({ listOwners: async () => [owner(1)], zernio: null });
    expect(await runPage(off.deps, opts({ job: "social" }))).toEqual({ checked: 0, next: null, handedOff: false, reports: [] });
    expect(off.calls).toEqual([]);
    const on = fake({ listOwners: async () => [owner(1)], socialRows: async () => [], zernio });
    await runPage(on.deps, opts({ job: "social" }));
    expect(on.calls.some((c) => c.includes('"job":"social"'))).toBe(false);
  });

  it("is started once by the hourly call, never by a page it chains to, a dry run or one adviser", async () => {
    for (const [o, starts] of [[opts(), true], [opts({ after: "x" }), false], [opts({ dryRun: true }), false], [opts({ only: UID }), false]] as const) {
      const { deps, calls } = fake();
      await runPage(deps, o);
      expect(calls.includes(`next ${JSON.stringify({ job: "social" })}`), JSON.stringify(o)).toBe(starts);
    }
  });
});
