// The slide on screen (/slideshow). The canvas paints it exactly as the PNGs will look (slideshowDraw.ts);
// a layer of plain elements on top picks, moves, resizes, deletes and types in place, with 44 px handles on
// touch screens. Side handles change the width, the rest change the size; a centre guide snaps within 12 px.

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { Loader2, X } from "lucide-react";
import { FRAME_W, MAX_BOX_CHARS, frameHeight, type ShowSlide, type Slideshow, type TextBox } from "@/lib/slideshow";
import { bitmapOf, boxCss, logoOf, paintSlide, slidePicture, type BoxLayout, type SlideLook } from "@/lib/slideshowDraw";
import { cn } from "@/lib/utils";

/** A slide's picture as the editor knows it: the file, still loading, not on this device, or none. */
export type PictureState = Blob | "loading" | "missing" | null;

type Handle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
// where each handle sits on the box, and which way pulling it grows the box
const HANDLES: { h: Handle; x: number; y: number }[] = [
  { h: "nw", x: -1, y: -1 }, { h: "n", x: 0, y: -1 }, { h: "ne", x: 1, y: -1 }, { h: "e", x: 1, y: 0 },
  { h: "se", x: 1, y: 1 }, { h: "s", x: 0, y: 1 }, { h: "sw", x: -1, y: 1 }, { h: "w", x: -1, y: 0 },
];
const SNAP_PX = 12;
const DOUBLE_TAP_MS = 350;
// a handle's centre kept half a 44 px touch target inside the slide, which clips whatever passes its edge
const inside = (px: number) => `clamp(1.375rem, ${px}px, calc(100% - 1.375rem))`;

/** Paints `slide` into `canvas` once its picture and logo are decoded; a newer paint wins over an older one. */
function usePaint(canvas: RefObject<HTMLCanvasElement>, slide: ShowSlide, size: Slideshow["size"], look: SlideLook, picture: PictureState, ready: boolean, scale = 1) {
  const turn = useRef(0);
  useEffect(() => {
    const c = canvas.current;
    if (!c || !ready) return;
    const mine = ++turn.current;
    const blob = picture instanceof Blob ? picture : null;
    void Promise.all([blob ? bitmapOf(blob) : null, look.logo ? logoOf(look.logo) : null]).then(([bitmap, logo]) => {
      const ctx = c.getContext("2d");
      if (mine !== turn.current || !ctx) return;
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      paintSlide(ctx, slide, size, bitmap, look, logo);
    });
  }, [canvas, slide, size, look, picture, ready, scale]);
}

type Drag = { id: string; handle: Handle | "move"; px: number; py: number; box: TextBox; rect: BoxLayout["rect"]; moved: boolean };

export default function SlideCanvas({
  slide,
  size,
  look,
  picture,
  layout,
  picked,
  ready,
  onPick,
  onBegin,
  onBox,
  onEnd,
  onType,
  onDelete,
  onSwap,
}: {
  slide: ShowSlide;
  size: Slideshow["size"];
  look: SlideLook;
  picture: PictureState;
  layout: BoxLayout[];
  picked: string | null;
  /** The fonts are loaded, so the canvas and the handles measure alike. */
  ready: boolean;
  onPick: (id: string | null) => void;
  /** A drag starts: the page keeps the slideshow as it was, for Undo. */
  onBegin: () => void;
  onBox: (id: string, patch: Partial<TextBox>) => void;
  onEnd: () => void;
  onType: (id: string, text: string) => void;
  onDelete: (id: string) => void;
  onSwap: () => void;
}) {
  const H = frameHeight(size);
  const canvas = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  const [typing, setTyping] = useState<string | null>(null);
  const [guide, setGuide] = useState(false);
  const drag = useRef<Drag | null>(null);
  const lastTap = useRef<{ id: string; at: number } | null>(null);
  usePaint(canvas, slide, size, look, picture, ready);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScale(el.clientWidth / FRAME_W));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // a box picked elsewhere (or let go) ends typing in place
  useEffect(() => {
    if (typing && typing !== picked) setTyping(null);
  }, [picked, typing]);

  const start = (e: ReactPointerEvent, id: string, handle: Drag["handle"]) => {
    e.stopPropagation();
    const box = slide.boxes.find((b) => b.id === id);
    const rect = layout.find((l) => l.id === id)?.rect;
    if (!box || !rect || typing === id) return;
    // picking again also brings the Text tab back
    onPick(id);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { id, handle, px: e.clientX, py: e.clientY, box, rect, moved: false };
  };

  const move = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d || !scale) return;
    const dx = (e.clientX - d.px) / scale;
    const dy = (e.clientY - d.py) / scale;
    if (!d.moved) {
      if (Math.hypot(dx * scale, dy * scale) < 3) return;
      d.moved = true;
      onBegin();
    }
    if (d.handle === "move") {
      let x = d.box.x + dx / FRAME_W;
      const snap = Math.abs(x - 0.5) * FRAME_W * scale < SNAP_PX;
      if (snap) x = 0.5;
      setGuide(snap);
      onBox(d.id, { x, y: d.box.y + dy / H });
      return;
    }
    const hd = HANDLES.find((h) => h.h === d.handle)!;
    if (hd.y === 0) {
      // the side handles pull both sides, so the box keeps its centre
      onBox(d.id, { w: d.box.w + (2 * hd.x * dx) / FRAME_W });
      return;
    }
    // the box grows by twice the pull (it keeps its centre); a corner averages its two directions
    const pull = hd.x ? (hd.x * dx + hd.y * dy) / 2 : hd.y * dy;
    onBox(d.id, { size: d.box.size * (1 + (2 * pull) / Math.max(40, d.rect.h)) });
  };

  const end = (e: ReactPointerEvent) => {
    const d = drag.current;
    drag.current = null;
    setGuide(false);
    if (!d) return;
    if (d.moved) return onEnd();
    // a second tap on the same box types in place (mouse double-click and phone double-tap alike)
    const now = e.timeStamp;
    if (d.handle === "move" && lastTap.current?.id === d.id && now - lastTap.current.at < DOUBLE_TAP_MS) {
      lastTap.current = null;
      setTyping(d.id);
    } else lastTap.current = { id: d.id, at: now };
  };

  const picking = picked ? layout.find((l) => l.id === picked) : null;
  const typed = typing ? slide.boxes.find((b) => b.id === typing) : null;
  const typedRect = typing ? layout.find((l) => l.id === typing)?.rect : null;

  return (
    <div
      ref={wrap}
      className="relative w-full touch-none select-none overflow-hidden rounded-lg bg-zinc-600 shadow-card"
      style={{ aspectRatio: `${FRAME_W} / ${H}` }}
      onPointerDown={() => {
        setTyping(null);
        onPick(null);
      }}
    >
      <canvas ref={canvas} width={FRAME_W} height={H} className="absolute inset-0 h-full w-full" aria-label="The slide" role="img" />
      {picture === "loading" && <Loader2 className="absolute right-3 top-3 h-5 w-5 animate-spin text-white/80" aria-label="Loading the picture" />}
      {picture === "missing" && (
        <div className="absolute inset-x-3 bottom-3 flex flex-wrap items-center justify-between gap-2 rounded-md bg-black/60 px-3 py-2 text-xs text-white" onPointerDown={(e) => e.stopPropagation()}>
          <span>This picture is on the device you added it from.</span>
          <button type="button" onClick={onSwap} className="min-h-9 rounded-md bg-white px-3 font-semibold text-zinc-900 [@media(pointer:coarse)]:min-h-11">
            Swap picture
          </button>
        </div>
      )}
      {guide && <div className="pointer-events-none absolute inset-y-0 left-1/2 w-px bg-primary" aria-hidden />}
      {scale > 0 &&
        layout.map((l) => (
          <div
            key={l.id}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onPick(l.id))}
            aria-label={`Text box: ${slide.boxes.find((b) => b.id === l.id)?.text.slice(0, 40) ?? ""}`}
            aria-pressed={picked === l.id}
            className={cn("absolute cursor-move", picked === l.id ? "outline outline-2 outline-primary" : "hover:outline hover:outline-1 hover:outline-white/70")}
            style={{ left: l.rect.x * scale, top: l.rect.y * scale, width: l.rect.w * scale, height: l.rect.h * scale }}
            onPointerDown={(e) => start(e, l.id, "move")}
            onPointerMove={move}
            onPointerUp={end}
            onPointerCancel={end}
          />
        ))}
      {picking && scale > 0 && !typing && (
        <>
          {HANDLES.map((hd) => (
            <div
              key={hd.h}
              aria-hidden
              className={cn(
                "absolute grid h-7 w-7 -translate-x-1/2 -translate-y-1/2 place-items-center [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11",
                hd.y === 0 ? "cursor-ew-resize" : hd.x === 0 ? "cursor-ns-resize" : hd.x === hd.y ? "cursor-nwse-resize" : "cursor-nesw-resize",
              )}
              style={{ left: inside((picking.rect.x + ((hd.x + 1) / 2) * picking.rect.w) * scale), top: inside((picking.rect.y + ((hd.y + 1) / 2) * picking.rect.h) * scale) }}
              onPointerDown={(e) => start(e, picking.id, hd.h)}
              onPointerMove={move}
              onPointerUp={end}
              onPointerCancel={end}
            >
              <span className="h-2.5 w-2.5 rounded-sm border border-primary bg-white" />
            </div>
          ))}
          <button
            type="button"
            aria-label="Delete this text box"
            className="absolute grid h-8 w-8 -translate-y-full translate-x-1 place-items-center [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11"
            // past the box's top right corner, pulled back inside the slide when that corner is near an edge
            style={{ left: `min(${(picking.rect.x + picking.rect.w) * scale}px, calc(100% - 3rem))`, top: `max(${picking.rect.y * scale}px, 2.75rem)` }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => onDelete(picking.id)}
          >
            <span className="grid h-6 w-6 place-items-center rounded-full bg-zinc-900 text-white shadow">
              <X className="h-3.5 w-3.5" />
            </span>
          </button>
        </>
      )}
      {typed && typedRect && scale > 0 && (
        <textarea
          autoFocus
          aria-label="Words"
          value={typed.text}
          maxLength={MAX_BOX_CHARS}
          onChange={(e) => onType(typed.id, e.target.value)}
          onPointerDown={(e) => e.stopPropagation()}
          onBlur={() => setTyping(null)}
          onKeyDown={(e) => e.key === "Escape" && setTyping(null)}
          className="absolute resize-none rounded-md border-2 border-primary bg-white/95 p-0 text-center text-zinc-900 outline-none"
          style={{
            left: typedRect.x * scale,
            top: typedRect.y * scale,
            width: typedRect.w * scale,
            minHeight: typedRect.h * scale,
            font: boxCss({ font: typed.font, size: Math.max(12, typed.size * scale) }),
            lineHeight: 1.25,
          }}
        />
      )}
    </div>
  );
}

/** A small drawing of one slide: the editor's strip and the saved list. Loads its own picture when not given. */
export function SlideThumb({ slide, size, look, picture, ready, className }: { slide: ShowSlide; size: Slideshow["size"]; look: SlideLook; picture?: PictureState; ready: boolean; className?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [own, setOwn] = useState<PictureState>(null);
  useEffect(() => {
    if (picture !== undefined) return;
    let live = true;
    void slidePicture(slide).then((b) => live && setOwn(b));
    return () => {
      live = false;
    };
  }, [picture, slide]);
  const k = 0.15;
  usePaint(canvas, slide, size, look, picture === undefined ? own : picture, ready, k);
  return <canvas ref={canvas} width={Math.round(FRAME_W * k)} height={Math.round(frameHeight(size) * k)} className={cn("block rounded bg-zinc-600", className)} aria-hidden />;
}
