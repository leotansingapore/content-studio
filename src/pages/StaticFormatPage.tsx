// /make/static/:slug (ff1111, after Fastlane's static ad format page): one static ad format from src/data/staticFormats.ts.
// A back chip to the Create gallery's Static ads tab, the name and line, an example drawn by our own template for a
// made-up business, what it works with, an optional note (kept on this device, cs-static-note-<slug>), the price and one
// button: "Make an ad in this format" opens /image on that layout and writes the words for the brand with the note
// (navigation state { go, format }, as the Remix sheet's link does; a pasted link writes nothing), and the design lands
// in Your images. A format that needs a photo, with none on this brand yet, reads "Add a photo" and opens the picker
// instead. Leo's sign-ins only (useLeoUser, so ?asLeo=1 works on localhost); anyone else, and an unknown slug, gets NotFound.

import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ChevronLeft, ImagePlus, Sparkles } from "lucide-react";
import PriceChip from "@/components/PriceChip";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { staticFormatBySlug, type StaticFormat } from "@/data/staticFormats";
import { useUsesLeft } from "@/lib/aiUsage";
import { staticExampleUrl } from "@/lib/staticExample";
import { isStatic } from "@/lib/imageLayout";
import { links } from "@/lib/links";
import { loadMedia } from "@/lib/mediaLibrary";
import { loadProducts, type Products } from "@/lib/products";
import { reasonText } from "@/lib/prices";
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
    label: "Make an ad in this format",
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
  const leftOf = useUsesLeft(false);
  const left = leftOf("remix-make");
  const action = staticMake(def, { note, brand, photos, ...bits });
  const adding = action.label === "Add a photo";
  const reason = adding ? null : reasonText({ left, leo: true });

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <Button asChild variant="ghost" size="sm" className="-ml-2 gap-1 text-muted-foreground">
          <Link to="/make?tab=static">
            <ChevronLeft className="h-4 w-4" /> Static ads
          </Link>
        </Button>
        <h1 className="font-serif text-2xl font-semibold leading-tight tracking-tight text-foreground sm:text-3xl">{def.name}</h1>
        <p className="text-sm text-muted-foreground">{def.blurb}</p>
      </header>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)] lg:items-start lg:gap-10">
        <figure className="space-y-2">
          <p className={LABEL}>Example</p>
          {example ? (
            <img src={example} alt={`An example ${def.name.toLowerCase()} ad`} width={1080} height={1350} className="block h-auto w-full max-w-[400px] rounded-lg border border-border/60 shadow-card" />
          ) : (
            <p className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">This format isn't drawn yet.</p>
          )}
          {example && <figcaption className="text-xs text-muted-foreground">Made up for a coffee shop. Yours is written for {brand}.</figcaption>}
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
              <div className="flex flex-wrap items-center gap-3">
                <Button onClick={() => navigate(action.to, { state: action.state })} disabled={!adding && left === 0} className="gap-1.5 [@media(pointer:coarse)]:min-h-11">
                  {adding ? <ImagePlus className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />} {action.label}
                </Button>
                {!adding && <PriceChip feature="remix-make" left={left} />}
              </div>
              {reason && <p className="text-xs text-muted-foreground">{reason}</p>}
              <p className="text-xs text-muted-foreground">
                It opens on the Image page and stays in{" "}
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
