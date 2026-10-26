// A finished make in the agent's thread (docs/north-star/items/agent-chat.md, "MADE block"): "MADE" and the time it
// took, a thumbnail (a carousel's first slide, a play tile for a video, a picture tile, or the hook in a box), the
// title, "Here it is.", the button to open it and, for a made post, "Schedule it" (phase 7a). A make's warnings are
// the engine's (flagsFor, a person's brand only), drawn once on its card just above.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Image as ImageIcon, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isAppPath } from "@/components/agent/dockActions";
import type { AgentMsg } from "@/lib/agentThreads";
import { DEFAULT_BRAND, loadBrand, loadCarousels } from "@/lib/carousel";
import { getDraftById } from "@/lib/draftHistory";
import { links } from "@/lib/links";
import { heldOrLive } from "@/lib/needsYou";
import { layoutSlide, renderSvg } from "@/lib/carouselLayout";
import { createCanvasMeasure, svgDataUrl } from "@/lib/carouselRender";

type Job = NonNullable<AgentMsg["job"]>;

const VIDEO_KINDS = new Set<Job["kind"]>(["talk", "video"]);
/** The format word for "Your <format> is ready". */
export function madeNoun(job: Job): string {
  if (job.kind === "remix") return job.open?.startsWith("/carousel") ? "carousel" : "post";
  if (job.kind === "talk") return "talking video";
  if (job.kind === "image") return "picture";
  if (job.kind === "wall") return "wall of text";
  return job.kind;
}

/** "14s", "3m 43s". */
export function tookWords(job: Pick<Job, "startedAt" | "endedAt">): string {
  const s = Math.max(0, Math.round((Date.parse(job.endedAt ?? "") - Date.parse(job.startedAt)) / 1000));
  if (!Number.isFinite(s)) return "";
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

let measure: ReturnType<typeof createCanvasMeasure> | null = null;
function CarouselThumb({ userId, draftId, hook }: { userId: string; draftId: string; hook: string }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const c = loadCarousels(userId).find((x) => x.draftId === draftId);
    const s = c?.slides[0];
    if (!c || !s) return;
    try {
      measure ??= createCanvasMeasure();
      const brand = loadBrand(userId) ?? DEFAULT_BRAND;
      setUrl(svgDataUrl(renderSvg(layoutSlide({ title: s.title, body: s.body, index: 0, total: c.slides.length, brand, align: c.align, scale: c.scale, font: c.font, paper: c.paper }, measure))));
    } catch {
      setUrl("");
    }
  }, [userId, draftId]);
  return url ? <img src={url} alt="" className="h-full w-full object-cover" /> : <HookBox hook={hook} />;
}

const HookBox = ({ hook }: { hook: string }) => (
  <div className="flex h-full w-full items-center bg-muted p-2 text-[10px] font-medium leading-snug text-foreground">
    <span className="line-clamp-6 break-words">{hook}</span>
  </div>
);

export default function MadeBlock({ userId, job }: { userId: string; job: Job }) {
  const video = VIDEO_KINDS.has(job.kind) || !!job.open?.startsWith("/edit");
  const draftId = job.drafts?.[0];
  // Schedule it until the post has a time or is out, as Next up's made row reads it
  const schedule = !!draftId && !heldOrLive(getDraftById(userId, draftId) ?? {});
  const title = job.title ?? "";
  const open = job.open && isAppPath(job.open) ? job.open : null;
  return (
    <section aria-label={`Made: ${title}`} className="w-full max-w-xl rounded-xl border border-border bg-card shadow-card">
      <header className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-2">
        <span className="text-[11px] font-semibold tracking-[0.14em] text-success">MADE</span>
        <span className="text-[11px] tabular-nums text-muted-foreground">{tookWords(job)}</span>
      </header>
      <div className="flex gap-3 p-3">
        <div className={`relative shrink-0 overflow-hidden rounded-md border border-border/60 ${video ? "h-24 w-[54px]" : "h-[85px] w-[68px]"}`} aria-hidden>
          {video ? (
            <div className="flex h-full w-full items-center justify-center bg-foreground/85 text-background">
              <Play className="h-5 w-5 fill-current" />
            </div>
          ) : job.kind === "image" ? (
            <div className="flex h-full w-full items-center justify-center bg-muted text-muted-foreground">
              <ImageIcon className="h-5 w-5" />
            </div>
          ) : job.open?.startsWith("/carousel") && draftId ? (
            <CarouselThumb userId={userId} draftId={draftId} hook={title} />
          ) : (
            <HookBox hook={title} />
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div>
            {title && <p className="line-clamp-2 break-words text-sm font-medium">{title}</p>}
            <p className="text-sm text-muted-foreground">Here it is.</p>
          </div>
          {(open || schedule) && (
            <div className="flex flex-wrap gap-2">
              {open && (
                <Button asChild size="sm" className="h-11 sm:h-9">
                  <Link to={open}>{video ? "Open in the video editor" : "Open"}</Link>
                </Button>
              )}
              {/* the steps open on the post; only their last button posts (phase 7a) */}
              {schedule && (
                <Button asChild size="sm" variant="outline" className="h-11 sm:h-9">
                  <Link to={links.drafts({ schedule: draftId, step: "where" })}>Schedule it</Link>
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
