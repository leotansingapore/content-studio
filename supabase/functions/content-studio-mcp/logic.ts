// Content Studio as an MCP server for Claude: the protocol (JSON-RPC over
// plain HTTP POST, no streaming, no sessions) and six tools over one adviser's
// synced data. Pure: storage comes in as a Store, so it is all unit-tested
// (logic.test.ts) and index.ts only wires HTTP and Supabase.
//
// The connection link is https://<project>/functions/v1/content-studio-mcp/<token>,
// token = "<scope>.<secret>" where scope is the adviser's user id, or
// "<user id>~<profile id>" for a second brand profile (profiles.ts scoped()).
// The app stores only SHA-256(secret), under the synced key
// content-studio-mcplink-<hash>-<scope>; the link works only while that row
// exists for that user and no content-studio-mcprevoked-<hash>-<scope> row does.

export const LINK_PREFIX = "content-studio-mcplink-";
/** Drafts Claude adds: one row per slot, merged into My posts by the app (draftHistory.ts). */
export const INBOX_PREFIX = "content-studio-mcpdraft-";
export const MAX_INBOX = 20;
export const PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];

const SCOPE = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:~[A-Za-z0-9_-]{1,40})?$/i;
const SECRET = /^[A-Za-z0-9_-]{43}$/;

export interface Link {
  userId: string;
  scope: string;
  secret: string;
}

/** The scope and secret in a link's token, or null when it isn't one. */
export function parseToken(token: string): Link | null {
  const at = token.lastIndexOf(".");
  if (at < 0) return null;
  const scope = token.slice(0, at);
  const secret = token.slice(at + 1);
  const m = SCOPE.exec(scope);
  if (!m || !SECRET.test(secret)) return null;
  return { userId: m[1].toLowerCase(), scope, secret };
}

export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const linkKey = (hash: string, scope: string) => `${LINK_PREFIX}${hash}-${scope}`;
/**
 * Turning a link off writes this row and never deletes it. The sync has no
 * tombstones (another device re-uploads a deleted key it still holds), so a
 * revocation that relied on deleting the link row could come back; a stray
 * copy of this row can only ever turn a link off again.
 */
export const REVOKED_PREFIX = "content-studio-mcprevoked-";
export const revokedKey = (hash: string, scope: string) => `${REVOKED_PREFIX}${hash}-${scope}`;

/** Live only when the link row is there and no revoked row is. */
export function linkIsLive(keysFound: string[], hash: string, scope: string): boolean {
  return keysFound.includes(linkKey(hash, scope)) && !keysFound.includes(revokedKey(hash, scope));
}

/** One adviser's synced rows. Implementations must stay inside that adviser's user id. */
export interface Store {
  get(key: string): Promise<string | null>;
  /** Inserts a new row; false when the key is already taken (the primary key decides, so it is atomic). */
  insert(key: string, data: string): Promise<boolean>;
}

/** Inbox slot keys: at most MAX_INBOX drafts wait at once, enforced by the table's primary key. */
export const inboxKey = (slot: number, scope: string) => `${INBOX_PREFIX}claude-s${String(slot).padStart(2, "0")}-${scope}`;

// ---------- the adviser's data ----------

interface Metrics {
  impressions?: number;
  reactions?: number;
  comments?: number;
  shares?: number;
}

interface Draft {
  id: string;
  createdAt?: string;
  hook?: string;
  draft?: string;
  format?: string;
  platform?: string;
  status?: "draft" | "scheduled" | "posted";
  scheduledFor?: string;
  postedAt?: string;
  metrics?: Metrics;
  repeat?: { every?: string };
}

function parseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function drafts(store: Store, scope: string): Promise<Draft[]> {
  const list = parseJson<unknown>(await store.get(`content-studio-drafts-${scope}`), []);
  return Array.isArray(list) ? list.filter((d): d is Draft => !!d && typeof (d as Draft).id === "string") : [];
}

const statusOf = (d: Draft) => d.status ?? "draft";
const engaged = (m?: Metrics) => (m?.reactions ?? 0) + (m?.comments ?? 0) + (m?.shares ?? 0);
const title = (d: Draft) => (d.hook || d.draft || "").replace(/\s+/g, " ").trim().slice(0, 120);

function summary(d: Draft) {
  return {
    id: d.id,
    title: title(d),
    platform: d.platform,
    format: d.format,
    status: statusOf(d),
    ...(d.scheduledFor ? { scheduledFor: d.scheduledFor } : {}),
    ...(d.postedAt ? { postedAt: d.postedAt } : {}),
    ...(d.repeat?.every ? { repeats: d.repeat.every } : {}),
  };
}

// ---------- tools ----------

const PLATFORMS = ["linkedin", "instagram", "facebook", "tiktok"];
const FORMATS = ["text-post", "carousel", "short-video", "story"];
const WHEN = /^\d{4}-\d{2}-\d{2}(T(?:[01]\d|2[0-3]):[0-5]\d)?$/;

export const TOOLS = [
  {
    name: "list_posts",
    description: "List the adviser's posts in Content Studio (newest first): drafts, scheduled and posted, with ids for get_post.",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["all", "draft", "scheduled", "posted"], description: "Default all." },
        limit: { type: "number", description: "1 to 50, default 20." },
      },
    },
  },
  {
    name: "get_post",
    description: "The full text and details of one post, including its results when they were logged.",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
  },
  {
    name: "get_calendar",
    description: "Posts scheduled from a date (YYYY-MM-DD, default today in Singapore) for a number of days (default 14, at most 90).",
    inputSchema: { type: "object", properties: { from: { type: "string" }, days: { type: "number" } } },
  },
  {
    name: "get_results",
    description: "Results of posted posts the adviser logged: totals, engagement rate (reactions, comments and shares over impressions) and the best posts.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_brand",
    description: "Who the adviser is and how they write: positioning (audience, topics, edge, main platform, posts a week), brand kit (name, handle, role, sign-off) and voice summary. Read this before drafting.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "add_draft",
    description:
      "Save a post to the adviser's My posts as a draft, or scheduled when scheduledFor is given. It appears the next time Content Studio opens, where MAS wording is checked before posting. Write only facts the adviser gave you.",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "The post as it will be published." },
        title: { type: "string", description: "Short title or hook, up to 160 characters." },
        platform: { type: "string", enum: PLATFORMS },
        format: { type: "string", enum: FORMATS },
        scheduledFor: { type: "string", description: "YYYY-MM-DD, or YYYY-MM-DDTHH:MM in Singapore time." },
      },
      required: ["text"],
    },
  },
] as const;

type Args = Record<string, unknown>;
export interface ToolResult {
  content: { type: "text"; text: string }[];
  isError?: boolean;
}
const ok = (value: unknown): ToolResult => ({ content: [{ type: "text", text: JSON.stringify(value, null, 2) }] });
const fail = (text: string): ToolResult => ({ content: [{ type: "text", text }], isError: true });

/** Today in Singapore as YYYY-MM-DD. */
export function sgToday(now = new Date()): string {
  return new Date(now.getTime() + 8 * 3_600_000).toISOString().slice(0, 10);
}

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const validDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

export async function callTool(name: string, args: Args, store: Store, link: Link, now = new Date()): Promise<ToolResult> {
  const scope = link.scope;
  switch (name) {
    case "list_posts": {
      const status = typeof args.status === "string" ? args.status : "all";
      const limit = Math.min(50, Math.max(1, Math.round(Number(args.limit) || 20)));
      const list = (await drafts(store, scope)).filter((d) => status === "all" || statusOf(d) === status);
      return ok({ count: list.length, posts: list.slice(0, limit).map(summary) });
    }
    case "get_post": {
      const d = (await drafts(store, scope)).find((x) => x.id === args.id);
      if (!d) return fail("No post with that id. Use list_posts for ids.");
      const rate = d.metrics?.impressions ? Math.round((engaged(d.metrics) / d.metrics.impressions) * 1000) / 10 : undefined;
      return ok({ ...summary(d), text: d.draft ?? "", ...(d.metrics ? { results: { ...d.metrics, engagementRate: rate } } : {}) });
    }
    case "get_calendar": {
      const from = typeof args.from === "string" && validDay(args.from) ? args.from : sgToday(now);
      const days = Math.min(90, Math.max(1, Math.round(Number(args.days) || 14)));
      const to = addDays(from, days);
      const list = (await drafts(store, scope))
        .filter((d) => statusOf(d) === "scheduled" && d.scheduledFor && d.scheduledFor.slice(0, 10) >= from && d.scheduledFor.slice(0, 10) < to)
        .sort((a, b) => (a.scheduledFor ?? "").localeCompare(b.scheduledFor ?? ""));
      return ok({ from, to: addDays(to, -1), posts: list.map(summary) });
    }
    case "get_results": {
      const posted = (await drafts(store, scope)).filter((d) => statusOf(d) === "posted" && d.metrics && (d.metrics.impressions || engaged(d.metrics)));
      const impressions = posted.reduce((n, d) => n + (d.metrics?.impressions ?? 0), 0);
      const engagement = posted.reduce((n, d) => n + engaged(d.metrics), 0);
      const rated = posted
        .filter((d) => d.metrics?.impressions)
        .map((d) => ({ ...summary(d), impressions: d.metrics!.impressions, engagement: engaged(d.metrics), engagementRate: Math.round((engaged(d.metrics) / d.metrics!.impressions!) * 1000) / 10 }))
        .sort((a, b) => b.engagementRate - a.engagementRate);
      return ok({
        postsWithResults: posted.length,
        impressions,
        engagement,
        engagementRate: impressions ? Math.round((engagement / impressions) * 1000) / 10 : null,
        best: rated.slice(0, 5),
      });
    }
    case "get_brand": {
      const pos = parseJson<Record<string, unknown>>(await store.get(`content-studio-positioning-${scope}`), {});
      const brand = parseJson<Record<string, unknown>>(await store.get(`content-studio-carousel-brand-${scope}`), {});
      const voice = parseJson<Record<string, unknown>>(await store.get(`content-studio-voice-${scope}`), {});
      const pick = (o: Record<string, unknown>, keys: string[]) => Object.fromEntries(keys.filter((k) => o[k] !== undefined && o[k] !== "").map((k) => [k, o[k]]));
      return ok({
        positioning: pick(pos, ["oneLiner", "audience", "audienceDetail", "topics", "edge", "platform", "cadence"]),
        brandKit: pick(brand, ["name", "handle", "role", "signOff", "color"]),
        voiceSummary: typeof voice.voiceSummary === "string" ? voice.voiceSummary : null,
      });
    }
    case "add_draft": {
      const text = typeof args.text === "string" ? args.text.trim() : "";
      if (!text) return fail("text is required.");
      if (text.length > 5000) return fail("text is over 5,000 characters.");
      const platform = typeof args.platform === "string" ? args.platform : undefined;
      if (platform && !PLATFORMS.includes(platform)) return fail(`platform must be one of ${PLATFORMS.join(", ")}.`);
      const format = typeof args.format === "string" ? args.format : undefined;
      if (format && !FORMATS.includes(format)) return fail(`format must be one of ${FORMATS.join(", ")}.`);
      const when = typeof args.scheduledFor === "string" ? args.scheduledFor : undefined;
      if (when && (!WHEN.test(when) || !validDay(when.slice(0, 10)))) return fail("scheduledFor must be YYYY-MM-DD or YYYY-MM-DDTHH:MM.");
      const pos = parseJson<Record<string, unknown>>(await store.get(`content-studio-positioning-${scope}`), {});
      const heading = (typeof args.title === "string" && args.title.trim() ? args.title : text.split("\n")[0]).trim().slice(0, 160);
      // never a uuid: a uuid in a synced key reads as another user's (cloudSync.ts)
      const id = `claude-${now.getTime().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
      const entry = {
        id,
        createdAt: now.toISOString(),
        hook: heading,
        draft: text,
        pillar: "topic",
        pillarDetail: heading,
        audience: "general",
        format: format ?? "text-post",
        platform: platform ?? (typeof pos.platform === "string" && PLATFORMS.includes(pos.platform) ? pos.platform : "linkedin"),
        ctaType: "comment-keyword",
        status: when ? "scheduled" : "draft",
        ...(when ? { scheduledFor: when } : {}),
      };
      const data = JSON.stringify(entry);
      for (let slot = 0; slot < MAX_INBOX; slot++) {
        if (await store.insert(inboxKey(slot, scope), data)) {
          return ok({ saved: true, id, status: entry.status, note: "It shows in My posts the next time Content Studio opens." });
        }
      }
      return fail(`${MAX_INBOX} drafts from Claude are waiting. Open Content Studio once to bring them into My posts, then try again.`);
    }
    default:
      return fail(`Unknown tool ${name}.`);
  }
}

// ---------- JSON-RPC ----------

interface RpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

const INSTRUCTIONS =
  "Content Studio is a Singapore financial adviser's social media workspace. Read get_brand before drafting. Posts must suit MAS advertising rules: no guarantees, no 'risk-free', no promises of returns.";

/** The reply to one JSON-RPC message, or null for a notification (no reply). */
export async function handleRpc(msg: RpcRequest, store: Store, link: Link, now = new Date()): Promise<object | null> {
  const id = msg.id ?? null;
  const reply = (result: unknown) => ({ jsonrpc: "2.0", id, result });
  const error = (code: number, message: string) => ({ jsonrpc: "2.0", id, error: { code, message } });
  if (typeof msg.method !== "string") return error(-32600, "Invalid request");
  if (msg.id === undefined) return null; // notifications/initialized and friends
  switch (msg.method) {
    case "initialize": {
      const asked = typeof msg.params?.protocolVersion === "string" ? msg.params.protocolVersion : "";
      return reply({
        protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "content-studio", version: "1.0.0" },
        instructions: INSTRUCTIONS,
      });
    }
    case "ping":
      return reply({});
    case "tools/list":
      return reply({ tools: TOOLS });
    case "tools/call": {
      const name = typeof msg.params?.name === "string" ? msg.params.name : "";
      const args = msg.params?.arguments && typeof msg.params.arguments === "object" ? (msg.params.arguments as Args) : {};
      if (!TOOLS.some((t) => t.name === name)) return error(-32602, `Unknown tool ${name}`);
      return reply(await callTool(name, args, store, link, now));
    }
    default:
      return error(-32601, `Method not found: ${msg.method}`);
  }
}
