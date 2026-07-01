import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import {
  loadDrafts,
  setDraftStatus,
  draftStatus,
  type DraftEntry,
} from "@/lib/draftHistory";
import {
  ChevronLeft,
  ChevronRight,
  CalendarClock,
  CalendarDays,
  List,
  CheckCircle2,
} from "lucide-react";

const PLATFORM_LABEL: Record<string, string> = {
  linkedin: "LinkedIn",
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
};
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

// The date a post "sits on" in the calendar: scheduled date, else posted date.
function eventDate(d: DraftEntry): string | null {
  const s = draftStatus(d);
  if (s === "scheduled" && d.scheduledFor) return d.scheduledFor.slice(0, 10);
  if (s === "posted" && d.postedAt) return d.postedAt.slice(0, 10);
  return null;
}

export default function CalendarPage() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<DraftEntry[]>([]);
  const [view, setView] = useState<"month" | "list">("month");
  const [cursor, setCursor] = useState({ y: 0, m: 0 });
  const [pickDraft, setPickDraft] = useState<string>("");
  const [pickDate, setPickDate] = useState<string>("");

  useEffect(() => {
    document.title = "Calendar - Content Studio";
    const now = new Date();
    setCursor({ y: now.getFullYear(), m: now.getMonth() });
    let active = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!active) return;
      const id = data.user?.id ?? null;
      setUserId(id);
      setDrafts(loadDrafts(id));
    })();
    return () => {
      active = false;
    };
  }, []);

  const byDate = useMemo(() => {
    const map = new Map<string, DraftEntry[]>();
    for (const d of drafts) {
      const key = eventDate(d);
      if (!key) continue;
      const arr = map.get(key) ?? [];
      arr.push(d);
      map.set(key, arr);
    }
    return map;
  }, [drafts]);

  const unscheduled = useMemo(
    () => drafts.filter((d) => draftStatus(d) === "draft"),
    [drafts],
  );

  const upcoming = useMemo(() => {
    const today = ymd(new Date());
    return drafts
      .filter((d) => {
        const key = eventDate(d);
        return key !== null && key >= today;
      })
      .sort((a, b) => (eventDate(a)! < eventDate(b)! ? -1 : 1));
  }, [drafts]);

  const handleSchedule = () => {
    if (!userId || !pickDraft || !pickDate) return;
    setDrafts(setDraftStatus(userId, pickDraft, "scheduled", pickDate));
    setPickDraft("");
    setPickDate("");
    toast({
      title: "Scheduled",
      description: "It'll show on your calendar. Mark it posted once it's live.",
    });
  };

  const markPosted = (id: string) => {
    if (!userId) return;
    setDrafts(setDraftStatus(userId, id, "posted"));
  };

  // Build the month grid (Monday-first).
  const grid = useMemo(() => {
    const first = new Date(cursor.y, cursor.m, 1);
    const startOffset = (first.getDay() + 6) % 7; // Mon=0
    const start = new Date(cursor.y, cursor.m, 1 - startOffset);
    const cells: Date[] = [];
    for (let i = 0; i < 42; i++) {
      cells.push(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
    }
    return cells;
  }, [cursor]);

  const monthLabel = new Date(cursor.y, cursor.m, 1).toLocaleDateString(
    undefined,
    { month: "long", year: "numeric" },
  );
  const todayKey = ymd(new Date());

  const shiftMonth = (delta: number) => {
    setCursor((c) => {
      const d = new Date(c.y, c.m + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  };

  return (
    <div className="space-y-6">
      <header className="space-y-1.5">
        <h1 className="font-serif text-2xl font-semibold leading-tight tracking-tight text-foreground sm:text-3xl">
          Calendar
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Plan what goes out and when. Schedule a draft, then mark it posted
          once it's live — this is your running record of what you've shipped.
        </p>
      </header>

      {/* Schedule a draft */}
      <Card className="border-border/60 shadow-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-serif text-lg">
            <CalendarClock className="h-4 w-4 text-primary" /> Schedule a post
          </CardTitle>
        </CardHeader>
        <CardContent>
          {unscheduled.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No unscheduled drafts right now.{" "}
              <button
                type="button"
                onClick={() => navigate("/generate")}
                className="font-semibold text-primary hover:underline"
              >
                Write a post
              </button>{" "}
              to schedule one.
            </p>
          ) : (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1 space-y-1.5">
                <Label>Draft</Label>
                <Select value={pickDraft} onValueChange={setPickDraft}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pick a draft to schedule" />
                  </SelectTrigger>
                  <SelectContent>
                    {unscheduled.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {(d.hook || d.draft).slice(0, 50)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sched-date">Date</Label>
                <input
                  id="sched-date"
                  type="date"
                  value={pickDate}
                  min={todayKey}
                  onChange={(e) => setPickDate(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-44"
                />
              </div>
              <Button
                onClick={handleSchedule}
                disabled={!pickDraft || !pickDate}
                className="gap-1.5"
              >
                <CalendarClock className="h-4 w-4" /> Schedule
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* View toggle */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border border-border/70 bg-muted/30 p-0.5">
          <button
            type="button"
            onClick={() => setView("month")}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold ${
              view === "month" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground"
            }`}
          >
            <CalendarDays className="h-3.5 w-3.5" /> Month
          </button>
          <button
            type="button"
            onClick={() => setView("list")}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold ${
              view === "list" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground"
            }`}
          >
            <List className="h-3.5 w-3.5" /> Upcoming
          </button>
        </div>
        {view === "month" && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => shiftMonth(-1)}
              className="rounded-md border border-border/70 p-1.5 text-muted-foreground hover:text-foreground"
              aria-label="Previous month"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-[8.5rem] text-center text-sm font-semibold text-foreground">
              {monthLabel}
            </span>
            <button
              type="button"
              onClick={() => shiftMonth(1)}
              className="rounded-md border border-border/70 p-1.5 text-muted-foreground hover:text-foreground"
              aria-label="Next month"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {view === "month" ? (
        <Card className="overflow-hidden border-border/60 shadow-card">
          <div className="overflow-x-auto">
            <div className="min-w-[620px]">
          <div className="grid grid-cols-7 border-b border-border/60 bg-muted/30 text-center text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {WEEKDAYS.map((w) => (
              <div key={w} className="py-2">
                {w}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {grid.map((day, i) => {
              const key = ymd(day);
              const inMonth = day.getMonth() === cursor.m;
              const isToday = key === todayKey;
              const events = byDate.get(key) ?? [];
              return (
                <div
                  key={i}
                  className={`min-h-[84px] border-b border-r border-border/50 p-1.5 ${
                    inMonth ? "bg-card" : "bg-muted/20"
                  }`}
                >
                  <div
                    className={`mb-1 flex h-5 w-5 items-center justify-center rounded-full text-[11px] ${
                      isToday
                        ? "bg-primary font-bold text-primary-foreground"
                        : inMonth
                          ? "text-foreground"
                          : "text-muted-foreground/50"
                    }`}
                  >
                    {day.getDate()}
                  </div>
                  <div className="space-y-1">
                    {events.slice(0, 3).map((e) => {
                      const posted = draftStatus(e) === "posted";
                      return (
                        <button
                          key={e.id}
                          type="button"
                          onClick={() =>
                            navigate(`/generate?draft=${encodeURIComponent(e.id)}`)
                          }
                          title={e.hook || e.draft.slice(0, 60)}
                          className={`block w-full truncate rounded px-1.5 py-0.5 text-left text-[10px] font-medium ${
                            posted
                              ? "bg-success/15 text-success"
                              : "bg-primary/15 text-primary"
                          }`}
                        >
                          {PLATFORM_LABEL[e.platform] ?? e.platform}:{" "}
                          {(e.hook || e.draft).slice(0, 22)}
                        </button>
                      );
                    })}
                    {events.length > 3 && (
                      <span className="px-1 text-[10px] text-muted-foreground">
                        +{events.length - 3} more
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
            </div>
          </div>
        </Card>
      ) : (
        <div className="space-y-2">
          {upcoming.length === 0 ? (
            <Card className="border-border/60 shadow-card">
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                Nothing scheduled yet. Schedule a draft above to see it here.
              </CardContent>
            </Card>
          ) : (
            upcoming.map((e) => {
              const posted = draftStatus(e) === "posted";
              const date = eventDate(e)!;
              return (
                <div
                  key={e.id}
                  className="flex items-center gap-3 rounded-xl border border-border/70 bg-card p-3 shadow-card"
                >
                  <div className="w-14 shrink-0 text-center">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                      {new Date(date + "T00:00:00").toLocaleDateString(undefined, {
                        month: "short",
                      })}
                    </div>
                    <div className="font-serif text-lg font-semibold text-foreground">
                      {new Date(date + "T00:00:00").getDate()}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      navigate(`/generate?draft=${encodeURIComponent(e.id)}`)
                    }
                    className="min-w-0 flex-1 text-left"
                  >
                    <p className="truncate text-sm font-medium text-foreground">
                      {e.hook || e.draft.slice(0, 60)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {PLATFORM_LABEL[e.platform] ?? e.platform} ·{" "}
                      {posted ? "Posted" : "Scheduled"}
                    </p>
                  </button>
                  {!posted && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => markPosted(e.id)}
                      className="gap-1.5 text-xs text-success hover:text-success"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" /> Posted
                    </Button>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
