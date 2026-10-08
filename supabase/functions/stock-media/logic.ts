// Pure logic for stock-media: free stock photos and B-roll clips from Pexels.
// Parses the request, builds the Pexels URL and turns its answer into the small
// shape the studio shows. No Deno or npm imports, so vitest covers it.

export const PER_PAGE = 24;
export const MAX_QUERY = 80;

export type StockKind = "photo" | "video";
export type Orientation = "portrait" | "landscape" | "square";

export interface StockRequest {
  kind: StockKind;
  query: string;
  page: number;
  orientation?: Orientation;
}

/** One result: what to show, the file to download, and the credit Pexels asks for. */
export interface StockItem {
  id: string;
  w: number;
  h: number;
  alt: string;
  /** Small preview picture. */
  thumb: string;
  /** The file to keep: a photo about 1080 wide, or a video around 720p. */
  src: string;
  /** Photographer or videographer, and their Pexels page. */
  by: string;
  byUrl: string;
  /** The item's own page on Pexels. */
  url: string;
  /** Seconds, videos only. */
  duration?: number;
}

export function parseStockRequest(raw: unknown): { ok: true; request: StockRequest } | { ok: false; error: string } {
  const b = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const kind = b.kind === "video" ? "video" : b.kind === "photo" || b.kind === undefined ? "photo" : null;
  if (!kind) return { ok: false, error: "Search photos or videos." };
  const query = typeof b.query === "string" ? b.query.replace(/\s+/g, " ").trim() : "";
  if (!query) return { ok: false, error: "Type what you're looking for." };
  if (query.length > MAX_QUERY) return { ok: false, error: `Keep the search under ${MAX_QUERY} characters.` };
  const page = Math.min(20, Math.max(1, Math.floor(Number(b.page) || 1)));
  const orientation = (["portrait", "landscape", "square"] as const).find((o) => o === b.orientation);
  return { ok: true, request: { kind, query, page, ...(orientation ? { orientation } : {}) } };
}

export function pexelsUrl(r: StockRequest): string {
  const q = new URLSearchParams({ query: r.query, page: String(r.page), per_page: String(PER_PAGE) });
  if (r.orientation) q.set("orientation", r.orientation);
  return `https://api.pexels.com/${r.kind === "video" ? "videos/" : "v1/"}search?${q}`;
}

export const cacheKey = (r: StockRequest) => `${r.kind}|${r.orientation ?? ""}|${r.page}|${r.query.toLowerCase()}`;

const str = (v: unknown) => (typeof v === "string" ? v : "");
const pexels = (v: unknown) => (/^https:\/\/(www\.)?pexels\.com\//.test(str(v)) ? str(v) : "");
const media = (v: unknown) => (/^https:\/\/(images|videos)\.pexels\.com\//.test(str(v)) ? str(v) : "");

export function normalizePhotos(data: unknown): StockItem[] {
  const list = (data as { photos?: unknown })?.photos;
  if (!Array.isArray(list)) return [];
  return list.flatMap((p): StockItem[] => {
    const o = (p ?? {}) as Record<string, unknown>;
    const src = (o.src ?? {}) as Record<string, unknown>;
    const original = media(src.original);
    const thumb = media(src.medium) || media(src.small);
    if (!original || !thumb || o.id === undefined) return [];
    return [{
      id: String(o.id),
      w: Number(o.width) || 0,
      h: Number(o.height) || 0,
      alt: str(o.alt).slice(0, 250),
      thumb,
      // Pexels resizes on the fly; 1080 wide is all a slide uses
      src: `${original.split("?")[0]}?auto=compress&cs=tinysrgb&w=1080`,
      by: str(o.photographer).slice(0, 80) || "Pexels",
      byUrl: pexels(o.photographer_url),
      url: pexels(o.url),
    }];
  });
}

interface VideoFile {
  link: string;
  w: number;
  h: number;
}

/** The mp4 whose short side is nearest 720 (at least 360); else the smallest one. */
export function pickVideoFile(files: unknown): VideoFile | null {
  if (!Array.isArray(files)) return null;
  const mp4 = files
    .map((f) => (f ?? {}) as Record<string, unknown>)
    .filter((f) => str(f.file_type) === "video/mp4" && media(f.link) && Number(f.width) > 0 && Number(f.height) > 0)
    .map((f) => ({ link: str(f.link), w: Number(f.width), h: Number(f.height) }));
  if (!mp4.length) return null;
  const short = (f: VideoFile) => Math.min(f.w, f.h);
  const fit = mp4.filter((f) => short(f) >= 360).sort((a, b) => Math.abs(short(a) - 720) - Math.abs(short(b) - 720));
  return fit[0] ?? [...mp4].sort((a, b) => short(a) - short(b))[0];
}

export function normalizeVideos(data: unknown): StockItem[] {
  const list = (data as { videos?: unknown })?.videos;
  if (!Array.isArray(list)) return [];
  return list.flatMap((v): StockItem[] => {
    const o = (v ?? {}) as Record<string, unknown>;
    const user = (o.user ?? {}) as Record<string, unknown>;
    const file = pickVideoFile(o.video_files);
    // the cover Pexels sends is 1200 tall; a 350-tall one is plenty for the grid
    const thumb = media(o.image) && `${media(o.image).split("?")[0]}?auto=compress&cs=tinysrgb&h=350`;
    if (!file || !thumb || o.id === undefined) return [];
    return [{
      id: String(o.id),
      w: file.w,
      h: file.h,
      alt: "",
      thumb,
      src: file.link,
      by: str(user.name).slice(0, 80) || "Pexels",
      byUrl: pexels(user.url),
      url: pexels(o.url),
      duration: Math.max(0, Number(o.duration) || 0),
    }];
  });
}

/** A small time-limited cache, so the same search from anyone in the next hour costs Pexels nothing. */
export class TtlCache<T> {
  private map = new Map<string, { at: number; value: T }>();
  constructor(private max: number, private ttlMs: number) {}
  get(key: string, now = Date.now()): T | undefined {
    const hit = this.map.get(key);
    if (!hit) return undefined;
    if (now - hit.at > this.ttlMs) {
      this.map.delete(key);
      return undefined;
    }
    return hit.value;
  }
  set(key: string, value: T, now = Date.now()): void {
    this.map.delete(key);
    this.map.set(key, { at: now, value });
    // Map keeps insertion order: the first key is the oldest
    while (this.map.size > this.max) this.map.delete(this.map.keys().next().value as string);
  }
}
