import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GLOBAL_COUNTER_USER } from "../_shared/usageCaps";
import { jobToken, tokenSecret } from "./logic";

// The handler's money path for a picture, a fix and an AI clip: the adviser's cap, the studio's, and Higgsfield.
const UID = "6d80f027-3395-480c-86a1-8827d3d6cce3";
const PICTURE = "0b6f3a52-5d6e-4c1a-9b7e-2f1d3c4b5a69";
const SERVICE_KEY = "service-role-key";

const db = vi.hoisted(() => {
  // cs_ai_usage in memory, keyed user|feature|day: the consume RPC, one row read and the conditional update
  const rows = new Map<string, number>();
  const down = new Set<string>(); // features whose counter can't be read
  const today = () => new Date().toISOString().slice(0, 10);
  const key = (q: Record<string, unknown>) => `${q.user_id}|${q.feature}|${q.day}`;
  const admin = {
    auth: { getUser: async (jwt: string) => ({ data: { user: jwt ? { id: jwt } : null } }) },
    rpc: async (_fn: string, a: Record<string, unknown>) => {
      if (down.has(String(a.p_feature))) return { data: null, error: { message: "down" } };
      const k = `${a.p_user}|${a.p_feature}|${today()}`;
      const n = rows.get(k) ?? 0;
      if (n >= Number(a.p_limit)) return { data: null, error: null };
      rows.set(k, n + 1);
      return { data: n + 1, error: null };
    },
    from: () => ({
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
    }),
  };
  return { admin, rows, down, today, handler: null as null | ((r: Request) => Promise<Response>) };
});
vi.mock("https://esm.sh/@supabase/supabase-js@2", () => ({ createClient: () => db.admin }));

// Higgsfield: a status read answers `status`, a cancel is kept in `cancels`; every other call is a submit, kept in
// `submits`, and the one numbered `failAt` is refused
const hf: { submits: string[]; cancels: string[]; failAt: number; status: unknown } = { submits: [], cancels: [], failAt: 0, status: null };
const answer = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
answer({});

beforeAll(async () => {
  // one fixed instant, so the counter's day can't turn between the handler and these rows
  vi.useFakeTimers({ toFake: ["Date"] });
  const env: Record<string, string> = { SUPABASE_URL: "http://db", SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY, HF_API_KEY: "k", HF_API_SECRET: "s", AI_BROLL_ENABLED: "1", NORTH_STAR_USERS: UID };
  vi.stubGlobal("Deno", { serve: (fn: (r: Request) => Promise<Response>) => (db.handler = fn), env: { get: (k: string) => env[k] } });
  vi.stubGlobal("fetch", async (u: string) => {
    if (String(u).endsWith("/status")) return answer(hf.status);
    if (String(u).endsWith("/cancel")) return (hf.cancels.push(String(u)), answer({}));
    hf.submits.push(String(u));
    if (hf.submits.length === hf.failAt) return answer({}, 500);
    return answer({ request_id: "1f2e3d4c-5b6a-4978-8a9b-0c1d2e3f4a5b" });
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
  await import("./index.ts");
}, 30_000);
afterAll(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

beforeEach(() => {
  db.rows.clear();
  db.down.clear();
  hf.submits.length = 0;
  hf.cancels.length = 0;
  hf.failAt = 0;
  hf.status = { status: "completed", images: [{ url: "https://cdn.higgsfield.ai/pic.png" }] };
});

const call = (body: unknown) =>
  db.handler!(new Request("http://x/ai-image", { method: "POST", headers: { Authorization: `Bearer ${UID}` }, body: JSON.stringify(body) }));
const used = (user: string, feature: string) => db.rows.get(`${user}|${feature}|${db.today()}`) ?? 0;
const fixBody = async () => ({ mode: "fix", token: await jobToken(await tokenSecret(SERVICE_KEY), UID, PICTURE), fix: "make the sky bluer" });

describe("Make the image", () => {
  it("is refused over the adviser's cap without asking Higgsfield for a picture", async () => {
    db.rows.set(`${UID}|ai-image|${db.today()}`, 5);
    const res = await call({ prompt: "A family picnic at East Coast Park at sunset" });
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ code: "daily_limit" });
    expect(hf.submits).toEqual([]);
  });
});

describe("Fix it", () => {
  it("spends nothing when the picture it would fix can't be read back from Higgsfield", async () => {
    hf.status = { status: "in_progress" };
    const res = await call(await fixBody());
    expect(res.status).toBe(400);
    expect([used(UID, "ai-image-fix"), used(GLOBAL_COUNTER_USER, "ai-image-fix-global")]).toEqual([0, 0]);
    expect(hf.submits).toEqual([]);
  });

  it("gives the adviser's fix back, with no edit asked for, when the studio's fixes are used up", async () => {
    db.rows.set(`${GLOBAL_COUNTER_USER}|ai-image-fix-global|${db.today()}`, 40);
    const res = await call(await fixBody());
    expect(res.status).toBe(429);
    expect([used(UID, "ai-image-fix"), used(GLOBAL_COUNTER_USER, "ai-image-fix-global")]).toEqual([0, 40]);
    expect(hf.submits).toEqual([]);
  });
});

describe("the studio's counter, when it can't be read", () => {
  it("gives the adviser's fix back and says try again shortly, with no edit asked for", async () => {
    db.down.add("ai-image-fix-global");
    const res = await call(await fixBody());
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ code: "usage_unavailable" });
    expect(used(UID, "ai-image-fix")).toBe(0);
    expect(hf.submits).toEqual([]);
  });

  it("gives the adviser's B-roll clip back and says try again shortly, with no picture asked for", async () => {
    db.down.add("ai-broll-global");
    const res = await call({ mode: "broll", search: "hawker centre", line: "Lunch costs add up", aspect: "9:16" });
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ code: "usage_unavailable" });
    expect(used(UID, "ai-broll")).toBe(0);
    expect(hf.submits).toEqual([]);
  });
});

describe("an AI B-roll clip", () => {
  it("gives the adviser's use back, with no picture asked for, when the studio's clips are used up", async () => {
    db.rows.set(`${GLOBAL_COUNTER_USER}|ai-broll-global|${db.today()}`, 20);
    const res = await call({ mode: "broll", search: "hawker centre", line: "Lunch costs add up", aspect: "9:16" });
    expect(res.status).toBe(429);
    expect([used(UID, "ai-broll"), used(GLOBAL_COUNTER_USER, "ai-broll-global")]).toEqual([0, 20]);
    expect(hf.submits).toEqual([]);
  });
});

describe("a slideshow's AI pictures", () => {
  const ask = { mode: "slides", pictures: ["a calm desk", "a planner", "a phone face down"], look: "clay", aspect: "9:16" };

  it("is refused for anyone not on the list, with nothing counted or asked for", async () => {
    const res = await db.handler!(new Request("http://x/ai-image", { method: "POST", headers: { Authorization: "Bearer someone-else" }, body: JSON.stringify(ask) }));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "not_enabled" });
    expect(used("someone-else", "slide-pictures")).toBe(0);
    expect(hf.submits).toEqual([]);
  });

  it("asks for one picture a slide and counts the slideshow once on each cap", async () => {
    const res = await call(ask);
    expect(res.status).toBe(200);
    expect((await res.json()).tokens).toHaveLength(3);
    expect(hf.submits).toHaveLength(3);
    expect([used(UID, "slide-pictures"), used(GLOBAL_COUNTER_USER, "slide-pictures-global")]).toEqual([1, 1]);
  });

  it("cancels what it queued and gives both uses back when Higgsfield refuses a picture", async () => {
    hf.failAt = 2;
    const res = await call(ask);
    expect(res.status).toBe(502);
    expect(hf.cancels).toHaveLength(1);
    expect([used(UID, "slide-pictures"), used(GLOBAL_COUNTER_USER, "slide-pictures-global")]).toEqual([0, 0]);
  });
});
