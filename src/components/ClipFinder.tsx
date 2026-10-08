// Find clips in the video editor: one long video -> standalone reels, each its
// own project on the same file. The LLM proposes candidates and Jev scores each
// out of 100 (video-assist "clips"); the best come first. The list is kept per
// video for this session, so it is still there after opening a clip and coming back.
// Export all runs every clip's export in turn (videoMedia's export queue), each
// with that clip's own saved settings, and keeps going on other pages.

import { useEffect, useState } from "react";
import { Download, Scissors } from "lucide-react";
import { ThinkingOrb } from "thinking-orbs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InfoTip } from "@/components/ui/info-tip";
import { useToast } from "@/hooks/use-toast";
import { useUsesLeft } from "@/lib/aiUsage";
import { loadBrand } from "@/lib/carousel";
import { loadEffects, paintEffects } from "@/lib/faceVision";
import { clipSettings, fmtTime, sentencesOf, type Clip, type EditSettings, type Word } from "@/lib/videoEdit";
import { exportAll, exportJob, exportQueue, getFile, loadBrandArt, onExportJob, startExport, stopExportQueue, type BrandArt, type Frame } from "@/lib/videoMedia";
import { fileKey, findClips, loadProjects, type VideoProject } from "@/lib/videoProjects";
import { clipPasses } from "../../supabase/functions/video-assist/passes.ts";

/** A clip's project keeps the words this close to it, not the whole recording's (a 2-hour podcast's run to 800 KB). */
const WORDS_MARGIN = 60;

export interface FoundClip {
  clip: Clip;
  project: VideoProject;
}

// ponytail: kept in memory for the session only; the clip projects themselves are saved like any project
const found = new Map<string, FoundClip[]>();

const picture = (key: string) =>
  getFile(key).then((b) => new Promise<HTMLImageElement | null>((done) => {
    if (!b) return done(null);
    const img = new Image();
    img.onload = () => done(img);
    img.onerror = () => done(null);
    img.src = URL.createObjectURL(b);
  }));

/** One clip exported as the editor's Export would: its latest saved settings, files from this device. */
async function exportClip(userId: string, saved: VideoProject, art: BrandArt | null) {
  const p = loadProjects(userId).find((x) => x.id === saved.id) ?? saved;
  const s = p.settings;
  const file = await getFile(fileKey(p));
  if (!file) throw new Error("The video file is not on this device.");
  const blob = (key: string) => getFile(key).catch(() => undefined);
  const broll: Record<string, Blob> = {};
  for (const b of s.broll ?? []) {
    const f = await blob(b.key);
    if (f) broll[b.key] = f;
  }
  let fx: Frame["fx"] = null;
  if (s.backdrop || s.touchUp) {
    await loadEffects(s);
    const pic = s.backdrop?.kind === "picture" ? await picture(s.backdrop.key) : null;
    fx = (g, r) => paintEffects(g, r, s, pic);
  }
  const voice = s.voiceover ? (await blob(s.voiceover.key)) ?? null : null;
  const music = s.music ? (await blob(s.music.key)) ?? null : null;
  await startExport(p.name, file, p.words, s, s.subLang ? p.subs?.[s.subLang] : undefined, art, voice, broll, music, fx);
}

export default function ClipFinder({ userId, project, words, settings, duration, onClips, onOpen }: {
  userId: string;
  project: VideoProject;
  words: Word[];
  settings: EditSettings;
  duration: number;
  onClips: (ps: VideoProject[]) => void;
  onOpen: (id: string) => void;
}) {
  const { toast } = useToast();
  const [list, setList] = useState<FoundClip[]>(() => found.get(project.id) ?? []);
  const [busy, setBusy] = useState(false);
  const [about, setAbout] = useState("");
  const left = useUsesLeft(busy);
  const usesLeft = left("video-clips");
  // a long recording is read in passes, each one use
  const passes = clipPasses(duration);
  const short = usesLeft !== null && usesLeft < passes;
  // the export store lives outside React: re-read it whenever it changes
  const [, setTick] = useState(0);
  useEffect(() => {
    const off = onExportJob(() => setTick((t) => t + 1));
    return () => { off(); };
  }, []);
  const job = exportJob();
  const queue = exportQueue();
  // the last Export all was this list's (another video's run shows on its own page)
  const ours = !!queue && list.some((f) => queue.ids.includes(f.project.id));

  const exportEvery = async () => {
    const art = await loadBrandArt(loadBrand(userId)).catch(() => null);
    exportAll(list.map((f) => ({ id: f.project.id, run: () => exportClip(userId, f.project, art) })))
      .catch((e) => toast({ title: (e as Error).message, variant: "destructive" }));
  };

  const find = async () => {
    setBusy(true);
    try {
      const clips = await findClips(sentencesOf(words), duration, words, about);
      const now = Date.now().toString(36);
      const made = clips.map((clip, i): FoundClip => ({
        clip,
        project: {
          ...project,
          id: `v${now}${i}`,
          name: `${project.name} - ${clip.title}`,
          fileId: fileKey(project),
          createdAt: new Date().toISOString(),
          words: words.filter((w) => w.e > clip.start - WORDS_MARGIN && w.s < clip.end + WORDS_MARGIN),
          settings: clipSettings(settings, clip, duration),
        },
      }));
      onClips(made.map((m) => m.project));
      found.set(project.id, made);
      setList(made);
    } catch (e) {
      toast({ title: "Couldn't find clips", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  if (duration < 45 || !words.length) return null;
  const scored = list.some((f) => typeof f.clip.score === "number");
  // a clip was asked for and Jev found none about it
  const offTopic = list.some((f) => f.clip.onTopic === false) && !list.some((f) => f.clip.onTopic);
  return (
    <section aria-label="Clips" className="space-y-2">
      <form className="flex flex-col gap-2 sm:flex-row sm:items-center" onSubmit={(e) => { e.preventDefault(); if (!busy && !short) void find(); }}>
        <Input value={about} onChange={(e) => setAbout(e.target.value)} maxLength={200} disabled={busy}
          placeholder="What should the clip be about? (optional)" aria-label="What should the clip be about?" className="h-11 sm:h-9 sm:max-w-sm" />
        <Button type="submit" variant="outline" size="sm" disabled={busy || short} className={`h-11 shrink-0 gap-1.5 sm:h-9 ${busy ? "disabled:opacity-100" : ""}`}>
          {busy ? <ThinkingOrb state="working" size={20} theme="light" aria-hidden /> : <Scissors className="h-3.5 w-3.5" />}
          {busy ? "Finding clips..." : <>Find clips{usesLeft !== null && <span className={`font-normal ${short ? "text-destructive" : "opacity-80"}`}>{usesLeft === 0 ? "none left today" : passes > 1 ? `${passes} uses, ${usesLeft} left` : `${usesLeft} left`}</span>}</>}
        </Button>
      </form>
      {list.length > 0 && (
        <div className="rounded-xl border border-success/40 bg-success/5 p-3">
          <p className="mb-2 flex items-center gap-1 text-sm font-semibold">
            {list.length} clips ready{scored ? ", best first" : ", each with its own hook"}
            {scored && <InfoTip label="About the scores">Out of 100: how well it stands alone and how strongly it opens.</InfoTip>}
          </p>
          {offTopic && <p className="mb-2 text-xs text-muted-foreground">Nothing in this video is about that, so these are its best clips.</p>}
          <ul className="space-y-3">
            {list.map(({ clip, project: c }) => (
              <li key={c.id} className="flex items-start gap-2 text-sm">
                {typeof clip.score === "number" && (
                  <span className="mt-0.5 w-9 shrink-0 rounded-md bg-background px-1 py-0.5 text-center text-xs font-semibold tabular-nums" aria-label={`Score ${clip.score} out of 100`}>{clip.score}</span>
                )}
                <div className="min-w-0 flex-1 space-y-0.5">
                  <p className="font-medium">
                    {clip.title}
                    {clip.onTopic && <span className="ml-1.5 whitespace-nowrap rounded-md bg-primary/10 px-1.5 py-0.5 align-middle text-[11px] font-medium text-primary">On topic</span>}
                  </p>
                  {clip.reason && <p className="text-xs text-muted-foreground">{clip.reason}</p>}
                  <p className="font-mono text-[11px] text-muted-foreground">
                    {fmtTime(c.settings.trimStart)}-{fmtTime(duration - c.settings.trimEnd)}
                    {clip.skip && <span className="font-sans">, skips {Math.round(clip.skip.end - clip.skip.start)} s in the middle</span>}
                    {ours && queue.files[c.id] && (
                      <a href={queue.files[c.id].url} download={`${c.name.replace(/[^\w-]+/g, "-").slice(0, 60)}.${queue.files[c.id].ext}`} className="ml-1 inline-flex min-h-11 items-center px-1 font-sans font-medium text-primary underline-offset-2 hover:underline sm:min-h-0">Download</a>
                    )}
                    {ours && queue.failed[c.id] && <span className="ml-2 font-sans text-destructive">Couldn't export: {queue.failed[c.id]}</span>}
                  </p>
                </div>
                <Button size="sm" variant="outline" className="h-11 shrink-0 text-xs sm:h-8" onClick={() => onOpen(c.id)}>Open</Button>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-success/30 pt-3" aria-live="polite">
            {queue?.running && ours ? (
              <>
                <p className="mr-auto text-sm font-medium">
                  Exporting {queue.at} of {queue.of}{job?.state === "running" ? `, ${Math.round(job.progress * 100)}%` : ""}
                  <span className="block text-xs font-normal text-muted-foreground">Each takes as long as it runs. You can use other pages; keep this browser tab in front.</span>
                </p>
                <Button size="sm" variant="outline" className="h-11 sm:h-9" onClick={stopExportQueue} disabled={queue.stopping}>
                  {queue.stopping ? "Stopping after this one..." : "Stop after this one"}
                </Button>
              </>
            ) : (
              <>
                {ours && !queue.running && (
                  <p className="mr-auto text-sm font-medium">
                    {Object.keys(queue.files).length} of {queue.of} clips exported{queue.stopping ? ", stopped" : ""}
                  </p>
                )}
                <Button size="sm" variant="outline" className="h-11 gap-1.5 sm:h-9" onClick={() => void exportEvery()} disabled={job?.state === "running" || !!queue?.running}>
                  <Download className="h-3.5 w-3.5" /> Export all {list.length}
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
