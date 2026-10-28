import {
  ThumbsUp,
  MessageCircle,
  Repeat2,
  Send,
  Heart,
  Bookmark,
  MoreHorizontal,
  Globe,
  Play,
  Clapperboard,
} from "lucide-react";
import { useEffect, useState } from "react";
import { splitScriptCaption } from "@/lib/scriptCaption";
import { supabase } from "@/lib/supabase";
import { loadBrand, type CarouselBrand } from "@/lib/carousel";
import { speakerFor } from "@/lib/remixBrand";
import { withCredit, withDisclosure, withSignOff, type DisclosureId } from "@/lib/plainText";
import type { RemixSource } from "@/lib/remixSource";
import { blankRanges, foldAt, MAX_CHARS, type PlatformId } from "@/lib/platformCounters";
import { isAdviser } from "@/lib/profession";

// A lightweight, platform-flavoured preview of a draft so the consultant can
// see roughly how the post will land as they edit. Not pixel-perfect — enough
// to sanity-check the hook, first lines, and length. It wears the brand kit
// (name, role, handle, photo), ends with the sign-off a copy adds, and cuts
// off at the feed's "...more" fold the way the platform would.

type Platform = string;

const MEDIA_LABELS: Record<string, string> = {
  carousel: "Your image / carousel",
  "short-video": "Your video · Reel / Short",
  story: "Your story frames",
  "text-post": "Your image",
};

/** The text with each blank still to fill ("[your number]") marked. */
function marked(text: string): React.ReactNode {
  const ranges = blankRanges(text);
  if (!ranges.length) return text;
  const out: React.ReactNode[] = [];
  let at = 0;
  for (const [a, b] of ranges) {
    out.push(
      text.slice(at, a),
      <mark key={a} className="rounded bg-amber-200 px-0.5 text-foreground dark:bg-amber-500/30">
        {text.slice(a, b)}
      </mark>,
    );
    at = b;
  }
  out.push(text.slice(at));
  return out;
}

function ScriptBlock({ script }: { script: string }) {
  return (
    <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
      <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        <Clapperboard className="h-3.5 w-3.5" /> Video script, spoken on
        camera, not posted as text
      </p>
      <p className="whitespace-pre-line font-sans text-xs leading-relaxed text-muted-foreground">
        {marked(script)}
      </p>
    </div>
  );
}

/** The brand kit, and whether the brand speaks as a business (speakerFor), once the user is known. */
function useBrandKit(): { brand: CarouselBrand | null; business: boolean } {
  const [kit, setKit] = useState<{ brand: CarouselBrand | null; business: boolean }>({ brand: null, business: false });
  useEffect(() => {
    let live = true;
    supabase.auth.getUser().then(({ data }) => {
      const id = data.user?.id;
      if (live) setKit({ brand: loadBrand(id), business: !!id && speakerFor(id) === "business" });
    });
    return () => {
      live = false;
    };
  }, []);
  return kit;
}

function Avatar({ brand }: { brand: CarouselBrand | null }) {
  if (brand?.photo) return <img src={brand.photo} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />;
  const initials = (brand?.name ?? "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-primary text-sm font-bold text-primary-foreground">
      {initials || "You"}
    </span>
  );
}

/** The caption cut at the feed's fold, with the platform's own "more" to open it. */
function Folded({ text, platform, more, lead }: { text: string; platform: string; more: string; lead?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  // Over the platform's limit: shown in full, with the part past the limit in red.
  // shortcut: counts the sign-off and disclosure but not UTM tags, so the red can start a few
  // characters later than Write's counter says; pass forPosting's text in if that matters.
  const max = MAX_CHARS[platform as PlatformId] ?? Infinity;
  const over = text.length > max;
  const cut = open || over ? null : foldAt(text, platform);
  return (
    <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">
      {lead}
      {over ? (
        <>
          {marked(text.slice(0, max))}
          <mark className="rounded bg-red-200 px-0.5 text-foreground dark:bg-red-500/30" title={`Past the ${max.toLocaleString("en-US")}-character limit`}>
            <span className="sr-only">Past the limit: </span>
            {text.slice(max)}
          </mark>
        </>
      ) : (
        marked(cut === null ? text : text.slice(0, cut).trimEnd())
      )}
      {cut !== null && (
        <button type="button" onClick={() => setOpen(true)} className="text-muted-foreground hover:underline">
          {more}
        </button>
      )}
    </p>
  );
}

export interface PreviewMedia {
  url: string;
  video: boolean;
}

/** The adviser's own pictures or video: the first one at the shape the feed shows, 4:5 to 1.91:1. */
function FeedMedia({ media }: { media: PreviewMedia[] }) {
  const [ratio, setRatio] = useState(1);
  const first = media[0]!;
  const fit = (w: number, h: number) => w && h && setRatio(Math.min(1.91, Math.max(0.8, w / h)));
  return (
    <div className="relative overflow-hidden bg-black" style={{ aspectRatio: ratio }}>
      {first.video ? (
        <video src={first.url} muted playsInline controls className="h-full w-full object-cover" onLoadedMetadata={(e) => fit(e.currentTarget.videoWidth, e.currentTarget.videoHeight)} />
      ) : (
        <img src={first.url} alt="" className="h-full w-full object-cover" onLoad={(e) => fit(e.currentTarget.naturalWidth, e.currentTarget.naturalHeight)} />
      )}
      {media.length > 1 && (
        <span className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-semibold text-white">1/{media.length}</span>
      )}
    </div>
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
  format,
  disclosure = [],
  media = [],
  source,
}: {
  text: string;
  platform: Platform;
  format?: string;
  /** Disclosure labels a copy adds after the sign-off. */
  disclosure?: readonly DisclosureId[];
  /** Pictures or a video attached in Write, shown in place of the placeholder. */
  media?: PreviewMedia[];
  /** The remix source: its "Idea from ..." line shows when credit is ticked. */
  source?: RemixSource;
}) {
  const { brand, business } = useBrandKit();
  const body = text.trim();
  if (!body) return <EmptyState />;

  const isShortVideo = format === "short-video";
  // Short-video drafts carry the spoken script + a suggested caption; only
  // the caption shows on the post itself.
  const split = isShortVideo
    ? splitScriptCaption(body)
    : { script: null, caption: body };
  const script = split.script;
  const caption = withCredit(withDisclosure(withSignOff(split.caption, brand?.signOff), disclosure), source);
  const handle = (brand?.handle ?? "").replace(/^@/, "").trim() || "your_handle";
  // a business has no job title: no line rather than the adviser's (live-p5w4 N2: "Financial Consultant" under ActivityTracker);
  // a person who isn't an adviser gets what they do, in their words
  const role = brand?.role?.trim() || (business ? "" : isAdviser(brand?.profession) ? "Financial Consultant" : brand!.profession!.trim());
  const mediaLabel = MEDIA_LABELS[format ?? ""] ?? "Your image / carousel";

  if (platform === "instagram") {
    return (
      <div className="space-y-2">
        <div className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-card">
          <div className="flex items-center gap-2 px-3 py-2.5">
            <Avatar brand={brand} />
            <span className="text-sm font-semibold text-foreground">
              {handle}
            </span>
            <MoreHorizontal className="ml-auto h-4 w-4 text-muted-foreground" />
          </div>
          {media.length ? (
            <FeedMedia key={media[0]!.url} media={media} />
          ) : (
            <div className="flex aspect-square flex-col items-center justify-center gap-2 bg-gradient-to-br from-primary/10 via-muted to-brand/10 text-xs text-muted-foreground">
              {isShortVideo && <Play className="h-8 w-8" />}
              {mediaLabel}
            </div>
          )}
          <div className="space-y-2 px-3 py-2.5">
            <div className="flex items-center gap-4 text-foreground">
              <Heart className="h-5 w-5" />
              <MessageCircle className="h-5 w-5" />
              <Send className="h-5 w-5" />
              <Bookmark className="ml-auto h-5 w-5" />
            </div>
            <Folded text={caption} platform="instagram" more="... more" lead={<><span className="font-semibold">{handle}</span>{" "}</>} />
          </div>
        </div>
        {script && <ScriptBlock script={script} />}
      </div>
    );
  }

  // LinkedIn / Facebook / default feed-card style.
  const isFacebook = platform === "facebook";
  return (
    <div className="space-y-2">
      <div className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-card">
        <div className="flex items-start gap-2.5 px-4 pt-3.5">
          <Avatar brand={brand} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold leading-tight text-foreground">
              {brand?.name?.trim() || "Your Name"}
            </p>
            {role && (
              <p className="truncate text-xs text-muted-foreground">
                {role}
              </p>
            )}
            <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
              Now · <Globe className="h-3 w-3" />
            </p>
          </div>
          <MoreHorizontal className="h-4 w-4 shrink-0 text-muted-foreground" />
        </div>
        <div className="px-4 py-3">
          <Folded text={caption} platform={isFacebook ? "facebook" : "linkedin"} more={isFacebook ? "... See more" : "...see more"} />
        </div>
        {media.length ? (
          <FeedMedia key={media[0]!.url} media={media} />
        ) : isShortVideo ? (
          <div className="mx-4 mb-3 flex items-center justify-center gap-2 rounded-lg bg-gradient-to-br from-primary/10 via-muted to-brand/10 py-8 text-xs text-muted-foreground">
            <Play className="h-6 w-6" /> Your video
          </div>
        ) : null}
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
      {script && <ScriptBlock script={script} />}
    </div>
  );
}
