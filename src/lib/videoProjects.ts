// Video projects: the edit (transcript + settings + a small cover) per profile,
// synced across devices like the rest of the studio; the video file itself stays
// on the device that uploaded it (videoMedia.ts, IndexedDB).
//   key: content-studio-videoprojects-${scoped(userId)}

import { supabase, SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase";
import { scoped } from "@/lib/profiles";
import { deleteFile, putFile, stills } from "@/lib/videoMedia";
import { mediaLength } from "@/lib/longAudio";
import { callFn, EdgeError } from "@/lib/edgeFn";
import { removePlatformCaptions } from "@/lib/platformCaptions";
import { professionFor } from "@/lib/profession";
import { sanitizeFixes, type CaptionFix, type Clip, type Cutaway, type EditSettings, type PublishIdea, type Sentence, type Word } from "@/lib/videoEdit";
import type { WatchFinding } from "../../supabase/functions/video-assist/watch.ts";
import type { KeywordPick } from "../../supabase/functions/video-assist/keywords.ts";
import type { RemixSource } from "@/lib/remixSource";
import { VOICE_IDS, type VoiceId } from "../../supabase/functions/text-voice/logic.ts";

/** What the studio's AI made in a video, set by the code that made it (people-ai-labels' shape; the swap fields wait for 4b). */
export interface AiMark {
  /** voiceover: a premade voice over footage with no AI person (a no-face same-edit version). */
  kind: "avatar" | "explainer" | "template" | "dub" | "voiceover";
  /** "generated": a person with no saved likeness (an explainer or template person, a one-off photo). */
  person?: "mine" | "presenter" | "generated";
  /** The saved face's or presenter's id. */
  who?: string;
  /** Unset for a voice recorded on the mic. */
  voice?: "mine" | "premade";
  madeAt: string;
  /** The premade voice used, so a remade part sounds the same. */
  voiceId?: VoiceId;
  lang?: "en" | "zh" | "ms" | "ta";
  /** Each Speak part's words and place in the video; clip is its device file key, "ai-slice-<job>-<i>-<v>". */
  slices?: { text: string; start: number; end: number; clip: string }[];
}

const pick = <T extends string>(list: readonly T[], v: unknown): T | undefined => (list.includes(v as T) ? (v as T) : undefined);
const goodSlice = (s: unknown) => {
  const x = (s ?? {}) as Record<string, unknown>;
  return typeof x.text === "string" && typeof x.start === "number" && typeof x.end === "number" && x.start >= 0 && x.end > x.start && Number.isFinite(x.end)
    && typeof x.clip === "string" && x.clip.startsWith("ai-slice-");
};

/** A mark read back from synced JSON or a pending job: a bad field is dropped, and one with no kind or date is no mark. */
export function aiOf(raw: unknown): AiMark | undefined {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const kind = pick(["avatar", "explainer", "template", "dub", "voiceover"], r.kind);
  if (!kind || typeof r.madeAt !== "string" || Number.isNaN(Date.parse(r.madeAt))) return undefined;
  const person = pick(["mine", "presenter", "generated"], r.person);
  const voice = pick(["mine", "premade"], r.voice);
  const voiceId = pick(VOICE_IDS, r.voiceId);
  const lang = pick(["en", "zh", "ms", "ta"], r.lang);
  // one bad part drops them all, so a remake by part number can never land on the wrong one
  const slices = Array.isArray(r.slices) && r.slices.length && r.slices.every(goodSlice)
    ? (r.slices as NonNullable<AiMark["slices"]>).map(({ text, start, end, clip }) => ({ text, start, end, clip }))
    : undefined;
  return {
    kind, madeAt: r.madeAt,
    ...(person ? { person } : {}), ...(typeof r.who === "string" && r.who ? { who: r.who } : {}), ...(voice ? { voice } : {}),
    ...(voiceId ? { voiceId } : {}), ...(lang ? { lang } : {}), ...(slices ? { slices } : {}),
  };
}

/** A video with an AI-made person or voice (people-ai-labels): the editor's chips, and the caption line it ends with. */
export const AI_LINE = "This video uses an AI-made person or voice.";
export const aiChips = (ai: AiMark | undefined): ("AI person" | "AI voice")[] => [...(ai?.person ? (["AI person"] as const) : []), ...(ai?.voice ? (["AI voice"] as const) : [])];
/**
 * The AI line in a language version's own words (live-p7a-fix D27: a Malay version's caption ended in English).
 * shortcut: Malay only, the language Leo's versions are checked in; Chinese and Tamil keep AI_LINE until each has a line.
 */
const AI_LINES: Partial<Record<NonNullable<AiMark["lang"]>, string>> = { ms: "Video ini menggunakan orang atau suara yang dijana oleh AI." };
/** The caption with the AI line (in the mark's language) as its last line, once, when the video has an AI person or voice; any other caption as it is. */
export const withAiLine = (caption: string, ai: AiMark | undefined): string => {
  const line = (ai?.lang && AI_LINES[ai.lang]) || AI_LINE;
  return !aiChips(ai).length || caption.trimEnd().endsWith(line) ? caption : [caption.trim(), line].filter(Boolean).join("\n\n");
};

export interface VideoProject {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  duration: number;
  size: number;
  words: Word[];
  settings: EditSettings;
  thumb: string;
  /** The post caption written for this video (or clip). */
  caption?: string;
  /** Second-language caption lines, by language then by caption text. */
  subs?: Record<string, Record<string, string>>;
  /** Suggested callouts and cutaways, kept so a second look costs nothing. */
  cutaways?: Cutaway[];
  /** Post titles and a cover idea, kept so a second look costs nothing. */
  publish?: PublishIdea;
  /** The IndexedDB key of the video file; clips cut from one upload share it. Defaults to id. */
  fileId?: string;
  /** A skill whose instructions run once the captions exist (the default skill, on upload). */
  pendingSkill?: string;
  /** The post a format remixed (a wall of text); Save to My posts copies it to the draft. */
  source?: RemixSource;
  /** The post this video was made from (a format's hand-off); Leo's Save to your post updates it. */
  draftId?: string;
  /** What the studio's AI made in it (a person, a voice); none for a filmed or uploaded video. */
  ai?: AiMark;
  /** The edit plan and version it was made from (same edit, editPlan.ts), on the device that made it. */
  plan?: { id: string; version: string };
}

export const fileKey = (p: VideoProject) => p.fileId ?? p.id;

const KEY = "content-studio-videoprojects-";
const MAX_PROJECTS = 12;
/** Clips cut from an upload are kept apart from the uploads: a 2-hour podcast gives up to 32, each small (its own words only). */
const MAX_CLIPS = 40;
// a swapped video (fileId `${id}-s<n>`, swapSource) is still the upload it was, not a clip
const isClip = (p: VideoProject) => !!p.fileId && p.fileId !== p.id && !p.fileId.startsWith(`${p.id}-s`);
/** How many times a project's video has been swapped (its file is `${id}-s<n>`), 0 for none. */
const swapNo = (p: VideoProject) => (p.fileId?.startsWith(`${p.id}-s`) ? Number(p.fileId.slice(p.id.length + 2)) || 0 : 0);
// a gone project's files that no kept project uses: a clip's shared file, or an upload's own file plus every video swapped in
// shortcut: a video swapped in and then undone (one past the current number) stays until the browser clears it
// an AI video's Speak parts (ai-slice-<job>-<i>-<v>) go too, unless a kept project still uses them
// shortcut: a part's earlier versions, left by a fixed line, stay until the browser clears them
function dropFiles(gone: VideoProject, kept: VideoProject[]) {
  const keys = isClip(gone) ? [fileKey(gone)] : [gone.id, ...Array.from({ length: swapNo(gone) }, (_, i) => `${gone.id}-s${i + 1}`)];
  const parts = (gone.ai?.slices ?? []).map((x) => x.clip);
  const used = (k: string) => kept.some((x) => fileKey(x) === k || !!x.ai?.slices?.some((y) => y.clip === k));
  for (const k of [...keys, ...parts]) if (!used(k)) void deleteFile(k).catch(() => {});
}

function store(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function loadProjects(userId: string | null | undefined): VideoProject[] {
  const s = store();
  if (!s || !userId) return [];
  try {
    const v = JSON.parse(s.getItem(KEY + scoped(userId)) ?? "[]");
    // synced JSON with no sanitizer: a draftId that isn't a string is read as none, and a junk AI mark as no mark
    return Array.isArray(v) ? v.map((p) => {
      const q = p?.draftId !== undefined && typeof p.draftId !== "string" ? { ...p, draftId: undefined } : p;
      return q?.ai !== undefined ? { ...q, ai: aiOf(q.ai) } : q;
    }) : [];
  } catch {
    return [];
  }
}

export function saveProject(userId: string, p: VideoProject): VideoProject[] {
  const next = [{ ...p, updatedAt: new Date().toISOString() }, ...loadProjects(userId).filter((x) => x.id !== p.id)];
  let uploads = 0;
  let clips = 0;
  const kept = next.filter((x) => (isClip(x) ? ++clips <= MAX_CLIPS : ++uploads <= MAX_PROJECTS));
  // written first: if storage is full this throws and the old list, files and all, stays usable
  store()?.setItem(KEY + scoped(userId), JSON.stringify(kept));
  for (const old of next) {
    if (kept.includes(old)) continue;
    removePlatformCaptions(userId, old.id);
    dropFiles(old, kept);
  }
  return kept;
}

export function removeProject(userId: string, id: string): VideoProject[] {
  const all = loadProjects(userId);
  const gone = all.find((x) => x.id === id);
  const kept = all.filter((x) => x.id !== id);
  // a file shared by clips goes only with the last project using it
  if (gone) dropFiles(gone, kept);
  store()?.setItem(KEY + scoped(userId), JSON.stringify(kept));
  removePlatformCaptions(userId, id);
  return kept;
}

/**
 * The project on another file of `duration` seconds: words cleared (they were the old clip's), the look kept,
 * trims kept under the new length, stickers ended by it (a block that ran to the old end runs to the new one),
 * and what was measured from the old picture and sound dropped.
 */
export function swapped(p: VideoProject, f: { fileId: string; duration: number; size: number; thumb: string }): VideoProject {
  const d = f.duration;
  const s = p.settings;
  const trimStart = Math.min(s.trimStart, Math.max(0, d - 1));
  const trimEnd = Math.min(s.trimEnd, Math.max(0, d - trimStart - 1));
  const overlays = s.overlays?.map((o) => {
    const to = o.kind === "block" && o.to >= p.duration - 0.05 ? d : Math.min(o.to, d);
    return { ...o, to, from: Math.min(o.from, Math.max(0, to - 0.3)) };
  });
  return {
    ...p, ...f, words: [],
    settings: { ...s, trimStart, trimEnd, overlays, faceTrack: undefined, followFace: undefined, textBand: undefined, cropBottom: undefined, faceBox: undefined, level: undefined, motion: undefined, removed: undefined, keepCuts: undefined, coldOpen: undefined, keyWords: undefined },
  };
}

/**
 * Puts another video under a project: the file is kept on this device as `${projectId}-s<n>` and the project
 * saved on it (swapped). The old file stays, so Undo can put it back. Throws when the video can't be opened.
 */
export async function swapSource(userId: string, projectId: string, file: File): Promise<VideoProject> {
  const p = loadProjects(userId).find((x) => x.id === projectId);
  if (!p) throw new Error("That video isn't on this device any more.");
  const duration = await mediaLength(file);
  if (!Number.isFinite(duration) || duration <= 0) throw new Error("That video couldn't be opened. Try an MP4 or MOV.");
  const thumb = (await stills(file, [0.3], 240))[0];
  const fileId = `${projectId}-s${swapNo(p) + 1}`;
  await putFile(fileId, file);
  const next = swapped(p, { fileId, duration, size: file.size, thumb });
  saveProject(userId, next);
  return next;
}

// The single saved video look from before skills (videoSkills.ts reads it once as "My look"):
//   key: content-studio-videolook-${scoped(userId)}
const LOOK_KEY = "content-studio-videolook-";

export function loadLook(userId: string | null | undefined): Record<string, unknown> | null {
  const s = store();
  if (!s || !userId) return null;
  try {
    const v = JSON.parse(s.getItem(LOOK_KEY + scoped(userId)) ?? "null");
    return v && typeof v === "object" && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

// Words the captions always get wrong, fixed in every video, per profile:
//   key: content-studio-captionfixes-${scoped(userId)}
const FIXES_KEY = "content-studio-captionfixes-";

export function loadFixes(userId: string | null | undefined): CaptionFix[] {
  const s = store();
  if (!s || !userId) return [];
  try {
    return sanitizeFixes(JSON.parse(s.getItem(FIXES_KEY + scoped(userId)) ?? "[]"));
  } catch {
    return [];
  }
}

export function saveFixes(userId: string, fixes: CaptionFix[]): CaptionFix[] {
  const clean = sanitizeFixes(fixes);
  try {
    store()?.setItem(FIXES_KEY + scoped(userId), JSON.stringify(clean));
  } catch {
    // storage full: the fixes still apply to this video
  }
  return clean;
}

async function call(path: string, init: RequestInit): Promise<Response> {
  const token = (await supabase.auth.getSession()).data.session?.access_token ?? SUPABASE_ANON_KEY;
  const res = await fetch(`${SUPABASE_URL}/functions/v1/video-assist${path}`, {
    ...init,
    headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    // an EdgeError is still an Error, so the editor shows the same words; the voice note reads the status
    throw new EdgeError(body?.error || `The editor answered ${res.status}. Try again.`, res.status, typeof body?.code === "string" ? body.code : "");
  }
  return res;
}

/** Word-timed captions; `terms` (Leo's sign-ins: captionTerms) are words to spell as given, which the server takes only from NORTH_STAR_USERS. */
export async function transcribe(wav: Blob, lang?: string, terms?: string[]): Promise<{ words: Word[]; text: string; duration: number; lang?: string }> {
  const q = `${lang ? `&lang=${encodeURIComponent(lang)}` : ""}${terms?.length ? `&terms=${encodeURIComponent(terms.join(","))}` : ""}`;
  const res = await call(`?mode=transcribe${q}`, { method: "POST", headers: { "Content-Type": "audio/wav" }, body: wav });
  const t = await res.json();
  // an answer with no words list read as no words: the editor filtered it and crashed
  return { ...t, words: Array.isArray(t?.words) ? t.words : [], text: typeof t?.text === "string" ? t.text : "" };
}

/** Jev's key word in each caption line (and an emoji on a lit line unless emoji is "off"); one "caption-keywords" use. Leo only. */
export async function pickKeyWords(lines: { text: string; words: string[]; s: number }[], emoji: boolean | "one"): Promise<KeywordPick[]> {
  const r = await callFn<{ picks: KeywordPick[] }>("video-assist", { mode: "keywords", lines, emoji }, "Couldn't pick key words right now. Try again in a minute.");
  return Array.isArray(r?.picks) ? r.picks : [];
}

/** What a viewer would trip on in an exported file, with the seconds (Gemini watches it; about a minute). */
export async function watchVideo(file: Blob, seconds: number): Promise<WatchFinding[]> {
  const res = await call(`?mode=watch&seconds=${Math.round(seconds * 10) / 10}`, { method: "POST", headers: { "Content-Type": file.type || "video/mp4" }, body: file });
  return (await res.json()).findings;
}

/** A change to the edit in plain words, made by an editor told the open brand's profession (`userId`'s; none for an adviser's). */
export async function vibeEdit(
  req: {
    instruction: string;
    settings: EditSettings;
    transcript: string;
    duration: number;
    frames?: string[];
  },
  userId?: string,
): Promise<{ patch: Record<string, unknown>; reply: string }> {
  const res = await call("", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "vibe", ...req, profession: professionFor(userId) || undefined }),
  });
  return res.json();
}

/**
 * Clips from what is said, found for the open brand's profession; with the word timings, each clip starts and ends
 * cleanly; `about` is what the person asked for.
 */
export async function findClips(userId: string, sentences: Sentence[], duration: number, words?: Word[], about?: string): Promise<Clip[]> {
  const body = { mode: "clips", sentences, duration, words, about: about?.trim() || undefined, profession: professionFor(userId) || undefined };
  const res = await call("", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return (await res.json()).clips;
}

/** Callouts and cutaways written for the open brand's profession. */
export async function suggestCutaways(userId: string, sentences: Sentence[], duration: number): Promise<Cutaway[]> {
  const body = { mode: "cutaways", sentences, duration, profession: professionFor(userId) || undefined };
  const res = await call("", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return (await res.json()).sections;
}

/** Second-language caption lines, translated as the open brand's words (its profession; none sent for an adviser's). */
export async function translateCaptions(userId: string, lang: string, lines: string[]): Promise<string[]> {
  const body = { mode: "translate", lang, lines, profession: professionFor(userId) || undefined };
  const res = await call("", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return (await res.json()).lines;
}

/** Three post titles and the cover text from what is said, for the open brand's profession, and the cover moment (null when none was picked). */
export async function publishIdeas(userId: string, sentences: Sentence[], duration: number): Promise<PublishIdea> {
  return callFn<PublishIdea>(
    "video-assist",
    { mode: "publish", sentences, duration, profession: professionFor(userId) || undefined },
    "Couldn't write titles right now. Try again in a minute.",
  );
}
