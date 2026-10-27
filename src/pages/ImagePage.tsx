// /image (docs/north-star/items/formats-static-ad.md): one designed picture in the brand (a headline ad, a quote
// card, a stat card or a client testimonial) in the sizes a post needs, drawn in the browser from the carousel's
// drawing code, so the words are always sharp and drawing costs nothing. "Write it for me" is one remix make (as
// "image") run outside React (src/lib/images.ts); designs are kept per brand in "Your images". Leo's sign-ins only
// (useLeoUser, so ?asLeo=1 works on localhost); anyone else, by nav or typed URL, gets NotFound.
// Memes (docs/north-star/items/formats-memes.md) are five more layouts in a Meme group: "Write 3 memes" is one remix
// make (as "meme") with Jev's safety cut and "Best", and the picture is made, from Media or free stock
// (src/components/image/MemeOptions.tsx). A meme is 4:5, 1:1 or 9:16 and starts on Square.
//
// URL (docs/deep-links.md): layout and size replace, defaults left out; source=<RemixSource key> is read once into a
// new design and then removed; image=<saved id> opens a design, and the address takes it once an edit is kept
// (replace); pick=media|make|stock opens a picture picker (replace; stock is a meme's); ad=1 opens Run as an ad over
// the design (push; docs/adlauncher-ads.md). A write on arrival comes only from navigation state { go: true } (the
// Remix sheet's "Also make: Static ad" or "Meme", under US$1), never from a URL param.

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { AlertTriangle, Check, Download, ImagePlus, Loader2, Megaphone, Plus, Send, Sparkles, UserRound, X as XIcon } from "lucide-react";
import ComplianceChips from "@/components/ComplianceChips";
import CopyLinkButton from "@/components/CopyLinkButton";
import FormatShell from "@/components/make/FormatShell";
import PriceChip from "@/components/PriceChip";
import { PostItForMePanel } from "@/components/PostItForMe";
import AdsResults from "@/components/image/AdsResults";
import RunAsAdSheet from "@/components/image/RunAsAdSheet";
import { MemeOptions, MemePicture, MediaThumb, memePictures, memeSetFor, memeWriteBusy, MEME_STEP, startMemeWrite, useMemePictures, useMemeWrite } from "@/components/image/MemeOptions";
import FlagChips from "@/components/remix/FlagChips";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FilterChip } from "@/components/ui/filter-chip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useDraftReviews } from "@/hooks/useDraftReviews";
import { useUsesLeft } from "@/lib/aiUsage";
import { AI_FOLDER, imageBusy, imageJob, makeImage, onImageJob, resumeImage, type ImageJob } from "@/lib/aiImage";
import { DEFAULT_BRAND, loadBrand, slugify } from "@/lib/carousel";
import { SLIDE_FONTS, renderSvg, type SlideFont, type SlidePaper } from "@/lib/carouselLayout";
import { createCanvasMeasure, downloadBlob, svgDataUrl } from "@/lib/carouselRender";
import { scanCompliance } from "@/lib/compliance";
import { getFile, putFile } from "@/lib/deviceFiles";
import { draftsChanged, getDraftById, newDraftId, setDraftAttached, upsertDraft, type DraftEntry } from "@/lib/draftHistory";
import {
  AD_LAYOUT_IDS,
  IMAGE_FIELDS,
  LAYOUT_LABELS,
  MEME_LAYOUT_IDS,
  MEME_SIZE,
  SECOND_PICTURE,
  SIZE_INFO,
  countOf,
  imageBlock,
  isMeme,
  layoutImage,
  mainWords,
  optionIndex,
  pictureBlock,
  secondPicture,
  sizesFor,
  type AdLayoutId,
  type ImageInput,
  type ImageSize,
} from "@/lib/imageLayout";
import {
  HEADSHOT,
  blankImage,
  cachedShows,
  imageById,
  imageDraft,
  imageWrite,
  imageWriteBusy,
  loadImages,
  onImageWrite,
  onImagesChanged,
  pictureLine,
  postFileKey,
  saveImage,
  startImageWrite,
  swipePicture,
  writeStep,
  type ImageWrite,
  type SavedImage,
} from "@/lib/images";
import { links, type ImageLayout } from "@/lib/links";
import { loadMedia, type MediaItem } from "@/lib/mediaLibrary";
import { priceOf, sumPrices } from "@/lib/prices";
import { brandName, loadRemixPrefs, speakerFor } from "@/lib/remixBrand";
import { noteKey, rememberSource, seenSources, type RemixSource } from "@/lib/remixSource";
import { resolveSource } from "@/lib/resolveSource";
import { ago } from "@/lib/slideshow";
import { socialConnectShown } from "@/lib/socialConnect";
import { useLeoUser } from "@/lib/useLeoOnly";
import { useUrlItem, useUrlState, useUrlUpdate } from "@/lib/urlState";
import { cn } from "@/lib/utils";
import NotFoundPage from "@/pages/NotFoundPage";

const FIELD_LABEL = "text-xs font-semibold text-muted-foreground";
const TOUCH = "[@media(pointer:coarse)]:min-h-11";
const PAPERS: { id: SlidePaper; label: string }[] = [
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
  { id: "tint", label: "Brand tint" },
];
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function ImagePage() {
  const leo = useLeoUser();
  if (leo === undefined) return <div className="min-h-[40vh]" aria-busy="true" />;
  if (!leo) return <NotFoundPage />;
  return <ImageEditor userId={leo.id} />;
}

/** The design's PNG (or JPEG, for an ad) at its own pixel size (carouselRender's svgToPng draws 1080x1350 only). */
async function svgPng(svg: string, width: number, height: number, type: "image/png" | "image/jpeg" = "image/png"): Promise<Blob> {
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("The image couldn't be drawn."));
    img.src = svgDataUrl(svg);
  });
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser can't draw images.");
  ctx.drawImage(img, 0, 0, width, height);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("The image couldn't be created."))), type, 0.92));
}

const blobDataUrl = (b: Blob) =>
  new Promise<string>((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => resolve("");
    r.readAsDataURL(b);
  });

/** The note typed in the Remix sheet for this post, or "". */
function sheetNote(key: string): string {
  try {
    return localStorage.getItem(noteKey(key)) ?? "";
  } catch {
    return "";
  }
}

/** "Singlife, 40 days running": the original named under its picture. */
const sourceLabel = (s: RemixSource) => [s.author || s.title || "The original", s.numbers?.daysRunning ? `${s.numbers.daysRunning} days running` : ""].filter(Boolean).join(", ");

const hasContent = (img: SavedImage) => Object.values(img.words).some((w) => w.trim()) || !!img.pictureKey || !!img.source;

function useWrite(): ImageWrite | null {
  const [w, setW] = useState(imageWrite);
  useEffect(() => onImageWrite(setW), []);
  return w;
}

function usePictureJob(): ImageJob | null {
  const [j, setJ] = useState(imageJob);
  useEffect(() => onImageJob(setJ), []);
  return j;
}

/** The design's picture as a data URL (so it draws into a PNG too), and whether this device holds it. */
function usePicture(key: string | undefined, photo: string | undefined): { url?: string; found?: boolean } {
  const [got, setGot] = useState<{ key: string; url: string } | null>(null);
  useEffect(() => {
    if (!key || key === HEADSHOT) return;
    let live = true;
    void getFile(key)
      .catch(() => undefined)
      .then(async (b) => {
        const url = b ? await blobDataUrl(b) : "";
        if (live) setGot({ key, url });
      });
    return () => {
      live = false;
    };
  }, [key]);
  if (!key) return {};
  if (key === HEADSHOT) return { url: photo, found: !!photo };
  if (got?.key !== key) return {};
  return got.url ? { url: got.url, found: true } : { found: false };
}

function ImageEditor({ userId }: { userId: string }) {
  const [params] = useSearchParams();
  const location = useLocation();
  const update = useUrlUpdate();
  const { toast } = useToast();
  const speaker = useMemo(() => loadRemixPrefs(userId).speaker ?? speakerFor(userId), [userId]);
  // decision 12: a client testimonial only for a business's brand, never an adviser's
  const layouts = useMemo(() => AD_LAYOUT_IDS.filter((l) => l !== "testimonial" || speaker === "business"), [speaker]);
  const [layout] = useUrlState<ImageLayout>("layout", "headline", { allowed: [...layouts, ...MEME_LAYOUT_IDS] });
  const meme = isMeme(layout);
  const [size] = useUrlState<ImageSize>("size", "4x5", { allowed: sizesFor(layout) });
  const [pick] = useUrlState<"none" | "media" | "make" | "stock">("pick", "none", { allowed: ["none", "media", "make", "stock"] });
  const imageId = params.get("image");
  const sourceKey = params.get("source");
  const kit = useMemo(() => loadBrand(userId), [userId]);
  const brand = kit ?? DEFAULT_BRAND;
  const brandLabel = useMemo(() => brandName(userId), [userId]);
  const measure = useMemo(() => createCanvasMeasure(), []);
  const write = useWrite();
  const mw = useMemeWrite();
  const writing = (!!write && imageWriteBusy()) || (!!mw && memeWriteBusy());
  const pictures = useMemePictures();
  const leftOf = useUsesLeft(writing || pictures?.state === "working");
  const pictureJob = usePictureJob();

  // ---- the open design ----
  const [img, setImg] = useState<SavedImage>(() => imageById(userId, imageId) ?? blankImage({ layout, size }));
  const [gone, setGone] = useState(false);
  const [sourceGone, setSourceGone] = useState(false);
  // a layout pressed for this design; until then a source's write lets Jev pick it from the ad
  const [picked, setPicked] = useState(() => !!imageId);
  const [savedList, setSavedList] = useState(() => loadImages(userId));
  useEffect(() => onImagesChanged(() => setSavedList(loadImages(userId))), [userId]);

  const pending = useRef<SavedImage | null>(null);
  const timer = useRef<number>();
  const flush = () => {
    window.clearTimeout(timer.current);
    if (pending.current) saveImage(userId, pending.current);
    pending.current = null;
  };
  // leaving the page within the save delay still keeps the last edit
  useEffect(() => () => flush(), []); // eslint-disable-line react-hooks/exhaustive-deps

  /** Shows a change, keeps it once the design has anything in it, and writes `changes` in the same URL update. */
  const commit = (next: SavedImage, changes: Record<string, string | null> = {}) => {
    setImg(next);
    const keep = hasContent(next);
    if (keep) {
      pending.current = next;
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(flush, 400);
    }
    const all = { ...changes, ...(keep && imageId !== next.id ? { image: next.id } : {}) };
    if (Object.keys(all).length) update(all);
  };
  const edit = (patch: Partial<SavedImage>) => commit({ ...img, ...patch, layout, size });
  const setWord = (key: string, value: string) => edit({ words: { ...img.words, [key]: value } });

  // image= opens a saved design: one opened from Your images, Making now or a link; a link with no layout or size
  // takes the design's own
  const lastId = useRef<string | null>(null);
  useEffect(() => {
    const was = lastId.current;
    lastId.current = imageId;
    if (!imageId) {
      // the address dropped the open design (the Image tab pressed again): start a fresh one
      if (was && was === img.id) setImg(blankImage({ layout, size }));
      return;
    }
    const found = imageId === img.id ? null : imageById(userId, imageId);
    if (imageId !== img.id) {
      setGone(!found);
      if (!found) return;
      flush();
      setImg(found);
      setPicked(true);
    }
    const d = found ?? img;
    if (!params.has("layout") && !params.has("size") && (d.layout !== "headline" || d.size !== "4x5") && was !== imageId) {
      update({ layout: d.layout === "headline" ? null : d.layout, size: d.size === "4x5" ? null : d.size });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageId, userId]);

  // the design's source, read from this device's data (a swipe ad, a competitor's, your post)
  const sourceRef = img.source?.key;
  const source = useMemo<RemixSource | null>(
    () => (sourceRef ? (resolveSource(sourceRef, userId) ?? seenSources(userId).find((s) => s.key === sourceRef) ?? null) : null),
    [sourceRef, userId],
  );
  const willRead = !meme && !!source && !!swipePicture(source) && !cachedShows(source.key) && leftOf("remix-image") !== 0;
  const topic = img.words.topic ?? "";
  const reason = source ? null : topic.trim().length < 3 ? (img.source ? "That post isn't on this device any more. Type what it's about." : "Type what it's about first.") : null;

  const resultRef = useRef<HTMLDivElement>(null);
  const toResult = () => {
    if (!window.matchMedia("(min-width: 1024px)").matches) resultRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  };

  /** Starts a write into `design`, saved first so the run has it and leaving the page keeps it. */
  const startWrite = (design: SavedImage, src: RemixSource | null, layoutPicked: boolean, addressed = false) => {
    if (imageWriteBusy() || memeWriteBusy()) return;
    flush();
    saveImage(userId, design);
    if (!addressed && imageId !== design.id) update({ image: design.id });
    if (isMeme(design.layout)) {
      void startMemeWrite(userId, { designId: design.id, layout: design.layout, source: src, topic: design.words.topic ?? "", note: src ? sheetNote(src.key) : "", size: design.size });
      return toResult();
    }
    void startImageWrite(userId, {
      designId: design.id,
      source: src,
      topic: design.words.topic ?? "",
      layout: src && !layoutPicked ? null : (layout as AdLayoutId),
      mention: true,
      note: src ? sheetNote(src.key) : "",
      size,
      read: !!src && !!swipePicture(src) && !cachedShows(src.key) && leftOf("remix-image") !== 0,
    });
  };

  // ?source= arrives from the Remix sheet or a link: a new design remixing it, then the param leaves the address
  const arrived = useRef<string | null>(null);
  useEffect(() => {
    // once per arriving key (a second effect run in development must not make a second design)
    if (arrived.current === sourceKey) return;
    arrived.current = sourceKey;
    if (!sourceKey) return;
    const s = resolveSource(sourceKey, userId) ?? seenSources(userId).find((x) => x.key === sourceKey) ?? null;
    if (!s) {
      setSourceGone(true);
      update({ source: null });
      return;
    }
    setSourceGone(false);
    rememberSource(s, userId);
    flush();
    // a meme from the Remix sheet starts on Square unless the link named a size
    const at = meme && !params.has("size") ? MEME_SIZE : size;
    const next = blankImage({ layout, size: at, font: img.font, paper: img.paper, align: img.align, source: { key: s.key, label: sourceLabel(s) } });
    saveImage(userId, next);
    setImg(next);
    setPicked(false);
    update({ source: null, image: next.id, ...(at !== size ? { size: at } : {}) });
    // only the Remix sheet's Also make link sets { go: true } (navigation state, which a pasted link can't carry);
    // it is cleared from history so a reload never writes again, and the effect runs once per arriving source
    if ((location.state as { go?: boolean } | null)?.go) {
      try {
        window.history.replaceState({ ...window.history.state, usr: null }, "");
      } catch {
        /* the source param is already gone, so nothing writes twice */
      }
      startWrite(next, s, params.has("layout"), true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceKey]);

  // once per step of a write for this design: on a phone the preview sits under the fields, so its start, end or
  // failure is scrolled into view; at the end its words and Jev's layout come in (the run saved them itself)
  const seenStep = useRef("");
  useEffect(() => {
    if (!write || write.designId !== img.id) return;
    const step = `${write.id}:${write.state === "reading" ? "writing" : write.state}`;
    if (seenStep.current === step) return;
    // a run that ended before the page opened was already saved into the design it opened with
    const ended = write.state === "done" || write.state === "failed";
    const live = seenStep.current !== "" || !ended;
    seenStep.current = step;
    if (!live) return;
    if (write.state === "done") {
      const fresh = imageById(userId, img.id);
      if (fresh) {
        setImg(fresh);
        setPicked(true);
        update({ layout: fresh.layout === "headline" ? null : fresh.layout, image: fresh.id });
      }
    }
    toResult();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [write]);

  // a meme write for this design: its start and end are scrolled into view on a phone, and its words come in (the run
  // saved them itself); one that ended before the page opened was already in the design it opened with
  const seenMeme = useRef(mw && mw.state !== "writing" ? mw.id : 0);
  useEffect(() => {
    if (!mw || mw.designId !== img.id || mw.state === "writing" || seenMeme.current === mw.id) return;
    seenMeme.current = mw.id;
    const fresh = mw.state === "done" ? imageById(userId, img.id) : null;
    if (fresh) setImg(fresh);
    toResult();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mw]);

  // a meme picture made for this design drops in, over whatever was typed since (the run saved it too)
  const landed = useRef(memePictures()?.seq ?? 0);
  useEffect(() => {
    if (!pictures?.landed || pictures.designId !== img.id || pictures.seq <= landed.current) return;
    landed.current = pictures.seq;
    setPicture(pictures.landed.slot, pictures.landed.key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pictures]);

  // "Make one": the AI picture this design asked for drops in when it is ready, even after a reload of the job
  const askedFor = useRef<string | null>(null);
  // a make this design started before a reload (or before leaving the page) is picked up and still drops in
  useEffect(() => {
    resumeImage(userId);
    if (imageBusy() && imageJob()?.designId === img.id) askedFor.current = img.id;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);
  useEffect(() => {
    if (pictureJob?.state !== "done" || !pictureJob.mediaKey || askedFor.current !== img.id) return;
    askedFor.current = null;
    commit({ ...img, layout, size, pictureKey: pictureJob.mediaKey }, { pick: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pictureJob]);

  // ---- drawing ----
  const pictured = layout === "headline" || meme;
  const second = layout === "expectation" ? secondPicture(img.words) : undefined;
  const picture = usePicture(pictured ? img.pictureKey : undefined, brand.photo);
  const picture2 = usePicture(second, brand.photo);
  const media = useMemo(() => loadMedia(userId), [userId, pick, img.pictureKey, second]); // eslint-disable-line react-hooks/exhaustive-deps
  const aiPicture = pictured && [img.pictureKey, second].some((k) => !!k && media.some((m) => m.key === k && m.folder === AI_FOLDER));
  const input: ImageInput = { layout, words: img.words, brand, font: img.font, paper: img.paper, align: img.align, picture: picture.url, picture2: picture2.url };
  const preview = useMemo(() => svgDataUrl(renderSvg(layoutImage({ ...input, samples: true }, size, measure))), [img, layout, size, brand, picture.url, picture2.url, measure]); // eslint-disable-line react-hooks/exhaustive-deps
  const block = imageBlock(layout, img.words) ?? pictureBlock(layout, (picture.url ? 1 : 0) + (picture2.url ? 1 : 0));
  const missing = pictured ? (pictureLine(img, picture.found) ?? pictureLine({ pictureKey: second }, picture2.found)) : null;
  const memeSet = useMemo(() => (meme ? memeSetFor(img.id) : null), [meme, img.id, mw]); // eslint-disable-line react-hooks/exhaustive-deps
  const memeOptions = memeSet?.layout === layout ? memeSet : null;
  const fileBase = slugify(mainWords(layout, img.words)) || "image";

  const textToCheck = [...IMAGE_FIELDS[layout].map((f) => img.words[f.key] ?? ""), img.words.caption ?? ""].filter((t) => t.trim()).join("\n\n");
  const flags = useMemo(() => scanCompliance(textToCheck), [textToCheck]);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const mineDone = !meme && write?.designId === img.id && write.state === "done" ? write : null;
  const memeDone = meme && mw?.designId === img.id && mw.state === "done" ? mw : null;
  const failed = writing ? null : !meme ? (write?.designId === img.id && write.state === "failed" ? write : null) : mw?.designId === img.id && mw.state === "failed" ? mw : null;
  // Jev's MAS question read the best meme only
  const masWarn = mineDone?.flags?.mas || (!!memeDone?.flags?.mas && !!memeOptions && optionIndex(img.words, memeOptions.options) === memeOptions.best);

  const pngOf = async (s: ImageSize, type?: "image/jpeg") => {
    const d = layoutImage({ ...input, samples: false }, s, measure);
    return svgPng(renderSvg(d), d.width, d.height, type);
  };
  // Run as an ad (?ad=1): an adviser's brand needs the firm's approval code
  const [adOpen, openAd, closeAd] = useUrlItem("ad");
  const person = useMemo(() => speakerFor(userId) === "person", [userId]);
  const [busyFile, setBusyFile] = useState<null | "one" | "all" | "post">(null);
  const download = async (all: boolean) => {
    if (block || busyFile) return;
    setBusyFile(all ? "all" : "one");
    try {
      const sizes = all ? sizesFor(layout) : [size];
      for (const [i, s] of sizes.entries()) {
        downloadBlob(await pngOf(s), `${fileBase}-${s}.png`);
        // browsers drop downloads that all start at the same moment
        if (i < sizes.length - 1) await pause(400);
      }
      toast({ title: all ? `${sizes.length} sizes downloaded` : "Image downloaded" });
    } catch {
      toast({ title: "Couldn't create the image", description: "Try again, or try another browser.", variant: "destructive" });
    } finally {
      setBusyFile(null);
    }
  };

  const canPost = socialConnectShown();
  const [posting, setPosting] = useState<DraftEntry | null>(null);
  const post = async () => {
    if (block || busyFile) return;
    setBusyFile("post");
    try {
      const key = postFileKey(img);
      await putFile(key, await pngOf(size));
      const prev = img.draftId ? getDraftById(userId, img.draftId) : null;
      const entry = imageDraft(img, mainWords(layout, img.words), { id: prev?.id ?? newDraftId(), now: new Date().toISOString(), prev, source });
      upsertDraft(userId, entry);
      setDraftAttached(userId, entry.id, [key]);
      draftsChanged();
      if (img.draftId !== entry.id) {
        // kept at once: the post and its design point at each other from here on
        edit({ draftId: entry.id });
        flush();
      }
      setPosting(getDraftById(userId, entry.id));
    } catch {
      toast({ title: "Couldn't get the image ready", description: "Try again, or download it and post it yourself.", variant: "destructive" });
    } finally {
      setBusyFile(null);
    }
  };

  const pickLayout = (l: ImageLayout) => {
    setPicked(true);
    // memes start on Square; a 9:16 story stays one
    const s = isMeme(l) && !meme && (size === "4x5" || size === "wide") ? MEME_SIZE : size;
    commit({ ...img, layout: l, size: s }, { layout: l === "headline" ? null : l, ...(s !== size ? { size: s } : {}) });
  };
  /** A meme's picture into its slot (expectation's reality picture is the second), or out of it. */
  const setPicture = (slot: 0 | 1, key: string | undefined) => {
    const { [SECOND_PICTURE]: _was, ...words } = img.words;
    const next = slot === 0 ? { ...img, pictureKey: key } : { ...img, words: key ? { ...words, [SECOND_PICTURE]: key } : words };
    commit({ ...next, layout, size }, key ? { pick: null } : {});
  };
  const pickSize = (s: ImageSize) => commit({ ...img, layout, size: s }, { size: s === "4x5" ? null : s });
  const newImage = () => {
    flush();
    setImg(blankImage({ layout, size, font: img.font, paper: img.paper, align: img.align }));
    setPicked(false);
    setGone(false);
    setPosting(null);
    update({ image: null, pick: null });
  };
  const dropSource = () => edit({ source: undefined });

  const hasWords = !imageBlock(layout, { ...img.words, number: "x", statSource: "x" });
  const price = sumPrices(priceOf("remix-make"), willRead ? priceOf("remix-image") : null);
  const writeLabel = meme ? (memeOptions ? "Write 3 more" : "Write 3 memes") : hasWords ? "Write it again" : "Write it for me";

  const options = (
    <>
      <Card className="border-border/60 shadow-card">
        <CardContent className="space-y-4 pt-4 sm:pt-5">
          {gone && <p className="text-sm text-amber-700 dark:text-amber-300">That image isn't saved on this brand. This is a new one.</p>}
          {sourceGone && <p className="text-sm text-amber-700 dark:text-amber-300">That post isn't on this device any more. Type what it's about instead.</p>}
          {img.source ? (
            <div className="space-y-1.5">
              <p className={FIELD_LABEL}>Original</p>
              <div className="flex items-center gap-3 rounded-lg border border-border/60 p-2">
                {source?.cover && <img src={source.cover} alt="" className="h-14 w-11 shrink-0 rounded object-cover" onError={(e) => (e.currentTarget.style.display = "none")} />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{img.source.label}</span>
                  <span className="block truncate text-xs text-muted-foreground">{source?.title || source?.caption || "Keeps its shape, never its words."}</span>
                </span>
                <Button size="icon" variant="ghost" onClick={dropSource} disabled={writing} aria-label="Remove the original" className={cn("h-9 w-9 shrink-0", TOUCH)}>
                  <XIcon className="h-4 w-4" />
                </Button>
              </div>
              {mineDone?.layoutBy === "jev" && mineDone.layout === layout && (
                <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                  <Check className="h-3.5 w-3.5" aria-hidden /> Matches the original
                </p>
              )}
            </div>
          ) : null}
          {/* no original on this device to write from: the words come from a topic */}
          {!source && (
            <div className="space-y-1.5">
              <Label htmlFor="image-topic" className={FIELD_LABEL}>What it's about</Label>
              <Input id="image-topic" value={topic} maxLength={200} disabled={writing} placeholder={meme ? "Saving for a BTO" : "Like why a hospital plan has a co-pay"} onChange={(e) => setWord("topic", e.target.value)} />
            </div>
          )}
          <div className="space-y-1.5">
            <p className={FIELD_LABEL}>Layout</p>
            {([["Ads", layouts], ["Memes", MEME_LAYOUT_IDS]] as const).map(([group, list]) => (
              <div key={group} role="group" aria-label={group} className="flex flex-wrap items-center gap-1.5">
                <span className="w-14 shrink-0 text-[11px] text-muted-foreground">{group}</span>
                {list.map((l) => (
                  <FilterChip key={l} active={layout === l} disabled={writing} onClick={() => pickLayout(l)}>
                    {LAYOUT_LABELS[l]}
                  </FilterChip>
                ))}
              </div>
            ))}
          </div>
          {!kit && (!meme || layout === "post-reaction") && (
            <p className="text-xs text-muted-foreground">
              <Link to={links.brand({ section: "colour" })} className="font-semibold text-primary hover:underline [@media(pointer:coarse)]:py-3">
                Add your colour and photo in Brand kit
              </Link>{" "}
              to see them here.
            </p>
          )}
          <Row label="Size">
            {sizesFor(layout).map((s) => (
              <FilterChip key={s} active={size === s} disabled={writing} onClick={() => pickSize(s)}>
                {SIZE_INFO[s].label}
              </FilterChip>
            ))}
          </Row>
        </CardContent>
      </Card>

      <Card className="border-border/60 shadow-card">
        <CardContent className="space-y-4 pt-4 sm:pt-5">
          {IMAGE_FIELDS[layout].map((f) => {
            const value = img.words[f.key] ?? "";
            const n = countOf(value, f.unit);
            const over = n > f.max;
            const id = `image-${f.key}`;
            const long = f.unit === "words" && f.max > 10;
            const placeholder = f.key === "who" ? brand.name || f.sample : f.sample;
            return (
              <div key={f.key} className="space-y-1.5">
                <div className="flex items-baseline justify-between gap-2">
                  <Label htmlFor={id} className={FIELD_LABEL}>{f.label}</Label>
                  <span className={cn("text-[11px] tabular-nums", over ? "font-semibold text-destructive" : "text-muted-foreground")} aria-live="polite">
                    {n}/{f.max}{f.unit === "words" ? " words" : ""}
                  </span>
                </div>
                {long ? (
                  <Textarea id={id} rows={2} value={value} disabled={writing} placeholder={placeholder} aria-invalid={over} onChange={(e) => setWord(f.key, e.target.value)} />
                ) : (
                  <Input id={id} value={value} disabled={writing} placeholder={placeholder} aria-invalid={over} maxLength={f.unit === "chars" ? f.max * 2 : undefined} onChange={(e) => setWord(f.key, e.target.value)} />
                )}
                {f.key === "number" && !value.trim() && <p className="text-xs text-muted-foreground">Type your own number and where it's from.</p>}
                {f.key === "clientWords" && <p className="text-xs text-muted-foreground">Only words a client really said, with their OK.</p>}
              </div>
            );
          })}
          {layout === "headline" && (
            <PicturePicker
              userId={userId}
              img={img}
              pick={pick}
              media={media}
              hasHeadshot={!!brand.photo}
              disabled={writing}
              job={askedFor.current === img.id ? pictureJob : null}
              left={leftOf("ai-image")}
              promptSeed={img.words.headline || topic || source?.title || ""}
              onPick={(key) => commit({ ...img, layout, size, pictureKey: key }, key ? { pick: null } : {})}
              onOpen={(p) => update({ pick: p === pick ? null : p })}
              onMake={(prompt) => {
                askedFor.current = img.id;
                void makeImage(userId, prompt, `Image: ${mainWords(layout, img.words) || topic}`.slice(0, 80), img.id);
              }}
            />
          )}
          {isMeme(layout) && (
            <MemePicture
              key={`${img.id}-${layout}`}
              userId={userId}
              layout={layout}
              img={img}
              pick={pick}
              media={media}
              disabled={writing}
              left={leftOf("ai-image")}
              about={topic || source?.title || ""}
              onPick={setPicture}
              onOpen={(p) => update({ pick: p === pick ? null : p })}
            />
          )}
          <div className="space-y-1.5">
            <Label htmlFor="image-caption" className={FIELD_LABEL}>Caption</Label>
            <Textarea id="image-caption" rows={3} value={img.words.caption ?? ""} disabled={writing} placeholder="The words that go with the post" onChange={(e) => setWord("caption", e.target.value)} />
          </div>
        </CardContent>
      </Card>

      {/* a meme keeps the meme look: the font, background and alignment are an ad's */}
      {!meme && (
        <Card className="border-border/60 shadow-card">
          <CardContent className="space-y-4 pt-4 sm:pt-5">
            <Row label="Font">
              {(Object.keys(SLIDE_FONTS) as SlideFont[]).map((f) => (
                <FilterChip key={f} active={img.font === f} disabled={writing} onClick={() => edit({ font: f })}>
                  {SLIDE_FONTS[f].label}
                </FilterChip>
              ))}
            </Row>
            <Row label="Background">
              {PAPERS.map((p) => (
                <FilterChip key={p.id} active={img.paper === p.id} disabled={writing} onClick={() => edit({ paper: p.id })}>
                  {p.label}
                </FilterChip>
              ))}
            </Row>
            <Row label="Words">
              <FilterChip active={img.align !== "center"} disabled={writing} onClick={() => edit({ align: "left" })}>Left</FilterChip>
              <FilterChip active={img.align === "center"} disabled={writing} onClick={() => edit({ align: "center" })}>Centred</FilterChip>
            </Row>
          </CardContent>
        </Card>
      )}
    </>
  );

  const { width: W, height: H } = SIZE_INFO[size];
  const result = (
    <div ref={resultRef} className="scroll-mt-16 space-y-4 lg:sticky lg:top-4 lg:scroll-mt-0">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-muted-foreground">
          {LAYOUT_LABELS[layout]}, {SIZE_INFO[size].label}
        </p>
        <div className="flex items-center gap-1">
          {imageId === img.id && <CopyLinkButton path={links.image({ layout, size, image: img.id })} />}
          <Button size="sm" variant="ghost" onClick={newImage} disabled={writing} className={cn("gap-1.5", TOUCH)}>
            <Plus className="h-4 w-4" /> New image
          </Button>
        </div>
      </div>
      <div className="relative mx-auto w-full" style={{ maxWidth: W > H ? 560 : Math.round(420 * (W / H) * (H > 1400 ? 1.15 : 1.25)) }}>
        <img src={preview} alt={mainWords(layout, img.words) || "Your image"} width={W} height={H} className="block h-auto w-full rounded-lg border border-border/60 shadow-card" />
        {writing && (meme ? mw : write) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-lg bg-background/80 text-sm text-muted-foreground backdrop-blur-sm">
            <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden />
            <span role="status">{meme ? MEME_STEP : writeStep(write)}</span>
          </div>
        )}
      </div>
      {missing && <p className="text-xs text-muted-foreground">{missing}</p>}
      {aiPicture && <p className="text-xs text-muted-foreground">The person is made by AI.</p>}

      {failed && (
        <div role="alert" className="space-y-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
          <p className="flex items-start gap-2 text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {failed.error}
          </p>
          <p className="text-xs text-muted-foreground">What you typed is still here.</p>
        </div>
      )}

      {memeOptions && <MemeOptions set={memeOptions} words={img.words} disabled={writing} onPick={(o) => edit({ words: { ...img.words, ...o } })} />}

      <ComplianceChips flags={flags.filter((f) => !dismissed.includes(f.id))} onDismiss={(id) => setDismissed((d) => [...d, id])} />
      {(mineDone ?? memeDone)?.flags && <FlagChips flags={(mineDone ?? memeDone)!.flags!} />}
      {masWarn && (
        <p className="flex items-start gap-1.5 rounded-lg border border-amber-500/50 bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-900 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-600" /> These words may promise a result or point to a product. Check them before you post.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => void download(false)} disabled={!!block || !!busyFile} className={cn("gap-1.5", TOUCH)}>
          {busyFile === "one" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Download
        </Button>
        <Button variant="outline" onClick={() => void download(true)} disabled={!!block || !!busyFile} className={cn("gap-1.5", TOUCH)}>
          {busyFile === "all" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Download all sizes
        </Button>
        {canPost && (
          <Button variant="outline" onClick={() => (posting ? setPosting(null) : void post())} disabled={!!block || !!busyFile} aria-expanded={!!posting} className={cn("gap-1.5", TOUCH)}>
            {busyFile === "post" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Post it for me
          </Button>
        )}
        <Button
          variant="outline"
          onClick={() => {
            flush();
            openAd("1");
          }}
          disabled={!!block || !!busyFile || writing}
          className={cn("gap-1.5", TOUCH)}
        >
          <Megaphone className="h-4 w-4" /> Run as an ad
        </Button>
      </div>
      {block && <p className="text-xs text-muted-foreground">{block}</p>}
      {posting && <PostPanel userId={userId} draft={posting} onDrafts={() => setPosting(getDraftById(userId, posting.id))} onClose={() => setPosting(null)} />}

      <YourImages list={savedList} openId={imageId} />
      <AdsResults userId={userId} />
      {adOpen === "1" && !block && !writing && (
        <RunAsAdSheet
          userId={userId}
          designId={img.id}
          draftId={img.draftId}
          headline={mainWords(layout, img.words)}
          text={img.words.caption ?? ""}
          preview={preview}
          picture={() => pngOf(size, "image/jpeg")}
          person={person}
          masWarn={!!masWarn}
          onClose={closeAd}
        />
      )}
    </div>
  );

  return (
    <div className="space-y-5">
      <FormatShell
        title="Image"
        blurb={`One designed picture for ${brandLabel}, in the sizes you need.`}
        options={options}
        result={result}
        footer={{
          cap: "remix-make",
          price,
          caps: willRead ? ["remix-image"] : undefined,
          label: writeLabel,
          busyLabel: meme ? MEME_STEP : write?.state === "reading" ? "Reading..." : "Writing...",
          busy: writing,
          disabled: !!reason,
          reason,
          secondary: (meme ? !imageBlock(layout, img.words) : hasWords) && !writing,
          onMake: () => startWrite({ ...img, layout, size }, source, picked),
        }}
      />
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className={FIELD_LABEL}>{label}</p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

/** Post it for me on the design's own post; the team's approval rule is read only once it opens. */
function PostPanel({ userId, draft, onDrafts, onClose }: { userId: string; draft: DraftEntry; onDrafts: () => void; onClose: () => void }) {
  const reviews = useDraftReviews(userId, [draft]);
  return <PostItForMePanel userId={userId} draft={draft} blockReason={reviews.blockReason(draft)} onDrafts={onDrafts} onClose={onClose} />;
}

function PicturePicker(p: {
  userId: string;
  img: SavedImage;
  pick: "none" | "media" | "make" | "stock";
  media: MediaItem[];
  hasHeadshot: boolean;
  disabled: boolean;
  job: ImageJob | null;
  left: number | null;
  promptSeed: string;
  onPick: (key: string | undefined) => void;
  onOpen: (p: "media" | "make") => void;
  onMake: (prompt: string) => void;
}) {
  const seed = p.promptSeed.trim() ? `A photo for an ad about "${p.promptSeed.trim()}": one person in an everyday moment that shows it.` : "";
  const [prompt, setPrompt] = useState(seed);
  useEffect(() => {
    if (p.pick === "make" && !prompt) setPrompt(seed);
  }, [p.pick]); // eslint-disable-line react-hooks/exhaustive-deps
  const making = p.job?.state === "working" || p.job?.state === "saving";
  const images = p.media.slice(0, 24);
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <p className={FIELD_LABEL}>Picture</p>
        {p.img.pictureKey && (
          <button type="button" onClick={() => p.onPick(undefined)} disabled={p.disabled} className={cn("text-xs font-semibold text-primary hover:underline", TOUCH)}>
            Remove
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {p.hasHeadshot && (
          <FilterChip active={p.img.pictureKey === HEADSHOT} disabled={p.disabled} onClick={() => p.onPick(HEADSHOT)}>
            <UserRound className="h-3.5 w-3.5" aria-hidden /> Use my headshot
          </FilterChip>
        )}
        <FilterChip active={p.pick === "media"} disabled={p.disabled} onClick={() => p.onOpen("media")}>
          <ImagePlus className="h-3.5 w-3.5" aria-hidden /> From Media
        </FilterChip>
        <FilterChip active={p.pick === "make"} disabled={p.disabled} onClick={() => p.onOpen("make")}>
          <Sparkles className="h-3.5 w-3.5" aria-hidden /> Make one
        </FilterChip>
      </div>
      {p.pick === "media" &&
        (images.length ? (
          <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6">
            {images.map((m) => (
              <MediaThumb key={m.key} item={m} active={p.img.pictureKey === m.key} onPick={() => p.onPick(m.key)} />
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            <Link to={links.media()} className="font-semibold text-primary hover:underline [@media(pointer:coarse)]:py-3">Add photos in Media</Link> to use your own.
          </p>
        ))}
      {p.pick === "make" && (
        <div className="space-y-2 rounded-lg border border-border/60 p-3">
          <Label htmlFor="image-prompt" className={FIELD_LABEL}>What the picture shows</Label>
          <Textarea id="image-prompt" rows={2} value={prompt} maxLength={1200} disabled={making} placeholder="One person reading a hospital bill at the kitchen table" onChange={(e) => setPrompt(e.target.value)} />
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => p.onMake(prompt.trim())} disabled={making || imageBusy() || prompt.trim().length < 10 || p.left === 0} className={cn("gap-1.5", TOUCH)}>
              {making ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} {making ? "Making your picture..." : "Make it"}
            </Button>
            <PriceChip feature="ai-image" left={p.left} />
          </div>
          {p.job?.state === "failed" && <p className="text-xs text-destructive">{p.job.error}</p>}
        </div>
      )}
    </div>
  );
}

/** This brand's saved designs, newest first; each opens by its own link. */
function YourImages({ list, openId }: { list: SavedImage[]; openId: string | null }) {
  const shown = list.filter(hasContent);
  if (!shown.length) return null;
  return (
    <section className="space-y-2 border-t border-border/60 pt-4">
      <h2 className="text-sm font-semibold">Your images</h2>
      <ul className="divide-y divide-border/60 rounded-lg border border-border/60">
        {shown.map((d) => {
          const words = mainWords(d.layout, d.words) || d.words.topic || d.source?.label || "No words yet";
          return (
            <li key={d.id}>
              <Link
                to={links.image({ layout: d.layout, size: d.size, image: d.id })}
                replace
                aria-current={d.id === openId ? "true" : undefined}
                className={cn("flex items-center gap-3 px-3 py-2 text-sm hover:bg-muted/50", TOUCH, d.id === openId && "bg-primary/5")}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{words}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {LAYOUT_LABELS[d.layout]}, {SIZE_INFO[d.size].label}
                    {d.updatedAt ? `, ${ago(d.updatedAt)}` : ""}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
