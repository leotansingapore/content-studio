// Writing a campaign's words (plan-campaign, Leo only): idea-dump mode "campaign", up to 7 posts a call in post
// order, run outside React so leaving the page keeps it going. Each batch is marked drafting in the store before its
// call and written into it as it lands, so a closed tab leaves waiting or drafting posts that the next visit to
// /campaigns or the campaign picks up (startDrafting). The campaign is read again before each batch and after each
// call: a batch that lands after a delete is dropped. A 429 parks the rest until the next 8am Singapore time.

import { planContextFor } from "@/lib/angleSuggest";
import { audienceLine, loadAudiences } from "@/lib/audiences";
import { applyBrandRules, avoidList } from "@/lib/brandRules";
import { getCampaign, loadCampaigns, saveCampaigns, type Campaign, type CampaignPost } from "@/lib/campaigns";
import { loadBrand } from "@/lib/carousel";
import { callFn, EdgeError } from "@/lib/edgeFn";
import { hookFormula } from "@/lib/hookFormulas";
import { findWords } from "@/lib/platformCounters";
import type { WrittenPost } from "../../supabase/functions/idea-dump/logic.ts";

export const BATCH = 7;
export const FAILED_POST = "This post could not be written.";
export const PAUSED_LINE = "Writing paused until 8am. Today's limit for writing campaign posts is used.";
const OFFLINE_LINE = "Couldn't reach the server. Writing goes on the next time you open this campaign.";
const AVOID_HOOKS = 20;
const FIELDS = ["hook", "body", "script", "brief", "cta"] as const;
const GONE = "gone";

export interface Drafting {
  /** Posts with words (ready or further on), failed ones left out. */
  done: number;
  of: number;
  /** Why writing stopped with posts still to write: the 8am line, or the server's own words. */
  paused?: string;
}

const jobs = new Map<string, Drafting>();
const running = new Set<string>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

/** The job's progress for this campaign in this tab; null when nothing is being written or waits. */
export const draftingOf = (campaignId: string): Drafting | null => jobs.get(campaignId) ?? null;

export function onCampaignJob(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** The next 08:00 Singapore time (00:00 UTC), when the daily limits turn over. */
export const nextReset = (now: Date) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString();

const toWrite = (p: CampaignPost) => p.state === "waiting" || p.state === "drafting";
const written = (c: Campaign) => c.posts.filter((p) => !toWrite(p) && p.state !== "failed").length;

/** Saves `change` over the campaign as it is now: null when saved, GONE when it was deleted, else the store's line. */
function edit(userId: string, id: string, change: (c: Campaign) => Campaign): string | null {
  const list = loadCampaigns(userId);
  if (!list.some((c) => c.id === id)) return GONE;
  return saveCampaigns(userId, list.map((c) => (c.id === id ? change(c) : c)));
}
const withPosts = (c: Campaign, patches: Record<number, Partial<CampaignPost>>): Campaign => ({
  ...c,
  posts: c.posts.map((p) => (patches[p.n] ? { ...p, ...patches[p.n], n: p.n } : p)),
});
const each = (batch: CampaignPost[], patch: Partial<CampaignPost>) => Object.fromEntries(batch.map((p) => [p.n, patch]));

/** idea-dump's body for one batch: decision 13's context with the campaign's audience, goal and platforms. */
export function campaignRequest(userId: string, c: Campaign, batch: CampaignPost[]) {
  const saved = loadAudiences(userId).find((a) => a.id === c.audience);
  const asked = new Set(batch.map((p) => p.n));
  return {
    mode: "campaign",
    posts: batch.map((p) => {
      const angle = c.angles.find((a) => a.id === p.angleId);
      const f = hookFormula(p.formulaId);
      return {
        n: p.n,
        angle: { title: angle?.title ?? "", line: angle?.line ?? "" },
        format: p.format,
        stage: p.stage,
        ...(f ? { formula: { name: f.name, template: f.template } } : {}),
        ctaType: p.ctaType,
        platforms: c.platforms,
      };
    }),
    // the goal is the campaign's copy from Add: a later goal change never rewrites an open campaign
    context: { ...planContextFor(userId, c.platforms[0]), platforms: c.platforms, goal: c.goal ?? "", audience: saved ? audienceLine(saved) : c.audienceName },
    avoid: c.posts.filter((p) => p.hook && !asked.has(p.n)).map((p) => p.hook as string).slice(-AVOID_HOOKS),
  };
}

/**
 * The stored words of one written post, inside the brand kit's emoji and hashtag rules; null when it is missing or
 * uses a word the kit says never to use (it is written again).
 */
function wordsOf(w: WrittenPost | undefined, brand: ReturnType<typeof loadBrand>, platform: string, avoid: string[]): Partial<CampaignPost> | null {
  if (!w || typeof w.hook !== "string" || !w.hook.trim()) return null;
  // shortcut: caps each field on its own, so "one emoji" allows one per field; upgrade to a shared budget if a post shows two
  const words = Object.fromEntries(FIELDS.map((k) => [k, typeof w[k] === "string" && w[k].trim() ? applyBrandRules(w[k] as string, brand, platform) : undefined]));
  if (findWords(Object.values(words).filter(Boolean).join("\n"), avoid).length) return null;
  return { ...words, mas: typeof w.mas === "boolean" ? w.mas : null, state: "ready", error: undefined };
}

async function run(userId: string, id: string): Promise<void> {
  // posts a 200 left out (or that broke a kit rule) go back once in this run, then fail (wave 1: a reply can be short)
  const retried = new Set<number>();
  const stop = (paused?: string) => {
    const c = paused ? getCampaign(userId, id) : null;
    if (c) jobs.set(id, { done: written(c), of: c.posts.length, paused });
    else jobs.delete(id);
    notify();
  };
  for (;;) {
    const c = getCampaign(userId, id);
    if (!c) return stop();
    if (c.waitUntil && Date.now() < Date.parse(c.waitUntil)) return stop(PAUSED_LINE);
    const batch = c.posts.filter(toWrite).sort((a, b) => a.n - b.n).slice(0, BATCH);
    if (!batch.length) return stop();
    const marked = edit(userId, id, (x) => ({ ...withPosts(x, each(batch, { state: "drafting" })), waitUntil: undefined }));
    if (marked) return stop(marked === GONE ? undefined : marked);
    jobs.set(id, { done: written(c), of: c.posts.length });
    notify();

    let reply: WrittenPost[];
    try {
      const r = await callFn<{ posts?: WrittenPost[] }>("idea-dump", campaignRequest(userId, c, batch), FAILED_POST);
      reply = Array.isArray(r?.posts) ? r.posts : [];
    } catch (e) {
      const err = e instanceof EdgeError ? e : null;
      if (err?.status === 429) {
        edit(userId, id, (x) => ({ ...withPosts(x, each(batch, { state: "waiting" })), waitUntil: nextReset(new Date()) }));
        return stop(PAUSED_LINE);
      }
      // nothing was written and nothing will be until the connection, the gate or the counter is back: wait for the next visit
      if (!err || err.status === 0 || err.status === 403 || err.status === 503) {
        edit(userId, id, (x) => withPosts(x, each(batch, { state: "waiting" })));
        return stop(err?.message || OFFLINE_LINE);
      }
      // 502 (the use came back), 422 (the use is kept) and anything else: this batch failed, the next one goes on
      const line = edit(userId, id, (x) => withPosts(x, each(batch, { state: "failed", error: FAILED_POST })));
      if (line) return stop(line === GONE ? undefined : line);
      continue;
    }

    const brand = loadBrand(userId);
    const avoid = avoidList(brand);
    const patches: Record<number, Partial<CampaignPost>> = {};
    for (const p of batch) {
      const words = wordsOf(reply.find((w) => w?.n === p.n), brand, c.platforms[0], avoid);
      if (words) patches[p.n] = words;
      else if (retried.has(p.n)) patches[p.n] = { state: "failed", error: FAILED_POST };
      else {
        retried.add(p.n);
        patches[p.n] = { state: "waiting" };
      }
    }
    const line = edit(userId, id, (x) => withPosts(x, patches));
    if (line) return stop(line === GONE ? undefined : line);
  }
}

/** Writes every waiting or drafting post of the campaign, one batch at a time. A second call while it runs does nothing. */
export function startDrafting(userId: string, campaignId: string): void {
  if (running.has(campaignId)) return;
  running.add(campaignId);
  void run(userId, campaignId).finally(() => running.delete(campaignId));
}

/** Try again: the failed posts wait again and the job writes them. Null when saved, else the store's line. */
export function retryFailed(userId: string, campaignId: string): string | null {
  const line = edit(userId, campaignId, (c) => ({ ...c, posts: c.posts.map((p) => (p.state === "failed" ? { ...p, state: "waiting", error: undefined } : p)) }));
  if (line === GONE) return null;
  if (!line) startDrafting(userId, campaignId);
  return line;
}
