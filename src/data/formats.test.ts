import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { TEMPLATES, type VideoTemplate } from "../../supabase/functions/ai-video/templates.ts";
import type { UsageFeature } from "../../supabase/functions/_shared/usageCaps.ts";
import { FORMATS, NEED_LINES, alsoMakeList, filterFormats, formatBySlug, formatHref, templateFormats, usedUpLine, type FormatDef } from "./formats";
import { WRITE_PRICE, priceOf, priceText, sumPrices, type Price } from "@/lib/prices";

// The routes App.tsx serves, read the way src/lib/navRoutes.test.ts reads them.
const appSource = readFileSync(resolve(__dirname, "../App.tsx"), "utf8");
const routes = new Set([...appSource.matchAll(/<Route\b[^>]*\bpath="(\/[^"]*)"/g)].map((m) => m[1]));
// Pages a later phase-3 task adds to App.tsx; only entries that are not ready yet may link there.
const LATER_ROUTES: Record<string, string> = { "/image": "static-ad, wave 3" };

const from = (p: Price | "pick" | null) => ({ ...(p as Price), kind: "from" as const });
const explainer = sumPrices(priceOf("ai-video", { scenes: 5 }), priceOf("ai-voice"), priceOf("ai-video-script"));
const talk = sumPrices(priceOf("ai-video", { seconds: 25 }), priceOf("ai-video-script"), priceOf("ai-voice"), priceOf("ai-image"));
/** What each entry's price names (phase3-build-brief.md, the format registry). */
const EXPECTED: Record<string, Price | "pick" | null> = {
  slideshow: priceOf("remix-make"),
  "wall-of-text": priceOf("remix-make"),
  "static-ad": priceOf("remix-make"),
  meme: priceOf("remix-make"),
  carousel: null,
  "text-post": WRITE_PRICE,
  script: WRITE_PRICE,
  montage: priceOf("montage-beats"),
  "text-over-clip": sumPrices(priceOf("remix-make"), priceOf("ai-clip", { seconds: 8, quality: "480p" })),
  explainer,
  ...Object.fromEntries(["clay", "paper", "felt", "chalk", "comic", "cartoon3d", "storybook"].map((l) => [`look-${l}`, explainer])),
  ...Object.fromEntries(TEMPLATES.filter((t) => !t.hidden).map((t) => [`template-${t.id}`, priceOf("ai-clip", { seconds: 8, quality: "720p" })])),
  "talking-head": sumPrices(priceOf("remix-make"), priceOf("ai-video", { seconds: 15 }), priceOf("ai-voice"), priceOf("ai-image")),
  "green-screen": from(priceOf("remix-make")),
  "hook-demo": from(priceOf("remix-make")),
  "news-anchor": talk,
  "stage-talk": talk,
  spokesperson: talk,
  "own-media": sumPrices(priceOf("own-words"), priceOf("ai-voice")),
  clips: sumPrices(priceOf("video-transcribe", { minutes: 60 }), priceOf("video-clips", { passes: 2 })),
  "edit-own": null,
};
const chip = (slug: string) => {
  const p = FORMATS.find((f) => f.slug === slug)!.price();
  return p && p !== "pick" ? priceText(p) : p;
};

const entry = (o: Partial<FormatDef> & { slug: string }): FormatDef => ({ name: o.slug, blurb: "", kind: "video", group: 1, price: () => null, ready: true, ...o });

describe("the format registry", () => {
  it("has unique kebab-case slugs, in the gallery's group order", () => {
    const slugs = FORMATS.map((f) => f.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const s of slugs) expect(s, s).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    const groups = FORMATS.map((f) => f.group);
    expect(groups).toEqual([...groups].sort((a, b) => a - b));
  });

  it("links every card to a route the app serves, or to a /make page that exists", () => {
    for (const f of FORMATS) {
      const path = formatHref(f, { source: "ad:1" }).split(/[?#]/)[0];
      const make = path.match(/^\/make\/([^/]+)$/);
      const ok = make ? !!formatBySlug(decodeURIComponent(make[1])) : routes.has(path) || (!f.ready && path in LATER_ROUTES);
      expect(ok, `${f.slug} -> ${path}`).toBe(true);
    }
    expect(routes.has("/make/:format")).toBe(true);
  });

  it("prices every card from the price table, never a typed number", () => {
    expect(Object.keys(EXPECTED).sort()).toEqual(FORMATS.map((f) => f.slug).sort());
    for (const f of FORMATS) expect(f.price(), f.slug).toEqual(EXPECTED[f.slug]);
  });

  it("shows the brief's chips at the default options", () => {
    expect(chip("slideshow")).toBe("About US$0.02");
    expect(chip("text-over-clip")).toBe("About US$1.66");
    expect(chip("talking-head")).toBe("About US$2.80");
    expect(chip("explainer")).toBe("About US$0.06");
    expect(chip("news-anchor")).toBe("About US$4.16");
    expect(chip("own-media")).toBe("About US$0.03");
    expect(chip("clips")).toBe("About US$0.40");
    expect(chip("green-screen")).toBe("From US$0.02");
    expect(chip(`template-${TEMPLATES[0].id}`)).toBe("About US$3.70");
    expect(chip("carousel")).toBeNull();
  });

  it("takes needs from the fixed list, and a template that needs a photo says so", () => {
    for (const f of FORMATS) if (f.needs) expect(Object.keys(NEED_LINES), f.slug).toContain(f.needs);
    for (const t of TEMPLATES) expect(FORMATS.find((f) => f.slug === `template-${t.id}`)?.needs, t.id).toBe(t.needsPhoto ? "photo" : undefined);
    expect(NEED_LINES["demo-video"]).toBe("Needs a demo video");
  });

  it("gives every template a card and leaves out the ones the editor hides", () => {
    const hidden = { ...TEMPLATES[0], id: "scene-kitchen", hidden: true } as VideoTemplate;
    expect(templateFormats([TEMPLATES[0], hidden]).map((f) => f.slug)).toEqual([`template-${TEMPLATES[0].id}`]);
    for (const t of TEMPLATES) {
      const card = FORMATS.find((f) => f.slug === `template-${t.id}`);
      if (t.hidden) expect(card, t.id).toBeUndefined();
      else expect(card, t.id).toMatchObject({ name: t.title, blurb: t.blurb, cap: "ai-clip", group: 2 });
    }
    expect(formatHref(FORMATS.find((f) => f.slug === `template-${TEMPLATES[0].id}`)!)).toBe(`/edit?panel=ai&kind=template&template=${TEMPLATES[0].id}`);
  });

  it("names no brand-owned style", () => {
    for (const f of FORMATS) expect(`${f.name} ${f.blurb}`, f.slug).not.toMatch(/pixar|lego|barbie|ghibli|zack d|netflix|simpsons/i);
  });

  it("finds pages only by slug, ready or not, so the existing pages keep their cap", () => {
    expect(formatBySlug("slideshow")).toMatchObject({ slug: "slideshow", cap: "remix-make" });
    expect(formatBySlug("wall-of-text")).toMatchObject({ slug: "wall-of-text", cap: "remix-make" });
    for (const s of ["talking-head", "text-over-clip", "hook-demo", "green-screen"]) expect(formatBySlug(s)?.ready, s).toBe(true);
    expect(formatBySlug("carousel")).toBeNull();
    expect(formatBySlug("nope")).toBeNull();
    expect(formatBySlug(undefined)).toBeNull();
  });

  it("links a page with the shared params and a card elsewhere with its own builder", () => {
    const page = FORMATS.find((f) => f.slug === "wall-of-text")!;
    expect(formatHref(page, { source: "top:a-b", mention: "no" })).toBe("/make/wall-of-text?source=top%3Aa-b&mention=no");
    expect(formatHref(page)).toBe("/make/wall-of-text");
    expect(formatHref(FORMATS.find((f) => f.slug === "static-ad")!, { source: "ad:1" })).toBe("/image?source=ad%3A1");
    expect(formatHref(FORMATS.find((f) => f.slug === "meme")!, { source: "ad:1" })).toBe("/image?layout=top-bottom&source=ad%3A1");
    expect(formatHref(FORMATS.find((f) => f.slug === "look-clay")!)).toBe("/edit?panel=ai&kind=explainer&look=clay");
    expect(formatHref(FORMATS.find((f) => f.slug === "news-anchor")!)).toBe("/edit?panel=ai&kind=avatar&talk=news");
    expect(formatHref(FORMATS.find((f) => f.slug === "clips")!)).toBe("/edit?panel=clips");
  });
});

describe("filterFormats", () => {
  const list = [entry({ slug: "a", kind: "video" }), entry({ slug: "b", kind: "image", needs: "photo" }), entry({ slug: "c", kind: "slides" }), entry({ slug: "d", kind: "text" })];
  const slugs = (o: Parameters<typeof filterFormats>[1]) => filterFormats(list, o).map((f) => f.slug);
  it("keeps one kind, or every kind for all", () => {
    expect(slugs({ kind: "video" })).toEqual(["a"]);
    expect(slugs({ kind: "image" })).toEqual(["b"]);
    expect(slugs({ kind: "slides" })).toEqual(["c"]);
    expect(slugs({ kind: "text" })).toEqual(["d"]);
    expect(slugs({ kind: "all" })).toEqual(["a", "b", "c", "d"]);
    expect(slugs({})).toEqual(["a", "b", "c", "d"]);
  });
  it("drops the formats that need something extra when asked", () => {
    expect(slugs({ needsNone: true })).toEqual(["a", "c", "d"]);
    expect(slugs({ needsNone: false })).toEqual(["a", "b", "c", "d"]);
    expect(slugs({ kind: "image", needsNone: true })).toEqual([]);
  });
});

describe("alsoMakeList", () => {
  it("lists the ready formats a remix can also make, making on arrival only those under about US$1", () => {
    expect(alsoMakeList(FORMATS).map(({ f, go }) => [f.slug, go])).toEqual([
      ["slideshow", true], ["wall-of-text", true], ["static-ad", true], ["meme", true], ["text-over-clip", false], ["talking-head", false],
    ]);
  });
  it("lists ready Also make formats only, and makes on arrival only under US$1", () => {
    const at = (usd: number) => () => ({ usd, kind: "about" as const });
    const list = [
      entry({ slug: "cheap", alsoMake: true, price: at(0.99) }),
      entry({ slug: "dear", alsoMake: true, price: at(1) }),
      entry({ slug: "pick", alsoMake: true, price: () => "pick" }),
      entry({ slug: "not-ready", alsoMake: true, ready: false, price: at(0.02) }),
      entry({ slug: "not-listed", price: at(0.02) }),
    ];
    expect(alsoMakeList(list).map(({ f, go }) => [f.slug, go])).toEqual([["cheap", true], ["dear", false], ["pick", false]]);
  });
});

describe("usedUpLine", () => {
  const left = (o: Partial<Record<UsageFeature, number | null>>) => (f: UsageFeature) => (f in o ? o[f]! : 3);
  it("names the first cap used up, in the order the press spends them", () => {
    expect(usedUpLine(["ai-video", "ai-voice", "ai-image"], left({ "ai-voice": 0, "ai-image": 0 }))).toBe("No voiceovers left today. Back at 8am Singapore time.");
    expect(usedUpLine(["ai-clip", "remix-make"], left({ "remix-make": 0 }))).toBe("No remixes left today. Back at 8am Singapore time.");
    expect(usedUpLine(["ai-clip", "video-clips"], left({ "video-clips": 0 }))).toBe("One of its steps has no uses left today. Back at 8am Singapore time.");
  });
  it("is null while every cap has a use or its count is still loading", () => {
    expect(usedUpLine(["ai-video", "ai-voice"], left({}))).toBeNull();
    expect(usedUpLine(["ai-video", "ai-voice"], left({ "ai-voice": null }))).toBeNull();
  });
});
