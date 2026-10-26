import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// The handler as the app calls it: sign-in, the cap, OpenAI's read and Jev's look pick.
const UID = "6d80f027-3395-480c-86a1-8827d3d6cce3";
// on NORTH_STAR_USERS; UID is everyone else
const LEO = "leo-uid";

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
  return { admin, rows, today, handler: null as null | ((r: Request) => Promise<Response>) };
});
vi.mock("https://esm.sh/@supabase/supabase-js@2", () => ({ createClient: () => db.admin }));

// OpenAI answers `replies` in turn (a body, a status for a failure, or "drop" for no connection) and keeps each request.
// Jev answers `jev` (null: no answer) and keeps each request.
const ai: { replies: (object | number | "drop")[]; sent: Record<string, unknown>[]; jev: Record<string, unknown> | null; asked: { state: unknown; questions: Record<string, unknown> }[] } =
  { replies: [], sent: [], jev: null, asked: [] };
const answer = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
answer({});

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  const env: Record<string, string> = { SUPABASE_URL: "http://db", SUPABASE_SERVICE_ROLE_KEY: "service-role-key", OPENAI_API_KEY: "k", NORTH_STAR_USERS: LEO, TYPESAFE_API_KEY: "k" };
  vi.stubGlobal("Deno", { serve: (fn: (r: Request) => Promise<Response>) => (db.handler = fn), env: { get: (k: string) => env[k] } });
  vi.stubGlobal("fetch", async (u: string | URL, init?: RequestInit) => {
    if (String(u).includes("typesafe")) {
      ai.asked.push(JSON.parse(String(init?.body)));
      return ai.jev ? answer({ answers: ai.jev }) : answer({}, 503);
    }
    ai.sent.push(JSON.parse(String(init?.body)));
    const reply = ai.replies.shift();
    if (reply === "drop") throw new TypeError("connection reset");
    if (typeof reply === "number") return answer({ error: "down" }, reply);
    return answer({ model: "gpt-6-luna", choices: [{ message: { content: JSON.stringify(reply ?? {}) } }] });
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  await import("./index.ts");
}, 30_000);
afterAll(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

beforeEach(() => {
  db.rows.clear();
  ai.replies.length = 0;
  ai.sent.length = 0;
  ai.jev = null;
  ai.asked.length = 0;
});

const send = (uid: string, body: Record<string, unknown>) =>
  db.handler!(new Request("http://x/reel-visuals", { method: "POST", headers: uid ? { Authorization: `Bearer ${uid}` } : {}, body: JSON.stringify(body) }));
const used = (uid: string, feature: string) => db.rows.get(`${uid}|${feature}|${db.today()}`) ?? 0;

const jpeg = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==";
const frames = [{ t: 0.3, image: jpeg }, { t: 4.3, image: jpeg }];
const pacing = { durationSec: 41.6, cuts: 9, avgShotSec: 4.16, cutsFirst3s: 2 };
const VISUALS = {
  format: "Talking head with bold yellow captions",
  hookVisual: "A calculator slams onto the desk",
  onScreenText: [{ t: 0.3, text: "3 CPF myths" }],
  pacing: "A cut every 4.2 seconds.",
  visualMoves: ["Prop in the first frame"],
  myVisuals: ["To camera, holding your CPF statement", "Point down at the caption"],
};
const STYLE = { captions: "Bold yellow capitals, two words at a time, bottom third.", layout: "The speaker fills the frame.", onScreenText: [{ t: 0.3, text: "3 CPF myths" }] };

// Pinned before the edit mode: what the breakdown and the style read do for everyone today.
describe("today's breakdown and style read (pinned)", () => {
  it("read a clone's frames for anyone signed in, on one reel-visuals use, with no Jev", async () => {
    ai.replies.push(VISUALS);
    const res = await send(UID, { frames, pacing, beats: ["Your CPF isn't lazy money", "Comment CPF for my checklist"] });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ visuals: VISUALS, usage: { used: 1, limit: 20 } });
    expect(used(UID, "reel-visuals")).toBe(1);
    expect(ai.sent).toHaveLength(1);
    expect(ai.sent[0]).toMatchObject({ model: "gpt-6-luna", max_completion_tokens: 5500, response_format: { json_schema: { name: "reel_visuals" } } });
    expect(ai.asked).toEqual([]);
  });

  it("read a reel's style for anyone signed in, on the same cap, with Jev's look", async () => {
    ai.replies.push(STYLE);
    ai.jev = { style: { type: "choice", choice: "bold" }, caps: { type: "noul", noul: 0.9 }, position: { type: "choice", choice: "bottom" } };
    const res = await send(UID, { mode: "style", frames, pacing });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      style: STYLE,
      look: { style: "bold", uppercase: true, captionBox: null, position: "bottom", words: null, captions: null, framed: null, topHalf: null },
      usage: { used: 1, limit: 20 },
    });
    expect(used(UID, "reel-visuals")).toBe(1);
    expect(ai.sent[0]).toMatchObject({ max_completion_tokens: 4900, response_format: { json_schema: { name: "reel_style" } } });
    expect(ai.asked).toHaveLength(1);
    expect(ai.asked[0].state).toEqual({ captions: STYLE.captions, layout: STYLE.layout });
    expect(Object.keys(ai.asked[0].questions).sort()).toEqual(["box", "caps", "framed", "position", "shown", "style", "top", "words"]);
  });

  it("answer a style read with no look when Jev has none", async () => {
    ai.replies.push(STYLE);
    expect(await (await send(UID, { mode: "style", frames, pacing })).json()).toMatchObject({ style: STYLE, look: null });
  });

  it("refuse no sign-in, then a bad body, before any count or call", async () => {
    expect((await send("", { mode: "style", frames, pacing })).status).toBe(401);
    const bad = await send(UID, { mode: "style", frames: frames.slice(0, 1), pacing });
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ code: "bad_request", error: "Send 2 to 12 frames." });
    expect((await send(UID, { mode: "style", frames: Array.from({ length: 13 }, (_, i) => ({ t: i, image: jpeg })), pacing })).status).toBe(400);
    expect(db.rows.size).toBe(0);
    expect(ai.sent).toEqual([]);
  });

  it("keep the use on a failed or unusable read, with today's codes", async () => {
    ai.replies.push(500);
    const down = await send(UID, { mode: "style", frames, pacing });
    expect([down.status, (await down.json()).code]).toEqual([502, "ai_failed"]);
    ai.replies.push({ captions: "", layout: "", onScreenText: [] });
    const unusable = await send(UID, { mode: "style", frames, pacing });
    expect([unusable.status, (await unusable.json()).code]).toEqual([502, "ai_failed"]);
    expect(used(UID, "reel-visuals")).toBe(2);
  });

  it("serve a listed account the same way", async () => {
    ai.replies.push(STYLE);
    expect((await send(LEO, { mode: "style", frames, pacing })).status).toBe(200);
    expect(used(LEO, "reel-visuals")).toBe(1);
  });
});

describe("the edit read (same edit, NORTH_STAR_USERS only)", () => {
  const shots = [{ face: true, said: "Most people check their CPF once a year" }, { face: false, said: "" }];
  const EDIT = {
    mode: "edit",
    frames,
    pacing,
    shots,
    sentences: ["Most people check their CPF once a year.", "Comment CPF for my checklist."],
    beats: ["Opens on a common habit", "Asks for a comment"],
    cta: "Comment CPF",
  };
  const READ = {
    frames: [
      { t: 0.3, shows: "A woman talks to camera in an office", framing: "close", texts: [{ text: "CPF once a year?", place: "top" }] },
      { t: 4.3, shows: "A calculator on a desk", framing: "wide", texts: [] },
    ],
    captions: STYLE.captions,
    layout: STYLE.layout,
  };

  it("refuses an account off the list before its body is read or anything is counted", async () => {
    for (const b of [EDIT, { mode: "edit" }, { ...EDIT, frames: Array.from({ length: 25 }, (_, i) => ({ t: i, image: jpeg })) }]) {
      const res = await send(UID, b);
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ code: "not_enabled", error: "This isn't switched on for your account yet." });
    }
    expect((await send("", EDIT)).status).toBe(401);
    expect(db.rows.size).toBe(0);
    expect([ai.sent, ai.asked]).toEqual([[], []]);
  });

  it("refuses 25 frames for a listed account before any count", async () => {
    const res = await send(LEO, { ...EDIT, frames: Array.from({ length: 25 }, (_, i) => ({ t: i, image: jpeg })), shots: Array(25).fill(shots[1]) });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ code: "bad_request", error: "Send 2 to 24 frames." });
    expect(db.rows.size).toBe(0);
  });

  it("reads the shots on one edit-read use, not reel-visuals, with one Jev call holding the look and every pick", async () => {
    ai.replies.push(READ);
    ai.jev = {
      style: { type: "choice", choice: "bold", probabilities: { bold: 0.8 } },
      shot_0: { type: "choice", choice: "speaker", probabilities: { speaker: 0.9 } },
      shot_1: { type: "choice", choice: "cutaway", probabilities: { cutaway: 0.7 } },
      text_0_0: { type: "choice", choice: "hook", probabilities: { hook: 0.85 } },
      beat_0: { type: "choice", choice: "b0", probabilities: { b0: 0.9 } },
      beat_1: { type: "choice", choice: "b1", probabilities: { b1: 0.6 } },
    };
    const res = await send(LEO, EDIT);
    expect(res.status).toBe(200);
    const out = await res.json();
    expect(out.read).toEqual(READ);
    expect(out.look).toMatchObject({ style: "bold" });
    expect(out.picks).toEqual({
      shots: [{ pick: "speaker", p: 0.9 }, { pick: "cutaway", p: 0.7 }],
      texts: [[{ pick: "hook", p: 0.85 }], []],
      beats: [{ pick: 0, p: 0.9 }, { pick: 1, p: 0.6 }],
      roles: [null, null],
      // asked only where two faces were measured (none here)
      people: [null, null],
    });
    expect(out.usage.used).toBe(1);
    expect([used(LEO, "edit-read"), used(LEO, "reel-visuals")]).toEqual([1, 0]);
    expect(ai.sent[0]).toMatchObject({ max_completion_tokens: 7000, response_format: { json_schema: { name: "reel_edit" } } });
    // the creator's words go to Jev in memory, never to the vision model
    expect(JSON.stringify(ai.sent[0])).not.toContain("CPF");
    expect(ai.asked).toHaveLength(1);
    expect(ai.asked[0].state).toEqual({ captions: STYLE.captions, layout: STYLE.layout });
    expect(Object.keys(ai.asked[0].questions)).toEqual(expect.arrayContaining(["style", "shot_0", "shot_1", "text_0_0", "beat_0", "beat_1", "role_1"]));
  });

  it("answers with every pick null when Jev has none, so the plan falls back on the measured faces", async () => {
    ai.replies.push(READ);
    const out = await (await send(LEO, EDIT)).json();
    expect([out.look, out.picks.shots, out.picks.beats]).toEqual([null, [null, null], [null, null]]);
    expect(used(LEO, "edit-read")).toBe(1);
  });

  it("gives the use back only when OpenAI never answered, and keeps it on a read that came back unusable", async () => {
    for (const reply of [500, "drop"] as const) {
      ai.replies.push(reply);
      const res = await send(LEO, EDIT);
      expect([res.status, await res.json()]).toEqual([502, { code: "failed", error: "Reading the edit didn't come back. Try again." }]);
    }
    expect(used(LEO, "edit-read")).toBe(0);
    ai.replies.push({ ...READ, captions: "" });
    const bad = await send(LEO, EDIT);
    expect([bad.status, (await bad.json()).code]).toEqual([422, "unusable"]);
    expect(used(LEO, "edit-read")).toBe(1);
    expect(ai.asked).toEqual([]);
  });
});
