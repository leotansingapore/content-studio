// The Text tab's Cut-out picture row (/slideshow): pick a photo, tap the thing to keep, see the cut-out, add it to the
// slide. The cutting is cutout.ts, on this device; the page adds the box through `onAdd`, so Undo sees it.

import { useEffect, useState, type MouseEvent } from "react";
import { Loader2, Plus, Scissors } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cutOut } from "@/lib/cutout";
import { cn } from "@/lib/utils";

const TOUCH = "[@media(pointer:coarse)]:min-h-11";

export default function CutoutPicker({ full, onAdd }: { full: boolean; onAdd: (blob: Blob, ar: number) => Promise<void> }) {
  const [photo, setPhoto] = useState<{ file: File; url: string } | null>(null);
  const [tap, setTap] = useState<{ x: number; y: number } | null>(null);
  const [cut, setCut] = useState<{ blob: Blob; ar: number; url: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => () => void (photo && URL.revokeObjectURL(photo.url)), [photo]);
  useEffect(() => () => void (cut && URL.revokeObjectURL(cut.url)), [cut]);

  const reset = () => {
    setPhoto(null);
    setCut(null);
    setTap(null);
    setNote(null);
  };
  const choose = (f: File | undefined) => {
    if (!f) return;
    reset();
    if (!f.type.startsWith("image/")) return setNote("Pick a picture file.");
    setPhoto({ file: f, url: URL.createObjectURL(f) });
  };
  const cutAt = async (e: MouseEvent<HTMLButtonElement>) => {
    if (!photo || busy) return;
    const r = e.currentTarget.getBoundingClientRect();
    // a keyboard press has no point: it cuts what's in the middle
    const p = e.detail === 0 ? { x: 0.5, y: 0.5 } : { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
    setTap(p);
    setBusy(true);
    setNote(null);
    try {
      const out = await cutOut(photo.file, p.x, p.y);
      setCut({ ...out, url: URL.createObjectURL(out.blob) });
    } catch (err) {
      setCut(null);
      setNote(err instanceof Error ? err.message : "That picture couldn't be cut out.");
    } finally {
      setBusy(false);
    }
  };
  const add = async () => {
    if (!cut) return;
    setBusy(true);
    try {
      await onAdd(cut.blob, cut.ar);
      reset();
    } catch (err) {
      setNote(err instanceof Error ? err.message : "The cut-out couldn't be added.");
    } finally {
      setBusy(false);
    }
  };

  if (!photo)
    return (
      <div className="space-y-1">
        <label className={cn("inline-flex h-9 w-full cursor-pointer items-center justify-center gap-1.5 rounded-md border border-input bg-background px-3 text-xs font-semibold hover:border-primary/40", TOUCH, full && "pointer-events-none opacity-40")}>
          <Scissors className="h-3.5 w-3.5" /> Cut out a photo
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            disabled={full}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              choose(f);
            }}
          />
        </label>
        {note && <p role="status" className="text-xs text-muted-foreground">{note}</p>}
      </div>
    );

  return (
    <div className="space-y-2">
      <p className="text-[11px] text-muted-foreground">Tap the thing to keep.</p>
      <button type="button" onClick={(e) => void cutAt(e)} disabled={busy} aria-label="Tap the thing to keep" className="relative mx-auto block w-fit cursor-crosshair overflow-hidden rounded-md border border-input">
        <img src={photo.url} alt="" className="block max-h-64 max-w-full" />
        {tap && <span aria-hidden className="absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-primary shadow" style={{ left: `${tap.x * 100}%`, top: `${tap.y * 100}%` }} />}
      </button>
      {busy && !cut && (
        <p role="status" className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cutting it out...
        </p>
      )}
      {cut && (
        <div className="flex h-28 items-center justify-center rounded-md border border-input bg-muted p-2">
          <img src={cut.url} alt="The cut-out" className="max-h-full max-w-full" />
        </div>
      )}
      {note && <p role="status" className="text-xs text-muted-foreground">{note}</p>}
      <div className="flex gap-2">
        <Button type="button" size="sm" onClick={() => void add()} disabled={!cut || busy || full} className={cn("h-9 flex-1 gap-1.5 text-xs", TOUCH)}>
          <Plus className="h-3.5 w-3.5" /> Add to slide
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={reset} disabled={busy} className={cn("h-9 text-xs", TOUCH)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
