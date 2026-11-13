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
  return {
    user: null as null | undefined | { id: string; email: string },
    left: {} as Record<string, number>,
    picture: null as null | Record<string, unknown>,
    run: null as null | Record<string, unknown>,
    buttons: [] as { children?: unknown; onClick?: () => void }[],
    starts: [] as unknown[][],
  };
});
vi.mock("@/lib/photoAd", async (actual) => ({ ...(await actual<typeof import("@/lib/photoAd")>()), usePhotoAd: () => as.run, startPhotoAd: async (...a: unknown[]) => void as.starts.push(a) }));
// every button's props, so a press can be made without a DOM; the real button still renders
vi.mock("@/components/ui/button", async (actual) => {
  const real = await actual<typeof import("@/components/ui/button")>();
  const { createElement: h, forwardRef } = await import("react");
  const Button = forwardRef<HTMLButtonElement, Record<string, unknown>>((p, ref) => (as.buttons.push(p), h(real.Button, { ...p, ref })));
  return { ...real, Button };
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

import StaticFormatPage, { loadNote, noteKey, staticMake, worksWith } from "./StaticFormatPage";
import { STATIC_FORMATS, staticFormatBySlug } from "@/data/staticFormats";
import { handoff } from "@/lib/agentStarters";
import { links } from "@/lib/links";
import { productBits } from "@/lib/products";

const U = "u1";
const html = (slug: string, search = "") =>
  renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [`/make/static/${slug}${search}`] }, createElement(Routes, null, createElement(Route, { path: "/make/static/:slug", element: createElement(StaticFormatPage) }))));
/** A button's markup, by the label it ends with. */
const button = (page: string, label: string) => page.match(new RegExp(`<button[^>]*>(?:(?!</button>).)*${label}</button>`))?.[0] ?? "";
const PRIMARY = "bg-primary text-primary-foreground";
const product = (o: Record<string, unknown> = {}) => ({ id: "pd-abcd1", name: "Cold brew", what: "Bottled", forWho: "Offices", pictures: ["cimg-bottle1"], sources: [""], use: true, from: "you", addedAt: "", ...o });

afterEach(() => {
  as.user = null;
  as.left = {};
  as.picture = null;
  as.run = null;
  as.buttons = [];
  as.starts = [];
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
    expect(page).toContain("A photo goes to Photos and videos.");
    expect(page).toContain("A layout is made by the agent and stays in");

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

  it("says on the done card which angle the photo took, and nothing when none came back", () => {
    as.user = { id: U, email: "leo@x.sg" };
    as.run = { seq: 1, slug: "street-poster", designId: "img-abc123", state: "done", mediaKey: "cimg-photo1", preview: "data:image/jpeg;base64,eA", angle: "Answer the doubt" };
    const page = html("street-poster");
    expect(page).toContain("Your photo ad is ready.");
    expect(page).toMatch(/ready\.<\/p><p[^>]*>Angle: Answer the doubt<\/p>/);
    as.run = { ...as.run, angle: undefined };
    expect(html("street-poster")).not.toMatch(/ready\.<\/p><p[^>]*>Angle:/);
  });

  it("offers another angle on the done card at the photo's own price, held while no photo can start", () => {
    as.user = { id: U, email: "leo@x.sg" };
    as.run = { seq: 1, slug: "street-poster", designId: "img-abc123", state: "done", mediaKey: "cimg-photo1", angle: "The offer" };
    const page = html("street-poster");
    const again = button(page, "Another angle");
    expect(again).not.toBe("");
    expect(again).not.toContain('disabled=""');
    expect(again).not.toContain(PRIMARY);
    // priced the same as the first press, right beside it
    expect(page).toMatch(/Another angle<\/button><span[^>]*>About US\$0\.05<\/span>/);
    // a press makes the next photo with the note as typed, with nothing retyped
    localStorage.setItem(noteKey("street-poster"), "For agents who prospect daily");
    as.buttons = [];
    html("street-poster");
    as.buttons.find((b) => JSON.stringify(b.children).includes("Another angle"))!.onClick!();
    expect(as.starts).toEqual([[U, staticFormatBySlug("street-poster"), { topic: "For agents who prospect daily" }]]);
    localStorage.clear();
    as.left = { "ai-image": 0 };
    expect(button(html("street-poster"), "Another angle")).toContain('disabled=""');
    as.left = {};
    as.picture = { prompt: "A family picnic", state: "working" };
    expect(button(html("street-poster"), "Another angle")).toContain('disabled=""');
    // nothing to redo before a photo is done
    as.picture = null;
    as.run = { ...as.run, state: "making" };
    expect(html("street-poster")).not.toContain("Another angle");
  });

  it("offers no photo where the format needs the brand's own product photo and there is none", () => {
    as.user = { id: U, email: "leo@x.sg" };
    const page = html("share-popup");
    expect(page).toContain("Add a photo");
    expect(page).not.toContain("Make it as a photo");
    expect(page).toContain("It opens on the Image page");
  });

  it("opens with the agent's answers: the note filled, the angle and the product shown and sent with the photo make", () => {
    as.user = { id: U, email: "leo@x.sg" };
    localStorage.setItem(`content-studio-products-${U}`, JSON.stringify({ items: [product(), product({ id: "pd-mug22", name: "Mugs", pictures: ["cimg-mugs01"], price: "$12", use: false })] }));
    const page = html("street-poster", "?note=Office%20lunches&angle=Bust%20a%20myth&product=pd-mug22");
    expect(page).toContain("Office lunches</textarea>");
    expect(page).toContain("Angle: Bust a myth");
    expect(page).toContain("Product: Mugs");
    as.buttons.find((b) => JSON.stringify(b.children).includes("Make it as a photo"))!.onClick!();
    expect(as.starts.at(-1)).toEqual([U, staticFormatBySlug("street-poster"), { topic: "Office lunches", pictureKey: "cimg-mugs01", angle: "Bust a myth", product: "pd-mug22" }]);
    // an angle that isn't one of the twelve, or a product this brand doesn't have, is no pick at all
    const odd = html("street-poster", "?angle=Shout&product=pd-gone");
    expect(odd).not.toContain('aria-label="Your picks"');
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
  const best = staticFormatBySlug("ai-chat")!;
  const needs = staticFormatBySlug("share-popup")!;
  const FROM = { label: "Static ads > Text message chat", path: "/make/static/text-chat" };
  const askOf = (to: string) => new URL(to, "https://app.postmosis.com").searchParams.get("ask");

  it("hands the agent the layout and the note as its topic, else what the brand does, to send on arrival with the way back", () => {
    expect(staticMake(chat, { note: "  For new parents  ", brand: "Hilltop", photos: 0 })).toEqual({
      label: "Make it as a layout",
      to: links.agent({ ask: 'Make a "Text message chat" static ad about For new parents' }),
      state: { send: true, from: FROM, layout: "text-chat", topic: "For new parents" },
      format: { topic: "For new parents" },
    });
    const plain = staticMake(chat, { note: "", brand: "Hilltop", photos: 0 });
    expect(new URL(plain.to, "https://app.postmosis.com").pathname).toBe("/agent");
    expect(askOf(plain.to)).toBe("Make a \"Text message chat\" static ad about what Hilltop does and who it's for");
    expect(plain.state).toEqual({ send: true, from: FROM, layout: "text-chat", topic: "What Hilltop does and who it's for" });
    expect(handoff(plain.state, askOf(plain.to))).toEqual({ send: true, from: FROM, layout: { layout: "text-chat", topic: "What Hilltop does and who it's for" } });
    const long = staticMake(chat, { note: "x".repeat(300), brand: "Hilltop", photos: 0 });
    expect([long.format.topic.length, (long.state as { topic: string }).topic.length]).toEqual([200, 200]);
    expect(askOf(staticMake(chat, { note: "For new\n\nparents", brand: "Hilltop", photos: 0 }).to)).toBe('Make a "Text message chat" static ad about For new parents');
  });

  it("gives the photo make the product photo where the format uses one, and never where it doesn't", () => {
    expect(staticMake(best, { note: "", brand: "B", picture: "cimg-bottle1", photos: 3 }).format.pictureKey).toBe("cimg-bottle1");
    expect(staticMake(chat, { note: "", brand: "B", picture: "cimg-bottle1", photos: 3 }).format.pictureKey).toBeUndefined();
    expect(staticMake(best, { note: "", brand: "B", photos: 0 })).toMatchObject({ label: "Make it as a layout", state: { send: true, layout: "ai-chat" } });
  });

  it("adds a photo first when the format needs one and the brand has none, and opens the picker", () => {
    expect(staticMake(needs, { note: "Hi", brand: "B", photos: 0 })).toEqual({ label: "Add a photo", to: "/image?layout=share-popup&pick=media", state: { format: { topic: "Hi" } }, format: { topic: "Hi" } });
    expect(staticMake(needs, { note: "", brand: "B", photos: 2 })).toMatchObject({ label: "Make it as a layout", state: { send: true, layout: "share-popup" } });
    expect(staticMake(needs, { note: "", brand: "B", picture: "cimg-bottle1", photos: 0 })).toMatchObject({ label: "Make it as a layout", state: { send: true, layout: "share-popup" }, format: { pictureKey: "cimg-bottle1" } });
  });

  it("carries the brand's price to the photo make of a format best with one", () => {
    expect(staticMake(staticFormatBySlug("tear-off-flyer")!, { note: "", brand: "B", photos: 0, price: "$6" }).format.price).toBe("$6");
    expect(staticMake(chat, { note: "", brand: "B", photos: 0, price: "$6" }).format.price).toBeUndefined();
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
