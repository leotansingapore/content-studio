// Your library (/library, every sign-in since 6 Nov, BuilderCult fold; docs/north-star/items/publish-library.md): every post, carousel,
// slideshow, video and AI picture in one grid, filtered by format, status and search, with what is still being made
// beside it. Each card opens the page that made it; Select (?select=1) deletes or downloads many at once through each
// store's own functions (libraryBulk.ts). Nothing is stored here.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { BooksIcon, MagnifyingGlassIcon, UploadSimpleIcon, XIcon } from "@phosphor-icons/react";
import LibraryCard from "@/components/library/LibraryCard";
import LibraryChip from "@/components/library/LibraryChip";
import LibraryHeader, { LibrarySearch, QUIET_SELECT, createHref } from "@/components/library/LibraryHeader";
import { thumbSources, useFontsReady } from "@/components/library/LibraryThumb";
import MakingNow, { useLibraryJobs } from "@/components/library/MakingNow";
import { useZernioRefresh } from "@/components/PostItForMe";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToastAction } from "@/components/ui/toast";
import { useToast } from "@/hooks/use-toast";
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
  uploadFirst,
  type LibraryFormat,
  type LibraryStatus,
} from "@/lib/library";
import { deleteItems, downloadItems } from "@/lib/libraryBulk";
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
const n = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;
// a job has no key that lasts and nothing to delete, download or keep in a set
const pickable = (key: string) => !key.startsWith("j:");

export default function LibraryPage() {
  const user = useSignedInUser();
  if (user === undefined) return <div className="min-h-[40vh]" aria-busy="true" />;
  if (!user) return <NotFoundPage notOnAccount />;
  return <Library userId={user.id} email={user.email} />;
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

function Library({ userId, email }: { userId: string; email: string }) {
  const [format, setFormat] = useUrlState<(typeof FORMATS)[number]>("format", "all", { allowed: FORMATS });
  const [status, setStatus] = useUrlState<(typeof STATUSES)[number]>("status", "all", { allowed: STATUSES });
  const [text, setText, q] = useUrlSearch("q");
  const [panel, openPanel, closePanel] = useUrlItem("panel");
  // Select (?select=1, pushed, so Back leaves it): every card a checkbox, and actions on the ones ticked
  const [selecting, startSelect, endSelect] = useUrlItem("select");
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();
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

  // only what is on screen stays ticked: a filter or a delete drops the rest
  const visible = shown.filter((i) => pickable(i.key));
  const chosen = visible.filter((i) => picked.has(i.key));
  // the same Set when there is nothing to clear: a new one each time would run this again, and again
  useEffect(() => {
    if (!selecting) setPicked((p) => (p.size ? new Set() : p));
  }, [selecting]);
  useEffect(() => setConfirming(false), [selecting, picked]);
  useEffect(() => {
    if (!selecting) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !document.querySelector("dialog[open]") && endSelect();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selecting, endSelect]);
  const toggle = (key: string) =>
    setPicked((p) => {
      const next = new Set(p);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  const allPicked = visible.length > 0 && chosen.length === visible.length;

  const remove = () => {
    if (!confirming) return setConfirming(true);
    const done = deleteItems(userId, chosen.map((i) => i.key), stores);
    reload();
    setPicked(new Set());
    if (!done.count) return toast({ title: "Nothing deleted", description: "Delete videos in the video editor." });
    toast({
      title: `${n(done.count, "item")} deleted`,
      description: [done.videos ? `${n(done.videos, "video")} kept. Delete videos in the video editor.` : "", done.held ? "Cancelling the auto-post." : ""].filter(Boolean).join(" ") || undefined,
      action: (
        <ToastAction altText="Undo" onClick={() => (done.undo(), reload())}>
          Undo
        </ToastAction>
      ),
    });
  };
  const download = async () => {
    setBusy(true);
    try {
      const { saved, skipped } = await downloadItems(userId, chosen, stores);
      const left = skipped ? `${n(skipped, "item")} skipped: text posts and videos have no file to download here.` : undefined;
      toast(saved ? { title: saved === 1 ? "Downloaded" : `${saved} items downloaded`, description: left } : { title: "Nothing to download", description: left, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const statusText = (s: (typeof STATUSES)[number]) => (s === "all" ? "All statuses" : `${STATUS_LABELS[s]}${counts[s] ? ` (${counts[s]})` : ""}`);

  return (
    <div className="space-y-4">
      {/* one row: formats as its tabs, then search, the status menu, what is being made, and the view switch */}
      <LibraryHeader
        title="Library"
        left={
          items.length > 0 && (
            <div role="group" aria-label="Format" className="flex gap-0.5">
              {FORMAT_CHIPS.map((c) => (
                <LibraryChip key={c.value} on={format === c.value} onClick={() => setFormat(c.value)}>
                  {c.label}
                </LibraryChip>
              ))}
            </div>
          )
        }
      >
        {items.length > 0 || making + failedJobs > 0 ? (
          <>
            {items.length > 0 && (
              <>
                <LibrarySearch value={text} onChange={setText} label="Search titles, words and captions" />
                <Select value={status} onValueChange={(v) => setStatus(v as (typeof STATUSES)[number])}>
                  <SelectTrigger aria-label="Status" className={QUIET_SELECT}>
                    <SelectValue>{statusText(status)}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {statusText(s)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            )}
            {items.length > 0 && !selecting && (
              <Button size="sm" variant="ghost" onClick={() => startSelect("1")} className={`shrink-0 text-xs text-muted-foreground ${TOUCH}`}>
                Select
              </Button>
            )}
            {/* what is being made or failed, with its step and Try again; the cards say the same in short */}
            {making + failedJobs > 0 && (
              <Button size="sm" variant="ghost" onClick={() => openPanel("making")} className={`shrink-0 gap-1.5 text-xs text-muted-foreground ${TOUCH}`}>
                {making > 0 && <span className="h-2 w-2 animate-pulse rounded-full bg-primary" aria-hidden />}
                Making now ({making}){failedJobs ? ` | ${failedJobs} failed` : ""}
              </Button>
            )}
          </>
        ) : null}
      </LibraryHeader>

      {selecting && items.length > 0 && (
        <div role="toolbar" aria-label="Selected items" className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium tabular-nums" aria-live="polite">
            {chosen.length} selected
          </span>
          <Button size="sm" variant="ghost" disabled={!visible.length} onClick={() => setPicked(allPicked ? new Set() : new Set(visible.map((i) => i.key)))} className={`text-xs ${TOUCH}`}>
            {allPicked ? "Select none" : "Select all"}
          </Button>
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            <Button size="sm" variant="outline" disabled={!chosen.length || busy} onClick={() => void download()} className={TOUCH}>
              {busy ? "Downloading..." : "Download"}
            </Button>
            <Button size="sm" variant={confirming ? "destructive" : "outline"} disabled={!chosen.length} onClick={remove} className={TOUCH}>
              {confirming ? `Delete ${n(chosen.length, "item")}?` : "Delete"}
            </Button>
            <Button size="sm" onClick={endSelect} className={TOUCH}>
              Done
            </Button>
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <EmptyState
          icon={BooksIcon}
          title="Nothing made yet"
          actions={
            <Button asChild className={TOUCH}>
              <Link to={createHref(email)}>Create</Link>
            </Button>
          }
        >
          Posts, carousels, videos and images you make land here.
        </EmptyState>
      ) : shown.length === 0 ? (
        <EmptyState
          icon={MagnifyingGlassIcon}
          title="Nothing matches these filters"
          actions={
            <Button variant="outline" onClick={clear} className={TOUCH}>
              Clear filters
            </Button>
          }
        />
      ) : (
        // Fastlane's density: six portrait cards a row on a wide screen
        <ul className="grid grid-cols-2 items-start gap-x-3 gap-y-5 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
          {/* a way in for a video of your own: Studio's Upload your own, the video editor */}
          {!selecting && uploadFirst({ format: fmt, status: st, q }) && (
            <li className="flex min-w-0">
              <Link
                to={links.edit()}
                className="flex aspect-[9/16] w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border p-2 text-center text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
              >
                <UploadSimpleIcon className="h-5 w-5" aria-hidden />
                Upload your own
              </Link>
            </li>
          )}
          {shown.map((item) => (
            <li key={item.key} className="flex min-w-0">
              <LibraryCard item={item} sources={sources} {...(selecting && pickable(item.key) ? { picked: picked.has(item.key), onPick: () => toggle(item.key) } : {})} />
            </li>
          ))}
        </ul>
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
