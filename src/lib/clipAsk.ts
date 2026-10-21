// Long video into clips (docs/north-star/items/formats-clips.md), outside React. The /edit clips panel uploads a
// recording with its look and leaves what it asked for (topic and length) here, keyed by the new project; when the
// words land (inline for a short recording, the caption job's "done" for a long one) the ask is read once and Find
// clips runs by itself, even with the adviser on another page. Every recording's found list and running find live
// here too, so ClipFinder shows "Finding clips..." after coming back, never starts a second find, and shows the list
// when it lands. In memory for the session; the clip projects themselves are saved like any project.

import { callFn, EdgeError } from "@/lib/edgeFn";
import { onCaptionJob } from "@/lib/captionJob";
import { clearFormatJob, setFormatJob } from "@/lib/formatJob";
import { links } from "@/lib/links";
import { captionPlan } from "@/lib/longCaptions";
import { PRESETS, applyRecipe } from "@/lib/stylePresets";
import { clipSettings, defaultSettings, sentencesOf, withLook, type Clip, type EditSettings, type Word } from "@/lib/videoEdit";
import { fileKey, loadProjects, saveProject, type VideoProject } from "@/lib/videoProjects";
import { defaultSkill, type VideoSkill } from "@/lib/videoSkills";
import { clipPasses } from "../../supabase/functions/video-assist/passes.ts";

export type ClipLength = "auto" | "short" | "long";
export const CLIP_LENGTH_IDS: readonly ClipLength[] = ["auto", "short", "long"];
export const LENGTH_LABELS: Record<ClipLength, string> = { auto: "Auto, 30 to 60 s", short: "Short, 15 to 30 s", long: "Long, 60 to 90 s" };

/** A found clip as the server sends it: with its score's parts out of 100 when Jev answered. */
export type FoundOne = Clip & { parts?: { alone: number; opening: number; topic?: number } };
export interface FoundClip {
  clip: FoundOne;
  project: VideoProject;
}

/** What the panel asked for a recording: read once when its words land. */
export interface ClipAsk {
  userId: string;
  about: string;
  length: ClipLength;
}

export const SLUG = "clips";
const LABEL = "Long video into clips";
/** A clip's project keeps the words this close to it, not the whole recording's (a 2-hour podcast's run to 800 KB). */
const WORDS_MARGIN = 60;

const asks = new Map<string, ClipAsk>();
const found = new Map<string, FoundClip[]>();
const running = new Map<string, Promise<FoundClip[]>>();
/** The last find that failed for a recording, with what it asked: the panel's "Try again". */
const failed = new Map<string, { error: string; code: string; about: string; length: ClipLength }>();
/** Finds started by an ask, then the ones of those that landed: the editor shows #clips once. */
const asked = new Set<string>();
const landed = new Set<string>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function onClipFind(fn: () => void): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

// ---- the ask ----

let watching = false;
/** A long recording's ask runs when its caption job is done. */
function watchCaptions() {
  if (watching) return;
  watching = true;
  onCaptionJob((j) => {
    if (j?.state === "done" && asks.has(j.id)) runClipAsk(j.id, j.words);
  });
}

/** Leaves the panel's ask for a recording whose words are still coming. */
export function setClipAsk(projectId: string, ask: ClipAsk): void {
  asks.set(projectId, ask);
  watchCaptions();
  setFormatJob({ slug: SLUG, label: LABEL, format: "video", state: "working", step: "Captioning", href: links.edit({ p: projectId }) });
}

/** The ask for this recording, once; any other recording gets nothing. */
export function takeClipAsk(projectId: string): ClipAsk | null {
  const a = asks.get(projectId) ?? null;
  asks.delete(projectId);
  return a;
}

/**
 * Finds the clips the ask wants once the recording has words (given, else its saved ones), reading the ask then;
 * without words the ask waits for them.
 */
export function runClipAsk(projectId: string, words?: Word[]): void {
  const ask = asks.get(projectId);
  const p = ask ? loadProjects(ask.userId).find((x) => x.id === projectId) : undefined;
  const w = words?.length ? words : p?.words;
  if (!ask || !p || !w?.length || !takeClipAsk(projectId)) return;
  asked.add(projectId);
  void startFind(projectId, () => findClipsFor(ask.userId, p, w, p.settings, ask.about, ask.length), { about: ask.about, length: ask.length }).catch(() => {});
}

// ---- the find ----

export const foundFor = (projectId: string): FoundClip[] => found.get(projectId) ?? [];
export const findRunning = (projectId: string): Promise<FoundClip[]> | null => running.get(projectId) ?? null;
export const findFailed = (projectId: string) => failed.get(projectId) ?? null;
/** True once: a find the panel asked for has landed, so the editor shows #clips. */
export const takeAskedLanding = (projectId: string): boolean => landed.delete(projectId);

/**
 * Runs a find for a recording, or hands back the one already running for it. The list it gives is kept for the
 * recording; a failure is kept with what it asked, for "Try again".
 */
export function startFind(projectId: string, run: () => Promise<FoundClip[]>, what: { about: string; length: ClipLength } = { about: "", length: "auto" }): Promise<FoundClip[]> {
  const now = running.get(projectId);
  if (now) return now;
  failed.delete(projectId);
  const mirror = asked.delete(projectId);
  if (mirror) setFormatJob({ slug: SLUG, label: LABEL, format: "video", state: "working", step: "Finding clips", href: links.edit({ p: projectId }) });
  const p = run().then(
    (list) => {
      found.set(projectId, list);
      if (mirror) landed.add(projectId);
      if (mirror) setFormatJob({ slug: SLUG, label: LABEL, format: "video", state: "ready", step: `${list.length} ${list.length === 1 ? "clip" : "clips"} ready`, href: links.edit({ p: projectId, section: "clips" }) });
      return list;
    },
    (e: unknown) => {
      const error = e instanceof Error && e.message ? e.message : "Couldn't find clips right now. Try again in a minute.";
      failed.set(projectId, { error, code: e instanceof EdgeError ? e.code || String(e.status) : "", ...what });
      if (mirror) setFormatJob({ slug: SLUG, label: LABEL, format: "video", state: "failed", error, href: links.edit({ p: projectId, section: "clips" }) });
      throw e;
    },
  ).finally(() => {
    running.delete(projectId);
    emit();
  });
  running.set(projectId, p);
  emit();
  return p;
}

/** Clears the library's row once the clips are open in front of the adviser. */
export const seenClips = () => clearFormatJob(SLUG);

/**
 * video-assist clips on a recording's words: each clip becomes its own project on the same file, with the
 * recording's settings trimmed to it, saved on this device. Length other than auto is sent for the panel only.
 */
export async function findClipsFor(userId: string, project: VideoProject, words: Word[], settings: EditSettings, about: string, length: ClipLength): Promise<FoundClip[]> {
  const { clips } = await callFn<{ clips: FoundOne[] }>("video-assist", {
    mode: "clips",
    sentences: sentencesOf(words),
    duration: project.duration,
    words,
    about: about.trim() || undefined,
    ...(length !== "auto" ? { length } : {}),
  }, "Couldn't find clips right now. Try again in a minute.");
  const now = Date.now().toString(36);
  const made = clips.map((clip, i): FoundClip => ({
    clip,
    project: {
      ...project,
      id: `v${now}${i}`,
      name: `${project.name} - ${clip.title}`,
      fileId: fileKey(project),
      createdAt: new Date().toISOString(),
      words: words.filter((w) => w.e > clip.start - WORDS_MARGIN && w.s < clip.end + WORDS_MARGIN),
      settings: clipSettings(settings, clip, project.duration),
    },
  }));
  // saved as the editor's onClips does (best first on top), so they are there whichever page is open
  for (const m of [...made].reverse()) saveProject(userId, m.project);
  return made;
}

// ---- the panel's look and plan ----

/** The look option for a saved skill or a preset; "" is the default skill (else Bold). */
export const skillLook = (id: string) => `skill:${id}`;
export const presetLook = (id: string) => `preset:${id}`;

/**
 * What a recording starts with: a preset's recipe, a saved skill's look (its instructions run once the captions
 * land, as pendingSkill), or with "" the default skill's, exactly as an upload starts today.
 */
export function startLook(skills: VideoSkill[], look: string): { settings: EditSettings; skill: VideoSkill | null } {
  const preset = PRESETS.find((p) => presetLook(p.id) === look);
  if (preset) return { settings: applyRecipe(defaultSettings("bold"), preset.recipe), skill: null };
  const skill = skills.find((s) => skillLook(s.id) === look) ?? defaultSkill(skills);
  return { settings: withLook(defaultSettings("bold"), skill?.look), skill };
}

const LOOK_KEY = "cs-clips-look";
export function loadClipLook(): string {
  try {
    return localStorage.getItem(LOOK_KEY) ?? "";
  } catch {
    return "";
  }
}
export function saveClipLook(look: string): void {
  try {
    if (look) localStorage.setItem(LOOK_KEY, look);
    else localStorage.removeItem(LOOK_KEY);
  } catch {
    // kept on screen for this visit
  }
}

/** The uses a recording takes: one captioning use per 10-minute part, one clip-finding use per 40-minute pass. */
export const clipPlan = (seconds: number) => ({ captions: captionPlan(seconds).length, finds: clipPasses(seconds) });

/** The plan line's refusal when either is over what is left today (null: it can run, or the uses aren't read yet). */
export function planIssue(plan: { captions: number; finds: number }, left: { captions: number | null; finds: number | null }): string | null {
  const over = (what: string, need: number, n: number | null) =>
    n !== null && n < need ? `${what}: ${n ? `${n} left today, this needs ${need}` : "none left today"}. It resets at 8am Singapore time.` : null;
  return over("Clip finding", plan.finds, left.finds) ?? over("Captioning", plan.captions, left.captions);
}
