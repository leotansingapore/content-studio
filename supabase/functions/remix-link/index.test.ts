import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { LINK_COPY } from "./logic";

// The live handler with the database, Apify, DataForSEO and OpenAI faked: when a read of a pasted link or an
// upload is counted, and when its use comes back. The Apify reader (clone-reel/source.ts) runs for real.
const LEO = "leo-uid";
const OTHER = "6d80f027-3395-480c-86a1-8827d3d6cce3";
const REEL = "https://www.instagram.com/reel/C931Kabcde/";
const YT = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
const SHA1 = "a".repeat(40);
const JPEG = "data:image/jpeg;base64,AAAA";

const db = vi.hoisted(() => {
  // cs_ai_usage in memory, keyed user|feature|day: the consume RPC, one row read and the conditional update
  const rows = new Map<string, number>();
  // cs_reel_sources by platform:post_id, and cs_reel_fetches (a run already going) by lookup_key
  const reels = new Map<string, Record<string, unknown>>();
  const fetches = new Map<string, { run_id: string; started_at: string }>();
  const today = () => new Date().toISOString().slice(0, 10);
  const key = (q: Record<string, unknown>) => `${q.user_id}|${q.feature}|${q.day}`;
  const state = { rpcDown: false };
  const admin = {
    auth: { getUser: async (jwt: string) => ({ data: { user: jwt ? { id: jwt } : null } }) },
    rpc: async (_fn: string, a: Record<string, unknown>) => {
      if (state.rpcDown) return { data: null, error: { message: "down" } };
      const k = `${a.p_user}|${a.p_feature}|${today()}`;
      const n = rows.get(k) ?? 0;
      if (n >= Number(a.p_limit)) return { data: null, error: null };
      rows.set(k, n + 1);
      return { data: n + 1, error: null };
    },
    from: (table: string) => {
      if (table === "cs_reel_sources") {
        return {
          select: () => {
            const f: Record<string, unknown> = {};
            const b = {
              eq: (c: string, v: unknown) => ((f[c] = v), b),
              contains: () => b,
              limit: () => b,
              maybeSingle: async () => ({ data: f.post_id ? reels.get(`${f.platform}:${f.post_id}`) ?? null : null, error: null }),
            };
            return b;
          },
          upsert: async (r: Record<string, unknown>) => (reels.set(`${r.platform}:${r.post_id}`, r), { error: null }),
        };
      }
      if (table === "cs_reel_fetches") {
        return {
          select: () => ({ eq: (_c: string, k: string) => ({ maybeSingle: async () => ({ data: fetches.get(k) ?? null, error: null }) }) }),
          upsert: async (r: { lookup_key: string; run_id: string; started_at: string }) => (fetches.set(r.lookup_key, r), { error: null }),
          delete: () => ({ eq: (_c: string, k: string) => ({ eq: async () => (fetches.delete(k), { error: null }) }) }),
        };
      }
      return {
        select: () => ({ match: async (q: Record<string, unknown>) => ({ data: rows.has(key(q)) ? [{ count: rows.get(key(q)) }] : [], error: null }) }),
        update: (v: { count: number }) => ({
          match: (q: Record<string, unknown>) => ({
            select: async () => {
              const hit = rows.get(key(q)) === q.count;
              if (hit) rows.set(key(q), v.count);
              return { data: hit ? [v] : [], error: null };
            },
          }),
        }),
      };
    },
  };
  return { admin, rows, reels, fetches, today, state, handler: null as null | ((r: Request) => Promise<Response>) };
});
vi.mock("https://esm.sh/@supabase/supabase-js@2", () => ({ createClient: () => db.admin }));

// Apify: a run starts and ends `run`, its dataset holds `items`; `hold` keeps the start waiting until released.
// DataForSEO answers `captions` (or `captionsStatus`); OpenAI answers `vision` (or `visionStatus`).
const net = {
  apify: [] as string[],
  run: "SUCCEEDED",
  items: [] as unknown[],
  apifyDown: false,
  hold: null as null | Promise<void>,
  dataforseo: 0,
  captions: null as unknown,
  captionsStatus: 200,
  openai: 0,
  vision: null as unknown,
  visionStatus: 200,
};
const igItem = (extra: Record<string, unknown> = {}) => ({
  shortCode: "C931Kabcde",
  productType: "clips",
  ownerUsername: "grace.koh",
  caption: "6 signs your CPF plan is off track",
  transcript: "Most people never check their CPF statement.",
  ...extra,
});

beforeAll(async () => {
  // one fixed instant, so the counter's day can't turn between the handler and these rows
  vi.useFakeTimers({ toFake: ["Date"] });
  const env: Record<string, string> = {
    SUPABASE_URL: "http://db",
    SUPABASE_SERVICE_ROLE_KEY: "k",
    NORTH_STAR_USERS: LEO,
    APIFY_API_KEY: "k",
    DATAFORSEO_LOGIN: "l",
    DATAFORSEO_PASSWORD: "p",
    OPENAI_API_KEY: "k",
  };
  vi.stubGlobal("Deno", { serve: (fn: (r: Request) => Promise<Response>) => (db.handler = fn), env: { get: (k: string) => env[k] } });
  vi.stubGlobal("fetch", async (u: URL | string) => {
    const url = String(u);
    if (url.startsWith("https://api.apify.com/")) {
      net.apify.push(url.replace("https://api.apify.com/v2", "").split("?")[0]);
      if (net.hold) await net.hold;
      if (net.apifyDown) return new Response("{}", { status: 500 });
      if (url.includes("/datasets/")) return Response.json(net.items);
      return Response.json({ data: { id: "run-1", status: net.run, defaultDatasetId: "ds-1" } });
    }
    if (url.startsWith("https://api.dataforseo.com/")) {
      net.dataforseo++;
      return net.captionsStatus === 200 ? Response.json(net.captions) : new Response("{}", { status: net.captionsStatus });
    }
    if (url.startsWith("https://api.openai.com/")) {
      net.openai++;
      if (net.visionStatus !== 200) return new Response("{}", { status: net.visionStatus });
      return Response.json({ model: "gpt-6-luna", choices: [{ message: { content: JSON.stringify(net.vision) } }] });
    }
    throw new Error(`unexpected fetch ${url}`);
  });
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
  await import("./index.ts");
}, 30_000);
afterAll(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
beforeEach(() => {
  db.rows.clear();
  db.reels.clear();
  db.fetches.clear();
  db.state.rpcDown = false;
  Object.assign(net, { apify: [], run: "SUCCEEDED", items: [igItem()], apifyDown: false, hold: null, dataforseo: 0, captionsStatus: 200, openai: 0, visionStatus: 200 });
  net.captions = { tasks: [{ result: [{ title: "CPF in 60 seconds", items: [{ start_time: 0, end_time: 3, text: "Most people never check their CPF." }] }] }] };
  net.vision = { words: "6 signs your CPF plan is off track", shows: "A slide with white text on blue.", author: "@grace.koh" };
});
afterEach(() => {
  // a test that froze setTimeout puts back the Date-only clock the others use
  vi.useFakeTimers({ toFake: ["Date"] });
});

const send = async (body: unknown, uid = LEO) => {
  const r = await db.handler!(new Request("http://x/remix-link", { method: "POST", headers: { Authorization: `Bearer ${uid}` }, body: JSON.stringify(body) }));
  return { status: r.status, body: await r.json() };
};
const link = (url: string, uid = LEO) => send({ mode: "link", url }, uid);
const used = (feature: "remix-link" | "remix-image", uid = LEO) => db.rows.get(`${uid}|${feature}|${db.today()}`) ?? 0;

describe("a pasted Instagram or TikTok link", () => {
  it("reads through Apify on one use, and keeps the post so the next paste is free", async () => {
    const first = await link(REEL);
    expect(first).toMatchObject({ status: 200, body: { source: { key: "link:instagram:C931Kabcde", author: "@grace.koh" }, usage: { used: 1, limit: 20 } } });
    expect(used("remix-link")).toBe(1);
    expect(db.fetches.size).toBe(0);
    const again = await link(REEL);
    expect(again).toMatchObject({ status: 200, body: { source: { key: "link:instagram:C931Kabcde" }, usage: null } });
    expect(used("remix-link")).toBe(1);
    expect(net.apify.filter((p) => p.startsWith("/acts/"))).toHaveLength(1);
  });

  it("reads a post already kept for nothing, even with the day's reads used up", async () => {
    await link(REEL);
    db.rows.set(`${LEO}|remix-link|${db.today()}`, 20);
    net.apify = [];
    expect(await link(REEL)).toMatchObject({ status: 200, body: { usage: null } });
    expect(net.apify).toEqual([]);
  });

  it("is refused over the day's reads without starting an Apify run", async () => {
    db.rows.set(`${LEO}|remix-link|${db.today()}`, 20);
    const res = await link(REEL);
    expect(res).toMatchObject({ status: 429, body: { code: "daily_limit" } });
    expect(net.apify).toEqual([]);
  });

  it("says try again shortly, with no Apify run, when the counter can't be read", async () => {
    db.state.rpcDown = true;
    expect(await link(REEL)).toMatchObject({ status: 503, body: { code: "usage_unavailable" } });
    expect(net.apify).toEqual([]);
  });

  it("gives the use back when Apify is down", async () => {
    net.apifyDown = true;
    expect(await link(REEL)).toMatchObject({ status: 502, body: { code: "scrape_failed", error: LINK_COPY.failed } });
    expect(used("remix-link")).toBe(0);
  });

  it("gives the use back when the Apify run ends without the post", async () => {
    net.run = "FAILED";
    expect(await link(REEL)).toMatchObject({ status: 502, body: { error: LINK_COPY.failed } });
    expect(used("remix-link")).toBe(0);
  });

  it("gives the use back, and says the post may be private, when Apify finds nothing", async () => {
    net.items = [];
    expect(await link(REEL)).toMatchObject({ status: 404, body: { code: "not_found", error: LINK_COPY.gone } });
    expect(used("remix-link")).toBe(0);
  });

  it("gives the use back when the post has no caption or words to read", async () => {
    net.items = [igItem({ caption: "", transcript: null })];
    expect(await link(REEL)).toMatchObject({ status: 422, body: { code: "empty", error: LINK_COPY.noWords } });
    expect(used("remix-link")).toBe(0);
  });

  it("reads a retry that re-attaches to a run still going for nothing, even with the day's reads used up", async () => {
    db.rows.set(`${LEO}|remix-link|${db.today()}`, 20);
    db.fetches.set("instagram:C931Kabcde", { run_id: "run-1", started_at: new Date(Date.now() - 60_000).toISOString() });
    expect(await link(REEL)).toMatchObject({ status: 200, body: { source: { key: "link:instagram:C931Kabcde" }, usage: null } });
    expect(net.apify).toEqual(["/actor-runs/run-1", "/datasets/ds-1/items"]);
    expect(used("remix-link")).toBe(20);
  });

  it("gives nothing back when a re-attached retry fails: the first read's use is that read's to give back", async () => {
    db.rows.set(`${LEO}|remix-link|${db.today()}`, 1);
    db.fetches.set("instagram:C931Kabcde", { run_id: "run-1", started_at: new Date(Date.now() - 60_000).toISOString() });
    net.apifyDown = true;
    expect(await link(REEL)).toMatchObject({ status: 502 });
    expect(used("remix-link")).toBe(1);
  });

  it("keeps reading after the slow answer, and gives the use back when that run then fails", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    // midday UTC today, so the 56 s below can't carry the counter's day over
    vi.setSystemTime(new Date(`${new Date().toISOString().slice(0, 10)}T12:00:00Z`));
    let release = () => {};
    net.hold = new Promise<void>((r) => (release = r));
    const pending = link(REEL);
    await vi.advanceTimersByTimeAsync(56_000);
    expect(await pending).toMatchObject({ status: 504, body: { code: "timeout", error: LINK_COPY.slow } });
    expect(used("remix-link")).toBe(1);
    net.run = "FAILED";
    release();
    await vi.waitFor(() => expect(used("remix-link")).toBe(0));
  });

  it("is refused before any count for an account not switched on", async () => {
    expect(await link(REEL, OTHER)).toMatchObject({ status: 403, body: { code: "not_enabled" } });
    expect(used("remix-link", OTHER)).toBe(0);
    expect(net.apify).toEqual([]);
  });
});

describe("a pasted YouTube link", () => {
  it("reads the captions on one use", async () => {
    expect(await link(YT)).toMatchObject({ status: 200, body: { source: { key: "link:youtube:dQw4w9WgXcQ" }, usage: { used: 1, limit: 20 } } });
    expect(used("remix-link")).toBe(1);
  });

  it("gives the use back when the video has no captions", async () => {
    net.captions = { tasks: [{ result: [{ title: "No words", items: [] }] }] };
    expect(await link(YT)).toMatchObject({ status: 422, body: { code: "no_captions", error: LINK_COPY.noCaptions } });
    expect(used("remix-link")).toBe(0);
  });

  it("gives the use back when DataForSEO fails", async () => {
    net.captionsStatus = 500;
    expect(await link(YT)).toMatchObject({ status: 502, body: { code: "failed", error: LINK_COPY.failed } });
    expect(used("remix-link")).toBe(0);
  });

  it("is refused over the day's reads without asking DataForSEO", async () => {
    db.rows.set(`${LEO}|remix-link|${db.today()}`, 20);
    expect(await link(YT)).toMatchObject({ status: 429, body: { code: "daily_limit" } });
    expect(net.dataforseo).toBe(0);
  });
});

describe("an uploaded picture or a video's frames", () => {
  it("reads a picture on one use of its own cap", async () => {
    const res = await send({ mode: "image", image: JPEG, sha1: SHA1 });
    expect(res).toMatchObject({ status: 200, body: { source: { key: `upload:${SHA1}`, format: "image" }, usage: { used: 1, limit: 10 } } });
    expect([used("remix-image"), used("remix-link")]).toEqual([1, 0]);
  });

  it("gives the use back when OpenAI is down", async () => {
    net.visionStatus = 500;
    expect(await send({ mode: "image", image: JPEG, sha1: SHA1 })).toMatchObject({ status: 502, body: { code: "failed" } });
    expect(used("remix-image")).toBe(0);
  });

  it("gives the use back when the answer holds nothing to remix", async () => {
    net.vision = { words: "", shows: "", author: "" };
    expect(await send({ mode: "frames", frames: [JPEG], sha1: SHA1, transcript: "" })).toMatchObject({ status: 502, body: { code: "failed" } });
    expect(used("remix-image")).toBe(0);
  });

  it("is refused over the day's reads without asking OpenAI", async () => {
    db.rows.set(`${LEO}|remix-image|${db.today()}`, 10);
    expect(await send({ mode: "image", image: JPEG, sha1: SHA1 })).toMatchObject({ status: 429, body: { code: "daily_limit" } });
    expect(net.openai).toBe(0);
  });
});
