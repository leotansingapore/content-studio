// The clips "Add B-roll for me" placed, on one sheet: each one's frame, the
// search behind it, the line it covers and when. Swap shows the next clips for
// the same search (searches are remembered, so this costs nothing until More);
// Remove takes one off; Remove all takes the lot off (one Undo brings them back).

import { useRef, useState } from "react";
import { Check, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { chooseClips, stockIdOf, type Orientation, type Placed } from "@/lib/autoBroll";
import { downloadStock, searchStock, type StockItem } from "@/lib/stockMedia";
import { putFile } from "@/lib/deviceFiles";
import { loadVideo } from "@/lib/videoMedia";
import { fmtTime, type Broll, type EditSettings } from "@/lib/videoEdit";

export default function BrollSheet({ placed, brolls, orientation, apply, seek, onDone }: {
  placed: Placed[];
  brolls: Broll[];
  orientation: Orientation;
  /** Merges into the latest settings, with Undo. */
  apply: (p: Partial<EditSettings>) => void;
  seek: (t: number) => void;
  onDone: () => void;
}) {
  const rows = placed.flatMap((p) => {
    const b = brolls.find((x) => x.id === p.id);
    return b ? [{ p, b }] : [];
  });
  const [open, setOpen] = useState<string | null>(null);
  const [results, setResults] = useState<{ items: StockItem[]; page: number; more: boolean; busy: boolean; error: string }>({ items: [], page: 0, more: false, busy: false, error: "" });
  const [swapping, setSwapping] = useState<string | null>(null);
  // the latest list, for a swap that lands after other changes
  const latest = useRef(brolls);
  latest.current = brolls;

  const used = new Set(brolls.map((b) => stockIdOf(b.key)).filter((x): x is string => !!x));
  const load = async (search: string, page: number) => {
    setResults((r) => ({ ...r, busy: true, error: "" }));
    try {
      const res = await searchStock("video", search, page, orientation);
      setResults((r) => ({ items: page === 1 ? res.items : [...r.items, ...res.items.filter((i) => !r.items.some((x) => x.id === i.id))], page, more: res.more, busy: false, error: "" }));
    } catch (e) {
      setResults((r) => ({ ...r, busy: false, error: (e as Error).message }));
    }
  };
  const toggle = (id: string, search: string) => {
    if (open === id) return setOpen(null);
    setOpen(id);
    setResults({ items: [], page: 0, more: false, busy: true, error: "" });
    void load(search, 1);
  };
  const swap = async (b: Broll, it: StockItem) => {
    setSwapping(it.id);
    try {
      const blob = await downloadStock(it.src);
      const probe = await loadVideo(blob).catch(() => null);
      const length = probe && Number.isFinite(probe.duration) ? probe.duration : it.duration ?? b.length;
      if (probe) URL.revokeObjectURL(probe.src);
      const key = `br-${it.id}-${Date.now().toString(36)}`;
      await putFile(key, blob);
      apply({ broll: latest.current.map((x) => (x.id === b.id ? { ...x, key, length: Math.max(0.5, length), thumb: it.thumb, by: it.by, byUrl: it.byUrl, url: it.url } : x)) });
      setOpen(null);
    } catch (e) {
      setResults((r) => ({ ...r, error: (e as Error).message }));
    } finally {
      setSwapping(null);
    }
  };

  if (!rows.length) return null;
  return (
    <section className="space-y-2 rounded-lg border border-primary/25 p-3" aria-label="B-roll placed for you">
      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-auto text-sm font-medium">Placed for you ({rows.length})</p>
        <Button size="sm" variant="ghost" className="h-11 gap-1.5 text-xs text-muted-foreground hover:text-destructive sm:h-8"
          onClick={() => apply({ broll: brolls.filter((b) => !rows.some((r) => r.b.id === b.id)) })}>
          <Trash2 className="h-3.5 w-3.5" /> Remove all
        </Button>
        <Button size="sm" variant="outline" className="h-11 gap-1.5 text-xs sm:h-8" onClick={onDone}><Check className="h-3.5 w-3.5" /> Done</Button>
      </div>
      <ul className="divide-y divide-border/60">
        {rows.map(({ p, b }) => {
          const next = open === b.id ? chooseClips(results.items, used, b.to - b.from, orientation) : [];
          return (
            <li key={b.id} className="space-y-2 py-2">
              <div className="flex items-center gap-2 text-xs">
                <button type="button" onClick={() => seek(b.from + 0.05)} aria-label={`Go to ${fmtTime(b.from)}`}
                  className="h-14 w-10 shrink-0 overflow-hidden rounded bg-muted">{b.thumb && <img src={b.thumb} alt="" className="h-full w-full object-cover" />}</button>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{p.search}</span>
                  <span className="line-clamp-2 text-muted-foreground">{p.line}</span>
                  <span className="block font-mono text-[11px] text-muted-foreground">{fmtTime(b.from)}-{fmtTime(b.to)}</span>
                </span>
                <Button size="sm" variant={open === b.id ? "secondary" : "outline"} className="h-11 shrink-0 gap-1 text-xs sm:h-8" aria-expanded={open === b.id}
                  onClick={() => toggle(b.id, p.search)}>
                  <RefreshCw className="h-3.5 w-3.5" /> Swap
                </Button>
                <Button size="sm" variant="ghost" className="h-11 w-11 shrink-0 p-0 text-muted-foreground hover:text-destructive sm:h-8 sm:w-8" aria-label={`Remove the clip at ${fmtTime(b.from)}`}
                  onClick={() => apply({ broll: brolls.filter((x) => x.id !== b.id) })}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              {open === b.id && (
                <div className="space-y-2">
                  {results.error && <p className="text-xs text-destructive" role="alert">{results.error}</p>}
                  {!results.busy && !next.length && !results.error && <p className="text-xs text-muted-foreground">No other clips for "{p.search}".</p>}
                  {next.length > 0 && (
                    <ul className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                      {next.map((it) => (
                        <li key={it.id}>
                          <button type="button" onClick={() => void swap(b, it)} disabled={!!swapping} aria-label={`Use the clip by ${it.by}`}
                            className="relative block aspect-[3/4] w-full overflow-hidden rounded-md bg-muted ring-primary focus-visible:ring-2">
                            <img src={it.thumb} alt="" loading="lazy" className="h-full w-full object-cover" />
                            {swapping === it.id && <span className="absolute inset-0 flex items-center justify-center bg-black/45"><Loader2 className="h-4 w-4 animate-spin text-white" /></span>}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <a href="https://www.pexels.com" target="_blank" rel="noreferrer" className="block text-[11px] font-semibold text-primary hover:underline">Videos provided by Pexels</a>
                  {results.busy ? (
                    <p className="text-xs text-muted-foreground" aria-live="polite">Loading clips...</p>
                  ) : results.more && (
                    <Button size="sm" variant="outline" className="h-11 text-xs sm:h-8" onClick={() => void load(p.search, results.page + 1)}>More clips</Button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
