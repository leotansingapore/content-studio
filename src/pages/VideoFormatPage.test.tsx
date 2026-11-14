import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

const as = vi.hoisted(() => ({
  leo: null as null | { id: string; email: string },
  user: null as null | { id: string; email: string },
  left: {} as Record<string, number>,
}));
vi.mock("@/lib/useLeoOnly", async (actual) => ({
  ...(await actual<typeof import("@/lib/useLeoOnly")>()),
  useLeoUser: () => as.leo,
  useLeoOnly: () => !!as.leo,
  useSignedInUser: () => as.user,
}));
vi.mock("@/lib/aiUsage", async (actual) => ({ ...(await actual<typeof import("@/lib/aiUsage")>()), useUsesLeft: () => (f: string) => as.left[f] ?? null }));
vi.mock("@/lib/supabase", () => ({
  SUPABASE_URL: "https://abc.supabase.co",
  supabase: { auth: { getUser: () => new Promise(() => undefined), getSession: () => new Promise(() => undefined), onAuthStateChange: () => ({}) } },
}));

import MakeFormatPage from "./MakeFormatPage";
import VideoFormatPage, { needLine } from "./VideoFormatPage";
import { FORMATS, explainerPrice } from "@/data/formats";
import { makePrice, makerOf, saveTyped } from "@/lib/formatMaker";
import { templateById } from "../../supabase/functions/ai-video/templates.ts";
import { productsKey } from "@/lib/products";
import { priceOf, priceText, type Price } from "@/lib/prices";

const LEO = { id: "u1", email: "leo@x.sg" };
const OFF = "on your account yet";
const PRIMARY = "bg-primary text-primary-foreground";
const render = (page: ComponentType, slug: string) =>
  renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [`/make/${slug}`] }, createElement(Routes, null, createElement(Route, { path: "/make/:format", element: createElement(page) })))).replace(/&amp;/g, "&");
const html = (slug: string) => render(VideoFormatPage, slug);
const button = (page: string) => page.match(/<a[^>]*>(?:(?!<\/a>).)*Use this format<\/a>/)?.[0] ?? "";
const target = (page: string) => button(page).match(/href="([^"]+)"/)?.[1];
const routed = async (slug: string) => {
  let page = render(MakeFormatPage, slug);
  for (let i = 0; i < 250 && page.includes('aria-busy="true"'); i++) {
    await new Promise((r) => setTimeout(r, 20));
    page = render(MakeFormatPage, slug);
  }
  return page;
};

afterEach(() => {
  as.leo = as.user = null;
  as.left = {};
  vi.unstubAllGlobals();
});

describe("a video format's page", () => {
  it("is Leo's only, as every format page but the slideshow, and opens for Leo at /make/<slug>", async () => {
    expect(render(MakeFormatPage, "look-clay")).toContain(OFF);
    as.user = { id: "u2", email: "someone@example.com" };
    expect(render(MakeFormatPage, "look-clay")).toContain(OFF);
    expect(render(MakeFormatPage, "template-unboxing")).toContain(OFF);
    as.user = as.leo = LEO;
    const page = await routed("look-clay");
    expect(page).not.toContain(OFF);
    expect(page).toContain(">Clay</h1>");
    expect(page).toContain("Use this format");
  });

  it("shows the name, the line, the example clip, what it works with, and the price and uses left its card shows", () => {
    as.leo = LEO;
    let page = html("look-clay");
    expect(page).toMatch(/<a[^>]*href="\/make"[^>]*>(?:(?!<\/a>).)*Videos<\/a>/);
    expect(page).toContain(">Clay</h1>");
    expect(page).toContain("A narrated video in handmade clay figures and sets.");
    expect(page).toContain('src="/formats/look-clay.mp4"');
    expect(page).toContain('poster="/formats/look-clay.webp"');
    expect(page).toContain("Works with");
    expect(page).toContain("Nothing extra needed.");
    expect(page).toContain(priceText(explainerPrice() as Price));
    expect(page).toContain("It opens in the video editor.");
    expect(page).not.toContain("left today");

    as.left = { "ai-video": 3 };
    expect(html("look-clay")).toContain("3 left today");
    as.left = { "ai-video": 0 };
    page = html("look-clay");
    expect(page).toContain("None left today");
    expect(target(page)).toBe("/edit?panel=ai&kind=explainer&look=clay");
    expect(button(page)).not.toContain('disabled=""');
    expect(html("template-food-asmr")).toContain(priceText(priceOf("ai-clip", { seconds: 8, quality: "720p" }) as Price));
  });

  it("says what a format needs in the card's own words", () => {
    as.leo = LEO;
    expect(html("own-media")).toContain("Needs your own video or photos.");
    expect(html("clips")).toContain("Needs a video of you.");
    expect(needLine({})).toBe("Nothing extra needed.");
    expect(needLine({ needs: "demo-video" })).toBe("Needs a demo video.");
  });

  it("has one primary button, which opens exactly what the card opened, on a format not made on its page", () => {
    as.leo = LEO;
    expect(target(html("look-clay"))).toBe("/edit?panel=ai&kind=explainer&look=clay");
    expect(target(html("explainer"))).toBe("/edit?panel=ai&kind=explainer");
    expect(target(html("montage"))).toBe("/edit?panel=ai&kind=montage");
    const pages = FORMATS.filter((f) => f.opens && !makerOf(f.opens()));
    expect(pages.length).toBeGreaterThan(15);
    for (const f of pages) {
      const page = html(f.slug);
      expect(page.match(/Use this format/g), f.slug).toHaveLength(1);
      expect(button(page), f.slug).toContain(PRIMARY);
      expect(target(page), f.slug).toBe(f.opens!());
    }
  });

  it("plays its example on arrival for a mouse with motion allowed, and always shows controls so it can be paused", () => {
    as.leo = LEO;
    vi.stubGlobal("window", { matchMedia: (q: string) => ({ matches: q === "(hover: hover) and (prefers-reduced-motion: no-preference)" }) });
    let page = html("look-clay");
    expect(page).toContain('autoplay=""');
    expect(page).toContain('controls=""');
    vi.stubGlobal("window", { matchMedia: () => ({ matches: false }) });
    page = html("look-clay");
    expect(page).not.toContain('autoplay=""');
    expect(page).toContain('controls=""');
  });

  it("says in red when today's uses are gone and when they come back, and shows no uses line for a format with no cap", async () => {
    as.leo = LEO;
    as.left = { "ai-video": 0 };
    const empty = html("explainer");
    expect(empty).toMatch(/<p class="[^"]*font-medium text-destructive[^"]*">None left today<\/p>/);
    expect(empty).toContain("Back at 8am Singapore time.");
    expect(target(empty)).toBe("/edit?panel=ai&kind=explainer");
    as.left = { "ai-video": 2 };
    expect(html("explainer")).not.toContain("Back at 8am");
    const own = html("edit-own");
    expect(target(own)).toBe("/edit");
    expect(own).not.toContain("left today");
    as.user = LEO;
    expect(await routed("edit-own")).toContain(">Edit your own video</h1>");
  });

  it("is not found for a format with no editor panel to open, or no format at all", () => {
    as.leo = LEO;
    expect(html("slideshow")).toContain("Page not found");
    expect(html("carousel")).toContain("Page not found");
    expect(html("nope")).toContain("Page not found");
  });
});

describe("a format made on its own page", () => {
  it("is every presenter talk and editor template, read from the card's own editor link", () => {
    const made = FORMATS.filter((f) => f.opens && makerOf(f.opens()));
    expect(made.map((f) => f.slug)).toEqual(expect.arrayContaining(["news-anchor", "stage-talk", "spokesperson", "template-street-interview", "template-unboxing"]));
    expect(made.every((f) => f.slug.startsWith("template-") || ["news-anchor", "stage-talk", "spokesperson"].includes(f.slug))).toBe(true);
  });

  it("shows a talk's script box with its writer and the word target for the length, and News anchor's banner", () => {
    as.leo = LEO;
    const page = html("news-anchor");
    expect(page).toContain(">News anchor</h1>");
    expect(page).toContain(">Script</label>");
    expect(page).toContain("Write it for me");
    expect(page).toContain("Aim for 48 to 64 words for 20 seconds.");
    expect(page).toContain(">Banner headline</label>");
    expect(html("stage-talk")).not.toContain("Banner headline");
  });

  it("shows a template's own blanks, and the spoken words that fit its length only where someone speaks", () => {
    as.leo = LEO;
    const page = html("template-street-interview");
    for (const label of ["The question", "The answer (optional)", "Where (optional)"]) expect(page).toContain(`>${label}</label>`);
    expect(page).toContain("Up to 26 spoken words fit 8 seconds.");
    expect(html("template-food-asmr")).not.toContain("spoken words");
    expect(html("template-food-asmr")).toContain(priceText(priceOf("ai-clip", { seconds: 8, quality: "720p" }) as Price));
  });

  it("offers the lengths its maker takes as chips, kept in the address, and aims the words at the one picked", () => {
    as.leo = LEO;
    const chips = (page: string) => [...page.matchAll(/<button[^>]*aria-pressed="(true|false)"[^>]*>(\d+) s<\/button>/g)].map((m) => `${m[2]}${m[1] === "true" ? "*" : ""}`);
    expect(chips(html("news-anchor"))).toEqual(["8", "15", "20*", "30"]);
    expect(html("news-anchor?length=30")).toContain("Aim for 72 to 96 words for 30 seconds.");
    expect(chips(html("news-anchor?length=12"))).toEqual(["8", "15", "20*", "30"]);
    expect(chips(html("template-street-interview"))).toEqual(["4", "8*"]);
    expect(html("template-street-interview?length=4")).toContain("Up to 13 spoken words fit 4 seconds.");
  });

  it("folds the choices a first make never needs under More settings, every pick named in one line, each kept in the address", () => {
    as.leo = LEO;
    const line = (page: string) => page.match(/More settings<\/span><span[^>]*>([^<]*)<\/span>/)?.[1].replace(/&#x27;/g, "'");
    let page = html("news-anchor?voice=george&who=presenter");
    expect(page).toMatch(/aria-label="Who speaks"/);
    expect(page).toMatch(/aria-pressed="true"[^>]*>New presenter</);
    expect(line(page)).toMatch(/^George's voice, an? .+, captions Bold$/);
    expect(page).not.toContain(">Voice</p>");
    page = html("news-anchor?voice=george&who=presenter&more=open");
    for (const label of ["Voice", "Captions"]) expect(page).toContain(`>${label}</p>`);
    expect(page).toContain(">How they look</label>");
    expect(line(html("spokesperson?voice=lily&mention=no&captions=off"))).toMatch(/, no offer, no business name, no captions$/);
    expect(html("spokesperson?more=open")).toContain(">Add an offer to your brand kit</a>");
    // a template: who appears is its own made-up person until you pick, then the product, quality and captions
    page = html("template-street-interview");
    expect(page).toMatch(/aria-pressed="true"[^>]*>Someone new</);
    expect(page).not.toContain("New presenter");
    expect(line(html("template-food-asmr?quality=480p&captions=off"))).toBe("480p, no captions");
    expect(html("template-food-asmr")).not.toContain("Who appears");
  });

  it("offers the brand's saved products on a template that takes one, the pick filling its product blank's name", () => {
    as.leo = LEO;
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) });
    store.set(productsKey(LEO.id), JSON.stringify({ items: [{ id: "pd-brew1", name: "Cold brew", what: "", forWho: "", pictures: [], sources: [], use: true, from: "you", addedAt: "" }] }));
    expect(html("template-food-asmr?more=open")).toMatch(/aria-label="Product".*>None<.*>Cold brew</);
    expect(html("template-food-asmr?product=pd-brew1")).toMatch(/More settings<\/span><span[^>]*>Cold brew, 720p, captions Bold</);
    expect(html("template-food-asmr?product=pd-gone")).toMatch(/More settings<\/span><span[^>]*>No product, 720p, captions Bold</);
  });

  it("prices the press for the length picked, says why it can't go yet, and keeps the editor one link away", () => {
    as.leo = LEO;
    const talk = { kind: "talk", talk: "news" } as const;
    const chip = (length: number) => priceText(makePrice(talk, { length, quality: "720p", presenter: true }) as Price);
    expect(html("news-anchor?who=presenter")).toContain(chip(20));
    expect(html("news-anchor?who=presenter&length=30")).toContain(chip(30));
    expect(chip(30)).not.toBe(chip(20));
    let page = html("news-anchor");
    expect(page).toMatch(/<button[^>]*disabled=""[^>]*>Make it<\/button>/);
    expect(page).toContain("Type the script, or a topic and press Write it for me.");
    expect(page).toMatch(/<a[^>]*href="\/edit\?panel=ai&kind=avatar&talk=news"[^>]*>Set it up in the video editor instead<\/a>/);
    expect(html("template-street-interview")).toContain("Fill in &quot;The question&quot; first.");
    expect(html("template-street-interview?length=4&quality=480p")).toContain(priceText(priceOf("ai-clip", { seconds: 4, quality: "480p" }) as Price));
    // a template that can't work without a photo asks for one, and offers the upload
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) });
    saveTyped("template-character-reference-lock", LEO.id, { fields: { scene: "A walk by the river", product: "", person: "", line: "Hi" } });
    page = html("template-character-reference-lock");
    expect(page).toContain("Upload a photo of the person");
    for (const f of templateById("character-reference-lock")!.fields.filter((x) => x.required)) expect(page, f.key).not.toContain(`Fill in &quot;${f.label}&quot;`);
    expect(page).toContain("Add a photo of the person first.");
    // a script ready to speak: the press is open
    saveTyped("stage-talk", LEO.id, { script: "One idea, told well, beats ten ideas told badly. Here is why." });
    page = html("stage-talk?who=presenter");
    expect(page).toMatch(/<button[^>]*>Make it<\/button>/);
    expect(page).not.toMatch(/<button[^>]*disabled=""[^>]*>Make it<\/button>/);
    // a paid video waiting on this device is finished in the editor first, never replaced
    store.set("cs-ai-video-pending", JSON.stringify({ name: "x", tokens: ["t"], seconds: [8] }));
    expect(html("stage-talk?who=presenter")).toContain("Your last AI video isn&#x27;t finished yet. Open the editor to finish it.");
  });

  it("fills the script from the agent's topic, with what the box held one Undo away", () => {
    as.leo = LEO;
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) });
    let page = html("stage-talk?topic=Why%20people%20skip%20travel%20insurance&who=presenter&length=30");
    expect(page).toMatch(/<textarea[^>]*>Why people skip travel insurance<\/textarea>/);
    expect(page).toMatch(/aria-pressed="true"[^>]*>30 s</);
    expect(page).not.toContain(">Undo</button>");
    saveTyped("stage-talk", LEO.id, { script: "My old words" });
    page = html("stage-talk?topic=Saving%20for%20a%20flat");
    expect(page).toMatch(/<textarea[^>]*>Saving for a flat<\/textarea>/);
    expect(page).toContain(">Undo</button>");
    expect(html("template-street-interview?topic=Anything")).not.toContain("Anything");
  });

  it("offers Play with sound on a template whose example carries it, and not on a silent one", () => {
    as.leo = LEO;
    expect(html("template-street-interview")).toContain("Play with sound");
    expect(html("news-anchor")).not.toContain("Play with sound");
    expect(html("look-clay")).not.toContain("Play with sound");
  });
});
