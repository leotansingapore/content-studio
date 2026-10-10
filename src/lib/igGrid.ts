// Instagram grid preview (/grid): how the profile grid will look once the
// planned posts go out. Newest is top-left on Instagram, so the latest
// scheduled post comes first, then earlier ones, then what is already posted.

import type { DraftEntry } from "@/lib/draftHistory";

export interface GridTile {
  draft: DraftEntry;
  kind: "planned" | "posted";
  /** YYYY-MM-DD the tile goes up (planned) or went up (posted). */
  day: string;
}

export const GRID_SIZE = 18;

export function gridTiles(drafts: DraftEntry[], max = GRID_SIZE): GridTile[] {
  const ig = drafts.filter((d) => d.platform === "instagram" && (d.draft?.trim() || d.hook?.trim()));
  const planned = ig
    .filter((d) => d.status === "scheduled" && d.scheduledFor)
    .sort((a, b) => b.scheduledFor!.localeCompare(a.scheduledFor!))
    .map((d): GridTile => ({ draft: d, kind: "planned", day: d.scheduledFor!.slice(0, 10) }));
  const posted = ig
    .filter((d) => d.status === "posted")
    .map((d): GridTile => ({ draft: d, kind: "posted", day: (d.postedAt ?? d.scheduledFor ?? d.createdAt ?? "").slice(0, 10) }))
    .sort((a, b) => b.day.localeCompare(a.day));
  return [...planned, ...posted].slice(0, max);
}

/**
 * The part of a W x H cover the Instagram and TikTok profile grids show: a centred 3:4 window
 * (y 240 to 1680 of a 1080 x 1920 reel cover). Null for a frame wider than tall, which no grid crops this way.
 * Ported from kevinbadi/social-agents (MIT), vertical-video-thumbnail GRID_H and GRID_TOP.
 */
export function gridWindow(W: number, H: number): { x0: number; y0: number; x1: number; y1: number } | null {
  if (!W || !H || W > H) return null;
  const w = Math.min(W, (H * 3) / 4);
  const h = Math.min(H, (W * 4) / 3);
  return { x0: (W - w) / 2, y0: (H - h) / 2, x1: (W + w) / 2, y1: (H + h) / 2 };
}

/** A span down the picture, top to bottom (shares of its height, or pixels). */
export interface Band {
  y0: number;
  y1: number;
}

/** The grid window as shares of the source picture's height when the picture fills a W x H frame (scaled to cover it, centred); undefined when no grid crops the frame. */
export function windowInSource(W: number, H: number, vw: number, vh: number): Band | undefined {
  const win = gridWindow(W, H);
  if (!win || !vw || !vh) return undefined;
  const dh = vh * Math.max(W / vw, H / vh);
  return { y0: (win.y0 - (H - dh) / 2) / dh, y1: (win.y1 - (H - dh) / 2) / dh };
}

/**
 * Where the cover text goes: its top edge and a scale (1 = full size) for a block `h` px tall. It stays inside `room`
 * (the grid window less a margin), as near `want` as fits, and off the face when there is one: under the chin when it
 * fits there at `min` size or more, else just above the head, else at the foot of the room at `min` size.
 */
export function placeCoverText(h: number, want: number, room: Band, face?: Band, gap = 0, min = 0.6): { top: number; scale: number } {
  const fit = (a: number, b: number, at: number, floor: number) => {
    const scale = Math.min(1, (b - a) / h);
    return scale > 0 && scale >= floor ? { top: Math.min(b - h * scale, Math.max(a, at)), scale } : null;
  };
  const last = Math.min(min, (room.y1 - room.y0) / h);
  return (
    (face
      ? fit(Math.max(room.y0, face.y1 + gap), room.y1, want, min) ?? fit(room.y0, Math.min(room.y1, face.y0 - gap), Infinity, min)
      : fit(room.y0, room.y1, want, 0)) ?? { top: room.y1 - h * last, scale: last }
  );
}
