import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { MAX_TAKES, fmtTime, joinIssue, joinedLength, moveTake, trimTake, type Take } from "@/lib/videoEdit";
import { loadVideo, startJoin } from "@/lib/videoMedia";

type Item = Take & { id: string; file: File; url: string; name: string };
const MAX_BYTES = 500 * 1024 * 1024;

/** Edit a video's start screen: several takes, each trimmed, in order, joined into one video. */
export default function JoinTakes({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const [items, setItems] = useState<Item[]>([]);
  const players = useRef(new Map<string, HTMLVideoElement>());
  const urls = useRef<string[]>([]);
  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  const add = async (files: File[]) => {
    const room = MAX_TAKES - items.length;
    if (files.length > room) toast({ title: `Up to ${MAX_TAKES} takes`, variant: "destructive" });
    const added: Item[] = [];
    for (const f of files.slice(0, Math.max(0, room))) {
      if (!f.type.startsWith("video/") || f.size > MAX_BYTES) {
        toast({ title: `${f.name} can't be added`, description: "Pick a video file under 500 MB.", variant: "destructive" });
        continue;
      }
      try {
        const v = await loadVideo(f);
        urls.current.push(v.src);
        const duration = Number.isFinite(v.duration) ? v.duration : 0;
        if (duration < 1) throw new Error("too short");
        added.push({ id: `${Date.now().toString(36)}${added.length}`, file: f, url: v.src, name: f.name.replace(/\.[^.]+$/, ""), duration, start: 0, end: duration });
      } catch {
        toast({ title: `Couldn't open ${f.name}`, description: "Try an MP4 or MOV.", variant: "destructive" });
      }
    }
    setItems((list) => [...list, ...added]);
  };
  const edit = (i: number, edge: "start" | "end") => {
    const at = players.current.get(items[i].id)?.currentTime ?? 0;
    setItems((list) => list.map((t, j) => (j === i ? trimTake(t, edge, at) : t)));
  };
  const join = async () => {
    const name = items.length > 1 ? `${items[0].name} + ${items.length - 1} more` : items[0].name;
    players.current.forEach((p) => p.pause());
    onClose();
    await startJoin(name, items.map((t) => ({ file: t.file, start: t.start, end: t.end }))).catch((e) =>
      toast({ title: "Couldn't join the takes", description: (e as Error).message, variant: "destructive" }));
  };

  const issue = joinIssue(items);
  return (
    <section className="space-y-3 rounded-2xl border border-border/70 p-4" aria-label="Join takes">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Join takes into one video</h2>
        <Button size="sm" variant="ghost" className="h-11 sm:h-9" onClick={onClose}>Cancel</Button>
      </div>
      {items.length > 0 && (
        <ol className="space-y-2">
          {items.map((t, i) => (
            <li key={t.id} className="flex flex-col gap-2 rounded-xl border border-border/60 p-2 sm:flex-row">
              <video src={t.url} controls playsInline preload="metadata" aria-label={`Take ${i + 1}, ${t.name}`}
                ref={(el) => { if (el) players.current.set(t.id, el); else players.current.delete(t.id); }}
                className="h-56 w-full rounded-lg bg-black object-contain sm:h-40 sm:w-28" />
              <div className="min-w-0 flex-1 space-y-2">
                <p className="truncate text-sm font-medium">{i + 1}. {t.name}</p>
                <p className="text-xs text-muted-foreground">Keeps {fmtTime(t.start)} to {fmtTime(t.end)} of {fmtTime(t.duration)}</p>
                <div className="flex flex-wrap gap-1.5">
                  <Button size="sm" variant="outline" className="h-11 text-xs sm:h-8" onClick={() => edit(i, "start")}>Start here</Button>
                  <Button size="sm" variant="outline" className="h-11 text-xs sm:h-8" onClick={() => edit(i, "end")}>End here</Button>
                  <Button size="sm" variant="ghost" className="h-11 w-11 p-0 sm:h-8 sm:w-8" aria-label={`Move take ${i + 1} up`} disabled={i === 0}
                    onClick={() => setItems((list) => moveTake(list, i, -1))}><ChevronUp className="h-4 w-4" /></Button>
                  <Button size="sm" variant="ghost" className="h-11 w-11 p-0 sm:h-8 sm:w-8" aria-label={`Move take ${i + 1} down`} disabled={i === items.length - 1}
                    onClick={() => setItems((list) => moveTake(list, i, 1))}><ChevronDown className="h-4 w-4" /></Button>
                  <Button size="sm" variant="ghost" className="h-11 w-11 p-0 text-muted-foreground hover:text-destructive sm:h-8 sm:w-8" aria-label={`Remove take ${i + 1}`}
                    onClick={() => setItems((list) => list.filter((x) => x.id !== t.id))}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {items.length < MAX_TAKES && (
          <label className="inline-flex h-11 cursor-pointer items-center gap-1.5 rounded-md border border-border/70 bg-background px-3 text-sm font-semibold hover:border-primary/40 sm:h-9">
            <Plus className="h-4 w-4" /> {items.length ? "Add more takes" : "Pick your takes"}
            <input type="file" accept="video/*" multiple className="sr-only"
              onChange={(e) => { const fs = [...(e.target.files ?? [])]; e.target.value = ""; if (fs.length) void add(fs); }} />
          </label>
        )}
        {items.length >= 2 && (
          <Button className="h-11 sm:h-9" onClick={() => void join()} disabled={!!issue}>
            Join {items.length} takes, {fmtTime(joinedLength(items)).replace(/\.0$/, "")}
          </Button>
        )}
      </div>
      {items.length >= 2 && issue && <p className="text-xs text-destructive" role="status">{issue}</p>}
      {items.length >= 2 && !issue && <p className="text-xs text-muted-foreground">Joined in real time on this device, then captioned like an upload.</p>}
    </section>
  );
}
