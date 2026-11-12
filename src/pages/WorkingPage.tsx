import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { BookmarkSimpleIcon, EyeIcon, ImagesIcon, StackIcon, CircleNotchIcon, MagnifyingGlassIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterChip } from "@/components/ui/filter-chip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { compact, multipleLabel } from "@/lib/carouselLibrary";
import { supabase } from "@/lib/supabase";
import { useUrlSearch, useUrlUpdate } from "@/lib/urlState";
import {
  CARD_COLUMNS,
  MAX_PAGES,
  SORTS,
  TABLE,
  applyFilters,
  filtersFrom,
  loadNiches,
  missingTable,
  nicheLabel,
  pageFetch,
  pagesFrom,
  saveRateLabel,
  slideUrl,
  tagLabel,
  type WorkingCard,
} from "@/lib/workingLibrary";

type Load = { rows: WorkingCard[]; total: number | null; error: string | null; loading: boolean };

export default function WorkingPage() {
  const [params] = useSearchParams();
  const location = useLocation();
  const f = useMemo(() => filtersFrom(params), [params]);
  const [text, setText] = useUrlSearch("q");
  const update = useUrlUpdate();
  const pages = pagesFrom(params);
  const asked = useRef({ key: "", pages: 0 }); // the list last asked for: what data.rows holds once it lands
  const [data, setData] = useState<Load>({ rows: [], total: null, error: null, loading: true });
  const [niches, setNiches] = useState<{ niche: string; count: number }[]>([]);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let live = true;
    void loadNiches().then((n) => live && setNiches(n));
    return () => {
      live = false;
    };
  }, [retry]);

  const key = `${f.q}|${f.niche}|${f.sort}`;

  useEffect(() => {
    const step = pageFetch(asked.current, key, pages);
    if (!step) return void update({ pages: null }); // a new search, niche or sort: from the first page, which loads next
    asked.current = { key, pages };
    let live = true;
    setData((d) => ({ ...d, loading: true, error: null, ...(step.more ? {} : { rows: [] }) }));
    const failed = () => live && setData((d) => ({ ...d, loading: false, error: "Couldn't load the library. Check your connection and try again." }));
    const base = supabase.from(TABLE).select(CARD_COLUMNS, { count: "exact" });
    applyFilters(base, f)
      .range(step.from, step.to)
      .then(({ data: rows, error, count }) => {
        if (!live) return;
        if (error && !missingTable(error)) return failed();
        const got = (rows as WorkingCard[] | null) ?? [];
        setData((d) => ({ rows: step.more ? [...d.rows, ...got] : got, total: error ? 0 : count, error: null, loading: false }));
      }, failed);
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, pages, retry]);

  const back = `${location.pathname}${location.search}`;
  const hasMore = data.total !== null && data.rows.length < data.total;
  const all = niches.reduce((n, x) => n + x.count, 0);

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <h1 className="font-serif text-2xl font-semibold">What's working</h1>
        <label className="relative block">
          <span className="sr-only">Search slides, captions and creators</span>
          <MagnifyingGlassIcon aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Search slides, captions and @creators" className="h-11 pl-9 text-base" maxLength={100} />
        </label>
      </div>

      {niches.length > 0 && (
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:overflow-visible" aria-label="Niches">
          <FilterChip active={!f.niche} onClick={() => update({ niche: null })} count={all}>All</FilterChip>
          {niches.map((n) => (
            <FilterChip key={n.niche} active={f.niche === n.niche} onClick={() => update({ niche: n.niche })} count={n.count}>
              {nicheLabel(n.niche)}
            </FilterChip>
          ))}
          <Link to="/feedback" className="flex shrink-0 items-center whitespace-nowrap px-1 text-xs text-primary hover:underline [@media(pointer:coarse)]:min-h-11">
            Ask for a niche
          </Link>
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <span className="text-xs tabular-nums text-muted-foreground">{data.total ? `${data.total.toLocaleString()} slideshows` : ""}</span>
        <Select value={f.sort} onValueChange={(v) => update({ sort: v === "working" ? null : v })}>
          <SelectTrigger className="h-9 w-[160px]" aria-label="Sort by">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORTS.map((s) => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {data.error ? (
        <EmptyState icon={ImagesIcon} title="The library didn't load" actions={<Button size="sm" onClick={() => setRetry((r) => r + 1)}>Try again</Button>}>
          {data.error}
        </EmptyState>
      ) : data.loading && data.rows.length === 0 ? (
        <Grid>{Array.from({ length: 10 }, (_, i) => <div key={i} className="aspect-[3/4] animate-pulse rounded-xl bg-muted" />)}</Grid>
      ) : data.rows.length === 0 ? (
        f.q || f.niche ? (
          <EmptyState icon={MagnifyingGlassIcon} title="No slideshows match" actions={<Button size="sm" variant="outline" onClick={() => { setText(""); update({ q: null, niche: null }); }}>Show all</Button>} />
        ) : (
          <EmptyState icon={ImagesIcon} title="No slideshows yet" />
        )
      ) : (
        <>
          <Grid>
            {data.rows.map((c) => <WorkingCardView key={c.id} c={c} back={back} />)}
          </Grid>
          {hasMore && (
            <div className="flex justify-center">
              <Button variant="outline" onClick={() => update({ pages: String(pages + 1) })} disabled={data.loading || pages >= MAX_PAGES} className="gap-1.5">
                {data.loading && <CircleNotchIcon className="h-4 w-4 animate-spin" />} Show more
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Grid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">{children}</div>;
}

export function WorkingCardView({ c, back }: { c: WorkingCard; back: string }) {
  const rate = saveRateLabel(c.saves, c.views);
  return (
    <Link to={`/working/${c.id}`} state={{ back }} className="group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <div className="relative aspect-[3/4] overflow-hidden rounded-xl bg-muted">
        <img src={slideUrl(c.id, 1)} alt={`@${c.author}'s slideshow, first slide`} loading="lazy" decoding="async" className="h-full w-full object-cover" />
        {c.ratio !== null && (
          <span className="absolute left-2 top-2 rounded-md bg-primary px-1.5 py-0.5 text-[11px] font-semibold text-primary-foreground">{multipleLabel(c.ratio)} usual views</span>
        )}
        <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-0.5 text-[11px] font-medium text-white">
          <StackIcon className="h-3 w-3" aria-hidden /> {c.slides}<span className="sr-only"> slides</span>
        </span>
      </div>
      <div className="space-y-1 pt-2">
        <p className="flex items-center justify-between gap-2 text-xs">
          <span className="min-w-0 truncate font-medium text-foreground">@{c.author}</span>
          {c.format && <span className="min-w-0 truncate rounded-full border border-border/60 px-2 py-px text-[10px] text-muted-foreground">{tagLabel(c.format)}</span>}
        </p>
        <p className="flex items-center gap-2.5 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1"><EyeIcon className="h-3 w-3" aria-hidden /> {compact(c.views)}<span className="sr-only"> views</span></span>
          {rate && <span className="inline-flex items-center gap-1"><BookmarkSimpleIcon className="h-3 w-3" aria-hidden /> {rate}<span className="sr-only"> saved</span></span>}
        </p>
      </div>
    </Link>
  );
}
