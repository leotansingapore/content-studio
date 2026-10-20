import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import FB_ADS from "./fixtures/facebook-ads.json";

// The handler with every provider faked (DataForSEO, the sites, OpenAI, Jev): which counters move, which come back.
const db = vi.hoisted(() => ({
  spent: [] as string[],
  refunded: [] as string[],
  limit: false,
  /** features whose counter is spent */
  refuse: [] as string[],
  admin: {} as Record<string, unknown>,
  handler: null as null | ((r: Request) => Promise<Response>),
}));
db.admin = {
  auth: { getUser: async (jwt: string) => ({ data: { user: jwt ? { id: jwt } : null } }) },
  rpc: async (_fn: string, a: Record<string, unknown>) => (db.spent.push(String(a.p_feature)), { data: db.limit || db.refuse.includes(String(a.p_feature)) ? null : 1, error: null }),
  from: () => ({
    select: () => ({ match: async () => ({ data: [{ count: 1 }], error: null }) }),
    update: () => ({ match: (q: { feature: string }) => ({ select: async () => (db.refunded.push(q.feature), { data: [{ count: 0 }], error: null }) }) }),
  }),
};
vi.mock("https://esm.sh/@supabase/supabase-js@2.117.3", () => ({ createClient: () => db.admin }));

const LEO = "leo-uid";
const PAGE = (name: string) => `<title>${name} | Home</title><link rel="apple-touch-icon" href="https://cdn.${name.toLowerCase()}.sg/t.png">
<link rel="icon" href="http://old.sg/i.png"><a href="https://instagram.com/${name.toLowerCase()}">ig</a><a href="https://facebook.com/${name}SG">fb</a>`;
const SERP = {
  tasks: [{ status_code: 20000, result: [{ items: [
    { type: "organic", title: "Acme Wealth", url: "https://acme.sg/", description: "Plans" },
    { type: "organic", title: "Acme on Instagram", url: "https://www.instagram.com/acmewealth/", description: "" },
    { type: "organic", title: "Acme news", url: "https://news.sg/acme", description: "" },
  ] }] }],
};

const seen: string[] = [];
let env: Record<string, string> = {};
let serp: "ok" | "down" = "ok";
let jevMode: "up" | "down" = "up";
let site: { choice: string; probabilities: Record<string, number> } = { choice: "r1", probabilities: { r1: 0.9 } };
let openai: "ok" | "down" | "why-down" = "ok";
let apify: "ok" | "down" | "timeout" | "missing" | "empty" | "private" = "ok";
const apifyRuns: { actor: string; input: Record<string, unknown> }[] = [];
const IG_POSTS = Array.from({ length: 40 }, (_, k) => ({
  shortCode: `C${k}`, type: k % 3 ? "Image" : "Video", productType: k % 3 ? "feed" : "clips", caption: `Post ${k}`, ownerUsername: "acmewealth",
  timestamp: new Date(Date.UTC(2026, 9, 19) - k * 86_400_000).toISOString(), likesCount: 100 + k, commentsCount: 3, videoPlayCount: k % 3 ? null : 5000 + k,
}));
const compare: Record<string, number> = { SleekFlow: 0.9, "respond.io": 0.7, Pipedrive: 0.65, Spotio: 0.95, Sunsama: 0.3 };

beforeAll(async () => {
  vi.stubGlobal("Deno", {
    serve: (fn: (r: Request) => Promise<Response>) => (db.handler = fn),
    env: { get: (k: string) => env[k] },
    // inside.sg points into a network; invented.sg doesn't exist
    resolveDns: async (host: string, type: string) => {
      if (host === "invented.sg") throw new Error("NXDOMAIN");
      return type === "AAAA" ? [] : host === "inside.sg" ? ["10.0.0.7"] : ["151.101.1.69"];
    },
  });
  vi.stubGlobal("fetch", async (u: URL | string, init?: RequestInit) => {
    const url = String(u);
    seen.push(url);
    if (url.startsWith("https://api.dataforseo.com/")) return serp === "down" ? new Response("no", { status: 500 }) : Response.json(SERP);
    if (url.startsWith("https://api.typesafe.ai/")) {
      if (jevMode === "down") return new Response("busy", { status: 503 });
      const req = JSON.parse(String(init?.body));
      if (req.questions.site) return Response.json({ answers: { site: { type: "choice", ...site } } });
      return Response.json({ answers: { compare: { type: "noul", noul: compare[req.state.candidate.name] ?? 0.1 } } });
    }
    if (url.startsWith("https://api.openai.com/")) {
      const req = JSON.parse(String(init?.body));
      const why = req.response_format.json_schema.name === "competitor_whys";
      if (openai === "down" || (why && openai === "why-down")) return new Response("down", { status: 500 });
      const content = why
        ? { whys: req.messages[1].content.split("\n").filter((l: string) => l.startsWith("- key ")).map((l: string) => ({ key: l.slice(6, l.indexOf(":")), why: "Sales teams weigh both for the same job." })) }
        : { competitors: [{ name: "Spotio", site: "spotio.com" }, { name: "Made Up", site: "invented.sg" }] };
      return Response.json({ model: "m", choices: [{ message: { content: JSON.stringify(content) } }] });
    }
    if (url.startsWith("https://api.apify.com/")) {
      const input = JSON.parse(String(init?.body));
      apifyRuns.push({ actor: url.split("/acts/")[1].split("/")[0], input });
      if (apify === "down") return new Response("actor failed", { status: 500 });
      if (apify === "timeout") throw new DOMException("The signal has been aborted", "TimeoutError");
      if (url.includes("facebook-ads-scraper")) return Response.json(apify === "missing" ? [{ url: input.startUrls[0].url, error: "Page not found" }] : apify === "empty" ? [] : FB_ADS);
      if (url.includes("instagram-profile-scraper")) {
        return Response.json(apify === "missing" ? [] : [{ username: input.usernames[0], fullName: "Acme Wealth", followersCount: 4200, postsCount: 90, private: apify === "private" }]);
      }
      if (url.includes("instagram-post-scraper")) return Response.json(IG_POSTS.slice(0, input.resultsLimit));
      return Response.json([]); // TikTok with no videos
    }
    if (url === "https://down.sg/") throw new TypeError("error sending request");
    if (url === "https://gone.sg/") return new Response("missing", { status: 404 });
    const host = new URL(url).hostname.replace(/^www\./, "").split(".")[0];
    return new Response(PAGE(host[0].toUpperCase() + host.slice(1)), { headers: { "content-type": "text/html" } });
  });
  await import("./index.ts");
}, 30_000);
beforeEach(() => {
  seen.length = 0;
  db.spent.length = 0;
  db.refunded.length = 0;
  db.limit = false;
  db.refuse = [];
  apify = "ok";
  apifyRuns.length = 0;
  env = { NORTH_STAR_USERS: `someone-else,${LEO}`, DATAFORSEO_LOGIN: "l", DATAFORSEO_PASSWORD: "p", OPENAI_API_KEY: "k", TYPESAFE_API_KEY: "t", APIFY_API_KEY: "a" };
  serp = "ok";
  jevMode = "up";
  openai = "ok";
  site = { choice: "r1", probabilities: { r1: 0.9 } };
});

const call = async (body: unknown, uid = LEO) => {
  const r = await db.handler!(new Request("http://x/competitors", { method: "POST", headers: uid ? { Authorization: `Bearer ${uid}` } : {}, body: JSON.stringify(body) }));
  return { status: r.status, body: await r.json() };
};
const brand = { name: "ActivityTracker", site: "activity-tracker.io", sells: "A daily activity tracker", serves: "Self-employed salespeople", topics: ["sales habits"] };
const candidates = ["SleekFlow", "respond.io", "Pipedrive", "Sunsama"].map((name, k) => ({ key: `c${k}`, name, about: `${name} sells to sales teams` }));

describe("competitors: the gate", () => {
  it("answers 401 without a sign-in and 403 for anyone not listed, before any counter or provider", async () => {
    expect((await call({ mode: "read", input: "acme.sg" }, "")).status).toBe(401);
    for (const body of [{ mode: "read", input: "Acme" }, { mode: "suggest", brand, candidates }]) {
      const r = await call(body, "not-listed");
      expect(r).toEqual({ status: 403, body: { code: "not_enabled", error: "This isn't switched on for your account yet." } });
    }
    env.NORTH_STAR_USERS = "";
    expect((await call({ mode: "read", input: "acme.sg" })).status).toBe(403);
    expect(db.spent).toEqual([]);
    expect(seen).toEqual([]);
  });

  it("refuses links, handles, empty input and unknown modes before counting", async () => {
    for (const input of ["https://www.instagram.com/acme/", "@acme", "", "javascript:alert(1)"]) {
      expect((await call({ mode: "read", input })).body.code, input).toBe("bad_request");
    }
    expect((await call({ mode: "nope" })).status).toBe(400);
    expect((await call({ mode: "suggest", brand: { name: "X" }, candidates })).status).toBe(400);
    expect(db.spent).toEqual([]);
  });

  it("shows the server's message when the daily cap is used up", async () => {
    db.limit = true;
    const r = await call({ mode: "read", input: "acme.sg" });
    expect(r.status).toBe(429);
    expect(r.body.code).toBe("daily_limit");
    expect(seen).toEqual([]);
  });
});

describe("competitors read", () => {
  it("reads a site for its name, https logo link and handles", async () => {
    const r = await call({ mode: "read", input: "https://www.acme.sg/en/" });
    expect(r).toEqual({ status: 200, body: { found: { name: "Acme", site: "acme.sg", logo: "https://cdn.acme.sg/t.png", handles: { instagram: "acme", facebook: "AcmeSG" } } } });
    expect(db.spent).toEqual(["competitor-read"]);
    expect(db.refunded).toEqual([]);
    expect(seen.some((u) => u.includes("dataforseo"))).toBe(false);
  });

  it("gives the use back when the site never answered, and keeps it when it isn't there", async () => {
    expect(await call({ mode: "read", input: "down.sg" })).toEqual({ status: 502, body: { code: "failed", error: "Couldn't read their site. Try again in a few minutes." } });
    expect(db.refunded).toEqual(["competitor-read"]);
    db.refunded.length = 0;
    expect((await call({ mode: "read", input: "gone.sg" })).body).toEqual({ notFound: true });
    expect((await call({ mode: "read", input: "inside.sg" })).body).toEqual({ notFound: true });
    expect(seen.some((u) => u.includes("inside.sg"))).toBe(false);
    expect(db.refunded).toEqual([]);
  });

  it("finds a name's website through one search and Jev's pick", async () => {
    const r = await call({ mode: "read", input: "Acme Wealth" });
    expect(r.body).toEqual({ found: { name: "Acme Wealth", site: "acme.sg", logo: "https://cdn.acme.sg/t.png", handles: { instagram: "acme", facebook: "AcmeSG" } } });
    expect(seen.filter((u) => u.includes("dataforseo"))).toEqual(["https://api.dataforseo.com/v3/serp/google/organic/live/regular"]);
    expect(db.spent).toEqual(["competitor-read"]);
  });

  it("takes a social result as handles, with no site", async () => {
    site = { choice: "r2", probabilities: { r2: 0.8 } };
    expect((await call({ mode: "read", input: "Acme Wealth" })).body).toEqual({ found: { name: "Acme Wealth", site: null, logo: null, handles: { instagram: "acmewealth" } } });
  });

  it("asks Which one between 0.4 and 0.6, and says not found below or without Jev, keeping the use", async () => {
    site = { choice: "r1", probabilities: { r1: 0.5, r3: 0.3, r2: 0.2 } };
    expect((await call({ mode: "read", input: "Acme" })).body).toEqual({
      choices: [
        { name: "Acme", site: "https://acme.sg/", title: "Acme Wealth" },
        { name: "Acme", site: "https://news.sg/acme", title: "Acme news" },
        { name: "Acme", site: "https://www.instagram.com/acmewealth/", title: "Acme on Instagram" },
      ],
    });
    site = { choice: "none", probabilities: { none: 0.8, r1: 0.1 } };
    expect((await call({ mode: "read", input: "Acme" })).body).toEqual({ notFound: true });
    jevMode = "down";
    expect((await call({ mode: "read", input: "Acme" })).body).toEqual({ notFound: true });
    expect(db.refunded).toEqual([]);
    // never a made-up site: no page was read without a pick
    expect(seen.filter((u) => !/dataforseo|typesafe/.test(u))).toEqual([]);
  });

  it("gives the use back when DataForSEO fails", async () => {
    serp = "down";
    expect((await call({ mode: "read", input: "Acme" })).status).toBe(502);
    expect(db.spent).toEqual(["competitor-read"]);
    expect(db.refunded).toEqual(["competitor-read"]);
  });
});

describe("competitors suggest", () => {
  it("returns Jev's best with why lines, drops an invented site and the excluded names", async () => {
    const r = await call({ mode: "suggest", brand, candidates, exclude: ["sleekflow"] });
    expect(r.status).toBe(200);
    expect(r.body.suggestions.map((s: { name: string }) => s.name)).toEqual(["Spotio", "respond.io", "Pipedrive"]);
    expect(r.body.suggestions[0]).toEqual({ name: "Spotio", site: "spotio.com", why: "Sales teams weigh both for the same job.", score: 0.95 });
    expect(r.body.suggestions[1].site).toBeNull();
    expect(seen).toContain("https://spotio.com/");
    expect(seen.filter((u) => u.includes("typesafe"))).toHaveLength(4); // 3 kept candidates + Spotio; never SleekFlow or the invented site
    expect(db.spent).toEqual(["competitor-suggest"]);
    expect(db.refunded).toEqual([]);
  });

  it("gives the use back with the note when Jev is down", async () => {
    jevMode = "down";
    expect((await call({ mode: "suggest", brand, candidates })).body).toEqual({ suggestions: [], note: "Suggestions are unavailable right now. Add one you know." });
    expect(db.refunded).toEqual(["competitor-suggest"]);
  });

  it("gives the use back when OpenAI fails, on either call", async () => {
    openai = "down";
    expect((await call({ mode: "suggest", brand, candidates })).status).toBe(502);
    openai = "why-down";
    expect((await call({ mode: "suggest", brand, candidates })).status).toBe(502);
    expect(db.refunded).toEqual(["competitor-suggest", "competitor-suggest"]);
  });

  it("keeps the use when nothing clears the bar", async () => {
    const r = await call({ mode: "suggest", brand, candidates: candidates.filter((c) => c.name === "Sunsama") , exclude: ["spotio"] });
    expect(r.body).toEqual({ suggestions: [] });
    expect(db.refunded).toEqual([]);
  });
});

const adsBody = { mode: "ads", competitorId: "sleekflow-ab12", name: "SleekFlow", fbPageId: "362293550309745", facebook: "sleekflow.io", country: "SG" };
const postsBody = { mode: "posts", platform: "instagram", handle: "@AcmeWealth" };
const ADS_FAILED = "Couldn't read Meta's ad library right now. Try again in a few minutes.";

describe("competitors ads and posts: the gate and the counters", () => {
  it("answers 403 for anyone not listed, before any counter or Apify", async () => {
    for (const body of [adsBody, postsBody]) expect((await call(body, "not-listed")).body.code).toBe("not_enabled");
    expect(db.spent).toEqual([]);
    expect(apifyRuns).toEqual([]);
  });

  it("refuses a body it can't use before counting", async () => {
    expect((await call({ ...adsBody, fbPageId: null, facebook: null })).body).toEqual({ code: "bad_request", error: "Add their Facebook page first." });
    expect((await call({ ...postsBody, handle: "https://www.instagram.com/reel/abc/" })).body.code).toBe("bad_request");
    expect((await call({ ...postsBody, platform: "youtube" })).status).toBe(400);
    expect(db.spent).toEqual([]);
  });

  it("counts the user first, then everyone; a spent user cap never touches everyone's", async () => {
    await call(adsBody);
    await call(postsBody);
    expect(db.spent).toEqual(["competitor-ads", "competitor-ads-global", "competitor-posts", "competitor-posts-global"]);
    db.spent.length = 0;
    db.refuse = ["competitor-ads"];
    const r = await call(adsBody);
    expect(r.status).toBe(429);
    expect(r.body.code).toBe("daily_limit");
    expect(db.spent).toEqual(["competitor-ads"]);
    expect(apifyRuns).toHaveLength(3); // the ads run, then Instagram profile + posts: none for the refused call
  });

  it("answers global_limit with the paused line when everyone's counter is spent, and gives the user's use back", async () => {
    db.refuse = ["competitor-ads-global", "competitor-posts-global"];
    expect(await call(adsBody)).toEqual({ status: 429, body: { code: "global_limit", error: "Ad checks are paused for today. They resume at 8am Singapore time." } });
    expect(await call(postsBody)).toEqual({ status: 429, body: { code: "global_limit", error: "Account checks are paused for today. They resume at 8am Singapore time." } });
    expect(db.refunded).toEqual(["competitor-ads", "competitor-posts"]);
    expect(apifyRuns).toEqual([]);
  });
});

describe("competitors ads", () => {
  it("reads the page's Singapore ads with no add-ons and answers the shaped list", async () => {
    const r = await call(adsBody);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ competitorId: "sleekflow-ab12", pageId: "362293550309745", pageName: "Muncly" });
    expect(r.body.ads).toHaveLength(10);
    expect(Date.parse(r.body.checkedAt)).toBeGreaterThan(0);
    expect(apifyRuns).toEqual([{ actor: "apify~facebook-ads-scraper", input: expect.objectContaining({ resultsLimit: 30, activeStatus: "", sorting: "relevancy_monthly_grouped" }) }]);
    expect((apifyRuns[0].input.startUrls as { url: string }[])[0].url).toContain("country=SG&view_all_page_id=362293550309745");
    expect(db.refunded).toEqual([]);
  });

  it("starts from the Facebook page when there is no page id", async () => {
    await call({ ...adsBody, fbPageId: null, country: "ALL" });
    expect((apifyRuns[0].input.startUrls as { url: string }[])[0].url).toBe("https://www.facebook.com/sleekflow.io");
  });

  it("gives both uses back when Apify fails or times out, and keeps them for no ads or a missing page", async () => {
    for (const mode of ["down", "timeout"] as const) {
      apify = mode;
      expect(await call(adsBody)).toEqual({ status: 502, body: { code: "failed", error: ADS_FAILED } });
    }
    expect(db.refunded).toEqual(["competitor-ads", "competitor-ads-global", "competitor-ads", "competitor-ads-global"]);
    db.refunded.length = 0;
    apify = "empty";
    expect((await call(adsBody)).body).toMatchObject({ pageId: "362293550309745", pageName: null, ads: [] });
    apify = "missing";
    expect(await call({ ...adsBody, fbPageId: null })).toEqual({ status: 422, body: { code: "not_found", error: "That page wasn't found on Meta. Check the link." } });
    expect(db.refunded).toEqual([]);
  });
});

describe("competitors posts", () => {
  it("reads 33 and keeps the newest 30 in Following's shape", async () => {
    const r = await call(postsBody);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ platform: "instagram", handle: "acmewealth", name: "Acme Wealth", followers: 4200 });
    expect(r.body.posts).toHaveLength(30);
    expect(r.body.posts[0].id).toBe("C0");
    expect(apifyRuns.find((a) => a.actor === "apify~instagram-post-scraper")?.input).toMatchObject({ username: ["acmewealth"], resultsLimit: 33 });
    expect(db.refunded).toEqual([]);
  });

  it("keeps the use for a private or missing account, with the rewritten private line", async () => {
    apify = "private";
    expect(await call(postsBody)).toEqual({ status: 422, body: { code: "private", error: "@acmewealth is private, so we can't read its posts." } });
    apify = "missing";
    const r = await call(postsBody);
    expect(r).toEqual({ status: 422, body: { code: "not_found", error: "We couldn't find a public Instagram account called @acmewealth. Check the spelling." } });
    expect((await call({ mode: "posts", platform: "tiktok", handle: "acme" })).body.code).toBe("not_found");
    expect(db.refunded).toEqual([]);
  });

  it("gives both uses back when Apify fails", async () => {
    apify = "down";
    expect(await call(postsBody)).toEqual({ status: 502, body: { code: "failed", error: "Couldn't read that account right now. Try again in a few minutes." } });
    expect(db.refunded).toEqual(["competitor-posts", "competitor-posts-global"]);
  });
});
