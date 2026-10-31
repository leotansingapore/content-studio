// One design slide drawn as positioned layers on a 1080-wide frame, scaled to `width`. The same markup is what
// designExport.ts turns into a PNG, so the editor, the thumbnails and the download match. Ported from Volume's
// renderer: text fits its box by searching the font size, highlights clone per line, looks are CSS filters
// with a grain overlay.

import { Fragment, createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { getFile } from "@/lib/deviceFiles";
import {
  FONTS,
  FORMAT_H,
  FRAME_W,
  GRAIN,
  accentRuns,
  plainText,
  fontStack,
  fontWeight,
  gradientCss,
  grainOpacity,
  lookFilter,
  type DesignFormat,
  type DesignSlide,
  type ImageLayer,
  type Layer,
  type TextLayer,
} from "@/lib/design";

const urls = new Map<string, Promise<string | null>>();
let brandPics: { logo?: string; photo?: string } = {};
/** The open brand's logo and headshot (data URLs), which brand:logo and brand:photo layers draw. */
export function setBrandPictures(p: { logo?: string; photo?: string }) {
  brandPics = p;
}
/** A device key's picture as an object URL, made once per visit; brand pictures from the kit; web addresses pass through. */
export function pictureUrl(src: string): Promise<string | null> {
  if (src === "brand:logo" || src === "brand:photo") return Promise.resolve(brandPics[src === "brand:logo" ? "logo" : "photo"] ?? null);
  if (!src.startsWith("cimg-")) return Promise.resolve(src || null);
  if (!urls.has(src)) urls.set(src, getFile(src).then((b) => (b ? URL.createObjectURL(b) : null)).catch(() => null));
  return urls.get(src)!;
}
function usePicture(src: string): string | null {
  const [url, setUrl] = useState<string | null>(src.startsWith("cimg-") || src.startsWith("brand:") ? null : src || null);
  useEffect(() => {
    let live = true;
    void pictureUrl(src).then((u) => live && setUrl(u));
    return () => {
      live = false;
    };
  }, [src]);
  return url;
}

/** Thumbnails load pictures lazily and ask Pexels for a small file; export and the editor never set it. */
const Thumb = createContext(false);
const small = (url: string) => (url.includes("images.pexels.com") ? url.replace(/([?&]w=)\d+/, "$1360") : url);

const box = (l: Layer): CSSProperties => ({
  position: "absolute",
  left: l.x,
  top: l.y,
  width: l.w,
  height: l.h,
  opacity: l.opacity,
  transform: l.rotation ? `rotate(${l.rotation}deg)` : undefined,
});

/** The largest size from 8 up to `max` whose words fit the box without breaking a word (Volume's search). */
function fitSize(outer: HTMLElement, inner: HTMLElement, max: number, filled: boolean): number {
  const wrap = inner.style.overflowWrap;
  const fits = (px: number) => {
    inner.style.fontSize = `${px}px`;
    if ((filled ? inner.scrollHeight : inner.offsetHeight) > outer.clientHeight + 1) return false;
    if (inner.scrollWidth <= outer.clientWidth + 1) return true;
    const h = inner.offsetHeight;
    inner.style.overflowWrap = "anywhere";
    const broken = inner.offsetHeight;
    inner.style.overflowWrap = wrap;
    return broken <= h;
  };
  if (fits(max)) return max;
  let lo = Math.min(8, max);
  let hi = max;
  while (hi - lo > 1) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) lo = mid;
    else hi = mid;
  }
  const px = Math.floor(lo);
  inner.style.fontSize = `${px}px`;
  return px;
}

function useFontsLoaded(): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    const bump = () => setN((x) => x + 1);
    document.fonts?.addEventListener?.("loadingdone", bump);
    void document.fonts?.ready.then(bump);
    return () => document.fonts?.removeEventListener?.("loadingdone", bump);
  }, []);
  return n;
}

function Words({ l, text }: { l: TextLayer; text: string }) {
  // with the accent off the [[ ]] marks are kept in the words but not shown
  if (!l.accent) return <>{plainText(text)}</>;
  const a = l.accent;
  const font = a.font ?? l.font;
  return (
    <>
      {accentRuns(text).map((r, i) =>
        r.accent ? (
          <span
            key={i}
            style={{
              color: a.color,
              ...(a.font ? { fontFamily: fontStack(a.font) } : {}),
              fontWeight: fontWeight(font, a.weight ?? l.weight),
              ...(a.italic === undefined ? {} : { fontStyle: a.italic ? "italic" : "normal" }),
              ...(a.underline ? { textDecorationLine: "underline", textDecorationColor: a.color, textDecorationThickness: "0.08em", textUnderlineOffset: "0.12em" } : {}),
            }}
          >
            {r.text}
          </span>
        ) : (
          <Fragment key={i}>{r.text}</Fragment>
        ),
      )}
    </>
  );
}

function TextView({ l }: { l: TextLayer }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  useFontsLoaded();
  useLayoutEffect(() => {
    const o = outer.current;
    const i = inner.current;
    if (!o || !i) return;
    if (l.auto_fit) fitSize(o, i, l.size, l.fill !== null);
    else i.style.fontSize = `${l.size}px`;
  });
  const deco = l.strike || l.underline;
  const style: CSSProperties = {
    fontFamily: fontStack(l.font),
    fontWeight: fontWeight(l.font, l.weight),
    fontSynthesis: FONTS[l.font]?.italic === false ? "style" : undefined,
    fontStyle: l.italic ? "italic" : "normal",
    fontSize: l.size,
    color: l.color,
    textAlign: l.align,
    direction: l.direction === "auto" ? undefined : l.direction,
    unicodeBidi: l.direction === "auto" ? "plaintext" : "isolate",
    lineHeight: l.line_height,
    letterSpacing: `${l.letter_spacing}em`,
    textTransform: l.caps ? "uppercase" : "none",
    whiteSpace: "pre-wrap",
    overflowWrap: l.auto_fit ? "normal" : "break-word",
    WebkitTextStroke: l.stroke && l.stroke.width ? `${2 * l.stroke.width}px ${l.stroke.color}` : undefined,
    paintOrder: "stroke fill",
    textShadow: l.shadow ? `${l.shadow.x}px ${l.shadow.y}px ${l.shadow.blur}px ${l.shadow.color}` : undefined,
    width: "100%",
    ...(deco
      ? {
          textDecorationLine: [l.strike && "line-through", l.underline && "underline"].filter(Boolean).join(" "),
          textDecorationColor: (l.strike ?? l.underline)?.color,
          textDecorationThickness: "0.08em",
          textDecorationSkipInk: "none",
          textUnderlineOffset: "0.12em",
        }
      : {}),
  };
  // shortcut: a highlight is one box per line (box-decoration-break), where Volume merges lines into one outline
  const fill: CSSProperties | null = l.fill
    ? { background: l.fill.color, padding: `${0.35 * l.fill.padding}px ${l.fill.padding}px`, borderRadius: l.fill.radius, boxDecorationBreak: "clone", WebkitBoxDecorationBreak: "clone" }
    : null;
  const justify = l.valign === "top" ? "flex-start" : l.valign === "middle" ? "center" : "flex-end";
  return (
    <div ref={outer} data-layer={l.id} style={{ ...box(l), display: "flex", flexDirection: "column", justifyContent: justify }}>
      <div ref={inner} style={style}>
        {fill
          ? l.text.split("\n").map((line, i) => (
              <Fragment key={i}>
                {i > 0 && "\n"}
                {line && (
                  <span style={fill}>
                    <Words l={l} text={line} />
                  </span>
                )}
              </Fragment>
            ))
          : <Words l={l} text={l.text} />}
      </div>
    </div>
  );
}

function ImageView({ l }: { l: ImageLayer }) {
  const thumb = useContext(Thumb);
  const found = usePicture(l.src);
  const url = found && thumb ? small(found) : found;
  const grain = grainOpacity(l.look, l.look_strength);
  return (
    <div
      data-layer={l.id}
      style={{
        ...box(l),
        borderRadius: l.mask === "ellipse" ? "50%" : l.mask === "rounded" ? l.radius : 0,
        overflow: "hidden",
        boxSizing: "border-box",
        isolation: "isolate",
        border: l.border ? `${l.border.width}px solid ${l.border.color}` : undefined,
        background: l.src ? undefined : "repeating-linear-gradient(45deg, #1d2420 0 24px, #252e29 24px 48px)",
      }}
    >
      {url && (
        <img
          src={url}
          alt=""
          draggable={false}
          loading={thumb ? "lazy" : undefined}
          crossOrigin={url.startsWith("http") ? "anonymous" : undefined}
          style={{ width: "100%", height: "100%", display: "block", objectFit: l.fit, objectPosition: `${l.focus_x}% ${l.focus_y}%`, userSelect: "none", filter: lookFilter(l.look, l.look_strength) }}
        />
      )}
      {url && grain > 0 && (
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none", backgroundImage: `url("${GRAIN}")`, backgroundSize: "351px 351px", mixBlendMode: "overlay", opacity: grain }} />
      )}
    </div>
  );
}

export function LayerView({ layer: l }: { layer: Layer }) {
  switch (l.type) {
    case "text":
      return <TextView l={l} />;
    case "image":
      return <ImageView l={l} />;
    case "shape":
      return (
        <div
          data-layer={l.id}
          style={{ ...box(l), background: l.color, borderRadius: l.shape === "ellipse" ? "50%" : l.radius, boxSizing: "border-box", border: l.border ? `${l.border.width}px solid ${l.border.color}` : undefined }}
        />
      );
    case "gradient":
      return <div data-layer={l.id} style={{ ...box(l), background: gradientCss(l.angle, l.stops) }} />;
  }
}

/** A cut-out drawn from a photo that has since been swapped: it would put the old person over the new picture. */
export const staleCutout = (slide: DesignSlide, l: Layer) => {
  if (l.type !== "image" || !l.cutout) return false;
  const of = slide.layers.find((x) => x.id === l.cutout!.of);
  return of?.type === "image" && of.src !== l.cutout.src;
};

/** The slide at `width` pixels wide. `rootRef` reaches the unscaled 1080-wide frame (export reads it). */
export default function SlideView({
  slide,
  format,
  width,
  className,
  rootRef,
  thumb = false,
}: {
  slide: DesignSlide;
  format: DesignFormat;
  width: number;
  className?: string;
  rootRef?: React.Ref<HTMLDivElement>;
  thumb?: boolean;
}) {
  const H = FORMAT_H[format];
  const k = width / FRAME_W;
  return (
    <div className={className} style={{ width, height: H * k, position: "relative", overflow: "hidden" }}>
      <div
        ref={rootRef}
        data-slide-root=""
        style={{ width: FRAME_W, height: H, transform: k === 1 ? undefined : `scale(${k})`, transformOrigin: "top left", position: "absolute", inset: 0, background: slide.background, overflow: "hidden" }}
      >
        <Thumb.Provider value={thumb}>{slide.layers.map((l) => (l.hidden || staleCutout(slide, l) ? null : <LayerView key={l.id} layer={l} />))}</Thumb.Provider>
      </div>
    </div>
  );
}
