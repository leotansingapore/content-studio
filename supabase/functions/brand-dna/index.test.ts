import { readFileSync } from "node:fs";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// The handler with the web, the LLM and Jev faked: what a brand's address turns into, and which counters move.
const db = vi.hoisted(() => ({
  spent: [] as string[],
  refunded: [] as string[],
  admin: {} as Record<string, unknown>,
  handler: null as null | ((r: Request) => Promise<Response>),
}));
db.admin = {
  auth: { getUser: async (jwt: string) => ({ data: { user: jwt ? { id: jwt } : null } }) },
  rpc: async (_fn: string, a: Record<string, unknown>) => (db.spent.push(String(a.p_feature)), { data: 1, error: null }),
  from: () => ({
    select: () => ({ match: async () => ({ data: [{ count: 1 }], error: null }) }),
    update: () => ({ match: (q: { feature: string }) => ({ select: async () => (db.refunded.push(q.feature), { data: [{ count: 0 }], error: null }) }) }),
  }),
};
vi.mock("https://esm.sh/@supabase/supabase-js@2.117.3", () => ({ createClient: () => db.admin }));

const PAGE = `<title>Acme Wealth | Plans</title><link rel="apple-touch-icon" href="/t.png"><style>.a{color:#1f6feb}</style>
<p>We help young families save.</p><a href="https://instagram.com/acmewealth">ig</a>`;
const PNG = new Uint8Array(400).fill(7);
PNG.set([0x89, 0x50, 0x4e, 0x47]);
const seen: string[] = [];
const sent: Record<string, unknown> = {};
const jevAsked: { state: unknown; questions: Record<string, unknown> }[] = [];
// "leo" is on NORTH_STAR_USERS; "u1", everyone else, is not
const env: Record<string, string> = { OPENAI_API_KEY: "k", NORTH_STAR_USERS: "leo" };
/** Per-test pages and providers, checked before the defaults below. */
const routes: Record<string, () => Response | Promise<Response>> = {};
let jevReply = (q: Record<string, unknown>): Record<string, unknown> => ("audience" in q ? { audience: { type: "choice", choice: "working-adult" } } : {});
/** A saved home page (21 Oct 2026), its tags at their real offsets: each "<!-- cut N -->" was N characters that change no read. */
const sitePage = (host: string) =>
  readFileSync(new URL(`./fixtures/site-${host}.html`, import.meta.url), "utf8").replace(/\n?<!-- cut (\d+) -->\n?/g, (_, n) => " ".repeat(Number(n)));
let llm: unknown = { name: "Acme Wealth", oneLiner: "We help families save so they can relax.", audienceDetail: "Young families", topics: ["Savings"], edge: "Plain advice", voice: "Warm. Plain." };

beforeAll(async () => {
  vi.stubGlobal("Deno", {
    serve: (fn: (r: Request) => Promise<Response>) => (db.handler = fn),
    env: { get: (k: string) => env[k] },
    // acme.sg and down.sg are public; inside.sg points into a network
    resolveDns: async (host: string, type: string) => (type === "AAAA" ? [] : host === "inside.sg" ? ["10.0.0.7"] : ["151.101.1.69"]),
  });
  vi.stubGlobal("fetch", async (u: URL | string, init?: RequestInit) => {
    const url = String(u);
    seen.push(url);
    if (typeof init?.body === "string") sent[url] = JSON.parse(init.body);
    if (routes[url]) return await routes[url]();
    if (url.startsWith("https://api.typesafe.ai/")) {
      const ask = sent[url] as { state: unknown; questions: Record<string, unknown> };
      jevAsked.push(ask);
      return Response.json({ answers: jevReply(ask.questions) });
    }
    if (url === "https://activity-tracker.io/") return new Response(sitePage("activity-tracker.io"), { headers: { "content-type": "text/html; charset=utf-8" } });
    if (url.includes("openai")) return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(llm) } }] }));
    if (url === "https://down.sg/") throw new Error("connect refused");
    if (/\/(t|apple-touch-icon)\.png$/.test(url)) return new Response(PNG, { headers: { "content-type": "image/png" } });
    return new Response(PAGE, { headers: { "content-type": "text/html; charset=utf-8" } });
  });
  await import("./index.ts");
}, 30_000);
beforeEach(() => {
  seen.length = 0;
  db.spent.length = 0;
  db.refunded.length = 0;
  jevAsked.length = 0;
  for (const k of Object.keys(sent)) delete sent[k];
  for (const k of Object.keys(routes)) delete routes[k];
  delete env.TYPESAFE_API_KEY;
});
const html = (body: string) => () => new Response(body, { headers: { "content-type": "text/html; charset=utf-8" } });
const OPENAI = "https://api.openai.com/v1/chat/completions";

const call = async (body: unknown, uid = "u1") => {
  const r = await db.handler!(new Request("http://x/brand-dna", { method: "POST", headers: uid ? { Authorization: `Bearer ${uid}` } : {}, body: JSON.stringify(body) }));
  return { status: r.status, body: await r.json() };
};

describe("brand-dna", () => {
  it("turns a home page into a brand to confirm", async () => {
    const r = await call({ url: "acme.sg" });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ url: "https://acme.sg", name: "Acme Wealth", colour: "#1f6feb", handles: { instagram: "acmewealth" }, oneLiner: "We help families save so they can relax.", topics: ["Savings"] });
    expect(r.body.logo).toMatch(/^data:image\/png;base64,/);
    expect(r.body.audience).toBe("general"); // no Jev key in the test: the safe default
    expect(db.spent).toEqual(["brand-dna"]);
  });

  it("refuses addresses inside a network before spending anything", async () => {
    for (const url of ["localhost", "http://10.0.0.2", "", 5]) expect((await call({ url })).status).toBe(400);
    expect(seen).toEqual([]);
    expect(db.spent).toEqual([]);
    expect((await call({ url: "acme.sg" }, "")).status).toBe(401);
  });

  it("refuses a name that resolves inside a network, without fetching it", async () => {
    const r = await call({ url: "inside.sg" });
    expect(r.status).toBe(422);
    expect(seen.some((u) => u.includes("inside.sg"))).toBe(false);
  });

  it("says plainly when the site can't be opened", async () => {
    const r = await call({ url: "down.sg" });
    expect(r).toEqual({ status: 422, body: { error: "We couldn't open down.sg. Check the address, or start with just a name." } });
  });

  it("reads a saved home page exactly as it did before phase 4 (pinned: the answer, the LLM and Jev requests, the fetches)", async () => {
    llm = { name: "ActivityTracker", oneLiner: "We help sales reps keep clients, chats and targets in one app.", audienceDetail: "Financial advisors, property agents and sales reps", topics: ["Follow-ups", "WhatsApp"], edge: "One app on your phone", voice: "Plain. Direct." };
    env.TYPESAFE_API_KEY = "t";
    try {
      const r = await db.handler!(new Request("http://x/brand-dna", { method: "POST", headers: { Authorization: "Bearer u1" }, body: JSON.stringify({ url: "activity-tracker.io" }) }));
      expect(r.status).toBe(200);
      const text = await r.text();
      await expect(JSON.stringify({ response: JSON.parse(text), openai: sent["https://api.openai.com/v1/chat/completions"], jev: sent["https://api.typesafe.ai/v1/systemone"], fetched: [...seen].sort() }, null, 2))
        .toMatchFileSnapshot("./fixtures/site-activity-tracker.io.plain-read.json");
      // byte for byte, key order included
      expect(text).toBe(JSON.stringify(JSON.parse(text)));
      expect(db.spent).toEqual(["brand-dna"]);
    } finally {
      delete env.TYPESAFE_API_KEY;
    }
  });

  it("still returns what the page itself shows when the LLM fails", async () => {
    llm = "not json";
    const r = await call({ url: "acme.sg" });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ name: "Acme Wealth", colour: "#1f6feb", oneLiner: "", topics: [] });
  });
});

describe("brand-dna phase 4 (Leo only)", () => {
  const HOME = `<html lang="zh-SG"><title>Acme Wealth | Plans</title><meta property="og:image" content="/og.jpg">
<p>We help young families save.</p>
<a href="/about">About us</a><a href="/services/">Services</a><a href="/blog/tips">Tips</a><a href="/contact">Contact</a><a href="mailto:a@acme.sg">Mail</a>
<a href="/start">Start here</a>`;
  const PAGES: Record<string, string> = {
    "https://acme.sg/about": "<title>About</title><p>Two advisers in Tampines.</p>",
    "https://acme.sg/services/": "<title>Services</title><p>Family cover reviews and retirement plans.</p>",
  };
  // Jev: about 0.9, services 0.8, tips 0.2, contact 0.6, start 0.7
  const picks = (q: Record<string, unknown>) => {
    if ("p0" in q) return { p0: { type: "noul", noul: 0.9 }, p1: { type: "noul", noul: 0.8 }, p2: { type: "noul", noul: 0.2 }, p3: { type: "noul", noul: 0.6 }, p4: { type: "noul", noul: 0.7 } };
    return { audience: { type: "choice", choice: "parent" } };
  };
  const site = () => {
    routes["https://acme.sg/"] = html(HOME);
    for (const [u, b] of Object.entries(PAGES)) routes[u] = html(b);
    routes["https://acme.sg/contact"] = () => {
      throw new TypeError("error sending request");
    };
    routes["https://acme.sg/start"] = () => new Response(null, { status: 301, headers: { location: "/" } });
    env.TYPESAFE_API_KEY = "t";
    jevReply = picks;
    llm = { name: "Acme Wealth", oneLiner: "We help families save.", audienceDetail: "Young parents", topics: ["Savings"], edge: "Plain advice", voice: "Warm." };
  };
  const userText = () => (sent[OPENAI] as { messages: { content: string }[] }).messages[1].content;

  it("refuses a deep read before any count for a uid not on NORTH_STAR_USERS, whose plain read is today's", async () => {
    site();
    expect(await call({ url: "acme.sg", deep: true }, "u1")).toEqual({ status: 403, body: { code: "not_enabled", error: "This isn't switched on for your account yet." } });
    expect(seen).toEqual([]);
    expect(db.spent).toEqual([]);
    const r = await call({ url: "acme.sg" }, "u1");
    expect(Object.keys(r.body)).toEqual(["url", "name", "colour", "logo", "handles", "oneLiner", "audience", "audienceDetail", "topics", "edge", "voice"]);
    // no page past the home page (the share picture is a logo candidate, as today)
    expect(seen.filter((u) => /acme\.sg\/(about|services|blog|contact)/.test(u))).toEqual([]);
  });

  it("reads the 4 pages Jev picks at 0.5 or more for a deep read, fences each for the writer, and still answers when one fails", async () => {
    site();
    const r = await call({ url: "acme.sg", deep: true }, "leo");
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ url: "https://acme.sg", name: "Acme Wealth", audience: "parent", pagesRead: ["https://acme.sg/", "https://acme.sg/about", "https://acme.sg/services/"], lang: "zh" });
    // the blog post (0.2) is never fetched; the contact page (0.6) failed and "start" (0.7) lands back home: both left out
    expect(seen).toContain("https://acme.sg/contact");
    expect(seen).toContain("https://acme.sg/start");
    expect(seen).not.toContain("https://acme.sg/blog/tips");
    expect(userText()).toContain('<page url="https://acme.sg/about">\nAbout Two advisers in Tampines.\n</page>');
    expect(userText()).toContain('<page url="https://acme.sg/">');
    // one state for the site, each link in its own question; mail links never asked about
    expect(jevAsked[0].state).toEqual({ site: "Acme Wealth", home: "https://acme.sg" });
    expect(Object.keys(jevAsked[0].questions)).toEqual(["p0", "p1", "p2", "p3", "p4"]);
    expect(jevAsked[0].questions.p0).toMatchObject({ type: "noul", instructions: { link: { text: "About us", path: "/about" } } });
    expect(db.spent).toEqual(["brand-dna"]);
    expect(db.refunded).toEqual([]);
  });

  it("reads the home page alone, in today's prompt, when Jev is silent, and a listed plain read gains pagesRead and lang", async () => {
    site();
    delete env.TYPESAFE_API_KEY;
    const deep = await call({ url: "acme.sg", deep: true }, "leo");
    expect(deep.body).toMatchObject({ pagesRead: ["https://acme.sg/"], lang: "zh" });
    const deepPrompt = userText();
    const plain = await call({ url: "acme.sg" }, "u1");
    expect(plain.body.pagesRead).toBeUndefined();
    expect(userText()).toBe(deepPrompt);
    expect(deepPrompt).toContain("<page>\n");
    const listed = await call({ url: "acme.sg" }, "leo");
    expect(listed.body).toMatchObject({ pagesRead: ["https://acme.sg/"], lang: "zh" });
    expect(db.spent).toEqual(["brand-dna", "brand-dna", "brand-dna"]);
  });

});
