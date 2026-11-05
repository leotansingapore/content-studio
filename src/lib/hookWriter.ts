// My hooks (/hooks): write 5 to 30 hooks at once (hook-writer), keep the good ones and say "Not this" to the rest, so
// the next batch leans toward the kept and away from the rest. Kept hooks are snippets of kind "hook"
// (replySnippets.ts: 30 a brand, synced), which Write's Pick a hook and slideshow campaigns offer. The topic, the
// latest batch and the turned-down hooks live under one content-studio- key per brand (cloudSync mirrors it), so a
// reload or another device loses nothing.
//
// Folded from BuilderCult's My hooks (with its owner's agreement, Leo 6 Nov 2026).

import { callFn } from "@/lib/edgeFn";
import { loadPositioning } from "@/lib/positioning";
import { professionFor } from "@/lib/profession";
import { scoped } from "@/lib/profiles";
import { ownBrandName } from "@/lib/remixBrand";
import { loadSnippets, ofKind, removeSnippet, saveSnippet, type SaveResult } from "@/lib/replySnippets";
import { isOn, loadFacts } from "@/lib/voiceMemory";
import { MAX_EXAMPLES, MAX_HOOK, MAX_TOPIC, type Hook } from "../../supabase/functions/hook-writer/logic.ts";

export * from "../../supabase/functions/hook-writer/logic.ts";

export interface FreshHook extends Hook {
  id: string;
}
export interface HookDesk {
  topic: string;
  /** The latest batch still waiting for Keep or Not this. */
  fresh: FreshHook[];
  /** Turned-down hooks, newest last; the newest MAX_EXAMPLES steer the next batch. */
  no: string[];
}
/** Unanswered hooks kept, newest batch first. */
export const KEEP_FRESH = 60;
/** Turned-down hooks kept per brand. */
export const KEEP_NO = 60;
export const HOOKS_CHANGED = "content-studio-hookwriter-changed";

const key = (userId: string) => `content-studio-hookwriter-${scoped(userId)}`;
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export function loadDesk(userId: string): HookDesk {
  try {
    const raw = JSON.parse(localStorage.getItem(key(userId)) ?? "null") as Partial<HookDesk> | null;
    if (raw && typeof raw === "object") {
      const fresh = (Array.isArray(raw.fresh) ? raw.fresh : []).flatMap((h) => {
        const x = h as Partial<FreshHook> | null;
        const text = str(x?.text, MAX_HOOK);
        return text && typeof x?.id === "string" ? [{ id: x.id, text, format: str(x.format, 20) || "other" }] : [];
      });
      const no = (Array.isArray(raw.no) ? raw.no : []).map((t) => str(t, MAX_HOOK)).filter(Boolean).slice(-KEEP_NO);
      return { topic: str(raw.topic, MAX_TOPIC), fresh, no };
    }
  } catch {
    // unreadable or blocked: start empty
  }
  return { topic: "", fresh: [], no: [] };
}

export function saveDesk(userId: string, d: HookDesk): void {
  try {
    localStorage.setItem(key(userId), JSON.stringify({ ...d, no: d.no.slice(-KEEP_NO) }));
    globalThis.dispatchEvent?.(new Event(HOOKS_CHANGED));
  } catch {
    // storage full or blocked: kept while the page stays open
  }
}

/** The brand's kept hooks, oldest first. */
export const keptHooks = (userId: string) => ofKind(loadSnippets(userId), "hook");

/** Keep a hook from the batch: it becomes one of My hooks and leaves the batch. Full or a repeat says why. */
export function keepHook(userId: string, id: string): SaveResult["problem"] | null {
  const d = loadDesk(userId);
  const h = d.fresh.find((x) => x.id === id);
  if (!h) return null;
  const r = saveSnippet(userId, { name: "", text: h.text, kind: "hook" });
  if (r.problem === "full" || r.problem === "empty") return r.problem;
  saveDesk(userId, { ...d, fresh: d.fresh.filter((x) => x.id !== id) });
  return null;
}

/** Not this: the hooks leave the batch and steer the next one away from them. */
export function turnDown(userId: string, ids: string[]): void {
  const d = loadDesk(userId);
  const gone = d.fresh.filter((x) => ids.includes(x.id));
  saveDesk(userId, { ...d, fresh: d.fresh.filter((x) => !ids.includes(x.id)), no: [...d.no, ...gone.map((x) => x.text)] });
}

/** Your own hooks, pasted: a blank line between hooks, a single line break kept inside one. */
export function splitOwn(text: string): string[] {
  return text
    .replace(/\r/g, "")
    .split(/\n\s*\n/)
    .map((h) => h.split("\n").map((l) => l.trim()).filter(Boolean).join("\n").slice(0, MAX_HOOK))
    .filter(Boolean);
}

/** Adds pasted hooks to My hooks; says how many went in and whether the list filled up. */
export function addOwn(userId: string, text: string): { added: number; full: boolean } {
  let added = 0;
  for (const h of splitOwn(text)) {
    const r = saveSnippet(userId, { name: "", text: h, kind: "hook" });
    if (r.problem === "full") return { added, full: true };
    if (r.saved && !r.problem) added++;
  }
  return { added, full: false };
}

export const removeHook = (userId: string, id: string) => removeSnippet(userId, id);

export const WRITE_FAILED = "Couldn't write hooks just now. Try again in a minute.";

/** What the writer gets about the brand: its name, its work, its one-liner and audience, and its memory facts. */
export function hookRequest(userId: string, topic: string, n: number, format: string | null, d: HookDesk) {
  const p = loadPositioning(userId);
  return {
    topic,
    n,
    format,
    name: ownBrandName(userId),
    profession: professionFor(userId),
    about: [p?.oneLiner.trim(), p?.audienceDetail.trim() && `For: ${p.audienceDetail.trim()}`].filter(Boolean).join("\n"),
    facts: loadFacts(userId).filter(isOn).map((f) => f.text).join("\n"),
    kept: keptHooks(userId).map((s) => s.text).slice(-MAX_EXAMPLES),
    rejected: d.no.slice(-MAX_EXAMPLES),
  };
}

/** One use of hook-writer; the new batch goes on top of any hooks still unanswered. Throws EdgeError with the server's words. */
export async function writeHooks(userId: string, topic: string, n: number, format: string | null): Promise<HookDesk> {
  const d = loadDesk(userId);
  const { hooks } = await callFn<{ hooks: Hook[] }>("hook-writer", hookRequest(userId, topic, n, format, d), WRITE_FAILED);
  const stamp = Date.now().toString(36);
  const now = loadDesk(userId);
  const next = { ...now, topic, fresh: [...hooks.map((h, i) => ({ ...h, id: `h${stamp}${i}` })), ...now.fresh].slice(0, KEEP_FRESH) };
  saveDesk(userId, next);
  return next;
}
