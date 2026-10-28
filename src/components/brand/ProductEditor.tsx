// One product or service, edited in a dialog over /brand (brand-products, Leo only). Opened by ?product=<id>#products,
// or ?product=new for a blank one (push, so Back closes it). What is typed is kept for the tab until Save or close, so
// a reload never loses it. Pictures: up to 4, the first used first, from Media or an upload; each joins Media's
// "Products" folder. Also here: PictureTile, the one picture square the section, the review and the AI panel draw.

import { useEffect, useReducer, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { ImageOff, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ToastAction } from "@/components/ui/toast";
import { useToast } from "@/hooks/use-toast";
import { offerUrl } from "@/lib/brandRules";
import { getFile } from "@/lib/deviceFiles";
import { addMedia, loadMedia, storePicture, type MediaItem } from "@/lib/mediaLibrary";
import { ensurePicture, onProducts, PICTURE_FAILED, pictureState, PRODUCTS_FOLDER } from "@/lib/productScan";
import { kindOf, LIMITS, loadProducts, MAX_PICTURES, MAX_PRODUCTS, newProductId, type Product, saveProducts } from "@/lib/products";
import { scoped } from "@/lib/profiles";
import { adviserBrand } from "@/lib/profession";

const TOUCH = "[@media(pointer:coarse)]:min-h-11";

/** A picture of a product on this device; one with a site address is fetched once when this device lacks it. */
export function PictureTile({ userId, pictureKey, source = "", name, className = "h-14 w-14", words = false, fetchMissing = true }: {
  userId: string;
  pictureKey: string;
  source?: string;
  name: string;
  className?: string;
  /** Say why there is no picture inside the tile (big tiles); small ones say it to screen readers only. */
  words?: boolean;
  fetchMissing?: boolean;
}) {
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  useEffect(() => onProducts(redraw), []);
  const state = pictureState(pictureKey);
  // null while reading the device, "" when it isn't on it
  const [url, setUrl] = useState<string | null>(null);
  const done = state === "done";
  useEffect(() => {
    let made = "";
    let live = true;
    getFile(pictureKey).then(
      (b) => {
        if (!live) return;
        if (b) return setUrl((made = URL.createObjectURL(b)));
        setUrl("");
        if (fetchMissing && source) ensurePicture(userId, pictureKey, source, name);
      },
      () => live && setUrl(""),
    );
    return () => {
      live = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [pictureKey, done, fetchMissing, source, userId, name]);
  const box = `${className} shrink-0 overflow-hidden rounded-lg border border-border/60 bg-muted`;
  if (url) return <img src={url} alt={name} className={`${box} object-cover`} />;
  if (url === null || state === "fetching") return <span className={`${box} block animate-pulse`} aria-label={`Getting the picture of ${name}`} />;
  const why = state === "failed" ? PICTURE_FAILED : "Not on this device";
  return (
    <span className={`${box} flex flex-col items-center justify-center gap-1 p-1 text-center text-[10px] leading-tight text-muted-foreground`} role="img" aria-label={why}>
      <ImageOff className="h-4 w-4 shrink-0" aria-hidden />
      {words && why}
    </span>
  );
}

interface Draft {
  name: string;
  what: string;
  forWho: string;
  price: string;
  url: string;
  pictures: string[];
  sources: string[];
}
const draftKey = (userId: string) => `cs-product-edit-${scoped(userId)}`;
const draftOf = (p?: Product): Draft => ({
  name: p?.name ?? "", what: p?.what ?? "", forWho: p?.forWho ?? "", price: p?.price ?? "", url: p?.url ?? "", pictures: p?.pictures ?? [], sources: p?.sources ?? [],
});

/** The typed draft kept for this tab, when it belongs to this item. */
function keptDraft(userId: string, id: string): Draft | null {
  try {
    const v = JSON.parse(sessionStorage.getItem(draftKey(userId)) ?? "null");
    return v?.id === id && v.draft && typeof v.draft.name === "string" ? { ...draftOf(), ...v.draft } : null;
  } catch {
    return null;
  }
}

export default function ProductEditor({ userId, id, onClose }: { userId: string; id: string; onClose: () => void }) {
  const { toast } = useToast();
  const list = loadProducts(userId);
  const existing = list.items.find((p) => p.id === id);
  const service = kindOf(list) === "service";
  const [draft, setDraft] = useState<Draft>(() => keptDraft(userId, id) ?? draftOf(existing));
  const [line, setLine] = useState("");
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const first = useRef<HTMLInputElement>(null);
  const full = !existing && list.items.length >= MAX_PRODUCTS;

  useEffect(() => {
    try {
      sessionStorage.setItem(draftKey(userId), JSON.stringify({ id, draft }));
    } catch {
      // storage blocked: the draft lasts this visit
    }
  }, [userId, id, draft]);
  // closed by Close, Escape, Save or Back: what was typed goes (a reload never runs this, so it keeps it)
  useEffect(() => () => {
    try {
      sessionStorage.removeItem(draftKey(userId));
    } catch {
      // nothing kept
    }
  }, [userId]);
  useEffect(() => first.current?.focus(), []);
  const close = onClose;
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  });

  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const link = draft.url.trim() ? offerUrl(draft.url) : "";
  const room = MAX_PICTURES - draft.pictures.length;

  const save = (e: FormEvent) => {
    e.preventDefault();
    if (!draft.name.trim() || link === null || full) return;
    const now = loadProducts(userId);
    const base: Product = existing ?? { id: newProductId(), name: "", what: "", forWho: "", pictures: [], sources: [], use: true, from: "you", addedAt: new Date().toISOString() };
    const next: Product = {
      ...base,
      name: draft.name, what: draft.what, forWho: draft.forWho, price: draft.price || undefined, url: link || undefined,
      pictures: draft.pictures, sources: draft.sources,
    };
    const items = existing ? now.items.map((p) => (p.id === id ? next : p)) : [...now.items, next];
    const error = saveProducts(userId, { ...now, items });
    if (error) return setLine(error);
    close();
  };

  const remove = () => {
    const now = loadProducts(userId);
    const at = now.items.findIndex((p) => p.id === id);
    if (at < 0) return close();
    const gone = now.items[at];
    const error = saveProducts(userId, { ...now, items: now.items.filter((p) => p.id !== id) });
    if (error) return setLine(error);
    close();
    toast({
      title: `Removed ${gone.name}.`,
      action: (
        <ToastAction altText="Undo" onClick={() => {
          const back = loadProducts(userId);
          if (back.items.length >= MAX_PRODUCTS || back.items.some((p) => p.id === gone.id)) return;
          saveProducts(userId, { ...back, items: [...back.items.slice(0, at), gone, ...back.items.slice(at)] });
        }}>
          Undo
        </ToastAction>
      ),
    });
  };

  const upload = async (file: File | undefined) => {
    if (!file || room <= 0) return;
    setBusy(true);
    setLine("");
    try {
      const pic = await storePicture(file);
      addMedia(userId, { key: pic.key, name: (draft.name.trim() || file.name.replace(/\.[^.]+$/, "")).slice(0, 80), folder: PRODUCTS_FOLDER, alt: draft.name.trim(), width: pic.width, height: pic.height, addedAt: new Date().toISOString(), type: "product", typeBy: "you" });
      setDraft((d) => (d.pictures.length >= MAX_PICTURES ? d : { ...d, pictures: [...d.pictures, pic.key], sources: [...d.sources, ""] }));
    } catch (e) {
      setLine((e as Error).message || "Couldn't add that picture. Try another one.");
    } finally {
      setBusy(false);
    }
  };
  const fromMedia = (m: MediaItem) => {
    setPicking(false);
    if (draft.pictures.includes(m.key) || room <= 0) return;
    set({ pictures: [...draft.pictures, m.key], sources: [...draft.sources, ""] });
  };
  const move = (i: number, to: "first" | "out") => {
    const pairs = draft.pictures.map((k, j) => [k, draft.sources[j] ?? ""] as const);
    const kept = to === "out" ? pairs.filter((_, j) => j !== i) : [pairs[i], ...pairs.filter((_, j) => j !== i)];
    set({ pictures: kept.map(([k]) => k), sources: kept.map(([, s]) => s) });
  };

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={(e) => e.target === e.currentTarget && close()}>
      <form role="dialog" aria-modal="true" aria-labelledby="product-editor-title" onSubmit={save}
        className="flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-background shadow-elegant sm:max-w-lg sm:rounded-2xl">
        <div className="flex items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
          <h2 id="product-editor-title" className="truncate font-serif text-lg font-semibold">{existing ? existing.name : service ? "Add a service" : "Add a product"}</h2>
          <Button type="button" variant="ghost" size="icon" className="h-10 w-10 shrink-0" aria-label="Close" onClick={close}><X className="h-4 w-4" /></Button>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
          <div className="space-y-1.5">
            <Label htmlFor="product-name">{service ? "Service name" : "Product name"}</Label>
            <Input id="product-name" ref={first} value={draft.name} maxLength={LIMITS.name} onChange={(e) => set({ name: e.target.value })} placeholder={service ? (adviserBrand() ? "Retirement plan review" : "First consultation") : "Activity Tracker app"} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="product-what">What it is</Label>
            <Textarea id="product-what" value={draft.what} maxLength={LIMITS.what} rows={2} onChange={(e) => set({ what: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="product-for">Who it's for</Label>
            <Input id="product-for" value={draft.forWho} maxLength={LIMITS.forWho} onChange={(e) => set({ forWho: e.target.value })} />
          </div>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="product-price">Price (optional)</Label>
              <Input id="product-price" value={draft.price} maxLength={LIMITS.price} onChange={(e) => set({ price: e.target.value })} />
            </div>
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="product-url">Page link</Label>
              <Input id="product-url" value={draft.url} maxLength={LIMITS.url} inputMode="url" autoCapitalize="none" autoCorrect="off" placeholder="https://yoursite.sg/review"
                onChange={(e) => set({ url: e.target.value })} onBlur={() => link && link !== draft.url && set({ url: link })} className="peer" />
              {link === null && <p className="text-[11px] font-medium text-warning peer-focus:hidden">Use a web link, like https://yoursite.sg/review</p>}
            </div>
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Pictures <span className="font-normal text-muted-foreground">{draft.pictures.length} of {MAX_PICTURES}</span></legend>
            {draft.pictures.length > 0 && (
              <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                {draft.pictures.map((k, i) => (
                  <li key={k} className="space-y-1">
                    <PictureTile userId={userId} pictureKey={k} source={draft.sources[i]} name={draft.name || "this product"} className="aspect-square w-full" words />
                    <div className="flex flex-wrap gap-1">
                      {i > 0 && <Button type="button" size="sm" variant="ghost" className={`h-8 px-2 text-xs ${TOUCH}`} onClick={() => move(i, "first")}>Make first</Button>}
                      <Button type="button" size="sm" variant="ghost" className={`h-8 px-2 text-xs text-muted-foreground ${TOUCH}`} onClick={() => move(i, "out")}>Remove</Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {room > 0 && (
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="outline" className={`h-9 ${TOUCH}`} aria-expanded={picking} onClick={() => setPicking(!picking)}>Add from Media</Button>
                <label className={`inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-accent ${TOUCH}`}>
                  {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Upload
                  <input type="file" accept="image/*" className="sr-only" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; void upload(f); }} />
                </label>
              </div>
            )}
            {picking && <MediaGrid userId={userId} skip={draft.pictures} onPick={fromMedia} />}
          </fieldset>
          {full && <p className="text-sm text-destructive">{MAX_PRODUCTS} is the most a brand can keep. Remove one to add another.</p>}
          {line && <p className="text-sm text-destructive" role="alert">{line}</p>}
        </div>
        <div className="flex items-center gap-2 border-t border-border/60 px-4 py-3">
          <Button type="submit" className={TOUCH} disabled={!draft.name.trim() || link === null || full || busy}>Save</Button>
          {existing && <Button type="button" variant="ghost" className={`ml-auto text-muted-foreground ${TOUCH}`} onClick={remove}>Delete</Button>}
        </div>
      </form>
    </div>,
    document.body,
  );
}

/** Media's photos on this device to pick one from. */
function MediaGrid({ userId, skip, onPick }: { userId: string; skip: string[]; onPick: (m: MediaItem) => void }) {
  const [media] = useState(() => loadMedia(userId).filter((m) => !skip.includes(m.key)));
  if (media.length === 0) return <p className="text-xs text-muted-foreground">No photos in Media yet.</p>;
  return (
    <ul className="grid max-h-48 grid-cols-4 gap-1.5 overflow-y-auto rounded-lg border border-border/60 p-2 sm:grid-cols-6" aria-label="Your Media">
      {media.map((m) => (
        <li key={m.key}>
          <button type="button" onClick={() => onPick(m)} aria-label={`Use ${m.name}`} title={m.name} className="block w-full rounded-lg hover:ring-2 hover:ring-primary">
            <PictureTile userId={userId} pictureKey={m.key} name={m.name} className="aspect-square w-full" fetchMissing={false} />
          </button>
        </li>
      ))}
    </ul>
  );
}
