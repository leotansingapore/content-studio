// /make/slideshow (docs/north-star/items/formats-slideshow.md): a topic, or a remix of a slideshow that did well,
// made into photo slides with words on them. The run is src/lib/slideshowJob.ts (outside React, so leaving the page
// keeps it going); the result is a Slideshow that /slideshow edits.
//
// URL (docs/deep-links.md): source=<RemixSource key> (MakeFormatPage resolves it), from=topic|remix, mention=no,
// size=9x16, pictures=mine, tab=original, pick=open, slide=<n> and go=1 (read once, then removed) replace;
// show=<slideshow id> pushes.

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AlertTriangle, CalendarClock, ChevronLeft, ChevronRight, Copy, Download, Loader2, Pencil, Save } from "lucide-react";
import FormatShell from "@/components/make/FormatShell";
import { OriginalPane } from "@/components/OriginalPane";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FilterChip } from "@/components/ui/filter-chip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatBySlug } from "@/data/formats";
import { useToast } from "@/hooks/use-toast";
import { slideFileName } from "@/lib/carousel";
import { downloadBlob } from "@/lib/carouselRender";
import { scanCompliance } from "@/lib/compliance";
import { draftsChanged, getDraftById, upsertDraft } from "@/lib/draftHistory";
import { fromFollowPost, fromTopPost, rememberSource, type RemixSource } from "@/lib/remixSource";
import { loadFollowing } from "@/lib/following";
import { links } from "@/lib/links";
import { loadMedia } from "@/lib/mediaLibrary";
import { brandName } from "@/lib/remixBrand";
import { FRAME_W, frameHeight, loadSlideshows, onSlideshowsChanged, saveSlideshow, slideshowToDraft, type Slideshow as Show } from "@/lib/slideshow";
import { MissingPictureError, bitmapOf, logoOf, lookOf, paintSlide, slidePicture, slideshowPngs, type SlideLook } from "@/lib/slideshowDraw";
import {
  onSlideshowJob,
  slideshowBusy,
  slideshowJob,
  startFrom,
  startSlideshow,
  stepText,
  type ShowFrom,
  type ShowPictures,
  type SlideshowAsk,
  type SlideshowJob,
} from "@/lib/slideshowJob";
import { socialConnectShown } from "@/lib/socialConnect";
import { compactNum, getAllTopPosts } from "@/lib/topPosts";
import { useUrlFlag, useUrlItem, useUrlState, useUrlUpdate } from "@/lib/urlState";
import { cn } from "@/lib/utils";
import { ensureCaptionFonts } from "@/lib/videoMedia";

const SIZES = ["4x5", "9x16"] as const;
type Size = (typeof SIZES)[number];
const SIZE_LABELS: Record<Size, string> = { "4x5": "4:5", "9x16": "9:16" };
const WORDS_KEY = "cs-make-slideshow";
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

function useJob(): SlideshowJob | null {
  const [job, setJob] = useState(slideshowJob);
  useEffect(() => onSlideshowJob(setJob), []);
  return job;
}

/** The typed topic and steer, kept on this device so leaving the page never loses them. */
function useWords(): [{ topic: string; note: string }, (w: { topic: string; note: string }) => void] {
  const [words, setWords] = useState(() => {
    try {
      const w = JSON.parse(localStorage.getItem(WORDS_KEY) ?? "{}");
      return { topic: typeof w.topic === "string" ? w.topic : "", note: typeof w.note === "string" ? w.note : "" };
    } catch {
      return { topic: "", note: "" };
    }
  });
  const save = (w: { topic: string; note: string }) => {
    setWords(w);
    try {
      localStorage.setItem(WORDS_KEY, JSON.stringify(w));
    } catch {
      // the fields still hold it for this visit
    }
  };
  return [words, save];
}

/** A saved slideshow by id, current as the editor or a job saves it. */
function useShow(userId: string, id: string | null | undefined): Show | null {
  const [shows, setShows] = useState(() => loadSlideshows(userId));
  useEffect(() => onSlideshowsChanged(() => setShows(loadSlideshows(userId))), [userId]);
  return (id && shows.find((s) => s.id === id)) || null;
}

/** "@handle | 1.2K likes" */
const metaOf = (s: RemixSource) => [s.author, s.numbers?.likes ? `${compactNum(s.numbers.likes)} likes` : ""].filter(Boolean).join(" | ");

/** The swipe file's carousels and any a followed account posted, most engaging first (engagementScore). */
function trendingSlideshows(userId: string): RemixSource[] {
  const top = getAllTopPosts().map((p) => fromTopPost(p, { id: p.advisorId, name: p.advisorName, handle: p.handle }));
  const followed = loadFollowing(userId).flatMap((a) => a.posts.map((p) => fromFollowPost(a, p)));
  const score = (s: RemixSource) => (s.numbers?.likes ?? 0) + 3 * (s.numbers?.comments ?? 0);
  return [...top, ...followed].filter((s) => s.format === "carousel").sort((a, b) => score(b) - score(a));
}

export default function Slideshow({ userId, source }: { userId: string; source: RemixSource | null }) {
  const def = formatBySlug("slideshow")!;
  const [params] = useSearchParams();
  const update = useUrlUpdate();
  const job = useJob();
  const busy = !!job && slideshowBusy();
  const gone = !!params.get("source") && !source;
  const [from] = useUrlState<ShowFrom>("from", startFrom(source), { allowed: ["topic", "remix"] });
  const [mention] = useUrlState("mention", "yes", { allowed: ["yes", "no"] });
  const [size] = useUrlState<Size>("size", "4x5", { allowed: SIZES });
  const [pictures] = useUrlState<ShowPictures>("pictures", "stock", { allowed: ["stock", "mine"] });
  const [tab] = useUrlState<"result" | "original">("tab", "result", { allowed: ["result", "original"] });
  const [picking, setPicking] = useUrlFlag("pick", "open");
  const [showId, openShow] = useUrlItem("show");
  const [words, setWords] = useWords();
  const brand = useMemo(() => brandName(userId), [userId]);
  const hasMedia = useMemo(() => loadMedia(userId).length > 0, [userId]);
  const shown = useShow(userId, showId ?? (job?.state === "done" ? job.showId : null));
  const started = useRef<number | null>(null);

  const remix = from === "remix";
  const ask: SlideshowAsk = { source: remix ? source : null, topic: words.topic, mention: mention !== "no", note: words.note, size, pictures };
  const reason =
    remix && !source ? "Pick a slideshow to remix first."
    : !remix && words.topic.trim().length < 3 ? "Type a topic first."
    : pictures === "mine" && !hasMedia ? "Add photos in Media first."
    : null;

  /** Starts a run on the setup as it is now; `changes` ride in the same URL write (two writes in a row keep only the last). */
  const makeIt = (changes: Record<string, string | null> = {}) => {
    if (reason || slideshowBusy()) return void (Object.keys(changes).length && update(changes));
    update({ ...changes, show: null, slide: null, tab: null });
    void startSlideshow(userId, ask);
    started.current = slideshowJob()?.id ?? null;
  };

  // the run this page started opens its result as its own link (show=), so Back and Copy link find it
  useEffect(() => {
    if (job?.state === "done" && job.showId && job.id === started.current) {
      started.current = null;
      openShow(job.showId);
    }
  }, [job, openShow]);

  // go=1 (the Remix sheet's Also make link) makes on arrival, once
  const went = useRef(false);
  useEffect(() => {
    if (went.current || params.get("go") !== "1") return;
    went.current = true;
    makeIt({ go: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const original = shown?.source ?? (remix ? source : null);
  const set = (k: string, v: string | null) => update({ [k]: v });

  const options = (
    <>
      <Card className="border-border/60 shadow-card">
        <CardContent className="space-y-4 pt-4 sm:pt-5">
          <Field label="Start from">
            <FilterChip active={!remix} onClick={() => set("from", source ? "topic" : null)}>A topic</FilterChip>
            <FilterChip active={remix} onClick={() => set("from", source ? null : "remix")}>Remix a trending one</FilterChip>
          </Field>
          {gone && <p className="text-sm text-amber-700 dark:text-amber-300">That post isn't in the swipe file any more.</p>}
          {remix ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">Slideshow to remix</p>
              {source ? (
                <div className="flex items-center gap-3 rounded-lg border border-border/60 p-2">
                  {source.cover && <img src={source.cover} alt="" className="h-14 w-11 shrink-0 rounded object-cover" />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{source.title || source.caption || "A carousel"}</span>
                    <span className="block truncate text-xs text-muted-foreground">{metaOf(source)}</span>
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => setPicking(!picking)} aria-expanded={picking}>
                    Change
                  </Button>
                </div>
              ) : (
                <Button size="sm" variant="outline" onClick={() => setPicking(!picking)} aria-expanded={picking}>
                  Pick one
                </Button>
              )}
              {picking && (
                <PickList
                  userId={userId}
                  current={source?.key}
                  onPick={(s) => {
                    rememberSource(s, userId);
                    update({ source: s.key, pick: null, from: null, tab: null });
                  }}
                />
              )}
              <p className="text-xs text-muted-foreground">Keeps the shape of a slideshow that did well and writes new words for {brand} over stock photos. Never its words.</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="make-topic">Topic</Label>
              <Input id="make-topic" value={words.topic} maxLength={200} placeholder="Like 5 things to check before you buy a hospital plan" onChange={(e) => setWords({ ...words, topic: e.target.value })} />
              <p className="text-xs text-muted-foreground">Writes slides on your topic over stock photos.</p>
            </div>
          )}
        </CardContent>
      </Card>
      <Card className="border-border/60 shadow-card">
        <CardContent className="space-y-4 pt-4 sm:pt-5">
          <Field label={`Mention ${brand}`} hint={`Yes works ${brand} into the slides. No keeps it as pure value content.`}>
            <FilterChip active={mention !== "no"} onClick={() => set("mention", null)}>Yes</FilterChip>
            <FilterChip active={mention === "no"} onClick={() => set("mention", "no")}>No</FilterChip>
          </Field>
          <div className="space-y-1.5">
            <Label htmlFor="make-steer">Steer it (optional)</Label>
            <Textarea id="make-steer" rows={2} value={words.note} maxLength={300} placeholder="What should this slideshow be about?" onChange={(e) => setWords({ ...words, note: e.target.value })} />
          </div>
          <Field label="Size">
            {SIZES.map((s) => (
              <FilterChip key={s} active={size === s} onClick={() => set("size", s === "4x5" ? null : s)}>
                {SIZE_LABELS[s]}
              </FilterChip>
            ))}
          </Field>
          <Field label="Pictures">
            <FilterChip active={pictures === "stock"} onClick={() => set("pictures", null)}>Stock photos for me</FilterChip>
            <FilterChip active={pictures === "mine"} onClick={() => set("pictures", "mine")}>From my media</FilterChip>
          </Field>
          {pictures === "mine" && !hasMedia && (
            <p className="text-xs text-muted-foreground">
              <Link to={links.media()} className="font-semibold text-primary hover:underline [@media(pointer:coarse)]:py-3">Add photos in Media</Link> to use your own.
            </p>
          )}
        </CardContent>
      </Card>
    </>
  );

  const result = (
    <div className="space-y-3">
      {original && (
        <div role="tablist" aria-label="Result" className="flex gap-1.5">
          <FilterChip active={tab === "result"} onClick={() => set("tab", null)}>Your result</FilterChip>
          <FilterChip active={tab === "original"} onClick={() => set("tab", "original")}>Original</FilterChip>
        </div>
      )}
      {original && tab === "original" ? (
        <Card className="border-border/60 shadow-card">
          <CardContent className="pt-4 sm:pt-5">
            <OriginalPane source={original} label="Slideshow to remix" linkText={original.platform === "instagram" ? "Open on Instagram" : "Open original"} />
          </CardContent>
        </Card>
      ) : busy && job ? (
        <Placeholder size={size}>
          <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden />
          <span role="status">{stepText(job)}</span>
        </Placeholder>
      ) : job?.state === "failed" && !showId ? (
        <div role="alert" className="space-y-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">
          <p className="flex items-start gap-2 text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {job.error}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => makeIt()} disabled={!!reason}>Try again</Button>
            {job.refused && job.ask.source && (
              <Button size="sm" variant="outline" onClick={() => update({ from: null, pick: "open" })}>Pick another</Button>
            )}
          </div>
        </div>
      ) : shown ? (
        <Result userId={userId} show={shown} onAgain={() => makeIt()} canAgain={!reason && !busy} />
      ) : (
        <Placeholder size={size}>Your result shows here once you make it.</Placeholder>
      )}
    </div>
  );

  return (
    <FormatShell
      title={def.name}
      blurb={def.blurb}
      options={options}
      result={result}
      footer={{ cap: def.cap, label: "Make the slideshow", busyLabel: "Making...", busy, reason, disabled: !!reason, onMake: () => makeIt() }}
    />
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** A dashed slide-shaped box: before the first make, and while one runs. */
function Placeholder({ size, children }: { size: Size; children: ReactNode }) {
  return (
    <div
      className="mx-auto flex w-full max-w-[340px] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border px-6 text-center text-sm text-muted-foreground"
      style={{ aspectRatio: size === "9x16" ? "9 / 16" : "4 / 5" }}
    >
      {children}
    </div>
  );
}

function PickList({ userId, current, onPick }: { userId: string; current?: string; onPick: (s: RemixSource) => void }) {
  const list = useMemo(() => trendingSlideshows(userId), [userId]);
  return (
    <ul aria-label="Slideshows that did well" className="max-h-80 divide-y divide-border/60 overflow-y-auto rounded-lg border border-border/60">
      {list.map((s) => (
        <li key={s.key}>
          <button
            type="button"
            onClick={() => onPick(s)}
            aria-current={s.key === current}
            className={cn("flex min-h-11 w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted/60", s.key === current && "bg-primary/5")}
          >
            {s.cover ? <img src={s.cover} alt="" loading="lazy" className="h-12 w-10 shrink-0 rounded object-cover" /> : <span className="h-12 w-10 shrink-0 rounded bg-muted" />}
            <span className="min-w-0">
              <span className="block truncate text-sm">{s.title || s.caption || "A carousel"}</span>
              <span className="block truncate text-xs text-muted-foreground">{metaOf(s)}</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** One slide drawn at half size, exactly as its PNG will look. */
function SlidePreview({ slide, size, look, picture }: { slide: Show["slides"][number]; size: Show["size"]; look: SlideLook; picture: Blob | null }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const k = 0.5;
  useEffect(() => {
    let live = true;
    void (async () => {
      await ensureCaptionFonts();
      const [bitmap, logo] = await Promise.all([picture ? bitmapOf(picture) : null, look.logo ? logoOf(look.logo) : null]);
      const ctx = ref.current?.getContext("2d");
      if (!live || !ctx) return;
      ctx.setTransform(k, 0, 0, k, 0, 0);
      paintSlide(ctx, slide, size, bitmap, look, logo);
    })();
    return () => {
      live = false;
    };
  }, [slide, size, look, picture]);
  return <canvas ref={ref} width={FRAME_W * k} height={frameHeight(size) * k} className="block h-auto w-full rounded-lg bg-zinc-600" aria-hidden />;
}

/** Preparing slides n of N, or the line a failed download shows. */
type Prep = { done: number; total: number } | string | null;

function Result({ userId, show, onAgain, canAgain }: { userId: string; show: Show; onAgain: () => void; canAgain: boolean }) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const update = useUrlUpdate();
  const n = show.slides.length;
  const at = Number(params.get("slide") ?? "1");
  const index = Number.isInteger(at) && at >= 1 && at <= n ? at - 1 : 0;
  const go = (i: number) => update({ slide: i > 0 ? String(i + 1) : null });
  const slide = show.slides[index];
  const look = useMemo(() => lookOf(userId, show), [userId, show]);
  const [pics, setPics] = useState<Record<string, Blob | null>>({});
  const [prep, setPrep] = useState<Prep>(null);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);

  useEffect(() => {
    let live = true;
    for (const s of show.slides) {
      if (s.id in pics) continue;
      void slidePicture(s).then((b) => live && setPics((p) => ({ ...p, [s.id]: b })));
    }
    return () => {
      live = false;
    };
  }, [show.slides, pics]);

  const flags = useMemo(() => scanCompliance([...show.slides.flatMap((s) => s.boxes.map((b) => b.text)), show.caption ?? ""].join("\n\n")), [show]);
  const canSchedule = socialConnectShown();

  /** Writes or refreshes its My posts draft and returns the id. */
  const toPosts = () => {
    const fresh = slideshowToDraft(show, new Date().toISOString());
    const prev = getDraftById(userId, fresh.id);
    upsertDraft(userId, prev ? { ...prev, hook: fresh.hook, draft: fresh.draft, format: fresh.format, platform: fresh.platform } : fresh);
    draftsChanged();
    if (show.draftId !== fresh.id) saveSlideshow(userId, { ...show, draftId: fresh.id });
    return fresh.id;
  };
  const schedule = () => navigate(`${links.calendar({ post: toPosts() })}&view=month`);
  const save = () => {
    toPosts();
    toast({ title: "Saved to My posts" });
  };
  const downloadAll = async () => {
    if (prep && typeof prep !== "string") return;
    const ctrl = new AbortController();
    abort.current = ctrl;
    const mine = (p: Prep) => abort.current === ctrl && setPrep(p);
    mine({ done: 0, total: n });
    try {
      const files = await slideshowPngs(userId, show, { signal: ctrl.signal, onProgress: (done, total) => mine({ done, total }) });
      for (const [i, f] of files.entries()) {
        if (ctrl.signal.aborted) return;
        downloadBlob(f.file, slideFileName(show.title, i));
        // browsers drop downloads that all start at the same moment
        if (i < files.length - 1) await pause(400);
      }
      mine(null);
      toast({ title: "Slideshow downloaded" });
    } catch (e) {
      if (ctrl.signal.aborted) return void mine(null);
      mine(e instanceof MissingPictureError ? e.message : "Couldn't make the pictures. Try again, or try another browser.");
    }
  };
  const copyCaption = () =>
    navigator.clipboard.writeText(show.caption ?? "").then(
      () => toast({ title: "Caption copied" }),
      () => toast({ title: "Copy failed", variant: "destructive" }),
    );
  const preparing = prep !== null && typeof prep !== "string";

  return (
    <div className="space-y-4">
      <div className="mx-auto w-full max-w-[340px] space-y-2">
        <SlidePreview slide={slide} size={show.size} look={look} picture={pics[slide.id] ?? null} />
        <div className="flex items-center justify-center gap-2">
          <Button size="icon" variant="outline" onClick={() => go(index - 1)} disabled={index === 0} aria-label="Previous slide" className="rounded-full">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-1.5" aria-hidden>
            {show.slides.map((s, i) => (
              <span key={s.id} className={cn("h-2 w-2 rounded-full", i === index ? "bg-primary" : "bg-muted-foreground/30")} />
            ))}
          </div>
          <Button size="icon" variant="outline" onClick={() => go(index + 1)} disabled={index === n - 1} aria-label="Next slide" className="rounded-full">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-center text-xs text-muted-foreground" aria-live="polite">
          Slide {index + 1} of {n}
        </p>
      </div>

      {flags.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {flags.map((f) => (
            <li key={f.id} className={cn("rounded-lg border px-2.5 py-1.5 text-[11px]", f.severity === "error" ? "border-destructive/50 bg-destructive/10 text-red-700 dark:text-red-300" : "border-amber-500/50 bg-amber-500/10 text-amber-900 dark:text-amber-200")}>
              <span className="font-semibold">{f.match}:</span> {f.message}
            </li>
          ))}
        </ul>
      )}

      {show.caption && (
        <div className="space-y-1.5 rounded-lg border border-border/60 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-muted-foreground">Caption</p>
            <Button size="sm" variant="ghost" onClick={() => void copyCaption()} className="gap-1.5">
              <Copy className="h-3.5 w-3.5" /> Copy
            </Button>
          </div>
          <p className="whitespace-pre-line break-words text-sm">{show.caption}</p>
        </div>
      )}

      {prep && (
        <div role="status" className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-sm">
          {typeof prep === "string" ? (
            <span className="flex-1 text-destructive">{prep}</span>
          ) : (
            <>
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span className="flex-1">
                Preparing slides {prep.done} of {prep.total}
              </span>
              <Button size="sm" variant="ghost" onClick={() => (abort.current?.abort(), setPrep(null))}>
                Cancel
              </Button>
            </>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {canSchedule ? (
          <Button onClick={schedule} disabled={preparing} className="gap-1.5">
            <CalendarClock className="h-4 w-4" /> Schedule
          </Button>
        ) : (
          <Button onClick={() => void downloadAll()} disabled={preparing} className="gap-1.5">
            <Download className="h-4 w-4" /> Download all
          </Button>
        )}
        <Button variant="outline" onClick={save} disabled={preparing} className="gap-1.5">
          <Save className="h-4 w-4" /> Save
        </Button>
        <Button variant="outline" asChild className="gap-1.5">
          <Link to={links.slideshow({ s: show.id })}>
            <Pencil className="h-4 w-4" /> Edit slides
          </Link>
        </Button>
        {canSchedule && (
          <Button variant="ghost" onClick={() => void downloadAll()} disabled={preparing} className="gap-1.5">
            <Download className="h-4 w-4" /> Download all
          </Button>
        )}
      </div>
      {show.draftId && (
        <p className="text-xs text-muted-foreground">
          Saved. It's in My posts as a draft.{" "}
          <Link to={links.drafts()} className="font-semibold text-primary hover:underline [@media(pointer:coarse)]:py-3">
            Open My posts
          </Link>
        </p>
      )}
      <button type="button" onClick={onAgain} disabled={!canAgain} className="text-xs text-muted-foreground underline-offset-4 hover:underline disabled:opacity-50 [@media(pointer:coarse)]:min-h-11">
        Make again
      </button>
    </div>
  );
}
