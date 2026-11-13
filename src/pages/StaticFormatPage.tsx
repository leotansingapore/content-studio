// /make/static/:slug (ff1111, after Fastlane's static ad format page): one static ad format from src/data/staticFormats.ts.
// A back chip to the Create gallery's Static ads tab, the name and line, its made examples and our own drawn layout,
// what it works with, an optional note (kept on this device, cs-static-note-<slug>), and two ways to make it, each with
// its price. "Make it as a photo" (src/lib/photoAd.ts) writes the words for the brand with the note, then the picture
// maker makes the format's scene with those words on it; it stays on this page, shows each step, and ends with a link to
// the photo in Media, the angle it took, and "Another angle", which makes the next one with the same note at the same
// price. "Make it as a layout" hands the agent a request that sends on arrival (links.agent({ ask }) with
// navigation state { send, from, layout, topic }), and the design the agent makes on that layout lands in Your images.
// The photo is the dominant button, since the examples it matches are photos; the layout takes over when today's
// pictures are used up. A format that needs a photo, with none on this brand yet, offers only "Add a photo", which opens
// the picker. The agent's make skill (makeSkills.ts) opens it with its answers: ?note= fills the note once, ?angle= (one
// of the twelve) and ?product= (a saved product's id) stay in the address as picks the photo make takes, each removable.
// Leo's sign-ins only (useLeoUser, so ?asLeo=1 works on localhost); anyone else, and an unknown slug, gets NotFound.

import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { CameraIcon, CaretLeftIcon, CaretRightIcon, CircleNotchIcon, ImageSquareIcon, ShuffleIcon, SparkleIcon, XIcon } from "@phosphor-icons/react";
import PriceChip from "@/components/PriceChip";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { STATIC_SHOTS, staticFormatBySlug, staticFormatHref, staticShotSrc, type StaticFormat } from "@/data/staticFormats";
import type { ArrivedFrom } from "@/lib/agentStarters";
import { AI_FOLDER, imageJob, onImageJob, resumeImage } from "@/lib/aiImage";
import { useUsesLeft } from "@/lib/aiUsage";
import { staticExampleUrl } from "@/lib/staticExample";
import { isStatic } from "@/lib/imageLayout";
import { links } from "@/lib/links";
import { loadMedia } from "@/lib/mediaLibrary";
import { PHOTO_STEP, shownPhotoAd, startPhotoAd, usePhotoAd } from "@/lib/photoAd";
import { loadProducts, productBits, productLabel } from "@/lib/products";
import { priceOf, reasonText, sumPrices } from "@/lib/prices";
import { brandName } from "@/lib/remixBrand";
import { useLeoUser } from "@/lib/useLeoOnly";
import { useUrlState, useUrlUpdate } from "@/lib/urlState";
import { STATIC_ANGLES } from "../../supabase/functions/remix/logic.ts";
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

/**
 * The page's one button: where it goes and what it carries. A format that needs a photo, with no product photo and
 * nothing in Media, adds a photo first; otherwise it hands the agent the layout and the topic. The photo make takes
 * `format`, with the product photo in when the format uses one.
 */
export function staticMake(
  f: Pick<StaticFormat, "slug" | "name" | "best" | "needs">,
  o: { note: string; brand: string; picture?: string; photos: number; price?: string },
): {
  label: string;
  to: string;
  state: { format: { topic: string } } | { send: true; from: ArrivedFrom; layout: string; topic: string };
  format: { topic: string; pictureKey?: string; price?: string };
} {
  const note = o.note.trim().slice(0, MAX_NOTE);
  const topic = note || `What ${o.brand} does and who it's for`;
  const usesPhoto = f.needs === "photo" || f.best === "photo";
  const format = { topic, ...(usesPhoto && o.picture ? { pictureKey: o.picture } : {}), ...(f.best === "price" && o.price ? { price: o.price } : {}) };
  if (f.needs === "photo" && !o.picture && !o.photos) return { label: "Add a photo", to: `${links.image({ layout: f.slug as never })}&pick=media`, state: { format: { topic } }, format };
  const ask = `Make a "${f.name}" static ad about ${(note || `what ${o.brand} does and who it's for`).replace(/\s+/g, " ")}`;
  return { label: "Make it as a layout", to: links.agent({ ask }), state: { send: true, from: { label: `Static ads > ${f.name}`, path: staticFormatHref(f.slug) }, layout: f.slug, topic }, format };
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
  const fromGallery = (useLocation().state as { back?: boolean } | null)?.back === true;
  const drawn = isStatic(def.slug);
  const example = useMemo(() => staticExampleUrl(def), [def]);
  const [params] = useSearchParams();
  const update = useUrlUpdate();
  const linkNote = params.get("note");
  const [note, setNote] = useState(() => linkNote?.slice(0, MAX_NOTE) ?? loadNote(def.slug));
  // ?note= fills the note once, kept on this device as a typed one is, then leaves the address
  useEffect(() => {
    if (linkNote === null) return;
    saveNote(def.slug, linkNote.slice(0, MAX_NOTE));
    update({ note: null });
  }, [linkNote, def.slug, update]);
  const [angle, setAngle] = useUrlState<string>("angle", "", { allowed: Object.keys(STATIC_ANGLES) });
  const items = useMemo(() => loadProducts(userId).items, [userId]);
  const [productId, setProduct] = useUrlState<string>("product", "", { allowed: items.map((p) => p.id) });
  const picked = items.find((p) => p.id === productId);
  const brand = useMemo(() => brandName(userId), [userId]);
  const bits = useMemo(
    () => (picked ? { ...(picked.pictures[0] ? { picture: picked.pictures[0] } : {}), ...(picked.price?.trim() ? { price: picked.price.trim() } : {}) } : productBits(loadProducts(userId))),
    [userId, picked],
  );
  const picks = { ...(angle ? { angle } : {}), ...(picked ? { product: picked.id } : {}) };
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
          <Link
            to="/make?tab=static"
            onClick={(e) => {
              if (!fromGallery) return;
              e.preventDefault();
              navigate(-1);
            }}
          >
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
          {(angle || picked) && (
            <ul className="flex flex-wrap gap-2" aria-label="Your picks">
              {angle && <Pick label={`Angle: ${angle}`} clear="Remove the angle" onClear={() => setAngle("")} />}
              {picked && <Pick label={`Product: ${productLabel(picked)}`} clear="Remove the product" onClear={() => setProduct("")} />}
            </ul>
          )}
          {drawn && (
            <div className="space-y-2">
              {adding && <p className="text-sm text-muted-foreground">This one shows what you sell, so it needs a photo of it first.</p>}
              {!adding && (
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    variant={photoFirst ? "default" : "outline"}
                    onClick={() => void startPhotoAd(userId, def, { ...action.format, ...picks })}
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
                      {mine.angle && <p className="text-xs text-muted-foreground">Angle: {mine.angle}</p>}
                      <Link to={links.media({ folder: AI_FOLDER, item: mine.mediaKey })} className="inline-flex font-semibold text-primary hover:underline [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:items-center">
                        Open it in Photos and videos
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
                      {/* the next angle with the same note, priced as the first press */}
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void startPhotoAd(userId, def, { ...action.format, ...picks })}
                          disabled={picturing || photoLeft === 0}
                          className="gap-1.5 [@media(pointer:coarse)]:min-h-11"
                        >
                          <ShuffleIcon className="h-4 w-4" /> Another angle
                        </Button>
                        <PriceChip price={sumPrices(priceOf("remix-make"), priceOf("ai-image"))} left={photoLeft} />
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {adding ? "It opens on the Image page and stays in " : "A photo goes to Photos and videos. A layout is made by the agent and stays in "}
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

/** One of the picks the agent carried in (an angle, a product): its words and a way to drop it. */
function Pick({ label, clear, onClear }: { label: string; clear: string; onClear: () => void }) {
  return (
    <li className="inline-flex min-h-9 items-center gap-1 rounded-full border border-border bg-card py-0.5 pl-3 pr-0.5 text-xs font-medium text-foreground [@media(pointer:coarse)]:min-h-11">
      {label}
      <button type="button" onClick={onClear} aria-label={clear} className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground [@media(pointer:coarse)]:h-10 [@media(pointer:coarse)]:w-10">
        <XIcon className="h-3.5 w-3.5" />
      </button>
    </li>
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
