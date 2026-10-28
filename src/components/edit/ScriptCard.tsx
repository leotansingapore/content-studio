// The Script card in /edit (people-dub-lipsync parts A and B, Leo only) on an AI video of your face or a saved
// presenter: its Speak parts with their words. Edit a line, hear it (or record it, for your own voice) and only its
// parts are made again on the same face (aiVideo.ts remakeParts, outside React, laid in here with Undo); or have the
// same face say the script in Chinese, Malay or Tamil as a new video, after reviewing the translation.
// ?script=1 opens it (push); ?lang=zh|ms|ta opens that language's review (replace).

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Mic, Square } from "lucide-react";
import { ThinkingOrb } from "thinking-orbs";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ToastAction } from "@/components/ui/toast";
import ComplianceChips from "@/components/ComplianceChips";
import PriceChip from "@/components/PriceChip";
import { useToast } from "@/hooks/use-toast";
import { useUsesLeft } from "@/lib/aiUsage";
import {
  aiJob, makeInLanguage, onAiJob, onRemake, pendingAvatar, pendingRemake, remakeJob, remakeParts, resumeAvatar, resumeRemake, sliceVoiceover, takeRemake,
  type AiJob, type RemakeJob, type Voiceover,
} from "@/lib/aiVideo";
import { PARTS_GONE, canFix, changedParts, faceFor, fixedProject, loadScriptDraft, saveScriptDraft, tidy, tooLongLine, wordsIn, type ScriptDraft } from "@/lib/avatarScript";
import { hasComplianceErrors, scanCompliance } from "@/lib/compliance";
import type { PostLang } from "@/lib/links";
import { priceOf, priceText, sumPrices, type Price } from "@/lib/prices";
import { VOICES, VOICE_IDS, speak, type VoiceId } from "@/lib/textVoice";
import { LANG_NAMES, asPostLang } from "@/lib/translate";
import { useUrlUpdate } from "@/lib/urlState";
import { useLeoUser } from "@/lib/useLeoOnly";
import { extractWav, getFile } from "@/lib/videoMedia";
import { fileKey, transcribe, translateCaptions, type VideoProject } from "@/lib/videoProjects";

const LANGS: PostLang[] = ["zh", "ms", "ta"];
const clock = (t: number) => {
  const s = Math.round(t);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
/** text-voice's shortest script. */
const MIN_LINE = 5;
const btn = "h-11 sm:h-9";

/** A new line's voice, made or recorded for the words it says. */
interface Take {
  text: string;
  url: string;
  vo: Voiceover;
}

const ask = (what: string, price: Price) => `This ${what} and uses ${priceText(price).replace(/^\w/, (c) => c.toLowerCase())} of video credit. Make it?`;

export default function ScriptCard({ userId, project, onPut }: { userId: string; project: VideoProject; onPut: (p: VideoProject) => void }) {
  const leo = useLeoUser();
  const { toast } = useToast();
  const [params] = useSearchParams();
  const update = useUrlUpdate();
  const ai = project.ai;
  const fixable = !!leo && canFix(ai);
  const parts = useMemo(() => (fixable ? ai!.slices! : []), [fixable, ai]);
  const open = fixable && params.get("script") === "1";
  const lang = open ? asPostLang(params.get("lang")) : null;

  const [draft, setDraftState] = useState<ScriptDraft>(() => loadScriptDraft(project.id));
  const draftRef = useRef(draft);
  const patchDraft = (p: Partial<ScriptDraft>) => {
    const d = { ...draftRef.current, ...p };
    draftRef.current = d;
    setDraftState(d);
    saveScriptDraft(project.id, d);
  };
  const fromWords = useMemo(() => wordsIn(project.words, parts), [project.words, parts]);
  const base = parts.map((p, i) => p.text || fromWords[i] || draft.heard?.[i] || "");
  const edits = parts.map((_, i) => draft.edits?.[i] ?? base[i]);
  const changed = changedParts(base, edits);
  const needsRead = parts.length > 0 && base.every((t) => !t);

  const [takes, setTakes] = useState<Record<number, Take>>({});
  const takesRef = useRef(takes);
  takesRef.current = takes;
  const [making, setMaking] = useState<number | null>(null);
  const [lineError, setLineError] = useState<Record<number, string>>({});
  const [recording, setRecording] = useState<{ i: number; rec: MediaRecorder; stream: MediaStream; t0: number } | null>(null);
  const recRef = useRef(recording);
  recRef.current = recording;
  const [recSeconds, setRecSeconds] = useState(0);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [asking, setAsking] = useState(false);
  const [menu, setMenu] = useState(false);
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState("");
  const [translating, setTranslating] = useState(false);
  const [transError, setTransError] = useState("");
  const [madeHere, setMadeHere] = useState(false);
  const [picked, setPicked] = useState<VoiceId>("alice");
  const [here, setHere] = useState<boolean | null>(null);
  const [remake, setRemake] = useState<RemakeJob | null>(remakeJob());
  const [job, setJob] = useState<AiJob | null>(aiJob());
  const face = useMemo(() => (fixable ? faceFor(userId, ai!) : null), [fixable, userId, ai]);
  const busy = remake?.state === "working" || job?.state === "working";
  const left = useUsesLeft(busy);

  useEffect(() => onRemake(setRemake), []);
  useEffect(() => onAiJob(setJob), []);
  // a fix or a translated video paid for but not finished (a reload, leaving the page) carries on by itself
  useEffect(() => {
    if (!fixable) return;
    resumeRemake();
    if (pendingAvatar()?.extra?.ai?.lang) resumeAvatar();
  }, [fixable]);
  // a finished fix for this video is laid in once, with Undo back to the video as it was
  const latest = useRef({ project, onPut });
  latest.current = { project, onPut };
  useEffect(() => {
    if (remake?.state !== "ready" || remake.projectId !== project.id) return;
    const r = takeRemake(project.id);
    if (!r) return;
    const before = latest.current.project;
    const next = fixedProject(before, r);
    if (!next) return void toast({ title: "The video changed while the line was made, so it wasn't laid in.", variant: "destructive" });
    latest.current.onPut(next);
    patchDraft({ edits: undefined, heard: undefined, review: undefined });
    setTakes({});
    toast({
      title: "Line fixed. Undo brings the old one back.",
      action: <ToastAction altText="Undo the fix" onClick={() => latest.current.onPut(before)}>Undo</ToastAction>,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remake, project.id]);
  // the old parts are read from this device for a fix; on another device they aren't there
  const clips = parts.map((p) => p.clip).join(",");
  useEffect(() => {
    if (!open || !clips) return;
    let live = true;
    void Promise.all(clips.split(",").map((k) => getFile(k).then((f) => !!f, () => false))).then((ok) => live && setHere(ok.every(Boolean)));
    return () => { live = false; };
  }, [open, clips]);
  useEffect(() => {
    if (!recording) return;
    const t = window.setInterval(() => setRecSeconds((performance.now() - recording.t0) / 1000), 250);
    return () => window.clearInterval(t);
  }, [recording]);
  useEffect(() => () => {
    recRef.current?.stream.getTracks().forEach((t) => t.stop());
    Object.values(takesRef.current).forEach((t) => URL.revokeObjectURL(t.url));
  }, []);

  if (!fixable || !ai) return null;

  // only a premade voice can say a new line; a video with your own recording (voice unset) or a clone (4b) is recorded again
  const premade = ai.voice === "premade";
  const voice: VoiceId = ai.voiceId ?? picked;
  const fresh = (i: number) => !!takes[i] && takes[i].text === tidy(edits[i]);
  const err = (i: number, line = "") => setLineError((e) => ({ ...e, [i]: line }));
  const edit = (i: number, text: string) => {
    const next = [...edits];
    next[i] = text;
    patchDraft({ edits: next });
  };
  const keepTake = async (i: number, text: string, blob: Blob) => {
    const vo = await sliceVoiceover(blob);
    if (!vo.pcm.some((v) => Math.abs(v) > 0.02)) throw new Error("We couldn't hear anything. Record it again.");
    const url = URL.createObjectURL(blob);
    setTakes((t) => {
      if (t[i]) URL.revokeObjectURL(t[i].url);
      return { ...t, [i]: { text, url, vo } };
    });
  };
  const hear = async (i: number) => {
    const text = tidy(edits[i]);
    setMaking(i);
    err(i);
    try {
      await keepTake(i, text, await speak(text, voice));
    } catch (e) {
      err(i, (e as Error).message);
    } finally {
      setMaking(null);
    }
  };
  const record = async (i: number) => {
    if (recording) return;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      return err(i, "Allow the microphone for this site in the browser, then try again.");
    }
    const mime = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    const chunks: Blob[] = [];
    const text = tidy(edits[i]);
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      void keepTake(i, text, new Blob(chunks, { type: rec.mimeType || "audio/webm" })).catch((e) => err(i, (e as Error).message));
    };
    err(i);
    rec.start(500);
    setRecSeconds(0);
    setRecording({ i, rec, stream, t0: performance.now() });
  };
  const stop = () => {
    if (recording && recording.rec.state !== "inactive") recording.rec.stop();
    setRecording(null);
  };
  const read = async () => {
    setReading(true);
    setReadError("");
    try {
      const file = await getFile(fileKey(project));
      if (!file) throw new Error(PARTS_GONE);
      const t = await transcribe((await extractWav(file)).wav);
      patchDraft({ heard: wordsIn(t.words, parts) });
    } catch (e) {
      setReadError((e as Error).message);
    } finally {
      setReading(false);
    }
  };
  const openCard = () => {
    update({ script: "1" }, { push: true });
    if (needsRead && !reading) void read();
  };
  const translate = async (l: PostLang) => {
    setTranslating(true);
    setTransError("");
    try {
      const lines = await translateCaptions(userId, l, base);
      patchDraft({ review: { lang: l, lines: base.map((_, i) => lines[i] ?? "") } });
    } catch (e) {
      setTransError((e as Error).message);
    } finally {
      setTranslating(false);
    }
  };
  const pickLang = (l: PostLang) => {
    setMenu(false);
    setAsking(false);
    update({ lang: l });
    if (draft.review?.lang !== l && !needsRead) void translate(l);
  };

  // part A: the changed lines' price, from their new voices once made
  const k = changed.length;
  const flagsOf = (text: string) => scanCompliance(text).filter((f) => !dismissed.includes(f.id));
  const red = changed.some((i) => hasComplianceErrors(scanCompliance(edits[i])));
  const price = k ? priceOf("ai-video", { slices: changed.map((i) => (fresh(i) ? takes[i].vo.seconds : parts[i].end - parts[i].start)) }) : null;
  const unheard = changed.some((i) => !fresh(i));
  const tooLong = changed.some((i) => fresh(i) && !!tooLongLine(takes[i].vo.seconds));
  const short = changed.some((i) => tidy(edits[i]).length < MIN_LINE);
  // a fix paid for and not laid in yet is picked up with Try again, never paid twice
  const owed = pendingRemake()?.projectId === project.id;
  const canRemake = k > 0 && !unheard && !tooLong && !short && !!face && here !== false && !busy && !owed && left("ai-video") !== 0;
  const doRemake = () => {
    setAsking(false);
    void remakeParts(project, parts.map((p, i) => ({ ...p, text: base[i] })), face!, changed.map((i) => ({ i, text: tidy(edits[i]), voice: takes[i].vo })));
  };

  // part B: the review of a translation, and the new video's price from today's parts
  const review = lang && draft.review?.lang === lang ? draft.review.lines : null;
  const redB = base.some((t) => hasComplianceErrors(scanCompliance(t)));
  const priceB = sumPrices(priceOf("ai-video", { slices: parts.map((p) => p.end - p.start) }), priceOf("ai-voice"));
  const ours = madeHere || !!pendingAvatar()?.extra?.ai?.lang;
  const canMake = !!review && !!face && !busy && left("ai-video") !== 0 && left("ai-voice") !== 0;
  const makeLang = () => {
    setAsking(false);
    if (!lang || !review?.some((l) => l.trim())) return setTransError("Translate it first.");
    setMadeHere(true);
    void makeInLanguage(`${project.name} (${LANG_NAMES[lang]})`, face!, review, voice, lang, {
      toast: `Your ${LANG_NAMES[lang]} video is ready.`,
      ai: { kind: "avatar", person: ai.person, ...(ai.who ? { who: ai.who } : {}), voice: "premade", voiceId: voice, lang, madeAt: new Date().toISOString() },
    });
  };
  const askFirst = (p: Price | "pick" | null) => !!p && p !== "pick" && p.usd >= 1;

  const working = (step: string) => (
    <p className="flex items-center gap-2 text-sm font-medium" aria-live="polite">
      <ThinkingOrb state="working" size={20} theme="light" aria-hidden /> {step}
    </p>
  );
  const confirm = (what: string, p: Price, go: () => void) => (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">{ask(what, p)}</p>
      <div className="flex items-center gap-2">
        <Button className="h-11 sm:h-10" onClick={go}>Make it</Button>
        <Button variant="ghost" className="h-11 text-muted-foreground sm:h-10" onClick={() => setAsking(false)}>Not now</Button>
      </div>
    </div>
  );
  const voicePills = (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Voice">
      <span className="mr-1 text-xs font-medium">Voice</span>
      {VOICE_IDS.map((v) => (
        <button key={v} type="button" aria-pressed={picked === v} onClick={() => setPicked(v)} disabled={busy}
          className={`h-11 rounded-full border px-3 text-xs font-medium sm:h-8 ${picked === v ? "border-primary bg-primary/10 text-primary" : "border-border/70"}`}>
          {VOICES[v].label}
        </button>
      ))}
    </div>
  );
  const fixing = remake?.projectId === project.id ? remake : null;
  const status = fixing?.state === "working" ? working(fixing.step) : fixing?.state === "failed" ? (
    <div className="flex flex-wrap items-center gap-2" role="alert">
      <p className="text-sm text-destructive">{fixing.error}</p>
      {owed && <Button size="sm" variant="outline" className={btn} onClick={resumeRemake}>Try again at no cost</Button>}
    </div>
  ) : null;
  // the fix's progress sits where its button was; anywhere else in the card, at the top
  const inFooter = open && !!face && !needsRead && !lang && here !== false;

  return (
    <section className="space-y-3 rounded-xl border border-border/70 p-3" aria-label="Script">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-sm font-semibold">Script</h2>
        {!open ? (
          face && <Button size="sm" variant="outline" className={btn} onClick={openCard}>Fix a line</Button>
        ) : (
          <>
            {lang ? (
              <Button size="sm" variant="ghost" className={btn} onClick={() => { setAsking(false); update({ lang: null }); }}>Back to the script</Button>
            ) : (
              face && <Button size="sm" variant="ghost" className={btn} aria-expanded={menu} onClick={() => setMenu(!menu)} disabled={busy}>Make it in another language</Button>
            )}
            <Button size="sm" variant="ghost" className={btn} onClick={() => update({ script: null, lang: null })}>Close</Button>
          </>
        )}
      </div>
      {!face && <p className="text-xs text-muted-foreground">The face in this video isn't saved any more, so it can't be made again.</p>}
      {menu && open && !lang && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Make it in another language">
          {LANGS.map((l) => <Button key={l} size="sm" variant="outline" className={btn} onClick={() => pickLang(l)}>{LANG_NAMES[l]}</Button>)}
        </div>
      )}
      {!inFooter && status}

      {open && face && (needsRead ? (
        <div className="flex flex-wrap items-center gap-2">
          {reading ? working("Reading the script...") : (
            <>
              <Button size="sm" variant="outline" className={btn} onClick={() => void read()}>Read the script</Button>
              <PriceChip feature="video-transcribe" opts={{ minutes: project.duration / 60 }} left={left("video-transcribe")} />
            </>
          )}
          {readError && <p className="basis-full text-xs text-destructive" role="alert">{readError}</p>}
        </div>
      ) : lang ? (
        review ? (
          <div className="space-y-3">
            <ol className="space-y-3">
              {parts.map((p, i) => (
                <li key={p.clip} className="grid gap-2 sm:grid-cols-2">
                  <div className="min-w-0 space-y-1">
                    <p className="text-[11px] tabular-nums text-muted-foreground">{clock(p.start)}-{clock(p.end)} English</p>
                    <p className="text-sm">{base[i]}</p>
                    <ComplianceChips flags={flagsOf(base[i])} onDismiss={(id) => setDismissed((d) => [...d, id])} />
                  </div>
                  <Textarea rows={2} lang={lang} value={review[i] ?? ""} maxLength={300} disabled={busy} aria-label={`${LANG_NAMES[lang]}, part ${i + 1} of ${parts.length}`}
                    onChange={(e) => patchDraft({ review: { lang, lines: review.map((l, j) => (j === i ? e.target.value : l)) } })} />
                </li>
              ))}
            </ol>
            {!ai.voiceId && voicePills}
            {!premade && <p className="text-xs text-muted-foreground">The {LANG_NAMES[lang]} version is spoken by the voice you pick, so it won't sound like you.</p>}
            <p className="flex flex-wrap items-center gap-x-2 text-sm">Check the {LANG_NAMES[lang]} before it's made. <PriceChip price={priceB} left={left("ai-video")} /></p>
            {redB && <p className="text-xs text-destructive">Check the flagged words first.</p>}
            {ours && job?.state === "working" ? working(job.step) : asking && askFirst(priceB) ? confirm("makes a video", priceB as Price, makeLang) : (
              <Button className="h-11 sm:h-10" disabled={!canMake} onClick={() => (askFirst(priceB) ? setAsking(true) : makeLang())}>
                {redB ? "Make it anyway" : `Make the ${LANG_NAMES[lang]} video`}
              </Button>
            )}
            {ours && job?.state === "failed" && (
              <div className="flex flex-wrap items-center gap-2" role="alert">
                <p className="text-sm text-destructive">{job.error}</p>
                {pendingAvatar()?.extra?.ai?.lang && <Button size="sm" variant="outline" className={btn} onClick={resumeAvatar}>Try again at no cost</Button>}
              </div>
            )}
            {transError && <p className="text-xs text-destructive" role="alert">{transError}</p>}
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {translating ? working("Translating...") : (
              <>
                <Button size="sm" className={btn} onClick={() => void translate(lang)}>Translate to {LANG_NAMES[lang]}</Button>
                <PriceChip feature="video-translate" left={left("video-translate")} />
              </>
            )}
            {transError && <p className="basis-full text-xs text-destructive" role="alert">{transError}</p>}
          </div>
        )
      ) : here === false ? (
        <p className="text-sm text-muted-foreground">{PARTS_GONE}</p>
      ) : (
        <div className="space-y-3">
          {!premade && <p className="text-xs text-muted-foreground">Your own voice is in this video, so record each changed line again.</p>}
          {premade && !ai.voiceId && voicePills}
          <ol className="space-y-3">
            {parts.map((p, i) => {
              const edited = changed.includes(i);
              const take = edited && fresh(i) ? takes[i] : null;
              const long = take ? tooLongLine(take.vo.seconds) : null;
              return (
                <li key={p.clip} className="space-y-1.5">
                  <p className="flex items-center gap-2 text-[11px] tabular-nums text-muted-foreground">
                    {clock(p.start)}-{clock(p.end)}
                    {edited && <span className="rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary">edited</span>}
                  </p>
                  <Textarea rows={2} value={edits[i]} maxLength={300} disabled={busy} aria-label={`Part ${i + 1} of ${parts.length}`} onChange={(e) => edit(i, e.target.value)} />
                  {edited && <ComplianceChips flags={flagsOf(edits[i])} onDismiss={(id) => setDismissed((d) => [...d, id])} />}
                  {edited && tidy(edits[i]).length >= MIN_LINE && (
                    <div className="flex flex-wrap items-center gap-2">
                      {premade ? (
                        !take && (
                          <>
                            <Button size="sm" variant="outline" className={btn} disabled={busy || making !== null || left("ai-voice") === 0} onClick={() => void hear(i)}>
                              {making === i ? "Making the voice..." : "Hear it"}
                            </Button>
                            <PriceChip feature="ai-voice" left={left("ai-voice")} />
                          </>
                        )
                      ) : recording?.i === i ? (
                        <Button size="sm" className={`${btn} gap-1.5`} onClick={stop}><Square className="h-3.5 w-3.5" /> Stop, {clock(recSeconds)}</Button>
                      ) : (
                        <Button size="sm" variant="outline" className={`${btn} gap-1.5`} disabled={busy || !!recording} onClick={() => void record(i)}>
                          <Mic className="h-3.5 w-3.5" /> {take ? "Record it again" : "Record it"}
                        </Button>
                      )}
                      {take && <audio src={take.url} controls autoPlay className="h-11 max-w-full sm:h-9" aria-label={`Part ${i + 1}, the new line`} />}
                    </div>
                  )}
                  {long && <p className="text-xs text-destructive" role="alert">{long}</p>}
                  {lineError[i] && <p className="text-xs text-destructive" role="alert">{lineError[i]}</p>}
                </li>
              );
            })}
          </ol>
          {(k > 0 || status) && (
            <div className="space-y-2 border-t border-border/60 pt-3">
              {k > 0 && <p className="flex flex-wrap items-center gap-x-2 text-sm">Remakes {k} {k === 1 ? "part" : "parts"} of {parts.length}. <PriceChip price={price} left={left("ai-video")} /></p>}
              {fixing?.state === "working" ? status : (
                <>
                  {k > 0 && short && <p className="text-xs text-muted-foreground">Write at least {MIN_LINE} characters in each changed line.</p>}
                  {k > 0 && unheard && !short && <p className="text-xs text-muted-foreground">{premade ? "Hear each changed line first." : "Record each changed line first."}</p>}
                  {k > 0 && red && <p className="text-xs text-destructive">Check the flagged words first.</p>}
                  {k > 0 && (asking && askFirst(price) ? confirm(`remakes ${k === 1 ? "1 part" : `${k} parts`}`, price as Price, doRemake) : (
                    <Button className="h-11 sm:h-10" disabled={!canRemake} onClick={() => (askFirst(price) ? setAsking(true) : doRemake())}>
                      {red ? "Make it anyway" : "Remake changed parts"}
                    </Button>
                  ))}
                  {status}
                </>
              )}
            </div>
          )}
        </div>
      ))}
    </section>
  );
}
