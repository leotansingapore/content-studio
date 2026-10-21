// Formats on /trends (?view=formats, Leo only; docs/north-star/items/find-trending-formats.md): the trending TikTok
// slideshows and walls of text the weekly format scout writes to src/data/formatTrends.json. No calls: Remix this only
// builds a link to the format's own page, so it navigates at once. kind filters (replace); template opens a card in
// place (push), so a link or a reload lands on it and Back closes it. An unknown template id is dropped quietly.
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AlignLeft, ExternalLink, GalleryHorizontal, Wand2, X } from "lucide-react";
import CopyLinkButton from "@/components/CopyLinkButton";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FilterChip as Chip } from "@/components/ui/filter-chip";
import { InfoTip } from "@/components/ui/info-tip";
import { safeExternalUrl } from "@/lib/embed";
import { currentFormatTrends, formatRemixUrl, formatTag, kindCounts, type FormatTrend, type FormatTrendKind } from "@/lib/formatTrends";
import { links } from "@/lib/links";
import { dayMonth, fromFormatTrend, rememberSource } from "@/lib/remixSource";
import { compactNum } from "@/lib/topPosts";
import { useUrlItem, useUrlState } from "@/lib/urlState";
import { cn } from "@/lib/utils";

const KINDS: readonly FormatTrendKind[] = ["slideshow", "wall-of-text"];
const KIND_LABELS: Record<FormatTrendKind, string> = { slideshow: "Slideshows", "wall-of-text": "Walls of text" };

function Cover({ t, className }: { t: FormatTrend; className?: string }) {
  const [broken, setBroken] = useState(false);
  const Icon = t.kind === "slideshow" ? GalleryHorizontal : AlignLeft;
  return broken ? (
    <span className={cn("flex flex-col items-center justify-center gap-1 bg-muted text-xs text-muted-foreground", className)}>
      <Icon className="h-6 w-6" aria-hidden />
      No preview
    </span>
  ) : (
    <img src={t.cover} alt="" loading="lazy" onError={() => setBroken(true)} className={cn("bg-muted object-cover", className)} />
  );
}

function RemixThis({ t, userId, className }: { t: FormatTrend; userId: string; className?: string }) {
  return (
    <Button asChild size="sm" className={cn("gap-1.5 bg-gradient-primary text-primary-foreground shadow-sm hover:opacity-95 [@media(pointer:coarse)]:h-11", className)}>
      <Link to={formatRemixUrl(t)} onClick={() => rememberSource(fromFormatTrend(t), userId)}>
        <Wand2 className="h-3.5 w-3.5" /> Remix this
      </Link>
    </Button>
  );
}

const Tag = ({ t }: { t: FormatTrend }) => (
  <span className="w-fit rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
    {formatTag(t)}
  </span>
);

const Numbers = ({ t }: { t: FormatTrend }) => (
  <p className="flex flex-wrap gap-x-2 text-xs tabular-nums text-muted-foreground">
    <span>{compactNum(t.views)} views</span>
    <span>{compactNum(t.likes)} likes</span>
  </p>
);

function FormatCard({ t, userId, onOpen }: { t: FormatTrend; userId: string; onOpen: () => void }) {
  return (
    <li className="flex min-w-0 flex-col gap-2 rounded-lg border border-border/60 bg-card p-2 shadow-card">
      <Tag t={t} />
      <button type="button" onClick={onOpen} aria-label={`Open ${formatTag(t)}: ${t.hook}`} className="block overflow-hidden rounded-md">
        <Cover t={t} className="aspect-[3/4] w-full" />
      </button>
      <p className="truncate text-xs text-foreground">{t.caption || t.hook}</p>
      <Numbers t={t} />
      <RemixThis t={t} userId={userId} className="mt-auto w-full" />
    </li>
  );
}

function OpenCard({ t, userId, onClose }: { t: FormatTrend; userId: string; onClose: () => void }) {
  const ref = useRef<HTMLLIElement>(null);
  // a link to this card lands on it, not on the top of the page
  useEffect(() => {
    // braces: newer Chromium returns a Promise from scrollIntoView, which React would call as a clean-up
    ref.current?.scrollIntoView({ block: "nearest" });
  }, [t.id]);
  const tiktok = safeExternalUrl(t.url);
  return (
    <li ref={ref} id={`format-${t.id}`} className="col-span-full scroll-mt-20 rounded-lg border border-primary/30 bg-card p-3 shadow-card">
      <div className="flex flex-col gap-4 sm:flex-row">
        <Cover t={t} className="aspect-[3/4] w-full max-w-[16rem] self-center rounded-md sm:self-start" />
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <Tag t={t} />
            <Button variant="ghost" size="sm" onClick={onClose} className="-mr-1 -mt-1 gap-1 [@media(pointer:coarse)]:h-11">
              <X className="h-3.5 w-3.5" /> Close
            </Button>
          </div>
          <p className="break-words text-sm text-foreground">{t.caption || t.hook}</p>
          <Numbers t={t} />
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {t.kind === "slideshow" ? "What each slide does" : "What each part does"}
            </p>
            <ol className="list-decimal space-y-1 pl-5 text-sm text-foreground/85">
              {t.structure.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ol>
          </div>
          <p className="text-xs text-muted-foreground">
            Posted {dayMonth(t.postedAt)}
            {t.author ? ` by @${t.author}` : ""}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <RemixThis t={t} userId={userId} className="flex-1 sm:flex-none" />
            {tiktok && (
              <Button asChild variant="outline" size="sm" className="gap-1.5 [@media(pointer:coarse)]:h-11">
                <a href={tiktok} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-3.5 w-3.5" /> Open on TikTok
                </a>
              </Button>
            )}
            <CopyLinkButton path={links.trends({ view: "formats", template: t.id })} label="Copy link to this format" />
          </div>
        </div>
      </div>
    </li>
  );
}

export default function FormatTrends({ userId, onKits }: { userId: string; onKits: () => void }) {
  const all = useMemo(() => currentFormatTrends(), []);
  const counts = kindCounts(all);
  const [kind, setKind] = useUrlState<FormatTrendKind | "all">("kind", "all", { allowed: KINDS });
  const [openId, open, close] = useUrlItem("template");
  const known = all.some((t) => t.id === openId);
  // bundled data: an id that isn't in this week's drop is dropped without a word (the spec's rule)
  useEffect(() => {
    if (openId && !known) close();
  }, [openId, known, close]);
  // the open card stays shown under any filter, so a link always lands on it
  const shown = all.filter((t) => kind === "all" || t.kind === kind || t.id === openId);

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-1.5">
        <p className="text-sm text-muted-foreground">Trending slideshows and walls of text, re-checked every Monday.</p>
        <InfoTip label="About formats">Picked for their shape. Remix keeps the slides and their jobs and writes your own words.</InfoTip>
      </div>

      {all.length === 0 ? (
        <Card className="border-border/60 shadow-card">
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <p className="text-sm text-muted-foreground">No formats this week. They arrive with Monday's update.</p>
            <Button variant="outline" size="sm" onClick={onKits} className="[@media(pointer:coarse)]:h-11">
              See trend kits
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by format">
            <Chip active={kind === "all"} count={counts.all} onClick={() => setKind("all")}>
              All
            </Chip>
            {KINDS.map((k) => (
              <Chip key={k} active={kind === k} count={counts[k]} disabled={kind !== k && counts[k] === 0} onClick={() => setKind(k)}>
                {KIND_LABELS[k]}
              </Chip>
            ))}
          </div>
          {shown.length === 0 ? (
            <Card className="border-border/60 shadow-card">
              <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
                <p className="text-sm text-muted-foreground">No formats of that kind this week.</p>
                <Button variant="outline" size="sm" onClick={() => setKind("all")} className="[@media(pointer:coarse)]:h-11">
                  Show all
                </Button>
              </CardContent>
            </Card>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {shown.map((t) =>
                t.id === openId ? (
                  <OpenCard key={t.id} t={t} userId={userId} onClose={close} />
                ) : (
                  <FormatCard key={t.id} t={t} userId={userId} onOpen={() => open(t.id)} />
                ),
              )}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
