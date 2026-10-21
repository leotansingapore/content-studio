// Is this a good fit for you? (docs/north-star/items/remix-fit-check.md): one Jev check per source, brand and
// video-or-not, kept on this device for 7 days as a hint that saves calls (cs-remix-fit-<scoped uid>, not synced).
// The verdict and its reason lines are fixed in supabase/functions/remix/logic.ts; this only fetches and keeps them.

import { callFn } from "@/lib/edgeFn";
import { scoped } from "@/lib/profiles";
import { fullText } from "@/lib/remix";
import { brandPack } from "@/lib/remixBrand";
import type { RemixSource } from "@/lib/remixSource";
import { UNKNOWN_FIT, type FitResult, type FitVerdict, type Speaker } from "../../supabase/functions/remix/logic.ts";

export { FIT_COPY, UNKNOWN_FIT, fitReasonLine, type FitResult, type FitVerdict } from "../../supabase/functions/remix/logic.ts";

const PREFIX = "cs-remix-fit-";
export const MAX_FITS = 200;
export const FIT_DAYS = 7;
/** A press during the check waits at most this long for it (Jev's own timeout). */
export const FIT_WAIT_MS = 5000;

type Kept = FitResult & { at: string };

function storage(): Storage | null {
  try {
    return globalThis.window?.localStorage ?? null;
  } catch {
    return null;
  }
}

/** Text-heavy is asked only for a video made from a video or carousel, so any other source reads the same either way. */
export const fitVideo = (s: Pick<RemixSource, "format">, videoPicked: boolean) => videoPicked && (s.format === "video" || s.format === "carousel");

/** A business is asked no masSafe question, so its answers are kept apart; a person's keep their old key. */
const entryKey = (key: string, video: boolean, speaker: Speaker) => `${key}|${video ? "video" : "text"}${speaker === "business" ? "|business" : ""}`;

function loadAll(userId: string): Record<string, Kept> {
  try {
    const raw = JSON.parse(storage()?.getItem(PREFIX + scoped(userId)) ?? "{}");
    return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  } catch {
    return {};
  }
}

/** The kept answer, or null when there is none or it is over 7 days old. */
export function loadFit(userId: string, key: string, video: boolean, now = new Date(), speaker: Speaker = "person"): FitResult | null {
  const f = loadAll(userId)[entryKey(key, video, speaker)];
  const fresh = f && typeof f.at === "string" && now.getTime() - Date.parse(f.at) < FIT_DAYS * 86_400_000;
  return fresh && ["good", "weak", "poor"].includes(f.verdict) && Array.isArray(f.reasons) ? { verdict: f.verdict, reasons: f.reasons } : null;
}

/** Unknown is never kept: it means Jev or the cap was out, so the next open asks again. */
export function saveFit(userId: string, key: string, video: boolean, f: FitResult, now = new Date(), speaker: Speaker = "person"): void {
  if (f.verdict === "unknown") return;
  const kept = Object.entries({ ...loadAll(userId), [entryKey(key, video, speaker)]: { ...f, at: now.toISOString() } })
    .sort(([, a], [, b]) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, MAX_FITS);
  try {
    storage()?.setItem(PREFIX + scoped(userId), JSON.stringify(Object.fromEntries(kept)));
  } catch {
    // storage full: the line still shows, the next open just asks again
  }
}

const running = new Map<string, Promise<FitResult>>();

/**
 * The check for this source: the device first, then one remix call (mode fit). Never throws; unknown on any failure.
 * `speaker` is the sheet's For row pick (as you or as the business); only a person is asked the MAS-safe question.
 */
export function requestFit(userId: string, s: RemixSource, video: boolean, speaker?: Speaker): Promise<FitResult> {
  const { name, oneLiner, audience, topics, speaker: as } = brandPack(userId, { platform: "instagram", mention: false, offer: null, speaker });
  const kept = loadFit(userId, s.key, video, new Date(), as);
  if (kept) return Promise.resolve(kept);
  // with nothing about who the brand serves there is nothing to judge against
  if (!oneLiner && !audience && !topics.length) return Promise.resolve(UNKNOWN_FIT);
  const id = `${scoped(userId)}|${entryKey(s.key, video, as)}`;
  let run = running.get(id);
  if (!run) {
    const { key, kind, format, platform, title, author, url } = s;
    run = callFn<FitResult>("remix", {
      mode: "fit",
      source: { key, kind, format, platform, title, author, url, text: fullText(s, userId) },
      brand: { name, oneLiner, audience, topics, speaker: as },
      video,
    })
      .then((f) => {
        const verdict = (["good", "weak", "poor", "unknown"] as FitVerdict[]).find((v) => v === f?.verdict) ?? "unknown";
        const result: FitResult = { verdict, reasons: Array.isArray(f?.reasons) ? f.reasons : [] };
        saveFit(userId, s.key, video, result, new Date(), as);
        return result;
      })
      .catch(() => UNKNOWN_FIT)
      .finally(() => running.delete(id));
    running.set(id, run);
  }
  return run;
}

/** Weak and poor ask before anything is spent; "Remix anyway" (confirmed) goes ahead with no second check. */
export function pressAction(verdict: string, confirmed: boolean): "ask" | "start" {
  return (verdict === "weak" || verdict === "poor") && !confirmed ? "ask" : "start";
}

/** The ask-first question for a weak or poor fit. */
export const fitAsk = (verdict: string) =>
  verdict === "poor" ? "This one isn't recommended. Remix anyway?" : verdict === "weak" ? "This one is a weak fit. Remix anyway?" : null;
