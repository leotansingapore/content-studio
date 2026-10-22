// /slideshow is Leo's only: everyone else gets the not-found page, with or without ?ask= (pinned on today's code at
// 4403dedf). Never update the pinned file with vitest -u.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Slideshow } from "@/lib/slideshow";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@/lib/useLeoOnly", () => ({ useLeoUser: () => null, useLeoOnly: () => false }));
vi.mock("@/lib/supabase", () => ({
  SUPABASE_URL: "https://abc.supabase.co",
  SUPABASE_ANON_KEY: "",
  supabase: { auth: { getUser: () => new Promise(() => undefined), getSession: () => new Promise(() => undefined), onAuthStateChange: () => ({}) }, functions: { invoke } },
}));

const { default: SlideshowPage, slideshowTarget } = await import("./SlideshowPage");
const { blankSlideshow, makeBox } = await import("@/lib/slideshow");
const html = (path = "/slideshow") => renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [path] }, createElement(SlideshowPage)));

describe("/slideshow for everyone else", () => {
  it("draws today's not-found page", async () => {
    await expect(html()).toMatchFileSnapshot("./__pins__/slideshow-page-everyone.html");
  });
  it("draws the same with an open slideshow and ?ask=", () => {
    expect(html("/slideshow?s=show1&ask=make%20it%20shorter")).toBe(html());
  });
});

describe("the open slideshow as the agent's edit target", () => {
  const made = (): Slideshow => {
    const show = blankSlideshow();
    return {
      ...show,
      title: "MediShield Life in 30 seconds",
      slides: [
        { id: "s1", boxes: [makeBox("MediShield Life covers you", { id: "b1" }), makeBox("for life", { id: "b2" })] },
        { id: "s2", photo: { src: "p.jpg", by: "A", byUrl: "" }, boxes: [] },
        { id: "s3", boxes: [makeBox("It pays big bills, not every bill", { id: "b3" })] },
      ],
    };
  };
  const setup = () => {
    const io = { show: made(), live: true, commits: 0 };
    const target = slideshowTarget({
      show: () => io.show,
      onScreen: () => 3,
      commit: (next) => ((io.show = next(io.show)), io.commits++),
      open: () => io.live,
    });
    return { io, target };
  };
  beforeEach(() => invoke.mockReset());
  const answer = (slides: string[][], reply: string) => invoke.mockResolvedValueOnce({ data: { slides: slides.map((texts) => ({ texts })), reply }, error: null });
  const texts = (io: { show: Slideshow }) => io.show.slides.map((s) => s.boxes.map((b) => b.text));

  it("tells the agent what is open", () => {
    const { target } = setup();
    expect([target.kind, target.title, target.slides, target.onScreen]).toEqual(["slideshow", "MediShield Life in 30 seconds", ["MediShield Life covers you for life", "", "It pays big bills, not every bill"], 3]);
  });

  it("one slide: sends every slide's box texts and changes that slide's boxes only on Use this; Undo puts back its words", async () => {
    const { io, target } = setup();
    answer([["Big bills, covered", "for life"]], "Shorter.");
    const p = await target.propose("make slide 1 shorter", 1);
    expect(invoke.mock.calls).toEqual([["carousel-copy", { body: { mode: "ask", ask: "make slide 1 shorter", index: 0, platform: "instagram", slides: [{ texts: ["MediShield Life covers you", "for life"] }, { texts: [""] }, { texts: ["It pays big bills, not every bill"] }] } }]]);
    expect([io.commits, p.reply, p.preview]).toEqual([0, "Shorter.", "Big bills, covered\nfor life"]);
    const r = p.apply();
    expect(r.done).toBe("Done. Slide 1 changed. Undo here or on the page.");
    expect(texts(io)).toEqual([["Big bills, covered", "for life"], [], ["It pays big bills, not every bill"]]);
    // typed on slide 3 after Use this: kept through Undo
    io.show = { ...io.show, slides: io.show.slides.map((s) => (s.id === "s3" ? { ...s, boxes: [{ ...s.boxes[0], text: "Big bills only" }] } : s)) };
    r.undo();
    expect(texts(io)).toEqual([["MediShield Life covers you", "for life"], [], ["Big bills only"]]);
    expect(io.commits).toBe(2);
  });

  it("no slide named: the slides with words, in one change", async () => {
    const { io, target } = setup();
    answer([["Covered for life?", "for life"], ["Big bills only?"]], "Ended on questions.");
    const p = await target.propose("end on a question", null);
    expect(invoke.mock.calls[0][1].body.slides).toEqual([{ texts: ["MediShield Life covers you", "for life"] }, { texts: ["It pays big bills, not every bill"] }]);
    expect(invoke.mock.calls[0][1].body.index).toBeUndefined();
    const r = p.apply();
    expect(r.done).toBe('Done. "MediShield Life in 30 seconds" changed. Undo here or on the page.');
    expect(texts(io)).toEqual([["Covered for life?", "for life"], [], ["Big bills only?"]]);
    expect(io.commits).toBe(1);
  });

  it("an answer that doesn't fit the boxes, and a closed slideshow, change nothing", async () => {
    const { io, target } = setup();
    answer([["One text for two boxes"]], "");
    await expect(target.propose("shorter", 1)).rejects.toThrow("Couldn't rewrite that slide. Try again in a minute.");
    answer([["Short", "for life"]], "");
    const p = await target.propose("shorter", 1);
    io.live = false;
    expect(() => p.apply()).toThrow("That slideshow is no longer open.");
    expect(io.commits).toBe(0);
  });
});
