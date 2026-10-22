// Hook plus demo's footer chip, rendered to markup in node for Leo (no effects run, so uses left stay unread): it
// prices what one press spends (wave 2 live check, 21 Oct: with the hooks written it still read "About US$0.02 |
// Last one today", though the press spent no remix use).
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { beforeAll, describe, expect, it, vi } from "vitest";
import W2 from "../../../supabase/functions/remix/fixtures/phase3-w2-live.json";
import { priceOf, priceText, sumPrices, type Price } from "@/lib/prices";
import type { MakeResponse } from "@/lib/remix";

vi.mock("@/lib/supabase", () => ({
  SUPABASE_URL: "https://abc.supabase.co",
  SUPABASE_ANON_KEY: "",
  supabase: { auth: { getSession: vi.fn(), onAuthStateChange: () => ({}) }, functions: { invoke: vi.fn() } },
}));
const make = vi.hoisted(() => vi.fn());
vi.mock("@/lib/remix", async (orig) => ({ ...(await orig<typeof import("@/lib/remix")>()), requestMake: make }));
const fn = vi.hoisted(() => vi.fn());
vi.mock("@/lib/edgeFn", async (orig) => ({ ...(await orig<typeof import("@/lib/edgeFn")>()), callFn: fn }));

const UID = "ff72c375-389e-4dd0-86c4-a166307b8751";
const d = W2.find((x) => x.call === "hook-demo-hooks")!;
const store = new Map<string, string>([
  // Leo's stored session, so PriceChip shows the price
  ["sb-abc-auth-token", JSON.stringify({ user: { id: UID, email: "tanjunsing@gmail.com" } })],
  // the live check's "What it shows"
  ["cs-make-hook-demo", JSON.stringify({ topic: d.request.topic, own: "" })],
]);

let page: (play?: string) => string;
let job: typeof import("@/lib/hookDemoJob");
beforeAll(async () => {
  const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("sessionStorage", storage);
  // imported after the session is stored: useLeoOnly reads it once, on load
  const { default: HookDemo } = await import("./HookDemo");
  job = await import("@/lib/hookDemoJob");
  page = (play) =>
    renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [`/make/hook-demo${play ? `?play=${play}` : ""}`] }, createElement(HookDemo, { userId: UID, source: null })));
  // the page's first import transforms a large tree (8 s alone on a cold cache), so the default 10 s is too tight in a full parallel run
}, 60_000);

/** The footer chip's words: the last aria-live span on the page. */
const chip = (html: string) => [...html.matchAll(/aria-live="polite"><span[^>]*>([^<]*)<\/span>/g)].at(-1)?.[1];
const clip = priceText(priceOf("ai-clip", { seconds: 4, quality: "480p" }) as Price);

describe("Hook plus demo's footer chip", () => {
  it("prices the remix write while no hook is written, picked or typed", () => {
    expect(chip(page())).toBe("About US$0.02");
    expect(chip(page("mine"))).toBe("About US$0.02");
    expect(chip(page("spoken"))).toBe(priceText(sumPrices(priceOf("remix-make"), priceOf("ai-clip", { seconds: 4, quality: "480p" })) as Price));
  });

  it("says No AI cost once the hooks are written, for a stock clip or your own, and only the AI clip for a spoken one", async () => {
    make.mockResolvedValue(d.response as MakeResponse);
    // Jev had no pick that day; the first hook is selected
    fn.mockResolvedValue({ pick: null });
    await job.writeHooks(UID, { source: null, topic: d.request.topic, mention: true, play: "stock", demo: null });
    expect(job.hookSet()?.hooks).toHaveLength(3);
    expect(chip(page())).toBe("No AI cost");
    expect(chip(page("mine"))).toBe("No AI cost");
    expect(chip(page("spoken"))).toBe(clip);
    expect(clip).not.toBe("About US$0.02");
  });
});
