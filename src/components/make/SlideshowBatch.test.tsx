// The batch card on /make/slideshow: closed by default, batch=open shows the kept hooks and the looks (My media only
// with media), no hooks points to My hooks, and a running batch lists each slideshow with its look and step. Rendered
// to markup; the runs themselves are covered in src/lib/slideshowBatch.test.ts.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const job = vi.hoisted(() => ({ start: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ SUPABASE_URL: "", SUPABASE_ANON_KEY: "", supabase: { functions: { invoke: vi.fn() } } }));
vi.mock("@/lib/slideshowJob", async (orig) => ({ ...(await orig<typeof import("@/lib/slideshowJob")>()), startSlideshow: job.start, slideshowBusy: () => false }));

const { default: SlideshowBatchCard } = await import("./SlideshowBatch");
const { batchPairs, startBatch } = await import("@/lib/slideshowBatch");

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  const ls = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) };
  vi.stubGlobal("localStorage", ls);
  vi.stubGlobal("window", { localStorage: ls, matchMedia: () => ({ matches: false }), addEventListener: () => {}, removeEventListener: () => {} });
});
afterEach(() => vi.unstubAllGlobals());

const BASE = { mention: true, inside: false, note: "", size: "4x5" as const };
const html = (path: string, hasMedia = false) =>
  renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [path] }, createElement(SlideshowBatchCard, { userId: "u2", base: BASE, hasMedia, onOpen: () => {} })));

describe("the batch card", () => {
  it("stays closed until batch=open, then lists the kept hooks and the looks", () => {
    store.set("content-studio-snippets-u2", JSON.stringify([{ id: "k1", name: "", text: "my todo app gave up before I did", kind: "hook" }]));
    expect(html("/make/slideshow")).not.toContain("my todo app gave up");
    const page = html("/make/slideshow?batch=open");
    expect(page).toContain('type="checkbox"');
    expect(page).toContain("my todo app gave up before I did");
    expect(page).toContain("Stock, one per point");
    expect(page).toContain("AI: Comic book");
    expect(page).not.toContain("My media");
    expect(html("/make/slideshow?batch=open", true)).toContain("My media");
  });

  it("points to My hooks when none are kept", () => {
    expect(html("/make/slideshow?batch=open")).toContain('href="/hooks"');
  });

  it("lists a running batch's slideshows with their look and step, open or not", () => {
    job.start.mockImplementation(() => new Promise(() => {}));
    void startBatch("u2", BASE, batchPairs(["Hook one"], ["stock", "sea"]));
    const page = html("/make/slideshow");
    expect(page).toContain("Making 1 of 2");
    expect(page).toContain("Sea and beach · Waiting");
  });
});
