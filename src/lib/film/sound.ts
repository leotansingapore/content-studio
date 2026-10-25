// The film's soundtrack: one of huashu's built-in music directions laid on the film's own scenes (a
// section per scene, the drop on its scene), an effect on each event, levelled as huashu does: music
// at -18 LUFS alone or 12 LU under the voice and ducked under its spans, the master at -14 LUFS.
// Pure; sound.worker.ts runs it off the main thread and the tests import it directly.
import { mixdown } from "./synth/sound.ts";
import { PRODUCTS } from "./synth/score.ts";
import { bpmOf, filmEvents, filmLength, sceneSpans, countBeats, beatSeconds, type Film } from "./timeline.ts";

export const SOUND_RATE = 48000;
export interface VoiceSpan {
  start: number;
  end: number;
}
export interface SoundOptions {
  /** Seeds the key, loop and motif, so two brands' films rarely sound alike. */
  brand?: string;
  /** When the voice speaks; the music ducks under these. */
  voice?: VoiceSpan[];
  /** The voice's integrated loudness, when there is one: the bed sits 12 LU under it. */
  voiceLufs?: number;
}
export interface FilmSound {
  L: Float32Array;
  R: Float32Array;
  lufs: number;
  peak: number;
  /** huashu's style name, such as pulse or lofi. */
  style: string;
}
export interface Hit {
  name: string;
  at: number;
  dur?: number;
  gain?: number;
}

/** The product type the music is made for; unknown is devtool, the spec's fallback. */
export const productOf = (film: Pick<Film, "product">) => (Object.prototype.hasOwnProperty.call(PRODUCTS, film.product) ? film.product : "devtool");

/** The effects, by event: pop on a word, whoosh on a camera move, tick on a tap, thud on a card, the count under a number, a hit on each montage cut, impact and subdrop on the drop, chime on the logo. */
export function filmHits(film: Film): Hit[] {
  const b = beatSeconds(film);
  const hits: Hit[] = [];
  const scenes = new Map(film.scenes.map((s) => [s.id, s]));
  for (const e of filmEvents(film)) {
    if (e.kind === "word") hits.push({ name: "pop", at: e.t, gain: 0.8 });
    else if (e.kind === "camera") hits.push({ name: "whoosh", at: e.t, gain: 0.7 });
    else if (e.kind === "tap") hits.push({ name: "tick", at: e.t });
    else if (e.kind === "card") hits.push({ name: "thud", at: e.t, gain: 0.8 });
    else if (e.kind === "count") hits.push({ name: "count", at: e.t, dur: countBeats(scenes.get(e.scene)!) * b, gain: 0.7 });
    else if (e.kind === "shot") hits.push({ name: "hit", at: e.t, gain: 0.7 });
    else if (e.kind === "drop" && e.t > 0) hits.push({ name: "impact", at: e.t }, { name: "subdrop", at: e.t, gain: 0.8 });
    else if (e.kind === "logo") hits.push({ name: "chime", at: e.t });
  }
  return hits;
}

/** What huashu's mixdown reads from a composition, built from the spec. */
export function soundProbe(film: Film, opts: SoundOptions = {}) {
  const spans = sceneSpans(film);
  const drop = spans.find((s) => s.scene.id === film.drop && s.start > 0);
  return {
    id: "launch-film",
    duration: filmLength(film),
    labels: Object.fromEntries(spans.map((s) => [`scene:${s.scene.id}`, s.start])),
    hits: filmHits(film),
    music: { product: productOf(film), variant: Number(film.style) || 0, bpm: bpmOf(film), ...(drop ? { drop: drop.scene.id } : {}), ...(opts.brand ? { brand: opts.brand } : {}) },
  };
}

/** The soundtrack, stereo at 48 kHz. The same film and options give the same samples. */
export function renderFilmSound(film: Film, opts: SoundOptions = {}): FilmSound {
  const voice = opts.voice ?? [];
  const { out2, finalLufs, peak, p } = mixdown(soundProbe(film, opts), { voiced: voice.length > 0, words: voice, voiceLufs: opts.voiceLufs ?? null });
  return { L: out2.L, R: out2.R, lufs: finalLufs, peak, style: p.style };
}

/** A hash of what the sound depends on: the timing, the music and the voice spans, never the words on screen. */
export function soundKey(film: Film, opts: SoundOptions = {}): string {
  const probe = soundProbe(film, opts);
  const text = JSON.stringify([probe.duration, probe.labels, probe.hits, probe.music, opts.voice ?? [], opts.voiceLufs ?? null]);
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619) >>> 0;
  return `s${h.toString(36)}`;
}
