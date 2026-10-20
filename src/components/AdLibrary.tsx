// The ad library (/swipe?tab=ads on Leo's sign-ins; docs/north-star/items/find-ad-library.md): competitors' ads,
// In your space and the Singapore picks in one searchable list, with scope pills, filters, three sorts, the Proven
// ad badge and the ad drawer. Every filter, the sort, the search and the open ad live in the URL. Checks and
// labelling run outside React (src/lib/adLibrary.ts, src/lib/competitorAds.ts); this only draws their state.
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ExternalLink, Filter, ImageOff, Loader2, PenLine, Play, RefreshCw, Search } from "lucide-react";
import AdDetailDrawer, { LoadingAdDrawer, useLinkedAd } from "@/components/AdDetailDrawer";
import PriceChip from "@/components/PriceChip";
import SaveButton from "@/components/SaveButton";
import RemixButton from "@/components/remix/RemixButton";
import { Button } from "@/components/ui/button";
import { FilterChip } from "@/components/ui/filter-chip";
import { Input } from "@/components/ui/input";
import { useUsesLeft } from "@/lib/aiUsage";
import { titleOf, toDetailAd } from "@/lib/adDetail";
import {
  AD_FORMATS, AD_PLATFORMS, type LibraryAd, type LibraryFilters, type LibrarySort, RUNS, SORTS, countLine, filterLibrary, hookName, hooksPresent,
  industriesOf, labelAds, likeOf, loadLibrary, loadSpaceAds, metaLine, onAdLabelsChanged, onAdLibrary, onSpaceAdsChanged, runDueSpace, runSpaceCheck,
  scopeCounts, setSpaceWords, sortLibrary, sortingAds, spaceFailure, spaceMissed, spaceRunning, spaceWordsFor,
} from "@/lib/adLibrary";
import { buildAdWriteUrl } from "@/lib/adsSwipe";
import { checkingAnyAds, isCheckingAds, onCompetitorAds, onCompetitorAdsChanged, runDueAds } from "@/lib/competitorAds";
import { loadCompetitors, onCompetitorsChanged } from "@/lib/competitors";
import { safeExternalUrl } from "@/lib/embed";
import { links, slug } from "@/lib/links";
import { reasonText } from "@/lib/prices";
import { fromAd } from "@/lib/remixSource";
import { useUrlFlag, useUrlSearch, useUrlState, useUrlUpdate } from "@/lib/urlState";
import { AUDIENCE_TAGS, FEELINGS, HOOK_FAMILIES } from "../../supabase/functions/_shared/tags.ts";

const TOUCH = "[@media(pointer:coarse)]:min-h-11";
const PAGE = 40;
const HOOK_IDS = ["all", ...HOOK_FAMILIES.map((h) => h.id)];
const FEELING_IDS = FEELINGS.map((f) => f.id);
const AUDIENCE_IDS = AUDIENCE_TAGS.map((a) => a.id);
const TAG: Record<string, string> = { space: "In your space", sg: "Singapore pick" };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dayMonth = (iso: string) => {
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? `${d.getDate()} ${MONTHS[d.getMonth()]}` : "";
};
const quoted = (words: string[]) => words.map((w) => `"${w}"`).join(", ");

function Pick({ label, value, onChange, options }: { label: string; value: string; onChange(v: string): void; options: [string, string][] }) {
  return (
    <label className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border/60 bg-background px-2.5 text-xs sm:h-8 [@media(pointer:coarse)]:h-11">
      <span className="font-semibold text-muted-foreground">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} className="h-full max-w-[9rem] bg-transparent font-medium text-foreground outline-none">
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}

export default function AdLibrary({ userId }: { userId: string }) {
  // stores: read again when one changes; job progress only redraws
  const [version, bump] = useState(0);
  const [, tick] = useState(0);
  useEffect(() => {
    const offs = [onCompetitorAdsChanged, onSpaceAdsChanged, onAdLabelsChanged, onCompetitorsChanged].map((on) => on(() => bump((n) => n + 1)));
    offs.push(onAdLibrary(() => tick((n) => n + 1)), onCompetitorAds(() => tick((n) => n + 1)));
    return () => offs.forEach((off) => off());
  }, []);
  const all = useMemo(() => loadLibrary(userId), [userId, version]);
  const list = useMemo(() => loadCompetitors(userId).list, [userId, version]);
  const space = useMemo(() => loadSpaceAds(userId), [userId, version]);

  // opening the tab checks what is 7+ days old, one kind after the other (decision 8)
  useEffect(() => {
    void runDueAds(userId).then(() => runDueSpace(userId));
  }, [userId]);
  // new ads get hook, feeling and audience labels in the background
  useEffect(() => {
    void labelAds(userId, all);
  }, [userId, all]);

  const [text, setText, q] = useUrlSearch("q");
  const [scopeParam] = useUrlState<string>("scope", "all");
  const [hook, setHook] = useUrlState<string>("hook", "all", { allowed: HOOK_IDS });
  const [running, setRunning] = useUrlFlag("running");
  const [run, setRun] = useUrlState<string>("run", "", { allowed: RUNS });
  const [format, setFormat] = useUrlState<string>("format", "all", { allowed: AD_FORMATS });
  const [platform, setPlatform] = useUrlState<string>("platform", "all", { allowed: AD_PLATFORMS });
  const [emotion, setEmotion] = useUrlState<string>("emotion", "all", { allowed: FEELING_IDS });
  const [audience, setAudience] = useUrlState<string>("audience", "all", { allowed: AUDIENCE_IDS });
  const [industry] = useUrlState<string>("industry", "all");
  const [sort, setSort] = useUrlState<LibrarySort>("sort", "relevant", { allowed: SORTS });
  const update = useUrlUpdate();
  const filtersOn = [running, run !== "", format !== "all", platform !== "all", emotion !== "all", audience !== "all"].filter(Boolean).length;
  const [showFilters, setShowFilters] = useState(filtersOn > 0);
  const [limit, setLimit] = useState(PAGE);
  const [editing, setEditing] = useState(false);
  const [words, setWords] = useState<string[]>([]);

  // a competitor that is gone (or not synced yet) reads as All
  const scope = ["all", "space", "sg"].includes(scopeParam) || all.some((a) => a.scope === scopeParam) ? scopeParam : "all";
  const f: LibraryFilters = { q, scope, hook, running, run, format, platform, emotion, audience, industry };
  const cards = sortLibrary(filterLibrary(all, f), sort, q);
  const counts = scopeCounts(all, f, list);
  const scopeAds = all.filter((a) => scope === "all" || a.scope === scope);
  const hooks = hooksPresent(scopeAds);
  const industries = scope === "sg" ? industriesOf(scopeAds) : [];
  const detail = useMemo(() => all.map(toDetailAd), [all]);
  useEffect(() => setLimit(PAGE), [q, scope, hook, running, run, format, platform, emotion, audience, industry, sort]);

  const spaceBusy = spaceRunning();
  const adsBusy = checkingAnyAds();
  const busy = Boolean(spaceBusy);
  const linked = useLinkedAd(detail, adsBusy || busy || !all.some((a) => a.scope !== "sg"));
  const left = useUsesLeft(busy)("space-ads");
  const why = reasonText({ left, leo: true });
  const reading = list.find((c) => isCheckingAds(c.id));
  const sorting = sortingAds();
  const failure = spaceFailure();
  const missed = spaceMissed();
  const hasSpace = space.keywords.length > 0 || space.ads.length > 0;
  const hasDrop = all.some((a) => a.scope === "sg");

  const pickScope = (s: string) => update({ scope: s === "all" ? null : s, industry: null });
  const clear = () => update({ running: null, run: null, format: null, platform: null, emotion: null, audience: null, hook: null, industry: null });
  const openEditor = () => {
    setWords([...spaceWordsFor(userId), "", "", ""].slice(0, 3));
    setEditing(true);
  };
  const cleanWords = words.map((w) => w.trim()).filter((w) => w.length >= 2);
  const sameWords = cleanWords.join("\n").toLowerCase() === space.keywords.join("\n").toLowerCase();
  const willCheck = cleanWords.length > 0 && (!sameWords || !space.checkedAt);
  const save = (e: FormEvent) => {
    e.preventDefault();
    setSpaceWords(userId, cleanWords);
    setEditing(false);
    if (willCheck) void runSpaceCheck(userId);
  };
  const shown = cards.slice(0, limit);

  return (
    <section className="space-y-4" aria-label="Ad library">
      <div className="space-y-3">
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Search anything: a word, a hook, a brand, a feeling" aria-label="Search ads"
              className="pl-9 [@media(pointer:coarse)]:h-11" />
          </div>
          <Button variant={showFilters || filtersOn ? "default" : "outline"} onClick={() => setShowFilters((v) => !v)} aria-expanded={showFilters}
            className={`shrink-0 gap-1.5 ${TOUCH}`}>
            <Filter className="h-3.5 w-3.5" /> Filters
            {filtersOn > 0 && <span className="ml-0.5 rounded-full bg-background/30 px-1.5 text-[10px] font-bold">{filtersOn}</span>}
          </Button>
        </div>

        {hooks.length > 0 && (
          <div className="scrollbar-none flex items-center gap-1.5 overflow-x-auto">
            <span className="shrink-0 text-xs font-semibold text-muted-foreground">Try a hook:</span>
            {hooks.map((h) => <FilterChip key={h.id} active={hook === h.id} onClick={() => setHook(hook === h.id ? "all" : h.id)}>{h.name}</FilterChip>)}
          </div>
        )}

        <div className="scrollbar-none flex gap-1.5 overflow-x-auto sm:flex-wrap sm:overflow-visible" role="group" aria-label="Whose ads">
          <FilterChip active={scope === "all"} onClick={() => pickScope("all")} count={counts.all}>All</FilterChip>
          {counts.competitors.map((c) => <FilterChip key={c.id} active={scope === c.id} onClick={() => pickScope(c.id)} count={c.n}>{c.name}</FilterChip>)}
          {hasSpace ? (
            <FilterChip active={scope === "space"} onClick={() => pickScope("space")} count={spaceBusy ? undefined : counts.space}>
              {spaceBusy && <Loader2 className="h-3 w-3 animate-spin" aria-hidden />} In your space
            </FilterChip>
          ) : (
            <FilterChip active={false} onClick={openEditor}>Set your space</FilterChip>
          )}
          {hasDrop && <FilterChip active={scope === "sg"} onClick={() => pickScope("sg")} count={counts.sg}>Singapore picks</FilterChip>}
        </div>

        {(showFilters || filtersOn > 0) && (
          <div className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
            <FilterChip active={running} onClick={() => setRunning(!running)}>Running now</FilterChip>
            <Pick label="Run length" value={run || "any"} onChange={(v) => setRun(v === "any" ? "" : v)}
              options={[["any", "Any length"], ["7", "Running 7+ days"], ["30", "Running 30+ days"], ["90", "Running 90+ days"]]} />
            <Pick label="Format" value={format} onChange={setFormat} options={[["all", "Any format"], ["image", "Image"], ["video", "Video"], ["carousel", "Carousel"]]} />
            <Pick label="Platform" value={platform} onChange={setPlatform}
              options={[["all", "Any platform"], ["facebook", "Facebook"], ["instagram", "Instagram"], ["messenger", "Messenger"], ["threads", "Threads"]]} />
            <Pick label="Emotion" value={emotion} onChange={setEmotion} options={[["all", "Any feeling"], ...FEELINGS.map((x): [string, string] => [x.id, x.label])]} />
            <Pick label="Audience" value={audience} onChange={setAudience} options={[["all", "Anyone"], ...AUDIENCE_TAGS.map((x): [string, string] => [x.id, x.label])]} />
            {filtersOn > 0 && <FilterChip active={false} onClick={clear}>Clear</FilterChip>}
          </div>
        )}

        {industries.length > 1 && (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Industry">
            <FilterChip active={industry === "all"} onClick={() => update({ industry: null })}>Any industry</FilterChip>
            {industries.map((i) => (
              <FilterChip key={i.value} active={industry === slug(i.value)} onClick={() => update({ industry: industry === slug(i.value) ? null : slug(i.value) })} count={i.n}>{i.value}</FilterChip>
            ))}
          </div>
        )}

        {all.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <p className="mr-auto text-xs text-muted-foreground" aria-live="polite">{countLine(cards, running)}</p>
            <Pick label="Sort" value={sort} onChange={(v) => setSort(v as LibrarySort)} options={[["relevant", "Most relevant"], ["longest", "Longest running"], ["newest", "Newest"]]} />
          </div>
        )}
        {sorting > 0 && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground" aria-live="polite">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Sorting {sorting} ads by hook and feeling...
          </p>
        )}
      </div>

      {!all.length ? (
        <div className="space-y-3 rounded-xl border border-border/60 bg-card p-6 text-center text-sm text-muted-foreground">
          <p>No ads yet. Add competitors, or set your space's search words.</p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button asChild className={`h-10 ${TOUCH}`}><Link to={links.competitors({ view: "list" })}>Add competitors</Link></Button>
            <Button variant="outline" className={`h-10 ${TOUCH}`} onClick={openEditor}>Set search words</Button>
          </div>
        </div>
      ) : !cards.length ? (
        <div className="space-y-3 py-8 text-center text-sm text-muted-foreground">
          {spaceBusy && scope === "space" ? <p>Reading your space's ads...</p> : <p>No ads match these filters.</p>}
          {!(spaceBusy && scope === "space") && (
            <Button variant="outline" className={`h-10 ${TOUCH}`} onClick={() => { setText(""); clear(); }}>Clear</Button>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 items-start gap-x-3 gap-y-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {shown.map((a) => <Card key={a.id} ad={a} onOpen={() => linked.open(a.id)} />)}
          </div>
          {cards.length > shown.length && (
            <div className="flex justify-center">
              <Button variant="outline" className={`h-10 ${TOUCH}`} onClick={() => setLimit(limit + PAGE)}>Show {Math.min(PAGE, cards.length - shown.length)} more</Button>
            </div>
          )}
        </>
      )}

      <div className="space-y-2 border-t border-border/60 pt-4">
        {spaceBusy && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground" aria-live="polite">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading ads for {quoted(spaceBusy)}, about a minute...
          </p>
        )}
        {reading && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground" aria-live="polite">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading {reading.name}'s ads, about a minute...
          </p>
        )}
        {failure && !busy && <p role="alert" className="text-xs text-destructive">{failure.message}</p>}
        {!failure && !busy && missed.length > 0 && <p className="text-xs text-muted-foreground">Couldn't read Meta's ads for {quoted(missed)} this time.</p>}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <p className="mr-auto min-w-0 text-xs text-muted-foreground [overflow-wrap:anywhere]">
            <span className="font-semibold text-foreground">Your space:</span> {space.keywords.length ? quoted(space.keywords) : "no search words yet"}
            {space.checkedAt && <span className="whitespace-nowrap"> | Checked {dayMonth(space.checkedAt)}</span>}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="ghost" className={`h-10 px-3 ${TOUCH}`} onClick={openEditor} aria-expanded={editing}>{space.keywords.length ? "Edit" : "Set search words"}</Button>
            {space.keywords.length > 0 && (
              <>
                <Button variant="outline" className={`h-10 gap-2 ${TOUCH}`} onClick={() => void runSpaceCheck(userId)} disabled={busy || Boolean(why)}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Check now
                </Button>
                {!busy && <PriceChip feature="space-ads" left={left} />}
              </>
            )}
          </div>
        </div>
        {why && !busy && space.keywords.length > 0 && <p className="text-xs text-muted-foreground">{why}</p>}

        {editing && (
          <form onSubmit={save} className="space-y-3 rounded-xl border border-border/60 bg-card p-4" aria-labelledby="space-words">
            <div className="space-y-0.5">
              <h3 id="space-words" className="text-sm font-semibold">Search words for your space</h3>
              <p className="text-xs text-muted-foreground">Up to 3. We search Singapore's Meta ads for each.</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              {[0, 1, 2].map((k) => (
                <Input key={k} value={words[k] ?? ""} maxLength={60} aria-label={`Search word ${k + 1}`} className="[@media(pointer:coarse)]:h-11"
                  onChange={(e) => setWords((w) => w.map((x, i) => (i === k ? e.target.value : x)))} />
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" className={`h-10 ${TOUCH}`} disabled={!cleanWords.length || busy || (willCheck && Boolean(why))}>Save</Button>
              {willCheck && !busy && <PriceChip feature="space-ads" left={left} />}
              <Button type="button" variant="ghost" className={`h-10 ${TOUCH}`} onClick={() => setEditing(false)}>Cancel</Button>
            </div>
          </form>
        )}
      </div>

      {linked.loading && <LoadingAdDrawer onClose={linked.close} />}
      {linked.ad && <AdDetailDrawer key={linked.ad.id} ad={linked.ad} list={detail} onClose={linked.close} />}
    </section>
  );
}

function Card({ ad, onOpen }: { ad: LibraryAd; onOpen(): void }) {
  // Meta's picture links expire: a dead one shows "No preview" until the next weekly check
  const [broken, setBroken] = useState(false);
  const like = likeOf(ad);
  const source = fromAd(like);
  const pic = Boolean(ad.image) && !broken;
  const hook = hookName(ad.hook);
  return (
    <article className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-border/60 bg-card shadow-card">
      <button type="button" onClick={onOpen} className="group flex flex-col text-left">
        <span className="relative block aspect-[4/5] w-full bg-muted">
          {pic ? (
            <img src={ad.image!} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full w-full flex-col items-center justify-center gap-1 text-xs text-muted-foreground">
              <ImageOff className="h-5 w-5" aria-hidden /> No preview
            </span>
          )}
          {pic && ad.format === "video" && (
            <span aria-hidden className="absolute inset-0 m-auto flex h-10 w-10 items-center justify-center rounded-full bg-background/80 text-foreground">
              <Play className="h-4 w-4" />
            </span>
          )}
          <span className="absolute left-2 top-2 flex max-w-[calc(100%-1rem)] flex-wrap gap-1 text-[10px] font-semibold">
            <span className="rounded-full bg-background/90 px-2 py-0.5 text-foreground">{TAG[ad.scope] ?? "Your competitor"}</span>
            {ad.active && (
              <span className="inline-flex items-center gap-1 rounded-full bg-background/90 px-2 py-0.5 text-foreground">
                <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-success" /> Running
              </span>
            )}
          </span>
        </span>
        <span className="block space-y-1 px-3 pt-3">
          <span className="block truncate text-[11px] font-medium text-muted-foreground">{ad.advertiser}</span>
          <span className="line-clamp-2 text-xs font-semibold text-foreground group-hover:underline">{titleOf(ad) || "Untitled ad"}</span>
          <span className="block text-[11px] text-muted-foreground">{metaLine(ad)}</span>
        </span>
      </button>
      <div className="flex flex-1 flex-col gap-1.5 px-3 pb-3 pt-1.5">
        {(ad.proven || hook || ad.fresh) && (
          <p className="flex flex-wrap gap-1 text-[10px] font-semibold">
            {ad.fresh && <span className="rounded-full bg-primary px-2 py-0.5 text-primary-foreground">New</span>}
            {ad.proven && <span className="rounded-full bg-warning/15 px-2 py-0.5 text-foreground">Proven ad</span>}
            {hook && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary">{hook}</span>}
          </p>
        )}
        {ad.scope === "space" && ad.fit === null && <p className="text-[11px] text-muted-foreground">Not checked against your space</p>}
        <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
          <RemixButton source={source} label={`${ad.advertiser}'s ad`}>
            <Button asChild size="sm" variant="outline" className="h-9 gap-1.5">
              <Link to={buildAdWriteUrl(like)}><PenLine className="h-3.5 w-3.5" /> Write a post like this</Link>
            </Button>
          </RemixButton>
          <SaveButton source={source} />
          <Button asChild size="sm" variant="ghost" className={`h-9 gap-1.5 px-2 ${TOUCH}`}>
            <a href={safeExternalUrl(ad.libraryUrl) ?? undefined} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-3.5 w-3.5" /> Open on Meta</a>
          </Button>
        </div>
      </div>
    </article>
  );
}
