import { useEffect, useMemo, useState } from "react";
import SectionTabs, { PIPELINE_TABS } from "@/components/SectionTabs";
import { Link } from "react-router-dom";
import { ArrowRight, Columns3, GripVertical, Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
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
  setDraftStatus,
  upsertDraft,
  type DraftEntry,
} from "@/lib/draftHistory";
import { supabase } from "@/lib/supabase";

const PRODUCTION: BoardColumn[] = ["idea", "scripted", "to-film", "editing"];

// Columns grouped into a phase 1 / 2 / 3 flow so the board reads as a
// pipeline, not six flat buckets.
const PHASES: { number: number; title: string; blurb: string; columns: BoardColumn[] }[] = [
  { number: 1, title: "Write it", blurb: "Capture ideas, turn them into scripts", columns: ["idea", "scripted"] },
  { number: 2, title: "Produce it", blurb: "Film and cut the content", columns: ["to-film", "editing"] },
  { number: 3, title: "Publish it", blurb: "Schedule, post, track", columns: ["scheduled", "posted"] },
];

// One-click advancement per column (drag still works). Scheduled needs a date,
// so the editing column jumps straight to posted.
const NEXT_STEP: Partial<Record<BoardColumn, { to: BoardColumn; label: string }>> = {
  idea: { to: "scripted", label: "Scripted" },
  scripted: { to: "to-film", label: "To film" },
  "to-film": { to: "editing", label: "Editing" },
  editing: { to: "posted", label: "Mark posted" },
  scheduled: { to: "posted", label: "Mark posted" },
};

function BoardCard({
  draft,
  onAdvance,
  advanceLabel,
}: {
  draft: DraftEntry;
  onAdvance?: () => void;
  advanceLabel?: string;
}) {
  return (
    <Card
      draggable
      onDragStart={(e) => e.dataTransfer.setData("text/draft-id", draft.id)}
      className="min-w-0 cursor-grab active:cursor-grabbing"
    >
      <CardContent className="space-y-2 p-3">
        <div className="flex items-start gap-1.5">
          <GripVertical className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
          <p className="line-clamp-3 min-w-0 break-words text-sm font-medium leading-snug">
            {draft.hook || draft.draft.slice(0, 80) || "Untitled draft"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 pl-5">
          {draft.platform && (
            <span className="whitespace-nowrap rounded-full border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
              {draft.platform}
            </span>
          )}
          {draft.format && (
            <span className="whitespace-nowrap rounded-full border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
              {draft.format}
            </span>
          )}
          {draft.scheduledFor && (
            <span className="whitespace-nowrap text-[10px] text-muted-foreground">
              {new Date(draft.scheduledFor).toLocaleDateString()}
            </span>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 pl-5">
          <Link
            to={`/generate?draft=${draft.id}`}
            className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
          >
            <Pencil className="h-3 w-3" /> Open
          </Link>
          {onAdvance && advanceLabel && (
            <button
              type="button"
              onClick={onAdvance}
              className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-border/70 px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
            >
              {advanceLabel} <ArrowRight className="h-3 w-3" />
            </button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function BoardPage() {
  const { toast } = useToast();
  const [userId, setUserId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<DraftEntry[]>([]);
  const [stages, setStages] = useState<Record<string, ProductionStage>>({});
  const [dragOver, setDragOver] = useState<BoardColumn | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const uid = data.user?.id ?? null;
      setUserId(uid);
      if (uid) {
        setDrafts(loadDrafts(uid));
        setStages(loadStages(uid));
      }
    });
  }, []);

  const byColumn = useMemo(() => {
    const map = new Map<BoardColumn, DraftEntry[]>();
    BOARD_COLUMNS.forEach((c) => map.set(c.key, []));
    drafts.forEach((d) => map.get(columnOf(d, stages))?.push(d));
    return map;
  }, [drafts, stages]);

  const [newIdea, setNewIdea] = useState("");

  // Capture a rough concept straight on the board — it lands in Idea and can
  // be scripted later in Write via the card's Open link.
  const addIdea = () => {
    const hook = newIdea.trim();
    if (!hook || !userId) return;
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

  const moveTo = (draft: DraftEntry, col: BoardColumn) => {
    if (!userId) return;
    if (col === "scheduled") {
      toast({
        title: "Set a date to schedule",
        description: "Open the post and pick a date in My posts or the Calendar.",
      });
      return;
    }
    if (col === "posted") {
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
      <SectionTabs tabs={PIPELINE_TABS} />
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight sm:text-2xl">
          <Columns3 className="h-5 w-5" /> Content board
        </h1>
        <p className="text-sm text-muted-foreground">
          Move each post through three phases: write it, produce it, publish it.
          Drag cards or use the quick-move button on each card.
        </p>
      </div>

      {drafts.length === 0 && (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4 text-sm text-muted-foreground">
            <p>
              Nothing in production yet. Type a quick idea below, or write a
              full post and it lands here.
            </p>
            <Button asChild size="sm">
              <Link to="/generate">Write a post</Link>
            </Button>
          </CardContent>
        </Card>
      )}
      {(
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          {PHASES.map((phase) => (
            <section key={phase.number} className="rounded-xl border border-border/60 bg-card p-3">
              <div className="mb-3 flex items-baseline gap-2 px-1">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">
                  {phase.number}
                </span>
                <div>
                  <p className="text-sm font-semibold">
                    Phase {phase.number} — {phase.title}
                  </p>
                  <p className="text-[11px] text-muted-foreground">{phase.blurb}</p>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {phase.columns.map((key) => {
                  const col = BOARD_COLUMNS.find((c) => c.key === key)!;
                  return (
                    <div
                      key={col.key}
                      onDragOver={(e) => {
                        e.preventDefault();
                        setDragOver(col.key);
                      }}
                      onDragLeave={() => setDragOver(null)}
                      onDrop={onDrop(col.key)}
                      className={`flex min-h-40 min-w-0 flex-col gap-2 rounded-lg border p-2 transition-colors ${
                        dragOver === col.key ? "border-primary bg-primary/5" : "border-border bg-muted/20"
                      }`}
                    >
                      <div className="px-1">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          {col.label}{" "}
                          <span className="font-normal">({byColumn.get(col.key)?.length ?? 0})</span>
                        </p>
                        <p className="text-[10px] text-muted-foreground/70">{col.hint}</p>
                      </div>
                      {(byColumn.get(col.key) ?? []).map((d) => {
                        const step = NEXT_STEP[col.key];
                        return (
                          <BoardCard
                            key={d.id}
                            draft={d}
                            onAdvance={step ? () => moveTo(d, step.to) : undefined}
                            advanceLabel={step?.label}
                          />
                        );
                      })}
                      {col.key === "idea" && (
                        <div className="flex items-center gap-1">
                          <input
                            value={newIdea}
                            onChange={(e) => setNewIdea(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") addIdea();
                            }}
                            placeholder="+ Quick idea, Enter to add"
                            className="min-w-0 flex-1 rounded-lg border border-dashed border-border/70 bg-background px-2 py-1.5 text-xs outline-none placeholder:text-muted-foreground/60 focus:border-primary/40"
                          />
                        </div>
                      )}
                      {PRODUCTION.includes(col.key) &&
                        col.key !== "idea" &&
                        (byColumn.get(col.key) ?? []).length === 0 && (
                        <p className="px-1 py-3 text-center text-[11px] text-muted-foreground/60">
                          Drop posts here
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
