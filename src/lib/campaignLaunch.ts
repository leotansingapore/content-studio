// Launch, Pause and Resume on a campaign page (Leo only), after Fastlane's "Launch campaign". Making a post still never
// posts it: Launch is the one press that lets the campaign's made posts go out by themselves. With picked connected
// accounts, each made post whose day is still ahead goes to Zernio scheduled at its day and time, through the same
// steps Post it for me takes (src/lib/postSend.ts: the key on the draft first, the upload, the schedule, Zernio's
// answer kept on the draft as its link, so the calendar and My posts show the chip). A post made later while the
// campaign runs goes the same way when it is made (campaignActions.makePost calls sendIfLaunched). A post whose media
// needs the person (a script to film, a wall of text or AI video still in the editor), or that only TikTok or YouTube
// could take (TikTok needs the person's own settings, YouTube a video), stays on the calendar for Post it for me:
// "waits for you". Without accounts, Launch only marks the campaign running and the person posts each one on its day.
// Pause takes this campaign's scheduled posts off Zernio and stops new sends; Resume sends again what is still ahead.

import {
  NEEDS_MEDIA, browserTimeZone, canCancel, cancelPost, platformProblem, postText, whenLabel, zernioTime, type MediaFile,
} from "@/lib/autoPost";
import { getCampaign, loadCampaigns, saveCampaigns, type Campaign, type CampaignPost } from "@/lib/campaigns";
import { DEFAULT_BRAND, loadBrand, loadCarousels, splitDraftIntoSlides, type CarouselBrand } from "@/lib/carousel";
import { layoutSlide, renderSvg } from "@/lib/carouselLayout";
import { createCanvasMeasure, svgToPng } from "@/lib/carouselRender";
import { hasComplianceErrors, scanCompliance } from "@/lib/compliance";
import { draftStatus, loadDrafts, setDraftZernio, type DraftEntry } from "@/lib/draftHistory";
import { carouselSvgs, logPost, sendScheduled, slidePng } from "@/lib/postSend";
import { activeProfileId } from "@/lib/profiles";
import { loadSlideshows } from "@/lib/slideshow";
import { slideshowPngs } from "@/lib/slideshowDraw";
import { platformName, socialStatus, type AccountView } from "@/lib/socialConnect";
import { NOW_LEAD_MS } from "../../supabase/functions/social/posts.ts";

/** A post due sooner than this is past for a launch: its slides could still be going up when its minute comes. */
export const LEAD_MS = NOW_LEAD_MS + 4 * 60_000;
export const READ_FAILED = "Couldn't read your accounts, so nothing was sent. Try again in a minute.";

type Account = Pick<AccountView, "id" | "platform" | "needsReconnect">;
export interface LaunchItem { n: number; draftId: string; accountIds: string[]; at: string; content: string }
/** What Launch does with each post: go (to Zernio now), you (on the calendar for Post it for me), past, sent, and drafts not yet made. */
export interface LaunchPlan { go: LaunchItem[]; you: number[]; past: number[]; sent: number[]; drafts: number }

/** What a made post carries out: its pictures (a carousel's slides, a slideshow), its words alone, or something only the person can finish. */
export function carries(p: Pick<CampaignPost, "format" | "made">): "pictures" | "words" | "person" {
  if (p.made?.kind === "slideshow" || (p.format === "carousel" && p.made?.kind !== "video")) return "pictures";
  return p.format === "text-post" && p.made?.kind !== "video" ? "words" : "person";
}

/** A network a post can go to with no one at the screen: never TikTok (the person's own settings) or YouTube (a video), Instagram only with pictures. */
export const takesAlone = (platform: string, pictures: boolean) => platform !== "tiktok" && platform !== "youtube" && (pictures || !NEEDS_MEDIA.includes(platform));

/**
 * Which posts Launch (or Resume, or a make while running) sends, pure: each made post whose My posts entry is still
 * there, not already with Zernio or posted, due at least LEAD_MS ahead in `tz`, carried by pictures or words, with a
 * picked working account that takes it, and passing the compliance scan and the networks' rules (as the schedule
 * steps check them). `only` limits it to those post numbers.
 */
export function launchPlan(
  c: Pick<Campaign, "posts" | "accountIds">,
  drafts: DraftEntry[],
  accounts: Account[],
  brand: CarouselBrand | null,
  now: number,
  tz: string,
  only?: number[],
): LaunchPlan {
  const plan: LaunchPlan = { go: [], you: [], past: [], sent: [], drafts: 0 };
  const picked = (c.accountIds ?? []).flatMap((id) => accounts.filter((a) => a.id === id && !a.needsReconnect));
  for (const p of [...c.posts].sort((a, b) => a.n - b.n)) {
    if (only && !only.includes(p.n)) continue;
    if (p.state === "skipped") continue;
    if (p.state !== "made") {
      plan.drafts++;
      continue;
    }
    const d = drafts.find((x) => x.id === p.draftId);
    if (!d) continue; // gone from My posts: nothing to send
    if ((d.zernio?.postId && d.zernio.status !== "cancelled") || draftStatus(d) === "posted") {
      plan.sent.push(p.n);
      continue;
    }
    const at = zernioTime(d.scheduledFor, undefined, tz);
    if (!at || Date.parse(at) < now + LEAD_MS) {
      plan.past.push(p.n);
      continue;
    }
    const kind = carries(p);
    const to = kind === "person" ? [] : picked.filter((a) => takesAlone(a.platform, kind === "pictures"));
    const content = postText(d, brand);
    const input = { clientKey: "", content, captions: {}, mediaUrls: kind === "pictures" ? ["https://upload.local/0.png"] : [], scheduledFor: null, firstComment: "", tiktok: null, youtube: null };
    if (!to.length || hasComplianceErrors(scanCompliance(content)) || platformProblem(input, to.map((a) => a.platform))) plan.you.push(p.n);
    else plan.go.push({ n: p.n, draftId: d.id, accountIds: to.map((a) => a.id), at, content });
  }
  return plan;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The dialog's line of what Launch does, with the plan's real counts; `accounts` is how many are picked. */
export function launchLine(plan: LaunchPlan, accounts: number): string {
  const made = plan.go.length + plan.you.length + plan.past.length + plan.sent.length;
  const drafts = plan.drafts ? `${plural(plan.drafts, "draft stays a draft", "drafts stay drafts")}. Make them any time and they join the campaign.` : "";
  if (!made) return ["No posts are made yet.", drafts].filter(Boolean).join(" ");
  if (!accounts) return ["Each made post is on your calendar on its day for you to post.", drafts].filter(Boolean).join(" ");
  return [
    plan.go.length ? `${plural(plan.go.length, "made post goes", "made posts go")} out on ${plan.go.length === 1 ? "its day" : "their days"} on ${plural(accounts, "account", "accounts")}.` : "",
    plan.sent.length ? `${plural(plan.sent.length, "is", "are")} already scheduled.` : "",
    plan.you.length ? `${plural(plan.you.length, "waits", "wait")} for you on your calendar.` : "",
    plan.past.length ? `${plural(plan.past.length, "post's day has", "posts' days have")} passed, so ${plan.past.length === 1 ? "it stays" : "they stay"} on your calendar.` : "",
    drafts,
  ].filter(Boolean).join(" ");
}

// ---- Sending -------------------------------------------------------------------------------

/** Drafts on their way to Zernio in this tab, so a launch and a make never send one twice. */
const inFlight = new Set<string>();
// the brand's accounts as last read, for a post made while running (a social-read per make would add up)
let lastRead: { profileId: string; at: number; accounts: AccountView[] } | null = null;
const READ_KEEP_MS = 10 * 60_000;

async function readAccounts(profileId: string, fresh: boolean): Promise<AccountView[]> {
  if (!fresh && lastRead?.profileId === profileId && Date.now() - lastRead.at < READ_KEEP_MS) return lastRead.accounts;
  const { accounts } = await socialStatus(profileId);
  lastRead = { profileId, at: Date.now(), accounts };
  return accounts;
}

/** The post's pictures: a slideshow's slides, a saved carousel's (the person's edits), else its slides drawn from its words as /carousel draws them. */
async function mediaFor(userId: string, p: CampaignPost, d: DraftEntry): Promise<MediaFile[]> {
  if (carries(p) !== "pictures") return [];
  if (p.made?.kind === "slideshow") {
    const show = loadSlideshows(userId).find((s) => s.id === p.made?.id);
    if (!show) throw new Error("Its slideshow is gone from Slideshows.");
    return slideshowPngs(userId, show);
  }
  const saved = loadCarousels(userId).find((x) => x.draftId === d.id);
  const out: MediaFile[] = [];
  if (saved) {
    for (const svg of await carouselSvgs(userId, saved)) out.push({ file: await slidePng(saved, svg), name: "slide.png", type: "image/png" });
    return out;
  }
  const brand = loadBrand(userId) ?? DEFAULT_BRAND;
  const measure = createCanvasMeasure();
  const slides = splitDraftIntoSlides(d.draft, { hook: d.hook }).slides;
  for (const [i, s] of slides.entries()) {
    out.push({ file: await svgToPng(renderSvg(layoutSlide({ title: s.title, body: s.body, index: i, total: slides.length, brand }, measure))), name: "slide.png", type: "image/png" });
  }
  return out;
}

export interface SendResult { sent: number; failed: { n: number; error: string }[] }

async function sendItems(userId: string, c: Campaign, items: LaunchItem[], accounts: AccountView[], tz: string): Promise<SendResult> {
  const profileId = activeProfileId(userId);
  const out: SendResult = { sent: 0, failed: [] };
  for (const it of items) {
    // Pause pressed while these go: the rest wait for Resume
    if (getCampaign(userId, c.id)?.pausedAt) break;
    const d = loadDrafts(userId).find((x) => x.id === it.draftId);
    const p = c.posts.find((x) => x.n === it.n);
    if (!d || !p || inFlight.has(d.id)) continue;
    inFlight.add(d.id);
    try {
      const media = await mediaFor(userId, p, d);
      // an earlier try that never heard back goes again with its own key, so it never posts twice
      const key = d.zernio && !d.zernio.postId ? d.zernio.key : crypto.randomUUID();
      const post = await sendScheduled(userId, profileId, d.id, { key, accountIds: it.accountIds, content: it.content, media, at: it.at, tz });
      // Undo took the post off the calendar while it went up: take it off Zernio too
      if (!loadDrafts(userId).some((x) => x.id === d.id)) await cancelPost(profileId, post.id).catch(() => undefined);
      const names = [...new Set(accounts.filter((a) => it.accountIds.includes(a.id)).map((a) => platformName(a.platform)))].join(", ");
      logPost(userId, d, (name) => `Set ${name} to post on ${names}`, `Goes out ${whenLabel(it.at.slice(0, 10), it.at.slice(11, 16), tz)}. Campaign: ${c.name}.`);
      out.sent++;
    } catch (e) {
      const error = e instanceof Error && e.message ? e.message : "Couldn't schedule it. Try again in a minute.";
      logPost(userId, d, (name) => `${name} could not be posted`, error);
      out.failed.push({ n: it.n, error });
    } finally {
      inFlight.delete(d.id);
    }
  }
  return out;
}

const patch = (userId: string, id: string, fields: Partial<Campaign>): Campaign | null => {
  const list = loadCampaigns(userId);
  const c = list.find((x) => x.id === id);
  if (!c) return null;
  const next = { ...c, ...fields };
  for (const k of Object.keys(fields) as (keyof Campaign)[]) if (fields[k] === undefined) delete next[k];
  return saveCampaigns(userId, list.map((x) => (x.id === id ? next : x))) ? null : next;
};

export type LaunchOutcome = ({ ok: true; plan: LaunchPlan } & SendResult) | { ok: false; error: string };

/**
 * Launch, and Resume after a pause: reads the picked accounts (nothing is sent or stored when that fails), marks the
 * campaign launched and not paused, then sends what launchPlan says goes, one post after another.
 */
export async function launchCampaign(userId: string, campaignId: string, now = Date.now()): Promise<LaunchOutcome> {
  const c = getCampaign(userId, campaignId);
  if (!c) return { ok: false, error: "This campaign isn't here any more." };
  const profileId = activeProfileId(userId);
  let accounts: AccountView[] = [];
  if (c.accountIds?.length) {
    try {
      accounts = await readAccounts(profileId, true);
    } catch {
      return { ok: false, error: READ_FAILED };
    }
  }
  const live = patch(userId, campaignId, { launchedAt: c.launchedAt ?? new Date(now).toISOString(), pausedAt: undefined });
  if (!live) return { ok: false, error: "Couldn't save. Try again." };
  const tz = browserTimeZone();
  const plan = launchPlan(live, loadDrafts(userId), accounts, loadBrand(userId), now, tz);
  return { ok: true, plan, ...(await sendItems(userId, live, plan.go, accounts, tz)) };
}

/** Pause: nothing new goes, and this campaign's posts Zernio still holds come off it (back on the calendar as they were). */
export async function pauseCampaign(userId: string, campaignId: string, now = Date.now()): Promise<{ ok: true; cancelled: number; failed: number } | { ok: false; error: string }> {
  const c = patch(userId, campaignId, { pausedAt: new Date(now).toISOString() });
  if (!c) return { ok: false, error: "Couldn't save. Try again." };
  const profileId = activeProfileId(userId);
  const ids = new Set(c.posts.flatMap((p) => (p.state === "made" && p.draftId ? [p.draftId] : [])));
  let cancelled = 0;
  let failed = 0;
  for (const d of loadDrafts(userId).filter((x) => ids.has(x.id) && canCancel(x.zernio))) {
    try {
      await cancelPost(profileId, d.zernio!.postId!);
      setDraftZernio(userId, d.id, null);
      logPost(userId, d, (name) => `Cancelled posting ${name}`, `Campaign paused: ${c.name}.`);
      cancelled++;
    } catch {
      failed++;
    }
  }
  return { ok: true, cancelled, failed };
}

/** A post just made while its campaign runs (launched, not paused, with accounts): it goes as Launch would have sent it. */
export async function sendIfLaunched(userId: string, campaignId: string, n: number, now = Date.now()): Promise<SendResult | null> {
  const c = getCampaign(userId, campaignId);
  if (!c?.launchedAt || c.pausedAt || !c.accountIds?.length) return null;
  let accounts: AccountView[];
  try {
    accounts = await readAccounts(activeProfileId(userId), false);
  } catch {
    return { sent: 0, failed: [{ n, error: READ_FAILED }] };
  }
  const tz = browserTimeZone();
  const plan = launchPlan(c, loadDrafts(userId), accounts, loadBrand(userId), now, tz, [n]);
  return plan.go.length ? sendItems(userId, c, plan.go, accounts, tz) : null;
}

/** Undo of a Make on a post Zernio already holds: it comes off Zernio too (best effort; the weekly sweep catches a miss). */
export function cancelSent(userId: string, draftId: string): void {
  const d = loadDrafts(userId).find((x) => x.id === draftId);
  if (d && canCancel(d.zernio)) void cancelPost(activeProfileId(userId), d.zernio!.postId!).catch(() => undefined);
}
