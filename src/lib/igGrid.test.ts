import { describe, expect, it } from "vitest";
import { gridTiles, gridWindow, placeCoverText, windowInSource } from "@/lib/igGrid";
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

describe("gridWindow", () => {
  it("is the centred 3:4 window the profile grid shows", () => {
    expect(gridWindow(1080, 1920)).toEqual({ x0: 0, y0: 240, x1: 1080, y1: 1680 });
    // a square post loses its sides, a 4:5 one a sliver of them
    expect(gridWindow(1080, 1080)).toEqual({ x0: 135, y0: 0, x1: 945, y1: 1080 });
    expect(gridWindow(1080, 1350)).toEqual({ x0: 33.75, y0: 0, x1: 1046.25, y1: 1350 });
    expect(gridWindow(1920, 1080)).toBeNull();
  });
  it("maps the window onto the source picture when it fills the frame", () => {
    // a landscape video cropped to 9:16 keeps its full height
    expect(windowInSource(1080, 1920, 1920, 1080)).toEqual({ y0: 0.125, y1: 0.875 });
    // a taller phone video loses some height to the crop first
    expect(windowInSource(1080, 1920, 1080, 2400)).toEqual({ y0: 0.2, y1: 0.8 });
    expect(windowInSource(1920, 1080, 1920, 1080)).toBeUndefined();
  });
  // a 1080 x 1920 cover: the grid shows y 240 to 1680; a 40 px margin inside it
  const room = { y0: 280, y1: 1640 };
  const inside = (p: { top: number; scale: number }, h: number) => p.top >= room.y0 && p.top + h * p.scale <= room.y1;
  it("leaves the title where it was when it already fits", () => {
    expect(placeCoverText(336, 1022, room)).toEqual({ top: 1022, scale: 1 });
    expect(placeCoverText(336, 1022, room, { y0: 500, y1: 1000 }, 30)).toEqual({ top: 1030, scale: 1 });
  });
  it("moves the title up from the cropped foot, and shrinks it to stay under the chin", () => {
    const low = placeCoverText(336, 1500, room);
    expect(low).toEqual({ top: 1304, scale: 1 });
    const chin = placeCoverText(336, 1022, room, { y0: 700, y1: 1300 }, 30);
    expect(chin.top).toBe(1330);
    expect(chin.scale).toBeLessThan(1);
    expect(inside(chin, 336)).toBe(true);
  });
  it("goes above the head when there is no room under the chin", () => {
    const p = placeCoverText(336, 1022, room, { y0: 900, y1: 1500 }, 30);
    expect(p).toEqual({ top: 870 - 336, scale: 1 });
  });
  it("shrinks to fit a window too short for it, and sits at the foot when the face fills the window", () => {
    expect(placeCoverText(2720, 1000, room)).toEqual({ top: 280, scale: 0.5 });
    const p = placeCoverText(336, 1022, room, { y0: 300, y1: 1600 }, 30);
    expect(p.scale).toBe(0.6);
    expect(p.top + 336 * 0.6).toBe(room.y1);
  });
});
