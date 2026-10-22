// Voice note (plan-interview, Leo only): record one on the mic or upload one (a WhatsApp voice note works), and it
// lands as text in the long piece's paste box. The job runs in src/lib/voiceNote.ts, outside React; LongPiece moves
// the finished transcript into the box.

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ThinkingOrb } from "thinking-orbs";
import { AlertTriangle, Mic, RotateCcw, Square, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import PriceChip from "@/components/PriceChip";
import { useUsesLeft } from "@/lib/aiUsage";
import { clock } from "@/lib/micRecorder";
import { reasonText } from "@/lib/prices";
import { NOTE_ACCEPT, onVoiceJob, recordNote, retryNote, stopNote, uploadNote, voiceJob } from "@/lib/voiceNote";

export default function VoiceNote({ userId }: { userId: string }) {
  const all = useSyncExternalStore(onVoiceJob, voiceJob, voiceJob);
  const job = all?.userId === userId ? all : null;
  const busy = job?.state === "starting" || job?.state === "recording" || job?.state === "reading";
  const left = useUsesLeft(busy)("video-transcribe");
  const why = reasonText({ left, leo: true });
  const [canRecord] = useState(() => typeof MediaRecorder !== "undefined");
  const [now, setNow] = useState(() => Date.now());
  const fileRef = useRef<HTMLInputElement>(null);

  const recording = job?.state === "recording";
  useEffect(() => {
    if (!recording) return;
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(t);
  }, [recording]);

  if (job?.state === "recording") {
    return (
      <div className="flex flex-wrap items-center gap-3" data-testid="voice-note-recording">
        <Button onClick={() => void stopNote()} className="h-11 gap-1.5 bg-gradient-primary text-primary-foreground hover:opacity-95 sm:h-10">
          <Square className="h-4 w-4" /> Stop
        </Button>
        <p className="flex items-center gap-2 text-sm font-medium text-foreground" aria-live="polite">
          <span className="h-2.5 w-2.5 rounded-full bg-destructive motion-safe:animate-pulse" aria-hidden />
          Recording <span className="tabular-nums">{clock(Math.max(0, (now - job.startedAt) / 1000))}</span>
        </p>
      </div>
    );
  }

  if (job?.state === "reading") {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4" role="status" data-testid="voice-note-reading">
        <ThinkingOrb state="composing" size={20} theme="light" aria-hidden />
        <p className="text-sm font-medium text-foreground">Turning your voice note into text...</p>
      </div>
    );
  }

  const off = left === 0 || busy;
  return (
    <div className="space-y-3" data-testid="voice-note">
      <div className="flex flex-wrap items-center gap-2">
        {canRecord && (
          <Button onClick={() => void recordNote(userId)} disabled={off} className="h-11 gap-1.5 bg-gradient-primary text-primary-foreground hover:opacity-95 sm:h-10">
            <Mic className="h-4 w-4" /> Record a voice note
          </Button>
        )}
        <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={off} className="h-11 gap-1.5 sm:h-10">
          <Upload className="h-4 w-4" /> Upload a voice note
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept={NOTE_ACCEPT}
          className="hidden"
          data-testid="voice-note-file"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void uploadNote(userId, f);
          }}
        />
        <span className="sm:ml-auto">
          <PriceChip feature="video-transcribe" opts={{ minutes: 1 }} left={left} />
        </span>
      </div>
      <p className="text-xs text-muted-foreground">Up to 12 minutes, priced per minute. WhatsApp voice notes work.</p>
      {job?.state === "failed" && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4" role="alert">
          <p className="flex min-w-0 flex-1 items-start gap-2 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {job.error}
          </p>
          {job.retry && (
            <Button size="sm" variant="outline" onClick={retryNote} disabled={left === 0} className="h-11 gap-1.5 sm:h-9">
              <RotateCcw className="h-4 w-4" /> Try again
            </Button>
          )}
        </div>
      )}
      {why && <p className="text-xs text-destructive">{why}</p>}
    </div>
  );
}
