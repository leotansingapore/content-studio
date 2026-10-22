// Finding what the brand sells on its website (brand-products, Leo only): one brand-dna products scan, run outside
// React so leaving /brand keeps it going. The answer waits on this device (cs-products-scan-<scoped>, never synced)
// until Add or Discard. Pictures come one at a time through brand-dna image: a found row's picture while it waits
// for review, and a saved product's picture on a device that doesn't have it yet (stored under the product's own key,
// so every device uses the same one). Rows Jev rates OFFER_AT or more start ticked; nothing is added unticked.

import { toast } from "@/hooks/use-toast";
import { hostOf } from "@/lib/brandRead";
import { deleteFile, getFile, putFile } from "@/lib/deviceFiles";
import { callFn, EdgeError } from "@/lib/edgeFn";
import { addMedia, storePicture } from "@/lib/mediaLibrary";
import { alreadyAdded, loadProducts, MAX_PRODUCTS, mergeScan, type Product, saveProducts, type Scan } from "@/lib/products";
import { scoped } from "@/lib/profiles";
import { NAMED_AT, OFFER_AT, type ScannedProduct } from "../../supabase/functions/brand-dna/logic.ts";

export { hostOf };

export const REFUSED = "This isn't switched on for your account yet.";
export const PICTURE_FAILED = "Couldn't fetch that picture. Upload one instead.";
export const PRODUCTS_FOLDER = "Products";
const scanFailed = (address: string) => `We couldn't list what ${hostOf(address)} sells. Check the address and try again.`;
export const scanKey = (userId: string) => `cs-products-scan-${scoped(userId)}`;

/** A picture fetched for the review: its key on this device and size, or "failed". */
export type Fetched = { key: string; width: number; height: number } | "failed";
/** The scan waiting for review, the rows ticked or unticked by hand so far, and the pictures fetched for it. */
export interface Waiting {
  scan: Scan;
  ticks: Record<number, boolean>;
  pics: Record<string, Fetched>;
}

export type Group = "yours" | "maybe" | "unsorted";
export interface ReviewRow {
  i: number;
  row: ScannedProduct;
  /** Jev's offer answer: OFFER_AT or more, under it, or none (Jev off or silent). */
  group: Group;
  ticked: boolean;
  /** Already in the list: shown, never added. */
  added: boolean;
  named: boolean;
}

/** The review's rows, in the order they show: Jev's yes rows, then "Maybe not yours", then the ones it couldn't sort. */
export function reviewRows(list: Product[], w: Waiting): ReviewRow[] {
  const order: Group[] = ["yours", "maybe", "unsorted"];
  return w.scan.items
    .map((row, i) => {
      const group: Group = row.offerP === null ? "unsorted" : row.offerP >= OFFER_AT ? "yours" : "maybe";
      const added = !!alreadyAdded(list, row, w.scan.items);
      return { i, row, group, added, ticked: !added && (w.ticks[i] ?? group === "yours"), named: row.namedP !== null && row.namedP >= NAMED_AT };
    })
    .sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group) || a.i - b.i);
}

/** What Add would add and whether it fits: the line under a disabled button, or null when it can go. */
export function addPlan(list: Product[], rows: ReviewRow[]): { count: number; line: string | null } {
  const count = rows.filter((r) => r.ticked).length;
  const room = MAX_PRODUCTS - list.length;
  if (count <= room) return { count, line: null };
  return { count, line: room === 0 ? `${MAX_PRODUCTS} is the most a brand can keep. Remove one to add another.` : `Only ${room} more fit. Untick some, or remove one first.` };
}

// ---- The waiting scan (device) -----------------------------------------------------------------------------------

// a copy in memory too, so a scan too big for full storage still reaches its review on this visit
const memory = new Map<string, Waiting>();
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown) => (typeof v === "string" ? v : "");

/** brand-dna's answer as the review reads it; null when it isn't one. */
export function scanOf(d: unknown, readAt: string): Scan | null {
  const x = d as Record<string, unknown> | null;
  if (!x || !Array.isArray(x.items)) return null;
  const items = x.items.flatMap((it: Record<string, unknown>): ScannedProduct[] =>
    it && str(it.name).trim()
      ? [{
        name: str(it.name), what: str(it.what), forWho: str(it.forWho), generic: str(it.generic),
        ...(str(it.price) ? { price: str(it.price) } : {}), ...(str(it.url) ? { url: str(it.url) } : {}), ...(str(it.picture) ? { picture: str(it.picture) } : {}),
        offerP: num(it.offerP), namedP: num(it.namedP),
      }]
      : []);
  return {
    site: str(x.site),
    readAt: str(x.readAt) || readAt,
    pagesRead: Array.isArray(x.pagesRead) ? x.pagesRead.filter((p): p is string => typeof p === "string") : [],
    kind: x.kind === "products" || x.kind === "service" ? x.kind : null,
    items: items.slice(0, MAX_PRODUCTS),
  };
}

export function loadWaiting(userId: string): Waiting | null {
  const key = scanKey(userId);
  const kept = memory.get(key);
  if (kept) return kept;
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? "null");
    const scan = v ? scanOf(v.scan, "") : null;
    if (!scan) return null;
    const ticks = Object.fromEntries(Object.entries(v.ticks ?? {}).filter(([, t]) => typeof t === "boolean")) as Record<number, boolean>;
    const pics = Object.fromEntries(Object.entries(v.pics ?? {}).filter(([, p]) => p === "failed" || /^cimg-/.test((p as { key?: string })?.key ?? ""))) as Record<string, Fetched>;
    return { scan, ticks, pics };
  } catch {
    return null;
  }
}

function keep(key: string, w: Waiting | null): void {
  if (w) memory.set(key, w);
  else memory.delete(key);
  try {
    if (w) localStorage.setItem(key, JSON.stringify(w));
    else localStorage.removeItem(key);
  } catch {
    // storage full or blocked: the memory copy serves this visit
  }
  emit();
}

export function setTick(userId: string, i: number, on: boolean): void {
  const w = loadWaiting(userId);
  if (w) keep(scanKey(userId), { ...w, ticks: { ...w.ticks, [i]: on } });
}

const fetchedKeys = (w: Waiting) => Object.values(w.pics).flatMap((p) => (p === "failed" ? [] : [p.key]));

/** Add: the ticked rows join the list, their fetched pictures join Media's Products folder, the rest leave this device. */
export function addFromScan(userId: string, now = new Date()): { added: number } | { error: string } | null {
  const w = loadWaiting(userId);
  if (!w) return null;
  const list = loadProducts(userId);
  const rows = reviewRows(list.items, w);
  const { line } = addPlan(list.items, rows);
  if (line) return { error: line };
  const fetched = Object.fromEntries(Object.entries(w.pics).flatMap(([u, p]) => (p === "failed" ? [] : [[u, p.key]])));
  const { next, added } = mergeScan(list, w.scan, rows.filter((r) => r.ticked).map((r) => r.i), fetched, now);
  const error = saveProducts(userId, next);
  if (error) return { error };
  const used = new Set<string>();
  for (const p of added) {
    const got = p.sources[0] ? w.pics[p.sources[0]] : undefined;
    if (!got || got === "failed" || got.key !== p.pictures[0]) continue;
    used.add(got.key);
    addMedia(userId, { key: got.key, name: p.name, folder: PRODUCTS_FOLDER, alt: p.name, width: got.width, height: got.height, addedAt: now.toISOString(), type: "product", typeBy: "you" });
  }
  for (const k of fetchedKeys(w)) if (!used.has(k)) void deleteFile(k).catch(() => undefined);
  keep(scanKey(userId), null);
  return { added: added.length };
}

/** Discard: the scan and the pictures fetched for it leave this device. */
export function discardScan(userId: string): void {
  const w = loadWaiting(userId);
  if (w) for (const k of fetchedKeys(w)) void deleteFile(k).catch(() => undefined);
  keep(scanKey(userId), null);
}

// ---- Pictures, one at a time -------------------------------------------------------------------------------------

/** Where a picture stands on this device: fetching, fetched ("done"), or failed. Keyed by reviewPictureId or the saved key. */
export type PictureState = "fetching" | "done" | "failed";
const pictures = new Map<string, PictureState>();
export const pictureState = (id: string): PictureState | undefined => pictures.get(id);
type Job = { id: string; run: () => Promise<void> };
const queue: Job[] = [];
let running = false;
// a 403 or a spent cap stops the rest for this visit instead of asking again for each
let stopped = false;

async function drain(): Promise<void> {
  if (running) return;
  running = true;
  try {
    for (let job = queue.shift(); job; job = queue.shift()) {
      if (stopped) {
        pictures.set(job.id, "failed");
        emit();
        continue;
      }
      try {
        await job.run();
        pictures.set(job.id, "done");
      } catch (e) {
        if (e instanceof EdgeError && (e.status === 403 || e.status === 429)) stopped = true;
        pictures.set(job.id, "failed");
      }
      emit();
    }
  } finally {
    running = false;
  }
}

function enqueue(id: string, run: () => Promise<void>): void {
  if (pictures.has(id)) return;
  pictures.set(id, "fetching");
  queue.push({ id, run });
  emit();
  void drain();
}

// Addresses brand-dna image refused for the picture itself (422: not a PNG, JPEG or WebP, or over 2 MB). Asking again
// would be refused again and count against brand-image's 100 a day, so this device stops asking, across visits.
const REFUSED_PICTURES = "cs-brand-pictures-refused"; // this device only, on purpose: not content-studio-, so never synced
const MAX_REFUSED = 50;
function refusedPictures(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(REFUSED_PICTURES) ?? "[]");
    return Array.isArray(v) ? v.filter((u): u is string => typeof u === "string") : [];
  } catch {
    return [];
  }
}
function refusePicture(url: string): void {
  try {
    localStorage.setItem(REFUSED_PICTURES, JSON.stringify([...refusedPictures().filter((u) => u !== url), url].slice(-MAX_REFUSED)));
  } catch {
    // storage blocked: the next visit asks once more
  }
}

/** One picture from the brand's site, resized and kept on this device under a new key. */
async function fetchPicture(url: string): Promise<{ key: string; width: number; height: number }> {
  if (refusedPictures().includes(url)) throw new Error(PICTURE_FAILED);
  const { dataUrl } = await callFn<{ dataUrl: string }>("brand-dna", { mode: "image", url }, PICTURE_FAILED).catch((e) => {
    if (e instanceof EdgeError && e.status === 422) refusePicture(url);
    throw e;
  });
  const blob = await (await fetch(dataUrl)).blob();
  const { key, width, height } = await storePicture(blob);
  return { key, width, height };
}

/** A found row's picture in pictureState: per scan, so scanning the same site again fetches for the new review. */
export const reviewPictureId = (w: Waiting, url: string) => `${w.scan.readAt} ${url}`;

/** The waiting scan's pictures, in the order the review shows them, each once. */
export function fetchReviewPictures(userId: string): void {
  const w = loadWaiting(userId);
  if (!w) return;
  for (const { row } of reviewRows(loadProducts(userId).items, w)) {
    const url = row.picture;
    if (!url || w.pics[url]) continue;
    enqueue(reviewPictureId(w, url), async () => {
      let got: Fetched = "failed";
      try {
        got = await fetchPicture(url);
      } finally {
        const now = loadWaiting(userId);
        // added or discarded while it was fetched: the file is no one's
        if (now?.scan.readAt !== w.scan.readAt) {
          if (got !== "failed") await deleteFile(got.key).catch(() => undefined);
        } else keep(scanKey(userId), { ...now, pics: { ...now.pics, [url]: got } });
      }
    });
  }
}

/**
 * A saved product's picture that isn't on this device: fetched once from its source and kept under the product's own
 * key, and added to Media's Products folder here too. Nothing happens without a source.
 */
export function ensurePicture(userId: string, key: string, source: string, name: string): void {
  if (!source) return;
  enqueue(key, async () => {
    if (await getFile(key)) return;
    const pic = await fetchPicture(source);
    const blob = await getFile(pic.key);
    if (!blob) throw new Error(PICTURE_FAILED);
    await putFile(key, blob);
    await deleteFile(pic.key).catch(() => undefined);
    addMedia(userId, { key, name, folder: PRODUCTS_FOLDER, alt: name, width: pic.width, height: pic.height, addedAt: new Date().toISOString(), type: "product", typeBy: "you" });
  });
}

/** A saved product's picture as a File for the AI panel's product slot, fetched again when this device lacks it. */
export async function pictureFile(userId: string, p: Product): Promise<File | null> {
  const key = p.pictures[0];
  if (!key) return null;
  let blob = await getFile(key);
  if (!blob && p.sources[0]) {
    // a picture that failed earlier is asked for again on a press (unless the site refused it for itself); one already
    // on its way is waited for
    if (pictures.get(key) !== "fetching") pictures.delete(key);
    ensurePicture(userId, key, p.sources[0], p.name);
    await new Promise<void>((done) => {
      const off = onProducts(() => pictures.get(key) !== "fetching" && (off(), done()));
    });
    blob = await getFile(key);
  }
  return blob ? new File([blob], `${p.name.replace(/[^\w-]+/g, "-").slice(0, 40) || "product"}.jpg`, { type: blob.type || "image/jpeg" }) : null;
}

// ---- The scan itself (outside React) -----------------------------------------------------------------------------

export interface Scanning {
  address: string;
  startedAt: number;
}
const scanning = new Map<string, Scanning>();
const failed = new Map<string, string>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function onProducts(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export const scanningNow = (userId: string): Scanning | undefined => scanning.get(scanKey(userId));
export const scanFailedLine = (userId: string): string | undefined => failed.get(scanKey(userId));

export async function startScan(userId: string, address: string, now = Date.now): Promise<void> {
  // the brand open when the scan starts is the one it adds to
  const key = scanKey(userId);
  if (scanning.has(key) || !address.trim()) return;
  scanning.set(key, { address: address.trim(), startedAt: now() });
  failed.delete(key);
  emit();
  let line = "";
  try {
    const d = await callFn<unknown>("brand-dna", { mode: "products", url: address.trim() }, scanFailed(address));
    const scan = scanOf(d, new Date(now()).toISOString());
    if (!scan) throw new EdgeError(scanFailed(address), 200);
    keep(key, { scan, ticks: {}, pics: {} });
  } catch (e) {
    const err = e instanceof EdgeError ? e : null;
    line = err?.status === 403 ? REFUSED : err?.message || scanFailed(address);
    failed.set(key, line);
  } finally {
    scanning.delete(key);
    emit();
  }
  if (!line) fetchReviewPictures(userId);
  // left /brand while it ran: say so where they are
  if (typeof location !== "undefined" && location.pathname !== "/brand")
    toast(line ? { title: line, variant: "destructive" } : { title: "Your products scan is ready", description: "Open Brand kit to check it." });
}
