// /design/:id: the layer editor (Volume's, folded in). Slides on the left, the slide in the middle with its
// selection box, the panel on the right. Edits autosave; undo keeps 50 steps (typing or dragging one control
// within a second is one step). ?slide=N opens a slide.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { CalendarClock, ChevronLeft, Copy, Download, Image as ImageIcon, Loader2, Palette, Plus, Redo2, Save, Square, SunDim, Trash2, Type, Undo2 } from "lucide-react";
import Inspector from "@/components/design/Inspector";
import SlideView, { setBrandPictures } from "@/components/design/SlideView";
import { Button } from "@/components/ui/button";
import { ToastAction } from "@/components/ui/toast";
import { useToast } from "@/hooks/use-toast";
import { loadBrandFont, registerBrandFont } from "@/lib/brandFont";
import { loadBrand, slideFileName, slidesZipName } from "@/lib/carousel";
import { downloadBlob, zipBlob } from "@/lib/carouselRender";
import {
  FORMAT_H,
  FORMAT_LABEL,
  FRAME_W,
  MAX_LAYERS,
  MAX_SLIDES,
  designById,
  ensureDesignFonts,
  freshSlide,
  newLayer,
  newSlide,
  plainText,
  saveDesign,
  saveOwnTemplate,
  type Design,
  type DesignSlide,
  type Layer,
  type LayerType,
} from "@/lib/design";
import { ExportPictureError, designPngs } from "@/lib/designExport";
import { putFile } from "@/lib/deviceFiles";
import { getDraftById, newDraftId, upsertDraft, type DraftEntry } from "@/lib/draftHistory";
import { links } from "@/lib/links";
import { ago } from "@/lib/slideshow";
import { socialConnectShown } from "@/lib/socialConnect";
import { useSignedInUser } from "@/lib/useLeoOnly";
import NotFoundPage from "@/pages/NotFoundPage";

const MAX_HISTORY = 50;
const MERGE_MS = 1000;
const TOUCH = "[@media(pointer:coarse)]:min-h-11";
type Handle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
const HANDLES: Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
const HANDLE_POS: Record<Handle, [number, number]> = { nw: [0, 0], n: [0.5, 0], ne: [1, 0], e: [1, 0.5], se: [1, 1], s: [0.5, 1], sw: [0, 1], w: [0, 0.5] };
type Gesture = { kind: "move" | Handle; id: string; x0: number; y0: number; start: Layer; tag: string };

const slideWords = (d: Design) =>
  d.slides
    .map((s) => s.layers.flatMap((l) => (l.type === "text" && !l.hidden ? [plainText(l.text)] : [])).join("\n"))
    .filter(Boolean)
    .join("\n\n");

/** The My posts entry for a design: its words and its slides as attached pictures. */
export function designToDraft(d: Design, keys: string[], prev: DraftEntry | null, now: string): DraftEntry {
  return {
    ...(prev ?? { id: d.draftId ?? newDraftId(), createdAt: now, pillar: "topic", audience: "general", ctaType: "save-share", status: "draft" as const }),
    hook: d.title,
    draft: d.caption.trim() || slideWords(d),
    pillarDetail: d.title,
    format: "carousel",
    platform: d.format === "tiktok" ? "tiktok" : "instagram",
    attached: keys,
  };
}

export default function DesignEditorPage() {
  const user = useSignedInUser();
  const { id } = useParams();
  if (user === undefined) return null;
  const found = user ? designById(user.id, id) : null;
  if (!user || !found) return <NotFoundPage />;
  return <Editor key={found.id} userId={user.id} initial={found} />;
}

function Editor({ userId, initial }: { userId: string; initial: Design }) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [params, setParams] = useSearchParams();
  const [work, setWork] = useState(initial);
  const workRef = useRef(work);
  const [hist, setHist] = useState<{ past: Design[]; future: Design[]; tag?: string; at: number }>({ past: [], future: [], at: 0 });
  const [selected, setSelected] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState(initial.updatedAt);
  const [prep, setPrep] = useState<{ done: number; total: number } | string | null>(null);
  const [menu, setMenu] = useState<"download" | "brand" | null>(null);
  const abort = useRef<AbortController | null>(null);
  const brand = useMemo(() => loadBrand(userId), [userId]);
  const brandFont = useMemo(() => !!loadBrandFont(userId)?.data, [userId]);

  const index = Math.min(work.slides.length - 1, Math.max(0, (Number(params.get("slide")) || 1) - 1));
  const slide = work.slides[index];
  const layer = slide.layers.find((l) => l.id === selected) ?? null;
  const H = FORMAT_H[work.format];

  useEffect(() => {
    ensureDesignFonts();
    setBrandPictures({ logo: brand?.logo, photo: brand?.photo });
    void registerBrandFont(loadBrandFont(userId));
  }, [brand, userId]);

  // autosave half a second after the last change
  useEffect(() => {
    if (work === initial) return;
    const t = setTimeout(() => {
      saveDesign(userId, workRef.current);
      setSavedAt(new Date().toISOString());
    }, 500);
    return () => clearTimeout(t);
  }, [work, initial, userId]);

  const commit = useCallback((next: Design, tag?: string) => {
    const prev = workRef.current;
    workRef.current = next;
    setWork(next);
    setHist((h) => {
      const now = Date.now();
      if (tag && tag === h.tag && now - h.at < MERGE_MS) return { ...h, at: now };
      return { past: [...h.past, prev].slice(-MAX_HISTORY), future: [], tag, at: now };
    });
  }, []);
  const step = (dir: "undo" | "redo") => {
    setHist((h) => {
      const from = dir === "undo" ? h.past : h.future;
      if (!from.length) return h;
      const to = from[from.length - 1];
      const cur = workRef.current;
      workRef.current = to;
      setWork(to);
      return dir === "undo" ? { past: h.past.slice(0, -1), future: [...h.future, cur], at: 0 } : { past: [...h.past, cur], future: h.future.slice(0, -1), at: 0 };
    });
  };

  const goSlide = (i: number) => {
    setSelected(null);
    setParams((p) => (p.set("slide", String(i + 1)), p), { replace: true });
  };
  const setSlides = (slides: DesignSlide[], tag?: string) => commit({ ...workRef.current, slides }, tag);
  const patchSlide = (patch: Partial<DesignSlide>, tag?: string) => setSlides(workRef.current.slides.map((s, i) => (i === index ? { ...s, ...patch } : s)), tag);
  const patchLayer = (lid: string, patch: Partial<Layer>, tag?: string) =>
    patchSlide({ layers: workRef.current.slides[index].layers.map((l) => (l.id === lid ? ({ ...l, ...patch } as Layer) : l)) }, tag && `${lid}:${tag}`);
  const removeLayer = (lid: string) => {
    patchSlide({ layers: workRef.current.slides[index].layers.filter((l) => l.id !== lid) });
    if (selected === lid) setSelected(null);
  };
  const addLayer = (type: LayerType, over: Partial<Layer> = {}) => {
    if (slide.layers.length >= MAX_LAYERS) return toast({ title: `A slide holds up to ${MAX_LAYERS} layers` });
    const l = { ...newLayer(type, work.format), ...over } as Layer;
    patchSlide({ layers: [...slide.layers, l] });
    setSelected(l.id);
  };
  const moveLayer = (from: number, to: number) => {
    const ls = [...slide.layers];
    const [m] = ls.splice(from, 1);
    ls.splice(to, 0, m);
    patchSlide({ layers: ls });
  };
  const addSlide = (copy: boolean) => {
    if (work.slides.length >= MAX_SLIDES) return toast({ title: `Up to ${MAX_SLIDES} slides` });
    const s = copy ? freshSlide(slide) : newSlide(slide.background);
    setSlides([...work.slides.slice(0, index + 1), s, ...work.slides.slice(index + 1)]);
    goSlide(index + 1);
  };
  const deleteSlide = () => {
    if (work.slides.length < 2) return;
    setSlides(work.slides.filter((_, i) => i !== index));
    goSlide(Math.max(0, index - 1));
    toast({ title: "Slide deleted", action: <ToastAction altText="Undo" onClick={() => step("undo")}>Undo</ToastAction> });
  };
  const [dragSlide, setDragSlide] = useState<number | null>(null);
  const moveSlide = (from: number, to: number) => {
    const ss = [...work.slides];
    const [m] = ss.splice(from, 1);
    ss.splice(to, 0, m);
    setSlides(ss);
    goSlide(to);
  };

  // ---- the stage: fit the slide in the space, select, move and resize ----
  const stage = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState({ w: 400, h: 700 });
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setRoom({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const k = Math.max(0.1, Math.min(room.w / FRAME_W, room.h / H));
  const gesture = useRef<Gesture | null>(null);
  const frameAt = (e: { clientX: number; clientY: number }) => {
    const r = stage.current!.querySelector("[data-slide-box]")!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / k, y: (e.clientY - r.top) / k };
  };
  const onDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const p = frameAt(e);
    const handle = (e.target as HTMLElement).dataset.handle as Handle | undefined;
    const tag = `g${Date.now()}`;
    if (handle && layer) {
      gesture.current = { kind: handle, id: layer.id, x0: p.x, y0: p.y, start: layer, tag };
    } else {
      const hit = [...slide.layers].reverse().find((l) => !l.hidden && !l.locked && p.x >= l.x && p.x <= l.x + l.w && p.y >= l.y && p.y <= l.y + l.h);
      setSelected(hit?.id ?? null);
      if (hit) gesture.current = { kind: "move", id: hit.id, x0: p.x, y0: p.y, start: hit, tag };
    }
    if (gesture.current) (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (!g) return;
    const p = frameAt(e);
    const dx = Math.round(p.x - g.x0);
    const dy = Math.round(p.y - g.y0);
    const s = g.start;
    if (g.kind === "move") return patchLayer(g.id, { x: s.x + dx, y: s.y + dy }, g.tag);
    let { x, y, w, h } = s;
    if (g.kind.includes("e")) w = Math.max(10, s.w + dx);
    if (g.kind.includes("s")) h = Math.max(10, s.h + dy);
    if (g.kind.includes("w")) (w = Math.max(10, s.w - dx)), (x = s.x + s.w - w);
    if (g.kind.includes("n")) (h = Math.max(10, s.h - dy)), (y = s.y + s.h - h);
    patchLayer(g.id, { x, y, w, h }, g.tag);
  };
  const onUp = () => (gesture.current = null);

  // keys: delete, nudge, undo/redo, duplicate, deselect (not while typing in a field)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof Element && e.target.closest("input, textarea, select, [contenteditable='true']")) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") return e.preventDefault(), step(e.shiftKey ? "redo" : "undo");
      if (!layer) return;
      if (e.key === "Delete" || e.key === "Backspace") return e.preventDefault(), removeLayer(layer.id);
      if (e.key === "Escape") return setSelected(null);
      if (mod && e.key.toLowerCase() === "d") return e.preventDefault(), addLayer(layer.type, { ...layer, id: newLayer(layer.type, work.format).id, x: layer.x + 30, y: layer.y + 30, name: `${layer.name} copy` });
      const n = e.shiftKey ? 10 : 1;
      const d = { ArrowLeft: [-n, 0], ArrowRight: [n, 0], ArrowUp: [0, -n], ArrowDown: [0, n] }[e.key];
      if (d && !layer.locked) e.preventDefault(), patchLayer(layer.id, { x: layer.x + d[0], y: layer.y + d[1] }, "nudge");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // ---- Download, Save to My posts, Schedule ----
  const run = async <T,>(job: (signal: AbortSignal) => Promise<T>): Promise<T | null> => {
    const ctrl = new AbortController();
    abort.current = ctrl;
    setPrep({ done: 0, total: work.slides.length });
    try {
      const out = await job(ctrl.signal);
      if (abort.current === ctrl) setPrep(null);
      return out;
    } catch (e) {
      if (ctrl.signal.aborted) return setPrep(null), null;
      console.error("design export failed", e);
      setPrep(e instanceof ExportPictureError ? e.message : "Couldn't make the pictures. Try again, or try another browser.");
      return null;
    }
  };
  const progress = (signal: AbortSignal) => ({ signal, onProgress: (done: number, total: number) => abort.current?.signal === signal && setPrep({ done, total }) });
  const downloadSlides = async (only?: number[]) => {
    setMenu(null);
    const files = await run((signal) => designPngs(userId, workRef.current, { only, ...progress(signal) }));
    if (!files) return;
    const d = workRef.current;
    if (files.length === 1) downloadBlob(files[0], slideFileName(d.title, only?.[0] ?? 0));
    else downloadBlob(await zipBlob(files.map((file, i) => ({ file, name: slideFileName(d.title, i) }))), slidesZipName(d.title));
    toast({ title: files.length === 1 ? "Slide downloaded" : "Slides downloaded" });
  };
  const toPosts = async (): Promise<string | null> => {
    const files = await run((signal) => designPngs(userId, workRef.current, progress(signal)));
    if (!files) return null;
    const d = workRef.current;
    const keys = await Promise.all(files.map(async (f, i) => (await putFile(`cimg-dz${d.id.slice(4, 16)}${i}`, f), `cimg-dz${d.id.slice(4, 16)}${i}`)));
    const draftId = d.draftId ?? newDraftId();
    const entry = designToDraft({ ...d, draftId }, keys, getDraftById(userId, draftId), new Date().toISOString());
    upsertDraft(userId, { ...entry, id: draftId });
    const next = { ...d, draftId };
    workRef.current = next;
    setWork(next);
    saveDesign(userId, next);
    return draftId;
  };
  const saveToPosts = async () => {
    if (await toPosts()) toast({ title: "Saved to My posts", action: <ToastAction altText="Open My posts" onClick={() => navigate(links.drafts())}>Open My posts</ToastAction> });
  };
  const schedule = async () => {
    const post = await toPosts();
    if (post) navigate(`${links.calendar({ post })}&view=month`);
  };
  const busy = prep !== null && typeof prep !== "string";
  const brandColors = brand?.color ? [brand.color] : [];

  const tool = (label: string, Icon: typeof Type, onClick: () => void, pressed?: boolean) => (
    <button type="button" onClick={onClick} aria-pressed={pressed} className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm hover:bg-muted ${pressed ? "bg-muted" : ""} ${TOUCH}`}>
      <Icon className="h-4 w-4" /> {label}
    </button>
  );

  return (
    <div className="flex min-h-0 flex-col gap-2 lg:h-[calc(100dvh-7rem)]">
      <h1 className="sr-only">{work.title}</h1>
      <header className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" asChild className={`-ml-2 gap-1 text-muted-foreground ${TOUCH}`}>
          <Link to="/design">
            <ChevronLeft className="h-4 w-4" /> Design
          </Link>
        </Button>
        <input
          value={work.title}
          maxLength={120}
          aria-label="Slideshow name"
          onChange={(e) => commit({ ...work, title: e.target.value }, "title")}
          onBlur={() => !work.title.trim() && commit({ ...work, title: "Untitled slideshow" })}
          className="min-w-0 flex-1 basis-40 rounded-md border border-transparent bg-transparent px-1.5 py-1 text-lg font-semibold hover:border-border focus:border-input focus:outline-none"
        />
        <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">{FORMAT_LABEL[work.format]}</span>
        <span className="text-xs text-muted-foreground" aria-live="polite">
          Saved {ago(savedAt)}
        </span>
        <div className="relative">
          <Button variant="outline" size="sm" onClick={() => setMenu(menu === "download" ? null : "download")} disabled={busy} aria-expanded={menu === "download"} className={`gap-1.5 ${TOUCH}`}>
            <Download className="h-4 w-4" /> Download
          </Button>
          {menu === "download" && (
            <div role="menu" className="absolute right-0 z-30 mt-1 w-56 rounded-md border border-border bg-popover p-1 shadow-lg">
              <button role="menuitem" type="button" className="flex w-full justify-between rounded px-2 py-1.5 text-sm hover:bg-muted" onClick={() => void downloadSlides([index])}>
                This slide <span className="text-muted-foreground">Slide {index + 1}</span>
              </button>
              <button role="menuitem" type="button" className="flex w-full justify-between rounded px-2 py-1.5 text-sm hover:bg-muted" onClick={() => void downloadSlides()}>
                All slides <span className="text-muted-foreground">{work.slides.length}, as a zip</span>
              </button>
              <button
                role="menuitem"
                type="button"
                className="w-full rounded px-2 py-1.5 text-left text-sm hover:bg-muted"
                onClick={() => {
                  saveOwnTemplate(userId, workRef.current);
                  setMenu(null);
                  toast({ title: "Saved as a template", description: "It's under Your templates on Design." });
                }}
              >
                Save as template
              </button>
            </div>
          )}
        </div>
        <Button variant={socialConnectShown() ? "outline" : "default"} size="sm" onClick={() => void saveToPosts()} disabled={busy} className={`gap-1.5 ${TOUCH}`}>
          <Save className="h-4 w-4" /> Save to My posts
        </Button>
        {socialConnectShown() && (
          <Button size="sm" onClick={() => void schedule()} disabled={busy} className={`gap-1.5 ${TOUCH}`}>
            <CalendarClock className="h-4 w-4" /> Schedule
          </Button>
        )}
      </header>
      {prep !== null && (
        <p role="status" className={`flex items-center gap-2 text-sm ${typeof prep === "string" ? "text-destructive" : "text-muted-foreground"}`}>
          {typeof prep === "string" ? (
            prep
          ) : (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Making slide {Math.min(prep.total, prep.done + 1)} of {prep.total}
              <button type="button" className="underline" onClick={() => (abort.current?.abort(), setPrep(null))}>
                Cancel
              </button>
            </>
          )}
        </p>
      )}

      <nav aria-label="Add to the slide" className="flex flex-wrap items-center gap-0.5 border-y border-border py-1">
        {tool("Text", Type, () => addLayer("text"))}
        {tool("Image", ImageIcon, () => addLayer("image"))}
        {tool("Shape", Square, () => addLayer("shape"))}
        {tool("Fade", SunDim, () => addLayer("gradient"))}
        <div className="relative">
          {tool("Brand", Palette, () => setMenu(menu === "brand" ? null : "brand"), menu === "brand")}
          {menu === "brand" && (
            <div role="menu" className="absolute left-0 z-30 mt-1 w-60 rounded-md border border-border bg-popover p-1 shadow-lg">
              {brand?.logo && (
                <button role="menuitem" type="button" className="w-full rounded px-2 py-1.5 text-left text-sm hover:bg-muted" onClick={() => (setMenu(null), addLayer("image", { name: "Logo", src: "brand:logo", fit: "contain", x: 800, y: 80, w: 200, h: 200 }))}>
                  Add your logo
                </button>
              )}
              {brand?.photo && (
                <button role="menuitem" type="button" className="w-full rounded px-2 py-1.5 text-left text-sm hover:bg-muted" onClick={() => (setMenu(null), addLayer("image", { name: "Headshot", src: "brand:photo", mask: "ellipse", x: 80, y: 80, w: 160, h: 160 }))}>
                  Add your headshot
                </button>
              )}
              {brand?.handle && (
                <button
                  role="menuitem"
                  type="button"
                  className="w-full rounded px-2 py-1.5 text-left text-sm hover:bg-muted"
                  onClick={() => (setMenu(null), addLayer("text", { name: "Handle", text: brand.handle.startsWith("@") ? brand.handle : `@${brand.handle}`, size: 36, x: 80, y: H - 160, w: 600, h: 60 }))}
                >
                  Add your handle
                </button>
              )}
              <Link to="/brand" className="block rounded px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted">
                {brand ? "Edit your brand kit" : "Set up your brand kit"}
              </Link>
            </div>
          )}
        </div>
        <span className="mx-1 h-5 w-px bg-border" aria-hidden />
        <Button size="icon" variant="ghost" onClick={() => step("undo")} disabled={!hist.past.length} aria-label="Undo" title="Undo" className="h-9 w-9">
          <Undo2 className="h-4 w-4" />
        </Button>
        <Button size="icon" variant="ghost" onClick={() => step("redo")} disabled={!hist.future.length} aria-label="Redo" title="Redo" className="h-9 w-9">
          <Redo2 className="h-4 w-4" />
        </Button>
      </nav>

      <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row">
        {/* slides: a column on a computer, a row on a phone */}
        <aside aria-label="Slides" className="flex shrink-0 flex-col gap-2 lg:w-28">
          <ol className="flex gap-2 overflow-x-auto pb-1 lg:min-h-0 lg:flex-1 lg:flex-col lg:overflow-y-auto lg:overflow-x-hidden">
            {work.slides.map((s, i) => (
              <li
                key={s.id}
                draggable
                onDragStart={() => setDragSlide(i)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => (dragSlide !== null && dragSlide !== i && moveSlide(dragSlide, i), setDragSlide(null))}
                className="shrink-0"
              >
                <button type="button" onClick={() => goSlide(i)} aria-current={i === index} aria-label={`Slide ${i + 1}`} className={`relative block overflow-hidden rounded-md border-2 ${i === index ? "border-primary" : "border-transparent hover:border-border"}`}>
                  <SlideView slide={s} format={work.format} width={96} thumb />
                  <span className="absolute left-1 top-1 rounded bg-black/60 px-1 text-[10px] text-white">{i + 1}</span>
                </button>
              </li>
            ))}
          </ol>
          <div className="flex gap-1">
            <Button size="icon" variant="ghost" aria-label="Add a slide" title="Add a slide" onClick={() => addSlide(false)} className="h-9 w-9">
              <Plus className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="ghost" aria-label="Duplicate this slide" title="Duplicate this slide" onClick={() => addSlide(true)} className="h-9 w-9">
              <Copy className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="ghost" aria-label="Delete this slide" title="Delete this slide" onClick={deleteSlide} disabled={work.slides.length < 2} className="h-9 w-9">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </aside>

        <div ref={stage} className={`relative flex min-h-[60vh] flex-1 select-none items-center justify-center lg:min-h-0 ${layer ? "touch-none" : ""}`} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
          <div data-slide-box="" className="relative shadow-xl" style={{ width: FRAME_W * k, height: H * k }}>
            <SlideView slide={slide} format={work.format} width={FRAME_W * k} />
            {layer && !layer.hidden && (
              <div
                className="pointer-events-none absolute outline outline-2 outline-primary"
                style={{ left: layer.x * k, top: layer.y * k, width: layer.w * k, height: layer.h * k, transform: layer.rotation ? `rotate(${layer.rotation}deg)` : undefined }}
              >
                {!layer.locked &&
                  HANDLES.map((h) => (
                    <span
                      key={h}
                      data-handle={h}
                      className="pointer-events-auto absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary bg-background"
                      style={{ left: `${HANDLE_POS[h][0] * 100}%`, top: `${HANDLE_POS[h][1] * 100}%`, cursor: `${h}-resize` }}
                    />
                  ))}
              </div>
            )}
          </div>
        </div>

        <aside aria-label="Design panel" className="shrink-0 overflow-y-auto rounded-lg border border-border lg:w-80">
          <Inspector
            userId={userId}
            design={work}
            slide={slide}
            layer={layer}
            brandColors={brandColors}
            brandFont={brandFont}
            onSlide={patchSlide}
            onCaption={(caption) => commit({ ...workRef.current, caption }, "caption")}
            onLayer={patchLayer}
            onSelect={setSelected}
            onRemove={removeLayer}
            onMove={moveLayer}
            onLookAll={(look, look_strength) =>
              setSlides(workRef.current.slides.map((s) => ({ ...s, layers: s.layers.map((l) => (l.type === "image" && l.src ? { ...l, look, look_strength } : l)) })))
            }
          />
        </aside>
      </div>
    </div>
  );
}
