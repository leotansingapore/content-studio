import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { parseFilm, rhythmIssues, sceneStarts, type Film } from "./filmSpec";
import type * as FilmModule from "./film";
import LIVE_FILM from "./fixtures/live-p7a-film.json";

// The launch film's three modes through video-assist's handler: the gate, the cap, the write and its one fixing pass,
// Jev's picks, the MAS lines. OpenAI's and Jev's replies are stubbed; the reply shapes copy OpenAI's Structured Outputs
// page (platform.openai.com/docs/guides/structured-outputs: message.content holds the JSON, message.refusal a refusal).
const UID = "6d80f027-3395-480c-86a1-8827d3d6cce3";
const LEO = "13b28b1d-2ecb-40be-b3a9-aefc90366f9b";

const db = vi.hoisted(() => {
  // cs_ai_usage in memory, keyed user|feature|day: the consume RPC, one row read and the conditional update
  const rows = new Map<string, number>();
  const today = () => new Date().toISOString().slice(0, 10);
  const key = (q: Record<string, unknown>) => `${q.user_id}|${q.feature}|${q.day}`;
  const admin = {
    auth: { getUser: async (jwt: string) => ({ data: { user: jwt ? { id: jwt } : null } }) },
    rpc: async (_fn: string, a: Record<string, unknown>) => {
      const k = `${a.p_user}|${a.p_feature}|${today()}`;
      const n = rows.get(k) ?? 0;
      if (n >= Number(a.p_limit ?? 10)) return { data: null, error: null };
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
  return { admin, rows, today, handler: null as null | ((r: Request) => Promise<Response>) };
});
vi.mock("https://esm.sh/@supabase/supabase-js@2", () => ({ createClient: () => db.admin }));

const OPENAI = "https://api.openai.com/v1/chat/completions";
const JEV = "https://api.typesafe.ai/v1/systemone";
const env: Record<string, string> = { SUPABASE_URL: "http://db", SUPABASE_SERVICE_ROLE_KEY: "k", OPENAI_API_KEY: "k", NORTH_STAR_USERS: LEO, TYPESAFE_API_KEY: "t" };
// every provider call, in order, with what it was sent
const calls: { url: string; body: Record<string, unknown> }[] = [];
// OpenAI's replies in turn (an object is the JSON the model wrote; a number a failed status; "throw" no connection)
let replies: (Record<string, unknown> | number | "throw")[] = [];
// Jev's answers by question id
let jev: Record<string, unknown> = {};
let FILM_BUSINESS_LINES: typeof FilmModule.FILM_BUSINESS_LINES, FILM_MAS_LINES: typeof FilmModule.FILM_MAS_LINES, RECOMMEND_QUESTION: string;
let filmSystem: typeof FilmModule.filmSystem;

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.stubGlobal("Deno", { serve: (fn: (r: Request) => Promise<Response>) => (db.handler = fn), env: { get: (k: string) => env[k] } });
  vi.stubGlobal("fetch", async (u: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}"));
    calls.push({ url: String(u), body });
    if (String(u) === JEV) return Response.json({ answers: Object.fromEntries(Object.keys(body.questions).filter((q) => jev[q]).map((q) => [q, jev[q]])) });
    const next = replies.shift() ?? 500;
    if (next === "throw") throw new Error("The operation timed out.");
    if (typeof next === "number") return new Response('{"error":"busy"}', { status: next });
    const message = typeof next.refusal === "string" ? { content: null, refusal: next.refusal } : { content: JSON.stringify(next) };
    return Response.json({ model: body.model === "gpt-4.1" ? "gpt-4.1" : "gpt-6-luna", usage: { prompt_tokens: 5200, completion_tokens: 2100 }, choices: [{ message }] });
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  await import("./index.ts");
  // film.ts reads Deno's env as it loads (openaiChat), so it is imported once Deno is stubbed
  ({ FILM_BUSINESS_LINES, FILM_MAS_LINES, RECOMMEND_QUESTION, filmSystem } = await import("./film"));
}, 30_000);
afterAll(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
let logged: string[] = [];
beforeEach(() => {
  db.rows.clear();
  calls.length = 0;
  replies = [];
  jev = {};
  logged = [];
  vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => void logged.push(a.join(" ")));
});

const SCREENS = [
  { key: "cimg-mh2k9x01ab", alt: "The week view with three planned tasks", video: false },
  { key: "cimg-mh2k9x02cd", alt: "The AI coach chat", video: false },
];
const KIT = { color: "#1A2B3C", palette: [{ name: "navy", hex: "#0B1F4D" }], font: true };
const BRAND = { name: "ActivityTracker", oneLiner: "A planner for sales teams", audience: "sales advisers", facts: "", memory: "", speaker: "business" };
const SETUP = { product: "Activity Tracker's AI coach", remember: "Your week, planned in one tap", length: 30, shape: "9x16", energy: "fast", voice: false };
const PERSON = { ...BRAND, name: "Leo Tan", speaker: "person" };

// what the model writes, in the strict schema's shape (every field present, null where unused)
const hook = { id: "hook", kind: "type", beats: 8, cut: "hard", words: ["Your week.", "Planned.", "In one tap."], key: 2 };
const app = {
  id: "app",
  kind: "screen",
  beats: 16,
  cut: "flood",
  media: "cimg-mh2k9x01ab",
  frame: "phone",
  camera: [{ beat: 0, to: "whole" }, { beat: 4, to: [0.1, 0.55, 0.8, 0.2] }, { beat: 10, to: "whole" }],
  tap: [{ beat: 3, at: [0.5, 0.62] }],
  highlight: { beat: 5, box: [0.1, 0.55, 0.8, 0.2], label: "AI coach" },
};
const burst = {
  id: "burst",
  kind: "montage",
  beats: 8,
  cut: null,
  anchor: "word",
  shots: ["Calls", "Notes", "Tasks", "Plans", "Wins", "Done"].map((word, i) => ({ media: i % 2 ? null : "cimg-mh2k9x02cd", word })),
};
const cards = {
  id: "features",
  kind: "cards",
  beats: 12,
  cut: null,
  cards: [
    { icon: "clock", title: "Plan your week", line: "Your coach lays out the week from your goals." },
    { icon: "check", title: "Tick it off", line: "One tap marks it done." },
    { icon: "chart", title: "See your pace", line: "A chart of how the week went." },
  ],
};
const proof = { id: "proof", kind: "number", beats: 6, cut: null, value: 12, suffix: " hrs", label: "saved a month" };
const end = { id: "end", kind: "logo", beats: 10, cut: null, line: "Your week, planned.", cta: "activitytracker.io" };
const FILM_BODY = { font: "brand", ground: "ink", accent: "palette:navy", drop: "burst", scenes: [hook, app, burst, cards, proof, end], voice: { lines: [{ scene: "hook", line: "Your week, planned in one tap." }] } };
const DIRECTIONS = {
  refuse: null,
  directions: [
    { name: "Demo", line: "Your app does it, tap by tap.", spine: "screen", ground: "ink", accent: "brand", hero: app },
    { name: "Claim", line: "Three words slam in, then the app.", spine: "type", ground: "brand", accent: "palette:navy", hero: hook },
    { name: "Cards", line: "Each feature lands as a card, then the proof.", spine: "cards", ground: "paper", accent: "brand", hero: cards },
  ],
};
const DIRECTION = { name: "Demo", line: "Your app does it, tap by tap.", spine: "screen", ground: "ink", accent: "brand", hero: app };

const post = (uid: string, body: Record<string, unknown>) =>
  db.handler!(new Request("http://x/video-assist", { method: "POST", headers: { Authorization: `Bearer ${uid}` }, body: JSON.stringify(body) }));
const directions = (uid = LEO, more: Record<string, unknown> = {}) => post(uid, { mode: "film-directions", setup: SETUP, brand: BRAND, kit: KIT, screens: SCREENS, ...more });
const film = (uid = LEO, more: Record<string, unknown> = {}) =>
  post(uid, { mode: "film", setup: SETUP, brand: BRAND, kit: KIT, screens: SCREENS, direction: DIRECTION, product: "devtool", style: 0, ...more });
const used = (cap: string, uid = LEO) => db.rows.get(`${uid}|${cap}|${db.today()}`) ?? 0;
const openai = () => calls.filter((c) => c.url === OPENAI);
const jevAsked = () => calls.filter((c) => c.url === JEV);

// the film the server answers for FILM_BODY: the request's tempo, product, style and voice set in code
async function madeFilm(more: Record<string, unknown> = {}): Promise<Film> {
  replies = [{ refuse: null, film: FILM_BODY }];
  const res = await film(LEO, more);
  expect(res.status).toBe(200);
  return (await res.json()).film;
}

describe("the gate and the request, before anything is counted", () => {
  it("answers 403 not_enabled to a uid off the list for each mode, and counts and calls nothing", async () => {
    for (const mode of ["film-directions", "film", "film-edit"]) {
      const res = await post(UID, { mode, setup: SETUP, brand: BRAND, kit: KIT, screens: SCREENS, direction: DIRECTION, note: "Shorter" });
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ code: "not_enabled", error: "This isn't switched on for your account yet." });
    }
    expect(db.rows.size).toBe(0);
    expect(calls).toEqual([]);
  });

  it("refuses a request it can't write with 400 bad_request", async () => {
    const res = [
      await directions(LEO, { setup: { ...SETUP, length: 45 } }),
      await directions(LEO, { setup: { ...SETUP, product: "", remember: "" } }),
      await film(LEO, { direction: null }),
      await post(LEO, { mode: "film-edit", film: { scenes: [] }, note: "Shorter", kit: KIT, screens: SCREENS }),
    ];
    expect(res.map((r) => r.status)).toEqual([400, 400, 400, 400]);
    expect(await Promise.all(res.map((r) => r.json()))).toEqual([
      { code: "bad_request", error: "Pick a length, a shape and the energy." },
      { code: "bad_request", error: "Say what you're launching first." },
      { code: "bad_request", error: "Pick a direction first." },
      { code: "bad_request", error: "That film can't be read. Open it again." },
    ]);
    expect(db.rows.size).toBe(0);
    expect(calls).toEqual([]);
  });
});

describe("film-directions", () => {
  it("writes three directions for one launch-film use, through a strict schema on the app's model, and logs the tokens", async () => {
    replies = [DIRECTIONS];
    jev = { product: { type: "choice", choice: "data", probabilities: { data: 0.6 } }, recommended: { type: "choice", choice: "d2", probabilities: { d1: 0.2, d2: 0.55, d3: 0.25 } } };
    const res = await directions();
    expect(res.status).toBe(200);
    const out = await res.json();
    expect(out.directions.map((d: { name: string; spine: string }) => `${d.name} ${d.spine}`)).toEqual(["Demo screen", "Claim type", "Cards cards"]);
    expect(out.directions[1].hero).toEqual({ id: "hook", beats: 8, cut: "hard", kind: "type", words: ["Your week.", "Planned.", "In one tap."], key: 2 });
    expect([out.recommended, out.product]).toEqual([1, "data"]);
    expect(used("launch-film")).toBe(1);
    const sent = openai()[0].body as { model: string; response_format: { type: string; json_schema: { strict: boolean } }; max_completion_tokens: number };
    expect([sent.model, sent.response_format.type, sent.response_format.json_schema.strict]).toEqual(["gpt-6-luna", "json_schema", true]);
    expect(logged.some((l) => l.startsWith("video-assist film-directions gpt-6-luna 5200 in 2100 out"))).toBe(true);
  });

  it("asks Jev the spec's Recommended question over the three lines, and tags none under 0.4 or without an answer", async () => {
    replies = [DIRECTIONS];
    jev = { recommended: { type: "choice", choice: "d1", probabilities: { d1: 0.39, d2: 0.31, d3: 0.3 } } };
    const res = await directions();
    const out = await res.json();
    expect([out.recommended, out.product]).toEqual([null, "devtool"]);
    const q = jevAsked()[0].body.questions as Record<string, { instructions: string; criteria: Record<string, string> }>;
    expect(q.recommended.instructions).toBe(RECOMMEND_QUESTION);
    expect(q.recommended.criteria).toEqual({ d1: "Demo: Your app does it, tap by tap.", d2: "Claim: Three words slam in, then the app.", d3: "Cards: Each feature lands as a card, then the proof." });
    expect(Object.keys(q.product.criteria)).toHaveLength(12);
  });

  it("still writes with no screens: no screen kind in the schema, and no screen spine", async () => {
    replies = [
      {
        refuse: null,
        directions: [
          { ...DIRECTIONS.directions[1], name: "Claim" },
          { ...DIRECTIONS.directions[2], name: "Cards" },
          { ...DIRECTIONS.directions[1], name: "Loud", hero: { ...hook, words: ["Planned."] } },
        ],
      },
    ];
    const res = await directions(LEO, { screens: [] });
    expect(res.status).toBe(200);
    expect((await res.json()).directions).toHaveLength(3);
    const schema = JSON.stringify(openai()[0].body.response_format);
    expect(schema).not.toContain('"screen"');
    expect(openai()[0].body.messages).toMatchObject([{}, { content: expect.stringContaining('"screens":[]') }]);
  });

  it("refuses a direction led by a screen when there are none, after its one fixing pass", async () => {
    const noScreen = { ...app, media: null };
    const reply = { refuse: null, directions: [{ ...DIRECTIONS.directions[0], hero: noScreen }, DIRECTIONS.directions[1], DIRECTIONS.directions[2]] };
    replies = [reply, reply];
    expect((await directions(LEO, { screens: [] })).status).toBe(422);
    expect((openai()[1].body.messages as { content: string }[])[3].content).toContain("There are no app screens, so no direction can be led by one.");
  });

  it("carries the MAS lines for a person's brand and asks Jev the MAS question; a business gets its own lines and no question", async () => {
    replies = [DIRECTIONS];
    jev = { mas: { type: "noul", noul: 0.8 } };
    const person = await (await directions(LEO, { brand: PERSON })).json();
    const system = (openai()[0].body.messages as { content: string }[])[0].content;
    for (const l of FILM_MAS_LINES) expect(system).toContain(l);
    expect(person.flags).toEqual({ mas: true, compliance: [] });
    expect(jevAsked().some((c) => "mas" in (c.body.questions as object))).toBe(true);

    calls.length = 0;
    replies = [DIRECTIONS];
    const business = await (await directions()).json();
    const own = (openai()[0].body.messages as { content: string }[])[0].content;
    for (const l of FILM_BUSINESS_LINES) expect(own).toContain(l);
    expect(own).not.toContain(FILM_MAS_LINES[0]);
    expect(business.flags).toEqual({ mas: null, compliance: [] });
    expect(jevAsked().some((c) => "mas" in (c.body.questions as object))).toBe(false);
  });

  it("asks once more with what was wrong, then answers 422 unusable and keeps the use", async () => {
    const twoScreens = { refuse: null, directions: [DIRECTIONS.directions[0], DIRECTIONS.directions[0], DIRECTIONS.directions[2]] };
    replies = [twoScreens, twoScreens];
    const res = await directions();
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ code: "unusable", error: "That film didn't come out right. Try again." });
    expect(openai()).toHaveLength(2);
    expect((openai()[1].body.messages as { content: string }[])[3].content).toContain("lead each direction with a different spine");
    expect(used("launch-film")).toBe(1);
  });
});

describe("film", () => {
  it("writes the film for one use, with the tempo, product, style and voice set in code", async () => {
    const f = await madeFilm();
    expect([f.v, f.kind, f.bpm, f.energy, f.product, f.style, f.voice.on]).toEqual([1, "launch", 120, "fast", "devtool", 0, false]);
    expect(f.voice.lines).toEqual({ hook: "Your week, planned in one tap." });
    expect(f.scenes.reduce((n, s) => n + s.beats, 0)).toBe(60);
    expect(used("launch-film")).toBe(1);
    expect(openai()).toHaveLength(1);
  });

  it("asks for no screen scene when there are no screens, and writes the film from words", async () => {
    const words = { ...burst, shots: burst.shots.map((x) => ({ ...x, media: null })) };
    replies = [{ refuse: null, film: { ...FILM_BODY, scenes: [hook, words, cards, proof, end] } }];
    const res = await film(LEO, { screens: [], direction: DIRECTIONS.directions[1] });
    expect(res.status).toBe(200);
    expect(JSON.stringify(openai()[0].body.response_format)).not.toContain('"screen"');
  });

  it("answers the film with no issues when its rhythm is right", async () => {
    replies = [{ refuse: null, film: FILM_BODY }];
    expect(await (await film()).json()).toMatchObject({ issues: [], flags: { mas: null, compliance: [] } });
  });

  it("asks once more when the spec fails parseFilm, and answers the fixed film for the same one use", async () => {
    replies = [{ refuse: null, film: { ...FILM_BODY, scenes: [{ ...hook, kind: "spiral" }, app, burst, cards, proof, end] } }, { refuse: null, film: FILM_BODY }];
    const res = await film();
    expect(res.status).toBe(200);
    expect(openai()).toHaveLength(2);
    const fix = openai()[1].body.messages as { role: string; content: string }[];
    expect(fix.map((m) => m.role)).toEqual(["system", "user", "assistant", "user"]);
    expect(fix[3].content).toBe('Fix these and send the whole answer again:\n- The scene "hook" has a kind we can\'t draw ("spiral").');
    expect(used("launch-film")).toBe(1);
  });

  it("asks once more when the rhythm is off, and opens the film with the issues still found", async () => {
    const flat = { ...FILM_BODY, scenes: [hook, { ...app, camera: [], tap: [], highlight: null }, burst, cards, proof, end] };
    replies = [{ refuse: null, film: flat }, { refuse: null, film: flat }];
    const res = await film();
    expect(res.status).toBe(200);
    expect((await res.json()).issues).toEqual(["Nothing happens from 0:04 to 0:12."]);
    expect((openai()[1].body.messages as { content: string }[])[3].content).toContain("- Nothing happens from 0:04 to 0:12.");
    expect(used("launch-film")).toBe(1);
  });

  it("answers 422 unusable after the second failure, and keeps the use", async () => {
    const bad = { refuse: null, film: { ...FILM_BODY, scenes: [hook, hook, burst, cards, proof, end] } };
    replies = [bad, bad];
    const res = await film();
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ code: "unusable", error: "That film didn't come out right. Try again." });
    expect(openai()).toHaveLength(2);
    expect(used("launch-film")).toBe(1);
  });

  it("gives the use back when OpenAI never answered, and keeps it when the fix never answered", async () => {
    for (const r of [500, "throw"] as const) {
      replies = [r];
      const res = await film();
      expect(res.status).toBe(502);
      expect(await res.json()).toEqual({ code: "failed", error: "Couldn't write the film. Try again in a minute." });
      expect(used("launch-film")).toBe(0);
    }
    replies = [{ refuse: null, film: { ...FILM_BODY, drop: "nowhere" } }, 500];
    expect((await film()).status).toBe(422);
    expect(used("launch-film")).toBe(1);
  });

  it("passes a refusal through as 422 refused with its reason, and keeps the use", async () => {
    // a refusal in message.refusal has no content, so openaiChat asks its fallback model once, which refuses too
    for (const reply of [{ refuse: "It promises a return.", film: null }, { refusal: "I can't help with that." }]) {
      db.rows.clear();
      replies = [reply, reply];
      const res = await film();
      expect(res.status).toBe(422);
      expect(await res.json()).toEqual({ code: "refused", error: "That can't be made into a film that's safe to post. Try other words.", reason: reply.refuse ?? reply.refusal });
      expect(used("launch-film")).toBe(1);
    }
  });

  it("writes on gpt-4.1 when asked to compare", async () => {
    replies = [{ refuse: null, film: FILM_BODY }];
    expect((await film(LEO, { model: "gpt-4.1" })).status).toBe(200);
    expect(openai().map((c) => c.body.model)).toEqual(["gpt-4.1"]);
    expect(logged.some((l) => l.startsWith("video-assist film gpt-4.1 5200 in 2100 out"))).toBe(true);
  });

  it("flags a line scanCompliance finds, and blocks nothing", async () => {
    replies = [{ refuse: null, film: { ...FILM_BODY, scenes: [{ ...hook, words: ["Act now.", "Planned.", "In one tap."] }, app, burst, cards, proof, end] } }];
    const res = await film();
    expect(res.status).toBe(200);
    expect((await res.json()).flags.compliance.map((f: { ruleId: string }) => f.ruleId)).toEqual(["act-now"]);
  });
});

describe("film-edit", () => {
  const edit = (f: Film, more: Record<string, unknown>) =>
    post(LEO, { mode: "film-edit", film: f, scene: "features", target: "features.card2.title", label: "Card 2 title", t: 4.2, x: 0.5, y: 0.6, note: "Make this shorter", brand: BRAND, kit: KIT, screens: SCREENS, ...more });

  it("changes only the pointed scene for one film-edit use: every other scene is the same JSON", async () => {
    const before = await madeFilm();
    db.rows.clear();
    const shorter = { ...cards, cards: [cards.cards[0], { ...cards.cards[1], title: "Done" }, cards.cards[2]] };
    replies = [{ refuse: null, reply: "Card 2 now reads Done.", scene: shorter, film: null }];
    const res = await edit(before, {});
    expect(res.status).toBe(200);
    const out = await res.json();
    expect(out.reply).toBe("Card 2 now reads Done.");
    expect(out.scene.cards[1].title).toBe("Done");
    expect(out.film.scenes.filter((s: { id: string }) => s.id !== "features").map((s: unknown) => JSON.stringify(s))).toEqual(
      before.scenes.filter((s) => s.id !== "features").map((s) => JSON.stringify(s)),
    );
    expect(used("film-edit")).toBe(1);
    expect(used("launch-film")).toBe(0);
    // the model was sent the scene, the others' ids and beats, and the spot
    const user = JSON.parse((openai()[1].body.messages as { content: string }[])[1].content);
    expect(user.scene.id).toBe("features");
    expect(user.otherScenes).toHaveLength(6);
    expect(user.at).toEqual({ scene: "features", target: "features.card2.title", label: "Card 2 title", secondsIntoScene: 4.2, x: 0.5, y: 0.6 });
  });

  it("moves every later scene by the same whole beats on a timing note", async () => {
    const before = await madeFilm();
    replies = [{ refuse: null, reply: "Held the cards 4 beats longer.", scene: { ...cards, beats: 16 }, film: null }];
    const out = await (await edit(before, { note: "Hold this longer" })).json();
    const was = sceneStarts(before);
    const now = sceneStarts(out.film);
    expect(now.map((s, i) => s - was[i])).toEqual([0, 0, 0, 0, 4, 4]);
    // the reply says the film is longer than the length picked (live-p7a D7: 30 s became 32 s with no word)
    expect(out.reply).toBe("Held the cards 4 beats longer. The film is now 32 seconds, up from 30.");
  });

  it("says nothing of the length when a change keeps it", async () => {
    const before = await madeFilm();
    replies = [{ refuse: null, reply: "Card 2 now reads Done.", scene: { ...cards, cards: [cards.cards[0], { ...cards.cards[1], title: "Done" }, cards.cards[2]] }, film: null }];
    expect((await (await edit(before, {})).json()).reply).toBe("Card 2 now reads Done.");
  });

  it("refuses a patch to another scene, or of another kind, with 422 and keeps the use", async () => {
    const before = await madeFilm();
    db.rows.clear();
    for (const scene of [{ ...proof }, { ...cards, kind: "type", words: ["Plan"] }]) {
      replies = [{ refuse: null, reply: "Done.", scene, film: null }];
      const res = await edit(before, {});
      expect(res.status).toBe(422);
      expect(await res.json()).toEqual({ code: "unusable", error: "Couldn't change only that spot. Try saying it another way." });
    }
    expect(used("film-edit")).toBe(2);
  });

  it("answers a note on the whole film with the whole film, keeping its tempo, product and style", async () => {
    const before = await madeFilm();
    replies = [{ refuse: null, reply: "Made it calmer.", scene: null, film: { ...FILM_BODY, ground: "paper" } }];
    const out = await (await edit(before, { scene: null, target: "", note: "Make it lighter" })).json();
    expect(out.scene).toBeUndefined();
    expect([out.film.ground, out.film.bpm, out.film.product, out.film.style]).toEqual(["paper", 120, "devtool", 0]);
    expect(out.reply).toBe("Made it calmer.");
  });

  it("says so when the change runs past 60 seconds and the end is trimmed", async () => {
    const before = await madeFilm({ setup: { ...SETUP, length: 60 } });
    expect(before.scenes.reduce((n, s) => n + s.beats, 0)).toBe(120);
    replies = [{ refuse: null, reply: "Held the cards longer.", scene: { ...cards, beats: 32 }, film: null }];
    const out = await (await edit(before, { note: "Hold this much longer" })).json();
    expect(out.reply).toBe("Held the cards longer. Trimmed the end to keep the film to 60 seconds.");
    expect(out.film.scenes.reduce((n: number, s: { beats: number }) => n + s.beats, 0)).toBe(120);
  });

  it("gives the use back when OpenAI never answered, and the film is unchanged", async () => {
    const before = await madeFilm();
    replies = ["throw"];
    const res = await edit(before, {});
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ code: "failed", error: "Couldn't change only that spot. Try saying it another way." });
    expect(used("film-edit")).toBe(0);
  });

  it("refuses a Media key the brand lacks in the change, and keeps the film's own", async () => {
    const before = await madeFilm();
    replies = [{ refuse: null, reply: "Swapped the screen.", scene: { ...app, media: "cimg-notmine0001" }, film: null }];
    const res = await edit(before, { scene: "app", screens: [] });
    expect(res.status).toBe(422);
    replies = [{ refuse: null, reply: "Zoomed in.", scene: { ...app, camera: [{ beat: 2, to: [0.2, 0.2, 0.5, 0.5] }] }, film: null }];
    expect((await edit(before, { scene: "app", screens: [] })).status).toBe(200);
  });
});

describe("a quiet stretch in the first film, and Fix it (live-p7a D5)", () => {
  type Scene = Record<string, unknown> & { id: string; kind: string; beats: number };
  const live = LIVE_FILM as unknown as { setup: typeof SETUP; kit: typeof KIT; screens: typeof SCREENS; direction: typeof DIRECTION; film: Film; fixIt: { note: string; answer: Film; reply: string } };
  // a film the model writes, from a spec: the schema's fields only
  const bodyOf = (f: Pick<Film, "font" | "ground" | "accent" | "drop" | "scenes">) => ({ font: f.font, ground: f.ground, accent: f.accent, drop: f.drop, scenes: f.scenes, voice: { lines: [] } });
  const scenes = live.film.scenes as unknown as Scene[];
  const byId = (id: string) => scenes.find((s) => s.id === id)!;
  // what a right answer could be: the montage one beat a shot, its 16 beats given to scenes with more to land
  const fixed = bodyOf({
    ...live.film,
    scenes: [
      { ...byId("hook"), beats: 8, words: ["Client chats", "Keep moving", "Follow-ups", "In one app"] },
      { ...byId("chat-followup"), beats: 12, tap: [{ beat: 8, at: [0.5, 0.6] }] },
      { ...byId("features"), beats: 12 },
      { ...byId("burst"), beats: 8 },
      { ...byId("together"), beats: 12 },
      { ...byId("end"), beats: 8 },
    ] as unknown as Film["scenes"],
  });
  const liveFilm = () => post(LEO, { mode: "film", setup: live.setup, brand: BRAND, kit: live.kit, screens: live.screens, direction: live.direction, product: "devtool", style: 0 });
  const fixIt = (before: Film) =>
    post(LEO, { mode: "film-edit", film: before, scene: null, target: "", label: "The whole film", t: 0, x: 0.5, y: 0.5, note: live.fixIt.note, fix: true, brand: BRAND, kit: live.kit, screens: live.screens });
  const seconds = (f: Film) => (f.scenes.reduce((n, s) => n + s.beats, 0) * 60) / f.bpm;

  it("tells the writer a montage's beats are its shots, the burst is a bar or two, and how long a scene may hold", () => {
    const system = filmSystem("film", "business");
    expect(system).toContain("one a beat, so its beats equal its shots");
    expect(system).toContain("a bar or two, not the whole middle");
    expect(system).toContain("After its last new thing a scene holds 8 beats at most");
  });

  it("names the scene each quiet stretch sits in when it asks again", async () => {
    replies = [{ refuse: null, film: bodyOf(live.film) }, { refuse: null, film: bodyOf(live.film) }];
    const res = await liveFilm();
    expect((await res.json()).issues).toEqual(["Nothing happens from 0:13 to 0:22."]);
    const again = (openai()[1].body.messages as { content: string }[])[3].content;
    expect(again).toContain("- Nothing happens from 0:13 to 0:22.");
    expect(again).toContain('- The scene "burst" (montage) holds 24 beats, and nothing new lands in its last 16: a montage shows one shot a beat');
    expect(used("launch-film")).toBe(1);
  });

  it("keeps the film's length and fills the gap: a shorter answer is fitted back, and a rhythm still off gets one more try in the same use", async () => {
    expect(rhythmIssues(parseFilm({ ...fixed, energy: "fast" }).ok ? (parseFilm({ ...fixed, energy: "fast" }) as { film: Film }).film : live.film)).toEqual([]);
    // Fix it's live answer cut the montage to 8 beats, a 22 s film; then a right one
    replies = [{ refuse: null, reply: live.fixIt.reply, scene: null, film: bodyOf(live.fixIt.answer) }, { refuse: null, reply: "Gave the montage's beats to the scenes around it.", scene: null, film: fixed }];
    const res = await fixIt(live.film);
    expect(res.status).toBe(200);
    const out = await res.json();
    expect([seconds(out.film), out.issues]).toEqual([30, []]);
    expect(openai()).toHaveLength(2);
    expect(used("film-edit")).toBe(1);
    // the writer was told where the stretch sits and to keep the length
    const note = JSON.parse((openai()[0].body.messages as { content: string }[])[1].content).note as string;
    expect(note).toContain('The scene "burst" (montage) holds 24 beats');
    expect(note).toContain("Keep the film 30 seconds long");
  });

  it("asks nothing more when Fix it's first answer is right, and leaves any other note on the whole film as it was", async () => {
    replies = [{ refuse: null, reply: "Done.", scene: null, film: fixed }];
    const out = await (await fixIt(live.film)).json();
    expect([seconds(out.film), out.issues, openai().length]).toEqual([30, [], 1]);
    calls.length = 0;
    replies = [{ refuse: null, reply: "Cut the montage.", scene: null, film: bodyOf(live.fixIt.answer) }];
    const plain = await (await post(LEO, { mode: "film-edit", film: live.film, scene: null, target: "", note: "Make it shorter", brand: BRAND, kit: live.kit, screens: live.screens })).json();
    expect([seconds(plain.film), openai().length]).toEqual([22, 1]);
  });
});
