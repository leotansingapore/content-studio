// "Make it as a photo" on a static format's page (/make/static/<slug>): the format's scene plus the words the static
// make writes for the brand, sent to the picture maker (ai-image, GPT Image 2.6 Flare) as one prompt that quotes every
// on-picture string, so the made ad reads like the format's examples. The ad is about the brand's product (the one the
// note names, else the first in use): the writer gets its facts and the prompt its name and line. One remix make writes
// the words into a new drawn design first (startImageWrite, the drawn make's own write, so that design stays in Your
// images too), then one ai-image make with its words flag (no "No text" rule, no Soul v2 fallback) and the brand kit's
// logo and the product's own picture as pictures for the model to put in (the logo where the format carries a brand
// mark) keeps the photo in Media under AI images, made at the examples' 4:5 by ai-image and kept whole, so no edge is
// ever cut off. Each make takes an ad angle: the brand's four least recently used for the format go to the writer, Jev
// picks one (the first when it can't), and the one taken is remembered for next time. The run lives outside React, as
// MemeOptions' pictures do, so leaving the page keeps it, and it mirrors its step into formatJob for /library's Making
// now. A reload forgets the run; the picture's paid token is picked up by resumeImage, still lands in Media, and the
// page shows it again from the picture job (shownPhotoAd).
import { useEffect, useState } from "react";
import { STATIC_SHOTS, staticFormatHref, type StaticFormat } from "@/data/staticFormats";
import { AI_FOLDER, imageBusy, imageJob, makeImage, type ImageJob } from "@/lib/aiImage";
import { DEFAULT_BRAND, loadBrand } from "@/lib/carousel";
import { setFormatJob } from "@/lib/formatJob";
import { IMAGE_FIELDS, isStatic, mainWords, staticPhoto } from "@/lib/imageLayout";
import { WRITE_FAILED, blankImage, imageById, imageMention, imageWrite, imageWriteBusy, saveImage, startImageWrite } from "@/lib/images";
import { getFile } from "@/lib/deviceFiles";
import { links } from "@/lib/links";
import { loadPositioning } from "@/lib/positioning";
import { adFacts, adProduct, loadProducts, type Product } from "@/lib/products";
import { scoped } from "@/lib/profiles";
import { ownBrandName } from "@/lib/remixBrand";
import { scalePicture } from "@/lib/remixLink";
import { loadScriptContext } from "@/lib/scriptContext";
import { cutAtWord } from "@/lib/scriptCaption";
import { isOn, loadFacts } from "@/lib/voiceMemory";
import { MAX_PROMPT } from "../../supabase/functions/ai-image/logic.ts";
import { STATIC_ANGLES, type AdProduct, type Subject } from "../../supabase/functions/remix/logic.ts";

/** The only writing on the picture (a 13 Nov poster printed a price nobody asked for beside the logo). */
export const PHOTO_RULE = "Only the quoted words, spelled exactly, and the logo are written on it: no prices, dates, phone numbers, web addresses or small print, on screens and footers too. No other logos or watermarks.";

/** A clause that names a price or a figure: a digit or a currency. */
const PRICED = /\d|[$€£¥₹]|\b(SGD|USD|MYR|AUD|EUR|GBP|IDR|RM|Rp|dollars?|cents?)\b/i;

/** Text with every clause holding a digit or a currency left out and the rest kept, so a picture is never handed a price. */
export function withoutPrices(text: string): string {
  // a priced aside in brackets goes whole, then each clause between punctuation is kept or left out
  const parts = text.replace(/\s*\([^)]*\)/g, (m) => (PRICED.test(m) ? "" : m)).split(/([.;,!?]+\s*)/);
  let out = "";
  for (let i = 0; i < parts.length; i += 2) if (parts[i].trim() && !PRICED.test(parts[i])) out += parts[i] + (parts[i + 1] ?? "");
  return out.replace(/[\s,;]+$/, "").trim();
}

/** A format that prints a price the brand typed itself (the tear-off flyer): only there may a figure reach the picture. */
const typedPrice = (slug: string) => isStatic(slug) && IMAGE_FIELDS[slug].some((x) => x.key === "price" && x.typed);

/** One string as the prompt quotes it: on one line, a double quote inside it made a single one so the quote stays whole. */
const quoted = (s: string) => `"${s.replace(/\s+/g, " ").trim().replace(/"/g, "'")}"`;

/**
 * What the picture shows of what the brand sells, on a format with room for it (StaticFormat.room): software on its own plain
 * screen, a product itself, a service being done. Never a stock person holding a phone (13 Nov poster).
 */
export const SUBJECT_LINES: Record<Subject, string> = {
  software: "What it sells is software: wherever the picture shows what is sold, it is the product's own screen on a phone or laptop, a plain, plausible interface in the brand colour showing the thing the words name, not people holding phones. No real app's interface, no other app's icons or logos inside the screen, only the brand's own, and no readable small print.",
  product: "What it sells is a physical product: show the product itself, held or in use, not a person holding a phone.",
  service: "What it sells is a service: show the service being done for someone, not a person holding a phone.",
};

/** What the brand sells: Jev's read on the write, else What you sell's own kind when the brand picked one; else nothing. */
export const subjectOf = (jev: Subject | undefined, kind: "products" | "service" | undefined): Subject | undefined =>
  jev ?? (kind === "products" ? "product" : kind === "service" ? "service" : undefined);

/** The product the ad shows, in plain words with no double quote, so it never reads as words to print. */
export const productLine = (p: { name: string; what: string }) => {
  const plain = (t: string) => t.replace(/\s+/g, " ").replace(/"/g, "'").trim().replace(/[.\s]+$/, "");
  return `The ad shows the brand's product itself: ${plain(p.name)}${plain(p.what) ? `, ${plain(p.what)}` : ""}.`;
};

/**
 * The picture maker's prompt for a static format made as a photo: its scene, the brand's name and colour, the product the
 * ad is about when there is one and the format has room for it, what to show of what it sells (SUBJECT_LINES, on a format with room for a picture of
 * it, StaticFormat.room), every on-picture string of its layout in draw order (IMAGE_FIELDS, a typed price included), each labelled and in
 * double quotes, and the rule on what is written (ai-image adds the setting and who may be in it). Words the layout never draws (the topic,
 * the caption) stay out, and a brand with no name is given by its colour alone. Pure.
 */
export function photoAdPrompt(f: Pick<StaticFormat, "slug" | "scene" | "room" | "flat">, brand: { name: string; color: string }, words: Record<string, string>, product?: { name: string; what: string }, subject?: Subject): string {
  const fields = isStatic(f.slug) ? IMAGE_FIELDS[f.slug] : [];
  const on = fields.filter((x) => words[x.key]?.trim()).map((x) => `${x.label}: ${quoted(words[x.key])}`);
  const name = brand.name.trim();
  return [
    f.scene,
    name ? `The brand is ${quoted(name)}, its colour ${brand.color}.` : `The brand colour is ${brand.color}.`,
    product && f.room ? productLine(typedPrice(f.slug) ? product : { name: product.name.split(/\s+/).filter((w) => !PRICED.test(w)).join(" "), what: withoutPrices(product.what) }) : "",
    subject && f.room ? SUBJECT_LINES[subject] : "",
    on.length ? `The words on it, in order: ${on.join("; ")}.` : "",
    PHOTO_RULE,
  ]
    .filter(Boolean)
    .join(" ");
}

// ---- the ad angle each make takes (remix STATIC_ANGLES), remembered per brand and format ----

/** How many of a format's least recently used angles Jev picks from: the brand's last 8 there never come back next. */
export const ANGLE_POOL = 4;
const ANGLES = "content-studio-static-angles-";

/** A format's angles this brand took, the latest first. */
export function usedAngles(userId: string, slug: string): string[] {
  try {
    const list = JSON.parse(localStorage.getItem(ANGLES + scoped(userId)) ?? "{}")?.[slug];
    return Array.isArray(list) ? list.filter((a): a is string => typeof a === "string") : [];
  } catch {
    return [];
  }
}

export function rememberAngle(userId: string, slug: string, angle: string): void {
  try {
    const raw = JSON.parse(localStorage.getItem(ANGLES + scoped(userId)) ?? "{}");
    const all = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    const list = [angle, ...usedAngles(userId, slug).filter((a) => a !== angle)].slice(0, Object.keys(STATIC_ANGLES).length);
    localStorage.setItem(ANGLES + scoped(userId), JSON.stringify({ ...all, [slug]: list }));
  } catch {
    // storage full: the next make starts the rotation again, nothing else is lost
  }
}

/**
 * How many of the brand's last openings, across every static format, the writer is told not to reuse: three posters
 * opened "Heading home with", and two formats in a row both opened "Start managing" (14 Nov).
 */
export const OPENINGS_KEPT = 10;
/** An opening as kept: the first four words of the ad's main line. */
export const openingOf = (main: string) => main.replace(/\s+/g, " ").trim().split(" ").slice(0, 4).join(" ");

/** The brand's last openings on any static format, the latest first, kept beside its angles in the same synced key. */
export function recentOpenings(userId: string): string[] {
  try {
    const list = JSON.parse(localStorage.getItem(ANGLES + scoped(userId)) ?? "{}")?.openings;
    // a list from before openings were kept across formats was one per format: it reads as none
    return Array.isArray(list) ? list.filter((o): o is string => typeof o === "string" && !!o.trim()).slice(0, OPENINGS_KEPT) : [];
  } catch {
    return [];
  }
}

export function rememberOpening(userId: string, main: string): void {
  const opening = openingOf(main);
  if (!opening) return;
  try {
    const raw = JSON.parse(localStorage.getItem(ANGLES + scoped(userId)) ?? "{}");
    const all = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    const list = [opening, ...recentOpenings(userId).filter((o) => o.toLowerCase() !== opening.toLowerCase())].slice(0, OPENINGS_KEPT);
    localStorage.setItem(ANGLES + scoped(userId), JSON.stringify({ ...all, openings: list }));
  } catch {
    // storage full: the next make just isn't told this opening
  }
}

/** The angles in the order to offer them: the never used first (the format's own examples' angles ahead), then the oldest used. Pure. */
export function angleOrder(slug: string, used: string[]): string[] {
  const all = [...new Set([...(STATIC_SHOTS[slug] ?? []).map(([, a]) => a), ...Object.keys(STATIC_ANGLES)])].filter((a) => a in STATIC_ANGLES);
  const recent = used.filter((a) => all.includes(a));
  return [...all.filter((a) => !recent.includes(a)), ...[...recent].reverse()];
}

/** The first three words of the format's sample ad: the words never open on them. */
export const sampleOpening = (f: Pick<StaticFormat, "slug" | "example">) => (isStatic(f.slug) && f.example ? mainWords(f.slug, f.example) : "").split(/\s+/).filter(Boolean).slice(0, 3).join(" ");

export interface PhotoAd {
  seq: number;
  slug: string;
  /** The drawn design its words were written into, kept in Your images ("" when shown from a resumed picture job). */
  designId: string;
  state: "writing" | "making" | "done" | "failed";
  error?: string;
  /** The ad angle the words took, once written (remix sends it back). */
  angle?: string;
  /** Done: the photo's Media key and a data URL to show it. */
  mediaKey?: string;
  preview?: string;
}

export const PHOTO_STEP = { writing: "Writing your words...", making: "Making the photo..." } as const;
export const TOO_LONG = "These words are too long for one photo. Press again for shorter ones.";
const NOT_MADE = "Couldn't make the photo. Try again.";

let run: PhotoAd | null = null;
let seq = 0;
const listeners = new Set<(p: PhotoAd | null) => void>();
const set = (next: PhotoAd) => {
  run = next;
  listeners.forEach((l) => l({ ...next }));
  // the drawn write mirrors itself as "static-ad" (images.ts) while it runs; the photo's step then takes the same slot
  const href = next.mediaKey ? links.media({ folder: AI_FOLDER, item: next.mediaKey }) : staticFormatHref(next.slug);
  if (next.state === "done") setFormatJob({ slug: "static-ad", label: "Static ad", format: "image", state: "ready", href });
  else if (next.state === "failed") setFormatJob({ slug: "static-ad", label: "Static ad", format: "image", state: "failed", error: next.error, href });
  else setFormatJob({ slug: "static-ad", label: "Static ad", format: "image", state: "working", step: PHOTO_STEP[next.state], href });
};
export const photoAd = () => run;
export const photoAdBusy = () => run?.state === "writing" || run?.state === "making";

/**
 * The run a format's page shows: its own, else, after a reload forgot the run, the picture job resumeImage picked up
 * when that job's prompt opens with this format's scene (photoAdPrompt starts with it). A fix is never shown as a make.
 */
export function shownPhotoAd(f: Pick<StaticFormat, "slug" | "scene">, run: PhotoAd | null, picture: ImageJob | null): PhotoAd | null {
  if (run) return run.slug === f.slug ? run : null;
  if (!picture || picture.fix || !picture.prompt.startsWith(`${f.scene} `)) return null;
  const state = picture.state === "done" ? "done" : picture.state === "failed" ? "failed" : "making";
  return { seq: 0, slug: f.slug, designId: "", state, ...(picture.error ? { error: picture.error } : {}), ...(picture.mediaKey ? { mediaKey: picture.mediaKey, preview: picture.preview } : {}) };
}

export function usePhotoAd(): PhotoAd | null {
  const [p, setP] = useState(photoAd);
  useEffect(() => {
    listeners.add(setP);
    return () => void listeners.delete(setP);
  }, []);
  return p;
}

/**
 * Writes the format's words for the brand into a new drawn design, then makes them into one photo. `format` is what
 * the drawn make carries (staticMake: the topic, and the product photo or price where the format uses them). Nothing
 * is spent on a picture when the words didn't come, or came too long for ai-image's prompt.
 */
/** The most an ad make's product line carries (remix parseProduct's limit for `what`). */
export const AD_FACTS_MAX = 400;

/**
 * What the ad is about when the brand has no product in use: its most concrete saved facts, in this order, each once:
 * the script desk's Product while it is on (what it is, how it works, what you get, its proof line), the positioning's
 * edge and one-liner (typed, or filled in by the website read), then the brand's own saved facts (Your memory, where an
 * App Store read's proof lines land). Named by that Product, else the brand; null with no name or nothing saved.
 */
export function brandAdFacts(userId: string): AdProduct | null {
  const { product: desk } = loadScriptContext(userId);
  const pos = loadPositioning(userId);
  const sentence = (t: string | undefined) => (t ?? "").replace(/\s+/g, " ").trim().replace(/[.\s]+$/, "");
  const own = desk.on ? [desk.what, desk.how.split("\n").map(sentence).filter(Boolean).join(", "), desk.gets, desk.proof] : [];
  const facts = [...own, pos?.edge, pos?.oneLiner, ...loadFacts(userId).filter(isOn).map((f) => f.text)].map(sentence).filter(Boolean);
  const unique = facts.filter((f, i) => facts.findIndex((x) => x.toLowerCase() === f.toLowerCase()) === i);
  const name = (desk.on && desk.name.trim()) || ownBrandName(userId);
  if (!name || !unique.length) return null;
  return { name: name.slice(0, 60), what: cutAtWord(`${unique.join(". ")}.`, AD_FACTS_MAX), forWho: cutAtWord((desk.on && desk.who.trim()) || pos?.audienceDetail.trim() || "", 120) };
}

/**
 * The product's first picture as a JPEG data URL within ai-image's limit, or undefined: none, a named insurer product
 * (its picture carries the insurer's brand), or one this device can't read.
 * shortcut: only a picture already on this device; another device's is fetched on the Products page, not here.
 */
async function productPicture(p: Product): Promise<string | undefined> {
  if (!p.pictures[0] || p.namedProduct) return undefined;
  const blob = await getFile(p.pictures[0]).catch(() => undefined);
  return blob ? scalePicture(blob).catch(() => undefined) : undefined;
}

/** `angle` (one of STATIC_ANGLES) and `product` (a saved product's id), when the person picked them: that angle, that product. */
export async function startPhotoAd(userId: string, f: StaticFormat, format: { topic: string; pictureKey?: string; price?: string; angle?: string; product?: string }): Promise<void> {
  const slug = f.slug;
  if (photoAdBusy() || imageWriteBusy() || imageBusy() || !isStatic(slug)) return;
  const design = {
    ...blankImage({ layout: slug }),
    words: { topic: format.topic, ...(format.price ? { price: format.price } : {}) },
    ...(format.pictureKey && staticPhoto(slug) ? { pictureKey: format.pictureKey } : {}),
  };
  saveImage(userId, design);
  const base = { seq: ++seq, slug, designId: design.id };
  set({ ...base, state: "writing" });
  const items = loadProducts(userId).items;
  const sold = items.find((p) => p.id === format.product) ?? adProduct(items, format.topic);
  // no product in use: the brand's most concrete saved facts, so the words still name one thing it does
  const product = sold ? adFacts(sold) : (brandAdFacts(userId) ?? undefined);
  const angles = format.angle && format.angle in STATIC_ANGLES ? [format.angle] : angleOrder(slug, usedAngles(userId, slug)).slice(0, ANGLE_POOL);
  const avoid = sampleOpening(f);
  const openings = recentOpenings(userId);
  await startImageWrite(userId, { designId: design.id, source: null, topic: format.topic, layout: slug, mention: imageMention(userId), note: "", size: design.size, read: false, angles, ...(avoid ? { avoid } : {}), ...(openings.length ? { openings } : {}), ...(product ? { product } : {}) });
  const w = imageWrite();
  const words = imageById(userId, design.id)?.words ?? {};
  if (w?.designId !== design.id || w.state !== "done" || !mainWords(slug, words)) return set({ ...base, state: "failed", error: w?.error || WRITE_FAILED });
  // the words are written: their angle and opening count as used whatever happens to the picture
  if (w.angle) rememberAngle(userId, slug, w.angle);
  rememberOpening(userId, mainWords(slug, words));
  const made = { ...base, ...(w.angle ? { angle: w.angle } : {}) };
  const kit = loadBrand(userId) ?? DEFAULT_BRAND;
  const brand = { name: ownBrandName(userId), color: kit.color };
  // the picture gets the product's name and its first words, not every fact the writer read
  const named = product && { name: product.name, what: cutAtWord(product.what, 160) };
  const subject = subjectOf(w.subject, loadProducts(userId).kind);
  // the words are the ad: over the cap, the product line goes first, then what to show
  const prompt = [photoAdPrompt(f, brand, words, named, subject), photoAdPrompt(f, brand, words, undefined, subject), photoAdPrompt(f, brand, words)].find((p) => p.length <= MAX_PROMPT) ?? photoAdPrompt(f, brand, words);
  if (prompt.length > MAX_PROMPT) return set({ ...made, state: "failed", error: TOO_LONG });
  set({ ...made, state: "making" });
  // the kit's logo and the product's own picture go as pictures the model puts in (ai-image refs); with no logo the name
  // in the words is the mark, and with no picture the product line describes it
  // the product's picture only where the format pictures what is sold: never on a type-only card or a chat
  const picture = sold && f.room ? await productPicture(sold) : undefined;
  const refs = { ...(kit.logo ? { logo: kit.logo } : {}), ...(picture ? { product: picture } : {}) };
  await makeImage(userId, prompt, `${f.name}: ${mainWords(slug, words)}`, undefined, undefined, { words: true, ...(refs.logo || refs.product ? { refs } : {}), ...(f.flat ? { flat: true as const } : {}) });
  const j = imageJob();
  if (j?.state !== "done" || !j.mediaKey) return set({ ...made, state: "failed", error: j?.error || NOT_MADE });
  set({ ...made, state: "done", mediaKey: j.mediaKey, preview: j.preview });
}
