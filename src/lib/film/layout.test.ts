import { describe, expect, it } from "vitest";
import { APP_COVER } from "@/lib/videoEdit";
import { goodFilm } from "./fixtures";
import { layoutScene, type Rect, type SceneLayout } from "./layout";

const SIZES: [number, number][] = [[1080, 1920], [1080, 1080], [1920, 1080]];
const film = goodFilm();

const all = (l: SceneLayout): Rect[] => [...l.words, ...(l.device ? [l.device] : []), ...(l.cards ?? []).flatMap((c) => [c.box, c.icon, c.title, c.line]), ...[l.value, l.label, l.logo, l.line, l.cta, l.caption].filter(Boolean)];
const text = (l: SceneLayout): Rect[] => [...l.words, ...(l.cards ?? []).flatMap((c) => [c.icon, c.title, c.line]), ...[l.value, l.label, l.logo, l.line, l.cta, l.caption].filter(Boolean)];

describe("layoutScene", () => {
  it.each(SIZES)("keeps every box of every scene inside a %ix%i frame", (w, h) => {
    for (const s of film.scenes) {
      const boxes = all(layoutScene(s, w, h));
      expect(boxes.length).toBeGreaterThan(0);
      for (const r of boxes) {
        expect(r.w).toBeGreaterThan(0);
        expect(r.h).toBeGreaterThan(0);
        expect(r.x).toBeGreaterThanOrEqual(0);
        expect(r.y).toBeGreaterThanOrEqual(0);
        expect(r.x + r.w).toBeLessThanOrEqual(w + 1e-6);
        expect(r.y + r.h).toBeLessThanOrEqual(h + 1e-6);
      }
    }
  });

  it("keeps the words clear of Instagram's and TikTok's top, bottom and right bands at 9:16", () => {
    const [w, h] = [1080, 1920];
    const top = Math.max(APP_COVER.instagram.top, APP_COVER.tiktok.top) * h;
    const bottom = h - Math.max(APP_COVER.instagram.bottom, APP_COVER.tiktok.bottom) * h;
    const right = w - Math.max(APP_COVER.instagram.right, APP_COVER.tiktok.right) * w;
    expect([top, bottom, right]).toEqual([210, 1600, 960]);
    for (const s of film.scenes) {
      for (const r of text(layoutScene(s, w, h))) {
        expect(r.y).toBeGreaterThanOrEqual(top);
        expect(r.y + r.h).toBeLessThanOrEqual(bottom + 1e-6);
        expect(r.x + r.w).toBeLessThanOrEqual(right + 1e-6);
      }
    }
  });

  it("stacks the words over the phone at 9:16, shrinks the phone to 62 % of a square, and puts the words left of it at 16:9", () => {
    const screen = film.scenes.find((s) => s.kind === "screen")!;
    const tall = layoutScene(screen, 1080, 1920);
    expect(tall.words[0].y + tall.words[0].h).toBeLessThanOrEqual(tall.device!.y);
    expect(layoutScene(screen, 1080, 1080).device!.h).toBeCloseTo(0.62 * 1080, 0);
    for (const s of film.scenes.filter((x) => x.kind === "screen" || x.kind === "montage")) {
      const wide = layoutScene(s, 1920, 1080);
      expect(wide.words[0].x + wide.words[0].w).toBeLessThanOrEqual(wide.device!.x);
    }
  });

  it("gives every screen and montage scene the same device box, so a carry cut holds the phone still", () => {
    const [a, b] = ["app", "burst"].map((id) => layoutScene(film.scenes.find((s) => s.id === id)!, 1080, 1920).device);
    expect(a).toEqual(b);
  });
});
