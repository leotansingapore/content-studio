// End to end through api.ts with an in-memory database and storage, a canned writer and a fake Zernio: a studio
// builds a campaign and a library, Generate draws the slides, Start sets it live, and the cron's tick makes the post
// and hands it to TikTok drafts. Fonts and Pexels photos come from the network, so the slides are really drawn.
// Run from a copy outside the repo (Deno must not touch the app's node_modules):
//   cp -R supabase/functions /tmp/fn && cd /tmp/fn/functions && DENO_DIR=/tmp/fn/.deno deno test -A slide-campaigns/api_test.ts
// Set SLIDE_TEST_OUT=<dir> to keep the PNGs.

import { assert, assertEquals } from "jsr:@std/assert@1";
import { handle, tick } from "./api.ts";

type Row = Record<string, unknown>;
const db: Record<string, Row[]> = { cs_slide_campaigns: [], cs_slide_campaign_runs: [], cs_image_libraries: [], cs_library_images: [], cs_social_profiles: [], cs_user_data: [] };
const files = new Map<string, Uint8Array>();
const usage = new Map<string, number>();

class Q implements PromiseLike<{ data: unknown; error: unknown; count?: number }> {
  private filters: ((r: Row) => boolean)[] = [];
  private op: "select" | "insert" | "update" | "upsert" | "delete" = "select";
  private payload: unknown;
  private one: "single" | "maybe" | null = null;
  private head = false;
  private sortBy: [string, boolean] | null = null;
  private max = Infinity;
  private returning = false;
  constructor(private table: string) {}
  select(_cols?: string, opts?: { count?: string; head?: boolean }) {
    if (this.op === "select") this.head = !!opts?.head;
    else this.returning = true;
    return this;
  }
  eq(k: string, v: unknown) {
    this.filters.push((r) => r[k] === v);
    return this;
  }
  in(k: string, v: unknown[]) {
    this.filters.push((r) => v.includes(r[k]));
    return this;
  }
  lte(k: string, v: string) {
    this.filters.push((r) => typeof r[k] === "string" && (r[k] as string) <= v);
    return this;
  }
  gt(k: string, v: string) {
    this.filters.push((r) => typeof r[k] === "string" && (r[k] as string) > v);
    return this;
  }
  order(k: string, o?: { ascending?: boolean }) {
    this.sortBy = [k, o?.ascending !== false];
    return this;
  }
  limit(n: number) {
    this.max = n;
    return this;
  }
  insert(p: unknown) {
    this.op = "insert";
    this.payload = p;
    return this;
  }
  update(p: unknown) {
    this.op = "update";
    this.payload = p;
    return this;
  }
  upsert(p: unknown) {
    this.op = "upsert";
    this.payload = p;
    return this;
  }
  delete() {
    this.op = "delete";
    return this;
  }
  single() {
    this.one = "single";
    return this;
  }
  maybeSingle() {
    this.one = "maybe";
    return this;
  }
  private run() {
    const t = (db[this.table] ??= []);
    const match = (r: Row) => this.filters.every((f) => f(r));
    let out: Row[] = [];
    if (this.op === "insert" || this.op === "upsert") {
      const rows = (Array.isArray(this.payload) ? this.payload : [this.payload]) as Row[];
      for (const r of rows) {
        if (this.op === "upsert" && t.some((x) => x.library_id === r.library_id && x.src === r.src)) continue;
        const full = { id: crypto.randomUUID(), created_at: new Date().toISOString(), status: "draft", ...r };
        t.push(full);
        out.push(full);
      }
    } else if (this.op === "update") {
      out = t.filter(match);
      out.forEach((r) => Object.assign(r, this.payload));
    } else if (this.op === "delete") {
      out = t.filter(match);
      db[this.table] = t.filter((r) => !match(r));
    } else {
      out = t.filter(match);
      if (this.sortBy) {
        const [k, asc] = this.sortBy;
        out = [...out].sort((a, b) => (String(a[k]) < String(b[k]) ? -1 : 1) * (asc ? 1 : -1));
      }
      out = out.slice(0, this.max);
    }
    const data = this.head ? null : this.one ? (out[0] ?? null) : out;
    return { data: structuredClone(data), error: this.one === "single" && !out.length ? { message: "no row" } : null, count: out.length };
  }
  then<A, B>(ok?: ((v: { data: unknown; error: unknown; count?: number }) => A | PromiseLike<A>) | null, no?: ((e: unknown) => B | PromiseLike<B>) | null) {
    return Promise.resolve(this.run()).then(ok, no);
  }
}

const admin = {
  from: (t: string) => new Q(t),
  rpc: (_fn: string, a: { p_user: string; p_feature: string; p_limit: number }) => {
    const k = `${a.p_user}|${a.p_feature}`;
    const n = (usage.get(k) ?? 0) + 1;
    usage.set(k, n);
    return Promise.resolve({ data: n <= a.p_limit ? n : null, error: null });
  },
  auth: { getUser: (jwt: string) => Promise.resolve({ data: { user: jwt === "jwt-a" ? { id: A } : jwt === "jwt-b" ? { id: B } : null } }) },
  storage: {
    from: () => ({
      upload: (path: string, bytes: Uint8Array) => (files.set(path, bytes), Promise.resolve({ error: null })),
      download: (path: string) => Promise.resolve({ data: files.has(path) ? new Blob([files.get(path)!.slice()], { type: "image/jpeg" }) : null }),
      remove: (paths: string[]) => (paths.forEach((p) => files.delete(p)), Promise.resolve({ error: null })),
      createSignedUrls: (paths: string[]) => Promise.resolve({ data: paths.map((p) => ({ signedUrl: `https://stub.supabase.co/storage/v1/object/sign/cs-slide-campaigns/${p}?token=t` })) }),
      createSignedUploadUrl: (path: string) => Promise.resolve({ data: { token: "t", signedUrl: `https://stub/${path}` }, error: null }),
      // a folder's entries: files directly in it, and sub-folders (id null) once each
      list: (prefix: string) => {
        const seen = new Map<string, { name: string; id: string | null }>();
        for (const k of files.keys()) {
          if (!k.startsWith(`${prefix}/`)) continue;
          const [name, ...rest] = k.slice(prefix.length + 1).split("/");
          if (!seen.has(name)) seen.set(name, { name, id: rest.length ? null : name });
        }
        return Promise.resolve({ data: [...seen.values()], error: null });
      },
    }),
  },
};

const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";
const ACCOUNT = "0123456789abcdef01234567";
const ZPROFILE = "aaaaaaaaaaaaaaaaaaaaaaaa";
const posts: Row[] = [];
// Zernio's posts by id, the ids it was asked to cancel, and a switch that makes it refuse to
const zposts = new Map<string, Row>();
const cancels: string[] = [];
let zernioRefuses = false;

// canned writer and Zernio; everything else (fonts, the resvg wasm, Pexels) goes to the network
const realFetch = globalThis.fetch;
// a stand-in for the Vercel drawer (api/slide-render.ts), for tests that set SLIDE_RENDER_URL to it
const DRAWER = "https://drawer.test/api/slide-render";
const drawn: Row[] = [];
// writer calls in flight now and at most, to see runs made at once
const writer = { now: 0, most: 0 };
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (url === DRAWER) {
    drawn.push(JSON.parse(String(init?.body)).slide);
    return new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), { headers: { "content-type": "image/png" } });
  }
  if (url.includes("api.openai.com")) {
    writer.most = Math.max(writer.most, ++writer.now);
    await new Promise((ok) => setTimeout(ok, 20));
    writer.now--;
    const content = JSON.stringify({ slides: ["Walk the course before you play it.", "Count your putts for a week.", "Practise the shot you avoid."], cta: "", caption: "Three habits that cut strokes. #golf #golftips" });
    return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200, headers: { "content-type": "application/json" } });
  }
  if (url.includes("zernio")) {
    if (url.includes("/accounts")) return Response.json({ accounts: [{ _id: ACCOUNT, platform: "tiktok", profileId: ZPROFILE, username: "scratch.ai", enabled: true }] });
    if (url.endsWith("/posts")) {
      const body = JSON.parse(String(init?.body));
      posts.push(body);
      const post = { _id: posts.length.toString(16).padStart(24, "b"), status: "scheduled", platforms: body.platforms, scheduledFor: body.scheduledFor };
      zposts.set(post._id, post);
      return Response.json({ post });
    }
    const one = /\/posts\/([0-9a-f]{24})$/.exec(url)?.[1];
    if (one && zposts.has(one)) {
      if (init?.method !== "DELETE") return Response.json({ post: zposts.get(one) });
      if (zernioRefuses) return Response.json({ error: "down" }, { status: 503 });
      cancels.push(one);
      zposts.get(one)!.status = "cancelled";
      return Response.json({});
    }
  }
  return realFetch(input, init);
}) as typeof fetch;

const call = async (jwt: string, body: Row) => {
  const res = await handle(new Request("https://x/functions/v1/slide-campaigns", { method: "POST", headers: { Authorization: `Bearer ${jwt}` }, body: JSON.stringify(body) }), admin as never);
  return { status: res.status, body: await res.json() };
};

Deno.env.set("OPENAI_API_KEY", "test");
Deno.env.set("ZERNIO_API_KEY", "test");
Deno.env.set("SOCIAL_CONNECT_USERS", "");
db.cs_social_profiles.push({ owner_id: A, profile_id: "me", zernio_profile_id: ZPROFILE });
db.cs_user_data.push({ user_id: A, key: `content-studio-carousel-brand-${A}`, data: JSON.stringify({ name: "Scratch AI", profession: "Golf coaching app" }) });

Deno.test("a campaign from the studio to TikTok drafts", async () => {
  // building one needs posting switched on
  assertEquals((await call("jwt-a", { action: "library-save", profile_id: "me", name: "x" })).body.code, "not_enabled");
  Deno.env.set("SOCIAL_CONNECT_USERS", A);
  // a library of two Pexels photos, and a campaign that uses it for every role
  const lib = await call("jwt-a", { action: "library-save", profile_id: "me", name: "Golf courses" });
  assertEquals(lib.status, 200);
  const libId = lib.body.library.id;
  const add = await call("jwt-a", {
    action: "library-add",
    library_id: libId,
    items: [
      { src: "https://images.pexels.com/photos/1325735/pexels-photo-1325735.jpeg?auto=compress&cs=tinysrgb&w=1400", credit: { by: "a", url: "u" } },
      { src: "https://images.pexels.com/photos/914682/pexels-photo-914682.jpeg?auto=compress&cs=tinysrgb&w=1400" },
      { src: "https://evil.example/x.jpg" },
      { src: `${A}/lib/../../${B}/runs/x/1.png` },
    ],
  });
  assertEquals(add.body.added, 2);
  // an upload gets its row with its link, in the owner's folder under a fresh id
  const up = await call("jwt-a", { action: "upload-url", library_id: libId, ext: "png" });
  assert(new RegExp(`^${A}/lib/[0-9a-f-]{36}\\.png$`).test(up.body.path), up.body.path);
  assertEquals(db.cs_library_images.filter((r) => r.library_id === libId).length, 3);
  assertEquals((await call("jwt-a", { action: "library-remove", id: up.body.id })).status, 200);
  assertEquals((await call("jwt-b", { action: "upload-url", library_id: libId })).status, 403, "B has no posting switch");
  const saved = await call("jwt-a", {
    action: "save",
    campaign: {
      profile_id: "me",
      name: "Golf hacks",
      spec: { topic: "golf habits", hooks: ["3 habits that cut 5 strokes"], content: { slides: 3, style: "numbered" }, cta: { placement: "none" }, images: { hook: libId, content: libId, cta: null }, look: "golden", overlay: { kind: "bottom", strength: 70 }, text_style: { content: { bg: "bar", size: "sm" } } },
      schedule: { tz: "Asia/Singapore", times: [{ at: "18:00", days: [0, 1, 2, 3, 4, 5, 6] }] },
      publish: { mode: "direct" },
    },
  });
  assertEquals(saved.status, 200);
  const id = saved.body.campaign.id;
  assertEquals(saved.body.campaign.publish.mode, "inbox", "straight to the profile needs the owner's consent");

  // someone else can't touch it, even with posting on
  Deno.env.set("SOCIAL_CONNECT_USERS", `${A},${B}`);
  assertEquals((await call("jwt-b", { action: "preview", id })).status, 404);
  Deno.env.set("SOCIAL_CONNECT_USERS", A);

  // Generate: the slides are drawn and kept
  const pre = await call("jwt-a", { action: "preview", id });
  assertEquals(pre.status, 200, JSON.stringify(pre.body));
  assertEquals(pre.body.run.slides.map((s: Row) => s.role), ["hook", "content", "content", "content"]);
  assertEquals(pre.body.run.files.length, 4);
  for (const f of pre.body.run.files) {
    const png = files.get(f)!;
    assertEquals([...png.slice(0, 4)], [0x89, 0x50, 0x4e, 0x47], "a PNG");
    const out = Deno.env.get("SLIDE_TEST_OUT");
    if (out) await Deno.writeFile(`${out}/${f.split("/").pop()}`, png);
  }

  // Start needs an account
  assertEquals((await call("jwt-a", { action: "start", id })).body.error, "Pick the TikTok account it posts to.");
  assertEquals((await call("jwt-a", { action: "account", id, account_id: "ffffffffffffffffffffffff" })).status, 400);
  assertEquals((await call("jwt-a", { action: "account", id, account_id: ACCOUNT })).status, 200);
  const started = await call("jwt-a", { action: "start", id });
  assertEquals(started.body.status, "live");

  // the tick before its time does nothing; 10 minutes before, it makes the post and hands it to TikTok drafts
  assertEquals(await tick(admin as never), { made: 0, failed: 0 });
  const slot = new Date(Date.now() + 10 * 60_000).toISOString();
  db.cs_slide_campaigns[0].next_run_at = slot;
  assertEquals(await tick(admin as never), { made: 1, failed: 0 });
  assertEquals(posts.length, 1);
  const p = posts[0] as { mediaItems: unknown[]; scheduledFor: string; platforms: { platform: string; accountId: string; platformSpecificData: { tiktokSettings: Row } }[] };
  assertEquals(p.mediaItems.length, 4);
  assertEquals(p.platforms[0].platform, "tiktok");
  assertEquals(p.platforms[0].accountId, ACCOUNT);
  assertEquals(p.platforms[0].platformSpecificData.tiktokSettings.draft, true);
  assertEquals(new Date(p.scheduledFor).getTime(), new Date(slot).getTime() - (new Date(slot).getTime() % 1000));
  const run = db.cs_slide_campaign_runs.find((r) => r.kind === "post")!;
  assertEquals(run.status, "scheduled");
  const c = db.cs_slide_campaigns[0];
  assert(String(c.next_run_at) > slot, "moved to the next posting time");
  assertEquals(c.last_error, null);

  // a slot the tick missed is skipped, not posted late, and said so
  c.next_run_at = new Date(Date.now() - 5 * 60_000).toISOString();
  assertEquals(await tick(admin as never), { made: 0, failed: 1 });
  assertEquals(c.last_error, "Missed a posting time. It posts at the next one.");
  assertEquals(posts.length, 1);
  assert(new Date(String(c.next_run_at)) > new Date(), "skipped to a later slot");

  // posting switched off: the next tick pauses it
  Deno.env.set("SOCIAL_CONNECT_USERS", "");
  c.next_run_at = new Date(Date.now() + 5 * 60_000).toISOString();
  assertEquals(await tick(admin as never), { made: 0, failed: 1 });
  assertEquals(c.status, "paused");

  // the list's thumbnail is the newest post's first slide; the libraries page counts and names who uses each
  const th = await call("jwt-a", { action: "thumbs", ids: [id] });
  assert(String(th.body.thumbs[id]).includes(`/${A}/runs/`), JSON.stringify(th.body));
  const libs = await call("jwt-a", { action: "libraries", profile_id: "me" });
  assertEquals(libs.body.libraries.map((l: Row) => [l.name, l.count, l.stock, l.used_by]), [["Golf courses", 2, 2, ["Golf hacks"]]]);
  assertEquals((await call("jwt-b", { action: "libraries", profile_id: "me" })).body.libraries, [], "B sees none of A's");

  // deleting the campaign takes its post back off Zernio, then removes its files
  assertEquals((await call("jwt-a", { action: "delete", id })).status, 200);
  assertEquals(cancels, [run.zernio_post_id]);
  assertEquals([...files.keys()].filter((k) => k.includes("/runs/")).length, 0);
});

Deno.test("Send to TikTok now: straight to the profile once the owner consents, and once per example", async () => {
  Deno.env.set("SOCIAL_CONNECT_USERS", A);
  const made = await call("jwt-a", { action: "save", campaign: { profile_id: "me", name: "Now", spec: { hooks: ["Now hook"], content: { slides: 1 }, cta: { placement: "none" } }, schedule: { tz: "Asia/Singapore", times: [] }, publish: { mode: "direct", consent: true } } });
  const id = made.body.campaign.id;
  assertEquals(made.body.campaign.publish.mode, "direct");
  assert(made.body.campaign.publish.consent_at, "the consent time is kept");
  assertEquals((await call("jwt-a", { action: "account", id, account_id: ACCOUNT })).status, 200);
  const pre = await call("jwt-a", { action: "preview", id });
  assertEquals(pre.status, 200, JSON.stringify(pre.body));
  const before = posts.length;
  assertEquals((await call("jwt-b", { action: "send", id, run_id: pre.body.run.id })).status, 403, "B has no posting switch");
  const sent = await call("jwt-a", { action: "send", id, run_id: pre.body.run.id, caption: "Edited caption #golf" });
  assertEquals(sent.body, { sent: true });
  assertEquals(posts.length, before + 1);
  const p = posts.at(-1) as { content: string; platforms: { platformSpecificData: Row }[] };
  assertEquals(p.platforms[0].platformSpecificData.tiktokSettings, undefined, "not a draft");
  assertEquals(p.platforms[0].platformSpecificData.expressConsentGiven, true);
  assertEquals(p.content, "Edited caption #golf");
  assertEquals((await call("jwt-a", { action: "send", id, run_id: pre.body.run.id })).body.error, "That one's already sent.");
  // unticking consent goes back to drafts
  const back = await call("jwt-a", { action: "save", campaign: { id, name: "Now", spec: made.body.campaign.spec, schedule: made.body.campaign.schedule, publish: { mode: "direct", consent: false } } });
  assertEquals(back.body.campaign.publish, { mode: "inbox", consent_at: null, music: false });
});

Deno.test("Send to phone: links for a day, read without signing in, then swept", async () => {
  const made = await call("jwt-a", { action: "phone-create", count: 2 });
  assertEquals(made.status, 200, JSON.stringify(made.body));
  assertEquals(made.body.uploads.map((u: Row) => u.path), [`phone/${made.body.token}/1.png`, `phone/${made.body.token}/2.png`]);
  assertEquals((await call("jwt-a", { action: "phone-create", count: 21 })).status, 400);
  for (const u of made.body.uploads) files.set(u.path, new Uint8Array([1]));
  const anon = async (body: Row) => {
    const res = await handle(new Request("https://x", { method: "POST", body: JSON.stringify(body) }), admin as never);
    return { status: res.status, body: await res.json() };
  };
  const got = await anon({ action: "phone-get", token: made.body.token });
  assertEquals(got.status, 200);
  assertEquals(got.body.urls.length, 2);
  assertEquals((await anon({ action: "phone-get", token: "nope" })).status, 404);
  assertEquals((await anon({ action: "preview" })).status, 401, "nothing else opens without signing in");
  const old = `${(Date.now() - 25 * 3600_000).toString(36)}-${crypto.randomUUID()}`;
  files.set(`phone/${old}/1.png`, new Uint8Array([1]));
  assertEquals((await anon({ action: "phone-get", token: old })).status, 410);
  await tick(admin as never);
  assertEquals(files.has(`phone/${old}/1.png`), false, "swept after a day");
  assertEquals(files.has(`phone/${made.body.token}/1.png`), true, "a fresh one stays");
});

Deno.test("two ticks at once make one post for a slot", async () => {
  Deno.env.set("SOCIAL_CONNECT_USERS", A);
  const before = posts.length;
  const slot = new Date(Date.now() + 10 * 60_000).toISOString();
  db.cs_slide_campaigns.push({
    id: crypto.randomUUID(), owner_id: A, profile_id: "me", name: "Twice", status: "live", account_id: ACCOUNT, next_run_at: slot, last_hook: null,
    spec: { hooks: ["One hook"], content: { slides: 3 }, cta: { placement: "none" } },
    schedule: { tz: "Asia/Singapore", times: [{ at: "09:00", days: [0, 1, 2, 3, 4, 5, 6] }] },
  });
  const [a, b] = await Promise.all([tick(admin as never), tick(admin as never)]);
  assertEquals(a.made + b.made, 1);
  assertEquals(posts.length, before + 1);
});

Deno.test("a tick makes a dozen campaigns due at the same time, several at once", async () => {
  Deno.env.set("SOCIAL_CONNECT_USERS", A);
  Deno.env.set("SLIDE_RENDER_URL", DRAWER);
  Deno.env.set("SLIDE_RENDER_SECRET", "s");
  try {
    for (const c of db.cs_slide_campaigns) c.status = "paused";
    usage.clear();
    writer.most = 0;
    const slot = new Date(Date.now() + 10 * 60_000).toISOString();
    const ids: string[] = Array.from({ length: 12 }, () => crypto.randomUUID());
    for (const id of ids) {
      db.cs_slide_campaigns.push({
        id, owner_id: A, profile_id: "me", name: "Busy", status: "live", account_id: ACCOUNT, next_run_at: slot, last_hook: null,
        spec: { hooks: ["One hook"], content: { slides: 1 }, cta: { placement: "none" } },
        schedule: { tz: "Asia/Singapore", times: [{ at: "09:00", days: [0, 1, 2, 3, 4, 5, 6] }] },
      });
    }
    assertEquals(await tick(admin as never), { made: 12, failed: 0 });
    assertEquals(writer.most, 6, "six runs at a time");
    for (const id of ids) assertEquals(db.cs_slide_campaign_runs.filter((r) => r.campaign_id === id && r.status === "scheduled").length, 1, id);
    assert(db.cs_slide_campaigns.filter((c) => ids.includes(c.id as string)).every((c) => c.last_error === null && String(c.next_run_at) > slot));
  } finally {
    Deno.env.delete("SLIDE_RENDER_URL");
    for (const c of db.cs_slide_campaigns) c.status = "paused";
    usage.clear();
  }
});

Deno.test("a post handed to Zernio for later is taken back by a pause, a delete, an account change or consent withdrawn", async () => {
  Deno.env.set("SOCIAL_CONNECT_USERS", A);
  const spec = { hooks: ["One hook"], content: { slides: 1 }, cta: { placement: "none" } };
  const schedule = { tz: "Asia/Singapore", times: [{ at: "09:00", days: [0, 1, 2, 3, 4, 5, 6] }] };
  // a live campaign whose tick has handed its next post to Zernio
  const handed = async (publish: Row = { mode: "inbox", consent_at: null, music: false }) => {
    const id = crypto.randomUUID();
    db.cs_slide_campaigns.push({ id, owner_id: A, profile_id: "me", name: "Handed", status: "live", account_id: ACCOUNT, next_run_at: new Date(Date.now() + 10 * 60_000).toISOString(), last_hook: null, spec, schedule, publish });
    await tick(admin as never);
    const run = db.cs_slide_campaign_runs.find((r) => r.campaign_id === id && r.status === "scheduled")!;
    assert(run && zposts.get(run.zernio_post_id as string)?.status === "scheduled", "handed to Zernio");
    return { id, run, postId: run.zernio_post_id as string };
  };
  const cancelled = (h: { run: Row; postId: string }, why: string) => {
    assertEquals(cancels.at(-1), h.postId);
    assertEquals([h.run.status, h.run.error], ["failed", why]);
  };

  // Zernio won't let go: the pause and the delete say so, and the run and its files stay so a retry can stop it
  const p = await handed();
  zernioRefuses = true;
  const refused = await call("jwt-a", { action: "pause", id: p.id });
  assertEquals([refused.status, refused.body.error], [502, "A post already sent to TikTok for later couldn't be stopped. Try again in a minute."]);
  assertEquals((await call("jwt-a", { action: "delete", id: p.id })).status, 502);
  assert(db.cs_slide_campaigns.some((c) => c.id === p.id), "the campaign is kept");
  assertEquals(p.run.status, "scheduled");
  assert((p.run.files as string[]).every((f) => files.has(f)), "its files are kept");
  zernioRefuses = false;
  assertEquals((await call("jwt-a", { action: "pause", id: p.id })).body, { status: "paused" });
  cancelled(p, "Cancelled: the campaign was paused.");

  // a delete stops it before the files go
  const d = await handed();
  assertEquals((await call("jwt-a", { action: "delete", id: d.id })).status, 200);
  assertEquals(cancels.at(-1), d.postId);
  assertEquals((d.run.files as string[]).some((f) => files.has(f)), false);

  // the same account and the same settings again leave it alone; taking the account off stops it
  const a = await handed();
  const before = cancels.length;
  assertEquals((await call("jwt-a", { action: "account", id: a.id, account_id: ACCOUNT })).status, 200);
  assertEquals((await call("jwt-a", { action: "save", campaign: { id: a.id, name: "Handed", spec, schedule, publish: { mode: "inbox" } } })).status, 200);
  assertEquals(cancels.length, before);
  assertEquals((await call("jwt-a", { action: "account", id: a.id, account_id: null })).status, 200);
  cancelled(a, "Cancelled: the campaign's TikTok account changed.");

  // straight to the profile, then consent withdrawn: the post Zernio holds would still go out unseen
  const k = await handed({ mode: "direct", consent_at: new Date().toISOString(), music: false });
  assertEquals((await call("jwt-a", { action: "save", campaign: { id: k.id, name: "Handed", spec, schedule, publish: { mode: "direct", consent: false } } })).status, 200);
  cancelled(k, "Cancelled: the campaign's posting settings changed.");
});

Deno.test("the tick sweeps old example runs and their files", async () => {
  const runId = crypto.randomUUID();
  const path = `${A}/runs/${runId}/1.png`;
  files.set(path, new Uint8Array([1]));
  db.cs_slide_campaign_runs.push({ id: runId, kind: "preview", files: [path], created_at: new Date(Date.now() - 8 * 24 * 3600_000).toISOString() });
  await tick(admin as never);
  assertEquals(db.cs_slide_campaign_runs.some((r) => r.id === runId), false);
  assertEquals(files.has(path), false);
});

Deno.test("the cron needs its secret", async () => {
  Deno.env.set("SLIDE_CAMPAIGNS_SECRET", "s3cret");
  const r = await handle(new Request("https://x", { method: "POST", headers: { "x-slide-campaigns-secret": "nope" } }), admin as never);
  assertEquals(r.status, 403);
});
