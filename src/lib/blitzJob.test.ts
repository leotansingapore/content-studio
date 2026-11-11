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
vi.mock("@/lib/remix", async (orig) => ({ ...(await orig<typeof import("./remix")>()), requestMake }));

import { DEFAULT_MIX, deckDay, loadBlitz, saveBlitz, type BlitzCard } from "./blitz";
import { blitzBusy, keepCard, retryCard, skipCard, undoKeep } from "./blitzJob";
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
