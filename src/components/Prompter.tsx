// The teleprompter over a short video script (formats-hooks-scripts, Leo only), at /generate?draft=<id>&view=prompter.
// The lines scroll large in the top third, near the camera, at 2.0, 2.6 or 3.2 words a second after a 3-second
// count-in; Space or a tap on the words pauses and resumes, and it picks up where it stopped, even after a reload.
// "Record with my camera" films a front-camera take behind the dimmed words; "Use this take" hands it to /edit like
// any upload (handToEditor) and moves the post to the board's Editing column. No AI, nothing spent.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setStage } from "@/lib/board";
import { links } from "@/lib/links";
import { countWords } from "@/lib/platformCounters";
import { PROMPTER_SPEEDS, scrollSeconds, SPEED_LABELS, type PrompterSpeed } from "@/lib/prompter";
import { handToEditor, pickMime } from "@/lib/videoMedia";

const BLOCKED = "Camera blocked. Allow the camera for this site in your browser settings, or film on your phone and upload it in Edit a video.";
const LEAVE = "Leave without using this take?";
const SIZES = { min: 20, max: 72, step: 4, start: 36 };

// A take stays while the page lives, so Back and Film it again still offer it; it goes when used or discarded.
let take: { draftId: string; blob: Blob; type: string; ext: string; seconds: number } | null = null;

const hint = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const setHint = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    // a device hint: losing it only resets the setting
  }
};
// where the last script stopped, as a share of the words, so a reopen or a reload picks up there
const savedAt = (draftId: string): number => {
  try {
    const at = JSON.parse(hint("cs-prompter-at") ?? "null") as { draft?: unknown; at?: unknown } | null;
    return at?.draft === draftId && typeof at.at === "number" && at.at > 0 && at.at < 1 ? at.at : 0;
  } catch {
    return 0;
  }
};
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

type Phase = "idle" | "count" | "rolling" | "paused" | "done";

export default function Prompter({ userId, draftId, name, lines, caption, onClose }: {
  userId: string;
  draftId: string;
  /** The project name the take opens with in the editor. */
  name: string;
  lines: string[];
  /** The post's caption, carried to the editor with the take. */
  caption: string;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const [speed, setSpeed] = useState<PrompterSpeed>(() => {
    const s = hint("cs-prompter-speed");
    return s && s in PROMPTER_SPEEDS ? (s as PrompterSpeed) : "normal";
  });
  const [size, setSize] = useState(() => {
    const n = Number(hint("cs-prompter-size"));
    return n >= SIZES.min && n <= SIZES.max ? n : SIZES.start;
  });
  const [mirror, setMirror] = useState(() => hint("cs-prompter-mirror") === "1");
  const [phase, setPhase] = useState<Phase>("idle");
  const [count, setCount] = useState(3);
  const [hasCam, setHasCam] = useState(false);
  const [camOn, setCamOn] = useState(false);
  const [camError, setCamError] = useState("");
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [taken, setTaken] = useState<number | null>(() => (take?.draftId === draftId ? take.seconds : null));

  const rootRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const wantRec = useRef(false);
  const discard = useRef(false);
  // the scroll position as a float (scrollTop rounds) and as a share of the words
  const pos = useRef(0);
  const frac = useRef(savedAt(draftId));
  const words = lines.reduce((n, l) => n + countWords(l), 0);
  const speedRef = useRef(speed);
  speedRef.current = speed;

  const textHeight = () => textRef.current?.offsetHeight ?? 0;
  const place = (p: number) => {
    pos.current = p;
    frac.current = textHeight() ? p / textHeight() : 0;
    if (boxRef.current) boxRef.current.scrollTop = p;
  };
  const savePos = () => setHint("cs-prompter-at", JSON.stringify({ draft: draftId, at: frac.current }));

  // where it stopped, once the box can scroll, and the same share of the words when the size or the screen changes
  useEffect(() => {
    const ro = new ResizeObserver(() => place(frac.current * textHeight()));
    if (boxRef.current) ro.observe(boxRef.current);
    if (textRef.current) ro.observe(textRef.current);
    return () => ro.disconnect();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    rootRef.current?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (typeof MediaRecorder !== "undefined" && navigator.mediaDevices?.getUserMedia && navigator.mediaDevices.enumerateDevices) {
      navigator.mediaDevices.enumerateDevices().then((d) => setHasCam(d.some((x) => x.kind === "videoinput")), () => setHasCam(false));
    }
    return () => {
      document.body.style.overflow = overflow;
      savePos();
      // Back while filming keeps the take for when the prompter opens again
      if (recRef.current?.state === "recording") recRef.current.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (camOn && videoRef.current) videoRef.current.srcObject = streamRef.current;
  }, [camOn]);

  // the count-in, then the take starts as the words do
  useEffect(() => {
    if (phase !== "count") return;
    setCount(3);
    let n = 3;
    const t = window.setInterval(() => {
      n -= 1;
      if (n > 0) return setCount(n);
      window.clearInterval(t);
      if (wantRec.current && !recRef.current) startRecorder();
      wantRec.current = false;
      setPhase("rolling");
    }, 1000);
    return () => window.clearInterval(t);
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // the scroll: the words' height over their reading time, so a speed or size change applies at once
  useEffect(() => {
    if (phase !== "rolling") return;
    let raf = 0;
    let last = performance.now();
    pos.current = boxRef.current?.scrollTop ?? pos.current;
    const step = (now: number) => {
      const end = textHeight();
      const secs = scrollSeconds(words, speedRef.current);
      const next = Math.min(end, pos.current + (secs > 0 ? (end / secs) * ((now - last) / 1000) : end));
      last = now;
      place(next);
      if (next >= end) {
        frac.current = 0;
        savePos();
        return setPhase("done");
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!recording) return;
    const from = Date.now();
    setElapsed(0);
    const t = window.setInterval(() => setElapsed((Date.now() - from) / 1000), 500);
    return () => window.clearInterval(t);
  }, [recording]);

  useEffect(() => {
    if (taken === null && !recording) return;
    const stay = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", stay);
    return () => window.removeEventListener("beforeunload", stay);
  }, [taken, recording]);

  const start = () => {
    wantRec.current = false;
    if (phase === "done") place(0);
    setPhase("count");
  };
  const pause = () => {
    setPhase("paused");
    savePos();
  };
  const toggle = () => (phase === "count" || phase === "rolling" ? pause() : start());

  function startRecorder() {
    const stream = streamRef.current;
    if (!stream) return;
    let mime: string, ext: string, rec: MediaRecorder;
    try {
      ({ mime, ext } = pickMime());
      rec = new MediaRecorder(stream, { mimeType: mime });
    } catch (e) {
      return setCamError((e as Error).message);
    }
    const chunks: Blob[] = [];
    const from = Date.now();
    discard.current = false;
    rec.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
    rec.onstop = () => {
      recRef.current = null;
      setRecording(false);
      if (discard.current || !chunks.length) return;
      const type = mime.split(";")[0];
      take = { draftId, blob: new Blob(chunks, { type }), type, ext, seconds: (Date.now() - from) / 1000 };
      setTaken(take.seconds);
    };
    rec.start(1000);
    recRef.current = rec;
    setRecording(true);
  }

  const record = async () => {
    setCamError("");
    if (!streamRef.current) {
      try {
        streamRef.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: true });
      } catch (e) {
        if ((e as DOMException).name === "NotFoundError") return setHasCam(false);
        return setCamError(BLOCKED);
      }
      setCamOn(true);
    }
    take = null;
    setTaken(null);
    wantRec.current = true;
    place(0);
    setPhase("count");
  };
  const stop = () => {
    recRef.current?.stop();
    if (phase === "count" || phase === "rolling") pause();
  };

  const leave = () => {
    if ((taken !== null || recording) && !window.confirm(LEAVE)) return;
    discard.current = true;
    take = null;
    onClose();
  };

  const sendTake = () => {
    if (!take) return;
    const t = take;
    take = null;
    void handToEditor(new File([t.blob], `${name.slice(0, 60) || "My take"}.${t.ext}`, { type: t.type }), { draftId, ...(caption ? { caption } : {}) }, "Your take");
    setStage(userId, draftId, "editing");
    navigate(links.edit());
  };

  // Space and Esc belong to the prompter while it is open, not to Write's shortcuts underneath
  const keys = useRef({ toggle, leave });
  keys.current = { toggle, leave };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== " " && e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      if (e.repeat) return;
      if (e.key === " ") keys.current.toggle();
      else keys.current.leave();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  const running = phase === "count" || phase === "rolling";
  const pill = (on: boolean) =>
    `h-11 min-w-11 rounded-full border px-2 text-xs font-semibold sm:px-3 transition-colors sm:h-9 ${on ? "border-white bg-white text-black" : "border-white/30 text-white/80 hover:text-white"}`;
  const dark = "h-12 border border-white/30 bg-white/10 px-5 text-white hover:bg-white/20 hover:text-white";

  // on document.body, so no transformed page wrapper moves the fixed full screen
  return createPortal(
    <div ref={rootRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Teleprompter" className="fixed inset-0 z-[100] flex flex-col bg-black text-white outline-none">
      {camOn && (
        <>
          <video ref={videoRef} autoPlay muted playsInline className="absolute inset-0 h-full w-full -scale-x-100 object-cover" />
          <div className="absolute inset-0 bg-black/55" aria-hidden />
        </>
      )}

      <div className="relative z-10 flex items-center gap-1 p-2 sm:gap-2 sm:p-3">
        <button type="button" onClick={leave} aria-label="Close" className="flex h-11 w-11 items-center justify-center rounded-full border border-white/30 hover:bg-white/10">
          <X className="h-5 w-5" />
        </button>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-1 sm:gap-2">
          <div role="group" aria-label="Speed" className="flex gap-1">
            {(Object.keys(PROMPTER_SPEEDS) as PrompterSpeed[]).map((s) => (
              <button key={s} type="button" aria-pressed={speed === s} className={pill(speed === s)} onClick={() => (setSpeed(s), setHint("cs-prompter-speed", s))}>
                {SPEED_LABELS[s]}
              </button>
            ))}
          </div>
          <div role="group" aria-label="Text size" className="flex gap-1">
            {([["A-", -1], ["A+", 1]] as const).map(([label, dir]) => (
              <button
                key={label}
                type="button"
                disabled={dir < 0 ? size <= SIZES.min : size >= SIZES.max}
                className={`${pill(false)} disabled:opacity-40`}
                onClick={() => {
                  const next = Math.min(SIZES.max, Math.max(SIZES.min, size + dir * SIZES.step));
                  setSize(next);
                  setHint("cs-prompter-size", String(next));
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <button type="button" aria-pressed={mirror} className={pill(mirror)} onClick={() => (setMirror(!mirror), setHint("cs-prompter-mirror", mirror ? "0" : "1"))}>
            Mirror
          </button>
        </div>
      </div>

      <div className="relative z-10 min-h-0 flex-1">
        {/* the reading line, near the top of the screen where a phone's camera is */}
        <div className="pointer-events-none absolute inset-x-0 top-[20dvh] z-10 border-t border-white/25" aria-hidden />
        <div
          ref={boxRef}
          onClick={toggle}
          onScroll={() => {
            if (phase !== "rolling" && boxRef.current) place(boxRef.current.scrollTop);
          }}
          className="h-full overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <div style={{ paddingTop: "20dvh", paddingBottom: "80dvh" }}>
            <div ref={textRef} className={`mx-auto max-w-3xl px-5 ${mirror ? "-scale-x-100" : ""}`} style={{ fontSize: size }}>
              {lines.map((l, i) => (
                <p key={i} className="pb-[0.6em] font-semibold leading-snug">
                  {l}
                </p>
              ))}
            </div>
          </div>
        </div>
        {phase === "count" && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-8xl font-bold tabular-nums" aria-live="assertive">
            {count}
          </div>
        )}
      </div>

      <div className="relative z-10 space-y-2 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]" aria-live="polite">
        {camError && <p role="alert" className="mx-auto max-w-xl text-center text-sm text-amber-300">{camError}</p>}
        {recording && (
          <p className="flex items-center justify-center gap-2 text-sm font-medium tabular-nums">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" aria-hidden /> Recording {clock(elapsed)}
          </p>
        )}
        {taken !== null && !recording && <p className="text-center text-sm text-white/80">Your take: {clock(taken)}</p>}
        <div className="flex flex-wrap items-center justify-center gap-2">
          {recording ? (
            <>
              <Button key="toggle" variant="ghost" className={dark} onClick={toggle}>{running ? "Pause" : "Start"}</Button>
              <Button key="stop" variant="destructive" className="h-12 px-6" onClick={stop}>Stop</Button>
            </>
          ) : taken !== null ? (
            <>
              <Button key="use" className="h-12 px-6" onClick={sendTake}>Use this take</Button>
              <Button key="again" variant="ghost" className={dark} onClick={() => void record()}>Record again</Button>
            </>
          ) : (
            <>
              <Button key="start" className="h-12 px-6" onClick={toggle}>{running ? "Pause" : "Start"}</Button>
              {hasCam && !running && <Button key="record" variant="ghost" className={dark} onClick={() => void record()}>Record with my camera</Button>}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
