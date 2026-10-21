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
