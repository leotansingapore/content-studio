// The Script card on an AI video of your face or a saved presenter (people-dub-lipsync parts A and B, Leo only).
// Such a video keeps each Speak part on this device (aiVideo.ts finishAvatar), so a changed line is made again on its
// own parts only, and the same face can say the script in Chinese, Malay or Tamil as a new video.

import { MAX_SLICE } from "../../supabase/functions/ai-video/logic.ts";
import type { Remake } from "@/lib/aiVideo";
import type { PostLang } from "@/lib/links";
import { loadFace } from "@/lib/myFace";
import { loadPresenters } from "@/lib/presenters";
import { partAt, replaceParts, type AiPart, type Word } from "@/lib/videoEdit";
import { fileKey, swapped, type AiMark, type VideoProject } from "@/lib/videoProjects";

/** Only a video of a face that is kept (yours or a saved presenter) with its parts on record can be fixed. */
export const canFix = (ai: AiMark | undefined): ai is AiMark & { slices: AiPart[] } =>
  (ai?.person === "mine" || ai?.person === "presenter") && !!ai.slices?.length;

const mid = (x: { s: number; e: number }) => (x.s + x.e) / 2;

/** What each part says, from the video's word-timed captions: a word goes to the part its middle falls in. */
export function wordsIn(words: Word[], parts: { start: number }[]): string[] {
  const out = parts.map(() => [] as string[]);
  for (const w of words) out[partAt(parts, mid(w))]?.push(w.w);
  return out.map((ws) => ws.join(" "));
}

/**
 * What each part of a dubbed voiceover says: a line goes to the part where the middle of its spoken span falls (the
 * dub's times from ElevenLabs). Chinese lines join with no space.
 */
export function textsFromSpans(spans: ({ s: number; e: number } | null)[], lines: string[], parts: { start: number }[], lang?: string): string[] {
  const out = parts.map(() => [] as string[]);
  spans.forEach((sp, i) => {
    const line = lines[i]?.trim();
    if (sp && line) out[partAt(parts, mid(sp))]?.push(line);
  });
  return out.map((ls) => ls.join(lang === "zh" ? "" : " "));
}

export const tidy = (s: string) => s.replace(/\s+/g, " ").trim();

/** The parts whose words were edited, spacing aside. */
export const changedParts = (base: string[], edits: (string | undefined)[]): number[] =>
  base.flatMap((t, i) => (typeof edits[i] === "string" && tidy(edits[i]!) !== tidy(t) ? [i] : []));

/** A new line's voice that runs past what one Speak part takes, or null when it fits. */
export const tooLongLine = (seconds: number): string | null =>
  seconds > MAX_SLICE ? `That line runs ${Math.round(seconds * 10) / 10}s. Keep each part under ${MAX_SLICE} seconds, or split it.` : null;

export const PARTS_GONE = "The parts are on the device you made it on.";

// ---------- what is typed, kept on this device until the fix or the new video is made ----------

export interface ScriptDraft {
  /** The words in each part as edited. */
  edits?: string[];
  /** Each part's words read by a transcribe, for a video with no captions. */
  heard?: string[];
  /** A translation under review. */
  review?: { lang: PostLang; lines: string[] };
}
const DRAFT = "cs-script-";
const strings = (v: unknown) => (Array.isArray(v) && v.every((x) => typeof x === "string") ? (v as string[]) : undefined);

export function loadScriptDraft(projectId: string): ScriptDraft {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT + projectId) ?? "{}") ?? {};
    const r = d.review;
    const lang = r && ["zh", "ms", "ta"].includes(r.lang) ? (r.lang as PostLang) : undefined;
    const lines = strings(r?.lines);
    return {
      ...(strings(d.edits) ? { edits: d.edits } : {}),
      ...(strings(d.heard) ? { heard: d.heard } : {}),
      ...(lang && lines ? { review: { lang, lines } } : {}),
    };
  } catch {
    return {};
  }
}

export function saveScriptDraft(projectId: string, d: ScriptDraft): void {
  try {
    if (d.edits || d.heard || d.review) localStorage.setItem(DRAFT + projectId, JSON.stringify(d));
    else localStorage.removeItem(DRAFT + projectId);
  } catch {
    // storage blocked or full: the edits still stand on screen
  }
}

// ---------- the face to run Speak on again ----------

/** Higgsfield keeps its files at least 7 days (docs.higgsfield.ai), so a presenter's link is used that long, its copy after. */
const LINK_DAYS = 7;

const jpegBlob = (dataUrl: string) => new Blob([Uint8Array.from(atob(dataUrl.slice(dataUrl.indexOf(",") + 1)), (c) => c.charCodeAt(0))], { type: "image/jpeg" });

/**
 * The face the video was made from: your saved face (the same record, still on) or the saved presenter, as Higgsfield's
 * link while it is kept and the 540x960 copy after (decision 10). null when it is gone, so nothing can be remade.
 */
export function faceFor(userId: string, ai: AiMark, now = Date.now()): Blob | string | null {
  if (ai.person === "mine") {
    const f = loadFace(userId);
    return f && (!ai.who || ai.who === f.id) ? jpegBlob(f.photo) : null;
  }
  const p = ai.person === "presenter" ? loadPresenters(userId).items.find((x) => x.id === ai.who && x.status === "on") : undefined;
  if (!p) return null;
  return p.url && now - Date.parse(p.createdAt) < LINK_DAYS * 864e5 ? p.url : p.photo ? jpegBlob(p.photo) : null;
}

/**
 * The project with a finished fix laid in: its new video (the old one stays for Undo), the changed parts' words and
 * clips, every other part's captions moved with it, and what was measured from the old picture dropped (swapped). null
 * when the video was swapped since the fix began, so a fix is never laid on another video.
 */
export function fixedProject(p: VideoProject, r: Remake): VideoProject | null {
  const done = r.done;
  if (!done || !p.ai || fileKey(p) !== r.base || p.ai.slices?.length !== r.parts.length) return null;
  const { words, parts } = replaceParts(p.words, r.parts, r.changes.map((c, j) => ({ ...c, clip: done.clips[j] })));
  const duration = Math.round((p.duration + parts[parts.length - 1].end - r.parts[r.parts.length - 1].end) * 1000) / 1000;
  return { ...swapped(p, { fileId: done.fileId, duration, size: done.size, thumb: p.thumb }), words, ai: { ...p.ai, slices: parts } };
}
