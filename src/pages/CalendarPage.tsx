import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import SectionTabs, { PIPELINE_TABS } from "@/components/SectionTabs";
import { Link, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { InfoTip } from "@/components/ui/info-tip";
import { ToastAction } from "@/components/ui/toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { REELS_BOARD_OWNERS, brandForProfile, brandOf, fetchBoard } from "@/lib/reelsBoard";
import { activeProfile } from "@/lib/profiles";
import {
  addDays,
  keyToDate,
  localDateKey,
  monthGrid,
  scheduleAt,
  scheduleTime,
  timeLabel,
  weekOf,
} from "@/lib/dueDates";
import {
  loadDrafts,
  setDraftStatus,
  draftStatus,
  type DraftEntry,
} from "@/lib/draftHistory";
import {
  NOTE_COLORS,
  deleteNote,
  loadNotes,
  newNoteId,
  saveNote,
  type CalNote,
  type NoteColor,
} from "@/lib/calendarNotes";
import { sgDateLabel, sgDatesBetween, type SgDate } from "@/data/sgDates";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CalendarClock,
  CalendarDays,
  CalendarRange,
  List,
  CheckCircle2,
  Coins,
  StickyNote,
  X,
} from "lucide-react";

const PLATFORM_LABEL: Record<string, string> = {
  linkedin: "LinkedIn",
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
};
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DRAG_TYPE = "text/draft-id";

type View = "month" | "week" | "list";
type NoteForm = { id: string | null; date: string; title: string; color: NoteColor };

// Note colours are theme tokens, spelled out so Tailwind keeps the classes.
const NOTE_SWATCH: Record<NoteColor, string> = {
  brand: "bg-brand",
  primary: "bg-primary",
  success: "bg-success",
  warning: "bg-warning",
  destructive: "bg-destructive",
};
const NOTE_COLOR_NAME: Record<NoteColor, string> = {
  brand: "Purple",
  primary: "Blue",
  success: "Green",
  warning: "Amber",
  destructive: "Red",
};
const KEY_DATE_DAYS = 60; // how far ahead Upcoming lists holidays and money dates
type StatusFilter = "all" | "scheduled" | "posted";

// The date a post "sits on" in the calendar: scheduled date, else posted date.
function eventDate(d: DraftEntry): string | null {
  const s = draftStatus(d);
  if (s === "scheduled" && d.scheduledFor) return d.scheduledFor.slice(0, 10);
  if (s === "posted" && d.postedAt) return d.postedAt.slice(0, 10);
  return null;
}

// Orders a day's posts: no set time first, then by time.
const sortKey = (d: DraftEntry) =>
  (draftStatus(d) === "posted" ? d.postedAt : d.scheduledFor) ?? "";

const titleOf = (d: DraftEntry) => d.hook || d.draft.slice(0, 60) || "Untitled";
const dayLabel = (key: string) =>
  keyToDate(key).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
const whenLabel = (scheduledFor: string) => {
  const time = scheduleTime(scheduledFor);
  return `${dayLabel(scheduledFor.slice(0, 10))}${time ? `, ${timeLabel(time)}` : ""}`;
};

const dateInputClass =
  "h-9 rounded-md border border-input bg-background px-2 text-xs text-foreground ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-8";

export default function CalendarPage() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<DraftEntry[]>([]);
  // Phones open on the list: the month grid only shows Mon-Thu at 390px.
  const [view, setView] = useState<View>(() =>
    typeof window !== "undefined" && window.innerWidth < 640 ? "list" : "month",
  );
  // The day the month or week view is showing.
  const [anchor, setAnchor] = useState(() => localDateKey());
  const [platform, setPlatform] = useState("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [pickDraft, setPickDraft] = useState<string>("");
  const [pickDate, setPickDate] = useState<string>("");
  const [pickTime, setPickTime] = useState<string>("");
  const editorRef = useRef<HTMLDivElement>(null);
  const [notes, setNotes] = useState<CalNote[]>([]);
  // The note being added or edited; kept until saved or closed, so typed words survive a view change.
  const [noteForm, setNoteForm] = useState<NoteForm | null>(null);
  const noteRef = useRef<HTMLDivElement>(null);
  // Reels scheduled on the reels board, for its owner: one calendar for everything that posts.
  const [reels, setReels] = useState<{ id: string; title: string; date: string; posted: boolean }[]>([]);

  useEffect(() => {
    document.title = "Calendar - Content Studio";
    let active = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!active) return;
      const id = data.user?.id ?? null;
      setUserId(id);
      setDrafts(loadDrafts(id));
      setNotes(loadNotes(id));
      if (REELS_BOARD_OWNERS.includes(data.user?.email?.toLowerCase() ?? "")) {
        fetchBoard()
          .then((b) => {
            if (!active) return;
            const brand = brandForProfile(b.brands, activeProfile(id).name);
            setReels(
              b.cards
                .filter((c) => c.schedule && ["approved", "scheduled", "posted"].includes(c.stage) && (!brand || brandOf(c) === brand))
                .map((c) => ({ id: c.id, title: c.title, date: c.schedule!.slice(0, 10), posted: c.stage === "posted" })),
            );
          })
          .catch(() => {}); // the calendar works without the board
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const todayKey = localDateKey();

  const visible = useMemo(
    () =>
      drafts.filter(
        (d) =>
          (platform === "all" || d.platform === platform) &&
          (status === "all" || draftStatus(d) === status),
      ),
    [drafts, platform, status],
  );
  // Reels post to Instagram.
  const visibleReels = useMemo(
    () =>
      reels.filter(
        (r) =>
          (platform === "all" || platform === "instagram") &&
          (status === "all" || (status === "posted") === r.posted),
      ),
    [reels, platform, status],
  );

  const byDate = useMemo(() => {
    const map = new Map<string, DraftEntry[]>();
    for (const d of visible) {
      const key = eventDate(d);
      if (!key) continue;
      const arr = map.get(key) ?? [];
      arr.push(d);
      map.set(key, arr);
    }
    for (const arr of map.values()) arr.sort((a, b) => (sortKey(a) < sortKey(b) ? -1 : 1));
    return map;
  }, [visible]);

  const unscheduled = useMemo(
    () => drafts.filter((d) => draftStatus(d) === "draft"),
    [drafts],
  );

  const upcoming = useMemo(
    () =>
      visible
        .filter((d) => {
          const key = eventDate(d);
          return key !== null && key >= todayKey;
        })
        .sort((a, b) => (sortKey(a) < sortKey(b) ? -1 : 1)),
    [visible, todayKey],
  );

  const selected = drafts.find((d) => d.id === selectedId) ?? null;

  const undo = (prev: DraftEntry) => {
    if (!userId) return;
    setDrafts(
      draftStatus(prev) === "scheduled"
        ? setDraftStatus(userId, prev.id, "scheduled", prev.scheduledFor)
        : setDraftStatus(userId, prev.id, "draft"),
    );
  };

  // Puts a draft on a day (and optional time), or moves a scheduled post. Undo puts it back.
  const reschedule = (id: string, next: string) => {
    if (!userId || next.slice(0, 10) < todayKey) return;
    const prev = drafts.find((d) => d.id === id);
    if (!prev || draftStatus(prev) === "posted") return;
    const wasScheduled = draftStatus(prev) === "scheduled";
    if (
      wasScheduled &&
      prev.scheduledFor?.slice(0, 10) === next.slice(0, 10) &&
      scheduleTime(prev.scheduledFor) === scheduleTime(next)
    )
      return;
    setDrafts(setDraftStatus(userId, id, "scheduled", next));
    toast({
      title: `${wasScheduled ? "Moved to" : "Scheduled for"} ${whenLabel(next)}`,
      action: (
        <ToastAction altText="Undo" onClick={() => undo(prev)}>
          Undo
        </ToastAction>
      ),
    });
  };

  // A drag or a new date moves the day and keeps the posting time.
  const moveTo = (id: string, day: string) =>
    reschedule(id, scheduleAt(day, scheduleTime(drafts.find((d) => d.id === id)?.scheduledFor)));

  const handleSchedule = () => {
    if (!pickDraft || !pickDate) return;
    reschedule(pickDraft, scheduleAt(pickDate, pickTime));
    setPickDraft("");
    setPickDate("");
    setPickTime("");
  };

  const markPosted = (id: string) => {
    if (!userId) return;
    setDrafts(setDraftStatus(userId, id, "posted"));
    toast({ title: "Marked as posted" });
  };

  const openNote = (n: CalNote | null, date?: string) => {
    setNoteForm(n ? { ...n } : { id: null, date: date ?? (anchor > todayKey ? anchor : todayKey), title: "", color: "brand" });
    requestAnimationFrame(() => noteRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
  };

  const submitNote = () => {
    if (!userId || !noteForm || !noteForm.title.trim() || !noteForm.date) return;
    const note: CalNote = { ...noteForm, id: noteForm.id ?? newNoteId() };
    setNotes(saveNote(userId, note));
    setNoteForm(null);
    toast({ title: noteForm.id ? "Note saved" : `Note added to ${dayLabel(note.date)}` });
  };

  const removeNote = (id: string) => {
    const prev = notes.find((n) => n.id === id);
    if (!userId || !prev) return;
    setNotes(deleteNote(userId, id));
    setNoteForm(null);
    toast({
      title: "Note deleted",
      action: (
        <ToastAction altText="Undo" onClick={() => setNotes(saveNote(userId, prev))}>
          Undo
        </ToastAction>
      ),
    });
  };

  const select = (id: string) => {
    setSelectedId((cur) => (cur === id ? null : id));
    // On a phone the editor can sit above the fold of a long week.
    requestAnimationFrame(() => editorRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
  };

  // Drag and drop (desktop): scheduled posts and unscheduled drafts drop on today or later.
  const dragProps = (id: string) => ({
    draggable: true,
    onDragStart: (e: DragEvent) => {
      e.dataTransfer.setData(DRAG_TYPE, id);
      e.dataTransfer.effectAllowed = "move";
      setDragging(id);
    },
    onDragEnd: () => {
      setDragging(null);
      setDragOver(null);
    },
  });
  const dropProps = (key: string) =>
    key < todayKey
      ? {}
      : {
          onDragOver: (e: DragEvent) => {
            if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            if (dragOver !== key) setDragOver(key);
          },
          onDragLeave: (e: DragEvent) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragOver(null);
          },
          onDrop: (e: DragEvent) => {
            e.preventDefault();
            setDragOver(null);
            setDragging(null); // the dragged card can unmount on drop, so dragend may never fire
            const id = e.dataTransfer.getData(DRAG_TYPE);
            if (id) moveTo(id, key);
          },
        };

  const moveInput = (d: DraftEntry) => (
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] text-muted-foreground">
      <label className="flex items-center gap-1.5 whitespace-nowrap">
        Move to
        <input
          type="date"
          min={todayKey}
          value={d.scheduledFor?.slice(0, 10) ?? ""}
          // Typing a year fires partial dates like 0002-10-09; only a real future day moves it.
          onChange={(e) => e.target.value >= todayKey && moveTo(d.id, e.target.value)}
          className={dateInputClass}
        />
      </label>
      <label className="flex items-center gap-1.5 whitespace-nowrap">
        at
        <input
          type="time"
          value={scheduleTime(d.scheduledFor) ?? ""}
          onChange={(e) => d.scheduledFor && reschedule(d.id, scheduleAt(d.scheduledFor.slice(0, 10), e.target.value))}
          aria-label="Posting time"
          className={dateInputClass}
        />
      </label>
    </div>
  );

  const editor = (d: DraftEntry) => {
    const posted = draftStatus(d) === "posted";
    return (
      <div className="space-y-2 rounded-xl border border-primary/30 bg-card p-3 shadow-card">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-muted-foreground">
              {PLATFORM_LABEL[d.platform] ?? (d.platform || "Post")} · {posted ? "Posted" : "Scheduled"}
            </p>
            <p className="line-clamp-2 text-sm font-medium text-foreground">{titleOf(d)}</p>
          </div>
          <button
            type="button"
            onClick={() => setSelectedId(null)}
            aria-label="Close"
            className="-mr-1 -mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-md text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!posted && moveInput(d)}
          <Button asChild variant="outline" size="sm" className="h-9 px-3 text-xs sm:h-8">
            <Link to={`/generate?draft=${encodeURIComponent(d.id)}`}>Open</Link>
          </Button>
          {!posted && (
            <Button size="sm" onClick={() => markPosted(d.id)} className="h-9 gap-1 px-3 text-xs sm:h-8">
              <CheckCircle2 className="h-3.5 w-3.5" /> Posted
            </Button>
          )}
        </div>
      </div>
    );
  };

  // A post on the month or week grid: drag it to another day, tap it for its controls.
  const chip = (e: DraftEntry, roomy: boolean) => {
    const posted = draftStatus(e) === "posted";
    const time = posted ? null : scheduleTime(e.scheduledFor);
    return (
      <div
        key={e.id}
        role="button"
        tabIndex={0}
        {...(posted ? {} : dragProps(e.id))}
        onClick={() => select(e.id)}
        onKeyDown={(k) => {
          if (k.key !== "Enter" && k.key !== " ") return;
          k.preventDefault();
          select(e.id);
        }}
        title={e.hook || e.draft.slice(0, 60)}
        className={`w-full rounded px-1.5 py-0.5 text-left text-[10px] font-medium ${
          posted ? "bg-success/15 text-success" : "cursor-grab bg-primary/15 text-primary active:cursor-grabbing"
        } ${roomy ? "py-1.5 text-xs sm:py-1 sm:text-[11px]" : "truncate"} ${
          dragging === e.id ? "opacity-40" : ""
        } ${selectedId === e.id ? "ring-2 ring-primary" : ""}`}
      >
        {roomy ? (
          <>
            <span className="block text-[10px] opacity-80">
              {PLATFORM_LABEL[e.platform] ?? e.platform}
              {time && ` · ${timeLabel(time)}`}
            </span>
            <span className="line-clamp-2">{titleOf(e)}</span>
          </>
        ) : (
          <>
            {time && <span className="font-semibold">{timeLabel(time)} </span>}
            {PLATFORM_LABEL[e.platform] ?? e.platform}: {(e.hook || e.draft).slice(0, 22)}
          </>
        )}
      </div>
    );
  };

  const reelChip = (r: (typeof reels)[number], roomy: boolean) => (
    <button
      key={r.id}
      type="button"
      onClick={() => navigate(`/reels?card=${encodeURIComponent(r.id)}`)}
      title={r.title}
      className={`block w-full rounded px-1.5 py-0.5 text-left text-[10px] font-medium ${
        roomy ? "line-clamp-2 py-1.5 text-xs sm:py-1 sm:text-[11px]" : "truncate"
      } ${r.posted ? "bg-success/15 text-success" : "bg-brand/15 text-brand"}`}
    >
      Reel: {roomy ? r.title : r.title.slice(0, 22)}
    </button>
  );

  const keyDateLine = (k: SgDate, roomy: boolean) => (
    <p
      key={k.title}
      title={sgDateLabel(k)}
      className={`text-[10px] font-medium ${roomy ? "" : "truncate"} ${
        k.kind === "holiday" ? "text-destructive" : "text-muted-foreground"
      }`}
    >
      {k.kind === "money" && <Coins className="mr-0.5 inline h-2.5 w-2.5 align-[-1px]" aria-hidden />}
      {sgDateLabel(k)}
    </p>
  );

  const noteChip = (n: CalNote, roomy: boolean) => (
    <button
      key={n.id}
      type="button"
      onClick={() => openNote(n)}
      className={`flex w-full items-center gap-1 rounded bg-muted/70 px-1.5 text-left font-medium text-foreground hover:bg-muted ${
        roomy ? "py-1.5 text-xs sm:py-1 sm:text-[11px]" : "py-0.5 text-[10px]"
      }`}
    >
      <span className={`h-2 w-2 shrink-0 rounded-full ${NOTE_SWATCH[n.color]}`} aria-hidden />
      <span className={roomy ? "line-clamp-2" : "truncate"}>{n.title}</span>
    </button>
  );

  // Day number: tap it to pin a note on that day.
  const dayNumber = (key: string, className: string) => (
    <button
      type="button"
      onClick={() => openNote(null, key)}
      aria-label={`Add a note on ${dayLabel(key)}`}
      title="Add a note"
      className={`${className} hover:ring-2 hover:ring-border`}
    >
      {keyToDate(key).getDate()}
    </button>
  );

  const anchorDate = keyToDate(anchor);
  const grid = useMemo(() => {
    const d = keyToDate(anchor);
    return monthGrid(d.getFullYear(), d.getMonth());
  }, [anchor]);
  const week = useMemo(() => weekOf(anchor), [anchor]);

  const [rangeFrom, rangeTo] =
    view === "month" ? [grid[0], grid[41]] : view === "week" ? [week[0], week[6]] : [todayKey, addDays(todayKey, KEY_DATE_DAYS)];
  const keyDates = useMemo(() => sgDatesBetween(rangeFrom, rangeTo), [rangeFrom, rangeTo]);
  const notesByDate = useMemo(() => {
    const map = new Map<string, CalNote[]>();
    for (const n of notes) map.set(n.date, [...(map.get(n.date) ?? []), n]);
    return map;
  }, [notes]);

  // Upcoming: posts, reels, notes and the next few weeks of key dates, in date order
  // (key dates first in a day, then notes, then posts by time).
  type ListItem =
    | { kind: "key"; date: string; item: SgDate }
    | { kind: "note"; date: string; item: CalNote }
    | { kind: "reel"; date: string; item: (typeof reels)[number] }
    | { kind: "post"; date: string; item: DraftEntry };
  const listItems = useMemo(() => {
    const items: (ListItem & { order: string })[] = [];
    if (view !== "list") return items;
    for (const [date, ks] of keyDates) for (const k of ks) items.push({ kind: "key", date, item: k, order: `${date}|0` });
    for (const n of notes) if (n.date >= todayKey) items.push({ kind: "note", date: n.date, item: n, order: `${n.date}|1` });
    for (const r of visibleReels)
      if (r.date >= todayKey && !r.posted) items.push({ kind: "reel", date: r.date, item: r, order: `${r.date}|2` });
    for (const d of upcoming) items.push({ kind: "post", date: eventDate(d)!, item: d, order: `${eventDate(d)}|3|${sortKey(d)}` });
    return items.sort((a, b) => (a.order < b.order ? -1 : a.order > b.order ? 1 : 0));
  }, [view, keyDates, notes, visibleReels, upcoming, todayKey]);

  const shortDay = (key: string) => keyToDate(key).toLocaleDateString(undefined, { day: "numeric", month: "short" });
  const dateBadge = (key: string) => (
    <div className="w-14 shrink-0 text-center">
      <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
        {keyToDate(key).toLocaleDateString(undefined, { month: "short" })}
      </div>
      <div className="font-serif text-lg font-semibold text-foreground">{keyToDate(key).getDate()}</div>
    </div>
  );

  const navLabel =
    view === "week"
      ? `${keyToDate(week[0]).toLocaleDateString(undefined, { day: "numeric", month: "short" })} - ${keyToDate(
          week[6],
        ).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}`
      : anchorDate.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  const shift = (delta: number) =>
    setAnchor((a) => {
      if (view === "week") return addDays(a, delta * 7);
      const d = keyToDate(a);
      return localDateKey(new Date(d.getFullYear(), d.getMonth() + delta, 1));
    });

  const viewButton = (v: View, label: string, Icon: typeof List) => (
    <button
      type="button"
      onClick={() => setView(v)}
      aria-pressed={view === v}
      className={`inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-xs font-semibold sm:h-8 ${
        view === v ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
      }`}
    >
      <Icon className="h-3.5 w-3.5" /> {label}
    </button>
  );

  const dropHighlight = (key: string) => (dragOver === key ? "bg-primary/10 ring-2 ring-inset ring-primary" : "");

  return (
    <div className="space-y-6">
      <SectionTabs tabs={PIPELINE_TABS} />
      <header>
        <h1 className="font-serif text-2xl font-semibold leading-tight tracking-tight text-foreground sm:text-3xl">
          Calendar
        </h1>
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
                  <SelectTrigger aria-label="Draft to schedule">
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
              <div className="space-y-1.5">
                <Label htmlFor="sched-time">Time (optional)</Label>
                <input
                  id="sched-time"
                  type="time"
                  value={pickTime}
                  onChange={(e) => setPickTime(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-36"
                />
              </div>
              <Button
                onClick={handleSchedule}
                disabled={!pickDraft || !pickDate || pickDate < todayKey}
                className="gap-1.5"
              >
                <CalendarClock className="h-4 w-4" /> Schedule
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* View, filters, navigation */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-border/70 bg-muted/30 p-0.5">
          {viewButton("month", "Month", CalendarDays)}
          {viewButton("week", "Week", CalendarRange)}
          {viewButton("list", "Upcoming", List)}
        </div>
        <div className="flex gap-2">
          <Select value={platform} onValueChange={setPlatform}>
            <SelectTrigger aria-label="Platform" className="h-9 w-[8rem] text-xs sm:h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All platforms</SelectItem>
              {Object.entries(PLATFORM_LABEL).map(([k, v]) => (
                <SelectItem key={k} value={k}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
            <SelectTrigger aria-label="Status" className="h-9 w-[7rem] text-xs sm:h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any status</SelectItem>
              <SelectItem value="scheduled">Scheduled</SelectItem>
              <SelectItem value="posted">Posted</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <button
          type="button"
          onClick={() => openNote(null)}
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border/70 px-3 text-xs font-semibold text-muted-foreground hover:text-foreground sm:h-8"
        >
          <StickyNote className="h-3.5 w-3.5" /> Add note
        </button>
        {view !== "list" && (
          <div className="flex items-center gap-1.5 sm:ml-auto">
            <button
              type="button"
              onClick={() => shift(-1)}
              className="grid h-9 w-9 place-items-center rounded-md border border-border/70 text-muted-foreground hover:text-foreground sm:h-8 sm:w-8"
              aria-label={view === "week" ? "Previous week" : "Previous month"}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-[8.5rem] text-center text-sm font-semibold text-foreground">{navLabel}</span>
            <button
              type="button"
              onClick={() => shift(1)}
              className="grid h-9 w-9 place-items-center rounded-md border border-border/70 text-muted-foreground hover:text-foreground sm:h-8 sm:w-8"
              aria-label={view === "week" ? "Next week" : "Next month"}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setAnchor(todayKey)}
              className="h-9 rounded-md border border-border/70 px-3 text-xs font-semibold text-muted-foreground hover:text-foreground sm:h-8"
            >
              Today
            </button>
          </div>
        )}
      </div>

      <div className={`grid gap-4 ${unscheduled.length > 0 ? "lg:grid-cols-[minmax(0,1fr)_15rem]" : ""}`}>
        {/* Unscheduled drafts: a side panel on desktop, a collapsible section on phones */}
        {unscheduled.length > 0 && (
          <aside className="lg:order-last lg:sticky lg:top-4 lg:self-start">
            <button
              type="button"
              onClick={() => setPanelOpen((o) => !o)}
              aria-expanded={panelOpen}
              className="flex h-11 w-full items-center justify-between rounded-xl border border-border/70 bg-card px-4 text-sm font-semibold text-foreground shadow-card lg:hidden"
            >
              Unscheduled drafts ({unscheduled.length})
              <ChevronDown className={`h-4 w-4 transition-transform ${panelOpen ? "rotate-180" : ""}`} />
            </button>
            <div
              className={`${panelOpen ? "mt-2" : "hidden"} space-y-2 rounded-xl border border-border/70 bg-card p-3 shadow-card lg:mt-0 lg:block`}
            >
              <p className="hidden items-center gap-1 text-sm font-semibold text-foreground lg:flex">
                Unscheduled drafts ({unscheduled.length})
                <InfoTip label="About unscheduled drafts">Drag one onto a day, or pick its date.</InfoTip>
              </p>
              <div className="max-h-[60vh] space-y-2 overflow-y-auto">
                {unscheduled.map((d) => (
                  <div
                    key={d.id}
                    {...dragProps(d.id)}
                    className={`cursor-grab rounded-lg border border-border/60 bg-background p-2 active:cursor-grabbing ${
                      dragging === d.id ? "opacity-40" : ""
                    }`}
                  >
                    <p className="line-clamp-2 text-xs font-medium text-foreground">{titleOf(d)}</p>
                    <div className="mt-1.5 flex items-center justify-between gap-2">
                      <span className="truncate text-[10px] text-muted-foreground">
                        {PLATFORM_LABEL[d.platform] ?? d.platform}
                      </span>
                      <input
                        type="date"
                        min={todayKey}
                        value=""
                        aria-label={`Date for ${titleOf(d)}`}
                        onChange={(e) => e.target.value >= todayKey && moveTo(d.id, e.target.value)}
                        className={dateInputClass}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        )}

        <div className="min-w-0 space-y-3">
          {noteForm && (
            <div ref={noteRef} className="space-y-2 rounded-xl border border-border/70 bg-card p-3 shadow-card">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-foreground">{noteForm.id ? "Edit note" : "Add a note"}</p>
                <button
                  type="button"
                  onClick={() => setNoteForm(null)}
                  aria-label="Close note"
                  className="-mr-1 grid h-9 w-9 place-items-center rounded-md text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  submitNote();
                }}
                className="flex flex-wrap items-center gap-2"
              >
                <input
                  type="date"
                  value={noteForm.date}
                  onChange={(e) => e.target.value && setNoteForm({ ...noteForm, date: e.target.value })}
                  aria-label="Note date"
                  className={dateInputClass}
                />
                <input
                  autoFocus
                  value={noteForm.title}
                  onChange={(e) => setNoteForm({ ...noteForm, title: e.target.value })}
                  maxLength={80}
                  placeholder="Campaign or reminder"
                  aria-label="Note"
                  className="h-9 min-w-0 flex-1 basis-48 rounded-md border border-input bg-background px-3 text-sm text-foreground ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-8"
                />
                <div role="radiogroup" aria-label="Colour" className="flex">
                  {NOTE_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      role="radio"
                      aria-checked={noteForm.color === c}
                      aria-label={NOTE_COLOR_NAME[c]}
                      onClick={() => setNoteForm({ ...noteForm, color: c })}
                      className="grid h-9 w-9 place-items-center rounded-full sm:h-8 sm:w-8"
                    >
                      <span
                        className={`h-5 w-5 rounded-full ${NOTE_SWATCH[c]} ${
                          noteForm.color === c ? "ring-2 ring-ring ring-offset-2 ring-offset-background" : ""
                        }`}
                      />
                    </button>
                  ))}
                </div>
                <div className="ml-auto flex gap-2">
                  {noteForm.id && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeNote(noteForm.id!)}
                      className="h-9 px-3 text-xs text-destructive hover:text-destructive sm:h-8"
                    >
                      Delete
                    </Button>
                  )}
                  <Button type="submit" size="sm" disabled={!noteForm.title.trim()} className="h-9 px-3 text-xs sm:h-8">
                    {noteForm.id ? "Save" : "Add note"}
                  </Button>
                </div>
              </form>
            </div>
          )}

          {selected && view !== "list" && (
            <div ref={editorRef} className={view === "week" ? "hidden sm:block" : ""}>
              {editor(selected)}
            </div>
          )}

          {view === "month" && (
            <Card className="overflow-hidden border-border/60 shadow-card">
              <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Month calendar">
                <div className="min-w-[620px]">
                  <div className="grid grid-cols-7 border-b border-border/60 bg-muted/30 text-center text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    {WEEKDAYS.map((w) => (
                      <div key={w} className="py-2">
                        {w}
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7">
                    {grid.map((key) => {
                      const day = keyToDate(key);
                      const inMonth = day.getMonth() === anchorDate.getMonth();
                      const isToday = key === todayKey;
                      const events = byDate.get(key) ?? [];
                      return (
                        <div
                          key={key}
                          data-day={key}
                          {...dropProps(key)}
                          className={`min-h-[84px] border-b border-r border-border/50 p-1.5 ${
                            inMonth ? "bg-card" : "bg-muted/20"
                          } ${dropHighlight(key)}`}
                        >
                          {dayNumber(
                            key,
                            `mb-1 flex h-5 w-5 items-center justify-center rounded-full text-[11px] ${
                              isToday
                                ? "bg-primary font-bold text-primary-foreground"
                                : inMonth
                                  ? "text-foreground"
                                  : "text-muted-foreground"
                            }`,
                          )}
                          <div className="space-y-1">
                            {(keyDates.get(key) ?? []).map((k) => keyDateLine(k, false))}
                            {(notesByDate.get(key) ?? []).map((n) => noteChip(n, false))}
                            {events.slice(0, 3).map((e) => chip(e, false))}
                            {events.length > 3 && (
                              <button
                                type="button"
                                onClick={() => {
                                  setAnchor(key);
                                  setView("week");
                                }}
                                className="px-1 text-[10px] font-medium text-muted-foreground hover:text-foreground"
                              >
                                +{events.length - 3} more
                              </button>
                            )}
                            {visibleReels.filter((r) => r.date === key).map((r) => reelChip(r, false))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </Card>
          )}

          {view === "week" && (
            <Card className="overflow-hidden border-border/60 shadow-card">
              <div className="grid sm:grid-cols-7">
                {week.map((key) => {
                  const isToday = key === todayKey;
                  const events = byDate.get(key) ?? [];
                  const dayReels = visibleReels.filter((r) => r.date === key);
                  return (
                    <div
                      key={key}
                      data-day={key}
                      {...dropProps(key)}
                      className={`flex gap-3 border-b border-border/50 p-2 sm:min-h-[220px] sm:flex-col sm:gap-1.5 sm:border-r ${
                        key < todayKey ? "bg-muted/20" : "bg-card"
                      } ${dropHighlight(key)}`}
                    >
                      <div className="w-12 shrink-0 text-center sm:w-auto sm:text-left">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                          {keyToDate(key).toLocaleDateString(undefined, { weekday: "short" })}
                        </div>
                        {dayNumber(
                          key,
                          `mx-auto mt-0.5 grid h-9 w-9 place-items-center rounded-full text-sm sm:mx-0 sm:h-7 sm:w-7 ${
                            isToday ? "bg-primary font-bold text-primary-foreground" : "text-foreground"
                          }`,
                        )}
                      </div>
                      <div className="min-w-0 flex-1 space-y-1.5">
                        {(keyDates.get(key) ?? []).map((k) => keyDateLine(k, true))}
                        {(notesByDate.get(key) ?? []).map((n) => noteChip(n, true))}
                        {events.map((e) => (
                          <div key={e.id} className="space-y-1.5">
                            {chip(e, true)}
                            {selectedId === e.id && <div className="sm:hidden">{editor(e)}</div>}
                          </div>
                        ))}
                        {dayReels.map((r) => reelChip(r, true))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {view === "list" && (
            <div className="space-y-2">
              {upcoming.length === 0 && !listItems.some((i) => i.kind === "reel") && (
                <Card className="border-border/60 shadow-card">
                  <CardContent className="py-10 text-center text-sm text-muted-foreground">
                    {platform === "all" && status === "all" ? "Nothing scheduled yet." : "Nothing matches these filters."}
                  </CardContent>
                </Card>
              )}
              {listItems.map((i) => {
                if (i.kind === "key")
                  return (
                    <div key={`k${i.date}${i.item.title}`} className="flex items-center gap-3 px-3 py-1">
                      <span className="w-14 shrink-0 text-center text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                        {shortDay(i.date)}
                      </span>
                      <span className="min-w-0 flex-1">{keyDateLine(i.item, true)}</span>
                    </div>
                  );
                if (i.kind === "note")
                  return (
                    <div key={i.item.id} className="flex items-center gap-3 px-3 py-0.5">
                      <span className="w-14 shrink-0 text-center text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                        {shortDay(i.date)}
                      </span>
                      <span className="min-w-0 flex-1">{noteChip(i.item, true)}</span>
                    </div>
                  );
                if (i.kind === "reel") {
                  const r = i.item;
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => navigate(`/reels?card=${encodeURIComponent(r.id)}`)}
                      className="flex w-full items-center gap-3 rounded-xl border border-brand/30 bg-card p-3 text-left shadow-card"
                    >
                      {dateBadge(r.date)}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">{r.title}</p>
                        <p className="text-xs text-muted-foreground">Reel - posts automatically</p>
                      </div>
                    </button>
                  );
                }
                const e = i.item;
                const posted = draftStatus(e) === "posted";
                return (
                  <div
                    key={e.id}
                    className="flex items-start gap-3 rounded-xl border border-border/70 bg-card p-3 shadow-card"
                  >
                    {dateBadge(i.date)}
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <button
                        type="button"
                        onClick={() => navigate(`/generate?draft=${encodeURIComponent(e.id)}`)}
                        className="block w-full min-w-0 text-left"
                      >
                        <p className="truncate text-sm font-medium text-foreground">{titleOf(e)}</p>
                        <p className="text-xs text-muted-foreground">
                          {PLATFORM_LABEL[e.platform] ?? e.platform} ·{" "}
                          {posted
                            ? "Posted"
                            : scheduleTime(e.scheduledFor)
                              ? `Scheduled ${timeLabel(scheduleTime(e.scheduledFor)!)}`
                              : "Scheduled"}
                        </p>
                      </button>
                      {!posted && moveInput(e)}
                    </div>
                    {!posted && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => markPosted(e.id)}
                        className="h-9 shrink-0 gap-1.5 px-2.5 text-xs text-success hover:text-success sm:h-8"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" /> Posted
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
