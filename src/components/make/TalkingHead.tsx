// /make/talking-head (docs/north-star/items/formats-talking-head.md): you, or an AI presenter, saying a script to the
// phone camera. One press writes the script when the box holds a topic (or there is a post to write from), makes the
// presenter, the voiceover and the video, and opens it in the editor with captions. The run is
// src/lib/talkingHeadJob.ts (outside React, so leaving the page keeps it going; a reload picks up a paid video at no
// cost); the rules are src/lib/talkingHead.ts.
//
// URL (docs/deep-links.md): source=<RemixSource key> (MakeFormatPage resolves it; clone:<platform>:<postId> fills the
// box with that Clone a reel result's own script), mention=no, who=mine|presenter|<saved presenter id> (your saved face,
// a new AI presenter, or one of the brand's; the brand's Who appears when absent), setting=car|kitchen|couch|cafe,
// length=8|20|30 and voice=<voice id>, all replace. The press is always the adviser's: this format costs more than
// US$1, so nothing makes on arrival. Device: cs-make-talking-head-<scoped uid> keeps the typed script and look.

import { useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AlertTriangle, Loader2 } from "lucide-react";
import ComplianceChips from "@/components/ComplianceChips";
import FormatShell from "@/components/make/FormatShell";
import { metaOf } from "@/components/make/PickList";
import PriceChip from "@/components/PriceChip";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FilterChip } from "@/components/ui/filter-chip";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatBySlug } from "@/data/formats";
import { useUsesLeft } from "@/lib/aiUsage";
import { LOOKS, MAX_LOOK, aiBusy, onAiJob, pendingAvatar } from "@/lib/aiVideo";
import { scanCompliance } from "@/lib/compliance";
import { links } from "@/lib/links";
import { loadSavedClones } from "@/lib/reelClone";
import type { RemixSource } from "@/lib/remixSource";
import {
  DEFAULT_LENGTH, TALK_LENGTHS, TALK_SETTINGS, canWrite, cloneWords, defaultWho, loadTyped, saveTyped, speakerOf, talkCaps, talkPrice, useSpeakers,
  whoChoices, wordCount, wordLine, writePlan, type TalkLength, type TalkSetting, type TalkWho, type Typed,
} from "@/lib/talkingHead";
import { dropTalk, goOnAtPrice, madePresenter, onTalkJob, ownsPending, resumeTalk, startTalk, talkBusy, talkJob, writeTalk, type TalkAsk, type TalkJob } from "@/lib/talkingHeadJob";
import { VOICES, VOICE_IDS, type VoiceId } from "@/lib/textVoice";
import { useLeoUser } from "@/lib/useLeoOnly";
import { useUrlState, useUrlUpdate } from "@/lib/urlState";

/** One heading style for every option on the setup cards. */
const FIELD_LABEL = "text-xs font-semibold text-muted-foreground";
const TOUCH = "[@media(pointer:coarse)]:min-h-11";
const OTHER_VIDEO = "Your last AI video isn't finished yet. Open the editor to finish it.";
const PAID_WAITING = "This video is paid for already. Use Try again at no cost.";

function useTalkJob(): TalkJob | null {
  const [job, setJob] = useState(talkJob);
  useEffect(() => onTalkJob(setJob), []);
  return job;
}

export default function TalkingHead({ userId, source }: { userId: string; source: RemixSource | null }) {
  const def = formatBySlug("talking-head")!;
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const update = useUrlUpdate();
  const job = useTalkJob();
  // the AI video slot is shared with the editor's AI panel: its changes decide whether this can start
  const [, bump] = useReducer((n: number) => n + 1, 0);
  useEffect(() => onAiJob(() => bump()), []);
  // who speaks: your saved face, a saved presenter or a new one, the brand's Who appears preselected (Ask each time
  // picks none); a photo picked by hand is not offered on Leo's pages (people-my-face)
  const people = useSpeakers(userId);
  const [whoParam, setWho] = useUrlState<string>("who", people ? defaultWho(people) : "", { allowed: people ? whoChoices(people) : [] });
  const who = whoParam as TalkWho | "";
  const speaker = people ? speakerOf(people, who) : null;
  const [setting, setSetting] = useUrlState<TalkSetting>("setting", "office", { allowed: TALK_SETTINGS.map((s) => s.id) });
  const [lengthParam, setLength] = useUrlState<string>("length", String(DEFAULT_LENGTH), { allowed: TALK_LENGTHS.map(String) });
  const length = Number(lengthParam) as TalkLength;
  const [voice, setVoice] = useUrlState<VoiceId>("voice", "alice", { allowed: VOICE_IDS });
  // Leo's sign-ins aim the script at the words the picked voice reads in the length (live-p7a-fix); everyone else as today
  const leo = useLeoUser();
  const byVoice = leo ? voice : undefined;
  const [mention] = useUrlState("mention", "yes", { allowed: ["yes", "no"] });
  const [typed, setTyped] = useState<Typed>(() => {
    const t = loadTyped(userId);
    return t.look ? t : { ...t, look: LOOKS[Math.floor(Math.random() * LOOKS.length)] };
  });
  // the text a write or a clone replaced, one Undo away
  const [undo, setUndo] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const left = useUsesLeft(!!job && talkBusy());
  const scriptRef = useRef<HTMLTextAreaElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const seen = useRef<string | null>(null);
  // a script written after this visit opened lands in the box; one written before it is already there
  const applied = useRef(`${job?.id}:${job?.script ?? ""}`);
  const pricedRef = useRef<HTMLDivElement>(null);
  /** On a phone the result sits under the options: a run's start or failure scrolls to it. */
  const toView = (el: HTMLElement | null) => {
    if (!window.matchMedia("(min-width: 1024px)").matches) el?.scrollIntoView({ block: el === resultRef.current ? "start" : "center", behavior: "smooth" });
  };

  useEffect(() => saveTyped(userId, typed), [userId, typed]);

  // a talking head paid for but never put together picks up again at no cost
  useEffect(() => {
    if (resumeTalk(userId)) seen.current = "start";
  }, [userId]);

  // a Clone a reel result fills the box with its own script, once per source, so a reload never fills over an edit
  useEffect(() => {
    if (source?.kind !== "clone" || typed.filled === source.key) return;
    const w = cloneWords(loadSavedClones(userId), source.key);
    if (!w) return;
    if (typed.script.trim() && typed.script !== w.script) setUndo(typed.script);
    setTyped({ ...typed, script: w.script, filled: source.key });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source?.key]);

  // the script a press or Write it for me wrote goes in the box, the words it replaced one Undo away
  useEffect(() => {
    const key = `${job?.id}:${job?.script ?? ""}`;
    if (!job?.script || applied.current === key) return;
    applied.current = key;
    if (job.script === typed.script) return;
    setUndo(typed.script);
    setTyped({ ...typed, script: job.script });
  }, [job, typed]);

  // once per step, while this page is open: a run's start and a failure scroll into view on a phone, the video
  // opens in the editor once it is being put together, and a finished make empties the box
  useEffect(() => {
    if (!job) return;
    const step = `${job.id}:${job.state}`;
    if (seen.current === step) return;
    const live = seen.current !== null;
    const first = seen.current === "start";
    seen.current = step;
    if (!live) return;
    if (job.state === "joining") navigate(links.edit());
    else if (job.state === "done") setTyped(loadTyped(userId));
    // the price check's note sits above the footer holding its button, so it comes back into view
    else if (job.state === "priced") toView(pricedRef.current);
    else if ((first || job.state === "failed") && !job.writeOnly) toView(resultRef.current);
  }, [job, navigate, userId]);

  const gone = !!params.get("source") && !source;
  const busy = !!job && talkBusy();
  const priced = job?.state === "priced" && !!job.real;
  const locked = busy || priced;
  const pending = pendingAvatar();
  const ours = ownsPending(pending);
  const elsewhere = (!busy && aiBusy()) || (!!pending && !ours);
  const plan = writePlan(typed.script, length, source, byVoice);
  const n = wordCount(typed.script);
  const shown = madePresenter(typed.look, setting);
  const spend = { length, write: !!plan, presenter: who === "presenter" && !shown };
  const flags = useMemo(() => scanCompliance(typed.script).filter((f) => !dismissed.has(f.id)), [typed.script, dismissed]);
  const realUsd = priced ? job.real!.price.usd.toFixed(2) : "";

  const reason =
    priced ? `The voiceover runs ${Math.round(job.real!.seconds)} seconds, so this costs about US$${realUsd}.`
    : busy ? null
    : elsewhere ? OTHER_VIDEO
    : ours ? PAID_WAITING
    : !plan && n < 3 ? "Type your script, or a topic to write it from."
    : !who ? "Pick who speaks first."
    : who === "mine" && !speaker ? "Save your face first."
    : who === "presenter" && typed.look.trim().length < 10 ? "Describe your presenter first."
    : null;
  const retry = job?.state === "failed" && !job.writeOnly && !job.refused && !job.waiting;

  const ask = (): TalkAsk => ({
    source,
    text: typed.script,
    // none picked yet only reaches Write it for me, whose run then keeps who out of its link
    who: who || "photo",
    photo: null,
    look: typed.look,
    setting,
    voice,
    length,
    mention: mention !== "no",
    caption: source?.kind === "clone" ? cloneWords(loadSavedClones(userId), source.key)?.caption : undefined,
    ...(byVoice ? { byVoice: true } : {}),
  });
  const makeIt = () => {
    if (reason || talkBusy()) return;
    // from here the run's steps are this visit's own: a failure scrolls into view and the join opens the editor
    seen.current = "start";
    void startTalk(userId, ask());
  };
  const goOn = () => {
    seen.current = "start";
    void goOnAtPrice(userId);
  };
  const writeIt = () => {
    if (locked || !canWrite(typed.script, source)) return;
    void writeTalk(userId, ask());
  };
  const shorten = () => {
    dropTalk();
    scriptRef.current?.focus();
    scriptRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  };

  const options = (
    <fieldset disabled={locked} className="min-w-0 space-y-5">
      <Card className="border-border/60 shadow-card">
        <CardContent className="space-y-3 pt-4 sm:pt-5">
          {gone && <p className="text-sm text-amber-700 dark:text-amber-300">That post isn't on this device any more.</p>}
          {source && (
            <div className="flex items-center gap-3 rounded-lg border border-border/60 p-2">
              {source.cover && <img src={source.cover} alt="" className="h-14 w-11 shrink-0 rounded object-cover" />}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{source.title || source.caption || "A post"}</span>
                <span className="block truncate text-xs text-muted-foreground">{metaOf(source)}</span>
              </span>
              <Button size="sm" variant="ghost" onClick={() => update({ source: null })} className={TOUCH}>Remove</Button>
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label htmlFor="make-talk-script" className={FIELD_LABEL}>Script</Label>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {undo !== null && (
                <Button size="sm" variant="ghost" onClick={() => { setTyped({ ...typed, script: undo }); setUndo(null); }} className={TOUCH}>Undo</Button>
              )}
              <Button size="sm" variant="outline" onClick={writeIt} disabled={!canWrite(typed.script, source) || left("remix-make") === 0} className={`gap-1.5 ${TOUCH}`}>
                {job?.state === "writing" && job.writeOnly && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
                Write it for me
              </Button>
            </div>
          </div>
          <Textarea
            id="make-talk-script"
            ref={scriptRef}
            rows={5}
            value={typed.script}
            maxLength={600}
            placeholder="What you say, or a topic to write it from"
            onChange={(e) => {
              setTyped({ ...typed, script: e.target.value });
              setUndo(null);
            }}
          />
          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
            <p className="text-xs text-muted-foreground" aria-live="polite">
              {wordLine(n, length, byVoice)}
              {plan && <> {plan === "source" ? "Make the video writes the script from this post first." : "Make the video writes a script from this topic first."}</>}
            </p>
            {canWrite(typed.script, source) && <span className="text-xs"><PriceChip feature="remix-make" left={left("remix-make")} /></span>}
          </div>
          {job?.writeOnly && job.state === "failed" && <p className="text-xs text-destructive" role="alert">{job.error}</p>}
          <ComplianceChips flags={flags} onDismiss={(id) => setDismissed(new Set(dismissed).add(id))} />
        </CardContent>
      </Card>
      <Card className="border-border/60 shadow-card">
        <CardContent className="space-y-4 pt-4 sm:pt-5">
          <Field label="Who speaks">
            {people && (people.face || who === "mine") && <FilterChip active={who === "mine"} onClick={() => setWho("mine")}>My face</FilterChip>}
            {people?.presenters.map((p) => <FilterChip key={p.id} active={who === p.id} onClick={() => setWho(p.id)}>{p.name}, AI</FilterChip>)}
            <FilterChip active={who === "presenter"} onClick={() => setWho("presenter")}>New presenter</FilterChip>
          </Field>
          {who === "presenter" ? (
            <>
              <div className="flex flex-col gap-3 sm:flex-row">
                {shown && <img src={shown} alt="Your AI presenter" className="h-40 w-24 shrink-0 rounded-lg object-cover" />}
                <div className="min-w-0 flex-1 space-y-2">
                  <Textarea
                    rows={3}
                    value={typed.look}
                    maxLength={MAX_LOOK}
                    aria-label="How your presenter looks"
                    className="text-sm"
                    onChange={(e) => setTyped({ ...typed, look: e.target.value })}
                  />
                  <Button size="sm" variant="outline" className={TOUCH} onClick={() => setTyped({ ...typed, look: LOOKS[(LOOKS.indexOf(typed.look) + 1) % LOOKS.length] })}>
                    Another look
                  </Button>
                  <p className="text-xs text-muted-foreground">The person is made by AI.</p>
                </div>
              </div>
              <Field label="Setting">
                {TALK_SETTINGS.map((s) => (
                  <FilterChip key={s.id} active={setting === s.id} onClick={() => setSetting(s.id)}>{s.label}</FilterChip>
                ))}
              </Field>
            </>
          ) : speaker ? (
            <div className="flex items-center gap-3">
              <img
                src={speaker.person === "mine" ? speaker.face.photo : speaker.p.photo}
                alt={speaker.person === "mine" ? "Your saved face" : `${speaker.p.name}, your AI presenter`}
                className="h-24 w-14 shrink-0 rounded-lg object-cover"
              />
              <p className="text-xs text-muted-foreground">{speaker.person === "mine" ? "Made by AI from your saved face." : "The person is made by AI."}</p>
            </div>
          ) : who === "mine" ? (
            <Link to={links.people({ record: true })} className={`inline-flex items-center text-sm font-medium text-primary underline-offset-2 hover:underline ${TOUCH}`}>Save your face first</Link>
          ) : null}
          <Field label="Voice">
            {VOICE_IDS.map((v) => (
              <FilterChip key={v} active={voice === v} onClick={() => setVoice(v)}>{VOICES[v].label}, {VOICES[v].note}</FilterChip>
            ))}
          </Field>
          <Field label="Length">
            {TALK_LENGTHS.map((s) => (
              <FilterChip key={s} active={length === s} onClick={() => setLength(String(s))}>{s} s</FilterChip>
            ))}
          </Field>
        </CardContent>
      </Card>
    </fieldset>
  );
  // the price check sits just above the footer that holds "Make it for US$x", so both ways forward are in one place
  const setup = (
    <>
      {options}
      {priced && (
        <div ref={pricedRef} role="status" className="mt-5 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/25 bg-primary/5 p-3 text-sm">
          <p className="min-w-0">Your voiceover is kept, so going on doesn't pay for it again.</p>
          <Button size="sm" variant="ghost" onClick={shorten} className={TOUCH}>Shorten the script</Button>
        </div>
      )}
    </>
  );

  const result = (
    <div ref={resultRef} className="scroll-mt-16 space-y-3 lg:scroll-mt-0">
      {busy && job && !job.writeOnly ? (
        <Frame>
          <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden />
          <span role="status">{job.step}</span>
          {job.state === "joining" && (
            <Button variant="link" onClick={() => navigate(links.edit())} className={TOUCH}>Open the editor</Button>
          )}
        </Frame>
      ) : job?.state === "failed" && !job.writeOnly ? (
        <div role="alert" className="space-y-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">
          <p className="flex items-start gap-2 text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {job.error}
          </p>
          {job.waiting && ours && (
            <Button size="sm" onClick={() => { if (resumeTalk(userId)) seen.current = "start"; }} className={TOUCH}>Try again at no cost</Button>
          )}
        </div>
      ) : job?.state === "done" ? (
        <Frame>
          <p className="font-medium text-foreground">Your video is ready.</p>
          <Button onClick={() => navigate(links.edit())} className={TOUCH}>Open it in the editor</Button>
        </Frame>
      ) : def.preview && !priced ? (
        <Example />
      ) : (
        <Frame>Your video shows here once you make it.</Frame>
      )}
    </div>
  );

  return (
    <FormatShell
      title={def.name}
      blurb={def.blurb}
      options={setup}
      result={result}
      footer={{
        cap: def.cap,
        price: priced ? job.real!.price : talkPrice(spend),
        caps: priced ? undefined : talkCaps(spend),
        label: priced ? `Make it for US$${realUsd}` : retry ? "Try again" : "Make the video",
        busyLabel: "Making...",
        // Write it for me shows its own spinner; the main button only waits
        busy: busy && !job?.writeOnly,
        disabled: busy || (!!reason && !priced),
        reason,
        secondary: job?.state === "done",
        onMake: priced ? goOn : makeIt,
      }}
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

/** A dashed 9:16 frame: before the first make, while one runs, and once the video is waiting for the editor. */
function Frame({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex aspect-[9/16] w-full max-w-[300px] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border px-6 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

/** A finished talking head (public/formats/talking-head.mp4), muted until "Play with sound". */
function Example() {
  const ref = useRef<HTMLVideoElement>(null);
  const [loud, setLoud] = useState(false);
  const toggle = () => {
    const v = ref.current;
    if (!v) return;
    if (loud) {
      v.pause();
      setLoud(false);
      return;
    }
    v.muted = false;
    void v.play().then(() => setLoud(true), () => setLoud(false));
  };
  return (
    <div className="mx-auto w-full max-w-[300px] space-y-2">
      <video ref={ref} src="/formats/talking-head.mp4" poster="/formats/talking-head.webp" muted loop playsInline autoPlay className="aspect-[9/16] w-full rounded-xl bg-muted object-cover" />
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">An example. Yours replaces it once you make it.</p>
        <Button size="sm" variant="outline" onClick={toggle} className={`shrink-0 ${TOUCH}`}>{loud ? "Pause" : "Play with sound"}</Button>
      </div>
    </div>
  );
}
