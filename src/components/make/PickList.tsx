// The list a format page picks a post to remix from (/make/<slug>?pick=open): each post's cover, its first line and
// who posted it, the open one marked. Each format brings its own list (slideshows that did well, walls of text).

import { useMemo } from "react";
import type { RemixSource } from "@/lib/remixSource";
import { compactNum } from "@/lib/topPosts";
import { cn } from "@/lib/utils";

/** "@handle | 1.2K likes", plus the views of a video. */
export const metaOf = (s: RemixSource) =>
  [s.author, s.numbers?.likes ? `${compactNum(s.numbers.likes)} likes` : "", s.format === "video" && s.numbers?.views ? `${compactNum(s.numbers.views)} views` : ""]
    .filter(Boolean)
    .join(" | ");

/** `load` is a module-level function, so the list is read once per brand. */
export default function PickList({ userId, load, label, fallback, current, onPick }: {
  userId: string;
  load: (userId: string) => RemixSource[];
  label: string;
  /** What a post with no title or caption is called. */
  fallback: string;
  current?: string;
  onPick: (s: RemixSource) => void;
}) {
  const list = useMemo(() => load(userId), [load, userId]);
  return (
    <ul aria-label={label} className="max-h-80 divide-y divide-border/60 overflow-y-auto rounded-lg border border-border/60">
      {list.map((s) => (
        <li key={s.key}>
          <button
            type="button"
            onClick={() => onPick(s)}
            aria-current={s.key === current}
            className={cn("flex min-h-11 w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted/60", s.key === current && "bg-primary/5")}
          >
            {s.cover ? <img src={s.cover} alt="" loading="lazy" className="h-12 w-10 shrink-0 rounded object-cover" /> : <span className="h-12 w-10 shrink-0 rounded bg-muted" />}
            <span className="min-w-0">
              <span className="block truncate text-sm">{s.title || s.caption || fallback}</span>
              <span className="block truncate text-xs text-muted-foreground">{metaOf(s)}</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
