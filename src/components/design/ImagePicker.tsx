// Where an image layer's picture comes from: a free stock search (Pexels), an upload, Media on this device, an AI
// picture, or the brand kit's logo and headshot. Uploads and AI pictures go into Media like everywhere else.

import { useEffect, useRef, useState } from "react";
import { Loader2, Search, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/design/fields";
import { pictureUrl } from "@/components/design/SlideView";
import { imageBusy, makeImage, onImageJob } from "@/lib/aiImage";
import { useUsesLeft } from "@/lib/aiUsage";
import { loadBrand } from "@/lib/carousel";
import type { DesignFormat } from "@/lib/design";
import { addMedia, loadMedia, storePicture } from "@/lib/mediaLibrary";
import { searchStock, type StockItem } from "@/lib/stockMedia";

type Source = "search" | "upload" | "media" | "generate";
const SOURCES = [
  { value: "search", label: "Search" },
  { value: "upload", label: "Upload" },
  { value: "media", label: "Media" },
  { value: "generate", label: "Generate" },
] as const;

function Thumb({ src, label, onPick }: { src: string; label: string; onPick: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => void pictureUrl(src).then(setUrl), [src]);
  return (
    <button type="button" onClick={onPick} title={label} aria-label={`Use ${label}`} className="aspect-[3/4] overflow-hidden rounded-md border border-border bg-muted hover:border-primary">
      {url && <img src={url} alt="" loading="lazy" className="h-full w-full object-cover" />}
    </button>
  );
}

export default function ImagePicker({ userId, format, onPick }: { userId: string; format: DesignFormat; onPick: (src: string) => void }) {
  const [source, setSource] = useState<Source>("search");
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<StockItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [making, setMaking] = useState(imageBusy());
  const file = useRef<HTMLInputElement>(null);
  const usesLeft = useUsesLeft(making);
  const brand = loadBrand(userId);

  // an AI picture lands in Media; the one this picker asked for goes on the layer
  useEffect(
    () =>
      onImageJob((j) => {
        setMaking(j?.state === "working" || j?.state === "saving");
        if (j?.state === "done" && j.mediaKey && j.designId === "design-editor") onPick(j.mediaKey);
        if (j?.state === "failed") setNote(j.error ?? "Couldn't make the picture. Try again in a minute.");
      }),
    [onPick],
  );

  const search = async () => {
    if (!query.trim()) return;
    setBusy(true);
    setNote(null);
    try {
      const r = await searchStock("photo", query, 1, format === "tiktok" ? "portrait" : undefined);
      setFound(r.items);
      if (!r.items.length) setNote("Nothing found. Try a broader word.");
    } catch (e) {
      setNote((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const upload = async (f: File | undefined) => {
    if (!f) return;
    if (!/^image\/(png|jpeg|webp|avif|gif)$/.test(f.type)) return setNote("Pick a PNG, JPEG, WebP or AVIF picture.");
    if (f.size > 10 * 1024 * 1024) return setNote("Pictures up to 10 MB.");
    setBusy(true);
    setNote(null);
    try {
      const pic = await storePicture(f, 1440);
      addMedia(userId, { key: pic.key, name: f.name.replace(/\.[^.]+$/, "").slice(0, 80), folder: "", alt: "", width: pic.width, height: pic.height, addedAt: new Date().toISOString() });
      onPick(pic.key);
    } catch (e) {
      setNote((e as Error).message || "Couldn't keep that picture. Try another.");
    } finally {
      setBusy(false);
    }
  };
  const left = usesLeft("ai-image");

  return (
    <div className="space-y-2">
      <Segmented value={source} options={SOURCES} onChange={(s) => (setSource(s), setNote(null))} />
      {source === "search" && (
        <>
          <form
            className="flex gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              void search();
            }}
          >
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search photos" aria-label="Search photos" className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm" />
            <Button type="submit" size="sm" variant="outline" disabled={busy || !query.trim()} className="h-8 gap-1">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />} Search
            </Button>
          </form>
          {found && (
            <div className="grid max-h-64 grid-cols-3 gap-1.5 overflow-y-auto">
              {found.map((it) => (
                <Thumb key={it.id} src={it.thumb} label={it.alt || `Photo by ${it.by}`} onPick={() => onPick(it.src)} />
              ))}
            </div>
          )}
          <p className="text-[11px] text-muted-foreground">Free photos from Pexels.</p>
        </>
      )}
      {source === "upload" && (
        <>
          <input ref={file} type="file" accept="image/png,image/jpeg,image/webp,image/avif,image/gif" className="hidden" onChange={(e) => void upload(e.target.files?.[0])} />
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => file.current?.click()} className="w-full gap-1.5">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Choose a picture
          </Button>
          <p className="text-[11px] text-muted-foreground">PNG, JPEG, WebP or AVIF, up to 10 MB. Kept in Media on this device.</p>
        </>
      )}
      {source === "media" && (
        <div className="grid max-h-64 grid-cols-3 gap-1.5 overflow-y-auto">
          {brand?.logo && <Thumb src="brand:logo" label="Your logo" onPick={() => onPick("brand:logo")} />}
          {brand?.photo && <Thumb src="brand:photo" label="Your headshot" onPick={() => onPick("brand:photo")} />}
          {loadMedia(userId)
            .filter((m) => m.kind !== "video")
            .slice(0, 60)
            .map((m) => (
              <Thumb key={m.key} src={m.key} label={m.name} onPick={() => onPick(m.key)} />
            ))}
        </div>
      )}
      {source === "generate" && (
        <>
          <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3} maxLength={600} placeholder="A quiet harbour at dawn, soft film grain" aria-label="Describe the picture" className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm" />
          <Button type="button" size="sm" disabled={making || !prompt.trim() || left === 0} onClick={() => void makeImage(userId, prompt, prompt.slice(0, 60), "design-editor")} className="w-full gap-1.5">
            {making && <Loader2 className="h-4 w-4 animate-spin" />} {making ? "Making the picture" : "Generate"}
          </Button>
          <p className="text-[11px] text-muted-foreground">{left === null ? "Saved to Media under AI images." : `${left} left today. Saved to Media under AI images.`}</p>
        </>
      )}
      {note && (
        <p role="status" className="text-xs text-destructive">
          {note}
        </p>
      )}
    </div>
  );
}
