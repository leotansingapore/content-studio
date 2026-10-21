// Find clips in the video editor: one long video -> standalone reels, each its
// own project on the same file. The LLM proposes candidates and Jev scores each
// out of 100 (video-assist "clips"); the best come first. The list and the running
// find live in clipAsk.ts for this session, so they are still there after opening a
// clip or another page and coming back, and a find the clips panel asked for lands
// here at #clips. Export all runs every clip's export in turn (videoMedia's export
// queue), each with that clip's own saved settings, and keeps going on other pages.
// Leo also sees each score's parts and a flag on any clip whose words trip a MAS rule.

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Download, Scissors } from "lucide-react";
import { ThinkingOrb } from "thinking-orbs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InfoTip } from "@/components/ui/info-tip";
import { useToast } from "@/hooks/use-toast";
import PriceChip from "@/components/PriceChip";
import { useUsesLeft } from "@/lib/aiUsage";
import { reasonText } from "@/lib/prices";
import { useLeoOnly } from "@/lib/useLeoOnly";
import { loadBrand } from "@/lib/carousel";
import { findClipsFor, findFailed, findRunning, foundFor, onClipFind, runClipAsk, seenClips, startFind, takeAskedLanding, type ClipLength } from "@/lib/clipAsk";
import { scanCompliance } from "@/lib/compliance";
import { loadEffects, paintEffects } from "@/lib/faceVision";
import { clipText } from "@/lib/youtubeClips";
import { fmtTime, sentencesOf, type EditSettings, type Word } from "@/lib/videoEdit";
import { exportAll, exportJob, exportQueue, getFile, loadBrandArt, onExportJob, startExport, stopExportQueue, type BrandArt, type Frame } from "@/lib/videoMedia";
import { fileKey, loadProjects, type VideoProject } from "@/lib/videoProjects";
import { clipPasses } from "../../supabase/functions/video-assist/passes.ts";

export type { FoundClip } from "@/lib/clipAsk";

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

/** The clips' projects are saved by the find itself (clipAsk.ts); the page re-reads them on onClipFind. */
export default function ClipFinder({ userId, project, words, settings, duration, onOpen }: {
  userId: string;
  project: VideoProject;
  words: Word[];
  settings: EditSettings;
  duration: number;
  onOpen: (id: string) => void;
}) {
  const { toast } = useToast();
  const leo = useLeoOnly();
  const navigate = useNavigate();
  const [list, setList] = useState(() => foundFor(project.id));
  const [busy, setBusy] = useState(() => !!findRunning(project.id));
  const [fail, setFail] = useState(() => findFailed(project.id));
  const [about, setAbout] = useState("");
  const left = useUsesLeft(busy);
  const usesLeft = left("video-clips");
  // a long recording is read in passes, each one use
  const passes = clipPasses(duration);
  const short = usesLeft !== null && usesLeft < passes;
  const why = reasonText({ left: usesLeft, uses: passes, leo });
  // the find runs outside React (clipAsk.ts): re-read it as it changes; one the clips panel asked for lands at #clips
  useEffect(() => {
    const read = () => {
      setList(foundFor(project.id));
      setBusy(!!findRunning(project.id));
      setFail(findFailed(project.id));
      if (takeAskedLanding(project.id)) {
        seenClips();
        navigate({ search: window.location.search, hash: "clips" }, { replace: true });
      }
    };
    read();
    return onClipFind(read);
  }, [project.id, navigate]);
  // the clips panel's ask for a recording whose words came another way (Caption it again) starts its find now
  const heard = words.length > 0;
  useEffect(() => {
    if (heard) runClipAsk(project.id, words);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id, heard]);
  // Leo's MAS flags: each clip's own words through the compliance rules, which warn and never block here
  const sentences = useMemo(() => (leo ? sentencesOf(words) : []), [leo, words]);
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

  // Leo sees a failure on the list with its retry; everyone else gets today's toast
  const find = (topic = about, length: ClipLength = "auto") => {
    seenClips();
    void startFind(project.id, () => findClipsFor(userId, project, words, settings, topic, length), { about: topic, length }).catch((e) => {
      if (!leo) toast({ title: "Couldn't find clips", description: (e as Error).message, variant: "destructive" });
    });
  };

  if (duration < 45 || !words.length) return null;
  const scored = list.some((f) => typeof f.clip.score === "number");
  // a clip was asked for and Jev found none about it
  const offTopic = list.some((f) => f.clip.onTopic === false) && !list.some((f) => f.clip.onTopic);
  return (
    <section id="clips" aria-label="Clips" className="scroll-mt-4 space-y-2">
      <form className="flex flex-col gap-2 sm:flex-row sm:items-center" onSubmit={(e) => { e.preventDefault(); if (!busy && !short) find(); }}>
        <Input value={about} onChange={(e) => setAbout(e.target.value)} maxLength={200} disabled={busy}
          placeholder="What should the clip be about? (optional)" aria-label="What should the clip be about?" className="h-11 sm:h-9 sm:max-w-sm" />
        <Button type="submit" variant="outline" size="sm" disabled={busy || short} className={`h-11 shrink-0 gap-1.5 sm:h-9 ${busy ? "disabled:opacity-100" : ""}`}>
          {busy ? <ThinkingOrb state="working" size={20} theme="light" aria-hidden /> : <Scissors className="h-3.5 w-3.5" />}
          {busy ? "Finding clips..." : <>Find clips<PriceChip feature="video-clips" opts={{ passes }} uses={passes} left={usesLeft}
            fallback={usesLeft !== null && <span className={`font-normal ${short ? "text-destructive" : "opacity-80"}`}>{usesLeft === 0 ? "none left today" : passes > 1 ? `${passes} uses, ${usesLeft} left` : `${usesLeft} left`}</span>} /></>}
        </Button>
      </form>
      {why && <p className="text-xs text-destructive">{why}</p>}
      {leo && fail && !busy && (
        <div role="alert" className="flex flex-wrap items-center gap-2 text-xs text-destructive">
          <span className="mr-auto">{fail.error}</span>
          {fail.code === "422" && fail.length !== "auto" ? (
            <Button size="sm" variant="outline" className="h-11 sm:h-8" onClick={() => find(fail.about, "auto")}>Try again with Auto length</Button>
          ) : (
            <Button size="sm" variant="outline" className="h-11 sm:h-8" onClick={() => find(fail.about, fail.length)}>Try again</Button>
          )}
        </div>
      )}
      {list.length > 0 && (
        <div className="rounded-xl border border-success/40 bg-success/5 p-3">
          <p className="mb-2 flex items-center gap-1 text-sm font-semibold">
            {list.length === 1 ? "1 clip ready" : `${list.length} clips ready${scored ? ", best first" : ", each with its own hook"}`}
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
                  {leo && clip.parts && (
                    <p className="text-[11px] tabular-nums text-muted-foreground">
                      {[`Stands alone ${clip.parts.alone}`, `Opening ${clip.parts.opening}`, ...(typeof clip.parts.topic === "number" ? [`On topic ${clip.parts.topic}`] : [])].join(" | ")}
                    </p>
                  )}
                  {clip.reason && <p className="text-xs text-muted-foreground">{clip.reason}</p>}
                  {leo && <ClipFlags text={clipText(sentences, clip)} />}
                  <p className="font-mono text-[11px] text-muted-foreground">
                    {fmtTime(c.settings.trimStart)}-{fmtTime(duration - c.settings.trimEnd)}
                    {clip.skip && <span className="font-sans">, skips {Math.round(clip.skip.end - clip.skip.start)} s in the middle</span>}
                    {ours && queue.files[c.id] && (
                      <a href={queue.files[c.id].url} download={`${c.name.replace(/[^\w-]+/g, "-").slice(0, 60)}.${queue.files[c.id].ext}`} className="ml-1 inline-flex min-h-11 items-center px-1 font-sans font-medium text-primary underline-offset-2 hover:underline sm:min-h-0 [@media(pointer:coarse)]:min-h-11">Download</a>
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

/** A warn chip per compliance rule a clip's words trip, with the rule's own message; they never block an export. */
function ClipFlags({ text }: { text: string }) {
  const flags = scanCompliance(text);
  if (!flags.length) return null;
  return (
    <p className="flex flex-wrap gap-1.5 pt-0.5">
      {flags.map((f) => (
        <span key={f.id} className="inline-flex items-center gap-1 rounded-md border border-amber-500/50 bg-amber-500/10 px-1.5 py-0.5 text-[11px] font-medium text-amber-900 dark:text-amber-200">
          Check "{f.match}"
          <InfoTip label={`About "${f.match}"`}>{f.message}</InfoTip>
        </span>
      ))}
    </p>
  );
}
