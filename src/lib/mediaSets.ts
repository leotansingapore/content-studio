// Media sets (brand-media-sets, Leo only): a set is a Media folder with a kind, photos or clips, that slideshows and
// videos draw from. Its files are the Media items whose `folder` is the set's name (one set per file), so opening a
// set is /media?folder=<name>. The records stay on this device, as the files do:
//   key: cs-media-sets-${scoped(userId)}   [{ name (40), kind, starter?, createdAt }]
// "AI images" is never a set and no set ever moves a file out of it: that folder is what marks a picture as made by AI
// (/library and the line on /image read it).
// Starter sets are added outside React (addStarter), so leaving the page keeps them going: free Pexels files through
// stock-media, kept like uploads with their credit and typed "footage", so none of them waits for a paid sort.

import { STARTER_SETS, type StarterSet } from "@/data/starterSets";
import { AI_FOLDER } from "@/lib/aiImage";
import { deleteFile, putFile } from "@/lib/deviceFiles";
import { addMedia, loadMedia, MAX_MEDIA, mediaRoom, storePicture, updateMedia, type MediaItem } from "@/lib/mediaLibrary";
import { scoped } from "@/lib/profiles";
import { downloadStock, searchStock, type StockItem } from "@/lib/stockMedia";

export type SetKind = "photos" | "clips";
export interface MediaSet {
  name: string;
  kind: SetKind;
  /** The starter set's id it came from. */
  starter?: string;
  createdAt: string;
}
export type SetWith = MediaSet & { count: number; cover?: MediaItem; undescribed: number };

export const MAX_SET_NAME = 40;
/** Fewer than this and a set stays out of the build pickers. */
export const MIN_SET_ITEMS = 3;
const PREFIX = "cs-media-sets-";
export const SETS_CHANGED = "content-studio-media-sets-changed";
// the same line as mediaUpload's FULL_LINE, kept here so the carousel picker never loads the upload code
const FULL = `Media holds ${MAX_MEDIA} files. Remove some to add more.`;

const store = (): Storage | null => {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
};
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
/** A file a set of this kind holds: a clip set its videos, a photo set everything else. */
export const ofKind = (m: MediaItem, kind: SetKind) => (kind === "clips") === (m.kind === "video");

export function loadSets(userId: string | null | undefined): MediaSet[] {
  const s = store();
  if (!s || !userId) return [];
  try {
    const raw = JSON.parse(s.getItem(PREFIX + scoped(userId)) ?? "[]");
    if (!Array.isArray(raw)) return [];
    const seen = new Set<string>();
    return raw.flatMap((r): MediaSet[] => {
      const name = typeof r?.name === "string" ? r.name.trim().slice(0, MAX_SET_NAME) : "";
      if (!name || same(name, AI_FOLDER) || seen.has(name.toLowerCase()) || (r.kind !== "photos" && r.kind !== "clips")) return [];
      seen.add(name.toLowerCase());
      return [{ name, kind: r.kind, ...(typeof r.starter === "string" && r.starter ? { starter: r.starter.slice(0, 40) } : {}), createdAt: String(r.createdAt ?? "") }];
    });
  } catch {
    return [];
  }
}

/** False when this device's storage is full (the sets on screen stay for this visit). */
export function saveSets(userId: string, sets: MediaSet[]): boolean {
  try {
    store()?.setItem(PREFIX + scoped(userId), JSON.stringify(sets));
  } catch {
    return false;
  }
  try {
    window.dispatchEvent(new Event(SETS_CHANGED));
  } catch {
    // no window (tests)
  }
  return true;
}

/** Why `name` can't be a new set (or the new name of `from`), or null. */
export function nameLine(userId: string, name: string, from?: string): string | null {
  const n = name.trim();
  if (!n) return "Give the set a name.";
  if (n.length > MAX_SET_NAME) return `Keep the name under ${MAX_SET_NAME + 1} characters.`;
  if (same(n, AI_FOLDER)) return "AI images keeps your AI pictures. Pick another name.";
  if (from !== undefined && same(n, from)) return null;
  if (loadSets(userId).some((s) => same(s.name, n))) return `You already have a set called ${n}.`;
  // a set over a folder that already exists takes in its files; a rename onto one would merge two folders
  if (from !== undefined && loadMedia(userId, { videos: true }).some((m) => same(m.folder, n))) return `A folder called ${n} already exists.`;
  return null;
}

export function makeSet(userId: string, name: string, kind: SetKind, starter?: string): { ok: true; set: MediaSet } | { ok: false; line: string } {
  const line = nameLine(userId, name);
  if (line) return { ok: false, line };
  const set: MediaSet = { name: name.trim(), kind, ...(starter ? { starter } : {}), createdAt: new Date().toISOString() };
  return saveSets(userId, [set, ...loadSets(userId)]) ? { ok: true, set } : { ok: false, line: "This device is out of space. Remove some media and try again." };
}

/** Each set with how many files of its kind it holds, its newest one as the cover, and how many have no alt text. */
export function setsWith(sets: MediaSet[], items: MediaItem[]): SetWith[] {
  return sets.map((s) => {
    const mine = items.filter((m) => m.folder === s.name && ofKind(m, s.kind));
    const cover = mine.reduce<MediaItem | undefined>((a, m) => (!a || m.addedAt > a.addedAt ? m : a), undefined);
    return { ...s, count: mine.length, undescribed: mine.filter((m) => !m.alt.trim()).length, ...(cover ? { cover } : {}) };
  });
}

/** The sets of `kind` a build can draw from: 3 files or more. */
export const usableSets = (userId: string, kind: SetKind): SetWith[] =>
  setsWith(loadSets(userId).filter((s) => s.kind === kind), loadMedia(userId, { videos: true })).filter((s) => s.count >= MIN_SET_ITEMS);

/** The files "Add from your library" offers a set: its kind, not in it already, never an AI picture. */
export const addable = (items: MediaItem[], set: Pick<MediaSet, "name" | "kind">): MediaItem[] =>
  items.filter((m) => ofKind(m, set.kind) && m.folder !== set.name && !same(m.folder, AI_FOLDER));

/** Moves the files into the set (a file sits in one set at a time); an AI picture is never moved. Returns how many moved. */
export function addToSet(userId: string, name: string, keys: string[]): number {
  const set = loadSets(userId).find((s) => s.name === name);
  if (!set) return 0;
  const ok = new Set(addable(loadMedia(userId, { videos: true }), set).map((m) => m.key));
  const move = keys.filter((k) => ok.has(k));
  for (const k of move) updateMedia(userId, k, { folder: name });
  return move.length;
}

export function renameSet(userId: string, from: string, to: string): { ok: true } | { ok: false; line: string } {
  const line = nameLine(userId, to, from);
  if (line) return { ok: false, line };
  const name = to.trim();
  if (name === from) return { ok: true };
  if (!saveSets(userId, loadSets(userId).map((s) => (s.name === from ? { ...s, name } : s)))) return { ok: false, line: "This device is out of space. Remove some media and try again." };
  for (const m of loadMedia(userId, { videos: true })) if (m.folder === from) updateMedia(userId, m.key, { folder: name });
  return { ok: true };
}

export interface RemovedSet {
  set: MediaSet;
  keys: string[];
}

/** Deletes the set's record and takes its folder off its files; the files stay in Media. Keep the answer for Undo. */
export function removeSet(userId: string, name: string): RemovedSet | null {
  const sets = loadSets(userId);
  const set = sets.find((s) => s.name === name);
  if (!set) return null;
  saveSets(userId, sets.filter((s) => s !== set));
  const keys = loadMedia(userId, { videos: true }).filter((m) => m.folder === name).map((m) => m.key);
  for (const k of keys) updateMedia(userId, k, { folder: "" });
  return { set, keys };
}

/** Undo: the set back, with every file that has not been put in another folder since. */
export function restoreSet(userId: string, r: RemovedSet): void {
  if (!loadSets(userId).some((s) => same(s.name, r.set.name))) saveSets(userId, [r.set, ...loadSets(userId)]);
  const keys = new Set(r.keys);
  for (const m of loadMedia(userId, { videos: true })) if (keys.has(m.key) && !m.folder) updateMedia(userId, m.key, { folder: r.set.name });
}

/**
 * Up to `per` candidates for each of `scenes` scenes from a set: all of them, in set order, when they fit; a bigger
 * set is rotated so every file is offered at least once (when scenes x per covers it).
 */
export function rotateCandidates<T>(items: T[], scenes: number, per = 12): T[][] {
  const n = items.length;
  return Array.from({ length: scenes }, (_, i) => {
    if (n <= per) return [...items];
    const from = (i * per) % n;
    return Array.from({ length: per }, (_, j) => items[(from + j) % n]);
  });
}

// ---------- starter sets ----------

const shares = (count: number, n: number) => Array.from({ length: n }, (_, i) => Math.floor(count / n) + (i < count % n ? 1 : 0));
const linkOf = (it: StockItem) => it.url || `pexels:${it.id}`;

/**
 * The files a starter set takes from its searches: an even share from each query, skipping anything already in Media
 * (by its Pexels page) or already taken, a short query's gap topped up from the next, then from any query, up to `count`.
 */
export function pickStarter(results: StockItem[][], count: number, have: ReadonlySet<string>): { item: StockItem; query: number }[] {
  const taken = new Set<string>();
  const out: { item: StockItem; query: number }[] = [];
  const take = (q: number, want: number) => {
    let got = 0;
    for (const it of results[q] ?? []) {
      if (got >= want || out.length >= count) break;
      const link = linkOf(it);
      if (have.has(link) || taken.has(link)) continue;
      taken.add(link);
      out.push({ item: it, query: q });
      got++;
    }
    return got;
  };
  let carry = 0;
  shares(count, results.length).forEach((want, q) => (carry = want + carry - take(q, want + carry)));
  for (let q = 0; q < results.length && out.length < count; q++) take(q, count - out.length);
  return out;
}

export interface StarterJob {
  id: string;
  /** The file being added, of how many. */
  n: number;
  of: number;
  done: boolean;
  /** The finished line ("<set> added. 12 photos, credits kept."), or why it stopped. */
  line: string | null;
}

let jobs: Record<string, StarterJob> = {};
const runs = new Map<string, Promise<StarterJob>>();
const listeners = new Set<() => void>();
const put = (job: StarterJob) => {
  jobs = { ...jobs, [job.id]: job };
  listeners.forEach((f) => f());
  return job;
};
/** For useSyncExternalStore: the same object until a job moves. */
export const starterJobs = (): Readonly<Record<string, StarterJob>> => jobs;
export function onStarterChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

/** The set a starter made, or one of the same name: its button then says "Added". */
export const starterAdded = (sets: MediaSet[], s: Pick<StarterSet, "id" | "name">) => sets.some((x) => x.starter === s.id || same(x.name, s.name));

const credit = (it: StockItem) => ({ by: it.by, byUrl: it.byUrl, url: it.url });

/** Keeps one stock file in the set's folder like an upload; throws when it didn't download or wasn't kept. */
async function keepStock(userId: string, s: StarterSet, it: StockItem, query: string, describe: (it: StockItem) => string): Promise<void> {
  const addedAt = new Date().toISOString();
  let keys: string[];
  let item: MediaItem;
  if (s.kind === "photos") {
    const pic = await storePicture(await downloadStock(it.src));
    keys = [pic.key];
    item = { key: pic.key, name: (it.alt || query).replace(/\.$/, "").slice(0, 80), folder: s.name, alt: it.alt, width: pic.width, height: pic.height, addedAt, credit: credit(it), kind: "photo", type: "footage" };
  } else {
    const [video, still] = await Promise.all([downloadStock(it.src), downloadStock(it.thumb)]);
    // the still sits under the cimg- key of the video's id, as an upload's does
    const pic = await storePicture(still, 240);
    const key = `cvid-${pic.key.slice(5)}`;
    keys = [pic.key, key];
    try {
      await putFile(key, video);
    } catch (e) {
      await deleteFile(pic.key).catch(() => undefined);
      throw e;
    }
    const alt = describe(it);
    item = { key, name: (alt || query).slice(0, 80), folder: s.name, alt, width: it.w, height: it.h, addedAt, credit: credit(it), kind: "video", type: "footage", bytes: video.size, ...(it.duration ? { seconds: Math.round(it.duration * 100) / 100 } : {}) };
  }
  addMedia(userId, item);
  if (!loadMedia(userId, { videos: true }).some((m) => m.key === item.key)) {
    await Promise.all(keys.map((k) => deleteFile(k).catch(() => undefined)));
    throw new Error(FULL);
  }
}

async function run(userId: string, s: StarterSet, onProgress?: (n: number, of: number) => void): Promise<StarterJob> {
  const job = put({ id: s.id, n: 0, of: s.count, done: false, line: null });
  const finish = (line: string) => put({ ...jobs[s.id], done: true, line });
  if (!mediaRoom(userId)) return finish(FULL);
  const results: StockItem[][] = [];
  try {
    for (const q of s.queries) results.push((await searchStock(s.kind === "photos" ? "photo" : "video", q, 1, "portrait")).items);
  } catch (e) {
    // the server's own words: usageRefusal's line when stock search is used up for today
    return finish(e instanceof Error && e.message ? e.message : "Couldn't search right now. Try again in a minute.");
  }
  const have = new Set(loadMedia(userId, { videos: true }).flatMap((m) => (m.credit?.url ? [m.credit.url] : [])));
  const picks = pickStarter(results, s.count, have);
  if (!picks.length) return finish(`Stock search found nothing new for ${s.name}.`);
  // Pexels sends no words with a video, so a clip is described by its page name, as the montage does
  const describe = s.kind === "clips" ? (await import("@/lib/montage")).describe : () => "";
  let added = 0;
  let full = false;
  for (const [i, { item, query }] of picks.entries()) {
    put({ ...job, n: i + 1, of: picks.length });
    onProgress?.(i + 1, picks.length);
    if (!mediaRoom(userId)) {
      full = true;
      break;
    }
    try {
      await keepStock(userId, s, item, s.queries[query], describe);
      if (!added && !loadSets(userId).some((x) => same(x.name, s.name))) saveSets(userId, [{ name: s.name, kind: s.kind, starter: s.id, createdAt: new Date().toISOString() }, ...loadSets(userId)]);
      added++;
    } catch (e) {
      if ((e as Error)?.message === FULL) {
        full = true;
        break;
      }
    }
  }
  const noun = s.kind === "photos" ? "photos" : "clips";
  if (added === picks.length) return finish(`${s.name} added. ${added} ${noun}, credits kept.`);
  if (full) return finish(added ? `Added ${added} of ${picks.length}. ${FULL}` : FULL);
  return finish(added ? `Added ${added} of ${picks.length}. Some didn't download.` : "None of them downloaded. Check your connection and try again.");
}

/** Adds starter set `id` to Media (one run per set at a time); the job's progress is in starterJobs. */
export function addStarter(userId: string, id: string, onProgress?: (n: number, of: number) => void): Promise<StarterJob | null> {
  const s = STARTER_SETS.find((x) => x.id === id);
  if (!s) return Promise.resolve(null);
  const running = runs.get(id);
  if (running) return running;
  const p = run(userId, s, onProgress).finally(() => runs.delete(id));
  runs.set(id, p);
  return p;
}
