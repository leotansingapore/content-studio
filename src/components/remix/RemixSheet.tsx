import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { AlertTriangle, ChevronDown, ExternalLink, Loader2, Shuffle, X } from "lucide-react";
import PriceChip from "@/components/PriceChip";
import BreakdownRow from "@/components/remix/BreakdownRow";
import FitLine from "@/components/remix/FitLine";
import FlagChips from "@/components/remix/FlagChips";
import ForRow from "@/components/remix/ForRow";
import MakeRow, { WaitingLink, useAiBusy } from "@/components/remix/MakeRow";
import { Button } from "@/components/ui/button";
import { FilterChip } from "@/components/ui/filter-chip";
import { InfoTip } from "@/components/ui/info-tip";
import { Textarea } from "@/components/ui/textarea";
import { useUsesLeft } from "@/lib/aiUsage";
import { loadBrand } from "@/lib/carousel";
import { getDraftById } from "@/lib/draftHistory";
import { links, slug } from "@/lib/links";
import { loadPositioning } from "@/lib/positioning";
import { creditsUsd, pendingAvatar } from "@/lib/aiVideo";
import { reasonText } from "@/lib/prices";
import {
  AS_LABELS,
  CLOSE_HINTS,
  CLOSE_LABELS,
  KEEP_DONE,
  KEEP_HINTS,
  KEEP_LABELS,
  MAKE_CHIPS,
  asParam,
  cleanAs,
  defaultOutput,
  fullText,
  intentsFor,
  isVideo,
  makePrice,
  noteKey,
  remixLabel,
  VIDEO_LIMITS,
  videoAsk,
  videoBlock,
  whatRemixDoes,
  type Close,
  type Keep,
  type RemixAs,
} from "@/lib/remix";
import { brandName, loadRemixPrefs, offerNames, ownBrandName, saveRemixPrefs, speakerFor, type RemixPrefs } from "@/lib/remixBrand";
import { FIT_WAIT_MS, UNKNOWN_FIT, fitAsk, fitVideo, loadFit, pressAction, requestFit, type FitResult } from "@/lib/remixFit";
import { clearRemixJob, hrefFor, onRemixJob, remixJob, startRemix, type RemixJobState, type RemixRow } from "@/lib/remixJob";
import { dayMonth, earlierRemix, seenSources, sourceNoun, type RemixSource } from "@/lib/remixSource";
import { localTeardown, type Teardown } from "@/lib/remixTeardown";
import { resolveSource } from "@/lib/resolveSource";
import { useUrlFlag, useUrlItem, useUrlList, useUrlState, useUrlUpdate } from "@/lib/urlState";
import { useLeoUser, type LeoUser } from "@/lib/useLeoOnly";
import { DAILY_LIMITS } from "../../../supabase/functions/_shared/usageCaps.ts";
import { VOICE_MIN_CHARS, isVoiceProfileUsable, loadVoiceProfile } from "@/lib/voiceProfile";

// The Remix sheet (docs/north-star/items/remix-everywhere.md): opened over any page by ?remix=<key>, mounted
// once in StudioLayout and only for Leo. Every choice lives in the URL; the run itself is remixJob.ts, so
// closing the sheet or leaving the page never stops it.

const CLOSE_ORDER = Object.keys(CLOSE_LABELS) as Close[];
/** Closing drops every sheet param with the key, so the next card's sheet starts from the defaults. */
const SHEET_PARAMS = Object.fromEntries(["remix", "keep", "about", "close", "more", "for", "mention", "offer", "as", "breakdown"].map((p) => [p, null]));

export default function RemixSheet({ user }: { user: LeoUser }) {
  const [key] = useUrlItem("remix");
  const update = useUrlUpdate();
  // /agent reads ?remix= into its composer (agent-chat), so the sheet never opens over it, even while it loads
  const onAgent = /^\/agent(\/|$)/.test(useLocation().pathname);
  return key && !onAgent ? <Sheet key={`${user.id}|${key}`} remixKey={key} userId={user.id} onClose={() => update(SHEET_PARAMS)} /> : null;
}

function useJob(): RemixJobState | null {
  const [job, setJob] = useState(remixJob);
  useEffect(() => {
    const off = onRemixJob(setJob);
    return () => {
      off();
    };
  }, []);
  return job;
}

const readNote = (key: string) => {
  try {
    return localStorage.getItem(noteKey(key)) ?? "";
  } catch {
    return "";
  }
};
const writeNote = (key: string, text: string) => {
  try {
    if (text) localStorage.setItem(noteKey(key), text);
    else localStorage.removeItem(noteKey(key));
  } catch {
    // the box still holds it until the sheet closes
  }
};

const compact = (n: number) => new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** "Reel by @handle | 141.9K views" */
function metaLine(s: RemixSource): string {
  const n = s.numbers;
  const stat =
    n?.views ? `${compact(n.views)} views`
    : n?.likes ? `${compact(n.likes)} likes`
    : n?.daysRunning ? `${n.daysRunning} days running`
    : "";
  return [`${cap(sourceNoun(s))}${s.author ? ` by ${s.author}` : ""}`, stat].filter(Boolean).join(" | ");
}

function Sheet({ remixKey, userId, onClose }: { remixKey: string; userId: string; onClose: () => void }) {
  const source = useMemo<RemixSource | null>(() => {
    // a key this tab pressed but the data drop no longer holds still opens from the card's own snapshot
    const s = resolveSource(remixKey, userId) ?? seenSources(userId).find((x) => x.key === remixKey) ?? null;
    return s && { ...s, remixedAt: "" };
  }, [remixKey, userId]);
  const job = useJob();
  const mine = job?.key === remixKey ? job : null;
  const working = mine?.state === "working";
  const otherRunning = job?.state === "working" && !mine;
  const leftOf = useUsesLeft(job?.state === "working");
  const left = leftOf("remix-make");
  const aiBusy = useAiBusy();
  const [params] = useSearchParams();
  const update = useUrlUpdate();
  // the sheet is mounted for Leo today; the agent link asks again, so the sheet stays as it is for anyone else
  const leo = useLeoUser();

  const keeps = useMemo<Keep[]>(() => (source ? intentsFor(source) : ["structure"]), [source]);
  const [keep] = useUrlState<Keep>("keep", "structure", { allowed: keeps });
  const topics = useMemo(() => (loadPositioning(userId)?.topics ?? []).map((t) => t.trim()).filter(Boolean), [userId]);
  const [aboutSlug] = useUrlState<string>("about", "");
  // an empty, unknown or repeated slug falls back to the first topic
  const about = topics.find((t) => slug(t) === aboutSlug) ?? topics[0];
  const [closeness] = useUrlState<Close>("close", "balanced", { allowed: CLOSE_ORDER });
  const [more, setMore] = useUrlFlag("more", "open");
  const [forOpen, setForOpen] = useUrlFlag("for", "open");
  const [breakdownOpen, setBreakdownOpen] = useUrlFlag("breakdown", "open");
  // as=post,carousel: up to 3 formats, one video; the source's own format is the default and stays out of the URL
  const [asList, setAsList] = useUrlList("as", { allowed: MAKE_CHIPS });
  const fallbackAs = source ? defaultOutput(source) : "post";
  const asKey = asList.join(",");
  const as = useMemo(() => cleanAs(asKey.split(","), fallbackAs), [asKey, fallbackAs]);
  const setAs = (next: RemixAs[]) => setAsList(asParam(next, fallbackAs));
  const picked = as.find(isVideo);

  // the URL wins (mention=no, offer=<slug>), then the remembered pick for this brand, then the default
  const [prefs, setPrefs] = useState<RemixPrefs>(() => loadRemixPrefs(userId));
  const offers = useMemo(() => offerNames(userId), [userId]);
  // with no brand name there is nothing to mention, so the post stays pure value content
  const named = useMemo(() => ownBrandName(userId) !== "", [userId]);
  const mention = named && (params.get("mention") === "no" ? false : prefs.mention);
  const offerParam = params.get("offer");
  const offer = mention ? (offerParam && offers.find((o) => slug(o) === offerParam)) || prefs.offer : null;
  const kitSpeaker = useMemo(() => speakerFor(userId), [userId]);
  const speaker = prefs.speaker ?? kitSpeaker;
  const text = useMemo(() => (source ? fullText(source, userId) : ""), [source, userId]);
  // a breakdown on this device means the job's "Breaking it down" step is skipped, so the box doesn't name it
  const [tornDown, setTornDown] = useState<Teardown | null>(null);
  const teardownCached = useMemo(() => !!tornDown || (!!source && !!localTeardown(userId, source)), [source, userId, tornDown, job?.state]);

  // The fit check runs on open, per source, brand and video-or-not; a kept answer shows at once.
  const fv = source ? fitVideo(source, !!picked) : false;
  const fitId = `${remixKey}|${fv}|${speaker}`;
  const keptFit = useMemo(() => (source ? loadFit(userId, source.key, fv, new Date(), speaker) : null), [source, userId, fv, speaker]);
  const [liveFit, setLiveFit] = useState<{ id: string; result: FitResult } | null>(null);
  const fitRun = useRef<Promise<FitResult> | null>(null);
  useEffect(() => {
    if (!source || keptFit) {
      fitRun.current = keptFit ? Promise.resolve(keptFit) : null;
      return;
    }
    let live = true;
    const run = requestFit(userId, source, fv, speaker);
    fitRun.current = run;
    void run.then((result) => {
      if (live) setLiveFit({ id: fitId, result });
    });
    return () => {
      live = false;
    };
  }, [source, userId, fv, keptFit, fitId, speaker]);
  const fit: FitResult | "checking" = keptFit ?? (liveFit?.id === fitId ? liveFit.result : "checking");
  const savePrefs = (next: RemixPrefs, url: Record<string, string | null>) => {
    setPrefs(next);
    saveRemixPrefs(userId, next);
    update(url);
  };

  const kit = useMemo(() => loadBrand(userId), [userId]);
  const brand = useMemo(() => brandName(userId), [userId]);
  const voicePosts = useMemo(() => {
    const v = loadVoiceProfile(userId);
    return v && isVoiceProfileUsable(v) ? v.posts.filter((p) => (p ?? "").trim().length >= VOICE_MIN_CHARS).length : 0;
  }, [userId]);
  const [note, setNote] = useState(() => readNote(remixKey));
  const [showOriginal, setShowOriginal] = useState(false);
  const [repeatHidden, setRepeatHidden] = useState(false);
  const repeat = useMemo(() => (source && !repeatHidden ? earlierRemix(userId, source) : null), [source, userId, repeatHidden, job?.state]);
  const repeatDraft = repeat ? getDraftById(userId, repeat.draftId) : null;

  // Escape and the backdrop close it; focus moves in and goes back to the button that opened it.
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    // capture, and stop it: one Escape closes only the sheet, never the drawer or Write's vibe under it
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      onCloseRef.current();
    };
    window.addEventListener("keydown", onKey, true);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = prev;
      opener?.focus?.();
    };
  }, []);

  const uses = as.length;
  // the run breaks the post down first when this device has none, unless no breakdowns are left (remixJob's pre-step)
  const breaksDown = !teardownCached && leftOf("remix-teardown") !== 0;
  const out = left === 0;
  const short = left !== null && uses > left;
  const videosLeft = leftOf("ai-video");
  const videoStop = picked ? videoBlock(picked, { busy: aiBusy, waiting: !!pendingAvatar(), left: leftOf }) : null;
  // The press: weak or poor fits and video formats ask first; nothing is spent until the run starts.
  const [asking, setAsking] = useState<FitResult | null>(null);
  const [waiting, setWaiting] = useState(false);
  useEffect(() => setAsking(null), [asKey]);
  const start = (f: FitResult) => {
    if (!source) return;
    setAsking(null);
    startRemix(userId, {
      source,
      keep,
      about: keep === "topic" ? about : undefined,
      close: closeness,
      as,
      note: note.trim() || undefined,
      mention,
      offer,
      speaker,
      voice: prefs.voice,
      fit: f.verdict === "unknown" ? undefined : { verdict: f.verdict, reasons: f.reasons },
    });
  };
  const press = async () => {
    let f = fit === "checking" ? null : fit;
    if (!f) {
      // a press during the check waits for it, at most Jev's own 5 s
      setWaiting(true);
      f = await Promise.race([fitRun.current ?? Promise.resolve(UNKNOWN_FIT), new Promise<FitResult>((r) => setTimeout(() => r(UNKNOWN_FIT), FIT_WAIT_MS))]);
      setWaiting(false);
    }
    if (pressAction(f.verdict, false) === "ask" || videoAsk(as)) setAsking(f);
    else start(f);
  };
  const again = () => {
    clearRemixJob();
    setNote(readNote(remixKey));
    setRepeatHidden(false);
  };
  /** A failed format back in the form on its own, so its own press (and ask-first) runs it again. */
  const retry = (a: RemixAs) => {
    again();
    setAs([a]);
  };
  const toCarousel = () => setAs([...as.filter((a) => !isVideo(a) && a !== "carousel"), "carousel"]);

  // a running or finished run shows its own choices, whatever the URL says
  const ran = mine && mine.state !== "failed" ? mine.run : { keep, about, close: closeness };
  const shownAs = mine && mine.state !== "failed" ? mine.rows.map((r) => r.as) : as;
  const failedRun = mine?.state === "failed" ? mine.rows : [];
  // a finished run, several formats or a saved script: each row with its own error and way on; one plain failure is a footer line
  const resultRows = mine?.state === "done" || failedRun.length > 1 || failedRun.some((r) => r.scriptHref) ? (mine?.rows ?? []) : [];
  const failedRow = resultRows.length ? undefined : failedRun.find((r) => r.state === "failed");
  // opening one of several results keeps the run, so every other Open stays here and on the pill
  const onOpen = resultRows.length > 1 ? undefined : clearRemixJob;

  let body: ReactNode;
  let footer: ReactNode;
  if (!source) {
    body = <p className="text-sm text-muted-foreground">This post is no longer in the library.</p>;
    footer = (
      <Button type="button" onClick={onClose} className="w-full">
        Close
      </Button>
    );
  } else if (resultRows.length) {
    const first = resultRows.findIndex((r) => r.state === "done");
    const madeWith = ran.keep === "topic" && ran.about ? `Moved to ${ran.about}` : KEEP_DONE[ran.keep];
    body = (
      <div className="space-y-5">
        {resultRows.map((row, n) => (
          <ResultRow key={row.as} row={row} primary={n === first} madeWith={madeWith} onRetry={() => retry(row.as)} onOpen={onOpen} />
        ))}
      </div>
    );
    footer = (
      <Button type="button" variant="ghost" onClick={again} className="w-full text-muted-foreground">
        Remix again
      </Button>
    );
  } else {
    body = (
      <div className="space-y-5">
        <BreakdownRow userId={userId} source={source} text={text} open={breakdownOpen} onOpen={setBreakdownOpen} onTeardown={setTornDown} />

        <section className="space-y-2 rounded-xl border border-border/70 bg-muted/30 p-3">
          <h3 className="text-xs font-semibold text-foreground">What Remix does</h3>
          <p className="text-sm leading-snug text-muted-foreground">
            {whatRemixDoes(source, { keep: ran.keep, about: ran.about, as: shownAs, close: ran.close }, { brand, hasVoice: voicePosts > 0, teardownCached })}
          </p>
          {!working && <FitLine fit={fit} brand={brand} video={!!picked} disabled={working} onCarousel={toCarousel} />}
        </section>

        <section className="space-y-2">
          <h3 className="text-xs font-semibold text-muted-foreground">Keep</h3>
          <div className="flex flex-wrap gap-1.5">
            {keeps.map((k) => (
              <FilterChip
                key={k}
                active={keep === k}
                disabled={working}
                onClick={() => update({ keep: k === "structure" ? null : k, about: k === "topic" ? aboutSlug || null : null })}
              >
                {KEEP_LABELS[k]}
              </FilterChip>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">{KEEP_HINTS[keep]}</p>
          {keep === "topic" && (
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="mr-1 text-xs font-semibold text-muted-foreground">Topic</span>
              {topics.length ? (
                topics.map((t) => (
                  <FilterChip key={t} active={about === t} disabled={working} onClick={() => update({ about: t === topics[0] ? null : slug(t) })}>
                    {t}
                  </FilterChip>
                ))
              ) : (
                <Link to={links.plan({ view: "setup" })} className="text-xs font-semibold text-primary hover:underline [@media(pointer:coarse)]:py-3">
                  Add your topics
                </Link>
              )}
            </div>
          )}
        </section>

        <MakeRow source={source} as={shownAs} setAs={setAs} busy={working} left={leftOf} mention={mention} />

        <ForRow
          brand={brand}
          named={named}
          mention={mention}
          offer={offer}
          offers={offers}
          speaker={speaker}
          presenter={shownAs.includes("speaking")}
          video={shownAs.some(isVideo)}
          voice={prefs.voice}
          onVoice={(v) => savePrefs({ ...prefs, voice: v }, {})}
          voicePosts={voicePosts}
          color={kit?.color}
          logo={kit?.logo}
          open={forOpen}
          setOpen={setForOpen}
          disabled={working}
          onMention={(on) => savePrefs({ ...prefs, mention: on }, { mention: on ? null : "no" })}
          onOffer={(name) => savePrefs({ ...prefs, offer: name }, { offer: name ? slug(name) : null })}
          onSpeaker={(next) => savePrefs({ ...prefs, speaker: next }, {})}
        />

        <section>
          <button
            type="button"
            onClick={() => setMore(!more)}
            aria-expanded={more}
            className="flex w-full items-center justify-between gap-3 py-1 text-left text-xs font-semibold text-muted-foreground hover:text-foreground [@media(pointer:coarse)]:min-h-11"
          >
            More options
            <span className="flex items-center gap-1 font-normal">
              {CLOSE_LABELS[closeness]}
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${more ? "rotate-180" : ""}`} />
            </span>
          </button>
          {more && (
            <div className="space-y-2 pt-2">
              <p className="flex items-center gap-1 text-xs font-semibold text-muted-foreground">
                How close
                <InfoTip label="About how close">Every level writes new words and leaves out the original's numbers and names.</InfoTip>
              </p>
              <div className="flex flex-wrap gap-1.5">
                {CLOSE_ORDER.map((c) => (
                  <FilterChip key={c} active={closeness === c} disabled={working} onClick={() => update({ close: c === "balanced" ? null : c })}>
                    {CLOSE_LABELS[c]}
                  </FilterChip>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">{CLOSE_HINTS[closeness]}</p>
            </div>
          )}
        </section>

        <section className="space-y-1.5">
          <label htmlFor="remix-note" className="text-xs font-semibold text-muted-foreground">
            Note (optional)
          </label>
          <Textarea
            id="remix-note"
            value={note}
            maxLength={300}
            rows={3}
            disabled={working}
            onChange={(e) => {
              setNote(e.target.value);
              writeNote(remixKey, e.target.value);
            }}
            placeholder="What should the remix keep or change? For example: keep the hook, use my offer"
            className="text-sm"
          />
        </section>
      </div>
    );
    footer = working ? (
      <div className="space-y-1.5">
        <Button type="button" disabled className="w-full gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Remixing...
        </Button>
        <p role="status" className="text-center text-xs font-medium text-foreground">
          {mine?.step}
        </p>
        <p className="text-center text-xs text-muted-foreground">You can leave this page. We'll tell you when it's ready.</p>
      </div>
    ) : asking ? (
      <AskFirst
        fitQuestion={fitAsk(asking.verdict)}
        videoLine={videoAsk(as)}
        onGo={() => start(asking)}
        onBack={fitAsk(asking.verdict) ? onClose : () => setAsking(null)}
      />
    ) : (
      <div className="space-y-1.5">
        {/* out of uses: the button and the line under it already say so */}
        {failedRow && !out && (
          <p role="alert" className="flex items-start gap-1.5 text-xs font-medium text-red-700 dark:text-red-300">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {failedRow.error}
          </p>
        )}
        {/* the price and uses wrap right-aligned beside the label on a phone */}
        <Button type="button" onClick={() => void press()} disabled={out || short || otherRunning || waiting || !!videoStop} className="h-auto min-h-10 w-full justify-between gap-3 whitespace-normal py-2">
          <span className="flex shrink-0 items-center gap-2">
            {waiting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shuffle className="h-4 w-4" />}
            {out ? "No remixes left today" : waiting ? "Checking the fit..." : failedRow ? "Try again" : remixLabel(uses)}
          </span>
          {!out && (
            <span className="min-w-0 text-right leading-tight [&>span]:text-primary-foreground/85">
              <PriceChip price={makePrice(as, breaksDown)} left={left} uses={uses} fallback={left === null ? null : `${left} left today`} />
              {/* its own line, so the chip never breaks inside "videos left" */}
              {picked && videosLeft !== null && (
                <span className="block whitespace-nowrap text-[11px] tabular-nums">
                  {videosLeft} of {DAILY_LIMITS["ai-video"]} videos left
                </span>
              )}
            </span>
          )}
        </Button>
        {out && <p className="text-center text-xs text-muted-foreground">They reset at 8am Singapore time.</p>}
        {short && !out && <p className="text-center text-xs text-muted-foreground">{reasonText({ left, uses, leo: true })}</p>}
        {videoStop && !out && (
          <p className="text-center text-xs text-muted-foreground">
            {videoStop}
            {videoStop === VIDEO_LIMITS.waiting && <WaitingLink />}
          </p>
        )}
        {otherRunning && <p className="text-center text-xs text-muted-foreground">Your other remix is still going. This one can start once it's done.</p>}
        {leo && (
          <Link
            to={links.agent({ remix: remixKey })}
            className="flex w-full items-center justify-center py-1 text-xs font-semibold text-muted-foreground hover:text-primary hover:underline [@media(pointer:coarse)]:min-h-11"
          >
            Ask the agent instead
          </Link>
        )}
      </div>
    );
  }

  return createPortal(
    <div className="fixed inset-0 z-[80] flex justify-end" role="dialog" aria-modal="true" aria-labelledby="remix-title">
      <button type="button" tabIndex={-1} aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/50 animate-in fade-in-0 motion-reduce:animate-none" />
      <div className="relative flex h-full w-full flex-col bg-background shadow-xl animate-in slide-in-from-right duration-200 motion-reduce:animate-none sm:max-w-[480px] sm:border-l sm:border-border/70">
        <header className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-2">
          <h2 id="remix-title" className="text-base font-semibold text-foreground">
            Remix
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4">
          {source && (
            <section className="space-y-2">
              <div className="flex gap-3">
                {source.cover && <img src={source.cover} alt="" className="h-16 w-12 shrink-0 rounded-md bg-muted object-cover" />}
                <div className="min-w-0">
                  <p className="line-clamp-2 text-sm font-semibold text-foreground">{source.title || source.caption || "Untitled"}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{metaLine(source)}</p>
                  {source.caption && (
                    <button
                      type="button"
                      onClick={() => setShowOriginal(!showOriginal)}
                      aria-expanded={showOriginal}
                      className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline [@media(pointer:coarse)]:min-h-11"
                    >
                      {showOriginal ? "Hide the original" : "Show the original"}
                      <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showOriginal ? "rotate-180" : ""}`} />
                    </button>
                  )}
                </div>
              </div>
              {showOriginal && (
                <div className="space-y-1.5 rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
                  <p className="whitespace-pre-line">{source.caption}</p>
                  {source.url && (
                    <a href={source.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-primary hover:underline">
                      Open the original <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              )}
              {repeat && !mine && (
                <p className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                  You remixed this on {dayMonth(repeat.at)}.
                  <Link
                    to={repeatDraft ? hrefFor(repeatDraft) : links.generate({ draft: repeat.draftId })}
                    className="inline-flex items-center py-1 font-semibold text-primary hover:underline [@media(pointer:coarse)]:min-h-11"
                  >
                    Open that draft
                  </Link>
                  <button
                    type="button"
                    onClick={() => setRepeatHidden(true)}
                    className="inline-flex items-center py-1 font-semibold text-primary hover:underline [@media(pointer:coarse)]:min-h-11"
                  >
                    Remix it again
                  </button>
                </p>
              )}
            </section>
          )}
          {body}
        </div>
        <footer className="border-t border-border/70 px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3">{footer}</footer>
      </div>
    </div>,
    document.body,
  );
}

/** One format's result: its hook, warnings and its own Open, or why it didn't go through. */
function ResultRow({ row, primary, madeWith, onRetry, onOpen }: { row: RemixRow; primary: boolean; madeWith: string; onRetry(): void; onOpen?: () => void }) {
  const video = isVideo(row.as);
  if (row.state !== "done") {
    return (
      <section className="space-y-2">
        <h3 className="text-base font-semibold text-foreground">{AS_LABELS[row.as]}</h3>
        <p className="flex items-start gap-1.5 text-xs font-medium text-red-700 dark:text-red-300">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {row.error ?? "This one didn't go through."}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {row.scriptHref && (
            // too long: shortening the script is the way on, and Try again would spend again
            <Button asChild variant={row.tooLong ? "default" : "outline"} size="sm">
              <Link to={row.scriptHref} onClick={onOpen}>
                Open the script
              </Link>
            </Button>
          )}
          {row.waiting ? (
            <Button asChild size="sm">
              <Link to={links.edit({ panel: ["ai"], kind: "avatar" })}>Open the editor</Link>
            </Button>
          ) : (
            !row.tooLong && (
              <Button type="button" variant="ghost" size="sm" onClick={onRetry}>
                Try again
              </Button>
            )
          )}
        </div>
      </section>
    );
  }
  return (
    <section className="space-y-2">
      <h3 className="text-base font-semibold text-foreground">{AS_LABELS[row.as]} ready</h3>
      <p className="text-xs text-muted-foreground">
        {video ? "Opening in the video editor" : madeWith}
        {row.credits ? ` | Used ${row.credits} Higgsfield credits (about US$${creditsUsd(row.credits).toFixed(2)}).` : ""}
      </p>
      {row.hook && <blockquote className="border-l-2 border-primary/50 pl-3 text-sm text-foreground">{row.hook}</blockquote>}
      {row.flags && <FlagChips flags={row.flags} />}
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild size="sm" variant={primary ? "default" : "outline"}>
          <Link to={row.href ?? links.generate({ draft: row.draftId })} onClick={onOpen}>
            Open
          </Link>
        </Button>
        {video && row.scriptHref && (
          <Link to={row.scriptHref} onClick={onOpen} className="inline-flex items-center text-xs font-semibold text-primary hover:underline [@media(pointer:coarse)]:min-h-11">
            Open the script
          </Link>
        )}
      </div>
    </section>
  );
}

/** The ask-first row: a weak or poor fit, a video's price, or both, before anything is spent. */
function AskFirst(p: { fitQuestion: string | null; videoLine: string | null; onGo(): void; onBack(): void }) {
  return (
    <div className="space-y-2">
      {p.fitQuestion && <p className="text-sm font-medium text-amber-700 dark:text-amber-300">{p.fitQuestion}</p>}
      {p.videoLine && <p className="text-xs text-muted-foreground">{p.fitQuestion ? p.videoLine : `${p.videoLine} Make it?`}</p>}
      <div className="flex items-center gap-2">
        <Button type="button" onClick={p.onGo} className="flex-1">
          {p.fitQuestion ? "Remix anyway" : "Make it"}
        </Button>
        <Button type="button" variant="ghost" onClick={p.onBack} className="text-muted-foreground">
          {p.fitQuestion ? "Pick another" : "Not now"}
        </Button>
      </div>
    </div>
  );
}

