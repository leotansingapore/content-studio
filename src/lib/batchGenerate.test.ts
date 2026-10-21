// streamOnePost carries Write's short calls, Batch, the carousel topic writer, the video caption writer and the
// recruit agent. Everyone else's request body is pinned on the code before brand-voice-memory: never update the
// pinned file with vitest -u.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const as = vi.hoisted(() => ({ user: null as null | undefined | { id: string; email: string } }));
vi.mock("@/lib/useLeoOnly", () => ({ leoUser: vi.fn(async () => as.user) }));
vi.mock("@/lib/supabase", () => ({
  SUPABASE_URL: "https://abc.supabase.co",
  SUPABASE_ANON_KEY: "anon-key",
  supabase: { auth: { getSession: async () => ({ data: { session: { access_token: "jwt", user: { id: UID, email: "someone@example.com" } } } }) } },
}));

import { streamOnePost, type GeneratePostPayload } from "./batchGenerate";

const UID = "6d80f027-3395-480c-86a1-8827d3d6cce3";
const store = new Map<string, string>();
const sent: { url: string; headers: Record<string, string>; body: Record<string, unknown> }[] = [];

const PAYLOAD: GeneratePostPayload = {
  pillar: "topic",
  pillarDetail: "Why people pay for hospital twice",
  ideaSource: "A concrete angle for this week",
  ideaContext: "MY BRAND RULES: Never use the words: guaranteed.",
  format: "text-post",
  platform: "linkedin",
  ctaType: "comment-keyword",
  audience: "general",
  voiceSummary: "Warm and plain. Short sentences.",
};

// what /voice and /coach keep for this sign-in: Coach's lists exist on every account
function seedMemory() {
  store.set(`content-studio-coachprofile-${UID}`, JSON.stringify({ likes: ["client stories"], dislikes: ["jargon"] }));
  store.set(`content-studio-facts-${UID}`, JSON.stringify([{ id: "f1", text: "12 years as an adviser", createdAt: "2026-10-20T03:00:00.000Z" }]));
  store.set(
    `content-studio-learnings-${UID}`,
    JSON.stringify([
      { id: "l1", text: "Never use emoji", scope: "posts", source: "assistant", createdAt: "2026-10-19T03:00:00.000Z" },
      { id: "l2", text: "Use Asian presenters", scope: "videos", source: "assistant", createdAt: "2026-10-19T04:00:00.000Z" },
    ]),
  );
}

const stream = () =>
  new ReadableStream({
    start(c) {
      c.enqueue(new TextEncoder().encode('data: {"type":"token","text":"Most people"}\n\ndata: {"type":"variant_complete","text":"Most people pay twice."}\n\n'));
      c.close();
    },
  });

beforeEach(() => {
  store.clear();
  sent.length = 0;
  as.user = null;
  const localStorage = {
    get length() {
      return store.size;
    },
    key: (i: number) => [...store.keys()][i] ?? null,
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  vi.stubGlobal("localStorage", localStorage);
  vi.stubGlobal("window", { localStorage, location: { search: "" }, dispatchEvent: () => true, addEventListener: () => {}, removeEventListener: () => {} });
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    sent.push({ url, headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) });
    return new Response(stream(), { headers: { "Content-Type": "text/event-stream" } });
  });
});
afterEach(() => vi.unstubAllGlobals());

async function write(payload: GeneratePostPayload = PAYLOAD) {
  let done = "";
  await streamOnePost(payload, { onComplete: (t) => (done = t), onError: (m) => (done = `error: ${m}`) });
  expect(done).toBe("Most people pay twice.");
  return sent[0];
}

describe("streamOnePost for everyone else", () => {
  it("sends today's request, with Coach's lists, facts and learnings saved on the account", async () => {
    seedMemory();
    const req = await write();
    expect(req.url).toBe("https://abc.supabase.co/functions/v1/generate-social-content");
    await expect(JSON.stringify(req, null, 2)).toMatchFileSnapshot("./__pins__/stream-one-post-everyone.json");
  });

  it("sends today's request while the sign-in is still being read", async () => {
    seedMemory();
    as.user = undefined;
    await expect(JSON.stringify(await write(), null, 2)).toMatchFileSnapshot("./__pins__/stream-one-post-everyone.json");
  });
});

describe("streamOnePost for Leo", () => {
  const LEO = { id: UID, email: "leo@example.com" };
  const pinned = async () => JSON.parse((await import("./__pins__/stream-one-post-everyone.json?raw")).default);

  it("adds his facts and post learnings after the brand rules, with Coach's lists, and nothing else changes", async () => {
    seedMemory();
    as.user = LEO;
    const req = await write();
    const block = [
      "ABOUT ME, FROM WHAT I HAVE TOLD YOU (follow these unless MY BRAND RULES say otherwise):",
      "- Facts you may state about me (state no other facts, numbers, awards or results about me): 12 years as an adviser",
      "- Keep doing or avoid: Never use emoji; Lean into: client stories; Steer clear of: jargon",
    ].join("\n");
    expect(req.body.ideaContext).toBe(`MY BRAND RULES: Never use the words: guaranteed.\n\n${block}`);
    expect(String(req.body.ideaContext)).not.toContain("Use Asian presenters");
    const today = await pinned();
    expect({ ...req, body: { ...req.body, ideaContext: today.body.ideaContext } }).toEqual(today);
  });

  it("makes the block the whole context when the caller sends none", async () => {
    seedMemory();
    as.user = LEO;
    const req = await write({ ...PAYLOAD, ideaContext: undefined });
    expect(String(req.body.ideaContext).startsWith("ABOUT ME, FROM WHAT I HAVE TOLD YOU")).toBe(true);
  });

  it("sends today's request when nothing is saved, and when the session can't be read", async () => {
    as.user = LEO;
    expect(await write()).toEqual(await pinned());
    seedMemory();
    const { leoUser } = await import("@/lib/useLeoOnly");
    vi.mocked(leoUser).mockImplementationOnce(() => {
      throw new Error("no auth");
    });
    sent.length = 0;
    expect(await write()).toEqual(await pinned());
  });
});
