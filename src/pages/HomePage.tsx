import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ToastAction } from "@/components/ui/toast";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import {
  loadDrafts,
  getDraftStats,
  getPostingActivity,
  draftStatus,
  setDraftStatus,
  undoPosted,
  type DraftEntry,
  type DraftStats,
  type PostingActivity,
} from "@/lib/draftHistory";
import { GOAL_PLATFORMS, MAX_WEEKLY_GOAL, loadGoals, saveGoals, weekProgress, type WeeklyGoals } from "@/lib/goals";
import {
  daysOverdue,
  dueHeading,
  localDateKey,
  overdueLabel,
  scheduleTime,
  timeLabel,
} from "@/lib/dueDates";
import { loadCoachHistory } from "@/lib/coach";
import { loadVoiceProfile, isVoiceProfileUsable } from "@/lib/voiceProfile";
import { isOnboarded } from "@/lib/onboarding";
import { loadResult, nextAction, type NextAction } from "@/lib/diagnosis";
import {
  Pencil,
  CalendarRange,
  Lightbulb,
  Users as UsersIcon,
  ArrowRight,
  CheckCircle2,
  Circle,
  Clock,
  FileText,
  Sparkles,
  CalendarClock,
  Gauge,
  Flame,
  Layers,
  Target,
  Minus,
  Plus,
} from "lucide-react";

const PLATFORM_LABEL: Record<string, string> = {
  linkedin: "LinkedIn",
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
};

const STATUS_STYLE: Record<string, string> = {
  posted: "border-success/40 bg-success/10 text-success",
  scheduled: "border-primary/40 bg-primary/10 text-primary",
  draft: "border-border bg-muted text-muted-foreground",
};
const STATUS_LABEL: Record<string, string> = {
  posted: "Posted",
  scheduled: "Scheduled",
  draft: "Draft",
};

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function StatCard({
  icon: Icon,
  value,
  label,
  tint,
}: {
  icon: typeof FileText;
  value: number;
  label: string;
  tint: string;
}) {
  return (
    <Card className="border-border/60 shadow-card">
      <CardContent className="flex items-center gap-3 py-4">
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tint}`}
        >
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <div className="font-serif text-2xl font-semibold leading-none text-foreground">
            {value}
          </div>
          <div className="mt-1 text-xs leading-tight text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function HomePage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<DraftEntry[]>([]);
  const [voiceReady, setVoiceReady] = useState<boolean>(true);
  const [coachRuns, setCoachRuns] = useState<number>(0);
  const [goals, setGoals] = useState<WeeklyGoals>({});
  // Goal being edited on the This week card (null = not editing).
  const [goalDraft, setGoalDraft] = useState<WeeklyGoals | null>(null);
  const [name, setName] = useState<string>("");
  const [nextAct, setNextAct] = useState<NextAction | null>(null);
  const [contentScore, setContentScore] = useState<number | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    document.title = "Home - Content Studio";
    let active = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!active) return;
      const id = data.user?.id ?? null;
      // First-run: brand-new users get the welcome walkthrough once.
      const firstRun =
        loadDrafts(id).length === 0 &&
        !isVoiceProfileUsable(loadVoiceProfile(id)) &&
        !isOnboarded(id);
      if (firstRun) {
        navigate("/welcome", { replace: true });
        return;
      }
      setUserId(id);
      const email = data.user?.email ?? "";
      const prefix = email.split("@")[0].replace(/[._-]+/g, " ").trim();
      setName(/^[a-zA-Z ]{2,18}$/.test(prefix) ? prefix : "");
      setDrafts(loadDrafts(id));
      setVoiceReady(isVoiceProfileUsable(loadVoiceProfile(id)));
      setCoachRuns(loadCoachHistory(id).length);
      setGoals(loadGoals(id));
      const diag = loadResult(id);
      setContentScore(diag?.overall ?? null);
      setNextAct(nextAction(diag));
    })();
    return () => {
      active = false;
    };
  }, []);

  // Unfinished drafts first: scheduled posts already show in the due card and Coming up.
  // Recounted from the saved posts whenever they change, so Mark posted here moves the numbers too.
  const stats = useMemo<DraftStats | null>(() => (userId ? getDraftStats(userId) : null), [userId, drafts]);
  const activity = useMemo<PostingActivity>(() => getPostingActivity(userId), [userId, drafts]);

  const recent = useMemo(() => {
    const inProgress = drafts.filter((d) => draftStatus(d) === "draft");
    return (inProgress.length ? inProgress : drafts).slice(0, 3);
  }, [drafts]);
  const hasPosts = drafts.length > 0;

  const upcoming = useMemo(() => {
    const today = localDateKey();
    return drafts
      .filter(
        (d) =>
          draftStatus(d) === "scheduled" &&
          d.scheduledFor &&
          d.scheduledFor.slice(0, 10) > today, // today's are in the due card
      )
      .sort((a, b) => (a.scheduledFor! < b.scheduledFor! ? -1 : 1))
      .slice(0, 3);
  }, [drafts]);

  // Posts due today or overdue — the in-app reminder that drives the habit.
  // Most recently due first, each with how late it is.
  const dueNow = useMemo(() => {
    const today = localDateKey();
    return drafts
      .filter(
        (d) =>
          draftStatus(d) === "scheduled" &&
          d.scheduledFor &&
          d.scheduledFor.slice(0, 10) <= today,
      )
      .map((d) => ({ draft: d, days: daysOverdue(d.scheduledFor!, today) }))
      .sort((a, b) => a.days - b.days || (a.draft.scheduledFor! < b.draft.scheduledFor! ? -1 : 1));
  }, [drafts]);
  const overdueCount = dueNow.filter((d) => d.days > 0).length;

  const week = useMemo(() => weekProgress(drafts, goals), [drafts, goals]);
  const goalHit = week.goal > 0 && week.rows.every((r) => r.posted >= r.goal);
  const saveGoal = () => {
    if (!userId || !goalDraft) return;
    setGoals(saveGoals(userId, goalDraft));
    setGoalDraft(null);
  };

  const markDuePosted = (id: string) => {
    const prev = drafts.find((d) => d.id === id);
    if (!userId || !prev) return;
    const before = drafts;
    setDrafts(setDraftStatus(userId, id, "posted"));
    toast({
      title: "Marked as posted",
      action: (
        <ToastAction altText="Undo" onClick={() => setDrafts(undoPosted(userId, prev, before))}>
          Undo
        </ToastAction>
      ),
    });
  };

  const checklist = [
    { done: voiceReady, label: "Set your voice", to: "/voice" },
    { done: hasPosts, label: "Write your first post", to: "/generate" },
    { done: upcoming.length > 0 || (stats?.scheduled ?? 0) > 0, label: "Schedule a post", to: "/calendar" },
    { done: coachRuns > 0, label: "Check your content in Coach", to: "/coach" },
  ];
  const checklistDone = checklist.filter((c) => c.done).length;
  const showChecklist = checklistDone < checklist.length;

  return (
    <div className="space-y-8">
      {/* Due today / overdue reminder */}
      {dueNow.length > 0 && (
        <section className="space-y-2 rounded-xl border border-warning/40 bg-warning/5 p-4">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <CalendarClock className="h-4 w-4 text-warning" />
            {dueHeading(dueNow.length, overdueCount)}
          </p>
          <div className="space-y-1.5">
            {dueNow.slice(0, 3).map(({ draft: d, days }) => (
              <div
                key={d.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 bg-background px-3 py-2"
              >
                <div className="w-full min-w-0 sm:w-auto sm:flex-1">
                  <p className="line-clamp-2 text-sm font-medium text-foreground sm:truncate">
                    {d.hook || d.draft.slice(0, 60) || "Untitled"}
                  </p>
                  <p
                    className={`text-[11px] ${days > 0 ? "font-medium text-foreground" : "text-muted-foreground"}`}
                  >
                    {overdueLabel(days, scheduleTime(d.scheduledFor))}
                    {days > 0 && (
                      <>
                        {" "}
                        · scheduled{" "}
                        {new Date(d.scheduledFor!.slice(0, 10) + "T00:00:00").toLocaleDateString(undefined, {
                          day: "numeric",
                          month: "short",
                        })}
                        {scheduleTime(d.scheduledFor) && `, ${timeLabel(scheduleTime(d.scheduledFor)!)}`}
                      </>
                    )}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Button asChild variant="outline" size="sm" className="h-9 px-3 text-xs sm:h-8 sm:px-2.5">
                    <Link to={`/generate?draft=${d.id}`}>Open</Link>
                  </Button>
                  {days > 0 && (
                    <Button asChild variant="outline" size="sm" className="h-9 px-3 text-xs sm:h-8 sm:px-2.5">
                      <Link to="/calendar#overdue">Reschedule</Link>
                    </Button>
                  )}
                  <Button
                    size="sm"
                    onClick={() => markDuePosted(d.id)}
                    className="h-9 gap-1 px-3 text-xs sm:h-8 sm:px-2.5"
                  >
                    <CheckCircle2 className="h-3 w-3" /> Mark posted
                  </Button>
                </div>
              </div>
            ))}
          </div>
          {dueNow.length > 3 && (
            <Link
              to="/calendar"
              className="inline-block py-1 text-xs font-medium text-primary hover:underline"
            >
              See all {dueNow.length} on the calendar
            </Link>
          )}
        </section>
      )}

      {/* Greeting + primary actions */}
      <section className="space-y-5">
        <header>
          <h1 className="font-serif text-3xl font-semibold leading-tight tracking-tight text-foreground">
            {greeting()}
            {name ? (
              <span className="capitalize">, {name}</span>
            ) : null}
          </h1>
        </header>

        {/* Your next move — the single most important thing to do now. Driven
            by the Content Diagnosis so the Home never leaves you wondering. */}
        {nextAct?.kind === "mission" && nextAct.mission && (
          <Card className="border-primary/30 bg-primary/[0.05] shadow-card">
            <CardContent className="space-y-3 py-5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
                  Your next move
                </p>
                {contentScore !== null && (
                  <Link
                    to="/coach"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                  >
                    <Gauge className="h-3.5 w-3.5" /> Score {contentScore}/100
                  </Link>
                )}
              </div>
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Target className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">
                    {nextAct.headline}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-foreground">
                    Mission: {nextAct.mission.title}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {nextAct.mission.objective}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  asChild
                  className="gap-2 bg-gradient-primary text-primary-foreground shadow-sm hover:opacity-95"
                >
                  <Link to={nextAct.mission.to}>
                    Start mission <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" /> ~{nextAct.mission.effortMins} min
                </span>
              </div>
            </CardContent>
          </Card>
        )}
        {nextAct?.kind === "diagnose" && (
          <Card className="border-primary/20 bg-primary/[0.04] shadow-card">
            <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
              <div className="flex items-start gap-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Gauge className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    Get your Content Score
                  </p>
                  <p className="max-w-md text-xs text-muted-foreground">
                    {nextAct.detail}
                  </p>
                </div>
              </div>
              <Button asChild size="sm" className="gap-1.5">
                <Link to="/coach">
                  Start diagnosis <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}
        {nextAct?.kind === "maintain" && contentScore !== null && (
          <Card className="border-success/30 bg-success/[0.05] shadow-card">
            <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
              <div className="flex items-start gap-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-success/10 text-success">
                  <Sparkles className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {nextAct.headline}
                  </p>
                  <p className="max-w-md text-xs text-muted-foreground">
                    {nextAct.detail}
                  </p>
                </div>
              </div>
              <Link
                to="/coach"
                className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
              >
                <Gauge className="h-3.5 w-3.5" /> Score {contentScore}/100
              </Link>
            </CardContent>
          </Card>
        )}

        <div className="flex flex-col gap-3 sm:flex-row">
          <Button
            asChild
            size="lg"
            className="gap-2 bg-gradient-primary text-primary-foreground shadow-elegant hover:opacity-95"
          >
            <Link to="/generate">
              <Pencil className="h-4 w-4" /> Write a post
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="gap-2">
            <Link to="/plan">
              <CalendarRange className="h-4 w-4" /> Plan a week
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="gap-2">
            <Link to="/generate/batch">
              <Layers className="h-4 w-4" /> Weekly batch
            </Link>
          </Button>
        </div>
      </section>

      {/* Get-started checklist (until all four are done) */}
      {showChecklist && (
        <Card className="border-primary/20 bg-primary/[0.04] shadow-card">
          <CardContent className="space-y-3 py-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-foreground">
                Get set up
              </p>
              <span className="text-xs font-medium text-muted-foreground">
                {checklistDone} / {checklist.length} done
              </span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {checklist.map((c) => (
                <Link
                  key={c.label}
                  to={c.to}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                    c.done
                      ? "border-success/30 bg-success/5 text-muted-foreground"
                      : "border-border/70 bg-card text-foreground hover:border-primary/40"
                  }`}
                >
                  {c.done ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
                  ) : (
                    <Circle className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className={c.done ? "line-through" : "font-medium"}>
                    {c.label}
                  </span>
                  {!c.done && (
                    <ArrowRight className="ml-auto h-3.5 w-3.5 text-primary" />
                  )}
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Coming up (scheduled) */}
      {upcoming.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-1.5 font-serif text-lg font-semibold text-foreground">
              <CalendarClock className="h-4 w-4 text-primary" /> Coming up
            </h2>
            <Link
              to="/calendar"
              className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
            >
              Calendar <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {upcoming.map((d) => (
              <Link
                key={d.id}
                to={`/generate?draft=${encodeURIComponent(d.id)}`}
                className="flex flex-col rounded-xl border border-border/70 bg-card p-4 shadow-card transition-colors hover:border-primary/40"
              >
                <span className="mb-1.5 inline-flex w-fit items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                  {d.scheduledFor
                    ? new Date(d.scheduledFor.slice(0, 10) + "T00:00:00").toLocaleDateString(
                        undefined,
                        { weekday: "short", month: "short", day: "numeric" },
                      ) + (scheduleTime(d.scheduledFor) ? `, ${timeLabel(scheduleTime(d.scheduledFor)!)}` : "")
                    : "Scheduled"}
                </span>
                <p className="line-clamp-2 text-sm leading-snug text-foreground">
                  {d.hook || d.draft.slice(0, 80)}
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Post tracking stats */}
      {stats && (
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            icon={CheckCircle2}
            value={stats.postedThisMonth}
            label="Posted this month"
            tint="bg-success/10 text-success"
          />
          <StatCard
            icon={Clock}
            value={stats.scheduled}
            label="Scheduled"
            tint="bg-primary/10 text-primary"
          />
          <StatCard
            icon={FileText}
            value={stats.drafts}
            label="Drafts in progress"
            tint="bg-brand/10 text-brand"
          />
          <StatCard
            icon={Sparkles}
            value={stats.posted}
            label="Posted all-time"
            tint="bg-accent text-foreground"
          />
        </section>
      )}

      {/* Weekly rhythm: consistency vs goal + streak */}
      {(hasPosts || week.goal > 0) && (
        <section className="grid gap-3 sm:grid-cols-2">
          <Card className="border-border/60 shadow-card">
            {goalDraft ? (
              <CardContent className="space-y-2 py-4">
                <p className="text-sm font-semibold text-foreground">Posts per week</p>
                {GOAL_PLATFORMS.map((p) => {
                  const n = goalDraft[p] ?? 0;
                  const set = (v: number) => setGoalDraft({ ...goalDraft, [p]: Math.max(0, Math.min(MAX_WEEKLY_GOAL, v)) });
                  return (
                    <div key={p} className="flex items-center justify-between gap-2 text-sm">
                      <span className="text-foreground">{PLATFORM_LABEL[p]}</span>
                      <span className="flex items-center gap-1">
                        <Button type="button" variant="outline" size="icon" className="h-9 w-9" onClick={() => set(n - 1)} disabled={n <= 0} aria-label={`Fewer ${PLATFORM_LABEL[p]} posts`}>
                          <Minus className="h-3.5 w-3.5" />
                        </Button>
                        <span className={`w-8 text-center font-semibold tabular-nums ${n ? "text-foreground" : "text-muted-foreground"}`} aria-live="polite">
                          {n}
                        </span>
                        <Button type="button" variant="outline" size="icon" className="h-9 w-9" onClick={() => set(n + 1)} disabled={n >= MAX_WEEKLY_GOAL} aria-label={`More ${PLATFORM_LABEL[p]} posts`}>
                          <Plus className="h-3.5 w-3.5" />
                        </Button>
                      </span>
                    </div>
                  );
                })}
                <div className="flex justify-end gap-2 pt-1">
                  <Button variant="outline" size="sm" onClick={() => setGoalDraft(null)}>
                    Cancel
                  </Button>
                  <Button size="sm" onClick={saveGoal}>
                    Save goal
                  </Button>
                </div>
              </CardContent>
            ) : (
              <CardContent className="space-y-2 py-4">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="font-semibold text-foreground">This week</span>
                  <span className="flex items-center gap-1 text-muted-foreground">
                    {week.posted}
                    {week.goal > 0 ? ` / ${week.goal}` : ""} posted
                    {week.goal > 0 && (
                      <Button variant="ghost" size="icon" className="-my-2 -mr-2 h-9 w-9" onClick={() => setGoalDraft(goals)} aria-label="Edit weekly goal">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </span>
                </div>
                <div className="flex h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-gradient-primary transition-all duration-500"
                    style={{ width: `${week.goal > 0 ? (week.met / week.goal) * 100 : week.posted > 0 ? 100 : 0}%` }}
                  />
                  {week.goal > 0 && (
                    <div
                      className="h-full bg-primary/30 transition-all duration-500"
                      style={{ width: `${((week.goal - week.toDo - week.met) / week.goal) * 100}%` }}
                    />
                  )}
                </div>
                {week.rows.length > 0 && week.goal > 0 && (
                  <ul className="space-y-1 pt-0.5">
                    {week.rows.map((r) => (
                      <li key={r.platform} className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-medium text-foreground">{PLATFORM_LABEL[r.platform]}</span>
                        <span className="text-right tabular-nums text-muted-foreground">
                          {r.posted} posted, {r.scheduled} scheduled
                          {r.goal > 0 &&
                            (r.toDo > 0 ? (
                              <>
                                {", "}
                                <span className="font-semibold text-foreground">{r.toDo} to do</span>
                              </>
                            ) : r.posted >= r.goal ? (
                              <span className="font-semibold text-success">, done</span>
                            ) : (
                              ", all planned"
                            ))}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {goalHit ? (
                  <p className="text-xs text-muted-foreground">Goal hit for the week. Nice.</p>
                ) : (
                  week.goal === 0 && (
                    <Button variant="link" size="sm" className="h-9 px-0 text-xs" onClick={() => setGoalDraft(goals)}>
                      Set a weekly goal
                    </Button>
                  )
                )}
              </CardContent>
            )}
          </Card>
          <Card className="border-border/60 shadow-card">
            <CardContent className="flex items-center gap-3 py-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-warning/10 text-warning">
                <Flame className="h-5 w-5" />
              </span>
              <div>
                <div className="font-serif text-2xl font-semibold leading-none text-foreground">
                  {activity.weekStreak}{" "}
                  <span className="text-base font-normal text-muted-foreground">
                    {activity.weekStreak === 1 ? "week" : "weeks"}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {activity.weekStreak > 0
                    ? "Posting streak. Keep it alive."
                    : "Post once this week to start a streak."}
                </p>
              </div>
            </CardContent>
          </Card>
        </section>
      )}

      {/* Pick up where you left off */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-lg font-semibold text-foreground">
            {hasPosts ? "Pick up where you left off" : "Your posts"}
          </h2>
          {hasPosts && (
            <Link
              to="/drafts"
              className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
            >
              See all <ArrowRight className="h-3 w-3" />
            </Link>
          )}
        </div>

        {hasPosts ? (
          <div className="grid gap-3 sm:grid-cols-3">
            {recent.map((d) => {
              const s = draftStatus(d);
              return (
                <Link
                  key={d.id}
                  to={`/generate?draft=${encodeURIComponent(d.id)}`}
                  className="flex flex-col rounded-xl border border-border/70 bg-card p-4 shadow-card transition-colors hover:border-primary/40"
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${STATUS_STYLE[s]}`}
                    >
                      {STATUS_LABEL[s]}
                    </span>
                    <span className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                      {PLATFORM_LABEL[d.platform] ?? d.platform}
                    </span>
                  </div>
                  <p className="line-clamp-3 text-sm leading-relaxed text-foreground">
                    {d.hook || d.draft.slice(0, 90)}
                  </p>
                  <span className="mt-auto pt-3 text-[11px] font-medium text-primary">
                    Open &rarr;
                  </span>
                </Link>
              );
            })}
          </div>
        ) : (
          <Card className="border-border/60 shadow-card">
            <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Pencil className="h-5 w-5" />
              </span>
              <p className="text-sm text-muted-foreground">
                No posts yet.
              </p>
              <Button asChild size="sm" className="gap-1.5">
                <Link to="/generate">
                  <Pencil className="h-3.5 w-3.5" /> Write your first post
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}
      </section>

      {/* Discover */}
      <section className="space-y-3">
        <h2 className="font-serif text-lg font-semibold text-foreground">
          Need an idea?
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Link
            to="/inspiration"
            className="group flex items-start gap-3 rounded-xl border border-border/70 bg-card p-4 shadow-card transition-colors hover:border-primary/40"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand">
              <Lightbulb className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-semibold text-foreground">
                Browse inspiration
              </p>
              <p className="text-xs text-muted-foreground">
                100 real posts that worked. Steal the pattern, make it yours.
              </p>
            </div>
          </Link>
          <Link
            to="/profiles"
            className="group flex items-start gap-3 rounded-xl border border-border/70 bg-card p-4 shadow-card transition-colors hover:border-primary/40"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <UsersIcon className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-semibold text-foreground">
                Follow creators
              </p>
              <p className="text-xs text-muted-foreground">
                SG finance creators worth studying for angles and formats.
              </p>
            </div>
          </Link>
        </div>
      </section>
    </div>
  );
}
