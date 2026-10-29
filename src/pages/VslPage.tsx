// /generate/vsl: a video sales letter script, version A and B, from the owner's answers to the hormozi-vsl skill's
// intake (generate-social-content vsl mode). The writer edits their words into spoken lines and marks every gap as a
// [Need: ...] line instead of inventing proof. Copy out only: nothing is saved to My posts. Every answer lives in the URL.
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Check, Clapperboard, Copy } from "lucide-react";
import { ThinkingOrb } from "thinking-orbs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { VSL_COUNT, streamVsl } from "@/lib/batchGenerate";
import { stripDashes } from "@/lib/plainText";
import { professionFor } from "@/lib/profession";
import { supabase } from "@/lib/supabase";
import { withParam } from "@/lib/urlState";
import { useLeoOnly } from "@/lib/useLeoOnly";
import { isVoiceProfileUsable, loadVoiceProfile, voiceSummaryOf } from "@/lib/voiceProfile";
import { VSL_QUESTIONS, vslBrief, type VslKey } from "../../supabase/functions/generate-social-content/logic.ts";

type Version = { status: "writing" | "done" | "error"; text: string; error?: string };

const VERSIONS = ["Version A: opens on the promise", "Version B: opens on proof"];
const isHeading = (line: string) => line.length <= 40 && !line.startsWith("[") && /[A-Z]/.test(line) && !/[a-z]/.test(line);
const isNeed = (line: string) => /^\[need:/i.test(line);

/** Spoken words (headings and [Need: ...] lines left out), minutes at a calm 2.5 words a second, and the gaps to fill. */
export function scriptStats(text: string): { words: number; minutes: number; needs: number } {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const words = lines.filter((l) => !isHeading(l) && !isNeed(l)).join(" ").split(/\s+/).filter(Boolean).length;
  return { words, minutes: Math.max(1, Math.round(words / 150)), needs: lines.filter(isNeed).length };
}

export default function VslPage() {
  const { toast } = useToast();
  const leo = useLeoOnly();
  const [params, setParams] = useSearchParams();
  const answers = Object.fromEntries(VSL_QUESTIONS.map((q) => [q.key, params.get(q.key) ?? ""])) as Record<VslKey, string>;
  const setAnswer = (key: VslKey, value: string) => setParams((prev) => withParam(prev, key, value, ""), { replace: true });
  const [versions, setVersions] = useState<Version[]>([]);
  const [copied, setCopied] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const writing = versions.some((v) => v.status === "writing");
  const ready = !!answers.offer.trim();

  useEffect(() => () => abortRef.current?.abort(), []);

  const write = async () => {
    if (!ready || writing) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setVersions(Array.from({ length: VSL_COUNT }, () => ({ status: "writing", text: "" })));
    setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    const { data } = await supabase.auth.getUser();
    const uid = data.user?.id ?? null;
    const voice = loadVoiceProfile(uid);
    const voiceSummary = isVoiceProfileUsable(voice) ? voice?.voiceSummary : leo ? voiceSummaryOf(voice) || undefined : undefined;
    const profession = professionFor(uid);
    const set = (i: number, v: Partial<Version>) => setVersions((prev) => prev.map((x, j) => (j === i ? { ...x, ...v } : x)));
    await streamVsl(
      { ideaContext: vslBrief(answers), ...(voiceSummary ? { voiceSummary } : {}), ...(profession ? { profession } : {}) },
      {
        onToken: (i, text) => set(i, { text }),
        onComplete: (i, text) => set(i, { status: "done", text: stripDashes(text) }),
        onError: (i, message) =>
          i === null ? setVersions((prev) => prev.map((x) => (x.status === "writing" ? { ...x, status: "error", error: message } : x))) : set(i, { status: "error", error: message }),
      },
      ctrl.signal,
    );
    // a version the stream ended without finishing is an error, never a spinner left turning
    setVersions((prev) => prev.map((x) => (x.status === "writing" ? { ...x, status: "error", error: "This one stopped before it finished." } : x)));
  };

  const copy = async (i: number, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(i);
      toast({ title: "Copied" });
    } catch {
      toast({ title: "Couldn't copy", description: "Select the text and copy it by hand.", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="flex items-center gap-2 font-serif text-2xl font-semibold leading-tight tracking-tight text-foreground sm:text-3xl">
          <Clapperboard className="h-6 w-6 text-primary" /> Write a VSL
        </h1>
      </header>

      <Card className="border-border/60 shadow-card">
        <CardContent className="space-y-4 py-5">
          {VSL_QUESTIONS.map((q, i) => (
            <div key={q.key} className="space-y-1.5">
              <Label htmlFor={`vsl-${q.key}`}>
                {q.label} {i > 0 && <span className="text-xs font-normal text-muted-foreground">(optional)</span>}
              </Label>
              <Textarea
                id={`vsl-${q.key}`}
                value={answers[q.key]}
                onChange={(e) => setAnswer(q.key, e.target.value)}
                placeholder={q.placeholder}
                rows={i === 0 ? 2 : 3}
                autoResize
              />
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <Button onClick={() => void write()} disabled={!ready || writing} className="min-h-11 gap-1.5">
              <Clapperboard className="h-4 w-4" /> {writing ? "Writing..." : `Write ${VSL_COUNT} versions`}
            </Button>
            <span className="text-xs text-muted-foreground">Leave any blank and the script marks what it still needs.</span>
          </div>
        </CardContent>
      </Card>

      {versions.length > 0 && (
        <div ref={resultsRef} className="grid gap-4 lg:grid-cols-2">
          {versions.map((v, i) => {
            const stats = v.status === "done" ? scriptStats(v.text) : null;
            return (
              <Card key={i} className="border-border/60 shadow-card">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="font-serif text-base">{VERSIONS[i]}</CardTitle>
                  {v.status === "writing" && <ThinkingOrb state="composing" size={20} theme="light" aria-label={`Writing version ${i + 1}`} />}
                </CardHeader>
                <CardContent className="space-y-3">
                  {v.status === "error" ? (
                    <div className="space-y-2">
                      <p className="text-sm text-destructive">{v.error}</p>
                      <Button size="sm" variant="outline" className="min-h-11 sm:min-h-9" disabled={writing} onClick={() => void write()}>
                        Try again
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-0.5 text-[13px] leading-relaxed text-foreground/85">
                      {(v.text || "...").split("\n").map((raw, j) => {
                        const line = raw.trim();
                        if (!line) return <div key={j} className="h-2" />;
                        if (isHeading(line)) return <p key={j} className="pt-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{line}</p>;
                        if (isNeed(line)) return <p key={j} className="text-amber-800 dark:text-amber-300">{line}</p>;
                        return <p key={j}>{line}</p>;
                      })}
                    </div>
                  )}
                  {stats && (
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                      <Button size="sm" className="min-h-11 gap-1.5 sm:min-h-9" onClick={() => void copy(i, v.text)}>
                        {copied === i ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} Copy script
                      </Button>
                      <span className="text-xs text-muted-foreground">
                        About {stats.minutes} min spoken{stats.needs > 0 && `, ${stats.needs} ${stats.needs === 1 ? "gap" : "gaps"} to fill`}
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
