import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { CAROUSEL_DESIGNS, type CarouselDesign } from "@/lib/links";
import {
  CONTENT_WIDTH,
  checklistItems,
  FOOTER_RULE_Y,
  INK,
  PAD_X,
  PAPER,
  SLIDE_HEIGHT,
  SLIDE_WIDTH,
  contrastRatio,
  ellipsize,
  escapeXml,
  fontCss,
  layoutSlide,
  readableOn,
  renderSvg,
  wrapText,
  type FontSpec,
  type Measure,
  type SvgNode,
  paperColors,
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

describe("wrapText on Latin text (pinned at b65fc14f, before Chinese wraps)", () => {
  const texts = [
    "Most people think their hospital plan covers everything. It doesn't, and the gap shows up at the worst time.",
    "Review your cover every two years\nor after a big life event.\n\n  Check the riders too!  ",
    "Ramai orang fikir pelan hospital mereka menanggung semuanya. Semak semula setiap dua tahun.",
    "A supercalifragilisticexpialidocious word, https://example.com/a/very/long/link/that/never/ends and $1,200.50 (about 3%) - done.",
    "",
    "one\n\ntwo",
  ];

  it("wraps and shortens every text, width and font the same way as before", () => {
    const out: string[] = [];
    const seen: FontSpec[] = [];
    const spy: Measure = (t, f) => (seen.push(f), measure(t, f));
    for (const text of texts) {
      for (const width of [48, 120, 300, 888]) {
        for (const font of [{ family: "sans", weight: 400, size: 10 }, { family: "serif", weight: 600, size: 32 }] as FontSpec[]) {
          const lines = wrapText(text, width, font, spy);
          out.push(JSON.stringify(lines), ...lines.map((l) => ellipsize(l, width / 2, font, spy)));
        }
      }
    }
    expect(createHash("sha256").update(out.join("\n")).digest("hex")).toBe("65643da2c979acde8651b4655efdd23e130e1fa7314499c68c2d90b1e26641b6");
    // measured with the very font it was given, nothing added
    expect(seen.every((f) => Object.keys(f).join() === "family,weight,size")).toBe(true);
  });
  it("measures Latin text with today's font stacks", () => {
    expect(fontCss({ family: "sans", weight: 400, size: 10 })).toBe("400 10px system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif");
    expect(fontCss({ family: "serif", weight: 600, size: 64 })).toBe("600 64px Georgia, 'Times New Roman', Times, serif");
  });
});

describe("wrapText on Chinese and Tamil (edit-translate)", () => {
  const font: FontSpec = { family: "sans", weight: 400, size: 10 }; // 4.8px a character
  const CLOSING = [..."，。！？、：；」）"];
  const zh = "大多数人以为住院保险什么都保，其实不然。共付额、免赔额和附加保险，每两年要检查一次！「你检查过了吗？」（很重要）";

  it("breaks a Chinese paragraph between characters, within the width, and never starts a line with closing punctuation", () => {
    for (let chars = 3; chars <= 40; chars++) {
      const lines = wrapText(zh, chars * 4.8, font, measure);
      expect(lines.join("")).toBe(zh);
      for (const line of lines) {
        expect(measure(line, font)).toBeLessThanOrEqual(chars * 4.8);
        expect(CLOSING).not.toContain(line[0]);
        expect(line.endsWith("「") || line.endsWith("（")).toBe(false);
      }
    }
    expect(wrapText(zh, 10 * 4.8, font, measure)[0]).toBe("大多数人以为住院保险");
  });

  it("keeps Latin words and numbers whole inside Chinese, breaking them at spaces", () => {
    const mixed = "我的CPF账户 has 3 accounts，记得 check 一下。";
    for (let chars = 10; chars <= 30; chars++) {
      const lines = wrapText(mixed, chars * 4.8, font, measure);
      expect(lines.join(" ").replace(/\s+/g, "")).toBe(mixed.replace(/\s+/g, ""));
      for (const word of ["CPF", "has", "accounts，", "check"]) expect(lines.some((l) => l.includes(word))).toBe(true);
      for (const line of lines) expect(CLOSING).not.toContain(line[0]);
    }
  });

  it("drops a space typed before Chinese closing punctuation, so it can't start a line", () => {
    for (let chars = 3; chars <= 12; chars++) {
      for (const line of wrapText("你好 ，世界 。再见", chars * 4.8, font, measure)) expect(CLOSING).not.toContain(line[0]);
    }
    expect(wrapText("你好 ，世界", 500, font, measure)).toEqual(["你好，世界"]);
  });

  it("still breaks Tamil and Malay at spaces", () => {
    expect(wrapText("உங்கள் காப்பீட்டை சரிபாருங்கள்", 12 * 4.8, font, measure)).toEqual(["உங்கள்", "காப்பீட்டை", "சரிபாருங்கள்"]);
    expect(wrapText("Semak pelan anda", 6 * 4.8, font, measure)).toEqual(["Semak", "pelan", "anda"]);
  });

  it("measures Chinese and Tamil in their fonts and Latin in today's", () => {
    const seen: [string, FontSpec][] = [];
    const spy: Measure = (t, f) => (seen.push([t, f]), measure(t, f));
    wrapText("你好世界", 500, font, spy);
    wrapText("உங்கள்", 500, font, spy);
    wrapText("Hello there", 500, font, spy);
    expect(seen.map(([t, f]) => [t, !!f.scripts])).toEqual([["你", true], ["你好", true], ["你好世", true], ["你好世界", true], ["உங்கள்", true], ["Hello", false], ["Hello there", false]]);
    expect(fontCss({ ...font, scripts: true })).toBe(
      "400 10px system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'PingFang SC', 'Noto Sans SC', 'Microsoft YaHei', 'Tamil Sangam MN', 'Noto Sans Tamil', Latha, sans-serif",
    );
    expect(fontCss({ family: "serif", weight: 600, size: 64, scripts: true })).toBe(
      "600 64px Georgia, 'Times New Roman', Times, 'PingFang SC', 'Noto Sans SC', 'Microsoft YaHei', 'Tamil Sangam MN', 'Noto Sans Tamil', Latha, serif",
    );
  });

  it("drops Chinese punctuation before a shortened line's ellipsis", () => {
    expect(ellipsize("你好，", 500, font, measure)).toBe("你好…");
  });

  it("draws Chinese text in its fonts and the Latin name row as today", () => {
    const svg = renderSvg(layoutSlide({ title: "住院要付两次钱", body: "共付额，每两年检查一次。", index: 1, total: 3, brand }, measure));
    const families = [...svg.matchAll(/font-family="([^"]+)"[^>]*>([^<]*)<\/text>/g)].map((m) => [m[2], m[1].includes("PingFang SC")]);
    expect(families).toContainEqual(["住院要付两次钱", true]);
    expect(families).toContainEqual(["共付额，每两年检查一次。", true]);
    expect(families).toContainEqual(["Jane Tan", false]);
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

describe("today's carousels, after the image page's additions", () => {
  const PHOTO = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";
  const kit = { ...brand, photo: PHOTO };

  it("draw byte for byte as they did before (sha256 of the SVGs, taken at 0bf81d9)", () => {
    const slides = [
      layoutSlide({ title: "Most people think they are covered", body: "", index: 0, total: 4, brand: kit }, measure),
      layoutSlide({ title: "Know your number", body: 'Six months of expenses <5% & "fair"', index: 1, total: 4, brand: kit, image: PHOTO, align: "center", scale: 1.1, font: "modern", paper: "dark" }, measure),
      layoutSlide({ title: "", body: "word ".repeat(300), index: 2, total: 4, brand: brand, font: "serif", paper: "tint" }, measure),
      layoutSlide({ title: "Message me", body: "Book a call", index: 3, total: 4, brand: kit }, measure),
    ];
    const svg = slides.map(renderSvg).join("\n");
    expect(createHash("sha256").update(svg).digest("hex")).toBe("aa4d55a184288ce2c6ff9bf243052f002166ca1f86fe89efc633c83874427506");
    expect(svg).not.toContain("stroke");
    expect(svg).not.toContain("meet");
  });

  it("outlines a text node only when it carries a stroke", () => {
    const text = (extra: Partial<TextNode>) =>
      renderSvg({ width: 100, height: 100, nodes: [{ type: "text", x: 1, y: 2, text: "Hi", font: { family: "sans", weight: 600, size: 20 }, fill: "#FFFFFF", ...extra }] });
    expect(text({})).not.toContain("stroke");
    expect(text({ stroke: "#000000", strokeWidth: 8 })).toContain('fill="#FFFFFF" stroke="#000000" stroke-width="8" stroke-linejoin="round" paint-order="stroke">Hi</text>');
  });

  it("clips a square picture with a plain rect, and keeps a logo whole with no clip", () => {
    const pic = (shape: "square" | "rounded", fit?: "contain") =>
      renderSvg({ width: 100, height: 100, nodes: [{ type: "image", x: 0, y: 0, width: 100, height: 60, href: PHOTO, shape, ...(fit ? { fit } : {}) }] });
    expect(pic("square")).toContain('<clipPath id="c0"><rect x="0" y="0" width="100" height="60"/></clipPath>');
    expect(pic("rounded")).toContain('height="60" rx="28"/>');
    expect(pic("square", "contain")).toBe(
      `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><image href="${PHOTO}" x="0" y="0" width="100" height="60" preserveAspectRatio="xMaxYMid meet"/></svg>`,
    );
  });
});

describe("today's carousels, before designs and sizes (pinned at 7e8f1493)", () => {
  const PHOTO = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";
  const PIC = "data:image/png;base64,iVBORw0KGgo=";
  const long = "Review your cover every two years or after a big life event, and check the riders too. ".repeat(3);

  it("lays out every role, look, alignment, size, picture and brand the same way as before", () => {
    const out: string[] = [];
    for (const b of [brand, { ...brand, photo: PHOTO }, { ...brand, color: "#FDE68A", name: "", handle: "" }]) {
      for (const paper of [undefined, "light", "dark", "tint"] as const) {
        for (const font of [undefined, "classic", "modern", "serif"] as const) {
          for (const [title, body] of [["Know your number", "Six months of expenses."], ["", long], ["A title", ""], ["Title", "word ".repeat(400)]]) {
            for (const index of [0, 1, 4]) {
              for (const extra of [{}, { align: "center" as const, scale: 1.15 }, { image: PIC, scale: 0.85 }]) {
                const layout = layoutSlide({ title, body, index, total: 5, brand: b, paper, font, ...extra }, measure);
                out.push(JSON.stringify(layout), renderSvg(layout));
              }
            }
          }
        }
      }
    }
    expect(out.length).toBe(2 * 3 * 4 * 4 * 4 * 3 * 3);
    expect(createHash("sha256").update(out.join("\n")).digest("hex")).toBe("38872daf1170af64b4255f0a5843db8bb7e7a7678f1b623ed6bbd7981f942589");
  });
});

describe("designs and sizes", () => {
  const PHOTO = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";
  const PIC = "data:image/png;base64,iVBORw0KGgo=";
  const kit = { ...brand, photo: PHOTO };
  // a 6-slide carousel at the splitter's limits: a 6-word hook, 12-word titles and 40-word bodies
  const forty = "Check the ward class, the co-pay and the rider before you renew, because a plan that looked cheap at thirty can leave a gap at forty when the bill arrives and the rider you dropped was the one you needed.";
  const six = [
    { title: "Your hospital plan has a gap", body: "" },
    { title: "Check the ward class you actually want to stay in", body: forty },
    { title: "Know your co-pay", body: "Most plans ask you to pay part of the bill.\nFind the number.\nWrite it down." },
    { title: "", body: forty },
    { title: "Review it every two years or after a big life event", body: forty },
    { title: "Found this useful?", body: "Save it for later and share it with someone who needs it." },
  ];
  const slidesOf = (design: CarouselDesign, size: "4x5" | "1x1" | "9x16", extra: Partial<Parameters<typeof layoutSlide>[0]> = {}) =>
    six.map((s, index) => layoutSlide({ ...s, index, total: six.length, brand: kit, design, size, ...extra }, measure));
  const HEIGHTS = { "4x5": 1350, "1x1": 1080, "9x16": 1920 };

  it("draws all eight designs at 4:5, 1:1 and 9:16 with every line inside the slide and in reading order", () => {
    for (const design of CAROUSEL_DESIGNS) {
      for (const size of ["4x5", "1x1", "9x16"] as const) {
        const layouts = slidesOf(design, size, { image: PIC });
        layouts.forEach((layout, i) => {
          const where = `${design} ${size} slide ${i + 1}`;
          expect(layout.height, where).toBe(HEIGHTS[size]);
          expect(layout.width, where).toBe(1080);
          const texts = textNodes(layout.nodes);
          for (const t of texts) {
            const w = measure(t.text, t.font);
            const left = t.anchor === "end" ? t.x - w : t.anchor === "middle" ? t.x - w / 2 : t.x;
            expect(left, where).toBeGreaterThanOrEqual(PAD_X);
            expect(left + w, where).toBeLessThanOrEqual(PAD_X + CONTENT_WIDTH + 0.5);
            expect(t.y - t.font.size, where).toBeGreaterThanOrEqual(0);
            expect(t.y, where).toBeLessThanOrEqual(layout.height);
          }
          // the lines of the title and text never overlap: each sits below the one before it
          const words = texts.filter((t) => t.font.size < 100 && t.text !== "✓" && t.text !== "Swipe →" && !/^\d+\/\d+$/.test(t.text) && t.text !== "Jane Tan" && t.text !== "@janetan.finance");
          words.slice(1).forEach((t, k) => expect(t.y - t.font.size * 0.8, where).toBeGreaterThanOrEqual(words[k].y - 1));
        });
      }
    }
  });

  it("fits the 6-slide carousel without cutting it at 4:5 and 9:16, in every design", () => {
    for (const design of CAROUSEL_DESIGNS) {
      for (const size of ["4x5", "9x16"] as const) {
        expect(slidesOf(design, size).map((l) => l.overflow), `${design} ${size}`).toEqual([false, false, false, false, false, false]);
      }
    }
  });

  it("keeps every line of a 9:16 slide out of the top and bottom 250 px", () => {
    for (const design of CAROUSEL_DESIGNS) {
      for (const layout of [...slidesOf(design, "9x16"), ...slidesOf(design, "9x16", { image: PIC, align: "center", scale: 1.25 })]) {
        for (const t of textNodes(layout.nodes)) {
          expect(t.y - t.font.size, `${design} ${t.text}`).toBeGreaterThanOrEqual(250);
          expect(t.y, `${design} ${t.text}`).toBeLessThanOrEqual(1920 - 250);
        }
      }
    }
  });

  it("draws clean at 4:5 exactly as a slide with no design or size", () => {
    six.forEach((s, index) => {
      const plain = layoutSlide({ ...s, index, total: 6, brand: kit, image: PIC }, measure);
      expect(layoutSlide({ ...s, index, total: 6, brand: kit, image: PIC, design: "clean", size: "4x5" }, measure)).toEqual(plain);
      // an unknown design or size reads as clean at 4:5
      expect(layoutSlide({ ...s, index, total: 6, brand: kit, image: PIC, design: "comic" as CarouselDesign, size: "2x3" as "4x5" }, measure)).toEqual(plain);
    });
  });

  it("Bold cover sets the hook larger, readable on the brand colour; its point slides are today's", () => {
    const [bold, boldPoint] = slidesOf("bold", "4x5");
    const [clean, cleanPoint] = slidesOf("clean", "4x5");
    expect(textNodes(bold.nodes)[0].font.size).toBeGreaterThan(textNodes(clean.nodes)[0].font.size);
    expect(textNodes(bold.nodes)[0].fill).toBe("#FFFFFF");
    expect(bold.background).toBe(brand.color);
    expect(boldPoint).toEqual(cleanPoint);
    // the cover is the brand colour alone, even with a slide picture
    const [boldPic] = slidesOf("bold", "4x5", { image: PIC });
    expect(boldPic.nodes.some((n) => n.type === "image" && n.shape === "rounded")).toBe(false);
    expect(textNodes(boldPic.nodes)[0].font.size).toBeGreaterThanOrEqual(120);
  });

  it("Numbered puts 01, 02 in the brand colour above each point's title, in place of the accent bar", () => {
    const layouts = slidesOf("numbered", "4x5");
    expect(textNodes(layouts[1].nodes)[0]).toMatchObject({ text: "01", fill: brand.color, font: { size: 128 } });
    expect(textNodes(layouts[4].nodes)[0].text).toBe("04");
    expect(layouts[1].nodes.some((n) => n.type === "rect" && n.width === 96 && n.height === 10)).toBe(false);
    // the cover and the call to action keep today's
    expect(textNodes(layouts[0].nodes).some((t) => /^\d\d$/.test(t.text))).toBe(false);
  });

  it("Checklist starts each line of the text with a ticked box, the text set right of it", () => {
    const point = slidesOf("checklist", "4x5")[2];
    const ticks = textNodes(point.nodes).filter((t) => t.text === "✓");
    expect(ticks).toHaveLength(3);
    const boxes = point.nodes.filter((n) => n.type === "rect" && n.rx);
    expect(boxes).toHaveLength(3);
    const lines = textNodes(point.nodes).filter((t) => /^(Most plans|Find the number|Write it down)/.test(t.text));
    expect(lines).toHaveLength(3);
    // each item's first line sits beside its box, right of it
    lines.forEach((l, k) => {
      expect(l.x).toBeGreaterThan(PAD_X + 30);
      expect(Math.abs(ticks[k].y - l.y)).toBeLessThan(l.font.size);
    });
    expect(checklistItems("One. Two! Three?")).toEqual(["One.", "Two!", "Three?"]);
    expect(checklistItems("• a\n- b\n✓ c")).toEqual(["a", "b", "c"]);
    expect(checklistItems("")).toEqual([]);
  });

  it("Post card draws each point as a rounded card on the brand colour, the name row at its top and the number under it", () => {
    const point = slidesOf("post-card", "4x5")[1];
    expect(point.background).toBe(brand.color);
    const cardRect = point.nodes.find((n) => n.type === "rect" && n.rx === 40);
    expect(cardRect).toMatchObject({ x: 48, width: 984, fill: PAPER });
    const texts = textNodes(point.nodes);
    const name = texts.find((t) => t.text === "Jane Tan")!;
    const titleLine = texts.find((t) => t.text.startsWith("Check the"))!;
    expect(name.y).toBeLessThan(titleLine.y);
    expect(point.nodes.find((n) => n.type === "image" && n.shape === "circle")).toMatchObject({ x: PAD_X });
    expect(texts.find((t) => t.anchor === "end")).toMatchObject({ text: "2/6", fill: "#FFFFFF" });
    // no footer rule and no second name row
    expect(texts.filter((t) => t.text === "Jane Tan")).toHaveLength(1);
    expect(point.nodes.some((n) => n.type === "rect" && n.height === 2)).toBe(false);
  });

  it("Photo cover puts the cover's picture full bleed under a dark fade with the hook in white; with no picture it is today's cover", () => {
    const withPic = layoutSlide({ ...six[0], index: 0, total: 6, brand: { ...brand, color: "#FDE68A" }, image: PIC, design: "photo-cover" }, measure);
    expect(withPic.nodes[1]).toEqual({ type: "image", x: 0, y: 0, width: 1080, height: 1350, href: PIC, shape: "square" });
    expect(withPic.nodes[2]).toMatchObject({ type: "fade", color: "#000000", opacity: 0.85 });
    for (const t of textNodes(withPic.nodes)) expect(t.fill).toBe("#FFFFFF");
    const svg = renderSvg(withPic);
    expect(svg).toContain('<linearGradient id="g2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000000" stop-opacity="0"/><stop offset="1" stop-color="#000000" stop-opacity="0.85"/></linearGradient>');
    expect(svg).toContain('fill="url(#g2)"/>');
    const noPic = layoutSlide({ ...six[0], index: 0, total: 6, brand: kit, design: "photo-cover" }, measure);
    expect(noPic).toEqual(layoutSlide({ ...six[0], index: 0, total: 6, brand: kit }, measure));
    // its point slides keep a slide picture above the text as today
    expect(slidesOf("photo-cover", "4x5", { image: PIC })[1].nodes.some((n) => n.type === "image" && n.shape === "rounded")).toBe(true);
  });

  it("Quote sets a large quote mark in the brand colour above the title", () => {
    const point = slidesOf("quote", "4x5")[1];
    expect(textNodes(point.nodes)[0]).toMatchObject({ text: "“", fill: brand.color, font: { family: "serif", size: 240 } });
  });

  it("Notebook draws a margin line in the brand colour and faint rules behind the text, down the page", () => {
    const point = slidesOf("notebook", "4x5")[1];
    expect(point.nodes).toContainEqual({ type: "rect", x: 56, y: 24, width: 3, height: 1326, fill: brand.color });
    const rules = point.nodes.filter((n) => n.type === "rect" && n.height === 2 && n.width === 1080);
    expect(rules.length).toBeGreaterThan(5);
    const firstText = point.nodes.findIndex((n) => n.type === "text");
    expect(point.nodes.indexOf(rules[rules.length - 1])).toBeLessThan(firstText);
    for (const r of rules) expect(r.type === "rect" && r.y < FOOTER_RULE_Y - 64).toBe(true);
  });

  it("writes a card's rounded corner only when it has one", () => {
    expect(renderSvg({ width: 10, height: 10, nodes: [{ type: "rect", x: 0, y: 0, width: 5, height: 5, fill: "#FFFFFF", rx: 8 }] })).toContain('<rect x="0" y="0" width="5" height="5" rx="8" fill="#FFFFFF"/>');
    expect(renderSvg({ width: 10, height: 10, nodes: [{ type: "rect", x: 0, y: 0, width: 5, height: 5, fill: "#FFFFFF" }] })).not.toContain("rx");
  });
});

describe("today's carousels in every design, before the brand kit's second colour and signer (pinned at 7cd872f4)", () => {
  const PHOTO = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";
  const PIC = "data:image/png;base64,iVBORw0KGgo=";

  it("draws every design, size, role, paper and brand the same way as before", () => {
    const out: string[] = [];
    for (const b of [brand, { ...brand, photo: PHOTO, role: "Adviser" }, { ...brand, color: "#FDE68A", name: "", handle: "" }]) {
      for (const design of CAROUSEL_DESIGNS) {
        for (const size of ["4x5", "1x1", "9x16"] as const) {
          for (const paper of [undefined, "dark", "tint"] as const) {
            for (const index of [0, 1, 2, 4]) {
              const body = index === 2 ? "One.\nTwo.\nThree." : "Six months of expenses, kept where you can reach them.";
              const layout = layoutSlide({ title: "Know your number", body, index, total: 5, brand: b, paper, design, size, image: index === 1 ? PIC : undefined }, measure);
              out.push(JSON.stringify(layout), renderSvg(layout));
            }
          }
        }
      }
    }
    expect(out.length).toBe(2 * 3 * CAROUSEL_DESIGNS.length * 3 * 3 * 4);
    expect(createHash("sha256").update(out.join("\n")).digest("hex")).toBe("d077aba6d973ea5acafe251e411a7db6d6dcd052b4f56037f47a517756fb4c6a");
  });
});

describe("the brand kit's second colour and signer (brand-kit)", () => {
  const PHOTO = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";
  const SARAH = "data:image/jpeg;base64,/9j/U2FyYWg=";
  const kit = { ...brand, photo: PHOTO, palette: [{ name: "Rust", hex: "#B7410E" }], people: [{ id: "p1", name: "Sarah Lim", role: "Adviser", photo: SARAH }] };
  const slide = (index: number, extra: Partial<Parameters<typeof layoutSlide>[0]> = {}) =>
    layoutSlide({ title: "Know your number", body: "Six months of expenses.", index, total: 5, brand: kit, ...extra }, measure);
  const accentBar = (l: ReturnType<typeof layoutSlide>) => l.nodes.find((n) => n.type === "rect" && n.width === 96 && n.height === 10);

  it("puts the second colour on the accent and the CTA slide, and keeps the main colour on the cover and the top bar", () => {
    expect(accentBar(slide(1))).toMatchObject({ fill: "#B7410E" });
    expect(slide(4).background).toBe("#B7410E");
    expect(slide(0).background).toBe("#1E3A8A");
    expect(slide(1).nodes[1]).toMatchObject({ type: "rect", height: 24, fill: "#1E3A8A" });
    expect(textNodes(slide(4).nodes).every((t) => t.fill === readableOn("#B7410E"))).toBe(true);
  });

  it("uses the main colour on the accent and the CTA slide when there is no second colour", () => {
    const plain = { ...kit, palette: undefined };
    expect(accentBar(layoutSlide({ title: "T", body: "B", index: 1, total: 5, brand: plain }, measure))).toMatchObject({ fill: "#1E3A8A" });
    expect(layoutSlide({ title: "T", body: "B", index: 4, total: 5, brand: plain }, measure).background).toBe("#1E3A8A");
  });

  it("draws the signer's photo and name in the footer and on a post card, with the brand's handle when they have none", () => {
    for (const layout of [slide(1, { signer: "p1" }), slide(1, { signer: "p1", design: "post-card" })]) {
      const texts = textNodes(layout.nodes).map((t) => t.text);
      expect(texts).toContain("Sarah Lim");
      expect(texts).toContain("@janetan.finance");
      expect(texts).not.toContain("Jane Tan");
      expect(layout.nodes.find((n) => n.type === "image" && n.shape === "circle")).toMatchObject({ href: SARAH });
    }
    const own = slide(1, { signer: "gone" });
    expect(textNodes(own.nodes).map((t) => t.text)).toContain("Jane Tan");
    expect(own.nodes.find((n) => n.type === "image" && n.shape === "circle")).toMatchObject({ href: PHOTO });
    expect(JSON.stringify(own)).toBe(JSON.stringify(slide(1)));
  });
});
