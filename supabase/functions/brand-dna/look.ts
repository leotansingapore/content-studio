import { decode } from "../feed-ideas/logic.ts";

const tagsOf = (html: string, name: string) => html.match(new RegExp(`<${name}\\b[^<>]{0,2000}>`, "gi")) ?? [];
const attr = (tag: string, name: string): string => {
  const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, "i"));
  return decode((m?.[1] ?? m?.[2] ?? m?.[3] ?? "").trim());
};
const absolute = (href: string, base: URL) => {
  if (!href.trim() || /^data:/i.test(href.trim())) return "";
  try {
    const u = new URL(href.trim(), base);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : "";
  } catch {
    return "";
  }
};
const hostOf = (host: string) => host.toLowerCase().replace(/^www\./, "");
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const stripBetween = (s: string, open: string, close: string): string => {
  let out = "", at = 0;
  for (;;) {
    const a = s.indexOf(open, at);
    if (a < 0) return out + s.slice(at);
    out += s.slice(at, a);
    const b = s.indexOf(close, a + open.length);
    if (b < 0) return out;
    at = b + close.length;
  }
};

type Block = { at: number; tag: string; inner: string };
const blocks = (html: string, open: RegExp, close: string, max: number, split = false): Block[] => {
  const lower = html.toLowerCase();
  const opens = [...html.matchAll(open)];
  const out: Block[] = [];
  let end = -2, next = 0, left = html.length;
  for (let i = 0; i < opens.length; i++) {
    const at = opens[i].index ?? 0;
    if (at < next) continue;
    const from = at + opens[i][0].length;
    if (end !== -1 && end < from) end = lower.indexOf(close, from);
    const cut = split && i + 1 < opens.length ? opens[i + 1].index ?? -1 : -1;
    const stop = cut >= from && (end < 0 || cut < end) ? cut : end;
    if (stop < 0) break;
    if (stop - from <= max && (left -= stop - from) >= 0) out.push({ at, tag: opens[i][0], inner: html.slice(from, stop) });
    next = stop === end ? end + close.length : stop;
  }
  return out;
};
const pageStyles = (page: string) => blocks(page, /<style\b[^<>]{0,500}>/gi, "</style>", 300_000).map((b) => b.inner).join("\n");
const svgBlocks = (html: string) => blocks(html, /<svg\b[^<>]{0,2000}>/gi, "</svg>", 80_000).map((b) => ({ at: b.at, svg: `${b.tag}${b.inner}</svg>` }));
const withoutSvg = (html: string): string => {
  let out = "", at = 0;
  for (const b of svgBlocks(html)) {
    out += html.slice(at, b.at);
    at = b.at + b.svg.length;
  }
  return out + html.slice(at);
};

const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
const toHex = (r: number, g: number, b: number) => `#${[r, g, b].map((v) => clamp(v).toString(16).padStart(2, "0")).join("")}`;
const hslToRgb = (h: number, s: number, l: number): [number, number, number] => {
  const S = s / 100, L = l / 100, H = ((h % 360) + 360) % 360;
  const k = (n: number) => (n + H / 30) % 12;
  const a = S * Math.min(L, 1 - L);
  const f = (n: number) => L - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
};
const oklchToRgb = (L: number, C: number, H: number): [number, number, number] => {
  const a = C * Math.cos((H * Math.PI) / 180), b = C * Math.sin((H * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const gamma = (x: number) => {
    const v = Math.max(0, Math.min(1, x));
    return 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
  };
  return [
    gamma(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    gamma(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    gamma(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
};
const unit = (v: string, full: number) => (v.endsWith("%") ? (parseFloat(v) / 100) * full : parseFloat(v));
const hueOf = (v: string, u = "") => (u === "turn" ? +v * 360 : u === "rad" ? (+v * 180) / Math.PI : u === "grad" ? +v * 0.9 : +v);
const opaque = (alpha?: string) => {
  const a = alpha?.trim() ?? "";
  if (!a || a === "none" || a.startsWith("var(")) return true;
  return (a.endsWith("%") ? parseFloat(a) / 100 : parseFloat(a)) >= 0.8;
};

export const parseColour = (raw: string): string | null => {
  const v = raw.trim().toLowerCase().replace(/\s+/g, " ").replace(/ ?!important$/, "");
  if (v.length > 120) return null;
  if (v === "white") return "#ffffff";
  if (v === "black") return "#000000";
  let m = v.match(/^#([0-9a-f]{3,8})$/);
  if (m) {
    const h = m[1].length <= 4 ? [...m[1]].map((c) => c + c).join("") : m[1];
    if (h.length !== 6 && h.length !== 8) return null;
    return h.length === 8 && parseInt(h.slice(6), 16) < 204 ? null : `#${h.slice(0, 6)}`;
  }
  m = v.match(/^rgba?\( ?([\d.]+%?) ?[, ] ?([\d.]+%?) ?[, ] ?([\d.]+%?) ?(?:[,/] ?(.+?))? ?\)$/);
  if (m) return opaque(m[4]) ? toHex(unit(m[1], 255), unit(m[2], 255), unit(m[3], 255)) : null;
  m = v.match(/^hsla?\( ?(-?[\d.]+)(deg|grad|rad|turn)? ?[, ] ?([\d.]+)%? ?[, ] ?([\d.]+)%? ?(?:[,/] ?(.+?))? ?\)$/);
  if (m) return opaque(m[5]) ? toHex(...hslToRgb(hueOf(m[1], m[2]), +m[3], +m[4])) : null;
  m = v.match(/^oklch\( ?([\d.]+%?) ([\d.]+%?) (-?[\d.]+)(?:deg)? ?(?:\/ ?(.+?))? ?\)$/);
  if (m) return opaque(m[4]) ? toHex(...oklchToRgb(unit(m[1], 1), unit(m[2], 0.4), +m[3])) : null;
  m = v.match(/^(-?[\d.]+)(?:deg)? ([\d.]+)% ([\d.]+)%$/);
  if (m) return toHex(...hslToRgb(+m[1], +m[2], +m[3]));
  return null;
};

const rgbOf = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
export const colourful = (h: string): boolean => {
  const [r, g, b] = rgbOf(h);
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  return max - min > 40 && max > 40 && min < 235;
};
const dark = (h: string) => Math.max(...rgbOf(h)) < 70;
export const colourGap = (a: string, b: string): number => {
  const [r1, g1, b1] = rgbOf(a), [r2, g2, b2] = rgbOf(b);
  const rm = (r1 + r2) / 2;
  return Math.sqrt((2 + rm / 256) * (r1 - r2) ** 2 + 4 * (g1 - g2) ** 2 + (2 + (255 - rm) / 256) * (b1 - b2) ** 2);
};
export const TWIN_GAP = 90;
const hueLight = (h: string): [number, number, number] => {
  const [r, g, b] = rgbOf(h).map((v) => v / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  const hue = d === 0 ? 0 : max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [hue * 60, (max + min) / 2, d];
};
const twins = (a: string, b: string): boolean => {
  if (colourGap(a, b) < TWIN_GAP) return true;
  const [h1, l1, c1] = hueLight(a), [h2, l2, c2] = hueLight(b);
  const dh = Math.min(Math.abs(h1 - h2), 360 - Math.abs(h1 - h2));
  return c1 > 0.25 && c2 > 0.25 && dh < 16 && Math.abs(l1 - l2) < 0.25;
};

const COLOUR_RE = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|oklch)\((?:[^()]|\([^()]*\)){3,60}\)|\b(?:white|black)\b/gi;
const LIBRARY_VAR =
  /^(swiper|wp--preset--(?!color--)|wp--preset--color--(black|cyan-bluish-gray|white|pale-pink|vivid-red|luminous-vivid-orange|luminous-vivid-amber|light-green-cyan|vivid-green-cyan|pale-cyan-blue|vivid-cyan-blue|vivid-purple)$|wp-admin|tw-|toastify|plyr|fc-|rsbs|reach-|radix-|sonner|mantine|chakra|joy-|mui|bs-(blue|indigo|purple|pink|red|orange|yellow|green|teal|cyan|gray|grey|white|black|dark|light)|fa-|cc-|cookie|intercom|hs-|hubspot|vjs|mejs|lg-|pswp|fancybox|tippy|select2|flatpickr|ql-|ck-)/;
const BRAND_WORD = /^(primary|brand|accent|main|theme|cta|key)$/;
const NOT_BRAND_WORD =
  /^(foreground|fg|text|contrast|on|border|ring|muted|light|lighter|lightest|pale|soft|subtle|hover|active|focus|focused|disabled|shadow|outline|placeholder|surface|tint|faded|alpha|transparent|inverse|invert)$/;
const brandVar = (name: string): boolean => {
  const parts = name.split(/[-_]+/).filter(Boolean);
  if (!parts.some((p) => BRAND_WORD.test(p)) || parts.some((p) => NOT_BRAND_WORD.test(p))) return false;
  const step = Number(parts[parts.length - 1]);
  return !(parts.length > 1 && Number.isInteger(step) && step >= 50 && step <= 950 && (step < 400 || step > 700));
};
const PAINT = /^(background|background-color|color|border|border-color|border-(top|right|bottom|left)(-color)?|outline-color|fill|stroke|stop-color|text-decoration-color|accent-color)$/;
const BUTTON = /(^|[^a-z0-9])(btn|button|cta)([^a-z0-9]|$)|\[type=["']?submit/;
const STATE = /:(hover|focus|active|disabled|visited|focus-visible|focus-within|checked)|::?(before|after|placeholder|selection|marker)/;
const DARK = /(^|[^a-z0-9-])dark([^a-z0-9-]|$)|prefers-color-scheme:\s*dark|\bprint\b|\bnight\b/;
const BOILERPLATE = new Set(["#000000", "#ffffff"]);
const DEFAULT_VALUE: Record<string, string> = {
  "e-global-color-primary": "#6ec1e4",
  "e-global-color-secondary": "#54595f",
  "e-global-color-text": "#7a7a7a",
  "e-global-color-accent": "#61ce70",
  "ast-global-color-0": "#0170b9",
  "ast-global-color-1": "#3a3a3a",
  "global-palette1": "#3182ce",
  "global-palette2": "#2b6cb0",
};
const TAILWIND_VAR = /^(tw-|color-(red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone|mauve|olive|mist|taupe)-\d{2,3}$)/;
const MAX_RULES = 50_000;

type Rule = { sel: string; low: string; body: string; ctx: number; dark: boolean; print: boolean; uses: number };
const cssRules = (css: string): Rule[] => {
  const s = stripBetween(css, "/*", "*/");
  const out: Rule[] = [];
  const wrappers: { id: number; dark: boolean; print: boolean }[] = [];
  let ids = 0;
  let o = s.indexOf("{"), c = s.indexOf("}");
  let at = 0;
  const seek = () => {
    if (o >= 0 && o < at) o = s.indexOf("{", at);
    if (c >= 0 && c < at) c = s.indexOf("}", at);
  };
  while (c >= 0 && out.length < MAX_RULES) {
    if (o < 0 || c < o) {
      wrappers.pop();
      at = c + 1;
      seek();
      continue;
    }
    const prelude = s.slice(at, o);
    const sel = prelude.slice(prelude.lastIndexOf(";") + 1).trim();
    at = o + 1;
    seek();
    if (c < 0) break;
    const top = wrappers[wrappers.length - 1];
    if (o >= 0 && o < c) {
      const low = sel.toLowerCase();
      wrappers.push({ id: ++ids, dark: !!top?.dark || DARK.test(low), print: !!top?.print || /\bprint\b/.test(low) });
      continue;
    }
    out.push({ sel, low: sel.toLowerCase(), body: s.slice(at, c), ctx: top?.id ?? 0, dark: !!top?.dark, print: !!top?.print, uses: 1 });
    at = c + 1;
    seek();
  }
  return out;
};
const declarations = (body: string): { prop: string; value: string }[] => {
  const out: { prop: string; value: string }[] = [];
  for (const part of body.split(";")) {
    const i = part.indexOf(":");
    if (i < 1) continue;
    const prop = part.slice(0, i).trim();
    const value = part.slice(i + 1).trim().replace(/(?<!\s)\s*!important$/i, "");
    if (prop && value) out.push({ prop: prop.startsWith("--") ? prop : prop.toLowerCase(), value });
  }
  return out;
};
const VAR_CALL = /var\(\s*--([\w-]{1,80})\s*(?:,\s*((?:[^()]|\([^()]*\))*))?\)/g;
const resolverOf = (vars: Map<string, string>) => {
  let budget = 1_000_000;
  const memo = new Map<string, string>();
  const expand = (value: string, depth: number): string => {
    if (depth > 4 || budget <= 0 || !value.includes("var(")) return value;
    let room = 2000;
    const next = value.slice(0, 2000).replace(VAR_CALL, (_, name: string, fallback?: string) => {
      const v = (vars.get(name.toLowerCase()) ?? fallback?.trim() ?? "").slice(0, Math.max(0, Math.min(room, budget)));
      room -= v.length;
      budget -= v.length + 1;
      return v;
    });
    return next === value ? value : expand(next, depth + 1);
  };
  return (value: string): string => {
    let out = memo.get(value);
    if (out === undefined) {
      out = expand(value, 0);
      memo.set(value, out);
    }
    return out;
  };
};
type Page = { html: string; classes: Map<string, number>; ids: Set<string>; names: Set<string> | null; attrs: Map<string, boolean> };
const pageOf = (html: string): Page | null => {
  const classes = new Map<string, number>(), ids = new Set<string>();
  for (const m of html.matchAll(/\sclass\s*=\s*(?:"([^"]{0,3000})"|'([^']{0,3000})')/gi)) for (const c of decode(m[1] ?? m[2]).split(/\s+/)) if (c) classes.set(c, (classes.get(c) ?? 0) + 1);
  for (const m of html.matchAll(/\sid\s*=\s*(?:"([^"]{0,300})"|'([^']{0,300})')/gi)) ids.add(decode(m[1] ?? m[2]).trim());
  return classes.size >= 40 ? { html, classes, ids, names: null, attrs: new Map() } : null;
};
const unescapeCss = (s: string) =>
  s.replace(/\\([0-9a-f]{1,6}\s?|.)/gi, (_, e: string) => {
    if (!/^[0-9a-f]+\s?$/i.test(e)) return e;
    const n = parseInt(e, 16);
    return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : "�";
  });
const hasAttr = (page: Page, name: string, value?: string): boolean => {
  if (value === undefined) {
    if (!page.names) {
      page.names = new Set();
      for (const t of page.html.matchAll(/<[a-zA-Z][^<>]{0,3000}>/g)) for (const n of t[0].matchAll(/\s([a-zA-Z_:][\w:.-]{0,80})/g)) page.names.add(n[1].toLowerCase());
    }
    return page.names.has(name.toLowerCase());
  }
  const key = `${name}=${value}`;
  let found = page.attrs.get(key);
  if (found === undefined) {
    if (page.attrs.size >= 300) return true;
    found = [`${name}="${value}"`, `${name}='${value}'`, `${name}=${value} `, `${name}=${value}>`].some((x) => page.html.includes(x));
    page.attrs.set(key, found);
  }
  return found;
};
const ATTR_SELECTOR = /(?<!\\)\[\s*([\w:-]+)\s*(?:(\^|\$|\*|~|\|)?=\s*(?:"([^"]*)"|'([^']*)'|([^\][\s]+))(?:\s+[is])?\s*)?\]/g;
const usesOf = (sel: string, page: Page | null): number => {
  if (!page || sel.startsWith("@")) return 1;
  let best = 0;
  for (const item of sel.replace(/:not\((?:[^()]|\([^()]*\))*\)/g, "").split(",")) {
    let ok = true;
    for (const a of item.matchAll(ATTR_SELECTOR)) if (!a[2] && !hasAttr(page, a[1], (a[3] ?? a[4] ?? a[5])?.trim())) ok = false;
    const bare = item.replace(/(?<!\\)\[[^\][]*\]/g, "");
    if (!ok || ![...bare.matchAll(/#((?:\\.|[\w-])+)/g)].every((m) => page.ids.has(unescapeCss(m[1])))) continue;
    let least = Infinity;
    for (const m of bare.matchAll(/\.((?:\\[0-9a-f]{1,6}\s?|\\.|[\w-])+)/gi)) least = Math.min(least, page.classes.get(unescapeCss(m[1])) ?? 0);
    best = Math.max(best, least === Infinity ? 1 : least);
  }
  return best;
};
const VAR_REF = /var\(\s*--([\w-]{1,80})/g;
type Cascade = { vars: Map<string, string>; defs: [string, string][]; used: Set<string>; rules: Rule[][] };
const cascadeOf = (sheets: string[], html: string): Cascade => {
  const page = pageOf(html);
  const vars = new Map<string, string>();
  const defs: [string, string][] = [];
  const used = new Set<string>();
  const refs = (v: string) => {
    for (const m of v.matchAll(VAR_REF)) used.add(m[1].toLowerCase());
  };
  const rules = sheets.map((text) => cssRules(text));
  for (const list of rules) {
    for (const r of list) {
      r.uses = r.dark || DARK.test(r.low) ? 0 : usesOf(r.sel, page);
      if (!r.uses) continue;
      for (const d of declarations(r.body)) {
        if (!d.prop.startsWith("--")) {
          refs(d.value);
          continue;
        }
        const name = d.prop.slice(2).toLowerCase();
        const value = DEFAULT_VALUE[name] && parseColour(d.value) === DEFAULT_VALUE[name] ? "" : d.value;
        vars.set(name, value);
        defs.push([name, value]);
      }
    }
  }
  for (const m of html.matchAll(/\s(?:style|fill|stroke|stop-color|color)\s*=\s*(?:"([^"]{0,800})"|'([^']{0,800})')/gi)) refs(m[1] ?? m[2]);
  for (let round = 0, size = -1; round < 6 && used.size !== size; round++) {
    size = used.size;
    for (const name of [...used]) refs(vars.get(name) ?? "");
  }
  return { vars, defs, used, rules };
};
const MIXED = /color-mix\((?:[^()]|\((?:[^()]|\([^()]*\))*\))*\)/gi;
const coloursIn = (value: string): string[] => {
  const v = value.replace(MIXED, " ").replace(/\s+/g, " ").trim();
  const one = parseColour(v);
  if (one) return [one];
  const t = v.match(/^(\d{1,3})\s*[,\s]\s*(\d{1,3})\s*[,\s]\s*(\d{1,3})$/);
  if (t && [t[1], t[2], t[3]].every((n) => +n <= 255)) return [toHex(+t[1], +t[2], +t[3])];
  return (v.match(COLOUR_RE) ?? []).slice(0, 12).map(parseColour).filter((c): c is string => !!c);
};
const PAINT_ATTR = /(?:^|[\s;"'{])(?:fill|stroke|stop-color|color)\s*(?:=\s*(?:"([^"]{0,200})"|'([^']{0,200})')|:\s*([^;"'}<>]{1,200}))/gi;
const paintsOf = (svg: string) => [...svg.matchAll(PAINT_ATTR)].map((m) => (m[1] ?? m[2] ?? m[3] ?? "").trim());

export const lookColours = (html: string, css: string, logoSvg = ""): string[] => {
  const score = new Map<string, number>();
  const strong = new Set<string>();
  const inky = new Set<string>();
  const add = (c: string | null, w: number, isStrong = false, ink = isStrong) => {
    if (!c) return;
    score.set(c, (score.get(c) ?? 0) + w);
    if (isStrong) strong.add(c);
    if (ink) inky.add(c);
  };
  const page = html.slice(0, 300_000);
  const theme = tagsOf(page.slice(0, 100_000), "meta").find((t) => (attr(t, "name") || attr(t, "property")).toLowerCase() === "theme-color" && !/dark/i.test(attr(t, "media")));
  const themed = theme ? parseColour(attr(theme, "content")) : null;
  if (themed && !BOILERPLATE.has(themed)) add(themed, 6, true, false);
  const logo = new Map<string, number>();
  for (const p of paintsOf(logoSvg)) {
    const c = parseColour(p);
    if (c) logo.set(c, (logo.get(c) ?? 0) + 1);
  }
  for (const [c, n] of logo) add(c, Math.min(40, 10 * n), true);

  const { vars, defs, used, rules } = cascadeOf([css.slice(0, 900_000), pageStyles(page)], page);
  const resolve = resolverOf(vars);
  const read = new Map<string, string[]>();
  const coloursOf = (value: string) => {
    let out = read.get(value);
    if (!out) {
      out = coloursIn(resolve(value));
      read.set(value, out);
    }
    return out;
  };
  const counted = new Set<string>();
  for (const [name, value] of defs) {
    if (LIBRARY_VAR.test(name) || TAILWIND_VAR.test(name) || counted.has(`${name}=${value}`)) continue;
    counted.add(`${name}=${value}`);
    const brand = brandVar(name) && used.has(name);
    for (const c of coloursOf(value)) {
      if (counted.has(`${name}|${c}`)) continue;
      counted.add(`${name}|${c}`);
      add(c, brand ? 8 : brandVar(name) ? 2 : 0.5, brand);
    }
  }
  const decls = new Map<string, { value: string; button: boolean; uses: number }>();
  for (const list of rules) {
    for (const r of list) {
      if (!r.uses || r.low.startsWith("@")) continue;
      for (const d of declarations(r.body)) {
        if (PAINT.test(d.prop)) decls.set(`${r.ctx}|${r.sel}|${d.prop}`, { value: d.value, button: d.prop.startsWith("background") && BUTTON.test(r.low) && !STATE.test(r.low), uses: r.uses });
      }
    }
  }
  for (const d of decls.values()) for (const c of coloursOf(d.value)) add(c, d.button ? 4 : Math.min(5, d.uses), d.button);
  for (const m of page.matchAll(/\sstyle\s*=\s*(?:"([^"]{0,800})"|'([^']{0,800})')/gi)) {
    for (const d of declarations(decode(m[1] ?? m[2]))) if (PAINT.test(d.prop)) for (const c of coloursOf(d.value)) add(c, 0.5);
  }
  for (const m of page.matchAll(/\s(?:fill|stop-color|stroke)\s*=\s*["']([^"']{3,40})["']/gi)) add(parseColour(m[1]), 0.3);

  const ranked = [...score.entries()].sort((a, b) => b[1] - a[1]);
  const picked: { hex: string; score: number; strong: boolean }[] = [];
  for (const [hex, s] of ranked) {
    if (!colourful(hex) || s < 2) continue;
    const twin = picked.find((p) => twins(p.hex, hex));
    if (twin) {
      twin.score += s;
      twin.strong ||= strong.has(hex);
    } else if (picked.length < 8) picked.push({ hex, score: s, strong: strong.has(hex) });
  }
  picked.sort((a, b) => b.score - a.score);
  const top = picked[0]?.score ?? 0;
  const colours = picked.filter((p) => (p.strong && p.score >= 6) || p.score >= Math.max(10, top / 2)).slice(0, 4).map((p) => p.hex);
  if (colours.length) return colours;
  const ink = ranked.find(([hex, s]) => dark(hex) && inky.has(hex) && s >= 4);
  return ink ? [ink[0]] : [];
};

export type LogoPick = { kind: "img"; src: string; from: string } | { kind: "svg"; svg: string; from: string };

const LOGOISH = /logo|brand|wordmark|site-?title|site-?name|navbar-brand|masthead/i;
const OTHERS =
  /partner|client|customer|trusted|award|press|featured|payment|sponsor|footer|as-seen|testimonial|review|badge|certif|accredit|integration|marquee|carousel|slider|ticker|case-?stud|portfolio|logos|logo-?(wall|grid|cloud|strip|list|row|bar|garden)/i;
const LOGO_WORD = /\blogo|wordmark/i;
const OTHER_DIR = /^(clients?|partners?|customers?|sponsors?|logos|brands|awards?|press|payments?|badges?|certifications?|integrations?|testimonials?|featured|trusted|replaces|vendors?|tools)$/i;
const NOT_LOGO = /\b(icon|icons|search|menu|hamburger|burger|close|cross|arrow|chevron|caret|cart|bag|user|account|avatar|flag|language|play|toggle|loader|spinner|placeholder)\b/i;
const SOCIAL = /facebook|instagram|linkedin|twitter|youtube|tiktok|whatsapp|pinterest|telegram|wechat|threads|google|apple|app-?store|play-?store|visa|mastercard|paypal|amex/i;
const WHITE = /white|inverse|invert|reverse|negative|knockout|wht\b/i;
const LANG_ROOT = /^\/(index\.(html?|php)|home|(en|zh|ms|ta|id|th|vi|ja|ko|fr|de|es|it|pt|nl|ar|hi)([-_][a-z]{2,4})?)$/;

const trimSlashes = (path: string) => path.replace(/(?<!\/)\/+$/, "").toLowerCase();
const isHome = (href: string, base: URL): boolean => {
  const h = href.trim();
  if (!h || h.startsWith("#") || /^(mailto|tel|javascript):/i.test(h)) return false;
  const at = absolute(h, base);
  if (!at) return false;
  const u = new URL(at);
  if (hostOf(u.hostname) !== hostOf(base.hostname)) return false;
  const path = trimSlashes(u.pathname);
  return path === "" || path === trimSlashes(base.pathname) || LANG_ROOT.test(path);
};
const imgSrc = (tag: string, base: URL): string => {
  for (const name of ["src", "data-src", "data-lazy-src", "data-original", "lazy-src", "srcset", "data-srcset"]) {
    const at = absolute(attr(tag, name).split(/\s+/)[0] ?? "", base);
    if (at && at !== base.href) return at;
  }
  return "";
};
const fileOf = (href: string) => {
  const f = new URL(href).pathname.split("/").pop() ?? "";
  try {
    return decodeURIComponent(f).toLowerCase();
  } catch {
    return f.toLowerCase();
  }
};
const dirsOf = (href: string) => new URL(href).pathname.split("/").slice(0, -1).filter(Boolean);
const brandRe = (name: string): { any: RegExp; exact: RegExp } | null => {
  const words = (name.toLowerCase().match(/[a-z0-9]+/g) ?? []).slice(0, 6);
  if (words.join("").length < 3) return null;
  const phrase = words.join("[\\s_.'&-]*");
  return { any: new RegExp(`(^|[^a-z0-9])${phrase}($|[^a-z0-9])`, "i"), exact: new RegExp(`^[^a-z0-9]*${phrase}([^a-z0-9]+logo)?[^a-z0-9]*$`, "i") };
};
const boxOf = (svgTag: string): [number, number, number, number] | null => {
  const vb = attr(svgTag, "viewBox").split(/[\s,]+/).map(Number);
  if (vb.length === 4 && vb.every(Number.isFinite) && vb[2] > 0 && vb[3] > 0) return vb as [number, number, number, number];
  const w = attr(svgTag, "width").match(/^([\d.]+)(px)?$/), h = attr(svgTag, "height").match(/^([\d.]+)(px)?$/);
  return w && h && +w[1] > 0 && +h[1] > 0 ? [0, 0, +w[1], +h[1]] : null;
};
const glyph = (svg: string) => !paintsOf(svg).some((p) => parseColour(p));
const whiteOnly = (svg: string): boolean => {
  const paints = paintsOf(svg).map(parseColour).filter((c): c is string => !!c);
  return paints.length > 0 && paints.every((c) => Math.min(...rgbOf(c)) > 225);
};
const squareish = (svg: string): boolean => {
  const box = boxOf(svg.match(/^<svg\b[^<>]{0,2000}>/i)?.[0] ?? "");
  return !box || (box[2] / box[3] > 0.8 && box[2] / box[3] < 1.25);
};
const headerEnd = (body: string): number => {
  const header = body.search(/<\/header>/i);
  if (header > 0) return header;
  const nav = body.search(/<\/nav>/i);
  return nav > 0 ? Math.max(nav, Math.min(body.length, 20_000)) : Math.min(body.length, 60_000);
};

export const logoWindow = (html: string): string => {
  const early = html.slice(0, 400_000);
  if (/<header\b|<nav\b/i.test(early) || html.length <= 400_000) return early;
  const at = html.slice(400_000, 1_200_000).search(/<header\b/i);
  if (at < 0) return early;
  const from = 400_000 + at;
  return html.slice(0, 100_000) + html.slice(from, from + 150_000);
};

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

export const logoPicks = (html: string, base: URL, name = ""): LogoPick[] => {
  const body = html.slice(0, 400_000);
  const end = headerEnd(body);
  const header = body.slice(0, end);
  const brand = brandRe(name);
  const site = squash(base.hostname.replace(/^www\./i, "").split(".")[0] ?? "");
  const someoneElse = (label: string) => {
    const m = label.match(/^\s*(.+?)[\s'’s-]+logo\b/i);
    if (!m || !brand || brand.any.test(m[1])) return false;
    const said = squash(m[1]);
    return !(site.length >= 3 && said.length >= 3 && (site.includes(said) || said.includes(site)));
  };
  const picks: (LogoPick & { score: number })[] = [];
  const img = (src: string, from: string, score: number) => picks.push({ kind: "img", src, from, score });
  const svg = (markup: string, from: string, score: number) => picks.push({ kind: "svg", svg: markup, from, score });

  for (const a of blocks(header, /<a\b[^<>]{0,2000}>/gi, "</a>", 80_000, true).slice(0, 500)) {
    const open = a.tag;
    const said = `${attr(open, "aria-label")} ${attr(open, "title")}`;
    const label = `${said} ${attr(open, "class")} ${attr(open, "id")}`;
    const labelled = LOGOISH.test(label) || !!brand?.any.test(said);
    if ((!isHome(attr(open, "href"), base) && !/\bhome\b/i.test(label) && !labelled) || OTHERS.test(label)) continue;
    const inner = a.inner;
    const lockup = labelled || !!decode(withoutSvg(inner).replace(/<[^<>]{0,2000}>/g, " ")).trim();
    const before = picks.length;
    const imgs = tagsOf(inner, "img").map((t) => ({ t, at: imgSrc(t, base) })).filter((x) => x.at);
    imgs.sort((a, b) => Number(WHITE.test(`${fileOf(a.at)} ${attr(a.t, "class")}`)) - Number(WHITE.test(`${fileOf(b.at)} ${attr(b.t, "class")}`)));
    imgs.slice(0, 2).forEach((x, i) => img(x.at, "home link", 100 - i));
    const backdrop = absolute(decode(`${open} ${inner}`).match(/background(?:-image)?\s*:\s*url\(\s*['"]?([^'")]+)/i)?.[1] ?? "", base);
    if (backdrop) img(backdrop, "home link", 90);
    svgBlocks(inner).slice(0, 2).forEach(({ svg: s }, i) => {
      if (whiteOnly(s)) svg(s, "home link", 36);
      else if (!glyph(s) || !squareish(s)) svg(s, "home link", 95 - i);
      else if (lockup) svg(s, "home link", 38);
    });
    if (picks.length > before) break;
  }

  const series = new Map<string, Set<string>>();
  const named: { src: string; key: string; score: number }[] = [];
  let seenImgs = 0;
  for (const m of body.matchAll(/<img\b[^<>]{0,2000}>/gi)) {
    if (++seenImgs > 3000) break;
    const t = m[0];
    const at = imgSrc(t, base);
    if (!at) continue;
    const said = [attr(t, "alt"), attr(t, "title")];
    const words = `${attr(t, "class")} ${attr(t, "id")} ${said.join(" ")} ${attr(t, "itemprop")} ${fileOf(at)}`;
    if (!LOGOISH.test(`${attr(t, "class")} ${attr(t, "id")} ${attr(t, "itemprop")}`) && !LOGO_WORD.test(`${said.join(" ")} ${fileOf(at)}`) && !said.some((x) => brand?.exact.test(x))) continue;
    if (OTHERS.test(words) || dirsOf(at).some((d) => OTHER_DIR.test(d)) || NOT_LOGO.test(words) || (SOCIAL.test(words) && !brand?.any.test(words)) || said.some(someoneElse)) continue;
    const where = m.index ?? 0;
    const key = `${dirsOf(at).join("/")}/${fileOf(at).replace(/\d+/g, "#")}`;
    series.set(key, (series.get(key) ?? new Set()).add(at));
    named.push({ src: at, key, score: where < end ? 80 : where < 60_000 ? 35 : 15 });
  }
  for (const n of named) if (n.score === 80 || (series.get(n.key)?.size ?? 0) < 2) img(n.src, n.score === 80 ? "header" : "page", n.score);

  for (const b of svgBlocks(body)) {
    const open = b.svg.match(/^<svg\b[^<>]{0,2000}>/i)?.[0] ?? "";
    const title = decode(b.svg.match(/<title[^<>]{0,200}>([^<]{0,200})<\/title>/i)?.[1] ?? "");
    const said = [attr(open, "aria-label"), title];
    const words = `${attr(open, "class")} ${attr(open, "id")} ${said.join(" ")}`;
    if (!LOGOISH.test(`${attr(open, "class")} ${attr(open, "id")}`) && !LOGO_WORD.test(said.join(" ")) && !said.some((x) => brand?.exact.test(x))) continue;
    if (OTHERS.test(words) || NOT_LOGO.test(words) || (SOCIAL.test(words) && !brand?.any.test(words)) || said.some(someoneElse)) continue;
    const inHeader = b.at < end;
    svg(b.svg, inHeader ? "header" : "page", (glyph(b.svg) && squareish(b.svg)) || whiteOnly(b.svg) ? 30 : inHeader ? 75 : 25);
  }

  for (const b of blocks(body, /<script\b[^<>]{0,500}>/gi, "</script>", 100_000)) {
    if (!/application\/ld\+json/i.test(b.tag)) continue;
    const l = b.inner.match(/"logo"\s*:\s*(?:"([^"]{1,500})"|\{[^{}]{0,1500}?"(?:url|contentUrl)"\s*:\s*"([^"]{1,500})")/);
    const at = l ? absolute((l[1] ?? l[2]).replace(/\\\//g, "/"), base) : "";
    if (at) {
      img(at, "schema", 70);
      break;
    }
  }

  const links = tagsOf(body.slice(0, 150_000), "link").map((t) => ({
    rel: attr(t, "rel").toLowerCase(),
    href: absolute(attr(t, "href"), base),
    size: parseInt(attr(t, "sizes"), 10) || 0,
    type: attr(t, "type").toLowerCase(),
  }));
  for (const l of links.filter((l) => l.rel.includes("apple-touch-icon") && l.href).sort((a, b) => b.size - a.size)) img(l.href, "touch icon", 40);
  for (const l of links.filter((l) => /\bicon\b/.test(l.rel) && !l.rel.includes("apple") && l.href).sort((a, b) => b.size - a.size)) {
    const vector = /svg/.test(`${l.type} ${fileOf(l.href)}`);
    if (/\.ico$/.test(fileOf(l.href)) || /icon$/.test(l.type) || (l.size && l.size < 96 && !vector)) continue;
    img(l.href, "icon", l.rel.includes("mask") ? 12 : 20);
  }

  const seen = new Set<string>();
  return picks
    .sort((a, b) => b.score - a.score)
    .filter((p) => {
      const key = p.kind === "img" ? p.src : p.svg.slice(0, 600);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 5)
    .map((p): LogoPick => (p.kind === "img" ? { kind: "img", src: p.src, from: p.from } : { kind: "svg", svg: p.svg, from: p.from }));
};

export const svgFile = (text: string): boolean => {
  const at = text.search(/<svg\b/i);
  return at >= 0 && at < 2048 && !/<(html|head|body)\b|<!doctype\s+html/i.test(text.slice(0, at));
};

const elementById = (page: string, id: string): string | null => {
  const m = page.match(new RegExp(`<(symbol|linearGradient|radialGradient|clipPath|mask|pattern|filter|g|path|circle|rect|ellipse|polygon|text)\\b[^<>]{0,2000}?\\sid\\s*=\\s*["']${escapeRe(id)}["'][^<>]{0,2000}>`, "i"));
  if (!m || m.index === undefined) return null;
  if (m[0].endsWith("/>")) return m[0];
  const close = page.toLowerCase().indexOf(`</${m[1].toLowerCase()}`, m.index + m[0].length);
  const end = close < 0 ? -1 : page.indexOf(">", close);
  return end < 0 || end - m.index > 60_000 ? null : page.slice(m.index, end + 1);
};
const refsOf = (s: string) => [...s.matchAll(/(?:href\s*=\s*["']#|url\(\s*["']?#)([\w.:-]{1,100})/gi)].map((m) => m[1]);
const entitiesOf = (prolog: string) =>
  new Map([...prolog.matchAll(/<!ENTITY\s+([\w.-]{1,60})\s+(["'])([^"'<>&%]{0,2000})\2\s*>/g)].slice(0, 50).map((m): [string, string] => [m[1], m[3]]));
const expandEntities = (s: string, entities: Map<string, string>): string | null => {
  if (!entities.size) return s;
  let room = 300_000;
  const out = s.replace(/&([\w.-]{1,60});/g, (m, n: string) => {
    const v = entities.get(n);
    if (v === undefined || room < 0) return m;
    room -= v.length;
    return room < 0 ? m : v;
  });
  return room < 0 ? null : out;
};
const scrub = (s: string) =>
  s
    .replace(/<(?:[\w.-]+:)?script\b[\s\S]*?(?:<\/(?:[\w.-]+:)?script\s*>|$)/gi, "")
    .replace(/<(?:[\w.-]+:)?foreignObject\b[\s\S]*?(?:<\/(?:[\w.-]+:)?foreignObject\s*>|$)/gi, "")
    .replace(/<\/?(?:[\w.-]+:)?(?:iframe|embed|object|set|handler|listener)\b[^<>]*>/gi, "")
    .replace(/<(?:[\w.-]+:)?animate\w*\b[^<>]*\battributeName\s*=\s*["']?(?:[\w.-]+:)?href[^<>]*>/gi, "")
    .replace(/(?:(?<!\s)\s+|(?<=["'/]))(?:[\w.-]+:)?on[a-z]+\s*=\s*("[^"]{0,2000}"|'[^']{0,2000}'|[^\s>]+)/gi, "")
    .replace(/(?:(?<!\s)\s+|(?<=["'/]))(?:[\w.-]+:)?href\s*=\s*("[^"]{0,2000}"|'[^']{0,2000}'|[^\s>]+)/gi, (m, v: string) => (/^["']?\s*(#|data:image\/(png|jpe?g|gif|webp)[;,])/i.test(v) ? m : ""));
const ACTIVE =
  /<(?:[\w.-]+:)?(?:script|foreignObject|iframe|embed|object|set|handler|listener)\b|(?<=[\s"'/])(?:[\w.-]+:)?on[a-z]+\s*=|(?<=[\s"'/])(?:[\w.-]+:)?href\s*=\s*(?!["']?\s*(?:#|data:image\/(?:png|jpe?g|gif|webp)[;,]))/i;
const sanitize = (svg: string): string | null => {
  let s = svg;
  for (let round = 0; round < 8; round++) {
    const next = scrub(s);
    if (next === s) return ACTIVE.test(s) ? null : s;
    s = next;
  }
  return null;
};
const controls = (s: string): boolean => {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 32 && c !== 9 && c !== 10 && c !== 13) return true;
  }
  return false;
};
const wellFormed = (svg: string): boolean => {
  const s = stripBetween(stripBetween(stripBetween(svg, "<!--", "-->"), "<![CDATA[", "]]>"), "<?", "?>");
  if (/&(?!(?:amp|lt|gt|quot|apos|#\d{1,7}|#x[0-9a-fA-F]{1,6});)/.test(s) || controls(s)) return false;
  const stack: string[] = [];
  let tags = 0;
  for (const t of s.matchAll(/<(\/?)([a-zA-Z_][\w:.-]*)((?:"[^"<]*"|'[^'<]*'|[^'"<>])*)>|</g)) {
    if (t[2] === undefined || (tags > 0 && !stack.length)) return false;
    tags++;
    if (t[1]) {
      if (t[3].trim() || stack.pop() !== t[2]) return false;
      continue;
    }
    const closed = t[3].endsWith("/");
    const names = new Set<string>();
    for (const part of (closed ? t[3].slice(0, -1) : t[3]).replace(/(?<!\s)\s*=\s*(?:"[^"]*"|'[^']*')/g, '=""').split(/\s+/)) {
      if (!part) continue;
      if (!/^[a-zA-Z_:][\w:.-]*=""$/.test(part) || names.has(part)) return false;
      names.add(part);
    }
    if (!closed) stack.push(t[2]);
  }
  return tags > 0 && stack.length === 0;
};

const base64 = (bytes: Uint8Array): string => {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};

const TEXT_INK: Record<string, string> = { white: "#ffffff", black: "#000000" };

const paintCurrent = (tag: string): string => {
  const cls = tag.match(/\sclass\s*=\s*(["'])([^"']{0,500})\1/i)?.[2] ?? "";
  if (!/(?:^|\s)fill-current(?:\s|$)/.test(cls)) return tag;
  const named = cls.match(/(?:^|\s)text-(white|black)(?:\s|$)/)?.[1];
  const hex = cls.match(/(?:^|\s)text-\[(#[0-9a-f]{6}|#[0-9a-f]{3})\](?:\s|$)/i)?.[1];
  let out = tag.replace(/\sfill\s*=\s*(["'])\s*none\s*\1/i, "");
  if (!/\sfill\s*=/i.test(out)) out = out.replace(/^<svg/i, '<svg fill="currentColor"');
  if (!/\scolor\s*=/i.test(out)) out = out.replace(/^<svg/i, `<svg color="${hex ?? TEXT_INK[named ?? "black"]}"`);
  return out;
};

export const svgDataUrl = (svg: string, page = ""): string | null => {
  const from = svg.search(/<svg\b/i);
  const to = svg.toLowerCase().lastIndexOf("</svg>");
  if (from < 0 || to < from) return null;
  const expanded = expandEntities(svg.slice(from, to + 6), entitiesOf(svg.slice(0, from)));
  if (expanded === null) return null;
  let s = expanded;
  const own = new Set([...s.matchAll(/\sid\s*=\s*["']([^"']{1,100})["']/gi)].map((m) => m[1]));
  const defs: string[] = [];
  let wanted = refsOf(s), looked = 0;
  for (let round = 0; round < 3 && wanted.length; round++) {
    const next: string[] = [];
    for (const id of new Set(wanted)) {
      if (own.has(id) || defs.length >= 20 || looked++ >= 40) continue;
      const el = elementById(page, id);
      if (!el) continue;
      own.add(id);
      defs.push(el);
      next.push(...refsOf(el));
    }
    wanted = next;
  }
  const open = s.match(/^<svg\b[^<>]*>/i)?.[0];
  if (!open) return null;
  const symbol = defs.find((d) => /^<symbol\b/i.test(d))?.match(/^<symbol\b[^<>]*>/i)?.[0] ?? "";
  const box = boxOf(open) ?? boxOf(symbol);
  let tag = open;
  if (box) {
    const k = 512 / Math.max(box[2], box[3]);
    tag = tag
      .replace(/\s(width|height)\s*=\s*("[^"]{0,500}"|'[^']{0,500}'|[^\s>]+)/gi, "")
      .replace(/(\sstyle\s*=\s*)(["'])([^"']*)\2/i, (_, a: string, q: string, v: string) => `${a}${q}${v.replace(/(^|;)\s*(width|height)\s*:[^;]*/gi, "$1")}${q}`)
      .replace(/^<svg/i, `<svg width="${Math.round(box[2] * k)}" height="${Math.round(box[3] * k)}"`);
    if (!/\sviewBox\s*=/i.test(tag)) tag = tag.replace(/^<svg/i, `<svg viewBox="${box.join(" ")}"`);
  }
  tag = paintCurrent(tag);
  if (!/\sxmlns\s*=/i.test(tag)) tag = tag.replace(/^<svg/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  if (/xlink:/i.test(s + defs.join("")) && !/\sxmlns:xlink\s*=/i.test(tag)) tag = tag.replace(/^<svg/i, '<svg xmlns:xlink="http://www.w3.org/1999/xlink"');
  const clean = sanitize(`${tag}${defs.length ? `<defs>${defs.join("")}</defs>` : ""}${s.slice(open.length)}`);
  if (clean === null || !wellFormed(clean)) return null;
  s = clean;
  if (!/<(?:[\w.-]+:)?(?:path|rect|circle|ellipse|polygon|polyline|line|text)\b|<(?:[\w.-]+:)?image\b[^<>]*\s(?:[\w.-]+:)?href\s*=/i.test(s)) return null;
  const bytes = new TextEncoder().encode(s);
  return bytes.length > 250_000 ? null : `data:image/svg+xml;base64,${base64(bytes)}`;
};

const GENERIC =
  /^(serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-sans-serif|ui-serif|ui-monospace|ui-rounded|-apple-system|blinkmacsystemfont|segoe ui( variable.*)?|noto sans|liberation sans|inherit|initial|unset|revert|revert-layer|emoji|math|fangsong|sans|mono|normal|bold|bolder|lighter|italic|oblique|none|auto|swap|block|fallback|optional|default|regular|medium|light|.*emoji.*)$/i;
const SYSTEM_FONT = /^(helvetica neue|helvetica|arial|georgia|times new roman|times|verdana|tahoma|trebuchet ms|roboto)$/i;
const ICON_FONT = /icon|awesome|material|glyph|swiper|slick|dashicons|eicons|fontello|icomoon|symbol|lucide|feather|ionicons|remixicon|phosphor|tabler/i;
const MONO_FONT = /mono\b|(^|\s)code\b|sourcecode|courier|consolas|menlo|monaco/i;
const NOT_FONT_VAR = /size|weight|style|feature|variation|display|smoothing|stretch|kerning|height|spacing|scale|line|letter|leading|tracking|optical|synthesis|variant|color|colour/;

const tidyFamily = (raw: string): string => {
  let f = raw.trim().replace(/(?<!\s)\s*!important$/i, "").replace(/^['"]+|(?<!['"])['"]+$/g, "").trim();
  f = f.replace(/^__/, "").replace(/_[0-9a-f]{5,}$/i, "").replace(/_/g, " ").replace(/(?<!\s)\s+fallback$/i, "").trim();
  if (/^[a-z]+([A-Z][a-z0-9]*)*$/.test(f)) f = f.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/^[a-z]/, (c) => c.toUpperCase());
  return f;
};
const fontOk = (f: string) =>
  /^[A-Za-z][\w .'&+-]{0,39}$/.test(f) && !/^[0-9a-f]{8,}$/i.test(f) && !/\d(px|rem|em|pt|%|vh|vw)\b/.test(f) && !GENERIC.test(f) && !ICON_FONT.test(f) && !MONO_FONT.test(f);
const googleFamilies = (href: string) =>
  [...href.matchAll(/family=([^&]+)/g)].flatMap((m) => {
    let v = m[1].replace(/\+/g, " ");
    try {
      v = decodeURIComponent(v);
    } catch {
      return [];
    }
    return v.split("|").map((f) => f.split(":")[0]);
  });

export const lookFonts = (html: string, css: string): string[] => {
  const score = new Map<string, { name: string; w: number }>();
  const tidied = new Map<string, string>();
  const add = (raw: string, w: number) => {
    let f = tidied.get(raw);
    if (f === undefined) {
      f = tidyFamily(raw);
      tidied.set(raw, f);
    }
    if (!fontOk(f)) return;
    const k = f.toLowerCase();
    const weight = SYSTEM_FONT.test(f) ? w / 2 : w;
    const e = score.get(k);
    if (!e) score.set(k, { name: f, w: weight });
    else {
      e.w += weight;
      if (!/[A-Z]/.test(e.name)) e.name = f;
    }
  };
  const page = html.slice(0, 300_000);
  for (const t of tagsOf(page.slice(0, 150_000), "link")) {
    const href = attr(t, "href");
    if (/fonts\.googleapis\.com\/css/.test(href)) googleFamilies(href).forEach((f) => add(f, 10));
    const next = href.match(/\/media\/([a-z][a-z0-9_]+?)(?:_\d{3})?(?:_italic)?-s\.p\./i);
    if (next && !/^[0-9a-f]{8,}$/i.test(next[1])) add(next[1].replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()), 8);
  }
  const styles = pageStyles(page);
  const sheet = css.slice(0, 900_000);
  for (const m of `${styles}\n${sheet}`.matchAll(/@import\s+(?:url\(\s*)?["']?([^"')\s;]+)/g)) if (/fonts\.googleapis\.com/.test(m[1])) googleFamilies(m[1]).forEach((f) => add(f, 10));

  const { vars, rules } = cascadeOf([sheet, styles], page);
  const resolve = resolverOf(vars);
  const faces = new Set<string>();
  const firsts = new Map<string, string>();
  const firstFamily = (value: string) => {
    let first = firsts.get(value);
    if (first === undefined) {
      const stack = resolve(value).split(",").map((f) => f.trim()).filter(Boolean);
      first = stack.some((f) => /^monospace$/i.test(f.replace(/['"]/g, ""))) ? "" : stack[0] ?? "";
      firsts.set(value, first);
    }
    return first;
  };
  for (const list of rules) {
    for (const r of list) {
      if (r.print || (!r.uses && r.low !== "@font-face")) continue;
      if (r.low === "@font-face") {
        const family = declarations(r.body).find((d) => d.prop === "font-family")?.value ?? "";
        const k = tidyFamily(family).toLowerCase();
        if (family && !faces.has(k)) {
          faces.add(k);
          add(family, 3);
        }
        continue;
      }
      const w = /(^|[\s,>+~])(html|body|:root)(?=[\s,.:#[>+~]|$)/.test(r.low) ? 6 : /(^|[\s,>+~.#-])h[1-6](?=[\s,.:#[>+~]|$)|heading|title|display|hero|headline/.test(r.low) ? 5 : 1;
      for (const d of declarations(r.body)) {
        if (d.prop === "font-family") add(firstFamily(d.value), w);
        else if (d.prop === "font") {
          const f = d.value.match(/(?:^|\s)(?:[\d.]+(?:px|em|rem|%|pt|vw|vh)|(?:xx?-)?(?:small|large)|medium|larger|smaller)(?:\s*\/\s*[\d.]+[a-z%]*)?\s+(.+)$/);
          if (f) add(firstFamily(f[1]), w);
        }
      }
    }
  }
  for (const [name, value] of vars) if (/font/.test(name) && !NOT_FONT_VAR.test(name)) add(firstFamily(value), 4);
  return [...score.values()].sort((a, b) => b.w - a.w).slice(0, 3).map((e) => e.name);
};

const LIBRARY_SHEET =
  /fonts\.googleapis|fonts\.gstatic|typekit|fonts\.net|fontawesome|font-awesome|bootstrap(\.min)?\.css|jquery|wp-includes|swiper|slick|animate(\.min)?\.css|\/animations\/|\baos(\.min)?\.css|fancybox|lightbox|magnific|owl\.carousel|select2|flickity|tippy|cookie|consent|intercom|hubspot|shopifycloud|cdnjs\.cloudflare|jsdelivr|unpkg\.com|bootstrapcdn|eicons|dashicons|\bprint(\.min)?\.css|rtl(\.min)?\.css|editor-style|admin-bar/i;
const sheetScore = (href: string, base: URL): number => {
  const u = new URL(href);
  const path = u.pathname.toLowerCase();
  let s = hostOf(u.hostname) === hostOf(base.hostname) ? 0 : -1;
  if (/\/plugins\//.test(path)) s -= 2;
  if (/\/themes\/[^/]+-child\/|\/uploads\/elementor\/css\/post-\d+\.css|\/cdn\/shop\/t\/\d+\/assets\//.test(path)) s += 3;
  else if (/\/themes\//.test(path)) s += 1;
  if (/(^|[/._-])(style|styles|main|app|global|globals|theme|site|custom|brand|base|common|critical|tokens|variables|colors|overwrite)([/._-]|$)/.test(path)) s += 1;
  return s;
};

export const stylesheetLinks = (html: string, base: URL): string[] => {
  const found: string[] = [];
  for (const t of tagsOf(html.slice(0, 150_000), "link")) {
    const rel = attr(t, "rel").toLowerCase();
    const sheet = /(^|\s)stylesheet(\s|$)/.test(rel) && !/alternate/.test(rel);
    if (!sheet && !(rel.includes("preload") && attr(t, "as").toLowerCase() === "style")) continue;
    if (/\bprint\b/i.test(attr(t, "media"))) continue;
    const href = absolute(attr(t, "href"), base);
    if (href && !LIBRARY_SHEET.test(href) && !found.includes(href)) found.push(href);
  }
  return found
    .map((href, i) => ({ href, i, s: sheetScore(href, base) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .slice(0, 3)
    .sort((a, b) => a.i - b.i)
    .map((x) => x.href);
};
