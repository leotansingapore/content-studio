// Design slides to PNG files. Each slide is drawn by SlideView off screen at full size, its fonts and pictures
// are inlined as data URLs, and the markup is painted through an SVG foreignObject onto a canvas, so the file
// matches the editor. No library: the markup is our own and every style is inline.

import { createElement } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import SlideView, { pictureUrl } from "@/components/design/SlideView";
import { loadBrandFont } from "@/lib/brandFont";
import { BRAND_FONT, FONTS_CSS, FORMAT_H, FRAME_W, ensureDesignFonts, type Design, type DesignSlide } from "@/lib/design";

const toDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
const dataCache = new Map<string, Promise<string>>();
function inline(url: string): Promise<string> {
  if (url.startsWith("data:")) return Promise.resolve(url);
  if (!dataCache.has(url))
    dataCache.set(
      url,
      fetch(url)
        .then((r) => {
          if (!r.ok) throw new Error(`${r.status}`);
          return r.blob();
        })
        .then(toDataUrl)
        .catch((e) => (dataCache.delete(url), Promise.reject(e))),
    );
  return dataCache.get(url)!;
}

let faces: Promise<{ family: string; css: string }[]> | null = null;
/** The @font-face rules of the editor's fonts, one per family and subset. */
function fontFaces() {
  faces ??= fetch(FONTS_CSS)
    .then((r) => r.text())
    .then((css) => [...css.matchAll(/@font-face\s*{[^}]*}/g)].map((m) => ({ family: /font-family:\s*'([^']+)'/.exec(m[0])?.[1] ?? "", css: m[0] })))
    .catch(() => ((faces = null), []));
  return faces;
}
/** @font-face rules with their files inlined, for the families these slides use. */
async function fontCss(userId: string, families: Set<string>): Promise<string> {
  const rules = (await fontFaces()).filter((f) => families.has(f.family));
  const out = await Promise.all(
    rules.map(async (f) => {
      let css = f.css;
      for (const m of css.matchAll(/url\(([^)]+)\)/g)) css = css.replace(m[1], await inline(m[1].replace(/["']/g, "")).catch(() => m[1]));
      return css;
    }),
  );
  if (families.has(BRAND_FONT)) {
    const own = loadBrandFont(userId);
    if (own?.data) out.push(`@font-face{font-family:'${BRAND_FONT}';src:url(${own.data})}`);
  }
  return out.join("\n");
}

const familiesOf = (slides: DesignSlide[]) =>
  new Set(slides.flatMap((s) => s.layers.flatMap((l) => (l.type === "text" ? [l.font, ...(l.accent?.font ? [l.accent.font] : [])] : []))));

/** Draws one slide off screen at 1080 wide and hands back its frame once fonts, fit and pictures are settled. */
async function mount(slide: DesignSlide, format: Design["format"]): Promise<{ frame: HTMLElement; done: () => void }> {
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  Object.assign(host.style, { position: "fixed", left: "-20000px", top: "0", width: `${FRAME_W}px`, pointerEvents: "none" });
  document.body.appendChild(host);
  const root = createRoot(host);
  let frame: HTMLDivElement | null = null;
  flushSync(() => root.render(createElement(SlideView, { slide, format, width: FRAME_W, rootRef: (el: HTMLDivElement | null) => (frame = el) })));
  const imgs = [...host.querySelectorAll("img")];
  await Promise.all(imgs.map((i) => i.decode().catch(() => undefined)));
  // pictures from this device resolve after the first paint; give them a frame to land
  await new Promise((r) => requestAnimationFrame(() => r(null)));
  await Promise.all([...host.querySelectorAll("img")].map((i) => i.decode().catch(() => undefined)));
  return { frame: frame!, done: () => (root.unmount(), host.remove()) };
}

export class ExportPictureError extends Error {}

/** One slide as a PNG. Fonts must already be loaded (the editor loads them; export waits for them too). */
async function slidePng(userId: string, slide: DesignSlide, format: Design["format"], css: string): Promise<Blob> {
  const { frame, done } = await mount(slide, format);
  try {
    const clone = frame.cloneNode(true) as HTMLElement;
    clone.style.transform = "";
    for (const img of clone.querySelectorAll("img")) {
      const src = img.getAttribute("src") ?? "";
      try {
        img.setAttribute("src", await inline(src));
      } catch {
        throw new ExportPictureError("A picture on a slide couldn't be loaded. Swap it, then download again.");
      }
      img.removeAttribute("crossorigin");
    }
    const H = FORMAT_H[format];
    const xhtml = new XMLSerializer().serializeToString(clone);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${FRAME_W}" height="${H}"><foreignObject x="0" y="0" width="${FRAME_W}" height="${H}"><div xmlns="http://www.w3.org/1999/xhtml"><style>${css}</style>${xhtml}</div></foreignObject></svg>`;
    // a data: URL, not a blob: one: Chrome taints the canvas for a foreignObject SVG read from a blob
    const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    {
      const pic = new Image();
      pic.src = url;
      await pic.decode();
      const canvas = document.createElement("canvas");
      canvas.width = FRAME_W;
      canvas.height = H;
      const g = canvas.getContext("2d");
      if (!g) throw new Error("no canvas");
      g.fillStyle = slide.background;
      g.fillRect(0, 0, FRAME_W, H);
      g.drawImage(pic, 0, 0);
      return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("no png"))), "image/png"));
    }
  } finally {
    done();
  }
}

/** The chosen slides (all by default) as PNG files, in order. */
export async function designPngs(userId: string, d: Design, o: { only?: number[]; onProgress?: (done: number, total: number) => void; signal?: AbortSignal } = {}): Promise<Blob[]> {
  ensureDesignFonts();
  const picks = (o.only ?? d.slides.map((_, i) => i)).filter((i) => d.slides[i]);
  const families = familiesOf(picks.map((i) => d.slides[i]));
  await Promise.all([...families].map((f) => document.fonts.load(`16px "${f}"`).catch(() => undefined)));
  await document.fonts.ready;
  // warm device pictures so the first slide doesn't draw before its picture is read
  await Promise.all(picks.flatMap((i) => d.slides[i].layers.flatMap((l) => (l.type === "image" && l.src ? [pictureUrl(l.src)] : []))));
  const css = await fontCss(userId, families);
  const out: Blob[] = [];
  for (const i of picks) {
    if (o.signal?.aborted) throw new DOMException("cancelled", "AbortError");
    out.push(await slidePng(userId, d.slides[i], d.format, css));
    o.onProgress?.(out.length, picks.length);
  }
  return out;
}
