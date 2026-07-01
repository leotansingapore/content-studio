import {
  ThumbsUp,
  MessageCircle,
  Repeat2,
  Send,
  Heart,
  Bookmark,
  MoreHorizontal,
  Globe,
} from "lucide-react";

// A lightweight, platform-flavoured preview of a draft so the consultant can
// see roughly how the post will land as they edit. Not pixel-perfect — enough
// to sanity-check the hook, first lines, and length.

type Platform = string;

function Avatar() {
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-primary text-sm font-bold text-primary-foreground">
      You
    </span>
  );
}

function EmptyState() {
  return (
    <div className="flex h-full min-h-[200px] items-center justify-center rounded-xl border border-dashed border-border/70 bg-muted/20 p-6 text-center text-xs text-muted-foreground">
      Your post preview shows up here as you write.
    </div>
  );
}

export default function PostPreview({
  text,
  platform,
}: {
  text: string;
  platform: Platform;
}) {
  const body = text.trim();
  if (!body) return <EmptyState />;

  const lines = body.split("\n");

  if (platform === "instagram") {
    const caption = body;
    return (
      <div className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-card">
        <div className="flex items-center gap-2 px-3 py-2.5">
          <Avatar />
          <span className="text-sm font-semibold text-foreground">
            your_handle
          </span>
          <MoreHorizontal className="ml-auto h-4 w-4 text-muted-foreground" />
        </div>
        <div className="flex aspect-square items-center justify-center bg-gradient-to-br from-primary/10 via-muted to-brand/10 text-xs text-muted-foreground">
          Your image / carousel
        </div>
        <div className="space-y-2 px-3 py-2.5">
          <div className="flex items-center gap-4 text-foreground">
            <Heart className="h-5 w-5" />
            <MessageCircle className="h-5 w-5" />
            <Send className="h-5 w-5" />
            <Bookmark className="ml-auto h-5 w-5" />
          </div>
          <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">
            <span className="font-semibold">your_handle</span>{" "}
            {caption}
          </p>
        </div>
      </div>
    );
  }

  // LinkedIn / Facebook / default feed-card style.
  const isFacebook = platform === "facebook";
  return (
    <div className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-card">
      <div className="flex items-start gap-2.5 px-4 pt-3.5">
        <Avatar />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-tight text-foreground">
            Your Name
          </p>
          <p className="truncate text-xs text-muted-foreground">
            Financial Consultant
          </p>
          <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
            Now · <Globe className="h-3 w-3" />
          </p>
        </div>
        <MoreHorizontal className="h-4 w-4 shrink-0 text-muted-foreground" />
      </div>
      <div className="px-4 py-3">
        <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">
          {lines.slice(0, 20).join("\n")}
        </p>
      </div>
      <div className="mx-4 border-t border-border/60" />
      <div className="flex items-center justify-around px-2 py-1.5 text-xs font-medium text-muted-foreground">
        <span className="flex items-center gap-1.5 rounded-md px-2 py-1.5">
          <ThumbsUp className="h-4 w-4" /> Like
        </span>
        <span className="flex items-center gap-1.5 rounded-md px-2 py-1.5">
          <MessageCircle className="h-4 w-4" /> Comment
        </span>
        {!isFacebook && (
          <span className="flex items-center gap-1.5 rounded-md px-2 py-1.5">
            <Repeat2 className="h-4 w-4" /> Repost
          </span>
        )}
        <span className="flex items-center gap-1.5 rounded-md px-2 py-1.5">
          <Send className="h-4 w-4" /> Send
        </span>
      </div>
    </div>
  );
}
