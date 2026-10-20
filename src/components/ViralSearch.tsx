// The Search tab on /swipe (Leo only; docs/north-star/items/find-viral-search.md): public TikTok and YouTube videos
// for a keyword, ranked by how far each beat its account's size, with Remix on every result. The search runs outside
// React (src/lib/viralSearch.ts); everything on screen reads the URL (q, platform, sort, posted) and the saved searches.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, ExternalLink, Loader2, Search, Video, Youtube } from "lucide-react";
import PriceChip from "@/components/PriceChip";
import RemixButton from "@/components/remix/RemixButton";
import SaveButton from "@/components/SaveButton";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FilterChip as Chip } from "@/components/ui/filter-chip";
import { Input } from "@/components/ui/input";
import { useUsesLeft } from "@/lib/aiUsage";
import { brandFacts } from "@/lib/competitors";
import { reasonText } from "@/lib/prices";
import { ago } from "@/lib/slideshow";
import { compactNum, postAge } from "@/lib/topPosts";
import { useUrlSearch, useUrlState, useUrlUpdate } from "@/lib/urlState";
import {
  findSearch, type Found, isSearching, loadViralSearches, onViralSearch, onViralSearchChanged, remixUrlFor, runSearch, sameQ, searchFailure, sourceFor,
} from "@/lib/viralSearch";
import {
  inPeriod, platformName, type Posted, POSTED, Q_MAX, Q_MIN, SEARCH_SORTS, type SearchPlatform, type SearchSort, sortFound, splitRelevant,
} from "../../supabase/functions/viral-search/logic.ts";

const PLATFORM_CHIPS = ["all", "tiktok", "youtube"] as const;
type PlatformChip = (typeof PLATFORM_CHIPS)[number];
// Refusals that another press today can't fix, so they get no Try again.
const FINAL = ["daily_limit", "global_limit", "not_enabled", "not_configured"];

function Select<T extends string>({ label, value, onChange, options }: { label: string; value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <label className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border/60 bg-background px-2.5 text-xs sm:h-8 [@media(pointer:coarse)]:h-11">
      <span className="font-semibold text-muted-foreground">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value as T)} aria-label={label} className="h-full max-w-[9rem] bg-transparent font-medium text-foreground outline-none">
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}

const PlatformIcon = ({ p, className }: { p: SearchPlatform; className?: string }) => (p === "youtube" ? <Youtube className={className} /> : <Video className={className} />);

function ResultCard({ f }: { f: Found }) {
  const [broken, setBroken] = useState(false);
  const name = platformName(f.platform);
  const age = postAge(f.postedAt);
  const words = f.title ?? f.caption ?? "";
  return (
    <div className="flex min-w-0 flex-col">
      <a href={f.url} target="_blank" rel="noopener noreferrer" tabIndex={-1} aria-hidden className="group block">
        <span className="relative block aspect-[4/5] w-full overflow-hidden rounded-xl bg-muted shadow-card ring-1 ring-border/60 transition-shadow group-hover:shadow-elegant">
          {f.cover && !broken ? (
            f.platform === "youtube" ? (
              // a wide thumbnail, shown whole on a blurred copy of itself
              <>
                <img src={f.cover} alt="" aria-hidden className="absolute inset-0 h-full w-full scale-110 object-cover blur-xl" />
                <img src={f.cover} alt="" loading="lazy" onError={() => setBroken(true)} className="absolute inset-0 h-full w-full object-contain" />
              </>
            ) : (
              <img src={f.cover} alt="" loading="lazy" onError={() => setBroken(true)} className="absolute inset-0 h-full w-full object-cover" />
            )
          ) : (
            <span className="absolute inset-0 flex items-center justify-center bg-muted">
              <PlatformIcon p={f.platform} className="h-10 w-10 text-muted-foreground/50" />
            </span>
          )}
          <span className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/60 to-transparent" />
          <span className="absolute left-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur" title={name}>
            <PlatformIcon p={f.platform} className="h-3.5 w-3.5" />
          </span>
          {f.views !== null && <span className="absolute bottom-2 left-2 text-[11px] font-semibold text-white drop-shadow">{compactNum(f.views)} views</span>}
        </span>
      </a>
      <span className="mt-2 block space-y-0.5 px-0.5">
        <span className="line-clamp-2 break-words text-xs leading-snug text-foreground">{words}</span>
        {f.ratio !== null && f.ratio >= 3 && <span className="block text-[11px] font-semibold text-primary">{Math.round(f.ratio)}x their followers</span>}
        <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="truncate">{f.author ?? name}</span>
          {age && (
            <>
              <span aria-hidden className="h-1 w-1 shrink-0 rounded-full bg-current opacity-60" />
              <span className="shrink-0">{age}</span>
            </>
          )}
        </span>
      </span>
      {/* Save drops to its own line on a phone, and wherever "Saved" with its board chevron doesn't fit */}
      <span className="mt-auto flex flex-wrap items-center gap-1.5 pt-2">
        <RemixButton source={sourceFor(f)} label={`${f.author ?? name}'s video`} className="flex-1">
          <Button asChild variant="outline" size="sm" className="flex-1">
            <Link to={remixUrlFor(f)}>Remix</Link>
          </Button>
        </RemixButton>
        <Button asChild variant="ghost" size="sm" className="shrink-0 px-2">
          <a href={f.url} target="_blank" rel="noopener noreferrer" aria-label={`Open on ${name}`}>
            <ExternalLink className="h-4 w-4" />
          </a>
        </Button>
        <SaveButton source={sourceFor(f)} className="basis-full sm:basis-auto" />
      </span>
    </div>
  );
}

export default function ViralSearch({ userId }: { userId: string }) {
  const [text, setText, q] = useUrlSearch("q");
  const update = useUrlUpdate();
  const [platform, setPlatform] = useUrlState<PlatformChip>("platform", "all", { allowed: PLATFORM_CHIPS });
  const [sort, setSort] = useUrlState<SearchSort>("sort", "reach", { allowed: SEARCH_SORTS.map((s) => s.value) });
  const [posted, setPosted] = useUrlState<Posted>("posted", "90d", { allowed: POSTED.map((p) => p.value) });
  const [showLess, setShowLess] = useState(false);
  // the job and the store live outside React: re-read both whenever either moves
  const [, setTick] = useState(0);
  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    const offJob = onViralSearch(bump);
    const offStore = onViralSearchChanged(bump);
    return () => {
      offJob();
      offStore();
    };
  }, []);
  useEffect(() => setShowLess(false), [q]);

  const words = text.replace(/\s+/g, " ").trim();
  const searching = Boolean(q) && isSearching(q);
  const left = useUsesLeft(searching)("viral-search");
  const why = reasonText({ left, leo: true });
  const shown = q ? findSearch(userId, q) : null;
  const failure = q && !searching ? searchFailure(q) : null;
  const again = Boolean(shown) && sameQ(shown!.q, words);
  const recent = loadViralSearches(userId).searches;
  const tries = recent.length ? [] : brandFacts(userId).topics.slice(0, 3);
  const valid = words.length >= Q_MIN && words.length <= Q_MAX;

  const go = (force: boolean) => {
    if (!valid || left === 0 || isSearching(words)) return;
    update({ q: words });
    void runSearch(userId, words, force);
  };

  // what the grid shows: platform, then period, then sort, then Jev's split
  const all = shown?.results ?? [];
  const counts = { all: 0, tiktok: 0, youtube: 0 };
  const inTime = all.filter((f) => inPeriod(f, posted));
  for (const f of inTime) {
    counts.all++;
    counts[f.platform]++;
  }
  const mine = all.filter((f) => platform === "all" || f.platform === platform);
  const older = mine.length - mine.filter((f) => inPeriod(f, posted)).length;
  const { relevant, less } = splitRelevant(sortFound(mine.filter((f) => inPeriod(f, posted)), sort));
  const failedNotes = shown
    ? (Object.entries(shown.failed) as [SearchPlatform, string][]).map(([p, reason]) => {
        const other = platformName(p === "tiktok" ? "youtube" : "tiktok");
        return `${platformName(p)} ${reason}, so these are ${other} only. Search again to try ${platformName(p)}.`;
      })
    : [];

  return (
    <div className="space-y-4">
      <Card className="border-border/60 shadow-card">
        <CardContent className="space-y-3 pt-5">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              go(again);
            }}
          >
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={text}
                maxLength={Q_MAX}
                onChange={(e) => setText(e.target.value)}
                placeholder="Search TikTok and YouTube (e.g. CPF, first job, insurance myths)"
                aria-label="Search public posts"
                className="pl-9 [@media(pointer:coarse)]:h-11"
              />
            </div>
            <Button type="submit" variant={again && !searching ? "outline" : "default"} disabled={!valid || left === 0 || isSearching(words)} className="shrink-0 gap-1.5 [@media(pointer:coarse)]:h-11">
              {isSearching(words) ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
              {isSearching(words) ? "Searching..." : again ? "Search again" : "Search"}
            </Button>
          </form>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {!searching && <PriceChip feature="viral-search" left={left} />}
            {why && <span className="text-xs text-destructive">{why}</span>}
            {words.length === 1 && <span className="text-xs text-muted-foreground">Type at least {Q_MIN} characters.</span>}
            {words.length > Q_MAX && <span className="text-xs text-muted-foreground">Keep it to {Q_MAX} characters or fewer.</span>}
          </div>

          {failure && (
            <div className="flex flex-wrap items-center gap-2 text-sm" role="alert">
              <span className="text-destructive">{failure.message}</span>
              {!FINAL.includes(failure.code) && (
                <Button type="button" variant="outline" size="sm" onClick={() => go(true)} disabled={!valid || left === 0}>
                  Try again
                </Button>
              )}
            </div>
          )}

          {recent.length > 0 && (
            <div className="scrollbar-none flex items-center gap-1.5 overflow-x-auto">
              <span className="shrink-0 text-xs font-semibold text-muted-foreground">Recent</span>
              {recent.map((s) => (
                <Chip key={s.q} active={sameQ(s.q, q)} onClick={() => update({ q: s.q })}>
                  {s.q}
                </Chip>
              ))}
            </div>
          )}
          {tries.length > 0 && !q && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-semibold text-muted-foreground">Try</span>
              {tries.map((t) => (
                <Chip key={t} active={false} onClick={() => setText(t)}>
                  {t}
                </Chip>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {searching && (
        <Card className="border-border/60 shadow-card">
          <CardContent className="space-y-1.5 py-4 text-sm" aria-live="polite">
            {(["tiktok", "youtube"] as const).map((p) => (
              <p key={p} className="flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                {platformName(p)}: searching
              </p>
            ))}
            <p className="text-xs text-muted-foreground">This takes about a minute. You can leave this page.</p>
          </CardContent>
        </Card>
      )}

      {shown && !searching && (
        <section className="space-y-3" aria-label="Search results">
          <p className="text-xs text-muted-foreground">Searched {ago(shown.at)}.</p>
          {failedNotes.map((n) => (
            <p key={n} className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-foreground" role="status">
              {n}
            </p>
          ))}

          {all.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nothing found for "{shown.q}". Try a shorter phrase or a single word.</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  {PLATFORM_CHIPS.map((p) => (
                    <Chip key={p} active={platform === p} onClick={() => setPlatform(p)} count={counts[p]}>
                      {p === "all" ? "All" : platformName(p)}
                    </Chip>
                  ))}
                </div>
                <span className="flex flex-wrap items-center gap-2 sm:ml-auto">
                  <Select label="Sort" value={sort} onChange={setSort} options={SEARCH_SORTS} />
                  <Select label="Posted" value={posted} onChange={setPosted} options={POSTED} />
                </span>
              </div>

              {relevant.length > 0 && (
                <div className="grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 lg:grid-cols-4">
                  {relevant.map((f) => (
                    <ResultCard key={f.id} f={f} />
                  ))}
                </div>
              )}
              {less.length > 0 &&
                (showLess ? (
                  <div className="grid grid-cols-2 gap-x-3 gap-y-5 border-t border-border/60 pt-4 sm:grid-cols-3 lg:grid-cols-4">
                    {less.map((f) => (
                      <ResultCard key={f.id} f={f} />
                    ))}
                  </div>
                ) : (
                  <div className="flex justify-center">
                    <Button variant="outline" onClick={() => setShowLess(true)} className="gap-1.5 [@media(pointer:coarse)]:h-11">
                      <ChevronDown className="h-4 w-4" /> Show {less.length} less relevant
                    </Button>
                  </div>
                ))}
              {older > 0 && (
                <p className="text-center text-xs text-muted-foreground">
                  {older} posted before the {POSTED.find((p) => p.value === posted)!.label.toLowerCase()}.{" "}
                  <button type="button" onClick={() => setPosted("any")} className="font-semibold text-primary hover:underline [@media(pointer:coarse)]:py-3">
                    Show any time
                  </button>
                </p>
              )}
            </>
          )}
        </section>
      )}
    </div>
  );
}
