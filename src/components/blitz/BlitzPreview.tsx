// A Blitz card's post as it will look: a slideshow's slides one at a time with arrows and dots (Fastlane's in-card
// arrows), or a wall of text's words in its white bold block over a plain background (the clip comes when the wall
// maker turns the kept words into the video).

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { FRAME_W, frameHeight, loadSlideshows, type ShowSlide, type Slideshow } from "@/lib/slideshow";
import { drawSlide, lookOf, pictureKey, slidePicture, type SlideLook } from "@/lib/slideshowDraw";
import { ensureCaptionFonts } from "@/lib/videoMedia";
import type { BlitzCard } from "@/lib/blitz";
import { cn } from "@/lib/utils";

const K = 0.5;

function SlideView({ slide, size, look }: { slide: ShowSlide; size: Slideshow["size"]; look: SlideLook }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let live = true;
    void Promise.all([slidePicture(slide), ensureCaptionFonts()]).then(([blob]) => {
      const ctx = ref.current?.getContext("2d");
      if (!live || !ctx) return;
      ctx.setTransform(K, 0, 0, K, 0, 0);
      const key = pictureKey(slide);
      return drawSlide(ctx, slide, size, new Map(key && blob ? [[key, blob]] : []), look);
    });
    return () => {
      live = false;
    };
  }, [slide, size, look]);
  return <canvas ref={ref} width={FRAME_W * K} height={frameHeight(size) * K} className="block h-full w-full bg-muted" aria-hidden />;
}

function ShowPreview({ userId, showId }: { userId: string; showId: string }) {
  const show = useMemo(() => loadSlideshows(userId).find((s) => s.id === showId), [userId, showId]);
  const look = useMemo(() => (show ? lookOf(userId, show) : {}), [userId, show]);
  const [i, setI] = useState(0);
  if (!show) return <p className="p-6 text-center text-sm text-muted-foreground">This slideshow is no longer in Slideshows.</p>;
  const n = show.slides.length;
  const arrow = "absolute top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-background/80 text-foreground shadow disabled:opacity-0";
  return (
    <div className="relative" role="group" aria-roledescription="slideshow" aria-label={`Slide ${i + 1} of ${n}`}>
      <div className="overflow-hidden rounded-xl" style={{ aspectRatio: `${FRAME_W} / ${frameHeight(show.size)}` }}>
        <SlideView slide={show.slides[i]} size={show.size} look={look} />
      </div>
      <button type="button" className={cn(arrow, "left-2")} onClick={() => setI(i - 1)} disabled={i === 0} aria-label="Previous slide">
        <ChevronLeft className="h-5 w-5" />
      </button>
      <button type="button" className={cn(arrow, "right-2")} onClick={() => setI(i + 1)} disabled={i >= n - 1} aria-label="Next slide">
        <ChevronRight className="h-5 w-5" />
      </button>
      <div className="absolute inset-x-0 bottom-2 flex justify-center gap-1" aria-hidden>
        {show.slides.map((s, n2) => <span key={s.id} className={cn("h-1.5 w-1.5 rounded-full", n2 === i ? "bg-white" : "bg-white/50")} />)}
      </div>
    </div>
  );
}

export default function BlitzPreview({ userId, card }: { userId: string; card: BlitzCard }) {
  if (card.format === "slideshow" && card.showId) return <ShowPreview userId={userId} showId={card.showId} />;
  return (
    <div className="flex aspect-[9/16] items-center justify-center overflow-hidden rounded-xl bg-black p-6">
      <p className="whitespace-pre-line text-center text-[15px] font-bold leading-snug text-white">{card.wall?.text}</p>
    </div>
  );
}
