import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { DAILY_LIMITS, GLOBAL_COUNTER_USER } from "../_shared/usageCaps";

// The handler's money path for a music track: the adviser's cap, the studio's, and the uses given back when nothing is made.
const UID = "6d80f027-3395-480c-86a1-8827d3d6cce3";

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

// ElevenLabs answers with `eleven` (a status, or "throw" for a timeout), or `reply` when a test sets one; every call is kept
const eleven: { calls: number; next: number | "throw"; sent: { url: string; body: string }[]; reply: null | (() => Response) } = { calls: 0, next: 200, sent: [], reply: null };
const LEO = "13b28b1d-2ecb-40be-b3a9-aefc90366f9b";

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  const env: Record<string, string> = { SUPABASE_URL: "http://db", SUPABASE_SERVICE_ROLE_KEY: "service-role-key", ELEVENLABS_API_KEY: "k", NORTH_STAR_USERS: LEO };
  vi.stubGlobal("Deno", { serve: (fn: (r: Request) => Promise<Response>) => (db.handler = fn), env: { get: (k: string) => env[k] } });
  vi.stubGlobal("fetch", async (u: string, init?: RequestInit) => {
    eleven.calls++;
    eleven.sent.push({ url: String(u), body: String(init?.body ?? "") });
    if (eleven.next === "throw") throw new Error("The operation timed out.");
    if (eleven.reply) return eleven.reply();
    return new Response(eleven.next === 200 ? "mp3" : '{"detail":"busy"}', { status: eleven.next });
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
  await import("./index.ts");
}, 30_000);
afterAll(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

beforeEach(() => {
  db.rows.clear();
  db.down.clear();
  eleven.calls = 0;
  eleven.next = 200;
  eleven.sent = [];
  eleven.reply = null;
});

const track = (uid = UID) =>
  db.handler!(new Request("http://x/text-voice", { method: "POST", headers: { Authorization: `Bearer ${uid}` }, body: JSON.stringify({ mode: "music", mood: "calm", seconds: 30 }) }));
const mine = (uid = UID) => db.rows.get(`${uid}|ai-music|${db.today()}`) ?? 0;
const studio = () => db.rows.get(`${GLOBAL_COUNTER_USER}|ai-music-global|${db.today()}`) ?? 0;

describe("a music track's uses", () => {
  it("are taken once each when the track is made", async () => {
    expect((await track()).status).toBe(200);
    expect([mine(), studio()]).toEqual([1, 1]);
  });

  it("both come back when Eleven Music fails or times out", async () => {
    eleven.next = 500;
    expect((await track()).status).toBe(502);
    expect([mine(), studio()]).toEqual([0, 0]);
    eleven.next = "throw";
    expect((await track()).status).toBe(502);
    expect([mine(), studio()]).toEqual([0, 0]);
  });

  it("the adviser's comes back when the studio's counter is unavailable, and Eleven Music is never called", async () => {
    db.down.add("ai-music-global");
    expect((await track()).status).toBe(503);
    expect(mine()).toBe(0);
    expect(eleven.calls).toBe(0);
  });

  it("the adviser's comes back when the studio's tracks are used up", async () => {
    db.rows.set(`${GLOBAL_COUNTER_USER}|ai-music-global|${db.today()}`, DAILY_LIMITS["ai-music-global"]);
    expect((await track()).status).toBe(429);
    expect(mine()).toBe(0);
    expect(eleven.calls).toBe(0);
  });
});

describe("the voiceover and the dub (pinned at 6cdc59d2, before the lines mode and word times)", () => {
  const send = (uid: string, body: Record<string, unknown>) =>
    db.handler!(new Request("http://x/text-voice", { method: "POST", headers: { Authorization: `Bearer ${uid}` }, body: JSON.stringify(body) }));
  const voiced = (uid: string) => db.rows.get(`${uid}|ai-voice|${db.today()}`) ?? 0;

  for (const uid of [LEO, UID]) {
    it(`sends today's MP3 request and streams the MP3 back for one use (${uid === LEO ? "a listed uid" : "anyone else"})`, async () => {
      const res = await send(uid, { text: "Most people pay twice for a hospital stay.", voice: "alice" });
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("application/octet-stream");
      expect(await res.text()).toBe("mp3");
      expect(eleven.sent).toEqual([
        {
          url: "https://api.elevenlabs.io/v1/text-to-speech/Xb7hH8MSUJpSbSDYk0k2?output_format=mp3_44100_128",
          body: '{"text":"Most people pay twice for a hospital stay.","model_id":"eleven_turbo_v2_5","voice_settings":{"stability":0.5,"similarity_boost":0.75,"style":0,"speed":1}}',
        },
      ]);
      expect(voiced(uid)).toBe(1);
    });

    it(`sends today's dub request and answers the audio with each line's span for one use (${uid === LEO ? "a listed uid" : "anyone else"})`, async () => {
      // the with-timestamps reply's shape, from elevenlabs.io/docs/api-reference/text-to-speech/convert-with-timestamps
      const text = "Satu\nDua";
      eleven.reply = () =>
        Response.json({
          audio_base64: "QUJD",
          alignment: {
            characters: [...text],
            character_start_times_seconds: [...text].map((_, i) => i * 0.1),
            character_end_times_seconds: [...text].map((_, i) => i * 0.1 + 0.1),
          },
        });
      const res = await send(uid, { mode: "dub", lines: ["Satu", "Dua"], voice: "alice", lang: "ms" });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ audio: "QUJD", spans: [{ s: 0, e: 0.4 }, { s: 0.5, e: 0.8 }] });
      expect(eleven.sent).toEqual([
        {
          url: "https://api.elevenlabs.io/v1/text-to-speech/Xb7hH8MSUJpSbSDYk0k2/with-timestamps?output_format=mp3_44100_128",
          body: '{"text":"Satu\\nDua","model_id":"eleven_turbo_v2_5","voice_settings":{"stability":0.5,"similarity_boost":0.75,"style":0,"speed":1.15},"language_code":"ms"}',
        },
      ]);
      expect(voiced(uid)).toBe(1);
    });
  }

  it("answers anyone else who asks for word times with today's MP3", async () => {
    const res = await send(UID, { text: "Most people pay twice for a hospital stay.", voice: "alice", timestamps: true });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("mp3");
    expect(eleven.sent.map((c) => c.url)).toEqual(["https://api.elevenlabs.io/v1/text-to-speech/Xb7hH8MSUJpSbSDYk0k2?output_format=mp3_44100_128"]);
    expect(voiced(UID)).toBe(1);
  });
});

describe("a launch film's lines and a voiceover's word times (NORTH_STAR_USERS only)", () => {
  const send = (uid: string, body: Record<string, unknown>) =>
    db.handler!(new Request("http://x/text-voice", { method: "POST", headers: { Authorization: `Bearer ${uid}` }, body: JSON.stringify(body) }));
  const voiced = (uid = LEO) => db.rows.get(`${uid}|ai-voice|${db.today()}`) ?? 0;
  // the with-timestamps reply (elevenlabs.io/docs/api-reference/text-to-speech/convert-with-timestamps), 0.1 s a character
  const timed = (text: string) => () =>
    Response.json({
      audio_base64: "QUJD",
      alignment: { characters: [...text], character_start_times_seconds: [...text].map((_, i) => i / 10), character_end_times_seconds: [...text].map((_, i) => (i + 1) / 10) },
    });
  const LINES = ["Your week.", "Planned in one tap."];

  it("refuses the lines to anyone off the list before counting or calling ElevenLabs", async () => {
    const res = await send(UID, { mode: "lines", lines: LINES, voice: "eric" });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ code: "not_enabled", error: "This isn't switched on for your account yet." });
    expect(db.rows.size).toBe(0);
    expect(eleven.calls).toBe(0);
  });

  it("refuses lines it can't read with 400 before counting", async () => {
    const res = await send(LEO, { mode: "lines", lines: [], voice: "eric" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ code: "bad_request", error: "Write the film's lines first." });
    expect(db.rows.size).toBe(0);
    expect(eleven.calls).toBe(0);
  });

  it("reads the lines in one with-timestamps call with no language, and answers one span per line for one use", async () => {
    eleven.reply = timed(LINES.join("\n"));
    const res = await send(LEO, { mode: "lines", lines: LINES, voice: "eric" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ audio: "QUJD", spans: [{ s: 0, e: 1 }, { s: 1.1, e: 3 }] });
    expect(eleven.sent).toHaveLength(1);
    expect(eleven.sent[0].url).toBe("https://api.elevenlabs.io/v1/text-to-speech/cjVigY5qzO86Huf0OWal/with-timestamps?output_format=mp3_44100_128");
    expect(JSON.parse(eleven.sent[0].body)).toEqual({ text: "Your week.\nPlanned in one tap.", model_id: "eleven_turbo_v2_5", voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0, speed: 1 } });
    expect(voiced()).toBe(1);
  });

  it("answers a listed caller's voiceover with its words timed, for one use", async () => {
    const text = "Plan your week in one tap.";
    eleven.reply = timed(text);
    const res = await send(LEO, { text, voice: "alice", timestamps: true });
    expect(res.status).toBe(200);
    const out = await res.json();
    expect(out.audio).toBe("QUJD");
    expect(out.words.map((w: { w: string }) => w.w)).toEqual(["Plan", "your", "week", "in", "one", "tap."]);
    expect([out.words[0].s, out.words.at(-1).e]).toEqual([0, 2.6]);
    expect(eleven.sent[0].url).toContain("/with-timestamps?");
    expect(voiced()).toBe(1);
  });

  it("gives the use back when ElevenLabs never answered, and keeps it when the answer has no audio", async () => {
    for (const next of [500, "throw"] as const) {
      eleven.next = next;
      const res = await send(LEO, { mode: "lines", lines: LINES, voice: "eric" });
      expect(res.status).toBe(502);
      expect(await res.json()).toEqual({ code: "failed", error: "Couldn't make the voiceover right now. Try again in a minute." });
      expect(voiced()).toBe(0);
    }
    eleven.next = 200;
    eleven.reply = () => Response.json({ alignment: {} });
    expect((await send(LEO, { text: "Plan your week in one tap.", voice: "alice", timestamps: true })).status).toBe(422);
    expect(voiced()).toBe(1);
  });
});
