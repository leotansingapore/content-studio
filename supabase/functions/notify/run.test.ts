import { describe, expect, it } from "vitest";
import { BUDGET_MS, confirmedEmail, EMAIL_RETAKE, PAGE, runPage, runUser, type Deps, type Options, type Sub } from "./run";

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

function fake(over: Partial<Deps> & { subsList?: Sub[]; user?: object | null; sent?: boolean; delivered?: number } = {}) {
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
    expect(calls).toEqual([]);
  });
});
