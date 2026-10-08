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
