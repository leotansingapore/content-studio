// Your own video or pictures (/edit?panel=own, Leo only; docs/north-star/items/formats-custom.md): drop a video or
// up to 10 pictures, say what it is about, pick the sound, and get a vertical video with words on screen in the
// editor. Pictures: Make it writes the words (shown here to edit, with compliance chips that warn and never block),
// then Make the video makes the voiceover and puts it together (ownMedia.ts, outside React). A video goes through
// the editor's own upload, which writes its words on screen once its captions show little or no speech.

import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ChevronDown, ChevronUp, Film, Trash2, Upload } from "lucide-react";
import { ThinkingOrb } from "thinking-orbs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FilterChip } from "@/components/ui/filter-chip";
import ComplianceChips from "@/components/ComplianceChips";
import PriceChip from "@/components/PriceChip";
import { useUsesLeft } from "@/lib/aiUsage";
import { scanCompliance } from "@/lib/compliance";
import { MAX_LONG_BYTES } from "@/lib/longCaptions";
import { mediaLength } from "@/lib/longAudio";
import {
  MAX_PICTURES, SOUND_LABELS, clearOwn, keepMusic, makeOwn, movePicture, mutedWithMusic, onOwn, ownState, pickFiles, setOwn, sortDrop, writeOwn,
  type OwnSound, type OwnWords,
} from "@/lib/ownMedia";
import { priceOf, sumPrices } from "@/lib/prices";
import { VOICES, VOICE_IDS } from "@/lib/textVoice";
import { useUrlUpdate } from "@/lib/urlState";
import { fmtTime } from "@/lib/videoEdit";
import { stills, type JoinExtra } from "@/lib/videoMedia";
import type { UsageFeature } from "../../supabase/functions/_shared/usageCaps.ts";

const OVER = "Up to 10 pictures. The first 10 are kept.";
const UNREADABLE = "That picture couldn't be read. Try a JPG or PNG.";
const SEVERAL = "Several videos: join them first, then add words.";
/** The uses line's name for each cap the press can spend. */
const CAP_NAMES: Partial<Record<UsageFeature, string>> = { "own-words": "Words", "ai-voice": "Voiceovers", "video-transcribe": "Captioning" };

export default function OwnMediaPanel({ userId, busy, onUpload, onJoin, onClose }: {
  userId: string | null;
  /** The editor's own line while it saves, captions or puts a video together. */
  busy: string;
  onUpload: (file: File, extra?: JoinExtra, ask?: { own: { about: string } }) => unknown;
  /** Opens Join takes beside this panel. */
  onJoin: () => void;
  onClose: () => void;
}) {
  const [s, setS] = useState(ownState);
  useEffect(() => onOwn(() => setS(ownState())), []);
  const [params] = useSearchParams();
  const updateUrl = useUrlUpdate();
  // ?about= fills the field once, then leaves the address
  useEffect(() => {
    const a = params.get("about");
    if (!a) return;
    setOwn({ about: a.slice(0, 300) });
    updateUrl({ about: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [over, setOver] = useState(false);
  const [dismissed, setDismissed] = useState<string[]>([]);

  const pictures = s.pictures.length > 0;
  const video = s.video;
  const voice = pictures && s.sound === "voice";
  // pictures need words for the screen or for the voice; a video gets them only when it turns out to have no speech
  const writes = pictures && (s.words || voice) && !s.written;
  const spends: UsageFeature[] = [
    ...((writes || (video && s.words)) ? (["own-words"] as const) : []),
    ...(voice ? (["ai-voice"] as const) : []),
    ...(video && s.sound === "keep" ? (["video-transcribe"] as const) : []),
  ];
  const working = !!s.step || !!busy;
  const left = useUsesLeft(working);
  const out = spends.find((c) => left(c) === 0);
  const least = spends.reduce<number | null>((m, c) => (left(c) === null ? m : Math.min(m ?? Infinity, left(c)!)), null);
  const minutes = video && Number.isFinite(video.seconds) ? video.seconds / 60 : 1;
  const price = sumPrices(...spends.map((c) => priceOf(c, c === "video-transcribe" ? { minutes } : undefined)));
  const about = s.about.trim();
  const needsAbout = (writes || (video && s.words)) && !about;
  const can = (pictures || !!video) && !needsAbout && !out && !working && !!userId;
  const label = pictures && !writes ? "Make the video" : "Make it";

  const pick = async (files: File[]) => {
    const d = sortDrop(files, s.pictures.length);
    if (!d) return setOwn({ note: "Add a video, or JPG, PNG or WEBP pictures." });
    if (d.kind === "join") {
      setOwn({ note: SEVERAL });
      return onJoin();
    }
    if (d.kind === "video") {
      if (d.file.size > MAX_LONG_BYTES) return setOwn({ note: "That file is over 4 GB. Trim it or export a smaller copy first." });
      setOwn({ note: "Reading your video..." });
      const seconds = await mediaLength(d.file);
      const thumb = await stills(d.file, [0.3], 240).then((t) => t[0] ?? null, () => null);
      pickFiles(d, { seconds, thumb });
      return setOwn({ note: "" });
    }
    setOwn({ note: "Reading your pictures..." });
    // a picture that won't decode is dropped and the rest stay
    const ok: File[] = [];
    for (const f of d.files) {
      try {
        (await createImageBitmap(f)).close();
        ok.push(f);
      } catch {
        // said below
      }
    }
    pickFiles({ ...d, files: ok });
    setOwn({ note: ok.length < d.files.length ? UNREADABLE : d.over ? OVER : "" });
  };

  const press = async () => {
    if (video) {
      const music = s.sound === "music" && s.music ? await keepMusic(s.music) : undefined;
      const extra: JoinExtra | undefined = music ? { settings: mutedWithMusic(music) } : undefined;
      await onUpload(video.file, extra, s.words ? { own: { about } } : undefined);
      // the pick stays until the editor has the video, so a failed upload can be tried again
      if (new URLSearchParams(window.location.search).has("p")) clearOwn();
      return;
    }
    if (writes && userId) return writeOwn(userId);
    return makeOwn();
  };

  const edit = (w: Partial<OwnWords>) => s.written && setOwn({ written: { ...s.written, ...w } });
  const at = (list: string[], i: number, v: string) => list.map((x, k) => (k === i ? v : x));
  // one flag per rule and word across the hook and every line, shown under the words; they warn and never block
  const shownText = s.written ? [...(s.words ? [s.written.hook, ...s.written.lines] : []), ...(voice ? s.written.say ?? [] : [])].join("\n") : "";
  const flags = scanCompliance(shownText).filter((f) => !dismissed.includes(f.id));
  const sounds: OwnSound[] = video ? ["music", "keep"] : ["voice", "music"];
  const status = s.step === "writing" ? "Writing the words..." : s.step === "voice" ? "Making the voiceover..." : busy || (s.step === "joining" ? "Putting your video together" : "");
  const iconBtn = "flex h-8 w-8 items-center justify-center rounded-md border border-border/60 text-muted-foreground hover:text-foreground disabled:opacity-40 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11";

  return (
    <section className="space-y-3 rounded-xl border border-primary/25 bg-primary/5 p-3" aria-label="Your own video or pictures">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Your own video or pictures</h2>
        <Button size="sm" variant="ghost" className="h-9 [@media(pointer:coarse)]:min-h-11" onClick={onClose}>Close</Button>
      </div>
      <label
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); void pick([...e.dataTransfer.files]); }}
        className={`flex min-h-24 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed bg-background p-4 text-center transition-colors ${over ? "border-primary bg-primary/5" : "border-border/70 hover:border-primary/50"} ${working ? "pointer-events-none opacity-60" : ""}`}
      >
        {video ? (
          <span className="flex min-w-0 max-w-full items-center gap-2 text-sm font-semibold">
            {video.thumb ? <img src={video.thumb} alt="" className="h-12 w-auto shrink-0 rounded" /> : <Film className="h-4 w-4 shrink-0 text-primary" />}
            <span className="truncate">{video.file.name}</span>
            {Number.isFinite(video.seconds) && <span className="shrink-0 font-normal text-muted-foreground">{fmtTime(video.seconds)}</span>}
          </span>
        ) : (
          <>
            <Upload className="h-5 w-5 text-primary" />
            <span className="text-sm font-semibold">{pictures ? `Add more pictures (${s.pictures.length} of ${MAX_PICTURES})` : "Drop a video, or up to 10 pictures"}</span>
            <span className="text-xs text-muted-foreground">A video up to 4 GB, or JPG, PNG or WEBP pictures</span>
          </>
        )}
        <input type="file" multiple accept="video/*,image/jpeg,image/png,image/webp" className="sr-only" disabled={working}
          onChange={(e) => { const f = [...(e.target.files ?? [])]; e.target.value = ""; if (f.length) void pick(f); }} />
      </label>
      {s.note && <p className="text-xs text-muted-foreground" role="status">{s.note}</p>}

      {pictures && (
        <ol className="grid gap-2 sm:grid-cols-2" aria-label="Your pictures, in order">
          {s.pictures.map((p, i) => (
            <li key={p.url} className="flex min-w-0 gap-2 rounded-lg border border-border/60 bg-background p-1.5">
              <img src={p.url} alt={`Picture ${i + 1}`} className="h-24 w-14 shrink-0 rounded object-cover" />
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-[11px] font-medium text-muted-foreground">Picture {i + 1}</p>
                {s.written && s.words && (
                  <Input value={s.written.lines[i] ?? ""} maxLength={60} aria-label={`Words on picture ${i + 1}`} disabled={working}
                    onChange={(e) => edit({ lines: at(s.written!.lines, i, e.target.value) })} className="h-10 text-xs" />
                )}
                {s.written?.say && voice && (
                  <Textarea rows={2} value={s.written.say[i] ?? ""} aria-label={`Said over picture ${i + 1}`} disabled={working}
                    onChange={(e) => edit({ say: at(s.written!.say!, i, e.target.value) })} className="min-h-0 text-xs" />
                )}
              </div>
              <div className="flex shrink-0 flex-col gap-1">
                <button type="button" className={iconBtn} aria-label={`Move picture ${i + 1} up`} disabled={!i || working} onClick={() => movePicture(i, -1)}><ChevronUp className="h-4 w-4" /></button>
                <button type="button" className={iconBtn} aria-label={`Move picture ${i + 1} down`} disabled={i === s.pictures.length - 1 || working} onClick={() => movePicture(i, 1)}><ChevronDown className="h-4 w-4" /></button>
                <button type="button" className={`${iconBtn} hover:text-destructive`} aria-label={`Remove picture ${i + 1}`} disabled={working} onClick={() => movePicture(i, 0)}><Trash2 className="h-4 w-4" /></button>
              </div>
            </li>
          ))}
        </ol>
      )}

      {s.written && s.words && (
        <label className="block space-y-1 text-xs font-semibold">
          <span className="block">Hook</span>
          <Input value={s.written.hook} maxLength={90} disabled={working} onChange={(e) => edit({ hook: e.target.value })} className="h-10 text-sm font-normal" />
        </label>
      )}
      {s.written && <ComplianceChips flags={flags} onDismiss={(id) => setDismissed((d) => [...d, id])} />}

      <label className="block space-y-1 text-xs font-semibold">
        <span className="block">What is it about?</span>
        <Input value={s.about} maxLength={300} disabled={working} onChange={(e) => setOwn({ about: e.target.value })}
          placeholder="e.g. why I check my clients' cover every year" className="h-11 text-sm font-normal sm:h-10" />
      </label>
      <div className="space-y-1.5">
        <p className="text-xs font-semibold" id="own-sound">Sound</p>
        <div className="flex flex-wrap gap-1.5" role="group" aria-labelledby="own-sound">
          {sounds.map((k) => <FilterChip key={k} active={s.sound === k} disabled={working} onClick={() => setOwn({ sound: k })}>{SOUND_LABELS[k]}</FilterChip>)}
        </div>
        {voice && (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Voice">
            {VOICE_IDS.map((v) => <FilterChip key={v} active={s.voice === v} disabled={working} onClick={() => setOwn({ voice: v })}>{VOICES[v].label}</FilterChip>)}
          </div>
        )}
        {s.sound === "music" && (
          <label className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-md border border-border/70 bg-background px-3 text-xs font-semibold hover:border-primary/40 sm:min-h-9">
            {s.music ? `Music: ${s.music.name}` : "Add your music (optional)"}
            <input type="file" accept="audio/*" className="sr-only" disabled={working} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) setOwn({ music: f }); }} />
          </label>
        )}
      </div>
      <label className="flex min-h-11 w-fit cursor-pointer items-center gap-2 text-xs font-semibold">
        <input type="checkbox" role="switch" checked={s.words} disabled={working} onChange={(e) => setOwn({ words: e.target.checked })} className="h-5 w-5 accent-primary" />
        Words on screen
      </label>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-primary/15 pt-3">
        <Button className="h-11 sm:h-10" disabled={!can} onClick={() => void press()}>{label}</Button>
        {!working && <PriceChip price={price} left={least} />}
        {working && status && (
          <span className="flex items-center gap-1.5 text-xs font-medium" aria-live="polite">
            <ThinkingOrb state="working" size={20} theme="light" aria-hidden /> {status}
          </span>
        )}
        {!working && !pictures && !video && <span className="text-xs text-muted-foreground">Add a video or pictures first.</span>}
        {!working && needsAbout && <span className="text-xs text-muted-foreground">Say what it is about first.</span>}
        {out && !working && <p className="basis-full text-xs font-medium text-destructive">{CAP_NAMES[out]}: none left today</p>}
        {s.error && !working && (
          <div role="alert" className="flex basis-full flex-wrap items-center gap-2 text-xs text-destructive">
            <span className="mr-auto">{s.error}</span>
            <Button size="sm" variant="outline" className="h-11 sm:h-8" disabled={!can} onClick={() => void press()}>Try again</Button>
          </div>
        )}
      </div>
    </section>
  );
}

