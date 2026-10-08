import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ExternalLink, PenLine, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FilterChip } from "@/components/ui/filter-chip";
import { safeExternalUrl } from "@/lib/embed";
import { ADS, buildAdWriteUrl, daysRunning, facetCounts, searchAds, type SwipeAd } from "@/lib/adsSwipe";

const ASPECT: Record<string, string> = { video: "aspect-[4/5]", carousel: "aspect-square", image: "aspect-[4/5]" };

function AdCard({ ad }: { ad: SwipeAd }) {
  const [open, setOpen] = useState(false);
  const days = daysRunning(ad);
  const long = ad.body.length > 220;
  return (
    <article className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-border/60 bg-card shadow-card">
      <a href={safeExternalUrl(ad.libraryUrl) ?? undefined} target="_blank" rel="noopener noreferrer" tabIndex={-1} aria-hidden="true"
        className={`block overflow-hidden bg-muted ${ASPECT[ad.format] ?? "aspect-[4/5]"}`}>
        <img src={ad.image} alt="" loading="lazy" className="h-full w-full object-cover" />
      </a>
      <div className="flex flex-1 flex-col gap-2.5 p-4">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-medium text-muted-foreground">
          <span className="truncate text-foreground">{ad.advertiser}</span>
          <span aria-hidden className="h-1 w-1 rounded-full bg-current opacity-60" />
          <span>{ad.industry}</span>
          {days !== null && <span className="rounded-full bg-muted px-2 py-0.5 text-[10px]">Running {days} days</span>}
        </p>
        <p className="flex flex-wrap gap-1.5 text-[10px] font-semibold">
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary">{ad.hookFamily} hook</span>
          <span className="rounded-full bg-muted px-2 py-0.5 capitalize text-muted-foreground">{ad.format}</span>
        </p>
        {ad.headline && <h3 className="font-serif text-base font-semibold leading-snug text-foreground">{ad.headline}</h3>}
        <p className={`whitespace-pre-line text-xs leading-relaxed text-muted-foreground ${open ? "" : "line-clamp-4"}`}>{ad.body}</p>
        {long && (
          <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
            className="inline-flex min-h-9 items-center self-start py-1 text-xs font-semibold text-primary hover:underline sm:min-h-0">
            {open ? "Show less" : "Read the whole ad"}
          </button>
        )}
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
          <Button asChild size="sm" className="flex-1 gap-1.5 bg-gradient-primary text-primary-foreground shadow-sm hover:opacity-95">
            <Link to={buildAdWriteUrl(ad)}>
              <PenLine className="h-3.5 w-3.5" /> Write a post like this
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="gap-1.5">
            <a href={safeExternalUrl(ad.libraryUrl) ?? undefined} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-3.5 w-3.5" /> Ad Library
            </a>
          </Button>
        </div>
      </div>
    </article>
  );
}

export default function AdsSwipe() {
  const [query, setQueryRaw] = useState("");
  const [industry, setIndustryRaw] = useState("all");
  const [limit, setLimit] = useState(12);
  const found = useMemo(() => searchAds(ADS, query), [query]);
  const industries = useMemo(() => facetCounts(found, "industry"), [found]);
  const shown = industry === "all" || !industries.some((i) => i.value === industry) ? found : found.filter((a) => a.industry === industry);
  const setIndustry = (v: string) => { setIndustryRaw(v); setLimit(12); };
  const setQuery = (q: string) => { setQueryRaw(q); setLimit(12); };

  if (ADS.length === 0) {
    return (
      <Card className="border-border/60 shadow-card">
        <CardContent className="py-10 text-center text-sm text-muted-foreground">No ads yet. They arrive with the next weekly update.</CardContent>
      </Card>
    );
  }
  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search the ads (e.g. Singlife, offer, travel)"
          aria-label="Search ads" className="pl-9" />
      </div>
      {industries.length > 1 && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Industry">
          <FilterChip active={industry === "all"} onClick={() => setIndustry("all")} count={found.length}>All</FilterChip>
          {industries.map((i) => (
            <FilterChip key={i.value} active={industry === i.value} onClick={() => setIndustry(i.value)} count={i.n}>{i.value}</FilterChip>
          ))}
        </div>
      )}
      {shown.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No ads match.{" "}
          <button type="button" className="font-semibold text-primary" onClick={() => { setQuery(""); setIndustry("all"); }}>Clear the search</button>
        </p>
      ) : (
        <>
          <div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {shown.slice(0, limit).map((a) => <AdCard key={a.adId} ad={a} />)}
          </div>
          {shown.length > limit && (
            <div className="flex justify-center">
              <button type="button" onClick={() => setLimit((n) => n + 12)}
                className="h-10 rounded-lg border border-border/70 px-4 text-sm font-semibold hover:border-primary/40">
                Show {Math.min(12, shown.length - limit)} more of {shown.length - limit}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
