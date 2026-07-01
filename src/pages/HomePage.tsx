import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import {
  loadDrafts,
  getDraftStats,
  getPostingActivity,
  draftStatus,
  type DraftEntry,
  type DraftStats,
  type PostingActivity,
} from "@/lib/draftHistory";
import { loadPositioning } from "@/lib/positioning";
import { loadCoachHistory } from "@/lib/coach";
import { loadVoiceProfile, isVoiceProfileUsable } from "@/lib/voiceProfile";
import {
  Pencil,
  CalendarRange,
  Lightbulb,
  Users as UsersIcon,
  Mic,
  ArrowRight,
  CheckCircle2,
  Circle,
  Clock,
  FileText,
  Sparkles,
  CalendarClock,
  Gauge,
  Flame,
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
          <div className="mt-1 truncate text-xs text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function HomePage() {
  const [drafts, setDrafts] = useState<DraftEntry[]>([]);
  const [stats, setStats] = useState<DraftStats | null>(null);
  const [voiceReady, setVoiceReady] = useState<boolean>(true);
  const [coachRuns, setCoachRuns] = useState<number>(0);
  const [activity, setActivity] = useState<PostingActivity>({
    thisWeekPosted: 0,
    weekStreak: 0,
  });
  const [cadence, setCadence] = useState<number>(0);
  const [name, setName] = useState<string>("");

  useEffect(() => {
    document.title = "Home - Content Studio";
    let active = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!active) return;
      const id = data.user?.id ?? null;
      const email = data.user?.email ?? "";
      setName(email ? email.split("@")[0].replace(/[._-]+/g, " ") : "");
      setDrafts(loadDrafts(id));
      setStats(getDraftStats(id));
      setVoiceReady(isVoiceProfileUsable(loadVoiceProfile(id)));
      setCoachRuns(loadCoachHistory(id).length);
      setActivity(getPostingActivity(id));
      setCadence(loadPositioning(id)?.cadence ?? 0);
    })();
    return () => {
      active = false;
    };
  }, []);

  const recent = useMemo(() => drafts.slice(0, 3), [drafts]);
  const hasPosts = drafts.length > 0;

  const upcoming = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return drafts
      .filter(
        (d) =>
          draftStatus(d) === "scheduled" &&
          d.scheduledFor &&
          d.scheduledFor.slice(0, 10) >= today,
      )
      .sort((a, b) => (a.scheduledFor! < b.scheduledFor! ? -1 : 1))
      .slice(0, 3);
  }, [drafts]);

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
      {/* Greeting + primary actions */}
      <section className="space-y-5">
        <header className="space-y-1.5">
          <h1 className="font-serif text-3xl font-semibold leading-tight tracking-tight text-foreground">
            {greeting()}
            {name ? (
              <span className="capitalize">, {name}</span>
            ) : null}
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            {hasPosts
              ? "Here's where your content stands. Keep the streak going — one post beats a perfect post."
              : "Let's get your first post out. Pick a topic, answer a few questions, and you'll have a draft in about a minute."}
          </p>
        </header>

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
                      )
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
      {(hasPosts || cadence > 0) && (
        <section className="grid gap-3 sm:grid-cols-2">
          <Card className="border-border/60 shadow-card">
            <CardContent className="space-y-2 py-4">
              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold text-foreground">This week</span>
                <span className="text-muted-foreground">
                  {activity.thisWeekPosted}
                  {cadence > 0 ? ` / ${cadence}` : ""} posted
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-gradient-primary transition-all duration-500"
                  style={{
                    width: `${Math.min(
                      100,
                      cadence > 0
                        ? (activity.thisWeekPosted / cadence) * 100
                        : activity.thisWeekPosted > 0
                          ? 100
                          : 0,
                    )}%`,
                  }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {cadence > 0
                  ? activity.thisWeekPosted >= cadence
                    ? "Goal hit for the week. Nice."
                    : `${cadence - activity.thisWeekPosted} to go to hit your weekly goal.`
                  : "Set a weekly goal in Plan to track your rhythm."}
              </p>
            </CardContent>
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
                    ? "Posting streak — keep it alive."
                    : "Post once this week to start a streak."}
                </p>
              </div>
            </CardContent>
          </Card>
        </section>
      )}

      {/* Set-your-voice nudge */}
      {!voiceReady && (
        <Card className="border-primary/20 bg-primary/5 shadow-card">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
            <div className="flex items-start gap-2.5">
              <Mic className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <div>
                <p className="text-sm font-semibold text-foreground">
                  Make every draft sound like you
                </p>
                <p className="text-xs text-muted-foreground">
                  Paste a few of your past posts once. It's the biggest quality
                  lever in the whole tool.
                </p>
              </div>
            </div>
            <Button asChild size="sm" variant="outline" className="gap-1.5">
              <Link to="/voice">
                <Mic className="h-3.5 w-3.5" /> Set your voice
              </Link>
            </Button>
          </CardContent>
        </Card>
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
                No posts yet. Your drafts and published posts will show up here.
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
