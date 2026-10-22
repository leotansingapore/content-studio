// What is open on screen for the agent to change (docs/north-star/items/edit-by-chat.md, "1. The page tells the dock
// what is open"): a module-level registry, in memory only. The carousel, slideshow and video editor pages register
// while an item is open (edit-targets, wave 3); the agent reads `currentEditTarget()` when it sends `open`.

export interface EditTarget {
  kind: "carousel" | "slideshow" | "video";
  title: string;
  /** First 80 characters of each slide, for carousel and slideshow. */
  slides?: string[];
  /** The slide shown or picked, 1-based. */
  onScreen?: number;
  /** Calls the writer and changes nothing. */
  propose(ask: string, slide: number | null): Promise<Proposal>;
}

export interface Proposal {
  reply: string;
  preview: string;
  flags: string[];
  apply(): { done: string; undo: () => void };
}

let current: EditTarget | null = null;

/** The page's item is now the one open; the returned unregister clears it only while it is still that item. */
export function registerEditTarget(t: EditTarget): () => void {
  current = t;
  return () => {
    if (current === t) current = null;
  };
}

export const currentEditTarget = (): EditTarget | null => current;
