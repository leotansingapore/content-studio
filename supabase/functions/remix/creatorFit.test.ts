import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CREATOR_FIT_QUESTIONS,
  FIT_BATCH,
  MAX_CREATORS,
  creatorFitState,
  handleCreatorFit,
  parseCreatorFitRequest,
  type CreatorFitDeps,
} from "./creatorFit";

const creator = (i: number) => ({ id: `c${i}`, name: `Creator ${i}`, why: "Plain CPF explainers", niche: ["cpf", "retirement"], audience: ["young-adult"] });
const request = (n = 3, extra: Record<string, unknown> = {}) => ({
  mode: "creator-fit",
  serves: "Sales-oriented self-employed professionals",
  sells: "ActivityTracker, a sales activity app",
  topics: ["Prospecting", "Habits"],
  creators: Array.from({ length: n }, (_, i) => creator(i)),
  ...extra,
});

describe("the creator-fit request", () => {
  it("takes up to 70 creators and refuses a longer list", () => {
    expect(parseCreatorFitRequest(request(MAX_CREATORS))?.creators).toHaveLength(70);
    expect(parseCreatorFitRequest(request(MAX_CREATORS + 1))).toBeNull();
    expect(parseCreatorFitRequest(request(0))).toBeNull();
  });

  it("refuses a request it can't judge", () => {
    expect(parseCreatorFitRequest({ ...request(), mode: "fit" })).toBeNull();
    expect(parseCreatorFitRequest(request(2, { serves: "  " }))).toBeNull();
    expect(parseCreatorFitRequest(request(1, { creators: [{ id: "x" }] }))).toBeNull();
    expect(parseCreatorFitRequest(null)).toBeNull();
  });

  it("keeps one of each creator and clips what it is sent", () => {
    const r = parseCreatorFitRequest(request(1, { creators: [creator(1), creator(1), { ...creator(2), niche: Array(20).fill("cpf") }] }));
    expect(r?.creators.map((c) => c.id)).toEqual(["c1", "c2"]);
    expect(r?.creators[1].niche).toHaveLength(8);
  });

  it("asks Jev about the brand's own audience and offer, beside the creator's why", () => {
    const r = parseCreatorFitRequest(request(1))!;
    expect(creatorFitState(r, r.creators[0])).toEqual({
      serves: "Sales-oriented self-employed professionals",
      sells: "ActivityTracker, a sales activity app",
      topics: ["Prospecting", "Habits"],
      creator: "Creator 0",
      why: "Plain CPF explainers",
      niche: ["cpf", "retirement"],
      audience: ["young-adult"],
    });
    const asked = String(CREATOR_FIT_QUESTIONS.fit.instructions);
    for (const key of ["`serves`", "`sells`", "`topics`", "`creator`", "`why`"]) expect(asked).toContain(key);
    expect(asked).not.toMatch(/advis/i);
  });
});

describe("a creator-fit run", () => {
  const deps = (over: Partial<CreatorFitDeps> = {}) => {
    const d = {
      hasJev: true,
      consume: vi.fn(async () => ({ allowed: true as const, used: 1, limit: 5 })),
      refund: vi.fn(async () => null),
      ask: vi.fn(async (state: unknown) => ({ fit: { type: "noul" as const, noul: (state as { creator: string }).creator === "Creator 1" ? 0.9 : 0.2 } })),
      ...over,
    };
    return d;
  };

  it("scores every creator, 6 at a time, and keeps the use", async () => {
    let live = 0;
    let most = 0;
    const d = deps({
      ask: vi.fn(async () => {
        most = Math.max(most, ++live);
        await new Promise((r) => setTimeout(r, 1));
        live--;
        return { fit: { type: "noul" as const, noul: 0.7 } };
      }),
    });
    const r = await handleCreatorFit(request(14), d);
    expect(r.status).toBe(200);
    expect(Object.keys((r.body as { fit: Record<string, number> }).fit)).toHaveLength(14);
    expect(most).toBe(FIT_BATCH);
    expect(d.consume).toHaveBeenCalledTimes(1);
    expect(d.refund).not.toHaveBeenCalled();
  });

  it("leaves out a creator Jev did not answer for", async () => {
    const d = deps({ ask: vi.fn(async (state: unknown) => ((state as { creator: string }).creator === "Creator 0" ? null : { fit: { type: "noul" as const, noul: 0.4 } })) });
    const r = await handleCreatorFit(request(3), d);
    expect(r.body).toEqual({ fit: { c1: 0.4, c2: 0.4 } });
    expect(d.refund).not.toHaveBeenCalled();
  });

  it("gives the use back and answers null when Jev answers for no one", async () => {
    const d = deps({ ask: vi.fn(async () => null) });
    const r = await handleCreatorFit(request(3), d);
    expect(r).toEqual({ status: 200, body: { fit: null } });
    expect(d.refund).toHaveBeenCalledWith(new Date().toISOString().slice(0, 10));
  });

  it("spends nothing without a Jev key or with a bad request", async () => {
    const off = deps({ hasJev: false });
    expect(await handleCreatorFit(request(3), off)).toEqual({ status: 200, body: { fit: null } });
    const bad = deps();
    expect((await handleCreatorFit(request(MAX_CREATORS + 1), bad)).status).toBe(400);
    for (const d of [off, bad]) {
      expect(d.consume).not.toHaveBeenCalled();
      expect(d.ask).not.toHaveBeenCalled();
    }
  });

  it("asks Jev nothing over the cap and says when it is back", async () => {
    const d = deps({ consume: vi.fn(async () => ({ allowed: false as const, limit: 5, reason: "limit" as const })) });
    const r = await handleCreatorFit(request(3), d);
    expect(r.status).toBe(429);
    expect(r.body).toMatchObject({ code: "daily_limit" });
    expect(d.ask).not.toHaveBeenCalled();
  });
});

// The live handler, with the database and Jev faked: the north-star gate comes before any count.
const db = vi.hoisted(() => ({
  spent: [] as string[],
  admin: {
    auth: { getUser: async (jwt: string) => ({ data: { user: jwt ? { id: jwt } : null } }) },
    rpc: async (_fn: string, a: Record<string, unknown>) => (db.spent.push(String(a.p_feature)), { data: 1, error: null }),
  },
  handler: null as null | ((r: Request) => Promise<Response>),
}));
vi.mock("https://esm.sh/@supabase/supabase-js@2", () => ({ createClient: () => db.admin }));

describe("remix's creator-fit mode", () => {
  const jev: string[] = [];
  beforeAll(async () => {
    const env: Record<string, string> = { SUPABASE_URL: "http://db", SUPABASE_SERVICE_ROLE_KEY: "k", NORTH_STAR_USERS: "leo-uid", TYPESAFE_API_KEY: "k" };
    vi.stubGlobal("Deno", { serve: (fn: (r: Request) => Promise<Response>) => (db.handler = fn), env: { get: (k: string) => env[k] } });
    vi.stubGlobal("fetch", async (u: URL | string, init?: RequestInit) => {
      if (!String(u).includes("typesafe")) throw new Error(`unexpected fetch ${u}`);
      jev.push(String(JSON.parse(String(init?.body)).state.creator));
      return new Response(JSON.stringify({ answers: { fit: { type: "noul", noul: 0.8 } } }));
    });
    vi.spyOn(console, "log").mockImplementation(() => {});
    await import("./index.ts");
  }, 30_000);
  afterAll(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
  beforeEach(() => {
    db.spent.length = 0;
    jev.length = 0;
  });

  const call = async (uid: string, body: unknown) => {
    const r = await db.handler!(new Request("http://x/remix", { method: "POST", headers: uid ? { Authorization: `Bearer ${uid}` } : {}, body: JSON.stringify(body) }));
    return { status: r.status, body: await r.json() };
  };

  it("refuses a uid missing from NORTH_STAR_USERS before counting or asking anything", async () => {
    expect(await call("someone-else", request(3))).toEqual({ status: 403, body: { code: "not_enabled", error: "This isn't switched on for your account yet." } });
    expect((await call("", request(3))).status).toBe(401);
    expect(db.spent).toEqual([]);
    expect(jev).toEqual([]);
  });

  it("scores the creators for a listed uid against its own cap", async () => {
    const r = await call("leo-uid", request(3));
    expect(r).toEqual({ status: 200, body: { fit: { c0: 0.8, c1: 0.8, c2: 0.8 } } });
    expect(db.spent).toEqual(["creator-fit"]);
    expect(jev.sort()).toEqual(["Creator 0", "Creator 1", "Creator 2"]);
  });

  it("refuses a list over 70 before the count", async () => {
    expect((await call("leo-uid", request(71))).status).toBe(400);
    expect(db.spent).toEqual([]);
  });
});
