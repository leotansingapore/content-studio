// The review queue on /campaigns/:id, under #queue (plan-review-queue, Leo only; docs/north-star/items/plan-review-queue.md):
// one post at a time with a strip of every post, or a grid (?view=grid). Keys 1 Make, 2 Swap, 3 Edit, 4 Skip and the
// arrows, never while typing or with a dialog open. The actions run outside React (src/lib/campaignActions.ts), so a
// Make or a Swap keeps going when the page is left; this only shows them. ?post=<n> is the post shown (replace), and
// the page's ?angle= filters the posts. Typed edits wait in this tab's sessionStorage until Save or Cancel.

import { useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AlertTriangle, Check, ChevronLeft, ChevronRight, Loader2, Slash } from "lucide-react";
import ComplianceChips from "@/components/ComplianceChips";
import PostPreview from "@/components/PostPreview";
import PriceChip from "@/components/PriceChip";
import { SlideThumb } from "@/components/slideshow/SlideCanvas";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ToastAction } from "@/components/ui/toast";
import { useToast } from "@/hooks/use-toast";
import { useUsesLeft } from "@/lib/aiUsage";
import { STILL_MAKING, aiBusy, pendingAvatar } from "@/lib/aiVideo";
import {
  AI_BUSY, AI_WAITING, SHOW_BUSY, SHORT_SCRIPT, SWAP_CAP_LINE, SWAP_MADE_LINE, WALL_BUSY, WRITING_LINE, droppedHook, editPost, isSwapping, makePost, makerOf,
  onActions, postSlides, postText, resumeMakes, savedWho, showDropLine, skipPost, swapPost, VIDEO_WORDS_LINE, videoCaption, videoPriceOf, videoUnderway, waitingFor,
  whenText, type MakeOutcome,
} from "@/lib/campaignActions";
import { FAILED_POST, PAUSED_LINE, retryFailed } from "@/lib/campaignJob";
import { FREE_FORMATS, keyAction, nextToReview, videosLeft, type Campaign, type CampaignPost, type QueueAction } from "@/lib/campaigns";
import { FORMAT_NAME, shortDay } from "@/lib/campaignWizard";
import { DEFAULT_BRAND, loadBrand } from "@/lib/carousel";
import { layoutSlide, renderSvg } from "@/lib/carouselLayout";
import { createCanvasMeasure, svgDataUrl } from "@/lib/carouselRender";
import { scanCompliance } from "@/lib/compliance";
import { keyToDate, timeLabel } from "@/lib/dueDates";
import { loadDrafts } from "@/lib/draftHistory";
import { links } from "@/lib/links";
import { MAS_FLAG } from "@/lib/presenter";
import { priceText } from "@/lib/prices";
import { loadSlideshows } from "@/lib/slideshow";
import { loadProjects } from "@/lib/videoProjects";
import { lookOf } from "@/lib/slideshowDraw";
import { onSlideshowJob, slideshowBusy, slideshowJob, stepText as showStep } from "@/lib/slideshowJob";
import { platformName } from "@/lib/socialConnect";
import { asTopic } from "@/lib/talkingHead";
import { dropTalk, goOnAtPrice, onTalkJob, talkBusy, talkJob } from "@/lib/talkingHeadJob";
import { useUrlState, withParam } from "@/lib/urlState";
import { useLeoOnly } from "@/lib/useLeoOnly";
import { ensureCaptionFonts } from "@/lib/videoMedia";
import { onWallJob, stepText as wallStep, wallBusy, wallJob } from "@/lib/wallJob";
import { DAILY_LIMITS } from "../../../supabase/functions/_shared/usageCaps.ts";

const BIG = "h-11 sm:h-10";
const LABEL = "text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground";
const SAFETY = "AI can make mistakes. Check each post before it goes out.";
const NO_VIDEOS = "No AI videos left today. Back at 8am Singapore time.";
const NO_VOICES = "No voiceovers left today. Back at 8am Singapore time.";
const UNREAD = "Couldn't read today's limits. Make still checks them.";
const KEYS: Record<"make" | "swap" | "edit" | "skip", string> = { make: "1", swap: "2", edit: "3", skip: "4" };
const STATE_WORD: Record<CampaignPost["state"], string> = {
  waiting: "waiting to be written", drafting: "being written", ready: "ready", failed: "could not be written", making: "being made", made: "made", skipped: "skipped",
};

type Words = Pick<CampaignPost, "hook" | "body" | "script" | "brief">;
/** The fields Edit opens: the hook and the body, the script, or the brief. */
const editFields = (f: CampaignPost["format"]): (keyof Words)[] =>
  f === "short-video" || f === "ai-video" ? ["hook", "script"] : f === "slideshow" || f === "wall" ? ["hook", "brief"] : ["hook", "body"];
const editKey = (campaignId: string, n: number) => `cs-campaign-edit-${campaignId}-${n}`;
function loadEdit(campaignId: string, n: number): Words | null {
  try {
    const w = JSON.parse(sessionStorage.getItem(editKey(campaignId, n)) ?? "null");
    return w && typeof w === "object" ? w : null;
  } catch {
    return null;
  }
}
function keepEdit(campaignId: string, n: number, w: Words | null): void {
  try {
    if (w) sessionStorage.setItem(editKey(campaignId, n), JSON.stringify(w));
    else sessionStorage.removeItem(editKey(campaignId, n));
  } catch {
    // blocked: the boxes keep the words until the page is left
  }
}

/** "Thu 8pm", or the day alone. */
const slotText = (p: Pick<CampaignPost, "day" | "time">) => `${shortDay(keyToDate(p.day)).split(" ")[0]}${p.time ? ` ${timeLabel(p.time)}` : ""}`;
const dayIndex = (c: Pick<Campaign, "startDay">, p: Pick<CampaignPost, "day">) => Math.round((keyToDate(p.day).getTime() - keyToDate(c.startDay).getTime()) / 86_400_000) + 1;
/** A short video script's HOOK, BODY and CTA lines as blocks; one block when it has no labels. */
const scriptBlocks = (script: string) => {
  const blocks = script.split("\n").map((l) => /^(HOOK|BODY|CTA)\s*:\s*(.*)$/i.exec(l.trim())).filter((m): m is RegExpExecArray => !!m && !!m[2]);
  return blocks.length ? blocks.map((m) => ({ label: m[1].toUpperCase(), text: m[2] })) : [{ label: "SCRIPT", text: script }];
};

function Key({ k }: { k: string }) {
  return <kbd className="ml-1.5 hidden rounded border border-current/30 px-1 font-sans text-[10px] font-medium opacity-70 lg:inline [@media(pointer:coarse)]:hidden">{k}</kbd>;
}

function useFontsReady(want: boolean) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!want) return;
    let live = true;
    void ensureCaptionFonts().then(() => live && setReady(true));
    return () => {
      live = false;
    };
  }, [want]);
  return ready;
}

/** What a made slideshow or wall says: the slideshow's cover, else the wall's words; null before Make (the hook and brief show). */
const madeWords = (p: CampaignPost, show: { title: string } | undefined) =>
  p.state !== "made" ? null : p.made?.kind === "slideshow" ? (show?.title ?? null) : (p.made?.text ?? null);

/**
 * A made slideshow's or wall's caption: the slideshow's, the wall's as its maker wrote it, else the editor's (a wall
 * made before captions were kept with the post); "" before Make.
 */
const madeCaption = (userId: string, p: CampaignPost, show: { caption?: string } | undefined) =>
  p.state !== "made" ? "" : show?.caption || p.made?.caption || (p.made?.kind === "video" && p.draftId ? loadProjects(userId).find((x) => x.draftId === p.draftId)?.caption : "") || "";

/** A carousel's slides drawn the way /carousel draws them from the same words, with the brand kit; nothing is stored. */
function CarouselSlides({ userId, p, all }: { userId: string; p: CampaignPost; all: boolean }) {
  const slides = useMemo(() => postSlides(p), [p]);
  const urls = useMemo(() => {
    const brand = loadBrand(userId) ?? DEFAULT_BRAND;
    const measure = createCanvasMeasure();
    return slides.map((s, i) => svgDataUrl(renderSvg(layoutSlide({ title: s.title, body: s.body, index: i, total: slides.length, brand }, measure))));
  }, [userId, slides]);
  const [at, setAt] = useState(0);
  if (!urls.length) return <p className="text-sm text-muted-foreground">These words make no slides yet. Edit them first.</p>;
  if (all) {
    return (
      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3" aria-label="Every slide">
        {urls.map((u, i) => <li key={i}><img src={u} alt={`Slide ${i + 1} of ${urls.length}`} className="w-full rounded-lg border border-border/60" /></li>)}
      </ol>
    );
  }
  const i = Math.min(at, urls.length - 1);
  return (
    <div className="space-y-2">
      <img src={urls[i]} alt={`Slide ${i + 1} of ${urls.length}`} className="mx-auto w-full max-w-[360px] rounded-lg border border-border/60" />
      <div className="flex items-center justify-center gap-2">
        <Button variant="ghost" size="icon" className="h-11 w-11" aria-label="Previous slide" disabled={i === 0} onClick={() => setAt(i - 1)}><ChevronLeft className="h-4 w-4" /></Button>
        <span className="text-xs tabular-nums text-muted-foreground">Carousel | slide {i + 1} of {urls.length}</span>
        <Button variant="ghost" size="icon" className="h-11 w-11" aria-label="Next slide" disabled={i === urls.length - 1} onClick={() => setAt(i + 1)}><ChevronRight className="h-4 w-4" /></Button>
      </div>
    </div>
  );
}

/** A made slideshow's slides, as Slideshows draws them. */
function MadeShow({ userId, id }: { userId: string; id: string }) {
  const show = loadSlideshows(userId).find((s) => s.id === id);
  const ready = useFontsReady(!!show);
  if (!show) return <p className="text-sm text-muted-foreground">This slideshow is no longer in Slideshows.</p>;
  const look = lookOf(userId, show);
  return (
    <ol className="flex gap-2 overflow-x-auto pb-1" aria-label={`${show.slides.length} slides`}>
      {show.slides.map((s) => <li key={s.id} className="w-24 shrink-0"><SlideThumb slide={s} size={show.size} look={look} ready={ready} className="h-auto w-full" /></li>)}
    </ol>
  );
}

export default function CampaignQueue({ userId, campaign: c, angle }: { userId: string; campaign: Campaign; angle: string | null }) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    const offs = [onActions(redraw), onSlideshowJob(redraw), onWallJob(redraw), onTalkJob(redraw)];
    return () => offs.forEach((off) => off());
  }, []);
  const [view, setView] = useUrlState<"one" | "grid">("view", "one", { allowed: ["one", "grid"] });
  const [postParam, setPostParam] = useUrlState("post", "");
  const [params] = useSearchParams();
  const leo = useLeoOnly();

  const sorted = [...c.posts].sort((a, b) => a.n - b.n);
  const posts = angle ? sorted.filter((p) => p.angleId === angle) : sorted;
  const open = (p: CampaignPost) => p.state !== "made" && p.state !== "skipped";
  // out of range (or filtered out) falls back to the first post not yet made
  const cur = posts.find((p) => p.n === Number(postParam)) ?? posts.find(open) ?? posts[0] ?? null;
  const running = c.posts.some((p) => makerOf(c.id, p.n) || isSwapping(c.id, p.n));
  const usesLeft = useUsesLeft(running);

  const [confirm, setConfirm] = useState<null | "video" | "full">(null);
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  const [all, setAll] = useState(false);
  const [work, setWork] = useState<Words | null>(null);
  useEffect(() => {
    setWork(cur ? loadEdit(c.id, cur.n) : null);
    setAll(false);
    setConfirm(null);
  }, [c.id, cur?.n]);
  // a reload left posts being made: a paid AI video waiting here carries on at no cost, any other is ready again
  useEffect(() => {
    for (const run of resumeMakes(userId, c.id)) void run.then((r) => report(r));
  }, [userId, c.id]);

  const strip = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const box = strip.current;
    const el = box?.querySelector<HTMLElement>('[aria-current="true"]');
    if (box && el) box.scrollLeft = el.offsetLeft - box.clientWidth / 2 + el.clientWidth / 2;
  }, [cur?.n, view]);

  const actRef = useRef<(a: QueueAction) => void>(() => {});
  useEffect(() => {
    if (view === "grid") return;
    const onKey = (e: KeyboardEvent) => {
      const a = keyAction(e);
      if (!a || confirm) return;
      e.preventDefault();
      actRef.current(a);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, confirm]);

  // ---- after the hooks ----

  const report = (r: MakeOutcome) => {
    // a video still being made after 20 minutes hasn't failed: it is picked up later at no cost (live-p5dog D4)
    if (r.ok === false) return void toast({ title: r.error, ...(r.error === STILL_MAKING ? {} : { variant: "destructive" as const }) });
    if (r.toast) toast({ title: r.toast, duration: 5000, action: <ToastAction altText="Undo" onClick={r.undo}>Undo</ToastAction> });
  };
  const goTo = (n: number) => setPostParam(String(n));
  /** The next written, unmade post in this view, after a Make or a Skip. */
  const moveOn = (from: number) => {
    const now = { posts: c.posts.filter((p) => !angle || p.angleId === angle) };
    const next = nextToReview(now, from);
    if (next !== null && next !== from) goTo(next);
  };

  if (!posts.length) return <p className="rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">No posts for this angle.</p>;
  if (!cur) return null;

  const left = (f: "ai-video" | "ai-voice" | "campaign-swap" | "remix-make") => usesLeft(f);
  const hasVideo = c.posts.some((p) => p.format === "ai-video" && p.state !== "skipped");
  const videos = videosLeft(left("ai-video"), left("ai-voice"));
  const maker = makerOf(c.id, cur.n);
  const swapping = isSwapping(c.id, cur.n);
  const who = cur.format === "ai-video" ? savedWho(userId) : null;
  const written = !!cur.hook && (cur.state === "ready" || (cur.state === "making" && !maker));
  // its paid video is still waiting on this device: Make picks it up at no cost, with no price and no ask
  // (a made post's job stays pending until the editor's join is done, which is not this)
  const waiting = cur.format === "ai-video" && cur.state === "making" && !maker && !!waitingFor(c, cur);
  // the video's price from its own script and voice, never under what Make charges (live-p5dog day 3)
  const videoPrice = videoPriceOf(userId, cur);
  // its AI video is being made here or its paid video waits at Higgsfield: new words wouldn't be the ones it speaks
  const underway = videoUnderway(c, cur);

  /** Why Make can't run on this post now; null when it can. */
  function makeReason(p: CampaignPost): string | null {
    if (p.state === "made" || p.state === "skipped" || makerOf(c.id, p.n)) return null;
    if (!p.hook || !(p.state === "ready" || p.state === "making")) return WRITING_LINE;
    if (p.format === "slideshow" && slideshowBusy()) return SHOW_BUSY;
    if (p.format === "wall" && wallBusy("wall")) return WALL_BUSY;
    if (p.format === "ai-video" && waitingFor(c, p)) return aiBusy() || talkBusy() ? AI_BUSY : null;
    // with Ask each time Make only hands the script to the editor, which checks today's limits at its own Make
    if (p.format === "ai-video" && savedWho(userId)) {
      if (left("ai-video") === 0) return NO_VIDEOS;
      if (left("ai-voice") === 0) return NO_VOICES;
      if (aiBusy() || talkBusy()) return AI_BUSY;
      if (pendingAvatar()) return AI_WAITING;
      if (asTopic(p.script ?? "", 15)) return SHORT_SCRIPT;
    }
    return null;
  }
  const makeOff = cur.state === "made" || cur.state === "skipped" || !!maker || swapping || !!makeReason(cur);
  const swapReason =
    cur.state === "made" ? SWAP_MADE_LINE : underway ? VIDEO_WORDS_LINE : !written || cur.state !== "ready" ? (cur.state === "skipped" || maker ? null : WRITING_LINE) : left("campaign-swap") === 0 ? SWAP_CAP_LINE : null;
  const swapOff = !!swapReason || swapping || !!maker || cur.state !== "ready";

  const run = async (p: CampaignPost) => {
    setConfirm(null);
    const r = await makePost(userId, c.id, p.n);
    if (r.ok && r.open) navigate(r.open);
    report(r);
    if (r.ok && FREE_FORMATS.includes(p.format)) moveOn(p.n);
  };
  const make = (p: CampaignPost, asked: "full" | null = null) => {
    if (makeOff) return void (makeReason(p) && toast({ title: makeReason(p)! }));
    if (asked !== "full" && droppedHook(loadDrafts(userId))) return setConfirm("full");
    if (p.format === "ai-video" && savedWho(userId) && !waitingFor(c, p)) return setConfirm("video");
    void run(p);
  };
  const swap = async (p: CampaignPost) => {
    if (swapOff) return void (swapReason && toast({ title: swapReason }));
    report(await swapPost(userId, c.id, p.n));
  };
  const madeLink = (p: CampaignPost) => {
    const id = p.draftId ?? "";
    if (p.made?.kind === "slideshow") return links.slideshow({ s: p.made.id });
    if (p.made?.kind === "video") return links.edit();
    return p.format === "carousel" ? links.carousel({ draft: id }) : links.generate({ draft: id });
  };
  const edit = (p: CampaignPost) => {
    if (p.state === "made") return navigate(madeLink(p));
    if (underway) return void toast({ title: VIDEO_WORDS_LINE });
    if (!p.hook || p.state !== "ready" || swapping) return void toast({ title: p.state === "skipped" ? "Skipped. Press Skip again to bring it back." : WRITING_LINE });
    const w = Object.fromEntries(editFields(p.format).map((f) => [f, p[f] ?? ""])) as Words;
    keepEdit(c.id, p.n, w);
    setWork(w);
  };
  const typed = (w: Words) => {
    keepEdit(c.id, cur.n, w);
    setWork(w);
  };
  const save = () => {
    if (!work) return;
    const line = editPost(userId, c.id, cur.n, work);
    if (line) return void toast({ title: line, variant: "destructive" });
    keepEdit(c.id, cur.n, null);
    setWork(null);
  };
  const cancel = () => {
    keepEdit(c.id, cur.n, null);
    setWork(null);
  };
  const skip = (p: CampaignPost) => {
    const r = skipPost(userId, c.id, p.n);
    report(r);
    if (r.ok && r.toast) moveOn(p.n);
  };
  const step = (by: -1 | 1) => {
    const i = posts.indexOf(cur) + by;
    if (posts[i]) goTo(posts[i].n);
  };
  actRef.current = (a) => {
    if (work && a !== "prev" && a !== "next") return;
    if (a === "make") make(cur);
    else if (a === "swap") void swap(cur);
    else if (a === "edit") edit(cur);
    else if (a === "skip") skip(cur);
    else step(a === "prev" ? -1 : 1);
  };

  // ---- the toolbar ----

  const kept = c.posts.filter((p) => p.state !== "skipped");
  const count = (f: CampaignPost["format"]) => kept.filter((p) => p.format === f).length;
  const tallies = [
    [kept.filter((p) => FREE_FORMATS.includes(p.format)).length, "free", "free"],
    [count("slideshow"), "slideshow", "slideshows"],
    [count("wall"), "wall of text", "walls of text"],
    [count("ai-video"), "AI video", "AI videos"],
  ].filter(([n]) => n) as [number, string, string][];
  const finished = posts.every((p) => !open(p));
  const lastDay = sorted.reduce((m, p) => (p.day > m ? p.day : m), "");

  const toolbar = (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <div role="group" aria-label="View" className="inline-flex rounded-lg border border-border/70 p-0.5">
        {(["one", "grid"] as const).map((v) => (
          <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}
            className={`h-11 rounded-md px-3 text-sm font-medium sm:h-9 ${view === v ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}>
            {v === "one" ? "One at a time" : "Grid"}
          </button>
        ))}
      </div>
      <p className="text-sm"><span className={LABEL}>Made</span> <span className="tabular-nums">{kept.filter((p) => p.state === "made").length} of {kept.length}</span></p>
      {hasVideo && (
        <p className="text-sm"><span className={LABEL}>AI videos left today</span> <span className="tabular-nums">{videos ?? "?"}</span></p>
      )}
      <p className="text-sm text-muted-foreground sm:ml-auto">{tallies.map(([n, one, many]) => `${n} ${n === 1 ? one : many}`).join(" | ")}</p>
    </div>
  );

  // ---- grid ----

  if (view === "grid") {
    const shows = loadSlideshows(userId);
    return (
      <div className="space-y-4">
        {toolbar}
        <ol className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {posts.map((p) => (
            <li key={p.n}>
              {/* a real link to the post, so a new tab and Copy link work; replace, as picking a post does */}
              <Link to={{ search: withParam(withParam(params, "view", null), "post", String(p.n)).toString() }} replace
                className={`flex h-full w-full flex-col gap-1.5 rounded-xl border border-border/60 bg-card p-3 text-left shadow-card hover:border-primary/40 ${p.state === "skipped" ? "opacity-50" : ""}`}>
                <span className="line-clamp-3 min-h-[3.75rem] text-sm font-medium [overflow-wrap:anywhere]">{madeWords(p, shows.find((s) => s.id === p.made?.id)) || p.hook || (p.state === "failed" ? FAILED_POST : "Waiting to be written.")}</span>
                <span className="text-xs text-muted-foreground">Day {dayIndex(c, p)} | {FORMAT_NAME[p.format]}</span>
                <span className="line-clamp-1 text-xs text-muted-foreground">{c.angles.find((a) => a.id === p.angleId)?.title}</span>
                <span className="mt-auto w-fit rounded-full border border-border/70 px-2 py-0.5 text-[11px]">{STATE_WORD[p.state]}</span>
              </Link>
            </li>
          ))}
        </ol>
        <p className="text-xs text-muted-foreground">{SAFETY}</p>
      </div>
    );
  }

  // ---- one at a time ----

  const angleTitle = c.angles.find((a) => a.id === cur.angleId)?.title ?? "";
  const text = postText(cur);
  const flags = (work
    ? scanCompliance(Object.values(work).filter(Boolean).join("\n"))
    : cur.mas ? [MAS_FLAG] : scanCompliance(text)
  ).filter((f) => !dismissed.has(`${cur.n}:${f.id}`));
  const show = cur.made?.kind === "slideshow" ? loadSlideshows(userId).find((s) => s.id === cur.made?.id) : undefined;
  const paused = c.waitUntil && Date.now() < Date.parse(c.waitUntil);
  const tj = maker === "talk" ? talkJob() : null;
  const priced = tj?.state === "priced" && tj.real ? tj.real : null;

  const square = (p: CampaignPost) => {
    const icon =
      p.state === "made" ? <Check className="h-4 w-4 text-success" aria-hidden />
      : p.state === "failed" ? <AlertTriangle className="h-4 w-4 text-warning" aria-hidden />
      : p.state === "making" ? <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden />
      : p.state === "skipped" ? <Slash className="h-4 w-4 text-muted-foreground" aria-hidden />
      : null;
    const look =
      p.state === "waiting" ? "border-dashed border-border bg-transparent"
      : p.state === "drafting" ? "animate-pulse border-border bg-muted"
      : p.state === "skipped" ? "border-border bg-muted/40 opacity-50"
      : "border-border/70 bg-card";
    return (
      <li key={p.n}>
        <button type="button" onClick={() => goTo(p.n)} aria-current={p === cur} aria-label={`Post ${p.n}, ${STATE_WORD[p.state]}`}
          className={`relative flex h-11 w-11 items-center justify-center overflow-hidden rounded-md border text-[8px] leading-tight ${look} ${p === cur ? "ring-2 ring-primary ring-offset-1 ring-offset-background" : ""}`}>
          {icon ?? (p.state === "ready" ? <span className="line-clamp-3 px-0.5 text-center text-muted-foreground" aria-hidden>{p.hook}</span> : <span className="text-[10px] tabular-nums text-muted-foreground" aria-hidden>{p.n}</span>)}
        </button>
      </li>
    );
  };

  const band = (line: string, to: string, label: string) => (
    <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-sm">
      <span>{line}</span>
      <Button asChild size="sm" variant="outline" className={BIG}><Link to={to}>{label}</Link></Button>
    </div>
  );

  const preview = (): ReactNode => {
    const p = cur;
    if (p.format === "text-post") return <PostPreview text={text} platform={c.platforms[0] ?? "linkedin"} format="text-post" />;
    if (p.format === "carousel") return <CarouselSlides userId={userId} p={p} all={all} />;
    if (p.format === "short-video") {
      return (
        <div className="space-y-2">
          {scriptBlocks(p.script ?? "").map((b, i) => (
            <div key={i} className="rounded-lg border border-border/60 bg-muted/20 p-3">
              <p className={LABEL}>{b.label}</p>
              <p className="mt-1 whitespace-pre-wrap text-sm">{b.text}</p>
            </div>
          ))}
          <p className="text-xs text-muted-foreground">About 30 seconds. You film it.</p>
        </div>
      );
    }
    const making = (what: ReactNode) => (
      <div className="space-y-1 rounded-lg border border-border/60 bg-muted/20 p-3">
        <p className={LABEL}>What we&apos;ll make</p>
        <p className="text-sm">{what}</p>
      </div>
    );
    if (p.format === "ai-video") {
      return (
        <div className="space-y-3">
          <p className="whitespace-pre-wrap rounded-lg border border-border/60 bg-card p-3 text-sm">{p.script}</p>
          {p.state !== "made" && !waiting &&
            making(
              <>
                {who ? `A 15-second AI video of ${who === "mine" ? "you" : "your presenter"} saying this script, made when you press Make.` : "A 15-second AI video of this script. You pick who appears when you press Make."}{" "}
                <PriceChip price={videoPrice} left={videos} />
              </>,
            )}
        </div>
      );
    }
    // slideshow and wall: the hook and brief until Make, then what the maker made (live-p5dog D8: a made slideshow's
    // cover said "4 ways to close out a sales day" under the campaign's hook)
    const made = madeWords(p, show);
    return (
      <div className="space-y-3">
        <div className="rounded-lg border border-border/60 bg-card p-3">
          {made ? <p className={`whitespace-pre-wrap [overflow-wrap:anywhere] ${show ? "font-semibold" : "text-sm"}`}>{made}</p> : (
            <>
              <p className="font-semibold [overflow-wrap:anywhere]">{p.hook}</p>
              {p.brief && <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm text-muted-foreground">{p.brief.split("\n").filter(Boolean).map((l, i) => <li key={i}>{l}</li>)}</ul>}
            </>
          )}
        </div>
        {p.state === "made" && p.made?.kind === "slideshow" ? <MadeShow userId={userId} id={p.made.id} />
          : p.state !== "made" && making(
            <>
              {p.format === "slideshow"
                ? `A slideshow from this hook and brief, with ${c.pictures === "mine" ? "photos from your Media" : "stock photos"}. The slides are written when you press Make.`
                : "A wall of text on a stock clip, from this hook and brief. The words are written when you press Make."}{" "}
              <PriceChip feature="remix-make" left={left("remix-make")} />
            </>,
          )}
        {p.format === "slideshow" && p.state === "ready" && showDropLine(userId) && <p className="text-sm text-warning">{showDropLine(userId)}</p>}
      </div>
    );
  };

  const stage = (): ReactNode => {
    const p = cur;
    if (p.state === "waiting") return <p className="py-10 text-center text-sm text-muted-foreground">{paused ? "Today's limit for writing campaign posts is used. The rest are written after 8am Singapore time." : "Waiting to be written."}</p>;
    if (p.state === "drafting" || swapping) {
      return (
        <div className="relative">
          <div className="h-72 animate-pulse rounded-xl bg-muted" aria-hidden />
          <p role="status" className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">{swapping ? "Swapping..." : "Writing this post..."}</p>
        </div>
      );
    }
    if (p.state === "failed") {
      return (
        <div className="space-y-3 py-8 text-center">
          <p className="text-sm">{p.error || FAILED_POST}</p>
          <Button variant="outline" className={BIG} onClick={() => { const line = retryFailed(userId, c.id); if (line) toast({ title: line, variant: "destructive" }); }}>Try again</Button>
        </div>
      );
    }
    return (
      <div className="space-y-3">
        {p.state === "making" && maker && (
          priced ? (
            <div role="status" className="space-y-2 rounded-lg border border-primary/25 bg-primary/5 p-3 text-sm">
              <p>The voiceover runs {Math.round(priced.seconds)} seconds, so this video costs {priceText(priced.price).replace(/^\w/, (x) => x.toLowerCase())}. Your voiceover is kept.</p>
              <div className="flex flex-wrap gap-2">
                <Button className={BIG} onClick={() => void goOnAtPrice(userId)}>Make it for US${priced.price.usd.toFixed(2)}</Button>
                <Button variant="ghost" className={BIG} onClick={dropTalk}>Not now</Button>
              </div>
            </div>
          ) : (
            <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              {(maker === "slideshow" ? showStep(slideshowJob() ?? { state: "writing", done: 0, of: 0 }) : maker === "wall" ? wallStep(wallJob() ?? { state: "writing" }) : tj?.step) || "Making it..."}
            </p>
          )
        )}
        {p.state === "made" && (p.made?.kind === "video"
          ? band(p.format === "wall" ? "Made. Open it in the editor to check the words and export." : "Made. Open it in the editor to add captions and export.", links.edit(), "Open in editor")
          : band(`On your calendar for ${whenText(p)}.`, links.calendar({ post: p.draftId }), "Open in My posts"))}
        {p.state === "skipped" && <p role="status" className="text-sm">Skipped. Press Skip again to bring it back.</p>}
        {p.error && (p.state === "ready" || (p.state === "making" && !maker)) && <p role="status" className={`text-sm ${p.error === STILL_MAKING ? "text-muted-foreground" : "text-warning"}`}>{p.error}</p>}
        <div className={p.state === "skipped" ? "opacity-40" : ""}>{preview()}</div>
      </div>
    );
  };

  const action = (k: keyof typeof KEYS, label: ReactNode, onClick: () => void, off: boolean, primary = false) => (
    // Check again is too long for a quarter of a phone's row, so it takes the row (390 px)
    <Button variant={primary ? "default" : "outline"} className={`${BIG} min-w-[4.5rem] flex-1 sm:flex-none ${primary && waiting ? "basis-full sm:basis-auto" : ""}`} aria-keyshortcuts={KEYS[k]} disabled={off} onClick={onClick}>
      {label}
      <Key k={KEYS[k]} />
    </Button>
  );
  // while this tab makes it, the progress on the stage says why; once it only waits at Higgsfield, this line does
  const reason = makeReason(cur) ?? (underway && !maker ? VIDEO_WORDS_LINE : cur.state === "ready" && swapReason === SWAP_CAP_LINE ? SWAP_CAP_LINE : null);
  const fieldLabel = (f: keyof Words) => (f === "hook" ? "Hook" : f === "script" ? "Script" : f === "brief" ? "Brief" : "Words");

  return (
    <div className="space-y-4">
      {toolbar}
      {finished && (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span>Nothing left to review.</span>
          {angle && <Button asChild variant="outline" className={BIG}><Link to={links.calendar({ view: "upcoming" })}>Open calendar</Link></Button>}
        </div>
      )}

      <div className="flex items-center gap-3">
        <ol ref={strip} aria-label="Posts" className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto p-1">{posts.map(square)}</ol>
        <div className="flex shrink-0 items-center gap-1">
          <span className="hidden text-xs text-muted-foreground lg:inline">Posts end {shortDay(keyToDate(lastDay))}</span>
          <span className="px-1 text-xs tabular-nums text-muted-foreground">Post {posts.indexOf(cur) + 1} of {posts.length}</span>
          <Button variant="ghost" size="icon" className="h-11 w-11" aria-label="Previous post" aria-keyshortcuts="ArrowLeft" disabled={posts.indexOf(cur) === 0} onClick={() => step(-1)}><ChevronLeft className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" className="h-11 w-11" aria-label="Next post" aria-keyshortcuts="ArrowRight" disabled={posts.indexOf(cur) === posts.length - 1} onClick={() => step(1)}><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>

      <div key={cur.n} className="grid items-start gap-5 rounded-xl border border-border/60 p-4 shadow-card duration-150 animate-in fade-in-0 motion-reduce:animate-none lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-4">
          {stage()}
          <div className="flex flex-wrap gap-2">
            {action("make", maker || cur.state === "making" && !written ? "Making..." : waiting ? "Check again" : cur.format === "ai-video" ? <>Make<span className="hidden sm:inline"> | {priceText(videoPrice)}</span></> : "Make", () => make(cur), makeOff || !!work, true)}
            {action("swap", swapping ? "Swapping..." : "Swap", () => void swap(cur), swapOff || !!work)}
            {action("edit", "Edit", () => edit(cur), !!work || !!maker || swapping || underway || !(cur.state === "made" || written))}
            {action("skip", "Skip", () => skip(cur), cur.state === "made" || cur.state === "drafting" || !!maker || swapping || !!work)}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {cur.state === "ready" && <PriceChip feature="campaign-swap" left={left("campaign-swap")} />}
            {reason && <p className="text-sm text-muted-foreground">{reason}</p>}
            {cur.format === "ai-video" && cur.state === "ready" && videos === null && <p className="text-sm text-muted-foreground">{UNREAD}</p>}
          </div>
          {confirm === "full" && (
            <div role="alertdialog" aria-label="My posts is full" className="space-y-3 rounded-xl border border-warning/40 bg-warning/10 p-4">
              <p className="text-sm">My posts is full, so this drops &quot;{droppedHook(loadDrafts(userId))}&quot; from it. Make anyway?</p>
              <div className="flex flex-wrap gap-2">
                <Button autoFocus className={BIG} onClick={() => (setConfirm(null), make(cur, "full"))}>Make anyway</Button>
                <Button variant="ghost" className={BIG} onClick={() => setConfirm(null)}>Cancel</Button>
              </div>
            </div>
          )}
          {confirm === "video" && (
            <div role="alertdialog" aria-label="Make this AI video?" className="space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
              <p className="font-medium">Make this AI video?</p>
              <p className="text-sm text-muted-foreground">
                {priceText(videoPrice)} in Higgsfield credits and the voiceover. {videos === null ? UNREAD : `${videos} of ${DAILY_LIMITS["ai-video"]} left today.`}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button autoFocus className={BIG} onClick={() => void run(cur)}>Make it</Button>
                <Button variant="ghost" className={BIG} onClick={() => setConfirm(null)}>Cancel</Button>
              </div>
            </div>
          )}
        </div>

        <aside aria-label={`Post ${cur.n}`} className="min-w-0 space-y-3 text-sm">
          <div className="flex items-center justify-between gap-2">
            <p className={LABEL}>Day {dayIndex(c, cur)} | {shortDay(keyToDate(cur.day))}</p>
            <span className="rounded-full border border-border/70 px-2 py-0.5 text-[11px]">{FREE_FORMATS.includes(cur.format) ? "Free" : cur.format === "ai-video" ? "AI video" : "Made at Make"}</span>
          </div>
          <p><span className={LABEL}>Format</span> {FORMAT_NAME[cur.format]}{cur.format === "carousel" ? ` | ${postSlides(cur).length} slides` : show ? ` | ${show.slides.length} slides` : ""}</p>
          <p>Angle: {angleTitle}</p>
          <p><span className={LABEL}>Goes out</span> {c.accountIds?.length ? `${c.platforms.map(platformName).join(", ")} | ${slotText(cur)}` : `You post it, ${slotText(cur)}`}</p>
          {cur.format === "carousel" && cur.hook && (
            <button type="button" className="min-h-11 text-primary hover:underline sm:min-h-0" aria-expanded={all} onClick={() => setAll(!all)}>{all ? "See one slide at a time" : "See every slide"}</button>
          )}
          {cur.format === "ai-video" && cur.state !== "made" && <Link to={links.people({ tab: "presenters" })} className="inline-flex min-h-11 items-center text-primary hover:underline sm:min-h-0">Choose who appears</Link>}
          {/* a launch film draws the brand's own screens in code for cents, in place of a paid AI video (formats-launch-film) */}
          {leo && cur.format === "ai-video" && cur.state !== "made" && (
            <Link to={links.makeFormat("launch-film", { campaign: c.id, post: cur.n })} className="inline-flex min-h-11 items-center text-primary hover:underline sm:min-h-0">Make it a launch film</Link>
          )}

          {work ? (
            <div className="space-y-2" onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); save(); } }}>
              {editFields(cur.format).map((f) => (
                <label key={f} className="block space-y-1">
                  <span className={LABEL}>{fieldLabel(f)}</span>
                  <Textarea value={work[f] ?? ""} rows={f === "hook" ? 2 : 8} onChange={(e) => typed({ ...work, [f]: e.target.value })} />
                </label>
              ))}
              <div className="flex gap-2">
                <Button className={BIG} onClick={save} disabled={!work.hook?.trim()}>Save</Button>
                <Button variant="ghost" className={BIG} onClick={cancel}>Cancel</Button>
              </div>
            </div>
          ) : cur.hook && cur.format !== "short-video" && (cur.format !== "ai-video" || cur.body?.trim()) ? (
            // a short video script has no caption of its own: the stage shows it already (live-p5w4 N5); an AI video
            // post with the writer's caption (body) shows it with its call to action, as the editor opens with it (live-p5dog D3)
            <div className="space-y-1">
              <p className={LABEL}>Caption | {platformName(c.platforms[0] ?? "linkedin")}</p>
              <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">
                {cur.format === "ai-video" ? videoCaption(cur)
                  : cur.format === "slideshow" || cur.format === "wall"
                    ? madeCaption(userId, cur, show) || (cur.state === "made" ? "Open it in the editor to see the caption." : "The caption is written when you press Make.")
                    : text}
              </p>
            </div>
          ) : null}
          {flags.length > 0 && <ComplianceChips flags={flags} onDismiss={(id) => setDismissed(new Set(dismissed).add(`${cur.n}:${id}`))} />}
        </aside>
      </div>
      <p className="text-xs text-muted-foreground">{SAFETY}</p>
    </div>
  );
}
