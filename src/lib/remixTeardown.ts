// The teardown store (docs/north-star/items/remix-teardown.md): one breakdown per source key, kept per brand at
// content-studio-remix-teardowns-<scoped uid> (synced by cloudSync), at most 40 (the oldest `at` goes first) and
// reused for 30 days (10 minutes when the video wasn't read). A reel already cloned in /clone becomes a teardown here
// with no call.

import { callFn, EdgeError } from "@/lib/edgeFn";
import { HOOK_FORMULAS } from "@/lib/hookFormulas";
import { scoped } from "@/lib/profiles";
import { loadSavedClones, parseReelUrl, type SavedClone } from "@/lib/reelClone";
import { sourceKey, type RemixSource } from "@/lib/remixSource";
import { pacingOf, type Teardown } from "../../supabase/functions/remix/teardown.ts";

export type { Teardown };
export { readsVideo } from "../../supabase/functions/remix/teardown.ts";

const PREFIX = "content-studio-remix-teardowns-";
export const MAX_TEARDOWNS = 40;
export const TEARDOWN_DAYS = 30;
/** A breakdown made without reading its video: the job's pre-step can reuse it, the next open reads the now-cached video. */
export const UNREAD_MINUTES = 10;

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

const isTeardown = (t: unknown): t is Teardown => {
  const x = t as Teardown | null;
  return (
    !!x &&
    x.v === 1 &&
    typeof x.key === "string" &&
    typeof x.hook?.line === "string" &&
    Array.isArray(x.beats) &&
    Array.isArray(x.dontReuse) &&
    Number.isFinite(Date.parse(x.at))
  );
};

function loadAll(userId: string): Record<string, Teardown> {
  try {
    const raw = JSON.parse(storage()?.getItem(PREFIX + scoped(userId)) ?? "{}");
    const entries = raw && typeof raw === "object" ? Object.entries(raw) : [];
    return Object.fromEntries(entries.filter(([k, t]) => isTeardown(t) && t.key === k)) as Record<string, Teardown>;
  } catch {
    return {};
  }
}

/** The stored teardown for this source, or null when there is none or it is older than 30 days (unread: 10 minutes). */
export function loadTeardown(userId: string, key: string, now = new Date()): Teardown | null {
  const t = loadAll(userId)[key];
  const keepMs = t?.unread ? UNREAD_MINUTES * 60_000 : TEARDOWN_DAYS * 86_400_000;
  return t && now.getTime() - Date.parse(t.at) < keepMs ? t : null;
}

export function saveTeardown(userId: string, t: Teardown): void {
  const kept = Object.values({ ...loadAll(userId), [t.key]: t })
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, MAX_TEARDOWNS);
  try {
    storage()?.setItem(PREFIX + scoped(userId), JSON.stringify(Object.fromEntries(kept.map((x) => [x.key, x]))));
  } catch {
    // Storage full: the breakdown still shows, it just isn't kept.
  }
}

/** A Clone a reel result as a teardown, with no call. It has no pattern and no dontReuse; the row hides empty rows. */
export function teardownFromClone(c: SavedClone): Teardown {
  const { source, breakdown } = c.result;
  const measured = c.visuals?.measured;
  return {
    v: 1,
    key: sourceKey.clone(source.platform, source.postId),
    format: source.isVideo ? "video" : "image",
    hook: { line: breakdown.hook, pattern: "", formula: null },
    beats: breakdown.beats,
    payoff: breakdown.payoff,
    cta: breakdown.cta || "None",
    pacing: pacingOf({ durationSec: measured?.durationSec ?? source.durationSec, avgShotSec: measured?.avgShotSec, beats: breakdown.beats.length }),
    whyItWorked: breakdown.whyItWorked,
    dontReuse: [],
    basedOn: source.transcript ? "transcript" : "caption",
    at: c.savedAt,
  };
}

/** The clone of the same post, matched by its clone: key or by the reel or TikTok link. */
function cloneFor(userId: string, s: RemixSource): SavedClone | null {
  const parsed = s.url ? parseReelUrl(s.url) : null;
  const id = s.kind === "clone" ? s.key.slice("clone:".length) : parsed?.ok && parsed.postId ? `${parsed.platform}:${parsed.postId}` : null;
  return id ? (loadSavedClones(userId).find((c) => c.id === id) ?? null) : null;
}

/** What this device already has for the source, with no call: the store, then a clone of the same post. */
export function localTeardown(userId: string, s: RemixSource): Teardown | null {
  const stored = loadTeardown(userId, s.key);
  if (stored) return stored;
  const clone = cloneFor(userId, s);
  // Stamped now: a clone saved over 30 days ago would otherwise read as missing and be rewritten on every open.
  return clone ? { ...teardownFromClone(clone), key: s.key, at: new Date().toISOString() } : null;
}

const running = new Map<string, Promise<Teardown>>();

/**
 * The teardown for a source: the store, then a clone match, then one remix call (mode teardown), saved. A second
 * caller for the same source while one is running (the row and the job's pre-step) waits for the same call.
 * Throws EdgeError; code 'daily_limit' means the cap is used up.
 */
export async function ensureTeardown(userId: string, s: RemixSource, text: string): Promise<Teardown> {
  const local = localTeardown(userId, s);
  if (local) {
    if (!loadTeardown(userId, s.key)) saveTeardown(userId, local);
    return local;
  }
  const id = `${scoped(userId)}|${s.key}`;
  let run = running.get(id);
  if (!run) {
    const { key, kind, format, platform, url, author, title } = s;
    run = callFn<{ teardown?: unknown }>("remix", {
      mode: "teardown",
      source: { key, kind, format, platform, url, author, title, text },
      formulas: HOOK_FORMULAS.map((f) => ({ id: f.id, template: f.template })),
    })
      .then(({ teardown }) => {
        if (!isTeardown(teardown)) throw new EdgeError(TEARDOWN_COPY.failed, 0);
        saveTeardown(userId, teardown);
        return teardown;
      })
      .finally(() => running.delete(id));
    running.set(id, run);
  }
  return run;
}

// ---- words the row uses ---------------------------------------------------------------------------

export const TEARDOWN_COPY = {
  failed: "Couldn't break this one down. Remix still works from the caption.",
  capped: "No breakdowns left today. Remix still works from the caption.",
};

/** The footer under a breakdown, or null when it was made from a transcript or a trend kit. */
export function teardownFooter(t: Pick<Teardown, "basedOn" | "format" | "unread">): string | null {
  if (t.basedOn === "ad") return "Based on the ad's copy.";
  if (t.basedOn !== "caption") return null;
  return t.format === "video" && !t.unread ? "This video has no captions we can read, so this is from the caption." : "Based on the caption only.";
}

/** What the row says when a teardown fails, and whether it offers Try again (never over the cap). */
export function teardownError(e: unknown): { text: string; retry: boolean } {
  return (e as EdgeError | null)?.code === "daily_limit" ? { text: TEARDOWN_COPY.capped, retry: false } : { text: TEARDOWN_COPY.failed, retry: true };
}
