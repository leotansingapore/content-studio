// WHAT IT COSTS on /campaigns/:id (plan-campaign-page, Leo only): what making the rest comes to, from campaignCost
// (free posts; slideshows and walls on today's remix limit; AI videos at AI_VIDEO each) and what today's limits cover,
// then "Make the <f> free posts" through makeFreePosts. The run lives in this module, not the component, so leaving
// the page keeps it going and coming back shows its progress, counted from the posts the store marks made.

import { useEffect, useReducer } from "react";
import { Button } from "@/components/ui/button";
import { ToastAction } from "@/components/ui/toast";
import { toast } from "@/hooks/use-toast";
import { useUsesLeft } from "@/lib/aiUsage";
import { makeFreePosts } from "@/lib/campaignActions";
import { draftingOf } from "@/lib/campaignJob";
import {
  AI_VIDEO, campaignCost, draftsDropped, FREE_FORMATS, getCampaign, REMIX_MAKE, videosLeft, type Campaign, type CampaignCost,
} from "@/lib/campaigns";
import { listJoin } from "@/lib/campaignWizard";
import { loadDrafts, MAX_DRAFTS } from "@/lib/draftHistory";
import { priceText } from "@/lib/prices";

const HEAD = "text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground";
export const UNREAD_LINE = "Couldn't read today's limits. Make still checks them.";
export const CAUTION_LINE = "AI can make mistakes. Check each post before it goes out.";
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const lower = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);
const later = (n: number) => `${n === 1 ? "It" : `The ${n}`} can be made from 8am tomorrow.`;

/** The big figure, the line under it, and the lines naming what is paid and what today's limits cover. */
export function costLines(c: Pick<Campaign, "posts">, cost: CampaignCost): { big: string; sub: string; lines: string[] } {
  const { slideshows, walls, videos } = cost.made;
  const remix = slideshows + walls;
  if (!remix && !videos) {
    const paidMade = c.posts.some((p) => !FREE_FORMATS.includes(p.format) && p.state === "made");
    return { big: "Free", sub: `Every post ${paidMade ? "left" : "here"} costs nothing to make.`, lines: [] };
  }
  const what: string[] = [];
  if (cost.free) what.push(`${plural(cost.free, "free post")}.`);
  const remixName = listJoin([...(slideshows ? [plural(slideshows, "slideshow")] : []), ...(walls ? [plural(walls, "wall of text", "walls of text")] : [])]);
  if (remix) what.push(`${remixName} at ${lower(priceText(REMIX_MAKE))}${remix === 1 ? "" : " each"}, from today's remix limit.`);
  if (videos) what.push(`${plural(videos, "AI video")} at ${lower(priceText(AI_VIDEO))}${videos === 1 ? "" : " each"}.`);
  const lines = [what.join(" ")];
  const { videos: cv, remix: cr } = cost.covers;
  if ((videos && cv === null) || (remix && cr === null)) lines.push(UNREAD_LINE);
  else {
    if (videos && cv !== null) {
      if (cv >= videos) lines.push(videos === 1 ? "Today's limit covers the AI video." : `Today's limit covers all ${videos} AI videos.`);
      else if (cv === 0) lines.push(`No AI videos left today. ${later(videos)}`);
      else lines.push(`Today's limit covers ${cv} of the ${videos} AI videos. The other ${videos - cv} can be made from 8am tomorrow.`);
    }
    if (remix && cr !== null && cr < remix) {
      const name = slideshows && walls ? "slideshows and walls" : slideshows ? "slideshows" : "walls of text";
      lines.push(cr === 0 ? `Today's remix limit is used. ${later(remix)}` : `Today's remix limit covers ${cr} of the ${remix} ${name}. The other ${remix - cr} can be made from 8am tomorrow.`);
    }
  }
  return { big: `US$${cost.usd.toFixed(2)}`, sub: "to make what's left", lines };
}

/** The free posts button: how many it makes and why it can't go yet; null when the campaign has no free format. */
export function freeState(c: Pick<Campaign, "posts">, paused: boolean): { f: number; reason: string | null } | null {
  const free = c.posts.filter((p) => FREE_FORMATS.includes(p.format));
  if (!free.length) return null;
  const ready = free.filter((p) => p.state === "ready").length;
  // writing paused at the daily limit: the ready ones can still be made today
  const writing = paused ? 0 : free.filter((p) => p.state === "waiting" || p.state === "drafting").length;
  if (writing) return { f: ready + writing, reason: `Waiting for ${plural(writing, "post")} to be written.` };
  if (ready) return { f: ready, reason: null };
  return { f: 0, reason: free.every((p) => p.state === "made" || p.state === "skipped") ? "All free posts are made." : "No free posts are ready to make." };
}

// ---- The run, outside React ---------------------------------------------------------

interface Run { ns: number[]; done?: { made: number; failed: number } }
const runs = new Map<string, Run>();
const subs = new Set<() => void>();
const ping = () => subs.forEach((f) => f());

/** The run for this campaign in this tab: running (no `done`), finished, or undefined. */
export const freeRunOf = (campaignId: string): Run | undefined => runs.get(campaignId);

/** Makes every ready free post through makeFreePosts; a press while a run is going does nothing. */
export function startFreeRun(userId: string, c: Pick<Campaign, "id" | "posts">): void {
  const now = runs.get(c.id);
  if (now && !now.done) return;
  const ns = c.posts.filter((p) => p.state === "ready" && FREE_FORMATS.includes(p.format)).map((p) => p.n);
  runs.set(c.id, { ns });
  ping();
  const finish = (made: number, failed: number, undo?: () => void) => {
    runs.set(c.id, { ns, done: { made, failed } });
    ping();
    if (made && undo) {
      toast({
        title: `${plural(made, "post")} ${made === 1 ? "is" : "are"} on your calendar.`,
        action: <ToastAction altText="Undo" onClick={undo}>Undo</ToastAction>,
      });
    }
  };
  makeFreePosts(userId, c.id, ping).then(
    (r) => finish(r.made, r.failed, r.undo),
    () => {
      const left = getCampaign(userId, c.id)?.posts ?? [];
      finish(0, ns.filter((n) => left.find((p) => p.n === n)?.state !== "made").length);
    },
  );
}

function useFreeRun(campaignId: string): Run | undefined {
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    subs.add(redraw);
    return () => void subs.delete(redraw);
  }, []);
  return runs.get(campaignId);
}

export default function CostPanel({ userId, campaign: c }: { userId: string; campaign: Campaign }) {
  const run = useFreeRun(c.id);
  // read again when an AI video Make in the queue ends
  const usesLeft = useUsesLeft(c.posts.some((p) => p.state === "making"));
  const cost = campaignCost(c, { video: videosLeft(usesLeft("ai-video"), usesLeft("ai-voice")), remix: usesLeft("remix-make") });
  const { big, sub, lines } = costLines(c, cost);

  const drafting = draftingOf(c.id);
  const paused = !!((c.waitUntil && Date.now() < Date.parse(c.waitUntil)) || drafting?.paused);
  const live = c.posts.filter((p) => p.state !== "skipped");
  const made = live.filter((p) => p.state === "made").length;
  const progress = drafting && !drafting.paused ? `Writing ${drafting.done} of ${drafting.of}` : `${made} of ${live.length} made | ${live.length - made} to make`;

  const state = freeState(c, paused);
  const running = !!run && !run.done;
  const step = running ? run.ns.filter((n) => c.posts.find((p) => p.n === n)?.state === "made").length : 0;
  const dropped = state && !running ? draftsDropped(loadDrafts(userId).length, state.f) : 0;
  const failed = run?.done?.failed ?? 0;

  return (
    <section aria-labelledby="cost-h" className="space-y-3 rounded-xl border border-border/60 bg-card p-5 shadow-card">
      <h2 id="cost-h" className={HEAD}>What it costs</h2>
      <div>
        <p className="font-serif text-3xl font-semibold tabular-nums">{big}</p>
        <p className="text-sm text-muted-foreground">{sub}</p>
      </div>
      <p className="text-sm tabular-nums">{progress}</p>
      {lines.map((l) => <p key={l} className="text-sm">{l}</p>)}

      {state && (
        <div className="space-y-2 border-t border-border/60 pt-3">
          {dropped > 0 && (
            <p className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
              My posts keeps your newest {MAX_DRAFTS}, so making {state.f} drops your {dropped} oldest from it.
            </p>
          )}
          <Button className="h-11 w-full sm:h-10" disabled={running || !!state.reason} onClick={() => startFreeRun(userId, c)}>
            {running ? `Making ${Math.min(step + 1, run.ns.length)} of ${run.ns.length}...` : state.f ? `Make the ${plural(state.f, "free post")}` : "Make the free posts"}
          </Button>
          {running && (
            <div role="progressbar" aria-label="Making the free posts" aria-valuemin={0} aria-valuemax={run.ns.length} aria-valuenow={step}
              className="h-1 overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-primary transition-[width] duration-300" style={{ width: `${(step / Math.max(1, run.ns.length)) * 100}%` }} />
            </div>
          )}
          {!running && state.reason && <p className="text-xs text-muted-foreground">{state.reason}</p>}
          {!running && failed > 0 && (
            <p role="alert" className="text-sm text-destructive">
              {failed === 1 ? "1 post could not be made. It stays in the queue." : `${failed} posts could not be made. They stay in the queue.`}
            </p>
          )}
          <p className="text-xs text-muted-foreground">They go on your calendar on their days. Nothing posts until you schedule it.</p>
        </div>
      )}
      <p className="text-xs text-muted-foreground">{CAUTION_LINE}</p>
    </section>
  );
}
