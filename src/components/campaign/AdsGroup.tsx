// A campaign's ads group (plan-campaign, Leo only), first on the campaign page as Fastlane has it: a stack with
// "10 ads launch together", the layout mix and "N made, N drafts"; ?ads=all shows the grid (Ad 1 to Ad 10, each with
// its layout, Make, Swap layout, Edit and Skip, every change with Undo); ?ads=send adds the hand-off to AdLauncher,
// where each made ad opens /image's Run as an ad with the campaign's settings filled in (src/lib/campaignAds.ts).

import { useEffect, useMemo, useReducer } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, ChevronUp, Loader2, Pencil, Shuffle, Undo2, X } from "lucide-react";
import PriceChip from "@/components/PriceChip";
import { Button } from "@/components/ui/button";
import { ToastAction } from "@/components/ui/toast";
import { useToast } from "@/hooks/use-toast";
import { LAUNCHES_CHANGED, loadLaunches } from "@/lib/adlauncher";
import { useUsesLeft } from "@/lib/aiUsage";
import type { MakeOutcome } from "@/lib/campaignActions";
import {
  adCounts, adViews, editAdLink, groupTitle, handOff, layoutMix, makeAd, notTaken, sendBlock, sendPlan, skipAd, swapAdLayout, type AdView,
} from "@/lib/campaignAds";
import type { Campaign } from "@/lib/campaigns";
import { usd } from "@/lib/campaignWizard";
import { DEFAULT_BRAND, loadBrand } from "@/lib/carousel";
import { renderSvg } from "@/lib/carouselLayout";
import { createCanvasMeasure, svgDataUrl } from "@/lib/carouselRender";
import { LAYOUT_LABELS, layoutImage } from "@/lib/imageLayout";
import { imageWrite, imageWriteBusy, loadImages, MAX_IMAGES, onImagesChanged, onImageWrite } from "@/lib/images";
import { useUrlState } from "@/lib/urlState";
import { cn } from "@/lib/utils";

const HEAD = "text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground";
const CHIP = "rounded-full bg-background/90 px-2 py-0.5 text-[11px] font-semibold text-foreground shadow-sm";
const ICON = "h-11 w-11 sm:h-9 sm:w-9";

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

  // a made ad shows its own picture, drawn here as /image draws it (its photo stays on /image)
  const brand = useMemo(() => loadBrand(userId) ?? DEFAULT_BRAND, [userId]);
  const measure = useMemo(createCanvasMeasure, []);
  const drawKey = views.map((v) => (v.state === "made" ? `${v.design?.id}${v.design?.updatedAt}` : "")).join();
  const pictures = useMemo(
    () =>
      Object.fromEntries(
        views.flatMap((v) => {
          const d = v.design;
          if (v.state !== "made" || !d) return [];
          try {
            return [[v.ad.n, svgDataUrl(renderSvg(layoutImage({ layout: d.layout, words: d.words, brand, font: d.font, paper: d.paper, align: d.align }, d.size, measure)))]];
          } catch {
            return [];
          }
        }),
      ) as Record<number, string>,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [drawKey, brand, measure],
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
    const angle = c.angles.find((a) => a.id === v.ad.angleId);
    return (
      <li key={v.ad.n} className={cn("flex min-w-0 flex-col gap-2", v.state === "skipped" && "opacity-60")}>
        <div className={cn("relative aspect-[4/5] overflow-hidden rounded-lg border bg-muted/30", pic ? "border-border/60" : "border-dashed border-border")}>
          {pic ? (
            <img src={pic} alt={`Ad ${v.ad.n}`} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full flex-col justify-end gap-1 p-3 pt-10 text-xs">
              <p className="line-clamp-3 font-medium text-foreground [overflow-wrap:anywhere]">{angle?.title}</p>
              {v.ad.source && <p className="line-clamp-2 text-muted-foreground [overflow-wrap:anywhere]">Remixes {v.ad.source.label}</p>}
            </div>
          )}
          <span className={cn(CHIP, "absolute left-2 top-2")}>Ad {v.ad.n}</span>
          {v.state !== "made" && (
            <span className={cn(CHIP, "absolute right-2 top-2 font-medium text-muted-foreground")}>
              {v.state === "making" ? "Making" : v.state === "skipped" ? "Skipped" : "Draft"}
            </span>
          )}
        </div>
        <div>
          <p className={HEAD}>Layout</p>
          <p className="text-sm font-medium">{LAYOUT_LABELS[v.layout]}</p>
          {v.state === "draft" && v.ad.error && <p className="text-xs text-destructive [overflow-wrap:anywhere]">{v.ad.error}</p>}
          {v.state === "draft" && v.gone && <p className="text-xs text-muted-foreground">Its design dropped out of Your images.</p>}
        </div>
        <div className="mt-auto space-y-1">
          {v.state === "draft" && (
            // outline, so Send the ads stays the one strong button on the group
            <Button variant="outline" className="h-11 w-full sm:h-9" onClick={() => void makeAd(userId, c.id, v.ad.n).then(done)}>Make</Button>
          )}
          {v.state === "making" && (
            <Button className="h-11 w-full gap-1.5 sm:h-9" disabled>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Making
            </Button>
          )}
          <div className="flex justify-between gap-1">
            <Button variant="ghost" size="icon" className={ICON} aria-label={`Swap Ad ${v.ad.n}'s layout`} title="Swap layout"
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

      {ads === "send" && <SendPanel userId={userId} campaign={c} views={views} drafts={k.drafts} onClose={() => setAds("all")} onEdit={edit} />}

      {open && (
        <div id="ads-grid" className="space-y-3 border-t border-border/60 pt-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className={HEAD}>Each Make</p>
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

/** ?ads=send: each made ad on its way to Run as an ad, the settings it carries, and the ones AdLauncher sets itself. */
function SendPanel({ userId, campaign: c, views, drafts, onClose, onEdit }: {
  userId: string; campaign: Campaign; views: AdView[]; drafts: number; onClose: () => void; onEdit: (n: number) => void;
}) {
  const navigate = useNavigate();
  const plan = sendPlan(c, views, loadLaunches(userId));
  const next = plan.ads.find((v) => !plan.sent.includes(v.design?.id ?? "") && !sendBlock(v));
  if (!c.budget) return null;
  return (
    <div role="region" aria-labelledby="send-h" className="space-y-3 rounded-lg border border-border/60 bg-muted/20 p-4">
      <h3 id="send-h" className="text-sm font-semibold">Send the ads to AdLauncher</h3>
      <p className="text-sm text-muted-foreground">Each one opens Run as an ad with these filled in. AdLauncher makes it paused, and nothing spends until you switch it on there.</p>
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
      <ul className="divide-y divide-border/60 rounded-lg border border-border/60 bg-card">
        {plan.ads.map((v) => {
          const sent = plan.sent.includes(v.design?.id ?? "");
          const block = sendBlock(v);
          return (
            <li key={v.ad.n} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
              <span className="min-w-0 flex-1 text-sm">
                <span className="font-medium">Ad {v.ad.n}</span>, {LAYOUT_LABELS[v.layout]}
                {block && !sent && <span className="block text-xs text-muted-foreground">{block}</span>}
              </span>
              {sent ? (
                <span className="rounded-full border border-success/40 bg-success/10 px-2.5 py-0.5 text-xs font-medium text-success">Paused in AdLauncher</span>
              ) : block ? (
                <Button variant="outline" size="sm" className="h-11 sm:h-9" onClick={() => onEdit(v.ad.n)}>Edit</Button>
              ) : (
                <Button variant={v === next ? "default" : "outline"} size="sm" className="h-11 sm:h-9" onClick={() => {
                  const to = handOff(c, v, plan);
                  if (to) navigate(to);
                }}>
                  Run as an ad
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      {drafts > 0 && <p className="text-xs text-muted-foreground">{drafts} {drafts === 1 ? "draft waits" : "drafts wait"} until {drafts === 1 ? "it's" : "they're"} made.</p>}
      <div className="flex justify-end">
        <Button variant="ghost" className="h-11 sm:h-10" onClick={onClose}>Close</Button>
      </div>
    </div>
  );
}
