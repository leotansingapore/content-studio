// The recorder against fake job stores: one row per job that ends, none for a repeat, a failed picture fix, a step
// another store logs, or anyone whose session never turned the log on.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Fake = { get: () => unknown; on: (fn: (j: unknown) => void) => () => void; emit: (j: unknown) => void; size: () => number };
const stores = vi.hoisted(() => {
  const make = (): Fake => {
    let cur: unknown = null;
    const fns = new Set<(j: unknown) => void>();
    return {
      get: () => cur,
      on: (fn) => (fns.add(fn), () => void fns.delete(fn)),
      // a second passes between emits, so the rows keep the order they happened in
      emit: (j) => (vi.setSystemTime(Date.now() + 1000), (cur = j), fns.forEach((f) => f(j))),
      size: () => fns.size,
    };
  };
  return { remix: make(), ai: make(), image: make(), show: make(), wall: make(), scene: make(), talk: make() };
});

vi.mock("@/lib/supabase", () => ({
  SUPABASE_URL: "https://abc.supabase.co",
  supabase: { auth: { getSession: () => new Promise(() => undefined), onAuthStateChange: () => ({}) } },
}));
vi.mock("@/lib/aiVideo", async (actual) => ({ ...(await actual<object>()), onAiJob: stores.ai.on, aiJob: stores.ai.get }));
vi.mock("@/lib/aiImage", async (actual) => ({ ...(await actual<object>()), onImageJob: stores.image.on, imageJob: stores.image.get }));
vi.mock("@/lib/slideshowJob", async (actual) => ({ ...(await actual<object>()), onSlideshowJob: stores.show.on, slideshowJob: stores.show.get }));
vi.mock("@/lib/wallJob", async (actual) => ({
  ...(await actual<object>()),
  onWallJob: (fn: (j: unknown) => void, slot: "wall" | "scene" = "wall") => stores[slot].on(fn),
  wallJob: (slot: "wall" | "scene" = "wall") => stores[slot].get(),
}));
vi.mock("@/lib/talkingHeadJob", async (actual) => ({ ...(await actual<object>()), onTalkJob: stores.talk.on, talkJob: stores.talk.get }));
vi.mock("@/lib/remixJob", async (actual) => ({ ...(await actual<object>()), onRemixJob: stores.remix.on, remixJob: stores.remix.get }));

const UID = "6d80f027-3395-480c-86a1-8827d3d6cce3";
const store = new Map<string, string>();
const ls = {
  get length() {
    return store.size;
  },
  key: (i: number) => [...store.keys()][i] ?? null,
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};
vi.stubGlobal("localStorage", ls);
vi.stubGlobal("window", { localStorage: ls, dispatchEvent: () => true, addEventListener() {}, removeEventListener() {}, location: new URL("http://localhost/") });

// vitest 4.1 hands the real module to the second of two imports in flight at once: each mocked store is loaded alone,
// in the order they import each other, before the recorder
await import("@/lib/aiVideo");
await import("@/lib/aiImage");
await import("@/lib/slideshowJob");
await import("@/lib/wallJob");
await import("@/lib/talkingHeadJob");
await import("@/lib/remixJob");
const { recordJobs } = await import("./ActivityRecorder");
const { loadActivity, setActivityOn } = await import("@/lib/activity");

/** Oldest first. */
const rows = () => loadActivity(UID, ["2026-10"]).reverse().map(({ who, kind, title, detail, link }) => ({ who, kind, title, ...(detail ? { detail } : {}), ...(link ? { link } : {}) }));
let off = () => {};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 22, 10, 0));
  store.clear();
  store.set("cs-device-tag", "dev001");
  for (const s of Object.values(stores)) s.emit(null);
  setActivityOn(true);
  off = recordJobs(UID);
});
afterEach(() => {
  off();
  vi.useRealTimers();
});

describe("the recorder", () => {
  it("listens to every store, and stops when it unmounts", () => {
    expect(Object.values(stores).map((s) => s.size())).toEqual([1, 1, 1, 1, 1, 1, 1]);
    off();
    expect(Object.values(stores).map((s) => s.size())).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });

  it("logs a picture once: working, saving, then done twice", () => {
    stores.image.emit({ prompt: "Hawker centre at dusk", state: "working" });
    stores.image.emit({ prompt: "Hawker centre at dusk", state: "saving" });
    stores.image.emit({ prompt: "Hawker centre at dusk", state: "done", mediaKey: "m1" });
    stores.image.emit({ prompt: "Hawker centre at dusk", state: "done", mediaKey: "m1" });
    expect(rows()).toEqual([{ who: "you", kind: "make", title: "Made a picture", detail: "Hawker centre at dusk", link: "/media?folder=AI+images" }]);
  });

  it("logs a finished fix, and nothing for a failed one that re-emits the picture before it as done", () => {
    const before = { prompt: "Hawker", state: "done", mediaKey: "m1", token: "t" };
    stores.image.emit(before);
    stores.image.emit({ prompt: "Hawker", state: "working", fix: "Warmer light" });
    stores.image.emit({ ...before, fixError: "Couldn't fix it." });
    expect(rows()).toEqual([]);
    stores.image.emit({ prompt: "Hawker", state: "working", fix: "Warmer light" });
    stores.image.emit({ prompt: "Hawker", state: "saving", fix: "Warmer light" });
    stores.image.emit({ prompt: "Hawker", state: "done", mediaKey: "m2" });
    expect(rows().map((r) => [r.title, r.detail])).toEqual([["Fixed a picture", "Warmer light"]]);
  });

  it("logs a picture that could not be made, with the job's error", () => {
    stores.image.emit({ prompt: "Hawker", state: "working" });
    stores.image.emit({ prompt: "Hawker", state: "failed", error: "The image is taking too long." });
    expect(rows()).toEqual([{ who: "you", kind: "make", title: "A picture could not be made", detail: "The image is taking too long." }]);
  });

  it("logs each AI video by kind, done or failed, linked to the editor", () => {
    stores.ai.emit({ kind: "presenter", state: "working", step: "" });
    stores.ai.emit({ kind: "presenter", state: "done", step: "", url: "https://x/p.png" });
    stores.ai.emit({ kind: "avatar", state: "working", step: "Making your video" });
    stores.ai.emit({ kind: "avatar", state: "working", step: "Putting your video together..." });
    stores.ai.emit({ kind: "avatar", state: "failed", step: "", error: "It's taking too long. Try again later." });
    stores.ai.emit({ kind: "avatar", state: "failed", step: "", error: "It's taking too long. Try again later." });
    expect(rows()).toEqual([
      { who: "you", kind: "make", title: "Made a presenter picture", link: "/edit" },
      { who: "you", kind: "make", title: "The avatar video could not be made", detail: "It's taking too long. Try again later.", link: "/edit" },
    ]);
  });

  it("logs a remix run once when it ends: its formats, hooks and first link, as the agent's when its draft says so", () => {
    store.set(`content-studio-drafts-${UID}`, JSON.stringify([{ id: "d1", agent: { thread: "t1", msg: "m1" } }]));
    const run = { id: 1, key: "", state: "working", step: "Writing your text post", run: {}, rows: [{ as: "post", state: "working" }, { as: "carousel", state: "waiting" }, { as: "script", state: "waiting" }] };
    stores.remix.emit(run);
    stores.remix.emit({ ...run, rows: [{ as: "post", state: "done", draftId: "d1", hook: "3 CPF myths at 55", href: "/generate?draft=d1" }, { as: "carousel", state: "working" }, { as: "script", state: "waiting" }] });
    const ended = {
      ...run,
      state: "done",
      step: "",
      rows: [
        { as: "post", state: "done", draftId: "d1", hook: "3 CPF myths at 55", href: "/generate?draft=d1" },
        { as: "carousel", state: "done", draftId: "d2", hook: "Your CPF at 55", href: "/carousel?draft=d2" },
        { as: "script", state: "failed", error: "This one didn't go through." },
      ],
    };
    stores.remix.emit(ended);
    stores.remix.emit(ended);
    expect(rows()).toEqual([
      {
        who: "agent",
        kind: "make",
        title: "Made a text post and a carousel",
        detail: '"3 CPF myths at 55" and "Your CPF at 55". A script could not be made: This one didn\'t go through.',
        link: "/generate?draft=d1",
      },
    ]);
  });

  it("logs a remix from a source as yours, and one where nothing was made", () => {
    const run = { id: 2, key: "top:abc", state: "working", step: "", run: {}, rows: [{ as: "carousel", state: "working" }] };
    stores.remix.emit(run);
    stores.remix.emit({ ...run, state: "done", rows: [{ as: "carousel", state: "done", draftId: "d9", hook: "Hook", href: "/carousel?draft=d9" }] });
    stores.remix.emit({ ...run, id: 3, state: "working" });
    stores.remix.emit({ ...run, id: 3, state: "failed", rows: [{ as: "carousel", state: "failed", error: "No remixes left today." }] });
    expect(rows()).toEqual([
      { who: "you", kind: "remix", title: "Made a carousel: \"Hook\"", link: "/carousel?draft=d9" },
      { who: "you", kind: "remix", title: "A remix could not be made", detail: "No remixes left today." },
    ]);
  });

  it("logs a slideshow, a wall of text and a made scene when each one ends", () => {
    const ask = { source: null, topic: "CPF at 55", mention: true, note: "", size: "4x5", pictures: "stock" };
    stores.show.emit({ id: 1, state: "writing", done: 0, of: 0, ask });
    stores.show.emit({ id: 1, state: "finding", done: 2, of: 5, ask });
    stores.show.emit({ id: 1, state: "done", done: 5, of: 5, ask, showId: "s1" });
    stores.wall.emit({ id: 1, state: "writing", ask: { source: null, about: "Retire at 55?" } });
    stores.wall.emit({ id: 1, state: "done", ask: { source: null, about: "Retire at 55?" } });
    stores.scene.emit({ id: 2, state: "clip", ask: { source: null, about: "Retire at 55?" } });
    stores.scene.emit({ id: 2, state: "failed", ask: { source: null, about: "Retire at 55?" }, error: "Couldn't finish the video." });
    expect(rows()).toEqual([
      { who: "you", kind: "make", title: "Made a slideshow", detail: "CPF at 55", link: "/slideshow?s=s1" },
      { who: "you", kind: "make", title: "Made a wall of text", detail: "Retire at 55?", link: "/edit" },
      { who: "you", kind: "make", title: "Words over a made scene could not be made", detail: "Couldn't finish the video." },
    ]);
  });

  it("logs a talking video's script and a failure in its own steps, but not one the AI video store logs", () => {
    stores.talk.emit({ id: 1, state: "writing", step: "", params: { who: "mine" } });
    stores.talk.emit({ id: 1, state: "written", step: "", params: { who: "mine" }, script: "Most people think CPF is locked." });
    stores.talk.emit({ id: 2, state: "voice", step: "", params: {} });
    stores.talk.emit({ id: 2, state: "failed", step: "", params: {}, error: "Couldn't make the voiceover." });
    stores.talk.emit({ id: 3, state: "video", step: "", params: {} });
    stores.talk.emit({ id: 3, state: "failed", step: "", params: {}, error: "It's taking too long." });
    expect(rows()).toEqual([
      { who: "you", kind: "make", title: "Wrote a talking video script", detail: "Most people think CPF is locked.", link: "/make/talking-head?who=mine" },
      { who: "you", kind: "make", title: "A talking video could not be made", detail: "Couldn't make the voiceover.", link: "/make/talking-head" },
    ]);
  });

  it("logs nothing while the log is off", () => {
    setActivityOn(false);
    stores.image.emit({ prompt: "Hawker", state: "working" });
    stores.image.emit({ prompt: "Hawker", state: "done" });
    expect([...store.keys()].filter((k) => k.startsWith("content-studio-activity-"))).toEqual([]);
  });
});
