import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { Bookmark, BookmarkCheck, ChevronLeft, ChevronRight, Heart, Layers, LayoutGrid, Loader2, MessageCircle, Search, SlidersHorizontal, Sparkles, UserCheck, X, Grid3x3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterChip } from "@/components/ui/filter-chip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { fitInput } from "@/lib/creatorFit";
import { callFn, EdgeError } from "@/lib/edgeFn";
import { supabase } from "@/lib/supabase";
import { withParam } from "@/lib/urlState";
import { cn } from "@/lib/utils";
import {
  CARD_COLUMNS,
  DATES,
  FORMATS,
  PAGE_SIZE,
  SORTS,
  TIERS,
  TOPICS,
  VIEWS,
  activeCount,
  addFolder,
  addSearch,
  ago,
  applyFilters,
  compact,
  coverPath,
  filtersFrom,
  loadCarouselFit,
  loadShelf,
  multipleLabel,
  publicUrl,
  rankByFit,
  removeSearch,
  saveCarouselFit,
  saveShelf,
  searchName,
  searchQuery,
  slidePath,
  tierOf,
  toggleSaved,
  type CarouselCard,
  type FitAnswer,
  type Filters,
  type Shelf,
} from "@/lib/carouselLibrary";

/** Saved carousels are read by id, a page at a time, so the address never outgrows PostgREST's limit. */
const ID_CHUNK = 60;

type Load = { rows: CarouselCard[]; total: number | null; error: string | null; loading: boolean };

export default function CarouselsPage() {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const { toast } = useToast();
  const f = useMemo(() => filtersFrom(params), [params]);
  const size = params.get("size") === "large" ? "large" : "compact";
  const [userId, setUserId] = useState<string | null>(null);
  const [shelf, setShelfState] = useState<Shelf>({ folders: [], saved: [], tracked: [], searches: [] });
  const [panel, setPanel] = useState(activeCount(f) > 0);
  const [page, setPage] = useState(0);
  const [data, setData] = useState<Load>({ rows: [], total: null, error: null, loading: true });
  const [fit, setFit] = useState<{ state: "idle" | "ranking" | "ready" | "none" | "needs-audience"; answer?: FitAnswer; note?: string }>({ state: "idle" });
  const [q, setQ] = useState(f.q);
  const [newFolder, setNewFolder] = useState("");
  const [retry, setRetry] = useState(0);
  // the brand ranking's rows for these filters, so Show more pages them without asking again
  const ranked = useRef<{ key: string; rows: CarouselCard[] } | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: u }) => {
      const id = u.user?.id ?? null;
      setUserId(id);
      if (id) setShelfState(loadShelf(id));
    });
  }, []);

  const setShelf = useCallback(
    (next: Shelf) => {
      setShelfState(next);
      if (userId && !saveShelf(userId, next)) toast({ title: "Couldn't save on this device", description: "Storage is full or blocked." });
    },
    [userId, toast],
  );

  const set = useCallback(
    (name: string, value: string | null) => setParams((prev) => withParam(prev, name, value), { replace: true }),
    [setParams],
  );

  // the search box writes ?q= a moment after typing stops
  useEffect(() => setQ(f.q), [f.q]);
  useEffect(() => {
    if (q === f.q) return;
    const t = setTimeout(() => set("q", q.trim() || null), 300);
    return () => clearTimeout(t);
  }, [q, f.q, set]);

  // Best for your brand: the device's answer for this brand, else one carousel-fit call
  useEffect(() => {
    if (f.sort !== "brand" || !userId) return;
    const input = fitInput(userId);
    if (!input.serves) return setFit({ state: "needs-audience" });
    const cached = loadCarouselFit(userId, input);
    if (cached) return setFit({ state: "ready", answer: cached });
    let live = true;
    setFit({ state: "ranking" });
    callFn<{ fit: Record<string, number> | null; topics?: string[] }>("carousel-fit", input, "Couldn't rank the library right now.")
      .then((r) => {
        if (!live) return;
        if (!r.fit) return setFit({ state: "none", note: "Ranking isn't available right now, so these are the biggest outliers." });
        const answer = { fit: r.fit, topics: r.topics ?? [] };
        saveCarouselFit(userId, input, answer);
        setFit({ state: "ready", answer });
      })
      .catch((e) => live && setFit({ state: e instanceof EdgeError && e.status === 400 ? "needs-audience" : "none", note: e instanceof Error ? e.message : undefined }));
    return () => {
      live = false;
    };
  }, [f.sort, userId]);

  const filterKey = searchQuery(params) + f.view + f.folder + (f.sort === "brand" ? fit.state : "");
  useEffect(() => setPage(0), [filterKey]);

  useEffect(() => {
    if (!userId) return;
    if (f.sort === "brand" && f.view !== "saved" && fit.state === "ranking") return;
    let live = true;
    setData((d) => ({ ...d, loading: true, error: null, ...(page === 0 ? { rows: [] } : {}) }));
    (async (): Promise<Load> => {
      const base = () => supabase.from("cs_carousels").select(CARD_COLUMNS, { count: "exact" });
      if (f.view === "saved") {
        const ids = shelf.saved.filter((s) => !f.folder || s.folder === f.folder).map((s) => s.id);
        const chunk = ids.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
        if (!chunk.length) return { rows: [], total: ids.length, error: null, loading: false };
        const { data: rows, error } = await base().in("id", chunk);
        if (error) throw error;
        const byId = new Map((rows as CarouselCard[]).map((r) => [r.id, r]));
        return { rows: chunk.map((id) => byId.get(id)).filter((r): r is CarouselCard => Boolean(r)), total: ids.length, error: null, loading: false };
      }
      if (f.view === "tracked" && !shelf.tracked.length) return { rows: [], total: 0, error: null, loading: false };
      const scoped = <Q extends { in(c: string, v: string[]): Q }>(qb: Q) => (f.view === "tracked" ? qb.in("creator", shelf.tracked) : qb);
      if (f.sort === "brand" && fit.state === "ready" && fit.answer) {
        // the ranked carousels that also pass the filters, ranked on the device, then paged here
        if (ranked.current?.key !== filterKey) {
          const ids = Object.keys(fit.answer.fit);
          const all: CarouselCard[] = [];
          for (let i = 0; i < ids.length; i += ID_CHUNK) {
            const { data: rows, error } = await scoped(applyFilters(base(), f)).in("id", ids.slice(i, i + ID_CHUNK));
            if (error) throw error;
            all.push(...(rows as CarouselCard[]));
          }
          ranked.current = { key: filterKey, rows: rankByFit(all, fit.answer.fit) };
        }
        const list = ranked.current.rows;
        return { rows: list.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), total: list.length, error: null, loading: false };
      }
      const { data: rows, error, count } = await scoped(applyFilters(base(), f)).range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
      if (error) throw error;
      return { rows: rows as CarouselCard[], total: count, error: null, loading: false };
    })()
      .then((r) => live && setData((d) => ({ ...r, rows: page === 0 ? r.rows : [...d.rows, ...r.rows] })))
      .catch(() => live && setData((d) => ({ ...d, loading: false, error: "Couldn't load the library. Check your connection and try again." })));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey, page, userId, retry, f.view === "saved" ? shelf.saved : null, f.view === "tracked" ? shelf.tracked : null]);

  const saved = useMemo(() => new Set(shelf.saved.map((s) => s.id)), [shelf.saved]);
  const onSave = (e: MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    const was = saved.has(id);
    setShelf(toggleSaved(shelf, id, was ? shelf.saved.find((s) => s.id === id)?.folder ?? null : null));
    toast({ title: was ? "Removed from Saved" : "Saved", description: was ? undefined : "It's in Saved, above the grid." });
  };

  const back = `${location.pathname}${location.search}`;
  const hasMore = data.total !== null && data.rows.length < data.total;
  const thisSearch = searchQuery(params);
  const searchSaved = shelf.searches.some((s) => s.query === thisSearch);

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <h1 className="font-serif text-2xl font-semibold">Carousel library</h1>
        <label className="relative block">
          <span className="sr-only">Search carousels, topics and creators</span>
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search carousels, topics and @creators" className="h-11 pl-9 text-base" />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {VIEWS.map((v) => (
          <FilterChip
            key={v.value}
            active={f.view === v.value}
            onClick={() => setParams((prev) => withParam(withParam(withParam(prev, "view", v.value, "all"), "folder", null), "sort", null), { replace: true })}
            count={v.value === "saved" ? shelf.saved.length : v.value === "tracked" ? shelf.tracked.length : undefined}
          >
            {v.label}
          </FilterChip>
        ))}
      </div>

      {f.view === "saved" && (
        <div className="flex flex-wrap items-center gap-2">
          <FilterChip active={!f.folder} onClick={() => set("folder", null)}>All saved</FilterChip>
          {shelf.folders.map((fo) => (
            <FilterChip key={fo.id} active={f.folder === fo.id} onClick={() => set("folder", fo.id)} count={shelf.saved.filter((s) => s.folder === fo.id).length}>
              {fo.name}
            </FilterChip>
          ))}
          <form
            className="flex items-center gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              const r = addFolder(shelf, newFolder);
              if (r.id) {
                setShelf(r.shelf);
                setNewFolder("");
                set("folder", r.id);
              }
            }}
          >
            <Input value={newFolder} onChange={(e) => setNewFolder(e.target.value)} placeholder="New folder" aria-label="New folder name" className="h-9 w-36 sm:h-7" maxLength={40} />
            <Button type="submit" size="sm" variant="outline" disabled={!newFolder.trim()}>Add</Button>
          </form>
        </div>
      )}

      {f.view === "tracked" && shelf.tracked.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <FilterChip active={!f.creator} onClick={() => set("creator", null)}>Everyone tracked</FilterChip>
          {shelf.tracked.map((c) => (
            <FilterChip key={c} active={f.creator === c} onClick={() => set("creator", c)}>@{c}</FilterChip>
          ))}
        </div>
      )}

      {f.view !== "saved" && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant={panel ? "secondary" : "outline"} size="sm" className="gap-1.5" onClick={() => setPanel(!panel)} aria-expanded={panel}>
              <SlidersHorizontal className="h-3.5 w-3.5" /> Filters{activeCount(f) ? ` (${activeCount(f)})` : ""}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={searchSaved || !thisSearch}
              onClick={() => {
                setShelf(addSearch(shelf, searchName(f), thisSearch));
                toast({ title: "Search saved", description: "It's in the row under the filters." });
              }}
            >
              {searchSaved ? "Search saved" : "Save search"}
            </Button>
            {f.creator && f.view !== "tracked" && (
              <FilterChip active onClick={() => set("creator", null)}>
                @{f.creator} <X aria-label="Clear creator" className="h-3 w-3" />
              </FilterChip>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden text-xs tabular-nums text-muted-foreground sm:inline">
              {data.total !== null ? `${data.total.toLocaleString()} carousels` : ""}
            </span>
            <Select value={f.sort} onValueChange={(v) => set("sort", v === (f.view === "trending" ? "score" : "published") ? null : v)}>
              <SelectTrigger className="h-9 w-[200px]" aria-label="Sort by">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORTS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.value === "brand" ? (
                      <span className="inline-flex items-center gap-1"><Sparkles className="h-3 w-3" /> {s.label}</span>
                    ) : (
                      s.label
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex rounded-md border border-border/60" role="group" aria-label="Card size">
              <Button variant={size === "large" ? "secondary" : "ghost"} size="sm" className="h-9 px-2.5" aria-pressed={size === "large"} aria-label="Large cards" onClick={() => set("size", "large")}>
                <LayoutGrid className="h-4 w-4" />
              </Button>
              <Button variant={size === "compact" ? "secondary" : "ghost"} size="sm" className="h-9 px-2.5" aria-pressed={size === "compact"} aria-label="Compact cards" onClick={() => set("size", null)}>
                <Grid3x3 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {shelf.searches.length > 0 && f.view !== "saved" && (
        <div className="flex flex-wrap items-center gap-2" aria-label="Saved searches">
          <span className="text-xs font-medium text-muted-foreground">Saved searches</span>
          {shelf.searches.map((s) => (
            <span key={s.id} className="inline-flex items-center rounded-full border border-border/60 bg-background text-xs">
              <Link to={`/carousels?${s.query}`} className={cn("px-3 py-1.5", s.query === thisSearch ? "text-primary" : "text-foreground hover:text-primary")}>{s.name}</Link>
              <button type="button" className="px-2 py-1.5 text-muted-foreground hover:text-foreground" aria-label={`Remove saved search ${s.name}`} onClick={() => setShelf(removeSearch(shelf, s.id))}>
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {panel && f.view !== "saved" && <FilterPanel f={f} set={set} reset={() => setParams((prev) => {
        const keep = new URLSearchParams();
        for (const k of ["view", "q", "sort", "size", "creator"]) if (prev.get(k)) keep.set(k, prev.get(k)!);
        return keep;
      }, { replace: true })} />}

      {f.sort === "brand" && f.view !== "saved" && <FitLine fit={fit} />}

      {data.error ? (
        <EmptyState icon={Layers} title="The library didn't load" actions={<Button size="sm" onClick={() => setRetry((r) => r + 1)}>Try again</Button>}>
          {data.error}
        </EmptyState>
      ) : data.loading && data.rows.length === 0 ? (
        <Grid size={size}>{Array.from({ length: 10 }, (_, i) => <div key={i} className="aspect-[3/4] animate-pulse rounded-xl bg-muted" />)}</Grid>
      ) : data.rows.length === 0 ? (
        <Empty f={f} shelf={shelf} />
      ) : (
        <>
          <Grid size={size}>
            {data.rows.map((c) => (
              <CarouselCardView key={c.id} c={c} back={back} saved={saved.has(c.id)} onSave={onSave} />
            ))}
          </Grid>
          {hasMore && (
            <div className="flex justify-center">
              <Button variant="outline" onClick={() => setPage(page + 1)} disabled={data.loading} className="gap-1.5">
                {data.loading && <Loader2 className="h-4 w-4 animate-spin" />} Show more
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Grid({ size, children }: { size: "large" | "compact"; children: ReactNode }) {
  return (
    <div className={cn("grid gap-4", size === "large" ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5")}>
      {children}
    </div>
  );
}

function FitLine({ fit }: { fit: { state: string; answer?: FitAnswer; note?: string } }) {
  if (fit.state === "ranking")
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
        <Loader2 className="h-4 w-4 animate-spin" /> Ranking the library for your brand. This takes about 15 seconds.
      </p>
    );
  if (fit.state === "needs-audience")
    return (
      <p className="text-sm text-muted-foreground" role="status">
        Best for your brand needs who you serve. <Link to="/playbook" className="font-medium text-primary underline-offset-2 hover:underline">Add it in Playbook</Link>, then come back.
      </p>
    );
  if (fit.state === "none") return <p className="text-sm text-muted-foreground" role="status">{fit.note ?? "Ranking isn't available right now, so these are the biggest outliers."}</p>;
  if (fit.state === "ready" && fit.answer?.topics.length)
    return <p className="text-sm text-muted-foreground">Ranked for your brand from {fit.answer.topics.join(", ")}.</p>;
  return null;
}

function Empty({ f, shelf }: { f: Filters; shelf: Shelf }) {
  if (f.view === "saved")
    return <EmptyState icon={Bookmark} title={f.folder ? "Nothing in this folder yet" : "Nothing saved yet"}>Tap the bookmark on any carousel to keep it here.</EmptyState>;
  if (f.view === "tracked" && !shelf.tracked.length)
    return <EmptyState icon={UserCheck} title="No creators tracked yet">Open a carousel and choose Track to see that creator's outliers here.</EmptyState>;
  return <EmptyState icon={Search} title="No carousels match">Clear a filter or try other words.</EmptyState>;
}

function FilterPanel({ f, set, reset }: { f: Filters; set: (name: string, value: string | null) => void; reset: () => void }) {
  const range = (label: string, lo: "smin" | "emin" | "lmin", hi: "smax" | "emax" | "lmax", unit = "") => (
    <fieldset className="space-y-1.5">
      <legend className="text-xs font-medium text-foreground">{label}</legend>
      <div className="flex items-center gap-2">
        <Input inputMode="decimal" value={f[lo]} onChange={(e) => set(lo, e.target.value.replace(/[^\d.]/g, "") || null)} placeholder="Min" aria-label={`${label} from`} className="h-9" />
        <span className="text-xs text-muted-foreground">to</span>
        <Input inputMode="decimal" value={f[hi]} onChange={(e) => set(hi, e.target.value.replace(/[^\d.]/g, "") || null)} placeholder="Max" aria-label={`${label} to`} className="h-9" />
        {unit && <span className="text-xs text-muted-foreground">{unit}</span>}
      </div>
    </fieldset>
  );
  const hidden = new Set(f.hide);
  return (
    <section className="space-y-4 rounded-xl border border-border/60 bg-muted/20 p-4" aria-label="Filters">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {range("Outlier score", "smin", "smax", "x")}
        {range("Engagements", "emin", "emax")}
        {range("Slides", "lmin", "lmax")}
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-foreground">Topic</p>
          <Select value={f.topic || "all"} onValueChange={(v) => set("topic", v === "all" ? null : v)}>
            <SelectTrigger className="h-9" aria-label="Topic"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All topics</SelectItem>
              {TOPICS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-foreground">Format</p>
          <Select value={f.format || "all"} onValueChange={(v) => set("format", v === "all" ? null : v)}>
            <SelectTrigger className="h-9" aria-label="Format"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All formats</SelectItem>
              {FORMATS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      {f.view !== "trending" && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-foreground">Publication date</p>
          <div className="flex flex-wrap gap-2">
            {DATES.map((d) => <FilterChip key={d.value} active={f.days === d.value} onClick={() => set("days", d.value || null)}>{d.label}</FilterChip>)}
          </div>
        </div>
      )}
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-foreground">Hide topics</p>
        <div className="flex flex-wrap gap-2">
          {TOPICS.map((t) => (
            <FilterChip key={t} active={hidden.has(t)} onClick={() => set("hide", (hidden.has(t) ? f.hide.filter((x) => x !== t) : [...f.hide, t]).join(",") || null)}>
              {t}
            </FilterChip>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {[...TIERS].reverse().map((t, i, all) => (
            <span key={t.label} className="inline-flex items-center gap-1">
              <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold", t.className)}>{i < all.length - 1 ? `${t.from}-${all[i + 1].from}x` : `${t.from}x+`}</span>
              {t.label}
            </span>
          ))}
        </div>
        <Button variant="ghost" size="sm" onClick={reset}>Reset filters</Button>
      </div>
    </section>
  );
}

export function CarouselCardView({ c, back, saved, onSave }: { c: CarouselCard; back: string; saved: boolean; onSave: (e: MouseEvent, id: string) => void }) {
  const [n, setN] = useState(0);
  const tier = tierOf(c.multiple);
  const flip = (e: MouseEvent, by: number) => {
    e.preventDefault();
    e.stopPropagation();
    setN((x) => (x + by + c.slides) % c.slides);
  };
  return (
    <Link to={`/carousels/${c.id}`} state={{ back }} className="group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <div className="relative aspect-[3/4] overflow-hidden rounded-xl bg-muted">
        <img src={publicUrl(n === 0 ? coverPath(c.id) : slidePath(c.id, n))} alt={c.title} loading="lazy" decoding="async" className="h-full w-full object-cover" />
        <button
          type="button"
          onClick={(e) => onSave(e, c.id)}
          aria-pressed={saved}
          aria-label={saved ? `Remove ${c.title} from Saved` : `Save ${c.title}`}
          className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm hover:bg-black/70"
        >
          {saved ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
        </button>
        {c.slides > 1 && (
          <>
            <button type="button" aria-label="Previous slide" onClick={(e) => flip(e, -1)} className={cn("absolute left-2 top-1/2 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white group-hover:flex", n === 0 && "invisible")}>
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button type="button" aria-label="Next slide" onClick={(e) => flip(e, 1)} className="absolute right-2 top-1/2 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white group-hover:flex">
              <ChevronRight className="h-4 w-4" />
            </button>
          </>
        )}
        <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-0.5 text-[11px] font-medium text-white">
          <Layers className="h-3 w-3" /> {n + 1}/{c.slides}
        </span>
      </div>
      <div className="space-y-1 pt-2">
        <p className="line-clamp-2 text-sm font-medium leading-snug text-foreground">
          <span className={cn("mr-1.5 inline-block rounded px-1.5 py-px align-[1px] text-[11px] font-semibold", tier.className)}>{multipleLabel(c.multiple)}</span>
          {c.title || "Untitled"}
        </p>
        <p className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="truncate">@{c.creator}</span>
          <span className="shrink-0">{ago(c.posted_at)}</span>
        </p>
        <p className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-2.5">
            <span className="inline-flex items-center gap-1"><Heart className="h-3 w-3" aria-hidden /> {compact(c.likes)}<span className="sr-only"> likes</span></span>
            <span className="inline-flex items-center gap-1"><MessageCircle className="h-3 w-3" aria-hidden /> {compact(c.comments)}<span className="sr-only"> comments</span></span>
          </span>
          {c.topic && <span className="truncate rounded-full border border-border/60 px-2 py-px text-[10px]">{c.topic}</span>}
        </p>
      </div>
    </Link>
  );
}
