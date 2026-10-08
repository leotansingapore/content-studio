import { describe, expect, it } from "vitest";
import { gridTiles } from "@/lib/igGrid";
import type { DraftEntry } from "@/lib/draftHistory";

const d = (id: string, over: Partial<DraftEntry>): DraftEntry =>
  ({ id, createdAt: "2026-10-01T00:00:00Z", hook: id, draft: "text", pillar: "topic", pillarDetail: "", audience: "general", format: "text-post", platform: "instagram", ctaType: "comment-keyword", ...over }) as DraftEntry;

describe("gridTiles", () => {
  it("puts the latest planned post top-left, then earlier ones, then posted ones newest first", () => {
    const tiles = gridTiles([
      d("posted-old", { status: "posted", postedAt: "2026-09-01T03:00:00Z" }),
      d("plan-soon", { status: "scheduled", scheduledFor: "2026-10-10" }),
      d("plan-later", { status: "scheduled", scheduledFor: "2026-10-20T19:30" }),
      d("posted-new", { status: "posted", postedAt: "2026-10-05T03:00:00Z" }),
      d("linkedin", { platform: "linkedin", status: "scheduled", scheduledFor: "2026-10-12" }),
      d("draft", { status: "draft" }),
      d("empty", { status: "scheduled", scheduledFor: "2026-10-11", draft: "", hook: "" }),
    ]);
    expect(tiles.map((t) => [t.draft.id, t.kind, t.day])).toEqual([
      ["plan-later", "planned", "2026-10-20"],
      ["plan-soon", "planned", "2026-10-10"],
      ["posted-new", "posted", "2026-10-05"],
      ["posted-old", "posted", "2026-09-01"],
    ]);
  });

  it("stops at the grid size", () => {
    const many = Array.from({ length: 30 }, (_, i) => d(`p${i}`, { status: "posted", postedAt: `2026-09-${String(i + 1).padStart(2, "0")}` }));
    expect(gridTiles(many)).toHaveLength(18);
  });
});
