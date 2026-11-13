// /make/static/:slug (ff1111, after Fastlane's static ad format page): one static ad format from src/data/staticFormats.ts.
// A back chip to the Create gallery's Static ads tab, the name and line, its made examples and our own drawn layout,
// what it works with, an optional note (kept on this device, cs-static-note-<slug>), and two ways to make it, each with
// its price. "Make it as a photo" (src/lib/photoAd.ts) writes the words for the brand with the note, then the picture
// maker makes the format's scene with those words on it; it stays on this page, shows each step, and ends with a link to
// the photo in Media. "Make it as a layout" opens /image on that layout and writes the words there (navigation state
// { go, format }, as the Remix sheet's link does; a pasted link writes nothing), and the design lands in Your images.
// The photo is the dominant button, since the examples it matches are photos; the layout takes over when today's
// pictures are used up. A format that needs a photo, with none on this brand yet, offers only "Add a photo", which opens
// the picker. Leo's sign-ins only (useLeoUser, so ?asLeo=1 works on localhost); anyone else, and an unknown slug, gets NotFound.

import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { CameraIcon, CaretLeftIcon, CaretRightIcon, CircleNotchIcon, ImageSquareIcon, SparkleIcon } from "@phosphor-icons/react";
import PriceChip from "@/components/PriceChip";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { STATIC_SHOTS, staticFormatBySlug, staticShotSrc, type StaticFormat } from "@/data/staticFormats";
import { AI_FOLDER, imageJob, onImageJob, resumeImage } from "@/lib/aiImage";
import { useUsesLeft } from "@/lib/aiUsage";
import { staticExampleUrl } from "@/lib/staticExample";
import { isStatic } from "@/lib/imageLayout";
import { links } from "@/lib/links";
import { loadMedia } from "@/lib/mediaLibrary";
import { PHOTO_STEP, shownPhotoAd, startPhotoAd, usePhotoAd } from "@/lib/photoAd";
import { loadProducts, type Products } from "@/lib/products";
import { priceOf, reasonText, sumPrices } from "@/lib/prices";
import { brandName } from "@/lib/remixBrand";
import { useLeoUser } from "@/lib/useLeoOnly";
import NotFoundPage from "@/pages/NotFoundPage";

const LABEL = "text-xs font-semibold uppercase tracking-wide text-muted-foreground";
export const MAX_NOTE = 200;

export const noteKey = (slug: string) => `cs-static-note-${slug}`;
export function loadNote(slug: string): string {
  try {
    return localStorage.getItem(noteKey(slug)) ?? "";
  } catch {
    return "";
  }
}
function saveNote(slug: string, note: string): void {
  try {
    if (note) localStorage.setItem(noteKey(slug), note);
    else localStorage.removeItem(noteKey(slug));
  } catch {
    // a hint on this device only: the note still goes with this press
  }
}

/** What a format works with, in one line. */
export function worksWith(f: Pick<StaticFormat, "best" | "needs">): string {
  if (f.needs === "photo") return "Needs a photo of what you sell.";
  if (f.best === "photo") return "Best with a photo of what you sell. It works without one too.";
  if (f.best === "price") return "Best with a price, which you type in next.";
  return "No photo needed. The words carry it.";
}

/** The brand's product photo (a used product's first), and its first price. */
export function productBits(p: Products): { picture?: string; price?: string } {
  const items = [...p.items.filter((x) => x.use), ...p.items.filter((x) => !x.use)];
  return { picture: items.find((x) => x.pictures[0])?.pictures[0], price: items.find((x) => x.price?.trim())?.price?.trim() };
}

/**
 * The page's one button: where it goes and what it carries. A format that needs a photo, with no product photo and
 * nothing in Media, adds a photo first; otherwise it writes at once, with the product photo in when the format uses
 * one, or the picker open beside the words when only Media has photos.
 */
export function staticMake(
  f: Pick<StaticFormat, "slug" | "best" | "needs">,
  o: { note: string; brand: string; picture?: string; photos: number; price?: string },
): { label: string; to: string; state: { go?: true; format: { topic: string; pictureKey?: string; price?: string } } } {
  const topic = o.note.trim().slice(0, MAX_NOTE) || `What ${o.brand} does and who it's for`;
  const page = links.image({ layout: f.slug as never });
  const usesPhoto = f.needs === "photo" || f.best === "photo";
  if (f.needs === "photo" && !o.picture && !o.photos) return { label: "Add a photo", to: `${page}&pick=media`, state: { format: { topic } } };
  const pick = f.needs === "photo" && !o.picture ? "&pick=media" : "";
  return {
    label: "Make it as a layout",
    to: page + pick,
    state: { go: true, format: { topic, ...(usesPhoto && o.picture ? { pictureKey: o.picture } : {}), ...(f.best === "price" && o.price ? { price: o.price } : {}) } },
  };
}

export default function StaticFormatPage() {
  const leo = useLeoUser();
  const { slug } = useParams();
  const def = staticFormatBySlug(slug ?? "");
  if (leo === undefined) return <div className="min-h-[40vh]" aria-busy="true" />;
  if (!leo) return <NotFoundPage notOnAccount />;
  if (!def) return <NotFoundPage />;
  return <StaticFormatView key={def.slug} userId={leo.id} def={def} />;
}

function StaticFormatView({ userId, def }: { userId: string; def: StaticFormat }) {
  const navigate = useNavigate();
  const drawn = isStatic(def.slug);
  const example = useMemo(() => staticExampleUrl(def), [def]);
  const [note, setNote] = useState(() => loadNote(def.slug));
  const brand = useMemo(() => brandName(userId), [userId]);
  const bits = useMemo(() => productBits(loadProducts(userId)), [userId]);
  const photos = useMemo(() => loadMedia(userId).filter((m) => m.kind !== "video").length, [userId]);
  const photo = usePhotoAd();
  const [picture, setPicture] = useState(imageJob);
  useEffect(() => onImageJob(setPicture), []);
  // a photo whose use was spent before a reload still lands in Media, and shows here again while it does
  useEffect(() => resumeImage(userId), [userId]);
  const mine = shownPhotoAd(def, photo, picture);
  const running = photo?.state === "writing" || photo?.state === "making";
  const own = mine?.state === "writing" || mine?.state === "making";
  // one picture at a time: another format's photo, or a picture from elsewhere, holds this button until it's done
  const picturing = !own && (running || picture?.state === "working" || picture?.state === "saving");
  const leftOf = useUsesLeft(running || own);
  const left = leftOf("remix-make");
  const pictures = leftOf("ai-image");
  // a photo spends one of each: what is left is the lower of the two
  const photoLeft = left === null || pictures === null ? (left ?? pictures) : Math.min(left, pictures);
  const action = staticMake(def, { note, brand, photos, ...bits });
  const adding = action.label === "Add a photo";
  // the photo leads while it can run today; with no pictures (or writes) left the layout is the one button to press
  const photoFirst = !adding && photoLeft !== 0;
  const reason = adding ? null
    : left === 0 ? reasonText({ left, leo: true })
    : pictures === 0 ? "Photos are back at 8am Singapore time."
    : picturing ? "A picture is already being made. This one can start when it's done."
    : null;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <Button asChild variant="ghost" size="sm" className="-ml-2 gap-1 text-muted-foreground">
          <Link to="/make?tab=static">
            <CaretLeftIcon className="h-4 w-4" /> Static ads
          </Link>
        </Button>
        <h1 className="font-serif text-2xl font-semibold leading-tight tracking-tight text-foreground sm:text-3xl">{def.name}</h1>
        <p className="text-sm text-muted-foreground">{def.blurb}</p>
      </header>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)] lg:items-start lg:gap-10">
        <figure className="space-y-2">
          <Examples def={def} drawn={example} brand={brand} />
        </figure>
        <div className="max-w-xl space-y-5">
          <div className="space-y-1">
            <p className={LABEL}>Works with</p>
            <p className="text-sm text-foreground">{worksWith(def)}</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="static-note" className={LABEL}>
              Anything to steer it?
            </Label>
            <Textarea
              id="static-note"
              rows={3}
              value={note}
              maxLength={MAX_NOTE}
              placeholder="Who it's for, when they'd see it, or one thing to say. Optional."
              onChange={(e) => {
                setNote(e.target.value);
                saveNote(def.slug, e.target.value);
              }}
            />
          </div>
          {drawn && (
            <div className="space-y-2">
              {adding && <p className="text-sm text-muted-foreground">This one shows what you sell, so it needs a photo of it first.</p>}
              {!adding && (
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    variant={photoFirst ? "default" : "outline"}
                    onClick={() => void startPhotoAd(userId, def, action.state.format)}
                    disabled={own || picturing || photoLeft === 0}
                    className={`gap-1.5 [@media(pointer:coarse)]:min-h-11 ${own ? "disabled:opacity-100" : ""}`}
                  >
                    {own ? <CircleNotchIcon className="h-4 w-4 animate-spin" /> : <CameraIcon className="h-4 w-4" />} Make it as a photo
                  </Button>
                  {!own && <PriceChip price={sumPrices(priceOf("remix-make"), priceOf("ai-image"))} left={photoLeft} />}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  variant={photoFirst ? "outline" : "default"}
                  onClick={() => navigate(action.to, { state: action.state })}
                  disabled={!adding && (left === 0 || running)}
                  className="gap-1.5 [@media(pointer:coarse)]:min-h-11"
                >
                  {adding ? <ImageSquareIcon className="h-4 w-4" /> : <SparkleIcon className="h-4 w-4" />} {action.label}
                </Button>
                {!adding && <PriceChip feature="remix-make" left={left} />}
              </div>
              {reason && <p className="text-xs text-muted-foreground">{reason}</p>}
              <div aria-live="polite" className="text-sm">
                {mine && own && (
                  <p className="text-muted-foreground">
                    {PHOTO_STEP[mine.state as "writing" | "making"]}
                    {mine.state === "making" && " About a minute. You can leave this page."}
                  </p>
                )}
                {mine?.state === "failed" && <p className="text-destructive">{mine.error}</p>}
                {mine?.state === "done" && mine.mediaKey && (
                  <div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-card p-2.5">
                    {mine.preview && <img src={mine.preview} alt="" className="h-20 w-auto shrink-0 rounded border border-border/60" />}
                    <div className="space-y-1">
                      <p className="font-semibold text-foreground">Your photo ad is ready.</p>
                      <Link to={links.media({ folder: AI_FOLDER, item: mine.mediaKey })} className="inline-flex font-semibold text-primary hover:underline [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:items-center">
                        Open it in Media
                      </Link>
                      {mine.designId && (
                        <p className="text-xs text-muted-foreground">
                          The same words as a layout are in{" "}
                          <Link to={links.image({ image: mine.designId })} className="font-semibold text-primary hover:underline">
                            Your images
                          </Link>
                          .
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {adding ? "It opens on the Image page and stays in " : "A photo goes to Media. A layout opens on the Image page and stays in "}
                <Link to={links.image()} className="font-semibold text-primary hover:underline">
                  Your images
                </Link>
                .
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** The format's examples, one at a time: the made ones (each for a made-up brand, with the angle it takes), then our own
 * layout drawn with sample words, which is what a make starts from. */
function Examples({ def, drawn, brand }: { def: StaticFormat; drawn: string | null; brand: string }) {
  const shots = STATIC_SHOTS[def.slug] ?? [];
  const total = shots.length + (drawn ? 1 : 0);
  const [i, setI] = useState(0);
  if (!total) return <p className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">This format isn't drawn yet.</p>;
  const shot = shots[i];
  const step = (d: number) => setI((n) => (n + d + total) % total);
  return (
    <>
      <div className="flex max-w-[400px] items-center justify-between gap-2">
        <p className={LABEL}>
          Example {i + 1} of {total}
        </p>
        <div className="flex gap-1">
          <Button type="button" variant="outline" size="icon" className="h-9 w-9 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11" aria-label="Previous example" onClick={() => step(-1)}>
            <CaretLeftIcon className="h-4 w-4" />
          </Button>
          <Button type="button" variant="outline" size="icon" className="h-9 w-9 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11" aria-label="Next example" onClick={() => step(1)}>
            <CaretRightIcon className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <img
        src={shot ? staticShotSrc(def.slug, i + 1) : drawn!}
        alt={`An example ${def.name.toLowerCase()} ad`}
        width={1080}
        height={1350}
        className="block h-auto w-full max-w-[400px] rounded-lg border border-border/60 shadow-card"
      />
      <figcaption className="text-xs text-muted-foreground" aria-live="polite">
        {shot ? `Angle: ${shot[1]}. Made up for ${shot[0]}.` : "Our layout with sample words, where your make starts."} Yours is written for {brand}.
      </figcaption>
    </>
  );
}
