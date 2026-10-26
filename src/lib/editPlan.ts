// Same edit, your version (docs/north-star/items/remix-format-clone.md): the plan of a reel's edit, made from what
// was measured on this device (cuts, zooms, faces, the words' times) and reel-visuals' edit read, then laid over a
// new video's own words. The plan is our own shape and holds no word of the creator's: no transcript, no overlay
// text, no shot sentences, only roles, counts, shares and the look. Those words stay in memory for the read and the
// closeness check. Stored per brand at content-studio-edit-plans-<scoped uid> (synced by cloudSync): the newest 20
// plans and 24 versions a plan.

import { scoped } from "@/lib/profiles";
import { withReelStyle, type ReelLook } from "@/lib/reelStyle";
import { defaultSettings, newOverlay, sentencesOf, type Broll, type EditSettings, type Overlay, type Word } from "@/lib/videoEdit";
import type { KeyLine } from "@/lib/videoMotion";
import type { VoiceId } from "../../supabase/functions/text-voice/logic.ts";
import type { EditPicks, EditRead, Framing, ShotKind } from "../../supabase/functions/reel-visuals/edit.ts";

export type { Framing, ShotKind };

export type BeatRole = "hook" | "point" | "proof" | "product" | "ask";

export interface EditPlan {
  v: 1;
  /** "ep-" + base 36 time. */
  id: string;
  /** The RemixSource key. */
  source: string;
  at: string;
  read: {
    seconds: number;
    aspect: "9:16" | "4:5" | "1:1" | "16:9";
    wpm: number | null;
    look: ReelLook | null;
    cutsPerMin: number | null;
    music: { bed: boolean; drops: number } | null;
    sfx: boolean;
    people: 1 | 2;
    /** The editor has one brollLayout per video, so the most common one. */
    cutaways: "full" | "top" | "side";
    /** What the plan does not carry: "split screen at 0:18". */
    skipped: string[];
  };
  /** 2 to 8. */
  beats: { role: BeatRole; share: number; shots: { kind: ShotKind; at: number; framing: Framing }[] }[];
  /** At most 40; event k is marker [[k]] in a version's script. */
  events: PlanEvent[];
}

/** Beat b, a share of the way through it in the source (0 to 1), and how long it lasted there as a share of the beat. */
export interface Place {
  b: number;
  at: number;
  span: number;
}

export type PlanEvent =
  | { kind: "cutaway"; place: Place; picture: "stock" | "ai" | "mine" }
  | { kind: "text"; place: Place; role: "hook" | "label" | "number" | "list" | "ask"; words: number; y: number }
  | { kind: "zoom"; place: Place }
  | { kind: "popup"; place: Place }
  | { kind: "cut"; place: Place; as: "hard" | "flash" | "dip" };

export interface Version {
  id: string;
  /** The version it changes. */
  of?: string;
  change?: "hook" | "offer" | "host" | "lang";
  host: { kind: "mine" } | { kind: "presenter"; id: string } | { kind: "none" } | { kind: "film" };
  voice: VoiceId;
  lang: "en" | "zh" | "ms" | "ta";
  offer: string | null;
  /** Our words, one per beat, markers removed. */
  lines: string[];
  marks: { k: number; line: number; word: number }[];
  /** On-screen text and pop-up lines. */
  texts: { k: number; text: string }[];
  searches: { k: number; search: string }[];
  caption: string;
  /** The editor project, on the device that made it. */
  project?: string;
  /** Its My posts draft, inside the set. */
  draft?: string;
  at: string;
}

/** Decision 10's proposal for every same-edit pick (shot, text, beat, role): kept at this probability or more. */
export const PICK_MIN = 0.5;
/** A face covering this share of a frame makes it a speaker shot (countFaces in faceVision.ts). */
export const SPEAKER_FACE = 0.06;
export const MAX_EVENTS = 40;
export const MAX_PLANS = 20;
export const MAX_VERSIONS = 24;
/** The shortest a laid text, cutaway or zoom runs, so a share of a short beat still shows. */
const MIN_EVENT_SECONDS = 1;
/** How long a measured zoom holds in the source (videoMotion's KEY_ZOOM: rise, hold and fall). */
const ZOOM_SECONDS = 2.1;
const Y_OF = { top: 0.18, middle: 0.5, bottom: 0.78 } as const;

export const planId = (now = new Date()) => `ep-${now.getTime().toString(36)}`;
/** `i` keeps the versions of one press apart. */
export const versionId = (now = new Date(), i = 0) => `ev-${(now.getTime() + i).toString(36)}`;

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const wordsIn = (s: string) => s.split(/\s+/).filter(Boolean).length;
const plain = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const sure = <T>(p: { pick: T; p: number } | null | undefined): T | null => (p && p.p >= PICK_MIN ? p.pick : null);

/** What planFromRead reads: the measures and the words stay in memory; only the plan is kept. */
export interface ReadInput {
  source: string;
  seconds: number;
  aspect: EditPlan["read"]["aspect"];
  /** measureReel's cuts and their kinds (cutKinds). */
  cuts: number[];
  cutKinds?: ("hard" | "flash" | "dip")[];
  zooms: number[];
  /** Per frame of the read: the faces over SPEAKER_FACE (countFaces). */
  faces: number[];
  /** Whisper's words. The edit request's sentences are sentencesOf(words), so picks.beats lines up with them. */
  words: Word[];
  /** Measured on the decoded sound: a music bed, drops before a line, sound effects at cuts. */
  sound: { bed: boolean; drops: number; sfx: boolean } | null;
  teardown: { beats: string[]; cta: string };
  /** reel-visuals mode edit's answer. */
  reply: { read: EditRead; look: ReelLook | null; picks: EditPicks };
}

/**
 * The plan: sentences to the teardown's beats (Jev's pick at PICK_MIN or more, else by word share, never back to an
 * earlier beat), the hook first and the ask last when the teardown asks something, shots as Jev read them (else a
 * measured face is a speaker and no face a cutaway), overlays with a job, cutaways, zooms and flash or dip cuts as
 * events placed by share of their beat, and at most MAX_EVENTS of them (texts, cutaways, zooms, then cuts).
 */
export function planFromRead(input: ReadInput, now = new Date()): EditPlan {
  const { reply, teardown } = input;
  const seconds = Math.max(1, input.seconds);
  const sentences = sentencesOf(input.words);
  const total = Math.max(1, sentences.reduce((n, s) => n + wordsIn(s.text), 0));
  const B = Math.max(1, teardown.beats.length);
  let before = 0;
  let last = 0;
  const beatOf = sentences.map((s, k) => {
    const n = wordsIn(s.text);
    const byShare = Math.min(B - 1, Math.floor(((before + n / 2) / total) * B));
    before += n;
    const pick = sure(reply.picks.beats[k]);
    last = Math.max(last, pick !== null && pick < B ? pick : byShare);
    return last;
  });
  // a beat starts at its first sentence (the first at 0); a reel with one beat's worth of words splits in two
  const found = beatOf.flatMap((tb, k) => (k === 0 || tb !== beatOf[k - 1] ? [{ tb, s: k === 0 ? 0 : sentences[k].s }] : []));
  const groups = found.length >= 2 ? found : [{ tb: 0, s: 0 }, { tb: B - 1, s: sentences.length > 1 ? sentences[Math.ceil(sentences.length / 2)].s : seconds / 2 }];
  const spans = groups.map((g, i) => ({ tb: g.tb, s: g.s, e: i + 1 < groups.length ? groups[i + 1].s : seconds }));
  const asks = !/^none\.?$/i.test(teardown.cta.trim()) && teardown.cta.trim() !== "";
  const roleOf = (i: number): BeatRole => {
    if (i === 0) return "hook";
    if (i === spans.length - 1 && asks) return "ask";
    return sure(reply.picks.roles[spans[i].tb]) ?? "point";
  };
  const beatAt = (t: number) => Math.max(0, spans.findIndex((x, i) => t < x.e || i === spans.length - 1));
  const place = (s: number, e: number): Place => {
    const b = beatAt(s);
    const len = Math.max(0.1, spans[b].e - spans[b].s);
    const at = clamp01((s - spans[b].s) / len);
    return { b, at: r3(at), span: r3(Math.min(1 - at, Math.max(0, e - s) / len)) };
  };

  // shots: each read frame stands for the shot it sits in, which runs to the next read shot
  const cutStarts = [0, ...input.cuts];
  const shots: { s: number; kind: ShotKind; framing: Framing; frame: number }[] = [];
  reply.read.frames.forEach((f, i) => {
    const s = Math.max(...cutStarts.filter((c) => c <= f.t + 1e-6));
    if (shots.some((x) => x.s === s)) return;
    const kind = sure(reply.picks.shots[i]) ?? ((input.faces[i] ?? 0) >= 1 ? "speaker" : "cutaway");
    shots.push({ s, kind, framing: f.framing, frame: i });
  });
  const shotEnd = (j: number) => (j + 1 < shots.length ? shots[j + 1].s : seconds);

  const beats = spans.map((x, i) => {
    const len = Math.max(0.1, x.e - x.s);
    const ongoing = [...shots].reverse().find((sh) => sh.s <= x.s);
    const inside = shots.filter((sh) => sh.s > x.s && sh.s < x.e);
    return {
      role: roleOf(i),
      share: r3(len / seconds),
      shots: [...(ongoing ? [ongoing] : []), ...inside].map((sh) => ({ kind: sh.kind, at: r3(clamp01((sh.s - x.s) / len)), framing: sh.framing })),
    };
  });

  // events, by priority for the cap
  const texts: PlanEvent[] = [];
  let shown: { text: string; ev: Extract<PlanEvent, { kind: "text" }>; s: number }[] = [];
  shots.forEach((sh, j) => {
    const f = reply.read.frames[sh.frame];
    const next: typeof shown = [];
    f.texts.forEach((x, n) => {
      const job = sure(reply.picks.texts[sh.frame]?.[n]);
      if (!job || job === "caption_repeat") return;
      const key = plain(x.text);
      // the same text still up across a cut is one event, lasting both shots
      const prev = shown.find((p) => p.text === key);
      if (prev) {
        prev.ev.place = place(prev.s, shotEnd(j));
        next.push(prev);
        return;
      }
      const ev = { kind: "text" as const, place: place(sh.s, shotEnd(j)), role: job, words: wordsIn(x.text), y: Y_OF[x.place] };
      texts.push(ev);
      next.push({ text: key, ev, s: sh.s });
    });
    shown = next;
  });
  const cutaways: PlanEvent[] = shots.flatMap((sh, j) =>
    sh.kind === "cutaway" || sh.kind === "product" || sh.kind === "screen"
      ? [{ kind: "cutaway" as const, place: place(sh.s, shotEnd(j)), picture: sh.kind === "cutaway" ? ("stock" as const) : ("mine" as const) }]
      : [],
  );
  const zooms: PlanEvent[] = input.zooms.map((t) => ({ kind: "zoom" as const, place: place(t, t + ZOOM_SECONDS) }));
  const cuts: PlanEvent[] = input.cuts.flatMap((t, j) => {
    const as = input.cutKinds?.[j];
    return as === "flash" || as === "dip" ? [{ kind: "cut" as const, place: place(t, t), as }] : [];
  });
  const events = [...texts, ...cutaways, ...zooms, ...cuts]
    .slice(0, MAX_EVENTS)
    .sort((a, b) => a.place.b - b.place.b || a.place.at - b.place.at);

  // cutaways in a card on top when more shots show that layout than show a cutaway filling the frame
  const topCards = shots.filter((sh) => sh.framing === "top-card").length;
  const fullCutaways = shots.filter((sh) => sh.kind !== "speaker" && sh.framing !== "top-card").length;
  const minutes = seconds / 60;
  return {
    v: 1,
    id: planId(now),
    source: input.source,
    at: now.toISOString(),
    read: {
      seconds: Math.round(seconds * 10) / 10,
      aspect: input.aspect,
      wpm: input.words.length >= 20 && seconds >= 5 ? Math.round(input.words.length / minutes) : null,
      look: reply.look,
      cutsPerMin: seconds >= 5 ? Math.round(input.cuts.length / minutes) : null,
      music: input.sound ? { bed: input.sound.bed, drops: input.sound.drops } : null,
      sfx: !!input.sound?.sfx,
      // two faces on a frame, unless Jev says the second is only in a picture (live-p7a D3: a meme read as a second speaker)
      people: input.faces.some((n, i) => n >= 2 && sure(reply.picks.people?.[i]) !== "one") ? 2 : 1,
      cutaways: reply.look?.topHalf || topCards > fullCutaways ? "top" : "full",
      skipped: [],
    },
    beats,
    events,
  };
}

/** A clip found for cutaway event k, as autoBroll downloads it (stock) or the brand's own media. */
export type CutawayClip = Omit<Broll, "id" | "from" | "to">;

/**
 * The plan laid over a new video (pure): marker k sits before word `word` of line `line`, so event k starts at that
 * word's start in `words` (the voice's own times, which are the video's for joined Speak parts and a filmed take's
 * transcript); a marker the writer dropped falls back to the beat's start plus `at` times the beat's new length. An
 * event lasts `span` of its new beat (at least MIN_EVENT_SECONDS), clipped to the beat's end. Cutaways need a clip
 * (`extra.clips` by k; one with none is left out), a number becomes a number card only when its line holds a figure
 * from the brand's facts (else a label), and the captions take the read's look as Copy a reel's style lays it. Times
 * are on the words' timeline. The logo and end card follow the brand kit (withKit), applied by the caller.
 */
export function compilePlan(
  plan: EditPlan,
  version: Version,
  words: Word[],
  seconds: number,
  extra: { clips?: Record<number, CutawayClip>; facts?: string; color?: string } = {},
): Partial<EditSettings> {
  // each line's first word, by its share of the script's words (exact when the voice says every word as written)
  const counts = version.lines.map(wordsIn);
  const totalWords = Math.max(1, counts.reduce((a, b) => a + b, 0));
  let cum = 0;
  const firstWord = counts.map((n) => {
    const at = Math.min(words.length - 1, Math.round((cum / totalWords) * words.length));
    cum += n;
    return Math.max(0, at);
  });
  const beatStart = plan.beats.map((_, b) => (b === 0 ? 0 : words.length ? words[firstWord[b] ?? words.length - 1].s : (seconds * b) / plan.beats.length));
  const beatEnd = (b: number) => (b + 1 < beatStart.length ? beatStart[b + 1] : seconds);
  const text = (k: number) => version.texts.find((x) => x.k === k)?.text ?? "";

  const span = (k: number, e: PlanEvent) => {
    const mark = version.marks.find((m) => m.k === k);
    const w = mark ? words[(firstWord[mark.line] ?? 0) + mark.word] : undefined;
    const b = Math.min(w ? mark!.line : e.place.b, plan.beats.length - 1);
    const len = Math.max(0.1, beatEnd(b) - beatStart[b]);
    const from = w ? w.s : beatStart[b] + e.place.at * len;
    const to = Math.min(beatEnd(b), from + Math.max(MIN_EVENT_SECONDS, e.place.span * len));
    return { from: Math.round(from * 100) / 100, to: Math.round(Math.max(from + 0.1, to) * 100) / 100 };
  };

  const out: Partial<EditSettings> = {};
  const broll: Broll[] = [];
  const overlays: Overlay[] = [];
  const lines: KeyLine[] = [];
  let flashes = 0;
  let dips = 0;
  const color = extra.color ?? "#FFFFFF";
  const label = (k: number, from: number, to: number, y: number) => {
    if (!text(k)) return;
    overlays.push({ ...newOverlay("text", from, color), id: `o-${plan.id}-${k}`, text: text(k), y, from, to });
  };
  plan.events.forEach((e, k) => {
    const { from, to } = span(k, e);
    if (e.kind === "cutaway") {
      const clip = extra.clips?.[k];
      if (clip) broll.push({ ...clip, id: `b-${plan.id}-${k}`, from, to });
    } else if (e.kind === "text") {
      if (e.role === "hook" && text(k)) {
        out.hook = text(k);
        out.hookSeconds = Math.min(10, Math.max(1, Math.round(to)));
      } else if (e.role === "number") {
        const mark = version.marks.find((m) => m.k === k);
        const figures = (version.lines[mark?.line ?? e.place.b] ?? "").match(/\d[\d,.]*%?/g) ?? [];
        if (figures.some((f) => (extra.facts ?? "").includes(f.replace(/[.,]$/, "")))) out.numberCards = true;
        else label(k, from, to, e.y);
      } else if (e.role !== "hook") label(k, from, to, e.y);
    } else if (e.kind === "zoom") lines.push({ s: from, e: to, p: 1 });
    else if (e.kind === "popup" && text(k)) lines.push({ s: from, e: to, p: 1, pop: { text: text(k), key: "", emoji: "" } });
    else if (e.kind === "cut" && e.as === "flash") flashes++;
    else if (e.kind === "cut" && e.as === "dip") dips++;
  });
  if (broll.length) out.broll = broll;
  if (plan.read.cutaways !== "full") out.brollLayout = plan.read.cutaways;
  if (overlays.length) out.overlays = overlays;
  if (lines.length) {
    out.motion = { lines: lines.sort((a, b) => a.s - b.s) };
    if (lines.some((l) => !l.pop)) out.keyZooms = true;
    if (lines.some((l) => l.pop)) out.popups = true;
  }
  if (flashes || dips) out.transition = flashes >= dips ? "flash" : "soft";
  out.sfx = plan.read.sfx;
  out.musicDrop = (plan.read.music?.drops ?? 0) > 0;
  // the pause limit as withReelStyle sets it from the cuts a minute and the words a minute
  const cpm = plan.read.cutsPerMin;
  if (cpm !== null) out.maxPause = Math.min(cpm >= 20 ? 0.3 : cpm >= 10 ? 0.4 : 0.55, (plan.read.wpm ?? 0) >= 170 ? 0.3 : 1);
  if (plan.read.look) {
    const looked = withReelStyle(defaultSettings(), { source: { platform: "instagram", author: "", transcript: null, durationSec: null }, measure: null, style: null, look: plan.read.look }, null).next;
    for (const key of LOOK_KEYS) (out as Record<string, unknown>)[key] = looked[key];
  }
  return out;
}

/** The fields a reel's look sets on the captions (withReelStyle with no pace measured). */
const LOOK_KEYS = ["style", "position", "captionY", "wordsPerCaption", "baseColor", "activeColor", "uppercase", "captionBox", "font", "captionAnim", "captions", "fit"] as const;

/**
 * The Speak parts a version remakes, by index into the base video's parts (AiMark.slices, which speak base.lines in
 * order): every part for a new host or language, else the parts holding a line that changed. Every part when the
 * parts' words and the lines' words don't add up, since remaking too little would leave old words in the video.
 */
export function partsToRemake(base: Version, next: Version, slices: { text: string }[]): number[] {
  const all = slices.map((_, i) => i);
  if (next.change === "host" || next.change === "lang" || next.lines.length !== base.lines.length) return all;
  const ranges = (texts: string[]) => {
    let at = 0;
    return texts.map((t) => {
      const n = wordsIn(t);
      at += n;
      return [at - n, at] as const;
    });
  };
  const lineRanges = ranges(base.lines);
  const sliceRanges = ranges(slices.map((s) => s.text));
  if (lineRanges.at(-1)?.[1] !== sliceRanges.at(-1)?.[1]) return all;
  const changed = lineRanges.filter((_, i) => plain(base.lines[i]) !== plain(next.lines[i]));
  return all.filter((i) => changed.some(([a, b]) => sliceRanges[i][0] < b && a < sliceRanges[i][1]));
}

// ---------- the store ----------

export interface PlanEntry {
  plan: EditPlan;
  versions: Version[];
}

const PREFIX = "content-studio-edit-plans-";
export const PLANS_CHANGED = "content-studio-edit-plans-changed";
export const PLANS_FULL = "This device is full, so the edit wasn't kept. Delete an old video or draft and try again.";

const isPlan = (p: unknown): p is EditPlan => {
  const x = p as EditPlan | null;
  return !!x && x.v === 1 && typeof x.id === "string" && x.id.startsWith("ep-") && typeof x.source === "string" && typeof x.read?.seconds === "number"
    && Array.isArray(x.beats) && Array.isArray(x.events) && Number.isFinite(Date.parse(x.at));
};
const isVersion = (v: unknown): v is Version => {
  const x = v as Version | null;
  return !!x && typeof x.id === "string" && x.id.startsWith("ev-") && Array.isArray(x.lines) && Array.isArray(x.marks) && Number.isFinite(Date.parse(x.at));
};

/** This brand's plans, newest first; empty on bad JSON, and a bad plan or version is dropped. */
export function loadPlans(userId: string): PlanEntry[] {
  try {
    const v = JSON.parse(localStorage.getItem(PREFIX + scoped(userId)) ?? "[]");
    return (Array.isArray(v) ? v : [])
      .filter((e) => isPlan(e?.plan))
      .map((e) => ({ plan: e.plan, versions: Array.isArray(e.versions) ? e.versions.filter(isVersion) : [] }));
  } catch {
    return [];
  }
}

/** Newest MAX_PLANS by when made, MAX_VERSIONS each; on a full device the oldest plan goes once, then the line. */
function save(userId: string, list: PlanEntry[]): string | null {
  let kept = [...list]
    .sort((a, b) => b.plan.at.localeCompare(a.plan.at))
    .slice(0, MAX_PLANS)
    .map((e) => ({ ...e, versions: [...e.versions].sort((a, b) => b.at.localeCompare(a.at)).slice(0, MAX_VERSIONS) }));
  for (let tries = 0; tries < 2; tries++) {
    try {
      localStorage.setItem(PREFIX + scoped(userId), JSON.stringify(kept));
      window.dispatchEvent(new Event(PLANS_CHANGED));
      return null;
    } catch {
      if (kept.length < 2) break;
      kept = kept.slice(0, -1);
    }
  }
  return PLANS_FULL;
}

/** Saves a plan (a new one, or the same id again with its versions kept). Null when kept, else the line to show. */
export function savePlan(userId: string, plan: EditPlan): string | null {
  const list = loadPlans(userId);
  const old = list.find((e) => e.plan.id === plan.id);
  return save(userId, [...list.filter((e) => e.plan.id !== plan.id), { plan, versions: old?.versions ?? [] }]);
}

/** Adds a version to its plan, or replaces the one with its id. Null when kept, else the line to show. */
export function addVersion(userId: string, planId: string, version: Version): string | null {
  const list = loadPlans(userId);
  const entry = list.find((e) => e.plan.id === planId);
  if (!entry) return "That edit isn't on this device any more. Read the reel again.";
  entry.versions = [...entry.versions.filter((v) => v.id !== version.id), version];
  return save(userId, list);
}
