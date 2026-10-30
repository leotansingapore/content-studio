// The slideshow editor's right panel (under the slide on phones): the Slide, Text and Overlay tabs. It only
// renders and reports; every edit is made by the page through `act`, so Undo sees all of them.

import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Copy, ImagePlus, Images, Loader2, PaintBucket, Plus, Shuffle, Trash2, Type } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { scanCompliance } from "@/lib/compliance";
import { getFile } from "@/lib/deviceFiles";
import { links } from "@/lib/links";
import { loadMedia, type MediaItem } from "@/lib/mediaLibrary";
import {
  BG_LABELS,
  DARKEN_MAX,
  FONT_LABELS,
  MAX_BOXES,
  MAX_BOX_CHARS,
  MAX_SLIDES,
  MIN_SLIDES,
  PLAIN_FILL,
  SIZES,
  SIZE_MAX,
  SIZE_MIN,
  STROKE_MAX,
  type BoxBg,
  type BoxFont,
  type BoxStyle,
  type ShowSize,
  type ShowSlide,
  type Slideshow,
  type TextBox,
} from "@/lib/slideshow";
import { cn } from "@/lib/utils";

export type Panel = "slide" | "text" | "overlay";
export const PANELS: Panel[] = ["slide", "text", "overlay"];
const PANEL_LABELS: Record<Panel, string> = { slide: "Slide", text: "Text", overlay: "Overlay" };
const TOUCH = "[@media(pointer:coarse)]:min-h-11";

export interface InspectorActs {
  size: (size: ShowSize) => void;
  swap: () => void;
  media: (key: string) => void;
  upload: (file: File) => void;
  /** The picture gone, this colour behind the words. */
  plain: (fill: string) => void;
  addSlide: () => void;
  duplicate: () => void;
  deleteSlide: () => void;
  addText: () => void;
  words: (text: string) => void;
  style: (patch: Partial<BoxStyle>) => void;
  overlay: (patch: Partial<Slideshow["overlay"]>) => void;
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-2">
      <legend className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</legend>
      {children}
    </fieldset>
  );
}

function Choices<T extends string>({ value, options, labels, onPick, label }: { value: T; options: readonly T[]; labels: Record<T, string>; onPick: (v: T) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1 rounded-lg border border-border/60 bg-muted/30 p-1">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          aria-pressed={value === o}
          onClick={() => onPick(o)}
          className={cn(
            "min-h-8 flex-1 whitespace-nowrap rounded-md px-2.5 text-xs font-semibold transition-colors",
            TOUCH,
            value === o ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {labels[o]}
        </button>
      ))}
    </div>
  );
}

function Range({ label, value, min, max, step = 1, shown, onChange }: { label: string; value: number; min: number; max: number; step?: number; shown: string; onChange: (v: number) => void }) {
  return (
    <label className="block space-y-1 text-xs">
      <span className="flex justify-between font-semibold text-foreground">
        {label} <span className="font-normal tabular-nums text-muted-foreground">{shown}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className={cn("h-8 w-full accent-primary", TOUCH)} />
    </label>
  );
}

function Colour({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className={cn("flex min-h-9 items-center justify-between gap-2 text-xs", TOUCH)}>
      <span className="font-semibold text-foreground">{label}</span>
      <span className="flex items-center gap-2 text-muted-foreground">
        <span className="font-mono uppercase">{value}</span>
        <input type="color" value={value.toLowerCase()} onChange={(e) => onChange(e.target.value.toUpperCase())} className="h-8 w-10 cursor-pointer rounded border border-input bg-background p-0.5" />
      </span>
    </label>
  );
}

/** A library photo, loaded from this device. */
function MediaThumb({ item, onPick }: { item: MediaItem; onPick: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let made = "";
    void getFile(item.key).then((b) => {
      if (b) setUrl((made = URL.createObjectURL(b)));
      else setUrl("");
    });
    return () => {
      if (made) URL.revokeObjectURL(made);
    };
  }, [item.key]);
  return (
    <button type="button" onClick={onPick} disabled={url === ""} title={item.name} aria-label={`Use ${item.name}`}
      className="block aspect-square w-full overflow-hidden rounded-md border border-border/70 bg-muted hover:border-primary disabled:opacity-40">
      {url ? <img src={url} alt={item.alt || item.name} className="h-full w-full object-cover" /> : null}
    </button>
  );
}

const outline = (extra = "") => cn("h-9 gap-1.5 text-xs", TOUCH, extra);

export default function SlideInspector({
  userId,
  show,
  slide,
  box,
  panel,
  onPanel,
  allBoxes,
  onAllBoxes,
  swap,
  brand,
  act,
}: {
  userId: string;
  show: Slideshow;
  slide: ShowSlide;
  box: TextBox | null;
  panel: Panel;
  onPanel: (p: Panel) => void;
  allBoxes: boolean;
  onAllBoxes: (on: boolean) => void;
  /** Swap picture: searching, and the line under it (nothing found, or the server's words). */
  swap: { busy: boolean; note: string | null };
  brand: { handle: boolean; logo: boolean };
  act: InspectorActs;
}) {
  const [mediaOpen, setMediaOpen] = useState(false);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const full = show.slides.length >= MAX_SLIDES;
  const least = show.slides.length <= MIN_SLIDES;
  // every box on the slide, picked or not, so a flagged phrase never hides in a box nobody tapped
  const flags = scanCompliance(slide.boxes.map((b) => b.text).join("\n\n"));

  const toggleMedia = () => {
    if (!mediaOpen) setMedia(loadMedia(userId));
    setMediaOpen(!mediaOpen);
  };

  const allBox = (
    <label className={cn("flex min-h-9 items-center gap-2 text-xs font-medium", TOUCH)}>
      <input type="checkbox" checked={allBoxes} onChange={(e) => onAllBoxes(e.target.checked)} className="h-4 w-4 accent-primary" />
      Apply to all text boxes
    </label>
  );
  const chips = flags.length > 0 && (
    <ul className="space-y-1">
      {flags.map((f) => (
        <li key={f.id} className={cn("rounded-md border px-2 py-1 text-[11px]", f.severity === "error" ? "border-destructive/40 bg-destructive/5 text-destructive" : "border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 text-amber-900 dark:text-amber-100")}>
          <span className="font-semibold">{f.match}</span>: {f.message}
        </li>
      ))}
    </ul>
  );
  const addText = (
    <div className="space-y-1">
      <Button type="button" variant="outline" size="sm" onClick={act.addText} disabled={slide.boxes.length >= MAX_BOXES} className={outline("w-full")}>
        <Type className="h-3.5 w-3.5" /> Add text
      </Button>
      {slide.boxes.length >= MAX_BOXES && <p className="text-[11px] text-muted-foreground">6 text boxes is the most a slide holds.</p>}
    </div>
  );

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Edit" className="flex gap-1 rounded-lg border border-border/60 bg-muted/30 p-1">
        {PANELS.map((p) => (
          <button
            key={p}
            type="button"
            role="tab"
            aria-selected={panel === p}
            onClick={() => onPanel(p)}
            className={cn("min-h-9 flex-1 rounded-md px-3 text-xs font-semibold transition-colors", TOUCH, panel === p ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
          >
            {PANEL_LABELS[p]}
          </button>
        ))}
      </div>

      {panel === "slide" && (
        <div role="tabpanel" aria-label="Slide" className="space-y-5">
          <Group label="Size">
            <Choices label="Size" value={show.size} options={Object.keys(SIZES) as ShowSize[]} labels={Object.fromEntries(Object.entries(SIZES).map(([k, v]) => [k, v.label])) as Record<ShowSize, string>} onPick={act.size} />
          </Group>
          <Group label="Picture">
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3 lg:grid-cols-1">
              <Button type="button" variant="outline" size="sm" onClick={act.swap} disabled={swap.busy} className={outline()}>
                {swap.busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Shuffle className="h-3.5 w-3.5" />}
                {swap.busy ? "Finding a picture..." : "Swap picture"}
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={toggleMedia} aria-expanded={mediaOpen} className={outline()}>
                <Images className="h-3.5 w-3.5" /> My pictures
              </Button>
              <label className={cn("inline-flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-md border border-input bg-background px-3 text-xs font-semibold hover:border-primary/40", TOUCH)}>
                <ImagePlus className="h-3.5 w-3.5" /> Upload a picture
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) act.upload(f);
                  }}
                />
              </label>
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => act.plain(slide.fill ?? PLAIN_FILL)} disabled={!slide.image && !slide.photo} className={outline("flex-1")}>
                <PaintBucket className="h-3.5 w-3.5" /> Plain colour
              </Button>
              {!slide.image && !slide.photo && (
                <input
                  type="color"
                  aria-label="Slide colour"
                  value={slide.fill ?? PLAIN_FILL}
                  onChange={(e) => act.plain(e.target.value)}
                  className={cn("h-9 w-11 cursor-pointer rounded-md border border-input bg-background p-1", TOUCH)}
                />
              )}
            </div>
            {swap.note && <p role="status" className="text-xs text-muted-foreground">{swap.note}</p>}
            {slide.photo?.by && (
              <p className="text-[11px] text-muted-foreground">
                Photo by{" "}
                {slide.photo.byUrl ? (
                  <a href={slide.photo.byUrl} target="_blank" rel="noreferrer" className="font-semibold hover:underline">{slide.photo.by}</a>
                ) : (
                  slide.photo.by
                )}{" "}
                on Pexels
              </p>
            )}
            {mediaOpen && (
              <div className="rounded-lg border border-border/60 p-2">
                {media.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No photos in Media yet. <Link to={links.media()} className="font-semibold text-primary hover:underline">Add some</Link>
                  </p>
                ) : (
                  <ul className="grid max-h-48 grid-cols-4 gap-1.5 overflow-y-auto">
                    {media.map((m) => (
                      <li key={m.key}>
                        <MediaThumb
                          item={m}
                          onPick={() => {
                            act.media(m.key);
                            setMediaOpen(false);
                          }}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </Group>
          <Group label="Slides">
            <div className="grid grid-cols-3 gap-1.5 lg:grid-cols-1">
              <Button type="button" variant="outline" size="sm" onClick={act.addSlide} disabled={full} className={outline()}>
                <Plus className="h-3.5 w-3.5" /> Add slide
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={act.duplicate} disabled={full} className={outline()}>
                <Copy className="h-3.5 w-3.5" /> Duplicate
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={act.deleteSlide} disabled={least} className={outline("text-destructive hover:text-destructive")}>
                <Trash2 className="h-3.5 w-3.5" /> Delete slide
              </Button>
            </div>
            {full && <p className="text-[11px] text-muted-foreground">10 slides is the most Post it for me can send.</p>}
            {least && <p className="text-[11px] text-muted-foreground">A slideshow needs at least 2 slides.</p>}
          </Group>
        </div>
      )}

      {panel === "text" && (
        <div role="tabpanel" aria-label="Text" className="space-y-4">
          {!box ? (
            <>
              <p className="text-sm text-muted-foreground">Tap the words on a slide to change them.</p>
              {chips}
              {addText}
              {allBox}
              <p className="text-xs text-muted-foreground">Pick a text box to change its style.</p>
            </>
          ) : (
            <>
              <label className="block space-y-1">
                <span className="text-xs font-semibold text-foreground">Words</span>
                <Textarea value={box.text} maxLength={MAX_BOX_CHARS} rows={3} onChange={(e) => act.words(e.target.value)} className="text-sm" />
                <span className="block text-[11px] text-muted-foreground">Or double-tap the words on the slide.</span>
              </label>
              {chips}
              {addText}
              {allBox}
              <Group label="Font">
                <Choices label="Font" value={box.font} options={["heavy", "clean", "serif"] as BoxFont[]} labels={FONT_LABELS} onPick={(font) => act.style({ font })} />
              </Group>
              <Range label="Size" value={box.size} min={SIZE_MIN} max={SIZE_MAX} shown={`${box.size}px`} onChange={(size) => act.style({ size })} />
              <Colour label="Colour" value={box.color} onChange={(color) => act.style({ color })} />
              <Range label="Outline" value={box.stroke} min={0} max={STROKE_MAX} shown={`${box.stroke}px`} onChange={(stroke) => act.style({ stroke })} />
              <Colour label="Outline colour" value={box.strokeColor} onChange={(strokeColor) => act.style({ strokeColor })} />
              <Group label="Background">
                <Choices label="Background" value={box.bg} options={["white", "none", "bar"] as BoxBg[]} labels={BG_LABELS} onPick={(bg) => act.style({ bg })} />
              </Group>
            </>
          )}
        </div>
      )}

      {panel === "overlay" && (
        <div role="tabpanel" aria-label="Overlay" className="space-y-5">
          <Range
            label="Darken the picture"
            value={Math.round(show.overlay.darken * 100)}
            min={0}
            max={DARKEN_MAX * 100}
            step={5}
            shown={`${Math.round(show.overlay.darken * 100)}%`}
            onChange={(v) => act.overlay({ darken: v / 100 })}
          />
          <Group label="Your mark">
            <Choices label="Your mark" value={show.overlay.mark} options={["off", "handle", "logo"] as const} labels={{ off: "Off", handle: "Handle", logo: "Logo" }} onPick={(mark) => act.overlay({ mark })} />
            {show.overlay.mark === "handle" && !brand.handle && (
              <p className="text-xs text-muted-foreground">
                Add your handle in <Link to={links.brand({ section: "you" })} className="font-semibold text-primary hover:underline">Brand kit</Link>.
              </p>
            )}
            {show.overlay.mark === "logo" && !brand.logo && (
              <p className="text-xs text-muted-foreground">
                Add your logo in <Link to={links.brand({ section: "logo" })} className="font-semibold text-primary hover:underline">Brand kit</Link>.
              </p>
            )}
          </Group>
        </div>
      )}
    </div>
  );
}
