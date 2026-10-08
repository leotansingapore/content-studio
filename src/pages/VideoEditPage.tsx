import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Download, Film, Pause, Play, Scissors, Sparkles, Trash2, Undo2, Upload, Wand2 } from "lucide-react";
import { ThinkingOrb } from "thinking-orbs";
import SectionTabs, { WRITE_TABS } from "@/components/SectionTabs";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { InfoTip } from "@/components/ui/info-tip";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import {
  STYLES,
  STYLE_IDS,
  applyPatch,
  aspectSize,
  clipSettings,
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
  drawFrame,
  ensureCaptionFonts,
  exportJob,
  extractWav,
  getFile,
  onExportJob,
  planFor,
  putFile,
  startExport,
  stills,
  type ExportJob,
} from "@/lib/videoMedia";
import { fileKey, findClips, loadProjects, removeProject, saveProject, transcribe, vibeEdit, type VideoProject } from "@/lib/videoProjects";

const MAX_BYTES = 500 * 1024 * 1024;
type Tab = "style" | "cuts" | "frame" | "words";

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
        words: [], settings: defaultSettings("bold"), thumb,
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
  const [settings, setSettings] = useState<EditSettings>(project.settings);
  const [words, setWords] = useState(project.words);
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
    const t = window.setTimeout(() => onSave({ ...project, settings, words }), 400);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings, words]);

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
    const out = outputTime(plan.segs, v.currentTime) ?? outT;
    drawFrame(c.getContext("2d")!, { video: v, settings, ...plan, src: v.currentTime, out });
    setOutT(out);
  }, [plan, settings, outT]);
  paintRef.current = paint;

  // playback that skips the cuts
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const loop = () => {
      const v = video.current;
      if (!v) return;
      const seg = plan.segs[segIdx.current];
      if (!seg) { v.pause(); setPlaying(false); return; }
      if (v.currentTime >= seg.end - 0.03 || v.currentTime < seg.start - 0.2) {
        segIdx.current++;
        const next = plan.segs[segIdx.current];
        if (!next) { v.pause(); setPlaying(false); return; }
        v.currentTime = next.start;
      }
      paint();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, plan, paint]);

  useEffect(() => { if (!playing) paint(); }, [settings, plan]); // eslint-disable-line react-hooks/exhaustive-deps

  const seekOut = (t: number) => {
    const v = video.current;
    if (!v) return;
    const src = sourceTime(plan.segs, t);
    segIdx.current = Math.max(0, plan.segs.findIndex((g) => src >= g.start && src < g.end));
    v.currentTime = src;
  };

  const toggle = async () => {
    const v = video.current;
    if (!v) return;
    if (playing) { v.pause(); setPlaying(false); return; }
    if (outT >= plan.total - 0.1) seekOut(0);
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

  const doExport = () => {
    if (!file) return;
    void startExport(project.name, file, words, settings).catch((e) => toast({ title: (e as Error).message, variant: "destructive" }));
  };

  const cutSeconds = Math.max(0, duration - plan.total);
  const fillers = words.filter((w) => isFiller(w.w)).length;
  const captionUrl = `/generate?${new URLSearchParams({
    format: "short-video",
    platform: "instagram",
    detail: project.name,
    ctx: `Write only the post caption for a reel I already filmed. What I say in it: ${transcript.slice(0, 1800)}`,
  })}`;

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
        <Button asChild variant="outline" size="sm" className="gap-1.5"><Link to={captionUrl}><Wand2 className="h-3.5 w-3.5" /> Write the caption</Link></Button>
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
          Exporting in real time ({fmtTime(plan.total)}). You can use other pages; keep this browser tab in front until it finishes.
        </p>
      )}
      {job?.state === "done" && job.url && (
        <p className="text-xs">Exported. <a href={job.url} download={`${project.name}-edited.${job.ext}`} className="font-semibold text-primary">Download again</a></p>
      )}
      {job?.state === "failed" && <p className="text-xs text-destructive">Export failed: {job.error}</p>}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,360px)_1fr]">
        <div className="space-y-2">
          <div className="mx-auto w-full max-w-[360px]">
            <canvas ref={canvas} width={W} height={H} onClick={toggle} className="w-full cursor-pointer rounded-xl bg-black shadow-card" aria-label="Preview, click to play or pause" />
          </div>
          {file === undefined && <p className="text-xs text-muted-foreground">Loading the video...</p>}
          <video ref={video} src={url} playsInline preload="auto" className="pointer-events-none absolute h-px w-px opacity-0"
            onLoadedData={() => paint()} onSeeked={() => paint()} />
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={toggle} aria-label={playing ? "Pause" : "Play"} className="h-9 w-9 p-0">
              {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </Button>
            <input type="range" min={0} max={plan.total || 1} step={0.05} value={Math.min(outT, plan.total)} aria-label="Position"
              onChange={(e) => seekOut(Number(e.target.value))} className="flex-1 accent-primary" />
            <span className="w-24 text-right font-mono text-[11px] text-muted-foreground">{fmtTime(outT)} / {fmtTime(plan.total)}</span>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {fmtTime(duration)} filmed, {fmtTime(plan.total)} after cuts{cutSeconds > 0.5 ? ` (${cutSeconds.toFixed(1)}s cut)` : ""}.
          </p>
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

          <nav className="flex w-fit gap-1 rounded-lg border border-border/60 bg-muted/30 p-1" aria-label="Edit">
            {([["style", "Captions"], ["cuts", "Cuts"], ["frame", "Hook and frame"], ["words", "Words"]] as const).map(([id, label]) => (
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
                {(["top", "middle", "bottom"] as const).map((p) => <Chip key={p} on={settings.position === p} onClick={() => patch({ position: p })}>{p}</Chip>)}
              </Row>
              <Row label={`Size ${settings.size.toFixed(1)}x`}><input type="range" min={0.6} max={1.6} step={0.1} value={settings.size} onChange={(e) => patch({ size: Number(e.target.value) })} className="w-40 accent-primary" /></Row>
              {STYLES[settings.style].mode === "words" && (
                <Row label={`Words at once: ${settings.wordsPerCaption}`}><input type="range" min={1} max={6} step={1} value={settings.wordsPerCaption} onChange={(e) => patch({ wordsPerCaption: Number(e.target.value) })} className="w-40 accent-primary" /></Row>
              )}
              <Row label="Colours">
                <input type="color" aria-label="Caption colour" value={settings.baseColor} onChange={(e) => patch({ baseColor: e.target.value.toUpperCase() })} className="h-8 w-10 rounded" />
                {STYLES[settings.style].mode === "words" && <input type="color" aria-label="Spoken word colour" value={settings.activeColor} onChange={(e) => patch({ activeColor: e.target.value.toUpperCase() })} className="h-8 w-10 rounded" />}
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
              <Row label="Shape">
                {(["9:16", "4:5", "1:1", "original"] as const).map((a) => <Chip key={a} on={settings.aspect === a} onClick={() => patch({ aspect: a })}>{a}</Chip>)}
              </Row>
              <Row label="Framing"><input type="range" min={0} max={1} step={0.01} value={settings.focusX} onChange={(e) => patch({ focusX: Number(e.target.value) })} aria-label="Move the crop left or right" className="w-40 accent-primary" /></Row>
              <Row label="Progress bar"><Toggle on={settings.progressBar} set={(v) => patch({ progressBar: v })} /></Row>
              <Row label="Colour grade"><Toggle on={settings.grade} set={(v) => patch({ grade: v })} /></Row>
            </div>
          )}

          {tab === "words" && (
            <div className="space-y-2">
              {!words.length ? (
                <Button size="sm" variant="outline" onClick={recaption} disabled={captioning}>{captioning ? "Captioning..." : "Caption it"}</Button>
              ) : (
                <p className="max-h-80 overflow-y-auto rounded-lg border border-border/60 p-3 text-sm leading-7">
                  {words.map((w, i) => (
                    <span
                      key={i}
                      contentEditable
                      suppressContentEditableWarning
                      onFocus={() => { const v = video.current; if (v) { v.currentTime = w.s; segIdx.current = 0; } }}
                      onBlur={(e) => {
                        const t = e.currentTarget.textContent?.trim() ?? "";
                        if (t && t !== w.w) setWords((ws) => ws.map((x, j) => (j === i ? { ...x, w: t } : x)));
                      }}
                      className={`rounded px-0.5 outline-none focus:bg-primary/10 ${settings.removeFillers && isFiller(w.w) ? "text-muted-foreground line-through" : ""}`}
                    >{w.w}</span>
                  )).reduce<React.ReactNode[]>((a, el, i) => (i ? [...a, " ", el] : [el]), [])}
                </p>
              )}
              <p className="text-[11px] text-muted-foreground">Click a word to fix its spelling in the captions.</p>
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
      className={`rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${on ? "border-primary bg-primary/10 text-primary" : "border-border/70 text-muted-foreground"}`}>{children}</button>
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
