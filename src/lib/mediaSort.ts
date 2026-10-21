// The sort queue (brand-media-library step 1, Leo only): each file added on /media goes to media-sort, 3 at a time,
// outside React so leaving the page keeps it going. It lives in memory: a reload drops what was waiting, and /media
// queues it again from `waitingSort`. The still is made here from the file on this device (a photo 360 px wide, a
// video's frame 25% in). Every answer, and every failure as "other", goes through applySort, which never replaces a
// type the person picked; the chip on the tile is the fix, so a failure shows no message.

import { callFn, EdgeError } from "@/lib/edgeFn";
import { getFile } from "@/lib/deviceFiles";
import { applySort, loadMedia, MEDIA_TYPES, type MediaItem, type MediaType } from "@/lib/mediaLibrary";
import { MAX_STILL } from "../../supabase/functions/media-sort/logic.ts";

export const SORT_USED_UP = "Saved. Sorting is used up for today, so set the type yourself.";
const AT_ONCE = 3;
const STILL_WIDTH = 360;

interface Job {
  uid: string;
  key: string;
}
export interface SortState {
  /** Keys waiting or being sorted: their tiles say "Sorting". */
  sorting: ReadonlySet<string>;
  notice: string | null;
}

const queue: Job[] = [];
let running = 0;
let usedUpOn = "";
let state: SortState = { sorting: new Set(), notice: null };
const listeners = new Set<() => void>();
const set = (next: Partial<SortState>) => {
  state = { ...state, ...next };
  listeners.forEach((f) => f());
};
const today = () => new Date().toISOString().slice(0, 10);
// loaded on the first sort only, so /media for everyone else never fetches the video code
let videoMedia: Promise<typeof import("@/lib/videoMedia")> | null = null;

/** For useSyncExternalStore: the same object until something changes. */
export const sortState = (): SortState => state;
export function onSortChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}
export const clearSortNotice = () => state.notice && set({ notice: null });

/** Files added through Media's upload that have no type yet: the ones a reload stopped. */
export const waitingSort = (list: MediaItem[]): string[] => list.filter((m) => m.kind && !m.type && !state.sorting.has(m.key)).map((m) => m.key);

// shortcut: a job writes to the brand open when it finishes, so switching brands mid-sort leaves that file "Other"; key the job by scoped id if it matters
export function sortMedia(uid: string, keys: string[]): void {
  const fresh = [...new Set(keys)].filter((k) => !state.sorting.has(k));
  if (!fresh.length) return;
  queue.push(...fresh.map((key) => ({ uid, key })));
  set({ sorting: new Set([...state.sorting, ...fresh]) });
  pump();
}

function pump() {
  while (running < AT_ONCE && queue.length) {
    const job = queue.shift()!;
    running++;
    void sortOne(job)
      .catch(() => undefined)
      .finally(() => {
        running--;
        const sorting = new Set(state.sorting);
        sorting.delete(job.key);
        set({ sorting });
        pump();
      });
  }
}

/** One still as a JPEG data URL, made from the file on this device. */
async function stillOf(m: MediaItem): Promise<string> {
  const file = await getFile(m.key);
  if (!file) throw new Error("That file is not on this device.");
  const { stills, thumbOf } = await (videoMedia ??= import("@/lib/videoMedia"));
  const still = m.kind === "video" ? (await stills(file, [0.25], STILL_WIDTH))[0] : await thumbOf(file, STILL_WIDTH);
  if (!still || still.length > MAX_STILL) throw new Error("That still is too big to send.");
  return still;
}

async function sortOne({ uid, key }: Job): Promise<void> {
  const item = loadMedia(uid, { videos: true }).find((m) => m.key === key);
  if (!item) return;
  let type: MediaType = "other";
  let alt = "";
  if (usedUpOn === today()) set({ notice: SORT_USED_UP });
  else {
    try {
      const body = { mode: "sort", still: await stillOf(item), kind: item.kind ?? "photo", seconds: item.seconds, width: item.width, height: item.height, name: item.name };
      const r = await callFn<{ alt?: unknown; type?: unknown }>("media-sort", body);
      if (MEDIA_TYPES.includes(r?.type as MediaType)) type = r.type as MediaType;
      if (typeof r?.alt === "string") alt = r.alt;
    } catch (e) {
      // used up says so once and skips the rest of today's queue; anything else (not switched on, a failed read, no
      // connection, a file this browser can't draw) lands as "other"
      if (e instanceof EdgeError && e.code === "daily_limit") {
        usedUpOn = today();
        set({ notice: SORT_USED_UP });
      }
    }
  }
  applySort(uid, key, { type, alt });
}
