import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  Heart,
  MessageCircle,
  Play,
  ExternalLink,
  Copy,
  Wand2,
  Lightbulb,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import {
  buildRemixUrl,
  generatorFormat,
  type TopPost,
} from "@/lib/topPosts";

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

export default function TopPostCard({
  post,
  advisor,
  showAdvisor,
}: {
  post: TopPost;
  advisor: { name: string; handle: string };
  showAdvisor?: boolean;
}) {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const fmt = generatorFormat(post);

  const copyCaption = async () => {
    try {
      await navigator.clipboard.writeText(post.caption);
      toast({
        title: "Caption copied",
        description: "The full caption is on your clipboard.",
      });
    } catch {
      toast({
        title: "Copy failed",
        description: "Select the caption text and copy manually.",
        variant: "destructive",
      });
    }
  };

  const longCaption = post.caption.length > 220;

  return (
    <div className="flex h-full flex-col gap-3 rounded-xl border border-border/60 bg-card p-4 shadow-card transition-all hover:border-primary/40 hover:shadow-elegant">
      {/* Metrics + format */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-primary">
          {FORMAT_LABEL[fmt] ?? "Post"}
        </span>
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
          <Heart className="h-3 w-3" /> {fmtNum(post.likes)}
        </span>
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
          <MessageCircle className="h-3 w-3" /> {fmtNum(post.comments)}
        </span>
        {post.views > 0 && (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
            <Play className="h-3 w-3" /> {fmtNum(post.views)}
          </span>
        )}
      </div>

      {showAdvisor && (
        <p className="text-[11px] font-semibold text-foreground/80">
          {advisor.name}{" "}
          <span className="font-mono font-normal text-muted-foreground">
            {advisor.handle}
          </span>
        </p>
      )}

      {/* Idea breakdown */}
      {post.idea ? (
        <div className="space-y-1.5 rounded-lg border border-primary/20 bg-primary/5 p-2.5">
          <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">
            <Lightbulb className="h-3 w-3" /> The idea
          </p>
          <p className="text-sm font-medium leading-snug text-foreground">
            {post.idea.hook}
          </p>
          <p className="text-[11px] leading-snug text-muted-foreground">
            <span className="font-semibold text-foreground/70">Why it worked:</span>{" "}
            {post.idea.why}
          </p>
          <p className="text-[11px] leading-snug text-muted-foreground">
            <span className="font-semibold text-foreground/70">Make it yours:</span>{" "}
            {post.idea.adapt}
          </p>
        </div>
      ) : (
        <p className="rounded-lg border border-border/50 bg-muted/20 px-2.5 py-1.5 text-[11px] italic text-muted-foreground">
          Idea breakdown refreshing - open the post to study it directly.
        </p>
      )}

      {/* Caption */}
      <div className="flex-1">
        <p
          className={`whitespace-pre-line text-[12px] leading-relaxed text-foreground/80 ${
            expanded ? "" : "line-clamp-4"
          }`}
        >
          {post.caption || "(no caption)"}
        </p>
        {longCaption && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="mt-1 inline-flex items-center gap-0.5 text-[11px] font-semibold text-primary hover:underline"
          >
            {expanded ? (
              <>
                Less <ChevronUp className="h-3 w-3" />
              </>
            ) : (
              <>
                Full caption <ChevronDown className="h-3 w-3" />
              </>
            )}
          </button>
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        <Button
          asChild
          size="sm"
          className="flex-1 gap-1.5 bg-gradient-primary text-primary-foreground shadow-sm hover:opacity-95"
        >
          <Link to={buildRemixUrl(post, advisor)}>
            <Wand2 className="h-3.5 w-3.5" /> Remix in Write
          </Link>
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={copyCaption}
          className="gap-1.5"
        >
          <Copy className="h-3.5 w-3.5" /> Caption
        </Button>
        <Button asChild variant="outline" size="sm" className="gap-1.5">
          <a href={post.url} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-3.5 w-3.5" /> Post
          </a>
        </Button>
      </div>
    </div>
  );
}
