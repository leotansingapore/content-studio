import { describe, expect, it } from "vitest";
import { INBOX_PREFIX, MAX_INBOX, callTool, handleRpc, inboxKey, linkIsLive, linkKey, parseToken, revokedKey, sgToday, sha256Hex, type Link, type Store } from "./logic";

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
    for (const args of [{}, { text: " " }, { text: "x".repeat(5001) }, { text: "x", platform: "myspace" }, { text: "x", scheduledFor: "2026-13-40" }, { text: "x", scheduledFor: "tomorrow" }]) {
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
