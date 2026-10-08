import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ChevronDown, ChevronUp, Download, RotateCw, Volume2, Film, ImageIcon, Pause, Play, Scissors, Search, Sparkles, Trash2, Undo2, Upload, Wand2 } from "lucide-react";
import { ThinkingOrb } from "thinking-orbs";
import SectionTabs, { WRITE_TABS } from "@/components/SectionTabs";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { InfoTip } from "@/components/ui/info-tip";
import { useToast } from "@/hooks/use-toast";
import { streamOnePost } from "@/lib/batchGenerate";
import { splitScriptCaption } from "@/lib/scriptCaption";
import { upsertDraft } from "@/lib/draftHistory";
import { loadVoiceProfile } from "@/lib/voiceProfile";
import { scanCompliance } from "@/lib/compliance";
import { stripDashes } from "@/lib/recruit";
import { loadBrand } from "@/lib/carousel";
import { withSignOff } from "@/lib/plainText";
import { supabase } from "@/lib/supabase";
import {
  STYLES,
  STYLE_IDS,
  applyPatch,
  aspectSize,
  captionCenter,
  captionKey,
  clipSettings,
  END_CARD_SECONDS,
  FONTS,
  FILTERS,
  captionBoxOf,
  fullLength,
  findPhrase,
  MAX_OVERLAYS,
  newOverlay,
  overlayHit,
  sanitizeOverlays,
  type Overlay,
  type OverlayKind,
  listCuts,
  platformFit,
  trimToLength,
  lookOf,
  sameLook,
  toSrt,
  withLook,
  sentencesOf,
  defaultSettings,
  fmtTime,
  isFiller,
  outputTime,
  sourceTime,
  withStyle,
  type EditSettings,
  type StyleId,
} from "@/lib/videoEdit";
import {
  drawEndCard,
  drawFrame,
  ensureCaptionFonts,
  loadBrandArt,
  exportJob,
  makeCover,
  extractWav,
  getFile,
  onExportJob,
  planFor,
  putFile,
  startExport,
  stills,
  type BrandArt,
  type ExportJob,
} from "@/lib/videoMedia";
import { fileKey, findClips, loadLook, loadProjects, removeProject, saveLook, saveProject, transcribe, translateCaptions, vibeEdit, type VideoProject } from "@/lib/videoProjects";

const MAX_BYTES = 500 * 1024 * 1024;
type Tab = "style" | "cuts" | "frame" | "stickers" | "words";

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
        words: [], settings: withLook(defaultSettings("bold"), loadLook(uid)), thumb,
      };
      setProjects(saveProject(uid, p));
      setBusy(`Writing the captions (about ${Math.max(10, Math.round(duration / 4))} seconds)...`);
      try {
        const t = await transcribe(wav);
        p = { ...p, words: t.words };
        setProjects(saveProject(uid, p));
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
  const [settings, setSettings] = useState<EditSettings>(() => ({ ...project.settings, overlays: sanitizeOverlays(project.settings.overlays) }));
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
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const segIdx = useRef(0);
  const drag = useRef<{ startX: number; startY: number; moved: boolean; overlay?: string } | null>(null);
  // the brand kit (logo, end card, name tag); endAt is the time into the end card while it shows
  const brandKit = useMemo(() => loadBrand(userId), [userId]);
  const [art, setArt] = useState<BrandArt | null>(null);
  const [myLook, setMyLook] = useState(() => loadLook(userId));
  const endAt = useRef<number | null>(null);
  useEffect(() => {
    void loadBrandArt(brandKit).then(setArt);
  }, [brandKit]);

  useEffect(() => { const off = onExportJob(setJob); return () => { off(); }; }, []);
  useEffect(() => {
    void ensureCaptionFonts().then(() => paintRef.current?.());
  }, []);
  useEffect(() => {
    getFile(fileKey(project)).then((f) => setFile(f ?? null)).catch(() => setFile(null));
  }, [project]);
  const url = useMemo(() => (file ? URL.createObjectURL(file) : ""), [file]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  // save the edit a moment after the last change
  useEffect(() => {
    const t = window.setTimeout(() => onSave({ ...project, settings, words, subs, caption }), 400);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings, words, subs, caption]);

  const duration = project.duration;
  const plan = useMemo(() => planFor(words, duration, settings), [words, duration, settings]);
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
    const out = outputTime(plan.segs, v.currentTime) ?? outT;
    drawFrame(c.getContext("2d")!, { video: v, settings, ...plan, src: v.currentTime, out, subs: settings.subLang ? subs[settings.subLang] : undefined, brand: art, still: !playing });
    setOutT(out);
  }, [plan, settings, outT, subs, art, playing]);
  const total = fullLength(plan.total, settings, !!art);
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
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, plan, paint, total]);

  useEffect(() => { if (!playing) paint(); }, [settings, plan]); // eslint-disable-line react-hooks/exhaustive-deps

  const seekOut = (t: number) => {
    const v = video.current;
    if (!v) return;
    if (t > plan.total && total > plan.total) {
      endAt.current = Math.min(t - plan.total, total - plan.total);
      paint();
      return;
    }
    endAt.current = null;
    const src = sourceTime(plan.segs, t);
    segIdx.current = Math.max(0, plan.segs.findIndex((g) => src >= g.start && src < g.end));
    v.currentTime = src;
  };

  const toggle = async () => {
    const v = video.current;
    if (!v) return;
    if (playing) { v.pause(); setPlaying(false); return; }
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

  const runVibe = async (frames?: string[], preset?: string) => {
    const instruction = preset ?? ask.trim();
    if (!instruction && !frames) return;
    setThinking(true);
    try {
      const res = await vibeEdit({ instruction, settings, transcript, duration, frames });
      const { next, changed } = applyPatch(settings, res.patch);
      if (changed.length) change(next);
      setLog((l) => [...l, { me: preset ? "Suggest a hook" : instruction || "Match my reference video", it: changed.length ? res.reply : `${res.reply} (nothing changed)` }]);
      if (!preset) setAsk("");
    } catch (e) {
      toast({ title: "That change didn't go through", description: (e as Error).message, variant: "destructive" });
    } finally {
      setThinking(false);
    }
  };

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
      setWords(t.words);
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

  const doExport = () => {
    if (!file) return;
    void startExport(project.name, file, words, settings, settings.subLang ? subs[settings.subLang] : undefined, art).catch((e) => toast({ title: (e as Error).message, variant: "destructive" }));
  };

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
    const t = outputTime(plan.segs, w.s);
    const v = video.current;
    if (t !== null) seekOut(t);
    else if (v) v.currentTime = w.s; // a cut word: show the moment anyway
    document.getElementById(`word-${hits[i]}`)?.scrollIntoView({ block: "nearest" });
  };

  const downloadSrt = () => {
    const blob = new Blob([toSrt(words, plan.segs, settings.removeFillers)], { type: "application/x-subrip" });
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
  const stickerColours = [...new Set(["#FFFFFF", "#FFD92B", settings.activeColor, art?.color ?? "#2563EB", "#EF4444", "#111827"].map((c) => c.toUpperCase()))];

  const cutSeconds = Math.max(0, duration - plan.total);
  // platforms this length is too long for, shortest limit first
  const lengthIssues = useMemo(() => platformFit(plan.total).filter((p) => p.fit !== "ok").sort((a, b) => a.limit - b.limit), [plan.total]);
  const fillers = words.filter((w) => isFiller(w.w)).length;

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
          <Download className="h-3.5 w-3.5" /> {job?.state === "running" ? `Exporting ${Math.round(job.progress * 100)}%` : "Export MP4"}
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
      {job?.state === "done" && job.url && (
        <p className="text-xs">Exported. <a href={job.url} download={`${project.name}-edited.${job.ext}`} className="font-semibold text-primary">Download again</a></p>
      )}
      {job?.state === "failed" && <p className="text-xs text-destructive">Export failed: {job.error}</p>}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,360px)_1fr]">
        <div className="space-y-2">
          <div className="mx-auto w-full max-w-[360px]">
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
          </div>
          {file === undefined && <p className="text-xs text-muted-foreground">Loading the video...</p>}
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
            {fmtTime(duration)} filmed, {fmtTime(plan.total)} after cuts{cutSeconds > 0.5 ? ` (${cutSeconds.toFixed(1)}s cut)` : ""}.
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
        </div>

        <div className="space-y-4">
          <section className="space-y-2 rounded-xl border border-primary/25 bg-primary/5 p-3">
            <p className="flex items-center gap-1.5 text-sm font-semibold"><Sparkles className="h-4 w-4 text-primary" /> Vibe edit
              <InfoTip label="About vibe edit">Say the change in plain words; Undo puts it back.</InfoTip></p>
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
            </div>
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
                  <Button size="sm" variant="ghost" onClick={() => { const sign = loadBrand(userId)?.signOff?.trim(); navigator.clipboard.writeText(sign ? withSignOff(caption, sign) : caption).then(() => toast({ title: sign ? "Caption copied with your sign-off" : "Caption copied" })); }}>Copy</Button>
                  {savedDraft && <Link to="/calendar" className="self-center text-xs font-semibold text-primary hover:underline">Schedule it</Link>}
                </div>
              </>
            )}
          </section>

          <nav className="flex w-fit flex-wrap gap-1 rounded-lg border border-border/60 bg-muted/30 p-1" aria-label="Edit">
            {([["style", "Captions"], ["cuts", "Cuts"], ["frame", "Hook and frame"], ["stickers", "Stickers"], ["words", "Words"]] as const).map(([id, label]) => (
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
              <div className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
                <span className="mr-auto text-sm font-medium">My look
                  <InfoTip label="About my look">Captions, cuts, shape, name tag, logo and end card. New videos start with it.</InfoTip></span>
                {myLook && !sameLook(settings, myLook) && (
                  <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => change(withLook(settings, myLook))}>Apply my look</Button>
                )}
                <Button size="sm" variant="outline" className="h-8 text-xs" disabled={sameLook(settings, myLook)}
                  onClick={() => { const look = lookOf(settings); saveLook(userId, look); setMyLook(look); toast({ title: "Look saved", description: "New videos start with it." }); }}>
                  {sameLook(settings, myLook) ? "This is your look" : "Save as my look"}
                </Button>
              </div>
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
              </Row>
              {(settings.fit ?? "fill") === "fill" && (
                <Row label="Framing"><input type="range" min={0} max={1} step={0.01} value={settings.focusX} onChange={(e) => patch({ focusX: Number(e.target.value) })} aria-label="Move the crop left or right" className="w-40 accent-primary" /></Row>
              )}
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
                <p className="max-h-80 overflow-y-auto rounded-lg border border-border/60 p-3 text-sm leading-7">
                  {words.map((w, i) => (
                    <span
                      key={i}
                      id={`word-${i}`}
                      contentEditable
                      suppressContentEditableWarning
                      onFocus={() => { const v = video.current; if (v) { v.currentTime = w.s; segIdx.current = 0; } }}
                      onBlur={(e) => {
                        const t = e.currentTarget.textContent?.trim() ?? "";
                        if (t && t !== w.w) setWords((ws) => ws.map((x, j) => (j === i ? { ...x, w: t } : x)));
                      }}
                      className={`rounded px-0.5 outline-none focus:bg-primary/10 ${settings.removeFillers && isFiller(w.w) ? "text-muted-foreground line-through" : ""} ${hitSet.has(i) ? (hits[hit] !== undefined && i >= hits[hit] && i < hits[hit] + (find.trim().split(/\s+/).length) ? "bg-warning/50" : "bg-warning/20") : ""}`}
                    >{w.w}</span>
                  )).reduce<React.ReactNode[]>((a, el, i) => (i ? [...a, " ", el] : [el]), [])}
                </p>
                </>
              )}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] text-muted-foreground">Click a word to fix its spelling in the captions.</p>
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
      className={`relative h-6 w-11 rounded-full transition-colors ${on ? "bg-primary" : "bg-muted"}`}>
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
    </button>
  );
}
