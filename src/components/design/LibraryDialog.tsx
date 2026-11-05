// An image library for slideshow campaigns: add free stock photos (Pexels), AI pictures (one, or a set of 3 in one style), an app shot (your app's
// screen in a phone over a scene) or your own, see and remove what's in it. Pictures live on the server
// (cs_library_images, cs-slide-campaigns) so the schedule can draw from them.

import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Search, Sparkles, Trash2, Upload, X } from "lucide-react";
import { Segmented } from "@/components/design/fields";
import { Button } from "@/components/ui/button";
import { FilterChip } from "@/components/ui/filter-chip";
import { imageBusy, imageJob, makeImage, type ImageJob } from "@/lib/aiImage";
import { useUsesLeft } from "@/lib/aiUsage";
import { callFn } from "@/lib/edgeFn";
import { socialConnectShown } from "@/lib/socialConnect";
import { searchStock, type StockItem } from "@/lib/stockMedia";
import { supabase } from "@/lib/supabase";
import { useSignedInUser } from "@/lib/useLeoOnly";

/** An app shot: the scene covering a 1080x1920 frame, and the app's screen in a plain phone on it. */
export async function appShot(scene: Blob | null, screen: Blob): Promise<Blob> {
  const load = (b: Blob) => createImageBitmap(b);
  const c = document.createElement("canvas");
  c.width = 1080;
  c.height = 1920;
  const g = c.getContext("2d")!;
  g.fillStyle = "#1f2937";
  g.fillRect(0, 0, 1080, 1920);
  if (scene) {
    const s = await load(scene);
    const k = Math.max(1080 / s.width, 1920 / s.height);
    g.drawImage(s, (1080 - s.width * k) / 2, (1920 - s.height * k) / 2, s.width * k, s.height * k);
  }
  // a 9:19.5 phone, 56% of the frame wide, a little below the middle
  const w = 600, h = 1300, x = 240, y = 420, bezel = 22, r = 84;
  g.shadowColor = "rgba(0,0,0,0.45)";
  g.shadowBlur = 60;
  g.fillStyle = "#0b0b0b";
  g.beginPath();
  g.roundRect(x, y, w, h, r);
  g.fill();
  g.shadowBlur = 0;
  const shot = await load(screen);
  g.save();
  g.beginPath();
  g.roundRect(x + bezel, y + bezel, w - 2 * bezel, h - 2 * bezel, r - bezel);
  g.clip();
  const k = Math.max((w - 2 * bezel) / shot.width, (h - 2 * bezel) / shot.height);
  g.drawImage(shot, x + bezel + (w - 2 * bezel - shot.width * k) / 2, y + bezel, shot.width * k, shot.height * k);
  g.restore();
  return new Promise((ok, no) => c.toBlob((b) => (b ? ok(b) : no(new Error("Couldn't draw the app shot."))), "image/jpeg", 0.9));
}

export interface Library {
  id: string;
  name: string;
}

/** A dialog's library: `make` runs once, on the first add, and every add after (or at the same time) gets the same one. */
export function oneLibrary(have: Library | null, make: () => Promise<Library>): () => Promise<Library> {
  let made: Promise<Library> | null = have ? Promise.resolve(have) : null;
  return () =>
    (made ??= make().catch((e) => {
      made = null; // a failed make is tried again on the next add
      throw e;
    }));
}
type Img = { id: string; src: string; url: string | null };
type Source = "search" | "generate" | "app";

/** Generate's looks (Volume's Style step): each adds its phrase to the description, so a set shares one look. */
export const STYLES = [
  { label: "Photo", phrase: "realistic photo, natural light" },
  { label: "Film", phrase: "35mm film photo, soft grain, warm tones" },
  { label: "Illustration", phrase: "flat digital illustration, clean shapes" },
  { label: "3D render", phrase: "3D render, soft studio lighting" },
] as const;

/**
 * Makes `of` pictures one after another (one AI picture runs at a time), keeping each as it lands. Stops before one
 * past `left` (today's uses; null when unread, then the server's refusal stops it) or at the first failure, and says
 * why. null when every one was made, or when `make` gives null (the dialog closed).
 */
export async function makeSet(of: number, left: number | null, make: (n: number) => Promise<ImageJob | null>, keep: (j: ImageJob) => Promise<void>): Promise<string | null> {
  for (let n = 1; n <= of; n++) {
    const made = n > 1 ? `Made ${n - 1} of ${of}. ` : "";
    if (left !== null && n > left) return `${made}That's all your AI pictures for today. They reset at 8am Singapore time.`;
    const j = await make(n);
    if (!j) return null;
    if (j.state !== "done" || !j.preview) return `${made}${j.error ?? "Couldn't make the picture."}`;
    await keep(j);
  }
  return null;
}

/** A picture as PNG or JPEG: those pass as they are, anything else (WebP) is redrawn as a JPEG. */
export async function asPngOrJpeg(b: Blob): Promise<Blob> {
  if (b.type === "image/png" || b.type === "image/jpeg") return b;
  const bmp = await createImageBitmap(b);
  const c = document.createElement("canvas");
  c.width = bmp.width;
  c.height = bmp.height;
  c.getContext("2d")!.drawImage(bmp, 0, 0);
  return new Promise((ok, no) => c.toBlob((j) => (j ? ok(j) : no(new Error("Couldn't read that picture."))), "image/jpeg", 0.9));
}

export default function LibraryDialog({ profileId, library, onClose, onSaved }: { profileId: string; library: Library | null; onClose: () => void; onSaved: (lib: Library) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [lib, setLib] = useState<Library | null>(library);
  const [name, setName] = useState(library?.name ?? "");
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<StockItem[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [images, setImages] = useState<Img[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const user = useSignedInUser();
  const [source, setSource] = useState<Source>("search");
  const [prompt, setPrompt] = useState("");
  const [look, setLook] = useState<string | null>(null);
  const [count, setCount] = useState<"1" | "3">("1");
  const [making, setMaking] = useState<{ n: number; of: number } | null>(null);
  const live = useRef(true);
  const left = useUsesLeft(!!making)("ai-image");
  const [screen, setScreen] = useState<File | null>(null);
  const [scene, setScene] = useState<File | null>(null);
  // adding pictures is for owners with posting switched on (the server refuses the rest), so no AI picture is spent first
  const canPost = socialConnectShown();

  useEffect(() => {
    ref.current?.showModal();
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  const refresh = async (id: string) => setImages((await callFn<{ images: Img[] }>("slide-campaigns", { action: "library-urls", library_id: id })).images);
  useEffect(() => {
    if (lib) void refresh(lib.id).catch(() => undefined);
  }, [lib]);

  /** The library, made on first use with the name typed (or a plain one). */
  const nameNow = useRef(name);
  nameNow.current = name;
  // made once per dialog and the name read from a ref: the AI picture's handler was set up before a library existed
  const [ensure] = useState(() =>
    oneLibrary(library, async () => {
      const r = await callFn<{ library: Library }>("slide-campaigns", { action: "library-save", profile_id: profileId, name: nameNow.current.trim() || "Pictures" });
      setLib(r.library);
      onSaved(r.library);
      return r.library;
    }),
  );
  const run = async (label: string, job: () => Promise<void>) => {
    setBusy(label);
    setNote(null);
    try {
      await job();
    } catch (e) {
      setNote((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const search = () =>
    run("search", async () => {
      const r = await searchStock("photo", query, 1, "portrait");
      setFound(r.items);
      setPicked(new Set());
      if (!r.items.length) setNote("Nothing found. Try a broader word.");
    });
  const addPicked = () =>
    run("add", async () => {
      const l = await ensure();
      const items = found.filter((f) => picked.has(f.id)).map((f) => ({ src: f.src, credit: { by: f.by, url: f.byUrl } }));
      await callFn("slide-campaigns", { action: "library-add", library_id: l.id, items });
      setPicked(new Set());
      await refresh(l.id);
    });
  const upload = (files: FileList | Blob[] | null) =>
    run("upload", async () => {
      const l = await ensure();
      for (const pick of [...(files ?? [])].slice(0, 20)) {
        if (!/^image\/(png|jpeg|webp)$/.test(pick.type)) throw new Error("Pick PNG, JPEG or WebP pictures.");
        // the slide drawer can't draw WebP: anything but PNG or JPEG goes up as a JPEG
        const f = await asPngOrJpeg(pick);
        if (f.size > 10 * 1024 * 1024) throw new Error("Pictures up to 10 MB.");
        const ext = f.type === "image/png" ? "png" : "jpg";
        // the library row comes with the upload link; a failed upload takes its row back out
        const u = await callFn<{ path: string; token: string; id: string }>("slide-campaigns", { action: "upload-url", library_id: l.id, ext });
        const put = await supabase.storage.from("cs-slide-campaigns").uploadToSignedUrl(u.path, u.token, f, { contentType: f.type });
        if (put.error) {
          await callFn("slide-campaigns", { action: "library-remove", id: u.id }).catch(() => undefined);
          throw new Error("Couldn't upload that picture. Try again.");
        }
      }
      await refresh(l.id);
    });
  // each AI picture lands in Media like everywhere else, then goes up into this library; closing the dialog stops a set
  const generate = async () => {
    if (!user || !prompt.trim() || imageBusy() || !canPost) return;
    const style = STYLES.find((s) => s.label === look);
    const ask = style ? `${prompt.trim()}, ${style.phrase}` : prompt.trim();
    setNote(null);
    const stop = await makeSet(
      Number(count),
      left,
      async (n) => {
        if (!live.current) return null;
        setMaking({ n, of: Number(count) });
        await makeImage(user.id, ask, prompt.trim().slice(0, 60));
        const j = imageJob();
        return live.current && j?.prompt === ask ? j : null;
      },
      async (j) => upload([await (await fetch(j.preview!)).blob()]),
    );
    setMaking(null);
    if (stop) setNote(stop);
  };
  const buildShot = () =>
    run("app", async () => {
      if (!screen) throw new Error("Upload your app's screen first.");
      await upload([await appShot(scene, screen)]);
    });
  const rename = () => lib && name.trim() && name.trim() !== lib.name && void run("name", async () => onSaved((await callFn<{ library: Library }>("slide-campaigns", { action: "library-save", id: lib.id, name: name.trim() })).library));

  return (
    <dialog ref={ref} onClose={onClose} className="w-[min(56rem,calc(100vw-2rem))] rounded-xl border border-border bg-background p-0 text-foreground backdrop:bg-black/60">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <input value={name} onChange={(e) => setName(e.target.value)} onBlur={rename} maxLength={80} placeholder="Name this library" aria-label="Library name" className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm" />
        <button type="button" aria-label="Close" onClick={() => ref.current?.close()} className="rounded p-2 text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="grid max-h-[70vh] gap-4 overflow-y-auto p-4 md:grid-cols-[1fr_16rem]">
        <section className="space-y-2">
          <Segmented<Source> value={source} options={[{ value: "search", label: "Free photos" }, { value: "generate", label: "Generate" }, { value: "app", label: "App shot" }] as const} onChange={setSource} />
          {source === "generate" && (
            <div className="space-y-2">
              <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3} maxLength={600} placeholder="A golfer lining up a putt at sunrise, soft film grain" aria-label="Describe the picture" className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm" />
              <div role="group" aria-label="Style" className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-muted-foreground">Style</span>
                {STYLES.map((s) => (
                  <FilterChip key={s.label} active={look === s.label} disabled={!!making} onClick={() => setLook(look === s.label ? null : s.label)}>
                    {s.label}
                  </FilterChip>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Segmented<"1" | "3"> value={count} options={[{ value: "1", label: "1 picture" }, { value: "3", label: "Make 3" }] as const} onChange={(v) => !making && setCount(v)} />
                <Button size="sm" onClick={() => void generate()} disabled={!!making || !prompt.trim() || left === 0 || !canPost} className="gap-1.5">
                  {making ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}{" "}
                  {making ? (making.of > 1 ? `Making ${making.n} of ${making.of}` : "Making the picture") : count === "3" ? "Generate 3 into the library" : "Generate into the library"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">{!canPost ? "Posting isn't switched on for your account yet." : left === null ? "Also saved to Media under AI images." : `${left} left today. Also saved to Media under AI images.`}</p>
            </div>
          )}
          {source === "app" && (
            <div className="space-y-2 text-xs">
              <label className="block space-y-1">
                <span className="text-muted-foreground">Your app's screen (a screenshot)</span>
                <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setScreen(e.target.files?.[0] ?? null)} className="block w-full text-xs" />
              </label>
              <label className="block space-y-1">
                <span className="text-muted-foreground">The scene behind it (optional)</span>
                <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setScene(e.target.files?.[0] ?? null)} className="block w-full text-xs" />
              </label>
              <Button size="sm" onClick={() => void buildShot()} disabled={!screen || !!busy || !canPost} className="gap-1.5">
                {(busy === "app" || busy === "upload") && <Loader2 className="h-4 w-4 animate-spin" />} Build the image
              </Button>
            </div>
          )}
          {source === "search" && (
          <>
          <form
            className="flex gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              if (query.trim()) void search();
            }}
          >
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search free photos, like golf course" aria-label="Search photos" className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm [@media(pointer:coarse)]:h-11" />
            <Button type="submit" variant="outline" size="sm" disabled={!query.trim() || !!busy} className="h-9 gap-1">
              {busy === "search" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Search
            </Button>
          </form>
          {found.length > 0 && (
            <>
              <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
                {found.map((f) => {
                  const on = picked.has(f.id);
                  return (
                    <button
                      key={f.id}
                      type="button"
                      aria-pressed={on}
                      aria-label={f.alt || `Photo by ${f.by}`}
                      onClick={() => setPicked((p) => (p.delete(f.id) || p.add(f.id), new Set(p)))}
                      className={`relative aspect-[3/4] overflow-hidden rounded-md border-2 ${on ? "border-primary" : "border-transparent"}`}
                    >
                      <img src={f.thumb} alt="" loading="lazy" className="h-full w-full object-cover" />
                      {on && <Check className="absolute right-1 top-1 h-5 w-5 rounded-full bg-primary p-0.5 text-primary-foreground" />}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={() => void addPicked()} disabled={!picked.size || !!busy || !canPost} className="gap-1.5">
                  {busy === "add" && <Loader2 className="h-4 w-4 animate-spin" />} Add {picked.size || ""} to the library
                </Button>
                <button type="button" className="text-xs text-muted-foreground hover:underline" onClick={() => setPicked(new Set(found.map((f) => f.id)))}>
                  Select all ({found.length})
                </button>
              </div>
            </>
          )}
          <p className="text-xs text-muted-foreground">Free photos from Pexels. Pick ones with open space where the words go.</p>
          </>
          )}
          <input ref={file} type="file" multiple accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => void upload(e.target.files)} />
          <Button type="button" variant="outline" size="sm" onClick={() => file.current?.click()} disabled={!!busy || !canPost} className="gap-1.5">
            {busy === "upload" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Upload your own
          </Button>
          {note && (
            <p role="status" className="text-xs text-destructive">
              {note}
            </p>
          )}
        </section>
        <section aria-label="In this library" className="space-y-2">
          <h3 className="text-sm font-semibold">In this library ({images.length})</h3>
          {!images.length && <p className="text-xs text-muted-foreground">Empty so far.</p>}
          <ul className="grid grid-cols-3 gap-1.5">
            {images.map((i) => (
              <li key={i.id} className="group relative aspect-[3/4] overflow-hidden rounded-md bg-muted">
                {i.url && <img src={i.url.includes("images.pexels.com") ? i.url.replace(/([?&]w=)\d+/, "$1300") : i.url} alt="" loading="lazy" className="h-full w-full object-cover" />}
                <button
                  type="button"
                  aria-label="Remove from the library"
                  onClick={() => void run("remove", async () => (await callFn("slide-campaigns", { action: "library-remove", id: i.id }), await refresh(lib!.id)))}
                  className="absolute right-1 top-1 rounded bg-black/60 p-1 text-white opacity-0 focus:opacity-100 group-hover:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>
      <div className="flex justify-end border-t border-border px-4 py-3">
        <Button onClick={() => ref.current?.close()}>Done</Button>
      </div>
    </dialog>
  );
}
