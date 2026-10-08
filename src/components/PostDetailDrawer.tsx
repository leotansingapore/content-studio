import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import VideoEmbed from "@/components/VideoEmbed";
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
  Instagram,
  Clapperboard,
} from "lucide-react";
import { buildRemixUrl, compactNum, generatorFormat } from "@/lib/topPosts";
import { embedUrlFor, safeExternalUrl } from "@/lib/embed";
import { cloneLinkFor } from "@/lib/reelClone";
import { similarPosts, type ScoredPost } from "@/lib/postInsights";

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
  // A centred modal on desktop, a full-screen sheet on a phone. Escape and the
  // backdrop close it, and focus goes back to the card that opened it.
  const open = item !== null;
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCloseRef.current();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      opener?.focus?.();
    };
  }, [open]);

  if (!item) return null;

  const { post, insight } = item;
  const fmt = generatorFormat(post);
  const Icon = FORMAT_ICON[fmt] ?? FileText;
  const advisor = { name: post.advisorName, handle: post.handle };
  const similar = similarPosts(item, all, 5);
  const remixUrl = buildRemixUrl(post, advisor, { angle: insight.angle, structure: insight.structure });
  const canEmbed = embedUrlFor(post.url) !== null;
  const cloneUrl = fmt === "short-video" ? cloneLinkFor(post.url) : null;

  // Portalled to <body>: inside the page the sidebar's stacking context sits
  // above the backdrop, so a backdrop click landed on a nav link. z-[70] puts
  // it over the Ask dock (60).
  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-stretch justify-center sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Post by ${post.handle}`}
    >
      <button
        type="button"
        tabIndex={-1}
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
      />
      <div className="relative flex h-full w-full flex-col overflow-hidden bg-background shadow-xl sm:h-auto sm:max-h-[92vh] sm:max-w-md sm:rounded-2xl sm:border sm:border-border/70">
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur transition-colors hover:bg-black/75"
        >
          <X className="h-4 w-4" />
        </button>

        <div key={post.shortCode} className="flex-1 overflow-y-auto">
          {/* The post itself, playing in the platform's own player */}
          <div className="relative bg-black">
            {canEmbed ? (
              <VideoEmbed
                url={post.url}
                autoPlay
                label={`${post.handle} ${FORMAT_LABEL[fmt] ?? "post"}`}
                className="max-w-[calc(60vh*0.5625)] rounded-none border-0 bg-black"
              />
            ) : (
              <div className="relative mx-auto flex aspect-[9/16] w-full max-w-[calc(60vh*0.5625)] items-center justify-center">
                {post.cover ? (
                  <img src={post.cover} alt="" className="absolute inset-0 h-full w-full object-contain" />
                ) : (
                  <Icon className="h-12 w-12 text-white/40" />
                )}
              </div>
            )}
            {/* Over a cover only: on the live embed they hid the creator's name. */}
            {!canEmbed && <div className="pointer-events-none absolute left-3 top-3 z-10 flex gap-1.5">
              <span className="inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-1 text-[11px] font-semibold text-white backdrop-blur">
                <Instagram className="h-3 w-3" /> Instagram
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-1 text-[11px] font-semibold text-white backdrop-blur">
                <Icon className="h-3 w-3" /> {fmt === "short-video" ? "Video" : FORMAT_LABEL[fmt] ?? "Post"}
              </span>
            </div>}
          </div>

          <div className="space-y-5 p-4">
            {/* Creator + numbers */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-mono text-sm font-semibold text-foreground">{post.handle}</p>
                <p className="truncate text-xs text-muted-foreground">{post.advisorName}</p>
              </div>
              <div className="flex items-center gap-3 text-xs font-medium text-muted-foreground">
                {post.views > 0 && (
                  <span className="inline-flex items-center gap-1"><Play className="h-3.5 w-3.5" /> {compactNum(post.views)}</span>
                )}
                <span className="inline-flex items-center gap-1"><Heart className="h-3.5 w-3.5" /> {compactNum(post.likes)}</span>
                <span className="inline-flex items-center gap-1"><MessageCircle className="h-3.5 w-3.5" /> {compactNum(post.comments)}</span>
                {insight.breakout && (
                  <span className="inline-flex items-center gap-0.5 font-semibold text-warning" title="Engagement vs this creator's average">
                    <Flame className="h-3.5 w-3.5" /> {insight.ratio.toFixed(1)}x
                  </span>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Button asChild className="w-full gap-2 bg-gradient-primary text-primary-foreground shadow-sm hover:opacity-95">
                <Link to={remixUrl}>
                  <Wand2 className="h-4 w-4" /> Remix this for my business
                </Link>
              </Button>
              <div className="flex gap-2">
                <Button asChild variant="outline" className="flex-1 gap-2">
                  <a href={safeExternalUrl(post.url) ?? undefined} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4" /> Open original
                  </a>
                </Button>
                {cloneUrl && (
                  <Button asChild variant="outline" className="gap-1.5" title="Clone this reel">
                    <Link to={cloneUrl}>
                      <Clapperboard className="h-4 w-4" /> Clone
                    </Link>
                  </Button>
                )}
                <Button
                  variant="outline"
                  onClick={onToggleSave}
                  aria-pressed={saved}
                  className={`gap-1.5 ${saved ? "border-primary/50 text-primary" : ""}`}
                >
                  {saved ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
                  {saved ? "Saved" : "Save"}
                </Button>
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
                this post did about {insight.ratio.toFixed(1)}x {post.advisorName}'s own
                average engagement, a signal the idea travelled well beyond their
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
                            {s.post.advisorName}, {compactNum(s.post.likes)} likes
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
