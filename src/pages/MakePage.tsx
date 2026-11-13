// The format gallery (/make, Leo's sign-ins only; docs/north-star/items/formats-gallery.md), shaped after Fastlane's
// Studio > Create: a Videos tab with every ready entry in src/data/formats.ts in its section (Make your own, Your words
// over a clip, A person on camera, Animated stories, Built from your footage), each with its price and today's uses
// left before anything is spent, and a Static ads tab with every ready static format (src/data/staticFormats.ts),
// shown once one is. Tab, filter and search live in the URL (?tab=static, ?show=ready|needs, ?q=, replace); both tabs
// share the chips and the search box, which looks in a card's name, line and section. "Needs something" is
// what the open brand is missing on this device (a demo video, a product photo, a face or presenter, its own
// footage), read once on arrival; a card's need line links to where it is added, beside the card's own link.
// A video card with no preview clip draws its own storyboard tile (FormatTile), free.
// The page calls no AI and stores nothing; the only read is today's usage counts.

import { useState } from "react";
import { Link } from "react-router-dom";
import { DiamondIcon, ImageIcon, MagnifyingGlassIcon, SpeakerXIcon } from "@phosphor-icons/react";
import FormatTile from "@/components/make/FormatTile";
import PriceChip from "@/components/PriceChip";
import { Button } from "@/components/ui/button";
import { FilterChip } from "@/components/ui/filter-chip";
import { Input } from "@/components/ui/input";
import {
  FORMATS, FORMAT_FILTERS, NEED_LINES, bySection, filterFormats, formatHref, readyStatics, searchFormats,
  type FormatDef, type FormatFilter, type FormatNeed,
} from "@/data/formats";
import { STATIC_NEED_LINES, staticFormatHref, staticShotSrc, type StaticFormat } from "@/data/staticFormats";
import { useUsesLeft } from "@/lib/aiUsage";
import { demoVideos } from "@/lib/demoVideos";
import { links } from "@/lib/links";
import { loadMedia } from "@/lib/mediaLibrary";
import { chipText, priceOf } from "@/lib/prices";
import { loadProducts } from "@/lib/products";
import { activeProfile } from "@/lib/profiles";
import { speakers } from "@/lib/talkingHead";
import { useLeoUser } from "@/lib/useLeoOnly";
import { useUrlSearch, useUrlState, useUrlUpdate } from "@/lib/urlState";
import NotFoundPage from "@/pages/NotFoundPage";

const TOUCH = "[@media(pointer:coarse)]:min-h-11";
const VIDEOS = FORMATS.filter((f) => f.ready);
const STATICS = readyStatics();
// every static ad is one remix-make, as its page charges
const STATIC_PRICE = priceOf("remix-make");
// no ready static format: no tab, and a typed ?tab=static lands on Videos
const TABS = STATICS.length ? (["videos", "static"] as const) : (["videos"] as const);
type Tab = "videos" | "static";
// a mouse, and motion allowed: phones and reduced motion keep the poster
const PLAYS = "(hover: hover) and (prefers-reduced-motion: no-preference)";
// where each need is added; a reel's video is picked on its own page
const NEED_HREFS: Partial<Record<FormatNeed, string>> = {
  "demo-video": links.brand({ section: "demo-videos" }),
  "product-photo": links.brand({ section: "products" }),
  photo: links.people(),
  "own-video": links.media(),
  "own-media": links.media(),
};

/** What the open brand is missing on this device, read the way the demo videos always were. */
function readMissing(userId: string): (n: FormatNeed) => boolean {
  const own = loadMedia(userId, { videos: true }).filter((m) => !m.demo);
  const s = speakers(userId);
  const have: Record<FormatNeed, boolean> = {
    "demo-video": demoVideos(userId).length > 0,
    "product-photo": loadProducts(userId).items.some((p) => p.pictures.length > 0),
    photo: !!s.face || s.presenters.length > 0,
    "own-video": own.some((m) => m.key.startsWith("cvid-")),
    "own-media": own.length > 0,
    "reel-video": false,
  };
  return (n) => !have[n];
}

export default function MakePage() {
  const leo = useLeoUser();
  if (leo === undefined) return <div className="min-h-[40vh]" aria-busy="true" />;
  if (!leo) return <NotFoundPage notOnAccount />;
  return <Gallery userId={leo.id} />;
}

function Gallery({ userId }: { userId: string }) {
  const [tab, setTab] = useUrlState<Tab>("tab", "videos", { allowed: TABS });
  const [show, setShow] = useUrlState<FormatFilter>("show", "all", { allowed: FORMAT_FILTERS });
  const update = useUrlUpdate();
  const leftOf = useUsesLeft(false);
  const [missing] = useState(() => readMissing(userId));
  const [brand] = useState(() => activeProfile(userId)?.name || "your brand");
  const [text, setText, q] = useUrlSearch("q");
  const statics = tab === "static";
  // a static format waits only for a photo, and only when the brand has none at all (StaticFormatPage's own rule)
  const [noPhoto] = useState(() => missing("product-photo") && !loadMedia(userId).some((m) => m.kind !== "video"));
  const staticLacks = (f: StaticFormat) => f.needs === "photo" && noPhoto;
  const filterStatics = (f: FormatFilter) => (f === "all" ? STATICS : STATICS.filter((x) => (f === "needs") === staticLacks(x)));
  // the chips count the whole tab; the search narrows what the picked chip shows
  const count = (f: FormatFilter) => (statics ? filterStatics(f).length : filterFormats(VIDEOS, f, missing).length);
  const labels: Record<FormatFilter, string> = { all: "All", ready: `Ready for ${brand}`, needs: "Needs something" };
  const sections = bySection(searchFormats(filterFormats(VIDEOS, show, missing), q));
  const staticList = searchFormats(filterStatics(show), q);
  const none = statics ? staticList.length === 0 : sections.length === 0;
  const what = statics ? "static ads" : "formats";

  return (
    <div className="space-y-5">
      <h1 className="font-serif text-2xl font-semibold leading-tight tracking-tight text-foreground sm:text-3xl">Formats</h1>

      {/* one row as Fastlane's Create: the two tabs, the chips, and the search on the right; a phone wraps it */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          {TABS.length > 1 && (
            <div role="tablist" aria-label="Formats" className="inline-flex gap-1 rounded-lg bg-muted/50 p-1">
              {([["videos", "Videos", VIDEOS.length], ["static", "Static ads", STATICS.length]] as const).map(([id, label, n]) => (
                <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-sm font-medium transition-colors ${TOUCH} ${tab === id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                  {label} <span className="tabular-nums text-xs text-muted-foreground">{n}</span>
                </button>
              ))}
            </div>
          )}
          <div role="group" aria-label={`Filter ${what}`} className="scrollbar-none -mx-4 flex max-w-full gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            {FORMAT_FILTERS.map((f) => {
              const n = count(f);
              return (
                <FilterChip key={f} active={show === f} count={n} disabled={n === 0 && show !== f} onClick={() => setShow(f)}>
                  {labels[f]}
                </FilterChip>
              );
            })}
          </div>
          <div className="relative w-full sm:ml-auto sm:w-56">
            <MagnifyingGlassIcon className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder={`Search ${what}`} aria-label={`Search ${what}`} className={`h-9 pl-8 ${TOUCH}`} />
          </div>
        </div>
        {!statics && <p className="text-xs text-muted-foreground">Video prices are for the default length. A longer video costs more.</p>}
      </div>

      {none ? (
        <div className="space-y-3 rounded-xl border border-dashed border-border p-8 text-center" role="status">
          <p className="text-sm text-muted-foreground">{q ? `No ${what} match "${q}".` : `No ${what} match this filter.`}</p>
          <Button variant="outline" onClick={() => { setText(""); update({ show: null, q: null }); }} className={TOUCH}>
            Show all
          </Button>
        </div>
      ) : statics ? (
        <ul className={GRID}>
          {staticList.map((f) => (
            <li key={f.slug} className="flex min-w-0">
              <StaticCard f={f} />
            </li>
          ))}
        </ul>
      ) : (
        sections.map((s) => (
          <section key={s.id} aria-labelledby={`make-${s.id}`} className="space-y-3">
            <h2 id={`make-${s.id}`} className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {s.title}
              <span className="tabular-nums tracking-normal">{s.list.length}</span>
            </h2>
            <ul className={GRID}>
              {s.list.map((f) => (
                <li key={f.slug} className="flex min-w-0">
                  <FormatCard f={f} left={f.cap ? leftOf(f.cap) : null} lacking={!!f.needs && missing(f.needs)} />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

// Fastlane's card: a bordered card, its picture inset on top, then the name, one line, the price pill and the need.
// A 9:16 poster when the format has a preview clip; without one a 4:3 drawn tile, so a page of formats with no
// previews yet is not a wall of phone-sized boxes; a static ad shows its 4:5 example.
const GRID = "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5";
const BOX = "flex w-full min-w-0 flex-col rounded-xl border border-border/60 bg-card p-1.5 transition-colors hover:border-primary/40";
const TILE = "relative w-full overflow-hidden rounded-lg bg-muted";
const CARD = "group flex flex-col gap-2 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const TEXT = "min-w-0 space-y-1 px-1 pb-1";
const PILL = "inline-flex max-w-full rounded-full border border-border px-2 py-0.5";

/** One format: poster or drawn storyboard, name, line, price, uses left, and what it still needs. The whole card is one link;
 * a missing need with a place to add it sits just under it as a second link. */
function FormatCard({ f, left, lacking }: { f: FormatDef; left: number | null; lacking: boolean }) {
  const [playing, setPlaying] = useState(false);
  const [broken, setBroken] = useState(false);
  const poster = !!f.preview && !broken;
  const play = () => poster && f.kind === "video" && window.matchMedia(PLAYS).matches && setPlaying(true);
  const stop = () => setPlaying(false);
  const price = f.price();
  const needsHref = lacking && f.needs ? NEED_HREFS[f.needs] : undefined;
  const need = lacking && f.needs && (
    <>
      <DiamondIcon weight="fill" className="h-3 w-3 shrink-0 text-warning" aria-hidden /> {NEED_LINES[f.needs]}
    </>
  );
  const card = (
    <Link to={formatHref(f)} state={{ back: true }} onMouseEnter={play} onMouseLeave={stop} onFocus={play} onBlur={stop} className={CARD}>
      <div className={`${TILE} ${f.preview ? "aspect-[9/16]" : "aspect-[4/3]"}`}>
        {poster ? (
          <img src={`/formats/${f.slug}.webp`} alt="" loading="lazy" onError={() => setBroken(true)} className="h-full w-full object-cover" />
        ) : (
          <FormatTile f={f} />
        )}
        {playing && (
          <>
            <video src={`/formats/${f.slug}.mp4`} muted loop autoPlay playsInline className="absolute inset-0 h-full w-full object-cover" />
            <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-background/85 px-2 py-0.5 text-[11px] font-medium text-foreground">
              <SpeakerXIcon className="h-3 w-3" aria-hidden /> Muted preview
            </span>
          </>
        )}
      </div>
      <div className={TEXT}>
        <p className="text-sm font-semibold leading-snug text-foreground">{f.name}</p>
        <p className="line-clamp-2 text-xs text-muted-foreground">{f.blurb}</p>
        <span className={PILL}>
          {price === null ? <span className="text-[11px] text-muted-foreground">No AI cost</span> : <PriceChip price={price} left={null} />}
        </span>
        {/* blank until today's count is read; "None left today" stays muted, since the card still opens */}
        {f.cap && <p className="min-h-4 text-[11px] tabular-nums text-muted-foreground">{chipText({ price: null, left, leo: false }).text}</p>}
        {need && !needsHref && <p className="flex items-center gap-1 text-[11px] text-muted-foreground">{need}</p>}
      </div>
    </Link>
  );
  // the need's own link sits inside the card, under the card's link (a link never holds another)
  return (
    <div className={BOX}>
      {card}
      {need && needsHref && (
        <Link to={needsHref} className={`flex items-center gap-1 self-start rounded px-1 text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${TOUCH}`}>
          {need}
        </Link>
      )}
    </div>
  );
}

/** One static ad format: its line, then what it works best with or needs. Opens its own page. */
function StaticCard({ f }: { f: StaticFormat }) {
  const extra = f.needs ? STATIC_NEED_LINES[f.needs].needs : f.best ? STATIC_NEED_LINES[f.best].best : null;
  const [broken, setBroken] = useState(false);
  return (
    <div className={BOX}>
      <Link to={staticFormatHref(f.slug)} state={{ back: true }} className={CARD}>
        <div className={`${TILE} aspect-[4/5]`}>
          {!broken ? (
            <img src={staticShotSrc(f.slug, 1)} alt="" loading="lazy" onError={() => setBroken(true)} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center">
              <ImageIcon className="h-8 w-8 text-muted-foreground/70" aria-hidden />
            </div>
          )}
        </div>
        <div className={TEXT}>
          <p className="text-sm font-semibold leading-snug text-foreground">{f.name}</p>
          <p className="line-clamp-2 text-xs text-muted-foreground">{f.blurb}</p>
          <span className={PILL}><PriceChip price={STATIC_PRICE} left={null} /></span>
          {extra && (
            <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <DiamondIcon weight="fill" className="h-3 w-3 shrink-0 text-warning" aria-hidden /> {extra}
            </p>
          )}
        </div>
      </Link>
    </div>
  );
}
