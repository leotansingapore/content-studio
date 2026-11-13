// The script desk in the app (wave 1, Leo only): files a job with the script-desk function and waits
// for Leo's Mac to answer it (the paired worker runs it on his own Claude Code). Answers keep the reference prompts' JSON shapes.

import { callFn, EdgeError } from "@/lib/edgeFn";
import { getDraftById, newDraftId, upsertDraft, type DraftEntry } from "@/lib/draftHistory";
import { activeProfileId } from "@/lib/profiles";
import { deskContext } from "@/lib/scriptContext";

export * from "../../supabase/functions/script-desk/dials.ts";

export interface Script {
  title: string;
  script: string;
  hooks: { hook: string; formula: string }[];
  flags: string[];
  notes: string[];
}
export interface HookIdea {
  hook: string;
  pattern: string;
}
export interface Breakdown {
  hook: { line: string; type: string; why: string };
  idea: string;
  format: { name: string; beats: string[] };
  visual: string;
  why: string[];
  remix: string[];
}
export interface Rescript {
  script: string;
  changes: { from: string; to: string; why: string }[];
  fill: string[];
}
export interface ClaimCheck {
  unsupported: { sentence: string; claim: string; fixed: string }[];
  /** The re-script with each unsupported sentence in its placeholder version. */
  script: string;
}

/** Where a job is: filed and waiting for the Mac, or being written there. */
export type DeskPhase = "queued" | "claimed";

/** Poll every 1.5 s; the server fails a job nobody picked up after 45 s, and one never finished after 4 minutes. */
export const POLL_MS = 1500;
export const GIVE_UP_MS = 5 * 60_000;

// script-desk answers a filing with { job, kind, status: "queued" }; only a reply without a job is a finished answer
type Filed = { job: string; status?: string } | { status: "done"; result: unknown };

/**
 * Files one job and resolves with its answer. `onPhase` hears queued, then claimed. A stop (signal) ends the wait
 * here only: the Mac may still finish the job, and its answer is dropped.
 */
export interface RunOpts {
  userId: string;
  signal?: AbortSignal;
  onPhase?: (p: DeskPhase) => void;
  onFiled?: (job: string) => void;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  /** How long to wait for the answer: GIVE_UP_MS, longer for research reads and searches. */
  giveUpMs?: number;
}

// a read or a typed search needs none of the brand's facts (a claim check reuses its re-script's, and no brand)
const noContext = (b: Record<string, unknown>) => b.action === "ig_reels" || b.action === "ig_reel" || (b.action === "discover" && b.mode !== "suggest");

export async function runDesk<T>(body: Record<string, unknown>, opts: RunOpts): Promise<T> {
  const brand = activeProfileId(opts.userId);
  const withContext = body.action === "claims" ? body : noContext(body) ? { ...body, brand } : { ...body, context: deskContext(opts.userId), brand };
  const filed = await callFn<Filed>("script-desk", withContext, undefined, { signal: opts.signal });
  if (!("job" in filed)) return filed.result as T;
  opts.onFiled?.(filed.job);
  return pollDesk<T>(filed.job, opts);
}

/** Waits for a job already filed (also to pick a wait back up after the page was left). */
export async function pollDesk<T>(job: string, opts: Omit<RunOpts, "userId" | "onFiled">): Promise<T> {
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = opts.now ?? Date.now;
  opts.onPhase?.("queued");
  const started = now();
  let phase: DeskPhase = "queued";
  let blip: unknown = null;
  while (now() - started < (opts.giveUpMs ?? GIVE_UP_MS)) {
    await sleep(POLL_MS);
    if (opts.signal?.aborted) throw new EdgeError("Stopped.", 0, "stopped");
    let r: { status: string; result?: unknown; error?: string };
    try {
      r = await callFn<{ status: string; result?: unknown; error?: string }>("script-desk", { action: "job", id: job }, undefined, { signal: opts.signal });
    } catch (e) {
      if (opts.signal?.aborted || !(e instanceof EdgeError) || (e.status !== 0 && e.status < 500)) throw e;
      blip = e;
      continue;
    }
    blip = null;
    if (r.status === "done") return r.result as T;
    if (r.status === "failed") throw new EdgeError(r.error || "That didn't go through. Try again.", 502, "failed");
    if (r.status === "claimed" && phase !== "claimed") opts.onPhase?.((phase = "claimed"));
  }
  throw blip ?? new EdgeError("Your Mac is taking too long. Try again.", 504, "timeout");
}

export const stopDesk = (job: string | undefined) => {
  if (job) void callFn("script-desk", { action: "cancel", id: job }).catch(() => undefined);
};

/**
 * Re-script, then its claim check on the answer (the check runs by itself after every re-script). `onRescript` hears
 * the re-script and its job id as soon as it is in, so a check that fails loses nothing; `onFiled` hears each job.
 */
export async function runRescript(
  url: string,
  opts: Omit<RunOpts, "onFiled"> & { onRescript?: (r: Rescript, job: string) => void; onFiled?: (job: string, step: "rescript" | "claims") => void },
): Promise<{ rescript: Rescript; check: ClaimCheck; job: string }> {
  let job = "";
  const rescript = await runDesk<Rescript>({ action: "rescript", url }, { ...opts, onFiled: (id) => ((job = id), opts.onFiled?.(id, "rescript")) });
  opts.onRescript?.(rescript, job);
  const check = await runDesk<ClaimCheck>({ action: "claims", job }, { ...opts, onFiled: (id) => opts.onFiled?.(id, "claims") });
  return { rescript, check, job };
}

/** The desk's id for a reel read on Clone a reel (`link:instagram:<id>`), or null when it isn't an Instagram or TikTok reel. */
export function deskPostId(key: string): string | null {
  const m = /^link:(instagram|tiktok):([A-Za-z0-9_.-]{1,80})$/.exec(key);
  return m ? `${m[1]}-${m[2]}` : null;
}

export const wordsOf = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);
/** Seconds at 170 words a minute, the pace the writer is held to. */
export const secondsOf = (s: string) => Math.round((wordsOf(s) / 170) * 60);

/**
 * A script saved to My posts as a short-video draft, its first line as the hook. With the id of the draft it was saved
 * as before (and still there), that draft is updated instead of a second one made.
 */
export function saveScriptDraft(userId: string, s: { title: string; script: string }, id?: string, now = new Date()): DraftEntry {
  const hook = s.script.trim().split("\n")[0]?.trim() ?? "";
  const prev = id ? getDraftById(userId, id) : null;
  const entry: DraftEntry = {
    ...(prev ?? {}),
    id: prev?.id ?? newDraftId(),
    createdAt: prev?.createdAt ?? now.toISOString(),
    hook,
    draft: s.script.trim(),
    pillar: "topic",
    pillarDetail: s.title.trim() || hook,
    audience: "general",
    format: "short-video",
    platform: "instagram",
    ctaType: "save-share",
    ...(s.title.trim() ? { titles: [s.title.trim()] } : {}),
  };
  upsertDraft(userId, entry);
  return entry;
}
