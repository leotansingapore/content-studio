// /design/:id: the layer editor (Volume's, folded in). Slides on the left, the slide in the middle with its
// selection box, the panel on the right. Edits autosave; undo keeps 50 steps (typing or dragging one control
// within a second is one step). ?slide=N opens a slide. While it shows, it follows Claude's edits (Connect Claude's
// update_design): each one lands as one undo step under a "Claude is editing" pill, or waits behind "Load its
// version" when the user edited in the last few seconds; "Take over" stops following for the visit.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { CalendarClock, ChevronLeft, Compass, Copy, Download, Image as ImageIcon, Loader2, Palette, Plus, Redo2, Save, Smartphone, Square, SunDim, Trash2, Type, Undo2, X } from "lucide-react";
import Inspector from "@/components/design/Inspector";
import PageTour from "@/components/PageTour";
import SlideView, { setBrandPictures } from "@/components/design/SlideView";
import { Button } from "@/components/ui/button";
import { ToastAction } from "@/components/ui/toast";
import { useToast } from "@/hooks/use-toast";
import { loadBrandFonts, registerBrandFonts } from "@/lib/brandFont";
import { loadBrand, slideFileName, slidesZipName } from "@/lib/carousel";
import { downloadBlob, zipBlob } from "@/lib/carouselRender";
import {
  FONT_NAMES,
  FORMAT_H,
  FORMAT_LABEL,
  FRAME_W,
  MAX_LAYERS,
  MAX_PALETTE,
  MAX_SLIDES,
  designById,
  designsKey,
  ensureDesignFonts,
  followStep,
  freshSlide,
  loadPalette,
  newLayer,
  newSlide,
  plainText,
  saveDesign,
  saveOwnTemplate,
  savePalette,
  type Design,
  type DesignSlide,
  type Layer,
  type LayerType,
} from "@/lib/design";
import { cloudSyncedAt, refreshCloudKeys } from "@/lib/cloudSync";
import { ExportPictureError, designPngs } from "@/lib/designExport";
import { putFile } from "@/lib/deviceFiles";
import { getDraftById, newDraftId, upsertDraft, type DraftEntry } from "@/lib/draftHistory";
import { links } from "@/lib/links";
import { DESIGN_TOUR, pageTourDone } from "@/lib/pageTour";
import { sendToPhone } from "@/lib/phoneLink";
import { ago } from "@/lib/slideshow";
import { socialConnectShown } from "@/lib/socialConnect";
import { supabase } from "@/lib/supabase";
import { useSignedInUser } from "@/lib/useLeoOnly";
import NotFoundPage from "@/pages/NotFoundPage";

const MAX_HISTORY = 50;
const MERGE_MS = 1000;
const FOLLOW_MS = 4000;
/** The pill stays this long after Claude's last change. */
const CLAUDE_MS = 30_000;
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
  // the last version this editor saved or took from Claude, and when the user last changed something
  const saved = useRef({ at: initial.updatedAt, doc: initial });
  const editedAt = useRef(0);
  const [follow, setFollow] = useState(true);
  const [claudeAt, setClaudeAt] = useState(0);
  const [offer, setOffer] = useState<Design | null>(null);
  const [prep, setPrep] = useState<{ done: number; total: number } | string | null>(null);
  const [menu, setMenu] = useState<"download" | "choose" | "brand" | null>(null);
  const [chosen, setChosen] = useState<Set<number>>(new Set());
  const [phone, setPhone] = useState<{ url: string; expiresAt: string; qr?: string } | null>(null);
  const [typing, setTyping] = useState<string | null>(null);
  const fonts = useMemo(() => loadBrandFonts(userId), [userId]);
  const [palette, setPalette] = useState(() => loadPalette(userId, fonts.map((f) => f.family)));
  const [tour, setTour] = useState(() => !pageTourDone(userId, "design-editor"));
  const [swatch, setSwatch] = useState("#ffd21f");
  const editPalette = (p: Partial<typeof palette>) => setPalette(savePalette(userId, { ...palette, ...p }, fonts.map((f) => f.family)));
  const abort = useRef<AbortController | null>(null);
  const brand = useMemo(() => loadBrand(userId), [userId]);

  const index = Math.min(work.slides.length - 1, Math.max(0, (Number(params.get("slide")) || 1) - 1));
  const slide = work.slides[index];
  const layer = slide.layers.find((l) => l.id === selected) ?? null;
  const H = FORMAT_H[work.format];

  useEffect(() => {
    ensureDesignFonts();
    setBrandPictures({ logo: brand?.logo, photo: brand?.photo });
    void registerBrandFonts(fonts);
  }, [brand, fonts]);

  // autosave half a second after the last change (Claude's own version is already saved), and at once on leaving
  const keep = (d: Design) => {
    const now = new Date();
    saveDesign(userId, d, now);
    saved.current = { at: now.toISOString(), doc: d };
    setSavedAt(now.toISOString());
  };
  const autosave = async () => {
    if (workRef.current === saved.current.doc) return;
    // a row Claude changed since the last check goes through followStep first, so this save never pushes over it unseen
    if (follow && (await pullOthers().catch(() => false))) return;
    keep(workRef.current);
  };
  useEffect(() => {
    if (work === saved.current.doc) return;
    const t = setTimeout(() => void autosave(), 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [work, userId]);
  useEffect(() => {
    const flush = () => workRef.current !== saved.current.doc && keep(workRef.current);
    window.addEventListener("pagehide", flush);
    return () => (window.removeEventListener("pagehide", flush), flush());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const commit = useCallback((next: Design, tag?: string, fromClaude = false) => {
    const prev = workRef.current;
    if (!fromClaude) editedAt.current = Date.now();
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
      editedAt.current = Date.now();
      workRef.current = to;
      setWork(to);
      return dir === "undo" ? { past: h.past.slice(0, -1), future: [...h.future, cur], at: 0 } : { past: [...h.past, cur], future: h.future.slice(0, -1), at: 0 };
    });
  };

  // follow Claude: read the row's stamp (every few seconds while this tab shows, and before each autosave) and pull the
  // row only when another writer changed it (refreshCloudKeys puts it in localStorage, so the sync never pushes the
  // stale copy back). One check at a time; true when it saved or took a version itself.
  const seen = useRef("");
  const checking = useRef<Promise<boolean> | null>(null);
  const pullOthers = () =>
    (checking.current ??= (async () => {
      const key = designsKey(userId);
      const { data } = await supabase.from("cs_user_data").select("updated_at").eq("user_id", userId).eq("key", key).maybeSingle();
      const at = data?.updated_at;
      if (!at || at === seen.current) return false;
      seen.current = at;
      if (Date.parse(at) === Date.parse(cloudSyncedAt(key) ?? "")) return false; // this device's own write, or one it has
      await refreshCloudKeys([key]);
      const stored = designById(userId, workRef.current.id);
      const next = followStep(workRef.current, stored, { savedAt: saved.current.at, editedAt: editedAt.current, now: Date.now() });
      if (next === "ignore") return false;
      if (next === "apply" && stored) {
        saved.current = { at: stored.updatedAt, doc: stored };
        setSavedAt(stored.updatedAt);
        commit(stored, undefined, true);
        setOffer(null);
        setClaudeAt(Date.now());
        return true;
      }
      // the sync just stored Claude's copy (offer) or another device's older one (resave): keep what the user is
      // looking at saved; Claude's waits for the button
      keep(workRef.current);
      if (next === "offer") setOffer(stored);
      return true;
    })().finally(() => (checking.current = null)));
  useEffect(() => {
    if (!follow) return;
    const tick = () => {
      setClaudeAt((t) => (t && Date.now() - t > CLAUDE_MS ? 0 : t));
      if (document.visibilityState === "visible") void pullOthers().catch(() => undefined); // offline: the next tick tries again
    };
    const t = setInterval(tick, FOLLOW_MS);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [follow, userId, commit]);
  const takeOver = () => (setFollow(false), setClaudeAt(0), setOffer(null));
  const loadOffer = () => {
    if (offer) commit(offer, undefined, true);
    setOffer(null);
    setClaudeAt(Date.now());
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
    else downloadBlob(await zipBlob(files.map((file, i) => ({ file, name: slideFileName(d.title, only?.[i] ?? i) }))), slidesZipName(d.title));
    toast({ title: files.length === 1 ? "Slide downloaded" : "Slides downloaded" });
  };
  const toPhone = async () => {
    setMenu(null);
    const files = await run((signal) => designPngs(userId, workRef.current, progress(signal)));
    if (!files) return;
    try {
      const sent = await sendToPhone(files, workRef.current);
      setPhone(sent);
      // the QR library loads only here, the one place it's used
      const { toDataURL } = await import("qrcode");
      // a caption full of emoji can outgrow a QR code: the link still shows, to open or copy
      setPhone({ ...sent, qr: await toDataURL(sent.url, { margin: 1, width: 320 }).catch(() => undefined) });
    } catch (e) {
      toast({ title: "Couldn't send it to your phone", description: (e as Error).message, variant: "destructive" });
    }
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
    if (await toPosts()) toast({ title: "Saved to All posts", action: <ToastAction altText="Open All posts" onClick={() => navigate(links.drafts())}>Open All posts</ToastAction> });
  };
  const schedule = async () => {
    const post = await toPosts();
    if (post) navigate(`${links.calendar({ post })}&view=month`);
  };
  const busy = prep !== null && typeof prep !== "string";
  const brandColors = [...new Set([...(brand?.color ? [brand.color.toLowerCase()] : []), ...palette.colors])];

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
          className="min-w-0 flex-1 basis-40 rounded-md border border-transparent bg-transparent px-1.5 py-1 text-lg font-semibold [@media(pointer:coarse)]:min-h-11 hover:border-border focus:border-input focus:outline-none"
        />
        <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">{FORMAT_LABEL[work.format]}</span>
        <span className="text-xs text-muted-foreground" aria-live="polite">
          Saved {ago(savedAt)}
        </span>
        <Button variant="ghost" size="sm" onClick={() => setTour(true)} className={`gap-1 text-muted-foreground ${TOUCH}`}>
          <Compass className="h-4 w-4" /> Tour
        </Button>
        {follow && (offer || claudeAt > 0) && (
          <span role="status" className="flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs">
            {offer ? "Claude changed this slideshow." : "Claude is editing"}
            {offer && (
              <button type="button" onClick={loadOffer} className={`font-semibold text-primary hover:underline ${TOUCH}`}>
                Load its version
              </button>
            )}
            <button type="button" onClick={takeOver} className={`font-semibold text-primary hover:underline ${TOUCH}`}>
              Take over
            </button>
          </span>
        )}
        <div className="relative" data-tour="design-export">
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
              <button role="menuitem" type="button" className="w-full rounded px-2 py-1.5 text-left text-sm hover:bg-muted" onClick={() => (setChosen(new Set([index])), setMenu("choose"))}>
                Choose slides
              </button>
              <button role="menuitem" type="button" className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-sm hover:bg-muted" onClick={() => void toPhone()}>
                <Smartphone className="h-4 w-4" /> Send to phone
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
          {menu === "choose" && (
            <div role="dialog" aria-label="Choose slides" className="absolute right-0 z-30 mt-1 w-64 space-y-2 rounded-md border border-border bg-popover p-2 shadow-lg">
              <div className="grid grid-cols-5 gap-1">
                {work.slides.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    aria-pressed={chosen.has(i)}
                    onClick={() => setChosen((c) => (c.delete(i) || c.add(i), new Set(c)))}
                    className={`h-9 rounded border text-sm ${chosen.has(i) ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>
              <Button size="sm" className="w-full" disabled={!chosen.size} onClick={() => void downloadSlides([...chosen].sort((a, b) => a - b))}>
                Download {chosen.size} slide{chosen.size === 1 ? "" : "s"}
              </Button>
            </div>
          )}
        </div>
        <Button variant={socialConnectShown() ? "outline" : "default"} size="sm" onClick={() => void saveToPosts()} disabled={busy} className={`gap-1.5 ${TOUCH}`}>
          <Save className="h-4 w-4" /> Save to All posts
        </Button>
        {socialConnectShown() && (
          <Button size="sm" onClick={() => void schedule()} disabled={busy} className={`gap-1.5 ${TOUCH}`}>
            <CalendarClock className="h-4 w-4" /> Schedule
          </Button>
        )}
      </header>
      {phone && (
        <div role="status" className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
          {phone.qr ? <img src={phone.qr} alt="QR code: scan it with your phone's camera" className="hidden h-40 w-40 rounded bg-white p-1 sm:block" /> : null}
          <Smartphone className="h-4 w-4 shrink-0" />
          <span>Open this on your phone until {new Date(phone.expiresAt).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" })}:</span>
          <a href={phone.url} target="_blank" rel="noreferrer" className="min-w-0 truncate text-primary hover:underline">
            {phone.url}
          </a>
          <Button size="sm" variant="outline" onClick={() => void navigator.clipboard.writeText(phone.url).then(() => toast({ title: "Link copied" }))}>
            Copy link
          </Button>
          <button type="button" aria-label="Close" onClick={() => setPhone(null)} className="ml-auto rounded p-1 text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
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

      <nav aria-label="Add to the slide" data-tour="design-tools" className="flex flex-wrap items-center gap-0.5 border-y border-border py-1">
        {tool("Text", Type, () => addLayer("text", palette.body ? { font: palette.body } : {}))}
        {tool("Image", ImageIcon, () => addLayer("image"))}
        {tool("Shape", Square, () => addLayer("shape"))}
        {tool("Fade", SunDim, () => addLayer("gradient"))}
        <div className="relative" data-tour="design-brand">
          {tool("Brand", Palette, () => setMenu(menu === "brand" ? null : "brand"), menu === "brand")}
          {menu === "brand" && (
            <div role="menu" className="absolute left-0 z-30 mt-1 w-72 rounded-md border border-border bg-popover p-1 shadow-lg">
              <div className="space-y-2 border-b border-border p-2">
                <p className="text-xs font-medium text-muted-foreground">Palette, {palette.colors.length} of {MAX_PALETTE}</p>
                <div className="flex flex-wrap gap-1">
                  {palette.colors.map((c) => (
                    <button key={c} type="button" aria-label={`Remove ${c}`} title={`${c}, click to remove`} onClick={() => editPalette({ colors: palette.colors.filter((x) => x !== c) })} className="group relative h-7 w-7 rounded-full border border-border" style={{ background: c }}>
                      <X className="absolute inset-1.5 hidden h-4 w-4 text-white mix-blend-difference group-hover:block" />
                    </button>
                  ))}
                </div>
                {palette.colors.length < MAX_PALETTE && (
                  <div className="flex items-center gap-2">
                    <input type="color" aria-label="Pick a colour" value={swatch} onChange={(e) => setSwatch(e.target.value)} className="h-8 w-10 cursor-pointer rounded border border-border bg-transparent" />
                    <Button size="sm" variant="outline" onClick={() => editPalette({ colors: [...palette.colors, swatch] })}>
                      Add colour
                    </Button>
                  </div>
                )}
                {(["heading", "body"] as const).map((k) => (
                  <label key={k} className="grid grid-cols-[4.5rem_1fr] items-center gap-2 text-xs text-muted-foreground">
                    {k === "heading" ? "Headings" : "Body text"}
                    <select value={palette[k] ?? ""} onChange={(e) => editPalette({ [k]: e.target.value || null })} className="h-8 rounded-md border border-input bg-background px-1 text-sm text-foreground">
                      <option value="">Inter (default)</option>
                      {fonts.length > 0 && (
                        <optgroup label="Your fonts">
                          {fonts.map((f) => (
                            <option key={f.family} value={f.family}>
                              {f.name}
                            </option>
                          ))}
                        </optgroup>
                      )}
                      <optgroup label="Built in">
                        {FONT_NAMES.map((f) => (
                          <option key={f}>{f}</option>
                        ))}
                      </optgroup>
                    </select>
                  </label>
                ))}
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => (setMenu(null), addLayer("text", { name: "Heading", text: "Your heading", size: 96, weight: 800, ...(palette.heading ? { font: palette.heading } : {}) }))}>
                    Add a heading
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => (setMenu(null), addLayer("text", { name: "Body", text: "Your text", size: 48, weight: 500, ...(palette.body ? { font: palette.body } : {}) }))}>
                    Add body text
                  </Button>
                </div>
              </div>
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
        <aside aria-label="Slides" data-tour="design-slides" className="flex shrink-0 flex-col gap-2 lg:w-28">
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

        <div ref={stage} data-tour="design-stage" className={`relative flex min-h-[60vh] flex-1 select-none items-center justify-center lg:min-h-0 ${layer ? "touch-none" : ""}`} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onDoubleClick={() => layer?.type === "text" && !layer.locked && setTyping(layer.id)}>
          <div data-slide-box="" className="relative shadow-xl" style={{ width: FRAME_W * k, height: H * k }}>
            <SlideView slide={slide} format={work.format} width={FRAME_W * k} />
            {layer?.type === "text" && typing === layer.id && (
              // type on the slide: an edit box over the words (double-click a text to open it, Escape or click away to close)
              <textarea
                autoFocus
                aria-label="Type the words"
                value={layer.text}
                onChange={(e) => patchLayer(layer.id, { text: e.target.value }, "text")}
                onBlur={() => setTyping(null)}
                onKeyDown={(e) => e.key === "Escape" && setTyping(null)}
                onPointerDown={(e) => e.stopPropagation()}
                className="absolute z-10 resize-none rounded border-2 border-primary bg-black/75 p-1 text-white outline-none"
                style={{ left: layer.x * k, top: layer.y * k, width: layer.w * k, height: Math.max(layer.h * k, 48), fontFamily: layer.font, fontSize: Math.max(12, layer.size * k), lineHeight: layer.line_height, textAlign: layer.align }}
              />
            )}
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

        <aside aria-label="Design panel" data-tour="design-panel" className="shrink-0 overflow-y-auto rounded-lg border border-border lg:w-80">
          <Inspector
            userId={userId}
            design={work}
            slide={slide}
            layer={layer}
            brandColors={brandColors}
            fonts={fonts}
            brandFonts={palette}
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
      {tour && <PageTour id="design-editor" userId={userId} steps={DESIGN_TOUR} onClose={() => setTour(false)} />}
    </div>
  );
}
