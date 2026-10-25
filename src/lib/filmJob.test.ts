// The launch film's store and jobs, in node with the server faked: what each press sends, what lands in the store,
// Undo, Not quite, notes that queue, and what the editor gets. The film is film/fixtures.ts' good one on real-shaped keys.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabase: { functions: { invoke: vi.fn() }, auth: { getSession: vi.fn(), onAuthStateChange: () => ({}) } }, SUPABASE_URL: "", SUPABASE_ANON_KEY: "" }));
const fn = vi.hoisted(() => vi.fn());
vi.mock("@/lib/edgeFn", async (orig) => ({ ...(await orig<typeof import("./edgeFn")>()), callFn: fn }));
const files = vi.hoisted(() => new Map<string, Blob>());
vi.mock("@/lib/deviceFiles", () => ({ putFile: async (k: string, b: Blob) => void files.set(k, b), getFile: async (k: string) => files.get(k), deleteFile: async () => {} }));

import { EdgeError } from "./edgeFn";
import { goodFilm } from "./film/fixtures";
import { parseFilm, type Film } from "./film/timeline";
import {
  DEFAULT_SETUP, MAX_FILMS, editorExtra, openInEditor, filmJob, fixIssues, getFilm, loadFilms, loadHistory, notQuite, putFilm, resumeFilm, sendNote, setSpec, undoFilm, voiceFilm, voiceStale,
  writeDirections, writeFilm, type FilmDirection, type FilmSetup, type StoredFilm,
} from "./filmJob";
import { AI_LINE } from "./videoProjects";
import { currentJoin, pickupPlan } from "./videoMedia";
import { addCampaign, getCampaign, type Campaign } from "./campaigns";

class MemStorage {
  private m = new Map<string, string>();
  get length() { return this.m.size; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
}

const UID = "6d80f027-3395-480c-86a1-8827d3d6cce3";
const APP = "cimg-mh2k9x01ab";
const APP2 = "cimg-mh2k9x02cd";
const SETUP: FilmSetup = { ...DEFAULT_SETUP, product: "Activity Tracker's AI coach", remember: "Your week, planned in one tap", screens: [APP, APP2] };

/** The good film on keys the parser takes. */
const film = (): Film => JSON.parse(JSON.stringify(goodFilm()).replace(/cimg-app1/g, APP).replace(/cimg-app2/g, APP2));
/** A spec as the parser writes it back (its own key order), which is what the store holds. */
const norm = (f: Film) => JSON.stringify((parseFilm(f) as { film: Film }).film);
const DIRECTIONS: FilmDirection[] = [
  { name: "Demo", line: "Your app does it, tap by tap.", spine: "screen", ground: "ink", accent: "brand", hero: film().scenes[1] },
  { name: "Claim", line: "Three words slam in, then the app.", spine: "type", ground: "brand", accent: "brand", hero: film().scenes[0] },
  { name: "Cards", line: "Each feature lands as a card, then the proof.", spine: "cards", ground: "paper", accent: "brand", hero: film().scenes[3] },
];
const NO_FLAGS = { mas: null, compliance: [] };
const directionsAnswer = { directions: DIRECTIONS, recommended: 0, product: "devtool", flags: NO_FLAGS };
const filmAnswer = (f = film()) => ({ film: f, issues: [], flags: NO_FLAGS });

/** A film already written, stored directly. */
function stored(over: Partial<StoredFilm> = {}): StoredFilm {
  const f: StoredFilm = {
    id: "fm-test1", name: "Launch", createdAt: "2026-10-25T01:00:00.000Z", updatedAt: "2026-10-25T01:00:00.000Z", setup: SETUP,
    directions: DIRECTIONS, recommended: 0, product: "devtool", picked: 0, spec: film(), issues: [], notes: [], exports: [], ...over,
  };
  putFilm(UID, f);
  return f;
}
const modeOf = (call: unknown[]) => (call[1] as { mode: string }).mode;

beforeEach(() => {
  vi.stubGlobal("localStorage", new MemStorage());
  vi.stubGlobal("window", { dispatchEvent: () => true, localStorage });
  fn.mockReset();
  files.clear();
});
afterEach(() => vi.unstubAllGlobals());

describe("Show me 3 directions and Make this one", () => {
  it("writes three directions into a new film with the setup, brand, kit and picked screens", async () => {
    fn.mockResolvedValueOnce(directionsAnswer);
    const id = await writeDirections(UID, SETUP);
    expect(id).toMatch(/^fm-[a-z0-9]+$/);
    expect(fn).toHaveBeenCalledTimes(1);
    const [name, body] = fn.mock.calls[0];
    expect(name).toBe("video-assist");
    expect(body).toMatchObject({ mode: "film-directions", setup: { product: SETUP.product, remember: SETUP.remember, length: 30, shape: "9x16", energy: "fast", voice: false } });
    expect(body.kit).toHaveProperty("color");
    expect(body.brand).toHaveProperty("speaker");
    const f = getFilm(UID, id)!;
    expect(f.directions.map((d) => d.name)).toEqual(["Demo", "Claim", "Cards"]);
    expect(f.recommended).toBe(0);
    expect(f.spec).toBeUndefined();
  });

  it("Show 3 more replaces the directions on the same film", async () => {
    fn.mockResolvedValueOnce(directionsAnswer);
    const id = (await writeDirections(UID, SETUP))!;
    fn.mockResolvedValueOnce({ ...directionsAnswer, recommended: null, directions: [...DIRECTIONS].reverse() });
    expect(await writeDirections(UID, SETUP, id)).toBe(id);
    expect(loadFilms(UID)).toHaveLength(1);
    expect(getFilm(UID, id)!.directions[0].name).toBe("Cards");
    expect(getFilm(UID, id)!.recommended).toBeNull();
  });

  it("keeps the server's line and marks the cap when the day's uses are gone", async () => {
    fn.mockRejectedValueOnce(new EdgeError("You've used today's launch films. Back at 8am Singapore time.", 429, "daily_limit"));
    expect(await writeDirections(UID, SETUP)).toBeNull();
    expect(filmJob()).toMatchObject({ state: "failed", capped: true, error: "You've used today's launch films. Back at 8am Singapore time." });
  });

  it("Make this one sends the picked direction with its style, and the browser parses the film before it saves", async () => {
    const f = stored({ spec: undefined, picked: undefined });
    fn.mockResolvedValueOnce(filmAnswer());
    expect(await writeFilm(UID, f.id, 2)).toBe(true);
    expect(fn.mock.calls[0][1]).toMatchObject({ mode: "film", direction: { name: "Cards" }, style: 2, product: "devtool" });
    expect(JSON.stringify(getFilm(UID, f.id)!.spec)).toBe(norm(film()));
    // a film with a web address in its words never saves
    const bad = film();
    (bad.scenes[0] as { words: string[] }).words = ["Visit www.example.com"];
    fn.mockResolvedValueOnce(filmAnswer(bad));
    expect(await writeFilm(UID, f.id, 0)).toBe(false);
    expect(filmJob()?.error).toBe("That film didn't come out right. Try again.");
  });

  it("reads the lines with the AI voice after the film when voice is on, one text-voice call", async () => {
    const f = stored({ spec: undefined, picked: undefined, setup: { ...SETUP, voice: true } });
    const voiced = { ...film(), voice: { on: true, lines: { hook: "Your week, planned.", end: "Activity Tracker." } } };
    fn.mockResolvedValueOnce(filmAnswer(voiced)).mockResolvedValueOnce({ audio: btoa("mp3"), spans: [{ s: 0, e: 1.2 }, { s: 1.3, e: 2 }] });
    expect(await writeFilm(UID, f.id, 0)).toBe(true);
    expect(fn.mock.calls.map(modeOf)).toEqual(["film", "lines"]);
    expect(fn.mock.calls[1][1]).toMatchObject({ lines: ["Your week, planned.", "Activity Tracker."], voice: "alice" });
    const v = getFilm(UID, f.id)!.voice!;
    expect(v.ids).toEqual(["hook", "end"]);
    expect(files.has(v.key)).toBe(true);
    expect(voiceStale(getFilm(UID, f.id)!)).toBe(false);
    // a changed line makes the read stale: Read it again is a press, never automatic
    setSpec(UID, f.id, { ...voiced, voice: { on: true, lines: { hook: "Plan the week.", end: "Activity Tracker." } } });
    expect(voiceStale(getFilm(UID, f.id)!)).toBe(true);
    expect(fn).toHaveBeenCalledTimes(2);
    fn.mockResolvedValueOnce({ audio: btoa("mp3"), spans: [{ s: 0, e: 1 }, { s: 1.1, e: 2 }] });
    expect(await voiceFilm(UID, f.id)).toBe(true);
    expect(voiceStale(getFilm(UID, f.id)!)).toBe(false);
  });
});

describe("Point to change", () => {
  const card2 = { t: 1.2, x: 0.5, y: 0.52, target: "features.card2.title", label: "Card 2 title", scene: "features", at: 15.2, text: "Make this shorter" };
  const shorter = () => {
    const f = film();
    const cards = f.scenes[3] as { cards: { title: string }[] };
    cards.cards[1].title = "Track it";
    return f;
  };

  it("sends the spot and the note, saves the change, and Undo restores the spec exactly", async () => {
    const f = stored();
    const before = JSON.stringify(getFilm(UID, f.id)!.spec);
    fn.mockResolvedValueOnce({ film: shorter(), scene: shorter().scenes[3], reply: "Card 2 now reads Track it.", issues: [], flags: NO_FLAGS });
    const id = sendNote(UID, f.id, card2)!;
    expect(getFilm(UID, f.id)!.notes[0]).toMatchObject({ id: "n1", status: "changing" });
    await vi.waitFor(() => expect(getFilm(UID, f.id)!.notes[0].status).toBe("done"));
    expect(fn.mock.calls[0][1]).toMatchObject({ mode: "film-edit", scene: "features", target: "features.card2.title", t: 1.2, x: 0.5, y: 0.52, note: "Make this shorter", thread: [] });
    const after = getFilm(UID, f.id)!;
    expect(after.notes[0].reply).toBe("Card 2 now reads Track it.");
    // every other scene is as it was
    after.spec!.scenes.forEach((s, i) => i !== 3 && expect(JSON.stringify(s)).toBe(JSON.stringify(JSON.parse(norm(film())).scenes[i])));
    expect(loadHistory(f.id)).toEqual([before]);
    expect(undoFilm(UID, f.id)).toBe(true);
    expect(JSON.stringify(getFilm(UID, f.id)!.spec)).toBe(before);
    expect(undoFilm(UID, f.id)).toBe(false);
    expect(id).toBe("n1");
  });

  it("queues a second note as Waiting behind one that is changing, and sends it the changed film", async () => {
    const f = stored();
    let answer!: (v: unknown) => void;
    fn.mockImplementationOnce(() => new Promise((r) => (answer = r)));
    sendNote(UID, f.id, card2);
    sendNote(UID, f.id, { ...card2, target: "hook.word1", label: "Word 1", scene: "hook", text: "Bigger" });
    expect(getFilm(UID, f.id)!.notes.map((n) => n.status)).toEqual(["changing", "waiting"]);
    fn.mockResolvedValueOnce({ film: shorter(), reply: "Word 1 is bigger.", issues: [], flags: NO_FLAGS });
    answer({ film: shorter(), reply: "Card 2 now reads Track it.", issues: [], flags: NO_FLAGS });
    await vi.waitFor(() => expect(getFilm(UID, f.id)!.notes.map((n) => n.status)).toEqual(["done", "done"]));
    expect(fn).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(fn.mock.calls[1][1].film)).toBe(norm(shorter()));
  });

  it("keeps the film as it was when the change can't be made, with the line", async () => {
    const f = stored();
    fn.mockRejectedValueOnce(new EdgeError("Couldn't change only that spot. Try saying it another way.", 422, "unusable"));
    sendNote(UID, f.id, card2);
    await vi.waitFor(() => expect(getFilm(UID, f.id)!.notes[0].status).toBe("failed"));
    expect(getFilm(UID, f.id)!.notes[0].error).toBe("Couldn't change only that spot. Try saying it another way.");
    expect(JSON.stringify(getFilm(UID, f.id)!.spec)).toBe(norm(film()));
    expect(loadHistory(f.id)).toEqual([]);
  });

  it("Not quite reopens the note with its earlier reply in the thread, and the next send carries it", async () => {
    const f = stored();
    fn.mockResolvedValueOnce({ film: shorter(), reply: "Card 2 now reads Track it.", issues: [], flags: NO_FLAGS });
    sendNote(UID, f.id, card2);
    await vi.waitFor(() => expect(getFilm(UID, f.id)!.notes[0].status).toBe("done"));
    notQuite(UID, f.id, "n1");
    expect(getFilm(UID, f.id)!.notes[0]).toMatchObject({ status: "open", text: "", thread: [{ note: "Make this shorter", reply: "Card 2 now reads Track it." }] });
    fn.mockResolvedValueOnce({ film: shorter(), reply: "Card 2 now reads Track.", issues: [], flags: NO_FLAGS });
    sendNote(UID, f.id, { ...card2, text: "Shorter still" }, "n1");
    await vi.waitFor(() => expect(getFilm(UID, f.id)!.notes[0].status).toBe("done"));
    expect(fn.mock.calls[1][1]).toMatchObject({ note: "Shorter still", thread: [{ note: "Make this shorter", reply: "Card 2 now reads Track it." }] });
    expect(getFilm(UID, f.id)!.notes).toHaveLength(1);
  });

  it("Fix it sends the rhythm notes as one note on the whole film", async () => {
    const f = stored({ issues: ["Nothing happens from 0:12 to 0:16."] });
    fn.mockResolvedValueOnce({ film: film(), reply: "Added a card at 0:13.", issues: [], flags: NO_FLAGS });
    fixIssues(UID, f.id);
    await vi.waitFor(() => expect(getFilm(UID, f.id)!.notes[0]?.status).toBe("done"));
    expect(fn.mock.calls[0][1]).toMatchObject({ mode: "film-edit", scene: null, note: "Fix these: Nothing happens from 0:12 to 0:16." });
    expect(getFilm(UID, f.id)!.issues).toEqual([]);
  });

  it("a reload brings a note that was waiting or changing back open, its words kept, and sends nothing", () => {
    stored({ notes: [{ ...card2, id: "n1", status: "changing", thread: [] }, { ...card2, id: "n2", status: "waiting", thread: [] }] });
    resumeFilm(UID, "fm-test1");
    expect(getFilm(UID, "fm-test1")!.notes.map((n) => [n.status, n.text])).toEqual([["open", "Make this shorter"], ["open", "Make this shorter"]]);
    expect(fn).not.toHaveBeenCalled();
  });
});

describe("Fields, the store and the hand-off", () => {
  it("changes a word with no model, refuses a web address, and Undo takes it back", () => {
    const f = stored();
    const next = film();
    (next.scenes[5] as { line: string }).line = "Plan the week.";
    expect(setSpec(UID, f.id, next)).toBeNull();
    expect((getFilm(UID, f.id)!.spec!.scenes[5] as { line: string }).line).toBe("Plan the week.");
    const bad = film();
    (bad.scenes[5] as { line: string }).line = "Go to example.com";
    expect(setSpec(UID, f.id, bad)).toMatch(/web address/);
    expect(undoFilm(UID, f.id)).toBe(true);
    expect(JSON.stringify(getFilm(UID, f.id)!.spec)).toBe(norm(film()));
    expect(fn).not.toHaveBeenCalled();
  });

  it("keeps the 20 newest films", () => {
    for (let i = 0; i < MAX_FILMS + 2; i++) putFilm(UID, { ...stored(), id: `fm-n${i}` });
    const list = loadFilms(UID);
    expect(list).toHaveLength(MAX_FILMS);
    expect(list[0].id).toBe(`fm-n${MAX_FILMS + 1}`);
  });

  it("hands the editor the AI voice's mark with the AI line when the voice reads it, and neither with music only", () => {
    const music = stored();
    const plain = pickupPlan(editorExtra(music), "no-captions").keep;
    expect(plain.ai).toBeUndefined();
    expect(plain.caption ?? "").not.toContain(AI_LINE);
    expect(editorExtra(music).settings).toEqual({ captions: false });
    const voiced = stored({
      spec: { ...film(), voice: { on: true, lines: { hook: "Your week." } } },
      voice: { key: "film-voice-a", voiceId: "alice", ids: ["hook"], texts: ["Your week."], spans: [{ s: 0, e: 1 }], at: "2026-10-25T01:00:00.000Z" },
    });
    const keep = pickupPlan(editorExtra(voiced), "no-captions").keep;
    expect(keep.ai).toMatchObject({ kind: "explainer", voice: "premade", voiceId: "alice" });
    expect(keep.caption!.endsWith(AI_LINE)).toBe(true);
  });

  it("names the campaign post's draft when the film was made for one", () => {
    const f = stored({ setup: { ...SETUP, campaign: { id: "c-lq3k9z", n: 4 } } });
    expect(editorExtra(f).draftId).toBe("cmp_c-lq3k9z_4");
  });

  it("Open in editor hands the film to the join and marks the campaign post made with its draft", async () => {
    const c = { id: "c-lq3k9z", name: "Launch", createdAt: "", audience: "", angles: [], platforms: ["instagram"], formats: ["ai-video"], weeks: 1, perWeek: 3, startDay: "2026-10-26", pictures: "stock", posts: [{ n: 4, day: "2026-10-29", format: "ai-video", state: "ready" }] } as unknown as Campaign;
    expect(addCampaign(UID, c)).toBeNull();
    const f = stored({ setup: { ...SETUP, campaign: { id: c.id, n: 4 } } });
    await openInEditor(UID, f.id, { shape: "9x16", blob: new Blob(["mp4"], { type: "video/mp4" }), ext: "mp4", seconds: 30, realtime: false });
    expect(currentJoin()).toMatchObject({ state: "done", extra: { draftId: "cmp_c-lq3k9z_4", settings: { captions: false } } });
    expect(currentJoin()!.file!.name).toBe("launch-9x16.mp4");
    expect(getCampaign(UID, c.id)!.posts[0]).toMatchObject({ state: "made", draftId: "cmp_c-lq3k9z_4", made: { kind: "video", id: "cmp_c-lq3k9z_4" } });
  });
});
