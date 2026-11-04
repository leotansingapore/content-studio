import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// The money and publishing rules of slideshow campaigns through api.ts and run.ts, on an in-memory database and
// storage, a canned writer, a stand-in drawer and a fake Zernio (runPost). api_test.ts walks the same code end to end
// under Deno with real drawing, but the vitest suite is the gate, so the rules that spend or post are pinned here too.
type Row = Record<string, unknown>;
const st = vi.hoisted(() => {
  const s = {
    env: {} as Record<string, string>,
    db: {} as Record<string, Row[]>,
    files: new Map<string, Uint8Array>(),
    usage: new Map<string, number>(),
    signedFor: [] as string[],
    writes: 0,
    drawn: 0,
    zernio: [] as Row[],
    zernioStatus: 200,
    waits: [] as Promise<unknown>[],
    // runs once while the next writer call is in flight (a change made while a post is being made)
    onWrite: null as null | (() => void),
    writer: { slides: ["Count your putts for a week."], cta: "", caption: "One habit that cuts strokes. #golf" } as Row,
  };
  vi.stubGlobal("Deno", { env: { get: (k: string) => s.env[k] } });
  vi.stubGlobal("EdgeRuntime", { waitUntil: (p: Promise<unknown>) => s.waits.push(p) });
  return s;
});

vi.mock("https://esm.sh/@supabase/supabase-js@2.117.3", () => ({ createClient: () => ({}) }));
vi.mock("../_shared/openaiChat.ts", () => ({
  OPENAI_MODEL: "test-model",
  openaiChat: async () => {
    st.writes++;
    const f = st.onWrite;
    st.onWrite = null;
    f?.();
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(st.writer) } }] }), { status: 200 });
  },
}));
vi.mock("../social/posts.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../social/posts.ts")>()),
  runPost: async (_z: unknown, mapped: string | null, uid: string, q: Row) => {
    st.zernio.push({ mapped, uid, ...q });
    if (st.zernioStatus !== 200) return { status: st.zernioStatus, body: { error: "down" } };
    return { status: 200, body: q.action === "schedule" ? { post: { id: `zpost${st.zernio.length}` } } : {} };
  },
}));

import { handle, tick } from "./api.ts";
import { BUCKET } from "./run.ts";

// Node loads Response (its fetch internals), web crypto and the time zone data on first use, up to 3 s at load 40:
// paid here at collection, not inside a test.
await Promise.all([new Response("{}").json(), crypto.subtle.digest("SHA-256", new Uint8Array(1))]);
new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Singapore", hour: "2-digit" }).format();

const DRAWER = "https://drawer.test/api/slide-render";
const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";
const ACCOUNT = "0123456789abcdef01234567";
const ZPROFILE = "aaaaaaaaaaaaaaaaaaaaaaaa";

// A thenable query over one table, as supabase-js reads: filters, then select, insert, upsert, update or delete.
function query(table: string) {
  const filters: ((r: Row) => boolean)[] = [];
  let op: "select" | "insert" | "upsert" | "update" | "delete" = "select";
  let payload: unknown;
  let one: "single" | "maybe" | null = null;
  let head = false;
  let sort: [string, boolean] | null = null;
  let max = Infinity;
  const run = () => {
    const t = (st.db[table] ??= []);
    const match = (r: Row) => filters.every((f) => f(r));
    let out: Row[] = [];
    if (op === "insert" || op === "upsert") {
      for (const r of [payload].flat() as Row[]) {
        if (op === "upsert" && t.some((x) => x.library_id === r.library_id && x.src === r.src)) continue;
        const full = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...r };
        t.push(full);
        out.push(full);
      }
    } else if (op === "update") {
      out = t.filter(match);
      out.forEach((r) => Object.assign(r, payload));
    } else if (op === "delete") {
      out = t.filter(match);
      st.db[table] = t.filter((r) => !match(r));
    } else {
      out = t.filter(match);
      if (sort) {
        const [k, asc] = sort;
        out = [...out].sort((a, b) => (String(a[k]) < String(b[k]) ? -1 : 1) * (asc ? 1 : -1));
      }
      out = out.slice(0, max);
    }
    // copies, as the network gives: a second reader holds what it read, not the live row
    const data = head ? null : structuredClone(one ? (out[0] ?? null) : out);
    return { data, error: one === "single" && !out.length ? { message: "no row" } : null, count: out.length };
  };
  const q = {
    select: (_c?: string, o?: { head?: boolean }) => ((head = op === "select" && !!o?.head), q),
    insert: (p: unknown) => ((op = "insert"), (payload = p), q),
    upsert: (p: unknown) => ((op = "upsert"), (payload = p), q),
    update: (p: unknown) => ((op = "update"), (payload = p), q),
    delete: () => ((op = "delete"), q),
    eq: (k: string, v: unknown) => (filters.push((r) => r[k] === v), q),
    in: (k: string, v: unknown[]) => (filters.push((r) => v.includes(r[k])), q),
    lte: (k: string, v: string) => (filters.push((r) => typeof r[k] === "string" && (r[k] as string) <= v), q),
    gt: (k: string, v: string) => (filters.push((r) => typeof r[k] === "string" && (r[k] as string) > v), q),
    order: (k: string, o?: { ascending?: boolean }) => ((sort = [k, o?.ascending !== false]), q),
    limit: (n: number) => ((max = n), q),
    single: () => ((one = "single"), q),
    maybeSingle: () => ((one = "maybe"), q),
    then: (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve(run()).then(ok, bad),
  };
  return q;
}

const signedUrl = (p: string) => (st.signedFor.push(p), `https://stub.supabase.co/storage/v1/object/sign/${BUCKET}/${p}?token=t`);
const admin = {
  from: query,
  rpc: async (_fn: string, a: { p_user: string; p_feature: string; p_limit: number }) => {
    const k = `${a.p_user}|${a.p_feature}`;
    const n = (st.usage.get(k) ?? 0) + 1;
    st.usage.set(k, n);
    return { data: n <= a.p_limit ? n : null, error: null };
  },
  auth: { getUser: async (jwt: string) => ({ data: { user: [A, B].includes(jwt) ? { id: jwt } : null } }) },
  storage: {
    from: () => ({
      upload: async (path: string, bytes: Uint8Array) => (st.files.set(path, bytes), { error: null }),
      remove: async (paths: string[]) => (paths.forEach((p) => st.files.delete(p)), { error: null }),
      createSignedUrls: async (paths: string[]) => ({ data: paths.map((p) => ({ signedUrl: signedUrl(p) })) }),
      createSignedUrl: async (p: string) => ({ data: { signedUrl: signedUrl(p) } }),
      createSignedUploadUrl: async (path: string) => ({ data: { token: "t", signedUrl: `https://stub/${path}` }, error: null }),
      list: async () => ({ data: [], error: null }),
    }),
  },
} as never;

const used = (uid: string, feature: string) => st.usage.get(`${uid}|${feature}`) ?? 0;
const call = async (uid: string, body: Row) => {
  const res = await handle(new Request("https://x/functions/v1/slide-campaigns", { method: "POST", headers: { Authorization: `Bearer ${uid}` }, body: JSON.stringify(body) }), admin);
  return { status: res.status, body: await res.json() };
};
const schedules = () => st.zernio.filter((z) => z.action === "schedule");
/** A live campaign of A's on its TikTok account, its next posting time 10 minutes away. */
function live(extra: Row = {}): Row {
  const c: Row = {
    id: crypto.randomUUID(), owner_id: A, profile_id: "me", name: "Golf hacks", status: "live", account_id: ACCOUNT, next_run_at: new Date(Date.now() + 10 * 60_000).toISOString(), last_hook: null,
    spec: { hooks: ["3 habits that cut 5 strokes"], content: { slides: 1 }, cta: { placement: "none" } },
    schedule: { tz: "Asia/Singapore", times: [{ at: "09:00", days: [0, 1, 2, 3, 4, 5, 6] }] },
    publish: { mode: "inbox", consent_at: null },
    ...extra,
  };
  st.db.cs_slide_campaigns.push(c);
  return c;
}

beforeEach(() => {
  st.env = { ZERNIO_API_KEY: "test", SOCIAL_CONNECT_USERS: A, SLIDE_RENDER_URL: DRAWER, SLIDE_RENDER_SECRET: "drawer-secret", SUPABASE_URL: "http://db", SUPABASE_SERVICE_ROLE_KEY: "k" };
  st.db = { cs_slide_campaigns: [], cs_slide_campaign_runs: [], cs_image_libraries: [], cs_library_images: [], cs_social_profiles: [{ owner_id: A, profile_id: "me", zernio_profile_id: ZPROFILE }], cs_user_data: [] };
  st.files.clear();
  st.usage.clear();
  st.signedFor.length = 0;
  st.zernio.length = 0;
  st.waits.length = 0;
  Object.assign(st, { writes: 0, drawn: 0, zernioStatus: 200, onWrite: null, writer: { slides: ["Count your putts for a week."], cta: "", caption: "One habit that cuts strokes. #golf" } });
  vi.stubGlobal("fetch", async (u: unknown, init?: RequestInit) => {
    if (String(u) !== DRAWER) throw new Error(`no network in this test: ${String(u)}`);
    expect((init?.headers as Record<string, string>)["x-slide-render-secret"]).toBe("drawer-secret");
    st.drawn++;
    return new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), { headers: { "content-type": "image/png" } });
  });
});
afterAll(() => vi.unstubAllGlobals());

describe("slideshow campaigns", () => {
  it("the cron is refused without its secret, or while none is set, and makes the due posts only with it", async () => {
    live();
    const cron = (secret: string) => handle(new Request("https://x", { method: "POST", headers: { "x-slide-campaigns-secret": secret } }), admin);
    expect((await cron("anything")).status).toBe(403);
    st.env.SLIDE_CAMPAIGNS_SECRET = "cron-secret";
    expect((await cron("wrong")).status).toBe(403);
    expect((await cron("")).status).toBe(403);
    expect([st.writes, st.waits.length, st.db.cs_slide_campaign_runs.length]).toEqual([0, 0, 0]);
    const ok = await cron("cron-secret");
    expect(ok.status).toBe(202);
    await Promise.all(st.waits);
    expect(schedules()).toHaveLength(1);
  });

  it("two ticks at the same moment make one post for a posting time", async () => {
    const c = live();
    const [a, b] = await Promise.all([tick(admin), tick(admin)]);
    expect(a.made + b.made).toBe(1);
    expect(schedules()).toHaveLength(1);
    expect(st.db.cs_slide_campaign_runs.filter((r) => r.kind === "post")).toHaveLength(1);
    expect(used(A, "slide-campaign-post")).toBe(1);
    expect(String(c.next_run_at) > new Date(Date.now() + 10 * 60_000).toISOString()).toBe(true);
  });

  it("a tick past the day's campaign posts writes nothing, posts nothing and says so", async () => {
    const c = live();
    st.usage.set(`${A}|slide-campaign-post`, 12);
    expect(await tick(admin)).toEqual({ made: 0, failed: 1 });
    expect([st.writes, st.drawn, schedules().length]).toEqual([0, 0, 0]);
    expect(c.last_error).toBe("Today's campaign posts are used up. It posts again tomorrow.");
  });

  it("a post meant for the profile that the compliance scan flags goes to drafts, and says why", async () => {
    const consent = { mode: "direct", consent_at: new Date().toISOString(), music: true };
    const clean = live({ publish: consent });
    await tick(admin);
    // the control: a clean one goes straight to the profile with its sound
    expect(schedules()[0].input).toMatchObject({ tiktok: { autoAddMusic: true } });
    expect((schedules()[0].input as { tiktok: Row }).tiktok.mode).toBeUndefined();
    clean.status = "paused";
    const flagged = live({ publish: consent });
    st.writer = { slides: ["Your savings are risk-free."], cta: "", caption: "Savings facts. #money" };
    expect(await tick(admin)).toEqual({ made: 1, failed: 0 });
    const sent = schedules()[1].input as { tiktok: Row };
    expect(sent.tiktok.mode).toBe("inbox");
    expect(sent.tiktok.autoAddMusic).toBeUndefined();
    expect(String(flagged.last_error)).toMatch(/^Sent to drafts for review: \S/);
  });

  it("a pause made while the post is being made stops it before TikTok has it", async () => {
    const c = live();
    st.onWrite = () => (c.status = "paused");
    expect(await tick(admin)).toEqual({ made: 0, failed: 1 });
    expect(schedules()).toEqual([]);
    const run = st.db.cs_slide_campaign_runs.find((r) => r.campaign_id === c.id)!;
    expect([run.status, run.error]).toEqual(["failed", "Cancelled: the campaign changed while this post was being made."]);
  });

  it("pausing takes back a post already handed to TikTok for later, and keeps it while TikTok won't let go", async () => {
    const c = live();
    const handed = { id: crypto.randomUUID(), campaign_id: c.id, owner_id: A, kind: "post", status: "scheduled", scheduled_for: c.next_run_at, zernio_post_id: "zpost-later", files: [`${A}/runs/x/1.png`] };
    st.db.cs_slide_campaign_runs.push(handed);
    st.zernioStatus = 503;
    expect((await call(A, { action: "pause", id: c.id })).status).toBe(502);
    expect(st.db.cs_slide_campaign_runs[0].status).toBe("scheduled");
    st.zernioStatus = 200;
    expect(await call(A, { action: "pause", id: c.id })).toEqual({ status: 200, body: { status: "paused" } });
    expect(st.zernio.at(-1)).toMatchObject({ action: "cancel", postId: "zpost-later", uid: A });
    expect(st.db.cs_slide_campaign_runs[0]).toMatchObject({ status: "failed", error: "Cancelled: the campaign was paused." });
    expect(c).toMatchObject({ status: "paused", next_run_at: null });
  });

  it("Send to TikTok now sends an example once, counted once on the day's campaign posts", async () => {
    const c = live({ status: "draft", next_run_at: null });
    const run = { id: crypto.randomUUID(), campaign_id: c.id, owner_id: A, kind: "preview", status: "made", hook: "One hook", caption: "Old caption", slides: [{ role: "hook", text: "One hook" }], files: [`${A}/runs/x/1.png`] };
    st.db.cs_slide_campaign_runs.push(run);
    expect(await call(A, { action: "send", id: c.id, run_id: run.id, caption: "Edited caption" })).toEqual({ status: 200, body: { sent: true } });
    expect(schedules()).toHaveLength(1);
    expect(schedules()[0].input).toMatchObject({ content: "Edited caption", mediaUrls: [expect.stringContaining(`/${A}/runs/x/1.png`)] });
    expect(await call(A, { action: "send", id: c.id, run_id: run.id })).toEqual({ status: 400, body: { error: "That one's already sent." } });
    expect([schedules().length, used(A, "slide-campaign-post")]).toEqual([1, 1]);
  });

  it("Send to phone has its own 30 a day, refused before any upload link, and needs no posting switch", async () => {
    st.env.SOCIAL_CONNECT_USERS = "";
    expect((await call(A, { action: "phone-create", count: 0 })).status).toBe(400);
    expect((await call(A, { action: "phone-create", count: 21 })).status).toBe(400);
    expect(used(A, "slide-phone")).toBe(0);
    const first = await call(A, { action: "phone-create", count: 2 });
    expect(first.body.uploads.map((u: Row) => u.path)).toEqual([`phone/${first.body.token}/1.png`, `phone/${first.body.token}/2.png`]);
    for (let i = 1; i < 30; i++) expect((await call(A, { action: "phone-create", count: 1 })).status).toBe(200);
    const over = await call(A, { action: "phone-create", count: 1 });
    expect([over.status, over.body.code, over.body.uploads]).toEqual([429, "daily_limit", undefined]);
    // the studio's own 500 writes are untouched by it
    expect(used(A, "slide-campaign-write")).toBe(33);
  });

  it("uploads go only in the owner's folder, and a library picture outside it is never drawn or deleted", async () => {
    const lib = (await call(A, { action: "library-save", profile_id: "me", name: "Uploads" })).body.library.id;
    const up = await call(A, { action: "upload-url", library_id: lib, ext: "png" });
    expect(up.body.path).toMatch(new RegExp(`^${A}/lib/[0-9a-f-]{36}\\.png$`));
    // a row naming B's upload, however it got into A's library
    const theirs = `${B}/lib/${crypto.randomUUID()}.png`;
    st.files.set(theirs, new Uint8Array([1]));
    st.db.cs_library_images = [{ id: crypto.randomUUID(), library_id: lib, owner_id: A, src: theirs }];
    const c = live({ spec: { hooks: ["One hook"], content: { slides: 1 }, cta: { placement: "none" }, images: { hook: lib, content: lib } } });
    const pre = await call(A, { action: "preview", id: c.id });
    expect(pre).toEqual({ status: 400, body: { error: "A picture couldn't be loaded. Check the campaign's library." } });
    expect([st.drawn, st.signedFor.includes(theirs)]).toEqual([0, false]);
    expect((await call(A, { action: "library-delete", id: lib })).status).toBe(200);
    expect(st.files.has(theirs)).toBe(true);
  });
});
