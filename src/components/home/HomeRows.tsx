// Leo's Home under "Ask the agent for", after Fastlane's Home (read live 11 Nov 2026): Recent creations, Start from a
// format, Remix a competitor ad, and Publish and promote. AgentHome loads this chunk lazily, so Home paints and the
// composer works before any row reads. The rows are views over props; the default export reads this device's stores
// and AdLauncher's connection row (our own function's status, which never calls AdLauncher). No AI call.
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { CalendarDays, ChevronRight, Clapperboard, Image as ImageIcon, ImageOff, Layers, Megaphone, Type, type LucideIcon } from "lucide-react";
import LibraryThumb, { readThumbSources, useFontsReady, useOnScreen, type ThumbSources } from "@/components/library/LibraryThumb";
import RemixButton from "@/components/remix/RemixButton";
import { Button } from "@/components/ui/button";
import { FORMATS, formatHref, type FormatDef, type FormatKind } from "@/data/formats";
import { STATIC_FORMATS, staticFormatHref, type StaticFormat } from "@/data/staticFormats";
import { adlStatus, loadLaunches, type AdlStatus } from "@/lib/adlauncher";
import { type CompetitorAd, type CompetitorAdsState, canReadAds, loadCompetitorAds, runLabel, toAdLike } from "@/lib/competitorAds";
import { type Competitor, loadCompetitors } from "@/lib/competitors";
import { loadCarousels } from "@/lib/carousel";
import { loadDesigns } from "@/lib/design";
import { draftStatus, type DraftEntry } from "@/lib/draftHistory";
import { localDateKey } from "@/lib/dueDates";
import { loadImages, onImagesChanged } from "@/lib/images";
import { STATUS_LABELS, buildLibrary, statusLine, type LibraryItem } from "@/lib/library";
import { links } from "@/lib/links";
import { loadMedia } from "@/lib/mediaLibrary";
import { fromAd } from "@/lib/remixSource";
import { loadSlideshows, onSlideshowsChanged } from "@/lib/slideshow";
import { useScrollToHash } from "@/lib/urlState";
import { cn } from "@/lib/utils";
import { loadProjects } from "@/lib/videoProjects";

const ROW = 5;
const FORMAT_TILES = 8;
const IDS = ["recent", "formats", "remix-ads", "publish"];
const KIND_ICONS: Record<FormatKind, LucideIcon> = { video: Clapperboard, slides: Layers, text: Type, image: ImageIcon };
const MORE = "inline-flex min-h-9 items-center gap-0.5 rounded-md px-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground [@media(pointer:coarse)]:min-h-11";
// a swipeable strip on phones (the cards peek past the edge), a grid from sm up
const STRIP = "-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 sm:pb-0";
const CELL = "w-[44%] shrink-0 snap-start sm:w-auto";
const TILE = "flex h-full min-h-11 flex-col gap-1.5 rounded-xl border border-border/70 bg-card p-3 transition-colors hover:border-primary/40";

function Row({ id, title, more, children }: { id: string; title: string; more?: { to: string; label: string }; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-20 space-y-2">
      <div className="flex min-h-9 items-center justify-between gap-3">
        <h2 id={`${id}-h`} className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {title}
        </h2>
        {more && (
          <Link to={more.to} className={MORE}>
            {more.label} <ChevronRight className="h-4 w-4" />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

// ---- Recent creations ----

export interface Creation {
  key: string;
  /** "Text", "Carousel", "Slideshow", "Video", "Image", "Design". */
  kind: string;
  status: string;
  title: string;
  /** Its own editor. */
  to: string;
  /** The Library's own item: its thumb and its schedule line. */
  item: LibraryItem;
}

type Stores = Omit<Parameters<typeof buildLibrary>[0], "jobs" | "now">;

/** The brand's newest `n` creations, from the Library's own merge (library.ts): each tile is a Library card's picture, kind, status, title and Open. */
export function recentCreations(stores: Stores, n = ROW): Creation[] {
  return buildLibrary({ ...stores, jobs: [], now: new Date(0) })
    .slice(0, n)
    .map((it) => ({ key: it.key, kind: it.kind, status: STATUS_LABELS[it.status], title: it.title, to: it.href, item: it }));
}

/** One creation: its picture as the Library draws it (given `sources`), its kind and status, and its title. The whole tile opens it. */
export function CreationTile({ c, sources }: { c: Creation; sources?: ThumbSources }) {
  const [ref, seen] = useOnScreen<HTMLSpanElement>();
  return (
    <Link to={c.to} className="group flex h-full min-w-0 flex-col gap-1.5 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      {sources && (
        <span ref={ref} className="block aspect-[4/5] w-full overflow-hidden rounded-xl border border-border/70 bg-muted transition-colors group-hover:border-primary/40">
          <LibraryThumb item={c.item} sources={sources} seen={seen} />
        </span>
      )}
      <span className={cn("flex min-w-0 flex-col gap-1", !sources && TILE)}>
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {c.kind} | {c.status}
        </span>
        <span className="line-clamp-2 text-sm font-medium text-foreground group-hover:underline">{c.title}</span>
        {/* when it goes out or went out; "Not scheduled yet" only repeats Ready */}
        {c.item.when && <span className="text-xs text-muted-foreground">{statusLine(c.item)}</span>}
      </span>
    </Link>
  );
}

export function RecentCreations({ items, sources }: { items: Creation[]; sources?: ThumbSources }) {
  return (
    <Row id="recent" title="Recent creations" more={{ to: links.library(), label: "Library" }}>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing made yet.</p>
      ) : (
        <ul className={cn(STRIP, "lg:grid-cols-5")}>
          {items.map((c) => (
            <li key={c.key} className={CELL}>
              <CreationTile c={c} sources={sources} />
            </li>
          ))}
        </ul>
      )}
    </Row>
  );
}

// ---- Start from a format ----

export interface FormatTile {
  key: string;
  name: string;
  line: string;
  to: string;
  icon: LucideIcon;
}

/** The ready video formats (gallery order) and ready static ads taken in turn, `n` at most. */
export function homeFormats(formats: FormatDef[], statics: StaticFormat[], n = FORMAT_TILES): FormatTile[] {
  const video = formats
    .filter((f) => f.ready)
    .sort((a, b) => a.group - b.group)
    .map((f) => ({ key: f.slug, name: f.name, line: f.blurb, to: formatHref(f), icon: KIND_ICONS[f.kind] }));
  const still = statics.filter((f) => f.ready).map((f) => ({ key: `static-${f.slug}`, name: f.name, line: f.blurb, to: staticFormatHref(f.slug), icon: ImageIcon }));
  return Array.from({ length: Math.max(video.length, still.length) }, (_, i) => [video[i], still[i]])
    .flat()
    .filter((t): t is FormatTile => Boolean(t))
    .slice(0, n);
}

export function StartFromFormat({ tiles }: { tiles: FormatTile[] }) {
  return (
    <Row id="formats" title="Start from a format" more={{ to: links.make(), label: "All formats" }}>
      <ul className={cn(STRIP, "lg:grid-cols-4")}>
        {tiles.map((t) => (
          <li key={t.key} className={CELL}>
            <Link to={t.to} className={TILE}>
              <t.icon className="h-4 w-4 text-primary" aria-hidden />
              <span className="text-sm font-semibold text-foreground">{t.name}</span>
              <span className="line-clamp-2 text-xs text-muted-foreground">{t.line}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Row>
  );
}

// ---- Remix a competitor ad ----

export interface RunningAd {
  ad: CompetitorAd;
  c: Competitor;
}

/** The tracked competitors' running ads, each once, longest running (earliest start) first, `n` at most. */
export function longestRunning(list: Competitor[], store: CompetitorAdsState, n = ROW): RunningAd[] {
  const seen = new Set<string>();
  return list
    .filter(canReadAds)
    .flatMap((c) => (store[c.id]?.ads ?? []).filter((ad) => ad.active && !seen.has(ad.id) && seen.add(ad.id)).map((ad) => ({ ad, c })))
    .sort((a, b) => (a.ad.start ?? "9999").localeCompare(b.ad.start ?? "9999"))
    .slice(0, n);
}

export function RemixCompetitorAd({ watching, ads, now = Date.now() }: { watching: number; ads: RunningAd[]; now?: number }) {
  return (
    <Row id="remix-ads" title="Remix a competitor ad" more={ads.length ? { to: links.competitors({ running: true }), label: "See all" } : undefined}>
      {ads.length === 0 ? (
        <p className="flex flex-wrap items-center gap-x-1 text-sm text-muted-foreground">
          {watching ? "No running ads found yet." : "Watch a competitor to remix the ads they run."}
          <Link to={links.competitors()} className="inline-flex min-h-9 items-center rounded-md px-1 font-medium text-primary hover:underline [@media(pointer:coarse)]:min-h-11">
            {watching ? "Open competitors" : "Add a competitor"}
          </Link>
        </p>
      ) : (
        <ul className={cn(STRIP, "lg:grid-cols-5")}>
          {ads.map((x) => (
            <li key={x.ad.id} className={CELL}>
              <AdCard {...x} now={now} />
            </li>
          ))}
        </ul>
      )}
    </Row>
  );
}

function AdCard({ ad, c, now }: RunningAd & { now: number }) {
  // Meta's picture links expire: a dead one shows "No preview" until the next weekly check on /competitors
  const [broken, setBroken] = useState(false);
  const view = links.competitors({ ad: ad.id });
  return (
    <article className="flex h-full flex-col overflow-hidden rounded-xl border border-border/70 bg-card">
      <Link to={view} className="group flex flex-col" aria-label={`View ${c.name}'s ad`}>
        <span className="block aspect-square w-full bg-muted">
          {ad.image && !broken ? (
            <img src={ad.image} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full w-full flex-col items-center justify-center gap-1 text-xs text-muted-foreground">
              <ImageOff className="h-5 w-5" aria-hidden /> No preview
            </span>
          )}
        </span>
        <span className="block space-y-0.5 px-3 pt-2">
          <span className="block truncate text-sm font-medium text-foreground group-hover:underline">{c.name}</span>
          <span className="block text-xs text-muted-foreground">{runLabel(ad, now)}</span>
        </span>
      </Link>
      <div className="mt-auto px-3 pb-3 pt-2">
        <RemixButton source={fromAd(toAdLike(ad, c.name), now)} label={`${c.name}'s ad`} className="w-full">
          <Button asChild size="sm" variant="outline" className="w-full">
            <Link to={view}>View ad</Link>
          </Button>
        </RemixButton>
      </div>
    </article>
  );
}

// ---- Publish and promote ----

/** undefined while the connection is read, null when it couldn't be. */
export type AdlRead = AdlStatus | null | undefined;

export function adsLine(adl: AdlRead, sent: number): string {
  if (adl === undefined) return "Checking AdLauncher...";
  if (adl === null) return "Couldn't check AdLauncher right now";
  if (adl.connected) return sent ? `AdLauncher connected, ${sent} ad${sent === 1 ? "" : "s"} sent` : "AdLauncher connected, no ads sent yet";
  return adl.reconnect ? "AdLauncher needs connecting again" : "AdLauncher not connected";
}

/** How many of the open brand's posts are booked from `today` on. */
export const bookedCount = (drafts: DraftEntry[], today = localDateKey()) =>
  drafts.filter((d) => draftStatus(d) === "scheduled" && (d.scheduledFor ?? "").slice(0, 10) >= today).length;

export function PublishPromote({ adl, sent, booked }: { adl: AdlRead; sent: number; booked: number }) {
  return (
    <Row id="publish" title="Publish and promote">
      <div className="grid gap-3 sm:grid-cols-2">
        <Card icon={Megaphone} title="Ads" line={adsLine(adl, sent)} busy={adl === undefined} to={links.adlauncher()} action="Open ads" />
        <Card
          icon={CalendarDays}
          title="Posting"
          // which posts and when is Next up's and Coming up's to say, once each: this card only counts the queue
          line={booked ? `${booked} post${booked === 1 ? "" : "s"} booked` : "Nothing booked yet"}
          to={links.calendar()}
          action="Open calendar"
        />
      </div>
    </Row>
  );
}

function Card({ icon: Icon, title, line, sub, busy, to, action }: { icon: LucideIcon; title: string; line: string; sub?: string; busy?: boolean; to: string; action: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 bg-card p-4">
      <div className="flex min-w-0 flex-1 basis-48 items-start gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="text-sm text-muted-foreground" aria-busy={busy || undefined}>
            {line}
          </p>
          {sub && <p className="truncate text-xs text-muted-foreground">{sub}</p>}
        </div>
      </div>
      <Button asChild variant="outline" size="sm" className="gap-1 [@media(pointer:coarse)]:min-h-11">
        <Link to={to}>
          {action} <ChevronRight className="h-4 w-4" />
        </Link>
      </Button>
    </div>
  );
}

// ---- The four rows, read from this device ----

export default function HomeRows({ userId, drafts, className }: { userId: string; drafts: DraftEntry[]; className?: string }) {
  const { hash } = useLocation();
  // Home's own landing ran before this chunk drew the rows: land again on a row's anchor
  useScrollToHash(IDS.includes(hash.slice(1)));
  const tiles = useMemo(() => homeFormats(FORMATS, STATIC_FORMATS), []);
  const competitors = useMemo(() => {
    const list = loadCompetitors(userId).list;
    return { watching: list.length, ads: longestRunning(list, loadCompetitorAds(userId)) };
  }, [userId]);
  // the stores LibraryPage reads, read again when a picture or slideshow is saved here (posts arrive as props)
  const [saved, setSaved] = useState(0);
  useEffect(() => {
    const offs = [onImagesChanged, onSlideshowsChanged].map((on) => on(() => setSaved((n) => n + 1)));
    return () => offs.forEach((off) => off());
  }, []);
  const stores = useMemo(
    () => ({ drafts, carousels: loadCarousels(userId), slideshows: loadSlideshows(userId), projects: loadProjects(userId), media: loadMedia(userId), designs: loadDesigns(userId), images: loadImages(userId) }),
    [userId, drafts, saved], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const recent = useMemo(() => recentCreations(stores), [stores]);
  const fontsReady = useFontsReady(recent.some((c) => c.item.thumb?.kind === "show"));
  const sources = useMemo(() => readThumbSources(userId, stores, fontsReady), [userId, stores, fontsReady]);
  const sent = useMemo(() => loadLaunches(userId).length, [userId]);
  const [adl, setAdl] = useState<AdlRead>(undefined);
  useEffect(() => {
    let live = true;
    adlStatus().then(
      (s) => live && setAdl(s),
      () => live && setAdl(null),
    );
    return () => {
      live = false;
    };
  }, [userId]);

  return (
    <div className={cn("space-y-8", className)}>
      <RecentCreations items={recent} sources={sources} />
      <StartFromFormat tiles={tiles} />
      <RemixCompetitorAd {...competitors} />
      <PublishPromote adl={adl} sent={sent} booked={bookedCount(drafts)} />
    </div>
  );
}
