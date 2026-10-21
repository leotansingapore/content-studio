// One slide on the carousel maker: its header (number, role, flags), the hook or title and the text with their word
// counters, the picture buttons and From media picker, the overflow line and the compliance flags. The list of every
// slide and Leo's one-at-a-time view both draw a slide with this, so they never drift apart.

import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ImagePlus, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { COVER_HOOK_WORDS, WORDS_PER_SLIDE, countWords, type Slide } from "@/lib/carousel";
import { getFile } from "@/lib/deviceFiles";
import type { ComplianceFlag } from "@/lib/compliance";
import type { MediaItem } from "@/lib/mediaLibrary";

export const WARN_BOX = "border-amber-200 bg-amber-50 text-amber-900";

export const ROLE_LABEL = { cover: "Cover", point: "Point", cta: "Call to action", recap: "Recap" } as const;

/** The compliance flags under a slide (or under a suggested rewrite of it). */
export function FlagList({ flags }: { flags: ComplianceFlag[] }) {
  if (flags.length === 0) return null;
  return (
    <ul className="space-y-1">
      {flags.map((f) => (
        <li
          key={f.id}
          className={`rounded-md border px-2 py-1 text-[11px] ${
            f.severity === "error"
              ? "border-destructive/40 bg-destructive/5 text-destructive"
              : WARN_BOX
          }`}
        >
          <span className="font-semibold">"{f.match}"</span>: {f.message}
        </li>
      ))}
    </ul>
  );
}

export default function SlideFields(p: {
  slide: Slide;
  /** "Slide 3", or "Slide 3 of 7" one at a time. */
  label: string;
  role: keyof typeof ROLE_LABEL;
  flags: ComplianceFlag[];
  busy: boolean;
  overflow: boolean;
  /** The slide's picture as a data URL, once read from this device. */
  picture: string | undefined;
  pictureMissing: boolean;
  /** The From media picker, open with these photos; null when closed. */
  media: MediaItem[] | null;
  /** Beside the header: the list's move and delete buttons. */
  actions?: ReactNode;
  /** Under the text fields: Leo's Rewrite this slide. */
  children?: ReactNode;
  onEdit: (patch: Partial<Pick<Slide, "title" | "body">>) => void;
  onPicture: (file: File | undefined) => void;
  onMedia: () => void;
  onPickMedia: (key: string) => void;
  onRemovePicture: () => void;
}) {
  const { slide: s, role, busy } = p;
  const words = countWords(s.body);
  const coverWords = role === "cover" ? countWords(s.title) : 0;
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-foreground">{p.label}</span>
        <span className="rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {ROLE_LABEL[role]}
        </span>
        {p.flags.length > 0 && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-900">
            {p.flags.length} {p.flags.length === 1 ? "flag" : "flags"}
          </span>
        )}
        {p.actions}
      </div>
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor={`slide-title-${s.id}`} className="text-xs text-muted-foreground">
            {role === "cover" ? "Hook" : "Title"}
          </Label>
          {role === "cover" && (
            <span
              className={`text-[11px] tabular-nums ${
                coverWords > COVER_HOOK_WORDS ? "font-semibold text-amber-800" : "text-muted-foreground"
              }`}
            >
              {coverWords}/{COVER_HOOK_WORDS} words
            </span>
          )}
        </div>
        <Input
          id={`slide-title-${s.id}`}
          value={s.title}
          onChange={(e) => p.onEdit({ title: e.target.value })}
          disabled={busy}
          placeholder={role === "cover" ? "The hook that makes people swipe" : "A short title"}
          aria-describedby={coverWords > COVER_HOOK_WORDS ? `slide-cover-warn-${s.id}` : undefined}
        />
        {coverWords > COVER_HOOK_WORDS && (
          <p id={`slide-cover-warn-${s.id}`} className="text-[11px] font-medium text-amber-800">
            Over {COVER_HOOK_WORDS} words. Cut it so it reads at thumbnail size.
          </p>
        )}
      </div>
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor={`slide-body-${s.id}`} className="text-xs text-muted-foreground">
            Text
          </Label>
          <span
            className={`text-[11px] tabular-nums ${
              words > WORDS_PER_SLIDE ? "font-semibold text-amber-800" : "text-muted-foreground"
            }`}
          >
            {words}/{WORDS_PER_SLIDE} words
          </span>
        </div>
        <Textarea
          id={`slide-body-${s.id}`}
          autoResize
          rows={2}
          value={s.body}
          onChange={(e) => p.onEdit({ body: e.target.value })}
          disabled={busy}
          placeholder={
            role === "cover" ? "Optional line under the hook" : "One point, in a sentence or two"
          }
          className="min-h-[64px]"
        />
      </div>
      {p.children}
      <div className="flex flex-wrap items-center gap-2">
        {s.image && p.picture && (
          <img src={p.picture} alt="" className="h-12 w-20 rounded-md border border-border/70 object-cover" />
        )}
        {s.image && p.pictureMissing && (
          <span className="text-[11px] text-muted-foreground">The picture is on the device you added it from.</span>
        )}
        <label className={`inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-input bg-background px-2.5 text-xs font-semibold hover:border-primary/40 ${busy ? "pointer-events-none opacity-60" : ""}`}>
          <ImagePlus className="h-3.5 w-3.5" /> {s.image ? "Change picture" : "Add a picture"}
          <input type="file" accept="image/*" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; p.onPicture(f); }} />
        </label>
        <Button type="button" size="sm" variant="outline" className="h-8 text-xs" aria-expanded={p.media !== null} onClick={p.onMedia} disabled={busy}>
          From media
        </Button>
        {s.image && (
          <Button type="button" size="sm" variant="ghost" className="h-8 text-xs text-muted-foreground"
            onClick={p.onRemovePicture}>
            Remove picture
          </Button>
        )}
      </div>
      {p.media !== null && (
        <div className="rounded-lg border border-border/60 p-2">
          {p.media.length === 0 ? (
            <p className="text-xs text-muted-foreground">No photos in Media yet. <Link to="/media" className="font-semibold text-primary hover:underline">Add some</Link></p>
          ) : (
            <ul className="grid max-h-48 grid-cols-4 gap-1.5 overflow-y-auto sm:grid-cols-6">
              {p.media.map((m) => (
                <li key={m.key}>
                  <MediaThumb item={m} onPick={() => p.onPickMedia(m.key)} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {p.overflow && (
        <p className="flex items-start gap-1.5 text-xs text-amber-800">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          Too much text to fit, so the slide cuts it off. Shorten it.
        </p>
      )}
      <FlagList flags={p.flags} />
    </>
  );
}

/** A library photo in the From media picker, loaded from this device. */
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
