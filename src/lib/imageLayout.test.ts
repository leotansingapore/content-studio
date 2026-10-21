import { describe, expect, it } from "vitest";
import { renderSvg, type Measure, type SvgNode } from "@/lib/carouselLayout";
import {
  AD_LAYOUT_IDS,
  IMAGE_FIELDS,
  IMAGE_SIZES,
  SIZE_INFO,
  STORY_CLEAR,
  countOf,
  imageBlock,
  layoutImage,
  mainWords,
  type AdLayoutId,
  type ImageInput,
} from "@/lib/imageLayout";

type TextNode = Extract<SvgNode, { type: "text" }>;
type ImageNode = Extract<SvgNode, { type: "image" }>;

// Roughly the average advance of Georgia and system sans, as carouselLayout.test.ts measures.
const measure: Measure = (text, font) => Array.from(text).length * font.size * (font.family === "serif" ? 0.5 : 0.48);
const texts = (nodes: SvgNode[]) => nodes.filter((n): n is TextNode => n.type === "text");
const images = (nodes: SvgNode[]) => nodes.filter((n): n is ImageNode => n.type === "image");
const PHOTO = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";
const LOGO = "data:image/png;base64,iVBORw0KGgo=";
const PIC = "data:image/jpeg;base64,/9j/4AAQ";
const brand = { color: "#1E3A8A", name: "Jane Tan", handle: "janetan.finance", photo: PHOTO, logo: LOGO };

/** Every field at its limit, the way a writer or an adviser would fill it. */
const FULL: Record<AdLayoutId, Record<string, string>> = {
  headline: { headline: "Your hospital bill, split in two for you", line: "Why your plan has a co-pay and what it means for your family, explained in a minute", button: "Message me now" },
  quote: { quote: "The best plan is the one you understand well enough to keep paying for, every month, through the good years and the hard ones too", who: "Jane Tan" },
  stat: { number: "S$1.2M", statLabel: "what a family in Singapore spends raising two children to twenty one", statSource: "Department of Statistics Singapore, Household Expenditure Survey 2023" },
  testimonial: { clientWords: "Jane walked us through every option without any pressure, and for the first time we actually understood what we were paying for and why it mattered to our kids", client: "Sarah T." },
};

const input = (layout: AdLayoutId, o: Partial<ImageInput> = {}): ImageInput => ({ layout, words: FULL[layout], brand, picture: PIC, ...o });

/** The left and right edges a text node covers, whatever its anchor. */
const span = (t: TextNode) => {
  const w = measure(t.text, t.font);
  return t.anchor === "middle" ? [t.x - w / 2, t.x + w / 2] : t.anchor === "end" ? [t.x - w, t.x] : [t.x, t.x + w];
};

describe("layoutImage", () => {
  it("fits every layout at every size inside the margins, with every word kept", () => {
    for (const layout of AD_LAYOUT_IDS) {
      for (const size of IMAGE_SIZES) {
        const { width, height } = SIZE_INFO[size];
        const drawn = layoutImage(input(layout), size, measure);
        const at = `${layout} ${size}`;
        expect(drawn, at).toMatchObject({ width, height, overflow: false });
        const all = texts(drawn.nodes);
        expect(all.some((t) => t.text.endsWith("…")), at).toBe(false);
        for (const t of all) {
          const [left, right] = span(t);
          expect(left, `${at}: ${t.text}`).toBeGreaterThanOrEqual(96 - 0.5);
          expect(right, `${at}: ${t.text}`).toBeLessThanOrEqual(width - 96 + 0.5);
          expect(t.y - t.font.size, `${at}: ${t.text}`).toBeGreaterThanOrEqual(0);
          expect(t.y, `${at}: ${t.text}`).toBeLessThanOrEqual(height);
        }
        for (const i of images(drawn.nodes)) expect(i.x + i.width <= width && i.y + i.height <= height, at).toBe(true);
        // every typed field shows (the stat's source behind its "Source: ")
        const shown = all.map((t) => t.text).join(" ");
        for (const f of IMAGE_FIELDS[layout]) {
          const first = FULL[layout][f.key].split(" ")[0];
          expect(shown, `${at}: ${f.key}`).toContain(first);
        }
      }
    }
  });

  it("keeps every word and the brand row out of a story's top and bottom 250 px", () => {
    for (const layout of AD_LAYOUT_IDS) {
      const drawn = layoutImage(input(layout), "9x16", measure);
      for (const t of texts(drawn.nodes)) {
        // a quote mark's ink starts at about cap height, 0.7 of its size above the baseline
        const top = t.y - t.font.size * (t.text === "\u201C" ? 0.7 : 1);
        expect(top, `${layout}: ${t.text}`).toBeGreaterThanOrEqual(STORY_CLEAR);
        expect(t.y, `${layout}: ${t.text}`).toBeLessThanOrEqual(1920 - STORY_CLEAR);
      }
      for (const i of images(drawn.nodes).filter((n) => n.shape !== "square" || n.fit)) {
        expect(i.y, layout).toBeGreaterThanOrEqual(STORY_CLEAR);
        expect(i.y + i.height, layout).toBeLessThanOrEqual(1920 - STORY_CLEAR);
      }
    }
  });

  it("cuts words that can't fit with an ellipsis and says so", () => {
    for (const layout of AD_LAYOUT_IDS) {
      const words = Object.fromEntries(IMAGE_FIELDS[layout].map((f) => [f.key, "overlong ".repeat(120)]));
      const drawn = layoutImage(input(layout, { words }), "wide", measure);
      expect(drawn.overflow, layout).toBe(true);
      expect(texts(drawn.nodes).some((t) => t.text.endsWith("…")), layout).toBe(true);
      for (const t of texts(drawn.nodes)) expect(t.y, layout).toBeLessThanOrEqual(628);
    }
  });

  it("never draws a stat card's number until its source is typed", () => {
    const words = { number: "57%", statLabel: "of people underestimate care costs" };
    const bare = texts(layoutImage(input("stat", { words, samples: true }), "4x5", measure).nodes).map((t) => t.text);
    expect(bare.join(" ")).not.toContain("57%");
    expect(bare).toContain("Your number");
    expect(imageBlock("stat", words)).toBe("Type your own number and where it's from.");
    const sourced = texts(layoutImage(input("stat", { words: { ...words, statSource: "MOH 2024" } }), "4x5", measure).nodes).map((t) => t.text);
    expect(sourced).toContain("57%");
    expect(sourced).toContain("Source: MOH 2024");
    expect(imageBlock("stat", { ...words, statSource: "MOH 2024" })).toBeNull();
  });

  it("shows grey samples for empty fields on the preview and leaves them out of a download", () => {
    for (const layout of AD_LAYOUT_IDS) {
      const preview = texts(layoutImage(input(layout, { words: {}, samples: true }), "4x5", measure).nodes);
      const download = texts(layoutImage(input(layout, { words: {} }), "4x5", measure).nodes).map((t) => t.text).join(" ");
      for (const f of IMAGE_FIELDS[layout].filter((x) => x.key !== "who")) {
        expect(preview.some((t) => t.text.includes(f.sample.split(" ")[0]) && t.opacity !== undefined), `${layout} ${f.key}`).toBe(true);
        expect(download, `${layout} ${f.key}`).not.toContain(f.sample);
      }
    }
  });

  it("never turns a quote card's words into a client's", () => {
    const shown = texts(layoutImage(input("testimonial", { words: { quote: "My own line about planning" } }), "1x1", measure).nodes).map((t) => t.text).join(" ");
    expect(shown).not.toContain("planning");
    expect(imageBlock("testimonial", { quote: "My own line" })).toBe("Add your client's own words first.");
  });

  it("puts a headline ad's picture full bleed on top, or on the left of a link ad, and the brand colour without one", () => {
    const tall = images(layoutImage(input("headline"), "4x5", measure).nodes).find((i) => i.href === PIC);
    expect(tall).toMatchObject({ x: 0, y: 0, width: 1080, shape: "square" });
    const wide = images(layoutImage(input("headline"), "wide", measure).nodes).find((i) => i.href === PIC);
    expect(wide).toMatchObject({ x: 0, y: 0, height: 628, shape: "square" });
    const none = layoutImage(input("headline", { picture: undefined }), "4x5", measure).nodes;
    expect(images(none).some((i) => i.shape === "square" && !i.fit)).toBe(false);
    expect(none).toContainEqual({ type: "rect", x: 0, y: 0, width: 1080, height: 675, fill: brand.color });
    expect(renderSvg(layoutImage(input("headline"), "4x5", measure))).toContain('<clipPath id="c1"><rect x="0" y="0" width="1080" height="675"/></clipPath>');
  });

  it("draws the brand kit: headshot, name, handle, and the logo whole", () => {
    const drawn = layoutImage(input("quote"), "4x5", measure);
    expect(images(drawn.nodes).find((i) => i.href === PHOTO)?.shape).toBe("circle");
    expect(images(drawn.nodes).find((i) => i.href === LOGO)).toMatchObject({ fit: "contain" });
    expect(texts(drawn.nodes).map((t) => t.text)).toEqual(expect.arrayContaining(["Jane Tan", "@janetan.finance"]));
    const plain = layoutImage(input("quote", { brand: { color: "#FDE68A", name: "", handle: "" } }), "4x5", measure);
    expect(images(plain.nodes)).toEqual([]);
  });

  it("centres the words when asked, and follows the font and background", () => {
    const centred = texts(layoutImage(input("quote", { align: "center" }), "4x5", measure).nodes).filter((t) => t.font.size > 40);
    for (const t of centred) expect(t).toMatchObject({ x: 540, anchor: "middle" });
    const dark = layoutImage(input("headline", { paper: "dark", font: "modern" }), "4x5", measure);
    expect(dark.background).toBe("#18181B");
    expect(texts(dark.nodes).find((t) => t.text.startsWith("Your hospital"))).toMatchObject({ fill: "#FAFAFA", font: { family: "sans" } });
  });
});

describe("fields and blocks", () => {
  it("counts words or characters", () => {
    expect(countOf("  Your hospital  bill ", "words")).toBe(3);
    expect(countOf(" S$1.2M ", "chars")).toBe(6);
  });

  it("asks for the main words before a download", () => {
    expect(imageBlock("headline", {})).toBe("Add a headline first.");
    expect(imageBlock("headline", { headline: " " })).toBe("Add a headline first.");
    expect(imageBlock("headline", { headline: "Hi" })).toBeNull();
    expect(imageBlock("quote", { quote: "Hi" })).toBeNull();
    expect(imageBlock("stat", { number: "5", statSource: "x" })).toBe("Add what the number means first.");
    expect(mainWords("testimonial", FULL.testimonial)).toBe(FULL.testimonial.clientWords);
  });
});
