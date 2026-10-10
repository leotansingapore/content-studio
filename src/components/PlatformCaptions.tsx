// Under Post caption: the same post written for TikTok, LinkedIn, Facebook,
// YouTube (title and description), X (one post or a thread) and Threads, each
// with its own length and hashtag limit, editable, with its counters. When the
// video asks viewers to comment or DM a word, its first line waits here for
// the consultant to check the spelling and add it, or skip it.

import { useEffect, useState } from "react";
import { Copy, Wand2 } from "lucide-react";
import { ThinkingOrb } from "thinking-orbs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useUsesLeft } from "@/lib/aiUsage";
import { scanCompliance } from "@/lib/compliance";
import { checkLimits, countHashtags, readout, strayLinks } from "@/lib/platformCounters";
import { allowedLinks, applyBrandRules, brandRulesLine } from "@/lib/brandRules";
import type { CarouselBrand } from "@/lib/carousel";
import {
  CAPTION_PLATFORMS,
  PLATFORM_RULES,
  YOUTUBE_TITLE_MAX,
  loadPlatformCaptions,
  savePlatformCaptions,
  writePlatformCaptions,
  xParts,
  type CaptionPlatform,
  type PlatformCaptionSet,
} from "@/lib/platformCaptions";

const NAME: Record<CaptionPlatform, string> = { tiktok: "TikTok", linkedin: "LinkedIn", facebook: "Facebook", youtube: "YouTube", x: "X", threads: "Threads" };
const n = (v: number) => v.toLocaleString("en-US");

export default function PlatformCaptions({
  projectId,
  transcript,
  instagram,
  title,
  brand,
  onInstagram,
}: {
  projectId: string;
  transcript: string;
  instagram: string;
  title: string;
  brand?: CarouselBrand | null;
  /** The Instagram caption with the keyword line added. */
  onInstagram?: (caption: string) => void;
}) {
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
      const written = await writePlatformCaptions(transcript.slice(0, 6000), instagram, title, brandRulesLine(brand));
      for (const p of [...CAPTION_PLATFORMS, "youtubeTitle"] as const) if (written[p]) written[p] = applyBrandRules(written[p]!, brand);
      keep({ ...set, ...written, firstLine: written.firstLine });
    } catch (e) {
      toast({ title: "The captions didn't come through", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const copy = (text: string, what: string) =>
    navigator.clipboard.writeText(text).then(
      () => toast({ title: `${what} copied` }),
      () => toast({ title: "Copy failed", variant: "destructive" }),
    );

  // the keyword's ask goes first on Instagram, TikTok and Facebook, once the consultant has checked it
  const addFirstLine = () => {
    const line = (set.firstLine ?? "").trim();
    const lead = (t?: string) => (t?.trim() && !t.startsWith(line) ? `${line}\n\n${t}` : t);
    keep({ ...set, tiktok: lead(set.tiktok), facebook: lead(set.facebook), firstLine: undefined });
    if (instagram.trim() && onInstagram) onInstagram(lead(instagram)!);
    toast({ title: "Keyword line added" });
  };

  const text = set[tab] ?? "";
  const allowed = allowedLinks(brand);
  const known = tab === "tiktok" || tab === "linkedin" || tab === "facebook" ? tab : null;
  const parts = tab === "x" ? xParts(text) : [text];
  const max = PLATFORM_RULES[tab].maxChars;
  // TikTok's sweet spot is the words before the hashtags
  const count = known ? readout(known === "tiktok" ? text.replace(/#[\p{L}\p{N}_]+/gu, "").trim() : text, known) : null;
  const warnings = [
    ...(known
      ? checkLimits(text, known, allowed).warnings
      : [
          ...parts.flatMap((p, i) =>
            p.length > max ? [{ level: "over", message: `${parts.length > 1 ? `Post ${i + 1} is over` : "Over"} ${NAME[tab]}'s ${n(max)} character limit by ${n(p.length - max)}. Trim before posting.` }] : [],
          ),
          ...(allowed.length ? strayLinks(text, allowed).map((l) => ({ level: "warn", message: `Not one of your offer links: ${l}` })) : []),
        ]),
    ...scanCompliance(text).map((f) => ({ level: f.severity === "error" ? "over" : "warn", message: `"${f.match}" ${f.message}` })),
  ];
  const tags = countHashtags(text);
  const chars = parts.length > 1 ? `${parts.length} posts, the longest ${n(Math.max(...parts.map((p) => p.length)))} of ${n(max)} characters` : `${n(text.length)} of ${n(max)} characters`;

  return (
    <div className="space-y-2 border-t border-border/60 pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="mr-auto text-sm font-semibold">Other platforms</p>
        <span className="flex items-center gap-2">
          {left !== null && <span className={`text-[11px] ${left ? "text-muted-foreground" : "font-medium text-destructive"}`}>{left ? `${left} left today` : "None left today"}</span>}
          <Button size="sm" variant="outline" onClick={() => void write()} disabled={busy || !transcript.trim() || left === 0} className={`h-11 gap-1.5 sm:h-9 ${busy ? "disabled:opacity-100" : ""}`}>
            {busy ? <ThinkingOrb state="composing" size={20} theme="light" aria-hidden /> : <Wand2 className="h-3.5 w-3.5" />}
            {busy ? "Writing..." : has ? "Write them again" : "Write for each platform"}
          </Button>
        </span>
      </div>
      {set.firstLine !== undefined && (
        <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-2.5" data-testid="keyword-line">
          <Label htmlFor={`first-line-${projectId}`} className="text-xs font-semibold">
            Check the keyword, then add it first on Instagram, TikTok and Facebook
          </Label>
          <Input id={`first-line-${projectId}`} value={set.firstLine} maxLength={200} onChange={(e) => keep({ ...set, firstLine: e.target.value })} className="h-11 text-sm sm:h-9" />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" className="h-11 sm:h-8" disabled={!set.firstLine.trim()} onClick={addFirstLine}>
              Add as first line
            </Button>
            <Button size="sm" variant="ghost" className="h-11 sm:h-8" onClick={() => keep({ ...set, firstLine: undefined })}>
              Skip
            </Button>
          </div>
        </div>
      )}
      {has && (
        <>
          <div className="flex flex-wrap gap-1" role="tablist" aria-label="Platform">
            {CAPTION_PLATFORMS.map((p) => (
              <button key={p} type="button" role="tab" aria-selected={tab === p} onClick={() => setTab(p)}
                className={`min-h-11 min-w-11 rounded-md px-3 text-xs font-semibold sm:min-h-8 sm:min-w-0 ${tab === p ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}>{NAME[p]}</button>
            ))}
          </div>
          {tab === "youtube" && (
            <div className="space-y-1">
              <Input value={set.youtubeTitle ?? ""} maxLength={YOUTUBE_TITLE_MAX} placeholder="Title" aria-label="YouTube title" onChange={(e) => keep({ ...set, youtubeTitle: e.target.value })} className="h-11 text-sm sm:h-9" />
              <p className="text-[11px] text-muted-foreground">Title: {(set.youtubeTitle ?? "").length} of {YOUTUBE_TITLE_MAX} characters.</p>
            </div>
          )}
          <Textarea rows={tab === "tiktok" || tab === "x" ? 4 : 7} value={text} onChange={(e) => keep({ ...set, [tab]: e.target.value })} aria-label={`${NAME[tab]} ${tab === "youtube" ? "description" : "caption"}`} className="text-sm" />
          <p className={`text-[11px] ${!count || count.status === "good" ? "text-muted-foreground" : "text-foreground"}`}>
            {chars}, {tags} {tags === 1 ? "hashtag" : "hashtags"}.{count ? ` ${count.message}` : ""}
          </p>
          {warnings.map((w, i) => (
            <p key={i} className={`break-words rounded-md border px-2 py-1 text-[11px] ${w.level === "over" ? "border-destructive/40 bg-destructive/10 text-destructive" : "border-warning/40 bg-warning/10"}`}>{w.message}</p>
          ))}
          <div className="flex flex-wrap gap-1">
            {tab === "youtube" && (
              <Button size="sm" variant="ghost" className="h-11 sm:h-8" disabled={!set.youtubeTitle?.trim()} onClick={() => void copy(set.youtubeTitle!, "YouTube title")}>
                <Copy className="mr-1.5 h-3.5 w-3.5" /> Copy title
              </Button>
            )}
            {parts.length > 1 ? (
              parts.map((p, i) => (
                <Button key={i} size="sm" variant="ghost" className="h-11 sm:h-8" onClick={() => void copy(p, `Post ${i + 1}`)}>
                  <Copy className="mr-1.5 h-3.5 w-3.5" /> Copy {i + 1}/{parts.length}
                </Button>
              ))
            ) : (
              <Button size="sm" variant="ghost" className="h-11 sm:h-8" disabled={!text.trim()} onClick={() => void copy(text, `${NAME[tab]} ${tab === "youtube" ? "description" : "caption"}`)}>
                <Copy className="mr-1.5 h-3.5 w-3.5" /> {tab === "youtube" ? "Copy description" : "Copy"}
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
