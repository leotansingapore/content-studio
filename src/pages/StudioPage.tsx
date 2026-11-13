// /studio (Studio > Overview), in Fastlane's Studio overview order (read live 13 Nov 2026): the question "What should
// the agent make for <brand>?" with the box under it, one row of jump chips (Formats, Static ads, Your latest,
// Competitor ads, Trending), then Make your own, Content formats, Static ads, Your latest, Remix a competitor ad and
// Remix trending posts. Leo's box is the agent's composer (its own chunk, loaded on his sign-ins only); everyone else's
// is the post writer (HomeWriter: New post lands here as /studio#topic) and their formats are the makers they can open,
// each taking the box's topic with it. Format cards play their silent example while on screen (FormatPreview). One row
// of type tabs filters the formats (?kind=), a competitor pill the ads (?ads=), a switch the trending row (?trend=).
// Reads only this device's stores and the bundled drops; calls no AI.
import { Suspense, lazy, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowSquareOutIcon, CaretRightIcon, ClockIcon, FilmStripIcon, ImageIcon, RepeatIcon, SquaresFourIcon, TrendUpIcon, UploadSimpleIcon, type Icon as IconType } from "@phosphor-icons/react";
import FormatPreview from "@/components/make/FormatPreview";
import FormatTile from "@/components/make/FormatTile";
import HomeWriter from "@/components/home/HomeWriter";
import { AdCard, CreationTile, RemixMarketAd, longestRunning, longestSwipeAds, recentCreations } from "@/components/home/HomeRows";
import { readThumbSources, useFontsReady } from "@/components/library/LibraryThumb";
import RemixButton from "@/components/remix/RemixButton";
import PriceChip from "@/components/PriceChip";
import { Button } from "@/components/ui/button";
import { FilterChip } from "@/components/ui/filter-chip";
import { FORMATS, formatHref, type FormatDef } from "@/data/formats";
import { STATIC_FORMATS, staticFormatHref, staticShotSrc } from "@/data/staticFormats";
import { ADS } from "@/lib/adsSwipe";
import { loadCarousels } from "@/lib/carousel";
import { loadCompetitorAds } from "@/lib/competitorAds";
import { brandFacts, loadCompetitors } from "@/lib/competitors";
import { CREATE_FORMATS, CREATE_KINDS, MORE_FORMATS, kindOf, kindOfFormat, type CreateFormat } from "@/lib/createFormats";
import { loadCreateTopic, tileHref } from "@/lib/createTopic";
import { loadDesigns } from "@/lib/design";
import { loadDrafts } from "@/lib/draftHistory";
import { FORMAT_TRENDS, formatRemixUrl, formatTag, type FormatTrend } from "@/lib/formatTrends";
import { loadImages } from "@/lib/images";
import { links } from "@/lib/links";
import { loadMedia } from "@/lib/mediaLibrary";
import { MATCH_AT, brandSig, loadFeed, loadNiche, type FeedItem } from "@/lib/nicheFeed";
import { priceOf, type Price } from "@/lib/prices";
import { adviserBrand, professionFor } from "@/lib/profession";
import { ownBrandName } from "@/lib/remixBrand";
import { loadSlideshows } from "@/lib/slideshow";
import { supabase } from "@/lib/supabase";
import { compactNum } from "@/lib/topPosts";
import { useScrollToHash, useUrlLabel } from "@/lib/urlState";
import { useLeoUser } from "@/lib/useLeoOnly";
import { cn } from "@/lib/utils";
import { loadProjects } from "@/lib/videoProjects";
import { times } from "../../supabase/functions/_shared/outlier.ts";

export { writeTarget } from "@/components/home/HomeWriter";

const StudioAsk = lazy(() => import("@/components/studio/StudioAsk").catch(() => ({ default: () => null })));

/** Everyone else's formats: every maker they can open but the post writer, which is the box above them. */
export const CUSTOMER_FORMATS: CreateFormat[] = [...CREATE_FORMATS, ...MORE_FORMATS].filter((w) => w.to !== "/generate");
// Leo's: the catalogue /make shows, video formats in gallery order, then the static ads in their own section
const VIDEO = FORMATS.filter((f) => f.ready).sort((a, b) => a.group - b.group);
const STATICS = STATIC_FORMATS.filter((f) => f.ready);
// every static ad is one remix-make, as its page charges
const STATIC_PRICE = priceOf("remix-make");
const from = (p: Price | "pick" | null): Price | "pick" | null => (p && p !== "pick" ? { ...p, kind: "from" } : p);
const formatPrice = (slug: string) => FORMATS.find((f) => f.slug === slug)?.price() ?? null;
const firstTemplate = FORMATS.find((f) => f.ready && f.slug.startsWith("template-"));
// a maker everyone can open that is also a catalogue format shows that format's example
const POSTER_OF = new Map(FORMATS.filter((f) => f.ready && f.preview).map((f) => [formatHref(f), f] as const));

const ROW = 10;
const PLACEHOLDER = "Ask for a post, a remix, a video or a campaign";

/** Fastlane's three cards over the formats: your own footage, pictures from a prompt, a clip from a prompt. */
const OWN: { to: string; name: string; blurb: string; icon: IconType; poster: string; clip?: string; price: () => Price | "pick" | null }[] = [
  { to: "/edit", name: "Upload your own", blurb: "Post your own video or photos, with words and captions", icon: UploadSimpleIcon, poster: "/formats/own-media.webp", clip: "own-media", price: () => formatPrice("own-media") },
  { to: "/image", name: "Generate images", blurb: "Stills from a prompt or a reference, ready to post", icon: ImageIcon, poster: staticShotSrc("street-poster", 2), price: () => from(priceOf("ai-image")) },
  {
    to: links.edit({ panel: ["ai"], kind: "template" }),
    name: "Generate a video",
    blurb: "A clip from a prompt or an image",
    icon: FilmStripIcon,
    poster: firstTemplate ? `/formats/${firstTemplate.slug}.webp` : "/formats/montage.webp",
    clip: firstTemplate?.slug,
    price: () => from(firstTemplate?.price() ?? null),
  },
];

const GRID = "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5";
const CARD = "group flex h-full min-w-0 flex-col gap-2 rounded-xl border border-border/60 bg-card p-1.5 transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const PICTURE = "relative flex w-full items-center justify-center overflow-hidden rounded-lg bg-muted";
const PILL = "inline-flex max-w-full rounded-full border border-border px-2 py-0.5";
const MORE = "inline-flex min-h-9 shrink-0 items-center gap-0.5 rounded-md px-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground [@media(pointer:coarse)]:min-h-11";
const JUMP = "inline-flex min-h-10 items-center gap-2 rounded-full border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-accent [@media(pointer:coarse)]:min-h-11";

function Section({ id, title, count, sub, more, tabs, children }: { id: string; title: string; count?: number | string; sub?: string; more?: { to: string; label: string }; tabs?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-6 space-y-3">
      <div className="flex min-h-9 items-end justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <h2 id={`${id}-h`} className="flex items-center gap-2 text-lg font-semibold text-foreground">
            {title}
            {count !== undefined && <span className="rounded-md bg-muted px-1.5 text-xs font-semibold tabular-nums text-muted-foreground">{count}</span>}
          </h2>
          {sub && <p className="text-sm text-muted-foreground">{sub}</p>}
        </div>
        {more && (
          <Link to={more.to} className={MORE}>
            {more.label} <CaretRightIcon className="h-4 w-4" />
          </Link>
        )}
      </div>
      {tabs}
      {children}
    </section>
  );
}

const PricePill = ({ p }: { p: Price | "pick" | null }) => (
  <span className={PILL}>{p === null ? <span className="text-[11px] text-muted-foreground">No AI cost</span> : <PriceChip price={p} left={null} />}</span>
);

type FormatCardProps = { to: string; kind: string; name: string; blurb: string; picture: (active: boolean) => ReactNode; tall?: boolean; price?: ReactNode; onClick?: (e: React.MouseEvent) => void };

/** One format, the same things in the same order on every card: its example (playing while on screen), its kind, its
 * name and one line, then its price. */
function FormatCard({ to, kind, name, blurb, picture, tall = true, price, onClick }: FormatCardProps) {
  const [active, setActive] = useState(false);
  const on = () => setActive(true);
  const off = () => setActive(false);
  return (
    <Link to={to} onClick={onClick} onMouseEnter={on} onMouseLeave={off} onFocus={on} onBlur={off} className={CARD}>
      <span className={cn(PICTURE, tall ? "aspect-[9/16]" : "aspect-[4/5]")}>{picture(active)}</span>
      <span className="min-w-0 space-y-1 px-1 pb-1">
        <span className="inline-block rounded-md bg-muted px-1.5 text-xs font-medium text-muted-foreground">{kind}</span>
        <span className="block text-sm font-semibold leading-snug text-foreground">{name}</span>
        <span className="line-clamp-2 block text-xs text-muted-foreground">{blurb}</span>
        {price}
      </span>
    </Link>
  );
}

/** A trending slideshow or wall of text from the weekly drop: its cover, who posted it and its views; Remix opens its format with it attached. */
function TemplateTrendCard({ t }: { t: FormatTrend }) {
  const [broken, setBroken] = useState(false);
  return (
    <article className="flex h-full flex-col overflow-hidden rounded-xl border border-border/70 bg-card">
      <span className="relative block aspect-[9/16] w-full bg-muted">
        {!broken && <img src={t.cover} alt="" loading="lazy" onError={() => setBroken(true)} className="h-full w-full object-cover" />}
        <span className="absolute left-2 top-2 rounded-md bg-background/85 px-1.5 py-0.5 text-[10px] font-semibold text-foreground">{formatTag(t)}</span>
      </span>
      <span className="block space-y-0.5 px-3 pt-2">
        <span className="block truncate text-sm font-medium text-foreground">@{t.author.replace(/^@/, "")}</span>
        <span className="block text-xs tabular-nums text-muted-foreground">
          {compactNum(t.views)} views, TikTok
        </span>
      </span>
      <div className="mt-auto flex items-center gap-1 px-3 pb-3 pt-2">
        <Button asChild size="sm" variant="outline" className="flex-1">
          <Link to={formatRemixUrl(t)}>
            <RepeatIcon className="h-4 w-4" aria-hidden /> Remix
          </Link>
        </Button>
        <Button asChild size="icon" variant="ghost" className="h-9 w-9 shrink-0 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11">
          <a href={t.url} target="_blank" rel="noreferrer" aria-label={`Open @${t.author}'s post on TikTok`}>
            <ArrowSquareOutIcon className="h-4 w-4" aria-hidden />
          </a>
        </Button>
      </div>
    </article>
  );
}

/** An organic post from the brand's niche (its competitors, Following, or a drop post Jev matched to it): who, where, its numbers, the words, and Remix. */
function TrendingPostCard({ item }: { item: FeedItem }) {
  const ratio = item.outlier?.ratio ?? null;
  return (
    <article className="flex h-full flex-col gap-2 rounded-xl border border-border/70 bg-card p-3">
      <div className="min-w-0 space-y-0.5">
        <p className="truncate text-sm font-semibold text-foreground">{item.who}</p>
        <p className="truncate text-xs text-muted-foreground">{item.meta}</p>
      </div>
      {(item.numbers || (ratio !== null && ratio >= 1.5)) && (
        <p className="flex flex-wrap items-center gap-1.5 text-xs tabular-nums text-muted-foreground">
          {ratio !== null && ratio >= 1.5 && <span className="rounded-md bg-primary/10 px-1.5 font-semibold text-primary">{times(ratio)} their usual</span>}
          {item.numbers}
        </p>
      )}
      <p className="line-clamp-4 text-sm text-foreground">{item.text || "No caption"}</p>
      <div className="mt-auto pt-1">
        <RemixButton source={item.source} label={`${item.who}'s post`} className="w-full">
          <Button asChild size="sm" variant="outline" className="w-full">
            <Link to={item.remixUrl}>Remix</Link>
          </Button>
        </RemixButton>
      </div>
    </article>
  );
}

const STRIP = "-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-5";
const CELL = "w-[44%] shrink-0 snap-start sm:w-auto";
const TRENDS = ["Trending posts", "Template trends"] as const;
const DROP_DAY = FORMAT_TRENDS.fetched ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${FORMAT_TRENDS.fetched}T00:00:00Z`)) : "";

export default function StudioPage() {
  const leo = useLeoUser();
  const navigate = useNavigate();
  const { search } = useLocation();
  const [userId, setUserId] = useState<string | null>(null);
  useEffect(() => {
    // getSession reads the stored session: no Auth round trip under the client lock
    void supabase.auth.getSession().then(({ data }) => setUserId(data.session?.user.id ?? null));
  }, []);
  useScrollToHash(userId !== null);
  const brand = userId ? ownBrandName(userId) : "";
  const what = userId ? professionFor(userId) : "";
  // the bundled ads are Singapore personal finance: an adviser brand's only; Leo's own competitors come first
  const adviser = adviserBrand(userId);

  // ---- formats ----
  // a tile takes the box's topic with it (createTopic.ts), read when it is pressed: the box keeps it on every keystroke
  const carry = (to: string) => (e: React.MouseEvent) => {
    const topic = userId ? loadCreateTopic(userId) : "";
    if (!topic.trim()) return;
    e.preventDefault();
    navigate(tileHref(to, topic, userId));
  };
  const cards: (FormatCardProps & { key: string })[] = leo
    ? VIDEO.map((f: FormatDef) => ({
        key: f.slug,
        to: formatHref(f),
        kind: kindOfFormat(f.kind),
        name: f.name,
        blurb: f.blurb,
        picture: (active: boolean) => <FormatPreview slug={f.slug} video={f.kind === "video"} active={active} fallback={<FormatTile f={f} />} />,
        price: <PricePill p={f.price()} />,
      }))
    : CUSTOMER_FORMATS.map((w) => {
        const f = POSTER_OF.get(w.to);
        const icon = <w.icon className="h-7 w-7 text-primary" aria-hidden />;
        return {
          key: w.to,
          to: w.to,
          kind: kindOf(w.to) ?? CREATE_KINDS[0],
          name: w.name,
          blurb: w.blurb,
          tall: !!f,
          picture: (active: boolean) => (f ? <FormatPreview slug={f.slug} video={f.kind === "video"} active={active} fallback={icon} /> : icon),
          onClick: carry(w.to),
        };
      });
  // a tab only for a kind that has cards; a typed ?kind= with none reads as All
  const kinds = CREATE_KINDS.filter((k) => cards.some((c) => c.kind === k));
  const [kind, setKind] = useUrlLabel("kind", kinds);
  const shown = kind ? cards.filter((c) => c.kind === kind) : cards;

  // ---- your latest: the Library's own merge, newest first ----
  const stores = useMemo(
    () =>
      userId
        ? { drafts: loadDrafts(userId), carousels: loadCarousels(userId), slideshows: loadSlideshows(userId), projects: loadProjects(userId), media: loadMedia(userId), designs: loadDesigns(userId), images: loadImages(userId) }
        : null,
    [userId],
  );
  const latest = useMemo(() => (stores ? recentCreations(stores, 6) : []), [stores]);
  const fontsReady = useFontsReady(latest.some((c) => c.item.thumb?.kind === "show"));
  const sources = useMemo(() => (userId && stores ? readThumbSources(userId, stores, fontsReady) : undefined), [userId, stores, fontsReady]);

  // ---- competitor ads: every running ad of the watched competitors, one pill each ----
  const competitors = useMemo(() => {
    if (!leo) return null;
    const list = loadCompetitors(leo.id).list;
    return { watching: list.length, ads: longestRunning(list, loadCompetitorAds(leo.id), 500) };
  }, [leo]);
  const rivals = useMemo(() => {
    const n = new Map<string, number>();
    competitors?.ads.forEach((a) => n.set(a.c.name, (n.get(a.c.name) ?? 0) + 1));
    return [...n].sort((a, b) => b[1] - a[1]);
  }, [competitors]);
  const [rival, setRival] = useUrlLabel("ads", rivals.map(([name]) => name));
  const rivalAds = (competitors?.ads ?? []).filter((a) => !rival || a.c.name === rival).slice(0, ROW);
  const marketAds = useMemo(() => (!leo && adviser ? longestSwipeAds(ADS, ROW) : []), [leo, adviser]);
  const adCount = competitors ? competitors.ads.length : marketAds.length ? ADS.length : 0;

  // ---- trending: the brand's niche posts (Leo's For you feed) and the weekly template drop ----
  const openable = (k: FormatTrend["kind"]) => !!leo || CUSTOMER_FORMATS.some((w) => w.to.startsWith(`/make/${k}`));
  // the latest drop at any age, as Blitz reads it; its date is on the row, so an old drop never reads as this week's
  const templates = useMemo(() => FORMAT_TRENDS.items.filter((t) => openable(t.kind)).slice(0, ROW), [leo]); // eslint-disable-line react-hooks/exhaustive-deps
  const posts = useMemo(() => {
    if (!leo || !userId) return [];
    const facts = brandFacts(userId);
    const state = loadNiche(userId);
    const scores = (facts.sells || facts.serves) && state.brandSig === brandSig(facts) ? state.scores : {};
    const hidden = new Set(state.hidden);
    // the brand's own sources always count; the shared drops only once Jev has matched them to this brand
    return loadFeed(userId)
      .filter((i) => i.kind === "organic" && !hidden.has(i.id) && (i.from === "cp" || i.from === "fo" || (scores[i.id] ?? 0) >= MATCH_AT))
      .sort((a, b) => (b.outlier?.ratio ?? 0) - (a.outlier?.ratio ?? 0) || b.at - a.at)
      .slice(0, ROW);
  }, [leo, userId]);
  const trendTabs = TRENDS.filter((t) => (t === "Trending posts" ? !!leo : templates.length > 0));
  const [trendPick, setTrend] = useUrlLabel("trend", trendTabs);
  // with no niche posts yet, the templates lead
  const trend = trendPick ?? (posts.length || !templates.length ? trendTabs[0] : "Template trends");
  const trendCount = trend === "Template trends" ? templates.length : posts.length;

  const jumps: { id: string; label: string; icon: IconType; count?: string }[] = [
    { id: "formats", label: "Formats", icon: SquaresFourIcon, count: String(cards.length) },
    ...(leo ? [{ id: "static-ads", label: "Static ads", icon: ImageIcon, count: String(STATICS.length) }] : []),
    { id: "latest", label: "Your latest", icon: ClockIcon },
    ...(adCount ? [{ id: "remix-ads", label: "Competitor ads", icon: RepeatIcon, count: String(adCount) }] : []),
    ...(posts.length + templates.length ? [{ id: "trending", label: "Trending", icon: TrendUpIcon, count: String(posts.length + templates.length) }] : []),
  ];
  const meta = [brand, what].filter(Boolean).join(" | ");

  return (
    <div className="space-y-12">
      <h1 className="sr-only">Studio</h1>
      <header className="space-y-6">
        {meta && <p className="text-right text-xs text-muted-foreground">{meta}</p>}
        <div className="mx-auto max-w-3xl space-y-2 text-center">
          <h2 className="font-serif text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{brand ? `What should we make for ${brand}?` : "What do you want to make?"}</h2>
          <p className="text-sm text-muted-foreground">
            {leo ? "Tell the agent, or pick a format, an ad or a trending post below. It shows the price before anything is made." : "Write it here, or pick a format below."}
          </p>
        </div>
        <div className="mx-auto w-full max-w-3xl">
          {leo ? (
            <Suspense fallback={<div className="h-32 rounded-2xl border border-border bg-card" aria-busy="true" />}>
              <StudioAsk userId={leo.id} placeholder={PLACEHOLDER} />
            </Suspense>
          ) : leo === null ? (
            // the formats below are the chips' makers, so the box shows none; Write it is the page's one filled button
            <HomeWriter userId={userId} chips={false} primary />
          ) : (
            <div className="h-28" aria-busy="true" />
          )}
        </div>
        <nav aria-label="Jump to" className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:justify-center sm:px-0">
          {jumps.map((j) => (
            <Link key={j.id} to={{ search, hash: `#${j.id}` }} replace className={cn(JUMP, "shrink-0")}>
              <j.icon className="h-4 w-4 text-muted-foreground" aria-hidden />
              {j.label}
              {j.count && <span className="tabular-nums text-muted-foreground">{j.count}</span>}
            </Link>
          ))}
        </nav>
      </header>

      {leo && (
        <Section id="own" title="Make your own" count={OWN.length} sub="Start from your own video or photos, or make one from a prompt.">
          <ul className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 sm:pb-0">
            {OWN.map((o) => (
              <li key={o.name} className="w-[72%] min-w-0 shrink-0 snap-start sm:w-auto">
                <OwnCard {...o} />
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section
        id="formats"
        title="Content formats"
        count={shown.length}
        sub="Pick a format to start. Each one shows what it makes."
        more={leo ? { to: links.make(), label: "All formats" } : undefined}
        tabs={
          kinds.length > 1 && (
            <div role="group" aria-label="Kind of format" className="scrollbar-none -mx-4 flex max-w-full gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
              <FilterChip active={!kind} onClick={() => setKind(null)}>All</FilterChip>
              {kinds.map((k) => (
                <FilterChip key={k} active={kind === k} onClick={() => setKind(k)}>{k}</FilterChip>
              ))}
            </div>
          )
        }
      >
        <ul aria-label="Ways to make" className={GRID}>
          {shown.map(({ key, ...c }) => (
            <li key={key} className="min-w-0">
              <FormatCard {...c} />
            </li>
          ))}
        </ul>
      </Section>

      {leo && (
        <Section id="static-ads" title="Static ads" count={STATICS.length} sub="One designed picture in your brand, from a headline, a chat or a note." more={{ to: links.make({ tab: "static" }), label: "All static ads" }}>
          <ul aria-label="Static ad formats" className={GRID}>
            {STATICS.map((f) => (
              <li key={f.slug} className="min-w-0">
                <FormatCard
                  to={staticFormatHref(f.slug)}
                  kind={kindOfFormat("image")}
                  name={f.name}
                  blurb={f.blurb}
                  tall={false}
                  picture={() => <FormatPreview slug={f.slug} poster={staticShotSrc(f.slug, 1)} fallback={<ImageIcon className="h-6 w-6 text-muted-foreground" aria-hidden />} />}
                  price={<PricePill p={STATIC_PRICE} />}
                />
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section id="latest" title="Your latest" sub="From chats, campaigns and Studio, newest first." more={{ to: links.library(), label: "Library" }}>
        {latest.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing made yet. Pick a format above and it shows here.</p>
        ) : (
          <ul className={cn(STRIP, "lg:grid-cols-6")}>
            {latest.map((c) => (
              <li key={c.key} className={CELL}>
                <CreationTile c={c} sources={sources} />
              </li>
            ))}
          </ul>
        )}
      </Section>

      {competitors ? (
        <Section
          id="remix-ads"
          title="Remix a competitor ad"
          count={competitors.ads.length || undefined}
          sub={rivals.length ? `What ${rivals.slice(0, 3).map(([n]) => n).join(", ")} ${rivals.length > 3 ? "and others are" : rivals.length > 1 ? "are" : "is"} running now` : undefined}
          more={{ to: links.competitors(competitors.ads.length ? { running: true } : {}), label: competitors.ads.length ? "See all" : "Competitors" }}
          tabs={
            rivals.length > 1 && (
              <div role="group" aria-label="Competitor" className="scrollbar-none -mx-4 flex max-w-full gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
                <FilterChip active={!rival} onClick={() => setRival(null)}>All {competitors.ads.length}</FilterChip>
                {rivals.map(([name, n]) => (
                  <FilterChip key={name} active={rival === name} onClick={() => setRival(name)}>
                    {name} {n}
                  </FilterChip>
                ))}
              </div>
            )
          }
        >
          {rivalAds.length === 0 ? (
            <p className="flex flex-wrap items-center gap-x-1 text-sm text-muted-foreground">
              {competitors.watching ? "No running ads found yet." : "Watch a competitor to remix the ads they run."}
              <Link to={links.competitors({ view: "list" })} className="inline-flex min-h-9 items-center rounded-md px-1 font-medium text-primary hover:underline [@media(pointer:coarse)]:min-h-11">
                {competitors.watching ? "Open competitors" : "Add a competitor"}
              </Link>
            </p>
          ) : (
            <ul className={STRIP}>
              {rivalAds.map((x) => (
                <li key={x.ad.id} className={CELL}>
                  <AdCard {...x} now={Date.now()} />
                </li>
              ))}
            </ul>
          )}
        </Section>
      ) : (
        <RemixMarketAd ads={marketAds} />
      )}

      {trendTabs.length > 0 && (
        <Section
          id="trending"
          title={trend === "Template trends" ? "Remix trending templates" : "Remix trending posts"}
          count={trendCount}
          sub={trend === "Template trends" ? `Slideshows and walls of text taking off on TikTok${DROP_DAY ? `, read ${DROP_DAY}` : ""}.` : "Top posts from your niche: your competitors, accounts you follow and posts matched to your brand."}
          more={trend === "Template trends" ? undefined : { to: links.swipe({ tab: "foryou" }), label: "See all" }}
          tabs={
            trendTabs.length > 1 && (
              <div role="group" aria-label="Trending" className="flex gap-1.5">
                {trendTabs.map((t) => (
                  <FilterChip key={t} active={trend === t} onClick={() => setTrend(t)}>{t}</FilterChip>
                ))}
              </div>
            )
          }
        >
          {trend === "Template trends" ? (
            <ul className={STRIP}>
              {templates.map((t) => (
                <li key={t.id} className={CELL}>
                  <TemplateTrendCard t={t} />
                </li>
              ))}
            </ul>
          ) : posts.length === 0 ? (
            <p className="flex flex-wrap items-center gap-x-1 text-sm text-muted-foreground">
              No posts from your niche yet. Follow an account or watch a competitor and their best posts show here.
              <Link to={links.swipe({ tab: "foryou" })} className="inline-flex min-h-9 items-center rounded-md px-1 font-medium text-primary hover:underline [@media(pointer:coarse)]:min-h-11">
                Open For you
              </Link>
            </p>
          ) : (
            <ul className={STRIP}>
              {posts.map((p) => (
                <li key={p.id} className={CELL}>
                  <TrendingPostCard item={p} />
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}
    </div>
  );
}

/** One of the three Make your own cards: its example (the clip plays while on screen), name, line and price. */
function OwnCard({ to, name, blurb, icon: Icon, poster, clip, price }: (typeof OWN)[number]) {
  const [active, setActive] = useState(false);
  return (
    <Link to={to} onMouseEnter={() => setActive(true)} onMouseLeave={() => setActive(false)} onFocus={() => setActive(true)} onBlur={() => setActive(false)} className={CARD}>
      <span className={cn(PICTURE, "aspect-[16/10]")}>
        <FormatPreview slug={clip ?? name} poster={poster} video={!!clip} active={active} fallback={<Icon className="h-7 w-7 text-primary" aria-hidden />} />
      </span>
      <span className="min-w-0 space-y-1 px-1 pb-1">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <Icon className="h-4 w-4 text-primary" aria-hidden /> {name}
        </span>
        <span className="block text-xs text-muted-foreground">{blurb}</span>
        <PricePill p={price()} />
      </span>
    </Link>
  );
}
