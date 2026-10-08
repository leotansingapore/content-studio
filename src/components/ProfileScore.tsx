// "Profile score" in the account audit: the consultant's own Instagram or
// TikTok profile out of 100 (writing-judge mode "profile"), each item with
// what lost points and the fix: a rewritten name or bio to copy, the best
// posts to pin, a link-in-bio page. The photo is listed but not scored.

import { useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Check, Copy, ExternalLink, IdCard, Minus } from "lucide-react";
import { ThinkingOrb } from "thinking-orbs";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";
import { useToast } from "@/hooks/use-toast";
import { scoreProfile, type ProfileItemId, type ProfileScore as Score } from "@/lib/writingJudge";
import { firstLine, type AuditPlatform, type RatedPost } from "@/lib/accountAudit";
import { DAILY_LIMITS } from "../../supabase/functions/_shared/usageCaps.ts";

const LABEL: Record<ProfileItemId, string> = { name: "Name field", bio: "Bio", pinned: "Pinned posts", contact: "Contact link" };

export default function ProfileScore({
  platform,
  name,
  bio,
  link,
  pinned,
  best,
}: {
  platform: AuditPlatform;
  name: string;
  bio: string;
  /** Null when the audit predates reading the profile link. */
  link: string | null;
  pinned: RatedPost[];
  /** Best posts first, for the pin suggestion and the rewrite. */
  best: RatedPost[];
}) {
  const { toast } = useToast();
  const [result, setResult] = useState<Score | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setRunning(true);
    setError(null);
    try {
      setResult(
        await scoreProfile({
          platform,
          name,
          bio,
          link,
          pinned: pinned.map((p) => p.caption.slice(0, 400)),
          top: best.slice(0, 3).map((p) => p.caption.slice(0, 300)),
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(false);
    }
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "Copied", description: "Paste it into your profile." });
    } catch {
      toast({ title: "Couldn't copy", description: "Select the text and copy it instead.", variant: "destructive" });
    }
  };

  const pinLinks = best.slice(0, 3).filter((p) => !p.pinned);
  const fix = (id: ProfileItemId, state: string) => {
    if (id === "name" || id === "bio") {
      const text = result?.rewrites[id];
      if (!text)
        return <p className="text-xs text-muted-foreground">{id === "name" ? "After your name, say who you help, like 'Jane | Plans for SG parents'." : "Say who you help, one proof point, and what to do next."}</p>;
      return (
        <div className="flex flex-wrap items-start gap-2 rounded-lg border border-border/60 bg-background p-2">
          <p className="min-w-0 flex-1 whitespace-pre-wrap break-words text-xs text-foreground">{text}</p>
          <Button size="sm" variant="outline" className="h-11 gap-1.5 sm:h-8" onClick={() => void copy(text)}>
            <Copy className="h-3.5 w-3.5" /> Copy
          </Button>
        </div>
      );
    }
    if (id === "pinned")
      return (
        <div className="space-y-1 text-xs text-muted-foreground">
          <p>{state === "none" ? "Pin your best posts so a new visitor sees them first." : "Pin a client story with a result, and a post on how to work with you."}</p>
          {pinLinks.length > 0 && (
            <ul className="space-y-1">
              {pinLinks.map((p) => (
                <li key={p.id}>
                  <a href={p.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 font-medium text-primary hover:underline sm:min-h-0">
                    <ExternalLink className="h-3 w-3 shrink-0" /> {firstLine(p.caption, 60) || "Open post"}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      );
    if (state === "unknown") return <p className="text-xs text-muted-foreground">Checked at the next refresh of this audit.</p>;
    return (
      <p className="text-xs text-muted-foreground">
        Add a link people can book or message you from.{" "}
        <Link to="/bio" className="inline-flex min-h-11 items-center font-semibold text-primary hover:underline sm:min-h-0">
          Make a link-in-bio page
        </Link>
      </p>
    );
  };

  return (
    <div className="space-y-2.5 rounded-xl border border-border/60 p-3.5" aria-live="polite">
      <div className="flex flex-wrap items-center gap-2">
        <IdCard className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">Profile score</h3>
        {result && (
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ${
              result.score >= 75 ? "bg-success/15 text-success" : result.score >= 50 ? "bg-primary/15 text-primary" : "bg-warning/15 text-warning"
            }`}
          >
            {result.score}/100
          </span>
        )}
        <InfoTip label="About the profile score">Name, bio and pinned posts are judged by Jev; the contact link is checked.</InfoTip>
      </div>
      {!result && (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" className={`h-11 gap-1.5 sm:h-9 ${running ? "disabled:opacity-100" : ""}`} onClick={() => void run()} disabled={running}>
            {running ? <ThinkingOrb state="working" size={20} theme="light" aria-hidden /> : <IdCard className="h-3.5 w-3.5" />}
            {running ? "Scoring..." : "Score my profile"}
          </Button>
          <span className="text-[11px] text-muted-foreground">Uses 1 of your {DAILY_LIMITS["profile-score"]} a day.</span>
          {error && (
            <p role="alert" className="basis-full text-xs text-destructive">
              {error}
            </p>
          )}
        </div>
      )}
      {result && (
        <ul className="space-y-2.5">
          {result.items.map((i) => (
            <li key={i.id} className="space-y-1">
              <p className="flex items-center gap-1.5 text-xs">
                {i.state === "full" ? (
                  <Check className="h-3.5 w-3.5 shrink-0 text-success" aria-hidden />
                ) : i.state === "unknown" ? (
                  <Minus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                ) : (
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-warning" aria-hidden />
                )}
                <span className="font-semibold">{LABEL[i.id]}</span>
                <span className="tabular-nums text-muted-foreground">{i.state === "unknown" ? "not checked" : `${i.earned}/${i.points}`}</span>
              </p>
              {i.state !== "full" && <div className="pl-5">{fix(i.id, i.state)}</div>}
            </li>
          ))}
          <li className="flex items-start gap-1.5 text-xs">
            <Minus className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <span>
              <span className="font-semibold">Photo</span> <span className="text-muted-foreground">not scored: check your face fills most of the frame, eyes visible, taken in the last two years.</span>
            </span>
          </li>
        </ul>
      )}
    </div>
  );
}
