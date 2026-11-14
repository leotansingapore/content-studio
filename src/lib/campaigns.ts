// Campaigns (plan-campaign, Leo only): a month of posts for one audience, synced per brand under
// content-studio-campaigns-<scoped>, newest first, 12 at most. Deleting rewrites the array, so nothing depends on a
// tombstone. Status, cost and the angle mix are worked out from the posts, never stored. The wizard lays a campaign
// out with buildCampaignPosts and planCampaign and keeps it with addCampaign. A campaign that runs ads ("Ads only" or
// "Posts and ads") also carries its budget and 10 ad drafts (planAds; made and sent in src/lib/campaignAds.ts).

import type { FunnelStageId } from "@/data/funnelFramework";
import { STATIC_FORMATS } from "@/data/staticFormats";
import { loadAudiences } from "@/lib/audiences";
import { loadCompetitorAds, runLabel } from "@/lib/competitorAds";
import { generatePlan, planItemDate, planOptionsFor, steerFor, upcomingMonday, type GeneratePlanOptions, type PlanPillar } from "@/lib/contentPlan";
import { keyToDate, localDateKey } from "@/lib/dueDates";
import { draftStatus, engagement, loadDrafts, MAX_DRAFTS, pushedOut, type DraftEntry } from "@/lib/draftHistory";
import { getTrackedPosts, postingTimeOn } from "@/lib/analytics";
import { loadBrand } from "@/lib/carousel";
import { freeTimeOn, monFirst, slotTimesFor, type Held } from "@/lib/postingSlots";
import { EMPTY_POSITIONING, loadPositioning, type PlanPlatform, type Positioning } from "@/lib/positioning";
import { links, STATIC_LAYOUT_IDS } from "@/lib/links";
import { priceOf, sumPrices, type Price } from "@/lib/prices";
import { loadProducts, type Products } from "@/lib/products";
import { scoped } from "@/lib/profiles";
import { sourceKey } from "@/lib/remixSource";
import { BREAKOUT_RATIO, median } from "../../supabase/functions/_shared/socialAudit.ts";

export type CampaignFormat = "text-post" | "carousel" | "short-video" | "slideshow" | "wall" | "green-screen" | "video-hook" | "ai-video";
export const FREE_FORMATS: CampaignFormat[] = ["text-post", "carousel", "short-video"];
/** Written as a hook and a brief, then made by a Studio maker at Make (one remix make on the price table each). */
export const BRIEF_FORMATS: CampaignFormat[] = ["slideshow", "wall", "green-screen", "video-hook"];
export type PostState = "waiting" | "drafting" | "ready" | "failed" | "making" | "made" | "skipped";

export interface CampaignPost {
  n: number; day: string; time?: string; angleId: string; format: CampaignFormat;
  stage: FunnelStageId; pillar: PlanPillar; formulaId?: string; ctaType: string;
  hook?: string; body?: string; script?: string; brief?: string; cta?: string; mas?: boolean | null;
  state: PostState; error?: string; draftId?: string;
  /** The writing call this post's batch went out under (campaignJob): a reload mid-call asks again under the same id. */
  ask?: string;
  /** `text` and `caption`: the words and caption a wall's maker wrote, which the queue shows once it is made. */
  made?: { kind: "draft" | "slideshow" | "video"; id: string; text?: string; caption?: string };
  /** The words before the last Swap, for its Undo; `format` when the swap changed the format too. */
  prev?: { hook?: string; body?: string; script?: string; brief?: string; cta?: string; format?: CampaignFormat };
}

/** Where it runs: posts only (missing on campaigns from before 11 Nov), ads only, or both. */
export type CampaignRuns = "organic" | "ads" | "both";
/** What the ads spend and who sees them: US$ a day, the https landing page, ISO country codes (up to 10) and ages. */
export interface AdBudget { daily: number; url: string; countries: string[]; ages: [number, number] }
/** The layouts an ad takes: /image's headline ad, quote card and stat card (a testimonial is a customer's own words), and every static ad format that is drawn. */
export type CampaignAdLayout = "headline" | "quote" | "stat" | (typeof STATIC_LAYOUT_IDS)[number];
/**
 * One of the campaign's ads: an angle, a layout and, when the brand's competitors have running ads, the one it remixes.
 * `designId` is its /image design once Make or Edit made one; made, making and draft are read from that design.
 */
export interface CampaignAd {
  n: number; angleId: string; layout: CampaignAdLayout; source?: { key: string; label: string };
  designId?: string; skipped?: true; error?: string;
}
export const AD_COUNT = 10;

export interface Campaign {
  id: string; name: string; createdAt: string; audience: string; audienceName: string;
  angles: { id: string; title: string; line: string }[]; platforms: PlanPlatform[]; accountIds?: string[];
  formats: CampaignFormat[]; weeks: number; perWeek: 2 | 3 | 5 | 7 | 14 | 21 | 28; startDay: string;
  pictures: "stock" | "mine"; goal?: string; target: { posts: number; winners: number };
  waitUntil?: string; posts: CampaignPost[];
  runs?: CampaignRuns; budget?: AdBudget; ads?: CampaignAd[];
  /** When Launch was pressed: made posts go out on their days from then on (src/lib/campaignLaunch.ts). */
  launchedAt?: string;
  /** When Pause was pressed: its scheduled posts came off Zernio and nothing new goes until Resume clears it. */
  pausedAt?: string;
}

export interface CampaignAsk {
  audience: string; angles: Campaign["angles"]; platforms: PlanPlatform[]; accountIds?: string[]; formats: CampaignFormat[]; weeks: number;
  perWeek: Campaign["perWeek"]; pictures: Campaign["pictures"]; name: string; runs?: CampaignRuns; budget?: AdBudget;
}

export const MAX_CAMPAIGNS = 12;
export const MAX_CAMPAIGN_CHARS = 800_000;
export const CAMPAIGNS_CHANGED = "content-studio-campaigns-changed";
export const LIMIT_LINE = "You have 12 campaigns. Delete a done one first.";
export const SIZE_LINE = "Couldn't save. Delete a done campaign to make room.";
const PREFIX = "content-studio-campaigns-";

/** A 15 s AI video: Speak for the clip plus its voiceover, from the price table (never typed). A post with a script is priced from it (videoPriceOf). */
export const AI_VIDEO = sumPrices(priceOf("ai-video", { seconds: 15 }), priceOf("ai-voice")) as Price;
/** A slideshow or a wall of text: one remix make. */
export const REMIX_MAKE = priceOf("remix-make") as Price;

export const campaignsKey = (userId: string) => PREFIX + scoped(userId);

export function loadCampaigns(userId: string | null | undefined): Campaign[] {
  if (!userId) return [];
  try {
    const raw = JSON.parse(localStorage.getItem(campaignsKey(userId)) ?? "[]");
    if (!Array.isArray(raw)) return [];
    return raw.filter((c) => c && typeof c === "object" && typeof c.id === "string" && Array.isArray(c.posts) && Array.isArray(c.angles));
  } catch {
    return [];
  }
}

/** Saves the whole list (newest first). Null when saved; else the line, and nothing is written. */
export function saveCampaigns(userId: string, list: Campaign[]): string | null {
  if (list.length > MAX_CAMPAIGNS) return LIMIT_LINE;
  const json = JSON.stringify(list);
  if (json.length > MAX_CAMPAIGN_CHARS) return SIZE_LINE;
  try {
    localStorage.setItem(campaignsKey(userId), json);
  } catch {
    return SIZE_LINE;
  }
  window.dispatchEvent(new Event(CAMPAIGNS_CHANGED));
  return null;
}

/** Keeps a new campaign at the top of the list. Null when saved, else the line (12 kept, or no room). */
export const addCampaign = (userId: string, c: Campaign): string | null => saveCampaigns(userId, [c, ...loadCampaigns(userId).filter((x) => x.id !== c.id)]);

export const getCampaign = (userId: string | null | undefined, id: string): Campaign | null => loadCampaigns(userId).find((c) => c.id === id) ?? null;

/** Changes one post (never its n). Returns the saved campaign, or null when it or the post is gone or it couldn't save. */
export function updatePost(userId: string, id: string, n: number, patch: Partial<CampaignPost>): Campaign | null {
  const list = loadCampaigns(userId);
  const c = list.find((x) => x.id === id);
  if (!c?.posts.some((p) => p.n === n)) return null;
  const next = { ...c, posts: c.posts.map((p) => (p.n === n ? { ...p, ...patch, n } : p)) };
  return saveCampaigns(userId, list.map((x) => (x.id === id ? next : x))) ? null : next;
}

/** The post's day of the campaign, 1 on its start day ("Day 3"). */
export const dayOf = (c: Pick<Campaign, "startDay">, p: Pick<CampaignPost, "day">) => Math.round((keyToDate(p.day).getTime() - keyToDate(c.startDay).getTime()) / 86_400_000) + 1;

// the list as last parsed, so a page of campaign posts parses it once (read again whenever the stored text changes)
let parsed: { key: string; raw: string | null; list: Campaign[] } | null = null;

/**
 * "<campaign name> | Day 3" and the post's address on its campaign page, for a post a campaign made: from its draft's
 * `campaign`, else, for a draft made before that was kept, from its id (cmp_<campaign>_<n>, campaignActions draftIdOf)
 * with the day read off the campaign. Null for any other draft, and once that campaign or that post in it is gone, so
 * a deleted campaign leaves no dead link.
 */
export function campaignLine(userId: string, d: Pick<DraftEntry, "id" | "campaign">): { text: string; day: number; href: string } | null {
  const old = d.campaign ? null : /^cmp_([^_]+)_(\d+)$/.exec(d.id);
  const link = d.campaign ?? (old ? { id: old[1], post: Number(old[2]) } : null);
  if (!link) return null;
  const key = campaignsKey(userId);
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(key);
  } catch {
    // blocked storage: no campaigns to name
  }
  if (parsed?.key !== key || parsed.raw !== raw) parsed = { key, raw, list: loadCampaigns(userId) };
  const c = parsed.list.find((x) => x.id === link.id);
  const p = c?.posts.find((x) => x.n === link.post);
  if (!c || !p) return null;
  const day = d.campaign?.day ?? dayOf(c, p);
  return { text: `${c.name} | Day ${day}`, day, href: links.campaign(c.id, { post: link.post, section: "queue" }) };
}

/** Removes a campaign; returns it for the Undo toast (restoreCampaign), or null when it wasn't there. */
export function deleteCampaign(userId: string, id: string): Campaign | null {
  const list = loadCampaigns(userId);
  const c = list.find((x) => x.id === id);
  if (!c) return null;
  return saveCampaigns(userId, list.filter((x) => x.id !== id)) ? null : c;
}

/** Undo for deleteCampaign: back in its createdAt place. Null when saved, else the line. */
export function restoreCampaign(userId: string, c: Campaign): string | null {
  const list = loadCampaigns(userId).filter((x) => x.id !== c.id);
  return saveCampaigns(userId, [...list, c].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
}

export function onCampaignsChanged(cb: () => void): () => void {
  window.addEventListener(CAMPAIGNS_CHANGED, cb);
  return () => window.removeEventListener(CAMPAIGNS_CHANGED, cb);
}

// ---- Laying a campaign out ---------------------------------------------------------

/** "c-" and base 36, never "_": made posts are drafts `cmp_<id>_<n>`. */
export const newCampaignId = () => `c-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/**
 * Each post's format in order. With AI video picked, post floor(perWeek / 2) of every week is one, and the other
 * posts rotate the other picked formats in order (a text post when AI video is the only one picked).
 */
export function campaignFormats(formats: CampaignFormat[], perWeek: number, weeks: number): CampaignFormat[] {
  const video = formats.includes("ai-video");
  const others = formats.filter((f) => f !== "ai-video");
  let k = 0;
  return Array.from({ length: perWeek * weeks }, (_, i): CampaignFormat => {
    if (video && i % perWeek === Math.floor(perWeek / 2)) return "ai-video";
    return others.length ? others[k++ % others.length] : "text-post";
  });
}

/**
 * The posts, all waiting to be written: the plan engine's slots (stage, pillar, hook formula, a posting day and time
 * from the brand's slots, angle i mod n) over `weeks` from the Monday after `today`, with campaignFormats' formats.
 */
export function buildCampaignPosts(
  ask: Pick<CampaignAsk, "angles" | "platforms" | "formats" | "weeks" | "perWeek">,
  positioning: Positioning,
  options: GeneratePlanOptions,
  today: Date,
): CampaignPost[] {
  const plan = generatePlan(
    { ...positioning, cadence: ask.perWeek, platform: ask.platforms[0] ?? positioning.platform },
    { ...options, weeks: ask.weeks, angles: ask.angles },
  );
  const monday = upcomingMonday(today);
  const formats = campaignFormats(ask.formats, ask.perWeek, ask.weeks);
  return plan.items.map((item, i) => ({
    n: i + 1,
    day: localDateKey(planItemDate(item, monday)),
    ...(item.time ? { time: item.time } : {}),
    angleId: item.angleId ?? "",
    format: formats[i],
    stage: item.stage,
    pillar: item.pillar,
    ...(item.formulaId ? { formulaId: item.formulaId } : {}),
    ctaType: item.ctaType,
    state: "waiting",
  }));
}

/**
 * Each post at its day's first brand slot that nothing holds (freeTimeOn, the calendar's open-slot rule): scheduled
 * drafts, the brand's other campaigns' posts and this campaign's earlier posts hold theirs, so campaigns at the same
 * pace take a day's slots in turn. With every slot that day held, postingTimeOn spreads it past the day's posts.
 * shortcut: the spread counts the day's held posts, so a draft at a hand-typed time can still share one; check the times if that bites.
 */
function freeTimes(userId: string, posts: CampaignPost[], platform: string, exceptId?: string): CampaignPost[] {
  const brand = loadBrand(userId);
  const tracked = getTrackedPosts(userId);
  const held: Held[] = [
    ...loadDrafts(userId).filter((d) => d.status === "scheduled" && d.scheduledFor),
    ...loadCampaigns(userId).filter((c) => c.id !== exceptId).flatMap((c) =>
      c.posts.filter((p) => p.state !== "skipped").flatMap((p) => c.platforms.map((pl) => ({ platform: pl, scheduledFor: p.time ? `${p.day}T${p.time}` : p.day })))),
  ];
  return posts.map((p) => {
    const time = freeTimeOn(brand, platform, held, p.day, (n) => postingTimeOn(tracked, platform, monFirst(p.day), slotTimesFor(brand, platform), n).time);
    held.push({ platform, scheduledFor: `${p.day}T${time}` });
    return { ...p, time };
  });
}

// ---- The ads ----------------------------------------------------------------------

/** What the brand has for an ad: its product photo (a used product's first) and its first price, as the static format page reads them. */
export function adBits(p: Products): { picture?: string; price?: string } {
  const items = [...p.items.filter((x) => x.use), ...p.items.filter((x) => !x.use)];
  return { picture: items.find((x) => x.pictures[0])?.pictures[0], price: items.find((x) => x.price?.trim())?.price?.trim() };
}

/**
 * The layouts this brand's ads can take, the list Swap layout cycles: headline ad, quote card, each ready static
 * format in the registry's order, then stat card. A format that needs a photo is in only with a product photo, and
 * the tear-off flyer only with a price.
 */
export function adLayouts(have: { picture?: string; price?: string }): CampaignAdLayout[] {
  const drawn = STATIC_LAYOUT_IDS as readonly string[];
  const statics = STATIC_FORMATS.filter((f) => f.ready && drawn.includes(f.slug) && (f.needs !== "photo" || !!have.picture) && (f.slug !== "tear-off-flyer" || !!have.price))
    .map((f) => f.slug as CampaignAdLayout);
  return ["headline", "quote", ...statics, "stat"];
}

/**
 * THE SEAM where an ad's layout is chosen: slot i of the brand's layouts taken in turn, so a campaign's 10 ads are 10
 * different layouts. A stat card needs a typed number, so it comes up once every two rounds of the others.
 */
export function adLayoutFor(i: number, layouts: CampaignAdLayout[] = adLayouts({})): CampaignAdLayout {
  const rest = layouts.filter((l) => l !== "stat");
  const round = layouts.includes("stat") ? [...rest, ...rest, "stat" as const] : rest;
  return round[i % round.length] ?? "headline";
}

/** 10 ad drafts: ad i takes angle i mod n, the seam's layout from slot `from` + i and, while they last, source i. */
export const planAds = (angles: Campaign["angles"], sources: { key: string; label: string }[], layouts: CampaignAdLayout[] = adLayouts({}), from = 0): CampaignAd[] =>
  Array.from({ length: AD_COUNT }, (_, i) => ({ n: i + 1, angleId: angles[i % angles.length]?.id ?? "", layout: adLayoutFor(from + i, layouts), ...(sources[i] ? { source: sources[i] } : {}) }));

/**
 * The brand's competitors' running ads to remix, one competitor after another so the 10 aren't all one rival's:
 * pictures before videos, the longest running first.
 */
export function runningAdSources(userId: string, now = Date.now()): { key: string; label: string }[] {
  const lists = Object.values(loadCompetitorAds(userId)).map((e) =>
    e.ads
      .filter((a) => a.active)
      .sort((a, b) => Number(b.format === "image") - Number(a.format === "image") || (a.start ?? "9").localeCompare(b.start ?? "9"))
      .map((a) => ({ key: sourceKey.ad(a.id), label: [e.pageName || "A competitor", runLabel(a, now)].filter(Boolean).join(", ") })));
  const out: { key: string; label: string }[] = [];
  for (let i = 0; out.length < AD_COUNT && lists.some((l) => l[i]); i++) for (const l of lists) if (l[i] && out.length < AD_COUNT) out.push(l[i]);
  return out;
}

/** The wizard's answers as a campaign, laid out from this brand's positioning, posting slots and goal; not saved. */
export function planCampaign(userId: string, ask: CampaignAsk, today: Date): Campaign {
  const positioning = loadPositioning(userId) ?? EMPTY_POSITIONING;
  const platform = ask.platforms[0] ?? positioning.platform;
  const options = { ...planOptionsFor(userId, platform, { plan: null }), ...steerFor(userId) };
  const runs = ask.runs ?? "organic";
  // Ads only posts nothing
  const posts = runs === "ads" ? [] : freeTimes(userId, buildCampaignPosts(ask, positioning, options, today), platform);
  const goal = positioning.goal?.trim();
  return {
    id: newCampaignId(),
    name: ask.name.trim().slice(0, 80),
    createdAt: today.toISOString(),
    audience: ask.audience,
    audienceName: loadAudiences(userId).find((a) => a.id === ask.audience)?.name ?? "",
    angles: ask.angles.map(({ id, title, line }) => ({ id, title, line })),
    platforms: [...ask.platforms],
    ...(ask.accountIds?.length ? { accountIds: [...ask.accountIds] } : {}),
    formats: [...ask.formats],
    weeks: ask.weeks,
    perWeek: ask.perWeek,
    startDay: localDateKey(upcomingMonday(today)),
    pictures: ask.pictures,
    ...(goal ? { goal } : {}),
    target: { posts: posts.length, winners: winnersFor(posts.length) },
    posts,
    ...(runs !== "organic" && ask.budget
      ? { runs, budget: { ...ask.budget, countries: [...ask.budget.countries], ages: [...ask.budget.ages] as AdBudget["ages"] }, // each campaign of the brand starts where the one before stopped, so two campaigns' ads differ too
        ads: planAds(ask.angles, runningAdSources(userId, today.getTime()), adLayouts(adBits(loadProducts(userId))), loadCampaigns(userId).filter((x) => x.ads?.length).length * AD_COUNT) }
      : {}),
  };
}

/** Why pace and length can't change now, or null: once a post is made, or while words are on their way (the writer fills posts by number). */
export function replanLock(c: Pick<Campaign, "posts">): string | null {
  if (c.posts.some((p) => p.state === "made" || p.state === "making")) return "Pace and length are fixed once a post is made.";
  return c.posts.some((p) => p.state === "drafting") ? "Pace and length open again when the posts being written are done." : null;
}

/** A post whose words a new pace or length keeps: written, or further on. A failed one has none, so it waits again. */
export const hasWords = (p: CampaignPost) => p.state !== "waiting" && p.state !== "failed";

/**
 * The campaign over a new length and pace, laid out again from its own start day: posts with words keep them, in
 * order, on the new days; the other slots wait to be written; any past the new end are dropped.
 */
export function replanCampaign(userId: string, c: Campaign, next: Pick<Campaign, "weeks" | "perWeek">): Campaign {
  // Ads only posts nothing: only the length (the ads' days) changes
  if (c.runs === "ads") return { ...c, ...next };
  const positioning = loadPositioning(userId) ?? EMPTY_POSITIONING;
  const platform = c.platforms[0] ?? positioning.platform;
  const options = { ...planOptionsFor(userId, platform, { plan: null }), ...steerFor(userId) };
  const slots = freeTimes(userId, buildCampaignPosts({ ...c, ...next }, positioning, options, keyToDate(c.startDay)), platform, c.id);
  const posts = slots.map((s, i): CampaignPost => {
    const old = c.posts[i];
    if (!old || !hasWords(old)) return s;
    const kept: CampaignPost = { ...old, n: s.n, day: s.day, time: s.time };
    if (!s.time) delete kept.time;
    return kept;
  });
  return { ...c, ...next, posts, target: { posts: posts.length, winners: winnersFor(posts.length) } };
}

export type CampaignStatus = "draft" | "running" | "done";

/**
 * Done: every post made or skipped and the last post day before `today` (YYYY-MM-DD). Running: launched, or something
 * made (a post, or one of `adsMade` ads, which campaignAds reads from their designs). Else draft.
 */
export function campaignStatus(c: Pick<Campaign, "posts"> & { launchedAt?: string }, today: string, adsMade = 0): CampaignStatus {
  const last = c.posts.reduce((m, p) => (p.day > m ? p.day : m), "");
  if (c.posts.length && last < today && c.posts.every((p) => p.state === "made" || p.state === "skipped")) return "done";
  return c.launchedAt || adsMade > 0 || c.posts.some((p) => p.state === "made") ? "running" : "draft";
}

/** Campaigns post from 5 accounts at most (the wizard's limit). */
export const CAMPAIGN_ACCOUNTS = 5;

/**
 * The campaign with one more connected account (Configure's "+ Add an account"): its platform joins the campaign's
 * when it is one a plan can hold. Null when it can't: launched already, picked already, or 5 picked.
 */
export function withAccount(c: Campaign, a: { id: string; platform: string }): Campaign | null {
  const ids = c.accountIds ?? [];
  if (c.launchedAt || ids.includes(a.id) || ids.length >= CAMPAIGN_ACCOUNTS) return null;
  const plan = (["linkedin", "instagram", "facebook", "tiktok"] as string[]).includes(a.platform) && !c.platforms.includes(a.platform as PlanPlatform);
  return { ...c, accountIds: [...ids, a.id], ...(plan ? { platforms: [...c.platforms, a.platform as PlanPlatform] } : {}) };
}

export const LAUNCH_LINE = "Press Launch to review the schedule and cost. Nothing posts or is charged until you approve it.";
export const NO_ACCOUNT_LINE = "Add an account so the posts go out by themselves, or launch and post them yourself.";

/**
 * The one line a campaign's row on /campaigns says in the warning tone, or null: posts that could not be written,
 * then (once every post is written) Launch while it hasn't launched, then posts waiting for review once it has.
 * Nothing while words are still being written, for a done campaign, or for Ads only (nothing of it launches).
 */
export function reasonLine(c: Pick<Campaign, "posts" | "accountIds" | "launchedAt" | "runs">, status: CampaignStatus): string | null {
  const count = (state: PostState) => c.posts.filter((p) => p.state === state).length;
  const failed = count("failed");
  if (failed) return `${failed} ${failed === 1 ? "post" : "posts"} could not be written`;
  if (status === "done" || c.runs === "ads" || !c.posts.length || count("waiting") || count("drafting")) return null;
  if (!c.launchedAt) return c.accountIds?.length ? LAUNCH_LINE : NO_ACCOUNT_LINE;
  const review = count("ready");
  return review ? `${review} ${review === 1 ? "post waits" : "posts wait"} for your review.` : null;
}

export interface CampaignCost {
  /** Free-format posts not yet made, being made or skipped. */
  free: number;
  /** Posts a maker makes at Make, not yet made, being made or skipped. */
  made: { slideshows: number; walls: number; greens: number; hooks: number; videos: number };
  /** What those makes come to, in US$ to the cent: REMIX_MAKE per slideshow or wall, each video's own estimate. */
  usd: number;
  /** Each AI video's estimate in US$, in post order: the price campaignCost is given, AI_VIDEO by default. */
  videoUsd: number[];
  /**
   * How many of them today's limits cover; null when a limit couldn't be read (no coverage line). `picks`: how many
   * slideshows and walls get a picture Jev picked (montage-pick), null when not read; past it they take the first found.
   */
  covers: { remix: number | null; videos: number | null; picks: number | null };
}

/** AI videos left today: the smaller of `ai-video` and `ai-voice` uses left, null when either is unread. */
export const videosLeft = (aiVideo: number | null, aiVoice: number | null): number | null =>
  aiVideo === null || aiVoice === null ? null : Math.min(aiVideo, aiVoice);

export function campaignCost(
  c: Pick<Campaign, "posts">,
  left: { video: number | null; remix: number | null; pick?: number | null },
  videoPrice: (p: CampaignPost) => Price = () => AI_VIDEO,
): CampaignCost {
  // a post being made has spent its uses (a paid AI video still at Higgsfield) or shows its own price check
  const open = c.posts.filter((p) => p.state !== "made" && p.state !== "skipped" && p.state !== "making");
  const count = (f: CampaignFormat) => open.filter((p) => p.format === f).length;
  const made = { slideshows: count("slideshow"), walls: count("wall"), greens: count("green-screen"), hooks: count("video-hook"), videos: count("ai-video") };
  const remix = made.slideshows + made.walls + made.greens + made.hooks;
  const videoUsd = open.filter((p) => p.format === "ai-video").map((p) => videoPrice(p).usd);
  return {
    free: open.filter((p) => FREE_FORMATS.includes(p.format)).length,
    made,
    usd: Math.round((remix * REMIX_MAKE.usd + videoUsd.reduce((n, u) => n + u, 0)) * 100) / 100,
    videoUsd,
    covers: {
      remix: left.remix === null ? null : Math.min(left.remix, remix),
      videos: left.video === null ? null : Math.min(left.video, made.videos),
      // shortcut: one pick per make, though a stock slideshow asks again when Jev says none to page 1; count 2 if the cap bites early
      picks: left.pick == null ? null : Math.min(left.pick, remix),
    },
  };
}

/** Posts per angle in the campaign's angle order, skipped posts left out (AngleMix only draws these). */
export const angleCounts = (c: Pick<Campaign, "angles" | "posts">): { id: string; title: string; count: number }[] =>
  c.angles.map((a) => ({ id: a.id, title: a.title, count: c.posts.filter((p) => p.angleId === a.id && p.state !== "skipped").length }));

/** "Success looks like": 1 winner per 14 posts, at least 1 (Fastlane: 28 posts, 2 winners). */
export const winnersFor = (posts: number) => Math.max(1, Math.round(posts / 14));

const hasNumbers = (d: DraftEntry) => !!d.metrics && !!(d.metrics.impressions || engagement(d.metrics));

/** A winner: engagement at least BREAKOUT_RATIO (1.5) times the median of the brand's posts with numbers. */
export function isWinner(draft: DraftEntry, drafts: DraftEntry[]): boolean {
  const e = engagement(draft.metrics);
  const usual = median(drafts.filter(hasNumbers).map((d) => engagement(d.metrics)));
  return e > 0 && usual !== null && e >= BREAKOUT_RATIO * usual;
}

/** How many My posts entries making `adding` new ones pushes out (it keeps the newest MAX_DRAFTS). */
export const draftsDropped = (current: number, adding: number) => Math.max(0, current + adding - MAX_DRAFTS);

/** True only when an entry that making `adding` new ones pushes out of My posts (newest first) is posted or has numbers. */
export const dropsPostedDraft = (drafts: DraftEntry[], adding: number): boolean =>
  pushedOut(drafts, adding).some((d) => draftStatus(d) === "posted" || hasNumbers(d));

/** The next written, unmade post after `from`, wrapping to the start; null when none is waiting for review. */
export function nextToReview(c: Pick<Campaign, "posts">, from: number): number | null {
  const posts = [...c.posts].sort((a, b) => a.n - b.n);
  return [...posts.filter((p) => p.n > from), ...posts.filter((p) => p.n <= from)].find((p) => p.state === "ready")?.n ?? null;
}

export type QueueAction = "make" | "swap" | "edit" | "skip" | "prev" | "next";
const KEYS: Record<string, QueueAction> = { "1": "make", "2": "swap", "3": "edit", "4": "skip", ArrowLeft: "prev", ArrowRight: "next" };

/** The queue's keys 1 to 4 and the arrows; null while typing, inside a dialog, or with a modifier held. */
export function keyAction(e: Pick<KeyboardEvent, "key" | "altKey" | "ctrlKey" | "metaKey" | "shiftKey"> & { target: unknown }): QueueAction | null {
  if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return null;
  const el = e.target as { tagName?: string; isContentEditable?: boolean; closest?: (s: string) => unknown } | null;
  if (el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName ?? "") || el.isContentEditable || el.closest?.('[role="dialog"], [role="alertdialog"], dialog'))) return null;
  return KEYS[e.key] ?? null;
}
