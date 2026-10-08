// Use a subtitle file (.srt or .vtt) as a video's captions: no transcription,
// so it takes none of the day's captioning uses (src/lib/subtitleImport.ts).

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { MAX_SUBTITLE_BYTES, subtitleWords } from "@/lib/subtitleImport";
import { applyFixes, type Word } from "@/lib/videoEdit";
import { loadFixes } from "@/lib/videoProjects";

export default function SubtitleImport({ userId, duration, onWords }: { userId: string; duration: number; onWords: (words: Word[]) => void }) {
  const { toast } = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const use = async (f: File) => {
    setError("");
    if (f.size > MAX_SUBTITLE_BYTES) return setError("That file is too big to be subtitles.");
    const words = subtitleWords(await f.text().catch(() => ""), duration);
    if (!words.length) return setError("No timed lines in that file. Pick an .srt or .vtt file.");
    onWords(applyFixes(words, loadFixes(userId)).words);
    toast({ title: `Captions from ${f.name}`, description: `${words.length.toLocaleString("en-US")} words` });
  };
  return (
    <>
      <Button size="sm" variant="ghost" className="h-11 sm:h-9" onClick={() => input.current?.click()}>Use a subtitle file (.srt, .vtt)</Button>
      <input ref={input} type="file" accept=".srt,.vtt,text/vtt,application/x-subrip" className="sr-only" tabIndex={-1} aria-hidden
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void use(f); }} />
      {error && <p className="basis-full text-xs text-destructive">{error}</p>}
    </>
  );
}
