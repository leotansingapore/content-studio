import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// The handler with the database and Jev faked: who may ask for What moved, what it counts and what it answers.
const LEO = "11111111-1111-4111-8111-111111111111";
const db = vi.hoisted(() => ({
  spent: [] as string[],
  jev: [] as string[],
  answers: null as unknown,
  admin: {
    auth: { getUser: async (jwt: string) => ({ data: { user: jwt ? { id: jwt } : null } }) },
    rpc: async (_fn: string, a: Record<string, unknown>) => (db.spent.push(String(a.p_feature)), { data: 1, error: null }),
  },
  handler: null as null | ((r: Request) => Promise<Response>),
}));
vi.mock("https://esm.sh/@supabase/supabase-js@2.117.3", () => ({ createClient: () => db.admin }));

beforeAll(async () => {
  vi.stubGlobal("Deno", {
    serve: (fn: (r: Request) => Promise<Response>) => (db.handler = fn),
    env: { get: (k: string) => ({ NORTH_STAR_USERS: `someone,${LEO}`, TYPESAFE_API_KEY: "k" } as Record<string, string>)[k] },
  });
  vi.stubGlobal("fetch", async (_u: unknown, init: { body: string }) => {
    db.jev.push(JSON.parse(init.body).state);
    return new Response(JSON.stringify({ answers: db.answers }));
  });
  await import("./index.ts");
}, 30_000);
beforeEach(() => {
  db.spent.length = 0;
  db.jev.length = 0;
  db.answers = null;
});

const call = async (body: unknown, uid = LEO) => {
  const r = await db.handler!(new Request("http://x/week-pick", { method: "POST", headers: uid ? { Authorization: `Bearer ${uid}` } : {}, body: JSON.stringify(body) }));
  return { status: r.status, body: await r.json() };
};
const findings = [
  { id: "outlier:instagram:1", kind: "outlier", line: "@rival's reel did 4.1x their usual views." },
  { id: "ad:acme", kind: "ad", line: "Acme started 2 new ads this week." },
  { id: "growing:instagram:jo", kind: "growing", line: "@jo gained 1,240 followers this week." },
];
const brief = { mode: "brief", findings, brand: { sells: "A sales app", serves: "Self-employed salespeople" } };

describe("week-pick: What moved (mode brief)", () => {
  it("refuses anyone off NORTH_STAR_USERS before counting or asking", async () => {
    expect(await call(brief, "22222222-2222-4222-8222-222222222222")).toEqual({ status: 403, body: { code: "not_enabled", error: "This isn't switched on for your account yet." } });
    expect((await call(brief, "")).status).toBe(401);
    expect(db.spent).toEqual([]);
    expect(db.jev).toEqual([]);
  });

  it("refuses a bad list before counting", async () => {
    expect((await call({ ...brief, findings: findings.slice(0, 1) })).status).toBe(400);
    expect(db.spent).toEqual([]);
  });

  it("counts brief-pick once and answers the ids Jev keeps, surest first, about this brand", async () => {
    db.answers = { f0: { type: "noul", noul: 0.3 }, f1: { type: "noul", noul: 0.6 }, f2: { type: "noul", noul: 0.9 } };
    expect(await call(brief)).toEqual({ status: 200, body: { ids: ["growing:instagram:jo", "ad:acme"] } });
    expect(db.spent).toEqual(["brief-pick"]);
    expect(db.jev[0]).toContain("Who it serves: Self-employed salespeople.");
  });

  it("answers null when Jev has nothing, so the card keeps its order", async () => {
    db.answers = null;
    expect(await call(brief)).toEqual({ status: 200, body: { ids: null } });
  });
});

describe("week-pick: the week's move (unchanged)", () => {
  it("still picks for anyone, counted against week-pick", async () => {
    db.answers = { move: { type: "choice", choice: "numbers" } };
    const r = await call({ facts: "3 posts.", moves: [{ id: "reuse", text: "Reuse it." }, { id: "numbers", text: "Add numbers." }] }, "22222222-2222-4222-8222-222222222222");
    expect(r).toEqual({ status: 200, body: { pick: "numbers" } });
    expect(db.spent).toEqual(["week-pick"]);
  });
});
