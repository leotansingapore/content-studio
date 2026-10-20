// Their ads (/competitors, the default view once a competitor exists; docs/north-star/items/find-competitor-ads.md):
// every watched competitor's Meta ads as cards, the pills and count line, a reason for each competitor with none,
// and the weekly check (opening the view checks whatever is 7+ days old). Checks run outside React in
// src/lib/competitorAds.ts; this only draws their state. ?c= is the pill, ?running=only the filter, ?ad= opens an
// ad's drawer (find-ad-detail) and marks its card.
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, ExternalLink, ImageOff, Loader2, PenLine, Play, RefreshCw } from "lucide-react";
import AdDetailDrawer, { LoadingAdDrawer, useLinkedAd } from "@/components/AdDetailDrawer";
import PriceChip from "@/components/PriceChip";
import SaveButton from "@/components/SaveButton";
import RemixButton from "@/components/remix/RemixButton";
import { Button } from "@/components/ui/button";
import { FilterChip } from "@/components/ui/filter-chip";
import { useUsesLeft } from "@/lib/aiUsage";
import { titleOf, toDetailAd } from "@/lib/adDetail";
import { competitorLibraryAd, loadAdLabels } from "@/lib/adLibrary";
import { buildAdWriteUrl } from "@/lib/adsSwipe";
import {
  type CompetitorAd, type CompetitorAdsState, adsCheckFailure, adsCountryOf, adsStopped, adsTally, canReadAds, checkingAnyAds, dueAds, isCheckingAds, libraryUrl,
  onCompetitorAds, platformNames, runAdsCheck, runDueAds, runLabel, runningLine, toAdLike,
} from "@/lib/competitorAds";
import { type Competitor, updateCompetitor } from "@/lib/competitors";
import { links } from "@/lib/links";
import { priceOf, reasonText, sumPrices } from "@/lib/prices";
import { fromAd } from "@/lib/remixSource";
import { useScrollToItem, useUrlFlag, useUrlState } from "@/lib/urlState";

const TOUCH = "[@media(pointer:coarse)]:min-h-11";
const PAGE = 20;
const FORMAT: Record<CompetitorAd["format"], string> = { image: "Image", video: "Video", carousel: "Carousel", text: "Text" };
/** Refusals for the whole account (shown once, under Check now), not for one competitor. */
const ACCOUNT_WIDE = [403, 429, 503];

type Note = { c: Competitor; text: string; action: string; run: () => void };

export default function TheirAds({ userId, list, store, openEdit }: {
  userId: string;
  list: Competitor[];
  store: CompetitorAdsState;
  openEdit: (id: string) => void;
}) {
  const [, tick] = useState(0);
  const [c, setC] = useUrlState<string>("c", "all");
  const [runningOnly, setRunningOnly] = useUrlFlag("running");
  const [limit, setLimit] = useState(PAGE);
  const busy = checkingAnyAds();
  const left = useUsesLeft(busy)("competitor-ads");
  // every stored ad once, for the drawer and its rank among the advertiser's ads
  const detail = useMemo(() => {
    const labels = loadAdLabels(userId);
    const seen = new Set<string>();
    return list.flatMap((x) => ((canReadAds(x) && store[x.id]?.ads) || [])
      .filter((ad) => !seen.has(ad.id) && seen.add(ad.id))
      .map((ad) => toDetailAd({ ...competitorLibraryAd(ad, x, labels[ad.id]), complete: store[x.id].complete === true })));
  }, [userId, list, store]);
  // an empty store may still be syncing, and a check may still bring the ad: the drawer waits for either
  const linkedAd = useLinkedAd(detail, busy || !Object.keys(store).length);
  const linked = linkedAd.id;

  useEffect(() => onCompetitorAds(() => tick((n) => n + 1)), []);
  // opening the view, and any change to the list while it is open (an add, a page found), checks what is 7+ days old
  useEffect(() => {
    void runDueAds(userId);
  }, [userId, list]);

  const selected = list.find((x) => x.id === c) ?? null;
  const tally = adsTally(list, store);
  // each competitor's ads, new ones first; under All taken in turn, so everyone shows near the top
  const queues = (selected ? [selected] : tally.map((t) => list.find((x) => x.id === t.id)!))
    .filter((x) => canReadAds(x) && store[x.id])
    .map((x) => store[x.id].ads
      .filter((ad) => !runningOnly || ad.active)
      .map((ad) => ({ ad, c: x, fresh: store[x.id].fresh.includes(ad.id) }))
      .sort((p, q) => Number(q.fresh) - Number(p.fresh)));
  const cards: (typeof queues)[number] = [];
  for (let i = 0; queues.some((q) => i < q.length); i++) for (const q of queues) if (i < q.length) cards.push(q[i]);

  if (!list.length) {
    return (
      <p className="text-sm text-muted-foreground">
        Add a competitor to see their ads here. <Link to={links.competitors({ view: "list" })} className="font-medium text-primary hover:underline">Who you watch</Link>
      </p>
    );
  }

  const scope = selected ? [selected] : list;
  const total = tally.reduce((n, t) => n + t.n, 0);
  const counted = selected ? tally.filter((t) => t.id === selected.id) : tally;
  const n = counted.reduce((s, t) => s + t.n, 0);
  const running = counted.reduce((s, t) => s + t.running, 0);
  const at = cards.findIndex((x) => x.ad.id === linked);
  const shown = cards.slice(0, Math.max(limit, at + 1));
  const reading = scope.find((x) => isCheckingAds(x.id));
  const skeletons = scope.some((x) => isCheckingAds(x.id) && !store[x.id]?.ads.length);

  const lookAnywhere = (x: Competitor) => {
    const next = updateCompetitor(userId, x.id, { adsCountry: "ALL" });
    if (next) void runAdsCheck(userId, next);
  };
  const notes: Note[] = scope.flatMap((x): Note[] => {
    if (!canReadAds(x)) return [{ c: x, text: `Add ${x.name}'s Facebook page to see their ads.`, action: "Add their page", run: () => openEdit(x.id) }];
    const f = adsCheckFailure(x.id);
    if (f && !ACCOUNT_WIDE.includes(f.status)) {
      return f.code === "not_found"
        ? [{ c: x, text: `${x.name}: ${f.message}`, action: "Edit", run: () => openEdit(x.id) }]
        : [{ c: x, text: `${x.name}: ${f.message}`, action: "Try again", run: () => void runAdsCheck(userId, x) }];
    }
    const e = store[x.id];
    if (e && !e.ads.length && adsCountryOf(x, e) === "SG" && !isCheckingAds(x.id)) {
      return [{ c: x, text: `${x.name} has no Meta ads in Singapore right now.`, action: "Look anywhere", run: () => lookAnywhere(x) }];
    }
    return [];
  });
  const none = scope.filter((x) => canReadAds(x) && store[x.id] && !store[x.id].ads.length && adsCountryOf(x, store[x.id]) === "ALL" && !adsCheckFailure(x.id));

  // Check now: the picked competitor, or every due one under All
  const due = selected ? (canReadAds(selected) ? [selected] : []) : dueAds(userId);
  const checkNow = () => (selected ? void runAdsCheck(userId, selected) : void runDueAds(userId, true));
  const why = reasonText({ left, leo: true }) ?? (!selected && !due.length ? "Everyone was checked in the last 7 days. Pick one to check it again." : null);
  const stopped = adsStopped();

  return (
    <section className="space-y-4" aria-labelledby="their-ads">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h2 id="their-ads" className="font-serif text-lg font-semibold tracking-tight">Their ads</h2>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums text-muted-foreground">{total}</span>
          {n > 0 && (
            <Link to={links.swipe({ tab: "ads", scope: selected?.id })} className={`ml-auto inline-flex items-center text-xs font-semibold text-primary hover:underline ${TOUCH}`}>
              {n} ads | {running} running <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          )}
        </div>
        {tally.length > 0 && <p className="text-sm text-muted-foreground">{runningLine(tally.map((t) => t.name))}</p>}
      </div>

      {(tally.length > 0 || runningOnly) && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Competitor">
          <FilterChip active={!selected} onClick={() => { setC("all"); setLimit(PAGE); }} count={total}>All</FilterChip>
          {tally.map((t) => (
            <FilterChip key={t.id} active={selected?.id === t.id} onClick={() => { setC(t.id); setLimit(PAGE); }} count={t.n}>{t.name}</FilterChip>
          ))}
          <FilterChip active={runningOnly} onClick={() => { setRunningOnly(!runningOnly); setLimit(PAGE); }}>Running now</FilterChip>
        </div>
      )}
      {none.length > 0 && <p className="text-xs text-muted-foreground">Not running Meta ads: {none.map((x) => x.name).join(", ")}</p>}

      {notes.length > 0 && (
        <ul className="space-y-1.5">
          {notes.map((note) => (
            <li key={note.c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              <span className={note.action === "Try again" || note.action === "Edit" ? "text-destructive" : "text-muted-foreground"}>{note.text}</span>
              <Button size="sm" variant="outline" className={`h-8 ${TOUCH}`} onClick={note.run} disabled={note.action === "Look anywhere" && busy}>{note.action}</Button>
            </li>
          ))}
        </ul>
      )}

      {(shown.length > 0 || skeletons) && (
        <div className="grid grid-cols-2 items-start gap-x-3 gap-y-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {skeletons && Array.from({ length: 4 }, (_, k) => <SkeletonCard key={`s${k}`} />)}
          {/* two rows can watch one page, so an ad id alone isn't unique */}
          {shown.map((x) => <AdCard key={`${x.c.id}:${x.ad.id}`} ad={x.ad} c={x.c} fresh={x.fresh} linked={x.ad.id === linked} onOpen={() => linkedAd.open(x.ad.id)} />)}
        </div>
      )}
      {cards.length > shown.length && (
        <div className="flex justify-center">
          <Button variant="outline" className={`h-10 ${TOUCH}`} onClick={() => setLimit(shown.length + PAGE)}>
            Show {Math.min(PAGE, cards.length - shown.length)} more of {cards.length - shown.length}
          </Button>
        </div>
      )}
      {runningOnly && !shown.length && n > 0 && <p className="text-sm text-muted-foreground">None of these ads is running now.</p>}

      <div className="space-y-2 border-t border-border/60 pt-4">
        {reading && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground" aria-live="polite">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading {reading.name}'s ads, about a minute...
          </p>
        )}
        {stopped && !busy && <p role="alert" className="text-xs text-destructive">{stopped.message}</p>}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <p className="mr-auto text-xs text-muted-foreground">We check for new Meta ads once a week, when you open Competitors.</p>
          <div className="flex items-center gap-3">
            <Button variant="outline" className={`h-10 gap-2 ${TOUCH}`} onClick={checkNow} disabled={busy || Boolean(why) || !due.length}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Check now
            </Button>
            {!busy && due.length > 0 && (
              <PriceChip feature="competitor-ads" price={due.length > 1 ? sumPrices(...due.map(() => priceOf("competitor-ads"))) : undefined} uses={due.length} left={left} />
            )}
          </div>
        </div>
        {why && !busy && <p className="text-xs text-muted-foreground">{why}</p>}
      </div>

      {linkedAd.loading && <LoadingAdDrawer onClose={linkedAd.close} />}
      {linkedAd.ad && <AdDetailDrawer key={linkedAd.ad.id} ad={linkedAd.ad} list={detail} onClose={linkedAd.close} />}
    </section>
  );
}

function Avatar({ c }: { c: Competitor }) {
  const [broken, setBroken] = useState(false);
  return c.logo && !broken ? (
    <img src={c.logo} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} className="h-5 w-5 shrink-0 rounded bg-background object-contain" />
  ) : (
    <span aria-hidden className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-secondary text-[9px] font-semibold text-muted-foreground">
      {c.name.slice(0, 1).toUpperCase()}
    </span>
  );
}

function SkeletonCard() {
  return (
    <div aria-hidden className="overflow-hidden rounded-xl border border-border/60">
      <div className="aspect-[4/5] animate-pulse bg-muted" />
      <div className="space-y-2 p-3">
        <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
        <div className="h-3 w-full animate-pulse rounded bg-muted" />
      </div>
    </div>
  );
}

function AdCard({ ad, c, fresh, linked, onOpen }: { ad: CompetitorAd; c: Competitor; fresh: boolean; linked: boolean; onOpen(): void }) {
  // Meta's picture links expire: a dead one shows "No preview" until the next weekly check brings a fresh link
  const [broken, setBroken] = useState(false);
  const ref = useScrollToItem<HTMLElement>(linked);
  const like = toAdLike(ad, c.name);
  const source = fromAd(like);
  const pic = Boolean(ad.image) && !broken;
  const line = [runLabel(ad), platformNames(ad.platforms)].filter(Boolean).join(" | ");
  const title = titleOf(ad);
  return (
    <article ref={ref} className={`flex min-w-0 flex-col overflow-hidden rounded-xl border bg-card shadow-card ${linked ? "border-primary ring-2 ring-primary/30" : "border-border/60"}`}>
      {/* the picture and the words open the ad's drawer (find-ad-detail); the buttons below keep their own jobs */}
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
          <span className="absolute left-2 top-2 flex gap-1 text-[10px] font-semibold">
            <span className="rounded-full bg-background/90 px-2 py-0.5 text-foreground">{FORMAT[ad.format]}</span>
            {fresh && <span className="rounded-full bg-primary px-2 py-0.5 text-primary-foreground">New</span>}
          </span>
        </span>
        <span className="block space-y-1.5 px-3 pt-3">
          <span className="flex min-w-0 items-center gap-1.5 text-[11px] font-medium">
            <Avatar c={c} /> <span className="truncate">{c.name}</span>
          </span>
          {title && <span className="line-clamp-1 text-xs font-semibold group-hover:underline">{title}</span>}
          {ad.body && ad.headline && <span className="line-clamp-2 text-xs text-muted-foreground">{ad.body}</span>}
          {line && <span className="block text-[11px] text-muted-foreground">{line}</span>}
        </span>
      </button>
      <div className="flex flex-1 flex-col px-3 pb-3">
        <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1.5">
          <RemixButton source={source} label={`${c.name}'s ad`}>
            <Button asChild size="sm" variant="outline" className="h-9 gap-1.5">
              <Link to={buildAdWriteUrl(like)}><PenLine className="h-3.5 w-3.5" /> Write a post like this</Link>
            </Button>
          </RemixButton>
          <SaveButton source={source} />
          <Button asChild size="sm" variant="ghost" className={`h-9 gap-1.5 px-2 ${TOUCH}`}>
            <a href={libraryUrl(ad.id)} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-3.5 w-3.5" /> Open on Meta</a>
          </Button>
        </div>
      </div>
    </article>
  );
}
