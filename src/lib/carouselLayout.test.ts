import { describe, expect, it } from "vitest";
import {
  CONTENT_WIDTH,
  FOOTER_RULE_Y,
  INK,
  PAD_X,
  PAPER,
  SLIDE_HEIGHT,
  SLIDE_WIDTH,
  contrastRatio,
  ellipsize,
  escapeXml,
  layoutSlide,
  readableOn,
  renderSvg,
  wrapText,
  type FontSpec,
  type Measure,
  type SvgNode,
} from "@/lib/carouselLayout";

type TextNode = Extract<SvgNode, { type: "text" }>;

// Roughly the average advance of Georgia and system sans.
const measure: Measure = (text, font) => Array.from(text).length * font.size * (font.family === "serif" ? 0.5 : 0.48);
const textNodes = (nodes: SvgNode[]) => nodes.filter((n): n is TextNode => n.type === "text");
const brand = { color: "#1E3A8A", name: "Jane Tan", handle: "janetan.finance" };

describe("wrapText", () => {
  const font: FontSpec = { family: "sans", weight: 400, size: 10 }; // 4.8px a character

  it("breaks between words and never exceeds the width", () => {
    const lines = wrapText("the quick brown fox jumps over the lazy dog", 48, font, measure);
    expect(lines).toEqual(["the quick", "brown fox", "jumps over", "the lazy", "dog"]);
    for (const line of lines) expect(measure(line, font)).toBeLessThanOrEqual(48);
  });

  it("keeps line breaks, drops blank lines and splits words wider than the line", () => {
    expect(wrapText("one\n\ntwo", 500, font, measure)).toEqual(["one", "two"]);
    expect(wrapText("abcdefghijklmnopqrstuvwxyz", 48, font, measure)).toEqual(["abcdefghij", "klmnopqrst", "uvwxyz"]);
    expect(wrapText("", 48, font, measure)).toEqual([]);
  });

  it("shortens a line with an ellipsis that fits", () => {
    expect(ellipsize("hello world", 30, font, measure)).toBe("hello…");
  });
});

describe("colour", () => {
  it("picks readable text for the brand colour", () => {
    expect(contrastRatio("#FFFFFF", "#000000")).toBeCloseTo(21, 0);
    expect(readableOn("#1E3A8A")).toBe("#FFFFFF");
    expect(readableOn("#FDE68A")).toBe(INK);
  });
});

describe("layoutSlide", () => {
  const withinSlide = (texts: TextNode[]) => {
    for (const t of texts) {
      expect(t.y).toBeGreaterThan(0);
      expect(t.y).toBeLessThan(SLIDE_HEIGHT);
      if (t.anchor !== "end") expect(t.x + measure(t.text, t.font)).toBeLessThanOrEqual(PAD_X + CONTENT_WIDTH);
    }
  };

  it("lays out a point slide: brand bar, title, wrapped body and footer", () => {
    const layout = layoutSlide(
      { title: "Know your number", body: "Work out what six months of expenses looks like for you.", index: 2, total: 8, brand },
      measure,
    );
    expect(layout).toMatchObject({ role: "point", background: PAPER, overflow: false, width: 1080, height: 1350 });
    expect(layout.nodes).toContainEqual({ type: "rect", x: 0, y: 0, width: SLIDE_WIDTH, height: 24, fill: brand.color });

    const texts = textNodes(layout.nodes);
    withinSlide(texts);
    expect(texts.find((t) => t.anchor === "end")).toMatchObject({ text: "3/8", x: SLIDE_WIDTH - PAD_X });
    expect(texts.map((t) => t.text)).toEqual(expect.arrayContaining(["Jane Tan", "@janetan.finance"]));

    const content = texts.filter((t) => t.y < FOOTER_RULE_Y);
    expect(content.map((t) => t.text).join(" ")).toBe(
      "Know your number Work out what six months of expenses looks like for you.",
    );
    expect(content[0].font).toEqual({ family: "serif", weight: 600, size: 80 });
    expect(content[1].font.family).toBe("sans");
    content.slice(1).forEach((t, i) => expect(t.y).toBeGreaterThan(content[i].y));
  });

  it("fits the longest slide the splitter makes (12-word title, 40-word body) without cutting it", () => {
    const words = ["policy", "premium", "cover", "savings", "family"];
    const body = Array.from({ length: 40 }, (_, i) => words[i % 5]).join(" ");
    const layout = layoutSlide(
      { title: "Review your cover every two years or after a big life event", body, index: 1, total: 10, brand },
      measure,
    );
    expect(layout.overflow).toBe(false);
    const content = textNodes(layout.nodes).filter((t) => t.y < FOOTER_RULE_Y);
    expect(content.map((t) => t.text).join(" ")).toBe(`Review your cover every two years or after a big life event ${body}`);
  });

  it("puts the cover on the brand colour with readable text and a swipe cue", () => {
    const hook = "Most people in their thirties think they are covered until the hospital bill arrives and the rider is missing";
    const cover = layoutSlide({ title: hook, body: "", index: 0, total: 6, brand }, measure);
    expect(cover).toMatchObject({ role: "cover", background: brand.color, overflow: false });
    const texts = textNodes(cover.nodes);
    withinSlide(texts);
    expect(texts[0].fill).toBe("#FFFFFF");
    expect(texts.some((t) => t.text === "Swipe →")).toBe(true);
    expect(texts.find((t) => t.anchor === "end")?.text).toBe("1/6");

    const pale = layoutSlide({ title: "Hello", body: "", index: 0, total: 6, brand: { ...brand, color: "#FDE68A" } }, measure);
    expect(textNodes(pale.nodes)[0].fill).toBe(INK);
  });

  it("cuts text that can't fit with an ellipsis and says so", () => {
    const layout = layoutSlide({ title: "Title", body: "word ".repeat(400), index: 3, total: 5, brand }, measure);
    expect(layout.overflow).toBe(true);
    const content = textNodes(layout.nodes).filter((t) => t.y < FOOTER_RULE_Y);
    expect(content[content.length - 1].text.endsWith("…")).toBe(true);
    withinSlide(content);
  });

  it("shortens a long name and leaves the footer empty apart from the number when there's no brand text", () => {
    const long = layoutSlide({ title: "T", body: "", index: 1, total: 3, brand: { ...brand, name: "A".repeat(200) } }, measure);
    const name = textNodes(long.nodes).find((t) => t.text.startsWith("AAA"));
    expect(name?.text.endsWith("…")).toBe(true);
    withinSlide(textNodes(long.nodes));

    const bare = layoutSlide({ title: "T", body: "", index: 1, total: 3, brand: { ...brand, name: "", handle: "" } }, measure);
    expect(textNodes(bare.nodes).filter((t) => t.y > FOOTER_RULE_Y).map((t) => t.text)).toEqual(["2/3"]);
  });
});

describe("brand kit photo", () => {
  const PHOTO = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";

  it("puts the headshot left of the name and moves the name over", () => {
    const layout = layoutSlide({ title: "T", body: "", index: 1, total: 3, brand: { ...brand, photo: PHOTO } }, measure);
    const img = layout.nodes.find((n) => n.type === "image");
    expect(img).toMatchObject({ type: "image", x: PAD_X, href: PHOTO });
    expect(img && img.type === "image" && img.shape === "circle" && img.y > FOOTER_RULE_Y && img.y + img.height < SLIDE_HEIGHT).toBe(true);
    expect(textNodes(layout.nodes).find((t) => t.text === "Jane Tan")?.x).toBe(PAD_X + 88 + 24);
    const svg = renderSvg(layout);
    expect(svg).toContain(`<image href="${PHOTO}"`);
    expect(svg).toMatch(/<clipPath id="c\d+"><circle /);
  });

  it("ignores a photo that isn't an image data URL", () => {
    const layout = layoutSlide({ title: "T", body: "", index: 1, total: 3, brand: { ...brand, photo: 'https://x.test/a.png"/><script>' } }, measure);
    expect(layout.nodes.some((n) => n.type === "image")).toBe(false);
    expect(textNodes(layout.nodes).find((t) => t.text === "Jane Tan")?.x).toBe(PAD_X);
  });
});

describe("slide picture, alignment and size", () => {
  const PIC = "data:image/jpeg;base64,/9j/4AAQ";

  it("puts a picture above the text and keeps the text clear of it", () => {
    const layout = layoutSlide({ title: "A title", body: "Some body text here.", index: 1, total: 3, brand, image: PIC }, measure);
    const img = layout.nodes.find((n) => n.type === "image" && n.shape === "rounded");
    expect(img).toMatchObject({ x: PAD_X, width: CONTENT_WIDTH, href: PIC });
    const below = img && img.type === "image" ? img.y + img.height : 0;
    const content = textNodes(layout.nodes).filter((t) => t.y < FOOTER_RULE_Y);
    for (const t of content) expect(t.y - t.font.size).toBeGreaterThan(below);
    expect(renderSvg(layout)).toMatch(/<rect x="\d+" y="\d+" width="\d+" height="\d+" rx="28"\/><\/clipPath><image /);
  });

  it("centres the text when asked", () => {
    const layout = layoutSlide({ title: "A title", body: "Body", index: 1, total: 3, brand, align: "center" }, measure);
    const content = textNodes(layout.nodes).filter((t) => t.y < FOOTER_RULE_Y);
    for (const t of content) expect(t).toMatchObject({ x: SLIDE_WIDTH / 2, anchor: "middle" });
    expect(renderSvg(layout)).toContain('text-anchor="middle"');
  });

  it("sets the text larger or smaller with the size, within limits", () => {
    const size = (scale: number) => textNodes(layoutSlide({ title: "Hi", body: "", index: 1, total: 3, brand, scale }, measure).nodes)[0].font.size;
    expect(size(1.2)).toBeGreaterThan(size(1));
    expect(size(0.8)).toBeLessThan(size(1));
    expect(size(9)).toBe(size(1.25));
  });
});

describe("slide looks", () => {
  it("keeps body and footer text readable on every background, for any brand colour", async () => {
    const { paperColors } = await import("@/lib/carouselLayout");
    for (const paper of ["light", "dark", "tint"] as const) {
      for (const color of ["#1E3A8A", "#B91C1C", "#0F766E", "#FDE047", "#27272A"]) {
        const c = paperColors(paper, color);
        expect(contrastRatio(c.ink, c.bg)).toBeGreaterThanOrEqual(7);
        expect(contrastRatio(c.body, c.bg)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(c.muted, c.bg)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("draws a dark point slide in light text and switches the font pairing", () => {
    const dark = layoutSlide({ title: "Title", body: "Body", index: 1, total: 3, brand, paper: "dark" }, measure);
    expect(dark.background).toBe("#18181B");
    expect(textNodes(dark.nodes).find((t) => t.text === "Title")?.fill).toBe("#FAFAFA");
    const modern = layoutSlide({ title: "Title", body: "Body", index: 1, total: 3, brand, font: "modern" }, measure);
    expect(textNodes(modern.nodes).find((t) => t.text === "Title")?.font.family).toBe("sans");
    const editorial = layoutSlide({ title: "Title", body: "Body", index: 1, total: 3, brand, font: "serif" }, measure);
    expect(textNodes(editorial.nodes).find((t) => t.text === "Body")?.font.family).toBe("serif");
    // cover and closing slides stay on the brand colour whatever the background
    expect(layoutSlide({ title: "Hook", body: "", index: 0, total: 3, brand, paper: "dark" }, measure).background).toBe(brand.color);
  });
});

describe("renderSvg", () => {
  it("writes a 1080x1350 SVG with escaped text", () => {
    const layout = layoutSlide({ title: 'Fees <5% & "fair"', body: "", index: 1, total: 3, brand }, measure);
    const svg = renderSvg(layout);
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350">')).toBe(true);
    expect(svg.endsWith("</svg>")).toBe(true);
    expect(svg).toContain("Fees &lt;5% &amp; &quot;fair&quot;");
    expect(svg.match(/<text /g)?.length).toBe(textNodes(layout.nodes).length);
    expect(escapeXml("a\u0000b'")).toBe("ab&apos;");
  });
});
