// "Make it as a photo" on a static format's page (/make/static/<slug>): the format's scene plus the words the static
// make writes for the brand, sent to the picture maker (ai-image, GPT Image 2.6 Flare) as one prompt that quotes every
// on-picture string, so the made ad reads like the format's examples. The ad is about the brand's product (the one the
// note names, else the first in use): the writer gets its facts and the prompt its name and line. One remix make writes
// the words into a new drawn design first (startImageWrite, the drawn make's own write, so that design stays in Your
// images too), then one ai-image make with its words flag (no "No text" rule, no Soul v2 fallback) and the brand kit's
// logo and the product's own picture as pictures for the model to put in (the logo where the format carries a brand
// mark) keeps the photo in Media under AI images, cut from the model's 3:4 to the examples' 4:5 (makeImage's ratio; the
// prompt keeps words clear of the cut edges). The run lives outside React, as MemeOptions' pictures do, so leaving the
// page keeps it, and it mirrors its step into formatJob for /library's Making now. A reload forgets the run; the
// picture's paid token is picked up by resumeImage, still lands in Media, and the page shows it again from the picture
// job (shownPhotoAd).

import { useEffect, useState } from "react";
import { staticFormatHref, type StaticFormat } from "@/data/staticFormats";
import { AI_FOLDER, imageBusy, imageJob, makeImage, type ImageJob } from "@/lib/aiImage";
import { DEFAULT_BRAND, loadBrand } from "@/lib/carousel";
import { setFormatJob } from "@/lib/formatJob";
import { IMAGE_FIELDS, isStatic, mainWords, staticPhoto } from "@/lib/imageLayout";
import { WRITE_FAILED, blankImage, imageById, imageMention, imageWrite, imageWriteBusy, saveImage, startImageWrite } from "@/lib/images";
import { getFile } from "@/lib/deviceFiles";
import { links } from "@/lib/links";
import { adFacts, adProduct, loadProducts, type Product } from "@/lib/products";
import { ownBrandName } from "@/lib/remixBrand";
import { scalePicture } from "@/lib/remixLink";
import { MAX_PROMPT } from "../../supabase/functions/ai-image/logic.ts";

/** ai-image makes 3:4 and the photo is kept 4:5, cut from the middle: a little goes off the top and the bottom. */
export const PHOTO_RATIO = 4 / 5;
export const PHOTO_EDGES = "Keep all text well clear of the top and bottom edges.";
export const PHOTO_PEOPLE = "People, when the scene shows any, are Singaporean adults.";
export const PHOTO_RULE = "All text spelled exactly as quoted. No other logos, brands or watermarks.";

/** One string as the prompt quotes it: on one line, a double quote inside it made a single one so the quote stays whole. */
const quoted = (s: string) => `"${s.replace(/\s+/g, " ").trim().replace(/"/g, "'")}"`;

/** The product the ad shows, in plain words with no double quote, so it never reads as words to print. */
export const productLine = (p: { name: string; what: string }) => {
  const plain = (t: string) => t.replace(/\s+/g, " ").replace(/"/g, "'").trim().replace(/[.\s]+$/, "");
  return `The ad shows the brand's product itself: ${plain(p.name)}${plain(p.what) ? `, ${plain(p.what)}` : ""}.`;
};

/**
 * The picture maker's prompt for a static format made as a photo: its scene, the brand's name and colour, the product the
 * ad is about when there is one, every on-picture string of its layout in draw order (IMAGE_FIELDS, a typed price
 * included), each labelled and in double quotes, the edge line (the 4:5 cut must not clip a word), the people line and
 * the spelling rule. Words the layout never draws (the topic, the caption) stay out, and a brand with no name is given by
 * its colour alone. Pure.
 */
export function photoAdPrompt(f: Pick<StaticFormat, "slug" | "scene">, brand: { name: string; color: string }, words: Record<string, string>, product?: { name: string; what: string }): string {
  const fields = isStatic(f.slug) ? IMAGE_FIELDS[f.slug] : [];
  const on = fields.filter((x) => words[x.key]?.trim()).map((x) => `${x.label}: ${quoted(words[x.key])}`);
  const name = brand.name.trim();
  return [
    f.scene,
    name ? `The brand is ${quoted(name)}, its colour ${brand.color}.` : `The brand colour is ${brand.color}.`,
    product ? productLine(product) : "",
    on.length ? `The words on it, in order: ${on.join("; ")}.` : "",
    PHOTO_EDGES,
    PHOTO_PEOPLE,
    PHOTO_RULE,
  ]
    .filter(Boolean)
    .join(" ");
}

export interface PhotoAd {
  seq: number;
  slug: string;
  /** The drawn design its words were written into, kept in Your images ("" when shown from a resumed picture job). */
  designId: string;
  state: "writing" | "making" | "done" | "failed";
  error?: string;
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

export async function startPhotoAd(userId: string, f: StaticFormat, format: { topic: string; pictureKey?: string; price?: string }): Promise<void> {
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
  const sold = adProduct(loadProducts(userId).items, format.topic);
  const product = sold ? adFacts(sold) : undefined;
  await startImageWrite(userId, { designId: design.id, source: null, topic: format.topic, layout: slug, mention: imageMention(userId), note: "", size: design.size, read: false, ...(product ? { product } : {}) });
  const w = imageWrite();
  const words = imageById(userId, design.id)?.words ?? {};
  if (w?.designId !== design.id || w.state !== "done" || !mainWords(slug, words)) return set({ ...base, state: "failed", error: w?.error || WRITE_FAILED });
  const kit = loadBrand(userId) ?? DEFAULT_BRAND;
  const brand = { name: ownBrandName(userId), color: kit.color };
  const full = photoAdPrompt(f, brand, words, product);
  // the words are the ad: a product line that would push them over the cap is the part left out
  const prompt = full.length > MAX_PROMPT && product ? photoAdPrompt(f, brand, words) : full;
  if (prompt.length > MAX_PROMPT) return set({ ...base, state: "failed", error: TOO_LONG });
  set({ ...base, state: "making" });
  // the kit's logo and the product's own picture go as pictures the model puts in (ai-image refs); with no logo the name
  // in the words is the mark, and with no picture the product line describes it
  const picture = sold ? await productPicture(sold) : undefined;
  const refs = { ...(kit.logo ? { logo: kit.logo } : {}), ...(picture ? { product: picture } : {}) };
  await makeImage(userId, prompt, `${f.name}: ${mainWords(slug, words)}`, undefined, undefined, { words: true, ratio: PHOTO_RATIO, ...(refs.logo || refs.product ? { refs } : {}) });
  const j = imageJob();
  if (j?.state !== "done" || !j.mediaKey) return set({ ...base, state: "failed", error: j?.error || NOT_MADE });
  set({ ...base, state: "done", mediaKey: j.mediaKey, preview: j.preview });
}
