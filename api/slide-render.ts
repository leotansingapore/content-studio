// Draws one slideshow-campaign slide to PNG for the slide-campaigns Supabase function (supabase/functions/
// slide-campaigns/run.ts): a Supabase function's CPU budget runs out on the first slide, a Vercel function's
// doesn't. The layout is supabase/functions/_shared/slideDraw.ts, shared with the function's own tests.
// Only the function may call it (x-slide-render-secret = SLIDE_RENDER_SECRET), and it only fetches photos from
// Pexels or this project's own signed storage links, so it is neither an open drawer nor a way to fetch anything.

import { createHash, timingSafeEqual } from "node:crypto";
import satori from "satori";
import { Resvg, initWasm } from "@resvg/resvg-wasm";
import { FRAME_W, slideSvg, type Satori, type SlideInput } from "../supabase/functions/_shared/slideDraw";

export const config = { maxDuration: 30 };

const PHOTO = /^(data:image\/(jpeg|png|webp);base64,|https:\/\/images\.pexels\.com\/|https:\/\/hgdbflprrficdoyxmdxe\.supabase\.co\/storage\/v1\/object\/sign\/cs-slide-campaigns\/)/;
const WASM = ["https://unpkg.com/@resvg/resvg-wasm@2.6.2/index_bg.wasm", "https://cdn.jsdelivr.net/npm/@resvg/resvg-wasm@2.6.2/index_bg.wasm"];

let wasm: Promise<void> | null = null;
function ensureWasm(): Promise<void> {
  wasm ??= (async () => {
    for (const url of WASM) {
      const r = await fetch(url).catch(() => null);
      if (r?.ok) return initWasm(await r.arrayBuffer());
    }
    throw new Error("resvg wasm unavailable");
  })().catch((e) => ((wasm = null), Promise.reject(e)));
  return wasm;
}

const digest = (s: string) => createHash("sha256").update(s).digest();
const same = (a: string, b: string) => timingSafeEqual(digest(a), digest(b));

export async function POST(req: Request): Promise<Response> {
  const secret = process.env.SLIDE_RENDER_SECRET;
  const given = req.headers.get("x-slide-render-secret");
  if (!secret || !given || !same(given, secret)) return new Response("Forbidden", { status: 403 });
  const body = (await req.json().catch(() => null)) as { slide?: SlideInput } | null;
  const s = body?.slide;
  if (!s || (s.format !== "tiktok" && s.format !== "instagram") || typeof s.text !== "string" || s.text.length > 600 || !s.style || !s.overlay) {
    return new Response("Bad slide", { status: 400 });
  }
  if (s.photo !== null && (typeof s.photo !== "string" || s.photo.length > 12_000_000 || !PHOTO.test(s.photo))) return new Response("Bad photo", { status: 400 });
  try {
    const [svg] = await Promise.all([slideSvg(s, satori as unknown as Satori), ensureWasm()]);
    const png = new Resvg(svg, { fitTo: { mode: "width", value: FRAME_W } }).render().asPng();
    return new Response(png, { headers: { "content-type": "image/png", "cache-control": "no-store" } });
  } catch (e) {
    console.error("slide-render", e);
    return new Response("Couldn't draw the slide", { status: 500 });
  }
}
