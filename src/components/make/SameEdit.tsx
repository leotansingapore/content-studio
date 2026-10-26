// /make/same-edit (docs/north-star/items/remix-format-clone.md): a reel's edit read into a plan (its beats, shots,
// on-screen text, cutaways, zooms and caption look, never its words), then your version made over it. The run is
// src/lib/sameEditJob.ts (outside React, so leaving the page keeps it going; a reload picks up a paid video at no
// cost); the plan is src/lib/editPlan.ts. Leo's sign-ins only (MakeFormatPage).
//
// URL (docs/deep-links.md): source=<clone:instagram:<id> | upload:<sha1>> (replace), plan=<ep- id> (push: that edit,
// no new read), who=mine|<presenter id>|none|film, voice=<voice id>, close=loose|close, beat=<row, 1-based> and
// length=30 (all replace; defaults left out). Nothing paid starts from a link: "Read the edit" and "Make my version"
// (which asks first) are presses. An upload's file is never kept: the page asks for it again and takes only the same one.

import { useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { AlertTriangle, Check, Loader2 } from "lucide-react";
import ComplianceChips from "@/components/ComplianceChips";
import FormatShell from "@/components/make/FormatShell";
import { metaOf } from "@/components/make/PickList";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FilterChip } from "@/components/ui/filter-chip";
import { formatBySlug } from "@/data/formats";
import { aiBusy, onAiJob, pendingAvatar } from "@/lib/aiVideo";
import { scanCompliance } from "@/lib/compliance";
import { PLANS_CHANGED, loadPlans, type PlanEntry } from "@/lib/editPlan";
import { links, withRemix } from "@/lib/links";
import { MAS_FLAG } from "@/lib/presenter";
import { loadRemixPrefs } from "@/lib/remixBrand";
import type { RemixSource } from "@/lib/remixSource";
import { localTeardown } from "@/lib/remixTeardown";
import { resolveSource } from "@/lib/resolveSource";
import {
  CLOSES, FILM_LINE, LENGTHS, NO_CUTAWAYS, NOT_SAME_FILE, PRESENTER_LINE, READ_STEPS, TEXT_HEAVY, TWO_PEOPLE_LINE, askLine, clock,
  cloneOf, defaultWho, dropSameEdit, goOnAtPrice, isFace, lengthLine, lookLine, makeCaps, makePrice, onSameEditJob, ownsPending,
  planRows, readCaps, readPrice, resumeSameEdit, sameEditBusy, sameEditJob, sameFile, sourceStop, sourceVideo, startMake, startRead,
  stopLine, textHeavy, voiceFor, type EditLength, type SameEditJob, type SameWho,
} from "@/lib/sameEditJob";
import { useSpeakers } from "@/lib/talkingHead";
import { VOICES, VOICE_IDS, type VoiceId } from "@/lib/textVoice";
import { useUrlState, useUrlUpdate } from "@/lib/urlState";
import type { Close } from "../../../supabase/functions/remix/logic.ts";

const FIELD_LABEL = "text-xs font-semibold text-muted-foreground";
const TOUCH = "[@media(pointer:coarse)]:min-h-11";
const OTHER_VIDEO = "Your last AI video isn't finished yet. Open the editor to finish it.";
const PAID_WAITING = "This video is paid for already. Use Try again at no cost.";
const CLOSE_LABEL: Record<Close, string> = { loose: "Loose", balanced: "Balanced", close: "Close" };

/** On a phone the result sits under the options: a run's start, stop or failure scrolls to it. */
function toView(el: HTMLElement | null) {
  if (!window.matchMedia("(min-width: 1024px)").matches) el?.scrollIntoView({ block: "center", behavior: "smooth" });
}

function useJob(): SameEditJob | null {
  const [job, setJob] = useState(sameEditJob);
  useEffect(() => onSameEditJob(setJob), []);
  return job;
}

function usePlans(userId: string): PlanEntry[] {
  const [plans, setPlans] = useState(() => loadPlans(userId));
  useEffect(() => {
    const read = () => setPlans(loadPlans(userId));
    read();
    window.addEventListener(PLANS_CHANGED, read);
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener(PLANS_CHANGED, read);
      window.removeEventListener("storage", read);
    };
  }, [userId]);
  return plans;
}

export default function SameEdit({ userId, source: linked }: { userId: string; source: RemixSource | null }) {
  const def = formatBySlug("same-edit")!;
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const update = useUrlUpdate();
  const job = useJob();
  // the AI video slot is shared with the editor's AI panel: its changes decide whether a face version can start
  const [, bump] = useReducer((n: number) => n + 1, 0);
  useEffect(() => onAiJob(() => bump()), []);
  const plans = usePlans(userId);
  const people = useSpeakers(userId);
  const planId = params.get("plan");
  const entry = plans.find((e) => e.plan.id === planId) ?? null;
  const plan = entry?.plan ?? null;
  // a plan opened with no source in the address still knows the post it was read from
  const source = useMemo(() => linked ?? (plan ? resolveSource(plan.source, userId) : null), [linked, plan, userId]);
  const whoAllowed = useMemo(() => [...(people?.face ? ["mine"] : []), ...(people?.presenters.map((p) => p.id) ?? []), "none", "film"], [people]);
  const [whoParam, setWho] = useUrlState<string>("who", defaultWho(!!people?.face), { allowed: whoAllowed });
  const who = whoParam as SameWho;
  // a presenter speaks in a voice that fits their look (live-p7a D2: Raj spoke as Alice)
  const [voice, setVoice] = useUrlState<VoiceId>("voice", voiceFor(people, who, loadRemixPrefs(userId).voice), { allowed: VOICE_IDS });
  const [close, setClose] = useUrlState<Close>("close", "balanced", { allowed: CLOSES });
  const [lengthParam, setLength] = useUrlState<string>("length", "15", { allowed: LENGTHS.map(String) });
  const length = Number(lengthParam) as EditLength;
  const rows = useMemo(() => (plan ? planRows(plan) : []), [plan]);
  const [beatParam, setBeat] = useUrlState<string>("beat", "", { allowed: rows.map((_, i) => String(i + 1)) });
  // an upload's own video, picked on this visit (never kept), and why a picked file was refused
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const videoRef = useRef<HTMLVideoElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const askRef = useRef<HTMLDivElement>(null);
  const seen = useRef<string | null>(null);
  const runParams = { source: source?.key, plan: planId ?? undefined, who: whoParam, voice, close: close === "balanced" ? undefined : close, length: length === 15 ? undefined : String(length) };

  // a version paid for but never put together picks up again at no cost
  useEffect(() => {
    if (resumeSameEdit(runParams)) seen.current = "start";
  }, []); // once on open: the params only label the library row

  // once per step, while this page is open: a finished read opens its plan, a make that is being put together opens
  // the editor, and a start or a failure scrolls into view on a phone
  useEffect(() => {
    if (!job) return;
    const step = `${job.id}:${job.state}`;
    if (seen.current === step) return;
    const live = seen.current !== null;
    seen.current = step;
    if (!live) return;
    if (job.kind === "read" && job.state === "read" && job.planId) update({ plan: job.planId }, { push: true });
    else if (job.state === "joining") navigate(links.edit());
    else if (job.state === "failed" || job.state === "stopped") toView(resultRef.current);
  }, [job, navigate, update]);

  const busy = !!job && sameEditBusy();
  const reading = busy && job?.kind === "read";
  const making = busy && job?.kind === "make";
  const priced = job?.state === "priced" && !!job.real && job.planId === plan?.id;
  const pending = pendingAvatar();
  const ours = ownsPending();
  const elsewhere = isFace(who) && ((!busy && aiBusy()) || (!!pending && !ours));
  const stop = source ? sourceStop(userId, source) : null;
  const readStop = job?.kind === "read" && job.state === "stopped" && job.source === source?.key ? job.stop ?? null : null;
  const shownStop = plan ? null : stop ?? readStop;
  const upload = source?.kind === "upload";
  const teardown = !!source && !!localTeardown(userId, source);
  const known = source ? cloneOf(userId, source)?.result.source.durationSec ?? null : null;
  const earlier = !plan && source ? plans.find((e) => e.plan.source === source.key) ?? null : null;
  const thisRun = !!job && job.kind === "make" && job.planId === plan?.id;
  const flags = useMemo(
    () => (thisRun && job?.script ? [...(job.flags?.mas ? [MAS_FLAG] : []), ...scanCompliance(job.script)].filter((x) => !dismissed.has(x.id)) : []),
    [thisRun, job?.script, job?.flags?.mas, dismissed],
  );
  const speaker = who === "mine" ? people?.face : people?.presenters.find((p) => p.id === who);
  const noCutaways = !!plan && !plan.events.some((e) => e.kind === "cutaway");
  const price = makePrice(who, length);
  const caps = makeCaps(who);

  const pickFile = async (f: File | undefined) => {
    setFileError(null);
    if (!f || !source) return;
    if (await sameFile(f, source.key)) setFile(f);
    else {
      setFile(null);
      setFileError(NOT_SAME_FILE);
    }
  };
  const read = () => {
    if (!source || busy || shownStop || (upload && !file)) return;
    seen.current = "start";
    void startRead(userId, source, file ?? undefined, runParams);
    toView(resultRef.current);
  };
  const make = () => {
    if (!plan || busy) return;
    if (priced) {
      seen.current = "start";
      void goOnAtPrice(userId);
      return;
    }
    // the press asks first, under the button: nothing is written or paid for until "Make it"
    if (!asking) {
      setAsking(true);
      requestAnimationFrame(() => toView(askRef.current));
      return;
    }
    setAsking(false);
    seen.current = "start";
    void startMake(userId, { planId: plan.id, source, who, voice, length, close, mention: true }, runParams);
    toView(resultRef.current);
  };
  const playFrom = (i: number) => {
    setBeat(String(i + 1));
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = rows[i]?.at ?? 0;
    void v.play().catch(() => {});
  };

  // a stop's line shows once, in its own box beside its way forward (live-p7a D20: the TikTok line showed twice)
  const readReason =
    !source ? "Pick a reel first: Rebuild this edit on a Clone a reel result."
    : upload && !file && !shownStop ? "Pick the video you read first."
    : null;
  const makeReason =
    priced ? `The voiceover runs ${Math.round(job!.real!.seconds)} seconds, so this costs about US$${job!.real!.price.usd.toFixed(2)}.`
    : busy ? null
    : elsewhere ? OTHER_VIDEO
    : ours && isFace(who) ? PAID_WAITING
    : who === "none" && noCutaways ? NO_CUTAWAYS
    : null;
  const retry = thisRun && job?.state === "failed" && !job.refused && !job.waiting;

  // ---- the options column ----

  const sourceCard = source && (
    <div className="flex items-center gap-3 rounded-lg border border-border/60 p-2">
      {source.cover ? <img src={source.cover} alt="" className="h-14 w-11 shrink-0 rounded object-cover" /> : <span className="h-14 w-11 shrink-0 rounded bg-muted" />}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{source.title || source.caption || (upload ? "Your upload" : "A reel")}</span>
        <span className="block truncate text-xs text-muted-foreground">{metaOf(source)}</span>
      </span>
    </div>
  );

  const before = (
    <Card className="border-border/60 shadow-card">
      <CardContent className="space-y-3 pt-4 sm:pt-5">
        {sourceCard ?? (
          <div className="space-y-2 text-sm">
            <p className="text-muted-foreground">Pick a reel to rebuild.</p>
            <Link to={links.clone()} className={`inline-flex items-center font-medium text-primary underline-offset-2 hover:underline ${TOUCH}`}>Find one in Clone a reel</Link>
          </div>
        )}
        {params.get("source") && !linked && <p className="text-sm text-amber-700 dark:text-amber-300">That reel isn't on this device any more.</p>}
        {planId && !plan && <p className="text-sm text-amber-700 dark:text-amber-300">That edit isn't on this device yet. It shows here once it syncs, or read the reel again.</p>}
        {upload && !shownStop && (
          <div className="space-y-1.5">
            <label className={`inline-flex cursor-pointer items-center rounded-md border border-input px-3 text-sm font-medium hover:bg-accent ${TOUCH} h-9`}>
              {file ? "Pick another file" : "Pick the video you read"}
              <input type="file" accept="video/mp4,video/quicktime" className="sr-only" onChange={(e) => void pickFile(e.target.files?.[0])} />
            </label>
            {file && <p className="text-xs text-muted-foreground">{file.name}</p>}
            {fileError && <p className="text-xs text-destructive" role="alert">{fileError}</p>}
          </div>
        )}
        {earlier && (
          <Button size="sm" variant="ghost" className={`-ml-2 ${TOUCH}`} onClick={() => update({ plan: earlier.plan.id }, { push: true })}>
            Open the edit you read {new Date(earlier.plan.at).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Singapore" })}
          </Button>
        )}
        {!source && !plan && plans.length > 0 && (
          <div className="space-y-1.5">
            <p className={FIELD_LABEL}>Edits you read</p>
            <ul className="divide-y divide-border/60 rounded-lg border border-border/60">
              {plans.slice(0, 5).map((e) => (
                <li key={e.plan.id}>
                  <button type="button" onClick={() => update({ plan: e.plan.id }, { push: true })} className="flex min-h-11 w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-muted/60">
                    <span className="truncate">{resolveSource(e.plan.source, userId)?.author || "A reel"}, {clock(e.plan.read.seconds)}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{e.versions.length} made</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );

  const theEdit = plan && (
    <Card className="border-border/60 shadow-card">
      <CardContent className="space-y-3 pt-4 sm:pt-5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 className="text-sm font-semibold text-foreground">The edit</h2>
          <p className="text-xs text-muted-foreground">From {source?.author ? `${source.author}'s` : "the"} {upload ? "video" : "reel"}, {clock(plan.read.seconds)}</p>
        </div>
        <ol className="divide-y divide-border/60 rounded-lg border border-border/60">
          {rows.map((r, i) => (
            <li key={i}>
              <button
                type="button"
                onClick={() => playFrom(i)}
                aria-current={beatParam === String(i + 1) ? "step" : undefined}
                className={`grid min-h-11 w-full grid-cols-[2.75rem_4.5rem_1fr] items-baseline gap-2 px-3 py-2 text-left text-sm hover:bg-muted/60 ${beatParam === String(i + 1) ? "bg-primary/5" : ""}`}
              >
                <span className="tabular-nums text-muted-foreground">{clock(r.at)}</span>
                <span className="font-medium">{r.label}</span>
                <span className="min-w-0 text-xs text-muted-foreground [overflow-wrap:anywhere]">{r.parts.join(" | ")}</span>
              </button>
            </li>
          ))}
        </ol>
        {lookLine(plan.read) && <p className="text-xs text-muted-foreground">{lookLine(plan.read)}</p>}
        {plan.read.skipped.length > 0 && <p className="text-xs text-muted-foreground">Not rebuilt: {plan.read.skipped.join(", ")}</p>}
        {plan.read.people === 2 && <p className="text-xs text-amber-700 dark:text-amber-300">{TWO_PEOPLE_LINE}</p>}
      </CardContent>
    </Card>
  );

  const choices = plan && (
    <fieldset disabled={busy || priced} className="min-w-0">
      <Card className="border-border/60 shadow-card">
        <CardContent className="space-y-4 pt-4 sm:pt-5">
          <Field label="Who's on camera">
            {people?.face && <FilterChip active={who === "mine"} onClick={() => setWho("mine")}>You</FilterChip>}
            {people?.presenters.map((p) => <FilterChip key={p.id} active={who === p.id} onClick={() => setWho(p.id)}>{p.name} (AI)</FilterChip>)}
            <FilterChip active={who === "none"} onClick={() => setWho("none")}>No face</FilterChip>
            <FilterChip active={who === "film"} onClick={() => setWho("film")}>I'll film it</FilterChip>
          </Field>
          {speaker && who !== "mine" && <p className="-mt-2 text-xs text-muted-foreground">{PRESENTER_LINE}</p>}
          {who === "mine" && <p className="-mt-2 text-xs text-muted-foreground">Made by AI from your saved face.</p>}
          {who !== "film" && (
            <Field label="Voice">
              {VOICE_IDS.map((v) => <FilterChip key={v} active={voice === v} onClick={() => setVoice(v)}>{VOICES[v].label}</FilterChip>)}
            </Field>
          )}
          <Field label="Length">
            {LENGTHS.map((s) => <FilterChip key={s} active={length === s} onClick={() => setLength(String(s))}>{clock(s)}</FilterChip>)}
          </Field>
          {lengthLine(plan.read.seconds, length) && <p className="-mt-2 text-xs text-muted-foreground">{lengthLine(plan.read.seconds, length)}</p>}
          <Field label="How close">
            {CLOSES.map((c) => <FilterChip key={c} active={close === c} onClick={() => setClose(c)}>{CLOSE_LABEL[c]}</FilterChip>)}
          </Field>
        </CardContent>
      </Card>
    </fieldset>
  );

  // the warnings and the ask sit just above the footer that holds the press, so both ways forward are in one place
  const nearButton = plan && (
    <>
      {textHeavy(plan) && (
        <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden /> {TEXT_HEAVY}
        </p>
      )}
      {(asking || priced) && !busy && (
        <div ref={askRef} role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/25 bg-primary/5 p-3 text-sm">
          <p className="min-w-0">{priced ? "Your voiceover is kept, so going on doesn't pay for it again." : askLine(who, price)}</p>
          <Button size="sm" variant="ghost" className={TOUCH} onClick={() => (priced ? dropSameEdit() : setAsking(false))}>Not now</Button>
        </div>
      )}
    </>
  );

  // ---- the result column ----

  const video = source ? sourceVideo(source.key) : null;
  const result = (
    <div ref={resultRef} className="scroll-mt-16 space-y-3 lg:scroll-mt-0">
      {reading && job ? (
        <Frame>
          <ol className="space-y-2 text-left" aria-live="polite">
            {READ_STEPS.map((s, i) => (
              <li key={s} className={`flex items-center gap-2 ${i === job.at ? "text-foreground" : ""}`}>
                {i < (job.at ?? 0) ? <Check className="h-4 w-4 text-success" aria-hidden /> : i === job.at ? <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden /> : <span className="h-4 w-4" />}
                {s}
              </li>
            ))}
          </ol>
        </Frame>
      ) : shownStop ? (
        <div role="alert" className="space-y-3 rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 text-sm">
          <p className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden /> {stopLine(shownStop)}</p>
          {shownStop === "tiktok" && source && (
            <Button size="sm" variant="outline" className={TOUCH} onClick={() => navigate(withRemix(location.pathname + location.search, source.key))}>Remix its words</Button>
          )}
          {shownStop === "clone-first" && source?.url && (
            <Button size="sm" variant="outline" asChild className={TOUCH}><Link to={links.clone({ url: source.url })}>Clone it</Link></Button>
          )}
          {shownStop === "no-words" && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" asChild className={TOUCH}><Link to={links.makeFormat("wall-of-text")}>Wall of text</Link></Button>
              <Button size="sm" variant="outline" asChild className={TOUCH}><Link to={links.edit({ panel: ["ai"], kind: "montage" })}>Montage</Link></Button>
            </div>
          )}
        </div>
      ) : job?.kind === "read" && job.state === "failed" && job.source === source?.key && !plan ? (
        <Failed error={job.error} />
      ) : thisRun && (making || job!.state === "filmed" || job!.state === "done" || job!.state === "failed") ? (
        <div className="space-y-3">
          {making ? (
            <Frame>
              <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden />
              <span role="status">{job!.step || "Picking up your video..."}</span>
              {job!.state === "joining" && <Button variant="link" onClick={() => navigate(links.edit())} className={TOUCH}>Open the editor</Button>}
            </Frame>
          ) : job!.state === "filmed" ? (
            <div className="space-y-3 rounded-lg border border-border/60 p-4 text-sm">
              <p className="font-medium text-foreground">{FILM_LINE}</p>
              <Button asChild className={TOUCH}><Link to={links.edit({ plan: plan!.id, version: job!.versionId })}>Upload the take</Link></Button>
              <p className="text-xs text-muted-foreground">Your script is in My posts too.</p>
            </div>
          ) : job!.state === "done" ? (
            <Frame>
              <p className="font-medium text-foreground">Your version is ready.</p>
              <Button onClick={() => navigate(links.edit())} className={TOUCH}>Open it in the editor</Button>
            </Frame>
          ) : (
            <Failed error={job!.error}>
              {job!.waiting && ownsPending() && (
                <Button size="sm" onClick={() => { if (resumeSameEdit(runParams)) seen.current = "start"; }} className={TOUCH}>Try again at no cost</Button>
              )}
            </Failed>
          )}
          {job!.script && (
            <div className="space-y-2 rounded-lg border border-border/60 p-3">
              <p className={FIELD_LABEL}>Your script</p>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/85">{job!.script}</p>
              <ComplianceChips flags={flags} onDismiss={(id) => setDismissed(new Set(dismissed).add(id))} />
            </div>
          )}
        </div>
      ) : plan ? (
        video ? (
          <div className="mx-auto w-full max-w-[300px] space-y-1.5">
            <video ref={videoRef} src={video} controls playsInline className="aspect-[9/16] w-full rounded-xl bg-muted object-contain" />
            <p className="text-xs text-muted-foreground">On this device only. Tap a row to play from that beat.</p>
          </div>
        ) : (
          <Frame>{source?.cover ? <img src={source.cover} alt="" className="max-h-full rounded object-cover" /> : "The reel plays here on the device that read it."}</Frame>
        )
      ) : (
        <Frame>The edit shows here once it's read.</Frame>
      )}
    </div>
  );

  const footer = plan
    ? {
        cap: caps.cap,
        price: priced ? job!.real!.price : price,
        caps: priced ? undefined : caps.caps,
        label: priced ? `Make it for US$${job!.real!.price.usd.toFixed(2)}` : asking ? "Make it" : retry ? "Try again" : "Make my version",
        busyLabel: "Making...",
        busy: making,
        disabled: busy || (!!makeReason && !priced),
        reason: makeReason,
        secondary: thisRun && (job?.state === "done" || job?.state === "filmed"),
        onMake: make,
      }
    : {
        cap: "edit-read" as const,
        price: readPrice({ clone: source?.kind === "clone", seconds: known, teardown }),
        caps: readCaps({ clone: source?.kind === "clone", teardown }),
        label: "Read the edit",
        busyLabel: "Reading...",
        busy: reading,
        disabled: busy || !!readReason || !!shownStop,
        reason: readReason,
        onMake: read,
      };

  return (
    <FormatShell
      title={def.name}
      blurb={def.blurb}
      options={
        <>
          {!plan && before}
          {theEdit}
          {choices}
          {nearButton}
        </>
      }
      result={result}
      footer={footer}
    />
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className={FIELD_LABEL}>{label}</p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function Failed({ error, children }: { error?: string; children?: ReactNode }) {
  return (
    <div role="alert" className="space-y-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">
      <p className="flex items-start gap-2 text-destructive"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {error || "That didn't go through. Try again."}</p>
      {children}
    </div>
  );
}

/** A dashed 9:16 frame: before the read, while a step runs, and once the video is waiting for the editor. */
function Frame({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex aspect-[9/16] w-full max-w-[300px] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border px-6 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}
