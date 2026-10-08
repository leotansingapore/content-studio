// Instagram grid (/grid): the profile grid as it will look once the planned
// posts go out, from My posts. A carousel shows its saved first slide, a video
// its frame, anything else a card in the brand colour with the hook.

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import SectionTabs, { PIPELINE_TABS } from "@/components/SectionTabs";
import { supabase } from "@/lib/supabase";
import { loadDrafts, type DraftEntry } from "@/lib/draftHistory";
import { gridTiles } from "@/lib/igGrid";
import { DEFAULT_BRAND, loadBrand, loadCarousels, type CarouselBrand, type SavedCarousel } from "@/lib/carousel";
import { layoutSlide, readableOn, renderSvg } from "@/lib/carouselLayout";
import { createCanvasMeasure, svgDataUrl } from "@/lib/carouselRender";
import { loadProjects, type VideoProject } from "@/lib/videoProjects";

const dayLabel = (day: string) => new Date(`${day}T00:00:00`).toLocaleDateString("en-SG", { weekday: "short", day: "numeric", month: "short" });

export default function GridPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<DraftEntry[]>([]);
  const [brand, setBrand] = useState<CarouselBrand>(DEFAULT_BRAND);
  const [carousels, setCarousels] = useState<SavedCarousel[]>([]);
  const [videos, setVideos] = useState<VideoProject[]>([]);
  const measure = useMemo(() => createCanvasMeasure(), []);

  useEffect(() => {
    document.title = "Grid - Content Studio";
    supabase.auth.getUser().then(({ data }) => {
      const id = data.user?.id ?? null;
      setUserId(id);
      setDrafts(loadDrafts(id));
      setBrand(loadBrand(id) ?? DEFAULT_BRAND);
      setCarousels(loadCarousels(id));
      setVideos(loadProjects(id));
    });
  }, []);

  const tiles = useMemo(() => gridTiles(drafts), [drafts]);
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
      <SectionTabs tabs={PIPELINE_TABS} />
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="font-serif text-2xl font-semibold tracking-tight sm:text-3xl">Instagram grid</h1>
        {userId && <span className="text-sm text-muted-foreground">{planned} planned{tiles.length > planned ? `, ${tiles.length - planned} posted` : ""}</span>}
      </header>

      {userId && tiles.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No Instagram posts scheduled or posted yet.{" "}
          <Link to="/calendar" className="font-semibold text-primary hover:underline">Schedule one</Link>
        </div>
      ) : (
        <div className="mx-auto max-w-[480px] overflow-hidden rounded-xl border border-border/60 bg-card">
          <div className="flex items-center gap-3 border-b border-border/60 p-3">
            {brand.photo ? (
              <img src={brand.photo} alt="" className="h-12 w-12 rounded-full object-cover" />
            ) : (
              <span className="h-12 w-12 rounded-full bg-muted" aria-hidden />
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{brand.handle?.replace(/^@/, "") || "your_handle"}</p>
              {brand.name && <p className="truncate text-xs text-muted-foreground">{brand.name}</p>}
            </div>
          </div>
          <ul className="grid grid-cols-3 gap-0.5 bg-border/60">
            {tiles.map((t) => {
              const img = cover(t.draft);
              const to = t.draft.format === "carousel" && carousels.some((c) => c.draftId === t.draft.id) ? `/carousel?draft=${encodeURIComponent(t.draft.id)}` : `/generate?draft=${encodeURIComponent(t.draft.id)}`;
              return (
                <li key={t.draft.id} className="relative aspect-[3/4] bg-card">
                  <Link to={to} aria-label={`${t.kind === "planned" ? `Planned for ${dayLabel(t.day)}` : "Posted"}: ${t.draft.hook || t.draft.draft}`.slice(0, 140)}
                    className={`block h-full w-full ${t.kind === "posted" ? "opacity-60" : ""}`}>
                    {img ? (
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
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
