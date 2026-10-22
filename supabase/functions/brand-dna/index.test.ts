import { readFileSync } from "node:fs";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// The handler with the web, the LLM and Jev faked: what a brand's address turns into, and which counters move.
const db = vi.hoisted(() => ({
  spent: [] as string[],
  refunded: [] as string[],
  /** every counter refuses, as when the day's uses are spent */
  limit: false,
  admin: {} as Record<string, unknown>,
  handler: null as null | ((r: Request) => Promise<Response>),
}));
db.admin = {
  auth: { getUser: async (jwt: string) => ({ data: { user: jwt ? { id: jwt } : null } }) },
  rpc: async (_fn: string, a: Record<string, unknown>) => (db.spent.push(String(a.p_feature)), { data: db.limit ? null : 1, error: null }),
  from: () => ({
    select: () => ({ match: async () => ({ data: [{ count: 1 }], error: null }) }),
    update: () => ({ match: (q: { feature: string }) => ({ select: async () => (db.refunded.push(q.feature), { data: [{ count: 0 }], error: null }) }) }),
  }),
};
vi.mock("https://esm.sh/@supabase/supabase-js@2.117.3", () => ({ createClient: () => db.admin }));
// every address index.ts hands to siteUrl (the plain read's check), so a profile-only audiences ask can be shown never to reach it
const siteUrlGot = vi.hoisted(() => [] as unknown[]);
vi.mock("./logic.ts", async (importOriginal) => {
  const real = await importOriginal<typeof import("./logic.ts")>();
  return { ...real, siteUrl: (raw: unknown) => (siteUrlGot.push(raw), real.siteUrl(raw)) };
});

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
  db.limit = false;
  jevAsked.length = 0;
  for (const k of Object.keys(sent)) delete sent[k];
  for (const k of Object.keys(routes)) delete routes[k];
  delete env.TYPESAFE_API_KEY;
  siteUrlGot.length = 0;
});
const html = (body: string) => () => new Response(body, { headers: { "content-type": "text/html; charset=utf-8" } });
const OPENAI = "https://api.openai.com/v1/chat/completions";
const JEV = "https://api.typesafe.ai/v1/systemone";
const reply = (content: unknown) => () => Response.json({ choices: [{ message: { content: JSON.stringify(content) } }] });

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
    "https://acme.sg/services/": `<title>Services</title><p>Family cover reviews and retirement plans.</p><img src="/s1.png" alt="A review">
<script type="application/ld+json">{"@type":"Service","name":"Retirement plan","image":"/ret.png"}</script>`,
  };
  // Jev: about 0.9, services 0.8, tips 0.2, contact 0.6, start 0.7; on the items, the first is an offer and not a named product
  const picks = (q: Record<string, unknown>) => {
    if ("p0" in q) return { p0: { type: "noul", noul: 0.9 }, p1: { type: "noul", noul: 0.8 }, p2: { type: "noul", noul: 0.2 }, p3: { type: "noul", noul: 0.6 }, p4: { type: "noul", noul: 0.7 } };
    if ("offer_0" in q) return { offer_0: { type: "noul", noul: 0.92 }, named_0: { type: "noul", noul: 0.1 }, offer_1: { type: "noul", noul: 0.3 }, named_1: { type: "noul", noul: 0.7 }, kind: { type: "choice", choice: "service" } };
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

  it("refuses deep, products and image before any count for a uid not on NORTH_STAR_USERS, whose plain read is today's", async () => {
    site();
    for (const body of [{ url: "acme.sg", deep: true }, { mode: "products", url: "acme.sg" }, { mode: "image", url: "https://acme.sg/og.jpg" }]) {
      expect(await call(body, "u1")).toEqual({ status: 403, body: { code: "not_enabled", error: "This isn't switched on for your account yet." } });
    }
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

  it("never follows a same-site link whose path starts with // onto another host", async () => {
    site();
    // anchorsOf keeps the path "//evil.example/steal"; resolved against the home page it would name evil.example
    routes["https://acme.sg/"] = html(`<html lang="en"><title>Acme Wealth</title><a href="https://acme.sg//evil.example/steal">About us</a>`);
    jevReply = (q: Record<string, unknown>) => ("p0" in q ? { p0: { type: "noul", noul: 0.9 } } : picks(q));
    const r = await call({ url: "acme.sg", deep: true }, "leo");
    expect(r.status).toBe(200);
    expect(seen.some((u) => new URL(u).hostname.endsWith("evil.example"))).toBe(false);
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

  it("scans for products: one brand-products use, every link and picture from the pages read, Jev's numbers on each item", async () => {
    site();
    routes[OPENAI] = reply({
      items: [
        { name: "Retirement plan", what: "A plan for your retirement.", forWho: "People in their 50s", price: "", url: "https://acme.sg/services", picture: "https://acme.sg/ret.png", generic: "a retirement plan" },
        { name: "Shield Max", what: "Hospital cover.", forWho: "", price: "S$20 a month", url: "https://acme.sg/buy-now", picture: "https://evil.sg/x.png", generic: "a hospital plan" },
      ],
    });
    const r = await call({ mode: "products", url: "acme.sg" }, "leo");
    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      site: "https://acme.sg",
      readAt: expect.stringMatching(/^\d{4}-\d\d-\d\dT/),
      pagesRead: ["https://acme.sg/", "https://acme.sg/about", "https://acme.sg/services/"],
      kind: "service",
      items: [
        { name: "Retirement plan", what: "A plan for your retirement.", forWho: "People in their 50s", url: "https://acme.sg/services/", picture: "https://acme.sg/ret.png", generic: "a retirement plan", offerP: 0.92, namedP: 0.1 },
        { name: "Shield Max", what: "Hospital cover.", forWho: "", price: "S$20 a month", generic: "a hospital plan", offerP: 0.3, namedP: 0.7 },
      ],
    });
    // the writer saw each page's pictures and listed items inside that page's fence
    expect(userText()).toMatch(/<page url="https:\/\/acme.sg\/services\/">[^]*Picture: https:\/\/acme.sg\/s1.png[^]*Listed item: Retirement plan[^]*<\/page>/);
    expect(userText()).toContain("Picture: https://acme.sg/og.jpg");
    expect((sent[OPENAI] as { response_format: { json_schema: { strict: boolean } } }).response_format.json_schema.strict).toBe(true);
    expect(db.spent).toEqual(["brand-products"]);
    expect(db.refunded).toEqual([]);
  });

  it("leaves every item unticked with no error when Jev is silent", async () => {
    site();
    delete env.TYPESAFE_API_KEY;
    routes[OPENAI] = reply({ items: [{ name: "Retirement plan", what: "w", forWho: "", price: "", url: "", picture: "", generic: "a retirement plan" }] });
    const r = await call({ mode: "products", url: "acme.sg" }, "leo");
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ pagesRead: ["https://acme.sg/"], kind: null, items: [{ name: "Retirement plan", offerP: null, namedP: null }] });
  });

  it("gives the products use back when OpenAI or the home page never answered, and keeps it for a reply that fails the schema", async () => {
    site();
    routes[OPENAI] = () => new Response("overloaded", { status: 503 });
    expect(await call({ mode: "products", url: "acme.sg" }, "leo")).toEqual({ status: 502, body: { code: "failed", error: "Couldn't list what this site sells right now. Try again in a few minutes." } });
    routes[OPENAI] = () => {
      throw new DOMException("The signal has been aborted", "TimeoutError");
    };
    expect((await call({ mode: "products", url: "acme.sg" }, "leo")).status).toBe(502);
    expect(await call({ mode: "products", url: "down.sg" }, "leo")).toEqual({ status: 502, body: { code: "failed", error: "We couldn't open down.sg. Check the address and try again." } });
    expect(db.refunded).toEqual(["brand-products", "brand-products", "brand-products"]);

    db.refunded.length = 0;
    routes[OPENAI] = reply({ products: "not the schema" });
    expect(await call({ mode: "products", url: "acme.sg" }, "leo")).toMatchObject({ status: 422, body: { code: "bad_reply" } });
    expect(db.refunded).toEqual([]);
    expect(db.spent.every((f) => f === "brand-products")).toBe(true);
  });

  it("answers a spent day's cap with the 8am line before fetching anything, for products and pictures", async () => {
    site();
    db.limit = true;
    for (const body of [{ mode: "products", url: "acme.sg" }, { mode: "image", url: "https://acme.sg/og.jpg" }]) {
      expect(await call(body, "leo")).toMatchObject({ status: 429, body: { code: "daily_limit", error: expect.stringMatching(/It resets at 8am Singapore time\.$/) } });
    }
    expect(db.spent).toEqual(["brand-products", "brand-image"]);
    expect(seen).toEqual([]);
    expect(db.refunded).toEqual([]);
  });

  it("fetches one picture from the site as a data URL, refusing private addresses and anything not a PNG, JPEG or WebP", async () => {
    const JPEG = new Uint8Array(300).fill(1);
    JPEG.set([0xff, 0xd8, 0xff]);
    routes["https://acme.sg/a.jpg"] = () => new Response(JPEG, { headers: { "content-type": "image/jpeg" } });
    routes["https://acme.sg/page.png"] = html("<p>not a picture</p>");
    routes["https://acme.sg/huge.png"] = () => {
      const big = new Uint8Array(2_100_000);
      big.set(PNG.subarray(0, 4));
      return new Response(big, { headers: { "content-type": "image/png" } });
    };
    const ok = await call({ mode: "image", url: "https://acme.sg/a.jpg" }, "leo");
    expect(ok.status).toBe(200);
    expect(ok.body.dataUrl).toBe(`data:image/jpeg;base64,${Buffer.from(JPEG).toString("base64")}`);
    expect(db.spent).toEqual(["brand-image"]);

    // literal private addresses and local names never count
    for (const url of ["http://10.0.0.2/a.png", "http://localhost/a.png", "https://acme.sg:8443/a.png", "acme.sg/a.png", 5]) expect((await call({ mode: "image", url }, "leo")).status).toBe(400);
    expect(db.spent).toEqual(["brand-image"]);
    // a name that resolves inside a network is never fetched
    expect(await call({ mode: "image", url: "https://inside.sg/a.png" }, "leo")).toEqual({ status: 502, body: { code: "failed", error: "Couldn't fetch that picture. Upload one instead." } });
    expect(seen.some((u) => u.includes("inside.sg"))).toBe(false);
    expect(db.refunded).toEqual(["brand-image"]);

    expect(await call({ mode: "image", url: "https://acme.sg/page.png" }, "leo")).toMatchObject({ status: 422, body: { code: "not_image" } });
    expect(await call({ mode: "image", url: "https://acme.sg/huge.png" }, "leo")).toMatchObject({ status: 422, body: { code: "too_big" } });
    expect(db.refunded).toEqual(["brand-image"]);
    expect(db.spent.every((f) => f === "brand-image")).toBe(true);
  });
});

describe("audience suggestions (phase 5, Leo only)", () => {
  const HOME = `<html lang="en"><title>Acme Wealth | Plans</title><meta name="description" content="Plans for young families.">
<p>We help young families and pre-retirees in Tampines.</p><a href="/about">About us</a><a href="/blog/tips">Tips</a>`;
  const profile = { oneLiner: "I help young families plan their cover.", audienceDetail: "Parents in their 30s", topics: ["Hospital plans", "CPF"], edge: "", role: "Financial adviser", coachAudience: "New parents" };
  const groups = [
    { name: "Young parents in HDB flats", who: "Both working, kids under 10.", cares: ["childcare costs", "hospital bills"], says: "Can we afford a second kid?" },
    { name: "Savings plans", who: "Plans that grow money.", cares: [], says: "" },
    { name: "Pre-retirees in Tampines", who: "In their 50s, CPF questions.", cares: ["CPF payouts"], says: "" },
  ];
  // the about page is picked (0.9), the blog is not; the second group is a product and the third a saved group again
  const answers = (q: Record<string, unknown>) =>
    "p0" in q ? { p0: { type: "noul", noul: 0.9 }, p1: { type: "noul", noul: 0.1 } }
    : {
        real_0: { type: "noul", noul: 0.95 }, stage_0: { type: "choice", choice: "parent" }, same_0_0: { type: "noul", noul: 0.2 },
        real_1: { type: "noul", noul: 0.1 }, stage_1: { type: "choice", choice: "general" }, same_1_0: { type: "noul", noul: 0.05 },
        real_2: { type: "noul", noul: 0.9 }, stage_2: { type: "choice", choice: "pre-retiree" }, same_2_0: { type: "noul", noul: 0.8 },
      };
  const saved = [{ name: "Pre-retirees", who: "People in their 50s planning retirement" }];
  const acme = () => {
    routes["https://acme.sg/"] = html(HOME);
    routes["https://acme.sg/about"] = html("<title>About</title><p>Two advisers who mostly see parents.</p>");
    routes[OPENAI] = reply({ audiences: groups });
    env.TYPESAFE_API_KEY = "t";
    jevReply = answers;
  };
  const writer = () => sent[OPENAI] as { model: string; max_completion_tokens: number; response_format: { json_schema: { name: string; strict: boolean } }; messages: { content: string }[] };
  const audienceAsk = () => jevAsked.find((a) => "real_0" in a.questions)!;

  it("refuses a uid not on NORTH_STAR_USERS before any count, fetch or model", async () => {
    acme();
    for (const body of [{ mode: "audiences", url: "acme.sg" }, { mode: "audiences", profile }]) {
      expect(await call(body, "u1")).toEqual({ status: 403, body: { code: "not_enabled", error: "This isn't switched on for your account yet." } });
    }
    expect(seen).toEqual([]);
    expect(db.spent).toEqual([]);
    expect(siteUrlGot).toEqual([]);
  });

  it("refuses a bad ask with 400 and an unset OpenAI key with 503 not_configured, before any count", async () => {
    acme();
    for (const body of [{ mode: "audiences" }, { mode: "audiences", url: "localhost" }, { mode: "audiences", profile: { oneLiner: " " } }, { mode: "audiences", profile, saved: Array.from({ length: 7 }, () => ({ name: "a", who: "b" })) }]) {
      expect(await call(body, "leo")).toMatchObject({ status: 400, body: { code: "bad_request" } });
    }
    delete env.OPENAI_API_KEY;
    try {
      expect(await call({ mode: "audiences", profile }, "leo")).toMatchObject({ status: 503, body: { code: "not_configured" } });
    } finally {
      env.OPENAI_API_KEY = "k";
    }
    expect(seen).toEqual([]);
    expect(db.spent).toEqual([]);
  });

  it("reads the home page and the pages Jev picks, and keeps the real, new groups with their life stages for one use", async () => {
    acme();
    const r = await call({ mode: "audiences", url: "acme.sg", saved }, "leo");
    expect(r).toEqual({
      status: 200,
      body: {
        audiences: [{ name: "Young parents in HDB flats", who: "Both working, kids under 10.", lifeStage: "parent", cares: ["childcare costs", "hospital bills"], says: "Can we afford a second kid?" }],
        pagesRead: ["https://acme.sg/", "https://acme.sg/about"],
        scored: true,
      },
    });
    expect(seen).not.toContain("https://acme.sg/blog/tips");
    expect(writer()).toMatchObject({ model: "gpt-6-luna", max_completion_tokens: 900 + 4000, response_format: { json_schema: { name: "brand_audiences", strict: true } } });
    expect(writer().messages[1].content).toContain('<page url="https://acme.sg/about">\nAbout Two advisers who mostly see parents.\n</page>');
    expect(writer().messages[1].content).toContain("Groups already saved, so write different ones:\n- Pre-retirees: People in their 50s planning retirement");
    // one Jev request over every candidate, after the page pick
    expect(jevAsked).toHaveLength(2);
    expect(audienceAsk().state).toEqual({ business: "Acme Wealth", country: "Singapore" });
    expect(Object.keys(audienceAsk().questions)).toEqual(["real_0", "stage_0", "same_0_0", "real_1", "stage_1", "same_1_0", "real_2", "stage_2", "same_2_0"]);
    expect(db.spent).toEqual(["audience-suggest"]);
    expect(db.refunded).toEqual([]);
  });

  it("writes from a profile alone: never sent to siteUrl, no page fetched, nothing read", async () => {
    acme();
    const r = await call({ mode: "audiences", profile: { ...profile, oneLiner: "acme.sg is my site" } }, "leo");
    expect(r.status).toBe(200);
    expect(r.body.pagesRead).toEqual([]);
    expect(r.body.audiences.map((a: { name: string }) => a.name)).toEqual(["Young parents in HDB flats", "Pre-retirees in Tampines"]);
    expect(siteUrlGot).toEqual([]);
    expect([...new Set(seen)]).toEqual([OPENAI, JEV]);
    expect(writer().messages[1].content).toContain("<profile>\nWhat they do: acme.sg is my site\nWho they serve: Parents in their 30s\nTopics: Hospital plans, CPF\nTheir role: Financial adviser\nWho they're for: New parents\n</profile>");
    expect(audienceAsk().state).toEqual({ business: "acme.sg is my site", country: "Singapore" });
    expect(db.spent).toEqual(["audience-suggest"]);
  });

  it("keeps every candidate as general with scored false when Jev is silent", async () => {
    acme();
    delete env.TYPESAFE_API_KEY;
    const r = await call({ mode: "audiences", url: "acme.sg", saved }, "leo");
    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      audiences: groups.map((g) => ({ name: g.name, who: g.who, lifeStage: "general", cares: g.cares, ...(g.says ? { says: g.says } : {}) })),
      pagesRead: ["https://acme.sg/"],
      scored: false,
    });
  });

  it("answers 422 none_new and keeps the use when nothing real and new is left, or the writer found no one", async () => {
    acme();
    jevReply = (q) => ("p0" in q ? {} : { real_0: { type: "noul", noul: 0.2 }, real_1: { type: "noul", noul: 0.2 }, real_2: { type: "noul", noul: 0.2 } });
    expect(await call({ mode: "audiences", url: "acme.sg" }, "leo")).toEqual({ status: 422, body: { code: "none_new", error: "Nothing new on acme.sg about who you serve. Add one yourself." } });
    routes[OPENAI] = reply({ audiences: [] });
    expect(await call({ mode: "audiences", profile }, "leo")).toEqual({ status: 422, body: { code: "none_new", error: "Nothing new in your profile about who you serve. Add one yourself." } });
    routes[OPENAI] = reply({ groups: "not the schema" });
    expect(await call({ mode: "audiences", profile }, "leo")).toMatchObject({ status: 422, body: { code: "bad_reply" } });
    expect(db.spent).toEqual(["audience-suggest", "audience-suggest", "audience-suggest"]);
    expect(db.refunded).toEqual([]);
  });

  it("gives the use back with 502 failed when the home page or OpenAI never answered", async () => {
    acme();
    expect(await call({ mode: "audiences", url: "down.sg" }, "leo")).toEqual({ status: 502, body: { code: "failed", error: "We couldn't read down.sg. Check the address, or suggest from your profile." } });
    routes[OPENAI] = () => new Response("overloaded", { status: 503 });
    expect(await call({ mode: "audiences", url: "acme.sg" }, "leo")).toMatchObject({ status: 502, body: { code: "failed" } });
    routes[OPENAI] = () => {
      throw new DOMException("The signal has been aborted", "TimeoutError");
    };
    expect(await call({ mode: "audiences", profile }, "leo")).toEqual({ status: 502, body: { code: "failed", error: "Couldn't suggest audiences right now. Try again in a few minutes." } });
    expect(db.spent).toEqual(["audience-suggest", "audience-suggest", "audience-suggest"]);
    expect(db.refunded).toEqual(["audience-suggest", "audience-suggest", "audience-suggest"]);
  });

  it("answers a spent day's cap with the 8am line before fetching anything", async () => {
    acme();
    db.limit = true;
    expect(await call({ mode: "audiences", url: "acme.sg" }, "leo")).toMatchObject({ status: 429, body: { code: "daily_limit", error: expect.stringMatching(/It resets at 8am Singapore time\.$/) } });
    expect(seen).toEqual([]);
    expect(db.refunded).toEqual([]);
  });
});
