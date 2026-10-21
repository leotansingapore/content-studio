// Your face (/people, the face tab; people-my-face): record 10 seconds once, reading a line with a code the server
// issued, and the AI videos start from that photo after. The recorder is ?record=1 (opening pushes, so Back closes
// it). Faces are counted on this device before anything is sent; the check itself runs in faceRecorder.ts, outside
// React, so leaving the page mid-check loses nothing. The recording never leaves the device.
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Link } from "react-router-dom";
import { Check, Loader2 } from "lucide-react";
import CopyLinkButton from "@/components/CopyLinkButton";
import PriceChip from "@/components/PriceChip";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useUsesLeft } from "@/lib/aiUsage";
import { callFn } from "@/lib/edgeFn";
import {
  CONSENT_LINE, CameraError, TAKE_SECONDS, checkState, onCheck, openCamera, pickPhotos, resetCheck, retryCheck, startCheck, startTake, stopCamera,
  type CameraProblem,
} from "@/lib/faceRecorder";
import { links } from "@/lib/links";
import { faceRecord, onFaceChanged, turnOffFace, verifiedDate } from "@/lib/myFace";
import { reasonText } from "@/lib/prices";
import { useUrlFlag, useUrlUpdate } from "@/lib/urlState";

type Step =
  | { s: "starting" }
  | { s: "camera"; problem: CameraProblem }
  | { s: "error"; error: string }
  | { s: "ready" }
  | { s: "recording"; secs: number }
  | { s: "finding" }
  | { s: "noface" }
  | { s: "pick"; photos: string[]; picked: number };

const NO_FACE = "We need one face, looking at the camera, in good light.";
const BLOCKED = "Your camera is blocked. Allow it in the address bar, then try again.";
const NO_CAMERA = "No camera found. Open this page on your phone to record.";
const CARD = "space-y-4 rounded-xl border border-border/60 p-4 shadow-card";
const BIG = "h-11 sm:h-10";

export default function FaceTab({ userId }: { userId: string }) {
  const { toast } = useToast();
  const [face, setFace] = useState(() => faceRecord(userId));
  const [record, setRecord] = useUrlFlag("record", "1");
  const update = useUrlUpdate();
  const check = useSyncExternalStore(onCheck, checkState);
  const [step, setStep] = useState<Step>({ s: "starting" });
  const [code, setCode] = useState<{ code: string; ticket: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [askOff, setAskOff] = useState(false);
  const left = useUsesLeft(check.state === "checking");
  const stream = useRef<MediaStream | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const take = useRef<{ stop: () => void; blob?: Blob } | null>(null);

  useEffect(() => onFaceChanged(() => setFace(faceRecord(userId))), [userId]);

  // the recorder: the camera and a fresh code together, while ?record=1 is open (and no check holds a take or just saved)
  useEffect(() => {
    const waiting = ["checking", "failed", "refused", "done"].includes(checkState().state);
    if (!record || waiting) return;
    let live = true;
    setStep({ s: "starting" });
    setCode(null);
    void Promise.allSettled([openCamera(), callFn<{ code: string; ticket: string }>("ai-video", { mode: "consent-code", kind: "face" })]).then(([cam, got]) => {
      if (cam.status === "fulfilled" && !live) return stopCamera(cam.value);
      if (!live) return;
      if (cam.status === "rejected") return setStep({ s: "camera", problem: cam.reason instanceof CameraError ? cam.reason.problem : "blocked" });
      stream.current = cam.value;
      if (got.status === "rejected") {
        stopCamera(stream.current);
        return setStep({ s: "error", error: got.reason instanceof Error ? got.reason.message : "Couldn't get a code. Try again in a minute." });
      }
      setCode(got.value);
      setStep({ s: "ready" });
    });
    return () => {
      live = false;
      take.current?.stop();
      take.current = null;
      stopCamera(stream.current);
      stream.current = null;
    };
  }, [record, attempt]);

  // the live preview, once its element is on screen; on a phone the line and the button come into view with it
  useEffect(() => {
    if ((step.s === "ready" || step.s === "recording") && video.current && stream.current && video.current.srcObject !== stream.current) {
      video.current.srcObject = stream.current;
    }
    if (step.s === "ready") document.getElementById("face-recorder")?.scrollIntoView({ block: "start" });
  }, [step.s]);

  // a check that finished, here or while the page was closed: say so once and close the recorder
  useEffect(() => {
    // read live, not from this render: the store moves on once this has run
    if (checkState().state !== "done") return;
    // the recorder closes first, so no run of the recorder above sees ?record=1 with the check already cleared
    if (record) {
      setRecord(false);
      return;
    }
    toast({ title: "Your face is saved." });
    setFace(faceRecord(userId));
    resetCheck();
  }, [check, record, setRecord, toast, userId]);

  const openRecorder = () => {
    resetCheck();
    setAskOff(false);
    if (record) setAttempt((n) => n + 1);
    else update({ record: "1" }, { push: true });
  };
  const closeRecorder = () => {
    resetCheck();
    setRecord(false);
  };

  const begin = () => {
    if (!stream.current || !video.current) return;
    try {
      const t = startTake(stream.current, video.current, (secs) => setStep((p) => (p.s === "recording" ? { s: "recording", secs } : p)));
      take.current = { stop: t.stop };
      setStep({ s: "recording", secs: 0 });
      void t.done.then(async (done) => {
        if (take.current?.stop !== t.stop) return; // closed or started again
        take.current = { stop: () => {}, blob: done.blob };
        stopCamera(stream.current);
        stream.current = null;
        setStep({ s: "finding" });
        const found = await pickPhotos(done.frames).catch(() => null);
        if (take.current?.blob !== done.blob) return;
        if (!found) return setStep({ s: "error", error: "Couldn't look at the recording. Record again." });
        setStep(found.ok ? { s: "pick", photos: found.photos, picked: 0 } : { s: "noface" });
      }, () => setStep({ s: "error", error: "The recording stopped. Record again." }));
    } catch (e) {
      setStep({ s: "error", error: (e as Error).message });
    }
  };
  const stop = () => {
    // shown at once; the photos follow when the frames are looked at
    setStep({ s: "finding" });
    take.current?.stop();
  };
  const save = () => {
    if (step.s !== "pick" || !code || !take.current?.blob) return;
    void startCheck({ userId, take: take.current.blob, photo: step.photos[step.picked], code: code.code, ticket: code.ticket });
  };
  const turnOff = () => {
    turnOffFace(userId);
    setAskOff(false);
    setFace(faceRecord(userId));
  };

  const usesLeft = left("likeness-check");
  const why = reasonText({ left: usesLeft, leo: true });
  const waiting = check.state === "checking" || check.state === "failed" || check.state === "refused";

  // ---------- the check, the recorder, then the face itself ----------

  if (waiting) {
    return (
      <section className={CARD} aria-live="polite">
        <h2 className="font-serif text-lg font-semibold">Your face</h2>
        {check.state === "checking" ? (
          <p className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Hearing your code</p>
        ) : (
          <>
            <p className="text-sm text-destructive" role="alert">{check.error}</p>
            <div className="flex flex-wrap items-center gap-2">
              {check.state === "failed" ? (
                <Button className={BIG} onClick={() => void retryCheck()}>Try again</Button>
              ) : (
                <Button className={BIG} onClick={openRecorder}>Record again</Button>
              )}
              <Button variant="ghost" className={`${BIG} text-muted-foreground`} onClick={closeRecorder}>Cancel</Button>
            </div>
          </>
        )}
      </section>
    );
  }

  if (record) {
    const line = code ? CONSENT_LINE(code.code) : "";
    const spaced = code ? code.code.split("").join(" ") : "";
    const live = step.s === "ready" || step.s === "recording";
    return (
      <section id="face-recorder" className={`${CARD} scroll-mt-16`} aria-label="Record your face">
        <h2 className="font-serif text-lg font-semibold">Your face</h2>
        <div className="grid gap-4 sm:grid-cols-[minmax(0,280px)_minmax(0,1fr)] sm:items-start">
          {live && (
            <div className="relative mx-auto aspect-[3/4] w-full max-w-[200px] overflow-hidden rounded-xl bg-black sm:mx-0 sm:max-w-[280px]">
              <video ref={video} autoPlay muted playsInline className="h-full w-full -scale-x-100 object-cover" aria-label="Your camera" />
              {/* where the face goes */}
              <div className="pointer-events-none absolute left-1/2 top-[42%] h-[58%] w-[62%] -translate-x-1/2 -translate-y-1/2 rounded-[50%] border-2 border-dashed border-white/70" aria-hidden />
              {step.s === "recording" && (
                <span className="absolute left-2 top-2 flex items-center gap-1.5 rounded-full bg-black/60 px-2 py-1 text-xs font-semibold text-white">
                  <span className="h-2 w-2 rounded-full bg-red-500" aria-hidden /> REC
                </span>
              )}
            </div>
          )}
          <div className={`min-w-0 space-y-4 ${live ? "" : "sm:col-span-2"}`} aria-live="polite">
            {step.s === "starting" && <p className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Getting the camera ready</p>}
            {live && (
              <>
                <p className="text-sm text-muted-foreground">Look at the camera and read the line.</p>
                <p className="text-xl font-semibold leading-snug sm:text-2xl">
                  {line.slice(0, line.lastIndexOf(spaced))}
                  <span className="whitespace-nowrap rounded bg-primary/10 px-1 tabular-nums text-primary">{spaced}</span>.
                </p>
                {step.s === "ready" ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <Button className={BIG} onClick={begin}>Start recording</Button>
                    <Button variant="ghost" className={`${BIG} text-muted-foreground`} onClick={closeRecorder}>Cancel</Button>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-3">
                    <Button variant="outline" className={BIG} onClick={stop}>Stop</Button>
                    <span className="text-sm tabular-nums" role="timer">Recording, {Math.max(0, Math.ceil(TAKE_SECONDS - step.secs))}s left</span>
                  </div>
                )}
              </>
            )}
            {step.s === "finding" && <p className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Finding your face</p>}
            {(step.s === "camera" || step.s === "error" || step.s === "noface") && (
              <>
                <p className="text-sm text-destructive" role="alert">
                  {step.s === "camera" ? (step.problem === "missing" ? NO_CAMERA : BLOCKED) : step.s === "noface" ? NO_FACE : step.error}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <Button className={BIG} onClick={openRecorder}>Record again</Button>
                  {step.s === "camera" && step.problem === "missing" && <CopyLinkButton path={links.people({ record: true })} />}
                  <Button variant="ghost" className={`${BIG} text-muted-foreground`} onClick={closeRecorder}>Cancel</Button>
                </div>
              </>
            )}
            {step.s === "pick" && (
              <>
                <p className="text-sm">Pick the photo your videos start from.</p>
                <div className="grid max-w-md grid-cols-3 gap-2" role="radiogroup" aria-label="Your photo">
                  {step.photos.map((p, i) => (
                    <button key={i} type="button" role="radio" aria-checked={step.picked === i} aria-label={`Photo ${i + 1}`}
                      onClick={() => setStep({ ...step, picked: i })}
                      className={`relative overflow-hidden rounded-lg border-2 transition-colors ${step.picked === i ? "border-primary" : "border-transparent hover:border-border"}`}>
                      <img src={p} alt="" className="aspect-[9/16] w-full object-cover" />
                      {step.picked === i && <Check className="absolute right-1 top-1 h-5 w-5 rounded-full bg-primary p-0.5 text-primary-foreground" aria-hidden />}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <Button className={BIG} disabled={usesLeft === 0} onClick={save}>Save my face</Button>
                  <PriceChip feature="likeness-check" left={usesLeft} />
                  <Button variant="ghost" className={`${BIG} text-muted-foreground`} onClick={closeRecorder}>Cancel</Button>
                </div>
                {why && <p className="text-xs text-muted-foreground">{why}</p>}
              </>
            )}
          </div>
        </div>
      </section>
    );
  }

  if (face?.status === "on") {
    return (
      <section className={CARD}>
        <h2 className="font-serif text-lg font-semibold">Your face</h2>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <img src={face.photo} alt="Your saved face" className="aspect-[9/16] w-32 rounded-lg object-cover sm:w-36" />
          <div className="min-w-0 space-y-3">
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
              <Check className="h-3.5 w-3.5" aria-hidden /> Verified {verifiedDate(face.consent.at)}
            </span>
            <p className="text-sm text-muted-foreground">Used in: You speaking, template clips with a person.</p>
            {askOff ? (
              <div className="space-y-2" role="group" aria-label="Turn off your face">
                <p className="text-sm">Turn off your face? AI videos stop using it. Videos already made stay as they are.</p>
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="destructive" className={BIG} onClick={turnOff}>Turn it off</Button>
                  <Button variant="ghost" className={BIG} onClick={() => setAskOff(false)}>Keep it</Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <Button asChild className={BIG}>
                  <Link to={links.edit({ panel: ["ai"], kind: "avatar", face: "mine" })}>Make a video</Link>
                </Button>
                <Button variant="outline" className={BIG} onClick={openRecorder}>Record again</Button>
                <Button variant="ghost" className={`${BIG} text-muted-foreground`} onClick={() => setAskOff(true)}>Turn off my face</Button>
              </div>
            )}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className={CARD}>
      <h2 className="font-serif text-lg font-semibold">Your face</h2>
      {face?.status === "off" && <p className="text-sm">Your face is off. Record again to turn it back on.</p>}
      <p className="text-sm text-muted-foreground">Record 10 seconds once. Your AI videos start from it after that.</p>
      <Button className={BIG} onClick={openRecorder}>Record my face</Button>
    </section>
  );
}
