// Memes on the Image page (docs/north-star/items/formats-memes.md). "Write 3 memes" is one remix make as "meme": the
// writer gives 3 options for the layout, Jev drops any that mock a group (all three dropped is a 422 that keeps the
// use) and marks the funniest "Best". Both runs here live outside React, so leaving the page keeps them, and mirror
// their step into formatJob for /library's Making now:
//   - the write saves the chosen option and the caption into the design (images.ts) and keeps the 3 options on this
//     device (cs-meme-options, newest 20 designs), so the rows come back after a reload;
//   - "Make one" makes the picture with ai-image (Soul v2) and puts it in the design; Expectation vs reality makes
//     both of its pictures, one after the other, which takes two ai-image uses and says so on the button.
// The picture is never a famous meme picture: made, from your Media, or free stock (Pexels, credit kept).

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Check, ImagePlus, Loader2, Search, Sparkles } from "lucide-react";
import PriceChip from "@/components/PriceChip";
import StockSearch from "@/components/StockSearch";
import { Button } from "@/components/ui/button";
import { FilterChip } from "@/components/ui/filter-chip";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { imageBusy, imageJob, makeImage } from "@/lib/aiImage";
import { getFile } from "@/lib/deviceFiles";
import { setFormatJob } from "@/lib/formatJob";
import { SECOND_PICTURE, isMeme, mainWords, memeChoice, optionIndex, secondPicture, type ImageSize, type MemeLayoutId } from "@/lib/imageLayout";
import { imageById, saveImage, type SavedImage } from "@/lib/images";
import { links } from "@/lib/links";
import { addMedia, storePicture, type MediaItem } from "@/lib/mediaLibrary";
import { priceOf, sumPrices } from "@/lib/prices";
import { requestMake, type Flags } from "@/lib/remix";
import type { RemixSource } from "@/lib/remixSource";
import { failure, makeBody } from "@/lib/slideshowJob";
import { downloadStock } from "@/lib/stockMedia";
import { cn } from "@/lib/utils";

const FIELD_LABEL = "text-xs font-semibold text-muted-foreground";
const TOUCH = "[@media(pointer:coarse)]:min-h-11";

// ---- the 3 options, kept per design on this device -------------------------------------------

export interface MemeSet {
  layout: MemeLayoutId;
  options: Record<string, string>[];
  /** Jev's funniest kept option, or null when Jev gave nothing. */
  best: number | null;
  /** Options Jev read as unsafe: never shown. */
  dropped: number[];
}

const SETS_KEY = "cs-meme-options";
const MAX_SETS = 20;

function readSets(): Record<string, unknown> {
  try {
    const v = JSON.parse(localStorage.getItem(SETS_KEY) ?? "{}");
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

/** The options last written for this design, or null (nothing written here, or junk). */
export function memeSetFor(designId: string): MemeSet | null {
  const r = readSets()[designId] as Record<string, unknown> | undefined;
  if (!r || typeof r !== "object" || typeof r.layout !== "string" || !isMeme(r.layout)) return null;
  const options = (Array.isArray(r.options) ? r.options : [])
    .slice(0, 3)
    .map((o) => Object.fromEntries(Object.entries(o && typeof o === "object" ? o : {}).filter((e): e is [string, string] => typeof e[1] === "string").map(([k, v]) => [k, v.slice(0, 400)])));
  if (!options.length) return null;
  const at = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) < options.length;
  return { layout: r.layout, options, best: at(r.best) ? r.best : null, dropped: Array.isArray(r.dropped) ? r.dropped.filter(at) : [] };
}

function keepSet(designId: string, set: MemeSet): void {
  try {
    const next = Object.fromEntries([[designId, set], ...Object.entries(readSets()).filter(([k]) => k !== designId)].slice(0, MAX_SETS));
    localStorage.setItem(SETS_KEY, JSON.stringify(next));
  } catch {
    // a hint only: the chosen words are already in the design
  }
}

// ---- Write 3 memes ----------------------------------------------------------------------------

export interface MemeAsk {
  designId: string;
  layout: MemeLayoutId;
  source: RemixSource | null;
  topic: string;
  note: string;
  size: ImageSize;
}

export interface MemeWrite {
  id: number;
  designId: string;
  state: "writing" | "done" | "failed";
  error?: string;
  /** The writer or Jev said no (422): the use is kept. */
  refused?: boolean;
  capped?: boolean;
  flags?: Flags;
}

export const MEME_FAILED = "Couldn't write them right now. Try again in a minute.";
export const MEME_STEP = "Writing 3 memes...";
const PICTURE_STEP = "Making your picture...";

/** Both runs share the meme's one line in Making now. */
const mirror = (designId: string, state: "working" | "ready" | "failed", step?: string, error?: string) =>
  setFormatJob({ slug: "meme", label: "Meme", format: "image", state, ...(step ? { step } : {}), ...(error ? { error } : {}), href: links.image({ image: designId }) });

let write: MemeWrite | null = null;
let writes = 0;
const writeListeners = new Set<(w: MemeWrite | null) => void>();
const setWrite = (next: MemeWrite) => {
  write = next;
  writeListeners.forEach((l) => l({ ...next }));
  mirror(next.designId, next.state === "done" ? "ready" : next.state === "failed" ? "failed" : "working", next.state === "writing" ? MEME_STEP : undefined, next.error);
};
export const memeWrite = () => write;
export const memeWriteBusy = () => write?.state === "writing";
export function onMemeWrite(fn: (w: MemeWrite | null) => void): () => void {
  writeListeners.add(fn);
  return () => void writeListeners.delete(fn);
}

export async function startMemeWrite(userId: string, ask: MemeAsk): Promise<void> {
  if (memeWriteBusy()) return;
  const base = { id: ++writes, designId: ask.designId };
  setWrite({ ...base, state: "writing" });
  try {
    const body = makeBody(userId, { source: ask.source, topic: ask.topic, mention: true, note: ask.note, size: ask.size === "9x16" ? "9x16" : "4x5" }, "meme", { layout: ask.layout });
    const res = await requestMake(body);
    if (res?.result?.as !== "meme") throw new Error(MEME_FAILED);
    const r = res.result;
    const set: MemeSet = { layout: ask.layout, options: r.options, best: r.best, dropped: r.dropped };
    keepSet(ask.designId, set);
    const chosen = memeChoice(set);
    const design = imageById(userId, ask.designId);
    if (design && chosen !== null) saveImage(userId, { ...design, layout: ask.layout, words: { ...design.words, ...r.options[chosen], caption: r.caption } });
    setWrite({ ...base, state: "done", flags: res.flags });
  } catch (e) {
    setWrite({ ...base, state: "failed", ...failure(e, MEME_FAILED) });
  }
}

export function useMemeWrite(): MemeWrite | null {
  const [w, setW] = useState(memeWrite);
  useEffect(() => onMemeWrite(setW), []);
  return w;
}

// ---- Make one: the meme's picture (two for expectation vs reality) ------------------------------

export interface MemePictures {
  /** Goes up with every picture that lands, so the page puts each one in once. */
  seq: number;
  designId: string;
  state: "working" | "done" | "failed";
  total: number;
  error?: string;
  landed?: { slot: 0 | 1; key: string };
}

let pictures: MemePictures | null = null;
let pictureSeq = 0;
const pictureListeners = new Set<(p: MemePictures | null) => void>();
const setPictures = (next: MemePictures) => {
  pictures = next;
  pictureListeners.forEach((l) => l({ ...next }));
  mirror(next.designId, next.state === "done" ? "ready" : next.state, next.state === "working" ? PICTURE_STEP : undefined, next.error);
};
export const memePictures = () => pictures;
export const memePicturesBusy = () => pictures?.state === "working";

/** One picture per prompt, in order: the first is the design's picture, a second is expectation's reality picture. */
export async function startMemePictures(userId: string, designId: string, prompts: string[], name: string): Promise<void> {
  if (memePicturesBusy() || imageBusy() || !prompts.length) return;
  const total = prompts.length;
  setPictures({ seq: ++pictureSeq, designId, total, state: "working" });
  for (const [i, prompt] of prompts.entries()) {
    await makeImage(userId, prompt, name);
    const j = imageJob();
    if (j?.state !== "done" || !j.mediaKey) {
      setPictures({ seq: ++pictureSeq, designId, total, state: "failed", error: j?.error || "Couldn't make the picture. Try again." });
      return;
    }
    const slot = i === 0 ? 0 : 1;
    const design = imageById(userId, designId);
    // kept in the design even when the page is closed; an open page puts it in its own copy too
    if (design) saveImage(userId, slot === 0 ? { ...design, pictureKey: j.mediaKey } : { ...design, words: { ...design.words, [SECOND_PICTURE]: j.mediaKey } });
    setPictures({ seq: ++pictureSeq, designId, total, state: i === total - 1 ? "done" : "working", landed: { slot, key: j.mediaKey } });
  }
}

export function useMemePictures(): MemePictures | null {
  const [p, setP] = useState(memePictures);
  useEffect(() => {
    pictureListeners.add(setP);
    return () => void pictureListeners.delete(setP);
  }, []);
  return p;
}

// ---- the option rows --------------------------------------------------------------------------

/** One option as a reader sees it, with the words the layout prints itself. */
function optionLine(layout: MemeLayoutId, o: Record<string, string>): string {
  if (layout === "nobody-me") return `Nobody: / ${mainWords(layout, o)}`;
  if (layout === "expectation") return `Expectation: ${o.expectation ?? ""} / Reality: ${o.reality ?? ""}`;
  return mainWords(layout, o);
}

/** The written options as radio rows, Jev's funniest tagged Best; picking one puts its words in the design. */
export function MemeOptions(p: { set: MemeSet; words: Record<string, string>; disabled: boolean; onPick: (option: Record<string, string>) => void }) {
  const chosen = optionIndex(p.words, p.set.options);
  const kept = p.set.options.map((o, i) => ({ o, i })).filter(({ i }) => !p.set.dropped.includes(i));
  const out = p.set.dropped.length;
  return (
    <fieldset className="space-y-1.5" disabled={p.disabled}>
      <legend className={cn(FIELD_LABEL, "mb-1.5")}>Pick one</legend>
      {kept.map(({ o, i }) => (
        <label
          key={i}
          className={cn(
            "flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5 text-sm",
            TOUCH,
            chosen === i ? "border-primary bg-primary/5" : "border-border/60 hover:bg-muted/50",
          )}
        >
          <input type="radio" name="meme-option" checked={chosen === i} onChange={() => p.onPick(o)} className="mt-0.5 h-4 w-4 shrink-0 accent-primary" />
          <span className="min-w-0 flex-1 break-words">{optionLine(p.set.layout, o)}</span>
          {p.set.best === i && <span className="shrink-0 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">Best</span>}
        </label>
      ))}
      {out > 0 && <p className="text-xs text-muted-foreground">{out === 1 ? "One more was" : `${out} more were`} left out as not safe to post.</p>}
    </fieldset>
  );
}

// ---- the picture picker -----------------------------------------------------------------------

/** A library photo, loaded from this device. */
export function MediaThumb({ item, active, onPick }: { item: MediaItem; active: boolean; onPick: () => void }) {
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
    <button
      type="button"
      onClick={onPick}
      disabled={url === ""}
      title={item.name}
      aria-label={`Use ${item.name}`}
      aria-pressed={active}
      className={cn("block aspect-square w-full overflow-hidden rounded-md border bg-muted hover:border-primary disabled:opacity-40", active ? "border-primary ring-2 ring-primary/40" : "border-border/70")}
    >
      {url ? <img src={url} alt={item.alt || item.name} className="h-full w-full object-cover" /> : null}
    </button>
  );
}

const REACTIONS = [
  { id: "disbelief", label: "Disbelief", does: "staring at the phone in disbelief" },
  { id: "laughing", label: "Laughing", does: "laughing at a laptop" },
  { id: "facepalm", label: "Facepalm", does: "with a hand on the forehead" },
  { id: "smug", label: "Smug", does: "looking calm and smug" },
  { id: "tired", label: "Tired", does: "tired at a desk late at night" },
] as const;
type Reaction = (typeof REACTIONS)[number]["id"];

const clip = (t: string) => t.replace(/\s+/g, " ").trim().slice(0, 160);

/** The prompts "Make one" starts from: a reaction in a scene the words suggest; expectation's two from its labels. */
function seedPrompts(layout: MemeLayoutId, words: Record<string, string>, reaction: Reaction, about: string): string[] {
  const does = REACTIONS.find((r) => r.id === reaction)?.does ?? REACTIONS[0].does;
  if (layout === "expectation") {
    return [
      `A photo for a meme: what someone hopes for, "${clip(words.expectation || about)}". One person in a bright, happy everyday moment.`,
      `A photo for a meme: one person ${does}, the reality of "${clip(words.reality || about)}".`,
    ];
  }
  const scene = clip(mainWords(layout, words) || about);
  return [`A photo for a meme: one person ${does}${scene ? `, in a scene that fits "${scene}"` : ""}.`];
}

export function MemePicture(p: {
  userId: string;
  layout: MemeLayoutId;
  img: SavedImage;
  pick: "none" | "media" | "make" | "stock";
  media: MediaItem[];
  disabled: boolean;
  /** ai-image uses left today, or null before they are read. */
  left: number | null;
  /** What the meme is about, when it has no words yet. */
  about: string;
  onPick: (slot: 0 | 1, key: string | undefined) => void;
  onOpen: (p: "media" | "make" | "stock") => void;
}) {
  const two = p.layout === "expectation";
  const keys = [p.img.pictureKey, secondPicture(p.img.words)];
  const [slot, setSlot] = useState<0 | 1>(() => (two && keys[0] && !keys[1] ? 1 : 0));
  const at = two ? slot : 0;
  // the expectation picture set and the reality one still empty: the next pick is the reality picture
  useEffect(() => {
    if (two && keys[0] && !keys[1]) setSlot(1);
  }, [keys[0]]); // eslint-disable-line react-hooks/exhaustive-deps
  const [reaction, setReaction] = useState<Reaction>("disbelief");
  const [prompts, setPrompts] = useState<string[]>(() => seedPrompts(p.layout, p.img.words, reaction, p.about));
  const [edited, setEdited] = useState(false);
  const run = useMemePictures();
  const making = run?.state === "working";
  const mine = run?.designId === p.img.id ? run : null;
  // opening Make one, or another layout, starts from the words as they are now, unless you typed a prompt
  useEffect(() => {
    if (p.pick === "make" && !edited) setPrompts(seedPrompts(p.layout, p.img.words, reaction, p.about));
  }, [p.pick, p.layout]); // eslint-disable-line react-hooks/exhaustive-deps

  const uses = two ? 2 : 1;
  const price = two ? sumPrices(priceOf("ai-image"), priceOf("ai-image")) : priceOf("ai-image");
  const short = prompts.some((x) => x.trim().length < 10);
  const pickReaction = (r: Reaction) => {
    setReaction(r);
    setEdited(false);
    setPrompts(seedPrompts(p.layout, p.img.words, r, p.about));
  };
  const make = () => void startMemePictures(p.userId, p.img.id, prompts.map((x) => x.trim()), `Meme: ${mainWords(p.layout, p.img.words) || p.about}`.slice(0, 80));
  const addStock = async (it: { src: string; alt: string; by: string; byUrl: string; url: string }, query: string) => {
    const pic = await storePicture(await downloadStock(it.src));
    addMedia(p.userId, {
      key: pic.key, name: (it.alt || query || "Stock photo").replace(/\.$/, "").slice(0, 80), folder: "", alt: it.alt, width: pic.width, height: pic.height,
      addedAt: new Date().toISOString(), credit: { by: it.by, byUrl: it.byUrl, url: it.url },
    });
    p.onPick(at, pic.key);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <p className={FIELD_LABEL}>{two ? "Pictures" : "Picture"}</p>
        {keys[at] && (
          <button type="button" onClick={() => p.onPick(at, undefined)} disabled={p.disabled} className={cn("text-xs font-semibold text-primary hover:underline", TOUCH)}>
            Remove
          </button>
        )}
      </div>
      {two && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Which picture">
          {(["Expectation", "Reality"] as const).map((label, i) => (
            <FilterChip key={label} active={at === i} disabled={p.disabled} onClick={() => setSlot(i as 0 | 1)}>
              {keys[i] && <Check className="h-3.5 w-3.5" aria-hidden />}
              {label}
            </FilterChip>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-1.5">
        <FilterChip active={p.pick === "make"} disabled={p.disabled} onClick={() => p.onOpen("make")}>
          <Sparkles className="h-3.5 w-3.5" aria-hidden /> Make one
        </FilterChip>
        <FilterChip active={p.pick === "media"} disabled={p.disabled} onClick={() => p.onOpen("media")}>
          <ImagePlus className="h-3.5 w-3.5" aria-hidden /> From Media
        </FilterChip>
        <FilterChip active={p.pick === "stock"} disabled={p.disabled} onClick={() => p.onOpen("stock")}>
          <Search className="h-3.5 w-3.5" aria-hidden /> Free stock
        </FilterChip>
      </div>

      {p.pick === "make" && (
        <div className="space-y-2 rounded-lg border border-border/60 p-3">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Reaction">
            {REACTIONS.map((r) => (
              <FilterChip key={r.id} active={reaction === r.id} disabled={making} onClick={() => pickReaction(r.id)}>
                {r.label}
              </FilterChip>
            ))}
          </div>
          {prompts.map((value, i) => (
            <div key={i} className="space-y-1">
              <Label htmlFor={`meme-prompt-${i}`} className={FIELD_LABEL}>
                {two ? (i ? "Reality picture shows" : "Expectation picture shows") : "What the picture shows"}
              </Label>
              <Textarea
                id={`meme-prompt-${i}`}
                rows={2}
                value={value}
                maxLength={1200}
                disabled={making}
                onChange={(e) => {
                  setEdited(true);
                  setPrompts((all) => all.map((x, j) => (j === i ? e.target.value : x)));
                }}
              />
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={make} disabled={making || imageBusy() || short || p.left === 0 || (p.left !== null && p.left < uses)} className={cn("gap-1.5", TOUCH)}>
              {making ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {making ? (two ? "Making your pictures..." : PICTURE_STEP) : two ? "Make both, 2 uses" : "Make it"}
            </Button>
            <PriceChip feature="ai-image" price={price} uses={uses} left={p.left} />
          </div>
          {mine?.state === "failed" && <p className="text-xs text-destructive">{mine.error}</p>}
        </div>
      )}

      {p.pick === "media" &&
        (p.media.length ? (
          <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6">
            {p.media.slice(0, 24).map((m) => (
              <MediaThumb key={m.key} item={m} active={keys[at] === m.key} onPick={() => p.onPick(at, m.key)} />
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            <Link to={links.media()} className="font-semibold text-primary hover:underline [@media(pointer:coarse)]:py-3">Add photos in Media</Link> to use your own.
          </p>
        ))}

      {p.pick === "stock" && <StockSearch kind="photo" placeholder="Laughing at a laptop, tired at a desk" onPick={addStock} onClose={() => p.onOpen("stock")} />}
    </div>
  );
}
