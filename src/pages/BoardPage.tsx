import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Columns3, GripVertical, Lightbulb, Pencil, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";
import { Card, CardContent } from "@/components/ui/card";
import { ToastAction } from "@/components/ui/toast";
import DayInput from "@/components/DayInput";
import { useToast } from "@/hooks/use-toast";
import { useDraftReviews } from "@/hooks/useDraftReviews";
import {
  BOARD_COLUMNS,
  columnOf,
  loadStages,
  setStage,
  type BoardColumn,
  type ProductionStage,
} from "@/lib/board";
import {
  draftStatus,
  loadDrafts,
  newDraftId,
  restoreDraft,
  saveDrafts,
  setDraftStatus,
  upsertDraft,
  type DraftEntry,
  onDraftsChanged,
} from "@/lib/draftHistory";
import { supabase } from "@/lib/supabase";
import { keyToDate, localDateKey, scheduleAt, scheduleTime, timeLabel } from "@/lib/dueDates";
import { activeProfile } from "@/lib/profiles";

import ChannelPostDrawer from "@/components/ChannelPostDrawer";
import { useUrlItem } from "@/lib/urlState";
import { STATUS_LABEL, businessKey, canSeeChannelFeeds, fetchChannelFeeds, type CalendarFeedItem } from "@/lib/channelFeeds";

const PRODUCTION: BoardColumn[] = ["idea", "scripted", "to-film", "editing"];

// Columns grouped into a phase 1 / 2 / 3 flow so the board reads as a
// pipeline, not six flat buckets.
const PHASES: { number: number; title: string; columns: BoardColumn[] }[] = [
  { number: 1, title: "Write it", columns: ["idea", "scripted"] },
  { number: 2, title: "Produce it", columns: ["to-film", "editing"] },
  { number: 3, title: "Publish it", columns: ["scheduled", "posted"] },
];

// One-tap advancement per column (drag still works). Scheduled asks for a date on the card.
const NEXT_STEP: Partial<Record<BoardColumn, { to: BoardColumn; label: string }>> = {
  idea: { to: "scripted", label: "Scripted" },
  scripted: { to: "to-film", label: "To film" },
  "to-film": { to: "editing", label: "Editing" },
  editing: { to: "scheduled", label: "Schedule" },
  scheduled: { to: "posted", label: "Mark posted" },
};

const fieldClass =
  "h-9 rounded-md border border-border/70 bg-background px-2 text-xs outline-none focus:border-primary/40 sm:h-8 [@media(pointer:coarse)]:h-11";

// A posting day and optional time, for a card being scheduled.
function ScheduleForm({ title, onSchedule, onCancel }: { title?: string; onSchedule: (day: string, time: string) => void; onCancel: () => void }) {
  const [day, setDay] = useState("");
  const [time, setTime] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (day) onSchedule(day, time);
      }}
      className="space-y-1.5 rounded-lg border border-primary/40 bg-primary/5 p-2"
    >
      <p className="text-[11px] font-semibold text-primary">Pick a posting date</p>
      {title && <p className="line-clamp-1 text-[11px] text-muted-foreground">{title}</p>}
      <div className="flex flex-wrap gap-1.5">
        <DayInput min={localDateKey()} value={day} onPick={setDay} aria-label="Posting date" autoFocus className={`${fieldClass} min-w-[8rem] flex-1`} />
        <input type="time" value={time} onChange={(e) => setTime(e.target.value)} aria-label="Posting time (optional)" title="Time (optional)" className={`${fieldClass} w-24`} />
      </div>
      <div className="flex gap-1.5">
        <button type="submit" disabled={!day} className="h-9 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-50 sm:h-8 [@media(pointer:coarse)]:h-11">
          Schedule
        </button>
        <button type="button" onClick={onCancel} className="h-9 rounded-md px-3 text-xs font-medium text-muted-foreground hover:text-foreground sm:h-8 [@media(pointer:coarse)]:h-11">
          Cancel
        </button>
      </div>
    </form>
  );
}

function BoardCard({
  draft,
  onAdvance,
  advanceLabel,
  onRename,
  children,
}: {
  draft: DraftEntry;
  onAdvance?: () => void;
  advanceLabel?: string;
  onRename?: (hook: string) => void;
  /** Shown under the card's actions in place of its next-step button (the schedule form). */
  children?: ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  // Written the way Home and the calendar write it: "Fri, 9 Oct, 7:30pm".
  const day = draftStatus(draft) === "scheduled" ? draft.scheduledFor?.slice(0, 10) : undefined;
  const time = scheduleTime(draft.scheduledFor);
  const when = day
    ? {
        label: keyToDate(day).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }) + (time ? `, ${timeLabel(time)}` : ""),
        late: day < localDateKey(),
      }
    : null;

  const commitRename = () => {
    setEditing(false);
    const t = title.trim();
    if (t && t !== draft.hook && onRename) onRename(t);
  };

  return (
    <Card
      draggable={!editing && !children}
      onDragStart={(e) => e.dataTransfer.setData("text/draft-id", draft.id)}
      className="group min-w-0 cursor-grab border-border/60 shadow-sm transition-shadow hover:shadow-card active:cursor-grabbing"
    >
      <CardContent className="space-y-2.5 p-3">
        <div className="flex items-start gap-1.5">
          <GripVertical className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-muted-foreground" />
          {editing ? (
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename();
                if (e.key === "Escape") setEditing(false);
              }}
              autoFocus
              className="min-w-0 flex-1 rounded-md border border-primary/40 bg-background px-1.5 py-0.5 text-sm font-medium outline-none"
            />
          ) : (
            <p
              className="line-clamp-2 min-w-0 cursor-text text-sm font-medium leading-snug"
              title={onRename ? "Click to rename" : undefined}
              onClick={() => {
                if (!onRename) return;
                setTitle(draft.hook || "");
                setEditing(true);
              }}
            >
              {draft.hook || draft.draft.slice(0, 80) || "Untitled draft"}
            </p>
          )}
        </div>
        {(draft.platform || draft.format || when) && (
          <div className="flex flex-wrap items-center gap-1.5 pl-5">
            {draft.platform && (
              <span className="whitespace-nowrap rounded-full border border-border/70 bg-muted/40 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {draft.platform}
              </span>
            )}
            {draft.format && (
              <span className="whitespace-nowrap rounded-full border border-border/70 bg-muted/40 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {draft.format.replace(/-/g, " ")}
              </span>
            )}
            {when && (
              <span className={`whitespace-nowrap text-[10px] ${when.late ? "font-medium text-warning" : "text-muted-foreground"}`}>
                {when.late ? "Overdue, " : ""}
                {when.label}
              </span>
            )}
          </div>
        )}
        <div className="flex items-center justify-between gap-2 pl-5">
          <Link
            to={`/generate?draft=${draft.id}`}
            className="-ml-2 inline-flex h-9 items-center gap-1 rounded-md px-2 text-xs font-medium text-primary hover:underline sm:h-7 sm:text-[11px] [@media(pointer:coarse)]:h-11"
          >
            <Pencil className="h-3 w-3" /> Open
          </Link>
          {onAdvance && advanceLabel && !children && (
            <button
              type="button"
              onClick={onAdvance}
              className="inline-flex h-9 items-center gap-1 whitespace-nowrap rounded-md border border-border/70 px-3 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary sm:h-7 sm:px-2 sm:text-[11px] [@media(pointer:coarse)]:h-11"
            >
              {advanceLabel} <ArrowRight className="h-3 w-3" />
            </button>
          )}
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

// A channel post (the MoneyBees Telegram channel first) on the board: the posting job decides when it goes, so
// it is not draggable; tap it to see the whole post.
function FeedCard({ item, onOpen }: { item: CalendarFeedItem; onOpen: () => void }) {
  const when =
    keyToDate(item.date).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }) +
    (item.time ? `, ${timeLabel(item.time)}` : "");
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full min-w-0 items-start gap-2.5 rounded-xl border border-sky-500/30 bg-card p-3 text-left shadow-sm transition-shadow hover:shadow-card"
    >
      {item.media[0] && <img src={item.media[0]} alt="" loading="lazy" className="h-14 w-11 shrink-0 rounded-md border border-border/60 object-cover" />}
      <span className="min-w-0 flex-1 space-y-1.5">
        <span className="line-clamp-2 block text-sm font-medium leading-snug text-foreground">{item.title}</span>
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="whitespace-nowrap rounded-full bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700 dark:text-sky-300">
            {item.business}
          </span>
          <span className="inline-flex items-center gap-0.5 whitespace-nowrap rounded-full border border-border/70 bg-muted/40 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            <Send className="h-2.5 w-2.5" /> {item.channel}
          </span>
          <span className="whitespace-nowrap text-[10px] text-muted-foreground">
            {when} · {STATUS_LABEL[item.status]}
            {item.media.length > 1 && ` · ${item.media.length} pictures`}
          </span>
        </span>
      </span>
    </button>
  );
}

export default function BoardPage() {
  const { toast } = useToast();
  const [userId, setUserId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<DraftEntry[]>([]);
  // The assistant moves posts from outside this page: read them again when it does.
  useEffect(() => (userId ? onDraftsChanged(() => setDrafts(loadDrafts(userId))) : undefined), [userId]);
  const [stages, setStages] = useState<Record<string, ProductionStage>>({});
  const [dragOver, setDragOver] = useState<BoardColumn | null>(null);
  // Channel posts other jobs publish, in Scheduled (planned or previewed) and Posted (Leo 2026-10-13: a kanban view).
  const [feed, setFeed] = useState<CalendarFeedItem[]>([]);
  // ?feed=<id> opens that channel post (docs/deep-links.md); the business pick is ?business=, shared with the calendar.
  const [feedId, openFeedItem, closeFeed] = useUrlItem("feed");
  const openFeed = feed.find((f) => f.id === feedId) ?? null;
  const [profileName, setProfileName] = useState("");
  const [boardBrand, setBoardBrand] = useState("");

  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      const uid = data.user?.id ?? null;
      setUserId(uid);
      if (uid) {
        setDrafts(loadDrafts(uid));
        setStages(loadStages(uid));
        setProfileName(activeProfile(uid).name);
        setBoardBrand(activeProfile(uid).boardBrand ?? "");
      }
      if (canSeeChannelFeeds(data.user?.email)) {
        fetchChannelFeeds()
          .then((items) => active && setFeed(items))
          .catch(() => {}); // the board works without the feeds
      }
    });
    return () => {
      active = false;
    };
  }, []);

  // The open brand only (docs/brand-isolation.md): its drafts, and the channel feeds that belong to it.
  // The Calendar is the one page that shows every brand at once.
  const byColumn = useMemo(() => {
    const map = new Map<BoardColumn, DraftEntry[]>();
    BOARD_COLUMNS.forEach((c) => map.set(c.key, []));
    drafts.forEach((d) => map.get(columnOf(d, stages))?.push(d));
    return map;
  }, [drafts, stages]);
  const feedIn = useMemo(() => {
    const today = localDateKey();
    // a feed belongs to the brand of the same name, or to the brand that owns that posts-board brand ("Me" owns "leo")
    const mine = new Set([businessKey(profileName), businessKey(boardBrand)].filter(Boolean));
    const shown = feed.filter((f) => mine.has(businessKey(f.business)));
    return {
      scheduled: shown.filter((f) => f.status !== "posted" && f.date >= today).sort((a, b) => (a.date + a.time < b.date + b.time ? -1 : 1)),
      posted: shown.filter((f) => f.status === "posted").sort((a, b) => (a.date + a.time > b.date + b.time ? -1 : 1)),
    } as Partial<Record<BoardColumn, CalendarFeedItem[]>>;
  }, [feed, profileName, boardBrand]);

  const [newIdea, setNewIdea] = useState("");
  // Draft awaiting a posting date: asked on its card (Schedule button) or in the
  // Scheduled column (dropped there).
  const [scheduling, setScheduling] = useState<{ id: string; onCard: boolean } | null>(null);

  const confirmSchedule = (day: string, time: string) => {
    const prev = drafts.find((d) => d.id === scheduling?.id);
    if (!userId || !prev) return;
    setDrafts(setDraftStatus(userId, prev.id, "scheduled", scheduleAt(day, time)));
    setScheduling(null);
    toast({
      title: `Scheduled for ${keyToDate(day).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}${time ? `, ${timeLabel(time)}` : ""}`,
      action: (
        <ToastAction altText="Undo" onClick={() => setDrafts(restoreDraft(userId, prev))}>
          Undo
        </ToastAction>
      ),
    });
  };

  // Capture a rough concept straight on the board — it lands in Idea and can
  // be scripted later in Write via the card's Open link.
  const addIdea = () => {
    const hook = newIdea.trim();
    if (!hook || !userId) return;
    // Guard against double-Enter creating duplicate cards.
    if (drafts.some((d) => d.hook === hook && !d.draft)) {
      setNewIdea("");
      return;
    }
    const entry: DraftEntry = {
      id: newDraftId(),
      createdAt: new Date().toISOString(),
      hook,
      draft: "",
      pillar: "",
      pillarDetail: "",
      audience: "",
      format: "",
      platform: "",
      ctaType: "",
    };
    setDrafts(upsertDraft(userId, entry));
    setStages(setStage(userId, entry.id, "idea"));
    setNewIdea("");
  };

  // Team rule: members on approval can't mark a post posted until it is approved.
  const reviews = useDraftReviews(userId, drafts);

  const moveTo = (draft: DraftEntry, col: BoardColumn, onCard = false) => {
    if (!userId) return;
    if (col === "scheduled") {
      // Finish the thought in place: ask for the date on the card, or in the column it was dropped on.
      setScheduling({ id: draft.id, onCard });
      return;
    }
    if (col === "posted") {
      const blocked = reviews.blockReason(draft);
      if (blocked) {
        toast({ title: "Approval needed before posting", description: `Team rule. ${blocked}` });
        return;
      }
      setDrafts(setDraftStatus(userId, draft.id, "posted"));
      toast({ title: "Marked as posted" });
      return;
    }
    // Production stage move; also clears scheduled/posted if dragging back.
    if (draftStatus(draft) !== "draft") {
      setDrafts(setDraftStatus(userId, draft.id, "draft"));
    }
    setStages(setStage(userId, draft.id, col as ProductionStage));
  };

  const onDrop = (col: BoardColumn) => (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(null);
    const id = e.dataTransfer.getData("text/draft-id");
    if (!id) return;
    const draft = drafts.find((d) => d.id === id);
    if (!draft) return;
    moveTo(draft, col);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1">
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight sm:text-2xl">
          <Columns3 className="h-5 w-5" /> Board
        </h1>
        <InfoTip label="About moving cards">
          Drag a card between columns, or use its quick-move button.
        </InfoTip>
      </div>

      {drafts.length === 0 && feed.length === 0 && (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4 text-sm text-muted-foreground">
            <p>Nothing in production yet.</p>
            <Button asChild size="sm">
              <Link to="/generate">Write a post</Link>
            </Button>
          </CardContent>
        </Card>
      )}
      {/* Horizontal, Trello/Linear-style board: real-width columns that size to
          their content, grouped by phase, scrolling sideways on narrow screens. */}
      <div>
        <div className="space-y-5">
          {PHASES.map((phase) => (
            <section key={phase.number}>
              <div className="mb-3 flex items-center gap-2 px-0.5">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                  {phase.number}
                </span>
                <p className="text-sm font-semibold text-foreground">{phase.title}</p>
              </div>
              <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2">
                {phase.columns.map((key) => {
                  const col = BOARD_COLUMNS.find((c) => c.key === key)!;
                  const cards = byColumn.get(col.key) ?? [];
                  const channel = feedIn[col.key] ?? [];
                  return (
                    <div
                      key={col.key}
                      onDragOver={(e) => {
                        e.preventDefault();
                        setDragOver(col.key);
                      }}
                      onDragLeave={() => setDragOver(null)}
                      onDrop={onDrop(col.key)}
                      className={`flex min-w-0 flex-col gap-2.5 rounded-2xl border p-3 transition-colors ${
                        dragOver === col.key
                          ? "border-primary/50 bg-primary/5"
                          : "border-border/50 bg-muted/30"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 px-0.5">
                        <p className="min-w-0 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                          {col.label}
                        </p>
                        <span className="shrink-0 rounded-md bg-background px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-muted-foreground shadow-sm">
                          {cards.length + channel.length}
                        </span>
                      </div>

                      {cards.map((d) => {
                        const step = NEXT_STEP[col.key];
                        return (
                          <BoardCard
                            key={d.id}
                            draft={d}
                            onAdvance={step ? () => moveTo(d, step.to, true) : undefined}
                            advanceLabel={step?.label}
                            onRename={(hook) => {
                              if (!userId) return;
                              // Rename in place — upsertDraft would bump the
                              // card to the top of its column.
                              setDrafts((prev) => {
                                const next = prev.map((x) =>
                                  x.id === d.id ? { ...x, hook } : x,
                                );
                                saveDrafts(userId, next);
                                return next;
                              });
                            }}
                          >
                            {scheduling?.onCard && scheduling.id === d.id && (
                              <ScheduleForm onSchedule={confirmSchedule} onCancel={() => setScheduling(null)} />
                            )}
                          </BoardCard>
                        );
                      })}

                      {channel.map((f) => (
                        <FeedCard key={f.id} item={f} onOpen={() => openFeedItem(f.id)} />
                      ))}

                      {col.key === "scheduled" && scheduling && !scheduling.onCard && (
                        <ScheduleForm
                          key={scheduling.id}
                          title={drafts.find((d) => d.id === scheduling.id)?.hook || "Selected post"}
                          onSchedule={confirmSchedule}
                          onCancel={() => setScheduling(null)}
                        />
                      )}

                      {col.key === "idea" && (
                        <input
                          value={newIdea}
                          onChange={(e) => setNewIdea(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") addIdea();
                          }}
                          placeholder="+ Quick idea, Enter to add"
                          className="w-full rounded-lg border border-dashed border-border/70 bg-background/60 px-2.5 py-2 text-xs outline-none [@media(pointer:coarse)]:min-h-11 placeholder:text-muted-foreground focus:border-primary/40 focus:bg-background"
                        />
                      )}
                      {col.key === "idea" && (
                        <Link
                          to="/coach#idea-dump"
                          className="inline-flex items-center gap-1 self-start px-0.5 text-[11px] font-medium text-primary hover:underline [@media(pointer:coarse)]:min-h-11"
                        >
                          <Lightbulb className="h-3 w-3" /> Dump ideas
                          <span className="font-normal text-muted-foreground">
                            and get post briefs back
                          </span>
                        </Link>
                      )}

                      {cards.length === 0 && channel.length === 0 && col.key !== "idea" && (
                        <div className="flex min-h-24 items-center justify-center rounded-lg border border-dashed border-border/50 text-[11px] text-muted-foreground">
                          Drop posts here
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
      <ChannelPostDrawer item={openFeed} onClose={closeFeed} />
    </div>
  );
}
