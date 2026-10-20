// Why this ad works (docs/north-star/items/find-ad-detail.md): one ad's drawer over the ad library (/swipe?tab=ads)
// and Their ads (/competitors), opened by ?ad=<id> (push, so Back closes it). Leo's sign-ins only: the pages that
// open it are his. Run length, rank among the advertiser's ads, placements and the proof line are arithmetic on
// the Ad Library's fields (src/lib/adDetail.ts); the Breakdown row is remix-teardown's own; nothing is stored.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { ExternalLink, ImageOff, Loader2, Wand2, X } from "lucide-react";
import CopyLinkButton from "@/components/CopyLinkButton";
import SaveButton from "@/components/SaveButton";
import BreakdownRow from "@/components/remix/BreakdownRow";
import RemixButton from "@/components/remix/RemixButton";
import { Button } from "@/components/ui/button";
import {
  type DetailAd, likeOfDetail, placementLabel, proofLine, rankAmong, remixWriteUrl, runLength, startedLabel, titleOf,
} from "@/lib/adDetail";
import { safeExternalUrl } from "@/lib/embed";
import { defaultOutput, whatRemixDoes } from "@/lib/remix";
import { brandName } from "@/lib/remixBrand";
import { fromAd, type RemixSource } from "@/lib/remixSource";
import { localTeardown } from "@/lib/remixTeardown";
import { useGoneItem, useUrlItem } from "@/lib/urlState";
import { useLeoUser } from "@/lib/useLeoOnly";
import { isVoiceProfileUsable, loadVoiceProfile } from "@/lib/voiceProfile";

const LABEL = "text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground";
const FORMAT_NAME: Record<DetailAd["format"], string> = { image: "Image", video: "Video", carousel: "Carousel", text: "Text" };

/**
 * The ?ad= item for a list of ads. An id not in the list yet (a link opened before a check finished) shows the
 * loading drawer while `waiting`, for 10 seconds at most; an id that never arrives is dropped with a line.
 */
export function useLinkedAd(list: DetailAd[], waiting: boolean) {
  const [id, open, close] = useUrlItem("ad");
  const ad = id ? (list.find((a) => a.id === id) ?? null) : null;
  const found = Boolean(ad);
  const [late, setLate] = useState<string | null>(null);
  useEffect(() => {
    if (!id || found) return;
    const t = window.setTimeout(() => setLate(id), 10_000);
    return () => window.clearTimeout(t);
  }, [id, found]);
  const loading = Boolean(id && !found && waiting && late !== id);
  useGoneItem("ad", !id || found ? true : loading ? undefined : false, "ad");
  return { id, ad, loading, open, close };
}

/** "What Remix does" for a source, in the words the Remix sheet uses for its defaults (decision 16). Leo only. */
export function WhatRemixBox({ source }: { source: RemixSource }) {
  const leo = useLeoUser();
  if (!leo) return null;
  const voice = loadVoiceProfile(leo.id);
  const text = whatRemixDoes(source, { keep: "structure", close: "balanced", as: [defaultOutput(source)] }, {
    brand: brandName(leo.id),
    hasVoice: isVoiceProfileUsable(voice),
    teardownCached: Boolean(localTeardown(leo.id, source)),
  });
  return (
    <div className="space-y-1 rounded-lg border border-primary/20 bg-primary/5 p-3">
      <p className={LABEL}>What Remix does</p>
      <p className="text-sm leading-relaxed text-foreground/85">{text}</p>
    </div>
  );
}

/** Portal, backdrop, Escape and focus: PostDetailDrawer's shell, two columns from 640 px. */
function Shell({ label, onClose, media, footer, children }: { label: string; onClose(): void; media: ReactNode; footer?: ReactNode; children: ReactNode }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCloseRef.current();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      opener?.focus?.();
    };
  }, []);

  // Portalled to <body> and over the Ask dock (60), as the post drawer is
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-stretch justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={label}>
      <button type="button" tabIndex={-1} aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" />
      <div className="relative flex h-full w-full flex-col overflow-hidden bg-background shadow-xl sm:h-auto sm:max-h-[92vh] sm:max-w-3xl sm:flex-row sm:rounded-2xl sm:border sm:border-border/70">
        <div className="absolute right-3 top-3 z-20 flex gap-2">
          {/* the address bar holds ?ad=, so this copies a link that opens this ad */}
          <CopyLinkButton label="Copy link to this ad" className="rounded-full bg-black/55 text-white backdrop-blur hover:bg-black/75 hover:text-white" />
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur transition-colors hover:bg-black/75 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="relative flex max-h-[45vh] min-h-[28vh] shrink-0 items-center justify-center overflow-hidden bg-black sm:max-h-none sm:min-h-[460px] sm:w-[46%]">{media}</div>
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">{children}</div>
          {footer && <div className="shrink-0 border-t border-border/60 bg-background p-3 sm:px-5">{footer}</div>}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** A linked ad that hasn't arrived yet (its competitor's check is still running). */
export function LoadingAdDrawer({ onClose }: { onClose(): void }) {
  return (
    <Shell label="Loading the ad" onClose={onClose} media={<div className="h-full min-h-[28vh] w-full animate-pulse bg-muted" />}>
      <p className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground" aria-live="polite">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading the ad
      </p>
      <div aria-hidden className="space-y-3">
        <div className="h-5 w-3/4 animate-pulse rounded bg-muted" />
        <div className="grid grid-cols-3 gap-2">{[0, 1, 2].map((k) => <div key={k} className="h-12 animate-pulse rounded-lg bg-muted" />)}</div>
        <div className="h-24 animate-pulse rounded-lg bg-muted" />
      </div>
    </Shell>
  );
}

function Media({ ad }: { ad: DetailAd }) {
  // Meta's links expire: a dead picture shows "No preview", a dead video falls back to the picture
  const [brokenPic, setBrokenPic] = useState(false);
  const [brokenVideo, setBrokenVideo] = useState(false);
  const meta = safeExternalUrl(ad.libraryUrl) ?? undefined;
  if (ad.video && !brokenVideo) {
    return (
      <video src={ad.video} poster={ad.image ?? undefined} controls playsInline preload="metadata" onError={() => setBrokenVideo(true)}
        className="h-full max-h-[45vh] w-full object-contain sm:max-h-[92vh]" aria-label={`${ad.advertiser}'s video ad`} />
    );
  }
  return (
    <>
      {ad.image && !brokenPic ? (
        <img src={ad.image} alt="" referrerPolicy="no-referrer" onError={() => setBrokenPic(true)} className="h-full max-h-[45vh] w-full object-contain sm:max-h-[92vh]" />
      ) : (
        <div className="flex h-full min-h-[28vh] w-full flex-col items-center justify-center gap-1 bg-muted text-xs text-muted-foreground">
          <ImageOff className="h-5 w-5" aria-hidden /> No preview
        </div>
      )}
      {ad.format === "video" && (
        <a href={meta} target="_blank" rel="noopener noreferrer"
          className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-black/75 px-3 py-1.5 text-xs font-semibold text-white hover:bg-black/90 [@media(pointer:coarse)]:min-h-11">
          <ExternalLink className="h-3.5 w-3.5" /> Video ad. Play it on Meta.
        </a>
      )}
    </>
  );
}

export default function AdDetailDrawer({ ad, list, onClose }: { ad: DetailAd; list: DetailAd[]; onClose(): void }) {
  const leo = useLeoUser();
  const [breakdown, setBreakdown] = useState(false);
  const [whole, setWhole] = useState(false);
  // a breakdown made here means Remix skips that step, so the box below is drawn again without it
  const [, tick] = useState(0);
  const now = Date.now();
  const source = fromAd(likeOfDetail(ad), now);
  const run = runLength(ad, now);
  const rank = rankAmong(ad, list, now);
  const placement = placementLabel(ad.platforms);
  const proof = proofLine(ad, list, now);
  const started = startedLabel(ad.start, now);
  const words = [ad.headline, ad.body, ad.cta].filter(Boolean).join("\n\n");
  const stats = [run, { big: FORMAT_NAME[ad.format], small: `${ad.format} ad` }, rank].filter((s): s is NonNullable<typeof s> => s !== null);
  const rows: [string, string][] = [
    ["Started", started ?? ""],
    ["Placement", placement],
    ["Hook", ad.hookFamily ? `${ad.hookFamily} hook` : ""],
    ["Proof", proof ?? ""],
  ];

  const footer = (
    <div className="flex items-center gap-2">
      <RemixButton size="default" className="min-w-0 flex-1" source={source} label={`${ad.advertiser}'s ad`}>
        <Button asChild className="min-w-0 flex-1 gap-2 bg-gradient-primary text-primary-foreground shadow-sm hover:opacity-95">
          <Link to={remixWriteUrl(ad)}><Wand2 className="h-4 w-4" /> Remix this</Link>
        </Button>
      </RemixButton>
      <SaveButton size="default" source={source} />
      <Button asChild variant="outline" className="gap-1.5 px-3">
        <a href={safeExternalUrl(ad.libraryUrl) ?? undefined} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4" /> Open on Meta</a>
      </Button>
    </div>
  );

  return (
    <Shell label={`${ad.advertiser}'s ad`} onClose={onClose} media={<Media ad={ad} />} footer={footer}>
      <div className="space-y-1 sm:pr-24">
        <p className="text-sm">
          <span className="font-semibold text-foreground">{ad.advertiser}</span> <span className="text-muted-foreground">Meta ad</span>
        </p>
        <h2 className="font-serif text-lg font-semibold leading-snug text-foreground [overflow-wrap:anywhere]">{titleOf(ad) || "Untitled ad"}</h2>
      </div>

      <dl className="grid grid-cols-3 gap-2">
        {stats.map((s) => (
          <div key={s.small} className="min-w-0 rounded-lg bg-muted/50 px-2.5 py-2">
            <dt className="sr-only">{s.small}</dt>
            <dd className="truncate text-base font-semibold leading-tight text-foreground">{s.big}</dd>
            <dd className="truncate text-[11px] text-muted-foreground">{s.small}</dd>
          </div>
        ))}
      </dl>

      <dl className="grid grid-cols-[5.5rem_1fr] gap-x-3 gap-y-2 text-sm">
        {rows.filter(([, v]) => v).map(([k, v]) => (
          <div key={k} className="contents">
            <dt className={`${LABEL} pt-0.5`}>{k}</dt>
            <dd className="min-w-0 text-foreground/85">{v}</dd>
          </div>
        ))}
      </dl>

      {leo && <BreakdownRow userId={leo.id} source={source} text={words} open={breakdown} onOpen={setBreakdown} onTeardown={() => tick((n) => n + 1)} />}
      <WhatRemixBox source={source} />

      {ad.body && (
        <div className="space-y-1">
          <p className={LABEL}>Full ad text</p>
          <p className={`whitespace-pre-line text-xs leading-relaxed text-muted-foreground [overflow-wrap:anywhere] ${whole ? "" : "line-clamp-4"}`}>{ad.body}</p>
          {ad.body.length > 220 && (
            <button type="button" onClick={() => setWhole((v) => !v)} aria-expanded={whole}
              className="inline-flex min-h-9 items-center py-1 text-xs font-semibold text-primary hover:underline sm:min-h-0">
              {whole ? "Show less" : "Read the whole ad"}
            </button>
          )}
        </div>
      )}
    </Shell>
  );
}
