// /studio (Studio > Overview), after Fastlane's Studio overview (11 Nov frames t06-23 to t06-59; docs/nav-overhaul.md):
// a way to start from your own material at the top, every format as a card under "Content formats", then "Remix a
// competitor ad". For everyone else the top is the writer box (HomeWriter: New post lands here as /studio#topic) and the
// formats are the makers they can open, each taking the box's topic with it; for Leo it is Fastlane's three cards
// (upload your own, pictures, an AI clip) and the whole catalogue with prices. One row of type tabs filters the cards
// (?kind=words|slides-and-pictures|video, replace): the Create picker's headings, from nav.ts by way of createFormats.ts. The question and the agent's composer
// live on Home since 12 Nov. Reads only what this device and the bundled drops hold; calls no AI.
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CaretRightIcon, FilmStripIcon, ImageIcon, UploadSimpleIcon, type Icon as IconType } from "@phosphor-icons/react";
import FormatTile from "@/components/make/FormatTile";
import HomeWriter from "@/components/home/HomeWriter";
import { RemixCompetitorAd, RemixMarketAd, longestRunning, longestSwipeAds } from "@/components/home/HomeRows";
import PriceChip from "@/components/PriceChip";
import { FilterChip } from "@/components/ui/filter-chip";
import { FORMATS, formatHref, type FormatDef } from "@/data/formats";
import { STATIC_FORMATS, staticFormatHref } from "@/data/staticFormats";
import { ADS } from "@/lib/adsSwipe";
import { loadCompetitorAds } from "@/lib/competitorAds";
import { loadCompetitors } from "@/lib/competitors";
import { CREATE_FORMATS, CREATE_KINDS, MORE_FORMATS, kindOf, kindOfFormat, type CreateFormat } from "@/lib/createFormats";
import { loadCreateTopic, tileHref } from "@/lib/createTopic";
import { links } from "@/lib/links";
import { adviserBrand } from "@/lib/profession";
import { supabase } from "@/lib/supabase";
import { useUrlLabel } from "@/lib/urlState";
import { useLeoUser } from "@/lib/useLeoOnly";

export { writeTarget } from "@/components/home/HomeWriter";

/** Everyone else's formats: every maker they can open but the post writer, which is the box above them. */
export const CUSTOMER_FORMATS: CreateFormat[] = [...CREATE_FORMATS, ...MORE_FORMATS].filter((w) => w.to !== "/generate");
// Leo's: the catalogue /make shows, video formats in gallery order then the static ads
const VIDEO = FORMATS.filter((f) => f.ready).sort((a, b) => a.group - b.group);
const STATICS = STATIC_FORMATS.filter((f) => f.ready);

/** Fastlane's three cards over the formats, on Leo's sign-ins. */
const OWN: { to: string; name: string; blurb: string; icon: IconType }[] = [
  { to: "/edit", name: "Upload your own", blurb: "Post your own video, with captions", icon: UploadSimpleIcon },
  { to: "/image", name: "Generate images", blurb: "Stills from a prompt or a reference", icon: ImageIcon },
  { to: links.edit({ panel: ["ai"], kind: "template" }), name: "Generate a video", blurb: "A clip from a prompt or an image", icon: FilmStripIcon },
];

const GRID = "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5";
const CARD = "group flex h-full min-w-0 flex-col gap-2 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
// no format has a preview clip yet: a short tile, as the Create gallery draws them, not a wall of empty phone-sized boxes
const POSTER = "relative flex aspect-[16/9] w-full items-center justify-center overflow-hidden rounded-xl border border-border/60 bg-muted transition-colors group-hover:border-primary/40";

function Section({ id, title, count, more, tabs, children }: { id: string; title: string; count?: number; more?: { to: string; label: string }; tabs?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-6 space-y-3">
      <div className="flex min-h-9 items-center justify-between gap-3">
        <h2 id={`${id}-h`} className="flex items-center gap-2 text-lg font-semibold text-foreground">
          {title}
          {count !== undefined && <span className="rounded-md bg-muted px-1.5 text-xs font-semibold tabular-nums text-muted-foreground">{count}</span>}
        </h2>
        {more && (
          <Link to={more.to} className="inline-flex min-h-9 items-center gap-0.5 rounded-md px-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground [@media(pointer:coarse)]:min-h-11">
            {more.label} <CaretRightIcon className="h-4 w-4" />
          </Link>
        )}
      </div>
      {tabs}
      {children}
    </section>
  );
}

type FormatCardProps = { to: string; kind: string; name: string; blurb: string; poster: ReactNode; price?: ReactNode; onClick?: (e: React.MouseEvent) => void };

/** One format, the same four things in the same order on every card: its poster (a drawn storyboard, or the maker's
 * icon), its kind, its name and one line; then, on Leo's, its price. */
function FormatCard({ to, kind, name, blurb, poster, price, onClick }: FormatCardProps) {
  return (
    <Link to={to} onClick={onClick} className={CARD}>
      <span className={POSTER}>{poster}</span>
      <span className="min-w-0 space-y-1 px-0.5">
        <span className="inline-block rounded-md bg-muted px-1.5 text-xs font-medium text-muted-foreground">{kind}</span>
        <span className="block text-sm font-semibold leading-snug text-foreground">{name}</span>
        <span className="line-clamp-2 block text-xs text-muted-foreground">{blurb}</span>
        {price}
      </span>
    </Link>
  );
}

const leoPrice = (f: FormatDef) => {
  const p = f.price();
  return <span className="inline-flex max-w-full rounded-full border border-border px-2 py-0.5">{p === null ? <span className="text-[11px] text-muted-foreground">No AI cost</span> : <PriceChip price={p} left={null} />}</span>;
};

export default function StudioPage() {
  const leo = useLeoUser();
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);
  useEffect(() => {
    // getSession reads the stored session: no Auth round trip under the client lock
    void supabase.auth.getSession().then(({ data }) => setUserId(data.session?.user.id ?? null));
  }, []);
  // the bundled ads are Singapore personal finance: an adviser brand's only; Leo's own competitors come first
  const adviser = adviserBrand(userId);
  const competitors = useMemo(() => {
    if (!leo) return null;
    const list = loadCompetitors(leo.id).list;
    return list.length ? { watching: list.length, ads: longestRunning(list, loadCompetitorAds(leo.id), 10) } : null;
  }, [leo]);
  const marketAds = useMemo(() => (adviser ? longestSwipeAds(ADS, 10) : []), [adviser]);
  // a tile takes the box's topic with it (createTopic.ts), read when it is pressed: the box keeps it on every keystroke
  const carry = (to: string) => (e: React.MouseEvent) => {
    const topic = userId ? loadCreateTopic(userId) : "";
    if (!topic.trim()) return;
    e.preventDefault();
    navigate(tileHref(to, topic, userId));
  };

  const cards: (FormatCardProps & { key: string })[] = leo
    ? [
        ...VIDEO.map((f) => ({ key: f.slug, to: formatHref(f), kind: kindOfFormat(f.kind), name: f.name, blurb: f.blurb, poster: <FormatTile f={f} />, price: leoPrice(f) })),
        ...STATICS.map((f) => ({ key: `static-${f.slug}`, to: staticFormatHref(f.slug), kind: kindOfFormat("image"), name: f.name, blurb: f.blurb, poster: <ImageIcon className="h-6 w-6 text-muted-foreground" aria-hidden /> })),
      ]
    : CUSTOMER_FORMATS.map((w) => ({ key: w.to, to: w.to, kind: kindOf(w.to) ?? CREATE_KINDS[0], name: w.name, blurb: w.blurb, poster: <w.icon className="h-7 w-7 text-primary" aria-hidden />, onClick: carry(w.to) }));
  // a tab only for a kind that has cards; a typed ?kind= with none reads as All
  const kinds = CREATE_KINDS.filter((k) => cards.some((c) => c.kind === k));
  const [kind, setKind] = useUrlLabel("kind", kinds);
  const shown = kind ? cards.filter((c) => c.kind === kind) : cards;

  return (
    <div className="space-y-10">
      {leo ? (
        <>
          <h1 className="sr-only">Studio</h1>
          <section aria-label="Make from your own" className="grid gap-3 sm:grid-cols-3">
            {OWN.map((o) => (
              <Link key={o.name} to={o.to} className="flex min-h-11 items-start gap-3 rounded-xl border border-border/70 bg-card p-4 transition-colors hover:border-primary/40">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <o.icon className="h-4 w-4" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-foreground">{o.name}</span>
                  <span className="block text-xs text-muted-foreground">{o.blurb}</span>
                </span>
              </Link>
            ))}
          </section>
        </>
      ) : (
        <header className="space-y-4">
          <h1 className="font-serif text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">What do you want to make?</h1>
          {/* the formats below are the chips' makers, so the box shows none; Write it is the page's one filled button */}
          {leo === null ? <HomeWriter userId={userId} chips={false} primary /> : <div className="h-28" aria-busy="true" />}
        </header>
      )}

      <Section
        id="formats"
        title="Content formats"
        count={cards.length}
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

      {/* trending posts are under Insights > Find posts and your latest under Library, so neither repeats here */}
      {competitors ? <RemixCompetitorAd {...competitors} /> : <RemixMarketAd ads={marketAds} />}
    </div>
  );
}
