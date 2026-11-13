import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { TEMPLATES, type VideoTemplate } from "../../supabase/functions/ai-video/templates.ts";
import type { UsageFeature } from "../../supabase/functions/_shared/usageCaps.ts";
import { EXPLAINER_LOOKS } from "../../supabase/functions/ai-video/logic.ts";
import {
  FORMATS, FORMAT_FILTERS, NEED_LINES, SECTIONS, alsoMakeList, bySection, filterFormats, formatBySlug, formatHref, readyStatics, searchFormats, templateFormats,
  usedUpLine, type FormatDef, type FormatNeed,
} from "./formats";
import { STATIC_FORMATS, type StaticFormat } from "./staticFormats";
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
  "notification-stack": null,
  "static-ad": priceOf("remix-make"),
  meme: priceOf("remix-make"),
  carousel: null,
  "text-post": WRITE_PRICE,
  script: WRITE_PRICE,
  montage: priceOf("montage-beats"),
  "text-over-clip": sumPrices(priceOf("remix-make"), priceOf("ai-clip", { seconds: 8, quality: "480p" })),
  "documentary-interview": sumPrices(priceOf("remix-make"), priceOf("ai-clip", { seconds: 8, quality: "480p" })),
  explainer,
  ...Object.fromEntries(
    ["clay", "paper", "felt", "chalk", "comic", "cartoon3d", "storybook", "bricks", "dolls", "skeleton", "anime", "metaphor", "object", "animal", "puppet", "host"]
      .map((l) => [`look-${l}`, explainer]),
  ),
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
  // north star phase 7a: stubs until wave 2
  "launch-film": priceOf("launch-film"),
  "same-edit": sumPrices(priceOf("remix-make"), priceOf("ai-video", { seconds: 15 }), priceOf("ai-voice")),
};
const chip = (slug: string) => {
  const p = FORMATS.find((f) => f.slug === slug)!.price();
  return p && p !== "pick" ? priceText(p) : p;
};

const entry = (o: Partial<FormatDef> & { slug: string }): FormatDef => ({ name: o.slug, blurb: "", kind: "video", group: 1, section: "own", price: () => null, ready: true, ...o });

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
    expect(chip("slideshow")).toBe("Under US$0.01");
    expect(chip("text-over-clip")).toBe("About US$1.65");
    expect(chip("talking-head")).toBe("About US$2.82");
    expect(chip("explainer")).toBe("About US$0.06");
    expect(chip("news-anchor")).toBe("About US$4.19");
    expect(chip("own-media")).toBe("About US$0.03");
    expect(chip("clips")).toBe("About US$0.40");
    expect(chip("green-screen")).toBe("Under US$0.01");
    expect(chip(`template-${TEMPLATES[0].id}`)).toBe("About US$3.70");
    expect(chip("carousel")).toBeNull();
    expect(chip("launch-film")).toBe("About US$0.06");
    expect(chip("same-edit")).toBe("About US$2.78");
  });

  it("takes needs from the fixed list, and a template that needs a photo says so", () => {
    for (const f of FORMATS) if (f.needs) expect(Object.keys(NEED_LINES), f.slug).toContain(f.needs);
    // a hidden template has no card (a format page makes it, as crumple-hook from /make/hook-demo)
    const NEED_OF = { person: "photo", product: "product-photo" } as const;
    for (const t of TEMPLATES) expect(FORMATS.find((f) => f.slug === `template-${t.id}`)?.needs, t.id).toBe(t.needsPhoto && !t.hidden ? NEED_OF[t.needsPhoto] : undefined);
    expect(FORMATS.find((f) => f.slug === "template-unboxing")?.needs).toBe("product-photo");
    expect(NEED_LINES["product-photo"]).toBe("Needs a product photo");
    expect(NEED_LINES["demo-video"]).toBe("Needs a demo video");
    expect(NEED_LINES["reel-video"]).toBe("Needs a reel's video: Instagram or an upload");
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
    // phase 7a's two makers open for Leo before the gallery lists them
    expect(formatBySlug("launch-film")).toMatchObject({ cap: "launch-film", group: 1, ready: false });
    expect(formatBySlug("same-edit")).toMatchObject({ cap: "ai-video", group: 3, needs: "reel-video", ready: false });
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
    expect(formatHref(FORMATS.find((f) => f.slug === "look-puppet")!)).toBe("/edit?panel=ai&kind=explainer&look=puppet");
    expect(formatHref(FORMATS.find((f) => f.slug === "documentary-interview")!, { source: "ad:1" })).toBe("/make/text-over-clip?scene=interview&source=ad%3A1");
    expect(formatHref(FORMATS.find((f) => f.slug === "news-anchor")!)).toBe("/edit?panel=ai&kind=avatar&talk=news");
    expect(formatHref(FORMATS.find((f) => f.slug === "clips")!)).toBe("/edit?panel=clips");
  });
});

describe("the Create page's sections (Fastlane's Studio > Create, 11 Nov)", () => {
  const ids = SECTIONS.map((x) => x.id);

  it("puts every card, template and look in exactly one of the five sections, in Fastlane's order", () => {
    expect(SECTIONS.map((x) => x.title)).toEqual(["Make your own", "Your words over a clip", "A person on camera", "Animated stories", "Built from your footage"]);
    for (const f of FORMATS) expect(ids, f.slug).toContain(f.section);
    for (const f of FORMATS.filter((x) => x.slug.startsWith("look-"))) expect(f.section, f.slug).toBe("animated");
    for (const f of templateFormats(TEMPLATES)) expect(ids, f.slug).toContain(f.section);
  });

  it("gives every animated story card a look the server can draw", () => {
    for (const f of FORMATS.filter((x) => x.section === "animated")) {
      const look = new URLSearchParams(formatHref(f).split("?")[1]).get("look")!;
      expect(EXPLAINER_LOOKS[look as keyof typeof EXPLAINER_LOOKS]?.style, f.slug).toBeTruthy();
      expect(f.ready, f.slug).toBe(true);
    }
    expect(FORMATS.filter((x) => x.section === "animated")).toHaveLength(16);
  });

  it("groups the cards by section with counts that add up to the whole list, leaving empty sections out", () => {
    const ready = FORMATS.filter((f) => f.ready);
    const groups = bySection(ready);
    expect(groups.map((g) => g.id)).toEqual(ids);
    expect(groups.reduce((n, g) => n + g.list.length, 0)).toBe(ready.length);
    expect(groups.flatMap((g) => g.list).sort((a, b) => a.slug.localeCompare(b.slug))).toEqual([...ready].sort((a, b) => a.slug.localeCompare(b.slug)));
    expect(bySection([entry({ slug: "a", section: "footage" }), entry({ slug: "b", section: "own" })]).map((g) => [g.id, g.list.length])).toEqual([["own", 1], ["footage", 1]]);
  });
});

describe("filterFormats", () => {
  const list = [
    entry({ slug: "a" }),
    entry({ slug: "b", needs: "demo-video" }),
    entry({ slug: "c", needs: "product-photo" }),
    entry({ slug: "d", needs: "photo" }),
  ];
  const missing = (gone: FormatNeed[]) => (n: FormatNeed) => gone.includes(n);
  const slugs = (show: (typeof FORMAT_FILTERS)[number], gone: FormatNeed[]) => filterFormats(list, show, missing(gone)).map((f) => f.slug);

  it("shows every card for all, and splits the rest into ready and needs something by what the brand is missing", () => {
    expect(slugs("all", ["demo-video"])).toEqual(["a", "b", "c", "d"]);
    expect(slugs("ready", ["demo-video", "photo"])).toEqual(["a", "c"]);
    expect(slugs("needs", ["demo-video", "photo"])).toEqual(["b", "d"]);
    // a brand with everything: all ready, nothing needed
    expect(slugs("ready", [])).toEqual(["a", "b", "c", "d"]);
    expect(slugs("needs", [])).toEqual([]);
  });

  it("splits every card one way or the other, so ready and needs add up to all", () => {
    const gone = missing(["demo-video", "product-photo", "own-video", "own-media", "photo", "reel-video"]);
    const all = FORMATS.filter((f) => f.ready);
    expect(filterFormats(all, "ready", gone).length + filterFormats(all, "needs", gone).length).toBe(all.length);
    expect(filterFormats(all, "needs", gone).every((f) => !!f.needs)).toBe(true);
  });
});

describe("searchFormats", () => {
  const names = (q: string) => searchFormats(FORMATS, q).map((f) => f.slug);
  it("keeps the whole list for nothing typed", () => {
    expect(searchFormats(FORMATS, "  ")).toBe(FORMATS);
  });
  it("finds a card by its name, its line or its section, any case, every word needed", () => {
    expect(names("CLAY")).toEqual(["look-clay"]);
    expect(names("stops the scroll")).toEqual(["hook-demo"]);
    expect(names("animated stories").length).toBe(FORMATS.filter((f) => f.section === "animated").length);
    expect(names("podcast person")).toContain("template-two-host-podcast");
    expect(names("podcast person")).not.toContain("clips");
    expect(names("zzzz")).toEqual([]);
  });
  it("searches static formats by name and line", () => {
    expect(searchFormats(STATIC_FORMATS, "whiteboard").map((f) => f.slug)).toEqual(["whiteboard"]);
  });
});

describe("readyStatics", () => {
  const st = (slug: string, ready: boolean): StaticFormat => ({ slug, name: slug, blurb: "", ready });
  it("lists only the static formats whose page has shipped, in the registry's order", () => {
    expect(readyStatics([st("a", true), st("b", false), st("c", true)]).map((f) => f.slug)).toEqual(["a", "c"]);
    expect(readyStatics([st("b", false)])).toEqual([]);
    expect(readyStatics()).toEqual(STATIC_FORMATS.filter((f) => f.ready));
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

// every card on Create and Studio shows an example file; a missing one falls back to a drawn tile, which this stops
describe("format examples on disk", () => {
  it("has a poster for every ready format, a clip for every ready video, and every static shot listed", async () => {
    const { existsSync } = await import("node:fs");
    const { STATIC_FORMATS, STATIC_SHOTS } = await import("./staticFormats");
    const missing: string[] = [];
    for (const f of FORMATS.filter((x) => x.ready)) {
      if (!existsSync(`public/formats/${f.slug}.webp`)) missing.push(`${f.slug}.webp`);
      if (f.kind === "video" && !existsSync(`public/formats/${f.slug}.mp4`)) missing.push(`${f.slug}.mp4`);
    }
    for (const f of STATIC_FORMATS.filter((x) => x.ready)) {
      const shots = STATIC_SHOTS[f.slug] ?? [];
      if (shots.length < 4) missing.push(`${f.slug}: fewer than 4 examples`);
      shots.forEach((_, i) => existsSync(`public/formats/static/${f.slug}-${i + 1}.webp`) || missing.push(`static/${f.slug}-${i + 1}.webp`));
    }
    expect(missing).toEqual([]);
  });
});
