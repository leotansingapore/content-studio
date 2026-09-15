import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
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
  COACH_FIELDS,
  loadCoachProfile,
  updateCoachProfile,
  recordPreference,
  removePreference,
  profileCompleteness,
  hasAnyProfile,
  coachContext,
  type CoachProfile,
} from "@/lib/coachProfile";
import {
  loadResult,
  loadDiagnosis,
  saveDiagnosis,
  scoreDiagnosis,
  type DiagnosisResult,
  type DiagnosisRecord,
} from "@/lib/diagnosis";
import DiagnosisQuiz from "@/components/DiagnosisQuiz";
import DiagnosisSummary from "@/components/DiagnosisSummary";
import {
  Gauge,
  Sparkles,
  CheckCircle2,
  Wrench,
  History as HistoryIcon,
  TrendingUp,
  PenLine,
  Compass,
  Heart,
  ThumbsDown,
  X,
  Plus,
  Save,
  BookOpen,
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
        <circle cx="50" cy="50" r={r} fill="none" className="stroke-muted" strokeWidth="8" />
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
        <span className="font-serif text-3xl font-semibold text-foreground">{score}</span>
        <span className={`text-[11px] font-semibold ${tone.text}`}>{tone.label}</span>
      </div>
    </div>
  );
}

function Bar({ label, score, note }: { label: string; score: number; note: string }) {
  const color = score >= 80 ? "bg-success" : score >= 50 ? "bg-primary" : "bg-warning";
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
      <p className="text-sm leading-relaxed text-muted-foreground">{note}</p>
    </div>
  );
}

/** Chips of things the Coach has learned; each removable. */
function PrefChips({
  items,
  kind,
  onRemove,
}: {
  items: string[];
  kind: "like" | "dislike";
  onRemove: (note: string) => void;
}) {
  const tint =
    kind === "like"
      ? "border-success/30 bg-success/5 text-foreground"
      : "border-destructive/30 bg-destructive/5 text-foreground";
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((it) => (
        <span
          key={it}
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${tint}`}
        >
          {it}
          <button
            type="button"
            aria-label={`Remove ${it}`}
            onClick={() => onRemove(it)}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
    </div>
  );
}

export default function CoachPage() {
  const [userId, setUserId] = useState<string | null>(null);

  // Coaching profile (the Coach's memory).
  const [profile, setProfile] = useState<CoachProfile | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<number>(0);
  const [newLike, setNewLike] = useState("");
  const [newDislike, setNewDislike] = useState("");
  const [diag, setDiag] = useState<DiagnosisResult | null>(null);
  const [role, setRole] = useState<string | undefined>();
  const [showQuiz, setShowQuiz] = useState(false);
  const [ready, setReady] = useState(false);

  // Post review (unchanged craft analyzer).
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
      const p = loadCoachProfile(id);
      setProfile(p);
      setFields(
        Object.fromEntries(COACH_FIELDS.map((f) => [f.key, p[f.key] as string])),
      );
      const result = loadResult(id);
      setDiag(result);
      setRole(loadDiagnosis(id)?.role);
      setShowQuiz(!result); // no diagnosis yet → run it first
      setHistory(loadCoachHistory(id));
      setInAppCount(loadDrafts(id).length);
      setReady(true);
    })();
    return () => {
      active = false;
    };
  }, []);

  const completeness = useMemo(
    () => (profile ? profileCompleteness(profile) : { filled: 0, total: 0, pct: 0 }),
    [profile],
  );

  const saveProfile = () => {
    if (!userId) return;
    const patch: Partial<CoachProfile> = {};
    for (const f of COACH_FIELDS) patch[f.key] = fields[f.key] ?? "";
    const next = updateCoachProfile(userId, patch);
    setProfile(next);
    setDirty(false);
    setSavedAt(Date.now());
  };

  const handleDiagComplete = (record: DiagnosisRecord) => {
    if (userId) saveDiagnosis(userId, record);
    setDiag(scoreDiagnosis(record.answers));
    setRole(record.role);
    setShowQuiz(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const retakeDiag = () => {
    setShowQuiz(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const addPref = (kind: "like" | "dislike") => {
    if (!userId) return;
    const note = (kind === "like" ? newLike : newDislike).trim();
    if (!note) return;
    setProfile(recordPreference(userId, kind, note));
    if (kind === "like") setNewLike("");
    else setNewDislike("");
  };

  const dropPref = (kind: "like" | "dislike", note: string) => {
    if (!userId) return;
    setProfile(removePreference(userId, kind, note));
  };

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
  const pastedCount = useMemo(
    () => (text.trim() ? splitPastedPosts(text).length : 0),
    [text],
  );

  // Deep-link into Write carrying everything the Coach knows.
  const ctx = profile ? coachContext(profile) : "";
  const draftWithContextUrl = (extra: string) =>
    `/generate?ctx=${encodeURIComponent(`${ctx}\n\n${extra}`)}`;

  const fixesCtx = (report?: CoachReport | null) =>
    report && report.fixes.length
      ? `${ctx ? ctx + "\n\n" : ""}Revise my next post applying these coach fixes: ${report.fixes
          .slice(0, 3)
          .join(" | ")}`
      : "";

  if (!ready) {
    return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  }

  // No diagnosis yet → run it first, right inside the Coach.
  if (showQuiz) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <header className="space-y-2">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Compass className="h-5 w-5" />
            </span>
            <h1 className="font-serif text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              Coach
            </h1>
          </div>
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Let's start with a quick diagnosis so your coach knows exactly where
            to focus. About two minutes.
          </p>
        </header>
        <DiagnosisQuiz onComplete={handleDiagComplete} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-10">
      <header className="space-y-2">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Compass className="h-5 w-5" />
          </span>
          <h1 className="font-serif text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Coach
          </h1>
        </div>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Your personal content coach. The more it knows about you — your story,
          what's going on in your life, who you're for — the better it can help
          you make content only you could post. It remembers what you tell it and
          learns what you like as you go.
        </p>
      </header>

      {/* ---- Coach diagnosis: where you stand + the one thing to do next -- */}
      {diag && (
        <section className="space-y-4">
          <div>
            <h2 className="font-serif text-lg font-semibold text-foreground">
              Coach diagnosis
            </h2>
            <p className="text-sm text-muted-foreground">
              Where you stand right now, and the one thing to work on next.
            </p>
          </div>
          <DiagnosisSummary result={diag} role={role} onRetake={retakeDiag} />
        </section>
      )}

      {/* ---- About you: the intake ------------------------------------- */}
      <section className="space-y-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="font-serif text-lg font-semibold text-foreground">
              About you
            </h2>
            <p className="text-sm text-muted-foreground">
              Answer what you can — you can always come back and add more.
            </p>
          </div>
          <span className="shrink-0 text-xs font-medium text-muted-foreground">
            {completeness.filled}/{completeness.total} answered
          </span>
        </div>

        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-gradient-primary transition-all duration-500"
            style={{ width: `${completeness.pct}%` }}
          />
        </div>

        <Card className="border-border/60 shadow-card">
          <CardContent className="space-y-5 py-5">
            {COACH_FIELDS.map((f) => (
              <div key={f.key} className="space-y-1.5">
                <Label htmlFor={`coach-${f.key}`} className="text-sm font-semibold">
                  {f.label}
                </Label>
                <p className="text-xs text-muted-foreground">{f.question}</p>
                <Textarea
                  id={`coach-${f.key}`}
                  value={fields[f.key] ?? ""}
                  onChange={(e) => {
                    setFields((prev) => ({ ...prev, [f.key]: e.target.value }));
                    setDirty(true);
                  }}
                  rows={2}
                  placeholder={f.placeholder}
                  className="resize-none"
                />
              </div>
            ))}
            <div className="flex items-center gap-3">
              <Button
                onClick={saveProfile}
                disabled={!dirty}
                className="gap-1.5 bg-gradient-primary text-primary-foreground hover:opacity-95"
              >
                <Save className="h-4 w-4" /> Save what you told me
              </Button>
              {savedAt > 0 && !dirty && (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Saved
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        {profile && hasAnyProfile(profile) && ctx && (
          <Button
            asChild
            variant="outline"
            className="w-full justify-center gap-2 sm:w-auto"
          >
            <Link
              to={draftWithContextUrl(
                "Give me one post idea that draws on my real story and fits my audience.",
              )}
            >
              <PenLine className="h-4 w-4" /> Draft with everything the Coach knows
            </Link>
          </Button>
        )}
      </section>

      {/* ---- What the Coach has learned -------------------------------- */}
      <section className="space-y-4">
        <div>
          <h2 className="font-serif text-lg font-semibold text-foreground">
            What the Coach has learned about you
          </h2>
          <p className="text-sm text-muted-foreground">
            Tell it what lands and what to steer clear of. It uses this every time
            it drafts for you.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="border-border/60 shadow-card">
            <CardContent className="space-y-3 py-4">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-success">
                <Heart className="h-4 w-4" /> Lean into
              </p>
              {profile && profile.likes.length > 0 ? (
                <PrefChips
                  items={profile.likes}
                  kind="like"
                  onRemove={(n) => dropPref("like", n)}
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  Nothing yet — add what you enjoy making or what performs.
                </p>
              )}
              <div className="flex gap-2">
                <Input
                  value={newLike}
                  onChange={(e) => setNewLike(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addPref("like")}
                  placeholder="e.g. behind-the-scenes stories"
                  className="h-9"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => addPref("like")}
                  className="shrink-0 gap-1"
                >
                  <Plus className="h-3.5 w-3.5" /> Add
                </Button>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border/60 shadow-card">
            <CardContent className="space-y-3 py-4">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-destructive">
                <ThumbsDown className="h-4 w-4" /> Steer clear of
              </p>
              {profile && profile.dislikes.length > 0 ? (
                <PrefChips
                  items={profile.dislikes}
                  kind="dislike"
                  onRemove={(n) => dropPref("dislike", n)}
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  Nothing yet — add styles or topics you don't want.
                </p>
              )}
              <div className="flex gap-2">
                <Input
                  value={newDislike}
                  onChange={(e) => setNewDislike(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addPref("dislike")}
                  placeholder="e.g. hard-selling captions"
                  className="h-9"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => addPref("dislike")}
                  className="shrink-0 gap-1"
                >
                  <Plus className="h-3.5 w-3.5" /> Add
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* ---- Review your posts (craft analyzer) ------------------------ */}
      <section className="space-y-4">
        <div>
          <h2 className="font-serif text-lg font-semibold text-foreground">
            Review your posts
          </h2>
          <p className="text-sm text-muted-foreground">
            See how your writing stacks up against what works, and get a short list
            of fixes. Paste a few recent posts, or grade the ones you made here.
          </p>
        </div>

        <Card className="border-border/60 shadow-card">
          <CardContent className="space-y-3 py-5">
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label htmlFor="coach-text">
                  Paste your recent posts
                  <span className="ml-1 font-normal text-muted-foreground">
                    (separate each with a line of ---)
                  </span>
                </Label>
                {pastedCount > 0 && (
                  <span className="rounded-full border border-primary/30 bg-primary/5 px-2 py-0.5 text-[11px] font-medium text-primary">
                    {pastedCount} {pastedCount === 1 ? "post" : "posts"} detected
                  </span>
                )}
              </div>
              <Textarea
                id="coach-text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={7}
                placeholder={"Paste your first post here...\n\n---\n\nPaste your next post here..."}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={platform} onValueChange={(v) => setPlatform(v as PlatformId)}>
                <SelectTrigger className="w-36" aria-label="Platform">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="linkedin">LinkedIn</SelectItem>
                  <SelectItem value="instagram">Instagram</SelectItem>
                  <SelectItem value="facebook">Facebook</SelectItem>
                  <SelectItem value="tiktok">TikTok</SelectItem>
                </SelectContent>
              </Select>
              <Button
                onClick={handleAnalyzePasted}
                disabled={text.trim().length < 20}
                className="gap-1.5 bg-gradient-primary text-primary-foreground hover:opacity-95"
              >
                <Gauge className="h-4 w-4" />
                {pastedCount > 1 ? `Analyze ${pastedCount} posts` : "Analyze"}
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
              <div className="flex flex-col items-center gap-4 sm:flex-row">
                <ScoreRing score={report.score} />
                <div className="flex-1 space-y-1 text-center sm:text-left">
                  <p className="font-serif text-lg font-semibold text-foreground">
                    Content score
                  </p>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    Across {report.postCount} {report.postCount === 1 ? "post" : "posts"} ·
                    avg {report.avgWords} words. This is a craft check, not a
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
                    <ul className="space-y-1.5 text-sm leading-relaxed text-foreground/90">
                      {report.strengths.map((s, i) => (
                        <li key={i}>{s}</li>
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
                  <ol className="space-y-1.5 text-sm leading-relaxed text-foreground/90">
                    {report.fixes.map((f, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="font-semibold text-primary">{i + 1}.</span>
                        {f}
                      </li>
                    ))}
                  </ol>
                  {report.fixes.length > 0 && (
                    <Button asChild size="sm" className="mt-1 gap-1.5">
                      <Link to={draftWithContextUrl(fixesCtx(report))}>
                        <PenLine className="h-3.5 w-3.5" /> Revise in Write
                      </Link>
                    </Button>
                  )}
                </div>
              </div>

              {report.perPost.length > 1 && (
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-foreground">Post by post</p>
                  <div className="space-y-1.5">
                    {[...report.perPost]
                      .sort((a, b) => a.score - b.score)
                      .map((p) => {
                        const tone = scoreTone(p.score);
                        return (
                          <div
                            key={p.index}
                            className="flex items-center gap-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-2"
                          >
                            <span
                              className={`w-9 shrink-0 text-center font-serif text-base font-semibold ${tone.text}`}
                            >
                              {p.score}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-xs font-medium text-foreground">
                                {p.snippet || `Post ${p.index + 1}`}
                              </p>
                              <p className="truncate text-[11px] text-muted-foreground">
                                {p.issue || "Solid — no obvious fix."}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {history.length > 0 && (
          <Card className="border-border/60 shadow-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="flex items-center gap-1.5 font-serif text-lg">
                <HistoryIcon className="h-4 w-4 text-muted-foreground" /> Your progress
              </CardTitle>
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-success">
                <TrendingUp className="h-3.5 w-3.5" /> Best {best}
              </span>
            </CardHeader>
            <CardContent className="space-y-2">
              {history.slice(0, 8).map((h) => {
                const tone = scoreTone(h.score);
                const openable = Boolean(h.report);
                return (
                  <button
                    key={h.id}
                    type="button"
                    disabled={!openable}
                    onClick={() => {
                      if (!h.report) return;
                      setReport(h.report);
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                    className={`flex w-full items-center gap-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-left ${
                      openable
                        ? "transition-colors hover:border-primary/40 hover:bg-primary/5"
                        : "cursor-default"
                    }`}
                    title={openable ? "Reopen this report" : "Older run — details not saved"}
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
                        {openable && " · tap to reopen"}
                      </p>
                    </div>
                  </button>
                );
              })}
            </CardContent>
          </Card>
        )}
      </section>

      <p className="flex items-center justify-center gap-1.5 pt-2 text-xs text-muted-foreground">
        <BookOpen className="h-3.5 w-3.5" /> Everything here is saved to your
        account and synced across your devices.
      </p>
    </div>
  );
}
