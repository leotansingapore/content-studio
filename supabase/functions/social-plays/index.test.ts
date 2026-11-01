import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// The handler with every provider faked (the CDN covers, Jev, OpenAI): which counters move, which come back, what Jev sees.
const db = vi.hoisted(() => ({
  spent: [] as string[],
  refunded: [] as string[],
  refuse: [] as string[],
  admin: {} as Record<string, unknown>,
  handler: null as null | ((r: Request) => Promise<Response>),
}));
db.admin = {
  auth: { getUser: async (jwt: string) => ({ data: { user: jwt ? { id: jwt } : null } }) },
  rpc: async (_fn: string, a: Record<string, unknown>) => (db.spent.push(String(a.p_feature)), { data: db.refuse.includes(String(a.p_feature)) ? null : 1, error: null }),
  from: () => ({
    select: () => ({ match: async () => ({ data: [{ count: 1 }], error: null }) }),
    update: () => ({ match: (q: { feature: string }) => ({ select: async () => (db.refunded.push(q.feature), { data: [{ count: 0 }], error: null }) }) }),
  }),
};
vi.mock("https://esm.sh/@supabase/supabase-js@2.117.3", () => ({ createClient: () => db.admin }));

const LEO = "leo-uid";
// SOI, an APP0 segment, then a baseline frame header of the given size
const jpeg = (w: number, h: number) => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, ...new Array(14).fill(0), 0xff, 0xc0, 0, 17, 8, h >> 8, h & 255, w >> 8, w & 255, 3, 0, 0, 0]);
const COVERS: Record<string, Uint8Array | null> = {
  "https://p16-sign.tiktokcdn.com/ok.jpeg": jpeg(576, 1024),
  "https://scontent.cdninstagram.com/reel.jpg": jpeg(1080, 1920),
  "https://scontent.cdninstagram.com/gone.jpg": null,
};
let env: Record<string, string> = {};
let jev: "up" | "down" | "no-pictures" = "up";
let openai: "ok" | "down" = "ok";
const jevCalls: { state: Record<string, unknown>; picture: boolean; header: string | null }[] = [];
const fetched: string[] = [];

beforeAll(async () => {
  vi.stubGlobal("Deno", {
    serve: (fn: (r: Request) => Promise<Response>) => (db.handler = fn),
    env: { get: (k: string) => env[k] },
    resolveDns: async (_host: string, type: string) => (type === "AAAA" ? [] : ["151.101.1.69"]),
  });
  vi.stubGlobal("fetch", async (u: URL | string, init?: RequestInit) => {
    const url = String(u);
    fetched.push(url);
    if (url.startsWith("https://api.typesafe.ai/")) {
      const req = JSON.parse(String(init?.body));
      const picture = Boolean(req.assets);
      jevCalls.push({ state: req.state, picture, header: new Headers(init?.headers).get("TypeSafe-Danger-Zone-Images") });
      if (jev === "down" || (jev === "no-pictures" && picture)) return new Response("busy", { status: 503 });
      // the fixture's own words decide: "demo" posts are screen demos, the rest slideshows
      const family = String(req.state.caption).includes("demo") ? "screen-demo" : "faceless-slideshow";
      return Response.json({ answers: {
        family: { type: "choice", choice: family, probabilities: { [family]: 0.9 } },
        hook: { type: "choice", choice: "numbered_tips", probabilities: { numbered_tips: 0.7 } },
      } });
    }
    if (url.startsWith("https://api.openai.com/")) {
      if (openai === "down") return new Response("down", { status: 500 });
      const req = JSON.parse(String(init?.body));
      const ids = [...String(req.messages[1].content).matchAll(/^play ([a-z-]+) /gm)].map((m) => m[1]);
      return Response.json({ model: "m", choices: [{ message: { content: JSON.stringify({ recipes: ids.map((play) => ({ play, hook: "3 [things] that [result]", body: "Cover, three tips, a close", caption: "One line and a question", cta: "Follow for more" })) }) } }] });
    }
    if (url in COVERS) return COVERS[url] ? new Response(COVERS[url], { headers: { "content-type": "image/jpeg" } }) : new Response("gone", { status: 403 });
    throw new Error(`unexpected fetch ${url}`);
  });
  await import("./index.ts");
}, 30_000);

beforeEach(() => {
  db.spent.length = 0;
  db.refunded.length = 0;
  db.refuse = [];
  jevCalls.length = 0;
  fetched.length = 0;
  jev = "up";
  openai = "ok";
  env = { NORTH_STAR_USERS: `someone-else,${LEO}`, TYPESAFE_API_KEY: "t", OPENAI_API_KEY: "k" };
});

const call = async (body: unknown, uid = LEO) => {
  const r = await db.handler!(new Request("http://x/social-plays", { method: "POST", headers: uid ? { Authorization: `Bearer ${uid}` } : {}, body: JSON.stringify(body) }));
  return { status: r.status, body: await r.json() };
};
const post = (id: string, handle: string, caption: string, o: Record<string, unknown> = {}) =>
  ({ key: `tiktok:${id}`, platform: "tiktok", handle, kind: "app_or_brand", format: "video", caption, ratio: 3, ...o });
// two plays' worth: 3 slideshows from 2 accounts, 3 demos from 2 accounts
const POSTS = [
  post("101", "app_one", "5 habits", { cover: "https://p16-sign.tiktokcdn.com/ok.jpeg" }),
  post("102", "app_two", "a morning routine", { cover: "https://scontent.cdninstagram.com/reel.jpg" }),
  post("103", "app_one", "3 rules", { cover: "https://scontent.cdninstagram.com/gone.jpg" }),
  post("104", "app_two", "app demo one"), post("105", "app_three", "app demo two"), post("106", "app_two", "app demo three"),
];

describe("social-plays: the gate", () => {
  it("answers 401 without a sign-in and 403 for anyone not listed, before any counter or provider", async () => {
    expect((await call({ posts: POSTS }, "")).status).toBe(401);
    expect((await call({ posts: POSTS }, "stranger")).status).toBe(403);
    expect(db.spent).toEqual([]);
    expect(fetched).toEqual([]);
  });

  it("refuses a bad body before counting, and says when Jev isn't switched on", async () => {
    expect((await call({ posts: "x" })).body).toEqual({ code: "bad_request", error: "Send the posts as a list." });
    env.TYPESAFE_API_KEY = "";
    expect((await call({ posts: POSTS })).status).toBe(503);
    expect(db.spent).toEqual([]);
  });
});

describe("social-plays: a build", () => {
  it("labels each new post once, with the cover when Jev can take it, groups the plays and writes their recipes", async () => {
    const own = post("201", "brand", "our demo", { ratio: 0 });
    const r = await call({ posts: [...POSTS, post("107", "app_three", "app demo four", { label: { family: "screen-demo", hook: null } })], own: [own] });
    expect(r.status).toBe(200);
    expect(db.spent).toEqual(["social-plays", "social-plays-global"]);
    expect(db.refunded).toEqual([]);
    // the labelled post is not asked again; the brand's own post is
    expect(jevCalls.map((c) => c.state.caption).sort()).toEqual([...POSTS.map((p) => p.caption), "our demo"].sort());
    expect(Object.keys(r.body.labels).sort()).toEqual([...POSTS.map((p) => p.key), "tiktok:201"].sort());
    expect(r.body.labels["tiktok:104"]).toEqual({ family: "screen-demo", hook: "numbered_tips" });
    // only the 576x1024 JPEG went to Jev as a picture, with the beta header; the 1080x1920 one and the gone one went as words
    const pictured = jevCalls.filter((c) => c.picture);
    expect(pictured.map((c) => c.state.caption)).toEqual(["5 habits"]);
    expect(pictured[0].header).toBe("true");
    expect(typeof pictured[0].state.cover).toBe("string");
    expect(jevCalls.filter((c) => !c.picture).every((c) => c.header === null && !("cover" in c.state))).toBe(true);
    expect(Object.keys(r.body.recipes).sort()).toEqual(["faceless-slideshow", "screen-demo"]);
    expect(r.body.recipes["screen-demo"]).toMatchObject({ hook: "3 [things] that [result]", cta: "Follow for more" });
    expect(r.body.note).toBeUndefined();
  });

  it("asks a post again on its words when Jev refuses its picture", async () => {
    jev = "no-pictures";
    const r = await call({ posts: POSTS.slice(0, 1) });
    expect(jevCalls.map((c) => c.picture)).toEqual([true, false]);
    expect(r.body.labels["tiktok:101"]).toEqual({ family: "faceless-slideshow", hook: "numbered_tips" });
  });

  it("gives both uses back and says so when Jev answers nothing", async () => {
    jev = "down";
    const r = await call({ posts: POSTS });
    expect(r).toEqual({ status: 502, body: { code: "failed", error: "Couldn't sort the posts right now. Try again in a few minutes." } });
    expect(db.refunded).toEqual(["social-plays", "social-plays-global"]);
    expect(fetched.some((u) => u.startsWith("https://api.openai.com/"))).toBe(false);
  });

  it("keeps the labels without recipes when OpenAI is down, and keeps the uses Jev was paid for", async () => {
    openai = "down";
    const r = await call({ posts: POSTS });
    expect(r.status).toBe(200);
    expect(Object.keys(r.body.labels)).toHaveLength(6);
    expect(r.body.recipes).toEqual({});
    expect(r.body.note).toBe("Couldn't write the recipes right now. They come with the next build.");
    expect(db.refunded).toEqual([]);
  });

  it("gives the uses back when every post came labelled and the recipes failed: nothing was paid for", async () => {
    openai = "down";
    const labelled = POSTS.map((p) => ({ ...p, label: { family: p.caption.includes("demo") ? "screen-demo" : "faceless-slideshow", hook: null } }));
    const r = await call({ posts: labelled });
    expect(jevCalls).toEqual([]);
    expect(r.body.note).toBeDefined();
    expect(db.refunded).toEqual(["social-plays", "social-plays-global"]);
  });

  it("stops at the across-everyone cap and gives the caller's use back", async () => {
    db.refuse = ["social-plays-global"];
    const r = await call({ posts: POSTS });
    expect(r).toEqual({ status: 429, body: { code: "global_limit", error: "Building plays is paused for today. It resumes at 8am Singapore time." } });
    expect(db.refunded).toEqual(["social-plays"]);
    expect(jevCalls).toEqual([]);
  });
});
