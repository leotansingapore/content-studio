// Content Studio as an MCP server for Claude: the protocol (JSON-RPC over
// plain HTTP POST, no streaming, no sessions) and six tools over one adviser's
// synced data. Pure: storage comes in as a Store, so it is all unit-tested
// (logic.test.ts) and index.ts only wires HTTP and Supabase.
//
// North star phase 6 (agent-mcp-api): a link whose user is on NORTH_STAR_USERS
// (index.ts sets Caller.leo) also gets seven read tools, three prompts plus one
// per saved skill, get_brand's speaker and learnings, an activity row for each
// add_draft, and a daily cap of its tool calls (mcp-calls). Every other link
// answers exactly as before (fixtures/everyone.json) and is never counted.
//
// The connection link is https://<project>/functions/v1/content-studio-mcp/<token>,
// token = "<scope>.<secret>" where scope is the adviser's user id, or
// "<user id>~<profile id>" for a second brand profile (profiles.ts scoped()).
// The app stores only SHA-256(secret), under the synced key
// content-studio-mcplink-<hash>-<scope>; the link works only while that row
// exists for that user and no content-studio-mcprevoked-<hash>-<scope> row does.

import { hasComplianceErrors, scanCompliance } from "../_shared/compliance.ts";
import { consumeUsage, DAILY_LIMITS, refundUsage, type UsageClient } from "../_shared/usageCaps.ts";
import { profilesFrom, reportFacts, sgDay, weekMoves, weekReport } from "../notify/logic.ts";

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
  /** Every row whose key starts with `prefix`, a fixed literal of this file's (no % or _). */
  all(prefix: string): Promise<{ key: string; data: string }[]>;
}

/** What index.ts knows about the link: its user is on NORTH_STAR_USERS, its name, and the client that counts uses. */
export interface Caller {
  leo: boolean;
  name?: string;
  usage?: UsageClient;
}
const EVERYONE: Caller = { leo: false };

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
    description: "Who the adviser is and how they write: positioning (goal, audience, topics, edge, main platform, posts a week), brand kit (name, handle, role, sign-off) and voice summary. Read this before drafting.",
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

const LIMIT = { type: "number", description: "1 to 30, default 15." };

/** The tools only a link on NORTH_STAR_USERS lists: reads, plus a wording check. Nothing here spends money. */
export const NEW_TOOLS = [
  {
    name: "check_post",
    description:
      "Check any text against MAS advertising wording: each flag is a warn or an error, and ok is false while an error remains. Fix every error before add_draft.",
    inputSchema: { type: "object", properties: { text: { type: "string", description: "The post as it will be published." } }, required: ["text"] },
  },
  {
    name: "get_week",
    description:
      "The brand's last 7 days against the 7 before: posts, numbers, best and weakest posts and the accounts it follows, plus the moves those numbers support. Pick the move yourself.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "list_following_posts",
    description:
      "The newest posts of the accounts this brand follows: handle, platform, link, caption, date and numbers; new marks posts found on the latest check. Sources to remix: keep the structure, never the words.",
    inputSchema: { type: "object", properties: { limit: LIMIT } },
  },
  {
    name: "list_competitor_posts",
    description: "The newest Instagram and TikTok posts of this brand's competitors, in list_following_posts' shape.",
    inputSchema: { type: "object", properties: { limit: LIMIT } },
  },
  {
    name: "list_competitor_ads",
    description:
      "The newest Meta ads of this brand's competitors: advertiser, Ad Library link, ad text, start date and whether it still runs; new marks ads found on the latest check.",
    inputSchema: { type: "object", properties: { limit: LIMIT } },
  },
  {
    name: "list_skills",
    description: "The skills this brand runs in Content Studio's agent chat, ready-made and saved: name, slash and what each does.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_activity",
    description: "What ran in Content Studio for this brand, newest first, at most 100: who did it (you, the agent, Claude, autopilot) and what changed.",
    inputSchema: { type: "object", properties: { days: { type: "number", description: "1 to 30, default 7." } } },
  },
] as const;
export const LEO_TOOLS = [...TOOLS, ...NEW_TOOLS];
const toolsFor = (caller: Caller): readonly { name: string }[] => (caller.leo ? LEO_TOOLS : TOOLS);

/** One plain line per tool for Connect Claude's "What Claude can do" list, read from the same list the server answers. */
export const TOOL_LINES: Record<(typeof LEO_TOOLS)[number]["name"], string> = {
  list_posts: "Your posts, newest first",
  get_post: "One post in full, with its results",
  get_calendar: "What's scheduled, day by day",
  get_results: "Your logged results and best posts",
  get_brand: "Your brand, voice and learnings",
  add_draft: "Saves a draft to My posts",
  check_post: "MAS wording check on any text",
  get_week: "Your last 7 days against the 7 before",
  list_following_posts: "New posts from accounts you follow",
  list_competitor_posts: "Your competitors' newest posts",
  list_competitor_ads: "Your competitors' newest ads",
  list_skills: "Your skills, ready-made and saved",
  get_activity: "What ran lately, and who ran it",
};

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

// ---------- phase 6 reads (Leo's links only) ----------

const DAY_MS = 86_400_000;
const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);
const count = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);
const listLimit = (v: unknown) => Math.min(30, Math.max(1, Math.round(Number(v) || 15)));
const newestFirst = (a: { postedAt: string | null }, b: { postedAt: string | null }) => (b.postedAt ?? "").localeCompare(a.postedAt ?? "");

export const CHECK_NOTE = "Warnings only: the adviser decides. Fix every error before add_draft.";
export const LIMIT_LINE = `Content Studio's daily limit of ${DAILY_LIMITS["mcp-calls"]} calls is used. It resets at 8am Singapore time.`;
export const BUSY_LINE = "Content Studio can't take this call for a moment. Try again shortly.";

/** Following's accounts (or a competitor's, in the same shape) as one list of their posts, newest first. */
function trackedPosts(accounts: unknown[], limit: number) {
  const out = [];
  for (const raw of accounts.slice(0, 24)) {
    const a = raw as { handle?: unknown; platform?: unknown; posts?: unknown; fresh?: unknown } | null;
    if (!a || typeof a.handle !== "string" || !Array.isArray(a.posts)) continue;
    const fresh = new Set(Array.isArray(a.fresh) ? a.fresh : []);
    for (const x of a.posts.slice(0, 60)) {
      const p = x as Record<string, unknown> | null;
      if (!p || typeof p.id !== "string") continue;
      out.push({
        handle: a.handle,
        platform: str(a.platform) ?? "",
        url: str(p.url) ?? "",
        caption: (str(p.caption) ?? "").slice(0, 600),
        postedAt: str(p.postedAt) ?? null,
        views: count(p.views),
        likes: count(p.likes) ?? 0,
        comments: count(p.comments) ?? 0,
        new: fresh.has(p.id),
      });
    }
  }
  return out.sort(newestFirst).slice(0, limit);
}

/** competitorAds.ts's store (keyed by competitor id) in list_following_posts' shape, newest start first. */
function competitorAds(state: unknown, limit: number) {
  if (!state || typeof state !== "object" || Array.isArray(state)) return [];
  const out = [];
  for (const [id, raw] of Object.entries(state).slice(0, 12)) {
    const e = raw as { pageName?: unknown; ads?: unknown; fresh?: unknown } | null;
    if (!e || !Array.isArray(e.ads)) continue;
    const fresh = new Set(Array.isArray(e.fresh) ? e.fresh : []);
    for (const x of e.ads.slice(0, 30)) {
      const ad = x as Record<string, unknown> | null;
      if (!ad || typeof ad.id !== "string") continue;
      out.push({
        handle: str(e.pageName) || id,
        platform: "meta",
        url: /^\d{1,30}$/.test(ad.id) ? `https://www.facebook.com/ads/library/?id=${ad.id}` : "",
        caption: [str(ad.headline), str(ad.body)].filter(Boolean).join("\n").slice(0, 600),
        postedAt: str(ad.start) ?? null,
        running: ad.active === true,
        versions: count(ad.versions) ?? 1,
        new: fresh.has(ad.id),
      });
    }
  }
  return out.sort(newestFirst).slice(0, limit);
}

/** chatSkills' four built-ins (agent-skills); they run in the agent chat, so Claude gets their names only. */
const BUILT_IN_SKILLS = [
  { name: "Check before posting", slash: "/check", description: "Checks one post's wording, stated facts, how human it sounds and its predicted score." },
  { name: "Weekly retro", slash: "/retro", description: "The last 7 days against the 7 before, and the one move to make this week." },
  { name: "Check this week's posts", slash: "/check-week", description: "Checks the wording of every post scheduled in the next 7 days." },
  { name: "Answer a competitor's new ad", slash: "/answer", description: "Three post angles that answer a competitor's newest ad." },
];

interface SavedSkill {
  name: string;
  slash: string;
  instruction: string;
  works: "post" | "new";
}

/** The brand's own skills (content-studio-chatskills-<scope>, 12 at most), slash without its "/". */
async function savedSkills(store: Store, scope: string): Promise<SavedSkill[]> {
  const list = parseJson<unknown>(await store.get(`content-studio-chatskills-${scope}`), []);
  return (Array.isArray(list) ? list : []).slice(0, 12).flatMap((raw) => {
    const s = raw as Record<string, unknown> | null;
    const slash = str(s?.slash)?.replace(/^\//, "") ?? "";
    const name = str(s?.name)?.trim().slice(0, 40) ?? "";
    const instruction = str(s?.instruction)?.trim().slice(0, 300) ?? "";
    if (!/^[a-z0-9-]{1,40}$/.test(slash) || !name || !instruction) return [];
    return [{ name, slash, instruction, works: s?.works === "post" ? "post" : "new" }];
  });
}

const ACTIVITY_PREFIX = "content-studio-activity-";
const ACTIVITY_INBOX_PREFIX = "content-studio-activityin-";
const WHO = ["you", "agent", "claude", "autopilot", "schedule"];
const EVENT_ID = /^[a-z0-9][a-z0-9_-]{0,63}$/i;

/** activity.ts's event, read back for Claude; null when the row holds something else. */
function activityEvent(raw: unknown, id: unknown) {
  const e = raw as Record<string, unknown> | null;
  const at = Date.parse(str(e?.at) ?? "");
  const title = str(e?.title)?.trim().slice(0, 120);
  if (!e || typeof id !== "string" || !EVENT_ID.test(id) || Number.isNaN(at) || !title || !WHO.includes(e.who as string)) return null;
  const detail = str(e.detail)?.trim().slice(0, 300);
  const link = str(e.link);
  return { id, at: new Date(at).toISOString(), who: e.who as string, kind: str(e.kind) ?? "", title, ...(detail ? { detail } : {}), ...(link ? { link } : {}) };
}

/** This brand's events from the last `days`: every device's month rows plus inbox rows not yet moved in, one per id. */
async function recentActivity(store: Store, scope: string, days: number, now: Date) {
  const since = now.getTime() - days * DAY_MS;
  // rows are per device-local month, so a day either side covers every time zone
  const months = new Set<string>();
  for (let t = since - DAY_MS; t <= now.getTime() + DAY_MS; t += DAY_MS) months.add(new Date(t).toISOString().slice(0, 7));
  const rows = (await Promise.all([...[...months].map((m) => store.all(`${ACTIVITY_PREFIX}${m}-`)), store.all(ACTIVITY_INBOX_PREFIX)])).flat();
  const suffix = `-${scope}`;
  const byId = new Map<string, NonNullable<ReturnType<typeof activityEvent>>>();
  for (const { key, data } of rows) {
    if (!key.endsWith(suffix)) continue;
    const middle = key.slice(0, -suffix.length);
    let events: unknown[] = [];
    if (middle.startsWith(ACTIVITY_INBOX_PREFIX)) events = [activityEvent(parseJson<unknown>(data, null), middle.slice(ACTIVITY_INBOX_PREFIX.length))];
    else if (/^\d{4}-\d{2}-[a-z0-9]{6}$/.test(middle.slice(ACTIVITY_PREFIX.length))) {
      const list = parseJson<unknown>(data, []);
      events = Array.isArray(list) ? list.map((e) => activityEvent(e, (e as { id?: unknown } | null)?.id)) : [];
    }
    for (const e of events as ReturnType<typeof activityEvent>[]) if (e && Date.parse(e.at) >= since && !byId.has(e.id)) byId.set(e.id, e);
  }
  return [...byId.values()].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 100).map(({ id: _id, ...e }) => e);
}

export async function callTool(name: string, args: Args, store: Store, link: Link, now = new Date(), caller: Caller = EVERYONE): Promise<ToolResult> {
  const scope = link.scope;
  if (!toolsFor(caller).some((t) => t.name === name)) return fail(`Unknown tool ${name}.`);
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
      const answer = {
        positioning: pick(pos, ["goal", "goalKind", "oneLiner", "audience", "audienceDetail", "topics", "edge", "platform", "cadence"]),
        brandKit: pick(brand, ["name", "handle", "role", "signOff", "color"]),
        voiceSummary: typeof voice.voiceSummary === "string" ? voice.voiceSummary : null,
      };
      if (!caller.leo) return ok(answer);
      // remixBrand.ts speakerFor: the main brand is a person, another speaks as one only with a role or a photo
      const person = scope === link.userId || !!str(brand.role)?.trim() || !!brand.photo;
      const learned = parseJson<unknown>(await store.get(`content-studio-learnings-${scope}`), []);
      const learnings = (Array.isArray(learned) ? learned : []).flatMap((raw) => {
        const l = raw as Record<string, unknown> | null;
        const text = str(l?.text)?.replace(/\s+/g, " ").trim().slice(0, 140);
        const on = l && !l.offAt && ["posts", "videos", "pictures", "all"].includes(l.scope as string);
        return text && on ? [{ text, scope: l.scope as string }] : [];
      });
      return ok({ ...answer, speaker: person ? "person" : "business", learnings: learnings.slice(0, 30) });
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
          if (caller.leo) {
            // /activity's row for it (activity.ts absorbs the inbox row; the id is the draft's, so it shows once)
            const event = {
              at: entry.createdAt,
              who: "claude",
              kind: "post",
              title: `Added a draft: "${heading.replace(/\s+/g, " ").slice(0, 100)}"`,
              detail: `Through your "${caller.name || "Claude"}" link.`,
              link: `/generate?draft=${id}`,
            };
            try {
              await store.insert(`${ACTIVITY_INBOX_PREFIX}${id}-${scope}`, JSON.stringify(event));
            } catch {
              // the draft is saved; a missing log row loses nothing
            }
          }
          return ok({ saved: true, id, status: entry.status, note: "It shows in My posts the next time Content Studio opens." });
        }
      }
      return fail(`${MAX_INBOX} drafts from Claude are waiting. Open Content Studio once to bring them into My posts, then try again.`);
    }
    case "check_post": {
      const text = typeof args.text === "string" ? args.text : "";
      if (!text.trim()) return fail("text is required.");
      if (text.length > 5000) return fail("text is over 5,000 characters.");
      const flags = scanCompliance(text);
      return ok({ flags: flags.map(({ match, severity, message }) => ({ match, severity, message })), ok: !hasComplianceErrors(flags), note: CHECK_NOTE });
    }
    case "get_week": {
      // the Monday email's and Analytics' This week report, from this brand's rows only (notify's profilesFrom)
      const id = scope === link.userId ? "me" : scope.slice(link.userId.length + 1);
      const data: Record<string, string> = { [`content-studio-profiles-${link.userId}`]: JSON.stringify([{ id, name: "Brand" }]) };
      const keys = ["drafts", "goals", "positioning", "following"].map((k) => `content-studio-${k}-${scope}`);
      (await Promise.all(keys.map((k) => store.get(k)))).forEach((v, i) => v !== null && (data[keys[i]] = v));
      const brand = profilesFrom(link.userId, data).find((p) => p.id === id);
      if (!brand) return fail("This brand's week can't be read.");
      const goal = Object.values(brand.goals).reduce((s, n) => s + n, 0);
      const report = weekReport(brand.posts, brand.followed ?? [], sgDay(now.getTime()), goal);
      return ok({ facts: reportFacts(report), moves: weekMoves(report) });
    }
    case "list_following_posts":
      return ok({ posts: trackedPosts(parseJson<unknown[]>(await store.get(`content-studio-following-${scope}`), []) ?? [], listLimit(args.limit)) });
    case "list_competitor_posts": {
      const state = parseJson<unknown>(await store.get(`content-studio-competitor-posts-${scope}`), {});
      return ok({ posts: trackedPosts(state && typeof state === "object" && !Array.isArray(state) ? Object.values(state) : [], listLimit(args.limit)) });
    }
    case "list_competitor_ads":
      return ok({ ads: competitorAds(parseJson<unknown>(await store.get(`content-studio-competitor-ads-${scope}`), {}), listLimit(args.limit)) });
    case "list_skills": {
      const mine = (await savedSkills(store, scope)).map((s) => ({ name: s.name, slash: `/${s.slash}`, description: s.instruction, worksOn: s.works === "post" ? "one of my posts" : "a new post" }));
      return ok({ skills: [...BUILT_IN_SKILLS, ...mine], note: "These run in Content Studio's agent chat. Each saved skill is also a prompt here." });
    }
    case "get_activity": {
      const days = Math.min(30, Math.max(1, Math.round(Number(args.days) || 7)));
      return ok({ days, events: await recentActivity(store, scope, days, now) });
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
export const LEO_INSTRUCTIONS =
  "Content Studio is a Singapore financial adviser's social media workspace. Read get_brand before drafting. When you remix someone else's post, keep its structure and write new words: never copy its wording, brand or claims. Posts must suit MAS advertising rules: no guarantees, no 'risk-free', no promises of returns, no named insurer products, no invented numbers. Run check_post before add_draft. If get_brand says the speaker is business, write as the business, with no adviser wording.";

// ---------- prompts (Leo's links only) ----------

const POST_ID = { name: "id", description: "The post's id, from list_posts.", required: true };
const PROMPTS = [
  {
    name: "remix_post",
    description: "Remix a post into a new one in your voice, checked and saved as a draft.",
    arguments: [{ name: "source", description: "A link to the post, or its text pasted in.", required: true }],
    text: "Read get_brand. Take the structure of this post, its hook type, beats and format, and write a new post for this adviser in their voice. Never reuse its words, brand or claims. Run check_post, fix every error, then save it with add_draft and tell me what you kept and what you changed.",
  },
  {
    name: "weekly_retro",
    description: "How your last 7 days went, and the one move to make this week.",
    text: "Call get_week. Tell me in five lines how my last 7 days went against the 7 before, then pick the one move from the list you would make this week and say why.",
  },
  {
    name: "check_before_posting",
    description: "What to fix in one of your posts before it goes out.",
    arguments: [POST_ID],
    text: "Call get_post for this id, run check_post on its text, and tell me what to fix before it goes out. Do not change the post.",
  },
];

/** The three prompts, then one per saved skill named after its slash. */
async function promptsFor(store: Store, scope: string) {
  const mine = (await savedSkills(store, scope)).map((s) => ({
    name: s.slash,
    description: s.name,
    ...(s.works === "post" ? { arguments: [POST_ID] } : {}),
    text:
      s.works === "post"
        ? `Call get_post for this id, then: ${s.instruction} Run check_post, fix every error, then save the result with add_draft as a new draft. Do not change the original post.`
        : `Read get_brand, then write a new post: ${s.instruction} Run check_post, fix every error, then save it with add_draft.`,
  }));
  return [...PROMPTS, ...mine.filter((p) => !PROMPTS.some((x) => x.name === p.name))];
}

/** The reply to one JSON-RPC message, or null for a notification (no reply). */
export async function handleRpc(msg: RpcRequest, store: Store, link: Link, now = new Date(), caller: Caller = EVERYONE): Promise<object | null> {
  const id = msg.id ?? null;
  const reply = (result: unknown) => ({ jsonrpc: "2.0", id, result });
  const error = (code: number, message: string) => ({ jsonrpc: "2.0", id, error: { code, message } });
  if (typeof msg.method !== "string") return error(-32600, "Invalid request");
  if (msg.id === undefined) return null; // notifications/initialized and friends
  if (caller.leo && msg.method === "prompts/list") {
    return reply({ prompts: (await promptsFor(store, link.scope)).map(({ text: _t, ...p }) => p) });
  }
  if (caller.leo && msg.method === "prompts/get") {
    const name = typeof msg.params?.name === "string" ? msg.params.name : "";
    const prompt = (await promptsFor(store, link.scope)).find((p) => p.name === name);
    if (!prompt) return error(-32602, `Unknown prompt ${name}`);
    const given = (msg.params?.arguments && typeof msg.params.arguments === "object" ? msg.params.arguments : {}) as Args;
    const filled: string[] = [];
    for (const a of prompt.arguments ?? []) {
      const v = typeof given[a.name] === "string" ? (given[a.name] as string).trim().slice(0, 5000) : "";
      if (!v) return error(-32602, `Missing argument ${a.name}`);
      filled.push(a.name === "source" ? `The post:\n${v}` : `The post id: ${v}`);
    }
    return reply({ description: prompt.description, messages: [{ role: "user", content: { type: "text", text: [prompt.text, ...filled].join("\n\n") } }] });
  }
  switch (msg.method) {
    case "initialize": {
      const asked = typeof msg.params?.protocolVersion === "string" ? msg.params.protocolVersion : "";
      return reply({
        protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
        capabilities: caller.leo ? { tools: { listChanged: false }, prompts: { listChanged: false } } : { tools: { listChanged: false } },
        serverInfo: { name: "content-studio", version: "1.0.0" },
        instructions: caller.leo ? LEO_INSTRUCTIONS : INSTRUCTIONS,
      });
    }
    case "ping":
      return reply({});
    case "tools/list":
      return reply({ tools: toolsFor(caller) });
    case "tools/call": {
      const name = typeof msg.params?.name === "string" ? msg.params.name : "";
      const args = msg.params?.arguments && typeof msg.params.arguments === "object" ? (msg.params.arguments as Args) : {};
      if (!toolsFor(caller).some((t) => t.name === name)) return error(-32602, `Unknown tool ${name}`);
      if (!caller.leo) return reply(await callTool(name, args, store, link, now));
      // one mcp-calls use per call on a listed link, before anything is read or saved; the counter's day is UTC
      const day = now.toISOString().slice(0, 10);
      const use = caller.usage ? await consumeUsage(caller.usage, link.userId, "mcp-calls") : null;
      if (!use || use.allowed === false) return reply(fail(use?.allowed === false && use.reason === "limit" ? LIMIT_LINE : BUSY_LINE));
      try {
        return reply(await callTool(name, args, store, link, now, caller));
      } catch (e) {
        // the store never answered: the use goes back, and index.ts says try again
        await refundUsage(caller.usage!, link.userId, "mcp-calls", day);
        throw e;
      }
    }
    default:
      return error(-32601, `Method not found: ${msg.method}`);
  }
}
