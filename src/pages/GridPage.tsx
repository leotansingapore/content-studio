// Instagram grid (/grid): the profile grid as it will look once the planned
// posts go out, from My posts. A carousel shows its saved first slide, a video
// its frame, anything else a card in the brand colour with the hook.

import { useEffect, useMemo, useState } from "react";
import LibraryHeader from "@/components/library/LibraryHeader";
import CopyLinkButton from "@/components/CopyLinkButton";
import { Link } from "react-router-dom";
import { GridNineIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { supabase } from "@/lib/supabase";
import { loadDrafts, type DraftEntry } from "@/lib/draftHistory";
import { gridTiles } from "@/lib/igGrid";
import { DEFAULT_BRAND, loadBrand, loadCarousels, type CarouselBrand, type SavedCarousel } from "@/lib/carousel";
import { layoutSlide, readableOn, renderSvg } from "@/lib/carouselLayout";
import { createCanvasMeasure, svgDataUrl } from "@/lib/carouselRender";
import { loadProjects, type VideoProject } from "@/lib/videoProjects";
import { loadSlideshows, type Slideshow } from "@/lib/slideshow";
import { lookOf } from "@/lib/slideshowDraw";
import { draftHref } from "@/lib/library";
import { SlideThumb } from "@/components/slideshow/SlideCanvas";
import { useFontsReady } from "@/components/library/LibraryThumb";

const dayLabel = (day: string) => new Date(`${day}T00:00:00`).toLocaleDateString("en-SG", { weekday: "short", day: "numeric", month: "short" });

export default function GridPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<DraftEntry[]>([]);
  const [brand, setBrand] = useState<CarouselBrand>(DEFAULT_BRAND);
  const [carousels, setCarousels] = useState<SavedCarousel[]>([]);
  const [videos, setVideos] = useState<VideoProject[]>([]);
  const [shows, setShows] = useState<Slideshow[]>([]);
  const measure = useMemo(() => createCanvasMeasure(), []);

  useEffect(() => {
    document.title = "Grid - Postmosis";
    supabase.auth.getUser().then(({ data }) => {
      const id = data.user?.id ?? null;
      setUserId(id);
      setDrafts(loadDrafts(id));
      setBrand(loadBrand(id) ?? DEFAULT_BRAND);
      setCarousels(loadCarousels(id));
      setVideos(loadProjects(id));
      setShows(loadSlideshows(id));
    });
  }, []);

  const tiles = useMemo(() => gridTiles(drafts), [drafts]);
  const showOf = (d: DraftEntry) => shows.find((x) => x.draftId === d.id);
  const looks = useMemo(() => new Map(shows.map((x) => [x.id, lookOf(userId ?? "", x)])), [shows, userId]);
  const fontsReady = useFontsReady(shows.length > 0);
  const cover = (d: DraftEntry): string | null => {
    if (d.format === "carousel") {
      const c = carousels.find((x) => x.draftId === d.id);
      if (c?.slides.length) {
        const s = c.slides[0];
        return svgDataUrl(renderSvg(layoutSlide({ title: s.title, body: s.body, index: 0, total: c.slides.length, brand, align: c.align, scale: c.scale, font: c.font, paper: c.paper }, measure)));
      }
    }
    if (d.id.startsWith("video-")) return videos.find((v) => `video-${v.id}` === d.id)?.thumb || null;
    return null;
  };
  const planned = tiles.filter((t) => t.kind === "planned").length;

  return (
    <div className="space-y-5">
      {/* the Library's one header row: the switch says Grid, so the title is for screen readers */}
      <LibraryHeader
        title="Instagram grid"
        left={userId && <span className="text-xs text-muted-foreground">{planned} planned{tiles.length > planned ? `, ${tiles.length - planned} posted` : ""}</span>}
      />

      {userId && tiles.length === 0 ? (
        <EmptyState
          icon={GridNineIcon}
          title="No Instagram posts yet"
          actions={
            <Button asChild>
              <Link to="/calendar">Schedule a post</Link>
            </Button>
          }
        >
          Scheduled and posted Instagram posts show here as your profile grid, so you see it before it goes out.
        </EmptyState>
      ) : (
        <div className="mx-auto max-w-[480px] overflow-hidden rounded-xl border border-border/60 bg-card">
          <div className="flex items-center gap-3 border-b border-border/60 p-3">
            {brand.photo ? (
              <img src={brand.photo} alt="" className="h-12 w-12 rounded-full object-cover" />
            ) : (
              <span className="h-12 w-12 rounded-full bg-muted" aria-hidden />
            )}
            <div className="min-w-0">
              {brand.handle ? (
                <p className="truncate text-sm font-semibold">{brand.handle.replace(/^@/, "")}</p>
              ) : (
                <Link to="/brand" className="text-sm font-semibold text-primary hover:underline [@media(pointer:coarse)]:inline-flex [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:items-center">
                  Add your handle
                </Link>
              )}
              {brand.name && <p className="truncate text-xs text-muted-foreground">{brand.name}</p>}
            </div>
          </div>
          <ul className="grid grid-cols-3 gap-0.5 bg-border/60">
            {tiles.map((t) => {
              const show = showOf(t.draft);
              const look = show?.slides[0] ? looks.get(show.id) : undefined;
              const img = look ? null : cover(t.draft);
              const to = draftHref(t.draft, show, carousels.find((c) => c.draftId === t.draft.id));
              return (
                <li key={t.draft.id} className="group relative aspect-[3/4] bg-card">
                  <Link to={to} aria-label={`${t.kind === "planned" ? `Planned for ${dayLabel(t.day)}` : "Posted"}: ${t.draft.hook || t.draft.draft}`.slice(0, 140)}
                    className={`block h-full w-full ${t.kind === "posted" ? "opacity-60" : ""}`}>
                    {show && look ? (
                      <SlideThumb slide={show.slides[0]} size={show.size} look={look} ready={fontsReady} className="h-full w-full rounded-none object-cover" />
                    ) : img ? (
                      <img src={img} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="flex h-full w-full items-center p-2 text-[11px] font-semibold leading-snug sm:text-xs"
                        style={{ backgroundColor: brand.color, color: readableOn(brand.color) }}>
                        <span className="line-clamp-6">{t.draft.hook || t.draft.draft}</span>
                      </span>
                    )}
                    {t.kind === "planned" && (
                      <span className="absolute left-1 top-1 rounded bg-background/90 px-1.5 py-0.5 text-[10px] font-semibold text-foreground">{dayLabel(t.day)}</span>
                    )}
                  </Link>
                  {/* its own link, beside the tile rather than inside it; bottom corner, clear of the date chip on a phone-width tile */}
                  <CopyLinkButton
                    path={to}
                    label={`Copy link to ${(t.draft.hook || t.draft.draft || "this post").slice(0, 60)}`}
                    className="absolute bottom-1 right-1 rounded-full bg-background/90 text-foreground opacity-0 shadow-sm focus:opacity-100 group-hover:opacity-100 [@media(pointer:coarse)]:opacity-100"
                  />
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
