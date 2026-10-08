// Media (/media): photos kept on this device to reuse on carousel slides, with
// folders, search and alt text. Carousel uploads land here too.

import { useEffect, useMemo, useState } from "react";
import { ImagePlus, Search, Trash2 } from "lucide-react";
import SectionTabs, { WRITE_TABS } from "@/components/SectionTabs";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { supabase } from "@/lib/supabase";
import { getFile } from "@/lib/deviceFiles";
import { addMedia, filterMedia, foldersOf, loadMedia, removeMedia, storePicture, updateMedia, type MediaItem } from "@/lib/mediaLibrary";

export default function MediaPage() {
  const { toast } = useToast();
  const [userId, setUserId] = useState<string | null>(null);
  const [items, setItems] = useState<MediaItem[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  const [folder, setFolder] = useState("");
  const [adding, setAdding] = useState(0);

  useEffect(() => {
    document.title = "Media - Content Studio";
    supabase.auth.getUser().then(({ data }) => {
      const id = data.user?.id ?? null;
      setUserId(id);
      setItems(loadMedia(id));
    });
  }, []);

  // thumbnails from this device's storage
  useEffect(() => {
    const want = items.filter((m) => !(m.key in urls));
    if (!want.length) return;
    let live = true;
    void Promise.all(want.map(async (m) => [m.key, (await getFile(m.key).catch(() => undefined)) ?? null] as const)).then((got) => {
      if (!live) return;
      setUrls((u) => ({ ...u, ...Object.fromEntries(got.map(([k, b]) => [k, b ? URL.createObjectURL(b) : ""])) }));
    });
    return () => {
      live = false;
    };
  }, [items, urls]);

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    const list = [...files].filter((f) => f.type.startsWith("image/"));
    if (!list.length) return toast({ title: "Pick image files", variant: "destructive" });
    // photos picked before the sign-in check finished must not be dropped
    const uid = userId ?? (await supabase.auth.getUser()).data.user?.id ?? null;
    if (!uid) return toast({ title: "Sign in again to add photos", variant: "destructive" });
    setAdding(list.length);
    let added = 0;
    for (const f of list) {
      try {
        const pic = await storePicture(f);
        setItems(addMedia(uid, { key: pic.key, name: f.name.replace(/\.[^.]+$/, "").slice(0, 80), folder: folder !== "-" ? folder : "", alt: "", width: pic.width, height: pic.height, addedAt: new Date().toISOString() }));
        added++;
      } catch (e) {
        toast({ title: `Couldn't add ${f.name}`, description: (e as Error).message, variant: "destructive" });
      }
      setAdding((n) => n - 1);
    }
    if (added) toast({ title: added === 1 ? "Photo added" : `${added} photos added` });
  };

  const edit = (key: string, patch: Partial<Pick<MediaItem, "name" | "folder" | "alt">>) => {
    if (userId) setItems(updateMedia(userId, key, patch));
  };

  const remove = (m: MediaItem) => {
    if (!userId) return;
    setItems(removeMedia(userId, m.key));
    toast({
      title: "Photo removed from Media",
      action: (
        <ToastAction altText="Undo" onClick={() => setItems(addMedia(userId, m))}>
          Undo
        </ToastAction>
      ),
    });
  };

  const folders = useMemo(() => foldersOf(items), [items]);
  const shown = useMemo(() => filterMedia(items, query, folder), [items, query, folder]);

  return (
    <div className="space-y-5">
      <SectionTabs tabs={WRITE_TABS} />
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="mr-auto font-serif text-2xl font-semibold tracking-tight sm:text-3xl">Media</h1>
        <label className={`inline-flex h-10 cursor-pointer items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-95 ${adding ? "pointer-events-none opacity-70" : ""}`}>
          <ImagePlus className="h-4 w-4" /> {adding ? `Adding ${adding}...` : "Add photos"}
          <input type="file" accept="image/*" multiple className="sr-only" onChange={(e) => { void upload(e.target.files); e.target.value = ""; }} />
        </label>
      </header>
      <p className="text-xs text-muted-foreground">Photos stay on this device. Use them on carousel slides with From media.</p>

      {items.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search names, folders and alt text" aria-label="Search media"
              className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-2 text-sm" />
          </label>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Folder">
            {[["", "All"], ...folders.map((f) => [f, f]), ["-", "No folder"]].map(([id, label]) => (
              <button key={id || "all"} type="button" aria-pressed={folder === id} onClick={() => setFolder(id)}
                className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${folder === id ? "border-primary bg-primary/10 text-primary" : "border-border/70 text-muted-foreground"}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No photos yet.</div>
      ) : shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing matches that search.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {shown.map((m) => (
            <li key={m.key} className="space-y-2 rounded-xl border border-border/60 p-2">
              <div className="aspect-[4/3] overflow-hidden rounded-lg bg-muted">
                {urls[m.key] ? (
                  <img src={urls[m.key]} alt={m.alt || m.name} className="h-full w-full object-cover" />
                ) : urls[m.key] === "" ? (
                  <span className="flex h-full items-center justify-center p-2 text-center text-[11px] text-muted-foreground">Not on this device</span>
                ) : null}
              </div>
              <input value={m.name} onChange={(e) => edit(m.key, { name: e.target.value.slice(0, 80) })} aria-label="Name"
                className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs font-semibold" />
              <input value={m.folder} list="media-folders" onChange={(e) => edit(m.key, { folder: e.target.value.slice(0, 40) })} placeholder="Folder" aria-label="Folder"
                className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs" />
              <textarea value={m.alt} onChange={(e) => edit(m.key, { alt: e.target.value.slice(0, 250) })} rows={2} placeholder="Alt text: what the photo shows" aria-label="Alt text"
                className="w-full resize-none rounded-md border border-input bg-background px-2 py-1 text-xs" />
              <Button size="sm" variant="ghost" className="h-8 w-full gap-1.5 text-xs text-muted-foreground hover:text-destructive" onClick={() => remove(m)}>
                <Trash2 className="h-3.5 w-3.5" /> Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
      <datalist id="media-folders">{folders.map((f) => <option key={f} value={f} />)}</datalist>
    </div>
  );
}
