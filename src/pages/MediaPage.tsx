// Media (/media): photos kept on this device to reuse on carousel slides, with
// folders, search and alt text. Carousel uploads land here too.
// For Leo (brand-media-library step 1): videos too, through MediaDropzone, each file sorted into a type by media-sort,
// with kind and type filters in the URL and the space this site uses on the device. Everyone else sees today's page.
// Leo's sets (brand-media-sets): a Library and Sets switch (?view=sets, SetsView.tsx); an open set is ?folder=<name>.

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { ImagePlus, Loader2, Search, Trash2 } from "lucide-react";
import StockSearch from "@/components/StockSearch";
import MediaDropzone from "@/components/media/MediaDropzone";
import SetsView, { SetBar } from "@/components/media/SetsView";
import { Button } from "@/components/ui/button";
import { FilterChip } from "@/components/ui/filter-chip";
import { InfoTip } from "@/components/ui/info-tip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { supabase } from "@/lib/supabase";
import { getFile } from "@/lib/deviceFiles";
import { clock } from "@/lib/hookDemo";
import { addMedia, filterMedia, foldersOf, loadMedia, MEDIA_TYPES, mediaRoom, removeMedia, storePicture, updateMedia, type MediaItem, type MediaType } from "@/lib/mediaLibrary";
import { loadSets, onStarterChange, SETS_CHANGED, setsWith, type MediaSet } from "@/lib/mediaSets";
import { onSortChange, sortMedia, sortState, waitingSort } from "@/lib/mediaSort";
import { FULL_LINE } from "@/lib/mediaUpload";
import { downloadStock, type StockItem } from "@/lib/stockMedia";
import { useGoneItem, useScrollToItem, useUrlItem, useUrlSearch, useUrlState } from "@/lib/urlState";
import { useLeoUser } from "@/lib/useLeoOnly";
import CopyLinkButton from "@/components/CopyLinkButton";
import { links } from "@/lib/links";

const TYPE_LABEL: Record<MediaType, string> = {
  person: "Person", logo: "Logo", product: "Product", "past-post": "Past post", screen: "Screen", footage: "Footage", other: "Other",
};
const KINDS = ["", "photos", "videos"] as const;
const TYPES = ["", ...MEDIA_TYPES] as const;
const VIEWS = ["", "sets"] as const;
// a video's still sits under the cimg- key of the same id
const thumbKey = (m: MediaItem) => (m.kind === "video" ? `cimg-${m.key.slice(5)}` : m.key);
/** This site's storage on the device as people read it: 340 MB, 1.2 GB. */
const space = (n: number) => (n < 1e9 ? `${Math.max(1, Math.round(n / 1e6))} MB` : `${(n / 1e9).toFixed(1)} GB`);

export default function MediaPage() {
  const { toast } = useToast();
  const leo = useLeoUser();
  const [userId, setUserId] = useState<string | null>(null);
  const [items, setItems] = useState<MediaItem[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  // Search and folder live in the URL (docs/deep-links.md): ?q=, ?folder=<name> or none.
  const [query, setQuery] = useUrlSearch("q");
  const [folderParam, setFolderParam] = useUrlState("folder", "");
  const [adding, setAdding] = useState(0);
  const [stock, setStock] = useState(false);
  // Leo's filters (docs/deep-links.md): ?kind=photos|videos, ?type=<type>; a value outside the lists reads as all
  const [kind, setKind] = useUrlState<(typeof KINDS)[number]>("kind", "", { allowed: KINDS });
  const [type, setType] = useUrlState<(typeof TYPES)[number]>("type", "", { allowed: TYPES });
  const sort = useSyncExternalStore(onSortChange, sortState);
  const [used, setUsed] = useState<number | null>(null);
  // Leo's Library or Sets (docs/deep-links.md): ?view=sets
  const [viewParam, setView] = useUrlState<(typeof VIEWS)[number]>("view", "", { allowed: VIEWS });
  const [sets, setSets] = useState<MediaSet[]>([]);

  useEffect(() => {
    document.title = "Media - Postmosis";
    supabase.auth.getUser().then(({ data }) => {
      const id = data.user?.id ?? null;
      setUserId(id);
      setItems(loadMedia(id, { videos: true }));
    });
  }, []);

  // a sort landing writes the index outside React: read it again
  useEffect(() => onSortChange(() => userId && setItems(loadMedia(userId, { videos: true }))), [userId]);
  // so does a starter set being added, and the set records change outside React too
  useEffect(() => onStarterChange(() => userId && setItems(loadMedia(userId, { videos: true }))), [userId]);
  useEffect(() => {
    if (!leo || !userId) return;
    const read = () => setSets(loadSets(userId));
    read();
    window.addEventListener(SETS_CHANGED, read);
    return () => window.removeEventListener(SETS_CHANGED, read);
  }, [leo, userId]);
  // uploads a reload stopped before their sort
  useEffect(() => {
    if (leo && userId) sortMedia(userId, waitingSort(loadMedia(userId, { videos: true })));
  }, [leo, userId]);
  useEffect(() => {
    if (!leo) return;
    let live = true;
    navigator.storage?.estimate?.().then((e) => live && setUsed(e.usage ?? null), () => undefined);
    return () => {
      live = false;
    };
  }, [leo, items.length]);

  // thumbnails from this device's storage
  useEffect(() => {
    const want = items.filter((m) => !(m.key in urls));
    if (!want.length) return;
    let live = true;
    void Promise.all(want.map(async (m) => [m.key, (await getFile(thumbKey(m)).catch(() => undefined)) ?? null] as const)).then((got) => {
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

  // a free Pexels photo: kept on this device like an upload, with its credit
  const addStock = async (it: StockItem, query: string) => {
    const uid = userId ?? (await supabase.auth.getUser()).data.user?.id ?? null;
    if (!uid) throw new Error("Sign in again to add photos");
    // Leo's stock photos count as uploads: checked for room first, then sorted (Pexels' alt text is kept)
    if (leo && !mediaRoom(uid)) throw new Error(FULL_LINE);
    const pic = await storePicture(await downloadStock(it.src));
    const name = (it.alt || query || "Stock photo").replace(/\.$/, "").slice(0, 80);
    setItems(addMedia(uid, {
      key: pic.key, name, folder: folder !== "-" ? folder : "", alt: it.alt, width: pic.width, height: pic.height,
      addedAt: new Date().toISOString(), credit: { by: it.by, byUrl: it.byUrl, url: it.url }, ...(leo ? { kind: "photo" as const } : {}),
    }));
    if (leo) sortMedia(uid, [pic.key]);
  };

  const edit = (key: string, patch: Partial<Pick<MediaItem, "name" | "folder" | "alt" | "type" | "typeBy">>) => {
    if (userId) setItems(updateMedia(userId, key, patch));
  };

  const remove = (m: MediaItem) => {
    if (!userId) return;
    setItems(removeMedia(userId, m.key));
    toast({
      title: m.kind === "video" ? "Video removed from Media" : "Photo removed from Media",
      action: (
        <ToastAction altText="Undo" onClick={() => setItems(addMedia(userId, m))}>
          Undo
        </ToastAction>
      ),
    });
  };

  // Leo's sets are folders too, so an empty one opens
  const folders = useMemo(() => [...new Set([...foldersOf(items), ...sets.map((s) => s.name)])].sort((a, b) => a.localeCompare(b)), [items, sets]);
  // "" all, "-" no folder; a folder this device does not have reads as all
  const folder = folderParam === "none" ? "-" : folders.includes(folderParam) ? folderParam : "";
  const setFolder = (id: string) => setFolderParam(id === "-" ? "none" : id);
  const shown = useMemo(() => filterMedia(items, query, folder, leo ? { kind: kind || undefined, type: type || undefined } : {}), [items, query, folder, leo, kind, type]);
  // ?item=<picture key> (docs/deep-links.md): that picture is scrolled to and marked
  const [itemKey] = useUrlItem("item");
  const linkedTile = useScrollToItem<HTMLLIElement>(shown.some((m) => m.key === itemKey));
  // the list is this device's own (mediaLibrary.ts), so a picture from elsewhere is "not on this device"
  useGoneItem("item", userId ? items.some((m) => m.key === itemKey) : undefined, "picture", "That picture is not on this device");
  const view = leo ? viewParam : "";
  const counted = useMemo(() => setsWith(sets, items), [sets, items]);
  const openSet = leo && folder ? counted.find((s) => s.name === folder) : undefined;
  const reload = () => userId && setItems(loadMedia(userId, { videos: true }));

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="mr-auto font-serif text-2xl font-semibold tracking-tight sm:text-3xl">Media</h1>
        {!leo && (
          <label className={`inline-flex h-10 cursor-pointer items-center gap-2 rounded-md bg-primary px-4 [@media(pointer:coarse)]:h-11 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-95 ${adding ? "pointer-events-none opacity-70" : ""}`}>
            <ImagePlus className="h-4 w-4" /> {adding ? `Adding ${adding}...` : "Add photos"}
            <input type="file" accept="image/*" multiple className="sr-only" onChange={(e) => { void upload(e.target.files); e.target.value = ""; }} />
          </label>
        )}
        {!stock && view === "" && (
          <Button variant="outline" className="h-10 gap-2" onClick={() => setStock(true)}>
            <Search className="h-4 w-4" /> Search free photos
          </Button>
        )}
      </header>
      {leo && (
        <div role="tablist" aria-label="Media" className="inline-flex gap-1 rounded-lg border border-border/60 bg-muted/40 p-1">
          {([["", "Library"], ["sets", "Sets"]] as const).map(([id, label]) => (
            <button key={id || "library"} type="button" role="tab" aria-selected={view === id} onClick={() => setView(id)}
              className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors [@media(pointer:coarse)]:min-h-11 ${view === id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
              {label}
            </button>
          ))}
        </div>
      )}
      {leo ? (
        used !== null && <p className="text-xs text-muted-foreground">Using {space(used)} on this device</p>
      ) : (
        <p className="text-xs text-muted-foreground">Photos stay on this device. Use them on carousel slides with From media.</p>
      )}
      {view === "sets" ? (
        userId && <SetsView userId={userId} sets={counted} urls={urls} onChange={reload} />
      ) : (
      <>
      {stock && <StockSearch kind="photo" placeholder="Family dinner, office, Singapore skyline" onPick={addStock} onClose={() => setStock(false)} />}
      {leo && <MediaDropzone userId={userId} folder={folder !== "-" ? folder : ""} onChange={() => userId && setItems(loadMedia(userId, { videos: true }))} />}

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
          {leo && (
            <div className="flex w-full flex-wrap items-center gap-2">
              <div className="flex gap-1.5" role="group" aria-label="Photos or videos">
                {([["", "All"], ["photos", "Photos"], ["videos", "Videos"]] as const).map(([id, label]) => (
                  <FilterChip key={id || "all"} active={kind === id} onClick={() => setKind(id)}>
                    {label}
                  </FilterChip>
                ))}
              </div>
              <div className="flex items-center gap-1">
                <Select value={type || "any"} onValueChange={(v) => setType(v === "any" ? "" : (v as MediaType))}>
                  <SelectTrigger aria-label="Type" className="h-9 w-auto gap-1.5 text-xs sm:h-8 [@media(pointer:coarse)]:h-11">
                    <span className="text-muted-foreground">Type:</span> <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any</SelectItem>
                    {MEDIA_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {TYPE_LABEL[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <InfoTip label="About types">We sort each file when you add it. Tap a type to change it.</InfoTip>
              </div>
            </div>
          )}
        </div>
      )}

      {openSet && userId && <SetBar userId={userId} set={openSet} items={items} urls={urls} onChange={reload} />}
      {items.length === 0 ? (
        leo ? null : <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No photos yet.</div>
      ) : shown.length === 0 ? (
        openSet && !query.trim() ? null : <p className="text-sm text-muted-foreground">Nothing matches that search.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {shown.map((m) => (
            <li key={m.key} ref={m.key === itemKey ? linkedTile : undefined}
              className={`space-y-2 rounded-xl border p-2 ${m.key === itemKey ? "border-primary ring-2 ring-primary/30" : "border-border/60"}`}>
              <div className={`${m.kind === "video" ? "relative " : ""}aspect-[4/3] overflow-hidden rounded-lg bg-muted`}>
                {urls[m.key] ? (
                  <img src={urls[m.key]} alt={m.alt || m.name} className="h-full w-full object-cover" />
                ) : urls[m.key] === "" ? (
                  <span className="flex h-full items-center justify-center p-2 text-center text-[11px] text-muted-foreground">Not on this device</span>
                ) : null}
                {m.kind === "video" && m.seconds !== undefined && (
                  <span className="absolute bottom-1.5 right-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-white">{clock(m.seconds)}</span>
                )}
              </div>
              {leo &&
                (sort.sorting.has(m.key) ? (
                  <span className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border/70 px-2.5 text-xs text-muted-foreground [@media(pointer:coarse)]:h-11">
                    <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> Sorting
                  </span>
                ) : (
                  <Select value={m.type ?? "other"} onValueChange={(v) => edit(m.key, { type: v as MediaType, typeBy: "you" })}>
                    <SelectTrigger aria-label={`Type of ${m.name || "this file"}`} className="h-8 w-auto gap-1.5 rounded-full px-2.5 text-xs font-semibold [@media(pointer:coarse)]:h-11">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MEDIA_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {TYPE_LABEL[t]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ))}
              {m.credit && (
                <p className="truncate text-[11px] text-muted-foreground">
                  Photo by {m.credit.byUrl ? <a href={m.credit.byUrl} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">{m.credit.by}</a> : m.credit.by} on{" "}
                  {m.credit.url ? <a href={m.credit.url} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">Pexels</a> : "Pexels"}
                </p>
              )}
              <input value={m.name} onChange={(e) => edit(m.key, { name: e.target.value.slice(0, 80) })} aria-label="Name"
                className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs font-semibold" />
              <input value={m.folder} list="media-folders" onChange={(e) => edit(m.key, { folder: e.target.value.slice(0, 40) })} placeholder="Folder" aria-label="Folder"
                className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs" />
              <textarea value={m.alt} onChange={(e) => edit(m.key, { alt: e.target.value.slice(0, 250) })} rows={2} placeholder="Alt text: what the photo shows" aria-label="Alt text"
                className="w-full resize-none rounded-md border border-input bg-background px-2 py-1 text-xs" />
              <div className="flex items-center gap-1">
                <Button size="sm" variant="ghost" className="h-8 flex-1 gap-1.5 text-xs text-muted-foreground hover:text-destructive" onClick={() => remove(m)}>
                  <Trash2 className="h-3.5 w-3.5" /> Remove
                </Button>
                <CopyLinkButton path={links.media({ item: m.key })} label={`Copy link to ${m.name || "this picture"}`} className="h-8 w-8" />
              </div>
            </li>
          ))}
        </ul>
      )}
      </>
      )}
      <datalist id="media-folders">{folders.map((f) => <option key={f} value={f} />)}</datalist>
    </div>
  );
}
