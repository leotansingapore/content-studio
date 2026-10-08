// Search free Pexels photos (Media page) or B-roll clips (video editor) and pick
// one. The parent decides what a pick does; this shows the search, the results
// with their credit, and the "Provided by Pexels" link Pexels asks for.

import { useState } from "react";
import { Check, Loader2, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { searchStock, type StockItem } from "@/lib/stockMedia";

export default function StockSearch({ kind, orientation, placeholder, onPick, onClose }: {
  kind: "photo" | "video";
  orientation?: "portrait" | "landscape" | "square";
  placeholder: string;
  /** Resolves once the item is kept; a throw shows its message on the tile. */
  onPick: (item: StockItem, query: string) => Promise<void>;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [asked, setAsked] = useState("");
  const [items, setItems] = useState<StockItem[]>([]);
  const [more, setMore] = useState(false);
  const [page, setPage] = useState(1);
  const [state, setState] = useState<"idle" | "searching" | "more" | "done" | "failed">("idle");
  const [error, setError] = useState("");
  const [picking, setPicking] = useState<string | null>(null);
  const [picked, setPicked] = useState<Record<string, string>>({});

  const run = async (q: string, p: number) => {
    if (!q.trim()) return;
    setState(p === 1 ? "searching" : "more");
    setError("");
    try {
      const res = await searchStock(kind, q, p, orientation);
      setItems((prev) => (p === 1 ? res.items : [...prev, ...res.items.filter((i) => !prev.some((x) => x.id === i.id))]));
      setMore(res.more);
      setPage(p);
      setAsked(q);
      setState("done");
    } catch (e) {
      setError((e as Error).message);
      setState("failed");
    }
  };

  const pick = async (item: StockItem) => {
    if (picking) return;
    setPicking(item.id);
    try {
      await onPick(item, asked);
      setPicked((m) => ({ ...m, [item.id]: "ok" }));
    } catch (e) {
      setPicked((m) => ({ ...m, [item.id]: (e as Error).message || "Couldn't add it" }));
    } finally {
      setPicking(null);
    }
  };

  const noun = kind === "video" ? "clips" : "photos";
  return (
    <section className="space-y-3 rounded-xl border border-primary/25 bg-primary/5 p-3" aria-label={`Search free ${noun}`}>
      <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); void run(query, 1); }}>
        <label className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input autoFocus value={query} maxLength={80} onChange={(e) => setQuery(e.target.value)} placeholder={placeholder} aria-label={`Search free ${noun}`}
            className="h-10 w-full rounded-md border border-input bg-background pl-8 pr-2 text-sm" />
        </label>
        <Button type="submit" className="h-10" disabled={!query.trim() || state === "searching"}>
          {state === "searching" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : "Search"}
        </Button>
        <Button type="button" variant="ghost" className="h-10 w-10 shrink-0 p-0" aria-label="Close search" onClick={onClose}><X className="h-4 w-4" /></Button>
      </form>

      {state === "searching" && <p className="text-xs text-muted-foreground" aria-live="polite">Searching...</p>}
      {state === "failed" && (
        <p className="flex flex-wrap items-center gap-2 text-xs text-destructive" role="alert">
          {error}
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => void (items.length ? run(asked, page + 1) : run(query, 1))}>Try again</Button>
        </p>
      )}
      {state === "done" && !items.length && <p className="text-xs text-muted-foreground">Nothing for &ldquo;{asked}&rdquo;. Try other words.</p>}

      {items.length > 0 && (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          {items.map((it) => {
            const done = picked[it.id] === "ok";
            const failed = picked[it.id] && !done ? picked[it.id] : "";
            return (
              <li key={it.id} className="space-y-1">
                <button type="button" onClick={() => void pick(it)} disabled={!!picking || done}
                  aria-label={`${done ? "Added" : "Add"} ${kind} by ${it.by}${it.alt ? `: ${it.alt}` : ""}`}
                  className="relative block aspect-[3/4] w-full overflow-hidden rounded-lg bg-muted ring-primary focus-visible:ring-2 disabled:cursor-default">
                  <img src={it.thumb} alt="" loading="lazy" className="h-full w-full object-cover" />
                  {it.duration !== undefined && <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1 font-mono text-[10px] text-white">{Math.floor(it.duration / 60)}:{String(Math.round(it.duration % 60)).padStart(2, "0")}</span>}
                  {(picking === it.id || done) && (
                    <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-xs font-semibold text-white">
                      {done ? <><Check className="mr-1 h-4 w-4" /> Added</> : <><Loader2 className="mr-1 h-4 w-4 animate-spin" /> Adding...</>}
                    </span>
                  )}
                </button>
                <p className="truncate text-[11px] text-muted-foreground">
                  {failed ? <span className="text-destructive">{failed}</span> : <>by {it.byUrl ? <a href={it.byUrl} target="_blank" rel="noreferrer" className="hover:underline">{it.by}</a> : it.by}</>}
                </p>
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <a href="https://www.pexels.com" target="_blank" rel="noreferrer" className="text-xs font-semibold text-primary hover:underline">
          {kind === "video" ? "Videos" : "Photos"} provided by Pexels
        </a>
        {more && state !== "searching" && (
          <Button size="sm" variant="outline" className="h-9" disabled={state === "more"} onClick={() => void run(asked, page + 1)}>
            {state === "more" ? "Loading..." : `More ${noun}`}
          </Button>
        )}
      </div>
    </section>
  );
}
