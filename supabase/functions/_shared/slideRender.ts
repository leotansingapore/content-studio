// Draws a campaign slide to PNG in Deno (the local tests and any run without SLIDE_RENDER_URL): slideDraw.ts with
// Satori, and resvg's wasm for the PNG. Production draws on Vercel (api/slide-render.ts): a Supabase function's
// CPU budget runs out on the first slide.

import satori from "npm:satori@0.63.2";
import { Resvg, initWasm } from "npm:@resvg/resvg-wasm@2.6.2";
import { FRAME_W, slideSvg, type Satori, type SlideInput } from "./slideDraw.ts";

export * from "./slideDraw.ts";

let wasm: Promise<void> | null = null;
function ensureWasm() {
  wasm ??= initWasm(fetch("https://unpkg.com/@resvg/resvg-wasm@2.6.2/index_bg.wasm")).catch((e) => ((wasm = null), Promise.reject(e)));
  return wasm;
}

export async function renderSlide(s: SlideInput): Promise<Uint8Array> {
  const [svg] = await Promise.all([slideSvg(s, satori as unknown as Satori), ensureWasm()]);
  return new Resvg(svg, { fitTo: { mode: "width", value: FRAME_W } }).render().asPng();
}
