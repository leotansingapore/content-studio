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
  lte(k: string, v: string) {
    this.filters.push((r) => typeof r[k] === "string" && (r[k] as string) <= v);
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
    }),
  },
};

const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";
const ACCOUNT = "0123456789abcdef01234567";
const ZPROFILE = "aaaaaaaaaaaaaaaaaaaaaaaa";
const posts: Row[] = [];

// canned writer and Zernio; everything else (fonts, the resvg wasm, Pexels) goes to the network
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (url.includes("api.openai.com")) {
    const content = JSON.stringify({ slides: ["Walk the course before you play it.", "Count your putts for a week.", "Practise the shot you avoid."], cta: "", caption: "Three habits that cut strokes. #golf #golftips" });
    return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200, headers: { "content-type": "application/json" } });
  }
  if (url.includes("zernio")) {
    if (url.includes("/accounts")) return Response.json({ accounts: [{ _id: ACCOUNT, platform: "tiktok", profileId: ZPROFILE, username: "scratch.ai", enabled: true }] });
    if (url.endsWith("/posts")) {
      const body = JSON.parse(String(init?.body));
      posts.push(body);
      return Response.json({ post: { _id: "bbbbbbbbbbbbbbbbbbbbbbbb", status: "scheduled", platforms: body.platforms, scheduledFor: body.scheduledFor } });
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
    ],
  });
  assertEquals(add.body.added, 2);
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
  assertEquals(saved.body.campaign.publish.mode, "inbox", "direct posting is not offered yet");

  // someone else can't touch it
  assertEquals((await call("jwt-b", { action: "preview", id })).status, 404);

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

  // Start needs the posting switch, then an account
  assertEquals((await call("jwt-a", { action: "start", id })).body.code, "not_enabled");
  Deno.env.set("SOCIAL_CONNECT_USERS", A);
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

  // a slot the tick missed is skipped, not posted late
  c.next_run_at = new Date(Date.now() - 5 * 60_000).toISOString();
  assertEquals(await tick(admin as never), { made: 0, failed: 0 });
  assertEquals(posts.length, 1);
  assert(new Date(String(c.next_run_at)) > new Date(), "skipped to a later slot");

  // posting switched off: the next tick pauses it
  Deno.env.set("SOCIAL_CONNECT_USERS", "");
  c.next_run_at = new Date(Date.now() + 5 * 60_000).toISOString();
  assertEquals(await tick(admin as never), { made: 0, failed: 1 });
  assertEquals(c.status, "paused");

  // deleting the campaign removes its files
  assertEquals((await call("jwt-a", { action: "delete", id })).status, 200);
  assertEquals([...files.keys()].filter((k) => k.includes("/runs/")).length, 0);
});

Deno.test("the cron needs its secret", async () => {
  Deno.env.set("SLIDE_CAMPAIGNS_SECRET", "s3cret");
  const r = await handle(new Request("https://x", { method: "POST", headers: { "x-slide-campaigns-secret": "nope" } }), admin as never);
  assertEquals(r.status, 403);
});
