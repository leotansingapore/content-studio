import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Columns3, GripVertical, Pencil } from "lucide-react";

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
  setDraftStatus,
  type DraftEntry,
} from "@/lib/draftHistory";
import { supabase } from "@/lib/supabase";

const PRODUCTION: BoardColumn[] = ["idea", "scripted", "to-film", "editing"];

function BoardCard({ draft }: { draft: DraftEntry }) {
  return (
    <Card
      draggable
      onDragStart={(e) => e.dataTransfer.setData("text/draft-id", draft.id)}
      className="cursor-grab active:cursor-grabbing"
    >
      <CardContent className="space-y-2 p-3">
        <div className="flex items-start gap-1.5">
          <GripVertical className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
          <p className="line-clamp-3 text-sm font-medium leading-snug">
            {draft.hook || draft.draft.slice(0, 80) || "Untitled draft"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 pl-5">
          <span className="rounded-full border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
            {draft.platform}
          </span>
          <span className="rounded-full border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
            {draft.format}
          </span>
          {draft.scheduledFor && (
            <span className="text-[10px] text-muted-foreground">
              {new Date(draft.scheduledFor).toLocaleDateString()}
            </span>
          )}
          <Link
            to={`/generate?draft=${draft.id}`}
            className="ml-auto inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
          >
            <Pencil className="h-3 w-3" /> Open
          </Link>
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

  const onDrop = (col: BoardColumn) => (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(null);
    const id = e.dataTransfer.getData("text/draft-id");
    if (!id || !userId) return;
    const draft = drafts.find((d) => d.id === id);
    if (!draft) return;

    if (col === "scheduled") {
      toast({
        title: "Set a date to schedule",
        description: "Open the post and pick a date in My posts or the Calendar.",
      });
      return;
    }
    if (col === "posted") {
      setDrafts(setDraftStatus(userId, id, "posted"));
      toast({ title: "Marked as posted" });
      return;
    }
    // Production stage move; also clears scheduled/posted if dragging back.
    if (draftStatus(draft) !== "draft") {
      setDrafts(setDraftStatus(userId, id, "draft"));
    }
    setStages(setStage(userId, id, col as ProductionStage));
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight sm:text-2xl">
          <Columns3 className="h-5 w-5" /> Content board
        </h1>
        <p className="text-sm text-muted-foreground">
          Drag each post through production: idea to scripted to filmed to live.
        </p>
      </div>

      {drafts.length === 0 ? (
        <Card>
          <CardContent className="space-y-3 py-10 text-center text-sm text-muted-foreground">
            <p>Nothing in production yet. Write your first post and it lands here.</p>
            <Button asChild size="sm">
              <Link to="/generate">Write a post</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {BOARD_COLUMNS.map((col) => (
            <div
              key={col.key}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(col.key);
              }}
              onDragLeave={() => setDragOver(null)}
              onDrop={onDrop(col.key)}
              className={`flex min-h-40 flex-col gap-2 rounded-lg border p-2 transition-colors ${
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
              {(byColumn.get(col.key) ?? []).map((d) => (
                <BoardCard key={d.id} draft={d} />
              ))}
              {PRODUCTION.includes(col.key) && (byColumn.get(col.key) ?? []).length === 0 && (
                <p className="px-1 py-3 text-center text-[11px] text-muted-foreground/60">
                  Drop posts here
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
