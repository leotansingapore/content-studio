import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabase: { functions: { invoke: vi.fn() } }, SUPABASE_URL: "", SUPABASE_ANON_KEY: "" }));

// the slideshow maker and the make call, faked: a start moves the fake store the way the real job ends
const fake = vi.hoisted(() => ({ show: null as null | Record<string, unknown>, seq: 0 }));
const startSlideshow = vi.hoisted(() => vi.fn());
const requestMake = vi.hoisted(() => vi.fn());
const makeBody = vi.hoisted(() => vi.fn(() => ({})));
vi.mock("@/lib/slideshowJob", async (orig) => ({
  ...(await orig<typeof import("./slideshowJob")>()),
  startSlideshow,
  makeBody,
  slideshowJob: () => fake.show,
  slideshowBusy: () => false,
}));
// a business brand: no bundled personal finance trends or news stand in as ideas
vi.mock("@/lib/ideasInbox", async (orig) => ({ ...(await orig<typeof import("./ideasInbox")>()), poolIdeas: () => [] }));
vi.mock("@/lib/remix", async (orig) => ({ ...(await orig<typeof import("./remix")>()), requestMake }));

import { DEAD_LINE, DEFAULT_MIX, deckDay, loadBlitz, saveBlitz, usedKeyOf, type BlitzCard } from "./blitz";
import { alsoMake, blitzBusy, keepCard, loadPools, nothingToDraw, retryCard, skipCard, startDeck, undoKeep, whyEmpty } from "./blitzJob";
import { FORMAT_TRENDS } from "./formatTrends";
import { DEFAULT_CHOICES, savePostChoices } from "./postChoices";
import { loadDrafts } from "./draftHistory";
import { EdgeError } from "./edgeFn";
import { formatJobs } from "./formatJob";
import { blankSlideshow, loadSlideshows, saveSlideshow } from "./slideshow";

class MemStorage {
  s = new Map<string, string>();
  get length() { return this.s.size; }
  key(i: number) { return [...this.s.keys()][i] ?? null; }
  getItem(k: string) { return this.s.get(k) ?? null; }
  setItem(k: string, v: string) { this.s.set(k, v); }
  removeItem(k: string) { this.s.delete(k); }
}

const UID = "u1";
const card = (id: string, format: BlitzCard["format"], o: Partial<BlitzCard> = {}): BlitzCard => ({ id, format, source: null, topic: { title: `Topic ${id}`, angle: "" }, why: "", state: "waiting", ...o });
const seed = (cards: BlitzCard[]) => saveBlitz(UID, { day: deckDay(), mix: DEFAULT_MIX, cards });
const wallOk = (text: string) => ({ result: { as: "wall", text, caption: "Caption", scene: "", search: "" }, flags: { copied: [], claim: false, invented: false } });
const until = async (done: () => boolean) => {
  for (let i = 0; i < 200 && !done(); i++) await new Promise((r) => setTimeout(r, 5));
};
const run = async (first: string) => {
  retryCard(UID, first);
  await until(() => !blitzBusy());
};

beforeEach(() => {
  const local = new MemStorage();
  vi.stubGlobal("localStorage", local);
  vi.stubGlobal("window", { localStorage: local, dispatchEvent: () => true, addEventListener: () => {}, removeEventListener: () => {} });
  fake.show = null;
  startSlideshow.mockReset().mockImplementation(async () => {
    const show = { ...blankSlideshow(), id: `show-${++fake.seq}`, title: "A slideshow" };
    saveSlideshow(UID, show);
    fake.show = { id: fake.seq, state: "done", showId: show.id };
  });
  requestMake.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

describe("making the deck", () => {
  it("makes every card in turn, a slideshow through the slideshow maker and a wall through one make call", async () => {
    requestMake.mockResolvedValue(wallOk("Line one\nLine two"));
    seed([card("c1", "slideshow"), card("c2", "wall")]);
    await run("c1");
    const [a, b] = loadBlitz(UID).cards;
    expect(a).toMatchObject({ state: "new", showId: "show-1" });
    expect(b).toMatchObject({ state: "new", wall: { text: "Line one\nLine two", caption: "Caption" } });
    expect(startSlideshow).toHaveBeenCalledWith(UID, expect.objectContaining({ topic: "Topic c1", size: "4x5", pictures: "stock", mention: true }));
    expect(requestMake).toHaveBeenCalledTimes(1);
    // the deck shows on /library's Making now, ready once made
    expect(formatJobs().find((j) => j.slug === "blitz")).toMatchObject({ state: "ready", href: "/blitz" });
  });

  it("names the business as the brand's post choices say: Always by default, never on Never", async () => {
    requestMake.mockResolvedValue(wallOk("Words"));
    seed([card("c1", "slideshow"), card("c2", "wall")]);
    await run("c1");
    expect(startSlideshow).toHaveBeenLastCalledWith(UID, expect.objectContaining({ mention: true }));
    expect(makeBody).toHaveBeenLastCalledWith(UID, expect.objectContaining({ mention: true }), "wall");
    savePostChoices(UID, { ...DEFAULT_CHOICES, mention: "never" });
    seed([card("c3", "slideshow"), card("c4", "wall")]);
    await run("c3");
    expect(startSlideshow).toHaveBeenLastCalledWith(UID, expect.objectContaining({ mention: false }));
    expect(makeBody).toHaveBeenLastCalledWith(UID, expect.objectContaining({ mention: false }), "wall");
  });

  it("stops when the day's remixes run out and keeps the cards it made", async () => {
    requestMake.mockResolvedValueOnce(wallOk("Made")).mockRejectedValueOnce(new EdgeError("No remixes left today.", 429, "daily_limit"));
    seed([card("c1", "wall"), card("c2", "wall"), card("c3", "wall"), card("c4", "slideshow")]);
    await run("c1");
    const s = loadBlitz(UID);
    expect(s.capped).toBe(true);
    expect(s.cards.map((c) => [c.id, c.state])).toEqual([["c1", "new"]]);
    // nothing after the cap is even tried
    expect(requestMake).toHaveBeenCalledTimes(2);
    expect(startSlideshow).not.toHaveBeenCalled();
  });

  it("stops the same way when the slideshow maker hits the cap", async () => {
    startSlideshow.mockImplementationOnce(async () => {
      fake.show = { id: ++fake.seq, state: "failed", capped: true, error: "No remixes left today." };
    });
    seed([card("c1", "slideshow"), card("c2", "wall")]);
    await run("c1");
    expect(loadBlitz(UID)).toMatchObject({ capped: true, cards: [] });
    expect(requestMake).not.toHaveBeenCalled();
  });

  it("marks a card that failed, and Try again makes it", async () => {
    requestMake.mockRejectedValueOnce(new EdgeError("Down", 503)).mockResolvedValueOnce(wallOk("Second go"));
    seed([card("c1", "wall")]);
    await run("c1");
    expect(loadBlitz(UID).cards[0]).toMatchObject({ state: "failed", error: "Couldn't make this one." });
    await run("c1");
    expect(loadBlitz(UID).cards[0]).toMatchObject({ state: "new", wall: { text: "Second go" } });
  });
});

describe("a source the writer turns away", () => {
  const turnedAway = () => new EdgeError("That remix came back in a shape that can't be used. Try again.", 422, "unusable");

  it("deals a fresh source in its place, under the same id, without a second try on the dead one", async () => {
    requestMake.mockRejectedValueOnce(turnedAway()).mockResolvedValue(wallOk("Fresh words"));
    seed([card("c1", "wall")]);
    await run("c1");
    const c = loadBlitz(UID).cards[0];
    expect(c).toMatchObject({ id: "c1", state: "new", swapped: true });
    expect(usedKeyOf(c)).not.toBe(usedKeyOf(card("c1", "wall")));
    // the dead source was written once, never retried
    expect(requestMake.mock.calls.length + startSlideshow.mock.calls.length).toBe(2);
  });

  it("only offers Skip when the swapped card is turned away too, so no paid retry fails the same way", async () => {
    requestMake.mockRejectedValue(turnedAway());
    seed([card("c1", "wall", { swapped: true })]);
    await run("c1");
    expect(loadBlitz(UID).cards[0]).toMatchObject({ state: "failed", error: DEAD_LINE });
    expect(requestMake).toHaveBeenCalledTimes(1);
  });

  it("treats a slideshow the maker refused the same way", async () => {
    startSlideshow.mockImplementationOnce(async () => {
      fake.show = { id: ++fake.seq, state: "failed", refused: true, error: "That slideshow can't be turned into something safe to post." };
    });
    seed([card("c1", "slideshow", { swapped: true })]);
    await run("c1");
    expect(loadBlitz(UID).cards[0]).toMatchObject({ state: "failed", error: DEAD_LINE });
  });

  it("keeps Try again for a make that never went through", async () => {
    requestMake.mockRejectedValueOnce(new EdgeError("Down", 503));
    seed([card("c1", "wall")]);
    await run("c1");
    expect(loadBlitz(UID).cards[0]).toMatchObject({ state: "failed", error: "Couldn't make this one." });
  });
});

describe("starting the deck", () => {
  it("deals no second deck the day the remixes ran out before a card was made", async () => {
    saveBlitz(UID, { day: deckDay(), mix: DEFAULT_MIX, cards: [], capped: true });
    // there is plenty to draw on: only the spent day holds it back
    expect(nothingToDraw(UID)).toBe(false);
    expect(startDeck(UID)).toBe("capped");
    await until(() => !blitzBusy());
    expect(loadBlitz(UID).cards).toEqual([]);
    expect([requestMake.mock.calls.length, startSlideshow.mock.calls.length]).toEqual([0, 0]);
  });

  it("never makes a card twice when the deck is started again while it runs", async () => {
    let answer: (v: unknown) => void = () => {};
    requestMake.mockImplementationOnce(() => new Promise((r) => (answer = r)));
    seed([card("c1", "wall")]);
    expect(startDeck(UID)).toBe("started");
    expect(startDeck(UID)).toBe("busy");
    answer(wallOk("Made once"));
    await until(() => !blitzBusy());
    expect(requestMake).toHaveBeenCalledTimes(1);
    expect(loadBlitz(UID).cards[0]).toMatchObject({ state: "new", wall: { text: "Made once" } });
  });
});

describe("keep and skip", () => {
  it("keeps a wall in My posts unscheduled, and Undo takes it out", () => {
    seed([card("c1", "wall", { state: "new", wall: { text: "First line\nMore", caption: "Cap" } })]);
    const id = keepCard(UID, "c1")!;
    expect(loadDrafts(UID).find((d) => d.id === id)).toMatchObject({ status: "draft", format: "short-video", hook: "First line", draft: "First line\nMore\n\n---\n\nCAPTION:\nCap" });
    expect(loadDrafts(UID).find((d) => d.id === id)?.scheduledFor).toBeUndefined();
    expect(loadBlitz(UID).cards[0]).toMatchObject({ state: "kept", draftId: id });
    undoKeep(UID, "c1");
    expect(loadDrafts(UID).some((d) => d.id === id)).toBe(false);
    expect(loadBlitz(UID).cards[0].state).toBe("new");
  });

  it("keeps a slideshow as its My posts entry, linked to the slideshow", () => {
    const show = { ...blankSlideshow(), id: "s1", title: "Hook" };
    saveSlideshow(UID, show);
    seed([card("c1", "slideshow", { state: "new", showId: "s1" })]);
    const id = keepCard(UID, "c1")!;
    expect(loadDrafts(UID).find((d) => d.id === id)?.status).toBe("draft");
    expect(loadSlideshows(UID).find((s) => s.id === "s1")?.draftId).toBe(id);
  });

  it("skips without saving anything, and Undo puts the slideshow back", () => {
    saveSlideshow(UID, { ...blankSlideshow(), id: "s1", title: "Hook" });
    seed([card("c1", "slideshow", { state: "new", showId: "s1" })]);
    const undo = skipCard(UID, "c1");
    expect(loadSlideshows(UID).some((s) => s.id === "s1")).toBe(false);
    expect(loadDrafts(UID)).toEqual([]);
    expect(loadBlitz(UID).cards[0].state).toBe("skipped");
    undo();
    expect(loadSlideshows(UID).some((s) => s.id === "s1")).toBe(true);
    expect(loadBlitz(UID).cards[0].state).toBe("new");
  });
});

describe("a brand with competitors tracked, no ads, no winners and no ideas", () => {
  beforeEach(() => {
    localStorage.setItem(`content-studio-competitors-${UID}`, JSON.stringify({ list: [{ id: "rival-ab12", name: "Rival", fbPageId: "123456", handles: {} }], dismissed: [] }));
  });

  it("still has a deck from the format drop, however old the drop is", () => {
    const later = new Date(Date.parse(`${FORMAT_TRENDS.fetched}T00:00:00Z`) + 60 * 86_400_000);
    expect(FORMAT_TRENDS.items.length).toBeGreaterThan(0);
    expect(loadPools(UID, later).trends).toHaveLength(FORMAT_TRENDS.items.length);
    expect(nothingToDraw(UID, later)).toBe(false);
  });

  it("says what is missing once Trends is switched off, and never to add a competitor", () => {
    saveBlitz(UID, { day: deckDay(), mix: { ...DEFAULT_MIX, sources: { ads: true, trends: false, winners: true } }, cards: [] });
    expect(nothingToDraw(UID)).toBe(true);
    const why = whyEmpty(UID);
    expect(why.action).toBe("configure");
    expect(why.line).toContain("no running ads found for your competitors");
    expect(why.line).toContain("Trends switched off in Configure");
  });
});

describe("a card's other formats", () => {
  it("opens the green screen and hook plus demo makers on the card's own source", () => {
    const source = { key: "format:tiktok-1", kind: "format", format: "slideshow", title: "t" } as unknown as NonNullable<BlitzCard["source"]>;
    expect(alsoMake({ source })).toEqual([
      { label: "Make it a green screen", href: "/make/green-screen?source=format%3Atiktok-1" },
      { label: "Make it a hook plus demo", href: "/make/hook-demo?source=format%3Atiktok-1" },
    ]);
  });

  it("hands an idea's title to hook plus demo only, and nothing when there is neither", () => {
    expect(alsoMake({ source: null, topic: { title: " Five calls before lunch ", angle: "" } })).toEqual([{ label: "Make it a hook plus demo", href: "/make/hook-demo?topic=Five+calls+before+lunch" }]);
    expect(alsoMake({ source: null })).toEqual([]);
  });
});
