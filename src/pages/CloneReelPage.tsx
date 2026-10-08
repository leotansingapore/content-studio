import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  Bookmark,
  Camera,
  Check,
  Clapperboard,
  Clock,
  Columns3,
  Copy,
  ExternalLink,
  Eye,
  Heart,
  Info,
  Instagram,
  Loader2,
  MessageCircle,
  Pencil,
  Play,
  RotateCcw,
  Share2,
  ShieldCheck,
  Sparkles,
  Video,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { formatCount, shortDate, timeAgo } from "@/lib/accountAudit";
import { scanCompliance, type ComplianceFlag } from "@/lib/compliance";
import {
  CLONE_STEPS,
  DAILY_LIMITS,
  ReelCloneError,
  canReadVideo,
  cloneIdOf,
  cloneReel,
  cloneStepAt,
  conceptRun,
  currentVisualsJob,
  loadSavedClones,
  onVisualsJob,
  parseReelUrl,
  rememberClone,
  saveCloneDraft,
  shotListText,
  startConceptBuild,
  startVisualsJob,
  visualsFor,
  voiceForClone,
  winnersFor,
  withConcept,
  withHook,
  type Breakdown,
  type CloneSource,
  type Concept,
  type ReelCloneErrorCode,
  type ReelPlatform,
  type SavedClone,
  type VisualsJob,
} from "@/lib/reelClone";
import { HOOK_FORMULAS, hookFormula, hookFormulaSet } from "@/lib/hookFormulas";
import { supabase } from "@/lib/supabase";
import { isVoiceProfileUsable, loadVoiceProfile } from "@/lib/voiceProfile";

type View =
  | { kind: "idle" }
  | { kind: "loading"; url: string; startedAt: number }
  | { kind: "error"; url: string; code: ReelCloneErrorCode; message: string }
  | { kind: "result"; clone: SavedClone };

const PLATFORM_LABEL: Record<ReelPlatform, string> = { instagram: "Instagram", tiktok: "TikTok" };
const DAY_MS = 86_400_000;

const LABEL = "text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground";

function PlatformIcon({ platform, className }: { platform: ReelPlatform; className?: string }) {
  return platform === "instagram" ? <Instagram className={className} /> : <Video className={className} />;
}

function CopyButton({ text, label, display = "Copy" }: { text: string; label: string; display?: string }) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(t);
  }, [copied]);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          toast({ title: `${label} copied` });
        } catch {
          toast({ title: "Copy failed", variant: "destructive" });
        }
      }}
      aria-label={`Copy ${label.toLowerCase()}`}
      className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      {copied ? "Copied" : display}
    </button>
  );
}

function ExpandableText({ text, clampAt = 280 }: { text: string; clampAt?: number }) {
  const [open, setOpen] = useState(false);
  const long = text.length > clampAt || text.split("\n").length > 4;
  return (
    <div>
      <p
        className={`whitespace-pre-wrap text-sm leading-relaxed text-foreground/85 [overflow-wrap:anywhere] ${
          long && !open ? "line-clamp-4" : ""
        }`}
      >
        {text}
      </p>
      {long && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="mt-1 text-xs font-semibold text-primary hover:underline"
        >
          {open ? "Show less" : "Show all"}
        </button>
      )}
    </div>
  );
}

// ---- Empty state -----------------------------------------------------------------

function EmptyState({ hasVoice }: { hasVoice: boolean }) {
  const steps = [
    { title: "What it says", body: "The caption, a transcript of the video and its public numbers." },
    { title: "Why it worked", body: "The hook, the beats, the payoff and, for Instagram reels, what's on screen and how fast it cuts." },
    { title: "Your version", body: "3 concepts to pick from, then hooks, a shot list and a caption in your voice, made for Singapore and checked for compliance." },
  ];
  return (
    <Card className="border-border/60 shadow-card">
      <CardContent className="space-y-5 p-4 sm:p-6">
        <div className="grid gap-3 sm:grid-cols-3">
          {steps.map((s, i) => (
            <div key={s.title} className="flex gap-3 rounded-xl border border-border/50 bg-muted/20 p-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                {i + 1}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">{s.title}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{s.body}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-2 text-sm text-muted-foreground">
          <p>
            <span className="font-semibold text-foreground">What to paste:</span> the link to a public Instagram reel
            or TikTok video. In the app, tap <span className="font-medium text-foreground">Share</span>, then{" "}
            <span className="font-medium text-foreground">Copy link</span>.
          </p>
          <p className="text-xs">For example:</p>
          <ul className="space-y-1 text-xs">
            <li className="rounded-md bg-muted/40 px-2 py-1 font-mono text-foreground/80 [overflow-wrap:anywhere]">
              https://www.instagram.com/reel/C8xYz12AbCd/
            </li>
            <li className="rounded-md bg-muted/40 px-2 py-1 font-mono text-foreground/80 [overflow-wrap:anywhere]">
              https://vt.tiktok.com/ZSabc1234/
            </li>
          </ul>
          <p className="text-xs">
            Need one that's working right now? Browse{" "}
            <Link to="/trends" className="font-semibold text-primary hover:underline">
              Trends
            </Link>{" "}
            or{" "}
            <Link to="/swipe" className="font-semibold text-primary hover:underline">
              Top posts
            </Link>{" "}
            and tap Clone on any reel.
          </p>
        </div>

        {!hasVoice && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs">
            <p className="min-w-0 text-foreground/80">
              <Sparkles className="mr-1 inline h-3.5 w-3.5 text-primary" />
              Add a few of your own posts so the script sounds like you.
            </p>
            <Button asChild size="sm" variant="outline" className="h-8">
              <Link to="/voice">Set up your voice</Link>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---- Loading --------------------------------------------------------------------------

function LoadingSteps({ startedAt, onCancel }: { startedAt: number; onCancel: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const seconds = Math.max(0, Math.floor((now - startedAt) / 1000));
  const current = cloneStepAt(seconds);
  const slow = seconds >= 70;

  return (
    <Card className="border-border/60 shadow-card" aria-busy="true">
      <CardContent className="space-y-4 p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0" role="status" aria-live="polite">
            <p className="font-serif text-lg font-semibold text-foreground">{CLONE_STEPS[current].label}…</p>
            <p className="text-xs text-muted-foreground">
              {slow
                ? "Taking longer than usual. Hang on a little longer."
                : "This usually takes 20 to 60 seconds. You can keep this tab open."}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        </div>

        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-gradient-primary transition-[width] duration-1000 ease-linear"
            style={{ width: `${Math.min(95, 5 + (seconds / 60) * 90)}%` }}
          />
        </div>

        <ol className="space-y-2.5">
          {CLONE_STEPS.map((step, i) => {
            const done = i < current;
            const active = i === current;
            return (
              <li key={step.label} className="flex items-start gap-3">
                <span
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold ${
                    done
                      ? "border-success/40 bg-success/10 text-success"
                      : active
                        ? "border-primary/40 bg-primary/10 text-primary"
                        : "border-border bg-background text-muted-foreground"
                  }`}
                >
                  {done ? <Check className="h-3 w-3" /> : active ? <Loader2 className="h-3 w-3 animate-spin" /> : i + 1}
                </span>
                <div className="min-w-0">
                  <p className={`text-sm font-medium ${active ? "text-foreground" : done ? "text-foreground/70" : "text-muted-foreground"}`}>
                    {step.label}
                  </p>
                  <p className="text-xs text-muted-foreground">{step.detail}</p>
                </div>
              </li>
            );
          })}
        </ol>
        <p className="text-[11px] text-muted-foreground">
          <Clock className="mr-1 inline h-3 w-3" />
          {seconds}s elapsed
        </p>
      </CardContent>
    </Card>
  );
}

// ---- Errors -------------------------------------------------------------------------------

const ERROR_TITLES: Partial<Record<ReelCloneErrorCode, string>> = {
  not_found: "We couldn't open that post",
  daily_limit: "You've reached today's limit",
  timeout: "Still working on it",
  network: "Connection problem",
  unauthorized: "Your session has expired",
  usage_unavailable: "Cloning is unavailable for a moment",
  scrape_paused: "Cloning is paused",
  not_configured: "Cloning isn't switched on yet",
  ai_failed: "The breakdown didn't come back right",
  bad_url: "That link didn't work",
};

function ErrorCard({
  code,
  message,
  onRetry,
  onReset,
}: {
  code: ReelCloneErrorCode;
  message: string;
  onRetry: () => void;
  onReset: () => void;
}) {
  const canRetry = !["not_found", "daily_limit", "unauthorized", "bad_url", "not_configured"].includes(code);
  const soft = code === "timeout" || code === "daily_limit";
  return (
    <Card
      role="alert"
      className={`shadow-card ${soft ? "border-warning/40 bg-warning/[0.04]" : "border-destructive/30 bg-destructive/[0.03]"}`}
    >
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:p-6">
        {code === "timeout" ? (
          <Clock className="h-5 w-5 shrink-0 text-warning" />
        ) : (
          <AlertTriangle className={`h-5 w-5 shrink-0 ${soft ? "text-warning" : "text-destructive"}`} />
        )}
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <p className="font-serif text-lg font-semibold text-foreground">
              {ERROR_TITLES[code] ?? "Something went wrong"}
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">{message}</p>
            {code === "daily_limit" && (
              <p className="mt-1 text-xs text-muted-foreground">
                Your recent clones below still open for free.
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {canRetry && (
              <Button size="sm" onClick={onRetry} className="gap-1.5">
                <RotateCcw className="h-3.5 w-3.5" /> Try again
              </Button>
            )}
            {code === "unauthorized" ? (
              <Button asChild size="sm">
                <Link to="/auth">Sign in again</Link>
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={onReset}>
                Try another link
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ---- Result: the original post ----------------------------------------------------------------

function Metrics({ source }: { source: CloneSource }) {
  const m = source.metrics;
  const items = m
    ? [
        { icon: Play, label: "views", value: m.views },
        { icon: Heart, label: "likes", value: m.likes },
        { icon: MessageCircle, label: "comments", value: m.comments },
        { icon: Share2, label: "shares", value: m.shares },
        { icon: Bookmark, label: "saves", value: m.saves },
      ].filter((i): i is typeof i & { value: number } => i.value !== null)
    : [];
  const asOf = source.metricsAsOf;
  const stale = asOf ? Date.now() - Date.parse(asOf) > DAY_MS : false;

  if (items.length === 0) {
    return <p className="text-xs text-muted-foreground">This post's numbers aren't public.</p>;
  }
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {items.map(({ icon: Icon, label, value }) => (
        <span key={label} className="inline-flex items-center gap-1.5">
          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-sm font-semibold tabular-nums text-foreground">{formatCount(value)}</span>
          <span className="text-xs text-muted-foreground">{label}</span>
        </span>
      ))}
      {asOf && (
        <span className={`text-[11px] ${stale ? "font-medium text-warning" : "text-muted-foreground"}`}>
          {stale ? `Numbers from ${timeAgo(asOf)}` : `as of ${timeAgo(asOf)}`}
        </span>
      )}
    </div>
  );
}

function SourceCard({ source }: { source: CloneSource }) {
  const [showTranscript, setShowTranscript] = useState(false);
  const words = source.transcript ? source.transcript.split(/\s+/).filter(Boolean).length : 0;

  return (
    <Card className="border-border/60 shadow-card">
      <CardContent className="space-y-4 p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              <PlatformIcon platform={source.platform} className="h-3 w-3" /> {PLATFORM_LABEL[source.platform]}
            </span>
            {source.author && <span className="text-sm font-semibold text-foreground">@{source.author}</span>}
            <span className="text-xs text-muted-foreground">
              {[source.postedAt ? shortDate(source.postedAt) : null, source.durationSec ? `${source.durationSec}s` : null]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </div>
          <Button asChild variant="outline" size="sm" className="h-8 gap-1.5">
            <a href={source.url} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-3.5 w-3.5" /> View original
            </a>
          </Button>
        </div>

        <Metrics source={source} />

        {!source.transcript && (
          <div className="flex gap-2 rounded-lg border border-warning/30 bg-warning/[0.06] p-3 text-xs text-foreground/85">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
            <p>
              <span className="font-semibold">No transcript for this {source.isVideo ? "video" : "post"}.</span>{" "}
              {source.isVideo
                ? "It may have no speech or captions we could read, "
                : "It isn't a video, "}
              so the breakdown and your version work from the caption only. Watch the original to check them.
            </p>
          </div>
        )}

        <div className="space-y-1">
          <p className={LABEL}>Caption</p>
          {source.caption ? (
            <ExpandableText text={source.caption} />
          ) : (
            <p className="text-sm text-muted-foreground">No caption.</p>
          )}
        </div>

        {source.transcript && (
          <div className="space-y-1">
            <button
              type="button"
              onClick={() => setShowTranscript((v) => !v)}
              aria-expanded={showTranscript}
              className="text-xs font-semibold text-primary hover:underline"
            >
              {showTranscript ? "Hide transcript" : `Show transcript (${words} words)`}
            </button>
            {showTranscript && (
              <p className="whitespace-pre-wrap rounded-lg border border-border/50 bg-muted/20 p-3 text-sm leading-relaxed text-foreground/85 [overflow-wrap:anywhere]">
                {source.transcript}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---- Result: why it worked ------------------------------------------------------------------------

function BreakdownCard({ breakdown }: { breakdown: Breakdown }) {
  return (
    <Card className="min-w-0 border-border/60 shadow-card">
      <CardContent className="space-y-4 p-4 sm:p-6">
        <h2 className="font-serif text-xl font-semibold text-foreground">Why it worked</h2>

        <div className="space-y-1 rounded-lg border border-primary/20 bg-primary/5 p-3">
          <p className={`${LABEL} text-primary`}>Hook</p>
          <p className="text-sm leading-relaxed text-foreground [overflow-wrap:anywhere]">{breakdown.hook}</p>
        </div>

        <div className="space-y-2">
          <p className={LABEL}>Beats</p>
          <ol className="space-y-2">
            {breakdown.beats.map((beat, i) => (
              <li key={i} className="flex gap-2.5 text-sm leading-relaxed text-foreground/85">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground">
                  {i + 1}
                </span>
                <span className="min-w-0 [overflow-wrap:anywhere]">{beat}</span>
              </li>
            ))}
          </ol>
        </div>

        {breakdown.payoff && (
          <div className="space-y-1">
            <p className={LABEL}>Payoff</p>
            <p className="text-sm leading-relaxed text-foreground/85">{breakdown.payoff}</p>
          </div>
        )}

        <div className="space-y-1">
          <p className={LABEL}>Call to action</p>
          <p className="text-sm leading-relaxed text-foreground/85">{breakdown.cta || "No clear call to action."}</p>
        </div>

        <div className="space-y-1 rounded-lg border border-border/50 bg-muted/20 p-3">
          <p className={LABEL}>Why it landed</p>
          <p className="text-sm leading-relaxed text-foreground/85">{breakdown.whyItWorked}</p>
        </div>
      </CardContent>
    </Card>
  );
}

// ---- Result: what's on screen (Instagram reels) ------------------------------------------------------

const VISUAL_STEPS = [
  { phase: "download", label: "Downloading the video" },
  { phase: "scan", label: "Finding the scene changes" },
  { phase: "read", label: "Reading the frames" },
] as const;

const clock = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

function Filmstrip({ frames }: { frames: string[] }) {
  if (frames.length === 0) return null;
  return (
    <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" aria-label={`${frames.length} frames from the video`}>
      {frames.map((src, i) => (
        <img key={i} src={src} alt="" className="h-24 w-auto shrink-0 rounded-md border border-border/60 object-cover" />
      ))}
    </div>
  );
}

function VisualsCard({ clone, job, onRetry }: { clone: SavedClone; job: VisualsJob | null; onRetry: () => void }) {
  const v = clone.visuals;
  const mine = job?.cloneId === clone.id ? job : null;
  const running = mine && mine.phase !== "done" && mine.phase !== "error" ? mine : null;
  const failed = !v && mine?.phase === "error" ? mine : null;
  if (!v && !running && !failed) return null;
  const current = running ? VISUAL_STEPS.findIndex((st) => st.phase === running.phase) : -1;

  return (
    <Card className="min-w-0 border-border/60 shadow-card">
      <CardContent className="space-y-4 p-4 sm:p-6">
        <h2 className="flex items-center gap-2 font-serif text-xl font-semibold text-foreground">
          <Eye className="h-5 w-5 shrink-0 text-primary" /> What's on screen
        </h2>

        {running && (
          <div className="space-y-3" role="status" aria-live="polite">
            <ol className="space-y-2">
              {VISUAL_STEPS.map((step, i) => {
                const done = i < current;
                const active = i === current;
                return (
                  <li key={step.phase} className="flex items-center gap-2.5 text-sm">
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold ${
                        done
                          ? "border-success/40 bg-success/10 text-success"
                          : active
                            ? "border-primary/40 bg-primary/10 text-primary"
                            : "border-border bg-background text-muted-foreground"
                      }`}
                    >
                      {done ? <Check className="h-3 w-3" /> : active ? <Loader2 className="h-3 w-3 animate-spin" /> : i + 1}
                    </span>
                    <span className={active ? "font-medium text-foreground" : done ? "text-foreground/70" : "text-muted-foreground"}>
                      {step.label}
                      {active && step.phase === "scan" ? ` ${Math.round(running.progress * 100)}%` : ""}
                    </span>
                  </li>
                );
              })}
            </ol>
            <Filmstrip frames={running.frames} />
          </div>
        )}

        {failed && (
          <div
            role="alert"
            className="flex flex-col gap-2 rounded-lg border border-warning/30 bg-warning/[0.06] p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
          >
            <p className="min-w-0 text-foreground/85">{failed.error}</p>
            {canReadVideo(clone) && (
              <Button size="sm" variant="outline" onClick={onRetry} className="shrink-0 gap-1.5">
                <RotateCcw className="h-3.5 w-3.5" /> Try again
              </Button>
            )}
          </div>
        )}

        {v && (
          <>
            <div className="flex flex-wrap gap-1.5">
              {[
                `${v.measured.cuts} cut${v.measured.cuts === 1 ? "" : "s"}`,
                `a new shot every ${v.measured.avgShotSec}s`,
                `${v.measured.cutsFirst3s} in the first 3s`,
              ].map((t) => (
                <span
                  key={t}
                  className="rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-foreground/80"
                >
                  {t}
                </span>
              ))}
            </div>
            <Filmstrip frames={mine?.frames ?? []} />

            <div className="space-y-1">
              <p className={LABEL}>Format</p>
              <p className="text-sm leading-relaxed text-foreground/85">{v.format}</p>
            </div>

            <div className="space-y-1 rounded-lg border border-primary/20 bg-primary/5 p-3">
              <p className={`${LABEL} text-primary`}>First second</p>
              <p className="text-sm leading-relaxed text-foreground [overflow-wrap:anywhere]">{v.hookVisual}</p>
            </div>

            {v.onScreenText.length > 0 && (
              <div className="space-y-2">
                <p className={LABEL}>Text on screen</p>
                <ul className="space-y-1.5">
                  {v.onScreenText.map((o, i) => (
                    <li key={i} className="flex gap-2.5 text-sm">
                      <span className="w-9 shrink-0 pt-0.5 font-mono text-xs tabular-nums text-muted-foreground">{clock(o.t)}</span>
                      <span className="min-w-0 font-medium text-foreground [overflow-wrap:anywhere]">{o.text}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="space-y-1">
              <p className={LABEL}>Pacing</p>
              <p className="text-sm leading-relaxed text-foreground/85">{v.pacing}</p>
            </div>

            {v.visualMoves.length > 0 && (
              <div className="space-y-1 rounded-lg border border-border/50 bg-muted/20 p-3">
                <p className={LABEL}>Moves to borrow</p>
                <ul className="list-disc space-y-1 pl-4 text-sm leading-relaxed text-foreground/85">
                  {v.visualMoves.map((m, i) => (
                    <li key={i}>{m}</li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ---- Result: the consultant's version --------------------------------------------------------------

function ComplianceFlags({ flags }: { flags: ComplianceFlag[] }) {
  if (flags.length === 0) {
    return (
      <p className="flex items-center gap-1.5 text-xs font-medium text-success">
        <ShieldCheck className="h-3.5 w-3.5 shrink-0" /> No compliance flags. Still read it through before you post.
      </p>
    );
  }
  return (
    <div className="space-y-2" aria-label="Compliance flags">
      {flags.map((flag) => {
        const isError = flag.severity === "error";
        return (
          <div
            key={flag.id}
            className={`flex items-start gap-2 rounded-lg border px-2.5 py-1.5 text-[11px] ${
              isError
                ? "border-destructive/50 bg-destructive/10 text-destructive"
                : "border-warning/40 bg-warning/10 text-foreground"
            }`}
          >
            <AlertTriangle className={`mt-0.5 h-3 w-3 shrink-0 ${isError ? "text-destructive" : "text-warning"}`} />
            <div className="min-w-0 space-y-0.5">
              <div className="font-semibold uppercase tracking-[0.14em]">
                {isError ? "Compliance error" : "Compliance warning"}
                <span className="ml-1.5 rounded bg-background/60 px-1 py-0.5 font-mono text-[10px] normal-case tracking-normal">
                  {flag.match}
                </span>
              </div>
              <div className="leading-snug">{flag.message}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function VersionBlock({ label, text, copyLabel, pre }: { label: string; text: string; copyLabel?: string; pre?: boolean }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <p className={LABEL}>{label}</p>
        {copyLabel && text && <CopyButton text={text} label={copyLabel} />}
      </div>
      <p
        className={`text-sm leading-relaxed text-foreground [overflow-wrap:anywhere] ${pre ? "whitespace-pre-wrap" : ""}`}
      >
        {text}
      </p>
    </div>
  );
}

function ShotList({ clone }: { clone: SavedClone }) {
  const v = clone.result.myVersion;
  const beats = v.beats ?? [];
  const visuals = visualsFor(clone);
  const shots = visuals?.myVisuals ?? [];
  const total = beats.reduce((sum, b) => sum + b.seconds, 0);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <p className={LABEL}>Shot list · about {total}s</p>
        <div className="flex items-center gap-1">
          <CopyButton text={v.script} label="Script" display="Copy script" />
          <CopyButton text={shotListText(v, visuals)} label="Shot list" display="Copy shot list" />
        </div>
      </div>
      {visuals && (
        <p className="flex items-center gap-1 text-[11px] font-medium text-primary">
          <Eye className="h-3 w-3 shrink-0" /> Shots match the original's look
        </p>
      )}
      <ol className="space-y-2">
        {beats.map((b, i) => {
          const shot = shots[i] || b.visual;
          return (
            <li key={i} className="flex gap-2.5 rounded-lg border border-border/50 bg-muted/10 p-2.5">
              <div className="flex w-8 shrink-0 flex-col items-center gap-1 pt-0.5">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground">
                  {i + 1}
                </span>
                <span className="text-[10px] tabular-nums text-muted-foreground">{b.seconds}s</span>
              </div>
              <div className="min-w-0 flex-1 space-y-1.5">
                <p className="text-sm font-medium leading-relaxed text-foreground [overflow-wrap:anywhere]">{b.say}</p>
                {b.onScreen && (
                  <p className="w-fit max-w-full rounded bg-foreground px-1.5 py-0.5 text-[11px] font-semibold text-background [overflow-wrap:anywhere]">
                    <span className="sr-only">On screen: </span>
                    {b.onScreen}
                  </p>
                )}
                {shot && (
                  <p className="flex gap-1.5 text-xs leading-relaxed text-muted-foreground">
                    <Camera className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                    <span className="min-w-0 [overflow-wrap:anywhere]">
                      <span className="sr-only">Show: </span>
                      {shot}
                    </span>
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function ConceptPicker({
  concepts,
  active,
  building,
  error,
  onChoose,
}: {
  concepts: Concept[];
  active: number;
  building: number | null;
  error: string | null;
  onChoose: (index: number) => void;
}) {
  return (
    <div className="space-y-2">
      <p id="concept-options" className={`${LABEL} text-primary`}>
        Pick a concept
      </p>
      <div role="radiogroup" aria-labelledby="concept-options" className="space-y-1.5">
        {concepts.map((c, i) => {
          const on = i === active;
          const busy = i === building;
          return (
            <button
              key={i}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={building !== null && !busy}
              onClick={() => onChoose(i)}
              className={`flex min-h-11 w-full items-start gap-2.5 rounded-lg border p-3 text-left transition-colors disabled:opacity-60 ${
                on || busy ? "border-primary/40 bg-primary/5" : "border-border/60 hover:bg-accent/60"
              }`}
            >
              <span
                className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                  on ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40"
                }`}
              >
                {busy ? <Loader2 className="h-3 w-3 animate-spin text-primary" /> : on && <Check className="h-3 w-3" />}
              </span>
              <span className="min-w-0 space-y-0.5 [overflow-wrap:anywhere]">
                <span className="block text-sm font-semibold leading-snug text-foreground">{c.title}</span>
                <span className="block text-xs leading-relaxed text-muted-foreground">
                  <span className="font-medium text-foreground/80">Keeps:</span> {c.keeps}
                </span>
                <span className="block text-xs leading-relaxed text-muted-foreground">
                  <span className="font-medium text-foreground/80">Changes:</span> {c.changes}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      {error ? (
        <p role="alert" className="text-xs font-medium text-destructive">
          {error}
        </p>
      ) : (
        <p role="status" aria-live="polite" className="text-[11px] text-muted-foreground">
          {building !== null
            ? "Writing that version, about 20 seconds..."
            : `A new concept uses 1 of your ${DAILY_LIMITS["reel-concepts"]} a day.`}
        </p>
      )}
    </div>
  );
}

function VersionCard({
  clone,
  building,
  conceptError,
  onOpenInWrite,
  onAddToBoard,
  onChooseHook,
  onChooseConcept,
}: {
  clone: SavedClone;
  building: number | null;
  conceptError: string | null;
  onOpenInWrite: () => void;
  onAddToBoard: () => void;
  onChooseHook: (index: number) => void;
  onChooseConcept: (index: number) => void;
}) {
  const v = clone.result.myVersion;
  const options = v.hookOptions ?? [];
  const concepts = clone.result.concepts ?? [];
  const flags = useMemo(
    () =>
      scanCompliance(
        [v.hook, ...(v.hookOptions ?? []), v.script, ...(v.beats ?? []).map((b) => b.onScreen), v.caption, v.cta, v.filmingNotes].join("\n"),
      ),
    [v],
  );

  return (
    <Card className="min-w-0 border-primary/25 shadow-card">
      <CardContent className="space-y-4 p-4 sm:p-6">
        <div className="space-y-2">
          <h2 className="font-serif text-xl font-semibold text-foreground">Your version</h2>
          <ComplianceFlags flags={flags} />
        </div>

        {concepts.length > 1 && (
          <ConceptPicker
            concepts={concepts}
            active={clone.concept ?? 0}
            building={building}
            error={conceptError}
            onChoose={onChooseConcept}
          />
        )}

        {options.length > 1 ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p id="hook-options" className={`${LABEL} text-primary`}>
                Pick your hook
              </p>
              <CopyButton text={v.hook} label="Hook" />
            </div>
            <div role="radiogroup" aria-labelledby="hook-options" className="space-y-1.5">
              {options.map((h, i) => {
                const on = h === v.hook;
                const formula = hookFormula(v.hookFormulas?.[i]);
                return (
                  <button
                    key={i}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => onChooseHook(i)}
                    className={`flex min-h-11 w-full items-start gap-2.5 rounded-lg border p-3 text-left transition-colors ${
                      on ? "border-primary/40 bg-primary/5" : "border-border/60 hover:bg-accent/60"
                    }`}
                  >
                    <span
                      className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                        on ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40"
                      }`}
                    >
                      {on && <Check className="h-3 w-3" />}
                    </span>
                    <span className="min-w-0 space-y-0.5 [overflow-wrap:anywhere]">
                      <span
                        className={`block ${
                          on ? "font-serif text-base font-semibold leading-snug text-foreground" : "text-sm text-foreground/80"
                        }`}
                      >
                        {h}
                      </span>
                      {formula && (
                        <span className="block text-[11px] leading-snug text-muted-foreground">
                          <span className="font-semibold text-foreground">{formula.name}.</span> Trap: {formula.trap}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="space-y-1 rounded-lg border border-primary/20 bg-primary/5 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className={`${LABEL} text-primary`}>Hook</p>
              <CopyButton text={v.hook} label="Hook" />
            </div>
            <p className="font-serif text-base font-semibold leading-snug text-foreground [overflow-wrap:anywhere]">{v.hook}</p>
          </div>
        )}

        {v.beats?.length ? <ShotList clone={clone} /> : <VersionBlock label="Script" text={v.script} copyLabel="Script" pre />}
        <VersionBlock label="Caption" text={v.caption} copyLabel="Caption" pre />
        {v.cta && <VersionBlock label="Call to action" text={v.cta} />}
        {v.filmingNotes && (
          <div className="space-y-1 rounded-lg border border-border/50 bg-muted/20 p-3">
            <p className={`${LABEL} flex items-center gap-1`}>
              <Clapperboard className="h-3 w-3" /> Filming notes
            </p>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/85">{v.filmingNotes}</p>
          </div>
        )}

        <div className="flex flex-col gap-2 border-t border-border/60 pt-4 sm:flex-row sm:flex-wrap">
          <Button
            onClick={onOpenInWrite}
            className="gap-1.5 bg-gradient-primary text-primary-foreground shadow-sm hover:opacity-95"
          >
            <Pencil className="h-4 w-4" /> Open in Write
          </Button>
          {clone.onBoard ? (
            <Button asChild variant="outline" className="gap-1.5 border-success/40 text-success">
              <Link to="/board">
                <Check className="h-4 w-4" /> On your board in Scripted <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          ) : (
            <Button variant="outline" onClick={onAddToBoard} className="gap-1.5">
              <Columns3 className="h-4 w-4" /> Add to board
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ---- Recent clones ------------------------------------------------------------------------------------

function RecentClones({ clones, onOpen }: { clones: SavedClone[]; onOpen: (clone: SavedClone) => void }) {
  if (clones.length === 0) return null;
  return (
    <section className="space-y-2" aria-labelledby="recent-clones">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="recent-clones" className="font-serif text-lg font-semibold text-foreground">
          Recent clones
        </h2>
        <p className="text-[11px] text-muted-foreground">Kept on your account. Reopening is free.</p>
      </div>
      <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/60 bg-card shadow-card">
        {clones.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => onOpen(c)}
              className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-accent/60"
            >
              <PlatformIcon platform={c.result.source.platform} className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-foreground">{c.result.myVersion.hook}</span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {c.result.source.author ? `From @${c.result.source.author} · ` : ""}
                  {timeAgo(c.savedAt)}
                </span>
              </span>
              <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---- Page ---------------------------------------------------------------------------------------------

export default function CloneReelPage() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [userId, setUserId] = useState<string | null>(null);
  const [hasVoice, setHasVoice] = useState(true);
  const [input, setInput] = useState(() => searchParams.get("url") ?? "");
  const [linkError, setLinkError] = useState<string | null>(null);
  const [view, setView] = useState<View>({ kind: "idle" });
  const [saved, setSaved] = useState<SavedClone[]>([]);
  const [visualsJob, setVisualsJob] = useState<VisualsJob | null>(() => currentVisualsJob());
  // The concept being written, and why the last one failed, for the clone on screen.
  const [building, setBuilding] = useState<{ cloneId: string; index: number } | null>(null);
  const [conceptError, setConceptError] = useState<{ cloneId: string; message: string } | null>(null);
  // Which set of hook formulas the next clone or concept uses; each takes the next.
  const hookSetRef = useRef(Math.floor(Math.random() * HOOK_FORMULAS.length));
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.title = "Clone a reel - Content Studio";
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      const id = data.user?.id ?? null;
      setUserId(id);
      setSaved(loadSavedClones(id));
      setHasVoice(isVoiceProfileUsable(loadVoiceProfile(id)));
    });
    return () => {
      active = false;
      abortRef.current?.abort();
      document.title = "Content Studio";
    };
  }, []);

  // Reading the video runs outside the page; show its progress, and the saved result when it lands.
  useEffect(
    () =>
      onVisualsJob((job) => {
        setVisualsJob(job);
        if (job?.phase !== "done" || !userId) return;
        const all = loadSavedClones(userId);
        setSaved(all);
        const fresh = all.find((c) => c.id === job.cloneId);
        if (!fresh) return;
        setView((prev) =>
          prev.kind === "result" && prev.clone.id === job.cloneId
            ? { kind: "result", clone: { ...fresh, result: { ...fresh.result, source: prev.clone.result.source } } }
            : prev,
        );
      }),
    [userId],
  );

  // A Clone button elsewhere links here with ?url=; fill it in, but let the
  // consultant start it, since each clone uses one of today's.
  const urlParam = searchParams.get("url");
  useEffect(() => {
    if (urlParam) setInput(urlParam);
  }, [urlParam]);

  const resultKey = view.kind === "result" ? view.clone.id + view.clone.savedAt : null;
  useEffect(() => {
    if (resultKey) resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [resultKey]);

  const run = async (raw: string) => {
    const parsed = parseReelUrl(raw);
    // `=== false`: the app builds without strictNullChecks, where `!parsed.ok` doesn't narrow.
    if (parsed.ok === false) {
      setLinkError(parsed.message);
      inputRef.current?.focus();
      return;
    }
    setLinkError(null);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setView({ kind: "loading", url: parsed.url, startedAt: Date.now() });
    try {
      // A click right after the page opens can beat the getUser() above; the session is local, so read it here.
      const uid = userId ?? (await supabase.auth.getSession()).data.session?.user.id ?? null;
      const voice = voiceForClone(loadVoiceProfile(uid), winnersFor(uid));
      const result = await cloneReel(parsed.url, voice, controller.signal, hookFormulaSet(hookSetRef.current++));
      if (controller.signal.aborted) return;
      const clone: SavedClone = { id: cloneIdOf(result), savedAt: new Date().toISOString(), result };
      if (uid) setSaved(rememberClone(uid, clone));
      setView({ kind: "result", clone });
      if (uid && canReadVideo(clone)) void startVisualsJob(uid, clone);
    } catch (e) {
      if (controller.signal.aborted) return;
      const err =
        e instanceof ReelCloneError ? e : new ReelCloneError("Something went wrong. Try again.", "server_error", 0);
      if (err.code === "cancelled") return;
      if (err.code === "bad_url") {
        setLinkError(err.message);
        setView({ kind: "idle" });
        return;
      }
      setView({ kind: "error", url: parsed.url, code: err.code, message: err.message });
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (view.kind !== "loading") void run(input);
  };

  const cancel = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setView({ kind: "idle" });
  };

  const reset = () => {
    setView({ kind: "idle" });
    setInput("");
    setLinkError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const updateClone = (clone: SavedClone) => {
    setView({ kind: "result", clone });
    setSaved(loadSavedClones(userId));
  };

  const chooseHook = (clone: SavedClone, index: number) => {
    const updated: SavedClone = { ...clone, result: { ...clone.result, myVersion: withHook(clone.result.myVersion, index) } };
    setView({ kind: "result", clone: updated });
    if (userId) setSaved(rememberClone(userId, updated));
  };

  // Shows a concept's version once it's written; the build itself saves it, wherever the consultant is.
  const followBuild = async (clone: SavedClone, index: number, build: Promise<SavedClone>) => {
    setBuilding({ cloneId: clone.id, index });
    setConceptError(null);
    try {
      const updated = await build;
      setSaved(loadSavedClones(userId));
      setView((prev) =>
        prev.kind === "result" && prev.clone.id === updated.id
          ? { kind: "result", clone: { ...updated, result: { ...updated.result, source: prev.clone.result.source } } }
          : prev,
      );
    } catch (e) {
      setConceptError({
        cloneId: clone.id,
        message: e instanceof ReelCloneError ? e.message : "Couldn't write that version. Try again.",
      });
    } finally {
      setBuilding((b) => (b?.cloneId === clone.id ? null : b));
    }
  };

  const chooseConcept = (clone: SavedClone, index: number) => {
    if (building || index === (clone.concept ?? 0)) return;
    const switched = withConcept(clone, index);
    if (switched !== clone) {
      setConceptError(null);
      setView({ kind: "result", clone: switched });
      if (userId) setSaved(rememberClone(userId, switched));
      return;
    }
    const voice = voiceForClone(loadVoiceProfile(userId), winnersFor(userId));
    void followBuild(clone, index, startConceptBuild(userId, clone, index, voice, hookFormulaSet(hookSetRef.current++)));
  };

  // Back on a clone whose concept is still being written: show it running.
  const shownId = view.kind === "result" ? view.clone.id : null;
  useEffect(() => {
    const running = shownId ? conceptRun(shownId) : null;
    if (running && view.kind === "result") void followBuild(view.clone, running.index, running.promise);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownId]);

  const openInWrite = (clone: SavedClone) => {
    if (!userId) return;
    const updated = saveCloneDraft(userId, clone);
    updateClone(updated);
    navigate(`/generate?draft=${encodeURIComponent(updated.draftId!)}`);
  };

  const addToBoard = (clone: SavedClone) => {
    if (!userId) return;
    updateClone(saveCloneDraft(userId, clone, "scripted"));
    toast({ title: "Added to your board", description: "It's in Scripted, ready to film." });
  };

  const loading = view.kind === "loading";
  const limit = DAILY_LIMITS["reel-clone"];

  return (
    <div className="space-y-5">
      <header>
        <h1 className="flex items-center gap-2 font-serif text-2xl font-semibold leading-tight tracking-tight text-foreground sm:text-3xl">
          <Clapperboard className="h-6 w-6 shrink-0 text-primary" /> Clone a reel
        </h1>
      </header>

      <form onSubmit={onSubmit} noValidate className="space-y-1.5">
        <label htmlFor="reel-url" className="sr-only">
          Instagram reel or TikTok video link
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="reel-url"
            ref={inputRef}
            type="url"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              if (linkError) setLinkError(null);
            }}
            placeholder="https://www.instagram.com/reel/…"
            disabled={loading}
            aria-invalid={Boolean(linkError)}
            aria-describedby={linkError ? "reel-url-error" : "reel-url-hint"}
            className="h-11 min-w-0 flex-1"
          />
          <Button
            type="submit"
            disabled={loading || !input.trim()}
            className="h-11 gap-1.5 bg-gradient-primary px-5 text-primary-foreground shadow-sm hover:opacity-95"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {loading ? "Cloning…" : "Clone it"}
          </Button>
        </div>
        {linkError ? (
          <p id="reel-url-error" role="alert" className="text-xs font-medium text-destructive">
            {linkError}
          </p>
        ) : (
          <p id="reel-url-hint" className="text-[11px] text-muted-foreground">
            Instagram reels and TikTok videos only. Each clone uses 1 of your {limit} a day
            {view.kind === "result" && view.clone.result.usage
              ? ` (${view.clone.result.usage.used} used today).`
              : "."}
          </p>
        )}
      </form>

      {view.kind === "idle" && <EmptyState hasVoice={hasVoice} />}

      {view.kind === "loading" && <LoadingSteps startedAt={view.startedAt} onCancel={cancel} />}

      {view.kind === "error" && (
        <ErrorCard code={view.code} message={view.message} onRetry={() => void run(view.url)} onReset={reset} />
      )}

      {view.kind === "result" && (
        <div ref={resultRef} className="scroll-mt-20 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              Cloned {timeAgo(view.clone.savedAt)}
            </p>
            <Button variant="ghost" size="sm" onClick={reset} className="gap-1.5">
              <RotateCcw className="h-3.5 w-3.5" /> Clone another
            </Button>
          </div>
          {/* Phones read "Your version" first; from lg the source spans the top and the version sits right. */}
          <div className="grid items-start gap-4 lg:grid-cols-2">
            <div className="min-w-0 lg:col-start-2 lg:row-start-2">
              <VersionCard
                clone={view.clone}
                building={building?.cloneId === view.clone.id ? building.index : null}
                conceptError={conceptError?.cloneId === view.clone.id ? conceptError.message : null}
                onOpenInWrite={() => openInWrite(view.clone)}
                onAddToBoard={() => addToBoard(view.clone)}
                onChooseHook={(i) => chooseHook(view.clone, i)}
                onChooseConcept={(i) => chooseConcept(view.clone, i)}
              />
            </div>
            <div className="min-w-0 lg:col-span-2 lg:row-start-1">
              <SourceCard source={view.clone.result.source} />
            </div>
            <div className="min-w-0 space-y-4 lg:col-start-1 lg:row-start-2">
              <BreakdownCard breakdown={view.clone.result.breakdown} />
              <VisualsCard
                clone={view.clone}
                job={visualsJob}
                onRetry={() => userId && void startVisualsJob(userId, view.clone)}
              />
            </div>
          </div>
        </div>
      )}

      {!loading && (
        <RecentClones
          clones={saved.filter((c) => view.kind !== "result" || c.id !== view.clone.id)}
          onOpen={(clone) => {
            setLinkError(null);
            setInput(clone.result.source.url);
            setView({ kind: "result", clone });
          }}
        />
      )}
    </div>
  );
}
