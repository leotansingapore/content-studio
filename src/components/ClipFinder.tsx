// Find clips in the video editor: one long video -> standalone reels, each its
// own project on the same file. The LLM proposes candidates and Jev scores each
// out of 100 (video-assist "clips"); the best come first. The list is kept per
// video for this session, so it is still there after opening a clip and coming back.

import { useState } from "react";
import { Scissors } from "lucide-react";
import { ThinkingOrb } from "thinking-orbs";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";
import { useToast } from "@/hooks/use-toast";
import { useUsesLeft } from "@/lib/aiUsage";
import { clipSettings, fmtTime, sentencesOf, type Clip, type EditSettings, type Word } from "@/lib/videoEdit";
import { fileKey, findClips, type VideoProject } from "@/lib/videoProjects";

export interface FoundClip {
  clip: Clip;
  project: VideoProject;
}

// ponytail: kept in memory for the session only; the clip projects themselves are saved like any project
const found = new Map<string, FoundClip[]>();

export default function ClipFinder({ project, words, settings, duration, onClips, onOpen }: {
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
  const left = useUsesLeft(busy);
  const usesLeft = left("video-clips");

  const find = async () => {
    setBusy(true);
    try {
      const clips = await findClips(sentencesOf(words), duration);
      const now = Date.now().toString(36);
      const made = clips.map((clip, i): FoundClip => ({
        clip,
        project: {
          ...project,
          id: `v${now}${i}`,
          name: `${project.name} - ${clip.title}`,
          fileId: fileKey(project),
          createdAt: new Date().toISOString(),
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
  return (
    <section aria-label="Clips" className="space-y-2">
      <Button variant="outline" size="sm" onClick={find} disabled={busy || usesLeft === 0} className={`h-11 gap-1.5 sm:h-9 ${busy ? "disabled:opacity-100" : ""}`}>
        {busy ? <ThinkingOrb state="working" size={20} theme="light" aria-hidden /> : <Scissors className="h-3.5 w-3.5" />}
        {busy ? "Finding clips..." : <>Find clips{usesLeft !== null && <span className={`font-normal ${usesLeft === 0 ? "text-destructive" : "opacity-80"}`}>{usesLeft === 0 ? "none left today" : `${usesLeft} left`}</span>}</>}
      </Button>
      {list.length > 0 && (
        <div className="rounded-xl border border-success/40 bg-success/5 p-3">
          <p className="mb-2 flex items-center gap-1 text-sm font-semibold">
            {list.length} clips ready{scored ? ", best first" : ", each with its own hook"}
            {scored && <InfoTip label="About the scores">Out of 100: how well it stands alone and how strongly it opens.</InfoTip>}
          </p>
          <ul className="space-y-1.5">
            {list.map(({ clip, project: c }) => (
              <li key={c.id} className="flex flex-wrap items-center gap-2 text-sm">
                {typeof clip.score === "number" && (
                  <span className="w-9 shrink-0 rounded-md bg-background px-1 py-0.5 text-center text-xs font-semibold tabular-nums" aria-label={`Score ${clip.score} out of 100`}>{clip.score}</span>
                )}
                <span className="font-mono text-[11px] text-muted-foreground">
                  {fmtTime(c.settings.trimStart)}-{fmtTime(duration - c.settings.trimEnd)}
                </span>
                <span className="min-w-0 flex-1 truncate">{clip.title}</span>
                <Button size="sm" variant="outline" className="h-11 text-xs sm:h-8" onClick={() => onOpen(c.id)}>Open</Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
