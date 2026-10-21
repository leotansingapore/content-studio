import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import DOGFOOD from "./fixtures/dogfood-makes-21oct.json";
import LIVE from "./fixtures/phase3-w1-live.json";

// The live handler's make path, with the database and OpenAI faked: when a remix's use comes back and when it stays.
const UID = "leo-uid";

const db = vi.hoisted(() => {
  // cs_ai_usage in memory, keyed user|feature|day: the consume RPC, one row read and the conditional update
  const rows = new Map<string, number>();
  const reels = new Map<string, { transcript: string | null }>();
  const today = () => new Date().toISOString().slice(0, 10);
  const key = (q: Record<string, unknown>) => `${q.user_id}|${q.feature}|${q.day}`;
  const admin = {
    auth: { getUser: async (jwt: string) => ({ data: { user: jwt ? { id: jwt } : null } }) },
    rpc: async (_fn: string, a: Record<string, unknown>) => {
      const k = `${a.p_user}|${a.p_feature}|${today()}`;
      const n = rows.get(k) ?? 0;
      if (n >= Number(a.p_limit)) return { data: null, error: null };
      rows.set(k, n + 1);
      return { data: n + 1, error: null };
    },
    from: (table: string) => ({
      select: () => ({
        match: async (q: Record<string, unknown>) => ({ data: rows.has(key(q)) ? [{ count: rows.get(key(q)) }] : [], error: null }),
        // cs_reel_sources: the reader's cached row for a reel or TikTok, by platform and post id
        eq: (_c: string, platform: string) => ({
          eq: (_d: string, postId: string) => ({ maybeSingle: async () => ({ data: table === "cs_reel_sources" ? reels.get(`${platform}:${postId}`) ?? null : null, error: null }) }),
        }),
      }),
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
  return { admin, rows, reels, today, handler: null as null | ((r: Request) => Promise<Response>) };
});
vi.mock("https://esm.sh/@supabase/supabase-js@2", () => ({ createClient: () => db.admin }));

// OpenAI: "down" answers 500, "junk" answers text no format can use, "drops" never answers at all, "queue" answers
// each call with the next of `answers` (JSON) and keeps what it was sent
const openai = { mode: "down" as "down" | "junk" | "drops" | "queue", calls: 0, answers: [] as unknown[], sent: [] as { messages: { role: string; content: string }[] }[] };
// Jev: the state and questions each call was sent; answered with `answers` when set, else a 500 (no flags)
const jev = { states: [] as Record<string, unknown>[], questions: [] as string[][], answers: null as null | Record<string, { noul: number }> };

beforeAll(async () => {
  // one fixed instant, so the counter's day can't turn between the handler and these rows
  vi.useFakeTimers({ toFake: ["Date"] });
  const env: Record<string, string> = { SUPABASE_URL: "http://db", SUPABASE_SERVICE_ROLE_KEY: "k", NORTH_STAR_USERS: UID, OPENAI_API_KEY: "k", TYPESAFE_API_KEY: "k" };
  vi.stubGlobal("Deno", { serve: (fn: (r: Request) => Promise<Response>) => (db.handler = fn), env: { get: (k: string) => env[k] } });
  vi.stubGlobal("fetch", async (u: URL | string, init?: RequestInit) => {
    if (String(u).includes("typesafe")) {
      const sent = JSON.parse(String(init?.body ?? "{}"));
      jev.states.push(sent.state ?? {});
      jev.questions.push(Object.keys(sent.questions ?? {}));
      return jev.answers ? Response.json({ answers: jev.answers }) : new Response("{}", { status: 500 });
    }
    if (!String(u).includes("openai")) throw new Error(`unexpected fetch ${u}`);
    openai.calls++;
    if (openai.mode === "drops") throw new TypeError("network connection lost");
    if (openai.mode === "down") return new Response("{}", { status: 500 });
    if (openai.mode === "queue") {
      openai.sent.push(JSON.parse(String(init?.body ?? "{}")));
      return Response.json({ model: "gpt-4.1", choices: [{ message: { content: JSON.stringify(openai.answers.shift() ?? {}) } }] });
    }
    return Response.json({ model: "gpt-4.1", choices: [{ message: { content: "Sorry, here is a poem instead." } }] });
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
  openai.calls = 0;
  openai.sent = [];
  jev.states = [];
  jev.questions = [];
  jev.answers = null;
});

const make = async () => {
  const r = await db.handler!(new Request("http://x/remix", {
    method: "POST",
    headers: { Authorization: `Bearer ${UID}` },
    body: JSON.stringify({
      mode: "make",
      as: "post",
      source: { key: "top:grace-koh-instagram-C931K", kind: "top-post", format: "video", text: "6 signs your CPF plan is off track. Most people never check their CPF statement." },
      brand: { name: "MoneyBees", audience: "fresh grads" },
    }),
  }));
  return { status: r.status, body: await r.json() };
};
const used = () => db.rows.get(`${UID}|remix-make|${db.today()}`) ?? 0;

describe("a remix's use", () => {
  it("comes back when OpenAI is down, and says nothing was used", async () => {
    openai.mode = "down";
    expect(await make()).toMatchObject({ status: 502, body: { code: "failed", error: "That remix didn't go through. Nothing was used." } });
    expect(used()).toBe(0);
  });

  it("comes back when the call to OpenAI never returns", async () => {
    openai.mode = "drops";
    expect(await make()).toMatchObject({ status: 502, body: { code: "failed" } });
    expect(used()).toBe(0);
  });

  it("stays spent when OpenAI answered twice with nothing usable, since both answers were billed", async () => {
    openai.mode = "junk";
    expect(await make()).toMatchObject({ status: 422, body: { code: "unusable" } });
    expect(openai.calls).toBe(2);
    expect(used()).toBe(1);
  });
});

// The 21 Oct dogfood's makes as sent, answered here by the faked OpenAI
const dogfood = (call: string) => DOGFOOD.find((x) => x.call === call)!;
const send = async (body: unknown) => {
  const r = await db.handler!(new Request("http://x/remix", { method: "POST", headers: { Authorization: `Bearer ${UID}` }, body: JSON.stringify(body) }));
  return { status: r.status, body: await r.json() };
};

describe("a post's checks in code (dogfood 21 Oct)", () => {
  it("sends a post that names ActivityTracker twice back once, and answers with the fixed one", async () => {
    const d = dogfood("017-remix.json");
    const once = { ...d.answer.result, body: d.answer.result.body.replace("ActivityTracker brings", "One app brings") };
    openai.mode = "queue";
    openai.answers = [d.answer.result, once];
    const r = await send(d.request);
    expect(r.status).toBe(200);
    expect(r.body.result.body).toContain("One app brings");
    expect(openai.calls).toBe(2);
    expect(openai.sent[1].messages.at(-1)!.content).toContain("names ActivityTracker 2 times");
  });

  it("refuses a post that still stops mid-sentence after the fixing pass, and keeps the use since both answers were billed", async () => {
    const d = dogfood("014-remix.json");
    openai.mode = "queue";
    openai.answers = [d.answer.result, d.answer.result];
    expect(await send(d.request)).toMatchObject({ status: 422, body: { code: "refused", error: "That remix stopped mid-sentence. Try again." } });
    expect(openai.calls).toBe(2);
    expect(used()).toBe(1);
  });
});

describe("a video's spoken words (dogfood 21 Oct, Apollo's TikTok 7685781265122938126)", () => {
  // made up for the test around the breakdown's hook line; the real transcript lives in cs_reel_sources
  const TRANSCRIPT = "Okay, wait, you booked a meeting with Meridian? They are one of our top accounts. I sent a calendar invite. So, can you log it as a meeting toward my target?";

  it("go to the writer and the copy check when the breakdown cached them, so a line copied from the speech is caught", async () => {
    const d = dogfood("020-remix.json");
    db.reels.set("tiktok:7685781265122938126", { transcript: TRANSCRIPT });
    openai.mode = "queue";
    // the dogfood's draft 4 says "So, can you log it as a meeting toward my target?" and the rewrite keeps it; its cta
    // loses the second ActivityTracker so the post's own checks pass
    const once = { ...d.answer.result, cta: "Keep your follow-ups and activity organised." };
    openai.answers = [once, once];
    const r = await send(d.request);
    expect(r.status).toBe(200);
    expect(openai.sent[0].messages[1].content).toContain("Okay, wait, you booked a meeting with Meridian?");
    expect(openai.sent[0].messages[1].content).toContain("Moving this one to commit");
    expect(r.body.flags.copied.join(" | ")).toMatch(/can you log it as a meeting toward my target/i);
    expect(jev.states[0].source).toContain("They are one of our top accounts.");
  });

  it("leave the caption alone when nothing was read, and never add a pasted link's transcript twice", async () => {
    const d = dogfood("020-remix.json");
    openai.mode = "queue";
    openai.answers = [{ ...d.answer.result, cta: "Keep your follow-ups and activity organised." }];
    await send(d.request);
    expect(openai.sent[0].messages[1].content).not.toContain("Meridian?");

    const link = dogfood("036-remix.json");
    db.reels.set("tiktok:7693224702424206606", { transcript: link.request.source.text });
    openai.sent = [];
    openai.answers = [link.answer.result];
    await send(link.request);
    const user = openai.sent[0].messages[1].content;
    expect(user.split("These five habits took me").length).toBe(2);
  });
});

describe("the copy floor by level", () => {
  it("sends Loose back for a 4-word run of the original, which Balanced lets through", async () => {
    openai.mode = "queue";
    const d = dogfood("029-remix.json");
    const copied = { ...d.answer.result, body: `You've sent that message more than once.\n\n${d.answer.result.body}` };
    openai.answers = [copied, d.answer.result];
    expect((await send(d.request)).status).toBe(200);
    expect(openai.calls).toBe(2);
    expect(openai.sent[1].messages.at(-1)!.content).toContain("- You've sent that message more");

    openai.calls = 0;
    openai.answers = [copied];
    expect((await send({ ...d.request, close: "balanced" })).status).toBe(200);
    expect(openai.calls).toBe(1);
  });
});

describe("the fit check (dogfood 21 Oct: Thomson Medical's TCM ad for ActivityTracker)", () => {
  const fit = (speaker?: string) =>
    send({ mode: "fit", source: { key: "ad:1938254387570062", kind: "ad", format: "image", text: "Your tongue tells your TCM physician a lot about your health." }, brand: { name: "ActivityTracker", oneLiner: "We help sales reps manage clients in one app.", speaker }, video: false });

  it("asks a business no MAS-safe question, so a low MAS answer can't mark it down", async () => {
    jev.answers = { serves: { noul: 0.7 }, retell: { noul: 0.8 }, masSafe: { noul: 0.1 } };
    expect(await fit("business")).toMatchObject({ status: 200, body: { verdict: "good", reasons: [] } });
    expect(jev.questions[0]).toEqual(["serves", "retell"]);
  });

  it("still asks the adviser (and an older app that sends no speaker)", async () => {
    jev.answers = { serves: { noul: 0.7 }, retell: { noul: 0.8 }, masSafe: { noul: 0.1 } };
    expect(await fit()).toMatchObject({ status: 200, body: { verdict: "weak", reasons: ["masSafe"] } });
    expect(jev.questions[0]).toEqual(["serves", "retell", "masSafe"]);
  });
});

// ---- phase 3's shapes: one remix-make use per make, Jev's picks inside it, a refund only when OpenAI never answered ----

const CAP = { caption: "Small habits fill a pipeline. Track them daily and the pattern shows.", cta: "Save this for Monday.", hashtags: ["sales"] };
const BRAND = { name: "MoneyBees", audience: "fresh grads", topics: ["CPF"] };
const AD = { key: "ad:2095783381019179", kind: "ad", format: "image", text: "Protect your family today with a plan that grows with you. Get a free quote." };
const MEMES = [
  { top: "When the bank says pre-approved", bottom: "Me checking my CPF statement" },
  { top: "Payday at noon", bottom: "Bills by one" },
  { top: "Me saving for a BTO", bottom: "Also me buying bubble tea" },
];
const meme = { refuse: false, reason: "", options: MEMES, ...CAP };
const words = { headline: "", line: "", button: "", quote: "", statLabel: "" };

describe("phase 3's shapes", () => {
  it("answer 403 for anyone not on NORTH_STAR_USERS, before any count, OpenAI or Jev", async () => {
    openai.mode = "queue";
    for (const b of [
      { as: "notes", topic: "Overspending" },
      { as: "image", source: AD },
      { as: "meme", layout: "pov", topic: "Payday" },
      { as: "speaking", seconds: 15, topic: "Why I review cover yearly" },
    ]) {
      const r = await db.handler!(new Request("http://x/remix", { method: "POST", headers: { Authorization: "Bearer someone-else" }, body: JSON.stringify({ mode: "make", brand: BRAND, ...b }) }));
      expect(r.status, b.as).toBe(403);
      expect(await r.json()).toEqual({ code: "not_enabled", error: "This isn't switched on for your account yet." });
    }
    expect([db.rows.size, openai.calls, jev.states.length]).toEqual([0, 0, 0]);
  });

  it("picks an image's layout with Jev inside the make's one use, and writes for that layout", async () => {
    openai.mode = "queue";
    openai.answers = [{ refuse: false, reason: "", words: { ...words, statLabel: "of reps say follow-ups slip" }, ...CAP }];
    jev.answers = { layout: { type: "choice", choice: "stat", probabilities: { stat: 0.8 } } as never, mas: { noul: 0.7 } };
    const r = await send({ mode: "make", as: "image", source: AD, shows: "A big number on an orange block", brand: BRAND });
    expect(r).toMatchObject({ status: 200, body: { result: { as: "image", layout: "stat", layoutBy: "jev", words: { statLabel: "of reps say follow-ups slip" } }, flags: { mas: true } } });
    expect(jev.states[0]).toEqual({ ad: "A big number on an orange block" });
    expect(openai.sent[0].messages[0].content).toContain("Its layout is one big number");
    expect(used()).toBe(1);
  });

  it("never asks a business's image the MAS question, which is about licensed advisers", async () => {
    openai.mode = "queue";
    openai.answers = [{ refuse: false, reason: "", words: { ...words, quote: "We built it for the reps who forget nothing but still lose deals." }, ...CAP }];
    jev.answers = { layout: { type: "choice", choice: "quote", probabilities: { quote: 0.9 } } as never, mas: { noul: 0.9 } };
    const r = await send({ mode: "make", as: "image", source: AD, brand: { name: "ActivityTracker", speaker: "business" } });
    expect(r).toMatchObject({ status: 200, body: { result: { layout: "quote", layoutBy: "jev" }, flags: { mas: null } } });
    expect(jev.questions.some((q) => q.includes("mas"))).toBe(false);
  });

  it("falls back to Headline ad when Jev has no answer, and gives no MAS flag", async () => {
    openai.mode = "queue";
    openai.answers = [{ refuse: false, reason: "", words: { ...words, headline: "Your hospital bill, split in two", line: "Why a plan has a co-pay.", button: "Message me" }, ...CAP }];
    const r = await send({ mode: "make", as: "image", source: AD, brand: BRAND });
    expect(r).toMatchObject({ status: 200, body: { result: { layout: "headline", layoutBy: "default" }, flags: { mas: null } } });
    expect(jev.states[0]).toEqual({ ad: AD.text });
    expect(used()).toBe(1);
  });

  it("sends an image that kept 4 words of the ad back once, and refuses it with the use kept when it still does", async () => {
    openai.mode = "queue";
    const copied = { refuse: false, reason: "", words: { ...words, headline: "Cover that lasts", line: "Get a free quote in under a minute.", button: "Message me" }, ...CAP };
    openai.answers = [copied, copied];
    expect(await send({ mode: "make", as: "image", layout: "headline", source: AD, brand: BRAND })).toMatchObject({ status: 422, body: { code: "refused", error: "The words kept too much of the original ad. Try again." } });
    expect(openai.sent[1].messages.at(-1)!.content).toContain("- Get a free quote");
    expect(used()).toBe(1);
  });

  it("drops an unsafe meme, marks the funniest kept one best and asks MAS of it alone", async () => {
    openai.mode = "queue";
    openai.answers = [meme];
    jev.answers = {
      unsafe_0: { noul: 0.1 }, unsafe_1: { noul: 0.6 }, unsafe_2: { noul: 0.2 },
      funny_0: { score: 1.2 }, funny_1: { score: 3 }, funny_2: { score: 2.1 },
      mas: { noul: 0.2 },
    } as never;
    const r = await send({ mode: "make", as: "meme", layout: "top-bottom", topic: "Saving for a flat", brand: BRAND });
    expect(r).toMatchObject({ status: 200, body: { result: { as: "meme", options: MEMES, best: 2, dropped: [1] }, flags: { mas: false } } });
    const asked = jev.questions.findIndex((q) => q.includes("funny_0"));
    expect(jev.questions[asked]).toEqual(["funny_0", "unsafe_0", "funny_1", "unsafe_1", "funny_2", "unsafe_2"]);
    expect(jev.states.at(-1)).toEqual({ post: `Me saving for a BTO\nAlso me buying bubble tea\n${CAP.caption}\n\n${CAP.cta}\n\n#sales` });
    expect(used()).toBe(1);
  });

  it("refuses a meme set when all three are unsafe, and keeps the use since the model answered", async () => {
    openai.mode = "queue";
    openai.answers = [meme];
    jev.answers = { unsafe_0: { noul: 0.9 }, unsafe_1: { noul: 0.5 }, unsafe_2: { noul: 0.4 } } as never;
    expect(await send({ mode: "make", as: "meme", layout: "top-bottom", topic: "Saving for a flat", brand: BRAND })).toMatchObject({
      status: 422,
      body: { code: "refused", error: "None of these were safe to post. Try another topic." },
    });
    expect(used()).toBe(1);
  });

  it("keeps all three memes with no best when Jev has no answer", async () => {
    openai.mode = "queue";
    openai.answers = [meme];
    expect(await send({ mode: "make", as: "meme", layout: "top-bottom", topic: "Saving for a flat", brand: BRAND })).toMatchObject({ status: 200, body: { result: { best: null, dropped: [] }, flags: { mas: null } } });
  });

  it("gives the use back only when OpenAI never answered", async () => {
    openai.mode = "down";
    expect(await send({ mode: "make", as: "meme", layout: "pov", topic: "Payday", brand: BRAND })).toMatchObject({ status: 502, body: { code: "failed" } });
    expect(used()).toBe(0);
    openai.mode = "junk";
    expect(await send({ mode: "make", as: "notes", topic: "Overspending", brand: BRAND })).toMatchObject({ status: 422, body: { code: "unusable" } });
    expect(used()).toBe(1);
    openai.mode = "queue";
    openai.answers = [{ refuse: true, reason: "It promises returns.", title: "", items: [], ...CAP }];
    expect(await send({ mode: "make", as: "notes", topic: "Guaranteed returns", brand: BRAND })).toMatchObject({ status: 422, body: { code: "refused" } });
    expect(used()).toBe(2);
  });

  it("sends a talking head's short script back once for its length, and refuses hooks without three formulas before any count", async () => {
    openai.mode = "queue";
    const said = (k: number) => Array.from({ length: k }, () => "word").join(" ");
    openai.answers = [{ refuse: false, reason: "", script: `${said(29)} end.`, caption: "Caption here." }, { refuse: false, reason: "", script: `${said(39)} end.`, caption: "Caption here." }];
    const r = await send({ mode: "make", as: "speaking", seconds: 15, topic: "Why I review my cover", brand: BRAND });
    expect(r.status).toBe(200);
    expect(openai.sent[1].messages.at(-1)!.content).toContain("36 to 48 words");
    expect(openai.sent[0].response_format).toMatchObject({ json_schema: { name: "remix_speaking" } });
    expect(await send({ mode: "make", as: "hooks", formulas: [], topic: "x", brand: BRAND })).toMatchObject({ status: 400, body: { code: "bad_request", error: "Send three hook formulas." } });
    expect(used()).toBe(1);
  });
});

// ---- the wave 1 live check (21 Oct): its real requests, answered here with what the model wrote that day ----

const live = (call: string) => LIVE.find((x) => x.call === call)!;
/** The model's JSON behind a live answer: the result's own fields, with a joined caption split back into caption, cta and hashtags. */
const wrote = (result: Record<string, unknown>) => {
  const { as, layout: _l, layoutBy: _b, best: _best, dropped: _d, caption, ...rest } = result;
  if (as === "speaking" || as === "hooks") return { refuse: false, reason: "", ...rest, ...(caption ? { caption } : {}) };
  const [c, cta, tags = ""] = String(caption).split("\n\n");
  return { refuse: false, reason: "", ...rest, caption: c, cta, hashtags: tags.split(" ").filter(Boolean).map((t) => t.slice(1)) };
};

describe("the wave 1 live check (21 Oct)", () => {
  it("gives Jev the brand's own one-liner and audience as facts, so a make restating them for a brand with no facts isn't invented", async () => {
    const d = live("1-speaking-15s");
    openai.mode = "queue";
    openai.answers = [wrote(d.response.result)];
    jev.answers = { copied_claim: { noul: 0.05 }, invented_self: { noul: 0.1 } };
    const r = await send(d.request);
    expect(r).toMatchObject({ status: 200, body: { result: d.response.result, flags: { invented: false } } });
    const asked = jev.states.find((s) => "post" in s)!;
    expect(asked.facts).toContain("- What they do: an all-in-one productivity app for sales reps: CRM, WhatsApp inbox, tasks and goals");
    expect(asked.facts).toContain("- Who they serve: sales-oriented self-employed professionals and coaches");
  });
});
