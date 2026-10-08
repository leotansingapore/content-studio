import { Link } from "react-router-dom";
import { FileText, Film, Flame, Heart, Images, Instagram, Play, Wand2 } from "lucide-react";
import { buildRemixUrl, compactNum, generatorFormat, postAge } from "@/lib/topPosts";
import type { ScoredPost } from "@/lib/postInsights";

const FORMAT_ICON: Record<string, typeof Film> = {
  "short-video": Film,
  carousel: Images,
  "text-post": FileText,
};

// A tall swipe-file card: the cover first, numbers on the cover, then two lines
// of caption and who posted it. The whole card opens the post; "Remix this"
// goes straight to Write.
export default function ReelCard({ item, onOpen }: { item: ScoredPost; onOpen: () => void }) {
  const { post, insight } = item;
  const fmt = generatorFormat(post);
  const Icon = FORMAT_ICON[fmt] ?? FileText;
  const age = postAge(post.timestamp);
  const caption = post.caption || post.idea?.hook || "";

  return (
    <div className="relative min-w-0">
      <button
        type="button"
        onClick={onOpen}
        className="group block w-full text-left"
        aria-label={`Open post by ${post.handle}`}
      >
        <span className="relative block aspect-[9/16] w-full overflow-hidden rounded-xl bg-muted shadow-card ring-1 ring-border/60 transition-shadow group-hover:shadow-elegant">
          {post.cover ? (
            fmt === "short-video" ? (
              <img src={post.cover} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
            ) : (
              // Square and portrait posts: shown whole on a blurred copy of themselves.
              <>
                <img src={post.cover} alt="" aria-hidden className="absolute inset-0 h-full w-full scale-110 object-cover blur-xl" />
                <img src={post.cover} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-contain" />
              </>
            )
          ) : (
            <span className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-primary/10 via-brand/10 to-primary/[0.04]">
              <Icon className="h-10 w-10 text-primary/35" />
            </span>
          )}
          <span className="absolute inset-x-0 top-0 h-14 bg-gradient-to-b from-black/45 to-transparent" />
          <span className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/60 to-transparent" />
          <span className="absolute left-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur" title="Instagram">
            <Instagram className="h-3.5 w-3.5" />
          </span>
          <span className="absolute bottom-2 left-2 right-2 flex items-center gap-2.5 text-[11px] font-semibold text-white drop-shadow">
            {post.views > 0 && (
              <span className="inline-flex items-center gap-1">
                <Play className="h-3 w-3 fill-current" /> {compactNum(post.views)}
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <Heart className="h-3 w-3 fill-current" /> {compactNum(post.likes)}
            </span>
            {insight.breakout && (
              <span className="ml-auto inline-flex items-center gap-0.5 rounded-full bg-warning/90 px-1.5 py-0.5 text-[10px]" title="Engagement vs this creator's average">
                <Flame className="h-3 w-3" /> {insight.ratio.toFixed(1)}x
              </span>
            )}
          </span>
        </span>
        <span className="mt-2 block space-y-0.5 px-0.5">
          <span className="line-clamp-2 break-words text-xs leading-snug text-foreground">{caption}</span>
          <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="truncate">{post.handle}</span>
            {age && (
              <>
                <span aria-hidden className="h-1 w-1 shrink-0 rounded-full bg-current opacity-60" />
                <span className="shrink-0">{age}</span>
              </>
            )}
          </span>
        </span>
      </button>
      <Link
        to={buildRemixUrl(post, { name: post.advisorName, handle: post.handle }, { angle: insight.angle, structure: insight.structure })}
        onClick={(e) => e.stopPropagation()}
        title="Rewrite this post for your business"
        className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-background/90 px-2.5 py-1.5 text-[11px] font-semibold text-primary shadow-sm backdrop-blur transition-colors hover:bg-background"
      >
        <Wand2 className="h-3 w-3" /> Remix this
      </Link>
    </div>
  );
}
