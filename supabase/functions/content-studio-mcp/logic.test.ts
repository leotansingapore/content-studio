import { afterEach, describe, expect, it, vi } from "vitest";
import { BUSY_LINE, CHECK_NOTE, INBOX_PREFIX, LEO_INSTRUCTIONS, LEO_TOOLS, MAX_INBOX, TOOL_LINES, TOOLS, callTool, handleRpc, inboxKey, linkIsLive, linkKey, parseToken, revokedKey, sgToday, sha256Hex, type Link, type Store } from "./logic";
import { profilesFrom, reportFacts, sgDay, weekMoves, weekReport } from "../notify/logic";

const UID = "ff72c375-389e-4dd0-86c4-a166307b8751";
const SECRET = "a".repeat(40) + "b-_";
const link: Link = { userId: UID, scope: UID, secret: SECRET };
const now = new Date("2026-10-08T02:00:00Z"); // 10am Thursday in Singapore

function memoryStore(rows: Record<string, unknown>): Store & { rows: Map<string, string> } {
  const map = new Map(Object.entries(rows).map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)]));
  return {
    rows: map,
    get: async (k) => map.get(k) ?? null,
    insert: async (k, v) => {
      if (map.has(k)) return false;
      map.set(k, v);
      return true;
    },
    all: async (prefix) => [...map].filter(([k]) => k.startsWith(prefix)).map(([key, data]) => ({ key, data })),
  };
}

const posts = [
  { id: "a", hook: "CPF in your 30s", draft: "Top up early.", platform: "linkedin", format: "text-post", status: "scheduled", scheduledFor: "2026-10-12T08:30" },
  { id: "b", hook: "Insurance myths", draft: "Myth one...", platform: "instagram", status: "posted", postedAt: "2026-10-01T03:00:00Z", metrics: { impressions: 1000, reactions: 40, comments: 8, shares: 2 } },
  { id: "c", hook: "Retirement at 55", draft: "Plan backwards.", status: "posted", metrics: { impressions: 500, reactions: 50, comments: 0, shares: 0 } },
  { id: "d", hook: "Idea only", draft: "" },
  { id: "e", hook: "Far future", draft: "x", status: "scheduled", scheduledFor: "2027-01-01" },
];
const text = (r: { content: { text: string }[] }) => JSON.parse(r.content[0].text);

describe("connection token", () => {
  it("reads the scope and secret, for the main profile and a second one", () => {
    expect(parseToken(`${UID}.${SECRET}`)).toEqual({ userId: UID, scope: UID, secret: SECRET });
    expect(parseToken(`${UID}~p1abc.${SECRET}`)?.scope).toBe(`${UID}~p1abc`);
  });

  it("refuses anything that isn't a user id and a 43-character secret", () => {
    for (const bad of ["", SECRET, `${UID}.short`, `not-a-uuid.${SECRET}`, `${UID}~bad%id.${SECRET}`, `${UID}.${SECRET}x`, `${UID}/../x.${SECRET}`]) {
      expect(parseToken(bad)).toBeNull();
    }
  });

  it("stores only the secret's SHA-256 in the link key", async () => {
    const hash = await sha256Hex("abc");
    expect(hash).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(linkKey(hash, UID)).toBe(`content-studio-mcplink-${hash}-${UID}`);
  });
});

describe("turning a link off", () => {
  it("is final: a revoked row beats the link row, even if a device re-uploads the link", () => {
    const h = "c".repeat(64);
    expect(linkIsLive([linkKey(h, UID)], h, UID)).toBe(true);
    expect(linkIsLive([linkKey(h, UID), revokedKey(h, UID)], h, UID)).toBe(false);
    expect(linkIsLive([revokedKey(h, UID)], h, UID)).toBe(false);
    expect(linkIsLive([], h, UID)).toBe(false);
    // another profile's revoked row doesn't touch this one
    expect(linkIsLive([linkKey(h, UID), revokedKey(h, `${UID}~p1`)], h, UID)).toBe(true);
  });
});

describe("tools", () => {
  const store = () => memoryStore({ [`content-studio-drafts-${UID}`]: posts });

  it("lists posts by status with a limit", async () => {
    expect(text(await callTool("list_posts", {}, store(), link)).count).toBe(5);
    const scheduled = text(await callTool("list_posts", { status: "scheduled", limit: 1 }, store(), link));
    expect(scheduled).toMatchObject({ count: 2, posts: [{ id: "a", status: "scheduled", scheduledFor: "2026-10-12T08:30" }] });
  });

  it("gets one post with its engagement rate, and says when the id is unknown", async () => {
    expect(text(await callTool("get_post", { id: "b" }, store(), link))).toMatchObject({ text: "Myth one...", results: { engagementRate: 5 } });
    expect((await callTool("get_post", { id: "zz" }, store(), link)).isError).toBe(true);
  });

  it("turns the day over at midnight in Singapore, not in London", () => {
    expect(sgToday(new Date("2026-10-08T15:59:59Z"))).toBe("2026-10-08");
    expect(sgToday(new Date("2026-10-08T16:00:00Z"))).toBe("2026-10-09");
  });

  it("shows the next two weeks of the calendar from today in Singapore", async () => {
    expect(sgToday(now)).toBe("2026-10-08");
    const cal = text(await callTool("get_calendar", {}, store(), link, now));
    expect(cal).toMatchObject({ from: "2026-10-08", to: "2026-10-21" });
    expect(cal.posts.map((p: { id: string }) => p.id)).toEqual(["a"]);
  });

  it("totals results and ranks the best posts by engagement rate", async () => {
    const r = text(await callTool("get_results", {}, store(), link));
    expect(r).toMatchObject({ postsWithResults: 2, impressions: 1500, engagement: 100, engagementRate: 6.7 });
    expect(r.best.map((p: { id: string }) => p.id)).toEqual(["c", "b"]);
  });

  it("reads the brand, positioning and voice, leaving out photos and logos", async () => {
    const s = memoryStore({
      [`content-studio-positioning-${UID}`]: { audience: "young-adult", topics: ["CPF"], platform: "instagram", cadence: 3, edge: "" },
      [`content-studio-carousel-brand-${UID}`]: { name: "Jane", handle: "@jane", signOff: "DM me", photo: "data:image/jpeg;base64,xx", logo: "data:..." },
      [`content-studio-voice-${UID}`]: { voiceSummary: "Warm, plain" },
    });
    const b = text(await callTool("get_brand", {}, s, link));
    expect(b).toEqual({
      positioning: { audience: "young-adult", topics: ["CPF"], platform: "instagram", cadence: 3 },
      brandKit: { name: "Jane", handle: "@jane", signOff: "DM me" },
      voiceSummary: "Warm, plain",
    });
  });

  // Pinned before the goal fields joined get_brand (phase 5): a brand that never set a goal answers byte for byte as
  // it did on 0d23f6a6. Never update this literal to make a change pass.
  it("answers a brand with no goal fields exactly as before (pinned)", async () => {
    const s = memoryStore({
      [`content-studio-positioning-${UID}`]: {
        oneLiner: "I help young families in Tampines plan their cover.",
        audience: "parent",
        audienceDetail: "Parents in their 30s with kids under 10",
        topics: ["Hospital plans", "CPF"],
        edge: "Plain numbers, no jargon",
        platform: "instagram",
        cadence: 4,
        updatedAt: "2026-10-01T00:00:00Z",
      },
      [`content-studio-carousel-brand-${UID}`]: { name: "Jane Lim", handle: "@janelim", role: "Financial adviser", signOff: "DM me", color: "#1f6feb", photo: "data:image/jpeg;base64,xx" },
      [`content-studio-voice-${UID}`]: { voiceSummary: "Warm, plain, short sentences." },
    });
    const r = await callTool("get_brand", {}, s, link);
    expect(r.isError).toBeUndefined();
    expect(r.content).toHaveLength(1);
    expect(r.content[0].text).toBe(`{
  "positioning": {
    "oneLiner": "I help young families in Tampines plan their cover.",
    "audience": "parent",
    "audienceDetail": "Parents in their 30s with kids under 10",
    "topics": [
      "Hospital plans",
      "CPF"
    ],
    "edge": "Plain numbers, no jargon",
    "platform": "instagram",
    "cadence": 4
  },
  "brandKit": {
    "name": "Jane Lim",
    "handle": "@janelim",
    "role": "Financial adviser",
    "signOff": "DM me",
    "color": "#1f6feb"
  },
  "voiceSummary": "Warm, plain, short sentences."
}`);
  });

  it("gives Claude the brand's goal and its kind when one is set, first in positioning", async () => {
    const s = memoryStore({
      [`content-studio-positioning-${UID}`]: { goal: "More people booking a 15-minute review with me", goalKind: "clients", goalSetAt: "2026-10-22T02:00:00Z", audience: "parent", cadence: 3 },
    });
    const b = text(await callTool("get_brand", {}, s, link));
    expect(b.positioning).toEqual({ goal: "More people booking a 15-minute review with me", goalKind: "clients", audience: "parent", cadence: 3 });
    expect(Object.keys(b.positioning)).toEqual(["goal", "goalKind", "audience", "cadence"]);
    expect(TOOLS.find((t) => t.name === "get_brand")?.description).toContain("positioning (goal, audience, topics");
  });

  it("adds a draft as its own inbox row under this scope, never a uuid id", async () => {
    const s = memoryStore({ [`content-studio-positioning-${UID}`]: { platform: "instagram" } });
    const r = text(await callTool("add_draft", { text: "Hook line\n\nBody", scheduledFor: "2026-10-20T19:30" }, s, link, now));
    expect(r).toMatchObject({ saved: true, status: "scheduled" });
    const [key, raw] = [...s.rows].find(([k]) => k.startsWith(INBOX_PREFIX))!;
    expect(key).toBe(`${INBOX_PREFIX}claude-s00-${UID}`);
    expect(key.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi)).toEqual([UID]);
    expect(r.id).toMatch(/^claude-[a-z0-9]+$/);
    // the next one takes the next free slot
    await callTool("add_draft", { text: "Second" }, s, link, now);
    expect(s.rows.has(inboxKey(1, UID))).toBe(true);
    expect(JSON.parse(raw)).toMatchObject({ id: r.id, hook: "Hook line", draft: "Hook line\n\nBody", platform: "instagram", status: "scheduled", scheduledFor: "2026-10-20T19:30", format: "text-post" });
  });

  it("refuses bad drafts and stops at the inbox cap", async () => {
    const s = memoryStore({});
    for (const args of [{}, { text: " " }, { text: "x".repeat(5001) }, { text: "x", platform: "myspace" }, { text: "x", scheduledFor: "2026-13-40" }, { text: "x", scheduledFor: "tomorrow" }, { text: "x", scheduledFor: "2026-10-20T24:00" }, { text: "x", scheduledFor: "2026-10-20T19:60" }]) {
      expect((await callTool("add_draft", args, s, link, now)).isError).toBe(true);
    }
    for (let i = 0; i < MAX_INBOX; i++) s.rows.set(inboxKey(i, UID), "{}");
    expect((await callTool("add_draft", { text: "one more" }, s, link, now)).isError).toBe(true);
  });
});

describe("JSON-RPC", () => {
  const s = memoryStore({});

  it("negotiates the protocol version and lists the tools", async () => {
    const init = (await handleRpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26" } }, s, link)) as { result: { protocolVersion: string; serverInfo: { name: string } } };
    expect(init.result).toMatchObject({ protocolVersion: "2025-03-26", serverInfo: { name: "content-studio" } });
    const odd = (await handleRpc({ jsonrpc: "2.0", id: 2, method: "initialize", params: { protocolVersion: "1999-01-01" } }, s, link)) as { result: { protocolVersion: string } };
    expect(odd.result.protocolVersion).toBe("2025-06-18");
    const list = (await handleRpc({ jsonrpc: "2.0", id: 3, method: "tools/list" }, s, link)) as { result: { tools: { name: string }[] } };
    expect(list.result.tools.map((t) => t.name)).toEqual(["list_posts", "get_post", "get_calendar", "get_results", "get_brand", "add_draft"]);
  });

  it("gives notifications no reply and unknown methods or tools an error", async () => {
    expect(await handleRpc({ jsonrpc: "2.0", method: "notifications/initialized" }, s, link)).toBeNull();
    expect(await handleRpc({ jsonrpc: "2.0", id: 4, method: "resources/list" }, s, link)).toMatchObject({ error: { code: -32601 } });
    expect(await handleRpc({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "drop_tables" } }, s, link)).toMatchObject({ error: { code: -32602 } });
  });
});

// Every answer a link off NORTH_STAR_USERS gets, pinned on 22 Oct 2026 (a9d04b4e) before phase 6's tools: the
// protocol, all six tools with their refusals, and the rows add_draft writes. Never update the file with vitest -u.
const EVERYONE_STORE = {
  [`content-studio-drafts-${UID}`]: posts,
  [`content-studio-positioning-${UID}`]: { goal: "More reviews booked", goalKind: "clients", audience: "parent", topics: ["CPF"], platform: "instagram", cadence: 3, edge: "" },
  [`content-studio-carousel-brand-${UID}`]: { name: "Jane", handle: "@jane", role: "Financial adviser", signOff: "DM me", photo: "data:image/jpeg;base64,xx" },
  [`content-studio-voice-${UID}`]: { voiceSummary: "Warm, plain" },
  [`content-studio-learnings-${UID}`]: [{ id: "l1", text: "No emoji", scope: "all", source: "typed", createdAt: "2026-10-01T00:00:00Z" }],
  [`content-studio-following-${UID}`]: [{ platform: "instagram", handle: "rival", history: [], posts: [{ id: "x1", url: "https://instagram.com/p/x1", caption: "Hi", postedAt: "2026-10-07T00:00:00Z", views: 10, likes: 1, comments: 0 }], fresh: ["x1"] }],
};
const EVERYONE_CALLS: Record<string, unknown>[] = [
  { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } },
  { jsonrpc: "2.0", id: 2, method: "initialize", params: { protocolVersion: "2024-11-05" } },
  { jsonrpc: "2.0", method: "notifications/initialized" },
  { jsonrpc: "2.0", id: 3, method: "ping" },
  { jsonrpc: "2.0", id: 4, method: "tools/list" },
  { jsonrpc: "2.0", id: 5, method: "prompts/list" },
  { jsonrpc: "2.0", id: 6, method: "prompts/get", params: { name: "remix_post", arguments: { source: "x" } } },
  { jsonrpc: "2.0", id: 7, method: "resources/list" },
  { jsonrpc: "2.0", id: 8, method: "tools/call", params: { name: "list_posts", arguments: {} } },
  { jsonrpc: "2.0", id: 9, method: "tools/call", params: { name: "list_posts", arguments: { status: "posted", limit: 1 } } },
  { jsonrpc: "2.0", id: 10, method: "tools/call", params: { name: "get_post", arguments: { id: "b" } } },
  { jsonrpc: "2.0", id: 11, method: "tools/call", params: { name: "get_post", arguments: { id: "zz" } } },
  { jsonrpc: "2.0", id: 12, method: "tools/call", params: { name: "get_calendar", arguments: {} } },
  { jsonrpc: "2.0", id: 13, method: "tools/call", params: { name: "get_calendar", arguments: { from: "2026-12-30", days: 5 } } },
  { jsonrpc: "2.0", id: 14, method: "tools/call", params: { name: "get_results" } },
  { jsonrpc: "2.0", id: 15, method: "tools/call", params: { name: "get_brand", arguments: {} } },
  { jsonrpc: "2.0", id: 16, method: "tools/call", params: { name: "add_draft", arguments: { text: "Hook line\n\nBody", scheduledFor: "2026-10-20T19:30" } } },
  { jsonrpc: "2.0", id: 17, method: "tools/call", params: { name: "add_draft", arguments: { text: "Second", title: "A title", platform: "tiktok", format: "carousel" } } },
  { jsonrpc: "2.0", id: 18, method: "tools/call", params: { name: "add_draft", arguments: { text: " " } } },
  { jsonrpc: "2.0", id: 19, method: "tools/call", params: { name: "add_draft", arguments: { text: "x", platform: "myspace" } } },
  { jsonrpc: "2.0", id: 20, method: "tools/call", params: { name: "add_draft", arguments: { text: "x", scheduledFor: "tomorrow" } } },
  { jsonrpc: "2.0", id: 21, method: "tools/call", params: { name: "check_post", arguments: { text: "risk-free" } } },
  { jsonrpc: "2.0", id: 22, method: "tools/call", params: { name: "get_week", arguments: {} } },
  { jsonrpc: "2.0", id: 23, method: "tools/call", params: { name: "list_following_posts", arguments: {} } },
  { jsonrpc: "2.0", id: 24, method: "tools/call", params: { name: "get_activity", arguments: {} } },
  { method: "tools/list" },
];

/** The transcript a link off the list gets for EVERYONE_CALLS, then every row in the store. */
async function everyoneTranscript(run: (m: Record<string, unknown>, s: Store) => Promise<object | null>) {
  const s = memoryStore(EVERYONE_STORE);
  const replies = [];
  for (const m of EVERYONE_CALLS) replies.push(await run(m, s));
  // a full inbox, then its refusal
  for (let i = 0; i < MAX_INBOX; i++) if (!s.rows.has(inboxKey(i, UID))) s.rows.set(inboxKey(i, UID), "{}");
  replies.push(await run({ jsonrpc: "2.0", id: 25, method: "tools/call", params: { name: "add_draft", arguments: { text: "one more" } } }, s));
  return JSON.stringify({ replies, rows: Object.fromEntries([...s.rows].sort(([a], [b]) => a.localeCompare(b))) }, null, 2);
}

describe("a link off the list (pinned)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("answers every call exactly as before phase 6", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.123456789);
    await expect(await everyoneTranscript((m, s) => handleRpc(m, s, link, now))).toMatchFileSnapshot("./fixtures/everyone.json");
  });
});

// ---------- phase 6: a link on NORTH_STAR_USERS ----------

/** cs_consume_ai_usage and the refund's read and update, over one counter per user, feature and day. */
function fakeUsage(o: { fail?: boolean; start?: number } = {}) {
  const counts = new Map<string, number>();
  const rowKey = (q: Record<string, unknown>) => `${q.user_id}|${q.feature}|${q.day}`;
  const today = () => new Date().toISOString().slice(0, 10);
  const calls: string[] = [];
  const client = {
    calls,
    counts,
    rpc: async (_fn: string, a: Record<string, unknown>) => {
      calls.push(String(a.p_feature));
      if (o.fail) return { data: null, error: { message: "down" } };
      const k = rowKey({ user_id: a.p_user, feature: a.p_feature, day: today() });
      const n = (counts.get(k) ?? o.start ?? 0) + 1;
      if (n > Number(a.p_limit)) return { data: null, error: null };
      counts.set(k, n);
      return { data: n, error: null };
    },
    from: () => ({
      select: () => ({ match: async (q: Record<string, unknown>) => ({ data: counts.has(rowKey(q)) ? [{ count: counts.get(rowKey(q)) }] : [], error: null }) }),
      update: (v: { count: number }) => ({
        match: (q: Record<string, unknown>) => ({
          select: async () => {
            if (counts.get(rowKey(q)) !== q.count) return { data: [], error: null };
            counts.set(rowKey(q), v.count);
            return { data: [{ count: v.count }], error: null };
          },
        }),
      }),
    }),
  };
  return client;
}
const used = (u: ReturnType<typeof fakeUsage>) => [...u.counts.values()].reduce((a, b) => a + b, 0);

const leo = (usage = fakeUsage(), name = "Zapier") => ({ leo: true, name, usage });
const call = (name: string, args: Record<string, unknown> = {}, id = 1) => ({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } });
const result = (r: object | null) => (r as { result: { content: { text: string }[]; isError?: boolean } }).result;
const answer = (r: object | null) => JSON.parse(result(r).content[0].text);
const P1 = `${UID}~p1`;
const p1Link: Link = { userId: UID, scope: P1, secret: SECRET };

describe("a link off the list, with everything index.ts passes", () => {
  afterEach(() => vi.restoreAllMocks());

  it("still answers every call as pinned, and never counts a use", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.123456789);
    const usage = fakeUsage();
    await expect(await everyoneTranscript((m, s) => handleRpc(m, s, link, now, { leo: false, name: "Zapier", usage }))).toMatchFileSnapshot("./fixtures/everyone.json");
    expect(usage.calls).toEqual([]);
  });

  it("can't reach a new tool through callTool either", async () => {
    expect(await callTool("check_post", { text: "x" }, memoryStore({}), link)).toEqual({ content: [{ type: "text", text: "Unknown tool check_post." }], isError: true });
  });
});

describe("tools and instructions on a listed link", () => {
  it("lists 13 tools, today's six first, and every one has a line for /connect", async () => {
    const list = (await handleRpc({ jsonrpc: "2.0", id: 1, method: "tools/list" }, memoryStore({}), link, now, leo())) as { result: { tools: { name: string }[] } };
    expect(list.result.tools.map((t) => t.name)).toEqual([
      ...TOOLS.map((t) => t.name),
      "check_post",
      "get_week",
      "list_following_posts",
      "list_competitor_posts",
      "list_competitor_ads",
      "list_skills",
      "get_activity",
    ]);
    expect(Object.keys(TOOL_LINES).sort()).toEqual(LEO_TOOLS.map((t) => t.name).sort());
  });

  it("advertises prompts and the new instructions, and lists counts nothing", async () => {
    const usage = fakeUsage();
    const init = (await handleRpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }, memoryStore({}), link, now, leo(usage))) as { result: Record<string, unknown> };
    expect(init.result.capabilities).toEqual({ tools: { listChanged: false }, prompts: { listChanged: false } });
    expect(init.result.instructions).toBe(LEO_INSTRUCTIONS);
    expect(LEO_INSTRUCTIONS).toContain("Run check_post before add_draft. If get_brand says the speaker is business, write as the business, with no adviser wording.");
    await handleRpc({ jsonrpc: "2.0", id: 2, method: "ping" }, memoryStore({}), link, now, leo(usage));
    await handleRpc({ jsonrpc: "2.0", id: 3, method: "prompts/list" }, memoryStore({}), link, now, leo(usage));
    expect(usage.calls).toEqual([]);
  });
});

describe("check_post", () => {
  const check = async (text: string) => answer(await handleRpc(call("check_post", { text }), memoryStore({}), link, now, leo()));

  it("flags 'guaranteed' as a warning and keeps ok", async () => {
    const r = await check("Guaranteed to make you think.");
    expect(r).toEqual({ flags: [{ match: "Guaranteed", severity: "warn", message: expect.stringContaining("'Guarantee' is a regulated word") }], ok: true, note: CHECK_NOTE });
  });

  it("adds risk-free as an error and turns ok off", async () => {
    const r = await check("guaranteed returns, risk-free");
    expect(r.flags.map((f: { match: string; severity: string }) => [f.match, f.severity])).toEqual([["guaranteed", "warn"], ["risk-free", "error"]]);
    expect(r.ok).toBe(false);
  });

  it("passes a clean post with no flags", async () => {
    expect(await check("Three questions to ask before you buy cover.")).toEqual({ flags: [], ok: true, note: "Warnings only: the adviser decides. Fix every error before add_draft." });
  });

  it("refuses empty or overlong text", async () => {
    for (const text of ["", " ", "x".repeat(5001)]) expect(result(await handleRpc(call("check_post", { text }), memoryStore({}), link, now, leo())).isError).toBe(true);
  });
});

describe("get_week", () => {
  const drafts = (tag: string) => [
    { id: `${tag}1`, hook: `${tag} carousel one`, platform: "instagram", status: "posted", format: "carousel", postedAt: "2026-10-06T02:00:00Z", metrics: { impressions: 900, reactions: 60, comments: 9, shares: 3 } },
    { id: `${tag}2`, hook: `${tag} carousel two`, platform: "instagram", status: "posted", format: "carousel", postedAt: "2026-10-05T02:00:00Z", metrics: { impressions: 700, reactions: 40, comments: 4, shares: 1 } },
    { id: `${tag}3`, hook: `${tag} text`, platform: "linkedin", status: "posted", format: "text-post", postedAt: "2026-10-03T02:00:00Z", metrics: { impressions: 300, reactions: 5, comments: 0, shares: 0 } },
    { id: `${tag}4`, hook: `${tag} no numbers`, platform: "linkedin", status: "posted", postedAt: "2026-10-04T02:00:00Z" },
    { id: `${tag}5`, hook: `${tag} the week before`, platform: "instagram", status: "posted", postedAt: "2026-09-28T02:00:00Z", metrics: { impressions: 500, reactions: 20, comments: 2, shares: 0 } },
  ];
  const following = [{ platform: "instagram", handle: "rival", history: [{ at: "2026-09-29T00:00:00Z", followers: 1000 }, { at: "2026-10-07T00:00:00Z", followers: 1240 }], posts: [{ postedAt: "2026-10-06T00:00:00Z" }] }];
  const rows: Record<string, unknown> = {
    [`content-studio-profiles-${UID}`]: [{ id: "me", name: "Me" }, { id: "p1", name: "ActivityTracker" }],
    [`content-studio-drafts-${UID}`]: drafts("me"),
    [`content-studio-goals-${UID}`]: { instagram: 4 },
    [`content-studio-following-${UID}`]: following,
    [`content-studio-drafts-${P1}`]: drafts("p1").slice(0, 3),
    [`content-studio-positioning-${P1}`]: { platform: "linkedin", cadence: 5 },
  };
  const expected = (id: string) => {
    const data = Object.fromEntries(Object.entries(rows).map(([k, v]) => [k, JSON.stringify(v)]));
    const p = profilesFrom(UID, data).find((x) => x.id === id)!;
    const report = weekReport(p.posts, p.followed ?? [], sgDay(now.getTime()), Object.values(p.goals).reduce((s, n) => s + n, 0));
    return { facts: reportFacts(report), moves: weekMoves(report) };
  };

  it("gives the This week report and moves for the main brand", async () => {
    const r = answer(await handleRpc(call("get_week"), memoryStore(rows), link, now, leo()));
    expect(r).toEqual(expected("me"));
    expect(r.facts).toContain("4 posts posted against a goal of 4");
    expect(r.moves.map((m: { id: string }) => m.id)).toEqual(expect.arrayContaining(["pattern", "reuse", "numbers", "rival"]));
  });

  it("gives a second brand its own week, never the main brand's", async () => {
    const r = answer(await handleRpc(call("get_week"), memoryStore(rows), p1Link, now, leo()));
    expect(r).toEqual(expected("p1"));
    expect(r.facts).toContain("against a goal of 5");
    expect(JSON.stringify(r)).not.toContain("me carousel");
  });
});

describe("posts and ads to remix from", () => {
  const account = (handle: string, n: number, fresh: string[]) => ({
    platform: "instagram",
    handle,
    history: [],
    posts: Array.from({ length: n }, (_, i) => ({ id: `${handle}${i}`, url: `https://instagram.com/p/${handle}${i}`, format: "reel", caption: `${handle} ${i} `.repeat(100), postedAt: `2026-10-${String(1 + i).padStart(2, "0")}T00:00:00Z`, views: i ? 100 * i : null, likes: i, comments: 1 })),
    fresh,
  });
  const store = () =>
    memoryStore({
      [`content-studio-following-${UID}`]: [account("ana", 20, ["ana19"]), account("ben", 20, [])],
      [`content-studio-following-${P1}`]: [account("other", 3, [])],
      [`content-studio-competitor-posts-${UID}`]: { "c1:instagram": account("rival", 5, ["rival4"]), "c1:tiktok": account("rivaltok", 2, []) },
      [`content-studio-competitor-ads-${UID}`]: {
        c1: { checkedAt: "2026-10-07T00:00:00Z", pageId: "1", pageName: "Rival Co", fresh: ["222"], seen: [], ads: [
          { id: "111", format: "image", headline: "Old ad", body: "Body one", cta: null, link: null, image: null, video: null, start: "2026-08-01", end: null, active: false, platforms: ["facebook"], versions: 1 },
          { id: "222", format: "video", headline: null, body: "y".repeat(700), cta: null, link: null, image: null, video: null, start: "2026-10-05", end: null, active: true, platforms: ["instagram"], versions: 3 },
        ] },
      },
    });

  it("lists the newest followed posts across accounts, up to the limit, captions cut at 600, fresh ones new", async () => {
    const all = answer(await handleRpc(call("list_following_posts"), store(), link, now, leo())).posts;
    expect(all).toHaveLength(15);
    expect(all[0]).toMatchObject({ handle: "ana", platform: "instagram", url: "https://instagram.com/p/ana19", postedAt: "2026-10-20T00:00:00Z", views: 1900, likes: 19, comments: 1, new: true });
    expect(all[0].caption).toHaveLength(600);
    expect(all.filter((p: { new: boolean }) => p.new)).toHaveLength(1);
    const three = answer(await handleRpc(call("list_following_posts", { limit: 3 }), store(), link, now, leo())).posts;
    expect(three.map((p: { url: string }) => p.url.slice(-5))).toEqual(["ana19", "ben19", "ana18"]);
    expect(answer(await handleRpc(call("list_following_posts", { limit: 99 }), store(), link, now, leo())).posts).toHaveLength(30);
    expect(answer(await handleRpc(call("list_following_posts", { limit: 0 }), store(), link, now, leo())).posts).toHaveLength(15);
    expect(answer(await handleRpc(call("list_following_posts"), store(), p1Link, now, leo())).posts.map((p: { handle: string }) => p.handle)).toEqual(["other", "other", "other"]);
  });

  it("lists competitors' posts in the same shape", async () => {
    const posts = answer(await handleRpc(call("list_competitor_posts", { limit: 3 }), store(), link, now, leo())).posts;
    expect(posts.map((p: { handle: string; new: boolean }) => [p.handle, p.new])).toEqual([["rival", true], ["rival", false], ["rival", false]]);
    expect(Object.keys(posts[0]).sort()).toEqual(["caption", "comments", "handle", "likes", "new", "platform", "postedAt", "url", "views"]);
  });

  it("lists competitors' ads newest first, with their Ad Library link", async () => {
    const ads = answer(await handleRpc(call("list_competitor_ads"), store(), link, now, leo())).ads;
    expect(ads).toEqual([
      { handle: "Rival Co", platform: "meta", url: "https://www.facebook.com/ads/library/?id=222", caption: "y".repeat(600), postedAt: "2026-10-05", running: true, versions: 3, new: true },
      { handle: "Rival Co", platform: "meta", url: "https://www.facebook.com/ads/library/?id=111", caption: "Old ad\nBody one", postedAt: "2026-08-01", running: false, versions: 1, new: false },
    ]);
    expect(answer(await handleRpc(call("list_competitor_ads"), store(), p1Link, now, leo())).ads).toEqual([]);
  });
});

describe("get_brand on a listed link", () => {
  const learnings = [
    { id: "l1", text: "No emoji in my posts", scope: "posts", source: "typed", createdAt: "2026-10-01T00:00:00Z" },
    { id: "l2", text: "Old rule", scope: "all", source: "assistant", createdAt: "2026-10-02T00:00:00Z", offAt: "2026-10-03T00:00:00Z" },
    { id: "l3", text: "Use an older man as my presenter", scope: "videos", source: "assistant", createdAt: "2026-10-04T00:00:00Z", thread: "t1", msg: "m2" },
  ];

  it("adds the speaker and the learnings still on", async () => {
    const s = memoryStore({ [`content-studio-voice-${UID}`]: { voiceSummary: "Warm" }, [`content-studio-learnings-${UID}`]: learnings });
    const b = answer(await handleRpc(call("get_brand"), s, link, now, leo()));
    expect(b).toEqual({
      positioning: {},
      brandKit: {},
      voiceSummary: "Warm",
      speaker: "person",
      learnings: [{ text: "No emoji in my posts", scope: "posts" }, { text: "Use an older man as my presenter", scope: "videos" }],
    });
  });

  it("speaks as a business for a second brand with no role or photo, as a person with either", async () => {
    const kit = (k: object) => memoryStore({ [`content-studio-carousel-brand-${P1}`]: k });
    const speaker = async (k: object) => answer(await handleRpc(call("get_brand"), kit(k), p1Link, now, leo())).speaker;
    expect(await speaker({ name: "ActivityTracker" })).toBe("business");
    expect(await speaker({ name: "ActivityTracker", role: " " })).toBe("business");
    expect(await speaker({ role: "Financial adviser" })).toBe("person");
    expect(await speaker({ photo: "data:image/jpeg;base64,xx" })).toBe("person");
  });
});

describe("skills and prompts", () => {
  const mine = [
    { id: "s1", name: "Tighten for LinkedIn", slash: "tighten-for-linkedin", instruction: "Cut it to 120 words for LinkedIn.", works: "post", updatedAt: "2026-10-20T00:00:00Z" },
    { id: "s2", name: "Myth buster", slash: "myth-buster", instruction: "A post that busts one money myth.", works: "new", updatedAt: "2026-10-20T00:00:00Z" },
    { id: "s3", name: "Bad", slash: "Bad Slash!", instruction: "x", works: "new", updatedAt: "2026-10-20T00:00:00Z" },
  ];
  const store = () => memoryStore({ [`content-studio-chatskills-${UID}`]: mine });
  const rpc = (method: string, params?: Record<string, unknown>, s = store()) => handleRpc({ jsonrpc: "2.0", id: 9, method, params }, s, link, now, leo());

  it("lists the four ready-made skills and the brand's own", async () => {
    const r = answer(await handleRpc(call("list_skills"), store(), link, now, leo()));
    expect(r.skills.map((s: { slash: string }) => s.slash)).toEqual(["/check", "/retro", "/check-week", "/answer", "/tighten-for-linkedin", "/myth-buster"]);
    expect(r.skills[4]).toEqual({ name: "Tighten for LinkedIn", slash: "/tighten-for-linkedin", description: "Cut it to 120 words for LinkedIn.", worksOn: "one of my posts" });
  });

  it("lists the three prompts and one per saved skill, with an id when it works on a post", async () => {
    const r = (await rpc("prompts/list")) as { result: { prompts: { name: string; arguments?: { name: string; required: boolean }[] }[] } };
    expect(r.result.prompts.map((p) => p.name)).toEqual(["remix_post", "weekly_retro", "check_before_posting", "tighten-for-linkedin", "myth-buster"]);
    expect(r.result.prompts.map((p) => p.arguments?.map((a) => a.name) ?? [])).toEqual([["source"], [], ["id"], ["id"], []]);
    expect(JSON.stringify(r)).not.toContain('"text"');
  });

  it("fills remix_post's source into its message", async () => {
    const r = (await rpc("prompts/get", { name: "remix_post", arguments: { source: "https://instagram.com/p/abc" } })) as { result: { messages: { role: string; content: { type: string; text: string } }[] } };
    expect(r.result.messages).toEqual([
      {
        role: "user",
        content: {
          type: "text",
          text: "Read get_brand. Take the structure of this post, its hook type, beats and format, and write a new post for this adviser in their voice. Never reuse its words, brand or claims. Run check_post, fix every error, then save it with add_draft and tell me what you kept and what you changed.\n\nThe post:\nhttps://instagram.com/p/abc",
        },
      },
    ]);
  });

  it("sends the retro and the check as written, and a saved skill with its instruction", async () => {
    const text = async (name: string, args?: Record<string, unknown>) => ((await rpc("prompts/get", { name, arguments: args })) as { result: { messages: { content: { text: string } }[] } }).result.messages[0].content.text;
    expect(await text("weekly_retro")).toBe("Call get_week. Tell me in five lines how my last 7 days went against the 7 before, then pick the one move from the list you would make this week and say why.");
    expect(await text("check_before_posting", { id: "b" })).toBe("Call get_post for this id, run check_post on its text, and tell me what to fix before it goes out. Do not change the post.\n\nThe post id: b");
    expect(await text("tighten-for-linkedin", { id: "b" })).toContain("Cut it to 120 words for LinkedIn.");
    expect(await text("myth-buster")).toContain("Read get_brand, then write a new post: A post that busts one money myth.");
  });

  it("refuses an unknown prompt and a missing argument with -32602", async () => {
    expect(await rpc("prompts/get", { name: "drop_tables" })).toMatchObject({ error: { code: -32602, message: "Unknown prompt drop_tables" } });
    expect(await rpc("prompts/get", { name: "remix_post", arguments: { source: " " } })).toMatchObject({ error: { code: -32602, message: "Missing argument source" } });
  });
});

describe("get_activity", () => {
  const ev = (id: string, at: string, who = "you") => ({ id, at, who, kind: "post", title: `Did ${id}` });
  const many = Array.from({ length: 130 }, (_, i) => ev(`a${i}`, new Date(now.getTime() - i * 3_600_000).toISOString()));

  it("reads every device's month rows and the inbox for this brand, newest first, within the days asked", async () => {
    const s = memoryStore({
      [`content-studio-activity-2026-10-dev001-${UID}`]: [ev("x1", "2026-10-07T00:00:00Z"), ev("old", "2026-09-20T00:00:00Z")],
      [`content-studio-activity-2026-09-dev002-${UID}`]: [ev("x2", "2026-09-30T00:00:00Z", "agent"), ev("x1", "2026-10-07T00:00:00Z")],
      [`content-studio-activity-2026-10-dev001-${P1}`]: [ev("other", "2026-10-07T01:00:00Z")],
      [`content-studio-activityin-claude-zzz-${P1}`]: { at: "2026-10-08T01:30:00Z", who: "claude", kind: "post", title: "The other brand's draft" },
      [`content-studio-activityin-claude-abc-${UID}`]: { at: "2026-10-08T01:00:00Z", who: "claude", kind: "post", title: 'Added a draft: "Hi"', detail: 'Through your "Zapier" link.', link: "/generate?draft=claude-abc" },
      [`content-studio-activity-2026-10-${UID}`]: [ev("bad", "2026-10-07T00:00:00Z")],
    });
    const r = answer(await handleRpc(call("get_activity", { days: 10 }), s, link, now, leo()));
    expect(r.days).toBe(10);
    expect(r.events.map((e: { title: string }) => e.title)).toEqual(['Added a draft: "Hi"', "Did x1", "Did x2"]);
    expect(r.events[0]).toEqual({ at: "2026-10-08T01:00:00.000Z", who: "claude", kind: "post", title: 'Added a draft: "Hi"', detail: 'Through your "Zapier" link.', link: "/generate?draft=claude-abc" });
    expect(answer(await handleRpc(call("get_activity"), s, link, now, leo())).events).toHaveLength(2);
  });

  it("keeps at most 100", async () => {
    const s = memoryStore({ [`content-studio-activity-2026-10-dev001-${UID}`]: many });
    const events = answer(await handleRpc(call("get_activity", { days: 30 }), s, link, now, leo())).events;
    expect(events).toHaveLength(100);
    expect(events[0].title).toBe("Did a0");
  });
});

describe("add_draft on a listed link", () => {
  it("also writes an activity inbox row named after the link, with the draft's id", async () => {
    const s = memoryStore({});
    const r = answer(await handleRpc(call("add_draft", { text: "Hook line\n\nBody" }), s, link, now, leo(fakeUsage(), "Zapier")));
    const raw = s.rows.get(`content-studio-activityin-${r.id}-${UID}`)!;
    expect(JSON.parse(raw)).toEqual({ at: now.toISOString(), who: "claude", kind: "post", title: 'Added a draft: "Hook line"', detail: 'Through your "Zapier" link.', link: `/generate?draft=${r.id}` });
    expect(s.rows.has(inboxKey(0, UID))).toBe(true);
  });

  it("names an older link with no name Claude", async () => {
    const s = memoryStore({});
    const r = answer(await handleRpc(call("add_draft", { text: "x" }), s, p1Link, now, { leo: true, usage: fakeUsage() }));
    expect(JSON.parse(s.rows.get(`content-studio-activityin-${r.id}-${P1}`)!).detail).toBe('Through your "Claude" link.');
  });

  it("keeps the draft when the activity row can't be written", async () => {
    const s = memoryStore({});
    const insert = s.insert;
    s.insert = async (k, v) => (k.startsWith("content-studio-activityin-") ? Promise.reject(new Error("down")) : insert(k, v));
    expect(answer(await handleRpc(call("add_draft", { text: "x" }), s, link, now, leo()))).toMatchObject({ saved: true });
  });
});

describe("the mcp-calls cap", () => {
  it("counts one use per tool call on a listed link", async () => {
    const usage = fakeUsage();
    await handleRpc(call("list_posts"), memoryStore({}), link, now, leo(usage));
    await handleRpc(call("check_post", { text: "x" }), memoryStore({}), link, now, leo(usage));
    expect(usage.calls).toEqual(["mcp-calls", "mcp-calls"]);
    expect(used(usage)).toBe(2);
  });

  it("refuses the 501st call of the day with the limit line and saves nothing", async () => {
    const usage = fakeUsage({ start: 499 });
    const s = memoryStore({});
    expect(answer(await handleRpc(call("add_draft", { text: "the 500th" }), s, link, now, leo(usage)))).toMatchObject({ saved: true });
    const rows = s.rows.size;
    const r = result(await handleRpc(call("add_draft", { text: "the 501st" }), s, link, now, leo(usage)));
    expect(r).toEqual({ content: [{ type: "text", text: "Content Studio's daily limit of 500 calls is used. It resets at 8am Singapore time." }], isError: true });
    expect(s.rows.size).toBe(rows);
  });

  it("says try again, and saves nothing, when the counter can't be read or isn't there", async () => {
    for (const caller of [leo(fakeUsage({ fail: true })), { leo: true }]) {
      const s = memoryStore({});
      const r = result(await handleRpc(call("add_draft", { text: "x" }), s, link, now, caller));
      expect(r).toEqual({ content: [{ type: "text", text: BUSY_LINE }], isError: true });
      expect(s.rows.size).toBe(0);
    }
  });

  it("gives the use back when the store never answers", async () => {
    const usage = fakeUsage();
    const s = memoryStore({});
    s.get = () => Promise.reject(new Error("timeout"));
    await expect(handleRpc(call("list_posts"), s, link, new Date(), leo(usage))).rejects.toThrow("timeout");
    expect(usage.calls).toEqual(["mcp-calls"]);
    expect(used(usage)).toBe(0);
  });
});
