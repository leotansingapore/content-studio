import { describe, expect, it } from "vitest";
import { renderSvg, type Measure, type SvgNode } from "@/lib/carouselLayout";
import {
  AD_LAYOUT_IDS,
  IMAGE_FIELDS,
  IMAGE_SIZES,
  MEME_LAYOUT_IDS,
  MEME_SIZES,
  SECOND_PICTURE,
  SIZE_INFO,
  STORY_CLEAR,
  countOf,
  imageBlock,
  isMeme,
  layoutImage,
  mainWords,
  memeChoice,
  optionIndex,
  pictureBlock,
  secondPicture,
  sizesFor,
  type AdLayoutId,
  type ImageInput,
  type MemeLayoutId,
} from "@/lib/imageLayout";
import { STATIC_EXAMPLE, STATIC_FORMATS } from "@/data/staticFormats";
import { IMAGE_LAYOUTS, STATIC_LAYOUT_IDS } from "@/lib/links";
import { MEME_FIELDS, STATIC_FIELDS, STATIC_LAYOUTS } from "../../supabase/functions/remix/logic.ts";
import { isStatic, staticPhoto, type StaticLayoutId } from "@/lib/imageLayout";

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

/** The left and right edges a text node covers, whatever its anchor; a line turned on its side covers about its size. */
const span = (t: TextNode) => {
  if (t.rotate && Math.abs(t.rotate.deg) > 45) return [t.x - t.font.size, t.x + t.font.size * 0.3];
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
      // four times each field's limit in its own unit; 120 words in a one-line field took ~0.5 s of CPU, as
      // ellipsize trims a 1,000-character line a character at a time, and timed out under load
      const words = Object.fromEntries(IMAGE_FIELDS[layout].map((f) => [f.key, "overlong ".repeat(f.unit === "words" ? 4 * f.max : Math.ceil((4 * f.max) / 9))]));
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

describe("memes", () => {
  /** Every field at its limit, as the meme writer may fill it. */
  const MEME: Record<MemeLayoutId, Record<string, string>> = {
    "top-bottom": { top: "When the bank says your loan is pre approved today", bottom: "Me checking the CPF statement for the third time" },
    "nobody-me": { setup: "Me at 2am on a Sunday after a long week of work", punch: "Reading every single HDB loan rule again just to be sure" },
    expectation: { expectation: "First home with a big balcony", reality: "Four years of kopi o kosong" },
    pov: { line: "You just found out what your hospital plan actually covers after the first big bill" },
    "post-reaction": { post: "Told my parents I finally started an emergency fund this year, and they asked how much is in it, so I changed the topic to dinner plans and the weather instead" },
  };
  const OTHER = "data:image/jpeg;base64,/9j/4AAR";
  const meme = (layout: MemeLayoutId, o: Partial<ImageInput> = {}): ImageInput => ({ layout, words: MEME[layout], brand, picture: PIC, picture2: OTHER, ...o });

  it("keeps the writer's fields and limits, and the layout list the links builder takes", () => {
    for (const l of MEME_LAYOUT_IDS) expect(Object.fromEntries(IMAGE_FIELDS[l].map((f) => [f.key, f.max])), l).toEqual(MEME_FIELDS[l]);
    expect([...AD_LAYOUT_IDS, ...MEME_LAYOUT_IDS, ...STATIC_LAYOUT_IDS]).toEqual([...IMAGE_LAYOUTS]);
    expect(MEME_LAYOUT_IDS.every(isMeme) && !AD_LAYOUT_IDS.some(isMeme)).toBe(true);
    expect(sizesFor("pov")).toEqual(["4x5", "1x1", "9x16"]);
    expect(sizesFor("headline")).toEqual(IMAGE_SIZES);
  });

  it("fits every meme at Square, Feed 4:5 and Story 9:16 inside the margins, with every word kept", () => {
    for (const layout of MEME_LAYOUT_IDS) {
      for (const size of MEME_SIZES) {
        const { width, height } = SIZE_INFO[size];
        const drawn = layoutImage(meme(layout), size, measure);
        const at = `${layout} ${size}`;
        expect(drawn, at).toMatchObject({ width, height, overflow: false });
        const all = texts(drawn.nodes);
        expect(all.some((t) => t.text.endsWith("\u2026")), at).toBe(false);
        for (const t of all) {
          const [left, right] = span(t);
          expect(left, `${at}: ${t.text}`).toBeGreaterThanOrEqual(96 - 0.5);
          expect(right, `${at}: ${t.text}`).toBeLessThanOrEqual(width - 96 + 0.5);
          expect(t.y - t.font.size, `${at}: ${t.text}`).toBeGreaterThanOrEqual(0);
          expect(t.y, `${at}: ${t.text}`).toBeLessThanOrEqual(height);
          if (size === "9x16") {
            expect(t.y - t.font.size, `${at}: ${t.text}`).toBeGreaterThanOrEqual(STORY_CLEAR);
            expect(t.y, `${at}: ${t.text}`).toBeLessThanOrEqual(height - STORY_CLEAR);
          }
        }
        for (const i of images(drawn.nodes)) expect(i.x >= 0 && i.y >= 0 && i.x + i.width <= width && i.y + i.height <= height, at).toBe(true);
        const shown = all.map((t) => t.text).join(" ").toLowerCase();
        for (const f of IMAGE_FIELDS[layout]) expect(shown, `${at}: ${f.key}`).toContain(MEME[layout][f.key].split(" ")[0].toLowerCase());
      }
    }
  });

  it("outlines top and bottom words white on black, so they read on a light or a dark picture, and nothing else", () => {
    const drawn = layoutImage(meme("top-bottom"), "1x1", measure);
    const words = texts(drawn.nodes);
    expect(words.length).toBeGreaterThan(1);
    for (const t of words) {
      expect(t.text).toBe(t.text.toUpperCase());
      expect(t).toMatchObject({ fill: "#FFFFFF", stroke: "#000000", anchor: "middle" });
      expect(t.strokeWidth).toBeGreaterThanOrEqual(4);
    }
    expect(images(drawn.nodes)[0]).toMatchObject({ x: 0, y: 0, width: 1080, height: 1080, href: PIC, shape: "square" });
    expect(renderSvg(drawn)).toContain('stroke="#000000"');
    expect(renderSvg(drawn)).toContain('paint-order="stroke"');
    for (const l of [...AD_LAYOUT_IDS, "pov", "nobody-me"] as const) expect(renderSvg(layoutImage(l === "pov" || l === "nobody-me" ? meme(l) : input(l), "1x1", measure)), l).not.toContain("paint-order");
  });

  it("cuts words that can't fit with an ellipsis and says so", () => {
    for (const layout of MEME_LAYOUT_IDS) {
      const words = Object.fromEntries(IMAGE_FIELDS[layout].map((f) => [f.key, "overlong ".repeat(120)]));
      for (const size of MEME_SIZES) {
        const drawn = layoutImage(meme(layout, { words }), size, measure);
        expect(drawn.overflow, `${layout} ${size}`).toBe(true);
        expect(texts(drawn.nodes).some((t) => t.text.endsWith("\u2026")), `${layout} ${size}`).toBe(true);
        for (const t of texts(drawn.nodes)) expect(t.y, layout).toBeLessThanOrEqual(SIZE_INFO[size].height - (size === "9x16" ? STORY_CLEAR : 0));
      }
    }
  });

  it("says Nobody: once, with the setup and what you're doing after it", () => {
    const shown = (words: Record<string, string>) => texts(layoutImage(meme("nobody-me", { words }), "1x1", measure).nodes).map((t) => t.text).join(" ");
    expect(shown({ setup: "Me at 2am", punch: "reading loan rules" })).toBe("Nobody: Me at 2am: reading loan rules");
    expect(shown({ setup: "Nobody: Me at 2am:", punch: "reading loan rules" })).toBe("Nobody: Me at 2am: reading loan rules");
    const band = layoutImage(meme("nobody-me"), "4x5", measure).nodes;
    const rect = band.find((n): n is Extract<SvgNode, { type: "rect" }> => n.type === "rect" && n.fill === "#FFFFFF")!;
    const pic = images(band)[0];
    expect(rect).toMatchObject({ x: 0, y: 0, width: 1080 });
    expect(pic).toMatchObject({ x: 0, y: rect.height, width: 1080, href: PIC });
    expect(pic.y + pic.height).toBe(1350);
  });

  it("stacks expectation and reality, each picture under its own label", () => {
    const drawn = layoutImage(meme("expectation"), "4x5", measure);
    expect(images(drawn.nodes)).toEqual([
      expect.objectContaining({ y: 0, height: 675, href: PIC }),
      expect.objectContaining({ y: 675, height: 675, href: OTHER }),
    ]);
    const shown = texts(drawn.nodes).map((t) => t.text).join(" ");
    expect(shown).toContain("Expectation: First home");
    expect(shown).toContain("Reality: Four years");
    expect(shown.indexOf("Expectation")).toBeLessThan(shown.indexOf("Reality"));
  });

  it("puts POV on a dark fade over the picture", () => {
    const drawn = layoutImage(meme("pov"), "1x1", measure);
    expect(drawn.nodes.some((n) => n.type === "fade" && n.color === "#000000")).toBe(true);
    expect(texts(drawn.nodes)[0].text.startsWith("POV: You just")).toBe(true);
    expect(texts(drawn.nodes).every((t) => t.fill === "#FFFFFF" && t.y > 540)).toBe(true);
  });

  it("draws the brand's own post with headshot, name and handle, never a network's or the brand's logo", () => {
    const drawn = layoutImage(meme("post-reaction"), "1x1", measure);
    expect(images(drawn.nodes).find((i) => i.href === PHOTO)).toMatchObject({ shape: "circle", x: 96 });
    expect(images(drawn.nodes).some((i) => i.href === LOGO)).toBe(false);
    expect(texts(drawn.nodes).map((t) => t.text)).toEqual(expect.arrayContaining(["Jane Tan", "@janetan.finance"]));
    const reaction = images(drawn.nodes).find((i) => i.href === PIC)!;
    expect(reaction.y + reaction.height).toBe(1080);
    // no brand kit: the post alone, still drawn
    const plain = texts(layoutImage(meme("post-reaction", { brand: { color: "#000000", name: "", handle: "" } }), "1x1", measure).nodes);
    expect(plain[0].text.startsWith("Told my parents")).toBe(true);
  });

  it("shows grey sample words and a stand-in picture on the preview only", () => {
    for (const layout of MEME_LAYOUT_IDS) {
      const preview = texts(layoutImage(meme(layout, { words: {}, picture: undefined, picture2: undefined, samples: true }), "1x1", measure).nodes);
      const download = texts(layoutImage(meme(layout, { words: {}, picture: undefined, picture2: undefined }), "1x1", measure).nodes).map((t) => t.text).join(" ");
      expect(preview.some((t) => t.text === "Your picture"), layout).toBe(true);
      expect(download, layout).not.toContain("Your picture");
      for (const f of IMAGE_FIELDS[layout]) {
        const first = f.sample.split(" ")[0];
        expect(preview.some((t) => t.text.toLowerCase().includes(first.toLowerCase()) && t.opacity !== undefined), `${layout} ${f.key}`).toBe(true);
        expect(download.toLowerCase(), `${layout} ${f.key}`).not.toContain(f.sample.toLowerCase());
      }
    }
  });

  it("asks for the words and the pictures before a download", () => {
    expect(imageBlock("top-bottom", {})).toBe("Add the words first.");
    expect(imageBlock("top-bottom", { bottom: "Me" })).toBeNull();
    expect(imageBlock("nobody-me", { setup: "Me at 2am" })).toBe("Add both lines first.");
    expect(imageBlock("expectation", { expectation: "A", reality: " " })).toBe("Add both labels first.");
    expect(imageBlock("pov", { line: "x" })).toBeNull();
    expect(imageBlock("post-reaction", {})).toBe("Add your post first.");
    expect(pictureBlock("pov", 0)).toBe("Add a picture first.");
    expect(pictureBlock("pov", 1)).toBeNull();
    expect(pictureBlock("expectation", 1)).toBe("Add both pictures first.");
    expect(pictureBlock("expectation", 2)).toBeNull();
    expect(pictureBlock("headline", 0)).toBeNull();
  });

  it("names a meme as it reads", () => {
    expect(mainWords("top-bottom", MEME["top-bottom"])).toBe(`${MEME["top-bottom"].top} / ${MEME["top-bottom"].bottom}`);
    expect(mainWords("nobody-me", { setup: "Me at 2am", punch: "reading" })).toBe("Me at 2am: reading");
    expect(mainWords("expectation", { expectation: "A flat", reality: "A room" })).toBe("A flat vs A room");
    expect(mainWords("pov", { line: "You paid" })).toBe("POV: You paid");
    expect(mainWords("pov", {})).toBe("");
    expect(mainWords("post-reaction", { post: " Hi  there " })).toBe("Hi there");
  });

  it("shows Jev's best first, else the first kept option, and knows which option the words still are", () => {
    const options = [{ line: "a" }, { line: "b" }, { line: "c" }];
    expect(memeChoice({ options, best: 2, dropped: [] })).toBe(2);
    expect(memeChoice({ options, best: null, dropped: [] })).toBe(0);
    expect(memeChoice({ options, best: null, dropped: [0] })).toBe(1);
    expect(memeChoice({ options, best: 1, dropped: [1] })).toBe(0);
    expect(memeChoice({ options, best: null, dropped: [0, 1, 2] })).toBeNull();
    expect(optionIndex({ line: "b", caption: "x" }, options)).toBe(1);
    expect(optionIndex({ line: "b, typed" }, options)).toBeNull();
  });

  it("reads expectation's second picture only as a media key", () => {
    expect(secondPicture({ [SECOND_PICTURE]: "cimg-abc123" })).toBe("cimg-abc123");
    expect(secondPicture({ [SECOND_PICTURE]: "https://example.com/a.jpg" })).toBeUndefined();
    expect(secondPicture({})).toBeUndefined();
  });
});

describe("static ad formats (ff1111)", () => {
  const LONG = ["understandably", "neighbourhood", "considerately", "straightforward", "conversations", "comfortably"];
  /** Every field at its limit in long words, the worst a writer or a brand could type. */
  const longest = (layout: StaticLayoutId) =>
    Object.fromEntries(IMAGE_FIELDS[layout].map((f) => [f.key, f.unit === "chars" ? "x".repeat(f.max) : Array.from({ length: f.max }, (_, i) => LONG[i % LONG.length]).join(" ")]));
  const example = (layout: StaticLayoutId) => STATIC_FORMATS.find((f) => f.slug === layout)!.example!;
  const draw = (layout: StaticLayoutId, size: (typeof MEME_SIZES)[number], o: Partial<ImageInput> = {}) => layoutImage({ layout, words: example(layout), brand, ...o }, size, measure);

  /** No NaN anywhere, every word inside the side margins and the canvas, and on a story out of the top and bottom 250 px. */
  const inside = (drawn: ReturnType<typeof layoutImage>, size: (typeof MEME_SIZES)[number], at: string) => {
    const { width, height } = SIZE_INFO[size];
    expect(drawn, at).toMatchObject({ width, height });
    expect(renderSvg(drawn), at).not.toContain("NaN");
    for (const t of texts(drawn.nodes)) {
      const [left, right] = span(t);
      expect(left, `${at}: ${t.text}`).toBeGreaterThanOrEqual(96 - 0.5);
      expect(right, `${at}: ${t.text}`).toBeLessThanOrEqual(width - 96 + 0.5);
      const floor = size === "9x16" ? STORY_CLEAR : 0;
      expect(t.y - t.font.size, `${at}: ${t.text}`).toBeGreaterThanOrEqual(floor);
      expect(t.y, `${at}: ${t.text}`).toBeLessThanOrEqual(height - floor);
    }
    for (const i of images(drawn.nodes)) expect(i.x >= 0 && i.y >= 0 && i.x + i.width <= width && i.y + i.height <= height, `${at}: picture`).toBe(true);
  };

  it("keeps the writer's fields and limits, the links builder's list and the registry's ready flags in step", () => {
    expect([...STATIC_LAYOUTS]).toEqual([...STATIC_LAYOUT_IDS]);
    for (const l of STATIC_LAYOUT_IDS) {
      const written = IMAGE_FIELDS[l].filter((f) => !f.typed);
      expect(Object.fromEntries(written.map((f) => [f.key, f.max])), l).toEqual(STATIC_FIELDS[l]);
      expect(written.every((f) => f.unit === "words"), l).toBe(true);
      expect(IMAGE_FIELDS[l].every((f) => /^[a-zA-Z]{1,20}$/.test(f.key)), l).toBe(true);
      expect(sizesFor(l)).toEqual(["4x5", "1x1", "9x16"]);
    }
    expect(STATIC_FORMATS.filter((f) => f.ready).map((f) => f.slug).sort()).toEqual([...STATIC_LAYOUT_IDS].sort());
    expect(STATIC_FORMATS.filter((f) => isStatic(f.slug)).every((f) => f.ready)).toBe(true);
    expect(isStatic("headline") || isStatic("pov")).toBe(false);
  });

  it("gives every ready format an example within its fields' limits", () => {
    for (const l of STATIC_LAYOUT_IDS) {
      const words = example(l);
      const fields = IMAGE_FIELDS[l];
      expect(Object.keys(words).every((k) => fields.some((f) => f.key === k)), l).toBe(true);
      for (const f of fields) expect(countOf(words[f.key] ?? "", f.unit), `${l} ${f.key}`).toBeLessThanOrEqual(f.max);
      expect(imageBlock(l, words), l).toBeNull();
    }
  });

  // one test per format: all of them in one test drew 96 pictures and ran past 5 s under load (6.6 to 14 s, 12 Nov)
  for (const layout of STATIC_LAYOUT_IDS) {
    it(`draws ${layout}'s example at Square, Feed 4:5 and Story 9:16 with every word kept, with and without a photo`, () => {
      for (const size of MEME_SIZES) {
        for (const picture of [STATIC_EXAMPLE.picture, undefined]) {
          const at = `${layout} ${size} ${picture ? "photo" : "no photo"}`;
          const drawn = draw(layout, size, { picture });
          inside(drawn, size, at);
          expect(drawn.overflow, at).toBe(false);
          const all = texts(drawn.nodes);
          // a long handle on a flyer's tab may be cut; the words never are
          expect(all.some((t) => !t.rotate && t.text.endsWith("\u2026")), at).toBe(false);
          const shown = all.map((t) => t.text).join(" ").toLowerCase();
          for (const [k, v] of Object.entries(example(layout))) expect(shown, `${at}: ${k}`).toContain(v.split(" ")[0].toLowerCase());
        }
      }
    });
  }

  for (const layout of STATIC_LAYOUT_IDS) {
    it(`keeps ${layout}'s longest words inside the picture, cut with an ellipsis, and draws empty fields as nothing or a grey sample`, () => {
      for (const size of MEME_SIZES) {
        const long = layoutImage({ layout, words: longest(layout), brand, picture: PIC }, size, measure);
        inside(long, size, `${layout} ${size} long`);
        if (long.overflow) expect(texts(long.nodes).some((t) => t.text.endsWith("\u2026")), `${layout} ${size}`).toBe(true);
        const preview = layoutImage({ layout, words: {}, brand, samples: true }, size, measure);
        inside(preview, size, `${layout} ${size} preview`);
        const faded = texts(preview.nodes).filter((t) => t.opacity !== undefined && t.opacity < 1);
        expect(faded.length, `${layout} ${size} samples`).toBeGreaterThan(0);
        const blank = layoutImage({ layout, words: {}, brand }, size, measure);
        inside(blank, size, `${layout} ${size} blank`);
        const samples = IMAGE_FIELDS[layout].map((f) => f.sample);
        expect(texts(blank.nodes).filter((t) => samples.includes(t.text)), `${layout} ${size} blank`).toEqual([]);
      }
    });
  }

  it("draws in the brand's colour: your side of a text chat, the friend's avatar, the forum's first avatar", () => {
    const fills = (layout: StaticLayoutId) => draw(layout, "4x5").nodes.flatMap((n) => ("fill" in n && n.fill ? [n.fill] : []));
    for (const l of ["text-chat", "friend-recommends", "us-vs-them"] as const) expect(fills(l), l).toContain(brand.color);
    expect(fills("forum-thread")).toContain(brand.color);
    // a dark background turns the screen dark and its words light
    const dark = draw("ai-chat", "4x5", { paper: "dark" });
    expect(dark.nodes[0]).toMatchObject({ type: "rect", fill: "#0B0B0C" });
    expect(texts(dark.nodes).find((t) => t.text.startsWith("i need"))?.fill).toBe("#F5F5F7");
  });

  it("fills us vs them's panel with its rows when there is no photo, and never breaks a word to go bigger", () => {
    for (const size of MEME_SIZES) {
      const d = draw("us-vs-them", size);
      const rects = d.nodes.filter((n): n is Extract<SvgNode, { type: "rect" }> => n.type === "rect");
      const rows = rects.filter((r) => r.rx === 16);
      // the closing band is the last full-width dark block
      const band = rects.filter((r) => r.fill === "#111111" && r.width === d.width).at(-1)!;
      expect(rows, size).toHaveLength(6);
      expect(band.y - Math.max(...rows.map((r) => r.y + r.height)), size).toBeLessThanOrEqual(40);
      expect(Math.min(...rows.map((r) => r.height)), size).toBeGreaterThan(120);
    }
    // a long word steps the size down instead of splitting ("NEIGHBOURHOO / D")
    for (const size of MEME_SIZES) {
      const shown = texts(layoutImage({ layout: "news-headline", words: { headline: "Straightforwardly simple" }, brand }, size, measure).nodes).map((t) => t.text);
      expect(shown, size).toContain("STRAIGHTFORWARDLY");
    }
  });

  it("draws a forum thread's vote and reply controls with no counts", () => {
    for (const size of MEME_SIZES) {
      const shown = texts(draw("forum-thread", size).nodes).map((t) => t.text);
      expect(shown.filter((t) => /\d/.test(t)), size).toEqual(["12h", "8h"]);
      expect(shown, size).toEqual(expect.arrayContaining(["Reply", "Share"]));
    }
  });

  it("runs a whiteboard's four arrows in straight lines that pass no bubble", () => {
    for (const size of MEME_SIZES) {
      const paths = draw("whiteboard", size).nodes.filter((n): n is Extract<SvgNode, { type: "path" }> => n.type === "path" && n.stroke === "#1F2937");
      const bubbles = paths.filter((p) => p.d.endsWith("Z")).map((p) => {
        const [, mx, my, hx, r] = /^M([\d.]+) ([\d.]+)H([\d.]+)A([\d.]+)/.exec(p.d)!.map(Number);
        const v = Number(/V([\d.]+)A/.exec(p.d)![1]);
        return { left: mx - r, right: hx + r, top: my, bottom: v + r };
      });
      const arrows = paths.filter((p) => !p.d.endsWith("Z"));
      expect(bubbles, size).toHaveLength(4);
      expect(arrows, size).toHaveLength(1);
      expect(arrows[0].d, size).not.toMatch(/[QCSA]/);
      // every run, as a box, stays clear of every bubble
      let x = 0, y = 0, runs = 0;
      for (const [, c, a, b] of arrows[0].d.matchAll(/([MHVL])(-?[\d.]+)(?: (-?[\d.]+))?/g)) {
        const [nx, ny] = c === "H" ? [Number(a), y] : c === "V" ? [x, Number(a)] : [Number(a), Number(b)];
        if (c !== "M") {
          runs++;
          for (const g of bubbles) expect(Math.max(x, nx) < g.left || Math.min(x, nx) > g.right || Math.max(y, ny) < g.top || Math.min(y, ny) > g.bottom, `${size}: ${x},${y} to ${nx},${ny}`).toBe(true);
        }
        [x, y] = [nx, ny];
      }
      // four shafts (two of them with a turn) and four two-stroke heads
      expect(runs, size).toBe(14);
    }
  });

  it("names a static design by its main words, wants them before a download, and a photo only where the format needs one", () => {
    expect(mainWords("ai-chat", { question: "  where do i  start  ", lead: "x" })).toBe("where do i start");
    expect(mainWords("text-chat", { name: "Priya", one: "hi" })).toBe("hi");
    expect(imageBlock("news-headline", { badge: "Just in" })).toBe("Add the words first.");
    expect(imageBlock("news-headline", { headline: "A headline" })).toBeNull();
    expect(staticPhoto("ai-chat")).toBe("best");
    expect(staticPhoto("text-chat")).toBeNull();
    expect(staticPhoto("headline")).toBeNull();
    for (const l of STATIC_LAYOUT_IDS) expect(pictureBlock(l, 0), l).toBe(staticPhoto(l) === "needs" ? "Add a picture first." : null);
  });
});
