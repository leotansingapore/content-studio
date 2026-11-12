// Your library (/library, every sign-in since 6 Nov, BuilderCult fold; docs/north-star/items/publish-library.md): every post, carousel,
// slideshow, video and AI picture in one grid, filtered by format, status and search, with what is still being made
// beside it. Read-only apart from its links: each card opens the page that made it. Nothing is stored here.

import { newPostHref } from "@/lib/newPost";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { BooksIcon, MagnifyingGlassIcon, XIcon } from "@phosphor-icons/react";
import LibraryCard from "@/components/library/LibraryCard";
import LibraryChip from "@/components/library/LibraryChip";
import LibraryViews from "@/components/library/LibraryViews";
import { thumbSources, useFontsReady } from "@/components/library/LibraryThumb";
import MakingNow, { useLibraryJobs } from "@/components/library/MakingNow";
import { useZernioRefresh } from "@/components/PostItForMe";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { DEFAULT_BRAND, loadBrand, loadCarousels } from "@/lib/carousel";
import { DESIGNS_CHANGED, loadDesigns } from "@/lib/design";
import { loadDrafts, onDraftsChanged } from "@/lib/draftHistory";
import { loadImages, onImagesChanged } from "@/lib/images";
import {
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
import { useSignedInUser } from "@/lib/useLeoOnly";
import { useUrlItem, useUrlSearch, useUrlState, useUrlUpdate } from "@/lib/urlState";
import { loadProjects } from "@/lib/videoProjects";
import NotFoundPage from "@/pages/NotFoundPage";

const TOUCH = "[@media(pointer:coarse)]:min-h-11";
const FORMATS = ["all", ...LIBRARY_FORMATS] as const;
const STATUSES = ["all", ...LIBRARY_STATUSES] as const;
// Fastlane's order and words (All formats, Video, Slideshow, Image), with our text posts after them; Slides covers
// carousels, slideshows and Designs. The address keeps ?format=carousel.
const FORMAT_CHIPS: { value: (typeof FORMATS)[number]; label: string }[] = [
  { value: "all", label: "All formats" },
  { value: "video", label: "Video" },
  { value: "carousel", label: "Slides" },
  { value: "image", label: "Image" },
  { value: "text", label: "Text" },
];

export default function LibraryPage() {
  const user = useSignedInUser();
  if (user === undefined) return <div className="min-h-[40vh]" aria-busy="true" />;
  if (!user) return <NotFoundPage notOnAccount />;
  return <Library userId={user.id} />;
}

/** The stores, read at once from this device: no page spinner, only thumbs load. */
const readStores = (userId: string) => ({
  drafts: loadDrafts(userId),
  carousels: loadCarousels(userId),
  slideshows: loadSlideshows(userId),
  projects: loadProjects(userId),
  media: loadMedia(userId),
  designs: loadDesigns(userId),
  images: loadImages(userId),
  brand: loadBrand(userId) ?? DEFAULT_BRAND,
});

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
    const offs = [onDraftsChanged(reload), onSlideshowsChanged(reload), onImagesChanged(reload)];
    window.addEventListener(DESIGNS_CHANGED, reload);
    return () => {
      offs.forEach((off) => off());
      window.removeEventListener(DESIGNS_CHANGED, reload);
    };
  }, [reload]);
  // a job that starts, ends or fails may have saved a draft, a picture or a slideshow; progress alone saves nothing
  const settled = jobs.map((j) => `${j.kind}:${j.state}`).join();
  useEffect(reload, [reload, settled]);
  // as on My posts and Calendar: asks Zernio about up to 10 posts whose time has come, so a failed one shows under Failed
  useZernioRefresh(userId, stores.drafts, reload);
  const fontsReady = useFontsReady(stores.slideshows.length > 0);

  const items = useMemo(() => buildLibrary({ ...stores, jobs, now: new Date() }), [stores, jobs]);
  const scoped = useMemo(() => filterLibrary(items, { format: fmt, q }), [items, fmt, q]);
  const counts = countBy(scoped);
  const shown = st ? scoped.filter((i) => i.status === st) : scoped;
  const making = jobs.filter((j) => j.state === "working").length;
  const failedJobs = jobs.filter((j) => j.state === "failed").length;
  const sources = useMemo(() => thumbSources(userId, stores, fontsReady), [userId, stores, fontsReady]);

  const clear = () => {
    setText("");
    update({ format: null, status: null, q: null });
  };

  return (
    <div className="space-y-4">
      {/* Fastlane's Library has no title under the Studio tabs: the view switch and the chips say where you are */}
      <h1 className="sr-only">Library</h1>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <LibraryViews />
        {/* what is being made or failed, with its step and Try again; the cards say the same in short */}
        {making + failedJobs > 0 && (
          <Button size="sm" variant="ghost" onClick={() => openPanel("making")} className={`gap-1.5 text-xs text-muted-foreground ${TOUCH}`}>
            {making > 0 && <span className="h-2 w-2 animate-pulse rounded-full bg-primary" aria-hidden />}
            Making now ({making}){failedJobs ? ` | ${failedJobs} failed` : ""}
          </Button>
        )}
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={BooksIcon}
          title="Nothing made yet"
          actions={
            <>
              <Button asChild className={TOUCH}>
                <Link to={newPostHref(userId)}>Write a post</Link>
              </Button>
              <Button asChild variant="outline" className={TOUCH}>
                <Link to={links.swipe()}>Find a post to remix</Link>
              </Button>
            </>
          }
        >
          Posts, carousels, videos and images you make land here.
        </EmptyState>
      ) : (
        <>
          <div className="space-y-2">
            {/* one row from lg, as Fastlane's: formats on the left, states on the right */}
            <div className="flex flex-col gap-1 lg:flex-row lg:items-center lg:justify-between">
              <div role="group" aria-label="Format" className="scrollbar-none -mx-1 flex gap-0.5 overflow-x-auto px-1">
                {FORMAT_CHIPS.map((c) => (
                  <LibraryChip key={c.value} on={format === c.value} onClick={() => setFormat(c.value)}>
                    {c.label}
                  </LibraryChip>
                ))}
              </div>
              <div role="group" aria-label="Status" className="scrollbar-none -mx-1 flex gap-0.5 overflow-x-auto px-1">
                {STATUSES.map((s) => (
                  <LibraryChip key={s} on={status === s} onClick={() => setStatus(s)} count={s === "all" ? undefined : counts[s]}>
                    {s === "all" ? "All" : STATUS_LABELS[s]}
                  </LibraryChip>
                ))}
              </div>
            </div>
            <div className="relative max-w-sm">
              <MagnifyingGlassIcon className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                type="search"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Search titles, words and captions"
                aria-label="Search titles, words and captions"
                className={`h-9 pl-8 ${TOUCH}`}
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
            // Fastlane's density: six portrait cards a row on a wide screen
            <ul className="grid grid-cols-2 items-start gap-x-3 gap-y-5 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
              {shown.map((item) => (
                <li key={item.key} className="flex min-w-0">
                  <LibraryCard item={item} sources={sources} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <MakingSheet open={panel === "making"} onClose={closePanel}>
        <MakingNow items={items} jobs={jobs} />
      </MakingSheet>
    </div>
  );
}

/** Making now: a sheet over the page (?panel=making, pushed, so Back closes it), from the bottom on a phone. */
function MakingSheet({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
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
      className="fixed inset-x-0 bottom-0 top-auto m-0 max-h-[80vh] w-full max-w-none rounded-t-2xl border-t border-border/70 bg-background p-0 shadow-xl backdrop:bg-foreground/40 sm:inset-x-auto sm:bottom-6 sm:left-1/2 sm:w-[28rem] sm:-translate-x-1/2 sm:rounded-2xl sm:border"
    >
      <div className="relative p-4 pb-[calc(env(safe-area-inset-bottom)+1.25rem)]">
        <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close" className="absolute right-2 top-2 h-11 w-11 p-0 text-muted-foreground">
          <XIcon className="h-4 w-4" />
        </Button>
        {children}
      </div>
    </dialog>
  );
}
