// An image library for slideshow campaigns: add free stock photos (Pexels) or your own, see and remove what's in it.
// Pictures live on the server (cs_library_images, cs-slide-campaigns) so the schedule can draw from them.

import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Search, Trash2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { callFn } from "@/lib/edgeFn";
import { searchStock, type StockItem } from "@/lib/stockMedia";
import { supabase } from "@/lib/supabase";

export interface Library {
  id: string;
  name: string;
}
type Img = { id: string; src: string; url: string | null };

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

  useEffect(() => {
    ref.current?.showModal();
  }, []);
  const refresh = async (id: string) => setImages((await callFn<{ images: Img[] }>("slide-campaigns", { action: "library-urls", library_id: id })).images);
  useEffect(() => {
    if (lib) void refresh(lib.id).catch(() => undefined);
  }, [lib]);

  /** The library, made on first use with the name typed (or a plain one). */
  const ensure = async (): Promise<Library> => {
    if (lib) return lib;
    const r = await callFn<{ library: Library }>("slide-campaigns", { action: "library-save", profile_id: profileId, name: name.trim() || "Pictures" });
    setLib(r.library);
    onSaved(r.library);
    return r.library;
  };
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
  const upload = (files: FileList | null) =>
    run("upload", async () => {
      const l = await ensure();
      for (const f of [...(files ?? [])].slice(0, 20)) {
        if (!/^image\/(png|jpeg|webp)$/.test(f.type)) throw new Error("Pick PNG, JPEG or WebP pictures.");
        if (f.size > 10 * 1024 * 1024) throw new Error("Pictures up to 10 MB.");
        const ext = f.type === "image/png" ? "png" : f.type === "image/webp" ? "webp" : "jpg";
        const u = await callFn<{ path: string; token: string }>("slide-campaigns", { action: "upload-url", ext });
        const put = await supabase.storage.from("cs-slide-campaigns").uploadToSignedUrl(u.path, u.token, f, { contentType: f.type });
        if (put.error) throw new Error("Couldn't upload that picture. Try again.");
        await callFn("slide-campaigns", { action: "library-add", library_id: l.id, items: [{ src: u.path }] });
      }
      await refresh(l.id);
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
          <form
            className="flex gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              if (query.trim()) void search();
            }}
          >
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search free photos, like golf course" aria-label="Search photos" className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm" />
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
                <Button size="sm" onClick={() => void addPicked()} disabled={!picked.size || !!busy} className="gap-1.5">
                  {busy === "add" && <Loader2 className="h-4 w-4 animate-spin" />} Add {picked.size || ""} to the library
                </Button>
                <button type="button" className="text-xs text-muted-foreground hover:underline" onClick={() => setPicked(new Set(found.map((f) => f.id)))}>
                  Select all ({found.length})
                </button>
              </div>
            </>
          )}
          <p className="text-xs text-muted-foreground">Free photos from Pexels. Pick ones with open space where the words go.</p>
          <input ref={file} type="file" multiple accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => void upload(e.target.files)} />
          <Button type="button" variant="outline" size="sm" onClick={() => file.current?.click()} disabled={!!busy} className="gap-1.5">
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
