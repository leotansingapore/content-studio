// A campaign's ads group (plan-campaign, Leo only), first on the campaign page as Fastlane has it: a stack with
// "10 ads launch together", the layout mix and "N made, N drafts"; ?ads=all shows the grid (Ad 1 to Ad 10, each with
// its layout, Make or Redraw, Swap layout, Edit and Skip, every change with Undo; a draft that remixes an ad we hold a
// picture of shows that original). ?ads=send is the hand-off to AdLauncher: Send walks the made ads one after another
// (?sending=<n>), each in /image's own Run as an ad sheet with the campaign's settings filled in, so each is made
// PAUSED and only on its own Create paused press; the panel counts them and ends on a done state
// (src/lib/campaignAds.ts). Nothing here calls AdLauncher itself.

import { useEffect, useMemo, useReducer, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate } from "react-router-dom";
import { CheckCircle2, ChevronDown, ChevronUp, Loader2, Pencil, RefreshCw, Shuffle, Undo2, X } from "lucide-react";
import RunAsAdSheet from "@/components/image/RunAsAdSheet";
import PriceChip from "@/components/PriceChip";
import { Button } from "@/components/ui/button";
import { ToastAction } from "@/components/ui/toast";
import { useToast } from "@/hooks/use-toast";
import { LAUNCHES_CHANGED, loadLaunches } from "@/lib/adlauncher";
import { useUsesLeft } from "@/lib/aiUsage";
import type { MakeOutcome } from "@/lib/campaignActions";
import {
  adCounts, adViews, editAdLink, groupTitle, layoutMix, makeAd, nextToSend, notTaken, prefillSheet, redrawAd, sendBlock, sendPlan, sendProgress, skipAd, swapAdLayout,
  type AdView, type SendPlan,
} from "@/lib/campaignAds";
import type { Campaign } from "@/lib/campaigns";
import { usd } from "@/lib/campaignWizard";
import { DEFAULT_BRAND, loadBrand } from "@/lib/carousel";
import { renderSvg } from "@/lib/carouselLayout";
import { createCanvasMeasure, svgDataUrl } from "@/lib/carouselRender";
import { getFile } from "@/lib/deviceFiles";
import { LAYOUT_LABELS, layoutImage, mainWords } from "@/lib/imageLayout";
import { HEADSHOT, imageWrite, imageWriteBusy, loadImages, MAX_IMAGES, onImagesChanged, onImageWrite, swipePicture, type SavedImage } from "@/lib/images";
import { links } from "@/lib/links";
import { speakerFor } from "@/lib/remixBrand";
import { resolveSource } from "@/lib/resolveSource";
import { useUrlState } from "@/lib/urlState";
import { cn } from "@/lib/utils";

const HEAD = "text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground";
const CHIP = "rounded-full bg-background/90 px-2 py-0.5 text-[11px] font-semibold text-foreground shadow-sm";
const ICON = "h-11 w-11 sm:h-9 sm:w-9";

/** Each picture key's file as a data URL (an SVG never draws a blob: link); "" for one this device doesn't hold. */
function useFiles(keys: string[]): Record<string, string> {
  const [got, setGot] = useState<Record<string, string>>({});
  const want = keys.join();
  useEffect(() => {
    let live = true;
    for (const k of keys) {
      if (k in got) continue;
      void getFile(k)
        .catch(() => undefined)
        .then((b) => (b ? new Promise<string>((ok) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = () => ok(""); r.readAsDataURL(b); }) : ""))
        .then((url) => live && setGot((g) => ({ ...g, [k]: url })));
    }
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [want]);
  return got;
}

export default function AdsGroup({ userId, campaign: c }: { userId: string; campaign: Campaign }) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    const offs = [onImagesChanged(redraw), onImageWrite(redraw)];
    window.addEventListener(LAUNCHES_CHANGED, redraw);
    return () => {
      offs.forEach((off) => off());
      window.removeEventListener(LAUNCHES_CHANGED, redraw);
    };
  }, []);
  const [ads, setAds] = useUrlState<"" | "all" | "send">("ads", "", { allowed: ["all", "send"] });
  const busy = imageWriteBusy();
  const usesLeft = useUsesLeft(busy);
  const designs = loadImages(userId);
  const views = adViews(c, designs, imageWrite());
  const k = adCounts(views);

  // a made ad shows its own picture with its photo, drawn here as /image draws it
  const brand = useMemo(() => loadBrand(userId) ?? DEFAULT_BRAND, [userId]);
  const measure = useMemo(createCanvasMeasure, []);
  const files = useFiles([...new Set(views.flatMap((v) => (v.state === "made" && v.design?.pictureKey && v.design.pictureKey !== HEADSHOT ? [v.design.pictureKey] : [])))]);
  const photoOf = (key: string | undefined) => (key === HEADSHOT ? brand.photo : key ? files[key] : undefined) || undefined;
  const drawKey = views.map((v) => (v.state === "made" ? `${v.design?.id}${v.design?.updatedAt}${photoOf(v.design?.pictureKey)?.length ?? 0}` : "")).join();
  const drawn = (d: SavedImage) => layoutImage({ layout: d.layout, words: d.words, brand, font: d.font, paper: d.paper, align: d.align, picture: photoOf(d.pictureKey) }, d.size, measure);
  const pictures = useMemo(
    () =>
      Object.fromEntries(
        views.flatMap((v) => {
          const d = v.design;
          if (v.state !== "made" || !d) return [];
          try {
            return [[v.ad.n, svgDataUrl(renderSvg(drawn(d)))]];
          } catch {
            return [];
          }
        }),
      ) as Record<number, string>,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [drawKey, brand, measure],
  );

  // a draft that remixes a swipe ad shows the original it starts from (a competitor's own Meta link expires, so those show their name only)
  const originals = useMemo(
    () => Object.fromEntries((c.ads ?? []).flatMap((a) => { const src = a.source ? swipePicture(resolveSource(a.source.key, userId)) : null; return src ? [[a.n, src]] : []; })) as Record<number, string>,
    [c.ads, userId],
  );

  if (!views.length) return null;
  const open = ads !== "";
  const done = (r: MakeOutcome) => {
    if (r.ok === false) return void toast({ title: r.error, variant: "destructive" });
    toast({ title: r.toast, duration: 5000, action: <ToastAction altText="Undo" onClick={r.undo}>Undo</ToastAction> });
  };
  const edit = (n: number) => {
    const to = editAdLink(userId, c.id, n);
    if (to) navigate(to);
    else toast({ title: "Couldn't open it. Try again.", variant: "destructive" });
  };

  const tile = (v: AdView) => {
    const pic = pictures[v.ad.n];
    const original = pic ? undefined : originals[v.ad.n];
    const angle = c.angles.find((a) => a.id === v.ad.angleId);
    return (
      <li key={v.ad.n} className={cn("flex min-w-0 flex-col gap-2", v.state === "skipped" && "opacity-60")}>
        <div className={cn("relative aspect-[4/5] overflow-hidden rounded-lg border bg-muted/30", pic ? "border-border/60" : "border-dashed border-border")}>
          {pic ? (
            <img src={pic} alt={`Ad ${v.ad.n}, ${LAYOUT_LABELS[v.layout]}`} className="h-full w-full object-cover" />
          ) : (
            <>
              {original && <img src={original} alt={`The original ad from ${v.ad.source?.label}`} loading="lazy" className="absolute inset-0 h-full w-full object-cover opacity-45" />}
              <div className="relative flex h-full flex-col justify-end gap-1 bg-gradient-to-t from-background/90 via-background/40 to-transparent p-3 pt-10 text-xs">
                <p className="line-clamp-3 font-medium text-foreground [overflow-wrap:anywhere]">{angle?.title}</p>
                {v.ad.source && <p className="line-clamp-2 text-muted-foreground [overflow-wrap:anywhere]">{original ? "Original: " : "Remixes "}{v.ad.source.label}</p>}
              </div>
            </>
          )}
          {v.state !== "made" && (
            <span className={cn(CHIP, "absolute right-2 top-2 font-medium text-muted-foreground")}>
              {v.state === "making" ? "Making" : v.state === "skipped" ? "Skipped" : "Draft"}
            </span>
          )}
        </div>
        <div>
          {/* under the picture, never over it: a chip on a made ad hid its first words */}
          <p className={HEAD}>Ad {v.ad.n}</p>
          <p className="text-sm font-medium">{LAYOUT_LABELS[v.layout]}</p>
          {v.state !== "making" && v.ad.error && <p className="text-xs text-destructive [overflow-wrap:anywhere]">{v.ad.error}</p>}
          {v.state === "draft" && v.gone && <p className="text-xs text-muted-foreground">Its design dropped out of Your images.</p>}
        </div>
        <div className="mt-auto space-y-1">
          {v.state === "draft" && (
            // outline, so Send the ads stays the one strong button on the group
            <Button variant="outline" className="h-11 w-full sm:h-9" onClick={() => void makeAd(userId, c.id, v.ad.n).then(done)}>Make</Button>
          )}
          {v.state === "made" && (
            <Button variant="ghost" className="h-11 w-full gap-1.5 text-muted-foreground sm:h-9" disabled={busy} onClick={() => void redrawAd(userId, c.id, v.ad.n).then(done)}>
              <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Redraw
            </Button>
          )}
          {v.state === "making" && (
            <Button className="h-11 w-full gap-1.5 sm:h-9" disabled>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Making
            </Button>
          )}
          <div className="flex justify-between gap-1">
            <Button variant="ghost" size="icon" className={ICON} aria-label={`Swap Ad ${v.ad.n}'s layout`} title={v.state === "made" ? "A made ad's layout changes in Edit" : "Swap layout"}
              disabled={v.state === "made" || v.state === "making"} onClick={() => done(swapAdLayout(userId, c.id, v.ad.n))}>
              <Shuffle className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className={ICON} aria-label={`Edit Ad ${v.ad.n}`} title="Edit" disabled={v.state === "making"} onClick={() => edit(v.ad.n)}>
              <Pencil className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className={ICON} aria-label={v.state === "skipped" ? `Bring back Ad ${v.ad.n}` : `Skip Ad ${v.ad.n}`}
              title={v.state === "skipped" ? "Bring back" : "Skip"} disabled={v.state === "making"} onClick={() => done(skipAd(userId, c.id, v.ad.n))}>
              {v.state === "skipped" ? <Undo2 className="h-4 w-4" /> : <X className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </li>
    );
  };

  return (
    <section id="ads" aria-labelledby="ads-h" className="scroll-mt-20 space-y-4 rounded-xl border border-border/60 bg-card p-4 shadow-card sm:p-5">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        {/* the fanned stack: the first three ads */}
        <div aria-hidden className="relative h-20 w-[4.5rem] shrink-0">
          {views.slice(0, 3).map((v, i) => (
            <div key={v.ad.n} className="absolute inset-y-0 left-1 w-14 overflow-hidden rounded-md border border-border/70 bg-muted shadow-sm"
              style={{ transform: `rotate(${(i - 1) * 8}deg) translateX(${(i - 1) * 6}px)`, zIndex: 3 - i }}>
              {pictures[v.ad.n] && <img src={pictures[v.ad.n]} alt="" className="h-full w-full object-cover" />}
            </div>
          ))}
          <span className="absolute -bottom-1 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">
            {k.live} {k.live === 1 ? "ad" : "ads"}
          </span>
        </div>
        <div className="min-w-0 flex-[1_1_14rem] space-y-1">
          <h2 id="ads-h" className="font-serif text-xl font-semibold leading-tight">{groupTitle(k.live)}</h2>
          {k.live > 0 && <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]"><span className={HEAD}>Layouts</span> {layoutMix(views)}</p>}
          <p className="text-sm tabular-nums" aria-live="polite">
            <span className="font-semibold text-primary">{k.made} made</span>, {k.drafts} {k.drafts === 1 ? "draft" : "drafts"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="h-11 gap-1.5 sm:h-10" aria-expanded={open} aria-controls="ads-grid" onClick={() => setAds(open ? "" : "all")}>
            {open ? <>Hide ads <ChevronUp className="h-4 w-4" /></> : <>Show all {views.length} ads <ChevronDown className="h-4 w-4" /></>}
          </Button>
          {k.made > 0 && ads !== "send" && (
            <Button className="h-11 sm:h-10" onClick={() => setAds("send")}>Send the ads to AdLauncher</Button>
          )}
        </div>
      </div>

      {ads === "send" && (
        <SendPanel userId={userId} campaign={c} views={views} drafts={k.drafts} onClose={() => setAds("all")} onEdit={edit} preview={(n) => pictures[n] ?? ""}
          jpeg={(d) => { const x = drawn(d); return svgJpeg(renderSvg(x), x.width, x.height); }} />
      )}

      {open && (
        <div id="ads-grid" className="space-y-3 border-t border-border/60 pt-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className={HEAD}>Each Make or Redraw</p>
            <PriceChip feature="remix-make" left={usesLeft("remix-make")} />
          </div>
          {k.drafts > 0 && designs.length >= MAX_IMAGES && (
            <p className="text-xs text-warning">Your images keeps your newest {MAX_IMAGES}, so each ad made now drops your oldest image there.</p>
          )}
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">{views.map(tile)}</ul>
        </div>
      )}
    </section>
  );
}

/** The design as a JPEG at its own size, as /image hands it to the sheet. */
async function svgJpeg(svg: string, width: number, height: number): Promise<Blob> {
  const img = new Image();
  await new Promise<void>((ok, no) => {
    img.onload = () => ok();
    img.onerror = () => no(new Error("The image couldn't be drawn."));
    img.src = svgDataUrl(svg);
  });
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser can't draw images.");
  ctx.drawImage(img, 0, 0, width, height);
  return new Promise((ok, no) => canvas.toBlob((b) => (b ? ok(b) : no(new Error("The image couldn't be created."))), "image/jpeg", 0.92));
}

/** One ad in Run as an ad, with the campaign's settings written into the sheet's kept form before it opens. */
function SendSheet({ userId, campaign: c, view: v, plan, preview, jpeg, onClose }: {
  userId: string; campaign: Campaign; view: AdView & { design: SavedImage }; plan: SendPlan; preview: string; jpeg: (d: SavedImage) => Promise<Blob>; onClose: () => void;
}) {
  useState(() => prefillSheet(c, v, plan));
  const d = v.design;
  return (
    <RunAsAdSheet
      userId={userId}
      designId={d.id}
      draftId={d.draftId}
      headline={mainWords(d.layout, d.words)}
      text={d.words.caption || (d.layout === "headline" ? d.words.line : "") || ""}
      preview={preview}
      picture={() => jpeg(d)}
      person={speakerFor(userId) === "person"}
      // shortcut: Jev's MAS answer lives with the write on /image, not the design; the sheet's own word scan still runs. Keep the flag on the ad if a missed warning ever shows.
      masWarn={false}
      onClose={onClose}
    />
  );
}

/**
 * ?ads=send: the campaign's settings, each made ad's state, and the walk. Send opens the first ad not yet in
 * AdLauncher in Run as an ad; once it is made paused there, closing the sheet opens the next, to a done state.
 */
function SendPanel({ userId, campaign: c, views, drafts, onClose, onEdit, preview, jpeg }: {
  userId: string; campaign: Campaign; views: AdView[]; drafts: number; onClose: () => void; onEdit: (n: number) => void;
  preview: (n: number) => string; jpeg: (d: SavedImage) => Promise<Blob>;
}) {
  const [sending, setSending] = useUrlState("sending", "");
  const [stopped, setStopped] = useState<number | null>(null);
  const plan = sendPlan(c, views, loadLaunches(userId));
  const k = sendProgress(plan);
  const next = nextToSend(plan);
  const sent = (v: AdView) => plan.sent.includes(v.design?.id ?? "");
  const cur = plan.ads.find((v) => String(v.ad.n) === sending && !sendBlock(v)) as (AdView & { design: SavedImage }) | undefined;
  if (!c.budget) return null;
  const start = (v: AdView) => {
    setStopped(null);
    setSending(String(v.ad.n));
  };
  // the sheet closed: on to the next ad when this one was made, else the walk stops here with nothing lost
  const closed = () => {
    if (!cur) return setSending("");
    const now = sendPlan(c, views, loadLaunches(userId));
    const made = now.sent.includes(cur.design.id);
    const on = made ? nextToSend(now, cur.ad.n) : null;
    setStopped(made || !nextToSend(now) ? null : cur.ad.n);
    setSending(on ? String(on.ad.n) : "");
  };
  const after = cur && sent(cur) ? nextToSend(plan, cur.ad.n) : null;
  return (
    <div role="region" aria-labelledby="send-h" className="space-y-3 rounded-lg border border-border/60 bg-muted/20 p-4">
      <h3 id="send-h" className="text-sm font-semibold">Send the ads to AdLauncher</h3>
      {k.done ? (
        <div role="status" className="space-y-1 rounded-lg border border-success/40 bg-success/10 p-3">
          <p className="flex items-center gap-2 font-semibold"><CheckCircle2 className="h-5 w-5 shrink-0 text-success" aria-hidden /> {k.of === 1 ? "Your ad is" : `All ${k.of} ads are`} paused in AdLauncher</p>
          <p className="text-sm text-muted-foreground">Nothing spends until you switch {k.of === 1 ? "it" : "them"} on there.{drafts > 0 ? ` ${drafts} ${drafts === 1 ? "draft is" : "drafts are"} still to make.` : ""}</p>
        </div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">Each one opens Run as an ad with these filled in, one after another. AdLauncher makes it paused, and nothing spends until you switch it on there.</p>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
            <dt className="text-muted-foreground">Budget</dt>
            <dd>{plan.ads.length ? `${usd(c.budget.daily)} a day across ${plan.ads.length} ${plan.ads.length === 1 ? "ad" : "ads"}, ${usd(plan.perAd)} each` : `${usd(c.budget.daily)} a day`}</dd>
            <dt className="text-muted-foreground">Days</dt>
            <dd>{plan.days}</dd>
            <dt className="text-muted-foreground">Opens</dt>
            <dd className="[overflow-wrap:anywhere]">{c.budget.url}</dd>
          </dl>
          <div className="space-y-1">
            <p className={HEAD}>Set these in AdLauncher</p>
            <ul className="list-disc space-y-0.5 pl-5 text-sm">{notTaken(c.budget).map((t) => <li key={t}>{t}</li>)}</ul>
          </div>
        </>
      )}
      {k.of > 0 && (
        <div className="space-y-1.5">
          <p className="text-sm tabular-nums" aria-live="polite"><span className="font-semibold">{k.sent} of {k.of}</span> paused in AdLauncher</p>
          <div role="progressbar" aria-label="Ads sent" aria-valuemin={0} aria-valuemax={k.of} aria-valuenow={k.sent} className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-success transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${(k.sent / k.of) * 100}%` }} />
          </div>
        </div>
      )}
      {stopped !== null && !k.done && <p role="status" className="text-sm">Stopped at Ad {stopped}. Nothing was made for it, and what you typed is kept.</p>}
      <ul className="divide-y divide-border/60 rounded-lg border border-border/60 bg-card">
        {plan.ads.map((v) => {
          const block = sendBlock(v);
          return (
            <li key={v.ad.n} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
              <span className="min-w-0 flex-1 text-sm">
                <span className="font-medium">Ad {v.ad.n}</span>, {LAYOUT_LABELS[v.layout]}
                {block && !sent(v) && <span className="block text-xs text-muted-foreground">{block}</span>}
              </span>
              {sent(v) ? (
                <span className="rounded-full border border-success/40 bg-success/10 px-2.5 py-0.5 text-xs font-medium text-success">Paused in AdLauncher</span>
              ) : block ? (
                <Button variant="outline" size="sm" className="h-11 sm:h-9" onClick={() => onEdit(v.ad.n)}>Edit</Button>
              ) : (
                <Button variant="ghost" size="sm" className="h-11 sm:h-9" onClick={() => start(v)}>Send this one</Button>
              )}
            </li>
          );
        })}
      </ul>
      {drafts > 0 && !k.done && <p className="text-xs text-muted-foreground">{drafts} {drafts === 1 ? "draft waits" : "drafts wait"} until {drafts === 1 ? "it's" : "they're"} made.</p>}
      {k.blocked > 0 && !next && !k.done && <p className="text-xs text-muted-foreground">The rest need an edit before they can go.</p>}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" className="h-11 sm:h-10" onClick={onClose}>Close</Button>
        {k.done ? (
          <Button asChild className="h-11 sm:h-10"><Link to={links.adlauncher()}>See them in AdLauncher</Link></Button>
        ) : next && (
          <Button className="h-11 sm:h-10" onClick={() => start(next)}>
            {k.sent || stopped !== null ? `Send the ${k.of - k.sent - k.blocked} left` : k.of === 1 ? "Send the ad" : `Send the ${k.of - k.blocked} ads`}
          </Button>
        )}
      </div>
      {cur && (
        <>
          <SendSheet key={cur.design.id} userId={userId} campaign={c} view={cur} plan={plan} preview={preview(cur.ad.n)} jpeg={jpeg} onClose={closed} />
          {/* over the sheet (z-80): where the walk is, and the way on once this ad is made */}
          {createPortal(
            // on a phone the way on sits under the thumb, where the sheet's footer was
            <div className={cn("pointer-events-none fixed z-[85] sm:bottom-auto sm:left-auto sm:right-[496px] sm:top-3 sm:translate-x-0",
              after || sent(cur) ? "inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+1rem)] sm:inset-x-auto" : "left-1/2 top-2.5 -translate-x-1/2")}>
              {after || sent(cur) ? (
                <Button className="pointer-events-auto h-11 w-full shadow-elegant sm:h-9 sm:w-auto" onClick={closed}>{after ? `Next: Ad ${after.ad.n}` : "Done"}</Button>
              ) : (
                <span role="status" className="rounded-full border border-border/70 bg-background px-3 py-1 text-xs font-medium tabular-nums shadow-sm">
                  Ad {plan.ads.indexOf(cur) + 1} of {k.of}
                </span>
              )}
            </div>,
            document.body,
          )}
        </>
      )}
    </div>
  );
}
