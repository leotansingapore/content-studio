import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/profiles", () => ({ scoped: (id: string) => id }));

import { BATCH_WORK, CAROUSEL_WORK, loadCreateTopic, saveCreateTopic, tileHref } from "./createTopic";

const mem = (init: Record<string, string> = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m };
};
const json = (s: ReturnType<typeof mem>, k: string) => JSON.parse(s.m.get(k) ?? "null");

describe("a topic typed on Create goes with the tile", () => {
  it("opens the writer on its last step and Answer with the question filled", () => {
    const s = mem();
    expect(tileHref("/generate", " CPF myths ", "u1", s)).toBe("/generate?detail=CPF+myths");
    expect(tileHref("/generate/answer", "Is term enough?", "u1", s)).toBe("/generate/answer?q=Is%20term%20enough%3F");
  });

  it("opens Carousel on From a topic with the topic in it, and Weekly batch with its topic", () => {
    const s = mem();
    expect(tileHref("/carousel", "CPF myths", "u1", s)).toBe("/carousel?tab=topic");
    expect(json(s, `${CAROUSEL_WORK}u1`)).toEqual({ mode: "topic", topic: "CPF myths" });
    expect(tileHref("/generate/batch", "CPF myths", "u1", s)).toBe("/generate/batch");
    expect(json(s, `${BATCH_WORK}u1`)).toEqual({ topic: "CPF myths" });
  });

  it("never replaces work already in a maker", () => {
    const car = JSON.stringify({ mode: "paste", pasteText: "my own words", topic: "" });
    const made = JSON.stringify({ mode: "drafts", slides: [{ id: "s" }], topic: "" });
    const batch = JSON.stringify({ topic: "mine", cards: {} });
    const cards = JSON.stringify({ topic: "", cards: { a: { text: "x" } } });
    for (const [k, v] of [[`${CAROUSEL_WORK}u1`, car], [`${CAROUSEL_WORK}u1`, made], [`${BATCH_WORK}u1`, batch], [`${BATCH_WORK}u1`, cards]] as const) {
      const s = mem({ [k]: v });
      tileHref(k.startsWith(CAROUSEL_WORK) ? "/carousel" : "/generate/batch", "CPF myths", "u1", s);
      expect(s.m.get(k)).toBe(v);
    }
  });

  it("fills an empty Weekly batch, one with no cards yet included, and keeps its other settings", () => {
    const s = mem({ [`${BATCH_WORK}u1`]: JSON.stringify({ topic: "", cards: {}, count: 5 }) });
    tileHref("/generate/batch", "CPF myths", "u1", s);
    expect(json(s, `${BATCH_WORK}u1`)).toEqual({ topic: "CPF myths", cards: {}, count: 5 });
  });

  it("carries at most 300 characters of a long topic", () => {
    const s = mem();
    const url = new URL(tileHref("/generate", "a".repeat(400), "u1", s), "https://x");
    expect(url.searchParams.get("detail")).toBe("a".repeat(300));
  });

  it("opens Slideshow's writer and Hooks with the topic in them", () => {
    const s = mem();
    expect(tileHref("/slideshow", "CPF myths", "u1", s)).toBe("/make/slideshow?topic=CPF+myths");
    expect(tileHref("/hooks", "CPF myths", "u1", s)).toBe("/hooks?topic=CPF+myths");
  });

  it("keeps the topic for the box on the way back, for makers with no topic field too", () => {
    const s = mem();
    expect(tileHref("/edit", "CPF myths", "u1", s)).toBe("/edit");
    expect(loadCreateTopic("u1", s)).toBe("CPF myths");
    saveCreateTopic("u1", "  ", s);
    expect(loadCreateTopic("u1", s)).toBe("");
  });

  it("leaves every tile's address alone when the box is empty", () => {
    const s = mem();
    for (const to of ["/generate", "/carousel", "/generate/batch", "/generate/answer", "/edit", "/slideshow", "/hooks"]) expect(tileHref(to, "  ", "u1", s)).toBe(to);
    expect(s.m.size).toBe(0);
  });

  it("writes the keys and fields Carousel and Weekly batch really read", () => {
    const car = readFileSync("src/pages/CarouselPage.tsx", "utf8");
    const batch = readFileSync("src/pages/BatchPage.tsx", "utf8");
    expect(car).toContain("`cs-carousel-work-${scoped(userId)}`");
    expect(car).toContain('if (typeof work?.topic === "string") setTopic(work.topic);');
    expect(batch).toContain("`cs-batch-work-${scoped(userId)}`");
    expect(batch).toContain('if (work && typeof work.topic === "string") {');
  });
});
