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
const seen: string[] = [];
let llm: unknown = { name: "Acme Wealth", oneLiner: "We help families save so they can relax.", audienceDetail: "Young families", topics: ["Savings"], edge: "Plain advice", voice: "Warm. Plain." };

beforeAll(async () => {
  vi.stubGlobal("Deno", {
    serve: (fn: (r: Request) => Promise<Response>) => (db.handler = fn),
    env: { get: (k: string) => ({ OPENAI_API_KEY: "k" } as Record<string, string>)[k] },
    // acme.sg and down.sg are public; inside.sg points into a network
    resolveDns: async (host: string, type: string) => (type === "AAAA" ? [] : host === "inside.sg" ? ["10.0.0.7"] : ["151.101.1.69"]),
  });
  vi.stubGlobal("fetch", async (u: URL | string) => {
    const url = String(u);
    seen.push(url);
    if (url.includes("openai")) return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(llm) } }] }));
    if (url === "https://down.sg/") throw new Error("connect refused");
    if (url.endsWith("/t.png")) return new Response(PNG, { headers: { "content-type": "image/png" } });
    return new Response(PAGE, { headers: { "content-type": "text/html; charset=utf-8" } });
  });
  await import("./index.ts");
}, 30_000);
beforeEach(() => {
  seen.length = 0;
  db.spent.length = 0;
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

  it("still returns what the page itself shows when the LLM fails", async () => {
    llm = "not json";
    const r = await call({ url: "acme.sg" });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ name: "Acme Wealth", colour: "#1f6feb", oneLiner: "", topics: [] });
  });
});
