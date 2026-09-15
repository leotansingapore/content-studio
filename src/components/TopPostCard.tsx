import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Heart,
  MessageCircle,
  Play,
  ExternalLink,
  Wand2,
  Bookmark,
  BookmarkCheck,
  Film,
  Images,
  FileText,
  Flame,
  Clapperboard,
} from "lucide-react";
import { buildRemixUrl, generatorFormat, type TopPost, type TopPostWithAdvisor } from "@/lib/topPosts";
import { cloneLinkFor } from "@/lib/reelClone";
import {
  deriveTopic,
  deriveAngle,
  deriveAudiences,
  formatStructure,
  type PostInsight,
} from "@/lib/postInsights";

function fmtNum(n: number): string {
  if (!n) return "0";
  if (n >= 1000) return (n / 1000).toFixed(n >= 10000 ? 0 : 1) + "k";
  return String(n);
}

const FORMAT_LABEL: Record<string, string> = {
  "short-video": "Reel",
  carousel: "Carousel",
  "text-post": "Single post",
};
const FORMAT_ICON: Record<string, typeof Film> = {
  "short-video": Film,
  carousel: Images,
  "text-post": FileText,
};

/** Best-effort insight when the page didn't pass one (e.g. profile page). */
function displayInsight(post: TopPost, insight?: PostInsight): PostInsight {
  if (insight) return insight;
  const text = `${post.idea?.hook ?? ""} ${post.caption ?? ""}`;
  const p = post as TopPostWithAdvisor;
  const topic = deriveTopic(text, p.niche);
  const angle = deriveAngle(text);
  const audiences = deriveAudiences(p.audience, p.niche);
  const rawTags: (string | null)[] = [topic, angle, ...audiences.slice(0, 2)];
  const tags = rawTags.filter((t): t is string => t !== null);
  return {
    topic,
    angle,
    audiences,
    tags: [...new Set(tags)].slice(0, 4),
    trigger: null,
    structure: formatStructure(generatorFormat(post), post.idea?.format),
    ratio: 1,
    breakout: false,
  };
}

export default function TopPostCard({
  post,
  advisor,
  showAdvisor,
  insight: insightProp,
  saved = false,
  onToggleSave,
  onOpen,
}: {
  post: TopPost;
  advisor: { name: string; handle: string };
  showAdvisor?: boolean;
  insight?: PostInsight;
  saved?: boolean;
  onToggleSave?: () => void;
  onOpen?: () => void;
}) {
  const fmt = generatorFormat(post);
  const insight = displayInsight(post, insightProp);
  const Icon = FORMAT_ICON[fmt] ?? FileText;
  const hook = post.idea?.hook || post.caption.slice(0, 80).replace(/\s+\S*$/, "") || "Untitled post";

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-border/60 bg-card shadow-card transition-all hover:border-primary/40 hover:shadow-elegant">
      {/* Cover — no real thumbnail exists (IG CDN links expire), so this is an
          honest format-styled placeholder; the real visual is one tap away. */}
      <button
        type="button"
        onClick={onOpen}
        disabled={!onOpen}
        className="group relative flex aspect-[5/3] w-full items-center justify-center overflow-hidden bg-gradient-to-br from-primary/10 via-brand/10 to-primary/[0.04] disabled:cursor-default"
        aria-label={onOpen ? "Open post details" : undefined}
      >
        <Icon className="h-10 w-10 text-primary/35 transition-transform group-hover:scale-110" />
        <span className="absolute left-2.5 top-2.5 inline-flex items-center gap-1 rounded-full bg-background/85 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-primary shadow-sm backdrop-blur">
          <Icon className="h-3 w-3" /> {FORMAT_LABEL[fmt] ?? "Post"}
        </span>
        {insight.breakout && (
          <span className="absolute right-2.5 top-2.5 inline-flex items-center gap-1 rounded-full bg-warning/90 px-2 py-0.5 text-[10px] font-bold text-white shadow-sm">
            <Flame className="h-3 w-3" /> {insight.ratio.toFixed(1)}× avg
          </span>
        )}
        {onOpen && (
          <span className="absolute bottom-2.5 right-2.5 text-[10px] font-medium text-muted-foreground/80">
            Tap for details
          </span>
        )}
      </button>

      <div className="flex flex-1 flex-col gap-2.5 p-4">
        {/* Performance */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-medium text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Heart className="h-3 w-3" /> {fmtNum(post.likes)}
          </span>
          <span className="inline-flex items-center gap-1">
            <MessageCircle className="h-3 w-3" /> {fmtNum(post.comments)}
          </span>
          {post.views > 0 && (
            <span className="inline-flex items-center gap-1">
              <Play className="h-3 w-3" /> {fmtNum(post.views)}
            </span>
          )}
        </div>

        {showAdvisor && (
          <p className="truncate text-[11px] text-muted-foreground">
            <span className="font-semibold text-foreground/80">{advisor.name}</span>{" "}
            <span className="font-mono">{advisor.handle}</span>
          </p>
        )}

        {/* Big bold hook — the dominant element */}
        <button
          type="button"
          onClick={onOpen}
          disabled={!onOpen}
          className="text-left disabled:cursor-default"
        >
          <p className="line-clamp-3 font-serif text-base font-semibold leading-snug text-foreground">
            {hook}
          </p>
        </button>

        {/* Why it worked — kept to 1–2 lines */}
        {post.idea?.why && (
          <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
            <span className="font-semibold text-foreground/70">Why it worked: </span>
            {post.idea.why}
          </p>
        )}
        {/* Steal this angle */}
        {post.idea?.adapt && (
          <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
            <span className="font-semibold text-primary/80">Steal this angle: </span>
            {post.idea.adapt}
          </p>
        )}

        {/* Tags */}
        {insight.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {insight.tags.map((t) => (
              <span
                key={t}
                className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
              >
                {t}
              </span>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="mt-auto flex items-center gap-2 pt-1">
          <Button
            asChild
            size="sm"
            className="flex-1 gap-1.5 bg-gradient-primary text-primary-foreground shadow-sm hover:opacity-95"
          >
            <Link
              to={buildRemixUrl(post, advisor, {
                angle: insight.angle,
                structure: insight.structure,
              })}
            >
              <Wand2 className="h-3.5 w-3.5" /> Remix this
            </Link>
          </Button>
          {fmt === "short-video" && cloneLinkFor(post.url) && (
            <Button asChild variant="outline" size="sm" className="shrink-0 px-2.5" title="Clone this reel">
              <Link to={cloneLinkFor(post.url)!} aria-label="Clone this reel">
                <Clapperboard className="h-4 w-4" />
              </Link>
            </Button>
          )}
          {onToggleSave && (
            <Button
              variant="outline"
              size="sm"
              onClick={onToggleSave}
              aria-pressed={saved}
              aria-label={saved ? "Remove from saved" : "Save post"}
              title={saved ? "Saved" : "Save"}
              className={`shrink-0 px-2.5 ${saved ? "border-primary/50 text-primary" : ""}`}
            >
              {saved ? (
                <BookmarkCheck className="h-4 w-4" />
              ) : (
                <Bookmark className="h-4 w-4" />
              )}
            </Button>
          )}
          <Button
            asChild
            variant="outline"
            size="sm"
            className="shrink-0 gap-1.5"
            title="View original post"
          >
            <a href={post.url} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
}
