// /carousel is live for everyone: its first frame must draw exactly as it did before edit-by-chat (pinned on
// today's code at 4403dedf), with or without ?ask= in the address. Never update the pinned file with vitest -u.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@/lib/useLeoOnly", () => ({ useLeoUser: () => null, useLeoOnly: () => false }));
vi.mock("@/lib/supabase", () => ({
  SUPABASE_URL: "https://abc.supabase.co",
  SUPABASE_ANON_KEY: "",
  supabase: { auth: { getUser: () => new Promise(() => undefined), getSession: () => new Promise(() => undefined), onAuthStateChange: () => ({}) }, functions: { invoke } },
}));
// the shared tab row reads the rails store, which has no server snapshot; it is not this page's to pin
vi.mock("@/components/SectionTabs", () => ({ default: () => createElement("nav", { "data-pin": "section-tabs" }), WRITE_TABS: [] }));
// the page's first frame asks the browser how wide it is and makes a canvas to measure words with
vi.stubGlobal("window", { matchMedia: () => ({ matches: true }) });
vi.mock("@/lib/carouselRender", async (actual) => ({ ...(await actual<typeof import("@/lib/carouselRender")>()), createCanvasMeasure: () => () => 0 }));
// the rewrite store has no server snapshot; nothing is being rewritten on a first frame
vi.mock("@/components/carousel/SlideFields", async (actual) => ({ ...(await actual<typeof import("@/components/carousel/SlideFields")>()), useRewriting: () => false }));

const { default: CarouselPage, carouselTarget } = await import("./CarouselPage");
const html = (path = "/carousel") => renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [path] }, createElement(CarouselPage)));

describe("/carousel for everyone else", () => {
  it("draws today's page", async () => {
    await expect(html()).toMatchFileSnapshot("./__pins__/carousel-page-everyone.html");
  });
  it("draws the same page with ?ask= and an open carousel in the address", () => {
    expect(html("/carousel?carousel=d%3Ad1&ask=make%20slide%203%20shorter")).toBe(html("/carousel?carousel=d%3Ad1"));
    expect(html("/carousel?ask=end%20on%20a%20question")).toBe(html());
  });
});

describe("the open carousel as the agent's edit target (Leo only)", () => {
  const SLIDES = [
    { id: "a", title: "5 CPF myths", body: "" },
    { id: "b", title: "Myth 1", body: "You can't touch your CPF until 65, so there's no point in checking it now." },
    { id: "c", title: "Message me", body: "I'll go through yours." },
  ];
  const setup = () => {
    const io = { slides: SLIDES, live: true, changes: 0 };
    const target = carouselTarget({
      title: () => "5 CPF myths",
      slides: () => io.slides,
      onScreen: () => 2,
      platform: () => "instagram",
      change: (update) => ((io.slides = update(io.slides)), io.changes++),
      open: () => io.live,
    });
    return { io, target };
  };
  beforeEach(() => invoke.mockReset());
  const answer = (slides: string[][], reply: string) => invoke.mockResolvedValueOnce({ data: { slides: slides.map((texts) => ({ texts })), reply }, error: null });

  it("tells the agent what is open", () => {
    const { target } = setup();
    expect([target.kind, target.title, target.slides, target.onScreen]).toEqual(["carousel", "5 CPF myths", ["5 CPF myths", "Myth 1 You can't touch your CPF until 65, so there's no point in checking it now.".slice(0, 80), "Message me I'll go through yours."], 2]);
  });

  it("one slide: asks carousel-copy for that slide only, changes nothing, then Use this and Undo through the page", async () => {
    const { io, target } = setup();
    answer([["Myth 1", "CPF isn't locked away. Check it now?"]], "Made it shorter and ended on a question.");
    const p = await target.propose("make slide 2 shorter", 2);
    expect(invoke.mock.calls).toEqual([["carousel-copy", { body: { mode: "ask", ask: "make slide 2 shorter", index: 1, platform: "instagram", slides: SLIDES.map((s) => ({ texts: [s.title, s.body] })) } }]]);
    expect(io.changes).toBe(0);
    expect([p.reply, p.preview, p.flags]).toEqual(["Made it shorter and ended on a question.", "Myth 1\nCPF isn't locked away. Check it now?", []]);
    // typed after the proposal, and after Use this: both kept through Use this and Undo
    io.slides = io.slides.map((s) => (s.id === "a" ? { ...s, body: "Number 3 surprises people." } : s));
    const r = p.apply();
    expect(r.done).toBe("Done. Slide 2 changed. Undo here or on the page.");
    expect(io.slides.map((s) => s.body)).toEqual(["Number 3 surprises people.", "CPF isn't locked away. Check it now?", SLIDES[2].body]);
    io.slides = io.slides.map((s) => (s.id === "c" ? { ...s, body: "Book a call." } : s));
    r.undo();
    expect(io.slides.map((s) => s.body)).toEqual(["Number 3 surprises people.", SLIDES[1].body, "Book a call."]);
    expect(io.changes).toBe(2);
  });

  it("no slide named: every slide, in one change", async () => {
    const { io, target } = setup();
    answer([["5 CPF myths?", ""], ["Myth 1", "Is it locked?"], ["Message me", "Want to check yours?"]], "Ended each slide on a question.");
    const p = await target.propose("end on a question", null);
    expect(invoke.mock.calls[0][1].body.index).toBeUndefined();
    const r = p.apply();
    expect(r.done).toBe('Done. "5 CPF myths" changed. Undo here or on the page.');
    expect(io.slides.map((s) => s.title)).toEqual(["5 CPF myths?", "Myth 1", "Message me"]);
    expect(io.changes).toBe(1);
  });

  it("a failing writer, an unusable answer and a closed carousel change nothing", async () => {
    const { io, target } = setup();
    invoke.mockResolvedValueOnce({ data: null, error: { context: new Response(JSON.stringify({ code: "failed", error: "Couldn't rewrite that slide. Try again in a minute." }), { status: 502 }) } });
    await expect(target.propose("shorter", 2)).rejects.toThrow("Couldn't rewrite that slide. Try again in a minute.");
    answer([["Myth 1", "x"], ["extra", "y"]], "");
    await expect(target.propose("shorter", 2)).rejects.toThrow("Couldn't rewrite that slide. Try again in a minute.");
    answer([["Myth 1", "Shorter."]], "");
    const p = await target.propose("shorter", 2);
    io.live = false;
    expect(() => p.apply()).toThrow("That carousel is no longer open.");
    expect(io.changes).toBe(0);
  });
});
