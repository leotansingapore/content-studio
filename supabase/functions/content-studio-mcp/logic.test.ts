import { afterEach, describe, expect, it, vi } from "vitest";
import { INBOX_PREFIX, MAX_INBOX, TOOLS, callTool, handleRpc, inboxKey, linkIsLive, linkKey, parseToken, revokedKey, sgToday, sha256Hex, type Link, type Store } from "./logic";

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
