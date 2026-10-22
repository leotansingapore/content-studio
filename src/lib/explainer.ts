// The narrated video on Edit a video's AI panel, for Leo (docs/north-star/items/formats-faceless-video.md and
// formats-animated.md): start from a topic, your script, a link or a draft; 30 or 60 s; stock clips first where Jev
// says one shows the scene, else an AI picture in the look; the scenes can move. Or every scene a photo from one of
// the brand's media sets (brand-media-sets), free: Jev picks one per scene. The make itself is aiVideo.ts
// makeExplainer with its opts.
//   synced: content-studio-explainer-look-<scoped uid>: { look, move } the brand's last look and whether it moves
//   device, this tab: cs-narrated-draft-<scoped uid> (sessionStorage): what was typed and the scenes written, so leaving
//           the page or a reload keeps them; cleared once a video from them is made
//   device hints: cs-narrated-visuals, cs-narrated-length (the AI panel's urlState `remember`)
// The write (read the page, write or split the script, find the stock clips) runs here, outside React, so closing
// the panel keeps what it brings back.

import { aiJob, makeExplainer, type ExplainerOpts } from "@/lib/aiVideo";
import { chooseClips } from "@/lib/autoBroll";
import { EdgeError, callFn } from "@/lib/edgeFn";
import { loadDrafts } from "@/lib/draftHistory";
import { loadMedia, type MediaItem } from "@/lib/mediaLibrary";
import { rotateCandidates } from "@/lib/mediaSets";
import { describe as clipDesc } from "@/lib/montage";
import { scoped } from "@/lib/profiles";
import { splitScriptCaption } from "@/lib/scriptCaption";
import { searchStock, type StockItem } from "@/lib/stockMedia";
import type { VoiceId } from "@/lib/textVoice";
import type { JoinExtra } from "@/lib/videoMedia";
import { leoUser } from "@/lib/useLeoOnly";
import { memoryLine } from "@/lib/voiceMemory";
import { LOOK_IDS, MAX_NOTES, type LookId, type NarratedSeconds, type Scene } from "../../supabase/functions/ai-video/logic.ts";
import { MAX_CANDIDATES } from "../../supabase/functions/video-assist/montage.ts";

export { EXPLAINER_LOOKS, LOOK_IDS, MAX_PAGE_TEXT, MAX_SCRIPT, SCRIPT_LIMITS, type LookId, type NarratedSeconds } from "../../supabase/functions/ai-video/logic.ts";

export type From = "topic" | "script" | "link" | "draft";
export const FROMS: From[] = ["topic", "script", "link", "draft"];
export const FROM_LABELS: Record<From, string> = { topic: "A topic", script: "My script", link: "A link", draft: "A draft" };
export type Visuals = "stock" | "ai";
export const STOCK_TIP = "Stock clips only mix with the Photo look.";

/** Stock only mixes with real photos: any other look makes every scene an AI picture. */
export const stockOn = (visuals: Visuals, look: LookId) => visuals === "stock" && look === "photo";

// ---------- the brand's last look (synced) ----------

export interface LookChoice {
  look: LookId;
  move: boolean;
}
const lookKey = (userId: string) => `content-studio-explainer-look-${scoped(userId)}`;

export function loadLook(userId: string): LookChoice {
  try {
    const r = JSON.parse(localStorage.getItem(lookKey(userId)) ?? "{}") ?? {};
    return { look: LOOK_IDS.includes(r.look) ? r.look : "photo", move: r.move === true };
  } catch {
    return { look: "photo", move: false };
  }
}

export function saveLook(userId: string, c: LookChoice): void {
  try {
    localStorage.setItem(lookKey(userId), JSON.stringify({ look: LOOK_IDS.includes(c.look) ? c.look : "photo", move: c.move === true }));
    globalThis.window?.dispatchEvent(new Event("content-studio-explainer-look-changed"));
  } catch {
    // full storage: the pick holds for this visit
  }
}

// ---------- the scene draft (this tab) ----------

export interface NarratedScene extends Scene {
  search: string;
  /** The stock clip Jev found for it, or null (an AI picture). */
  stock: StockItem | null;
  /** What the adviser picked for it ("Use a picture instead" / "Use stock instead"). */
  use: "stock" | "ai";
  /** The media set photo it shows (a device key) when a set is picked: Jev's pick, the next in set order, or Swap's. */
  photo?: string;
  /** Jev said none of the set's photos shows it, so its Swap is outlined. */
  miss?: boolean;
}

export interface NarratedDraft {
  topic: string;
  script: string;
  link: string;
  /** The short-video draft whose script filled `script` ("A draft"), so it fills once, not over the adviser's edits. */
  fromDraft?: string;
  scenes: NarratedScene[] | null;
  /** The length the scenes were written for. */
  seconds: NarratedSeconds;
  /** The page a link's script was written from. */
  source?: { url: string; site: string; title: string };
  /** Jev's look, tagged Recommended. */
  recommended?: { id: LookId; p: number } | null;
  /** Jev's MAS answer on the written script (null: no answer). */
  mas?: boolean | null;
  /** Stock was looked for on these scenes. */
  found?: boolean;
  /** The media set the scenes' photos were picked from. */
  photosFrom?: string;
}

const EMPTY: NarratedDraft = { topic: "", script: "", link: "", scenes: null, seconds: 30 };
const draftKey = (userId: string) => `cs-narrated-draft-${scoped(userId)}`;
const drafts = new Map<string, NarratedDraft>();
const draftListeners = new Set<() => void>();

export function loadDraft(userId: string): NarratedDraft {
  const k = draftKey(userId);
  const hit = drafts.get(k);
  if (hit) return hit;
  let d = EMPTY;
  try {
    const r = JSON.parse(sessionStorage.getItem(k) ?? "null");
    if (r && typeof r === "object") {
      const text = (v: unknown) => (typeof v === "string" ? v : "");
      d = {
        topic: text(r.topic),
        script: text(r.script),
        link: text(r.link),
        ...(typeof r.fromDraft === "string" ? { fromDraft: r.fromDraft } : {}),
        scenes: Array.isArray(r.scenes) ? r.scenes : null,
        seconds: r.seconds === 60 ? 60 : 30,
        ...(r.source ? { source: r.source } : {}),
        ...(r.recommended !== undefined ? { recommended: r.recommended } : {}),
        ...(r.mas !== undefined ? { mas: r.mas } : {}),
        ...(r.found ? { found: true } : {}),
        ...(typeof r.photosFrom === "string" ? { photosFrom: r.photosFrom } : {}),
      };
    }
  } catch {
    // a bad or blocked store: start empty
  }
  drafts.set(k, d);
  return d;
}

export function saveDraft(userId: string, change: Partial<NarratedDraft>): NarratedDraft {
  const k = draftKey(userId);
  const d = { ...loadDraft(userId), ...change };
  drafts.set(k, d);
  try {
    sessionStorage.setItem(k, JSON.stringify(d));
  } catch {
    // full or blocked: it still holds while the app is open
  }
  draftListeners.forEach((l) => l());
  return d;
}

/** A video started from it: the panel opens empty next time. */
export function clearDraft(userId: string): void {
  const k = draftKey(userId);
  drafts.set(k, EMPTY);
  try {
    sessionStorage.removeItem(k);
  } catch {
    // nothing kept to clear
  }
  draftListeners.forEach((l) => l());
}

export function onDraft(fn: () => void): () => void {
  draftListeners.add(fn);
  return () => void draftListeners.delete(fn);
}

// ---------- a short-video draft's script ----------

// shortcut: edit-video (wave 5) adds spokenScript to scriptCaption.ts; switch to it then.
const SPOKEN_LABEL = /^(?:hook|body|cta|call[\s-]to[\s-]action|intro|outro|close)\b\s*(?:\([^)]*\))?\s*:\s*/i;
const NOT_SPOKEN = /^(?:\[[^\]]*\]|\([^)]*\)|(?:on[\s-]screen|text on screen|visuals?|b[\s-]?roll|burned[\s-]in|shot|scene|camera)\b[^:]*:.*)$/i;

/** The words said in a short-video script: no HOOK:/CTA: labels, stage directions, shot notes or markdown. */
export function spokenText(script: string): string {
  return script
    .split("\n")
    .map((raw) => raw.replace(/[*_#>]/g, "").trim())
    .filter((line) => line && !NOT_SPOKEN.test(line))
    .map((line) => line.replace(SPOKEN_LABEL, ""))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/** The brand's short-video drafts with something to say, newest first: "A draft". */
export function scriptDrafts(userId: string): { id: string; label: string; script: string }[] {
  return loadDrafts(userId)
    .filter((d) => d.format === "short-video")
    .map((d) => {
      const script = spokenText(splitScriptCaption(d.draft).script ?? d.draft);
      return { id: d.id, label: (d.hook || script).replace(/[*_#>]/g, "").trim().slice(0, 80), script };
    })
    .filter((d) => d.script.split(/\s+/).length >= 5);
}

// ---------- the write (outside React) ----------

export interface NarratedWrite {
  state: "reading" | "writing" | "finding" | "done" | "failed";
  step: string;
  error?: string;
}

let write: NarratedWrite | null = null;
const writeListeners = new Set<(w: NarratedWrite | null) => void>();
const setWrite = (w: NarratedWrite | null) => {
  write = w;
  writeListeners.forEach((l) => l(w && { ...w }));
};
export const narratedWrite = () => write;
export const writing = () => !!write && write.state !== "done" && write.state !== "failed";
export function onNarratedWrite(fn: (w: NarratedWrite | null) => void): () => void {
  writeListeners.add(fn);
  return () => void writeListeners.delete(fn);
}

export const WRITE_FAILED = "Couldn't write the script. Try again in a minute.";
export const READ_STEP = "Reading the page...";
/** A clip at least this long loops well under a scene of any length. */
const STOCK_NEED = 3;

/**
 * Per scene, its stock clip: a portrait Pexels search on its words, then one montage-pick call where Jev says which
 * clip shows each scene. "None fits" is an AI picture; no answer from Jev takes the first clip, as the montage does.
 * A clip is used once. A failed search finds nothing for that scene.
 */
export async function findStock(scenes: Pick<NarratedScene, "say" | "search">[], theme: string, progress: (done: number) => void): Promise<(StockItem | null)[]> {
  const lists: StockItem[][] = [];
  for (const s of scenes) {
    const found = await searchStock("video", s.search, 1, "portrait").catch(() => null);
    lists.push(chooseClips(found?.items ?? [], new Set(), STOCK_NEED, "portrait").slice(0, MAX_CANDIDATES));
    progress(lists.length);
  }
  const r = lists.some((l) => l.length)
    ? await callFn<{ picks: (number | null)[] }>("video-assist", {
        mode: "montage-pick",
        theme,
        beats: scenes.map((s, i) => ({ say: s.say, candidates: lists[i].map((it) => ({ desc: clipDesc(it) })) })),
      }).catch(() => null)
    : null;
  const used = new Set<string>();
  return lists.map((items, i) => {
    const p = r?.picks?.[i];
    if (p === -1) return null;
    const want = typeof p === "number" ? items[p] : undefined;
    const it = want && !used.has(want.id) ? want : items.find((x) => !used.has(x.id));
    if (!it) return null;
    used.add(it.id);
    return it;
  });
}

/** Stock found for every scene, kept with the adviser's pick per scene: a clip where one fits, else an AI picture. */
async function withStock(scenes: Omit<NarratedScene, "stock" | "use">[], theme: string): Promise<NarratedScene[]> {
  const n = scenes.length;
  setWrite({ state: "finding", step: `Finding stock clips, 0 of ${n}...` });
  const stock = await findStock(scenes, theme, (d) => setWrite({ state: "finding", step: `Finding stock clips, ${d} of ${n}...` }));
  return scenes.map((s, i) => ({ ...s, stock: stock[i], use: stock[i] ? "stock" : "ai" }));
}

/** Leo's facts and learnings for videos (brand-voice-memory), "" for anyone else; ai-video prints them after the topic. */
async function videoNotes(userId: string): Promise<string> {
  try {
    return (await leoUser()) ? memoryLine(userId, "videos", MAX_NOTES) : "";
  } catch {
    return "";
  }
}

/** "Write it" / "Split into scenes": the page read first for a link, then the script, then stock when it is on. */
export async function writeNarrated(userId: string, a: { from: From; seconds: NarratedSeconds; stock: boolean }): Promise<void> {
  if (writing()) return;
  const d = loadDraft(userId);
  const keep = a.from === "script" || a.from === "draft";
  try {
    let source: { kind: "script"; text: string } | { kind: "link"; title: string; text: string } | undefined;
    let page: NarratedDraft["source"];
    if (a.from === "link") {
      setWrite({ state: "reading", step: READ_STEP });
      const r = await callFn<{ title: string; site: string; text: string }>("ai-video", { mode: "read", url: d.link.trim() }, "That page couldn't be read. Paste the text as your script instead.");
      source = { kind: "link", title: r.title, text: r.text };
      page = { url: d.link.trim(), site: r.site, title: r.title };
    } else if (keep) source = { kind: "script", text: d.script.trim() };
    setWrite({ state: "writing", step: keep ? "Splitting into scenes..." : "Writing the script..." });
    const topic = a.from === "topic" ? d.topic.trim() : "";
    const notes = await videoNotes(userId);
    const r = await callFn<{ scenes: Scene[]; look: { id: LookId; p: number } | null; mas: boolean | null }>(
      "ai-video",
      { mode: "script", topic, seconds: a.seconds, ...(source ? { source } : {}), ...(notes ? { notes } : {}) },
      WRITE_FAILED,
    );
    const written = r.scenes.map((s) => ({ say: s.say, picture: s.picture, search: s.search ?? "" }));
    const scenes = a.stock ? await withStock(written, topic || page?.title || written[0]?.say || "") : written.map((s) => ({ ...s, stock: null, use: "ai" as const }));
    saveDraft(userId, { scenes, seconds: a.seconds, source: page, recommended: r.look ?? null, mas: r.mas ?? null, found: a.stock, photosFrom: undefined });
    setWrite({ state: "done", step: "" });
  } catch (e) {
    // the server's own words for a refusal or a used-up cap; anything else is the step's line
    setWrite({ state: "failed", step: "", error: e instanceof EdgeError || e instanceof Error ? e.message || WRITE_FAILED : WRITE_FAILED });
  }
}

/** Stock first picked after the scenes were written without it: look for clips now, keeping the words. */
export async function findStockNow(userId: string): Promise<void> {
  const d = loadDraft(userId);
  if (writing() || !d.scenes?.length || d.found) return;
  try {
    const scenes = await withStock(d.scenes, d.topic.trim() || d.source?.title || d.scenes[0].say);
    saveDraft(userId, { scenes, found: true });
    setWrite({ state: "done", step: "" });
  } catch {
    setWrite({ state: "done", step: "" });
  }
}

export const dismissWrite = () => void (write && !writing() && setWrite(null));

// ---------- photos from a media set (brand-media-sets, Leo's) ----------

/** A photo set's photos on this device, in set order (newest first, as Media lists them). */
export const setPhotos = (userId: string, set: string): MediaItem[] => loadMedia(userId).filter((m) => m.folder === set);

/**
 * Per scene, its photo: Jev's pick when it is still unused, else the next unused photo in set order (Jev gave no
 * answer, or said none fits, which also marks it `miss`). A set smaller than the scenes starts over once every photo
 * is used, so no scene is left without one.
 */
export function choosePhotos(items: MediaItem[], cands: MediaItem[][], picks: (number | null)[]): { photo: string; miss?: true }[] {
  const used = new Set<string>();
  return cands.map((xs, i) => {
    if (used.size >= items.length) used.clear();
    const p = picks[i];
    const want = typeof p === "number" && p >= 0 ? xs[p] : undefined;
    const it = want && !used.has(want.key) ? want : items.find((m) => !used.has(m.key))!;
    used.add(it.key);
    return { photo: it.key, ...(p === -1 ? { miss: true as const } : {}) };
  });
}

/**
 * One montage-pick call with `set: true`: each scene offered up to 12 of the set's photos by their alt text (a set
 * over 12 rotated, so every photo is offered; photos with no words last, as "a photo"). No answer fills in set order.
 */
export async function pickPhotos(scenes: Pick<NarratedScene, "say">[], items: MediaItem[], theme: string): Promise<{ photo: string; miss?: true }[]> {
  const described = [...items].sort((a, b) => Number(!a.alt.trim()) - Number(!b.alt.trim()));
  const cands = rotateCandidates(described, scenes.length);
  const r = await callFn<{ picks: (number | null)[] }>("video-assist", {
    mode: "montage-pick",
    theme,
    set: true,
    beats: scenes.map((s, i) => ({ say: s.say, candidates: cands[i].map((m) => ({ desc: m.alt.trim() || "a photo" })) })),
  }).catch(() => null);
  return choosePhotos(items, cands, scenes.map((_, i) => (typeof r?.picks?.[i] === "number" ? r.picks[i] : null)));
}

/** A set picked with scenes on screen: a photo for each scene, kept in the draft. A set with no photos here does nothing. */
export async function pickPhotosNow(userId: string, set: string): Promise<void> {
  const d = loadDraft(userId);
  const items = setPhotos(userId, set);
  if (writing() || !d.scenes?.length || !items.length) return;
  setWrite({ state: "finding", step: `Picking photos from ${set}...` });
  const got = await pickPhotos(d.scenes, items, d.topic.trim() || d.source?.title || d.scenes[0].say);
  saveDraft(userId, { scenes: d.scenes.map((s, i) => ({ ...s, photo: got[i].photo, miss: got[i].miss })), photosFrom: set });
  setWrite({ state: "done", step: "" });
}

// ---------- the make ----------

/** The scenes the video uses, each a stock clip or an AI picture, or with a set picked its photo. */
export const usesStock = (s: NarratedScene, on: boolean) => on && s.use === "stock" && !!s.stock;
export const usesPhoto = (s: NarratedScene, set: string) => !!set && !!s.photo;

/** "5 scenes, about 30 seconds. 3 stock clips and 2 AI pictures.", or with a set what the set costs. */
export function summaryLine(scenes: NarratedScene[], seconds: number, on: boolean, set = ""): string {
  const stock = scenes.filter((s) => usesStock(s, on)).length;
  const ai = scenes.length - stock;
  const n = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;
  if (set) return `${n(scenes.length, "scene", "scenes")}, about ${Math.round(seconds)} seconds. Uses 1 voiceover. Pictures from your set are free.`;
  const parts = [stock ? n(stock, "stock clip", "stock clips") : "", ai ? n(ai, "AI picture", "AI pictures") : ""].filter(Boolean).join(" and ");
  return `${n(scenes.length, "scene", "scenes")}, about ${Math.round(seconds)} seconds. ${parts.replace(/^./, (c) => c.toUpperCase())}.`;
}

/** Makes the video (aiVideo.ts), and clears the draft once the video is being put together. */
export async function makeNarrated(
  userId: string,
  a: { name: string; scenes: NarratedScene[]; voice: VoiceId; look: LookId; move: boolean; visuals: Visuals; extra?: JoinExtra; set?: string },
): Promise<void> {
  const on = stockOn(a.visuals, a.look);
  // a set: every scene its photo, so no look, move or stock rides along
  const opts: ExplainerOpts = a.set
    ? { images: a.scenes.map((s) => s.photo ?? "") }
    : { look: a.look, move: a.move, stock: a.scenes.map((s) => (usesStock(s, on) ? s.stock!.src : null)) };
  await makeExplainer(a.name, a.scenes.map((s) => ({ say: s.say.trim(), picture: s.picture.trim() })), a.voice, a.extra, opts);
  const j = aiJob();
  if (j?.kind === "explainer" && j.state === "done") clearDraft(userId);
}
