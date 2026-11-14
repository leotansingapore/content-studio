// The Library's Select (Fastlane's bulk select, 14 Nov): Delete and Download over many cards at once. Each piece goes
// through its own store's delete, as its own page deletes it, and one Undo puts every one back. A card is everything
// it shows: a post and the carousel, slideshow, Design or /image design tied to it go together, so no card turns into
// another. Videos stay: removeProject drops the file from the device, which no Undo can bring back.

import { removeCarousel, saveCarousel, type SavedCarousel } from "@/lib/carousel";
import { removeDesign, saveDesign, type Design } from "@/lib/design";
import { deleteDraft, loadDrafts, saveDrafts, type DraftEntry } from "@/lib/draftHistory";
import { removeImage, saveImage, type SavedImage } from "@/lib/images";
import type { LibraryItem } from "@/lib/library";
import { addMedia, removeMedia, type MediaItem } from "@/lib/mediaLibrary";
import { removeSlideshow, saveSlideshow, type Slideshow } from "@/lib/slideshow";
import type { VideoProject } from "@/lib/videoProjects";
import { zernioHolds } from "@/lib/zernioOutbox";

export interface BulkStores {
  drafts: DraftEntry[];
  carousels: SavedCarousel[];
  slideshows: Slideshow[];
  projects: VideoProject[];
  media: MediaItem[];
  designs: Design[];
  images: SavedImage[];
}

export interface Deleted {
  /** Cards that went. */
  count: number;
  /** Video cards left as they were. */
  videos: number;
  /** A deleted post Zernio held: its auto-post is being cancelled (Undo drops the cancel, as on My posts). */
  held: boolean;
  undo: () => void;
}

/** `ids` back where each was in `before`, among what the list holds now. */
export function putBack<T extends { id: string }>(now: T[], before: T[], ids: Set<string>): T[] {
  const out = now.filter((x) => !ids.has(x.id));
  before.forEach((x, i) => ids.has(x.id) && out.splice(Math.min(i, out.length), 0, x));
  return out;
}

const at = (iso?: string) => (iso ? new Date(iso) : new Date());

/** Deletes the cards by Library key; a job ("j:") is never one. */
export function deleteItems(userId: string, keys: string[], s: BulkStores): Deleted {
  const gone = { drafts: [] as DraftEntry[], carousels: [] as SavedCarousel[], shows: [] as Slideshow[], designs: [] as Design[], images: [] as SavedImage[], media: [] as MediaItem[] };
  let count = 0;
  let videos = 0;
  const tiedOff = (draftId: string) => {
    for (const c of s.carousels) if (c.draftId === draftId) gone.carousels.push(c), removeCarousel(userId, c.id);
    for (const x of s.slideshows) if (x.draftId === draftId) gone.shows.push(x), removeSlideshow(userId, x.id);
    for (const x of s.designs) if (x.draftId === draftId) gone.designs.push(x), removeDesign(userId, x.id);
    for (const g of s.images) if (g.draftId === draftId) gone.images.push(g), removeImage(userId, g.id);
  };
  for (const key of keys) {
    const kind = key.slice(0, 1);
    const id = key.slice(2);
    if (kind === "v" || (kind === "d" && s.projects.some((p) => `video-${p.id}` === id))) {
      videos++;
      continue;
    }
    const one = <T>(list: T[], hit: (t: T) => boolean, into: T[], remove: (t: T) => void) => {
      const t = list.find(hit);
      if (!t) return;
      into.push(t);
      remove(t);
      count++;
    };
    if (kind === "d") one(s.drafts, (d) => d.id === id, gone.drafts, (d) => (deleteDraft(userId, d.id), tiedOff(d.id)));
    else if (kind === "c") one(s.carousels, (c) => c.id === id, gone.carousels, (c) => removeCarousel(userId, c.id));
    else if (kind === "s") one(s.slideshows, (x) => x.id === id, gone.shows, (x) => removeSlideshow(userId, x.id));
    else if (kind === "x") one(s.designs, (x) => x.id === id, gone.designs, (x) => removeDesign(userId, x.id));
    else if (kind === "g") one(s.images, (g) => g.id === id, gone.images, (g) => removeImage(userId, g.id));
    else if (kind === "i") one(s.media, (m) => m.key === id, gone.media, (m) => removeMedia(userId, m.key));
  }
  const before = s.drafts;
  return {
    count,
    videos,
    held: gone.drafts.some(zernioHolds),
    undo: () => {
      if (gone.drafts.length) saveDrafts(userId, putBack(loadDrafts(userId), before, new Set(gone.drafts.map((d) => d.id))));
      // each save puts its piece first, so the last first keeps the old order
      for (const c of [...gone.carousels].reverse()) saveCarousel(userId, c, at(c.updatedAt));
      for (const x of [...gone.shows].reverse()) saveSlideshow(userId, x, at(x.updatedAt));
      for (const x of [...gone.designs].reverse()) saveDesign(userId, x, at(x.updatedAt));
      for (const g of [...gone.images].reverse()) saveImage(userId, g, at(g.updatedAt));
      for (const m of [...gone.media].reverse()) addMedia(userId, m);
    },
  };
}

type File = { file: Blob; name: string };
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };

/** The files a card downloads as, drawn the way its own page draws them, or none: a text post, a video (its export is the editor's), a picture not on this device. */
async function filesOf(userId: string, it: LibraryItem, s: BulkStores): Promise<File[]> {
  const t = it.thumb;
  const { slideFileName, slugify, loadBrand, DEFAULT_BRAND } = await import("@/lib/carousel");
  const base = slugify(it.title) || "item";
  if (t?.kind === "slide") {
    const c = s.carousels.find((x) => x.id === t.carouselId);
    if (!c) return [];
    const { carouselSvgs, slidePng } = await import("@/lib/postSend");
    return Promise.all((await carouselSvgs(userId, c)).map(async (svg, i) => ({ file: await slidePng(c, svg), name: slideFileName(it.title, i) })));
  }
  if (t?.kind === "show") {
    const show = s.slideshows.find((x) => x.id === t.showId);
    if (!show) return [];
    const { slideshowPngs } = await import("@/lib/slideshowDraw");
    return (await slideshowPngs(userId, show)).map((f, i) => ({ file: f.file, name: slideFileName(it.title, i) }));
  }
  if (t?.kind === "design") {
    const d = s.designs.find((x) => x.id === t.designId);
    if (!d) return [];
    const { designPngs } = await import("@/lib/designExport");
    return (await designPngs(userId, d)).map((file, i) => ({ file, name: slideFileName(it.title, i) }));
  }
  if (t?.kind === "image") {
    const g = s.images.find((x) => x.id === t.imageId);
    // as /image's own Download: a design without its words yet has nothing to save
    const { imageBlock } = await import("@/lib/imageLayout");
    if (!g || imageBlock(g.layout, g.words)) return [];
    const [{ imageDrawing }, { renderSvg }, { svgPng }] = await Promise.all([import("@/components/library/LibraryThumb"), import("@/lib/carouselLayout"), import("@/lib/carouselRender")]);
    const d = await imageDrawing(g, loadBrand(userId) ?? DEFAULT_BRAND);
    return [{ file: await svgPng(renderSvg(d), d.width, d.height), name: `${base}.png` }];
  }
  if (t?.kind === "media") {
    const { getFile } = await import("@/lib/deviceFiles");
    const file = await getFile(t.key);
    return file ? [{ file, name: `${base}.${EXT[file.type] ?? "png"}` }] : [];
  }
  return [];
}

/** Each name once: a second "tips-01.png" becomes "tips-01-2.png". */
export function uniqueNames(files: File[]): File[] {
  const seen = new Map<string, number>();
  return files.map((f) => {
    const n = (seen.get(f.name) ?? 0) + 1;
    seen.set(f.name, n);
    return n === 1 ? f : { ...f, name: f.name.replace(/(\.[a-z0-9]+)?$/i, `-${n}$1`) };
  });
}

/** Downloads the cards that have a file or a drawing as one file (one zip for more than one: Chrome blocks a site's second download). */
export async function downloadItems(userId: string, items: LibraryItem[], s: BulkStores): Promise<{ saved: number; skipped: number }> {
  const files: File[] = [];
  let saved = 0;
  for (const it of items) {
    const got = await filesOf(userId, it, s).catch(() => [] as File[]);
    if (got.length) files.push(...got), saved++;
  }
  const { downloadBlob, zipBlob } = await import("@/lib/carouselRender");
  if (files.length === 1) downloadBlob(files[0].file, files[0].name);
  else if (files.length) downloadBlob(await zipBlob(uniqueNames(files)), "library.zip");
  return { saved, skipped: items.length - saved };
}
