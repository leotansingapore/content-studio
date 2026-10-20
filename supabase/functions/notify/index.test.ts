import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// The handler's gate: only pg_cron's shared secret gets in, and only a dry run or a test send may pick the
// time or the inbox. run.ts (tested in run.test.ts) is faked so each call shows the options it was given.
const h = vi.hoisted(() => ({
  runs: [] as Record<string, unknown>[],
  handler: null as null | ((r: Request) => Promise<Response>),
}));
vi.mock("https://esm.sh/@supabase/supabase-js@2.117.3", () => ({ createClient: () => ({}) }));
vi.mock("jsr:@negrel/webpush@0.5.0", () => ({ ApplicationServer: {}, importVapidKeys: () => null, PushMessageError: class {}, Urgency: { High: "high" } }));
vi.mock("./run.ts", () => ({ runPage: async (_deps: unknown, o: Record<string, unknown>) => (h.runs.push(o), { checked: 0, reports: [], next: null, handedOff: false }) }));

const SECRET = "cron-secret-for-tests-only";
const ADA = "6d80f027-3395-480c-86a1-8827d3d6cce3";
const env: Record<string, string | undefined> = {};

beforeAll(async () => {
  vi.stubGlobal("Deno", { serve: (fn: (r: Request) => Promise<Response>) => (h.handler = fn), env: { get: (k: string) => env[k] } });
  await import("./index.ts");
}, 30_000);

beforeEach(() => {
  h.runs.length = 0;
  env.NOTIFY_CRON_SECRET = SECRET;
});

const call = (body: unknown, secret: string | null = SECRET) =>
  h.handler!(new Request("http://x/notify", { method: "POST", headers: secret === null ? {} : { "x-notify-secret": secret }, body: JSON.stringify(body) }));

describe("the notify function's gate", () => {
  it("turns away a call without the cron secret, and every call when the secret isn't set", async () => {
    for (const secret of [null, "", "wrong", SECRET.slice(0, -1), SECRET.toUpperCase()]) expect((await call({}, secret)).status, String(secret)).toBe(403);
    env.NOTIFY_CRON_SECRET = undefined;
    for (const secret of [null, ""]) expect((await call({}, secret)).status, String(secret)).toBe(403);
    env.NOTIFY_CRON_SECRET = "";
    expect((await call({}, "")).status).toBe(403);
    expect(h.runs).toEqual([]);
  });

  it("runs the hourly page on the real clock, whatever time the body names", async () => {
    const weekAhead = new Date(Date.now() + 7 * 864e5).toISOString();
    const before = Date.now();
    const r = await call({ now: weekAhead, only: ADA.toUpperCase() });
    expect(r.status).toBe(202);
    expect(h.runs).toHaveLength(1);
    expect(h.runs[0].now).toBeGreaterThanOrEqual(before);
    expect(h.runs[0].now).toBeLessThanOrEqual(Date.now());
    expect(h.runs[0]).toMatchObject({ dryRun: false, only: ADA, testTo: null });
  });

  it("lets a dry run pick the time", async () => {
    const weekAhead = new Date(Date.now() + 7 * 864e5).toISOString();
    const r = await call({ dryRun: true, now: weekAhead });
    expect(r.status).toBe(200);
    expect(h.runs[0]).toMatchObject({ dryRun: true, now: Date.parse(weekAhead) });
  });

  it("sends a test email only to a test inbox, and only for one adviser", async () => {
    expect((await call({ testTo: "someone@example.com", only: ADA })).status).toBe(400);
    expect((await call({ testTo: "delivered@resend.dev" })).status).toBe(400);
    expect((await call({ testTo: "delivered@resend.dev", only: "not-a-user-id" })).status).toBe(400);
    expect(h.runs).toEqual([]);
    expect((await call({ testTo: "Delivered@Resend.dev", only: ADA })).status).toBe(200);
    expect(h.runs[0]).toMatchObject({ testTo: "delivered@resend.dev", only: ADA });
  });
});
