import { readFileSync } from "node:fs";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// The handler with the web, the LLM and Jev faked: what a brand's address turns into.
const db = vi.hoisted(() => ({
  spent: [] as string[],
  admin: {
    auth: { getUser: async (jwt: string) => ({ data: { user: jwt ? { id: jwt } : null } }) },
    rpc: async (_fn: string, a: Record<string, unknown>) => (db.spent.push(String(a.p_feature)), { data: 1, error: null }),
  },
  handler: null as null | ((r: Request) => Promise<Response>),
}));
vi.mock("https://esm.sh/@supabase/supabase-js@2.117.3", () => ({ createClient: () => db.admin }));

const PAGE = `<title>Acme Wealth | Plans</title><link rel="apple-touch-icon" href="/t.png"><style>.a{color:#1f6feb}</style>
<p>We help young families save.</p><a href="https://instagram.com/acmewealth">ig</a>`;
const PNG = new Uint8Array(400).fill(7);
PNG.set([0x89, 0x50, 0x4e, 0x47]);
const seen: string[] = [];
const sent: Record<string, unknown> = {};
const env: Record<string, string> = { OPENAI_API_KEY: "k" };
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
    if (url.startsWith("https://api.typesafe.ai/")) return Response.json({ answers: { audience: { type: "choice", choice: "working-adult" } } });
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
  for (const k of Object.keys(sent)) delete sent[k];
});

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
