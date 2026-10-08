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
import { withSignOff } from "@/lib/plainText";
import { foldAt } from "@/lib/platformCounters";

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

function ScriptBlock({ script }: { script: string }) {
  return (
    <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
      <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        <Clapperboard className="h-3.5 w-3.5" /> Video script — spoken on
        camera, not posted as text
      </p>
      <p className="whitespace-pre-line font-sans text-xs leading-relaxed text-muted-foreground">
        {script}
      </p>
    </div>
  );
}

function useBrandKit(): CarouselBrand | null {
  const [brand, setBrand] = useState<CarouselBrand | null>(null);
  useEffect(() => {
    let live = true;
    supabase.auth.getUser().then(({ data }) => live && setBrand(loadBrand(data.user?.id)));
    return () => {
      live = false;
    };
  }, []);
  return brand;
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
  const cut = open ? null : foldAt(text, platform);
  return (
    <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">
      {lead}
      {cut === null ? text : text.slice(0, cut).trimEnd()}
      {cut !== null && (
        <button type="button" onClick={() => setOpen(true)} className="text-muted-foreground hover:underline">
          {more}
        </button>
      )}
    </p>
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
}: {
  text: string;
  platform: Platform;
  format?: string;
}) {
  const brand = useBrandKit();
  const body = text.trim();
  if (!body) return <EmptyState />;

  const isShortVideo = format === "short-video";
  // Short-video drafts carry the spoken script + a suggested caption; only
  // the caption shows on the post itself.
  const split = isShortVideo
    ? splitScriptCaption(body)
    : { script: null, caption: body };
  const script = split.script;
  const caption = withSignOff(split.caption, brand?.signOff);
  const handle = (brand?.handle ?? "").replace(/^@/, "").trim() || "your_handle";
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
          <div className="flex aspect-square flex-col items-center justify-center gap-2 bg-gradient-to-br from-primary/10 via-muted to-brand/10 text-xs text-muted-foreground">
            {isShortVideo && <Play className="h-8 w-8" />}
            {mediaLabel}
          </div>
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
            <p className="truncate text-xs text-muted-foreground">
              {brand?.role?.trim() || "Financial Consultant"}
            </p>
            <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
              Now · <Globe className="h-3 w-3" />
            </p>
          </div>
          <MoreHorizontal className="h-4 w-4 shrink-0 text-muted-foreground" />
        </div>
        <div className="px-4 py-3">
          <Folded text={caption} platform={isFacebook ? "facebook" : "linkedin"} more={isFacebook ? "... See more" : "...see more"} />
        </div>
        {isShortVideo && (
          <div className="mx-4 mb-3 flex items-center justify-center gap-2 rounded-lg bg-gradient-to-br from-primary/10 via-muted to-brand/10 py-8 text-xs text-muted-foreground">
            <Play className="h-6 w-6" /> Your video
          </div>
        )}
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
