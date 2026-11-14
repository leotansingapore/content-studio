// All posts on /campaigns/:id (?view=grid; Leo's 11 Nov ask to "look at all of this all at once"): every post of the
// campaign by week, as a cover tile, or with ?boards=1 as its whole storyboard in a row: each carousel slide drawn,
// a made slideshow's slides, a video's script beats, a slideshow's or wall's hook and brief. Every tile is a link to
// the post in Review. Draws from the campaign only (src/lib/campaignBoard.ts); nothing here is stored or spent.

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { SlideThumb } from "@/components/slideshow/SlideCanvas";
import { postSlides, videoPriceOf } from "@/lib/campaignActions";
import { boardCounts, boardWeeks, frames, STATE_CHIP } from "@/lib/campaignBoard";
import { REMIX_MAKE, type Campaign, type CampaignPost } from "@/lib/campaigns";
import { FORMAT_NAME, shortDay, usd } from "@/lib/campaignWizard";
import { DEFAULT_BRAND, loadBrand } from "@/lib/carousel";
import { layoutSlide, renderSvg } from "@/lib/carouselLayout";
import { createCanvasMeasure, svgDataUrl } from "@/lib/carouselRender";
import { keyToDate } from "@/lib/dueDates";
import { loadSlideshows, type Slideshow } from "@/lib/slideshow";
import { lookOf } from "@/lib/slideshowDraw";
import { useUrlState } from "@/lib/urlState";
import { cn } from "@/lib/utils";
import { ensureCaptionFonts } from "@/lib/videoMedia";

const HEAD = "text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground";
const CHIP = "rounded-full px-2 py-0.5 text-[11px] font-medium";

export function useFontsReady(want: boolean) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!want) return;
    let live = true;
    void ensureCaptionFonts().then(() => live && setReady(true));
    return () => {
      live = false;
    };
  }, [want]);
  return ready;
}

/** A carousel post's slides drawn the way /carousel draws them from the same words, with the brand kit; [] where there is no canvas. */
export function slideUrls(userId: string, p: CampaignPost): string[] {
  if (typeof document === "undefined") return [];
  const brand = loadBrand(userId) ?? DEFAULT_BRAND;
  const measure = createCanvasMeasure();
  const slides = postSlides(p);
  return slides.map((s, i) => svgDataUrl(renderSvg(layoutSlide({ title: s.title, body: s.body, index: i, total: slides.length, brand }, measure))));
}

/** The words a draft's tile shows before it is made. */
export const draftWords = (p: Pick<CampaignPost, "hook" | "state">) => p.hook || (p.state === "failed" ? "This post could not be written." : "Waiting to be written.");

/** A draft's tile inside its cover box: a carousel's first slide (`slide`, from slideUrls), else its words. */
export const DraftTile = ({ words, slide }: { words: string; slide?: string }) =>
  slide ? <img src={slide} alt="" loading="lazy" className="h-full w-full object-cover" /> : (
    <p className="p-2.5 text-xs font-medium leading-snug [overflow-wrap:anywhere]"><span className="line-clamp-[7]">{words}</span></p>
  );

export default function AllPosts({ userId, campaign: c, posts, to }: { userId: string; campaign: Campaign; posts: CampaignPost[]; to: (n: number) => string }) {
  const [boards, setBoards] = useUrlState<"" | "1">("boards", "", { allowed: ["1"] });
  const all = boards === "1";
  const weeks = useMemo(
    () => boardWeeks(c, posts, (p) => (p.format === "ai-video" ? videoPriceOf(userId, p).usd : p.format === "slideshow" || p.format === "wall" ? REMIX_MAKE.usd : 0)),
    [c, posts, userId],
  );
  // every carousel's slides, drawn once per set of words
  const drawn = useMemo(
    () => Object.fromEntries(posts.filter((p) => p.format === "carousel" && p.hook).map((p) => [p.n, slideUrls(userId, p)])) as Record<number, string[]>,
    [posts, userId],
  );
  const shows = loadSlideshows(userId);
  const showOf = (p: CampaignPost) => (p.state === "made" && p.made?.kind === "slideshow" ? shows.find((s) => s.id === p.made?.id) : undefined);
  const ready = useFontsReady(posts.some((p) => !!showOf(p)));
  const k = boardCounts(posts);
  const day = (key: string) => shortDay(keyToDate(key));

  const stateChip = (p: CampaignPost) => (
    <span className={cn(CHIP, p.state === "made" ? "text-success" : p.state === "failed" ? "text-warning" : "text-muted-foreground")}>{STATE_CHIP[p.state]}</span>
  );
  const words = (p: CampaignPost, show: Slideshow | undefined) => (p.state === "made" ? (show?.title ?? p.made?.text) : null) || draftWords(p);

  const show = (s: Slideshow, n: number) => {
    const look = lookOf(userId, s);
    return s.slides.slice(0, n).map((sl) => <SlideThumb key={sl.id} slide={sl} size={s.size} look={look} ready={ready} className="h-auto w-full rounded-md" />);
  };

  const tile = (p: CampaignPost) => {
    const made = showOf(p);
    const cover = drawn[p.n]?.[0];
    return (
      <li key={p.n} className="min-w-0">
        <Link to={{ search: to(p.n) }} replace aria-label={`Post ${p.n}, ${day(p.day)}, ${FORMAT_NAME[p.format]}, ${STATE_CHIP[p.state]}: ${words(p, made)}`}
          className={cn("group flex h-full flex-col gap-1.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", p.state === "skipped" && "opacity-50")}>
          <div className={cn("relative aspect-[4/5] overflow-hidden rounded-lg border bg-muted/30 group-hover:border-primary/50", p.state === "ready" || p.state === "made" || p.state === "making" ? "border-border/60" : "border-dashed border-border")}>
            {made ? show(made, 1) : <DraftTile words={words(p, made)} slide={cover} />}
          </div>
          {/* under the cover, never over it: a chip on a text tile hid its words */}
          <div className="min-w-0 space-y-0.5">
            <p className={cn(HEAD, "tabular-nums")}>{day(p.day)}</p>
            <p className="truncate text-sm font-medium">{FORMAT_NAME[p.format]}</p>
            <p className={cn("text-xs", p.state === "made" ? "font-medium text-success" : p.state === "failed" ? "text-warning" : "text-muted-foreground")}>{STATE_CHIP[p.state]}</p>
          </div>
        </Link>
      </li>
    );
  };

  const row = (p: CampaignPost) => {
    const made = showOf(p);
    const pics = drawn[p.n];
    const list = made || pics?.length ? [] : frames(p);
    return (
      <li key={p.n} className={cn("grid gap-3 rounded-xl border border-border/60 bg-card p-3 shadow-card md:grid-cols-[11rem_minmax(0,1fr)]", p.state === "skipped" && "opacity-50")}>
        <Link to={{ search: to(p.n) }} replace className="flex min-w-0 flex-col gap-1 rounded-md hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <span className={HEAD}>{day(p.day)}</span>
          <span className="text-sm font-medium">{FORMAT_NAME[p.format]}</span>
          <span className="line-clamp-2 text-xs text-muted-foreground [overflow-wrap:anywhere]">{c.angles.find((a) => a.id === p.angleId)?.title}</span>
          <span className="mt-1 w-fit rounded-full border border-border/70">{stateChip(p)}</span>
        </Link>
        <ol aria-label={`Post ${p.n}'s storyboard`} className="flex min-w-0 gap-2 overflow-x-auto pb-1">
          {made ? show(made, made.slides.length).map((t, i) => <li key={i} className="w-24 shrink-0">{t}</li>)
            : pics?.length ? pics.map((u, i) => <li key={i} className="w-28 shrink-0"><img src={u} alt={`Slide ${i + 1} of ${pics.length}`} loading="lazy" className="w-full rounded-md border border-border/60" /></li>)
            : list.length ? list.map((f, i) => (
              <li key={i} className="w-44 shrink-0 rounded-md border border-border/60 bg-muted/20 p-2.5">
                <p className={HEAD}>{f.label}</p>
                <p className="mt-1 line-clamp-[8] whitespace-pre-wrap text-xs [overflow-wrap:anywhere]">{f.text}</p>
              </li>
            ))
            : <li className="py-3 text-sm text-muted-foreground">{words(p, made)}</li>}
        </ol>
      </li>
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="group" aria-label="Show" className="inline-flex rounded-lg border border-border/70 p-0.5">
          {([["", "Covers"], ["1", "Storyboards"]] as const).map(([v, label]) => (
            <button key={v} type="button" aria-pressed={boards === v} onClick={() => setBoards(v)}
              className={`h-11 rounded-md px-3 text-sm font-medium sm:h-9 ${boards === v ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}>
              {label}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">Tap a post to open it</p>
      </div>
      {weeks.map((w) => (
        <section key={w.week} aria-label={`Week ${w.week}`} className="grid gap-3 lg:grid-cols-[9rem_minmax(0,1fr)]">
          <div className="flex flex-wrap items-baseline gap-x-3 lg:block lg:space-y-0.5">
            <h3 className="text-sm font-semibold">Week {w.week}</h3>
            <p className="text-xs text-muted-foreground">{day(w.from)} to {day(w.to)}</p>
            <p className="text-xs tabular-nums text-muted-foreground">{w.posts.length} {w.posts.length === 1 ? "post" : "posts"}{w.usd > 0 ? ` | ${usd(w.usd)} to make` : ""}</p>
          </div>
          {all ? <ol className="space-y-2">{w.posts.map(row)}</ol> : <ol className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">{w.posts.map(tile)}</ol>}
        </section>
      ))}
      <p className="text-xs text-muted-foreground">{k.made} of {posts.filter((p) => p.state !== "skipped").length} made. Drafts stay drafts until you make them.</p>
    </div>
  );
}
