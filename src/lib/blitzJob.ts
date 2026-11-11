// Making today's Blitz deck outside React (plan-blitz), so leaving /blitz keeps it going and cards appear as each
// lands. One card at a time, each one existing make on the remix-make cap: a slideshow through slideshowJob (saved
// to Slideshows like any other), or a wall of text's words through the wall maker's own make call (the clip and
// the video wait for the wall maker, so ten walls never queue ten videos in the editor). A spent cap stops the
// deck and keeps what it made. In memory: a reload stops the run, and the page picks it up on its next open.
// Keep, Skip and Undo live here too. The deck shows on /library's Making now through formatJob.ts.

import { applyBrandRules } from "@/lib/brandRules";
import { loadBrand } from "@/lib/carousel";
import { loadCompetitorAds, toAdLike } from "@/lib/competitorAds";
import { loadCompetitors } from "@/lib/competitors";
import { deleteDraft, draftsChanged, loadDrafts, newDraftId, upsertDraft, type DraftEntry } from "@/lib/draftHistory";
import { EdgeError } from "@/lib/edgeFn";
import { clearFormatJob, setFormatJob } from "@/lib/formatJob";
import { FORMAT_TRENDS } from "@/lib/formatTrends";
import { mentionFor } from "@/lib/postChoices";
import { arrange, genIdeas, loadIdeas, loadPoolStores, poolIdeas } from "@/lib/ideasInbox";
import { links } from "@/lib/links";
import { loadMedia } from "@/lib/mediaLibrary";
import { stripDashes } from "@/lib/plainText";
import { requestMake } from "@/lib/remix";
import { loadSlideshows, removeSlideshow, saveSlideshow, slideshowToDraft, type Slideshow } from "@/lib/slideshow";
import { makeBody, slideshowBusy, slideshowJob, startSlideshow } from "@/lib/slideshowJob";
import { findWinners, loadWinners } from "@/lib/winners";
import {
  CAPPED_LINE, FAILED_LINE, emptyReason, loadBlitz, loadStored, madeCount, patchCard, pickDeck, rememberUsed, saveBlitz, usedKeyOf, usedKeys,
  type BlitzCard, type Pools,
} from "@/lib/blitz";

const SLUG = "blitz";
const LABEL = "Blitz deck";

let running = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
export const blitzBusy = () => running;
export function onBlitzJob(cb: () => void): () => void {
  listeners.add(cb);
  return () => void listeners.delete(cb);
}

/** Everything a deck can draw on, read from this brand's stores. */
export function loadPools(userId: string, now = new Date()): Pools {
  const names = new Map(loadCompetitors(userId).list.map((c) => [c.id, c.name]));
  const ads = Object.entries(loadCompetitorAds(userId)).flatMap(([id, e]) => (names.has(id) ? e.ads.map((ad) => ({ ad: toAdLike(ad, names.get(id)!) })) : []));
  const ideasState = loadIdeas(userId);
  const all = [...genIdeas(ideasState), ...poolIdeas(loadPoolStores(userId), now)];
  // shortlisted ideas first, then the inbox
  const ideas = [...arrange(all, ideasState.status, { tab: "shortlist" }), ...arrange(all, ideasState.status, { tab: "inbox" })].map((i) => ({ title: i.title, angle: i.angle, from: i.from }));
  // the whole latest drop, however old: /trends hides a drop past 21 days because it says "this week", but a format's
  // shape still remixes, and without it a brand with no ads, winners or ideas has no deck at all
  return { ads, trends: FORMAT_TRENDS.items, winners: findWinners(loadDrafts(userId), now.getTime(), loadWinners(userId).handled), ideas };
}

/** Has nothing to draw on today: no source switched on with anything in it, and no ideas. */
export const nothingToDraw = (userId: string, now = new Date()) =>
  pickDeck(loadPools(userId, now), loadBlitz(userId, now).mix, new Set(), { n: 1, now: now.getTime() }).length === 0;

/** Why nothing can be dealt, from what this brand has (emptyReason). */
export function whyEmpty(userId: string, now = new Date()) {
  const p = loadPools(userId, now);
  return emptyReason({ competitors: loadCompetitors(userId).list.length, ads: p.ads.length, trends: p.trends.length, winners: p.winners.length, ideas: p.ideas.length }, loadBlitz(userId, now).mix);
}

function mirror(userId: string) {
  const cards = loadBlitz(userId).cards;
  const made = madeCount(cards);
  if (running) return setFormatJob({ slug: SLUG, label: LABEL, format: "carousel", state: "working", step: `Making today's ${cards.length}, ${made} ready`, href: links.blitz() });
  if (!cards.length) return clearFormatJob(SLUG);
  setFormatJob(made ? { slug: SLUG, label: LABEL, format: "carousel", state: "ready", href: links.blitz() } : { slug: SLUG, label: LABEL, format: "carousel", state: "failed", error: CAPPED_LINE, href: links.blitz() });
}

/**
 * Makes today's deck, or goes on with it (a reload stopped it, or Try again). A new day's deck first clears the last
 * deck's slideshows nobody kept or skipped, then picks its cards. "empty": nothing to draw on.
 */
export function startDeck(userId: string, now = new Date()): "started" | "busy" | "empty" | "capped" {
  if (running) return "busy";
  const today = loadBlitz(userId, now);
  if (!today.cards.length) {
    // today's remixes ran out before a card was made: nothing more until 8am Singapore time
    if (today.capped) return "capped";
    const old = loadStored(userId);
    if (old && old.day !== today.day) for (const c of old.cards) if (c.state === "new" && c.showId) removeSlideshow(userId, c.showId);
    const cards = pickDeck(loadPools(userId, now), today.mix, usedKeys(userId, now), { media: loadMedia(userId).length > 0, now: now.getTime() });
    if (!cards.length) return "empty";
    rememberUsed(userId, cards.map(usedKeyOf).filter(Boolean), now);
    saveBlitz(userId, { day: today.day, mix: today.mix, cards });
  }
  void run(userId);
  return "started";
}

/** A failed card back in line, and the deck going again. */
export function retryCard(userId: string, id: string): void {
  patchCard(userId, id, { state: "waiting", error: undefined });
  if (!running) void run(userId);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function run(userId: string): Promise<void> {
  running = true;
  emit();
  mirror(userId);
  try {
    for (;;) {
      // "making" with nothing running is a run a reload stopped
      const card = loadBlitz(userId).cards.find((c) => c.state === "waiting" || c.state === "making");
      if (!card) break;
      patchCard(userId, card.id, { state: "making", error: undefined });
      mirror(userId);
      const made = await makeCard(userId, card);
      if (made === "capped") {
        const s = loadBlitz(userId);
        // the deck keeps what it made; the rest would only hit the cap again
        saveBlitz(userId, { ...s, capped: true, cards: s.cards.filter((c) => c.state !== "waiting" && c.state !== "making") });
        break;
      }
      patchCard(userId, card.id, made);
      mirror(userId);
    }
  } finally {
    running = false;
    emit();
    mirror(userId);
  }
}

/** One card's make: its patch, or "capped" when the day's remixes are gone. */
export async function makeCard(userId: string, card: BlitzCard): Promise<Partial<BlitzCard> | "capped"> {
  const topic = card.source ? "" : (card.topic?.title ?? "");
  const note = card.source ? "" : (card.topic?.angle ?? "");
  // the brand's Name your business choice (Settings > Post choices): Never, Sometimes (a flip per card) or Always
  const mention = mentionFor(userId);
  if (card.format === "slideshow") {
    // one slideshow at a time across the app: wait for one made on its own page
    while (slideshowBusy()) await sleep(1000);
    const mood = loadBlitz(userId).mix.mood;
    const go = startSlideshow(userId, { source: card.source, topic, note, mention, size: "4x5", pictures: card.pictures ?? "stock", ...(mood ? { mood } : {}) });
    const id = slideshowJob()?.id;
    await go;
    const j = slideshowJob();
    if (j?.id === id && j.state === "done" && j.showId) return { state: "new", showId: j.showId };
    if (j?.id === id && j.capped) return "capped";
    return { state: "failed", error: FAILED_LINE };
  }
  try {
    const res = await requestMake(makeBody(userId, { source: card.source, topic, note, mention, size: "9x16" }, "wall"));
    if (res?.result?.as !== "wall") return { state: "failed", error: FAILED_LINE };
    const text = stripDashes(res.result.text).trim();
    const caption = stripDashes(applyBrandRules(res.result.caption, loadBrand(userId), "tiktok")).trim();
    return text ? { state: "new", wall: { text, caption } } : { state: "failed", error: FAILED_LINE };
  } catch (e) {
    return e instanceof EdgeError && e.code === "daily_limit" ? "capped" : { state: "failed", error: FAILED_LINE };
  }
}

// ---- Keep, Skip, Undo ----

/** A kept wall of text: its words as a short video script with the caption under it (Clone a reel's shape). */
export function wallDraft(card: BlitzCard, now: Date): DraftEntry {
  const text = card.wall?.text ?? "";
  const hook = text.split("\n").find((l) => l.trim())?.trim().slice(0, 160) ?? "";
  return {
    id: newDraftId(),
    createdAt: now.toISOString(),
    hook,
    draft: card.wall?.caption ? `${text}\n\n---\n\nCAPTION:\n${card.wall.caption}` : text,
    pillar: "topic",
    pillarDetail: hook,
    audience: "general",
    format: "short-video",
    platform: "tiktok",
    ctaType: "save-share",
    status: "draft",
    ...(card.source ? { source: { ...card.source, remixedAt: now.toISOString() } } : {}),
  };
}

/** Keep: the card's draft into My posts, unscheduled. Its id, or null when the card or its slideshow is gone. */
export function keepCard(userId: string, id: string, now = new Date()): string | null {
  const card = loadBlitz(userId, now).cards.find((c) => c.id === id);
  if (!card || card.state === "kept") return card?.draftId ?? null;
  if (card.state !== "new") return null;
  let draft: DraftEntry;
  if (card.format === "slideshow") {
    const show = loadSlideshows(userId).find((s) => s.id === card.showId);
    if (!show) return null;
    draft = { ...slideshowToDraft(show, now.toISOString()), status: "draft" };
    saveSlideshow(userId, { ...show, draftId: draft.id });
  } else draft = wallDraft(card, now);
  upsertDraft(userId, draft);
  draftsChanged();
  patchCard(userId, id, { state: "kept", draftId: draft.id }, now);
  return draft.id;
}

export function undoKeep(userId: string, id: string): void {
  const card = loadBlitz(userId).cards.find((c) => c.id === id);
  if (!card?.draftId) return;
  deleteDraft(userId, card.draftId);
  draftsChanged();
  const show = card.showId ? loadSlideshows(userId).find((s) => s.id === card.showId) : undefined;
  if (show) saveSlideshow(userId, { ...show, draftId: undefined });
  patchCard(userId, id, { state: "new", draftId: undefined });
}

/** Skip: nothing is saved, so a skipped slideshow leaves Slideshows. Returns its Undo. */
export function skipCard(userId: string, id: string): () => void {
  const card = loadBlitz(userId).cards.find((c) => c.id === id);
  if (!card || (card.state !== "new" && card.state !== "failed")) return () => {};
  const show: Slideshow | undefined = card.showId ? loadSlideshows(userId).find((s) => s.id === card.showId) : undefined;
  if (show) removeSlideshow(userId, show.id);
  patchCard(userId, id, { state: "skipped" });
  return () => {
    if (show) saveSlideshow(userId, show);
    patchCard(userId, id, { state: card.state });
  };
}

/** Where Edit goes: the slideshow editor or Write, with from=blitz. The card is kept first, so the edit lands in My posts. */
export function editHref(userId: string, id: string): string | null {
  const draftId = keepCard(userId, id);
  const card = loadBlitz(userId).cards.find((c) => c.id === id);
  if (!draftId || !card) return null;
  const href = card.format === "slideshow" && card.showId ? links.slideshow({ s: card.showId }) : links.generate({ draft: draftId });
  return `${href}${href.includes("?") ? "&" : "?"}from=blitz`;
}

