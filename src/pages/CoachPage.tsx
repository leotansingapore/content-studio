import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/lib/supabase";
import { loadDrafts } from "@/lib/draftHistory";
import type { PlatformId } from "@/lib/platformCounters";
import {
  analyzePosts,
  splitPastedPosts,
  addCoachEntry,
  loadCoachHistory,
  type CoachReport,
  type CoachHistoryEntry,
} from "@/lib/coach";
import {
  Gauge,
  Sparkles,
  CheckCircle2,
  Wrench,
  History as HistoryIcon,
  TrendingUp,
} from "lucide-react";

function scoreTone(score: number): { label: string; text: string; ring: string } {
  if (score >= 80)
    return { label: "Strong", text: "text-success", ring: "text-success" };
  if (score >= 60)
    return { label: "Solid", text: "text-primary", ring: "text-primary" };
  if (score >= 40)
    return { label: "Getting there", text: "text-warning", ring: "text-warning" };
  return { label: "Needs work", text: "text-destructive", ring: "text-destructive" };
}

function ScoreRing({ score }: { score: number }) {
  const tone = scoreTone(score);
  const r = 42;
  const c = 2 * Math.PI * r;
  const offset = c - (score / 100) * c;
  return (
    <div className="relative flex h-28 w-28 items-center justify-center">
      <svg className="h-28 w-28 -rotate-90" viewBox="0 0 100 100">
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          className="stroke-muted"
          strokeWidth="8"
        />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          className={`${tone.ring} transition-all duration-700`}
          stroke="currentColor"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="font-serif text-3xl font-semibold text-foreground">
          {score}
        </span>
        <span className={`text-[11px] font-semibold ${tone.text}`}>
          {tone.label}
        </span>
      </div>
    </div>
  );
}

function Bar({ label, score, note }: { label: string; score: number; note: string }) {
  const color =
    score >= 80 ? "bg-success" : score >= 50 ? "bg-primary" : "bg-warning";
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-foreground">{label}</span>
        <span className="tabular-nums text-muted-foreground">{score}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full ${color} transition-all duration-700`}
          style={{ width: `${score}%` }}
        />
      </div>
      <p className="text-xs leading-snug text-muted-foreground">{note}</p>
    </div>
  );
}

export default function CoachPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [platform, setPlatform] = useState<PlatformId>("linkedin");
  const [report, setReport] = useState<CoachReport | null>(null);
  const [history, setHistory] = useState<CoachHistoryEntry[]>([]);
  const [inAppCount, setInAppCount] = useState(0);

  useEffect(() => {
    document.title = "Coach - Content Studio";
    let active = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!active) return;
      const id = data.user?.id ?? null;
      setUserId(id);
      setHistory(loadCoachHistory(id));
      setInAppCount(loadDrafts(id).length);
    })();
    return () => {
      active = false;
    };
  }, []);

  const runAnalysis = (posts: { text: string; platform?: PlatformId }[]) => {
    const result = analyzePosts(posts);
    setReport(result);
    if (result && userId) setHistory(addCoachEntry(userId, result));
  };

  const handleAnalyzePasted = () => {
    const posts = splitPastedPosts(text).map((t) => ({ text: t, platform }));
    runAnalysis(posts);
  };

  const handleAnalyzeInApp = () => {
    const drafts = loadDrafts(userId);
    if (drafts.length === 0) return;
    runAnalysis(
      drafts.map((d) => ({
        text: d.draft,
        platform: (d.platform as PlatformId) ?? "linkedin",
      })),
    );
  };

  const best = useMemo(
    () => (history.length ? Math.max(...history.map((h) => h.score)) : 0),
    [history],
  );

  return (
    <div className="space-y-6">
      <header className="space-y-1.5">
        <h1 className="font-serif text-2xl font-semibold leading-tight tracking-tight text-foreground sm:text-3xl">
          Coach
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          See how your posts stack up against what actually works, and get a
          short list of fixes to try next. Paste a few recent posts, or grade
          the ones you've made here.
        </p>
      </header>

      <Card className="border-border/60 shadow-card">
        <CardHeader>
          <CardTitle className="font-serif text-lg">Analyze your posts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <div className="space-y-1.5">
              <Label htmlFor="coach-text">
                Paste your recent posts
                <span className="ml-1 font-normal text-muted-foreground">
                  (separate each post with a line of ---)
                </span>
              </Label>
              <Textarea
                id="coach-text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={7}
                placeholder={"Paste your first post here...\n\n---\n\nPaste your next post here...\n\n---\n\nAnd another..."}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Platform</Label>
              <Select
                value={platform}
                onValueChange={(v) => setPlatform(v as PlatformId)}
              >
                <SelectTrigger className="sm:w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="linkedin">LinkedIn</SelectItem>
                  <SelectItem value="instagram">Instagram</SelectItem>
                  <SelectItem value="facebook">Facebook</SelectItem>
                  <SelectItem value="tiktok">TikTok</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={handleAnalyzePasted}
              disabled={text.trim().length < 20}
              className="gap-1.5 bg-gradient-primary text-primary-foreground hover:opacity-95"
            >
              <Gauge className="h-4 w-4" /> Analyze
            </Button>
            <Button
              variant="outline"
              onClick={handleAnalyzeInApp}
              disabled={inAppCount === 0}
              className="gap-1.5"
            >
              <Sparkles className="h-4 w-4" /> Grade my {inAppCount} in-app{" "}
              {inAppCount === 1 ? "post" : "posts"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {report && (
        <Card className="border-border/60 shadow-card">
          <CardContent className="space-y-6 pt-6">
            <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
              <ScoreRing score={report.score} />
              <div className="flex-1 space-y-1 text-center sm:text-left">
                <p className="font-serif text-lg font-semibold text-foreground">
                  Content score
                </p>
                <p className="text-sm text-muted-foreground">
                  Across {report.postCount}{" "}
                  {report.postCount === 1 ? "post" : "posts"} · avg{" "}
                  {report.avgWords} words. This is a craft check, not a
                  guarantee of reach — but the craft is what you control.
                </p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {report.dimensions.map((d) => (
                <Bar key={d.key} label={d.label} score={d.score} note={d.note} />
              ))}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 rounded-xl border border-success/30 bg-success/5 p-4">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-success">
                  <CheckCircle2 className="h-4 w-4" /> What's working
                </p>
                {report.strengths.length ? (
                  <ul className="space-y-1.5 text-sm text-foreground/90">
                    {report.strengths.map((s, i) => (
                      <li key={i} className="leading-snug">
                        {s}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Work the fixes on the right first — strengths will follow.
                  </p>
                )}
              </div>
              <div className="space-y-2 rounded-xl border border-primary/30 bg-primary/5 p-4">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-primary">
                  <Wrench className="h-4 w-4" /> Fix these next
                </p>
                <ol className="space-y-1.5 text-sm text-foreground/90">
                  {report.fixes.map((f, i) => (
                    <li key={i} className="flex gap-2 leading-snug">
                      <span className="font-semibold text-primary">{i + 1}.</span>
                      {f}
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {history.length > 0 && (
        <Card className="border-border/60 shadow-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="flex items-center gap-1.5 font-serif text-lg">
              <HistoryIcon className="h-4 w-4 text-muted-foreground" /> Your
              progress
            </CardTitle>
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-success">
              <TrendingUp className="h-3.5 w-3.5" /> Best {best}
            </span>
          </CardHeader>
          <CardContent className="space-y-2">
            {history.slice(0, 8).map((h) => {
              const tone = scoreTone(h.score);
              return (
                <div
                  key={h.id}
                  className="flex items-center gap-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-2"
                >
                  <span
                    className={`w-8 shrink-0 text-center font-serif text-lg font-semibold ${tone.text}`}
                  >
                    {h.score}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs text-foreground">{h.topFix}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {new Date(h.date).toLocaleDateString()} · {h.postCount}{" "}
                      {h.postCount === 1 ? "post" : "posts"}
                    </p>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
