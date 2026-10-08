import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Check, ChevronDown, ChevronUp, Download, Mic, Music as MusicIcon, RotateCw, Square, Volume2, Film, ImageIcon, Pause, Play, Scissors, Search, Sparkles, Trash2, Undo2, Upload, Wand2 } from "lucide-react";
import { ThinkingOrb } from "thinking-orbs";
import SectionTabs, { WRITE_TABS } from "@/components/SectionTabs";
import StockSearch from "@/components/StockSearch";
import { downloadStock, type StockItem } from "@/lib/stockMedia";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { InfoTip } from "@/components/ui/info-tip";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { streamOnePost } from "@/lib/batchGenerate";
import { splitScriptCaption } from "@/lib/scriptCaption";
import { upsertDraft } from "@/lib/draftHistory";
import { loadVoiceProfile } from "@/lib/voiceProfile";
import { scanCompliance } from "@/lib/compliance";
import { stripDashes } from "@/lib/recruit";
import { loadBrand } from "@/lib/carousel";
import { tagLinks, withSignOff } from "@/lib/plainText";
import { checkLimits } from "@/lib/platformCounters";
import { supabase } from "@/lib/supabase";
import {
  STYLES,
  STYLE_IDS,
  APP_COVER,
  appCover,
  applyFixes,
  exportIssues,
  applyPatch,
  aspectSize,
  captionCenter,
  captionKey,
  clipSettings,
  clearOfApp,
  fixFromEdit,
  END_CARD_SECONDS,
  FONTS,
  FILTERS,
  animOf,
  captionBoxOf,
  fullLength,
  findPhrase,
  levelFits,
  sanitizeLevel,
  duckSpans,
  musicGainAt,
  sanitizeMusic,
  MUSIC_LEVEL,
  sanitizeVoiceover,
  voiceAt,
  MAX_BROLL,
  newBroll,
  sanitizeBroll,
  type Broll,
  addRemoved,
  removedAt,
  sanitizeRemoved,
  wordRange,
  MAX_OVERLAYS,
  newOverlay,
  overlayHit,
  sanitizeOverlays,
  type Overlay,
  type OverlayKind,
  listCuts,
  platformFit,
  trimToLength,
  exportSize,
  fmtBytes,
  targetOf,
  EXPORT_TARGETS,
  type ExportTarget,
  lookOf,
  sameLook,
  toSrt,
  withLook,
  sentencesOf,
  defaultSettings,
  fmtTime,
  isFiller,
  outAt,
  srcAt,
  speedOf,
  SPEEDS,
  totalLength,
  withStyle,
  type CaptionFix,
  type CoverApp,
  type ExportIssue,
  type EditSettings,
  type StyleId,
} from "@/lib/videoEdit";
import {
  bufferTrack,
  decodeSound,
  drawEndCard,
  drawFrame,
  ensureCaptionFonts,
  loadBrandArt,
  measureExport,
  measureLevel,
  wireVoice,
  exportJob,
  makeCover,
  extractWav,
  getFile,
  loadVideo,
  onExportJob,
  planFor,
  putFile,
  startExport,
  stills,
  syncBroll,
  type BrandArt,
  type ExportJob,
} from "@/lib/videoMedia";
import { fileKey, findClips, loadFixes, loadProjects, removeProject, saveFixes, saveProject, transcribe, translateCaptions, vibeEdit, type VideoProject } from "@/lib/videoProjects";
import { defaultSkill, loadSkills, newSkillId, removeSkill, saveSkill, suggestName, type VideoSkill } from "@/lib/videoSkills";

const MAX_BYTES = 500 * 1024 * 1024;
type Tab = "style" | "cuts" | "frame" | "stickers" | "broll" | "words";

export default function VideoEditPage() {
  const { toast } = useToast();
  const [params, setParams] = useSearchParams();
  const [userId, setUserId] = useState<string | null>(null);
  const [projects, setProjects] = useState<VideoProject[]>([]);
  const [busy, setBusy] = useState<string>("");
  const pid = params.get("p");
  const project = projects.find((p) => p.id === pid) ?? null;

  useEffect(() => {
    document.title = "Edit video - Content Studio";
    supabase.auth.getUser().then(({ data }) => {
      const id = data.user?.id ?? null;
      setUserId(id);
      setProjects(loadProjects(id));
    });
  }, []);

  const upload = async (file: File) => {
    // A file picked before the sign-in check finished must not be dropped.
    const uid = userId ?? (await supabase.auth.getUser()).data.user?.id ?? null;
    if (!uid) return toast({ title: "Sign in again to edit videos", variant: "destructive" });
    if (!file.type.startsWith("video/")) return toast({ title: "That isn't a video file", variant: "destructive" });
    if (file.size > MAX_BYTES) return toast({ title: "That video is over 500 MB", description: "Trim it or export a smaller copy first.", variant: "destructive" });
    const id = `v${Date.now().toString(36)}`;
    try {
      setBusy("Reading your video...");
      await putFile(id, file);
      const [thumb] = await stills(file, [0.3], 240);
      const { wav, duration } = await extractWav(file);
      let p: VideoProject = {
        id, name: file.name.replace(/\.[^.]+$/, ""), createdAt: new Date().toISOString(), updatedAt: "", duration, size: file.size,
        words: [], settings: withLook(defaultSettings("bold"), defaultSkill(loadSkills(uid))?.look), thumb,
        ...(defaultSkill(loadSkills(uid))?.prompt ? { pendingSkill: defaultSkill(loadSkills(uid))!.id } : {}),
      };
      setProjects(saveProject(uid, p));
      setBusy(`Writing the captions (about ${Math.max(10, Math.round(duration / 4))} seconds)...`);
      try {
        const t = await transcribe(wav);
        const fixed = applyFixes(t.words, loadFixes(uid));
        p = { ...p, words: fixed.words };
        setProjects(saveProject(uid, p));
        if (fixed.count) toast({ title: `Fixed ${fixed.count} ${fixed.count === 1 ? "word" : "words"} from your list` });
      } catch (e) {
        toast({ title: "Captions didn't come through", description: `${(e as Error).message} Your video is saved; press Caption it to retry.`, variant: "destructive" });
      }
      setParams({ p: id });
    } catch (e) {
      toast({ title: "Couldn't open that video", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="space-y-5">
      <SectionTabs tabs={WRITE_TABS} />
      {project && userId ? (
        <Editor
          key={project.id}
          userId={userId}
          project={project}
          onSave={(p) => setProjects(saveProject(userId, p))}
          onClips={(ps) => { let list = projects; for (const p of [...ps].reverse()) list = saveProject(userId, p); setProjects(list); }}
          onOpen={(id) => setParams({ p: id })}
          onBack={() => setParams({})}
        />
      ) : (
        <Start busy={busy} projects={projects} onUpload={upload} onOpen={(id) => setParams({ p: id })}
          onRemove={(id) => userId && setProjects(removeProject(userId, id))} />
      )}
    </div>
  );
}

function Start({ busy, projects, onUpload, onOpen, onRemove }: {
  busy: string;
  projects: VideoProject[];
  onUpload: (f: File) => void;
  onOpen: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const [over, setOver] = useState(false);
  return (
    <>
      <header className="space-y-1">
        <h1 className="font-serif text-2xl font-semibold tracking-tight sm:text-3xl">Edit a video</h1>
        <ul className="flex flex-wrap gap-1.5 pt-1" aria-label="What it does">
          {["Auto captions", "Cuts um and long pauses", "Hook on screen", "9:16 reframe", "Find clips in a long video", "Vibe edit by chat", "MP4 export"].map((t) => (
            <li key={t} className="rounded-full border border-border/60 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">{t}</li>
          ))}
        </ul>
      </header>
      <label
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; if (f) onUpload(f); }}
        className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-10 text-center transition-colors ${
          over ? "border-primary bg-primary/5" : "border-border/70 hover:border-primary/50"
        } ${busy ? "pointer-events-none" : ""}`}
      >
        {busy ? (
          <>
            <ThinkingOrb state="working" size={64} theme="light" aria-hidden />
            <span className="text-sm font-semibold" aria-live="polite">{busy}</span>
          </>
        ) : (
          <>
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-elegant">
              <Upload className="h-6 w-6" />
            </span>
            <span className="text-base font-semibold">Upload a video of you talking</span>
            <span className="text-xs text-muted-foreground">MP4 or MOV, up to 500 MB and about 12 minutes. It stays on this device.</span>
          </>
        )}
        <input type="file" accept="video/*" className="sr-only" disabled={!!busy}
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onUpload(f); }} />
      </label>
      {projects.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Recent</h2>
          <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {projects.map((p) => (
              <li key={p.id} className="group relative">
                <button type="button" onClick={() => onOpen(p.id)} className="block w-full text-left">
                  <span className="block aspect-[9/16] overflow-hidden rounded-xl bg-black">
                    {p.thumb && <img src={p.thumb} alt="" className="h-full w-full object-cover" />}
                  </span>
                  <span className="mt-1 block truncate text-xs font-semibold">{p.name}</span>
                  <span className="block text-[11px] text-muted-foreground">{fmtTime(p.duration)}</span>
                </button>
                <button type="button" aria-label={`Delete ${p.name}`} onClick={() => window.confirm(`Delete ${p.name}?`) && onRemove(p.id)}
                  className="absolute right-1.5 top-1.5 rounded-md bg-background/85 p-1.5 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100 focus:opacity-100">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function Editor({ userId, project, onSave, onClips, onOpen, onBack }: {
  userId: string;
  project: VideoProject;
  onSave: (p: VideoProject) => void;
  onClips: (ps: VideoProject[]) => void;
  onOpen: (id: string) => void;
  onBack: () => void;
}) {
  const { toast } = useToast();
  const [file, setFile] = useState<Blob | null | undefined>(undefined);
  const [settings, setSettings] = useState<EditSettings>(() => ({
    ...project.settings,
    overlays: sanitizeOverlays(project.settings.overlays),
    removed: sanitizeRemoved(project.settings.removed),
    voiceover: sanitizeVoiceover(project.settings.voiceover),
    level: sanitizeLevel(project.settings.level),
    broll: sanitizeBroll(project.settings.broll),
    music: sanitizeMusic(project.settings.music),
  }));
  // Words tab: fix spelling, or cut a stretch by tapping its first and last word
  const [wordMode, setWordMode] = useState<"fix" | "cut">("fix");
  // words the captions always get wrong, fixed in every video; offer = a hand fix not saved yet
  const [fixes, setFixes] = useState<CaptionFix[]>(() => loadFixes(userId));
  const [offer, setOffer] = useState<CaptionFix | null>(null);
  const [heard, setHeard] = useState("");
  const [should, setShould] = useState("");
  const [cutStart, setCutStart] = useState<number | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [words, setWords] = useState(project.words);
  const [subs, setSubs] = useState<Record<string, Record<string, string>>>(project.subs ?? {});
  const [caption, setCaption] = useState(project.caption ?? "");
  const [writingCaption, setWritingCaption] = useState(false);
  const [savedDraft, setSavedDraft] = useState(false);
  const [translating, setTranslating] = useState<string | null>(null);
  const [history, setHistory] = useState<EditSettings[]>([]);
  const [tab, setTab] = useState<Tab>("style");
  const [playing, setPlaying] = useState(false);
  const [outT, setOutT] = useState(0);
  const [ask, setAsk] = useState("");
  const [log, setLog] = useState<{ me: string; it: string }[]>([]);
  const [thinking, setThinking] = useState(false);
  const [captioning, setCaptioning] = useState(false);
  const [job, setJob] = useState<ExportJob | null>(exportJob());
  // a guide over the 9:16 preview: where Instagram or TikTok's own buttons and caption sit
  const [coverApp, setCoverApp] = useState<CoverApp | null>(null);
  // B-roll: each cutaway's clip from this device, a muted <video> per cutaway kept in step with the preview
  const [brollUrls, setBrollUrls] = useState<Record<string, string>>({});
  const brollEls = useRef(new Map<string, HTMLVideoElement>());
  const [brollSearch, setBrollSearch] = useState(false);
  const [selBroll, setSelBroll] = useState<string | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const segIdx = useRef(0);
  const drag = useRef<{ startX: number; startY: number; moved: boolean; overlay?: string } | null>(null);
  // the brand kit (logo, end card, name tag); endAt is the time into the end card while it shows
  const brandKit = useMemo(() => loadBrand(userId), [userId]);
  const [art, setArt] = useState<BrandArt | null>(null);
  // editing skills: this adviser's saved ways of editing (videoSkills.ts)
  const [skills, setSkills] = useState<VideoSkill[]>(() => loadSkills(userId));
  const [skillForm, setSkillForm] = useState<{ name: string; prompt: string; isDefault: boolean } | null>(null);
  const [managing, setManaging] = useState(false);
  const pendingSkill = useRef(project.pendingSkill);
  const endAt = useRef<number | null>(null);
  // voiceover: the take on this device, an <audio> kept in step with the preview, and a recording in progress
  const [voiceBlob, setVoiceBlob] = useState<Blob | null | undefined>(undefined);
  const voiceUrl = useMemo(() => (voiceBlob ? URL.createObjectURL(voiceBlob) : ""), [voiceBlob]);
  useEffect(() => () => { if (voiceUrl) URL.revokeObjectURL(voiceUrl); }, [voiceUrl]);
  const voiceEl = useRef<HTMLAudioElement>(null);
  const [recording, setRecording] = useState<{ rec: MediaRecorder; stream: MediaStream; start: number; t0: number } | null>(null);
  const [recSeconds, setRecSeconds] = useState(0);
  // the preview's sound goes through the voice polish and the loudness lift once either has been switched on
  const audio = useRef<{ ctx: AudioContext; src: MediaElementAudioSourceNode; unwire: () => void } | null>(null);
  const polish = !!settings.voicePolish;
  const level = settings.loudness && levelFits(settings.level, polish) ? settings.level : null;
  useEffect(() => {
    const v = video.current;
    if (!v || (!audio.current && !polish && !level)) return;
    if (!audio.current) {
      const ctx = new AudioContext();
      const src = ctx.createMediaElementSource(v);
      audio.current = { ctx, src, unwire: wireVoice(ctx, src, ctx.destination, polish, level) };
    } else {
      audio.current.unwire();
      audio.current.unwire = wireVoice(audio.current.ctx, audio.current.src, audio.current.ctx.destination, polish, level);
    }
    void audio.current.ctx.resume().catch(() => {});
  }, [polish, level, file]);
  // even out loudness: measured from this video's sound whenever it is on and the last measurement no longer fits
  const [measuring, setMeasuring] = useState<"" | "busy" | "none">("");
  useEffect(() => {
    if (!settings.loudness || !file || levelFits(settings.level, polish)) return;
    let live = true;
    setMeasuring("busy");
    measureLevel(file, polish)
      .then((l) => {
        if (!live) return;
        setMeasuring(l ? "" : "none");
        if (l) setSettings((s) => (s.loudness && !!s.voicePolish === l.polish ? { ...s, level: l } : s));
      })
      .catch(() => live && setMeasuring("none"));
    return () => { live = false; };
  }, [settings.loudness, settings.level, polish, file]);
  useEffect(() => () => void audio.current?.ctx.close(), []);
  useEffect(() => {
    void loadBrandArt(brandKit).then(setArt);
  }, [brandKit]);

  useEffect(() => { const off = onExportJob(setJob); return () => { off(); }; }, []);
  useEffect(() => {
    void ensureCaptionFonts().then(() => paintRef.current?.());
  }, []);
  // load the file once per file: every save hands back a new project object, and
  // reloading on that sent the preview back to 0:00 after each edit
  const fk = fileKey(project);
  useEffect(() => {
    getFile(fk).then((f) => setFile(f ?? null)).catch(() => setFile(null));
  }, [fk]);
  const url = useMemo(() => (file ? URL.createObjectURL(file) : ""), [file]);
  const voiceKey = settings.voiceover?.key;
  useEffect(() => {
    if (!voiceKey) return setVoiceBlob(undefined);
    getFile(voiceKey).then((b) => setVoiceBlob(b ?? null)).catch(() => setVoiceBlob(null));
  }, [voiceKey]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  const brollKeys = (settings.broll ?? []).map((b) => b.key).join(",");
  useEffect(() => {
    const want = brollKeys.split(",").filter((k) => k && !(k in brollUrls));
    if (!want.length) return;
    void Promise.all(want.map(async (k) => [k, await getFile(k).catch(() => undefined)] as const)).then((got) =>
      setBrollUrls((u) => ({ ...u, ...Object.fromEntries(got.map(([k, b]) => [k, b ? URL.createObjectURL(b) : ""])) })));
  }, [brollKeys]); // eslint-disable-line react-hooks/exhaustive-deps
  const brollUrlsRef = useRef(brollUrls);
  brollUrlsRef.current = brollUrls;
  useEffect(() => () => Object.values(brollUrlsRef.current).forEach((u) => u && URL.revokeObjectURL(u)), []);
  // background music: the track on this device, decoded once, played through its own audio context (made on the first Play)
  const musicKey = settings.music?.key;
  const [musicBlob, setMusicBlob] = useState<Blob | null | undefined>(undefined);
  const [musicBusy, setMusicBusy] = useState(false);
  const musicInput = useRef<HTMLInputElement>(null);
  const musicBuf = useRef<AudioBuffer | null>(null);
  const musicOut = useRef<{ ctx: AudioContext; gain: GainNode; buf?: AudioBuffer; track?: ReturnType<typeof bufferTrack> } | null>(null);
  useEffect(() => {
    if (!musicKey) return setMusicBlob(undefined);
    getFile(musicKey).then((b) => setMusicBlob(b ?? null)).catch(() => setMusicBlob(null));
  }, [musicKey]);
  useEffect(() => {
    musicBuf.current = null;
    if (!musicBlob) return;
    let live = true;
    void decodeSound(musicBlob).then((b) => { if (live) musicBuf.current = b; });
    return () => { live = false; };
  }, [musicBlob]);
  useEffect(() => () => void musicOut.current?.ctx.close(), []);

  // save the edit a moment after the last change
  useEffect(() => {
    const t = window.setTimeout(() => onSave({ ...project, pendingSkill: pendingSkill.current, settings, words, subs, caption }), 400);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings, words, subs, caption]);

  const duration = project.duration;
  const plan = useMemo(() => planFor(words, duration, settings), [words, duration, settings]);
  const speed = speedOf(settings);
  const duck = useMemo(() => duckSpans(words, plan.segs, settings), [words, plan, settings]);
  useEffect(() => {
    const v = video.current;
    if (v) v.defaultPlaybackRate = v.playbackRate = speed; // pitch is kept; the default survives a reload
  }, [speed, file]);
  const volume = settings.volume ?? 1;
  useEffect(() => {
    if (video.current) video.current.volume = volume;
  }, [volume, file]);
  const exportLabel = settings.exportAs === "audio" ? "Export sound" : "Export MP4";
  const [W, H] = useMemo(() => {
    const v = video.current;
    const [w, h] = aspectSize(settings.aspect, v?.videoWidth || 1080, v?.videoHeight || 1920);
    return [Math.round(w / 2), Math.round(h / 2)];
  }, [settings.aspect, file]);

  const paintRef = useRef<(() => void) | null>(null);
  const paint = useCallback(() => {
    const v = video.current;
    const c = canvas.current;
    if (!v || !c) return;
    if (endAt.current !== null && art) {
      drawEndCard(c.getContext("2d")!, art, endAt.current);
      setOutT(plan.total + endAt.current);
      return;
    }
    const out = outAt(plan.segs, v.currentTime, speed) ?? outT;
    const broll = syncBroll(brollEls.current, settings.broll, out, playing);
    drawFrame(c.getContext("2d")!, { video: v, settings, ...plan, src: v.currentTime, out, subs: settings.subLang ? subs[settings.subLang] : undefined, brand: art, still: !playing, broll });
    setOutT(out);
  }, [plan, settings, outT, subs, art, playing, speed]);
  const total = fullLength(plan.total, settings, !!art);
  // what Export will make for the platform picked: its frame, and about how big the file comes out
  const size = useMemo(
    () => exportSize(settings, settings.exportAs === "audio" ? plan.total : total, video.current?.videoWidth || 1080, video.current?.videoHeight || 1920),
    [settings, plan.total, total, file], // eslint-disable-line react-hooks/exhaustive-deps
  );
  paintRef.current = paint;

  // playback that skips the cuts
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let endStart = 0;
    const finish = () => {
      const v = video.current;
      v?.pause();
      // then the end card, if it is on, for its length in real time
      if (total > plan.total) {
        endStart = performance.now() - (endAt.current ?? 0) * 1000;
        endAt.current = endAt.current ?? 0;
        raf = requestAnimationFrame(endLoop);
      } else setPlaying(false);
    };
    const endLoop = () => {
      const t = (performance.now() - endStart) / 1000;
      if (t >= total - plan.total) { setPlaying(false); return; }
      endAt.current = t;
      paint();
      syncMusic(plan.total + t);
      raf = requestAnimationFrame(endLoop);
    };
    const loop = () => {
      const v = video.current;
      if (!v) return;
      if (endAt.current !== null) return finish();
      const seg = plan.segs[segIdx.current];
      if (!seg) return finish();
      if (v.currentTime >= seg.end - 0.03 || v.currentTime < seg.start - 0.2) {
        segIdx.current++;
        const next = plan.segs[segIdx.current];
        if (!next) return finish();
        v.currentTime = next.start;
      }
      paint();
      const out = outAt(plan.segs, v.currentTime, speed);
      syncVoice(out);
      syncMusic(out);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, plan, paint, total]);
  // (this effect re-runs every frame as the playhead moves, so the voiceover pauses only when playback stops)
  useEffect(() => {
    if (!playing) {
      voiceEl.current?.pause();
      brollEls.current.forEach((el) => el.pause());
      musicOut.current?.track?.stop();
    }
  }, [playing]);

  useEffect(() => { if (!playing) paint(); }, [settings, plan]); // eslint-disable-line react-hooks/exhaustive-deps

  const syncVoice = (out: number | null) => {
    const el = voiceEl.current;
    if (!el || !voiceUrl || recording) return;
    const rel = out === null ? null : voiceAt(settings.voiceover, out);
    if (rel === null || rel >= (el.duration || Infinity)) {
      if (!el.paused) el.pause();
      return;
    }
    el.volume = Math.min(1, settings.voiceover?.gain ?? 1);
    if (Math.abs(el.currentTime - rel) > 0.15) el.currentTime = rel;
    if (el.paused) void el.play().catch(() => {});
  };

  // the music follows the edit's clock, so a cut never restarts it; it drops while someone talks
  const syncMusic = (out: number | null) => {
    const o = musicOut.current;
    if (!o) return;
    const buf = settings.music && !recording ? musicBuf.current : null;
    if ((o.buf ?? null) !== buf) {
      o.track?.stop();
      o.buf = buf ?? undefined;
      o.track = buf ? bufferTrack(o.ctx, buf, o.gain, true, 0.5) : undefined;
    }
    if (!o.track || out === null) return;
    o.track.sync(out);
    o.gain.gain.setTargetAtTime(musicGainAt(duck, out, settings.music!.level, total), o.ctx.currentTime, 0.03);
  };

  const addMusic = async (f: File) => {
    if (f.size > 20 * 1024 * 1024) return toast({ title: "That track is over 20 MB", variant: "destructive" });
    setMusicBusy(true);
    try {
      if (!(await decodeSound(f))) return toast({ title: "Couldn't read that sound file", description: "Try an MP3, M4A or WAV.", variant: "destructive" });
      const key = `mu-${project.id}-${Date.now().toString(36)}`;
      await putFile(key, f);
      // the previous track's file stays, so Undo can bring it back (ponytail: tracks accumulate per video, like voiceover takes)
      change({ ...settings, music: { key, name: f.name.replace(/\.[^.]+$/, "").slice(0, 80) || "Music", level: settings.music?.level ?? MUSIC_LEVEL } });
    } catch (e) {
      toast({ title: "Couldn't keep the track", description: (e as Error).message, variant: "destructive" });
    } finally {
      setMusicBusy(false);
    }
  };

  const startVoice = async () => {
    const v = video.current;
    if (!v || playing) return;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      return toast({ title: "No microphone", description: "Allow the microphone for this site in the browser, then try again.", variant: "destructive" });
    }
    const mime = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const start = Math.min(outT, Math.max(0, plan.total - 0.5));
    const t0 = performance.now();
    rec.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      v.muted = false;
      const length = Math.min((performance.now() - t0) / 1000, plan.total - start);
      if (length < 0.5) return;
      const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
      const key = `vo-${project.id}-${Date.now().toString(36)}`;
      try {
        await putFile(key, blob);
        // the previous take's file stays, so Undo can bring it back (ponytail: takes accumulate per video; prune on project delete if storage ever matters)
        change({ ...settings, voiceover: { key, start, length, ...(settings.voiceover?.gain !== undefined ? { gain: settings.voiceover.gain } : {}) } });
        toast({ title: "Voiceover added", description: "Turn the original sound down under it if you need to." });
      } catch (e) {
        toast({ title: "Couldn't keep the recording", description: (e as Error).message, variant: "destructive" });
      }
    };
    // the edit plays muted from the playhead while you talk over it
    v.muted = true;
    seekOut(start);
    rec.start(500);
    setRecording({ rec, stream, start, t0 });
    setRecSeconds(0);
    await v.play().catch(() => {});
    setPlaying(true);
  };
  const stopVoice = () => {
    const r = recording;
    if (!r) return;
    setRecording(null);
    if (r.rec.state !== "inactive") r.rec.stop();
    video.current?.pause();
    setPlaying(false);
  };
  useEffect(() => {
    if (!recording) return;
    const t = window.setInterval(() => setRecSeconds((performance.now() - recording.t0) / 1000), 250);
    return () => window.clearInterval(t);
  }, [recording]);
  // the edit reached its end while recording: stop there
  useEffect(() => {
    if (recording && !playing) stopVoice();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);
  const removeVoice = () => {
    if (!settings.voiceover) return;
    change({ ...settings, voiceover: undefined }); // the file stays until Undo is out of reach; it is small
  };

  const seekOut = (t: number) => {
    const v = video.current;
    if (!v) return;
    if (t > plan.total && total > plan.total) {
      endAt.current = Math.min(t - plan.total, total - plan.total);
      paint();
      return;
    }
    endAt.current = null;
    const src = srcAt(plan.segs, t, speed);
    segIdx.current = Math.max(0, plan.segs.findIndex((g) => src >= g.start && src < g.end));
    v.currentTime = src;
  };

  const toggle = async () => {
    const v = video.current;
    if (!v) return;
    if (recording) return stopVoice();
    if (playing) { v.pause(); voiceEl.current?.pause(); setPlaying(false); return; }
    void audio.current?.ctx.resume().catch(() => {});
    if (settings.music && !musicOut.current) {
      const ctx = new AudioContext();
      const gain = new GainNode(ctx, { gain: 0 });
      gain.connect(ctx.destination);
      musicOut.current = { ctx, gain };
    }
    void musicOut.current?.ctx.resume().catch(() => {});
    if (outT >= total - 0.1) seekOut(0);
    else seekOut(outT);
    await v.play().catch(() => {});
    setPlaying(true);
  };

  const change = (next: EditSettings) => {
    setHistory((h) => [...h.slice(-19), settings]);
    setSettings(next);
  };
  const patch = (p: Partial<EditSettings>) => change({ ...settings, ...p });
  const undo = () => {
    const prev = history[history.length - 1];
    if (!prev) return;
    setHistory((h) => h.slice(0, -1));
    setSettings(prev);
  };

  // Only what survives the trims and cuts: a clip's caption is about the clip, not the whole video.
  const transcript = useMemo(
    () => words.filter((w) => plan.segs.some((g) => w.s >= g.start - 0.05 && w.e <= g.end + 0.05)).map((w) => w.w).join(" "),
    [words, plan],
  );

  const runVibe = async (frames?: string[], preset?: string, label?: string) => {
    const instruction = preset ?? ask.trim();
    if (!instruction && !frames) return;
    setThinking(true);
    try {
      const res = await vibeEdit({ instruction, settings, transcript, duration, frames });
      const { next, changed } = applyPatch(settings, res.patch);
      if (changed.length) change(next);
      setLog((l) => [...l, { me: label ?? (preset ? "Suggest a hook" : instruction || "Match my reference video"), it: changed.length ? res.reply : `${res.reply} (nothing changed)` }]);
      if (!preset) setAsk("");
    } catch (e) {
      toast({ title: "That change didn't go through", description: (e as Error).message, variant: "destructive" });
    } finally {
      setThinking(false);
    }
  };

  // skills: apply a saved look at once, then run its instructions on this video's words
  const applySkill = (sk: VideoSkill) => {
    change(withLook(settings, sk.look));
    if (sk.prompt && words.length) void runVibe(undefined, sk.prompt, `Skill: ${sk.name}`);
    else toast({ title: `${sk.name} applied` });
  };
  const openSkillForm = () => {
    const asks = log.map((m) => m.me).filter((m) => !/^Skill: |^Suggest a hook$|^Match my reference video$/.test(m));
    setSkillForm({ name: suggestName(asks, skills), prompt: "", isDefault: skills.length === 0 });
  };
  const keepSkill = () => {
    if (!skillForm?.name.trim()) return;
    const id = newSkillId();
    setSkills(saveSkill(userId, { id, name: skillForm.name, look: lookOf(settings), prompt: skillForm.prompt, isDefault: skillForm.isDefault }));
    setSkillForm(null);
    toast({ title: `Saved ${skillForm.name.trim()}`, description: skillForm.isDefault ? "New videos start with it." : "Tap it on any video to use it." });
  };
  const dropSkill = (sk: VideoSkill) => {
    setSkills(removeSkill(userId, sk.id));
    toast({
      title: `${sk.name} deleted`,
      action: (
        <ToastAction altText="Undo" onClick={() => setSkills(saveSkill(userId, sk))}>
          Undo
        </ToastAction>
      ),
    });
  };
  // the default skill's instructions run once, as soon as a new video has its captions
  useEffect(() => {
    if (!pendingSkill.current || !words.length || thinking) return;
    const sk = skills.find((x) => x.id === pendingSkill.current);
    pendingSkill.current = undefined;
    if (sk?.prompt) void runVibe(undefined, sk.prompt, `Skill: ${sk.name}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [words.length]);

  const matchReference = async (f: File) => {
    try {
      setThinking(true);
      await runVibe(await stills(f));
    } catch (e) {
      setThinking(false);
      toast({ title: "Couldn't read that reference", description: (e as Error).message, variant: "destructive" });
    }
  };

  const recaption = async () => {
    if (!file) return;
    setCaptioning(true);
    try {
      const { wav } = await extractWav(file);
      const t = await transcribe(wav);
      const fixed = applyFixes(t.words, fixes);
      setWords(fixed.words);
      if (fixed.count) toast({ title: `Fixed ${fixed.count} ${fixed.count === 1 ? "word" : "words"} from your list` });
    } catch (e) {
      toast({ title: "Captions didn't come through", description: (e as Error).message, variant: "destructive" });
    } finally {
      setCaptioning(false);
    }
  };

  const [clips, setClips] = useState<VideoProject[]>([]);
  const [clipping, setClipping] = useState(false);
  const makeClips = async () => {
    setClipping(true);
    try {
      const found = await findClips(sentencesOf(words), duration);
      const now = Date.now().toString(36);
      const made = found.map((c, i): VideoProject => ({
        ...project,
        id: `v${now}${i}`,
        name: `${project.name} - ${c.title}`,
        fileId: fileKey(project),
        createdAt: new Date().toISOString(),
        settings: clipSettings(settings, c, duration),
      }));
      onClips(made);
      setClips(made);
    } catch (e) {
      toast({ title: "Couldn't find clips", description: (e as Error).message, variant: "destructive" });
    } finally {
      setClipping(false);
    }
  };

  const saveCover = async () => {
    const v = video.current;
    if (!v) return;
    try {
      const blob = await makeCover(v, settings, settings.hook || project.name);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${project.name.replace(/[^\w-]+/g, "-").slice(0, 60) || "video"}-cover.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
      toast({ title: "Cover saved", description: "Made from the frame on screen. Scrub to another moment for a different one." });
    } catch (e) {
      toast({ title: "Couldn't make the cover", description: (e as Error).message, variant: "destructive" });
    }
  };

  const pickSubLang = async (lang: EditSettings["subLang"]) => {
    if (!lang) return patch({ subLang: "" });
    const keys = [...new Set(plan.caps.map(captionKey))];
    const have = subs[lang] ?? {};
    if (keys.length && keys.filter((k) => have[k]).length / keys.length >= 0.8) return patch({ subLang: lang });
    setTranslating(lang);
    try {
      const lines = await translateCaptions(lang, keys);
      setSubs((prev) => ({ ...prev, [lang]: { ...(prev[lang] ?? {}), ...Object.fromEntries(keys.map((k, i) => [k, lines[i]])) } }));
      patch({ subLang: lang });
    } catch (e) {
      toast({ title: "Couldn't translate the captions", description: (e as Error).message, variant: "destructive" });
    } finally {
      setTranslating(null);
    }
  };

  // The post caption for this video, written from what is said in it (the clip's words only).
  const writeCaption = async () => {
    if (!transcript.trim()) return toast({ title: "Caption the video first", variant: "destructive" });
    setWritingCaption(true);
    setSavedDraft(false);
    let text = "";
    await streamOnePost(
      {
        pillar: "topic",
        pillarDetail: project.name,
        ideaSource: "A reel I already filmed",
        ideaContext: `Write ONLY the post caption for this reel, not a script. What I say in it: ${transcript.slice(0, 1800)}\nShape: a strong first line, 2 to 4 short lines, a soft call to action or question, then 5 to 8 relevant hashtags. Use only facts that are in what I say.`,
        format: "short-video",
        platform: "instagram",
        ctaType: "save-share",
        audience: "general",
        voiceSummary: loadVoiceProfile(userId)?.voiceSummary || undefined,
      },
      {
        onToken: (t) => { text = t; },
        onComplete: (t) => { text = t; },
        onError: (m) => toast({ title: "The caption didn't come through", description: m, variant: "destructive" }),
      },
    );
    if (text) setCaption(stripDashes(splitScriptCaption(text).caption));
    setWritingCaption(false);
  };
  const captionFlags = useMemo(() => scanCompliance(caption), [caption]);
  // what gets pasted: the caption plus the brand kit sign-off
  const postText = useMemo(() => {
    const out = withSignOff(caption, brandKit?.signOff);
    return brandKit?.tagLinks ? tagLinks(out, { source: "instagram", campaign: project.name }) : out;
  }, [caption, brandKit, project.name]);
  const copyCaption = () =>
    navigator.clipboard.writeText(postText).then(() => toast({ title: brandKit?.signOff?.trim() ? "Caption copied with your sign-off" : "Caption copied" }));
  const kitWarnings = useMemo(() => (caption ? checkLimits(postText, "instagram").warnings : []), [caption, postText]);
  const saveToPosts = () => {
    upsertDraft(userId, {
      id: `video-${project.id}`,
      createdAt: new Date().toISOString(),
      hook: caption.trim().split("\n")[0].slice(0, 160),
      draft: caption,
      pillar: "topic",
      pillarDetail: project.name,
      audience: "general",
      format: "short-video",
      platform: "instagram",
      ctaType: "save-share",
      status: "draft",
    });
    setSavedDraft(true);
    toast({ title: "Saved to My posts", description: "Schedule it from Pipeline when the video is exported." });
  };

  const doExport = async () => {
    if (!file) return;
    const brollFiles: Record<string, Blob> = {};
    for (const b of settings.broll ?? []) {
      const f = await getFile(b.key).catch(() => undefined);
      if (f) brollFiles[b.key] = f;
    }
    void startExport(project.name, file, words, settings, settings.subLang ? subs[settings.subLang] : undefined, art, settings.voiceover ? voiceBlob : null, brollFiles, settings.music ? musicBlob : null).catch((e) => toast({ title: (e as Error).message, variant: "destructive" }));
  };

  // the exported file read back for what would spoil the post; one check per export, null while it runs
  const [fileCheck, setFileCheck] = useState<{ id: string; issues: ExportIssue[] | null; read: boolean } | null>(null);
  useEffect(() => {
    if (job?.state !== "done" || !job.url || job.name !== project.name || fileCheck?.id === job.id) return;
    const id = job.id;
    const want = { seconds: job.seconds ?? total, kind: job.kind ?? "video", captions: settings.captions, hasWords: words.length > 0, sound: (settings.volume ?? 1) > 0 || !!settings.voiceover || !!settings.music,
      size: job.bytes && job.cap ? { bytes: job.bytes, cap: job.cap, label: job.label ?? "" } : undefined };
    setFileCheck({ id, issues: null, read: false });
    void measureExport(job.url).then((m) => setFileCheck({ id, issues: exportIssues(m ?? { seconds: null, level: null, gap: null }, want), read: !!m }));
  }, [job]); // eslint-disable-line react-hooks/exhaustive-deps

  // find a word or phrase in what was said, and jump the video to it
  const [find, setFind] = useState("");
  const [hit, setHit] = useState(0);
  const hits = useMemo(() => findPhrase(words, find), [words, find]);
  const hitSet = useMemo(() => {
    const n = find.trim().split(/\s+/).filter(Boolean).length;
    return new Set(hits.flatMap((i) => Array.from({ length: n }, (_, j) => i + j)));
  }, [hits, find]);
  const jumpTo = (k: number) => {
    if (!hits.length) return;
    const i = ((k % hits.length) + hits.length) % hits.length;
    setHit(i);
    const w = words[hits[i]];
    const t = outAt(plan.segs, w.s, speed);
    const v = video.current;
    if (t !== null) seekOut(t);
    else if (v) v.currentTime = w.s; // a cut word: show the moment anyway
    document.getElementById(`word-${hits[i]}`)?.scrollIntoView({ block: "nearest" });
  };

  const tapWord = (i: number) => {
    const inCut = removedAt(settings.removed, words[i]);
    if (inCut) {
      // a cut word: put its whole stretch back
      change({ ...settings, removed: (settings.removed ?? []).filter((r) => r !== inCut) });
      setCutStart(null);
      return;
    }
    if (cutStart === null) return setCutStart(i);
    change({ ...settings, removed: addRemoved(settings.removed, wordRange(words, cutStart, i)) });
    setCutStart(null);
  };
  const remember = (fix: CaptionFix) => {
    setFixes(saveFixes(userId, [...fixes.filter((f) => f.from.toLowerCase() !== fix.from.toLowerCase()), fix]));
    setOffer(null);
    const r = applyFixes(words, [fix]);
    if (r.count) setWords(r.words);
    toast({ title: `New videos fix "${fix.from}" to "${fix.to}"`, description: r.count ? `${r.count} more fixed in this one.` : undefined });
  };
  const cutWordCount = useMemo(() => words.filter((w) => removedAt(settings.removed, w)).length, [words, settings.removed]);

  const downloadSrt = () => {
    const blob = new Blob([toSrt(words, plan.segs, settings.removeFillers, speed)], { type: "application/x-subrip" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${project.name.replace(/[^\w-]+/g, "-").slice(0, 60) || "video"}.srt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  };

  // every filler and long pause being cut, for review; kept ones stay in the list
  const cuts = useMemo(() => listCuts(words, duration, settings), [words, duration, settings]);
  const keptCuts = new Set(settings.keepCuts ?? []);
  const toggleCut = (id: string) =>
    change({ ...settings, keepCuts: keptCuts.has(id) ? [...keptCuts].filter((k) => k !== id) : [...keptCuts, id] });
  const listen = (from: number, to: number) => {
    // the original moment, a second either side, so you hear exactly what goes
    const v = video.current;
    if (!v || playing) return;
    v.currentTime = Math.max(0, from - 1);
    void v.play().catch(() => {});
    window.setTimeout(() => v.pause(), (to - from + 2) * 1000);
  };

  // stickers
  const overlays = settings.overlays ?? [];
  const sel = overlays.find((o) => o.id === selected) ?? null;
  const addOverlay = (kind: OverlayKind) => {
    if (overlays.length >= MAX_OVERLAYS) return toast({ title: `Up to ${MAX_OVERLAYS} stickers on a video`, variant: "destructive" });
    const o = newOverlay(kind, Math.min(outT, Math.max(0, plan.total - 0.5)), settings.activeColor);
    change({ ...settings, overlays: [...overlays, o] });
    setSelected(o.id);
  };
  const editOverlay = (id: string, p: Partial<Overlay>) => patch({ overlays: overlays.map((o) => (o.id === id ? { ...o, ...p } : o)) });
  // B-roll: a stock clip over the edit from the playhead, the speaker's sound carrying on under it
  const brolls = settings.broll ?? [];
  const selB = brolls.find((b) => b.id === selBroll) ?? null;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const addBroll = async (it: StockItem) => {
    if (brolls.length >= MAX_BROLL) throw new Error(`Up to ${MAX_BROLL} on a video`);
    const blob = await downloadStock(it.src);
    const probe = await loadVideo(blob).catch(() => null);
    const length = probe && Number.isFinite(probe.duration) ? probe.duration : it.duration ?? 4;
    if (probe) URL.revokeObjectURL(probe.src);
    const key = `br-${it.id}-${Date.now().toString(36)}`;
    await putFile(key, blob);
    const b = newBroll(key, outT, length, plan.total, { thumb: it.thumb, by: it.by, byUrl: it.byUrl, url: it.url });
    // the latest settings: other changes made while the clip downloaded must stay
    const cur = settingsRef.current;
    setHistory((h) => [...h.slice(-19), cur]);
    setSettings({ ...cur, broll: [...(cur.broll ?? []), b] });
    setBrollUrls((u) => ({ ...u, [key]: URL.createObjectURL(blob) }));
    setSelBroll(b.id);
    setBrollSearch(false);
    toast({ title: `B-roll added at ${fmtTime(b.from)}` });
  };
  const editBroll = (id: string, p: Partial<Broll>) => patch({ broll: brolls.map((b) => (b.id === id ? { ...b, ...p } : b)) });

  const stickerColours = [...new Set(["#FFFFFF", "#FFD92B", settings.activeColor, art?.color ?? "#2563EB", "#EF4444", "#111827"].map((c) => c.toUpperCase()))];

  const cutSeconds = Math.max(0, duration - totalLength(plan.segs));
  // platforms this length is too long for, shortest limit first
  const lengthIssues = useMemo(() => platformFit(plan.total).filter((p) => p.fit !== "ok").sort((a, b) => a.limit - b.limit), [plan.total]);
  const fillers = words.filter((w) => isFiller(w.w)).length;
  const zone = coverApp && settings.aspect === "9:16" ? APP_COVER[coverApp] : null;
  const covered = coverApp ? appCover(settings, coverApp) : null;

  if (file === null) {
    return (
      <div className="space-y-3">
        <Button variant="ghost" size="sm" onClick={onBack}>Back to videos</Button>
        <p className="rounded-xl border border-border/70 p-4 text-sm">
          The video for {project.name} is on the device you uploaded it from. Your edit is saved; open it there to export.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}>All videos</Button>
        <h1 className="mr-auto truncate font-serif text-xl font-semibold">{project.name}</h1>
        <Button variant="outline" size="sm" onClick={undo} disabled={!history.length} className="gap-1.5"><Undo2 className="h-3.5 w-3.5" /> Undo</Button>
        {duration >= 45 && words.length > 0 && (
          <Button variant="outline" size="sm" onClick={makeClips} disabled={clipping} className={`gap-1.5 ${clipping ? "disabled:opacity-100" : ""}`}>
            {clipping ? <ThinkingOrb state="working" size={20} theme="light" aria-hidden /> : <Scissors className="h-3.5 w-3.5" />}
            {clipping ? "Finding clips..." : "Find clips"}
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={saveCover} disabled={!file} className="gap-1.5"><ImageIcon className="h-3.5 w-3.5" /> Make cover</Button>
        <Button size="sm" onClick={doExport} disabled={!file || job?.state === "running"} className="gap-1.5 bg-gradient-primary text-primary-foreground disabled:opacity-60">
          <Download className="h-3.5 w-3.5" /> {job?.state === "running" ? `Exporting ${Math.round(job.progress * 100)}%` : <>{exportLabel} <span className="font-normal opacity-80">{fmtBytes(size.bytes)}</span></>}
        </Button>
      </div>
      {clips.length > 0 && (
        <section className="rounded-xl border border-success/40 bg-success/5 p-3">
          <p className="mb-2 text-sm font-semibold">{clips.length} clips ready, each with its own hook</p>
          <ul className="space-y-1.5">
            {clips.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-mono text-[11px] text-muted-foreground">
                  {fmtTime(c.settings.trimStart)}-{fmtTime(duration - c.settings.trimEnd)}
                </span>
                <span className="min-w-0 flex-1 truncate">{c.name.replace(`${project.name} - `, "")}</span>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onOpen(c.id)}>Open</Button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {job?.state === "running" && (
        <p className="text-xs text-muted-foreground" aria-live="polite">
          Exporting in real time ({fmtTime(total)}). You can use other pages; keep this browser tab in front until it finishes.
        </p>
      )}
      {job?.state === "done" && job.url && job.name === project.name && (
        <section className="space-y-2 rounded-xl border border-success/40 bg-success/5 p-3" aria-label="Ready to post">
          <p className="text-sm font-semibold">Ready to post</p>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline" className="h-9 gap-1.5"><a href={job.url} download={`${project.name}-${job.kind === "audio" ? "audio" : "edited"}.${job.ext}`}><Download className="h-3.5 w-3.5" /> {job.kind === "audio" ? "Sound" : "Video"}{job.bytes ? `, ${fmtBytes(job.bytes)}` : ""}</a></Button>
            <Button size="sm" variant="outline" className="h-9 gap-1.5" onClick={saveCover}><ImageIcon className="h-3.5 w-3.5" /> Cover</Button>
            {words.length > 0 && <Button size="sm" variant="outline" className="h-9 gap-1.5" onClick={downloadSrt}><Download className="h-3.5 w-3.5" /> Subtitles</Button>}
            {caption ? (
              <Button size="sm" className="h-9" onClick={copyCaption}>Copy caption</Button>
            ) : (
              <Button size="sm" className="h-9 gap-1.5" onClick={writeCaption} disabled={writingCaption || !words.length}>
                {writingCaption ? <ThinkingOrb state="composing" size={20} theme="dark" aria-hidden /> : <Wand2 className="h-3.5 w-3.5" />} {writingCaption ? "Writing..." : "Write the caption"}
              </Button>
            )}
          </div>
          {kitWarnings.map((w) => <p key={w.message} className={`text-xs ${w.level === "over" ? "text-destructive" : ""}`}>{w.message}</p>)}
          {fileCheck?.id === job.id && (
            fileCheck.issues === null ? (
              <p className="text-xs text-muted-foreground" aria-live="polite">Checking the file...</p>
            ) : fileCheck.issues.length === 0 ? (
              <p className="flex items-center gap-1.5 text-xs" role="status">
                {fileCheck.read ? <><Check className="h-3.5 w-3.5 text-success" /> File checked: the right length, and the sound comes through.</> : "Couldn't read the file back to check it."}
              </p>
            ) : (
              <ul className="space-y-1.5" aria-label="Before you post">
                {fileCheck.issues.map((i) => (
                  <li key={i.id} className="flex flex-wrap items-center gap-2 rounded-md border border-warning/50 bg-warning/10 px-2 py-1.5 text-xs">
                    <span className="mr-auto">{i.text}</span>
                    {i.id === "quiet" && !settings.loudness && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { patch({ loudness: true }); setTab("cuts"); }}>Even out loudness</Button>}
                    {i.id === "silent" && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setTab("cuts")}>Open Cuts</Button>}
                    {i.id === "gap" && i.at !== undefined && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => seekOut(i.at!)}>Show me</Button>}
                    {i.id === "size" && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setTab("frame")}>Open Hook and frame</Button>}
                    {i.id === "captions" && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setTab("words")}>Caption it</Button>}
                  </li>
                ))}
              </ul>
            )
          )}
        </section>
      )}
      {job?.state === "failed" && <p className="text-xs text-destructive">Export failed: {job.error}</p>}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,360px)_1fr]">
        <div className="space-y-2">
          <div className="relative mx-auto w-full max-w-[360px]">
            <canvas
              ref={canvas}
              width={W}
              height={H}
              onPointerDown={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                const x = (e.clientX - r.left) / r.width;
                const y = (e.clientY - r.top) / r.height;
                // a press on a sticker or the captions starts a drag; anywhere else is a tap to play or pause
                const hit = playing ? null : overlayHit(settings.overlays, outT, x, y, r.width / r.height);
                if (hit) {
                  drag.current = { startX: x, startY: y, moved: false, overlay: hit.id };
                  setSelected(hit.id);
                  setTab("stickers");
                } else {
                  drag.current = settings.captions && Math.abs(y - captionCenter(settings)) < 0.09 ? { startX: x, startY: y, moved: false } : null;
                }
                if (drag.current) e.currentTarget.setPointerCapture(e.pointerId);
              }}
              onPointerMove={(e) => {
                const d = drag.current;
                if (!d) return;
                const r = e.currentTarget.getBoundingClientRect();
                const x = Math.min(0.97, Math.max(0.03, (e.clientX - r.left) / r.width));
                const y = (e.clientY - r.top) / r.height;
                if (Math.hypot(x - d.startX, y - d.startY) > 0.01) d.moved = true;
                if (!d.moved) return;
                if (d.overlay) {
                  const oy = Math.min(0.97, Math.max(0.03, y));
                  setSettings((s) => ({ ...s, overlays: (s.overlays ?? []).map((o) => (o.id === d.overlay ? { ...o, x, y: oy } : o)) }));
                } else setSettings((s) => ({ ...s, captionY: Math.min(0.92, Math.max(0.08, y)) }));
              }}
              onPointerUp={() => {
                const d = drag.current;
                drag.current = null;
                if (d?.moved) {
                  setHistory((h) => [...h.slice(-19), settings]);
                  return;
                }
                if (d?.overlay) return; // a tap on a sticker selects it
                void toggle();
              }}
              style={{ touchAction: "none" }}
              className="w-full cursor-pointer rounded-xl bg-black shadow-card"
              aria-label="Preview: tap to play or pause, drag the captions or a sticker to move it"
            />
            {zone && (
              <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-xl text-[10px] font-semibold text-white">
                <div className="absolute inset-x-0 top-0 bg-black/55" style={{ height: `${zone.top * 100}%` }} />
                <div className="absolute right-0 bg-black/40" style={{ top: `${zone.top * 100}%`, bottom: `${zone.bottom * 100}%`, width: `${zone.right * 100}%` }} />
                <div className="absolute inset-x-0 bottom-0 bg-black/55 pt-1 text-center" style={{ height: `${zone.bottom * 100}%` }}>{zone.label} covers this</div>
              </div>
            )}
          </div>
          {file === undefined && <p className="text-xs text-muted-foreground">Loading the video...</p>}
          {voiceUrl && <audio ref={voiceEl} src={voiceUrl} preload="auto" className="hidden" />}
          {brolls.map((b) => (
            <video key={b.id} src={brollUrls[b.key] || undefined} muted playsInline preload="auto" aria-hidden className="pointer-events-none absolute h-px w-px opacity-0"
              ref={(el) => { if (el) brollEls.current.set(b.id, el); else brollEls.current.delete(b.id); }}
              onLoadedData={() => !playing && paint()} onSeeked={() => !playing && paint()} />
          ))}
          <video ref={video} src={url} playsInline preload="auto" className="pointer-events-none absolute h-px w-px opacity-0"
            onLoadedData={() => paint()} onSeeked={() => paint()} />
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={toggle} aria-label={playing ? "Pause" : "Play"} className="h-9 w-9 p-0">
              {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </Button>
            <input type="range" min={0} max={total || 1} step={0.05} value={Math.min(outT, total)} aria-label="Position"
              onChange={(e) => seekOut(Number(e.target.value))} className="flex-1 accent-primary" />
            <span className="w-24 text-right font-mono text-[11px] text-muted-foreground">{fmtTime(outT)} / {fmtTime(total)}</span>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {fmtTime(duration)} filmed, {fmtTime(plan.total)} after cuts{cutSeconds > 0.5 ? ` (${cutSeconds.toFixed(1)}s cut)` : ""}{speed > 1 ? ` at ${speed}x` : ""}.
          </p>
          {lengthIssues.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 text-[11px]" role="status">
              {lengthIssues.map((p) => (
                <span key={p.id} className={`rounded-full border px-2 py-0.5 font-medium ${p.fit === "over" ? "border-destructive/40 bg-destructive/10 text-destructive" : "border-warning/50 bg-warning/10"}`}>
                  {p.fit === "over" ? `Too long for ${p.label} (max ${fmtTime(p.limit).replace(/\.0$/, "")})` : `${p.label} past ${fmtTime(p.limit).replace(/\.0$/, "")} reaches fewer new people`}
                </span>
              ))}
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => patch({ trimEnd: trimToLength(plan.segs, duration, lengthIssues[0].limit, settings) })}>
                Trim to {fmtTime(lengthIssues[0].limit).replace(/\.0$/, "")}
              </Button>
            </div>
          )}
          {settings.aspect === "9:16" && (
            <div className="space-y-1.5">
              <Row label="Show the app's buttons">
                <Chip on={!coverApp} onClick={() => setCoverApp(null)}>Off</Chip>
                {(Object.keys(APP_COVER) as CoverApp[]).map((a) => <Chip key={a} on={coverApp === a} onClick={() => setCoverApp(a)}>{APP_COVER[a].label}</Chip>)}
              </Row>
              {zone && covered?.captions && (
                <p className="flex flex-wrap items-center gap-2 text-[11px]" role="status">
                  Captions sit under {zone.label}&apos;s {captionCenter(settings) > 0.5 ? "caption area" : "top bar"}.
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => patch({ captionY: clearOfApp(captionCenter(settings), coverApp!) })}>Move captions clear</Button>
                </p>
              )}
              {zone && !!covered?.stickers && (
                <p className="text-[11px]" role="status">
                  {covered.stickers} {covered.stickers === 1 ? "sticker sits" : "stickers sit"} under {zone.label}&apos;s buttons. Drag {covered.stickers === 1 ? "it" : "them"} clear on the preview.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <section className="space-y-2 rounded-xl border border-primary/25 bg-primary/5 p-3">
            <p className="flex items-center gap-1.5 text-sm font-semibold"><Sparkles className="h-4 w-4 text-primary" /> Vibe edit
              <InfoTip label="About vibe edit">Say the change in plain words; Undo puts it back.</InfoTip></p>
            {skills.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Your editing skills">
                {skills.map((sk) => (
                  <button key={sk.id} type="button" onClick={() => applySkill(sk)} disabled={thinking}
                    aria-pressed={sameLook(settings, sk.look)}
                    title={sk.prompt ? `${sk.name}: ${sk.prompt}` : sk.name}
                    className={`min-h-8 rounded-full border px-3 text-xs font-semibold ${sameLook(settings, sk.look) ? "border-primary bg-primary text-primary-foreground" : "border-primary/40 bg-background text-foreground hover:border-primary"}`}>
                    {sk.name}{sk.isDefault ? " (default)" : ""}
                  </button>
                ))}
                <button type="button" onClick={() => setManaging((m) => !m)} aria-expanded={managing}
                  className="min-h-8 px-2 text-xs font-semibold text-muted-foreground hover:text-foreground">{managing ? "Done" : "Manage"}</button>
              </div>
            )}
            {managing && (
              <ul className="space-y-1 rounded-lg border border-border/60 bg-background p-2">
                {skills.map((sk) => (
                  <li key={sk.id} className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="mr-auto font-semibold">{sk.name}</span>
                    <label className="flex min-h-8 items-center gap-1.5">
                      <input type="radio" name="default-skill" checked={!!sk.isDefault} onChange={() => setSkills(saveSkill(userId, { ...sk, isDefault: true }))} className="accent-primary" />
                      New videos
                    </label>
                    <Button size="sm" variant="ghost" className="h-8 text-xs text-muted-foreground hover:text-destructive" onClick={() => dropSkill(sk)}>Delete</Button>
                  </li>
                ))}
              </ul>
            )}
            {log.slice(-3).map((m, i) => (
              <p key={i} className="text-xs"><span className="text-muted-foreground">{m.me}</span><br />{m.it}</p>
            ))}
            <Textarea rows={2} value={ask} onChange={(e) => setAsk(e.target.value)} placeholder="Bigger yellow captions at the top, cut the pauses tighter, hook: 3 CPF mistakes"
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), runVibe())} />
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" onClick={() => runVibe()} disabled={thinking || !ask.trim()} className={thinking ? "gap-1.5 disabled:opacity-100" : "gap-1.5"}>
                {thinking ? <ThinkingOrb state="working" size={20} theme="dark" aria-hidden /> : <Wand2 className="h-3.5 w-3.5" />} {thinking ? "Editing..." : "Change it"}
              </Button>
              <label className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border/70 bg-background px-3 py-1.5 text-xs font-semibold hover:border-primary/40 ${thinking ? "pointer-events-none opacity-60" : ""}`}>
                <Film className="h-3.5 w-3.5" /> Match a reference video
                <input type="file" accept="video/*" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void matchReference(f); }} />
              </label>
              {!skillForm && (
                <button type="button" onClick={openSkillForm} className="min-h-8 px-1 text-xs font-semibold text-primary hover:underline">Save as a skill</button>
              )}
            </div>
            {skillForm && (
              <form className="space-y-2 rounded-lg border border-border/60 bg-background p-3" onSubmit={(e) => { e.preventDefault(); keepSkill(); }}>
                <label className="block space-y-1 text-xs font-semibold">
                  Skill name
                  <input value={skillForm.name} maxLength={40} autoFocus onChange={(e) => setSkillForm({ ...skillForm, name: e.target.value })}
                    className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm font-normal" />
                </label>
                <label className="block space-y-1 text-xs font-semibold">
                  Also do this on each video (optional)
                  <Textarea rows={2} value={skillForm.prompt} maxLength={500} onChange={(e) => setSkillForm({ ...skillForm, prompt: e.target.value })}
                    placeholder="Hook: the most surprising number I mention. Cut the pauses tight." className="text-sm font-normal" />
                </label>
                <label className="flex min-h-8 items-center gap-2 text-xs">
                  <input type="checkbox" checked={skillForm.isDefault} onChange={(e) => setSkillForm({ ...skillForm, isDefault: e.target.checked })} className="h-4 w-4 accent-primary" />
                  Start new videos with it
                </label>
                <div className="flex gap-2">
                  <Button size="sm" type="submit" disabled={!skillForm.name.trim()}>Save skill</Button>
                  <Button size="sm" type="button" variant="ghost" onClick={() => setSkillForm(null)}>Cancel</Button>
                </div>
              </form>
            )}
          </section>

          <section className="space-y-2 rounded-xl border border-border/60 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold">Post caption</p>
              <Button size="sm" variant="outline" onClick={writeCaption} disabled={writingCaption || !words.length} className={`gap-1.5 ${writingCaption ? "disabled:opacity-100" : ""}`}>
                {writingCaption ? <ThinkingOrb state="composing" size={20} theme="light" aria-hidden /> : <Wand2 className="h-3.5 w-3.5" />}
                {writingCaption ? "Writing..." : caption ? "Write it again" : "Write the caption"}
              </Button>
            </div>
            {caption && (
              <>
                <Textarea rows={6} value={caption} onChange={(e) => { setCaption(e.target.value); setSavedDraft(false); }} aria-label="Post caption" className="text-sm" />
                {captionFlags.length > 0 && (
                  <ul className="space-y-1 text-[11px]">
                    {captionFlags.map((f) => (
                      <li key={f.id} className={`rounded-md border px-2 py-1 ${f.severity === "error" ? "border-destructive/40 bg-destructive/10 text-destructive" : "border-warning/40 bg-warning/10"}`}>
                        <span className="font-semibold">&ldquo;{f.match}&rdquo;</span> {f.message}
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={saveToPosts} disabled={savedDraft}>{savedDraft ? "Saved to My posts" : "Save to My posts"}</Button>
                  <Button size="sm" variant="ghost" onClick={copyCaption}>Copy</Button>
                  {savedDraft && <Link to="/calendar" className="self-center text-xs font-semibold text-primary hover:underline">Schedule it</Link>}
                </div>
              </>
            )}
          </section>

          <nav className="flex w-fit flex-wrap gap-1 rounded-lg border border-border/60 bg-muted/30 p-1" aria-label="Edit">
            {([["style", "Captions"], ["cuts", "Cuts"], ["frame", "Hook and frame"], ["stickers", "Stickers"], ["broll", "B-roll"], ["words", "Words"]] as const).map(([id, label]) => (
              <button key={id} type="button" onClick={() => setTab(id)} aria-pressed={tab === id}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold ${tab === id ? "bg-background shadow-sm" : "text-muted-foreground"}`}>{label}</button>
            ))}
          </nav>

          {tab === "style" && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                {STYLE_IDS.map((id) => (
                  <button key={id} type="button" onClick={() => change(withStyle(settings, id as StyleId))} aria-pressed={settings.style === id}
                    className={`rounded-xl border p-2 text-left text-xs font-semibold ${settings.style === id ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "border-border/70 hover:border-primary/40"}`}>
                    <span className="mb-1 block h-8 rounded-md bg-neutral-900 px-1.5 text-center leading-8"
                      style={{ color: STYLES[id].base, fontFamily: STYLES[id].font.includes("Fraunces") ? "Georgia, serif" : undefined, fontWeight: STYLES[id].weight }}>
                      {STYLES[id].uppercase ? "MOST PEOPLE" : "Most people"}
                    </span>
                    {STYLES[id].label}
                  </button>
                ))}
              </div>
              <Row label="Captions"><Toggle on={settings.captions} set={(v) => patch({ captions: v })} /></Row>
              <Row label="Position">
                {(["top", "middle", "bottom"] as const).map((p) => <Chip key={p} on={settings.captionY === undefined && settings.position === p} onClick={() => patch({ position: p, captionY: undefined })}>{p[0].toUpperCase() + p.slice(1)}</Chip>)}
              </Row>
              <Row label={`Size ${settings.size.toFixed(1)}x`}><input type="range" min={0.6} max={1.6} step={0.1} value={settings.size} onChange={(e) => patch({ size: Number(e.target.value) })} className="w-40 accent-primary" /></Row>
              {STYLES[settings.style].mode === "words" && (
                <Row label={`Words at once: ${settings.wordsPerCaption}`}><input type="range" min={1} max={6} step={1} value={settings.wordsPerCaption} onChange={(e) => patch({ wordsPerCaption: Number(e.target.value) })} className="w-40 accent-primary" /></Row>
              )}
              <Row label="Background">
                <Chip on={captionBoxOf(settings) === "none"} onClick={() => patch({ captionBox: "none" })}>None</Chip>
                <Chip on={captionBoxOf(settings) === "pill"} onClick={() => patch({ captionBox: "pill" })}>Dark box</Chip>
                {STYLES[settings.style].mode === "words" && <Chip on={captionBoxOf(settings) === "word"} onClick={() => patch({ captionBox: "word" })}>Highlight word</Chip>}
              </Row>
              <Row label="Animation">
                {([["pop", "Pop"], ["slide", "Slide up"], ["type", "Typewriter"], ["none", "None"]] as const).map(([id, label]) => (
                  <Chip key={id} on={animOf(settings) === id} onClick={() => patch({ captionAnim: id })}>{label}</Chip>
                ))}
              </Row>
              <Row label="Font">
                {(Object.keys(FONTS) as (keyof typeof FONTS)[]).map((id) => (
                  <Chip key={id} on={(settings.font ?? (STYLES[settings.style].font === FONTS[id].css ? id : "")) === id} onClick={() => patch({ font: id })}>
                    <span style={{ fontFamily: FONTS[id].css.replace(/^\d+ \{px\}px /, "") }}>{FONTS[id].label}</span>
                  </Chip>
                ))}
              </Row>
              <Row label="Colours">
                <input type="color" aria-label="Caption colour" value={settings.baseColor} onChange={(e) => patch({ baseColor: e.target.value.toUpperCase() })} className="h-8 w-10 rounded" />
                {STYLES[settings.style].mode === "words" && <input type="color" aria-label="Spoken word colour" value={settings.activeColor} onChange={(e) => patch({ activeColor: e.target.value.toUpperCase() })} className="h-8 w-10 rounded" />}
              </Row>
              <Row label="Second language">
                {([["", "Off"], ["zh", "\u4e2d\u6587"], ["ms", "Melayu"], ["ta", "\u0ba4\u0bae\u0bbf\u0bb4\u0bcd"]] as const).map(([id, label]) => (
                  <Chip key={id || "off"} on={(settings.subLang ?? "") === id} onClick={() => void pickSubLang(id)}>
                    {translating === id ? "Translating..." : label}
                  </Chip>
                ))}
              </Row>
              <Row label="ALL CAPS"><Toggle on={settings.uppercase} set={(v) => patch({ uppercase: v })} /></Row>
              <Row label="Numbers in the highlight colour"><Toggle on={settings.highlightNumbers} set={(v) => patch({ highlightNumbers: v })} /></Row>
            </div>
          )}

          {tab === "cuts" && (
            <div className="space-y-3">
              <Row label={`Cut um and uh${fillers ? ` (${fillers} found)` : ""}`}><Toggle on={settings.removeFillers} set={(v) => patch({ removeFillers: v })} /></Row>
              <Row label={settings.maxPause ? `Shorten pauses over ${settings.maxPause.toFixed(1)}s` : "Keep every pause"}>
                <input type="range" min={0} max={2} step={0.1} value={settings.maxPause} onChange={(e) => patch({ maxPause: Number(e.target.value) })} className="w-40 accent-primary" />
              </Row>
              <Row label={`Trim start ${settings.trimStart.toFixed(1)}s`}><input type="range" min={0} max={Math.min(30, duration / 2)} step={0.1} value={settings.trimStart} onChange={(e) => patch({ trimStart: Number(e.target.value) })} className="w-40 accent-primary" /></Row>
              <Row label={`Trim end ${settings.trimEnd.toFixed(1)}s`}><input type="range" min={0} max={Math.min(30, duration / 2)} step={0.1} value={settings.trimEnd} onChange={(e) => patch({ trimEnd: Number(e.target.value) })} className="w-40 accent-primary" /></Row>
              <Row label="Punch in on cuts"><Toggle on={settings.punchIn} set={(v) => patch({ punchIn: v })} /></Row>
              <Row label={`Original sound ${Math.round(volume * 100)}%`}>
                <input type="range" min={0} max={1} step={0.05} value={volume} aria-label="Volume of the filmed sound"
                  onChange={(e) => patch({ volume: Number(e.target.value) === 1 ? undefined : Number(e.target.value) })} className="w-40 accent-primary" />
              </Row>
              <Row label="Speed">
                {SPEEDS.map((x) => <Chip key={x} on={speed === x} onClick={() => patch({ speed: x === 1 ? undefined : x })}>{x}x</Chip>)}
              </Row>
              <div className="space-y-2 rounded-lg border border-border/60 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="mr-auto text-sm font-medium">Voiceover
                    <InfoTip label="About voiceover">The edit plays muted from the playhead while you talk over it.</InfoTip></span>
                  {recording ? (
                    <Button size="sm" variant="destructive" className="h-9 gap-1.5" onClick={stopVoice}>
                      <Square className="h-3.5 w-3.5" /> Stop {fmtTime(recSeconds).replace(/\.\d$/, "")}
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" className="h-9 gap-1.5" onClick={startVoice} disabled={!file || playing}>
                      <Mic className="h-3.5 w-3.5" /> {settings.voiceover ? "Record again" : "Record from the mic"}
                    </Button>
                  )}
                </div>
                {settings.voiceover && !recording && (
                  <>
                    <p className="text-xs text-muted-foreground">
                      {fmtTime(settings.voiceover.length)} from {fmtTime(settings.voiceover.start)}
                      {voiceBlob === null ? ". The recording is on the device you made it on." : ""}
                    </p>
                    <Row label={`Voiceover ${Math.round((settings.voiceover.gain ?? 1) * 100)}%`}>
                      <input type="range" min={0} max={1.5} step={0.05} value={settings.voiceover.gain ?? 1} aria-label="Voiceover volume"
                        onChange={(e) => patch({ voiceover: { ...settings.voiceover!, gain: Number(e.target.value) } })} className="w-32 accent-primary" />
                      <Button size="sm" variant="ghost" className="h-8 text-xs text-muted-foreground" onClick={removeVoice}>Remove</Button>
                    </Row>
                  </>
                )}
              </div>
              <div className="space-y-2 rounded-lg border border-border/60 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="mr-auto text-sm font-medium">Background music
                    <InfoTip label="About background music">Your own track, looped. It drops while you talk.</InfoTip></span>
                  <Button size="sm" variant="outline" className="h-11 gap-1.5 sm:h-9" onClick={() => musicInput.current?.click()} disabled={musicBusy}>
                    <MusicIcon className="h-3.5 w-3.5" /> {musicBusy ? "Reading..." : settings.music ? "Change track" : "Add a track"}
                  </Button>
                  <input ref={musicInput} type="file" accept="audio/*" className="sr-only" tabIndex={-1} aria-hidden
                    onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void addMusic(f); }} />
                </div>
                {settings.music && (
                  <>
                    <p className="truncate text-xs text-muted-foreground">
                      {settings.music.name}{musicBlob === null ? ". The track is on the device you added it on." : ""}
                    </p>
                    <Row label={`Music ${Math.round(settings.music.level * 100)}%`}>
                      <input type="range" min={0} max={1} step={0.05} value={settings.music.level} aria-label="Music volume"
                        onChange={(e) => patch({ music: { ...settings.music!, level: Number(e.target.value) } })} className="h-11 w-32 accent-primary sm:h-auto" />
                      <Button size="sm" variant="ghost" className="h-11 text-xs text-muted-foreground sm:h-8" onClick={() => patch({ music: undefined })}>Remove</Button>
                    </Row>
                  </>
                )}
              </div>
              <Row label="Voice polish">
                <InfoTip label="About voice polish">Cuts rumble and hum, lifts clarity and evens out loud and quiet bits.</InfoTip>
                <Toggle on={!!settings.voicePolish} set={(v) => patch({ voicePolish: v })} />
              </Row>
              <Row label="Even out loudness">
                <InfoTip label="About loudness">Instagram and TikTok play videos at about -14 LUFS.</InfoTip>
                <Toggle on={!!settings.loudness} set={(v) => patch({ loudness: v })} />
              </Row>
              {settings.loudness && (
                <p className="text-xs text-muted-foreground" aria-live="polite">
                  {measuring === "busy" ? "Measuring the sound..." : measuring === "none" ? "No sound to measure in this video." : level ? `${Math.round(level.before)} LUFS -> ${Math.round(level.after)} LUFS, peak ${level.peak.toFixed(1)} dB` : ""}
                </p>
              )}
              {cuts.length > 0 && (
                <details className="rounded-lg border border-border/60">
                  <summary className="cursor-pointer px-3 py-2 text-sm font-medium">
                    Review {cuts.length} {cuts.length === 1 ? "cut" : "cuts"}{keptCuts.size ? ` (${cuts.filter((c) => keptCuts.has(c.id)).length} kept)` : ""}
                  </summary>
                  <ul className="max-h-64 divide-y divide-border/60 overflow-y-auto border-t border-border/60">
                    {cuts.map((c) => {
                      const kept = keptCuts.has(c.id);
                      return (
                        <li key={c.id} className="flex items-center gap-2 px-3 py-1.5 text-xs">
                          <span className="w-12 shrink-0 font-mono text-[11px] text-muted-foreground">{fmtTime(c.start)}</span>
                          <span className={`min-w-0 flex-1 truncate ${kept ? "text-muted-foreground" : ""}`}>
                            {c.before} <mark className="rounded bg-warning/30 px-1 text-foreground">{c.kind === "filler" ? c.word : `${(c.end - c.start).toFixed(1)}s pause`}</mark> {c.after}
                          </span>
                          <Button size="sm" variant="ghost" className="h-8 w-8 shrink-0 p-0" aria-label={`Listen to ${c.kind === "filler" ? c.word : "the pause"} at ${fmtTime(c.start)}`} onClick={() => listen(c.start, c.end)}>
                            <Volume2 className="h-3.5 w-3.5" />
                          </Button>
                          <Chip on={!kept} onClick={() => toggleCut(c.id)}>{kept ? "Kept" : "Cut"}</Chip>
                        </li>
                      );
                    })}
                  </ul>
                </details>
              )}
              {!words.length && (
                <Button size="sm" variant="outline" onClick={recaption} disabled={captioning} className="gap-1.5">
                  {captioning ? <ThinkingOrb state="working" size={20} theme="light" aria-hidden /> : null} {captioning ? "Captioning..." : "Caption it"}
                </Button>
              )}
            </div>
          )}

          {tab === "frame" && (
            <div className="space-y-3">
              <label className="block space-y-1 text-xs font-semibold">
                Hook on screen
                <input value={settings.hook} maxLength={90} onChange={(e) => patch({ hook: e.target.value })} placeholder="3 CPF mistakes I see every week"
                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm font-normal" />
              </label>
              <Button size="sm" variant="outline" disabled={thinking || !words.length} className="gap-1.5"
                onClick={() => runVibe(undefined, "Write the hook card: the most scroll-stopping line in 8 words or fewer, using my own words from the transcript. Change only the hook.")}>
                <Sparkles className="h-3.5 w-3.5" /> Suggest a hook from what I say
              </Button>
              <Row label={`Hook shows for ${settings.hookSeconds}s`}><input type="range" min={1} max={10} step={0.5} value={settings.hookSeconds} onChange={(e) => patch({ hookSeconds: Number(e.target.value) })} className="w-40 accent-primary" /></Row>
              <div className="grid grid-cols-2 gap-2">
                <label className="block space-y-1 text-xs font-semibold">
                  Name tag
                  <input value={settings.nameTag ?? ""} maxLength={40} onChange={(e) => patch({ nameTag: e.target.value })} placeholder="Your name"
                    className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm font-normal" />
                </label>
                <label className="block space-y-1 text-xs font-semibold">
                  Role
                  <input value={settings.roleTag ?? ""} maxLength={50} onChange={(e) => patch({ roleTag: e.target.value })} placeholder="Financial adviser"
                    className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm font-normal" />
                </label>
              </div>
              {!settings.nameTag?.trim() && brandKit?.name?.trim() && (
                <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => patch({ nameTag: brandKit.name.trim().slice(0, 40), roleTag: (brandKit.role ?? "").trim().slice(0, 50) })}>
                  Use {brandKit.name.trim()}{brandKit.role?.trim() ? `, ${brandKit.role.trim()}` : ""}
                </Button>
              )}
              {art ? (
                <>
                  <Row label="Logo in the corner">
                    {art.logo ? <Toggle on={!!settings.logo} set={(v) => patch({ logo: v })} /> : <Link to="/brand" className="text-xs font-semibold text-primary hover:underline">Add a logo</Link>}
                  </Row>
                  <Row label={`End card (${END_CARD_SECONDS}s)`}><Toggle on={!!settings.endCard} set={(v) => { endAt.current = v ? 0.6 : null; patch({ endCard: v }); }} /></Row>
                </>
              ) : (
                <p className="text-xs"><Link to="/brand" className="font-semibold text-primary hover:underline">Set up your brand kit</Link> for a logo and an end card.</p>
              )}
              <Row label="Shape">
                {(["9:16", "4:5", "1:1", "16:9", "original"] as const).map((a) => <Chip key={a} on={settings.aspect === a} onClick={() => patch({ aspect: a })}>{a === "original" ? "Original" : a}</Chip>)}
              </Row>
              <Row label="Fit">
                <Chip on={(settings.fit ?? "fill") === "fill"} onClick={() => patch({ fit: "fill" })}>Crop to fill</Chip>
                <Chip on={settings.fit === "blur"} onClick={() => patch({ fit: "blur" })}>Whole video, blurred behind</Chip>
                <Chip on={settings.fit === "framed"} onClick={() => patch({ fit: "framed", ...(settings.captionY === undefined ? { captionY: 0.68 } : {}) })}>Framed window</Chip>
              </Row>
              {(settings.fit ?? "fill") === "fill" && (
                <Row label="Framing"><input type="range" min={0} max={1} step={0.01} value={settings.focusX} onChange={(e) => patch({ focusX: Number(e.target.value) })} aria-label="Move the crop left or right" className="w-40 accent-primary" /></Row>
              )}
              <div className="space-y-1.5">
                <p className="text-sm font-medium">Export for</p>
                <div className="flex flex-wrap gap-1.5 [&>button]:min-h-11 sm:[&>button]:min-h-0">
                  {(Object.keys(EXPORT_TARGETS) as ExportTarget[]).map((id) => (
                    <Chip key={id} on={settings.exportAs !== "audio" && targetOf(settings) === id}
                      onClick={() => patch({ exportAs: id === "whatsapp" ? "small" : undefined, exportFor: id === "reels" || id === "whatsapp" ? undefined : id })}>
                      {EXPORT_TARGETS[id].label}
                    </Chip>
                  ))}
                  <Chip on={settings.exportAs === "audio"} onClick={() => patch({ exportAs: "audio" })}>Sound only</Chip>
                </div>
                <p className="text-xs text-muted-foreground" aria-live="polite">
                  {settings.exportAs === "audio"
                    ? `About ${fmtBytes(size.bytes)}`
                    : `About ${fmtBytes(size.bytes)} at ${size.w} x ${size.h}${size.capBytes && size.fits ? `, under the ${fmtBytes(size.capBytes)} ${size.label} takes` : ""}`}
                </p>
                {!size.fits && (
                  <p className="flex flex-wrap items-center gap-2 text-xs text-destructive" role="status">
                    Too long for {size.label}&apos;s {fmtBytes(size.capBytes)} at a clear picture.
                    <Button size="sm" variant="outline" className="h-11 text-xs text-foreground sm:h-7"
                      onClick={() => patch({ trimEnd: trimToLength(plan.segs, duration, size.maxSeconds - (total - plan.total), settings) })}>
                      Trim to {fmtTime(size.maxSeconds - (total - plan.total)).replace(/\.0$/, "")}
                    </Button>
                  </p>
                )}
              </div>
              <Row label="Progress bar"><Toggle on={settings.progressBar} set={(v) => patch({ progressBar: v })} /></Row>
              <Row label="Colour grade"><Toggle on={settings.grade} set={(v) => patch({ grade: v })} /></Row>
              {settings.grade && (
                <Row label="Look">
                  <Chip on={!settings.filter} onClick={() => patch({ filter: undefined })}>Style&apos;s own</Chip>
                  {(Object.keys(FILTERS) as (keyof typeof FILTERS)[]).map((id) => (
                    <Chip key={id} on={settings.filter === id} onClick={() => patch({ filter: id })}>{FILTERS[id].label}</Chip>
                  ))}
                </Row>
              )}
              <Row label="Between cuts">
                <Chip on={!settings.transition} onClick={() => patch({ transition: undefined })}>Hard cut</Chip>
                <Chip on={settings.transition === "soft"} onClick={() => patch({ transition: "soft" })}>Soft dip</Chip>
                <Chip on={settings.transition === "flash"} onClick={() => patch({ transition: "flash" })}>Flash</Chip>
              </Row>
            </div>
          )}

          {tab === "stickers" && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                {([["text", "Text"], ["arrow", "Arrow"], ["circle", "Circle"], ["underline", "Underline"]] as const).map(([k, label]) => (
                  <Button key={k} size="sm" variant="outline" className="h-9" onClick={() => addOverlay(k)}>Add {label.toLowerCase()}</Button>
                ))}
                <InfoTip label="About stickers">Added at the playhead for 3 seconds. Drag one on the preview to move it.</InfoTip>
              </div>
              {overlays.length > 0 && (
                <ul className="divide-y divide-border/60 rounded-lg border border-border/60">
                  {overlays.map((o) => (
                    <li key={o.id}>
                      <button type="button" onClick={() => { setSelected(o.id); seekOut(o.from + 0.2); }} aria-pressed={o.id === selected}
                        className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs ${o.id === selected ? "bg-primary/5" : ""}`}>
                        <span className="h-3 w-3 shrink-0 rounded-full border border-border" style={{ backgroundColor: o.color }} />
                        <span className="min-w-0 flex-1 truncate font-medium">{o.kind === "text" ? o.text || "Text" : o.kind[0].toUpperCase() + o.kind.slice(1)}</span>
                        <span className="font-mono text-[11px] text-muted-foreground">{fmtTime(o.from)}-{fmtTime(o.to)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {sel && (
                <div className="space-y-3 rounded-lg border border-primary/25 p-3">
                  {sel.kind === "text" && (
                    <input value={sel.text} maxLength={60} onChange={(e) => editOverlay(sel.id, { text: e.target.value })} aria-label="Sticker text"
                      className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm" />
                  )}
                  <Row label="Colour">
                    {stickerColours.map((c) => (
                      <button key={c} type="button" aria-label={`Colour ${c}`} aria-pressed={sel.color === c} onClick={() => editOverlay(sel.id, { color: c })}
                        className={`h-7 w-7 rounded-full border border-border ${sel.color === c ? "ring-2 ring-foreground ring-offset-2 ring-offset-background" : ""}`} style={{ backgroundColor: c }} />
                    ))}
                  </Row>
                  <Row label={`Size ${sel.size.toFixed(1)}x`}><input type="range" min={0.5} max={2.5} step={0.1} value={sel.size} onChange={(e) => editOverlay(sel.id, { size: Number(e.target.value) })} className="w-40 accent-primary" /></Row>
                  <Row label={`Shows for ${(sel.to - sel.from).toFixed(1)}s from ${fmtTime(sel.from)}`}>
                    <input type="range" min={0.5} max={10} step={0.5} value={sel.to - sel.from} onChange={(e) => editOverlay(sel.id, { to: sel.from + Number(e.target.value) })} aria-label="How long it shows" className="w-32 accent-primary" />
                  </Row>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => editOverlay(sel.id, { from: Math.floor(outT * 10) / 10, to: Math.floor(outT * 10) / 10 + (sel.to - sel.from) })}>Start at {fmtTime(outT)}</Button>
                    {(sel.kind === "arrow" || sel.kind === "underline") && (
                      <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => editOverlay(sel.id, { turn: (sel.turn + 1) % 4 })}><RotateCw className="h-3.5 w-3.5" /> Turn</Button>
                    )}
                    <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-destructive"
                      onClick={() => { change({ ...settings, overlays: overlays.filter((o) => o.id !== sel.id) }); setSelected(null); }}>
                      <Trash2 className="h-3.5 w-3.5" /> Delete
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === "broll" && (
            <div className="space-y-3">
              {brollSearch ? (
                <StockSearch kind="video" orientation={settings.aspect === "16:9" ? "landscape" : settings.aspect === "1:1" ? "square" : "portrait"}
                  placeholder="Singapore skyline, family at home, hospital" onPick={addBroll} onClose={() => setBrollSearch(false)} />
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" className="h-9 gap-1.5" onClick={() => setBrollSearch(true)} disabled={brolls.length >= MAX_BROLL}>
                    <Film className="h-3.5 w-3.5" /> Add B-roll at {fmtTime(Math.min(outT, plan.total))}
                  </Button>
                  <InfoTip label="About B-roll">A free stock clip over your video from the playhead. Your voice carries on under it.</InfoTip>
                </div>
              )}
              {brolls.length > 0 && (
                <ul className="divide-y divide-border/60 rounded-lg border border-border/60">
                  {brolls.map((b) => (
                    <li key={b.id}>
                      <button type="button" onClick={() => { setSelBroll(b.id); seekOut(b.from + 0.05); }} aria-pressed={b.id === selBroll}
                        className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs ${b.id === selBroll ? "bg-primary/5" : ""}`}>
                        <span className="h-10 w-8 shrink-0 overflow-hidden rounded bg-muted">{b.thumb && <img src={b.thumb} alt="" className="h-full w-full object-cover" />}</span>
                        <span className="min-w-0 flex-1 truncate font-medium">{b.by ? `Clip by ${b.by}` : "Clip"}{brollUrls[b.key] === "" ? " (on another device)" : ""}</span>
                        <span className="font-mono text-[11px] text-muted-foreground">{fmtTime(b.from)}-{fmtTime(b.to)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {selB && (
                <div className="space-y-3 rounded-lg border border-primary/25 p-3">
                  <Row label={`Shows for ${(selB.to - selB.from).toFixed(1)}s from ${fmtTime(selB.from)}`}>
                    <input type="range" min={0.5} max={10} step={0.5} value={selB.to - selB.from} aria-label="How long the B-roll shows"
                      onChange={(e) => editBroll(selB.id, { to: selB.from + Number(e.target.value) })} className="w-32 accent-primary" />
                  </Row>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => { const from = Math.floor(Math.min(outT, plan.total) * 10) / 10; editBroll(selB.id, { from, to: from + (selB.to - selB.from) }); }}>Start at {fmtTime(Math.min(outT, plan.total))}</Button>
                    <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-destructive"
                      onClick={() => { change({ ...settings, broll: brolls.filter((b) => b.id !== selB.id) }); setSelBroll(null); }}>
                      <Trash2 className="h-3.5 w-3.5" /> Delete
                    </Button>
                  </div>
                  {selB.by && (
                    <p className="text-[11px] text-muted-foreground">
                      Video by {selB.byUrl ? <a href={selB.byUrl} target="_blank" rel="noreferrer" className="hover:underline">{selB.by}</a> : selB.by} on{" "}
                      {selB.url ? <a href={selB.url} target="_blank" rel="noreferrer" className="hover:underline">Pexels</a> : "Pexels"}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {tab === "words" && (
            <div className="space-y-2">
              {!words.length ? (
                <Button size="sm" variant="outline" onClick={recaption} disabled={captioning}>{captioning ? "Captioning..." : "Caption it"}</Button>
              ) : (
                <>
                <div className="flex items-center gap-1.5">
                  <label className="relative flex-1">
                    <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
                    <input value={find} onChange={(e) => { setFind(e.target.value); setHit(0); }} placeholder="Find a word or phrase" aria-label="Find in what you said"
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); jumpTo(hit + (e.shiftKey ? -1 : 1)); } }}
                      className="h-9 w-full rounded-md border border-input bg-background pl-7 pr-2 text-sm" />
                  </label>
                  {find.trim() && <span className="w-14 text-center text-[11px] text-muted-foreground" aria-live="polite">{hits.length ? `${hit + 1} of ${hits.length}` : "None"}</span>}
                  <Button size="sm" variant="outline" className="h-9 w-9 p-0" aria-label="Previous match" disabled={!hits.length} onClick={() => jumpTo(hit - 1)}><ChevronUp className="h-4 w-4" /></Button>
                  <Button size="sm" variant="outline" className="h-9 w-9 p-0" aria-label="Next match" disabled={!hits.length} onClick={() => jumpTo(hit + 1)}><ChevronDown className="h-4 w-4" /></Button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex gap-1 rounded-lg border border-border/60 bg-muted/30 p-1" role="group" aria-label="What a tap on a word does">
                    {([["fix", "Fix spelling"], ["cut", "Cut words"]] as const).map(([m, label]) => (
                      <button key={m} type="button" aria-pressed={wordMode === m} onClick={() => { setWordMode(m); setCutStart(null); }}
                        className={`rounded-md px-3 py-1.5 text-xs font-semibold ${wordMode === m ? "bg-background shadow-sm" : "text-muted-foreground"}`}>{label}</button>
                    ))}
                  </div>
                  {wordMode === "cut" && (
                    <span className="text-[11px] text-muted-foreground" aria-live="polite">
                      {cutStart === null ? "Tap the first word to cut, then the last. Tap a cut word to bring it back." : "Now tap the last word."}
                    </span>
                  )}
                  {cutWordCount > 0 && <span className="ml-auto text-[11px] font-medium">{cutWordCount} {cutWordCount === 1 ? "word" : "words"} cut</span>}
                </div>
                <p className="max-h-80 overflow-y-auto rounded-lg border border-border/60 p-3 text-sm leading-7">
                  {words.map((w, i) => (
                    <span
                      key={i}
                      id={`word-${i}`}
                      contentEditable={wordMode === "fix"}
                      role={wordMode === "cut" ? "button" : undefined}
                      tabIndex={wordMode === "cut" ? 0 : undefined}
                      onClick={wordMode === "cut" ? () => tapWord(i) : undefined}
                      onKeyDown={wordMode === "cut" ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); tapWord(i); } } : undefined}
                      suppressContentEditableWarning
                      onFocus={() => { const v = video.current; if (v) { v.currentTime = w.s; segIdx.current = 0; } }}
                      onBlur={(e) => {
                        const t = e.currentTarget.textContent?.trim() ?? "";
                        if (!t || t === w.w) return;
                        setWords((ws) => ws.map((x, j) => (j === i ? { ...x, w: t } : x)));
                        const fix = fixFromEdit(w.w, t);
                        if (fix && !fixes.some((f) => f.from.toLowerCase() === fix.from.toLowerCase() && f.to === fix.to)) setOffer(fix);
                      }}
                      className={`rounded px-0.5 outline-none focus:bg-primary/10 ${wordMode === "cut" ? "cursor-pointer" : ""} ${removedAt(settings.removed, w) ? "bg-destructive/10 text-muted-foreground line-through" : ""} ${cutStart === i ? "ring-2 ring-primary" : ""} ${settings.removeFillers && isFiller(w.w) ? "text-muted-foreground line-through" : ""} ${hitSet.has(i) ? (hits[hit] !== undefined && i >= hits[hit] && i < hits[hit] + (find.trim().split(/\s+/).length) ? "bg-warning/50" : "bg-warning/20") : ""}`}
                    >{w.w}</span>
                  )).reduce<React.ReactNode[]>((a, el, i) => (i ? [...a, " ", el] : [el]), [])}
                </p>
                {offer && (
                  <p className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/25 bg-primary/5 px-3 py-2 text-xs" role="status">
                    <span className="mr-auto">Fix &ldquo;{offer.from}&rdquo; to &ldquo;{offer.to}&rdquo; in every video?</span>
                    <span className="flex gap-1">
                      <Button size="sm" className="h-8 text-xs" onClick={() => remember(offer)}>Always fix</Button>
                      <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setOffer(null)}>Just this once</Button>
                    </span>
                  </p>
                )}
                </>
              )}
              <details className="rounded-lg border border-border/60">
                <summary className="cursor-pointer px-3 py-2 text-sm font-medium">Words to fix in every video ({fixes.length})</summary>
                <div className="space-y-2 border-t border-border/60 p-3">
                  {fixes.length > 0 && (
                    <ul className="flex flex-wrap gap-1.5">
                      {fixes.map((f) => (
                        <li key={f.from} className="flex items-center gap-1 rounded-full border border-border/70 py-0.5 pl-2.5 pr-1 text-xs">
                          <span className="text-muted-foreground line-through">{f.from}</span> {f.to}
                          <button type="button" aria-label={`Stop fixing ${f.from}`} onClick={() => setFixes(saveFixes(userId, fixes.filter((x) => x !== f)))}
                            className="rounded-full p-1 text-muted-foreground hover:text-destructive"><Trash2 className="h-3 w-3" /></button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <form className="flex flex-wrap items-center gap-1.5" onSubmit={(e) => { e.preventDefault(); const fix = fixFromEdit(heard, should); if (fix) { remember(fix); setHeard(""); setShould(""); } }}>
                    <input value={heard} maxLength={40} onChange={(e) => setHeard(e.target.value)} placeholder="Heard as: medi shield" aria-label="What the captions write"
                      className="h-9 min-w-0 flex-1 basis-32 rounded-md border border-input bg-background px-2 text-sm" />
                    <input value={should} maxLength={40} onChange={(e) => setShould(e.target.value)} placeholder="Should be: MediShield" aria-label="What it should say"
                      className="h-9 min-w-0 flex-1 basis-32 rounded-md border border-input bg-background px-2 text-sm" />
                    <Button type="submit" size="sm" variant="outline" className="h-9" disabled={!fixFromEdit(heard, should)}>Add</Button>
                  </form>
                </div>
              </details>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] text-muted-foreground">{wordMode === "fix" ? "Click a word to fix its spelling in the captions." : ""}</p>
                {words.length > 0 && <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={downloadSrt}><Download className="h-3.5 w-3.5" /> Subtitles (.srt)</Button>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
      <span className="font-medium">{label}</span>
      <span className="flex items-center gap-1.5">{children}</span>
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on}
      className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${on ? "border-primary bg-primary/10 text-primary" : "border-border/70 text-muted-foreground"}`}>{children}</button>
  );
}

function Toggle({ on, set }: { on: boolean; set: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={() => set(!on)}
      className={`relative h-6 w-11 rounded-full transition-colors after:absolute after:-inset-y-2.5 after:inset-x-0 after:content-[''] ${on ? "bg-primary" : "bg-muted"}`}>
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
    </button>
  );
}
