import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GLOBAL_COUNTER_USER } from "../_shared/usageCaps";
import { PEOPLE_RULE, WORDS_PEOPLE_RULE, jobToken, tokenSecret } from "./logic";

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
  const kept = new Map<string, string>();
  const bucket = {
    upload: async (path: string) => (kept.set(path, new Date().toISOString()), { data: { path }, error: null }),
    createSignedUrl: async (path: string) =>
      kept.has(path) ? { data: { signedUrl: `https://db/storage/v1/object/sign/cs-ai-images/${path}?token=t` }, error: null } : { data: null, error: { message: "Object not found" } },
    list: async (folder: string) => ({ data: [...kept].filter(([k]) => k.startsWith(`${folder}/`)).map(([k, at]) => ({ name: k.slice(folder.length + 1), created_at: at })), error: null }),
    remove: async (paths: string[]) => (paths.forEach((k) => kept.delete(k)), { data: [], error: null }),
  };
  const admin = {
    storage: { from: () => bucket },
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
  return { admin, rows, down, kept, today, handler: null as null | ((r: Request) => Promise<Response>) };
});
vi.mock("https://esm.sh/@supabase/supabase-js@2", () => ({ createClient: () => db.admin }));

// Higgsfield: a status read answers `status`, a cancel is kept in `cancels`; every other call is a submit, kept in
// `submits`, and the one numbered `failAt` is refused
const hf: { submits: string[]; cancels: string[]; failAt: number; status: unknown } = { submits: [], cancels: [], failAt: 0, status: null };
const oa: { calls: { route: string; body: Record<string, unknown> }[]; reply: () => Response } = { calls: [], reply: () => answer({}, 500) };
const env: Record<string, string> = { SUPABASE_URL: "http://db", SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY, HF_API_KEY: "k", HF_API_SECRET: "s", AI_BROLL_ENABLED: "1", NORTH_STAR_USERS: UID };
const answer = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
answer({});

// at collection, not in a beforeAll: the first import transforms the function's whole graph, which ran past a 30 s
// hook timeout under load, and collection has no timeout
{
  // one fixed instant, so the counter's day can't turn between the handler and these rows
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.stubGlobal("Deno", { serve: (fn: (r: Request) => Promise<Response>) => (db.handler = fn), env: { get: (k: string) => env[k] } });
  vi.stubGlobal("fetch", async (u: string, init?: RequestInit) => {
    if (String(u).startsWith("https://api.openai.com/v1/images/")) {
      oa.calls.push({ route: String(u).split("/").pop()!, body: JSON.parse(String(init?.body)) });
      return oa.reply();
    }
    if (String(u).endsWith("/status")) return answer(hf.status);
    if (String(u).endsWith("/cancel")) return (hf.cancels.push(String(u)), answer({}));
    hf.submits.push(String(u));
    if (hf.submits.length === hf.failAt) return answer({}, 500);
    return answer({ request_id: "1f2e3d4c-5b6a-4978-8a9b-0c1d2e3f4a5b" });
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
  await import("./index.ts");
}
afterAll(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

beforeEach(() => {
  db.rows.clear();
  db.down.clear();
  db.kept.clear();
  oa.calls.length = 0;
  oa.reply = () => answer({}, 500);
  delete env.OPENAI_API_KEY;
  hf.submits.length = 0;
  hf.cancels.length = 0;
  hf.failAt = 0;
  hf.status = { status: "completed", images: [{ url: "https://cdn.higgsfield.ai/pic.png" }] };
});

const call = (body: unknown) =>
  db.handler!(new Request("http://x/ai-image", { method: "POST", headers: { Authorization: `Bearer ${UID}` }, body: JSON.stringify(body) }));
const used = (user: string, feature: string) => db.rows.get(`${user}|${feature}|${db.today()}`) ?? 0;
const fixBody = async () => ({ mode: "fix", token: await jobToken(await tokenSecret(SERVICE_KEY), UID, PICTURE), fix: "make the sky bluer" });

const picture = () => answer({ data: [{ b64_json: btoa("jpeg bytes") }], usage: { output_tokens: 1347 } });
const statusOf = async (token: string) => (await call({ mode: "status", token })).json();

describe("Make the image", () => {
  it("is refused over the adviser's cap without asking Higgsfield for a picture", async () => {
    db.rows.set(`${UID}|ai-image|${db.today()}`, 5);
    const res = await call({ prompt: "A family picnic at East Coast Park at sunset" });
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ code: "daily_limit" });
    expect(hf.submits).toEqual([]);
  });

  it("makes the picture on GPT Image 2.6 Flare, keeps it, and status hands back its link without Higgsfield", async () => {
    env.OPENAI_API_KEY = "sk-test";
    oa.reply = picture;
    const res = await call({ prompt: "A family picnic at East Coast Park at sunset" });
    expect(res.status).toBe(200);
    const { token } = await res.json();
    expect(oa.calls).toHaveLength(1);
    expect(oa.calls[0]).toMatchObject({ route: "generations", body: { model: "gpt-image-2.6-flare", size: "1152x1536", quality: "medium", safety_identifier: UID } });
    expect(oa.calls[0].body.prompt).toBe(`A family picnic at East Coast Park at sunset\n\n${PEOPLE_RULE}`);
    expect(hf.submits).toEqual([]);
    expect([...db.kept.keys()]).toEqual([`${UID}/${token.split(".")[0]}.jpg`]);
    expect(await statusOf(token)).toEqual({ state: "done", url: expect.stringMatching(/^https:\/\/db\/storage\/v1\/object\/sign\/cs-ai-images\//) });
  });

  it("falls back to Soul v2 on Higgsfield when OpenAI can't take it", async () => {
    env.OPENAI_API_KEY = "sk-test";
    const res = await call({ prompt: "A family picnic at East Coast Park at sunset" });
    expect(res.status).toBe(200);
    expect(oa.calls).toHaveLength(1);
    expect(hf.submits).toEqual(["https://api.higgsfield.ai/higgsfield-ai/soul/v2/standard"]);
    expect(db.kept.size).toBe(0);
  });

  it("prints a photo ad's quoted words: the people rule goes without its No text clause", async () => {
    env.OPENAI_API_KEY = "sk-test";
    oa.reply = picture;
    const res = await call({ prompt: 'A poster at a bus shelter. Headline: "Still dark."', words: true });
    expect(res.status).toBe(200);
    expect(oa.calls[0].body.prompt).toBe(`A poster at a bus shelter. Headline: "Still dark."\n\n${WORDS_PEOPLE_RULE}`);
    expect(used(UID, "ai-image")).toBe(1);
  });

  it("fails a photo ad with the retry message and gives its use back when OpenAI can't make it, never asking Soul v2", async () => {
    env.OPENAI_API_KEY = "sk-test";
    const res = await call({ prompt: 'A poster at a bus shelter. Headline: "Still dark."', words: true });
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "Couldn't make the image right now. Try again in a minute." });
    expect(oa.calls).toHaveLength(1);
    expect(hf.submits).toEqual([]);
    expect(used(UID, "ai-image")).toBe(0);
    // with no OpenAI key at all, the same
    delete env.OPENAI_API_KEY;
    expect((await call({ prompt: 'A poster at a bus shelter. Headline: "Still dark."', words: true })).status).toBe(502);
    expect(hf.submits).toEqual([]);
    expect(used(UID, "ai-image")).toBe(0);
  });

  it("hands a photo ad's logo to GPT Image as an edit's reference, and makes it from the words alone when that fails", async () => {
    const LOGO = "data:image/png;base64,iVBORw0KGgo=";
    const ad = { prompt: 'A poster at a bus shelter. Headline: "Still dark."', words: true, refs: { logo: LOGO } };
    env.OPENAI_API_KEY = "sk-test";
    oa.reply = picture;
    expect((await call(ad)).status).toBe(200);
    expect(oa.calls).toHaveLength(1);
    expect(oa.calls[0]).toMatchObject({ route: "edits", body: { images: [{ image_url: LOGO }], size: "1152x1536" } });
    expect(oa.calls[0].body.prompt).toMatch(/^A poster at a bus shelter\. Headline: "Still dark\."\n\nThe picture given is the brand's logo\./);
    expect(used(UID, "ai-image")).toBe(1);
    // the edit refused: one more call, today's words picture, and still one use
    oa.calls.length = 0;
    let n = 0;
    oa.reply = () => (++n === 1 ? answer({ error: { code: "invalid_request" } }, 400) : picture());
    expect((await call(ad)).status).toBe(200);
    expect(oa.calls.map((c) => c.route)).toEqual(["edits", "generations"]);
    expect(oa.calls[1].body).toEqual({ ...oa.calls[1].body, prompt: `A poster at a bus shelter. Headline: "Still dark."\n\n${WORDS_PEOPLE_RULE}` });
    expect(oa.calls[1].body).not.toHaveProperty("images");
    expect(used(UID, "ai-image")).toBe(2);
    // the safety filter on the edit stops it there
    oa.calls.length = 0;
    oa.reply = () => answer({ error: { code: "moderation_blocked" } }, 400);
    expect((await call(ad)).status).toBe(422);
    expect(oa.calls).toHaveLength(1);
    expect(hf.submits).toEqual([]);
  });

  it("gives the use back when Higgsfield refuses the picture after OpenAI couldn't make it", async () => {
    env.OPENAI_API_KEY = "sk-test";
    hf.failAt = 1;
    const res = await call({ prompt: "A family picnic at East Coast Park at sunset" });
    expect(res.status).toBe(502);
    expect(used(UID, "ai-image")).toBe(0);
  });

  it("says the safety filter stopped it, with nothing asked of Higgsfield", async () => {
    env.OPENAI_API_KEY = "sk-test";
    oa.reply = () => answer({ error: { type: "image_generation_user_error", code: "moderation_blocked" } }, 400);
    const res = await call({ prompt: "A family picnic at East Coast Park at sunset" });
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: expect.stringMatching(/safety filter/) });
    expect(hf.submits).toEqual([]);
  });

  it("clears the adviser's kept pictures older than 7 days when it keeps a new one", async () => {
    env.OPENAI_API_KEY = "sk-test";
    oa.reply = picture;
    db.kept.set(`${UID}/old.jpg`, new Date(Date.now() - 8 * 86_400_000).toISOString());
    db.kept.set(`${UID}/recent.jpg`, new Date(Date.now() - 6 * 86_400_000).toISOString());
    await call({ prompt: "A family picnic at East Coast Park at sunset" });
    expect([...db.kept.keys()].filter((k) => !k.endsWith("old.jpg") && !k.endsWith("recent.jpg"))).toHaveLength(1);
    expect(db.kept.has(`${UID}/old.jpg`)).toBe(false);
    expect(db.kept.has(`${UID}/recent.jpg`)).toBe(true);
  });
});

describe("Fix it", () => {
  it("edits a kept picture on GPT Image 2.6 Flare from its own link, with nothing asked of Higgsfield", async () => {
    env.OPENAI_API_KEY = "sk-test";
    oa.reply = picture;
    db.kept.set(`${UID}/${PICTURE}.jpg`, new Date().toISOString());
    const res = await call(await fixBody());
    expect(res.status).toBe(200);
    expect(oa.calls[0]).toMatchObject({ route: "edits", body: { model: "gpt-image-2.6-flare", images: [{ image_url: expect.stringContaining(`cs-ai-images/${UID}/${PICTURE}.jpg`) }] } });
    expect(oa.calls[0].body.prompt).toMatch(/^make the sky bluer\n\nChange only what is asked/);
    expect(hf.submits).toEqual([]);
    expect(await statusOf((await res.json()).token)).toMatchObject({ state: "done" });
    expect([used(UID, "ai-image-fix"), used(GLOBAL_COUNTER_USER, "ai-image-fix-global")]).toEqual([1, 1]);
  });

  it("edits a Higgsfield picture on GPT Image 2.6 Flare, and on Qwen Image 3 when OpenAI can't", async () => {
    env.OPENAI_API_KEY = "sk-test";
    oa.reply = picture;
    expect((await call(await fixBody())).status).toBe(200);
    expect(oa.calls[0].body.images).toEqual([{ image_url: "https://cdn.higgsfield.ai/pic.png" }]);
    oa.reply = () => answer({}, 503);
    expect((await call(await fixBody())).status).toBe(200);
    expect(hf.submits).toEqual(["https://api.higgsfield.ai/alibaba/qwen-image-3/edit"]);
  });

  it("gives both fixes back when OpenAI can't edit it and Higgsfield refuses the edit", async () => {
    env.OPENAI_API_KEY = "sk-test";
    hf.failAt = 1;
    const res = await call(await fixBody());
    expect(res.status).toBe(502);
    expect([used(UID, "ai-image-fix"), used(GLOBAL_COUNTER_USER, "ai-image-fix-global")]).toEqual([0, 0]);
  });

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

  it("gives both uses back when Higgsfield refuses the picture or its motion", async () => {
    const ask = { mode: "broll", search: "hawker centre", line: "Lunch costs add up", aspect: "9:16" };
    for (const failAt of [1, 2]) {
      hf.submits.length = 0;
      hf.failAt = failAt;
      const res = await call(ask);
      expect(res.status).toBe(502);
      expect(hf.submits).toHaveLength(failAt);
      expect([used(UID, "ai-broll"), used(GLOBAL_COUNTER_USER, "ai-broll-global")]).toEqual([0, 0]);
    }
  }, 20_000);

  it("gives both uses back when Higgsfield fails the picture", async () => {
    hf.status = { status: "failed" };
    const res = await call({ mode: "broll", search: "hawker centre", line: "Lunch costs add up", aspect: "9:16" });
    expect(res.status).toBe(502);
    expect([used(UID, "ai-broll"), used(GLOBAL_COUNTER_USER, "ai-broll-global")]).toEqual([0, 0]);
  }, 20_000);
});

describe("a slideshow's AI pictures", () => {
  const ask = { mode: "slides", pictures: ["a calm desk", "a planner", "a phone face down"], look: "clay", aspect: "9:16" };

  it("is open to any signed-in adviser, counted on their own cap", async () => {
    const res = await db.handler!(new Request("http://x/ai-image", { method: "POST", headers: { Authorization: "Bearer someone-else" }, body: JSON.stringify(ask) }));
    expect(res.status).toBe(200);
    expect(used("someone-else", "slide-pictures")).toBe(1);
    expect(used(UID, "slide-pictures")).toBe(0);
  });

  it("is refused over the adviser's 5 a day, with nothing asked for", async () => {
    db.rows.set(`${UID}|slide-pictures|${db.today()}`, 5);
    const res = await call(ask);
    expect(res.status).toBe(429);
    expect(hf.submits).toEqual([]);
    expect(used(GLOBAL_COUNTER_USER, "slide-pictures-global")).toBe(0);
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

// Every existing caller (no refs): what OpenAI is sent for a picture, a photo ad's words and a fix, and what the app gets
// back, pinned before the photo ad's reference pictures joined the start.
describe("existing callers, pinned", () => {
  it("send OpenAI the same bodies and get the same answers back", async () => {
    env.OPENAI_API_KEY = "sk-test";
    oa.reply = picture;
    db.kept.set(`${UID}/${PICTURE}.jpg`, new Date().toISOString());
    const answers = [
      await call({ mode: "start", prompt: "A family picnic at East Coast Park at sunset" }),
      await call({ mode: "start", prompt: 'A poster at a bus shelter. Headline: "Still dark."', words: true }),
      await call(await fixBody()),
    ];
    const bodies = oa.calls.map((c) => ({ ...c, body: { ...c.body, ...(c.body.images ? { images: "<the kept picture's signed link>" } : {}) } }));
    const replies = await Promise.all(answers.map(async (r) => ({ status: r.status, keys: Object.keys(await r.json()) })));
    await expect(JSON.stringify({ bodies, replies }, null, 2)).toMatchFileSnapshot("./__pins__/existing-callers.json");
  });
});
