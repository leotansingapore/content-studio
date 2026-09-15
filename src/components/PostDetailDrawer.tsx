import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  X,
  Heart,
  MessageCircle,
  Play,
  ExternalLink,
  Wand2,
  Bookmark,
  BookmarkCheck,
  Flame,
  Film,
  Images,
  FileText,
} from "lucide-react";
import { buildRemixUrl, generatorFormat, type TopPost } from "@/lib/topPosts";
import { similarPosts, type ScoredPost } from "@/lib/postInsights";

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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <div className="text-sm leading-relaxed text-foreground">{children}</div>
    </div>
  );
}

const EMPTY = <span className="text-muted-foreground">Not analysed yet</span>;

export default function PostDetailDrawer({
  item,
  all,
  saved,
  onToggleSave,
  onOpen,
  onClose,
}: {
  item: ScoredPost | null;
  all: ScoredPost[];
  saved: boolean;
  onToggleSave: () => void;
  onOpen: (next: ScoredPost) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!item) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [item, onClose]);

  if (!item) return null;

  const { post, insight } = item;
  const fmt = generatorFormat(post);
  const Icon = FORMAT_ICON[fmt] ?? FileText;
  const advisor = { name: post.advisorName, handle: post.handle };
  const similar = similarPosts(item, all, 5);

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Post details">
      <button
        type="button"
        aria-label="Close details"
        onClick={onClose}
        className="absolute inset-0 bg-foreground/40 backdrop-blur-[1px]"
      />
      <div className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col border-l border-border/70 bg-background shadow-xl sm:max-w-lg">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
          <p className="text-sm font-semibold text-foreground">Post breakdown</p>
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              onClick={onToggleSave}
              aria-pressed={saved}
              className={`gap-1.5 ${saved ? "border-primary/50 text-primary" : ""}`}
            >
              {saved ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
              {saved ? "Saved" : "Save"}
            </Button>
            <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close" className="h-8 w-8 p-0">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4">
          {/* Cover */}
          <div className="relative flex aspect-[16/9] w-full items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-primary/10 via-brand/10 to-primary/[0.04]">
            <Icon className="h-12 w-12 text-primary/35" />
            <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-background/85 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-primary shadow-sm backdrop-blur">
              <Icon className="h-3 w-3" /> {FORMAT_LABEL[fmt] ?? "Post"}
            </span>
            {insight.breakout && (
              <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-warning/90 px-2 py-0.5 text-[10px] font-bold text-white shadow-sm">
                <Flame className="h-3 w-3" /> {insight.ratio.toFixed(1)}× creator avg
              </span>
            )}
          </div>

          {/* Creator + stats */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">{post.advisorName}</p>
              <a
                href={post.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-mono text-xs text-primary hover:underline"
              >
                {post.handle} <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            <div className="flex items-center gap-3 text-xs font-medium text-muted-foreground">
              <span className="inline-flex items-center gap-1"><Heart className="h-3.5 w-3.5" /> {fmtNum(post.likes)}</span>
              <span className="inline-flex items-center gap-1"><MessageCircle className="h-3.5 w-3.5" /> {fmtNum(post.comments)}</span>
              {post.views > 0 && (
                <span className="inline-flex items-center gap-1"><Play className="h-3.5 w-3.5" /> {fmtNum(post.views)}</span>
              )}
            </div>
          </div>

          {/* Hook */}
          <Field label="Hook / core idea">
            <span className="font-serif text-lg font-semibold leading-snug">
              {post.idea?.hook || post.caption.slice(0, 100) || EMPTY}
            </span>
          </Field>

          {/* Classification chips */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Topic">{insight.topic ?? EMPTY}</Field>
            <Field label="Content angle">{insight.angle ?? EMPTY}</Field>
            <Field label="Audience">
              {insight.audiences.length ? insight.audiences.join(", ") : EMPTY}
            </Field>
            <Field label="Format">{FORMAT_LABEL[fmt] ?? "Post"}</Field>
          </div>

          <Field label="Why it worked">{post.idea?.why ?? EMPTY}</Field>
          <Field label="Psychological trigger">{insight.trigger ?? EMPTY}</Field>
          <Field label="Typical structure for this format">{insight.structure}</Field>
          <Field label="How I'd adapt this for an FA">{post.idea?.adapt ?? EMPTY}</Field>

          {insight.breakout && (
            <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-xs leading-relaxed text-foreground/80">
              <span className="font-semibold text-warning">Why this is outperforming: </span>
              this post did about {insight.ratio.toFixed(1)}× {post.advisorName}'s own
              average engagement — a signal the idea travelled well beyond their
              usual reach, not just a big account posting as usual.
            </div>
          )}

          {/* Full caption */}
          <Field label="Full caption">
            <div className="max-h-56 overflow-y-auto whitespace-pre-line rounded-lg border border-border/50 bg-muted/20 p-3 text-xs leading-relaxed text-foreground/80">
              {post.caption || "(no caption)"}
            </div>
          </Field>

          {/* Similar ideas */}
          {similar.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Similar ideas to study
              </p>
              <div className="space-y-1.5">
                {similar.map((s) => {
                  const SIcon = FORMAT_ICON[generatorFormat(s.post)] ?? FileText;
                  return (
                    <button
                      key={s.post.advisorId + "-" + s.post.shortCode}
                      type="button"
                      onClick={() => onOpen(s)}
                      className="flex w-full items-center gap-2.5 rounded-lg border border-border/60 bg-card px-3 py-2 text-left transition-colors hover:border-primary/40 hover:bg-primary/5"
                    >
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <SIcon className="h-3.5 w-3.5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-medium text-foreground">
                          {s.post.idea?.hook || s.post.caption.slice(0, 60)}
                        </span>
                        <span className="block truncate text-[10px] text-muted-foreground">
                          {s.post.advisorName} · {fmtNum(s.post.likes)} likes
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer action */}
        <div className="border-t border-border/60 p-4">
          <Button
            asChild
            className="w-full gap-2 bg-gradient-primary text-primary-foreground shadow-sm hover:opacity-95"
          >
            <Link to={buildRemixUrl(post, advisor, { angle: insight.angle, structure: insight.structure })}>
              <Wand2 className="h-4 w-4" /> Remix this in Write
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
