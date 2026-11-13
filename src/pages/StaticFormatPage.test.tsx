// /make/static/:slug: the page's states (Leo only, an unknown or not-yet-drawn format, a photo or none, the note kept on
// this device), which of its two makes leads, and where the layout make goes.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

const as = vi.hoisted(() => {
  const store = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
  };
  return { user: null as null | undefined | { id: string; email: string }, left: {} as Record<string, number>, picture: null as null | Record<string, unknown> };
});
vi.mock("@/lib/useLeoOnly", async (actual) => ({ ...(await actual<typeof import("@/lib/useLeoOnly")>()), useLeoUser: () => as.user, useLeoOnly: () => !!as.user }));
// no canvas in node: the example is measured roughly, as the layout tests do
vi.mock("@/lib/carouselRender", async (actual) => ({ ...(await actual<typeof import("@/lib/carouselRender")>()), createCanvasMeasure: () => (t: string, f: { size: number }) => t.length * f.size * 0.5 }));
vi.mock("@/lib/aiImage", async (actual) => ({ ...(await actual<typeof import("@/lib/aiImage")>()), imageJob: () => as.picture }));
vi.mock("@/lib/aiUsage", async (actual) => ({ ...(await actual<typeof import("@/lib/aiUsage")>()), useUsesLeft: () => (f: string) => as.left[f] ?? null }));
vi.mock("@/lib/supabase", () => ({
  SUPABASE_URL: "https://abc.supabase.co",
  supabase: { auth: { getUser: () => new Promise(() => undefined), getSession: () => new Promise(() => undefined), onAuthStateChange: () => ({}) } },
}));

import StaticFormatPage, { loadNote, noteKey, productBits, staticMake, worksWith } from "./StaticFormatPage";
import { STATIC_FORMATS, staticFormatBySlug } from "@/data/staticFormats";

const U = "u1";
const html = (slug: string) =>
  renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [`/make/static/${slug}`] }, createElement(Routes, null, createElement(Route, { path: "/make/static/:slug", element: createElement(StaticFormatPage) }))));
/** A button's markup, by the label it ends with. */
const button = (page: string, label: string) => page.match(new RegExp(`<button[^>]*>(?:(?!</button>).)*${label}</button>`))?.[0] ?? "";
const PRIMARY = "bg-primary text-primary-foreground";
const product = (o: Record<string, unknown> = {}) => ({ id: "pd-abcd1", name: "Cold brew", what: "Bottled", forWho: "Offices", pictures: ["cimg-bottle1"], sources: [""], use: true, from: "you", addedAt: "", ...o });

afterEach(() => {
  as.user = null;
  as.left = {};
  as.picture = null;
  localStorage.clear();
});

describe("the static format page", () => {
  it("is Leo's only, and an unknown format is not found", () => {
    expect(html("text-chat")).not.toContain("Make it as a layout");
    expect(html("text-chat")).not.toContain("Make it as a photo");
    as.user = { id: U, email: "leo@x.sg" };
    expect(html("street-scene")).not.toContain("Static ads");
  });

  it("shows the format, its example for a made-up business, what it works with, the note and its two makes", () => {
    as.user = { id: U, email: "leo@x.sg" };
    const page = html("text-chat");
    expect(page).toContain('href="/make?tab=static"');
    expect(page).toContain("Text message chat");
    expect(page).toContain("A text chat about a familiar task or mix-up.");
    // four made examples, then our own drawn layout as the fifth
    expect(page).toContain("Example 1 of 5");
    expect(page).toContain('src="/formats/static/text-chat-1.webp"');
    expect(page).toContain("Angle: Name the pain. Made up for Hilltop Coffee.");
    expect(page).toContain("No photo needed. The words carry it.");
    expect(page).toContain('id="static-note"');
    expect(page.match(/Make it as a photo/g)).toHaveLength(1);
    expect(page.match(/Make it as a layout/g)).toHaveLength(1);
  });

  it("leads with the photo, priced for its write and its picture, and hands the lead to the layout when pictures run out", () => {
    as.user = { id: U, email: "leo@x.sg" };
    let page = html("street-poster");
    // one dominant button: the photo, first, filled; the layout outlined after it
    expect(page.indexOf("Make it as a photo")).toBeLessThan(page.indexOf("Make it as a layout"));
    expect(button(page, "Make it as a photo")).toContain(PRIMARY);
    expect(button(page, "Make it as a layout")).not.toContain(PRIMARY);
    // the price before anything is spent: one write (US$0.007) and one picture (US$0.04)
    expect(page).toContain("About US$0.05");
    expect(page).toContain("A photo goes to Media.");

    as.left = { "remix-make": 20, "ai-image": 0 };
    page = html("street-poster");
    expect(button(page, "Make it as a layout")).toContain(PRIMARY);
    expect(button(page, "Make it as a photo")).not.toContain(PRIMARY);
    expect(button(page, "Make it as a photo")).toContain('disabled=""');
    expect(button(page, "Make it as a layout")).not.toContain('disabled=""');
    expect(page).toContain("Photos are back at 8am Singapore time.");
  });

  it("shows a photo still being made after a reload, from the picture job it picked up, and holds every other format's", () => {
    as.user = { id: U, email: "leo@x.sg" };
    as.picture = { prompt: `${staticFormatBySlug("street-poster")!.scene} The brand colour is #000000.`, state: "working" };
    const page = html("street-poster");
    expect(page).toContain("Making the photo...");
    expect(page).toContain("You can leave this page.");
    expect(button(page, "Make it as a photo")).toContain('disabled=""');
    expect(page).not.toContain("A picture is already being made");
    const other = html("general-ad");
    expect(other).not.toContain("Making the photo");
    expect(other).toContain("A picture is already being made");
    expect(button(other, "Make it as a photo")).toContain('disabled=""');
  });

  it("offers no photo where the format needs the brand's own product photo and there is none", () => {
    as.user = { id: U, email: "leo@x.sg" };
    const page = html("share-popup");
    expect(page).toContain("Add a photo");
    expect(page).not.toContain("Make it as a photo");
    expect(page).toContain("It opens on the Image page");
  });

  it("keeps the note on this device across a reload", () => {
    as.user = { id: U, email: "leo@x.sg" };
    localStorage.setItem(noteKey("ai-chat"), "Office workers who skip lunch");
    expect(loadNote("ai-chat")).toBe("Office workers who skip lunch");
    expect(html("ai-chat")).toContain("Office workers who skip lunch</textarea>");
    expect(html("text-chat")).not.toContain("Office workers who skip lunch");
  });

  it("says a format the registry gains before its layout is drawn isn't drawn yet, with no button", () => {
    as.user = { id: U, email: "leo@x.sg" };
    STATIC_FORMATS.push({ slug: "future-format", name: "Future format", blurb: "Not drawn yet.", ready: false, scene: "A future scene." });
    try {
      const page = html("future-format");
      expect(page).toContain("isn&#x27;t drawn yet");
      expect(page).not.toContain("Make it as a layout");
      expect(page).not.toContain("Make it as a photo");
    } finally {
      STATIC_FORMATS.pop();
    }
  });
});

describe("the layout make", () => {
  const chat = staticFormatBySlug("text-chat")!;
  const best = { slug: "ai-chat", best: "photo" as const };
  const needs = { slug: "share-popup", needs: "photo" as const };

  it("writes at once for the brand, the note as the topic, else what the brand does", () => {
    expect(staticMake(chat, { note: "  For new parents  ", brand: "Hilltop", photos: 0 })).toEqual({
      label: "Make it as a layout",
      to: "/image?layout=text-chat",
      state: { go: true, format: { topic: "For new parents" } },
    });
    expect(staticMake(chat, { note: "", brand: "Hilltop", photos: 0 }).state.format.topic).toBe("What Hilltop does and who it's for");
    expect(staticMake(chat, { note: "x".repeat(300), brand: "Hilltop", photos: 0 }).state.format.topic).toHaveLength(200);
  });

  it("puts the product photo in where the format uses one, and never where it doesn't", () => {
    expect(staticMake(best, { note: "", brand: "B", picture: "cimg-bottle1", photos: 3 }).state.format.pictureKey).toBe("cimg-bottle1");
    expect(staticMake(chat, { note: "", brand: "B", picture: "cimg-bottle1", photos: 3 }).state.format.pictureKey).toBeUndefined();
    // best with a photo and none yet: it still writes
    expect(staticMake(best, { note: "", brand: "B", photos: 0 })).toMatchObject({ label: "Make it as a layout", state: { go: true } });
  });

  it("adds a photo first when the format needs one and the brand has none, and opens the picker", () => {
    expect(staticMake(needs, { note: "Hi", brand: "B", photos: 0 })).toEqual({ label: "Add a photo", to: "/image?layout=share-popup&pick=media", state: { format: { topic: "Hi" } } });
    // photos in Media but no product photo: it writes, with the picker open beside it
    expect(staticMake(needs, { note: "", brand: "B", photos: 2 })).toMatchObject({ label: "Make it as a layout", to: "/image?layout=share-popup&pick=media", state: { go: true } });
    expect(staticMake(needs, { note: "", brand: "B", picture: "cimg-bottle1", photos: 0 })).toMatchObject({ to: "/image?layout=share-popup", state: { go: true, format: { pictureKey: "cimg-bottle1" } } });
  });

  it("carries the brand's price to a format best with one", () => {
    expect(staticMake({ slug: "tear-off-flyer", best: "price" }, { note: "", brand: "B", photos: 0, price: "$6" }).state.format.price).toBe("$6");
    expect(staticMake(chat, { note: "", brand: "B", photos: 0, price: "$6" }).state.format.price).toBeUndefined();
  });

  it("reads the product photo and price from What you sell, a used product first", () => {
    expect(productBits({ items: [] })).toEqual({ picture: undefined, price: undefined });
    const p = { items: [product({ id: "pd-off01", use: false, pictures: ["cimg-unused1"], price: "$9" }), product({ price: " $6 " })] };
    expect(productBits(p as never)).toEqual({ picture: "cimg-bottle1", price: "$6" });
  });

  it("says what each kind of format works with", () => {
    expect(worksWith({})).toBe("No photo needed. The words carry it.");
    expect(worksWith({ best: "photo" })).toBe("Best with a photo of what you sell. It works without one too.");
    expect(worksWith({ needs: "photo" })).toBe("Needs a photo of what you sell.");
    expect(worksWith({ best: "price" })).toBe("Best with a price, which you type in next.");
  });
});
