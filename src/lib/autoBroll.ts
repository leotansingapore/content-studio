// "Add B-roll for me" in the video editor. video-assist (mode "broll") says which
// lines get a cutaway and what each needs: for a scene, a stock search, and this
// finds a clip for it (stock-media, Pexels), never one already on the video, keeps
// it on this device and places it over its line; for an idea or a named product,
// card text, placed as a text sticker over the line. With AI clips switched on, a
// scene stock had nothing for gets one made by Higgsfield (ai-image mode "broll").
// It runs as a job outside React, like the caption job, so it carries on while the
// adviser uses other pages: the editor, when it is open on the video, takes the
// stock clips and cards in as one change (one Undo takes them all off) and each AI
// clip as it lands; otherwise they go straight into the saved project.

import { callFn } from "@/lib/edgeFn";
import { putFile } from "@/lib/deviceFiles";
import { downloadStock, searchStock, type StockItem } from "@/lib/stockMedia";
import { MAX_BROLL, MAX_OVERLAYS, newOverlay, type Broll, type Overlay, type Sentence } from "@/lib/videoEdit";
import { loadVideo } from "@/lib/videoMedia";
import { loadProjects, saveProject } from "@/lib/videoProjects";

export type Orientation = "portrait" | "landscape" | "square";

/**
 * AI clips (Higgsfield, about USD 0.13 each) are built but held back: the
 * Higgsfield API pool was still empty on 2026-10-09. Once it is topped up, set
 * the AI_BROLL_ENABLED secret to 1 on the ai-image function (the server refuses
 * AI B-roll without it, whatever the browser shows) and switch on here; until
 * then a browser with the cs-flag-ai-broll item set to 1 sees the switch (for
 * testing; that key does not sync).
 */
export const AI_BROLL = false;
export function aiBrollOn(): boolean {
  try {
    return AI_BROLL || window.localStorage.getItem("cs-flag-ai-broll") === "1";
  } catch {
    return AI_BROLL;
  }
}

/** A cutaway runs over its line for at least this long and at most this long (seconds). */
export const SPAN_MIN = 2;
export const SPAN_MAX = 5;

/** The Pexels id inside a clip's file key (br-<id>-<time>), so the same clip is never placed twice. */
export const stockIdOf = (key: string): string | null => /^br-(\d+)-/.exec(key)?.[1] ?? null;

/** Where a cutaway over this line goes on the edited timeline: from its start, 2 to 5 s, clear of the next pick and the end. Null when under a second fits. */
export function brollSpan(line: Sentence, nextStart: number | null, total: number): { from: number; to: number } | null {
  const from = Math.floor(line.s * 10) / 10;
  const end = Math.min(nextStart === null ? Infinity : nextStart - 0.2, total);
  const to = Math.round(Math.min(end, Math.max(from + SPAN_MIN, Math.min(line.e, from + SPAN_MAX))) * 10) / 10;
  return to - from >= 1 ? { from, to } : null;
}

/** The results not on the video yet, the right way up for the frame and long enough to run without looping. */
export function chooseClips(items: StockItem[], used: Set<string>, need: number, orientation: Orientation): StockItem[] {
  return items.filter((it) =>
    !used.has(it.id) &&
    (it.duration === undefined || it.duration >= need - 0.5) &&
    (orientation === "portrait" ? it.h > it.w : orientation === "landscape" ? it.w > it.h : true),
  );
}
export const chooseClip = (items: StockItem[], used: Set<string>, need: number, orientation: Orientation): StockItem | null =>
  chooseClips(items, used, need, orientation)[0] ?? null;

// ---------- the job ----------

export interface Placed {
  /** The Broll's id on the video, or the text sticker's for a card. */
  id: string;
  kind: "scene" | "idea" | "product";
  line: string;
  /** The search behind a clip, or the card's text. */
  search: string;
  /** Made by AI because stock had nothing. */
  ai?: boolean;
}

/** What video-assist says to place on a line; a pick from before kinds is a scene. */
export type BrollPick = { i: number; kind?: "scene"; search: string } | { i: number; kind: "idea" | "product"; callout: string };

/** What the editor takes in at the end, as one change. */
export interface Added {
  broll: Broll[];
  overlays: Overlay[];
}

export interface BrollJob {
  projectId: string;
  state: "reading" | "finding" | "making" | "done" | "failed";
  /** Clips looked for (or, making, AI clips made) so far, of how many. */
  done: number;
  of: number;
  error?: string;
  /** Why AI clips stopped (no uses left, no credits); the stock clips stay. */
  note?: string;
  /** The clips placed, with the line and the search behind each. */
  placed: Placed[];
  /** Searches that found nothing usable. */
  missed: string[];
}

let job: BrollJob | null = null;
let stopping = false;
const listeners = new Set<(j: BrollJob | null) => void>();
const emit = () => listeners.forEach((l) => l(job && { ...job, placed: [...job.placed], missed: [...job.missed] }));
export const brollJob = () => job;
export function onBrollJob(fn: (j: BrollJob | null) => void) {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}
/** Stops after the clip being fetched; what was found so far still goes in. */
export const stopBrollJob = () => void (stopping = true);
/** Puts the finished job's sheet away. */
export function dismissBrollJob() {
  if (job?.state === "done" || job?.state === "failed") {
    job = null;
    emit();
  }
}

// the editor registers here while it is open on a video, so new clips go into its live edit
const appliers = new Map<string, (added: Added) => void>();
export function onBrollApply(projectId: string, fn: (added: Added) => void) {
  appliers.set(projectId, fn);
  return () => void (appliers.get(projectId) === fn && appliers.delete(projectId));
}

export interface BrollAsk {
  projectId: string;
  /** What is said, on the edited timeline. */
  sentences: Sentence[];
  total: number;
  hookSeconds: number;
  existing: Broll[];
  /** Stickers on the video now, so cards stay inside MAX_OVERLAYS. */
  stickers: number;
  /** The colour a new text sticker takes. */
  color: string;
  orientation: Orientation;
  /** Make an AI clip for a scene stock had nothing for. */
  ai?: boolean;
}

export const running = (j: BrollJob | null) => j?.state === "reading" || j?.state === "finding" || j?.state === "making";

/** How often an AI clip's progress is asked for; a seam for tests. */
export const timing = { pollMs: 5000, tries: 72 };

/** One AI clip for a line: asked for (one "ai-broll" use), waited for, kept on this device. */
async function makeAiClip(w: { search: string; line: string; span: { from: number; to: number } }, orientation: Orientation): Promise<Broll> {
  const aspect = orientation === "landscape" ? "16:9" : orientation === "square" ? "1:1" : "9:16";
  const { token } = await callFn<{ token: string }>("ai-image", { mode: "broll", search: w.search, line: w.line, aspect }, "Couldn't make the clip right now. Try again in a minute.");
  for (let i = 0; i < timing.tries; i++) {
    await new Promise((r) => setTimeout(r, timing.pollMs));
    const st = await callFn<{ state: string; url?: string; error?: string }>("ai-image", { mode: "status", token }).catch(() => ({ state: "working" }) as { state: string; url?: string; error?: string });
    if (st.state === "failed") throw new Error(st.error || "The AI clip didn't come through.");
    if (st.state !== "done" || !st.url) continue;
    const blob = await downloadStock(st.url);
    const probe = await loadVideo(blob).catch(() => null);
    const length = probe && Number.isFinite(probe.duration) ? probe.duration : SPAN_MAX;
    if (probe) URL.revokeObjectURL(probe.src);
    const key = `br-ai-${Date.now().toString(36)}`;
    await putFile(key, blob);
    return { id: `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, key, ...w.span, length: Math.max(0.5, length), thumb: "", by: "", byUrl: "", url: "" };
  }
  throw new Error("The AI clip is taking too long. Try again later.");
}

export async function startAutoBroll(userId: string, a: BrollAsk): Promise<void> {
  if (running(job)) throw new Error("B-roll is still being found for another video.");
  stopping = false;
  const j: BrollJob = { projectId: a.projectId, state: "reading", done: 0, of: 0, placed: [], missed: [] };
  job = j;
  emit();
  const added: Added = { broll: [], overlays: [] };
  const deliver = (add: Added) => {
    if (!add.broll.length && !add.overlays.length) return;
    const apply = appliers.get(a.projectId);
    if (apply) return apply(add);
    const latest = loadProjects(userId).find((x) => x.id === a.projectId);
    const s = latest?.settings;
    if (latest && s) saveProject(userId, { ...latest, settings: { ...s, broll: [...(s.broll ?? []), ...add.broll].slice(0, MAX_BROLL), overlays: [...(s.overlays ?? []), ...add.overlays].slice(0, MAX_OVERLAYS) } });
  };
  // scene lines stock had nothing for, for AI clips
  const wantAi: { search: string; line: string; span: { from: number; to: number } }[] = [];
  try {
    const reply = await callFn<{ picks: BrollPick[] | null }>("video-assist", {
      mode: "broll",
      sentences: a.sentences.map(({ s, e, text }) => ({ s, e, text })),
      duration: a.total,
      hookSeconds: a.hookSeconds,
      taken: a.existing.map((b) => ({ s: b.from, e: b.to })),
      room: MAX_BROLL - a.existing.length,
    }, "Couldn't find B-roll right now. Try again in a minute.");
    if (!Array.isArray(reply?.picks)) throw new Error("Couldn't pick the lines this time (it reads videos in English). Add B-roll by hand below.");
    const picks = reply.picks.filter((p) => a.sentences[p.i]);
    const used = new Set(a.existing.map((b) => stockIdOf(b.key)).filter((x): x is string => !!x));
    Object.assign(j, { state: "finding", of: picks.length });
    emit();
    for (let k = 0; k < picks.length && !stopping; k++) {
      const p = picks[k];
      const line = a.sentences[p.i];
      const span = brollSpan(line, k + 1 < picks.length ? a.sentences[picks[k + 1].i].s : null, a.total);
      if ("callout" in p) {
        // an idea or a named product: a text card over the line, no clip
        if (span && a.stickers + added.overlays.length < MAX_OVERLAYS) {
          const o: Overlay = { ...newOverlay("text", span.from, a.color), text: p.callout, ...span };
          added.overlays.push(o);
          j.placed.push({ id: o.id, kind: p.kind, line: line.text, search: p.callout });
        }
        j.done++;
        emit();
        continue;
      }
      const it = span && chooseClip((await searchStock("video", p.search, 1, a.orientation)).items, used, span.to - span.from, a.orientation);
      // a clip that won't download is skipped; a search that fails (no searches left today) stops the job
      const blob = span && it ? await downloadStock(it.src).catch(() => null) : null;
      if (span && it && blob) {
        const probe = await loadVideo(blob).catch(() => null);
        const length = probe && Number.isFinite(probe.duration) ? probe.duration : it.duration ?? SPAN_MAX;
        if (probe) URL.revokeObjectURL(probe.src);
        const key = `br-${it.id}-${Date.now().toString(36)}`;
        await putFile(key, blob);
        used.add(it.id);
        const b: Broll = { id: `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, key, ...span, length: Math.max(0.5, length), thumb: it.thumb, by: it.by, byUrl: it.byUrl, url: it.url };
        added.broll.push(b);
        j.placed.push({ id: b.id, kind: "scene", line: line.text, search: p.search });
      } else if (span) {
        j.missed.push(p.search);
        if (a.ai) wantAi.push({ search: p.search, line: line.text, span });
      }
      j.done++;
      emit();
    }
  } catch (e) {
    Object.assign(j, { state: "failed", error: (e as Error).message });
  }
  deliver(added);
  // then an AI clip for each scene stock had nothing for, each going in as it lands; a refusal (no uses or credits left) ends them
  if (wantAi.length && j.state !== "failed" && !stopping) {
    Object.assign(j, { state: "making", done: 0, of: wantAi.length });
    emit();
    let made = 0;
    for (const w of wantAi) {
      if (stopping || a.existing.length + added.broll.length + made >= MAX_BROLL) break;
      try {
        const b = await makeAiClip(w, a.orientation);
        made++;
        deliver({ broll: [b], overlays: [] });
        j.placed.push({ id: b.id, kind: "scene", line: w.line, search: w.search, ai: true });
        j.missed.splice(j.missed.indexOf(w.search), 1);
      } catch (e) {
        j.note = (e as Error).message;
        break;
      }
      j.done++;
      emit();
    }
  }
  if (j.state !== "failed") j.state = "done";
  emit();
}
