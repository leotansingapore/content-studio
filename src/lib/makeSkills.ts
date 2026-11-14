// The agent's make skills (Leo, 13 Nov: "fold all of these into the ai ... 'on demand' when someone actually wants to
// create those things"): one catalogue of everything the studio makes, DERIVED from what exists, so a maker added later
// appears here on its own: Studio's Create pages (nav.ts), the ready formats (data/formats.ts) and the ready static ads
// (data/staticFormats.ts). A skill starts in /agent (the Make picker, the slash menu, ?skill=<id>); its questions, at
// most 3, what it is about first, then a product, an angle, a presenter or a length, only where its maker takes one,
// are asked one at a time in the thread. Answers wait on this device (content-studio-makeflow-<scoped uid>) so a
// reload resumes. The last step is the agent's own priced card for a format the agent makes (agentFormat), else the
// maker's page beside the chat with the answers in its existing address params (PAGE_TAKES, takesOf).

import { CaretCircleRightIcon, FilmSlateIcon, ImageSquareIcon, TextAaIcon, type Icon } from "@phosphor-icons/react";
import { FORMATS, formatHref, type FormatDef } from "@/data/formats";
import { STATIC_FORMATS, staticFormatHref, staticShotSrc } from "@/data/staticFormats";
import type { AgentFormat } from "@/lib/agentCards";
import { appendMsg, newMsg, type AgentMsg } from "@/lib/agentThreads";
import { AGENT_ANSWERS, BUILT_IN_SKILLS } from "@/lib/chatSkills";
import { CREATE_FORMATS, CREATE_KINDS, MORE_FORMATS, kindOf, kindOfFormat } from "@/lib/createFormats";
import { slug as slugOf } from "@/lib/links";
import { groupedPages, section } from "@/lib/nav";
import { angleOrder, usedAngles } from "@/lib/photoAd";
import { loadPositioning } from "@/lib/positioning";
import { priceOf, type Price } from "@/lib/prices";
import { loadProducts, productLabel } from "@/lib/products";
import { scoped } from "@/lib/profiles";
import { DEFAULT_LENGTH, TALK_LENGTHS, speakers } from "@/lib/talkingHead";

export const STATIC_KIND = "Static ads";
/** The picker's type tabs: All, the Create picker's kinds (nav.ts `head`), then Static ads. */
export type KindSlug = "all" | "words" | "slides" | "video" | "static";
export const kindSlug = (kind: string): Exclude<KindSlug, "all"> => (kind === STATIC_KIND ? "static" : (kind.split(" ")[0].toLowerCase() as "words" | "slides" | "video"));
export const KIND_TABS: { slug: KindSlug; label: string }[] = [
  { slug: "all", label: "All" },
  ...[...CREATE_KINDS, STATIC_KIND].map((label) => ({ slug: kindSlug(label), label })),
];

export type QuestionId = "about" | "product" | "angle" | "presenter" | "length";
export type Answers = Partial<Record<QuestionId, string>>;
export interface Option {
  value: string;
  label: string;
}
export interface Question {
  id: QuestionId;
  ask: string;
  options: Option[];
  /** "Type your answer" is offered: only what it is about takes free words. */
  typed: boolean;
  /** Only what it is about cannot be skipped. */
  required: boolean;
}
export const MAX_QUESTIONS = 3;

export interface MakeSkill {
  /** Unique, the slash and ?skill=; never a ready-made chat skill's slash. */
  id: string;
  name: string;
  /** Words, Slides and pictures, Video or Static ads. */
  kind: string;
  blurb: string;
  /** The example (FormatPreview): a poster, and a clip for a video format. Null draws `icon`. */
  poster: { slug: string; src: string; video: boolean; ratio: "9/16" | "4/5" } | null;
  icon: Icon;
  /** The format's own price; null when its page prices each make itself. */
  price: (() => Price | "pick" | null) | null;
  /** Its maker, with nothing filled in. */
  href: string;
  /** The agent makes it itself, as a priced card. */
  agentFormat?: AgentFormat;
  /** The maker's address param (or, for the agent, the card field) each question fills. */
  takes: Partial<Record<QuestionId, string>>;
  /** A static ad's format, for its angles. */
  staticSlug?: string;
  lengths?: number[];
  /** Other words the slash menu and the search find it by: its old names. */
  was: string;
  /** A format's Create section (data/formats.ts), which the pick list's candidates are read by. */
  section?: string;
}

// ---- what each maker takes (read from the makers, 13 Nov; docs/deep-links.md) ----

/** The pages whose address takes what a make is about. A maker not here, and not read by takesOf, asks nothing. */
const PAGE_TAKES: Record<string, Partial<Record<QuestionId, string>>> = {
  "/generate/answer": { about: "q" },
  "/generate/vsl": { about: "offer" },
  "/hooks": { about: "topic" },
  "/make/hook-demo": { about: "topic" },
  "/make/slideshow": { about: "topic" },
  "/clone": { about: "url" },
};
const ABOUT_ASK: Record<string, string> = { q: "What do people ask you?", offer: "What do you sell?", url: "Which reel? Paste its link." };
const NARRATED_SECS = [30, 60];

/** The formats the agent already makes itself (agentCards' AgentFormat), by their page's address. */
const AGENT_MAKES: Record<string, AgentFormat> = {
  "/generate": "post",
  "/generate?format=text-post": "post",
  "/generate?format=short-video": "script",
  "/carousel": "carousel",
  "/slideshow": "slideshow",
  "/make/slideshow": "slideshow",
  "/make/wall-of-text": "wall",
  "/make/talking-head": "speaking",
  "/make/explainer": "explainer",
};
/** What the agent's card takes for each of its formats. */
const AGENT_TAKES = (f: AgentFormat): Partial<Record<QuestionId, string>> => (f === "speaking" ? { about: "topic", presenter: "who", length: "length" } : { about: "topic" });

const pathOf = (href: string) => href.split("?")[0];

/** What a maker's address takes, from the address itself: the video editor's AI kinds and panels, then the pages above. */
export function takesOf(href: string, needs?: FormatDef["needs"]): Partial<Record<QuestionId, string>> {
  const [path, search = ""] = href.split("?");
  if (path !== "/edit") return PAGE_TAKES[path] ?? (path.startsWith("/make/static/") ? { about: "note", angle: "angle", product: "product" } : {});
  const q = new URLSearchParams(search);
  const panels = (q.get("panel") ?? "").split(",");
  const kind = q.get("kind");
  if (panels.includes("ai") && kind === "explainer") return { about: "topic", length: "secs" };
  if (panels.includes("ai") && kind === "avatar") return { presenter: "face" };
  if (panels.includes("ai") && kind === "template" && needs === "product-photo") return { product: "product" };
  if (panels.includes("own") || panels.includes("clips")) return { about: "about" };
  return {};
}

// ---- the catalogue ----

const KIND_ICON: Record<string, Icon> = { Words: TextAaIcon, "Slides and pictures": ImageSquareIcon, Video: FilmSlateIcon };

function build(): MakeSkill[] {
  const taken = new Set([...BUILT_IN_SKILLS, ...AGENT_ANSWERS].map((b) => b.slash));
  const idFor = (...names: string[]) => {
    const id = names.map(slugOf).find((x) => x && !taken.has(x)) ?? `make-${taken.size}`;
    taken.add(id);
    return id;
  };
  const known = new Map([...CREATE_FORMATS, ...MORE_FORMATS].map((f) => [f.to, f]));
  const ready = FORMATS.filter((f) => f.ready);
  const out: MakeSkill[] = [];
  // Studio's Create pages, as the agent's sign-ins see them, except the gallery itself
  for (const p of groupedPages(section("write").pages)) {
    if (p.group !== "Create" || p.to === "/make") continue;
    const name = p.leoLabel ?? p.label;
    const kind = kindOf(p.to) ?? CREATE_KINDS[0];
    const agentFormat = AGENT_MAKES[p.to];
    // the price of a format made on this page (Post writes as a text post does), when there is one
    const priced = ready.find((f) => pathOf(formatHref(f)) === p.to);
    out.push({
      id: idFor(name, p.title ?? "", p.to),
      name,
      kind,
      blurb: p.hint ?? known.get(p.to)?.blurb ?? p.title ?? name,
      poster: null,
      icon: known.get(p.to)?.icon ?? KIND_ICON[kind] ?? CaretCircleRightIcon,
      price: priced ? priced.price : null,
      href: p.to,
      ...(agentFormat ? { agentFormat } : {}),
      takes: agentFormat ? AGENT_TAKES(agentFormat) : takesOf(p.to),
      ...(agentFormat === "speaking" ? { lengths: [...TALK_LENGTHS] } : {}),
      was: [p.label, p.title, p.was].filter(Boolean).join(" "),
    });
  }
  // every ready format; one made on a page above (the same address, the same name, or Post's text post) joins it
  for (const f of ready) {
    const href = formatHref(f);
    const agentFormat = AGENT_MAKES[href];
    const poster = f.preview ? { slug: f.slug, src: `/formats/${f.slug}.webp`, video: f.kind === "video", ratio: "9/16" as const } : null;
    const opened = f.opens?.();
    const same = out.find((s) => s.href === href || s.href === opened || s.name.toLowerCase() === f.name.toLowerCase() || (!!agentFormat && s.agentFormat === agentFormat && pathOf(s.href) === pathOf(href)));
    if (same) {
      same.poster ??= poster;
      same.price ??= f.price;
      same.section ??= f.section;
      same.was = `${same.was} ${f.name}`;
      continue;
    }
    // a video format opens straight on its form in the editor, as its page's "Use this format" does
    const page = f.opens ? f.opens() : href;
    const kind = kindOfFormat(f.kind);
    out.push({
      id: idFor(f.slug, f.name),
      name: f.name,
      kind,
      blurb: f.blurb,
      poster,
      icon: KIND_ICON[kind] ?? CaretCircleRightIcon,
      price: f.price,
      href: page,
      ...(agentFormat ? { agentFormat } : {}),
      takes: agentFormat ? AGENT_TAKES(agentFormat) : takesOf(page, f.needs),
      ...(agentFormat === "speaking" ? { lengths: [...TALK_LENGTHS] } : page.includes("kind=explainer") ? { lengths: NARRATED_SECS } : {}),
      was: "",
      section: f.section,
    });
  }
  // the agent's own picture, which has no page of its own: one AI picture from the words, as its card makes it
  out.push({
    id: idFor("picture"),
    name: "Picture",
    kind: CREATE_KINDS[1],
    blurb: "One AI picture from your words, saved to Photos and videos.",
    poster: null,
    icon: ImageSquareIcon,
    price: () => priceOf("ai-image"),
    href: "/media",
    agentFormat: "image",
    takes: { about: "topic" },
    was: "AI image photo",
  });
  // every ready static ad, each one remix-make as its page charges
  for (const f of STATIC_FORMATS) {
    if (!f.ready) continue;
    const href = staticFormatHref(f.slug);
    out.push({
      id: idFor(f.slug, `static-${f.slug}`),
      name: f.name,
      kind: STATIC_KIND,
      blurb: f.blurb,
      poster: { slug: f.slug, src: staticShotSrc(f.slug, 1), video: false, ratio: "4/5" },
      icon: ImageSquareIcon,
      price: () => priceOf("remix-make"),
      href,
      // the agent makes it on the format's layout (its layout card), with the angle and product picked
      agentFormat: "image",
      takes: takesOf(href),
      staticSlug: f.slug,
      was: "static ad",
    });
  }
  return out;
}

export const SKILLS: MakeSkill[] = build();
export const skillById = (id: string | null | undefined): MakeSkill | null => (id ? (SKILLS.find((s) => s.id === id) ?? null) : null);

/** The picker's cards for a tab and a search: every typed word in the name, line, kind or old names, any case. */
export function findSkills(list: MakeSkill[], kind: KindSlug, q: string): MakeSkill[] {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  return list.filter((s) => (kind === "all" || kindSlug(s.kind) === kind) && words.every((w) => `${s.name} ${s.blurb} ${s.kind} ${s.was}`.toLowerCase().includes(w)));
}

// ---- the questions, read from this brand's own data on this device (no AI, no paid read) ----

const LENGTH_LABEL = (n: number) => (n === 60 ? "1 minute" : `${n} seconds`);

/** A skill's questions for this brand: a choice with nothing to choose from is left out. */
export function questionsFor(s: MakeSkill, userId: string): Question[] {
  const t = s.takes;
  const out: Question[] = [];
  if (t.about) {
    const products = loadProducts(userId).items.map((p) => productLabel(p)).filter(Boolean);
    const topics = (loadPositioning(userId)?.topics ?? []).map((x) => x.trim()).filter(Boolean);
    const options = t.about === "offer" ? products : t.about === "q" || t.about === "url" ? [] : topics;
    out.push({ id: "about", ask: ABOUT_ASK[t.about] ?? "What is it about?", options: options.slice(0, 3).map((x) => ({ value: x, label: x })), typed: true, required: true });
  }
  if (t.angle && s.staticSlug) {
    const options = angleOrder(s.staticSlug, usedAngles(userId, s.staticSlug)).map((a) => ({ value: a, label: a }));
    out.push({ id: "angle", ask: "Which angle?", options, typed: false, required: false });
  }
  if (t.product) {
    const options = loadProducts(userId).items.map((p) => ({ value: p.id, label: productLabel(p) || "Untitled" }));
    if (options.length) out.push({ id: "product", ask: "Which product?", options: options.slice(0, 6), typed: false, required: false });
  }
  if (t.presenter) {
    const sp = speakers(userId);
    const options = [
      ...(sp.face ? [{ value: "mine", label: "You" }] : []),
      ...sp.presenters.map((p) => ({ value: p.id, label: p.name || "Your presenter" })),
      { value: "presenter", label: "A new AI presenter" },
    ];
    out.push({ id: "presenter", ask: "Who appears?", options, typed: false, required: false });
  }
  if (t.length && s.lengths?.length) out.push({ id: "length", ask: "How long?", options: s.lengths.map((n) => ({ value: String(n), label: LENGTH_LABEL(n) })), typed: false, required: false });
  return out.slice(0, MAX_QUESTIONS);
}

/**
 * The step to show, 1-based: the address's step when every question before it has an answer, else the first one without;
 * questions + 1 once all have one ("" is a skip). A required question never counts as answered blank.
 */
export function stepOf(qs: Question[], a: Answers, asked: number | null): number {
  const done = (q: Question) => q.id in a && (!q.required || !!a[q.id]?.trim());
  const first = qs.findIndex((q) => !done(q));
  const open = first === -1 ? qs.length + 1 : first + 1;
  return asked !== null && Number.isInteger(asked) && asked >= 1 && asked < open ? asked : open;
}

// ---- where the answers go ----

/** The maker's address with the answers in its own params; a skipped or blank answer leaves its param out. */
export function openHref(s: MakeSkill, a: Answers): string {
  const url = new URL(s.href, "https://studio.local");
  for (const [q, param] of Object.entries(s.takes) as [QuestionId, string][]) {
    const v = a[q]?.trim();
    if (v) url.searchParams.set(param, v);
  }
  return url.pathname + url.search;
}

/** What the agent is sent for a skill it makes itself: the message, its topic, the card's other fields, and its page. */
export function agentAsk(s: MakeSkill, a: Answers): { text: string; topic: string; length?: number; who?: string; layout?: string; angle?: string; product?: string; page?: string; skill?: string } {
  const topic = (a.about ?? "").replace(/\s+/g, " ").trim();
  const length = Number(a.length);
  return {
    text: `${s.name}: ${topic}`,
    topic,
    ...(s.lengths?.includes(length) ? { length } : s.agentFormat === "speaking" ? { length: DEFAULT_LENGTH } : {}),
    ...(a.presenter ? { who: a.presenter } : {}),
    ...(s.staticSlug ? { layout: s.staticSlug, page: openHref(s, a), skill: s.id, ...(a.angle ? { angle: a.angle } : {}), ...(a.product ? { product: a.product } : {}) } : {}),
  };
}

// ---- the pick list for a free-text ask (make-pick, Jev on the server) ----

/** The formats a pick list ranks for the format Jev read in the ask; none for a format that is one make already. */
export function pickCandidates(format: AgentFormat | null): MakeSkill[] {
  const video = (sections: string[], f: AgentFormat) => SKILLS.filter((s) => s.agentFormat === f || (s.kind === "Video" && sections.includes(s.section ?? "")));
  if (format === "image") return SKILLS.filter((s) => s.kind === STATIC_KIND || s.agentFormat === "image" || s.href.startsWith("/image"));
  if (format === "speaking") return video(["person", "own"], "speaking");
  if (format === "explainer") return video(["animated", "words"], "explainer");
  if (format === "post") return SKILLS.filter((s) => s.kind === CREATE_KINDS[0]);
  return [];
}

/**
 * A pick from a pick list (its number, or Surprise me): the agent says which, the topic it was asked about is kept as
 * the first answer, and the skill comes back for its questions. Null when the pick isn't on the list.
 */
export function pickFrom(userId: string, threadId: string, msg: Pick<AgentMsg, "picks" | "topic">, n: number | "surprise", now = new Date()): MakeSkill | null {
  const ids = msg.picks ?? [];
  const s = skillById(n === "surprise" ? ids[Math.floor(Math.random() * ids.length)] : ids[n]);
  if (!s) return null;
  appendMsg(userId, threadId, newMsg("agent", { text: `You picked ${s.name}.`, turn: "done" }, now), now);
  saveFlow(userId, { skill: s.id, answers: msg.topic?.trim() ? { about: msg.topic.trim() } : {}, at: now.toISOString() });
  return s;
}

/** The pick list waiting under the newest agent message, if it is the last word in the thread. */
export function openPicks(messages: AgentMsg[]): AgentMsg | null {
  const last = messages[messages.length - 1];
  return last?.role === "agent" && last.picks?.length ? last : null;
}

// ---- the open skill's answers on this device ----

export interface MakeFlow {
  skill: string;
  answers: Answers;
  /** Words typed into a question and not yet answered with, so a reload keeps them. */
  typing?: Answers;
  at: string;
}
export const flowKey = (userId: string) => `content-studio-makeflow-${scoped(userId)}`;

export function loadFlow(userId: string): MakeFlow | null {
  try {
    const v = JSON.parse(localStorage.getItem(flowKey(userId)) ?? "null") as MakeFlow | null;
    return v && typeof v.skill === "string" && v.answers && typeof v.answers === "object" ? v : null;
  } catch {
    return null;
  }
}

/** Saves the open skill's answers, or clears them with null; false when storage refused, so the caller keeps them in memory. */
export function saveFlow(userId: string, flow: MakeFlow | null): boolean {
  try {
    if (flow) localStorage.setItem(flowKey(userId), JSON.stringify(flow));
    else localStorage.removeItem(flowKey(userId));
    return true;
  } catch {
    return false;
  }
}

/** The answers kept for this skill, or none when the kept ones are another skill's. */
export const answersFor = (userId: string, skill: string): Answers => {
  const f = loadFlow(userId);
  return f?.skill === skill ? f.answers : {};
};
