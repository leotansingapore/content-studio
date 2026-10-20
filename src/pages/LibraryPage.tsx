// Your library (/library, Leo's sign-ins only; docs/north-star/items/publish-library.md): every post, carousel,
// slideshow, video and AI picture in one grid, filtered by format, status and search, with what is still being made
// beside it. Read-only apart from its links: each card opens the page that made it. Nothing is stored here.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Search, X } from "lucide-react";
import LibraryCard from "@/components/library/LibraryCard";
import MakingNow, { useLibraryJobs } from "@/components/library/MakingNow";
import SectionTabs, { PIPELINE_TABS } from "@/components/SectionTabs";
import { Button } from "@/components/ui/button";
import { FilterChip } from "@/components/ui/filter-chip";
import { Input } from "@/components/ui/input";
import { DEFAULT_BRAND, loadBrand, loadCarousels } from "@/lib/carousel";
import { loadDrafts, onDraftsChanged } from "@/lib/draftHistory";
import {
  FORMAT_LABELS,
  LIBRARY_FORMATS,
  LIBRARY_STATUSES,
  STATUS_LABELS,
  buildLibrary,
  countBy,
  filterLibrary,
  type LibraryFormat,
  type LibraryStatus,
} from "@/lib/library";
import { links } from "@/lib/links";
import { loadMedia } from "@/lib/mediaLibrary";
import { loadSlideshows, onSlideshowsChanged } from "@/lib/slideshow";
import { useLeoUser } from "@/lib/useLeoOnly";
import { useUrlItem, useUrlSearch, useUrlState, useUrlUpdate } from "@/lib/urlState";
import { ensureCaptionFonts } from "@/lib/videoMedia";
import { loadProjects } from "@/lib/videoProjects";
import NotFoundPage from "@/pages/NotFoundPage";

const TOUCH = "[@media(pointer:coarse)]:min-h-11";
const FORMATS = ["all", ...LIBRARY_FORMATS] as const;
const STATUSES = ["all", ...LIBRARY_STATUSES] as const;

export default function LibraryPage() {
  const leo = useLeoUser();
  if (leo === undefined) return <div className="min-h-[40vh]" aria-busy="true" />;
  if (!leo) return <NotFoundPage />;
  return <Library userId={leo.id} />;
}

/** The stores, read at once from this device: no page spinner, only thumbs load. */
const readStores = (userId: string) => ({
  drafts: loadDrafts(userId),
  carousels: loadCarousels(userId),
  slideshows: loadSlideshows(userId),
  projects: loadProjects(userId),
  media: loadMedia(userId),
  brand: loadBrand(userId) ?? DEFAULT_BRAND,
});

/** Slideshow thumbs measure with the caption fonts; only wait for them when there is a slideshow to draw. */
function useFontsReady(want: boolean) {
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

function Library({ userId }: { userId: string }) {
  const [format, setFormat] = useUrlState<(typeof FORMATS)[number]>("format", "all", { allowed: FORMATS });
  const [status, setStatus] = useUrlState<(typeof STATUSES)[number]>("status", "all", { allowed: STATUSES });
  const [text, setText, q] = useUrlSearch("q");
  const [panel, openPanel, closePanel] = useUrlItem("panel");
  const update = useUrlUpdate();
  const fmt: LibraryFormat | null = format === "all" ? null : format;
  const st: LibraryStatus | null = status === "all" ? null : status;
  const jobs = useLibraryJobs(links.library({ format: fmt ?? undefined, status: st ?? undefined, q }));

  const [stores, setStores] = useState(() => readStores(userId));
  const reload = useCallback(() => setStores(readStores(userId)), [userId]);
  useEffect(() => {
    const offs = [onDraftsChanged(reload), onSlideshowsChanged(reload)];
    return () => offs.forEach((off) => off());
  }, [reload]);
  // a job that starts, ends or fails may have saved a draft, a picture or a slideshow; progress alone saves nothing
  const settled = jobs.map((j) => `${j.kind}:${j.state}`).join();
  useEffect(reload, [reload, settled]);
  const fontsReady = useFontsReady(stores.slideshows.length > 0);

  const items = useMemo(() => buildLibrary({ ...stores, jobs, now: new Date() }), [stores, jobs]);
  const scoped = useMemo(() => filterLibrary(items, { format: fmt, q }), [items, fmt, q]);
  const counts = countBy(scoped);
  const shown = st ? scoped.filter((i) => i.status === st) : scoped;
  const making = jobs.filter((j) => j.state === "working").length;
  const carouselById = useMemo(() => new Map(stores.carousels.map((c) => [c.id, c])), [stores.carousels]);
  const showById = useMemo(() => new Map(stores.slideshows.map((s) => [s.id, s])), [stores.slideshows]);

  const clear = () => {
    setText("");
    update({ format: null, status: null, q: null });
  };

  return (
    <div className="space-y-5">
      <SectionTabs tabs={PIPELINE_TABS} />
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_16rem] lg:items-start lg:gap-8">
        <div className="min-w-0 space-y-4">
          <header className="flex flex-wrap items-center justify-between gap-2">
            <h1 className="font-serif text-2xl font-semibold leading-tight tracking-tight text-foreground sm:text-3xl">Library</h1>
            <Button size="sm" variant="outline" onClick={() => openPanel("making")} className={`lg:hidden ${TOUCH}`}>
              Making now ({making})
            </Button>
          </header>

          {items.length === 0 ? (
            <div className="space-y-3 rounded-xl border border-dashed border-border p-8 text-center">
              <p className="text-sm text-muted-foreground">Nothing made yet.</p>
              <Button asChild className={TOUCH}>
                <Link to={links.swipe()}>Find a post to remix</Link>
              </Button>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <div role="group" aria-label="Format" className="scrollbar-none flex gap-1.5 overflow-x-auto">
                  {FORMATS.map((f) => (
                    <FilterChip key={f} active={format === f} onClick={() => setFormat(f)}>
                      {f === "all" ? "All formats" : FORMAT_LABELS[f]}
                    </FilterChip>
                  ))}
                </div>
                <div role="group" aria-label="Status" className="scrollbar-none flex gap-1.5 overflow-x-auto">
                  {STATUSES.map((s) => (
                    <FilterChip key={s} active={status === s} onClick={() => setStatus(s)} count={counts[s]}>
                      {s === "all" ? "All" : STATUS_LABELS[s]}
                    </FilterChip>
                  ))}
                </div>
                <div className="relative max-w-md">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
                  <Input
                    type="search"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Search titles, words and captions"
                    aria-label="Search titles, words and captions"
                    className={`pl-8 ${TOUCH}`}
                  />
                </div>
              </div>

              {shown.length === 0 ? (
                <div className="space-y-3 rounded-xl border border-dashed border-border p-8 text-center">
                  <p className="text-sm text-muted-foreground">Nothing matches these filters.</p>
                  <Button variant="outline" onClick={clear} className={TOUCH}>
                    Clear filters
                  </Button>
                </div>
              ) : (
                <ul className="grid grid-cols-2 items-stretch gap-x-3 gap-y-6 sm:grid-cols-3 xl:grid-cols-4">
                  {shown.map((item) => (
                    <li key={item.key} className="flex min-w-0">
                      <LibraryCard
                        item={item}
                        brand={stores.brand}
                        carousel={item.thumb?.kind === "slide" ? carouselById.get(item.thumb.carouselId) : undefined}
                        show={item.thumb?.kind === "show" ? showById.get(item.thumb.showId) : undefined}
                        userId={userId}
                        fontsReady={fontsReady}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>

        <aside className="hidden lg:block lg:sticky lg:top-4">
          <MakingNow items={items} jobs={jobs} className="rounded-xl border border-border/60 bg-card p-4" />
        </aside>
      </div>

      <MakingSheet open={panel === "making"} onClose={closePanel}>
        <MakingNow items={items} jobs={jobs} />
      </MakingSheet>
    </div>
  );
}

/** Making now on phones and tablets: a bottom sheet over the page (?panel=making, pushed, so Back closes it). */
function MakingSheet({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal?.();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-label="Making now"
      onClose={() => open && onClose()}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className="fixed inset-x-0 bottom-0 top-auto m-0 max-h-[80vh] w-full max-w-none rounded-t-2xl border-t border-border/70 bg-background p-0 shadow-xl backdrop:bg-foreground/40 lg:hidden"
    >
      <div className="relative p-4 pb-[calc(env(safe-area-inset-bottom)+1.25rem)]">
        <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close" className="absolute right-2 top-2 h-11 w-11 p-0 text-muted-foreground">
          <X className="h-4 w-4" />
        </Button>
        {children}
      </div>
    </dialog>
  );
}
