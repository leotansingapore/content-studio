import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// The handler with OpenAI and Jev faked: which counter moves, which comes back, and what each mode answers.
const db = vi.hoisted(() => ({
  spent: [] as string[],
  refunded: [] as string[],
  limit: false,
  admin: {} as Record<string, unknown>,
  handler: null as null | ((r: Request) => Promise<Response>),
}));
db.admin = {
  auth: { getUser: async (jwt: string) => ({ data: { user: jwt ? { id: jwt } : null } }) },
  rpc: async (_fn: string, a: Record<string, unknown>) => (db.spent.push(String(a.p_feature)), { data: db.limit ? null : 1, error: null }),
  from: () => ({
    select: () => ({ match: async () => ({ data: [{ count: 1 }], error: null }) }),
    update: () => ({ match: (q: { feature: string; day: string }) => ({ select: async () => (db.refunded.push(`${q.feature} ${q.day}`), { data: [{ count: 0 }], error: null }) }) }),
  }),
};
vi.mock("https://esm.sh/@supabase/supabase-js@2.117.3", () => ({ createClient: () => db.admin }));

const LEO = "leo-uid";
const STILL = `data:image/jpeg;base64,${"A".repeat(400)}`;
const SORT = { mode: "sort", still: STILL, kind: "photo", width: 1080, height: 1080, name: "logo.png" };
const DEMO = { mode: "demo", stills: [STILL, STILL, STILL], name: "Illustration" };

let env: Record<string, string> = {};
let openai: "ok" | "down" | "offline" | "garbled" = "ok";
let jev: "up" | "down" | "no-images" = "up";
const sent: { url: string; body: Record<string, unknown>; headers: Record<string, string> }[] = [];

beforeAll(async () => {
  vi.stubGlobal("Deno", { serve: (fn: (r: Request) => Promise<Response>) => (db.handler = fn), env: { get: (k: string) => env[k] } });
  vi.stubGlobal("fetch", async (u: URL | string, init?: RequestInit) => {
    const url = String(u);
    const body = JSON.parse(String(init?.body ?? "{}"));
    sent.push({ url, body, headers: (init?.headers ?? {}) as Record<string, string> });
    if (url.startsWith("https://api.openai.com/")) {
      if (openai === "offline") throw new Error("connect refused");
      if (openai === "down") return new Response("overloaded", { status: 500 });
      const demo = JSON.stringify(body.messages).includes("screen recording");
      const content = openai === "garbled" ? "not json" : JSON.stringify(demo ? { shows: "A policy illustration with a payout table", onScreen: "Projected payout" } : { alt: "A blue wordmark on white", onScreen: "Acme" });
      return Response.json({ model: "gpt-x", choices: [{ message: { content } }] });
    }
    if (url.startsWith("https://api.typesafe.ai/")) {
      if (jev === "down") return new Response("busy", { status: 503 });
      if (body.assets && jev === "no-images") return new Response("image too small", { status: 400 });
      // with the still, Jev is surer: 0.45 clears IMAGE_TYPE_MIN (0.4); the words alone give 0.82
      if (body.questions.type) return Response.json({ answers: { type: { type: "choice", choice: body.assets ? "past-post" : "logo", probabilities: body.assets ? { "past-post": 0.45 } : { logo: 0.82 } } } });
      return Response.json({ answers: { namedProduct: { type: "noul", noul: 0.2 }, returns: { type: "noul", noul: 0.9 }, personal: { type: "noul", noul: 0.5 } } });
    }
    throw new Error(`unexpected fetch ${url}`);
  });
  await import("./index.ts");
}, 30_000);

beforeEach(() => {
  env = { NORTH_STAR_USERS: `someone,${LEO}`, OPENAI_API_KEY: "k", TYPESAFE_API_KEY: "t" };
  openai = "ok";
  jev = "up";
  db.limit = false;
  db.spent.length = 0;
  db.refunded.length = 0;
  sent.length = 0;
});

const call = async (body: unknown, uid = LEO) => {
  const r = await db.handler!(new Request("http://x/media-sort", { method: "POST", headers: uid ? { Authorization: `Bearer ${uid}` } : {}, body: JSON.stringify(body) }));
  return { status: r.status, body: await r.json() };
};
const today = () => new Date().toISOString().slice(0, 10);

describe("media-sort sort", () => {
  it("answers 401 without a sign-in and 403 for a uid missing from NORTH_STAR_USERS, before counting or calling anything", async () => {
    expect((await call(SORT, "")).status).toBe(401);
    expect(await call(SORT, "other-uid")).toEqual({ status: 403, body: { code: "not_enabled", error: "This isn't switched on for your account yet." } });
    expect(db.spent).toEqual([]);
    expect(sent).toEqual([]);
  });

  it("refuses a bad request before counting", async () => {
    expect((await call({ ...SORT, still: "nope" })).body).toEqual({ code: "bad_request", error: "Send one JPEG still of the file, up to 200 KB." });
    expect((await call({ ...SORT, mode: "tag" })).status).toBe(400);
    expect(db.spent).toEqual([]);
    expect(sent).toEqual([]);
  });

  it("counts media-sort once, sends one low-detail still, and returns the alt text and Jev's type from the still", async () => {
    const r = await call(SORT);
    expect(r).toEqual({ status: 200, body: { alt: "A blue wordmark on white", type: "past-post" } });
    expect(db.spent).toEqual(["media-sort"]);
    expect(db.refunded).toEqual([]);
    expect(sent).toHaveLength(2);
    const [vision, judge] = sent;
    expect(JSON.stringify(vision.body.messages)).toContain('"detail":"low"');
    expect(vision.body.response_format).toMatchObject({ type: "json_schema", json_schema: { name: "media_sort", strict: true } });
    const ref = (judge.body.state as { still: string }).still;
    expect(ref).toMatch(/^img-[0-9a-f-]{36}$/);
    expect(judge.body).toMatchObject({ model: "jev-1.13.0", state: { alt: "A blue wordmark on white", onScreen: "Acme", kind: "photo", shape: "square", name: "logo.png" } });
    expect(judge.body.assets).toEqual({ [ref]: { type: "image", format: "jpg", data_base64: "A".repeat(400) } });
    expect(judge.headers["TypeSafe-Danger-Zone-Images"]).toBe("true");
  });

  it("falls back to the words alone when Jev refuses the still", async () => {
    jev = "no-images";
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect((await call(SORT)).body).toEqual({ alt: "A blue wordmark on white", type: "logo" });
    const [, look, words] = sent;
    expect(look.body.assets).toBeDefined();
    expect(words.body).not.toHaveProperty("assets");
    expect(words.body.state).not.toHaveProperty("still");
  });

  it("lands as other with its alt text when Jev is off", async () => {
    jev = "down";
    expect((await call(SORT)).body).toEqual({ alt: "A blue wordmark on white", type: "other" });
    delete env.TYPESAFE_API_KEY;
    expect((await call(SORT)).body).toEqual({ alt: "A blue wordmark on white", type: "other" });
    expect(db.refunded).toEqual([]);
  });

  it("gives the use back when the vision call never answered", async () => {
    for (const mode of ["down", "offline"] as const) {
      openai = mode;
      expect(await call(SORT)).toEqual({ status: 502, body: { code: "failed", error: "Couldn't sort that file. Try again in a minute." } });
    }
    expect(db.spent).toEqual(["media-sort", "media-sort"]);
    expect(db.refunded).toEqual([`media-sort ${today()}`, `media-sort ${today()}`]);
  });

  it("keeps the use when the reply can't be read", async () => {
    openai = "garbled";
    expect(await call(SORT)).toEqual({ status: 422, body: { code: "unreadable", error: "Couldn't read that file." } });
    expect(db.spent).toEqual(["media-sort"]);
    expect(db.refunded).toEqual([]);
  });

  it("answers the daily limit without calling OpenAI", async () => {
    db.limit = true;
    const r = await call(SORT);
    expect(r.status).toBe(429);
    expect(r.body.code).toBe("daily_limit");
    expect(sent).toEqual([]);
  });
});

describe("media-sort demo", () => {
  it("answers 403 for a uid missing from NORTH_STAR_USERS", async () => {
    expect((await call(DEMO, "other-uid")).status).toBe(403);
    expect(db.spent).toEqual([]);
  });

  it("counts media-sort and returns what it shows with the flags Jev raised", async () => {
    const r = await call(DEMO);
    expect(r).toEqual({ status: 200, body: { shows: "A policy illustration with a payout table", flags: ["returns", "personal"] } });
    expect(db.spent).toEqual(["media-sort"]);
    expect(sent[0].body.response_format).toMatchObject({ json_schema: { name: "media_demo" } });
    expect(JSON.stringify(sent[0].body.messages).match(/"detail":"low"/g)).toHaveLength(3);
  });

  it("raises no flags when Jev is off, and refunds when the vision call never answered", async () => {
    jev = "down";
    expect((await call(DEMO)).body).toEqual({ shows: "A policy illustration with a payout table", flags: [] });
    openai = "down";
    expect(await call(DEMO)).toEqual({ status: 502, body: { code: "failed", error: "Couldn't read what it shows. Try again in a minute." } });
    expect(db.refunded).toEqual([`media-sort ${today()}`]);
  });

  it("refuses four stills before counting", async () => {
    expect((await call({ ...DEMO, stills: [STILL, STILL, STILL, STILL] })).status).toBe(400);
    expect(db.spent).toEqual([]);
  });
});
