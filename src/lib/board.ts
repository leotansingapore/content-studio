// Content board: production stage per draft.
//
// A draft's board column is derived from two sources:
//   - the draft's own lifecycle status (scheduled / posted) always wins
//   - otherwise a per-draft production stage stored at
//     content-studio-board-${userId} (synced across devices by cloudSync)

import { draftStatus, type DraftEntry } from "@/lib/draftHistory";

export type ProductionStage = "idea" | "scripted" | "to-film" | "editing";
export type BoardColumn = ProductionStage | "scheduled" | "posted";

export const BOARD_COLUMNS: { key: BoardColumn; label: string; hint: string }[] = [
  { key: "idea", label: "Idea", hint: "Rough concepts, not written yet" },
  { key: "scripted", label: "Scripted", hint: "Written in Write, ready to shoot" },
  { key: "to-film", label: "To film", hint: "Queued for the camera" },
  { key: "editing", label: "Editing", hint: "Footage in the cut" },
  { key: "scheduled", label: "Scheduled", hint: "Has a posting date" },
  { key: "posted", label: "Posted", hint: "Live on the platform" },
];

const KEY_PREFIX = "content-studio-board-";

type StageMap = Record<string, ProductionStage>;

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadStages(userId: string | null | undefined): StageMap {
  const s = storage();
  if (!s || !userId) return {};
  try {
    return JSON.parse(s.getItem(KEY_PREFIX + userId) ?? "{}");
  } catch {
    return {};
  }
}

export function setStage(userId: string, draftId: string, stage: ProductionStage): StageMap {
  const s = storage();
  const next = { ...loadStages(userId), [draftId]: stage };
  if (s) s.setItem(KEY_PREFIX + userId, JSON.stringify(next));
  return next;
}

export function columnOf(draft: DraftEntry, stages: StageMap): BoardColumn {
  const status = draftStatus(draft);
  if (status === "posted") return "posted";
  if (status === "scheduled") return "scheduled";
  return stages[draft.id] ?? "scripted";
}
