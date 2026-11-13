import { describe, expect, it } from "vitest";
import { colourGap, icoPng, logoPicks, logoWindow, lookColours, lookFonts, parseColour, stylesheetLinks, svgDataUrl, svgFile, TWIN_GAP } from "./look.ts";

const base = new URL("https://acme.sg/");
const unpack = (url: string | null) => (url ? new TextDecoder().decode(Uint8Array.from(atob(url.split(",")[1]), (c) => c.charCodeAt(0))) : "");
const busyPage = (body: string) => `<div class="${Array.from({ length: 40 }, (_, i) => `c${i}`).join(" ")}">${body}</div>`;
const picked = (html: string, name = "Acme Wealth") => logoPicks(html, base, name).map((p) => `${p.from} ${p.kind === "img" ? p.src : "svg"}`);

describe("parseColour", () => {
  it("reads hex in 3, 4, 6 and 8 digits and drops mostly see-through ones", () => {
    expect(parseColour("#1AF")).toBe("#11aaff");
    expect(parseColour("#1aff")).toBe("#11aaff");
    expect(parseColour("#1af8")).toBeNull();
    expect(parseColour("#1555E0")).toBe("#1555e0");
    expect(parseColour("#1555e0cc")).toBe("#1555e0");
    expect(parseColour("#1555e080")).toBeNull();
    expect(parseColour("#12345")).toBeNull();
  });

  it("reads rgb and rgba with commas or spaces and cuts off below 80% opacity", () => {
    expect(parseColour("rgb(21, 85, 224)")).toBe("#1555e0");
    expect(parseColour("rgba(21,85,224,0.9)")).toBe("#1555e0");
    expect(parseColour("rgba(21,85,224,.5)")).toBeNull();
    expect(parseColour("rgb(21 85 224 / 85%)")).toBe("#1555e0");
    expect(parseColour("rgb(21 85 224 / 40%)")).toBeNull();
    expect(parseColour("rgb(37 99 235/var(--tw-bg-opacity))")).toBe("#2563eb");
  });

  it("reads hsl, oklch and the bare triplet shadcn keeps in its variables", () => {
    expect(parseColour("hsl(221, 83%, 48%)")).toBe("#1555e0");
    expect(parseColour("hsla(221 83% 48% / 0.2)")).toBeNull();
    expect(parseColour("221 83% 48%")).toBe("#1555e0");
    expect(parseColour("oklch(54.6% 0.245 262.881)")).toBe("#155dfc");
    expect(parseColour("white")).toBe("#ffffff");
    for (const v of ["transparent", "var(--brand)", "currentColor", "inherit", "1.25rem"]) expect(parseColour(v)).toBeNull();
  });
});

describe("lookColours", () => {
  it("ignores a library's own variables and a page builder's untouched defaults", () => {
    const css = `:root{--swiper-theme-color:#007aff;--wp--preset--color--vivid-cyan-blue:#0693e3;--wp--preset--color--luminous-vivid-orange:#ff6900}
.elementor-kit-5{--e-global-color-primary:#6EC1E4;--e-global-color-accent:#61CE70}
.swiper-button-next{color:var(--swiper-theme-color)}.elementor-button{background-color:var(--e-global-color-accent)}.has-orange{color:var(--wp--preset--color--luminous-vivid-orange)}`;
    expect(lookColours("<p>Hi</p>", css)).toEqual([]);
    expect(lookColours("<p>Hi</p>", ":root{--brand:#007aff}.hero{color:var(--brand)}")).toEqual(["#007aff"]);
  });

  it("weighs brand variables and button backgrounds over colours that are merely used", () => {
    const css = `:root{--brand-primary:#e6c75f;--primary-foreground:#0b0b0b}.hero{color:var(--brand-primary)}
.btn-main{background:#0b7a55}.btn-main.large{background-color:#0b7a55}.btn-main:hover{background:#7c3aed}
.error{color:#ef4444}.alert{border-color:#ef4444}.notice{color:#ef4444}`;
    expect(lookColours("<p>Hi</p>", css)).toEqual(["#e6c75f", "#0b7a55"]);
  });

  it("folds near twins and shades of one hue into the stronger colour", () => {
    expect(colourGap("#1555e0", "#144eeb")).toBeLessThan(TWIN_GAP);
    const css = ":root{--primary:#1555e0;--accent:#144eeb;--theme:#3b82f6;--brand:#7c5cf0}.a{color:var(--primary);background:var(--accent);border-color:var(--theme)}.b{color:var(--brand)}";
    expect(lookColours("<p>Hi</p>", css)).toEqual(["#1555e0", "#7c5cf0"]);
  });

  it("counts the logo's own fills most", () => {
    const logo = '<svg viewBox="0 0 64 64"><defs><linearGradient id="g"><stop stop-color="#2563eb"/><stop offset="1" stop-color="#7c5cf0"/></linearGradient></defs><rect width="64" height="64" fill="url(#g)"/><path fill="#fff" d="M1 1h2"/></svg>';
    expect(lookColours("<p>Hi</p>", ":root{--brand:#e11d48}.x{color:var(--brand)}", logo)).toEqual(["#2563eb", "#7c5cf0", "#e11d48"]);
  });

  it("gives a black-and-white brand its dark only from its logo, brand variables or buttons, never from theme-color alone", () => {
    expect(lookColours("<p>Hi</p>", "body{color:#111}h1{color:#111111}p{color:#222}a{color:#0000ee}")).toEqual([]);
    expect(lookColours('<meta name="theme-color" content="#111111"><p>Hi</p>', "body{color:#111}")).toEqual([]);
    expect(lookColours("<p>Hi</p>", "", '<svg viewBox="0 0 74 24"><path fill="#212121" d="M0 0h74v24H0z"/></svg>')).toEqual(["#212121"]);
    expect(lookColours('<meta name="theme-color" content="#111111"><p>Hi</p>', ".btn{background:#111111}")).toEqual(["#111111"]);
  });

  it("skips dark-mode values and rules for classes the page never uses", () => {
    const page = busyPage('<a class="c1 cta-button">Start</a>');
    const css = `:root{--primary:#1555e0}.dark{--primary:#93c5fd}@media (prefers-color-scheme:dark){:root{--primary:#a5b4fc}}.c1{color:var(--primary)}
.promo-btn{background:#e11d48}.promo-btn.big{background:#e11d48}.sale-btn{background:#e11d48}`;
    expect(lookColours(page, css)).toEqual(["#1555e0"]);
    expect(lookColours(page.replace("cta-button", "cta-button promo-btn big sale-btn"), css)).toEqual(["#e11d48", "#1555e0"]);
  });

  it("reads colours from Tailwind's rgb form and from variables a page fills in for each section", () => {
    const page = busyPage('<a class="c2 btn-red">Go</a><a class="btn-red big">Buy</a>');
    const css = ".btn-red{--tw-bg-opacity:1;background-color:rgb(255 0 11/var(--tw-bg-opacity))}.btn-red.big{background-color:rgb(255 0 11/var(--tw-bg-opacity))}";
    expect(lookColours(page, css)).toEqual(["#ff000b"]);
    expect(lookColours("<p>Hi</p>", ":root{--color-base-accent-1:51, 79, 180}.button{background:rgb(var(--color-base-accent-1))}")).toEqual(["#334fb4"]);
  });
});

describe("logoPicks", () => {
  const HEAD = `<link rel="icon" href="/favicon-32.png" sizes="32x32"><link rel="icon" href="/favicon.ico"><link rel="icon" href="/icon-192.png" sizes="192x192">
<link rel="apple-touch-icon" href="/apple.png"><meta property="og:image" content="/share.jpg">`;

  it("takes the header's home link picture first, then the touch icon and big icons, the favicon last, never the share picture or small icons", () => {
    const html = `${HEAD}<header><a href="/" class="site-header__link"><img src="/img/acme.png" alt="Acme Wealth"></a><nav><a href="/about">About</a></nav></header>`;
    expect(picked(html)).toEqual(["home link https://acme.sg/img/acme.png", "touch icon https://acme.sg/apple.png", "icon https://acme.sg/icon-192.png", "icon https://acme.sg/favicon.ico"]);
  });

  it("keeps a favicon the page names, even one saved as .ico, as the last thing to try", () => {
    const html = '<link rel="icon" href="/favicon.ico" type="image/x-icon" sizes="2400x2400"/><header><a href="/"><svg viewBox="0 0 256 256" fill="currentColor"><path d="M0 0h256v256H0z"/></svg></a></header>';
    expect(picked(html)).toEqual(["icon https://acme.sg/favicon.ico"]);
  });

  it("takes a drawing in the home link, then a picture that calls itself the logo, then the site's schema logo", () => {
    const html = `${HEAD}<header><a href="https://www.acme.sg/" aria-label="Acme Wealth home"><svg viewBox="0 0 120 32"><path fill="#1555e0" d="M0 0h120v32H0z"/></svg></a>
<div class="brand-mark"><img src="/img/mark.png" class="brand-mark__img"></div></header>
<script type="application/ld+json">{"@type":"Organization","logo":{"@type":"ImageObject","url":"https:\\/\\/acme.sg\\/schema-logo.png"}}</script>`;
    const picks = logoPicks(html, base, "Acme Wealth");
    expect(picks[0]).toMatchObject({ kind: "svg", from: "home link" });
    expect(picked(html).slice(1)).toEqual(["header https://acme.sg/img/mark.png", "schema https://acme.sg/schema-logo.png", "touch icon https://acme.sg/apple.png", "icon https://acme.sg/icon-192.png"]);
  });

  it("skips partner, client and other brands' logos, empty and data: sources, and icons named logo", () => {
    const html = `<header><a href="/"><img src=""><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" data-src="/img/real-logo.png"></a></header>
<section><img class="client-logo" src="/img/dbs.png" alt="DBS"><img src="/partners/uob-logo.png" alt="UOB"><img src="/img/forbes-logo.png" alt="Forbes logo">
<img src="/img/brand-logo1.png"><img src="/img/brand-logo2.png"><img src="/img/search-icon.png" alt="search logo"></section>`;
    expect(picked(html)).toEqual(["home link https://acme.sg/img/real-logo.png"]);
  });

  it("puts a plain icon glyph in the home link below the touch icon, and skips it when the link shows no name", () => {
    const glyph = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" class="lucide lucide-paw-print"><circle cx="11" cy="4" r="2"/></svg>';
    expect(picked(`${HEAD}<header><a href="/">${glyph}<span>Acme Wealth</span></a></header>`).slice(0, 2)).toEqual(["touch icon https://acme.sg/apple.png", "home link svg"]);
    expect(picked(`<header><a href="/" class="toggle">${glyph}</a></header>`)).toEqual([]);
  });

  it("returns at most 5", () => {
    const html = `${HEAD}${Array.from({ length: 8 }, (_, i) => `<img src="/img/acme-logo-${"abcdefgh"[i]}.png" alt="Acme Wealth">`).join("")}`;
    expect(logoPicks(html, base, "Acme Wealth")).toHaveLength(5);
  });
});

describe("logoWindow", () => {
  const filler = (n: number) => `<div>${"x".repeat(n)}</div>`;
  const late = `<head><link rel="apple-touch-icon" href="/t.png"></head><body>${filler(450_000)}<header><a href="/en"><svg viewBox="0 0 188 16"><title>Tony Robbins Logo</title><path d="M0 0h10v10z"/></svg></a></header></body>`;

  it("keeps the first 400 KB when the header is in it", () => {
    const early = `<header><a href="/"><img src="/logo.png"></a></header>${filler(500_000)}`;
    expect(logoWindow(early)).toBe(early.slice(0, 400_000));
  });

  it("joins the page's head to a header that starts past 400 KB, so its home link logo is found", () => {
    const shown = logoWindow(late);
    expect(shown.length).toBeLessThan(260_000);
    expect(shown.startsWith("<head><link rel=\"apple-touch-icon\"")).toBe(true);
    expect(logoPicks(shown, new URL("https://www.tonyrobbins.com/"), "Carat").map((p) => `${p.from} ${p.kind}`)[0]).toMatch(/svg$/);
    expect(logoPicks(late.slice(0, 400_000), new URL("https://www.tonyrobbins.com/"), "Carat").map((p) => p.from)).toEqual(["touch icon"]);
  });

  it("finds no window past 1.2 MB and takes the first 400 KB", () => {
    expect(logoWindow(`${filler(1_300_000)}<header></header>`)).toHaveLength(400_000);
  });

  it("takes a logo titled with the site's own host as the brand's, whatever the page calls itself", () => {
    const svg = `<header><a href="/"><svg viewBox="0 0 10 10"><title>Tony Robbins Logo</title><path d="M0 0h10v10z"/></svg></a></header>`;
    expect(logoPicks(svg, new URL("https://www.tonyrobbins.com/"), "Carat")).toHaveLength(1);
    expect(logoPicks(svg, new URL("https://acme.sg/"), "Acme Wealth")).toEqual([]);
  });
});

describe("icoPng", () => {
  const png = (n: number) => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new Array(n).fill(7)]);
  const ico = (entries: { size: number; data: Uint8Array }[]) => {
    const head = 6 + entries.length * 16;
    const total = head + entries.reduce((n, e) => n + e.data.length, 0);
    const out = new Uint8Array(total);
    const view = new DataView(out.buffer);
    view.setUint16(2, 1, true);
    view.setUint16(4, entries.length, true);
    let at = head;
    entries.forEach((e, i) => {
      const o = 6 + i * 16;
      out[o] = e.size >= 256 ? 0 : e.size;
      out[o + 1] = out[o];
      view.setUint32(o + 8, e.data.length, true);
      view.setUint32(o + 12, at, true);
      out.set(e.data, at);
      at += e.data.length;
    });
    return out;
  };

  it("takes the biggest PNG inside an icon file, at least 48 px", () => {
    const big = png(40);
    const got = icoPng(ico([{ size: 32, data: png(10) }, { size: 256, data: big }, { size: 64, data: png(20) }]));
    expect(got && Array.from(got)).toEqual(Array.from(big));
  });

  it("gives nothing for small icons, old bitmap icons, broken ones or files that aren't icons", () => {
    expect(icoPng(ico([{ size: 32, data: png(10) }]))).toBeNull();
    expect(icoPng(ico([{ size: 64, data: new Uint8Array([40, 0, 0, 0, 64, 0, 0, 0, 1, 2]) }]))).toBeNull();
    expect(icoPng(png(30))).toBeNull();
    const broken = ico([{ size: 64, data: png(20) }]);
    new DataView(broken.buffer).setUint32(6 + 12, 9_999_999, true);
    expect(icoPng(broken)).toBeNull();
  });
});

describe("svgDataUrl", () => {
  it("strips scripts, event handlers, foreignObject and javascript: or remote links", () => {
    const out = unpack(svgDataUrl(`<svg viewBox="0 0 10 10" onload="alert(1)"><script>alert(1)</script><foreignObject><div>x</div></foreignObject>
<a href="javascript:alert(1)"><path d="M0 0h10v10H0z" onclick="steal()"/></a><image href="https://evil.example/x.png"/><set attributeName="href" to="javascript:alert(1)"/></svg>`));
    expect(out).toContain('<path d="M0 0h10v10H0z"/>');
    expect(out).not.toMatch(/script|onload|onclick|foreignObject|javascript|evil|<set/i);
  });

  it("adds xmlns and a width and height from the viewBox, 512 on the long side", () => {
    const out = unpack(svgDataUrl('<svg viewBox="0 0 64 32" width="1em" height="1em" class="h-8"><path d="M0 0h64v32H0z"/></svg>'));
    const open = out.match(/^<svg[^>]*>/)?.[0] ?? "";
    for (const a of ['xmlns="http://www.w3.org/2000/svg"', 'width="512"', 'height="256"', 'viewBox="0 0 64 32"', 'class="h-8"']) expect(open).toContain(a);
    expect(open).not.toContain("1em");
  });

  it("copies a gradient the drawing borrows from the page", () => {
    const page = '<svg width="0" height="0"><defs><linearGradient id="brand-grad"><stop offset="0" stop-color="#1555e0"/></linearGradient></defs></svg>';
    expect(unpack(svgDataUrl('<svg viewBox="0 0 10 10"><rect width="10" height="10" fill="url(#brand-grad)"/></svg>', page))).toContain(
      '<defs><linearGradient id="brand-grad"><stop offset="0" stop-color="#1555e0"/></linearGradient></defs><rect',
    );
  });

  it("draws a <use> of a symbol defined elsewhere on the page", () => {
    const page = '<svg style="display:none"><symbol id="logo" viewBox="0 0 100 40"><path d="M0 0h100v40H0z"/></symbol></svg>';
    const out = unpack(svgDataUrl('<svg class="logo"><use xlink:href="#logo"></use></svg>', page));
    expect(out).toContain('width="512" height="205"');
    expect(out).toContain('viewBox="0 0 100 40"');
    expect(out).toContain('xmlns:xlink="http://www.w3.org/1999/xlink"');
    expect(out).toContain('<defs><symbol id="logo" viewBox="0 0 100 40"><path d="M0 0h100v40H0z"/></symbol></defs><use xlink:href="#logo"></use>');
  });

  it("returns null for nothing drawable", () => {
    expect(svgDataUrl('<svg viewBox="0 0 10 10"><use href="#missing"/></svg>')).toBeNull();
    expect(svgDataUrl('<svg viewBox="0 0 10 10"><defs><linearGradient id="g"/></defs></svg>')).toBeNull();
    expect(svgDataUrl("<p>no drawing</p>")).toBeNull();
  });

  it("paints a logo the page colours with CSS, so it doesn't come out blank on its own", () => {
    const white = unpack(svgDataUrl('<svg viewBox="0 0 188 16" fill="none" class="fill-current text-white"><title>Tony Robbins Logo</title><path d="M0 0h10v10z"></path></svg>'));
    expect(white).toContain('fill="currentColor"');
    expect(white).toContain('color="#ffffff"');
    expect(white).not.toContain('fill="none"');
    expect(unpack(svgDataUrl('<svg viewBox="0 0 10 10" class="h-6 fill-current"><path d="M0 0h10v10z"/></svg>'))).toContain('color="#000000"');
    expect(unpack(svgDataUrl('<svg viewBox="0 0 10 10" class="fill-current text-[#0E7490]"><path d="M0 0h10v10z"/></svg>'))).toContain('color="#0E7490"');
    expect(unpack(svgDataUrl('<svg viewBox="0 0 10 10" fill="#123456" class="fill-current text-white"><path d="M0 0h10v10z"/></svg>'))).toContain('fill="#123456"');
    expect(unpack(svgDataUrl('<svg viewBox="0 0 10 10" fill="none" class="logo"><path d="M0 0h10v10z" stroke="#000"/></svg>'))).toContain('fill="none"');
  });

  it("reads an SVG file with its XML prolog, keeping non-ASCII text intact", () => {
    const file = '<?xml version="1.0" encoding="UTF-8"?>\n<!-- Generator: Illustrator --><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><text>Café ☕</text></svg>';
    expect(svgFile(file)).toBe(true);
    expect(svgFile('<!doctype html><html><body><svg viewBox="0 0 1 1"></svg>')).toBe(false);
    expect(unpack(svgDataUrl(file))).toBe('<svg width="512" height="512" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><text>Café ☕</text></svg>');
  });
});

describe("lookFonts", () => {
  it("reads Google Fonts links and next/font file names, never a hashed file name", () => {
    expect(lookFonts('<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&amp;family=Inter:wght@400;600&amp;display=swap" rel="stylesheet">', "")).toEqual(["Playfair Display", "Inter"]);
    expect(lookFonts('<link rel="stylesheet" href="https://fonts.googleapis.com/css?family=Lato:400,700|Open+Sans">', "")).toEqual(["Lato", "Open Sans"]);
    const next = '<link rel="preload" href="/_next/static/media/roboto_serif_500-s.p.1i9clh56c0avt.woff2" as="font"><link rel="preload" href="/_next/static/media/e4af272ccee01ff0-s.p.woff2" as="font">';
    expect(lookFonts(next, "")).toEqual(["Roboto Serif"]);
  });

  it("ranks the body's family, then headings, through var() stacks and @font-face, dropping system, icon, code fonts and junk", () => {
    const css = `@font-face{font-family:"Geograph";src:url(g.woff2)}@font-face{font-family:"Geograph";font-weight:700}@font-face{font-family:"Font Awesome 6 Free"}
:root{--font-sans:"Geograph", system-ui, sans-serif;--font-size-lg:1.25rem;--font-style:italic;--font-display:swap}
body{font-family:var(--font-sans)}h1,h2{font-family:'Self Modern', Georgia, serif}pre,code{font-family:"Source Code Pro", monospace}
.nav{font-family:-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto}.icon{font-family:"Material Symbols Outlined"}.lead{font:400 1.125rem/1.6 "Graphik Web", Helvetica}`;
    expect(lookFonts("<p>Hi</p>", css)).toEqual(["Geograph", "Self Modern", "Graphik Web"]);
  });

  it("names next/font's hashed and camelCase families plainly", () => {
    expect(lookFonts("<p>Hi</p>", "body{font-family:'__Inter_e8ce0c', '__Inter_Fallback_e8ce0c'}h1{font-family:robotoSerif, robotoSerif Fallback}")).toEqual(["Inter", "Roboto Serif"]);
  });
});

describe("stylesheetLinks", () => {
  it("keeps at most 3 of the site's own sheets, resolved, without font services, frameworks or print sheets", () => {
    const html = `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter"><link rel="stylesheet" href="/vendor/bootstrap.min.css">
<link rel="stylesheet" href="https://use.fontawesome.com/releases/v6/css/all.css"><link rel="stylesheet" href="css/site.css"><link rel="preload" as="style" href="/assets/app.css">
<link rel="stylesheet" href="/theme-print.css" media="print"><link rel="alternate stylesheet" href="/contrast.css"><link rel="stylesheet" href="/a.css"><link rel="stylesheet" href="/b.css">`;
    expect(stylesheetLinks(html, new URL("https://acme.sg/en/"))).toEqual(["https://acme.sg/en/css/site.css", "https://acme.sg/assets/app.css", "https://acme.sg/a.css"]);
  });

  it("prefers a WordPress child theme and the page builder's kit over plugin sheets", () => {
    const html = ["/wp-content/themes/astra/assets/css/main.min.css", "/wp-content/plugins/forms/style.css", "/wp-content/plugins/gallery/gallery.css", "/wp-content/uploads/elementor/css/post-5.css", "/wp-content/themes/acme-child/style.css"]
      .map((h) => `<link rel="stylesheet" href="${h}">`)
      .join("");
    expect(stylesheetLinks(html, base)).toEqual([
      "https://acme.sg/wp-content/themes/astra/assets/css/main.min.css",
      "https://acme.sg/wp-content/uploads/elementor/css/post-5.css",
      "https://acme.sg/wp-content/themes/acme-child/style.css",
    ]);
  });
});

describe("hostile pages stay fast and safe", () => {
  const LIMIT = 1000;
  const timed = <T>(run: () => T): { out: T; ms: number } => {
    const t = performance.now();
    const out = run();
    return { out, ms: performance.now() - t };
  };
  const sp = (n: number) => " ".repeat(n);
  const ACTIVE = /<(\w+:)?(script|foreignObject|iframe|embed|object)\b|[\s"'/](\w+:)?on[a-z]+\s*=|javascript:|evil\.example/i;

  it("1. keeps blocks apart, so piles of unclosed svg, style and link tags neither blow up nor slow down", () => {
    const runs = [
      timed(() => logoPicks(("<svg>".repeat(2000) + "</svg>").repeat(29), base, "Acme Wealth")),
      timed(() => logoPicks(`<body>${"<svg>".repeat(16000)}</svg>`, base, "Acme Wealth")),
      timed(() => logoPicks(`<header>${('<a href="/">'.repeat(6000) + "</a>").repeat(4)}</header>`, base, "Acme Wealth")),
      timed(() => lookColours(("<style>".repeat(5000) + "</style>").repeat(8), "")),
      timed(() => lookColours(`<head>${"<style>".repeat(2000)}${"x".repeat(285000)}</style>`, "")),
      timed(() => lookFonts(("<style>".repeat(5000) + "</style>").repeat(8), "")),
    ];
    for (const r of runs) {
      expect(r.out).toEqual([]);
      expect(r.ms).toBeLessThan(LIMIT);
    }
    expect(picked('<header><a href="/about">About<a href="/" class="logo"><img src="/brand.png"></a></header>')).toEqual(["home link https://acme.sg/brand.png"]);
  });

  it("2. parses colours in linear time however much whitespace sits inside them", () => {
    const paths = `<svg viewBox="0 0 10 10">${`<path fill="rgb(1${sp(47)}1${sp(47)}1${sp(94)}x)" d="M0 0"/>`.repeat(100)}</svg>`;
    const runs = [
      timed(() => lookColours(`<meta name="theme-color" content="rgb(1${sp(400)}1${sp(400)}1${sp(900)}x)">`, "")),
      timed(() => lookColours("<p>Hi</p>", "", paths)),
      timed(() => logoPicks(`<header><a href="/">${paths}</a></header>`, base, "Acme Wealth")),
      timed(() => lookColours("<p>Hi</p>", `a{color:rgb(1${sp(14)}1${sp(14)}1${sp(27)}x)}`.repeat(13000))),
      timed(() => parseColour(`hsl(1${sp(80)}1${sp(80)}1${sp(160)}x)`)),
    ];
    expect(runs.map((r) => r.out)).toEqual([[], [], [], [], null]);
    for (const r of runs) expect(r.ms).toBeLessThan(LIMIT);
    expect(parseColour(`rgb(21,${sp(300)}85,\n\t224)`)).toBe("#1555e0");
  });

  it("3. trims !important and font-name tails in linear time", () => {
    const runs = [
      timed(() => lookColours("<p>Hi</p>", `a{color:red${sp(60000)}x}.b{color:#e11d48${sp(30000)}!important}`)),
      timed(() => lookFonts("<p>Hi</p>", `body{font-family:a${sp(30000)}b}h1{font-family:Geograph${'"'.repeat(30000)}}h2{font-family:Inter${sp(30000)}Fallback}`)),
    ];
    expect(runs.map((r) => r.out)).toEqual([[], ["Geograph", "Inter"]]);
    for (const r of runs) expect(r.ms).toBeLessThan(LIMIT);
  });

  it("4. reads long attribute selectors in linear time", () => {
    const page = busyPage("");
    const runs = [
      timed(() => lookColours(`${page}<style>.c1${"[a=x".repeat(20000)}{color:#e11d48}</style>`, "")),
      timed(() => lookColours(page, `${"[".repeat(40000)}{color:red}`)),
      timed(() => lookColours(page, `.c1[a${sp(40000)}x{color:red}`)),
      timed(() => lookFonts(`${page}<style>.c1${"[a=x".repeat(20000)}{font-family:Inter}</style>`, "")),
    ];
    expect(runs.map((r) => r.out)).toEqual([[], [], [], ["Inter"]]);
    for (const r of runs) expect(r.ms).toBeLessThan(LIMIT);
  });

  it("5. checks attribute selectors against the page without one page scan per attribute", () => {
    const page = busyPage('<a class="btn c1" data-tone="red" data-live>Go</a>');
    const runs = [
      timed(() => lookColours(page, `${Array.from({ length: 100000 }, (_, i) => `[a${i}]`).join("")}{color:red}`)),
      timed(() => lookColours(page, `${Array.from({ length: 80000 }, (_, i) => `[a=v${i}]`).join("")}{color:red}`)),
    ];
    expect(runs.map((r) => r.out)).toEqual([[], []]);
    for (const r of runs) expect(r.ms).toBeLessThan(LIMIT);
    const css = ".btn[data-tone=red]{background:#e11d48}[data-live] .btn{background:#e11d48}.btn[data-tone=blue]{background:#1555e0}[data-gone] .btn{background:#1555e0}";
    expect(lookColours(page, css)).toEqual(["#e11d48"]);
  });

  it("6. expands var() within one budget per call", () => {
    const root = `:root{--x:${"var(--y) ".repeat(250)};--y:${"#123456 ".repeat(250)}}`;
    const runs = [
      timed(() => lookColours("<p>Hi</p>", root + "a{--a:var(--x)}".repeat(50000))),
      timed(() => lookColours("<p>Hi</p>", root + Array.from({ length: 35000 }, (_, i) => `a{--a${i}:var(--x,${i})}`).join(""))),
      timed(() => lookColours("<p>Hi</p>", root + Array.from({ length: 40000 }, (_, i) => `.a${i}{color:var(--x)}`).join(""))),
      timed(() => lookFonts("<p>Hi</p>", root + Array.from({ length: 40000 }, (_, i) => `.a${i}{font-family:var(--x)}`).join(""))),
    ];
    expect(runs[0].out).toEqual([]);
    expect(runs[3].out).toEqual([]);
    for (const r of runs) expect(r.ms).toBeLessThan(LIMIT);
  });

  it("7. caps the rules read and keeps no copy of the wrapper text per rule", () => {
    const css = Array.from({ length: 7 }, (_, i) => `@media (min-width:${i}px) ${"x".repeat(170)}{`).join("") + "b{c{}}".repeat(149000);
    const runs = [timed(() => lookColours("<p>Hi</p>", css)), timed(() => lookFonts("<p>Hi</p>", css))];
    expect(runs.map((r) => r.out)).toEqual([[], []]);
    for (const r of runs) expect(r.ms).toBeLessThan(LIMIT);
    expect(lookColours("<p>Hi</p>", "@media print{.btn{background:#e11d48}.btn.big{background:#e11d48}}")).toEqual([]);
  });

  it("8. scans svg tags and borrowed ids in linear time", () => {
    const filler = `<g ${"x".repeat(1990)}>`.repeat(100);
    const runs = [
      timed(() => svgDataUrl(`<svg viewBox="0 0 1 1">${"<animate".repeat(30000)}><path d="M0 0h1"/></svg>`)),
      timed(() => svgDataUrl(`<svg viewBox="0 0 10 3">${"<image".repeat(41000)}></svg>`)),
      timed(() => svgDataUrl(`<svg class="logo" viewBox="0 0 10 10"><path d="M0 0"/>${Array.from({ length: 4000 }, (_, i) => `<use href="#m${i}"/>`).join("")}</svg>`, filler)),
    ];
    expect(runs[0].out).toBeNull();
    expect(runs[1].out).toBeNull();
    expect(runs[2].out).toMatch(/^data:image\/svg\+xml;base64,/);
    for (const r of runs) expect(r.ms).toBeLessThan(LIMIT);
  });

  it("9. leaves no script, handler, foreignObject, frame or active link behind re-formed tags or namespace prefixes", () => {
    const ns = 'xmlns:s="http://www.w3.org/2000/svg" xmlns:l="http://www.w3.org/1999/xlink"';
    const probes = [
      '<svg viewBox="0 0 10 10"><scr<script></script>ipt>alert(1)</script><path d="M0 0h1"/></svg>',
      '<svg viewBox="0 0 10 10" o onx="1"nload="alert(1)"><path d="M0 0h1"/></svg>',
      '<svg viewBox="0 0 10 10"><a h href="x"ref="javascript:alert(1)"><path d="M0 0h1"/></a></svg>',
      `<svg ${ns} viewBox="0 0 10 10"><s:script>alert(1)</s:script><s:foreignObject><div>x</div></s:foreignObject><path d="M0 0h1"/></svg>`,
      `<svg ${ns} viewBox="0 0 10 10"><a l:href="javascript:alert(1)"><path d="M0 0h1"/></a><use l:href="https://evil.example/s.svg#x"/></svg>`,
      '<svg viewBox="0 0 10 10"><path x="1"onload="alert(1)" d="M0 0h1"/><iframe src="x"></iframe><embed src="y"/><object data="z"></object></svg>',
    ];
    for (const p of probes) {
      const r = timed(() => svgDataUrl(p));
      expect(unpack(r.out)).toMatch(/<path\b[^<>]*\sd="M0 0h1"\/>/);
      expect(unpack(r.out)).not.toMatch(ACTIVE);
      expect(r.ms).toBeLessThan(LIMIT);
    }
    const nested = timed(() => svgDataUrl(`<svg viewBox="0 0 10 10">${"<scr".repeat(2000)}<script></script>${"ipt>".repeat(2000)}<path d="M0 0h1"/></svg>`));
    expect(nested.out).toBeNull();
    expect(nested.ms).toBeLessThan(LIMIT);
  });

  it("10. expands an Illustrator file's own entities and refuses markup a browser cannot parse", () => {
    const illustrator = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd" [
	<!ENTITY ns_extend "http://ns.adobe.com/Extensibility/1.0/">
	<!ENTITY ns_svg "http://www.w3.org/2000/svg">
]>
<svg version="1.1" xmlns:x="&ns_extend;" xmlns="&ns_svg;" x="0px" y="0px" width="200px" height="60px" viewBox="0 0 200 60"><rect fill="#0B7A55" width="200" height="60"/></svg>`;
    expect(unpack(svgDataUrl(illustrator))).toBe(
      '<svg width="512" height="154" version="1.1" xmlns:x="http://ns.adobe.com/Extensibility/1.0/" xmlns="http://www.w3.org/2000/svg" x="0px" y="0px" viewBox="0 0 200 60"><rect fill="#0B7A55" width="200" height="60"/></svg>',
    );
    for (const bad of [
      '<svg class=logo viewBox="0 0 10 10"><path d="M0 0h1"/></svg>',
      '<svg viewBox="0 0 10 10"><path fill=#0b7a55 d="M0 0h1"/></svg>',
      '<svg viewBox="0 0 10 10" aria-hidden><path d="M0 0h1"/></svg>',
      '<svg viewBox="0 0 10 10"><text>A&nbsp;B</text></svg>',
      '<svg viewBox="0 0 10 10" xmlns:x="&ns_extend;"><path d="M0 0h1"/></svg>',
      '<svg viewBox="0 0 10 10"><path d="M0 0h1"></svg>',
    ]) expect(svgDataUrl(bad)).toBeNull();
    const bomb = timed(() => svgDataUrl(`<!DOCTYPE svg [<!ENTITY a "${"x".repeat(2000)}">]><svg viewBox="0 0 1 1"><text>${"&a;".repeat(80000)}</text></svg>`));
    expect(bomb.out).toBeNull();
    expect(bomb.ms).toBeLessThan(LIMIT);
  });

  it("11. ignores a boilerplate black or white theme-color and never takes theme-color alone as the ink", () => {
    const cra = '<meta name="theme-color" content="#000000"><link rel="apple-touch-icon" href="/logo192.png"><div id="root"></div>';
    const runs = [
      timed(() => lookColours(cra, "body{margin:0;font-family:-apple-system}")),
      timed(() => lookColours(cra.replace("#000000", "#ffffff"), "")),
      timed(() => lookColours(`${cra}<style>.hero{background:#e11d48}</style>`, "")),
      timed(() => lookColours('<meta name="theme-color" content="#0b7a55">', "")),
    ];
    expect(runs.map((r) => r.out)).toEqual([[], [], [], ["#0b7a55"]]);
    for (const r of runs) expect(r.ms).toBeLessThan(LIMIT);
  });

  it("12. survives one selector holding 150,000 classes", () => {
    const page = `<div class="a">${busyPage("")}</div>`;
    const runs = [timed(() => lookColours(page, `${".a".repeat(149990)}{color:#e11d48}`)), timed(() => lookFonts(page, `${".a".repeat(149990)}{font-family:Inter}`))];
    expect(runs.map((r) => r.out)).toEqual([[], ["Inter"]]);
    for (const r of runs) expect(r.ms).toBeLessThan(LIMIT);
  });
});
