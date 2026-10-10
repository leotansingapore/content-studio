// Auto-DM (Recruit > Auto-DM): an adviser's comment keyword -> DM automations. Zernio runs them itself
// (comment-automations: webhook plus a 10-minute catch-up, one answer per comment); this file lists,
// checks and writes them. Every id from a request passes the checks in _shared/zernio.ts before Zernio
// sees it (rules H1, M1, M2, H3 in docs/zernio-connection.md). Shapes are from
// https://zernio.com/openapi.json as of 2026-10-11. Pure: Zernio comes in. Also imported by the app, so
// the form shows the same refusals before it sends.

import {
  NotYours,
  SOCIAL_PLATFORMS,
  ZernioError,
  callerAccounts,
  checkAutomation,
  isProfileId,
  isZernioId,
  pathId,
  refId,
  requireAccounts,
  scopedList,
  type Zernio,
} from "../_shared/zernio.ts";

export const AUTOMATION_ACTIONS = ["automations", "automation-create", "automation-update", "automation-delete", "automation-logs", "account-posts"] as const;
export type AutomationAction = (typeof AUTOMATION_ACTIONS)[number];

/** Counted against the social-automation-write cap; the rest are reads. */
export const isAutomationWrite = (a: string) => a === "automation-create" || a === "automation-update" || a === "automation-delete";

/** Platforms with a private reply to a comment. On the others Zernio posts the public reply only. */
export const DM_PLATFORMS = ["instagram", "facebook"];
export const TRIGGERS = ["comment", "story_reply", "story_mention"] as const;
export type Trigger = (typeof TRIGGERS)[number];

export const LIMITS = { keywords: 10, keyword: 50, dm: 1000, dmWithButtons: 640, dmVariations: 3, buttons: 3, buttonTitle: 20, reply: 1000, replyVariations: 5 };

const NAMES: Record<string, string> = { instagram: "Instagram", facebook: "Facebook", tiktok: "TikTok", linkedin: "LinkedIn", youtube: "YouTube", threads: "Threads" };

export interface LinkButton {
  title: string;
  url: string;
}

/** What the form sends for a new or edited automation. */
export interface AutomationInput {
  trigger: Trigger;
  /** The platform's own id for one of the account's latest posts; null answers comments on any post. */
  platformPostId: string | null;
  keywords: string[];
  /** No keywords on purpose: every comment gets the answer. */
  everyComment: boolean;
  dm: string;
  dmVariations: string[];
  buttons: LinkButton[];
  reply: string;
  replyVariations: string[];
  /** Also answer someone who sends the keyword as a DM. */
  alsoMatchInDms: boolean;
  /** Instagram: only followers get the DM; anyone Instagram can't vouch for gets a button to confirm first. */
  followGate: boolean;
}

type Checked<T> = { ok: true; value: T } | { ok: false; error: string };
const refuse = (error: string): Checked<never> => ({ ok: false, error });

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const texts = (v: unknown) => (Array.isArray(v) ? v.map(text).filter(Boolean) : []);
const PLATFORM_POST_ID = /^[A-Za-z0-9_:.-]{1,128}$/;

function linkOk(url: string): boolean {
  try {
    const u = new URL(url);
    return (u.protocol === "https:" || u.protocol === "http:") && !!u.hostname && url.length <= 2000;
  } catch {
    return false;
  }
}

/** The form's fields, checked the same way whatever the platform. Plain words for the adviser. */
export function checkInput(raw: unknown): Checked<AutomationInput> {
  if (!raw || typeof raw !== "object") return refuse("Fill in the auto-DM first.");
  const b = raw as Record<string, unknown>;
  const trigger = (b.trigger ?? "comment") as Trigger;
  if (!TRIGGERS.includes(trigger)) return refuse("That trigger isn't offered here.");
  const seen = new Set<string>();
  const keywords = texts(b.keywords).filter((k) => !seen.has(k.toLowerCase()) && seen.add(k.toLowerCase()));
  const everyComment = b.everyComment === true;
  const platformPostId = b.platformPostId === null || b.platformPostId === undefined || b.platformPostId === "" ? null : b.platformPostId;
  if (platformPostId !== null && (typeof platformPostId !== "string" || !PLATFORM_POST_ID.test(platformPostId))) return refuse("Pick the post again.");
  if (trigger !== "comment" && platformPostId) return refuse("Story replies and mentions answer any story, so leave the post on Any post.");
  if (keywords.length > LIMITS.keywords) return refuse(`Use up to ${LIMITS.keywords} keywords.`);
  if (keywords.some((k) => k.length > LIMITS.keyword)) return refuse(`Keep each keyword under ${LIMITS.keyword + 1} characters.`);
  if (trigger === "story_mention") {
    if (keywords.length) return refuse("A story mention carries no words, so leave the keywords empty.");
  } else if (everyComment && keywords.length) {
    return refuse("Every comment answers all of them, so leave the keywords empty.");
  } else if (!everyComment && !keywords.length) {
    return refuse("Add a keyword, or tick Every comment.");
  }
  const buttons: LinkButton[] = [];
  for (const x of Array.isArray(b.buttons) ? b.buttons : []) {
    const title = text((x as LinkButton | null)?.title);
    const url = text((x as LinkButton | null)?.url);
    if (!title && !url) continue;
    if (!title || title.length > LIMITS.buttonTitle) return refuse(`Give each link button a title of up to ${LIMITS.buttonTitle} characters.`);
    if (!linkOk(url)) return refuse(`Add your own link to "${title}", starting with https://.`);
    buttons.push({ title, url });
  }
  if (buttons.length > LIMITS.buttons) return refuse(`Use up to ${LIMITS.buttons} link buttons.`);
  const dm = text(b.dm);
  const dmVariations = texts(b.dmVariations);
  const dmMax = buttons.length ? LIMITS.dmWithButtons : LIMITS.dm;
  if ([dm, ...dmVariations].some((t) => t.length > dmMax)) return refuse(`Keep the DM under ${dmMax + 1} characters${buttons.length ? " when it has link buttons" : ""}.`);
  if (dmVariations.length > LIMITS.dmVariations) return refuse(`Use up to ${LIMITS.dmVariations} other wordings of the DM.`);
  if (dmVariations.length && !dm) return refuse("Write the DM before its other wordings.");
  const reply = text(b.reply);
  const replyVariations = texts(b.replyVariations);
  if ([reply, ...replyVariations].some((t) => t.length > LIMITS.reply)) return refuse(`Keep the public reply under ${LIMITS.reply + 1} characters.`);
  if (replyVariations.length > LIMITS.replyVariations) return refuse(`Use up to ${LIMITS.replyVariations} other wordings of the public reply.`);
  if (replyVariations.length && !reply) return refuse("Write the public reply before its other wordings.");
  const alsoMatchInDms = b.alsoMatchInDms === true;
  if (alsoMatchInDms && !keywords.length) return refuse("Answering DMs needs a keyword, or every message would get it.");
  if (alsoMatchInDms && trigger === "story_reply") return refuse("Story replies already arrive as DMs.");
  return {
    ok: true,
    value: { trigger, platformPostId, keywords, everyComment, dm, dmVariations, buttons, reply, replyVariations, alsoMatchInDms, followGate: b.followGate === true },
  };
}

/** What the account's platform can do with it, or null when it fits. Before Zernio's own 400. */
export function platformProblem(input: AutomationInput, platform: string): string | null {
  const name = NAMES[platform] ?? platform;
  if (!(SOCIAL_PLATFORMS as readonly string[]).includes(platform)) return "Auto-DM doesn't work on that account.";
  if (input.trigger !== "comment" && platform !== "instagram") return "Story replies and mentions work on Instagram only.";
  if (!DM_PLATFORMS.includes(platform)) {
    if (input.dm || input.dmVariations.length || input.buttons.length || input.alsoMatchInDms || input.followGate) {
      return `${name} can't send a DM from a comment, only a public reply. Remove the DM, link buttons, DM keyword and follower check.`;
    }
    if (!input.reply) return `${name} answers with a public reply only, so write one.`;
    return null;
  }
  if (!input.dm) return "Write the DM they get.";
  if (input.followGate && platform !== "instagram") return "The follower check works on Instagram only.";
  return null;
}

/** The Zernio label: the keywords, or what fires it. */
export function automationName(input: AutomationInput): string {
  const what = input.keywords.length ? input.keywords.join(", ") : input.trigger === "story_mention" ? "Story mentions" : input.trigger === "story_reply" ? "Story replies" : "Every comment";
  return what.slice(0, 80);
}

/** The settings Zernio takes for this platform. DM fields go only to Instagram and Facebook; a story has no public reply. */
export function settingsBody(input: AutomationInput, platform: string, mode: "create" | "update"): Record<string, unknown> {
  const body: Record<string, unknown> = { name: automationName(input), trigger: input.trigger, keywords: input.keywords };
  // "contains" would fire INFO on "information"; a keyword should match as a word
  if (mode === "create") body.matchMode = "word";
  if (DM_PLATFORMS.includes(platform)) {
    Object.assign(body, {
      dmMessage: input.dm,
      dmMessageVariations: input.dmVariations,
      buttons: input.buttons.map((x) => ({ type: "url", title: x.title, url: x.url })),
    });
    if (input.trigger === "comment") body.alsoMatchInDms = input.alsoMatchInDms;
    // audience is Instagram only; an update without the gate sets the defaults back
    if (platform === "instagram" && input.followGate) body.audience = { followerStatus: "follower", whenUnknown: "verify" };
    else if (platform === "instagram" && mode === "update") body.audience = { followerStatus: "any", whenUnknown: "send" };
  }
  if (input.trigger === "comment" && (input.reply || mode === "update")) {
    body.commentReply = input.reply;
    body.commentReplyVariations = input.replyVariations;
  }
  return body;
}

// ---- requests ----

export type AutomationRequest =
  | { action: "automations"; profileId: string }
  | { action: "automation-create"; profileId: string; accountId: string; input: AutomationInput }
  /** input null: only switch it on or off */
  | { action: "automation-update"; profileId: string; automationId: string; input: AutomationInput | null; active: boolean | null }
  | { action: "automation-delete"; profileId: string; automationId: string }
  | { action: "automation-logs"; profileId: string; automationId: string; skip: number }
  | { action: "account-posts"; profileId: string; accountId: string };

type Parsed = { ok: true; req: AutomationRequest } | { ok: false; status: number; error: string };
const notFound: Parsed = { ok: false, status: 404, error: "Not found." };

/** Null when the action is not an automation one. H1: a malformed id is a 404 before any other use. */
export function parseAutomationRequest(body: unknown): Parsed | null {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const action = b.action as AutomationAction;
  if (!AUTOMATION_ACTIONS.includes(action)) return null;
  if (!isProfileId(b.profileId)) return notFound;
  const profileId = b.profileId;
  if (action === "automations") return { ok: true, req: { action, profileId } };
  if (action === "automation-create" || action === "account-posts") {
    if (!isZernioId(b.accountId)) return notFound;
    if (action === "account-posts") return { ok: true, req: { action, profileId, accountId: b.accountId } };
    const input = checkInput(b.automation);
    return input.ok ? { ok: true, req: { action, profileId, accountId: b.accountId, input: input.value } } : { ok: false, status: 400, error: input.error };
  }
  if (!isZernioId(b.automationId)) return notFound;
  const automationId = b.automationId;
  if (action === "automation-delete") return { ok: true, req: { action, profileId, automationId } };
  if (action === "automation-logs") {
    const skip = Number.isInteger(b.skip) && (b.skip as number) >= 0 && (b.skip as number) <= 100_000 ? (b.skip as number) : 0;
    return { ok: true, req: { action, profileId, automationId, skip } };
  }
  if (b.automation !== undefined && b.automation !== null) {
    const input = checkInput(b.automation);
    return input.ok ? { ok: true, req: { action, profileId, automationId, input: input.value, active: null } } : { ok: false, status: 400, error: input.error };
  }
  if (typeof b.active !== "boolean") return { ok: false, status: 400, error: "Nothing to change." };
  return { ok: true, req: { action, profileId, automationId, input: null, active: b.active } };
}

// ---- what the app sees ----

export interface AutomationStats {
  triggered: number;
  sent: number;
  failed: number;
  /** Facebook only: Instagram sends no delivery receipt. */
  delivered: number;
  read: number;
  /** People who clicked a link button. */
  clicked: number;
}

export interface AutomationView {
  id: string;
  accountId: string;
  platform: string;
  trigger: Trigger;
  active: boolean;
  keywords: string[];
  everyComment: boolean;
  platformPostId: string | null;
  postTitle: string;
  dm: string;
  dmVariations: string[];
  buttons: LinkButton[];
  reply: string;
  replyVariations: string[];
  alsoMatchInDms: boolean;
  followGate: boolean;
  stats: AutomationStats;
}

export interface AccountOption {
  id: string;
  platform: string;
  username: string;
  name: string;
  picture: string | null;
}

export interface PostOption {
  id: string;
  caption: string;
  picture: string | null;
  url: string | null;
  at: string;
}

export interface LogView {
  id: string;
  who: string;
  said: string;
  status: string;
  reason: string;
  reply: string;
  replyReason: string;
  at: string;
  clicked: boolean;
}

const https = (v: unknown) => (typeof v === "string" && /^https:\/\//.test(v) ? v : null);
const count = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
const str = (v: unknown, max = 2000) => (typeof v === "string" ? v.slice(0, max) : "");
const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

export function automationView(a: Record<string, unknown>): AutomationView {
  const s = (a.stats ?? {}) as Record<string, unknown>;
  const audience = (a.audience ?? {}) as Record<string, unknown>;
  const trigger = TRIGGERS.includes(a.trigger as Trigger) ? (a.trigger as Trigger) : "comment";
  const keywords = strs(a.keywords);
  return {
    id: a.id as string,
    accountId: refId(a.accountId),
    platform: str(a.platform, 40),
    trigger,
    active: a.isActive !== false,
    keywords,
    everyComment: !keywords.length && trigger === "comment",
    platformPostId: typeof a.platformPostId === "string" && a.platformPostId ? a.platformPostId : null,
    postTitle: str(a.postTitle, 200),
    dm: str(a.dmMessage),
    dmVariations: strs(a.dmMessageVariations),
    buttons: (Array.isArray(a.buttons) ? a.buttons : [])
      .filter((x) => x?.type === "url" && typeof x.title === "string" && typeof x.url === "string" && linkOk(x.url))
      .map((x) => ({ title: x.title, url: x.url })),
    reply: str(a.commentReply),
    replyVariations: strs(a.commentReplyVariations),
    alsoMatchInDms: a.alsoMatchInDms === true,
    followGate: audience.followerStatus === "follower" && audience.whenUnknown === "verify",
    stats: { triggered: count(s.triggered), sent: count(s.dmsSent), failed: count(s.dmsFailed), delivered: count(s.delivered), read: count(s.read), clicked: count(s.uniqueClicks) },
  };
}

function logView(l: Record<string, unknown>): LogView {
  const username = str(l.commenterUsername, 60).replace(/^@/, "");
  return {
    id: str(l.id, 40),
    who: username ? `@${username}` : str(l.commenterName, 80) || "Someone",
    said: str(l.commentText, 500),
    status: str(l.status, 20),
    reason: str(l.error, 300),
    reply: str(l.commentReplyStatus, 20),
    replyReason: str(l.commentReplyError, 300),
    at: str(l.createdAt, 40),
    clicked: count(l.clickCount) > 0,
  };
}

// ---- the actions ----

type Reply = { status: number; body: Record<string, unknown> };
const ok = (body: Record<string, unknown>): Reply => ({ status: 200, body });
const bad = (error: string): Reply => ({ status: 400, body: { error } });

const ownSet = async (z: Zernio, mapped: string) => {
  const own = await callerAccounts(z, mapped);
  return { own, ids: new Set(own.map((a) => a._id)) };
};

/** The account's 25 latest platform posts (Zernio reads them live). */
async function latestPosts(z: Zernio, accountId: string): Promise<PostOption[]> {
  const data = await z("GET", `/accounts/${pathId(accountId)}/posts`);
  if (!Array.isArray(data?.posts)) throw new ZernioError(502, "unreadable", "Couldn't read your posts.");
  return data.posts
    .filter((p: { id?: unknown }) => typeof p?.id === "string" && PLATFORM_POST_ID.test(p.id))
    .map((p: Record<string, unknown>) => ({ id: p.id as string, caption: str(p.message, 300), picture: https(p.picture), url: https(p.permalink), at: str(p.createdTime, 40) }));
}

/** A chosen post must be one of the account's own latest posts. */
async function ownPost(z: Zernio, accountId: string, platformPostId: string): Promise<PostOption> {
  const post = (await latestPosts(z, accountId)).find((p) => p.id === platformPostId);
  if (!post) throw new NotYours("post not on this account");
  return post;
}

const postTitle = (p: PostOption) => p.caption.replace(/\s+/g, " ").trim().slice(0, 100) || "A post";

/** Runs one automation action for the caller's brand. mapped: the brand's Zernio profile, or null before its first connect. */
export async function runAutomation(z: Zernio, mapped: string | null, q: AutomationRequest): Promise<Reply> {
  if (!mapped) {
    if (q.action === "automations") return ok({ accounts: [], automations: [] });
    throw new NotYours("no profile");
  }
  const { own, ids } = await ownSet(z, mapped);

  if (q.action === "automations") {
    const accounts: AccountOption[] = own
      .filter((a) => (SOCIAL_PLATFORMS as readonly string[]).includes(a.platform))
      .map((a) => ({ id: a._id, platform: a.platform, username: a.username ?? "", name: a.displayName ?? a.username ?? "", picture: https(a.profilePicture) }));
    // H3: listed by the mapped profile, then each item kept only when its account is the caller's
    const items = own.length ? ((await scopedList(z, "/comment-automations", mapped, ids)) as Record<string, unknown>[]) : [];
    return ok({ accounts, automations: items.filter((a) => isZernioId(a?.id)).map(automationView) });
  }

  if (q.action === "account-posts") {
    const [accountId] = requireAccounts(ids, [q.accountId]);
    return ok({ posts: await latestPosts(z, accountId) });
  }

  if (q.action === "automation-create") {
    const [accountId] = requireAccounts(ids, [q.accountId]);
    const platform = own.find((a) => a._id === accountId)!.platform;
    const why = platformProblem(q.input, platform);
    if (why) return bad(why);
    const post = q.input.platformPostId ? await ownPost(z, accountId, q.input.platformPostId) : null;
    const data = await z("POST", "/comment-automations", {
      body: {
        ...settingsBody(q.input, platform, "create"),
        // always the brand's own profile, never one from the request
        profileId: mapped,
        accountId,
        ...(post ? { platformPostId: post.id, postTitle: postTitle(post) } : {}),
      },
    });
    return ok({ id: typeof data?.automation?.id === "string" ? data.automation.id : null });
  }

  // M1: the automation is the caller's (its account is in their set) before anything is written
  const current = (await checkAutomation(z, ids, q.automationId)).automation as Record<string, unknown>;
  const path = `/comment-automations/${pathId(q.automationId)}`;

  if (q.action === "automation-delete") {
    await z("DELETE", path);
    return ok({ deleted: true });
  }

  if (q.action === "automation-logs") {
    const data = await z("GET", `${path}/logs`, { query: { limit: "50", skip: String(q.skip) } });
    if (!Array.isArray(data?.logs)) throw new ZernioError(502, "unreadable", "Couldn't read who got it.");
    return ok({ logs: data.logs.map(logView), hasMore: data.pagination?.hasMore === true, total: count(data.pagination?.total) });
  }

  if (!q.input) {
    await z("PATCH", path, { body: { isActive: q.active } });
    return ok({ active: q.active });
  }
  const accountId = refId(current.accountId);
  const platform = own.find((a) => a._id === accountId)!.platform;
  const why = platformProblem(q.input, platform);
  if (why) return bad(why);
  const body = settingsBody(q.input, platform, "update");
  const was = typeof current.platformPostId === "string" && current.platformPostId ? current.platformPostId : null;
  // the post binding moves as a unit (platformPostId, postId, postTitle); omitted, it stays as it is
  if (q.input.platformPostId !== was || q.input.trigger !== current.trigger) {
    if (q.input.platformPostId) {
      const post = await ownPost(z, accountId, q.input.platformPostId);
      Object.assign(body, { platformPostId: post.id, postTitle: postTitle(post) });
    } else {
      Object.assign(body, { platformPostId: null, postId: null, postTitle: null });
    }
  }
  await z("PATCH", path, { body });
  return ok({ id: q.automationId });
}

/** Zernio's refusals of an automation in plain words; null leaves it to the shared errorReply. */
export function automationErrorReply(e: unknown): Reply | null {
  if (!(e instanceof ZernioError)) return null;
  if (e.status === 401 && e.code === "TOKEN_EXPIRED") return { status: 409, body: { code: "reconnect", error: "Reconnect this account on Social accounts first." } };
  if (e.status === 409) return { status: 409, body: { code: "post_taken", error: "That post already has an auto-DM switched on. Pause that one, or pick Any post." } };
  if (e.status === 400) return { status: 400, body: { code: e.code || "invalid", error: "Zernio didn't accept that auto-DM. Check the fields and try again." } };
  return null;
}
