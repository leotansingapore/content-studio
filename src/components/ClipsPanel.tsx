// Long video into clips (/edit?panel=clips, Leo only; docs/north-star/items/formats-clips.md): drop a recording,
// set the topic, length and look once, and see what it takes before anything runs. One press saves it with that
// look, captions it by itself and finds the clips by itself when the words land (clipAsk.ts), even on another page.
// The YouTube moments list sits here too, since no file is cut from a link.

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Film, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FilterChip } from "@/components/ui/filter-chip";
import PriceChip from "@/components/PriceChip";
import YoutubeClips from "@/components/YoutubeClips";
import { useUsesLeft } from "@/lib/aiUsage";
import { CLIP_LENGTH_IDS, LENGTH_LABELS, clipPlan, loadClipLook, planIssue, presetLook, saveClipLook, skillLook, type ClipAsk, type ClipLength } from "@/lib/clipAsk";
import { MAX_LONG_BYTES, MAX_LONG_SECONDS, hoursMinutes } from "@/lib/longCaptions";
import { mediaLength } from "@/lib/longAudio";
import { priceOf, sumPrices } from "@/lib/prices";
import { PRESETS } from "@/lib/stylePresets";
import { useUrlState, useUrlUpdate } from "@/lib/urlState";
import { fmtTime } from "@/lib/videoEdit";
import { defaultSkill, loadSkills } from "@/lib/videoSkills";

/** Clip finding reads at least this much (video-assist clips). */
const MIN_SECONDS = 45;

export default function ClipsPanel({ userId, busy, onStart, onClose }: {
  userId: string | null;
  busy: string;
  /** Saves the recording with the look and leaves the ask for its words. */
  onStart: (file: File, ask: { look: string; clips: ClipAsk }) => void;
  onClose: () => void;
}) {
  const [params] = useSearchParams();
  const updateUrl = useUrlUpdate();
  const [rec, setRec] = useState<{ file: File; seconds: number } | null>(null);
  const [note, setNote] = useState("");
  const [over, setOver] = useState(false);
  const [topic, setTopic] = useState("");
  const [length, setLength] = useUrlState<ClipLength>("len", "auto", { allowed: CLIP_LENGTH_IDS, remember: "cs-clips-length" });
  const [look, setLook] = useState(loadClipLook);
  const [yt] = useState(() => params.get("yt") ?? undefined);
  // ?about= fills the topic once, then leaves the address
  useEffect(() => {
    const a = params.get("about");
    if (!a) return;
    setTopic(a.slice(0, 200));
    updateUrl({ about: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const skills = useMemo(() => loadSkills(userId), [userId]);
  const mine = defaultSkill(skills);
  const looks = [
    { id: "", label: `${mine?.name ?? "Bold"} (default)` },
    ...skills.filter((s) => s !== mine).map((s) => ({ id: skillLook(s.id), label: s.name })),
    ...PRESETS.map((p) => ({ id: presetLook(p.id), label: p.label })),
  ];
  const pickLook = (id: string) => {
    setLook(id);
    saveClipLook(id);
  };

  const left = useUsesLeft(!!busy);
  const plan = rec ? clipPlan(rec.seconds) : null;
  const issue = plan ? planIssue(plan, { captions: left("video-transcribe"), finds: left("video-clips") }) : null;
  const price = rec && plan ? sumPrices(priceOf("video-transcribe", { minutes: rec.seconds / 60 }), priceOf("video-clips", { passes: plan.finds })) : null;

  const pick = async (f: File | undefined) => {
    if (!f) return;
    if (!f.type.startsWith("video/") && !f.type.startsWith("audio/")) return setNote("That isn't a video or sound file.");
    if (f.size > MAX_LONG_BYTES) return setNote("That file is over 4 GB. Trim it or export a smaller copy first.");
    setNote("Reading the recording...");
    const seconds = await mediaLength(f);
    if (!Number.isFinite(seconds) || seconds <= 0) return setNote("This browser can't open that video. Try an MP4 or MOV.");
    if (seconds > MAX_LONG_SECONDS) return setNote(`That recording runs ${hoursMinutes(seconds)}. The editor takes up to about 2 hours. Trim it first.`);
    setNote(seconds < MIN_SECONDS ? "Clips need a video of at least 45 seconds." : "");
    setRec({ file: f, seconds });
  };
  const ready = !!rec && rec.seconds >= MIN_SECONDS && !issue && !busy && !!userId;
  const start = () => rec && userId && onStart(rec.file, { look, clips: { userId, about: topic.trim(), length } });

  return (
    <section className="space-y-3 rounded-xl border border-primary/25 bg-primary/5 p-3" aria-label="Long video into clips">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Long video into clips</h2>
        <Button size="sm" variant="ghost" className="h-9 [@media(pointer:coarse)]:min-h-11" onClick={onClose}>Close</Button>
      </div>
      <label
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); void pick(e.dataTransfer.files[0]); }}
        className={`flex min-h-24 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed bg-background p-4 text-center transition-colors ${over ? "border-primary bg-primary/5" : "border-border/70 hover:border-primary/50"} ${busy ? "pointer-events-none opacity-60" : ""}`}
      >
        {rec ? (
          <span className="flex min-w-0 max-w-full items-center gap-2 text-sm font-semibold">
            <Film className="h-4 w-4 shrink-0 text-primary" />
            <span className="truncate">{rec.file.name}</span>
            <span className="shrink-0 font-normal text-muted-foreground">{fmtTime(rec.seconds)}</span>
          </span>
        ) : (
          <>
            <Upload className="h-5 w-5 text-primary" />
            <span className="text-sm font-semibold">Drop a webinar, seminar, podcast or Zoom recording</span>
            <span className="text-xs text-muted-foreground">Up to 4 GB and about 2 hours. It stays on this device.</span>
          </>
        )}
        <input type="file" accept="video/*,audio/*" className="sr-only" disabled={!!busy} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; void pick(f); }} />
      </label>
      {note && <p className="text-xs text-muted-foreground" role="status">{note}</p>}
      <label className="block space-y-1 text-xs font-semibold">
        <span className="block">What should the clips be about? (optional)</span>
        <Input value={topic} onChange={(e) => setTopic(e.target.value)} maxLength={200} placeholder="e.g. hospital bills" className="h-11 text-sm font-normal sm:h-10" />
      </label>
      <div className="space-y-1">
        <p className="text-xs font-semibold" id="clips-length">Length</p>
        <div className="flex flex-wrap gap-1.5" role="group" aria-labelledby="clips-length">
          {CLIP_LENGTH_IDS.map((l) => <FilterChip key={l} active={length === l} onClick={() => setLength(l)}>{LENGTH_LABELS[l]}</FilterChip>)}
        </div>
      </div>
      <label className="block space-y-1 text-xs font-semibold">
        <span className="block">Look</span>
        <select value={looks.some((l) => l.id === look) ? look : ""} onChange={(e) => pickLook(e.target.value)}
          className="h-11 w-full rounded-md border border-input bg-background px-2 text-sm font-normal sm:h-10 sm:w-auto sm:min-w-64">
          {looks.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
        </select>
      </label>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-primary/15 pt-3">
        <Button className="h-11 sm:h-10" disabled={!ready} onClick={start}>Find clips</Button>
        {plan && (
          <span className="text-xs text-muted-foreground" aria-live="polite">
            This video: about {plan.captions} {plan.captions === 1 ? "use" : "uses"} of captioning and {plan.finds} of clip finding.{" "}
            <PriceChip price={price} left={null} /> <span className="text-[11px] text-muted-foreground">for this video</span>
          </span>
        )}
        {!rec && !busy && <span className="text-xs text-muted-foreground">Add a recording first.</span>}
        {busy && <span className="text-xs font-medium" aria-live="polite">{busy}</span>}
        {issue && <p className="basis-full text-xs font-medium text-destructive" role="alert">{issue}</p>}
      </div>
      <div className="border-t border-primary/15 pt-3">
        <YoutubeClips userId={userId} panel={{ yt }} />
      </div>
    </section>
  );
}
