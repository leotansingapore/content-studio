// Slideshow (/slideshow): photo slides with free text boxes, the editor every slideshow opens in
// (docs/north-star/items/edit-slideshow.md). The model is src/lib/slideshow.ts and the drawing
// src/lib/slideshowDraw.ts; this page holds the edits, Undo and the URL. Leo's sign-ins only for now.
//
// URL (docs/deep-links.md): ?s=<id> opens one (push); ?slide=<n> (1-based), ?panel=text|overlay and
// ?box=<id> replace. Unknown values fall back to the start card, slide 1 or nothing picked.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, CalendarClock, ChevronLeft, ChevronRight, Download, FilePlus2, Images, Loader2, Redo2, Save, Trash2, TriangleAlert, Undo2 } from "lucide-react";
import CopyLinkButton from "@/components/CopyLinkButton";
import SectionTabs, { WRITE_TABS } from "@/components/SectionTabs";
import SlideCanvas, { SlideThumb, type PictureState } from "@/components/slideshow/SlideCanvas";
import SlideInspector, { PANELS, type InspectorActs, type Panel } from "@/components/slideshow/SlideInspector";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToastAction } from "@/components/ui/toast";
import { useToast } from "@/hooks/use-toast";
import { draftLabel, draftsWithText, loadBrand, slideFileName } from "@/lib/carousel";
import { scanCompliance } from "@/lib/compliance";
import { downloadBlob } from "@/lib/carouselRender";
import { getDraftById, loadDrafts, upsertDraft } from "@/lib/draftHistory";
import { links } from "@/lib/links";
import { addMedia, storePicture } from "@/lib/mediaLibrary";
import { socialConnectShown } from "@/lib/socialConnect";
import { downloadStock, searchStock } from "@/lib/stockMedia";
import { useLeoUser } from "@/lib/useLeoOnly";
import { useUrlItem, useUrlUpdate } from "@/lib/urlState";
import { ensureCaptionFonts } from "@/lib/videoMedia";
import NotFoundPage from "@/pages/NotFoundPage";
import {
  NEW_WORDS,
  addBox,
  addSlide,
  ago,
  applyToAll,
  blankSlideshow,
  changeBox,
  changeSlide,
  deleteBox,
  deleteSlide,
  duplicateSlide,
  emptyHistory,
  fromPost,
  loadSlideshows,
  loadStyleHint,
  makeBox,
  moveSlide,
  onSlideshowsChanged,
  pickStyle,
  redo,
  remember,
  removeSlideshow,
  saveSlideshow,
  saveStyleHint,
  slideshowToDraft,
  undo,
  frameHeight,
  type BoxStyle,
  type ShowSlide,
  type Slideshow,
} from "@/lib/slideshow";
import { MissingPictureError, layoutBoxes, lookOf, pictureKey, screenMeasure, slidePicture, slideshowPngs } from "@/lib/slideshowDraw";
import { PER_PAGE as STOCK_PER_PAGE } from "../../supabase/functions/stock-media/logic.ts";

const TOUCH = "[@media(pointer:coarse)]:min-h-11";
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
// where a new text box lands, so it doesn't cover the ones already there
const NEW_BOX_Y = [0.5, 0.72, 0.28, 0.86, 0.14, 0.6];
const EXPORT_FAILED = "Couldn't make the pictures. Try again, or try another browser.";
/** "slide 3" or "slides 2, 5", for the lines under the slide. */
const slidesText = (nums: number[]) => `${nums.length === 1 ? "slide" : "slides"} ${nums.join(", ")}`;

/** Wide enough that the tallest frame (1080x1920) covers the picture without stretching it. */
async function coverWidth(file: Blob): Promise<number> {
  try {
    const b = await createImageBitmap(file);
    const w = Math.min(4096, Math.max(1080, Math.ceil((1920 * b.width) / b.height)));
    b.close();
    return w;
  } catch {
    return 1080;
  }
}

export default function SlideshowPage() {
  const leo = useLeoUser();
  if (leo === undefined) return <div className="min-h-[40vh]" aria-busy="true" />;
  if (!leo) return <NotFoundPage />;
  return <Slideshows userId={leo.id} />;
}

function useFontsReady() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let live = true;
    void ensureCaptionFonts().then(() => live && setReady(true));
    return () => {
      live = false;
    };
  }, []);
  return ready;
}

function Slideshows({ userId }: { userId: string }) {
  const [shows, setShows] = useState(() => loadSlideshows(userId));
  // a slideshow saved outside this page (a job finishing) shows in the list, and its ?s= link opens it
  useEffect(() => onSlideshowsChanged(() => setShows(loadSlideshows(userId))), [userId]);
  const [sid, openShow] = useUrlItem("s");
  const update = useUrlUpdate();
  const ready = useFontsReady();
  const show = sid ? shows.find((x) => x.id === sid) : undefined;
  const close = useCallback(() => update({ s: null, slide: null, panel: null, box: null }), [update]);

  return (
    <div className="space-y-6">
      <SectionTabs tabs={WRITE_TABS} />
      {show ? (
        <Editor key={show.id} userId={userId} show={show} ready={ready} onSaved={setShows} onBack={close} />
      ) : (
        <Start userId={userId} shows={shows} ready={ready} onShows={setShows} onOpen={openShow} />
      )}
    </div>
  );
}

function Start({ userId, shows, ready, onShows, onOpen }: { userId: string; shows: Slideshow[]; ready: boolean; onShows: (s: Slideshow[]) => void; onOpen: (id: string) => void }) {
  const { toast } = useToast();
  const drafts = useMemo(() => draftsWithText(loadDrafts(userId)), [userId]);
  const [postId, setPostId] = useState("");
  const make = (s: Slideshow) => {
    onShows(saveSlideshow(userId, s));
    onOpen(s.id);
  };
  const fromMyPost = () => {
    const d = drafts.find((x) => x.id === postId);
    if (!d) return;
    const s = fromPost(d.draft, { hook: d.hook, style: loadStyleHint() });
    make({ ...s, title: (d.hook || s.title).slice(0, 120) });
  };
  const remove = (s: Slideshow) => {
    onShows(removeSlideshow(userId, s.id));
    toast({
      title: "Slideshow deleted",
      action: (
        <ToastAction altText="Undo" onClick={() => onShows(saveSlideshow(userId, s, new Date(s.updatedAt || Date.now())))}>
          Undo
        </ToastAction>
      ),
    });
  };

  return (
    <>
      <header>
        <h1 className="flex items-center gap-2 font-serif text-2xl font-semibold leading-tight tracking-tight text-foreground sm:text-3xl">
          <Images className="h-6 w-6 shrink-0 text-primary" /> Slideshow
        </h1>
      </header>
      <Card className="border-border/60 shadow-card">
        <CardHeader>
          <CardTitle className="font-serif text-xl">Start from</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <Button onClick={() => make(blankSlideshow(loadStyleHint()))} className={`gap-1.5 ${TOUCH}`}>
            <FilePlus2 className="h-4 w-4" /> A blank slideshow
          </Button>
          <div className="space-y-1.5">
            <Label htmlFor="slideshow-post">One of my posts</Label>
            {drafts.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                You don't have any written posts yet.{" "}
                <Link to={links.generate()} className="font-semibold text-primary hover:underline">Write one</Link>
              </p>
            ) : (
              <div className="flex flex-col gap-2 sm:flex-row">
                <Select value={postId} onValueChange={setPostId}>
                  <SelectTrigger id="slideshow-post" className={`min-w-0 flex-1 ${TOUCH}`}>
                    <SelectValue placeholder="Pick one of your posts" />
                  </SelectTrigger>
                  <SelectContent className="max-w-[calc(100vw-2rem)]">
                    {drafts.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {draftLabel(d, 60)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="outline" onClick={fromMyPost} disabled={!postId} className={TOUCH}>
                  Make the slides
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {shows.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-serif text-lg font-semibold">Your slideshows</h2>
          <ul className="divide-y divide-border/60 rounded-lg border border-border/60">
            {shows.map((s) => (
              <li key={s.id} className="flex items-center gap-3 px-3 py-2">
                <button type="button" onClick={() => onOpen(s.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                  <SlideThumb slide={s.slides[0]} size={s.size} look={lookOf(userId, s)} ready={ready} className="h-14 w-auto shrink-0" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{s.title}</span>
                    <span className="block text-[11px] text-muted-foreground">
                      {s.slides.length} slides, edited {ago(s.updatedAt)}
                    </span>
                  </span>
                </button>
                <Button size="icon" variant="ghost" className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11" aria-label={`Delete ${s.title}`} onClick={() => remove(s)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

/** Preparing slides n of N, or the line a failed export shows. */
type Prep = { done: number; total: number } | string | null;

function Editor({ userId, show, ready, onSaved, onBack }: { userId: string; show: Slideshow; ready: boolean; onSaved: (s: Slideshow[]) => void; onBack: () => void }) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const update = useUrlUpdate();
  const [work, setWork] = useState(show);
  const [hist, setHist] = useState(emptyHistory);
  const [savedAt, setSavedAt] = useState(show.updatedAt);
  const [, tick] = useState(0);
  const [allBoxes, setAllBoxes] = useState(false);
  const [pics, setPics] = useState<Record<string, Blob | "missing">>({});
  const [swap, setSwap] = useState<{ busy: boolean; note: string | null; slide: string }>({ busy: false, note: null, slide: "" });
  const [prep, setPrep] = useState<Prep>(null);
  const workRef = useRef(work);
  workRef.current = work;
  const dirty = useRef(false);
  const dragBefore = useRef<Slideshow | null>(null);
  const loading = useRef(new Set<string>());
  const swapCount = useRef(new Map<string, number>());
  const abort = useRef<AbortController | null>(null);

  // ---- the URL: open slide, tab and picked box ----
  const n = work.slides.length;
  const slideParam = Number(params.get("slide") ?? "1");
  const index = Number.isInteger(slideParam) && slideParam >= 1 && slideParam <= n ? slideParam - 1 : 0;
  const slide = work.slides[index];
  const panelParam = params.get("panel");
  const panel: Panel = PANELS.includes(panelParam as Panel) ? (panelParam as Panel) : "slide";
  const box = slide.boxes.find((b) => b.id === params.get("box")) ?? null;
  const go = (i: number) => update({ slide: i > 0 ? String(i + 1) : null, box: null });
  const pick = (id: string | null) => update(id ? { box: id, panel: "text" } : { box: null });
  const setPanel = (p: Panel) => update({ panel: p === "slide" ? null : p });

  // ---- saving: 800 ms after the last change, and straight away when the page goes ----
  const saveNow = useCallback(
    (s: Slideshow = workRef.current) => {
      dirty.current = false;
      const list = saveSlideshow(userId, s);
      setSavedAt(list[0].updatedAt);
      onSaved(list);
    },
    [userId, onSaved],
  );
  useEffect(() => {
    if (!dirty.current) return;
    const t = window.setTimeout(() => saveNow(), 800);
    return () => window.clearTimeout(t);
  }, [work, saveNow]);
  useEffect(() => {
    const flush = () => dirty.current && saveNow();
    window.addEventListener("pagehide", flush);
    const t = window.setInterval(() => tick((x) => x + 1), 30_000);
    return () => {
      window.removeEventListener("pagehide", flush);
      window.clearInterval(t);
      flush();
      // leaving mid-prepare: no downloads start later
      abort.current?.abort();
    };
  }, [saveNow]);

  // ---- edits: every change goes through commit, so Undo has it ----
  const commit = (next: Slideshow, tag?: string) => {
    const prev = workRef.current;
    if (next === prev) return;
    // the updater runs later, after workRef has moved on, so it takes `prev`, never workRef
    setHist((h) => remember(h, prev, tag));
    dirty.current = true;
    workRef.current = next;
    setWork(next);
  };
  const step = (dir: "undo" | "redo") => {
    const r = (dir === "undo" ? undo : redo)(hist, work);
    if (!r) return;
    setHist(r.h);
    dirty.current = true;
    // the link to its draft is not an edit, so Undo never drops it
    setWork(work.draftId ? { ...r.show, draftId: work.draftId } : r.show);
    if (index >= r.show.slides.length) go(r.show.slides.length - 1);
  };

  const removeBox = (id: string) => {
    const before = work;
    commit(deleteBox(work, slide.id, id));
    update({ box: null });
    toast({ title: "Text box deleted", action: <ToastAction altText="Undo" onClick={() => commit(before)}>Undo</ToastAction> });
  };

  const style = (patch: Partial<BoxStyle>) => {
    const key = Object.keys(patch)[0];
    if (allBoxes) commit(applyToAll(work, patch), `all:${key}`);
    else if (box) commit(changeBox(work, slide.id, box.id, patch), `style:${box.id}:${key}`);
    if (box) saveStyleHint({ ...pickStyle(box), ...patch });
  };

  // async picks land on the slide they were made for, on the slideshow as it is by then
  const setPicture = (slideId: string, key: string, blob: Blob | null, photo?: ShowSlide["photo"]) => {
    if (blob) setPics((p) => ({ ...p, [key]: blob }));
    commit(changeSlide(workRef.current, slideId, ({ photo: _old, ...rest }) => ({ ...rest, image: key, ...(photo ? { photo } : {}) })));
  };

  const swapPicture = async () => {
    // the placeholder words would search for pictures that have nothing to do with the post
    const words = (slide.boxes.find((b) => b.text.trim() && b.text.trim() !== NEW_WORDS)?.text ?? "").replace(/\s+/g, " ").trim().split(" ").slice(0, 6).join(" ");
    const none = "No picture found for these words. Pick one from My pictures.";
    if (!words) return setSwap({ busy: false, note: none, slide: slide.id });
    setSwap({ busy: true, note: null, slide: slide.id });
    const slideId = slide.id;
    const memo = `${slideId}|${words}`;
    const k = swapCount.current.get(memo) ?? 0;
    try {
      const orientation = work.size === "1x1" ? "square" : "portrait";
      let res = await searchStock("photo", words, Math.floor(k / STOCK_PER_PAGE) + 1, orientation);
      let at = k % STOCK_PER_PAGE;
      // past the last result: start again from the first
      if (!res.items[at] && k > 0) {
        res = await searchStock("photo", words, 1, orientation);
        at = 0;
        swapCount.current.set(memo, 0);
      }
      const item = res.items[at];
      if (!item) return setSwap({ busy: false, note: none, slide: slideId });
      swapCount.current.set(memo, (swapCount.current.get(memo) ?? 0) + 1);
      const blob = await downloadStock(item.src);
      const pic = await storePicture(blob);
      addMedia(userId, { key: pic.key, name: (item.alt || words).slice(0, 80), folder: "", alt: item.alt, width: pic.width, height: pic.height, addedAt: new Date().toISOString(), credit: { by: item.by, byUrl: item.byUrl, url: item.url } });
      setPicture(slideId, pic.key, blob, { src: item.src, by: item.by, byUrl: item.byUrl });
      setSwap({ busy: false, note: null, slide: slideId });
    } catch (e) {
      // the server's own words, e.g. the daily stock-search limit
      setSwap({ busy: false, note: e instanceof Error ? e.message : none, slide: slideId });
    }
  };

  const upload = async (file: File) => {
    if (!file.type.startsWith("image/")) return toast({ title: "Pick an image file", variant: "destructive" });
    const slideId = slide.id;
    try {
      const pic = await storePicture(file, await coverWidth(file));
      addMedia(userId, { key: pic.key, name: file.name.replace(/\.[^.]+$/, "").slice(0, 80), folder: "", alt: "", width: pic.width, height: pic.height, addedAt: new Date().toISOString() });
      setPicture(slideId, pic.key, file);
    } catch (e) {
      toast({ title: "Couldn't add that picture", description: (e as Error).message, variant: "destructive" });
    }
  };

  const act: InspectorActs = {
    size: (size) => commit({ ...work, size }),
    swap: () => void swapPicture(),
    media: (key) => setPicture(slide.id, key, null),
    upload: (file) => void upload(file),
    addSlide: () => {
      commit(addSlide(work, index, loadStyleHint()));
      go(index + 1);
    },
    duplicate: () => {
      commit(duplicateSlide(work, index));
      go(index + 1);
    },
    deleteSlide: () => {
      const before = work;
      commit(deleteSlide(work, index));
      go(Math.max(0, index - 1));
      toast({ title: "Slide deleted", action: <ToastAction altText="Undo" onClick={() => commit(before)}>Undo</ToastAction> });
    },
    addText: () => {
      const b = makeBox(NEW_WORDS, { ...loadStyleHint(), y: NEW_BOX_Y[slide.boxes.length] ?? 0.5 });
      commit(addBox(work, slide.id, b));
      pick(b.id);
    },
    words: (text) => box && commit(changeBox(work, slide.id, box.id, { text }), `text:${box.id}`),
    style,
    overlay: (patch) => commit({ ...work, overlay: { ...work.overlay, ...patch } }, `overlay:${Object.keys(patch)[0]}`),
  };

  // ---- keys: Delete, arrows, Undo and Redo, Escape (never while typing in a field) ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement | null)?.closest?.("input, textarea, select, [contenteditable='true']");
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        if (typing) return;
        e.preventDefault();
        step(e.shiftKey ? "redo" : "undo");
        return;
      }
      if (typing) return;
      if (e.key === "Escape") return pick(null);
      if (!box) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        return removeBox(box.id);
      }
      const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
      if (!d) return;
      e.preventDefault();
      const by = e.shiftKey ? 0.05 : 0.01;
      commit(changeBox(work, slide.id, box.id, { x: box.x + d[0] * by, y: box.y + d[1] * by }), `nudge:${box.id}`);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // ---- pictures: from this device, else Pexels again, else the missing state ----
  useEffect(() => {
    for (const s of work.slides) {
      const key = pictureKey(s);
      if (!key || pics[key] || loading.current.has(key)) continue;
      loading.current.add(key);
      void slidePicture(s).then((b) => {
        loading.current.delete(key);
        setPics((p) => ({ ...p, [key]: b ?? "missing" }));
      });
    }
  }, [work.slides, pics]);
  const pictureOf = (s: ShowSlide): PictureState => {
    const key = pictureKey(s);
    return key ? pics[key] ?? "loading" : null;
  };

  const look = useMemo(() => lookOf(userId, work), [userId, work.overlay]);
  // every slide, so the lines under the slide name the ones Download would clip or that have words to check
  const layouts = useMemo(() => (ready ? work.slides.map((s) => layoutBoxes(s, work.size, screenMeasure())) : null), [ready, work.slides, work.size]);
  const layout = layouts?.[index] ?? { boxes: [], overflow: false };
  const overOthers = (layouts ?? []).flatMap((l, i) => (l.overflow && i !== index ? [i + 1] : []));
  const flagged = useMemo(() => work.slides.flatMap((s, i) => (scanCompliance(s.boxes.map((b) => b.text).join("\n\n")).length ? [i + 1] : [])), [work.slides]);
  const brand = useMemo(() => {
    const b = loadBrand(userId);
    return { handle: !!b?.handle, logo: !!b?.logo };
  }, [userId]);

  // ---- Download, Save to My posts, Schedule ----
  const download = async () => {
    if (prep && typeof prep !== "string") return;
    saveNow();
    const ctrl = new AbortController();
    abort.current = ctrl;
    // only the newest run writes the line: an older, cancelled one finishing late leaves it alone
    const mine = (p: Prep) => abort.current === ctrl && setPrep(p);
    mine({ done: 0, total: n });
    try {
      const files = await slideshowPngs(userId, work, { signal: ctrl.signal, onProgress: (done, total) => mine({ done, total }) });
      for (const [i, f] of files.entries()) {
        if (ctrl.signal.aborted) return;
        downloadBlob(f.file, slideFileName(work.title, i));
        // browsers drop downloads that all start at the same moment
        if (i < files.length - 1) await pause(400);
      }
      mine(null);
      toast({ title: "Slideshow downloaded" });
    } catch (e) {
      if (ctrl.signal.aborted) return void mine(null);
      if (e instanceof MissingPictureError) return void mine(e.message);
      console.error("slideshow export failed", e);
      mine(EXPORT_FAILED);
    }
  };
  const cancel = () => {
    abort.current?.abort();
    setPrep(null);
  };

  /** Writes or refreshes the slideshow's draft (status, date and Post it for me state stay) and returns its id. */
  const toPosts = () => {
    const fresh = slideshowToDraft(work, new Date().toISOString());
    const prev = getDraftById(userId, fresh.id);
    upsertDraft(userId, prev ? { ...prev, hook: fresh.hook, draft: fresh.draft, pillarDetail: fresh.pillarDetail, format: fresh.format, platform: fresh.platform } : fresh);
    const next = { ...work, draftId: fresh.id };
    workRef.current = next;
    setWork(next);
    saveNow(next);
    return fresh.id;
  };
  const saveToPosts = () => {
    toPosts();
    toast({ title: "Saved to My posts", action: <ToastAction altText="Open My posts" onClick={() => navigate(links.drafts())}>Open My posts</ToastAction> });
  };
  // the calendar dates the post; Post it for me shows there once it has a date. Month view, since a remembered
  // week view on a phone or the upcoming list shows an undated post's editor nowhere (links.calendar leaves month out).
  const schedule = () => navigate(`${links.calendar({ post: toPosts() })}&view=month`);
  const canSchedule = socialConnectShown();
  const busy = prep !== null && typeof prep !== "string";

  return (
    <>
      <h1 className="sr-only">Slideshow</h1>
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Button variant="ghost" size="sm" onClick={onBack} className={`-ml-2 gap-1 text-muted-foreground ${TOUCH}`}>
          <ChevronLeft className="h-4 w-4" /> Slideshows
        </Button>
        <input
          value={work.title}
          maxLength={120}
          aria-label="Slideshow name"
          onChange={(e) => commit({ ...work, title: e.target.value }, "title")}
          onBlur={() => !work.title.trim() && commit({ ...work, title: "Slideshow" })}
          className="min-w-0 flex-1 basis-40 rounded-md border border-transparent bg-transparent px-1.5 py-1 font-serif text-xl font-semibold hover:border-border focus:border-input focus:outline-none sm:text-2xl"
        />
        <span className="text-xs text-muted-foreground" aria-live="polite">Saved {ago(savedAt)}</span>
        <div className="flex w-full flex-wrap items-center gap-1.5 sm:w-auto">
          <Button size="icon" variant="ghost" onClick={() => step("undo")} disabled={!hist.past.length} aria-label="Undo" title="Undo" className="h-9 w-9 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11">
            <Undo2 className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" onClick={() => step("redo")} disabled={!hist.future.length} aria-label="Redo" title="Redo" className="h-9 w-9 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11">
            <Redo2 className="h-4 w-4" />
          </Button>
          <CopyLinkButton />
          <Button variant={canSchedule ? "outline" : "default"} size="sm" onClick={() => void download()} disabled={busy} className={`gap-1.5 ${TOUCH}`}>
            <Download className="h-4 w-4" /> Download
          </Button>
          <Button variant="outline" size="sm" onClick={saveToPosts} disabled={busy} className={`gap-1.5 ${TOUCH}`}>
            <Save className="h-4 w-4" /> Save to My posts
          </Button>
          {canSchedule && (
            <Button size="sm" onClick={schedule} disabled={busy} className={`gap-1.5 ${TOUCH}`}>
              <CalendarClock className="h-4 w-4" /> Schedule
            </Button>
          )}
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-3">
          {prep && (
            <div role="status" className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-sm">
              {typeof prep === "string" ? (
                <>
                  <span className="flex-1 text-destructive">{prep}</span>
                  <Button size="sm" variant="outline" onClick={() => void download()} className={TOUCH}>Try again</Button>
                </>
              ) : (
                <>
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  <span className="flex-1">Preparing slides {prep.done} of {prep.total}</span>
                  <Button size="sm" variant="ghost" onClick={cancel} className={TOUCH}>Cancel</Button>
                </>
              )}
            </div>
          )}
          <div className="mx-auto" style={{ width: `min(100%, calc(64vh * ${1080 / frameHeight(work.size)}))` }}>
            <SlideCanvas
              slide={slide}
              size={work.size}
              look={look}
              picture={pictureOf(slide)}
              layout={layout.boxes}
              picked={box?.id ?? null}
              ready={ready}
              onPick={pick}
              onBegin={() => (dragBefore.current = workRef.current)}
              onBox={(id, patch) => {
                const next = changeBox(workRef.current, slide.id, id, patch);
                dirty.current = true;
                workRef.current = next;
                setWork(next);
              }}
              onEnd={() => {
                const before = dragBefore.current;
                dragBefore.current = null;
                if (before && before !== workRef.current) setHist((h) => remember(h, before));
              }}
              onType={(id, text) => commit(changeBox(work, slide.id, id, { text }), `text:${id}`)}
              onDelete={removeBox}
              onSwap={() => void swapPicture()}
            />
          </div>
          {(layout.overflow || overOthers.length > 0) && (
            <p className="flex items-start justify-center gap-1.5 text-xs text-amber-700 dark:text-amber-300">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              {layout.overflow ? "Too many words for this slide." : `Too many words on ${slidesText(overOthers)}.`} Cut some or make the text smaller.
            </p>
          )}
          {flagged.length > 0 && (
            <p className="flex items-start justify-center gap-1.5 text-xs text-amber-700 dark:text-amber-300">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> Check the words on {slidesText(flagged)} in the Text tab.
            </p>
          )}
          <div className="flex items-center justify-center gap-2">
            <Button size="icon" variant="outline" onClick={() => go(index - 1)} disabled={index === 0} aria-label="Previous slide" className="h-10 w-10 rounded-full [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="flex items-center gap-1.5" aria-label={`Slide ${index + 1} of ${n}`}>
              {work.slides.map((s, i) => (
                <span key={s.id} className={`h-2 w-2 rounded-full ${i === index ? "bg-primary" : "bg-muted-foreground/30"}`} />
              ))}
            </div>
            <Button size="icon" variant="outline" onClick={() => go(index + 1)} disabled={index === n - 1} aria-label="Next slide" className="h-10 w-10 rounded-full [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <ol className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1">
              {work.slides.map((s, i) => (
                <li key={s.id} className="shrink-0">
                  <button
                    type="button"
                    onClick={() => go(i)}
                    aria-label={`Slide ${i + 1}`}
                    aria-current={i === index}
                    className={`relative block rounded-md p-0.5 ${i === index ? "ring-2 ring-primary" : "opacity-80 hover:opacity-100"}`}
                  >
                    <SlideThumb slide={s} size={work.size} look={look} picture={pictureOf(s)} ready={ready} className="h-16 w-auto" />
                    <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1 text-[10px] font-semibold text-white">{i + 1}</span>
                  </button>
                </li>
              ))}
            </ol>
            <Button size="icon" variant="ghost" onClick={() => (commit(moveSlide(work, index, -1)), go(index - 1))} disabled={index === 0} aria-label="Move this slide left" title="Move left" className="h-9 w-9 shrink-0 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="ghost" onClick={() => (commit(moveSlide(work, index, 1)), go(index + 1))} disabled={index === n - 1} aria-label="Move this slide right" title="Move right" className="h-9 w-9 shrink-0 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11">
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <Card className="h-fit border-border/60 shadow-card lg:sticky lg:top-4">
          <CardContent className="pt-6">
            <SlideInspector
              userId={userId}
              show={work}
              slide={slide}
              box={box}
              panel={panel}
              onPanel={setPanel}
              allBoxes={allBoxes}
              onAllBoxes={setAllBoxes}
              swap={swap.slide === slide.id ? swap : { busy: false, note: null }}
              brand={brand}
              act={act}
            />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
