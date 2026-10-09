// Under Post caption: the same post written for TikTok, LinkedIn and Facebook,
// each with its own length and hashtag limit, editable, with its counters.

import { useEffect, useState } from "react";
import { Wand2 } from "lucide-react";
import { ThinkingOrb } from "thinking-orbs";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useUsesLeft } from "@/lib/aiUsage";
import { scanCompliance } from "@/lib/compliance";
import { checkLimits, countHashtags, readout } from "@/lib/platformCounters";
import { CAPTION_PLATFORMS, loadPlatformCaptions, savePlatformCaptions, writePlatformCaptions, type CaptionPlatform, type PlatformCaptionSet } from "@/lib/platformCaptions";

const NAME: Record<CaptionPlatform, string> = { tiktok: "TikTok", linkedin: "LinkedIn", facebook: "Facebook" };

export default function PlatformCaptions({ projectId, transcript, instagram, title }: { projectId: string; transcript: string; instagram: string; title: string }) {
  const { toast } = useToast();
  const [set, setSet] = useState<PlatformCaptionSet>(() => loadPlatformCaptions(projectId));
  const [tab, setTab] = useState<CaptionPlatform>("tiktok");
  const [busy, setBusy] = useState(false);
  const left = useUsesLeft(busy)("video-captions");
  useEffect(() => setSet(loadPlatformCaptions(projectId)), [projectId]);
  const keep = (next: PlatformCaptionSet) => {
    setSet(next);
    savePlatformCaptions(projectId, next);
  };
  const has = CAPTION_PLATFORMS.some((p) => set[p]);

  const write = async () => {
    if (!transcript.trim()) return toast({ title: "Caption the video first", variant: "destructive" });
    setBusy(true);
    try {
      keep({ ...set, ...(await writePlatformCaptions(transcript.slice(0, 6000), instagram, title)) });
    } catch (e) {
      toast({ title: "The captions didn't come through", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const text = set[tab] ?? "";
  // TikTok's sweet spot is the words before the hashtags
  const count = readout(tab === "tiktok" ? text.replace(/#[\p{L}\p{N}_]+/gu, "").trim() : text, tab);
  const limits = checkLimits(text, tab);
  const flags = scanCompliance(text);

  return (
    <div className="space-y-2 border-t border-border/60 pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="mr-auto text-sm font-semibold">Other platforms</p>
        <span className="flex items-center gap-2">
          {left !== null && <span className={`text-[11px] ${left ? "text-muted-foreground" : "font-medium text-destructive"}`}>{left ? `${left} left today` : "None left today"}</span>}
          <Button size="sm" variant="outline" onClick={() => void write()} disabled={busy || !transcript.trim() || left === 0} className={`h-11 gap-1.5 sm:h-9 ${busy ? "disabled:opacity-100" : ""}`}>
            {busy ? <ThinkingOrb state="composing" size={20} theme="light" aria-hidden /> : <Wand2 className="h-3.5 w-3.5" />}
            {busy ? "Writing..." : has ? "Write them again" : "Write for TikTok, LinkedIn and Facebook"}
          </Button>
        </span>
      </div>
      {has && (
        <>
          <div className="flex flex-wrap gap-1" role="tablist" aria-label="Platform">
            {CAPTION_PLATFORMS.map((p) => (
              <button key={p} type="button" role="tab" aria-selected={tab === p} onClick={() => setTab(p)}
                className={`min-h-11 rounded-md px-3 text-xs font-semibold sm:min-h-8 ${tab === p ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}>{NAME[p]}</button>
            ))}
          </div>
          <Textarea rows={tab === "tiktok" ? 3 : 7} value={text} onChange={(e) => keep({ ...set, [tab]: e.target.value })} aria-label={`${NAME[tab]} caption`} className="text-sm" />
          <p className={`text-[11px] ${count.status === "good" ? "text-muted-foreground" : "text-foreground"}`}>
            {limits.chars.toLocaleString("en-US")} of {limits.maxChars.toLocaleString("en-US")} characters, {countHashtags(text)} {countHashtags(text) === 1 ? "hashtag" : "hashtags"}. {count.message}
          </p>
          {[...limits.warnings, ...flags.map((f) => ({ level: f.severity === "error" ? "over" : "warn", message: `"${f.match}" ${f.message}` }))].map((w, i) => (
            <p key={i} className={`rounded-md border px-2 py-1 text-[11px] ${w.level === "over" ? "border-destructive/40 bg-destructive/10 text-destructive" : "border-warning/40 bg-warning/10"}`}>{w.message}</p>
          ))}
          <Button size="sm" variant="ghost" className="h-11 sm:h-8" disabled={!text.trim()}
            onClick={() => void navigator.clipboard.writeText(text).then(() => toast({ title: `${NAME[tab]} caption copied` }))}>Copy</Button>
        </>
      )}
    </div>
  );
}
