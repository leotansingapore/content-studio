// A campaign's ads (plan-campaign, Leo only; docs/north-star/items/plan-campaign.md, "Where it runs"): 10 ad drafts
// that each Make writes with /image's own static ad path (startImageWrite: one remix make as "image", on the
// remix-make cap) into a design in Your images, which Edit opens on /image. Made, making and draft are read from that
// design and from the write running in this tab, never stored, so a reload mid-make leaves a draft that Make picks up
// on the same design. Sending hands each made ad to /image's Run as an ad sheet with the campaign's budget, days and
// landing page filled in; the sheet makes it PAUSED in AdLauncher, and only on its own Create paused press. Nothing
// here calls AdLauncher, switches an ad on or spends.

import type { MakeOutcome } from "@/lib/campaignActions";
import { adBits, adLayouts, getCampaign, loadCampaigns, saveCampaigns, type AdBudget, type Campaign, type CampaignAd } from "@/lib/campaigns";
import { imageBlock, LAYOUT_LABELS, mainWords, pictureBlock, staticPhoto } from "@/lib/imageLayout";
import { blankImage, imageWrite, imageWriteBusy, loadImages, saveImage, startImageWrite, WRITE_FAILED, type ImageWrite, type SavedImage } from "@/lib/images";
import { links, type ImageLayout } from "@/lib/links";
import { MAX_DAYS, type AdForm, type AdLaunch } from "@/lib/adlauncher";
import { mentionFor } from "@/lib/postChoices";
import { loadProducts } from "@/lib/products";
import { rememberSource, seenSources } from "@/lib/remixSource";
import { resolveSource } from "@/lib/resolveSource";
import { countryName } from "@/lib/campaignWizard";
import { MAX_TOPIC } from "../../supabase/functions/remix/logic.ts";

export type AdState = "draft" | "making" | "made" | "skipped";
export interface AdView {
  ad: CampaignAd;
  state: AdState;
  /** Its /image design, when this device holds it. */
  design: SavedImage | null;
  /** The design's layout once made (Edit may change it), else the ad's own. */
  layout: ImageLayout;
  /** Linked to a design Your images no longer keeps (it holds the newest 20). */
  gone: boolean;
}

export const AD_BUSY = "Another static ad is being written. Wait for it to finish.";
export const AD_MADE = "This ad is already made.";
export const AD_MAKING = "This ad is being made.";
export const AD_SKIPPED = "Skipped. Press Skip again to bring it back.";
export const AD_GONE = "This ad isn't here any more.";
export const AD_SWAP_MADE = "Change a made ad's layout in Edit.";
const SAVE_LINE = "Couldn't save. Try again.";

const writing = (w: ImageWrite | null) => w?.state === "reading" || w?.state === "writing";

/** Each ad with its state: skipped, being written in this tab, made (its design has its main words), else a draft. */
export function adViews(c: Pick<Campaign, "ads">, designs: SavedImage[], write: ImageWrite | null): AdView[] {
  return (c.ads ?? []).map((ad) => {
    const design = (ad.designId && designs.find((d) => d.id === ad.designId)) || null;
    const made = !!design && !!mainWords(design.layout, design.words).trim();
    const making = !!ad.designId && write?.designId === ad.designId && writing(write);
    const state: AdState = ad.skipped ? "skipped" : making ? "making" : made ? "made" : "draft";
    return { ad, state, design, layout: made && design ? design.layout : ad.layout, gone: !!ad.designId && !design };
  });
}

/** The group's counts over the ads not skipped: a draft is anything not made yet (one being made too). */
export function adCounts(views: AdView[]): { live: number; made: number; drafts: number } {
  const live = views.filter((v) => v.state !== "skipped").length;
  const made = views.filter((v) => v.state === "made").length;
  return { live, made, drafts: live - made };
}

/** "10 ads launch together". */
export const groupTitle = (live: number) => `${live} ${live === 1 ? "ad launches" : "ads launch"} together`;
/** "5 made, 5 drafts". */
export const countsLine = (k: { made: number; drafts: number }) => `${k.made} made, ${k.drafts} ${k.drafts === 1 ? "draft" : "drafts"}`;
/** "4 Headline ad, 3 Quote card, 3 Stat card": the layouts of the ads not skipped, in first-seen order. */
export function layoutMix(views: AdView[]): string {
  const n = new Map<ImageLayout, number>();
  for (const v of views) if (v.state !== "skipped") n.set(v.layout, (n.get(v.layout) ?? 0) + 1);
  return [...n].map(([l, k]) => `${k} ${LAYOUT_LABELS[l]}`).join(", ");
}

/** How many of the campaign's ads are made on this device: what its status counts. */
export const adsMade = (userId: string, c: Pick<Campaign, "ads">) => adCounts(adViews(c, loadImages(userId), imageWrite())).made;

// ---- Make, Swap layout, Skip, Edit ------------------------------------------------------------

function updateAd(userId: string, campaignId: string, n: number, patch: Partial<CampaignAd>): boolean {
  const list = loadCampaigns(userId);
  const c = list.find((x) => x.id === campaignId);
  if (!c?.ads?.some((a) => a.n === n)) return false;
  const next = { ...c, ads: c.ads.map((a) => (a.n === n ? { ...a, ...patch, n } : a)) };
  return !saveCampaigns(userId, list.map((x) => (x.id === campaignId ? next : x)));
}

function find(userId: string, campaignId: string, n: number) {
  const c = getCampaign(userId, campaignId);
  const view = c ? adViews(c, loadImages(userId), imageWrite()).find((v) => v.ad.n === n) : undefined;
  return c && view ? { c, ad: view.ad, view } : null;
}

const angleOf = (c: Pick<Campaign, "angles" | "audienceName">, ad: CampaignAd) => c.angles.find((a) => a.id === ad.angleId);

/** What the ad is about when it remixes nothing: its angle, else the audience. */
export function adTopic(c: Pick<Campaign, "angles" | "audienceName">, ad: CampaignAd): string {
  const a = angleOf(c, ad);
  return (a ? [a.title, a.line].filter((t) => t.trim()).join(": ") : c.audienceName).slice(0, MAX_TOPIC);
}

/** The note a remixed ad's make carries (a source's make takes no topic): the angle it pushes. Under 300 characters. */
export function adNote(c: Pick<Campaign, "angles" | "audienceName">, ad: CampaignAd): string {
  const a = angleOf(c, ad);
  return a ? `Push this angle: ${[a.title, a.line].filter((t) => t.trim()).join(". ")}`.slice(0, 300) : "";
}

/** The ad's design: its unwritten one again (a failed or stopped Make, or Edit), else a new one; saved and linked. */
function designFor(userId: string, c: Campaign, ad: CampaignAd, existing: SavedImage | null): SavedImage | null {
  const base = existing ?? blankImage({ layout: ad.layout, size: "4x5", ...(ad.source ? { source: ad.source } : {}) });
  // as a static format's own page starts its design: the product photo when the format shows one, the price on a flyer
  const bits = adBits(loadProducts(userId));
  const picture = !base.pictureKey && bits.picture && staticPhoto(ad.layout) ? bits.picture : undefined;
  const price = ad.layout === "tear-off-flyer" && !base.words.price?.trim() ? bits.price?.slice(0, 40) : undefined;
  const design: SavedImage = { ...base, layout: ad.layout, words: { ...base.words, topic: adTopic(c, ad), ...(price ? { price } : {}) }, ...(picture ? { pictureKey: picture } : {}) };
  saveImage(userId, design);
  return updateAd(userId, c.id, ad.n, { designId: design.id, error: undefined }) ? design : null;
}

/** Writes the ad into its design with /image's own write. Not while another static ad is being written. */
export async function makeAd(userId: string, campaignId: string, n: number): Promise<MakeOutcome> {
  const f = find(userId, campaignId, n);
  if (!f) return { ok: false, error: AD_GONE };
  const { c, ad, view } = f;
  if (view.state !== "draft") return { ok: false, error: view.state === "made" ? AD_MADE : view.state === "making" ? AD_MAKING : AD_SKIPPED };
  if (imageWriteBusy()) return { ok: false, error: AD_BUSY };
  const source = ad.source ? (resolveSource(ad.source.key, userId) ?? seenSources(userId).find((s) => s.key === ad.source?.key) ?? null) : null;
  // so /image finds it again when this design is opened there
  if (source) rememberSource(source, userId);
  const design = designFor(userId, c, ad, view.design);
  if (!design) return { ok: false, error: SAVE_LINE };
  // the seam's layout, never Jev's pick; a competitor ad's picture link expires, so it is never read (read: false)
  const run = startImageWrite(userId, {
    designId: design.id, source, topic: adTopic(c, ad), layout: ad.layout, mention: mentionFor(userId), note: source ? adNote(c, ad) : "", size: "4x5", read: false,
  });
  const id = imageWrite()?.id;
  await run;
  const w = imageWrite();
  if (w?.id === id && w.state === "done") return { ok: true, toast: `Ad ${n} is made.`, undo: () => void undoMakeAd(userId, campaignId, n) };
  const error = (w?.id === id && w.error) || WRITE_FAILED;
  updateAd(userId, campaignId, n, { error });
  return { ok: false, error, ...(w?.id === id && w.capped ? { capped: true as const } : {}) };
}

/** Undo for Make: the ad is a draft again; its design stays in Your images (the remix make was spent). */
export const undoMakeAd = (userId: string, campaignId: string, n: number) => updateAd(userId, campaignId, n, { designId: undefined, error: undefined });

/** The next of the brand's layouts (adLayouts, the list the plan chose from) for a draft; Undo puts the one before back. */
export function swapAdLayout(userId: string, campaignId: string, n: number): MakeOutcome {
  const f = find(userId, campaignId, n);
  if (!f) return { ok: false, error: AD_GONE };
  if (f.view.state === "made" || f.view.state === "making") return { ok: false, error: f.view.state === "made" ? AD_SWAP_MADE : AD_MAKING };
  const was = f.ad.layout;
  const list = adLayouts(adBits(loadProducts(userId)));
  const layout = list[(list.indexOf(was) + 1) % list.length];
  if (!updateAd(userId, campaignId, n, { layout })) return { ok: false, error: SAVE_LINE };
  return { ok: true, toast: `Ad ${n} is now: ${LAYOUT_LABELS[layout]}.`, undo: () => void updateAd(userId, campaignId, n, { layout: was }) };
}

/** Skip toggles: a skipped ad leaves the counts and the hand-off; Skip again (or Undo) brings it back. */
export function skipAd(userId: string, campaignId: string, n: number): MakeOutcome {
  const f = find(userId, campaignId, n);
  if (!f) return { ok: false, error: AD_GONE };
  if (f.view.state === "making") return { ok: false, error: AD_MAKING };
  const back = !!f.ad.skipped;
  const flip = (skipped: boolean) => updateAd(userId, campaignId, n, { skipped: skipped ? true : undefined });
  if (!flip(!back)) return { ok: false, error: SAVE_LINE };
  return { ok: true, toast: back ? `Ad ${n} is back.` : `Ad ${n} skipped.`, undo: () => void flip(back) };
}

/** Edit: the ad's design on /image; a draft gets its design first (nothing is written or spent). Null when it couldn't save. */
export function editAdLink(userId: string, campaignId: string, n: number): string | null {
  const f = find(userId, campaignId, n);
  if (!f) return null;
  const design = f.view.state === "made" || f.view.state === "making" ? f.view.design : designFor(userId, f.c, f.ad, f.view.design);
  return design ? links.image({ layout: design.layout, size: design.size, image: design.id }) : null;
}

// ---- Send the ads to AdLauncher ---------------------------------------------------------------

/** Run as an ad's own sessionStorage key for what is typed in its sheet (RunAsAdSheet.tsx sheetKey, read on open). */
export const sheetKey = (designId: string) => `cs-ad-sheet-${designId}`;

export interface SendPlan {
  /** Made ads not skipped, in order: each goes to AdLauncher on its own. */
  ads: AdView[];
  /** The daily budget split across them, to the cent below, so the 10 together spend what the campaign says. */
  perAd: number;
  days: number;
  /** Design ids already made in AdLauncher from this device or another (the synced launches). */
  sent: string[];
}

export function sendPlan(c: Pick<Campaign, "budget" | "weeks">, views: AdView[], launches: Pick<AdLaunch, "designId">[]): SendPlan {
  const ads = views.filter((v) => v.state === "made" && v.design);
  const daily = c.budget?.daily ?? 0;
  return {
    ads,
    perAd: ads.length ? Math.floor((daily * 100) / ads.length) / 100 : 0,
    days: Math.min(MAX_DAYS, c.weeks * 7),
    sent: launches.flatMap((l) => (l.designId ? [l.designId] : [])),
  };
}

/** Why a made ad can't open Run as an ad yet (/image keeps the sheet shut), else null: a stat card's own number, a format's photo. */
export const sendBlock = (v: AdView) => (v.design ? (imageBlock(v.design.layout, v.design.words) ?? pictureBlock(v.design.layout, v.design.pictureKey ? 1 : 0)) : AD_GONE);

/** What the sheet starts on: a website ad to the landing page, the per-ad budget and the campaign's days. */
export const sheetPrefill = (c: Pick<Campaign, "budget">, plan: Pick<SendPlan, "perAd" | "days">): Pick<AdForm, "goal" | "url" | "dailyBudget" | "days"> => ({
  goal: "website", url: c.budget?.url ?? "", dailyBudget: String(plan.perAd), days: String(plan.days),
});

/** The campaign's settings the sheet has no field for, in words: they stay here, and are set in AdLauncher. */
export function notTaken(b: AdBudget): string[] {
  const out: string[] = [];
  if (b.countries.some((x) => x !== "SG")) out.push(`Countries: ${b.countries.map(countryName).join(", ")}. The ad starts in Singapore only.`);
  out.push(`Ages: ${b.ages[0]} to ${b.ages[1]}.`);
  out.push("Budget: US$ here, your ad account's own currency in AdLauncher.");
  return out;
}

/**
 * Fills the sheet for one made ad and returns its /image address with the sheet open. What the person typed in the
 * sheet before (its headline, text, approval code) stays; the campaign's settings replace the rest. Nothing is sent.
 */
export function handOff(c: Pick<Campaign, "budget">, v: AdView, plan: Pick<SendPlan, "perAd" | "days">): string | null {
  const d = v.design;
  if (!d) return null;
  try {
    const kept = JSON.parse(sessionStorage.getItem(sheetKey(d.id)) ?? "null");
    sessionStorage.setItem(sheetKey(d.id), JSON.stringify({ ...(kept && typeof kept === "object" ? kept : {}), ...sheetPrefill(c, plan) }));
  } catch {
    // private mode: the sheet opens on its own defaults, and the settings are listed beside the button
  }
  return links.image({ layout: d.layout, size: d.size, image: d.id, ad: true });
}
