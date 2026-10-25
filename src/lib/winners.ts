// Remix your own winners (docs/north-star/items/remix-own-winners.md), outside React. A winner is a measurement:
// per network, of your last 20 posted drafts with numbers (typed or real), with at least 5, a post from the last
// 30 days whose engagements are at least 2x the median of the others and at least 10. Jev then checks it can be
// told again (writing-judge mode evergreen, cap winner-check 5 a day): a dated post is never checked again, and
// no answer keeps it. Versions are made only on a tap (Leo, 25 Oct, Q3), through the remix job (versionsJob.ts).
//   content-studio-winners-<scoped> (synced, per brand): WinnersState. Handled ids sync, so a second device does
//   not make the same set again. What a run did this session (checking, the daily limit, making, Undo) is in memory.

import { withReal } from "@/lib/analytics";
import { deleteDraft, draftStatus, draftsChanged, engagement, getDraftById, loadDrafts, type DraftEntry } from "@/lib/draftHistory";
import { callFn, EdgeError } from "@/lib/edgeFn";
import { scoped } from "@/lib/profiles";
import { onRemixJob, remixJob } from "@/lib/remixJob";
import { draftsInSet } from "@/lib/variants";
import { makeVersions } from "@/lib/versionsJob";
import { SAVE_FAILED } from "@/lib/voiceMemory";
import { median } from "../../supabase/functions/_shared/socialAudit.ts";

const DAY = 86_400_000;
export const WINNER_RATIO = 2;
export const WINNER_FLOOR = 10;
const WINDOW_DAYS = 30;
const LAST_POSTS = 20;
const MIN_POSTS = 5;
const MAX_KEPT = 200;

export interface Winner {
  draft: DraftEntry;
  network: string;
  engagements: number;
  /** The median of the network's other posts. */
  usual: number;
  /** engagements / usual, one decimal; null when the usual is 0. */
  ratio: number | null;
}

export interface WinnersState {
  /** Versions made (setId) or a post Jev called dated: no card, never checked again. */
  handled: Record<string, { at: string; setId?: string; skipped?: "dated" }>;
  /** Jev kept it (evergreen, or no answer): never asked again, and its card waits for a tap. */
  kept: Record<string, string>;
}

/** Winners per network, newest first; handled ids are left out. */
export function findWinners(drafts: DraftEntry[], now: number, handled: WinnersState["handled"] = {}): Winner[] {
  const posted = drafts
    .map(withReal)
    .filter((d) => draftStatus(d) === "posted" && d.postedAt && d.metrics && (d.metrics.impressions || engagement(d.metrics)))
    .sort((a, b) => b.postedAt!.localeCompare(a.postedAt!));
  const out: Winner[] = [];
  for (const network of new Set(posted.map((d) => d.platform))) {
    const last = posted.filter((d) => d.platform === network).slice(0, LAST_POSTS);
    if (last.length < MIN_POSTS) continue;
    for (const d of last) {
      if (handled[d.id] || now - Date.parse(d.postedAt!) > WINDOW_DAYS * DAY) continue;
      const n = engagement(d.metrics);
      const usual = median(last.filter((x) => x !== d).map((x) => engagement(x.metrics))) ?? 0;
      if (n >= WINNER_FLOOR && n >= WINNER_RATIO * usual) out.push({ draft: d, network, engagements: n, usual, ratio: usual > 0 ? Math.round((n / usual) * 10) / 10 : null });
    }
  }
  return out.sort((a, b) => b.draft.postedAt!.localeCompare(a.draft.postedAt!));
}

// ---- the synced state ----

export const WINNERS_CHANGED = "content-studio-winners-changed";
const KEY = "content-studio-winners-";

export function loadWinners(userId: string): WinnersState {
  try {
    const s = JSON.parse(window.localStorage.getItem(KEY + scoped(userId)) ?? "null") as Partial<WinnersState> | null;
    const obj = (x: unknown) => (x && typeof x === "object" && !Array.isArray(x) ? x : {});
    return { handled: obj(s?.handled) as WinnersState["handled"], kept: obj(s?.kept) as WinnersState["kept"] };
  } catch {
    return { handled: {}, kept: {} };
  }
}

/** The newest 200 of each, so the synced key stays small. */
const newest = <T,>(r: Record<string, T>, at: (v: T) => string) => Object.fromEntries(Object.entries(r).sort(([, a], [, b]) => at(b).localeCompare(at(a))).slice(0, MAX_KEPT));

/** Null when saved, else the line. */
function saveWinners(userId: string, s: WinnersState): string | null {
  try {
    window.localStorage.setItem(KEY + scoped(userId), JSON.stringify({ handled: newest(s.handled, (h) => h.at), kept: newest(s.kept, (at) => at) }));
  } catch {
    return SAVE_FAILED;
  }
  window.dispatchEvent(new Event(WINNERS_CHANGED));
  return null;
}

/** `h` null clears it (Undo took every version back). */
export function markHandled(userId: string, draftId: string, h: WinnersState["handled"][string] | null): string | null {
  const s = loadWinners(userId);
  const { [draftId]: _old, ...handled } = s.handled;
  return saveWinners(userId, { ...s, handled: h ? { ...handled, [draftId]: h } : handled });
}

// ---- what this session did ----

type Live = "checking" | "making" | "made" | "failed";
const live = new Map<string, Live>();
/** The UTC day writing-judge answered 429 on (the counter's day), per brand. */
const limited = new Map<string, string>();
/** A made set's versions as saved, for Undo: an edited one no longer matches. */
const madeTexts = new Map<string, Record<string, string>>();
const inFlight = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();
const at = (userId: string, draftId: string) => `${scoped(userId)}|${draftId}`;
const setLive = (userId: string, draftId: string, s: Live | null) => {
  if (s) live.set(at(userId, draftId), s);
  else live.delete(at(userId, draftId));
  listeners.forEach((l) => l());
};
const utcDay = (now: number) => new Date(now).toISOString().slice(0, 10);

export function onWinners(cb: () => void): () => void {
  listeners.add(cb);
  window.addEventListener(WINNERS_CHANGED, cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener(WINNERS_CHANGED, cb);
  };
}

export type WinnerCard = { winner: Winner; status: "ready" | "limit" | "making" | "made" | "failed"; setId?: string };

/**
 * The Winner found cards: "ready" and "failed" offer Make 3 versions (a press), "limit" opens the Remix sheet with
 * 3 versions picked, "making" and "made" (this session, with Undo) show the run. Unchecked, dated and earlier
 * sessions' sets show nothing.
 */
export function winnerCards(userId: string, drafts: DraftEntry[], now: number): WinnerCard[] {
  const s = loadWinners(userId);
  const today = limited.get(scoped(userId)) === utcDay(now);
  return findWinners(drafts, now).flatMap((winner): WinnerCard[] => {
    const id = winner.draft.id;
    const l = live.get(at(userId, id));
    if (l === "made" || l === "making" || l === "failed") return [{ winner, status: l, ...(s.handled[id]?.setId ? { setId: s.handled[id].setId } : {}) }];
    if (s.handled[id]) return [];
    if (s.kept[id]) return [{ winner, status: "ready" }];
    return today && l !== "checking" ? [{ winner, status: "limit" }] : [];
  });
}

/**
 * On a page open (Leo's sign-in): asks Jev about each new winner, one at a time and one run per brand. Dated:
 * handled, never asked again. Evergreen, no answer (502), unreadable (400, 422): kept. 429: the day's checks are
 * used, so the rest wait for tomorrow and nothing is made. Anything else stops the run until the next open.
 */
export function checkWinners(userId: string, drafts: DraftEntry[], now: number = Date.now()): Promise<void> {
  const scope = scoped(userId);
  const going = inFlight.get(scope);
  if (going) return going;
  const p = runChecks(userId, scope, drafts, now).finally(() => inFlight.delete(scope));
  inFlight.set(scope, p);
  return p;
}

async function runChecks(userId: string, scope: string, drafts: DraftEntry[], now: number): Promise<void> {
  if (limited.get(scope) === utcDay(now)) return;
  const s0 = loadWinners(userId);
  for (const w of findWinners(drafts, now, s0.handled).filter((x) => !s0.kept[x.draft.id])) {
    const id = w.draft.id;
    // another brand opened while a call was out: stop rather than write into it
    if (scoped(userId) !== scope) return;
    setLive(userId, id, "checking");
    let evergreen: boolean | null = null;
    try {
      evergreen = (await callFn<{ evergreen: boolean | null }>("writing-judge", { mode: "evergreen", text: w.draft.draft.slice(0, 5000) })).evergreen ?? null;
    } catch (e) {
      const status = e instanceof EdgeError ? e.status : 0;
      if (![400, 422, 502].includes(status)) {
        setLive(userId, id, null);
        if (status === 429) limited.set(scope, utcDay(now));
        return;
      }
    }
    if (scoped(userId) !== scope) return;
    const s = loadWinners(userId);
    const stamp = new Date(now).toISOString();
    if (evergreen === false) saveWinners(userId, { ...s, handled: { ...s.handled, [id]: { at: stamp, skipped: "dated" } } });
    else saveWinners(userId, { ...s, kept: { ...s.kept, [id]: stamp } });
    setLive(userId, id, null);
  }
}

/** "Make 3 versions" on a kept winner's card: the remix job's 3 versions; the set is marked handled once any lands. */
export function makeWinnerVersions(userId: string, draftId: string, now: () => number = Date.now): "started" | "busy" | "gone" {
  const r = makeVersions(userId, { draftId });
  if (r !== "started") return r;
  const run = remixJob()!;
  setLive(userId, draftId, "making");
  const off = onRemixJob((j) => {
    if (j?.id !== run.id || j.state === "working") return;
    off();
    const made = j.rows.filter((x) => x.state === "done" && x.draftId);
    if (!made.length || !j.set) return setLive(userId, draftId, "failed");
    madeTexts.set(j.set.id, Object.fromEntries(made.map((x) => [x.draftId!, getDraftById(userId, x.draftId!)?.draft ?? ""])));
    markHandled(userId, draftId, { at: new Date(now()).toISOString(), setId: j.set.id });
    setLive(userId, draftId, "made");
  });
  return "started";
}

/**
 * Undo on a made card: deletes each version still unscheduled and as the job saved it, keeps any edited or
 * scheduled one. With none left the winner is not handled any more, so its card offers Make 3 versions again.
 * Returns how many went.
 */
export function undoWinner(userId: string, draftId: string): number {
  const setId = loadWinners(userId).handled[draftId]?.setId;
  const texts = setId ? madeTexts.get(setId) : undefined;
  if (!setId || !texts) return 0;
  madeTexts.delete(setId);
  let gone = 0;
  for (const [id, text] of Object.entries(texts)) {
    const d = getDraftById(userId, id);
    if (!d || d.draft !== text || draftStatus(d) !== "draft" || d.scheduledFor || d.zernio) continue;
    deleteDraft(userId, id);
    gone++;
  }
  if (gone) draftsChanged();
  if (!draftsInSet(loadDrafts(userId), setId).length) {
    markHandled(userId, draftId, null);
    setLive(userId, draftId, null);
  }
  return gone;
}
