import { MAX_IMAGE_CHARS, sanitizeImage } from "@/lib/carousel";
import { distinctColours } from "@/lib/onboardingFlow";

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (/^https?:/i.test(src)) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("That file isn't an image this browser can read."));
    img.src = src;
  });
}

function sizeOf(img: HTMLImageElement, max: number): { w: number; h: number } {
  const w0 = img.naturalWidth || 512;
  const h0 = img.naturalHeight || 512;
  const scale = Math.min(1, max / Math.max(w0, h0));
  return { w: Math.max(1, Math.round(w0 * scale)), h: Math.max(1, Math.round(h0 * scale)) };
}

const toHex = (r: number, g: number, b: number) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase()}`;

export function blankPixels(data: Uint8ClampedArray): boolean {
  const total = data.length / 4;
  if (!total) return true;
  let opaque = 0;
  let mixed = false;
  let r0 = -1, g0 = -1, b0 = -1;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 16) continue;
    opaque++;
    if (r0 < 0) [r0, g0, b0] = [data[i], data[i + 1], data[i + 2]];
    else if (!mixed && (Math.abs(data[i] - r0) > 8 || Math.abs(data[i + 1] - g0) > 8 || Math.abs(data[i + 2] - b0) > 8)) mixed = true;
  }
  if (opaque / total < 0.005) return true;
  return !mixed && opaque / total > 0.98;
}

const LINEAR = Array.from({ length: 256 }, (_, v) => {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
});
const luminance = (r: number, g: number, b: number) => 0.2126 * LINEAR[r] + 0.7152 * LINEAR[g] + 0.0722 * LINEAR[b];
const contrast = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
const LIGHT_TILE = luminance(243, 244, 246);
const DARK_TILE = luminance(28, 34, 48);

export function lightPixels(data: Uint8ClampedArray, width = 0): boolean {
  const total = data.length / 4;
  const w = width > 0 ? width : total;
  const h = Math.max(1, Math.round(total / w));
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && data[(y * w + x) * 4 + 3] >= 128;
  let opaque = 0;
  let hiddenOnLight = 0;
  let hiddenOnDark = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (data[i + 3] < 128) continue;
      opaque++;
      if (solid(x - 1, y) && solid(x + 1, y) && solid(x, y - 1) && solid(x, y + 1)) continue;
      const l = luminance(data[i], data[i + 1], data[i + 2]);
      if (contrast(l, LIGHT_TILE) < 2) hiddenOnLight++;
      if (contrast(l, DARK_TILE) < 2) hiddenOnDark++;
    }
  }
  if (!opaque || opaque / total >= 0.98) return false;
  return hiddenOnDark < hiddenOnLight;
}

export async function logoIsLight(src: string): Promise<boolean> {
  try {
    const img = await loadImage(src);
    const { w, h } = sizeOf(img, 96);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const g = canvas.getContext("2d");
    if (!g) return false;
    g.drawImage(img, 0, 0, w, h);
    return lightPixels(g.getImageData(0, 0, w, h).data, w);
  } catch {
    return false;
  }
}

export function dominantColours(data: Uint8ClampedArray, max = 3): string[] {
  const counts = new Map<number, { n: number; r: number; g: number; b: number }>();
  let opaque = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    opaque++;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const hi = Math.max(r, g, b), lo = Math.min(r, g, b);
    if (hi - lo <= 40 || hi <= 40 || lo >= 235) continue;
    const d = hi - lo;
    const hue = hi === r ? ((g - b) / d + 6) % 6 : hi === g ? (b - r) / d + 2 : (r - g) / d + 4;
    const light = (hi + lo) / 510;
    const key = Math.floor(hue * 3) * 3 + (light < 0.35 ? 0 : light < 0.65 ? 1 : 2);
    const c = counts.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    c.n++;
    c.r += r;
    c.g += g;
    c.b += b;
    counts.set(key, c);
  }
  if (!opaque) return [];
  const ranked = [...counts.values()]
    .filter((c) => c.n / opaque >= 0.03)
    .sort((a, b) => b.n - a.n)
    .map((c) => toHex(Math.round(c.r / c.n), Math.round(c.g / c.n), Math.round(c.b / c.n)));
  return distinctColours(ranked, max);
}

export async function logoColours(src: string, max = 3): Promise<string[]> {
  try {
    const img = await loadImage(src);
    const { w, h } = sizeOf(img, 64);
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const g = c.getContext("2d", { willReadFrequently: true });
    if (!g) return [];
    g.drawImage(img, 0, 0, w, h);
    return dominantColours(g.getImageData(0, 0, w, h).data, max);
  } catch {
    return [];
  }
}

export async function logoForKit(src: string | null | undefined): Promise<string | null> {
  if (!src) return null;
  if (!src.startsWith("data:image/svg+xml") && sanitizeImage(src)) return src;
  try {
    const img = await loadImage(src);
    for (const max of [512, 384, 256]) {
      const { w, h } = sizeOf(img, max);
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const g = c.getContext("2d", { willReadFrequently: true });
      if (!g) return null;
      g.drawImage(img, 0, 0, w, h);
      if (blankPixels(g.getImageData(0, 0, w, h).data)) return null;
      const png = c.toDataURL("image/png");
      if (png.length <= MAX_IMAGE_CHARS && sanitizeImage(png)) return png;
      const webp = c.toDataURL("image/webp", 0.9);
      if (webp.length <= MAX_IMAGE_CHARS && sanitizeImage(webp)) return webp;
    }
    return null;
  } catch {
    return null;
  }
}

export const LOGO_TYPES = "image/png,image/jpeg,image/webp,image/svg+xml";
export const MAX_LOGO_FILE = 5 * 1024 * 1024;
export const LOGO_FILE_ERROR = "Use a PNG, JPG, WebP or SVG up to 5 MB.";

export async function logoFromFile(file: File): Promise<string> {
  if (!LOGO_TYPES.split(",").includes(file.type) || file.size > MAX_LOGO_FILE) throw new Error(LOGO_FILE_ERROR);
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const { w, h } = sizeOf(img, 512);
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const g = c.getContext("2d");
    if (!g) throw new Error("This browser can't resize images.");
    g.drawImage(img, 0, 0, w, h);
    const png = c.toDataURL("image/png");
    if (png.length <= MAX_IMAGE_CHARS) return png;
    const webp = c.toDataURL("image/webp", 0.9);
    if (webp.startsWith("data:image/webp") && webp.length <= MAX_IMAGE_CHARS) return webp;
    const small = document.createElement("canvas");
    const s = sizeOf(img, 256);
    small.width = s.w;
    small.height = s.h;
    small.getContext("2d")?.drawImage(img, 0, 0, s.w, s.h);
    return small.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}
