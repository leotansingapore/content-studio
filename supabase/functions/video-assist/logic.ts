// Pure logic for video-assist (the video editor at /edit): cleaning Whisper's
// word timings, and the "vibe edit" prompt and reply. No Deno or npm imports, so
// vitest covers it (logic.test.ts).

import { choiceOf, noulOf, scoreOf, type JevAnswer, type JevQuestion } from "../_shared/jev.ts";

export const MAX_AUDIO_BYTES = 24 * 1024 * 1024; // Whisper takes 25 MB
export const VIBE_MODEL = "gpt-4.1";
export const MAX_INSTRUCTION = 500;
export const MAX_TRANSCRIPT = 3000;
export const MAX_FRAMES = 3;
export const MAX_FRAME_CHARS = 400_000;

export interface Word {
  w: string;
  s: number;
  e: number;
}

const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9']/g, "");

/**
 * Whisper's word list has no punctuation or casing; its full text does. Walk the
 * text's tokens alongside the words and take each token's written form, so
 * captions keep "think." and sentence breaks. A word with no match keeps its own form.
 */
export function cleanWords(raw: unknown, text: string): Word[] {
  const list = Array.isArray(raw) ? raw : [];
  const tokens = String(text ?? "").split(/\s+/).filter(Boolean);
  let ti = 0;
  const out: Word[] = [];
  for (const r of list) {
    const o = r && typeof r === "object" ? (r as Record<string, unknown>) : {};
    const w = String(o.word ?? "").trim();
    const s = Number(o.start);
    const e = Number(o.end);
    if (!w || !Number.isFinite(s) || !Number.isFinite(e) || e < s) continue;
    let form = w;
    for (let k = ti; k < Math.min(tokens.length, ti + 4); k++) {
      if (norm(tokens[k]) === norm(w)) {
        form = tokens[k];
        ti = k + 1;
        break;
      }
    }
    out.push({ w: form.replace(/—/g, ","), s: Math.round(s * 1000) / 1000, e: Math.round(e * 1000) / 1000 });
  }
  return out;
}

/** The settings keys the model may change, with what each means. Mirrors src/lib/videoEdit.ts applyPatch. */
export const VIBE_KEYS: Record<string, string> = {
  style: 'caption style: "bold" (huge 2-3 word Hormozi captions, spoken word highlighted), "cutout" (golden serif 1-3 words), "minimal" (sentence in a dark pill), "editorial" (serif lines, warm film look), "native" (TikTok-style outlined lines), "documentary" (plain subtitles, cinematic bars)',
  position: '"top" | "middle" | "bottom"',
  size: "caption size multiplier 0.6-1.6 (1 = the style's size)",
  wordsPerCaption: "words shown at once in bold/cutout styles, 1-6",
  baseColor: "caption colour, #RRGGBB",
  activeColor: "colour of the word being spoken, #RRGGBB",
  uppercase: "boolean",
  captions: "boolean, captions on or off",
  hook: "title text shown at the top for the first seconds, max 90 chars, plain words, no em dashes",
  hookSeconds: "0-10",
  removeFillers: "boolean, cut um/uh",
  maxPause: "pauses longer than this many seconds are cut down, 0 keeps every pause, 0.3 is tight, 0.6 is natural",
  trimStart: "seconds cut from the start",
  trimEnd: "seconds cut from the end",
  aspect: '"9:16" | "4:5" | "1:1" | "16:9" | "original"',
  fit: '"fill" (crop to the frame) | "blur" (whole video over a blurred copy, for landscape footage)',
  focusX: "horizontal crop centre 0 (left) to 1 (right)",
  punchIn: "boolean, zoom in on alternate cuts",
  progressBar: "boolean",
  grade: "boolean, the style's colour grade",
  nameTag: "lower-third name shown after the hook, max 40 chars, empty = off (only the person's real name if they gave it)",
  roleTag: "the role line under the name tag, max 50 chars",
  highlightNumbers: "boolean, numbers and $ or % words shown in the highlight colour",
};

export interface VibeRequest {
  instruction: string;
  settings: Record<string, unknown>;
  transcript: string;
  duration: number;
  frames: string[];
}

export function parseVibeRequest(body: unknown): { ok: true; request: VibeRequest } | { ok: false; error: string } {
  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const instruction = String(b.instruction ?? "").trim().slice(0, MAX_INSTRUCTION);
  const frames = (Array.isArray(b.frames) ? b.frames : [])
    .filter((f): f is string => typeof f === "string" && /^data:image\/(jpeg|png);base64,/.test(f) && f.length <= MAX_FRAME_CHARS)
    .slice(0, MAX_FRAMES);
  if (!instruction && !frames.length) return { ok: false, error: "Say what to change, or add a reference video." };
  return { ok: true, request: { instruction, settings: cleanSettings(b.settings), transcript: String(b.transcript ?? "").slice(0, MAX_TRANSCRIPT), duration: Number(b.duration) || 0, frames } };
}

/**
 * Only the known keys, only short plain values, at most 2 KB: the settings go
 * into a paid prompt, and the daily cap counts calls, not tokens.
 */
export function cleanSettings(raw: unknown): Record<string, unknown> {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(VIBE_KEYS)) {
    const v = src[k];
    if (typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v))) out[k] = v;
    else if (typeof v === "string") out[k] = v.slice(0, 100);
  }
  return JSON.stringify(out).length <= 2048 ? out : {};
}

export function buildVibeMessages(r: VibeRequest): { role: string; content: unknown }[] {
  const system = [
    "You are the editor inside a short-form video editor for Singapore financial advisers. The edit is a settings object; you change it to do what the person asks.",
    "Reply with JSON only: {\"patch\": {...only the keys that change...}, \"reply\": \"one short plain sentence saying what you changed\"}.",
    "Allowed keys:",
    ...Object.entries(VIBE_KEYS).map(([k, v]) => `- ${k}: ${v}`),
    "If something asked for is not possible with these keys (music, B-roll, stickers, transitions), change what you can and say plainly in the reply what you could not do.",
    "When reference frames are attached, match their caption look: style, position, colours, case and size. Say which look you matched.",
    "Never invent facts for a hook; use words from the transcript. No em dashes.",
  ].join("\n");
  const text = [
    `Current settings: ${JSON.stringify(r.settings)}`,
    `Video length: ${r.duration.toFixed(1)}s`,
    r.transcript ? `Transcript: ${r.transcript}` : "",
    r.instruction ? `Request: ${r.instruction}` : "Request: match the caption look of the reference frames.",
  ].filter(Boolean).join("\n\n");
  const content = r.frames.length
    ? [{ type: "text", text }, ...r.frames.map((url) => ({ type: "image_url", image_url: { url, detail: "low" } }))]
    : text;
  return [{ role: "system", content: system }, { role: "user", content }];
}

export function parseVibeReply(content: string | null): { patch: Record<string, unknown>; reply: string } | null {
  if (!content) return null;
  try {
    const o = JSON.parse(content);
    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(o?.patch ?? {})) if (k in VIBE_KEYS) patch[k] = v;
    const reply = String(o?.reply ?? "").replace(/—/g, ",").slice(0, 300);
    return { patch, reply: reply || "Done." };
  } catch {
    return null;
  }
}

// ---------- clips: one long video -> standalone reels, ranked by Jev ----------

export const MAX_SENTENCES = 600;
export interface ClipSentence {
  s: number;
  e: number;
  text: string;
}
export interface FoundClip {
  start: number;
  end: number;
  title: string;
  hook: string;
  /** One line on why a viewer would watch it to the end, written by the LLM. */
  reason: string;
  /** Out of 100, from Jev: how well it stands alone and how strongly it opens. Unset when Jev had no answer. */
  score?: number;
  /** When the person said what they want: whether Jev reads this clip as about it. */
  onTopic?: boolean;
  /** A tangent in the middle that the clip leaves out, seconds on the source. */
  skip?: Span;
}
export interface Span {
  start: number;
  end: number;
}

/** How long a clip plays: its span less the tangent it skips. */
export const playedLength = (c: Span & { skip?: Span }) => c.end - c.start - (c.skip ? c.skip.end - c.skip.start : 0);
/** A clip that plays 18 to 120 s; with a skip its span may run to 180. */
const playable = (c: Span & { skip?: Span }) => playedLength(c) >= 18 && playedLength(c) <= 120 && c.end - c.start <= 180;

/** What the person typed the clip should be about, at most this long. */
export const MAX_ABOUT = 200;

/** Word timings for clean clip edges: about 50 minutes of speech, more than the editor can caption. */
export const MAX_CLIP_WORDS = 8000;

export function parseClipsRequest(body: unknown): { ok: true; sentences: ClipSentence[]; duration: number; words: Word[]; about: string } | { ok: false; error: string } {
  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const duration = Number(b.duration);
  // optional (a YouTube link has captions, not word timings); only well-formed words in time order count
  const words: Word[] = [];
  for (const x of (Array.isArray(b.words) ? b.words : []).slice(0, MAX_CLIP_WORDS)) {
    const o = x && typeof x === "object" ? (x as Record<string, unknown>) : {};
    const w = { w: String(o.w ?? "").slice(0, 40), s: Number(o.s), e: Number(o.e) };
    if (w.w && Number.isFinite(w.s) && Number.isFinite(w.e) && w.e >= w.s && w.s >= (words[words.length - 1]?.s ?? 0)) words.push(w);
  }
  const sentences = (Array.isArray(b.sentences) ? b.sentences : [])
    .slice(0, MAX_SENTENCES)
    .map((x) => (x && typeof x === "object" ? (x as Record<string, unknown>) : {}))
    .map((x) => ({ s: Number(x.s), e: Number(x.e), text: String(x.text ?? "").slice(0, 400) }))
    .filter((x) => Number.isFinite(x.s) && Number.isFinite(x.e) && x.e > x.s && x.text);
  if (!Number.isFinite(duration) || duration < 45) return { ok: false, error: "Clips need a video of at least 45 seconds." };
  if (sentences.length < 5) return { ok: false, error: "Caption the video first, then find clips." };
  const about = String(b.about ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_ABOUT);
  return { ok: true, sentences, duration, words, about };
}

/**
 * How many clips a video gives, by its length: 3-5 under 8 minutes, 4-8 up to
 * 30, 6-12 beyond. The tiers follow AutoClip's DurationProfile.
 */
export function clipCount(duration: number): { min: number; max: number } {
  if (duration < 8 * 60) return { min: 3, max: 5 };
  if (duration < 30 * 60) return { min: 4, max: 8 };
  return { min: 6, max: 12 };
}

/** The LLM proposes about twice the clips kept, so Jev has a choice; at most 20 keeps the reply near 2 cents. */
export const candidateCount = (duration: number) => Math.min(20, 2 * clipCount(duration).max);

export function buildClipsMessages(sentences: ClipSentence[], duration: number, about = ""): { role: string; content: string }[] {
  const lines = sentences.map((x) => `[${x.s.toFixed(1)}-${x.e.toFixed(1)}] ${x.text}`).join("\n");
  const n = candidateCount(duration);
  const asked = about
    ? `The person wants clips about: ${JSON.stringify(about)}. List first every part of the video about that, best first, then the best of the rest.`
    : "";
  return [
    {
      role: "system",
      content: [
        "You cut short-form reels out of a long talking video by a Singapore financial adviser (podcast, talk or explainer).",
        `Propose up to ${n} candidate clips from across the whole video (fewer when it is too short to hold that many). Each should stand alone: a viewer with no context understands it, it opens on a strong line (a claim, a question, a number, a story beat) and ends on a complete thought.`,
        "Each clip is 25 to 75 seconds (aim for 30 to 60): join consecutive sentences until the thought is complete. It starts at the start time of a sentence and ends at the end time of a sentence. Clips never overlap. Best clip first.",
        "For each: a title of 3 to 7 words written from the payoff, what the viewer has by the end (the answer, the number, the lesson), not the topic, in sentence case (only the first word capitalised); a hook card of 8 words or fewer made only of the speaker's own words or their plain meaning; and a reason: one plain sentence of 15 words or fewer on why a viewer would watch it to the end. Only what the speaker says. No em dashes. Never promise returns.",
        'A clip may leave out one tangent in its middle (an aside or a detour its point does not need): give it as skip {"start":number,"end":number} on sentence times, with at least one sentence kept on each side, and the clip without it still 25 to 75 seconds. Most clips skip nothing: leave skip out.',
        asked,
        'Reply with JSON only: {"clips":[{"start":number,"end":number,"title":string,"hook":string,"reason":string,"skip"?:{"start":number,"end":number}}]}',
      ].filter(Boolean).join("\n"),
    },
    { role: "user", content: `Video length: ${duration.toFixed(1)}s\nTranscript with sentence times in seconds:\n${lines}` },
  ];
}

/** Keeps only clips that fit the video, play 18-120 s and do not overlap, in the order given, at most `limit`. */
export function parseClipsReply(content: string | null, duration: number, limit = 5): FoundClip[] | null {
  if (!content) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    return null;
  }
  const list = Array.isArray((raw as { clips?: unknown })?.clips) ? (raw as { clips: unknown[] }).clips : [];
  const out: FoundClip[] = [];
  for (const c of list) {
    const o = c && typeof c === "object" ? (c as Record<string, unknown>) : {};
    const start = Math.max(0, Number(o.start));
    const end = Math.min(duration, Number(o.end));
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    // a tangent left out: inside the clip, at least 3 s
    const k = o.skip && typeof o.skip === "object" ? (o.skip as Record<string, unknown>) : {};
    const skip = { start: Number(k.start), end: Number(k.end) };
    const skips = skip.start > start && skip.end < end && skip.end - skip.start >= 3;
    const clip = { start, end, ...(skips ? { skip } : {}) };
    if (!playable(clip)) continue;
    if (out.some((x) => start < x.end && end > x.start)) continue;
    const clean = (v: unknown, n: number) => String(v ?? "").replace(/\s*\u2014\s*/g, ", ").trim().slice(0, n);
    out.push({ ...clip, title: clean(o.title, 60) || "Clip", hook: clean(o.hook, 90), reason: clean(o.reason, 160) });
    if (out.length === limit) break;
  }
  return out;
}

/** What is said in a clip, sentence by sentence: from the word timings when there are some. */
export function clipText(sentences: ClipSentence[], clip: Pick<FoundClip, "start" | "end" | "skip">, words: Word[] = []): string[] {
  const within = (x: { s: number; e: number }, r: Span) => x.s >= r.start - 0.05 && x.e <= r.end + 0.05;
  const kept = (x: { s: number; e: number }) => within(x, clip) && !(clip.skip && within(x, clip.skip));
  if (!words.length) return sentences.filter(kept).map((x) => x.text);
  const inside = words.filter(kept);
  return sentenceSpans(inside).map(([i, j]) => inside.slice(i, j + 1).map((w) => w.w).join(" "));
}

// ---------- clean clip edges, from the word timings ----------

/**
 * p(what is skipped is only an aside) from this up keeps the skip. Read off 6
 * real podcast passages (jev-1.13.0, 2026-10-09): asides left out 0.86-0.90; a
 * step, example or reason left out 0.15-0.48.
 */
export const SKIP_OK = 0.7;

/** Shortest and longest clip kept, seconds (played, a skip left out). */
export const CLIP_MIN = 18;
export const CLIP_MAX = 120;
/** Words a clip never opens on: trimmed from the head of its first sentence. */
const LEAD_INS = new Set(["so", "yeah", "and", "but", "like", "um", "umm", "uh", "uhh", "er", "erm", "ah", "okay", "ok", "well", "oh"]);
/** Words that point back to something said before: the clip takes in the sentence before, or skips this one. */
const BACK_REFS = new Set(["that", "it"]);
const bare = (w: string) => w.toLowerCase().replace(/[^a-z']/g, "").split("'")[0];

/** Word-index ranges of the sentences: a break after . ! ? or before a pause over a second (as the editor's sentencesOf). */
export function sentenceSpans(words: Word[]): [number, number][] {
  const out: [number, number][] = [];
  let from = 0;
  for (let i = 0; i < words.length; i++) {
    const last = i === words.length - 1;
    if (last || /[.!?]["')\]]?$/.test(words[i].w) || words[i + 1].s - words[i].e > 1) {
      out.push([from, i]);
      from = i + 1;
    }
  }
  return out;
}

/**
 * A clip on whole sentences, opening on a strong word: an opener that points back
 * ("That's why") takes in the sentence before, or starts a sentence later; an
 * answer starts on its question; a question at the end is dropped (it opens the
 * next topic); leading "so", "and", "um" and the like are cut. Then 0.2-0.35 s of
 * the pause before the first word and up to 0.45 s after the last, never into a
 * neighbouring word. Every step keeps the clip CLIP_MIN to CLIP_MAX long, or is skipped.
 * The lead and trail numbers are OpenShorts' (snap_clip_to_words).
 */
export function cleanEdges<T extends Span & { skip?: Span }>(clip: T, words: Word[], duration: number): T {
  const spans = sentenceSpans(words);
  let a = spans.findIndex(([, j]) => words[j].e > clip.start + 0.05);
  let b = -1;
  spans.forEach(([i], k) => { if (words[i].s < clip.end - 0.05) b = k; });
  if (a < 0 || b < a) return clip;
  const head = (k: number) => words[spans[k][0]].s;
  const tail = (k: number) => words[spans[k][1]].e;
  // the tangent left out, on the whole sentences it touches, with at least one kept on each side; otherwise none
  let sk: [number, number] | null = null;
  if (clip.skip) {
    const x = spans.findIndex(([, j]) => words[j].e > clip.skip!.start + 0.05);
    let y = -1;
    spans.forEach(([i], k) => { if (words[i].s < clip.skip!.end - 0.05) y = k; });
    if (x > a && y >= x && y < b) sk = [x, y];
  }
  const skipped = sk ? tail(sk[1]) - head(sk[0]) : 0;
  const fits = (x: number, y: number, from = head(x)) => tail(y) - from - skipped >= CLIP_MIN && tail(y) - from - skipped <= CLIP_MAX;
  // moving an edge inward never reaches the tangent
  const clearOf = (x: number, y: number) => !sk || (x < sk[0] && y > sk[1]);
  const asks = (k: number) => /\?["')\]]?$/.test(words[spans[k][1]].w);
  // ponytail: a word list cannot tell "So many people" from "So, many people"; a Jev opener check is the upgrade
  const firstStrong = (k: number) => {
    let i = spans[k][0];
    while (i < spans[k][1] && LEAD_INS.has(bare(words[i].w))) i++;
    return i;
  };
  const only = (k: number) => words.slice(spans[k][0], spans[k][1] + 1).every((w) => LEAD_INS.has(bare(w.w)));
  if (!fits(a, b)) return clip;
  // a sentence that is only "Okay, so." or "Yeah." is no start and no end
  while (a < b && only(a) && fits(a + 1, b) && clearOf(a + 1, b)) a++;
  while (b > a && only(b) && fits(a, b - 1) && clearOf(a, b - 1)) b--;
  if (BACK_REFS.has(bare(words[firstStrong(a)].w))) {
    if (a > 0 && fits(a - 1, b)) a--;
    else if (a < b && fits(a + 1, b) && clearOf(a + 1, b)) a++;
  }
  if (a > 0 && asks(a - 1) && !asks(a) && fits(a - 1, b)) a--;
  while (b > a && asks(b) && fits(a, b - 1) && clearOf(a, b - 1)) b--;
  let first = firstStrong(a);
  if (!fits(a, b, words[first].s)) first = spans[a][0];
  const last = spans[b][1];
  const before = first > 0 ? words[first].s - words[first - 1].e : words[first].s;
  const after = last + 1 < words.length ? words[last + 1].s - words[last].e : duration - words[last].e;
  const lead = Math.max(0, Math.min(0.35, before, Math.max(0.2, before / 2)));
  const trail = Math.max(0, Math.min(0.45, after / 2));
  const r = (t: number) => Math.round(t * 1000) / 1000;
  const { skip: _, ...rest } = clip;
  return {
    ...rest,
    start: r(Math.max(0, words[first].s - lead)),
    end: r(Math.min(duration, words[last].e + trail)),
    ...(sk ? { skip: { start: r(head(sk[0])), end: r(tail(sk[1])) } } : {}),
  } as T;
}

/**
 * A skip stays only when Jev reads the clip as whole without it (p from SKIP_OK);
 * without an answer, no skip (the clip plays straight through, as before skips).
 * Then only clips that play 18 to 120 s are kept.
 */
export function applySkips(cands: FoundClip[], answers: Record<string, JevAnswer> | null): FoundClip[] {
  return cands
    .map((c, i) => {
      if (!c.skip) return c;
      const p = noulOf(answers, `k${i}`);
      if (p !== null && p >= SKIP_OK) return c;
      const { skip: _, ...whole } = c;
      return whole;
    })
    .filter(playable);
}

/** One Noul per clip that skips: k<i>, was what it leaves out only an aside. */
export function skipQuestions(cands: FoundClip[], sentences: ClipSentence[], words: Word[] = []): Record<string, JevQuestion> {
  const q: Record<string, JevQuestion> = {};
  cands.forEach((c, i) => {
    if (!c.skip) return;
    const said = clipText(sentences, c, words).join(" ");
    const skipped = clipText(sentences, { start: c.skip.start, end: c.skip.end }, words).join(" ");
    if (!said || !skipped) return;
    q[`k${i}`] = {
      type: "noul",
      instructions: {
        clip: said.slice(0, 2000),
        skipped: skipped.slice(0, 1500),
        question: "`skipped` was cut out of the middle of a short video, leaving `clip`. Was `skipped` only an aside, a detour or a repeat, so that `clip` loses no step of its point and reads as if nothing was cut?",
      },
      criteria: {
        true: "`skipped` adds nothing the point needs, and the sentences either side of the cut join naturally.",
        false: "`skipped` holds a step, example or reason the point uses, or the join across the cut is abrupt.",
      },
    };
  });
  return q;
}

/** Who Jev imagines watching. */
export const CLIP_VIEWER = "Singapore working adults scrolling Instagram Reels, TikTok or YouTube Shorts";

const STANDS_ALONE = [
  "Needs the rest of the talk: starts mid-thought, leans on something said before it, or stops before its point",
  "Mostly follows, but a reference or the ending is unclear without the rest",
  "Makes sense alone and makes a point, with a slow start or a loose ending",
  "Fully self-contained: a clear setup, one point, a complete ending",
];
const MATCHES = ["A different topic", "Touches the topic in passing", "On the topic, though not exactly what was asked", "Exactly the part asked for"];
// The levels of Leo's podcast-clips skill (pick.py hooks, "stop").
const STOPS_SCROLL = [
  "Swipe past: generic, bland or unclear",
  "Might pause for a second, weak pull",
  "Likely to stop: curiosity or relevance to their life",
  "Stops instantly: hits a fear, desire or curiosity gap they feel right now",
];

/**
 * Two Scores per candidate: s<i>, does it stand alone; h<i>, does its first line
 * stop the scroll. With a request, a third, r<i>: how well it matches what was asked. State: {viewer}.
 */
export function clipQuestions(cands: FoundClip[], sentences: ClipSentence[], words: Word[] = [], about = ""): Record<string, JevQuestion> {
  const q: Record<string, JevQuestion> = {};
  cands.forEach((c, i) => {
    const said = clipText(sentences, c, words);
    if (!said.length) return;
    q[`s${i}`] = {
      type: "score",
      instructions: {
        clip: said.join(" ").slice(0, 2000),
        question: "`clip` is cut from a longer talk by a Singapore financial adviser and posted on its own as a short video. How well does it stand alone for a viewer who has seen nothing else of the talk?",
      },
      criteria: STANDS_ALONE,
    };
    q[`h${i}`] = {
      type: "score",
      instructions: {
        first_line: said[0].slice(0, 300),
        question: "`viewer` hears `first_line` as the very first words of a short video in their feed. How likely are they to stop scrolling and keep watching?",
      },
      criteria: STOPS_SCROLL,
    };
    if (about) {
      q[`r${i}`] = {
        type: "score",
        instructions: {
          clip: said.join(" ").slice(0, 2000),
          request: about,
          question: "Someone typed `request` to find a part of a longer talk. How well does `clip` match what they are looking for?",
        },
        criteria: MATCHES,
      };
    }
  });
  return q;
}

/**
 * A clip is on topic from this match level up (0-3). Read off 14 real podcast
 * clips against 6 typed requests (jev-1.13.0, 2026-10-09): the clips about the
 * request 1.54-3.00 ("why schools don't teach financial literacy" 1.60 on a clip
 * saying schools don't teach it), clips merely near it 1.14-1.38, the rest under 0.6.
 * A yes/no question asked first read that same clip 0.36, too strict for loose wording.
 */
export const ON_TOPIC = 1.5;

/**
 * Past the first `min` clips, a clip is kept only from this score. Read off 16
 * real windows of a 33-minute adviser podcast (jev-1.13.0, 2026-10-09): the
 * window Leo's podcast-clips skill rated best scored 66; ones that open on "So,"
 * or "That's why" or need the earlier answer scored 20 to 30.
 */
export const KEEP_SCORE = 40;

/** A quarter of the shorter clip shared with a better one drops it (OpenShorts' dedupe_overlapping ratio). */
const OVERLAP = 0.25;
/** Topping up to the floor, only half of the shorter shared is the same moment (AutoClip's DUPLICATE_OVERLAP). */
const SAME_MOMENT = 0.5;
const clash = (x: FoundClip, kept: FoundClip[], ratio = OVERLAP) =>
  kept.some((k) => Math.min(x.end, k.end) - Math.max(x.start, k.start) > ratio * Math.min(x.end - x.start, k.end - k.start));

/**
 * Jev's order, best first, with each score out of 100 (stands alone 60%, first
 * line 40%): at least `min` clips, more up to `max` while they score KEEP_SCORE.
 * When overlaps leave fewer than `min`, the best of the rest top it up unless
 * they share half of a kept clip.
 * With a request, the clips about it come first and are all kept (up to `max`).
 * Without any answer, the LLM's own order and no scores. A clip that mostly
 * repeats a better one (their cleaned edges can meet) is dropped.
 */
export function rankClips(cands: FoundClip[], answers: Record<string, JevAnswer> | null, count: { min: number; max: number }, about = ""): FoundClip[] {
  const scored = cands.map((c, i): FoundClip => {
    const s = scoreOf(answers, `s${i}`);
    const h = scoreOf(answers, `h${i}`);
    if (s === null || h === null) return c;
    const r = about ? scoreOf(answers, `r${i}`) : null;
    return { ...c, score: Math.max(0, Math.min(100, Math.round((100 * (0.6 * s + 0.4 * h)) / 3))), ...(r === null ? {} : { onTopic: r >= ON_TOPIC }) };
  });
  const jev = scored.some((c) => c.score !== undefined);
  const rank = (c: FoundClip) => (c.onTopic ? 1000 : 0) + (c.score ?? -1);
  const order = jev ? scored.map((c, i) => ({ c, i })).sort((a, b) => rank(b.c) - rank(a.c) || a.i - b.i).map((x) => x.c) : cands;
  const kept: FoundClip[] = [];
  for (const c of order) {
    if (kept.length === count.max) break;
    if (clash(c, kept)) continue;
    if (jev && kept.length >= count.min && !c.onTopic && (c.score ?? 0) < KEEP_SCORE) break;
    kept.push(c);
  }
  // the floor holds: short of `min`, the best of the rest come back unless they are the same moment as a kept clip
  for (const c of order) {
    if (kept.length >= Math.min(count.min, count.max)) break;
    if (!kept.includes(c) && !clash(c, kept, SAME_MOMENT)) kept.push(c);
  }
  return order.filter((c) => kept.includes(c));
}

/** How many clips the LLM's reply proposed, before any check (for the log). */
export function proposedCount(content: string | null): number {
  try {
    const list = (JSON.parse(content ?? "") as { clips?: unknown })?.clips;
    return Array.isArray(list) ? list.length : 0;
  } catch {
    return 0;
  }
}

// ---------- callouts and cutaways for a filmed talking head ----------

export interface Cutaway {
  /** Where the section starts and ends on the edited timeline, seconds. */
  at: number;
  until: number;
  /** On-screen text for the section. */
  callout: string;
  /** What to cut away to or put up while they talk. */
  show: string;
}
/** About 6k tokens of transcript, a cent or two a call. */
export const MAX_CUTAWAY_CHARS = 24_000;

/** Well-formed timed sentences, up to about 6k tokens of text, and the video length. */
function timedSentences(body: unknown): { sentences: ClipSentence[]; duration: number } {
  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  let chars = 0;
  const sentences = (Array.isArray(b.sentences) ? b.sentences : [])
    .slice(0, MAX_SENTENCES)
    .map((x) => (x && typeof x === "object" ? (x as Record<string, unknown>) : {}))
    .map((x) => ({ s: Number(x.s), e: Number(x.e), text: String(x.text ?? "").slice(0, 400) }))
    .filter((x) => Number.isFinite(x.s) && Number.isFinite(x.e) && x.e > x.s && x.text)
    .filter((x) => (chars += x.text.length) <= MAX_CUTAWAY_CHARS);
  return { sentences, duration: Number(b.duration) };
}

export function parseCutawaysRequest(body: unknown): { ok: true; sentences: ClipSentence[]; duration: number } | { ok: false; error: string } {
  const { sentences, duration } = timedSentences(body);
  if (!Number.isFinite(duration) || duration < 5) return { ok: false, error: "The video is too short for callouts." };
  if (sentences.length < 2) return { ok: false, error: "Caption the video first, then ask for callouts." };
  return { ok: true, sentences, duration };
}

export function buildCutawaysMessages(sentences: ClipSentence[], duration: number): { role: string; content: string }[] {
  const lines = sentences.map((x) => `[${x.s.toFixed(1)}-${x.e.toFixed(1)}] ${x.text}`).join("\n");
  return [
    {
      role: "system",
      content: [
        "You plan the on-screen extras for a talking-head video a Singapore financial adviser filmed: text callouts and what to cut away to.",
        "Split the video into sections where the topic or the point changes: 2 to 8 sections, none starting in the first 3 seconds (the hook card is there).",
        "For each section:",
        "- at: the start time of the sentence where the section begins; until: the end time of its last sentence. Sections never overlap.",
        "- callout: on-screen text of 2 to 6 words that lands the point: a number, a term or the takeaway, in sentence case. Only facts and figures the speaker says; never invent a number.",
        "- show: one short line on what to cut away to or put on screen while they talk, that a solo adviser can film or find: a B-roll shot, a screen recording, a simple chart, a document or a prop.",
        "Never promise returns or guarantees. No em dashes. Plain words.",
        'Reply with JSON only: {"sections":[{"at":number,"until":number,"callout":string,"show":string}]}',
      ].join("\n"),
    },
    { role: "user", content: `Video length: ${duration.toFixed(1)}s\nTranscript with sentence times in seconds:\n${lines}` },
  ];
}

/** Sections inside the video, in time order, without overlaps, at most 8; text trimmed to fit a sticker. */
export function parseCutawaysReply(content: string | null, duration: number): Cutaway[] | null {
  if (!content) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    return null;
  }
  const list = Array.isArray((raw as { sections?: unknown })?.sections) ? (raw as { sections: unknown[] }).sections : [];
  const clean = (v: unknown, n: number) => String(v ?? "").replace(/\s*\u2014\s*/g, ", ").replace(/\s+/g, " ").trim().slice(0, n);
  const out: Cutaway[] = [];
  for (const c of list) {
    const o = c && typeof c === "object" ? (c as Record<string, unknown>) : {};
    const at = Math.max(0, Number(o.at));
    const until = Math.min(duration, Number(o.until));
    const callout = clean(o.callout, 60);
    if (!Number.isFinite(at) || !Number.isFinite(until) || until <= at || !callout) continue;
    // "show" sits under a "Show:" label, so a reply that repeats the word loses it
    const show = clean(o.show, 160).replace(/^show:?\s+/i, "");
    out.push({ at, until, callout, show: show.charAt(0).toUpperCase() + show.slice(1) });
  }
  out.sort((a, b) => a.at - b.at);
  const kept: Cutaway[] = [];
  for (const c of out) if (!kept.length || c.at >= kept[kept.length - 1].until - 0.05) kept.push(c);
  return kept.slice(0, 8);
}

// ---------- a title and a cover idea for a finished video ----------

/** Jev answers a Choice of up to 255 options; each line of the video is one. */
export const MAX_COVER_LINES = 255;

export function parsePublishRequest(body: unknown): { ok: true; sentences: ClipSentence[]; duration: number } | { ok: false; error: string } {
  const { sentences, duration } = timedSentences(body);
  if (!Number.isFinite(duration) || duration < 3) return { ok: false, error: "The video is too short for a title." };
  if (!sentences.length) return { ok: false, error: "Caption the video first." };
  return { ok: true, sentences: sentences.slice(0, MAX_COVER_LINES), duration };
}

export function buildPublishMessages(sentences: ClipSentence[], duration: number): { role: string; content: string }[] {
  return [
    {
      role: "system",
      content: [
        "You write the words that go out with a short video a Singapore financial adviser filmed, from what they say in it.",
        "- titles: 3 titles of 3 to 8 words for the post's title field on YouTube Shorts, TikTok or LinkedIn, in sentence case, each from a different angle: the main point, the question a viewer has, a number or fact the speaker says.",
        "- cover: the text set large on the cover picture, 2 to 6 words, the line that makes someone tap. Use the speaker's own words or their plain meaning.",
        "Only facts and figures the speaker says; never invent a number. Never promise returns or guarantees. No em dashes, hashtags, emoji or quote marks.",
        'Reply with JSON only: {"titles":[string,string,string],"cover":string}',
      ].join("\n"),
    },
    { role: "user", content: `Video length: ${duration.toFixed(1)}s\nWhat they say:\n${sentences.map((x) => x.text).join(" ")}` },
  ];
}

const plainLine = (v: unknown, n: number) =>
  String(v ?? "").replace(/\s*\u2014\s*/g, ", ").replace(/#\w+/g, "").replace(/^["'\u201c\u2018\s]+|["'\u201d\u2019\s]+$/g, "").replace(/\s+/g, " ").trim().slice(0, n);

/** Up to 3 distinct titles and the cover line, or null when either is missing. */
export function parsePublishReply(content: string | null): { titles: string[]; cover: string } | null {
  if (!content) return null;
  let raw: { titles?: unknown; cover?: unknown };
  try {
    raw = JSON.parse(content);
  } catch {
    return null;
  }
  const titles: string[] = [];
  for (const t of Array.isArray(raw?.titles) ? raw.titles : []) {
    const clean = plainLine(t, 80);
    if (clean && !titles.some((x) => x.toLowerCase() === clean.toLowerCase())) titles.push(clean);
    if (titles.length === 3) break;
  }
  const cover = plainLine(raw?.cover, 60);
  return titles.length && cover ? { titles, cover } : null;
}

/** What Jev reads to find the cover moment: every line tagged with an id it can point to. */
export function coverState(sentences: ClipSentence[], cover: string) {
  return { cover_text: cover, transcript: sentences.map((x, i) => `L${i}| ${x.text}`).join("\n") };
}

export function coverQuestion(sentences: ClipSentence[]): JevQuestion {
  return {
    type: "choice",
    instructions: "In which line of `transcript` does the speaker say the point that `cover_text` puts on the cover?",
    criteria: Object.fromEntries(sentences.map((_, i) => [`L${i}`, null])),
  };
}

/** The middle of the line Jev picked, on the edited timeline, or null without a usable pick. */
export function coverAt(answers: Record<string, JevAnswer> | null, sentences: ClipSentence[]): number | null {
  const pick = choiceOf(answers, "cover_at", sentences.map((_, i) => `L${i}`));
  if (!pick) return null;
  const x = sentences[Number(pick.slice(1))];
  return Math.round(((x.s + x.e) / 2) * 10) / 10;
}

// ---------- bilingual captions ----------

export const TRANSLATE_LANGS: Record<string, string> = { zh: "Simplified Chinese", ms: "Malay", ta: "Tamil" };
export const MAX_TRANSLATE_LINES = 400;

export function parseTranslateRequest(body: unknown): { ok: true; lang: string; lines: string[] } | { ok: false; error: string } {
  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const lang = String(b.lang ?? "");
  if (!(lang in TRANSLATE_LANGS)) return { ok: false, error: "Pick Chinese, Malay or Tamil." };
  const lines = (Array.isArray(b.lines) ? b.lines : []).slice(0, MAX_TRANSLATE_LINES).map((l) => String(l ?? "").slice(0, 300));
  if (!lines.length) return { ok: false, error: "Caption the video first." };
  return { ok: true, lang, lines };
}

export function buildTranslateMessages(lang: string, lines: string[]): { role: string; content: string }[] {
  return [
    {
      role: "system",
      content: [
        `Translate short video captions spoken by a Singapore financial adviser into ${TRANSLATE_LANGS[lang]} as subtitles.`,
        "Keep each line short and natural for on-screen subtitles, keep numbers and dollar amounts exact, keep CPF, MediShield, HDB and other Singapore terms as locals write them.",
        'Return JSON only: {"lines":[...]} with exactly one translation per input line, in the same order.',
      ].join("\n"),
    },
    { role: "user", content: JSON.stringify({ lines }) },
  ];
}

/** Exactly one translation per line, or null (a short or long array is unusable). */
export function parseTranslateReply(content: string | null, n: number): string[] | null {
  if (!content) return null;
  try {
    const out = JSON.parse(content)?.lines;
    if (!Array.isArray(out) || out.length !== n) return null;
    return out.map((l: unknown) => String(l ?? "").replace(/—/g, ",").slice(0, 300));
  } catch {
    return null;
  }
}
