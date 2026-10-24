import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabase: { functions: { invoke: vi.fn() } }, SUPABASE_URL: "", SUPABASE_ANON_KEY: "" }));

// the makers' job stores, faked: each start moves its store the way the real one does, and the test drives the rest
const fake = vi.hoisted(() => {
  type J = Record<string, unknown> & { id: number; state: string };
  const store = () => {
    const ls = new Set<(j: J | null) => void>();
    return {
      job: null as J | null,
      set(j: J | null) {
        this.job = j;
        ls.forEach((l) => l(j && { ...j }));
      },
      patch(p: Partial<J>) {
        this.set({ ...(this.job as J), ...p });
      },
      on(l: (j: J | null) => void) {
        ls.add(l);
        return () => void ls.delete(l);
      },
      reset() {
        this.job = null;
        ls.clear();
      },
    };
  };
  return { show: store(), wall: store(), talk: store(), seq: 0, ai: { busy: false, pending: null as unknown }, who: "me", presenters: [] as unknown[], fn: null as unknown as ReturnType<typeof vi.fn> };
});
const busyIn = (j: { state: string } | null, states: string[]) => !!j && states.includes(j.state);
const startSlideshow = vi.hoisted(() => vi.fn());
const startWall = vi.hoisted(() => vi.fn());
const startTalk = vi.hoisted(() => vi.fn());
const resumeTalk = vi.hoisted(() => vi.fn());
const startDrafting = vi.hoisted(() => vi.fn());
const fn = vi.hoisted(() => vi.fn());

vi.mock("@/lib/edgeFn", async (orig) => ({ ...(await orig<typeof import("./edgeFn")>()), callFn: fn }));
vi.mock("@/lib/slideshowJob", async (orig) => ({
  ...(await orig<typeof import("./slideshowJob")>()),
  startSlideshow,
  slideshowJob: () => fake.show.job,
  slideshowBusy: () => busyIn(fake.show.job, ["writing", "finding", "drawing"]),
}));
vi.mock("@/lib/wallJob", async (orig) => ({
  ...(await orig<typeof import("./wallJob")>()),
  startWall,
  wallJob: () => fake.wall.job,
  wallBusy: () => busyIn(fake.wall.job, ["writing", "finding", "clip", "joining"]),
  onWallJob: (l: (j: unknown) => void) => fake.wall.on(l as never),
}));
vi.mock("@/lib/talkingHeadJob", async (orig) => ({
  ...(await orig<typeof import("./talkingHeadJob")>()),
  startTalk,
  resumeTalk,
  talkJob: () => fake.talk.job,
  talkBusy: () => busyIn(fake.talk.job, ["writing", "presenter", "voice", "video", "joining"]),
  onTalkJob: (l: (j: unknown) => void) => fake.talk.on(l as never),
}));
vi.mock("@/lib/aiVideo", async (orig) => ({ ...(await orig<typeof import("./aiVideo")>()), aiBusy: () => fake.ai.busy, pendingAvatar: () => fake.ai.pending }));
// the brand's "Who appears": "me" with a face saved and on, or "ask" (Ask each time)
vi.mock("@/lib/talkingHead", async (orig) => ({ ...(await orig<typeof import("./talkingHead")>()), speakers: () => ({ face: { id: "f1" }, presenters: fake.presenters, who: fake.who }) }));
vi.mock("@/lib/campaignJob", async (orig) => ({ ...(await orig<typeof import("./campaignJob")>()), startDrafting }));

import { saveAudience } from "./audiences";
import { AI_VIDEO, angleCounts, campaignCost, getCampaign, saveCampaigns, type Campaign, type CampaignPost } from "./campaigns";
import { splitDraftIntoSlides } from "./carousel";
import { getDraftById, loadDrafts, MAX_DRAFTS, saveDrafts, type DraftEntry } from "./draftHistory";
import { priceOf, sumPrices } from "./prices";
import { blankSlideshow, loadSlideshows, MAX_SHOWS, saveSlideshow } from "./slideshow";
import { scriptEstimate } from "./talkingHead";

class MemStorage {
  s = new Map<string, string>();
  get length() { return this.s.size; }
  key(i: number) { return [...this.s.keys()][i] ?? null; }
  getItem(k: string) { return this.s.get(k) ?? null; }
  setItem(k: string, v: string) { this.s.set(k, v); }
  removeItem(k: string) { this.s.delete(k); }
}

const UID = "u1";
const NOW = new Date("2026-10-22T10:00:00.000Z");
const ANGLES = [
  { id: "a1", title: "The hospital bill question", line: "What a stay really costs" },
  { id: "a2", title: "Busy weeks", line: "Why follow-ups slip" },
];
const SCRIPT = Array.from({ length: 40 }, (_, i) => `word${i}`).join(" ");
const CAPTION = "First point here.\n\nSecond point here.\n\nThird point here.\n\nWhat would you add?";
const post = (n: number, o: Partial<CampaignPost> = {}): CampaignPost => ({
  n, day: `2026-11-0${n}`, time: "20:00", angleId: ANGLES[(n - 1) % 2].id, format: "text-post", stage: "trust", pillar: "topic", ctaType: "open-question",
  formulaId: "contrarian", state: "ready", hook: `Most people get post ${n} wrong`, body: "First point here.\n\nSecond point here.\n\nThird point here.", cta: "What would you add?",
  mas: false, ...o,
});
let audienceId = "";
const campaign = (posts: CampaignPost[], o: Partial<Campaign> = {}): Campaign => ({
  id: "c-1", name: "Young families | November", createdAt: NOW.toISOString(), audience: audienceId, audienceName: "Young families", angles: ANGLES,
  platforms: ["linkedin", "instagram"], formats: ["text-post"], weeks: 1, perWeek: 7, startDay: "2026-11-01", pictures: "stock",
  target: { posts: posts.length, winners: 1 }, posts, ...o,
});
const seed = (posts: CampaignPost[], o: Partial<Campaign> = {}) => expect(saveCampaigns(UID, [campaign(posts, o)])).toBeNull();
const the = (n: number) => getCampaign(UID, "c-1")!.posts.find((p) => p.n === n)!;
const tick = () => new Promise((r) => setTimeout(r, 0));

let local: MemStorage;
// fresh per test: a make or swap left running by one test must not hold its post in the next
let act: typeof import("./campaignActions");
let EdgeError: typeof import("./edgeFn").EdgeError;
beforeEach(async () => {
  vi.resetModules();
  act = await import("./campaignActions");
  EdgeError = (await import("./edgeFn")).EdgeError;
  local = new MemStorage();
  vi.stubGlobal("localStorage", local);
  vi.stubGlobal("sessionStorage", new MemStorage());
  vi.stubGlobal("window", { localStorage: local, dispatchEvent: () => true, addEventListener: () => {}, removeEventListener: () => {} });
  fake.show.reset();
  fake.wall.reset();
  fake.talk.reset();
  fake.ai = { busy: false, pending: null };
  fake.who = "me";
  fake.presenters = [];
  fn.mockReset();
  startDrafting.mockReset();
  startSlideshow.mockReset().mockImplementation(async (userId: string, ask: { topic: string }) => {
    fake.show.set({ id: ++fake.seq, state: "writing", done: 0, of: 0, ask });
    await tick();
    const show = { ...blankSlideshow({}, NOW), id: "ss-made", title: ask.topic, caption: "Made caption. Save this." };
    saveSlideshow(userId, show, NOW);
    fake.show.patch({ state: "done", showId: show.id });
  });
  startWall.mockReset().mockImplementation(async (_: string, ask: unknown) => {
    fake.wall.set({ id: ++fake.seq, state: "writing", ask });
  });
  startTalk.mockReset().mockImplementation(async (_: string, ask: unknown) => {
    fake.talk.set({ id: ++fake.seq, state: "voice", step: "Making the voiceover...", params: {}, ask });
  });
  resumeTalk.mockReset().mockImplementation(() => {
    fake.talk.set({ id: ++fake.seq, state: "video", step: "", params: {} });
    return true;
  });
  const a = saveAudience(UID, { name: "Young families", who: "Parents with kids under 10", lifeStage: "parent" }, NOW);
  if (a.ok === false) throw new Error(a.error);
  audienceId = a.audience.id;
});
afterEach(() => vi.unstubAllGlobals());

describe("makePost, free formats", () => {
  it("puts a text post on the calendar as cmp_<id>_<n> at its day and time, with its plan fields, and moves it to made", async () => {
    seed([post(1)]);
    const r = await act.makePost(UID, "c-1", 1, NOW);
    expect(r).toMatchObject({ ok: true, toast: "Post 1 is on your calendar for Sun 1 Nov, 8pm." });
    const d = getDraftById(UID, "cmp_c-1_1")!;
    expect(d).toMatchObject({
      status: "scheduled", scheduledFor: "2026-11-01T20:00", format: "text-post", platform: "linkedin", pillar: "topic", pillarDetail: "The hospital bill question",
      audience: "parent", ctaType: "open-question", hookFormula: "contrarian", hook: "Most people get post 1 wrong",
    });
    expect(d.draft).toBe("Most people get post 1 wrong\n\nFirst point here.\n\nSecond point here.\n\nThird point here.\n\nWhat would you add?");
    expect(the(1)).toMatchObject({ state: "made", draftId: "cmp_c-1_1", made: { kind: "draft", id: "cmp_c-1_1" } });
  });

  it("makes a carousel whose draft rebuilds the slides the queue showed, and saves no carousel", async () => {
    seed([post(2, { format: "carousel", body: "Point one is short.\n\nPoint two is short.\n\nPoint three is short.\n\nPoint four is short." })]);
    const shown = act.postSlides(the(2));
    await act.makePost(UID, "c-1", 2, NOW);
    const d = getDraftById(UID, "cmp_c-1_2")!;
    expect(d.format).toBe("carousel");
    expect(splitDraftIntoSlides(d.draft, { hook: d.hook }).slides).toEqual(shown);
    expect(shown.length).toBeGreaterThanOrEqual(4);
    expect([...local.s.keys()].some((k) => /carousel/i.test(k))).toBe(false);
  });

  it("never makes a post twice, and its Undo takes it off the calendar and back to ready", async () => {
    seed([post(1), post(3)]);
    const r = await act.makePost(UID, "c-1", 1, NOW);
    expect(await act.makePost(UID, "c-1", 1, NOW)).toEqual({ ok: false, error: act.MADE_LINE });
    expect(loadDrafts(UID)).toHaveLength(1);
    if (r.ok === false) throw new Error(r.error);
    r.undo();
    expect(getDraftById(UID, "cmp_c-1_1")).toBeNull();
    expect(the(1)).toMatchObject({ state: "ready" });
    expect(the(1).made).toBeUndefined();
    expect(the(1).draftId).toBeUndefined();
  });

  it("refuses a post still being written", async () => {
    seed([post(1, { state: "drafting", hook: undefined }), post(2, { state: "waiting", hook: undefined })]);
    expect(await act.makePost(UID, "c-1", 1, NOW)).toEqual({ ok: false, error: act.WRITING_LINE });
    expect(await act.makePost(UID, "c-1", 2, NOW)).toEqual({ ok: false, error: act.WRITING_LINE });
    expect(loadDrafts(UID)).toHaveLength(0);
  });

  it("makes every written free post in order with each step counted, and one Undo takes them all back", async () => {
    seed([post(1), post(2, { format: "slideshow", brief: "A\nB" }), post(3, { format: "short-video", script: "HOOK: x\nBODY: y\nCTA: z" }), post(4, { state: "waiting", hook: undefined }), post(5, { format: "carousel" })]);
    const steps: string[] = [];
    const r = await act.makeFreePosts(UID, "c-1", (done, of) => steps.push(`${done}/${of}`));
    expect(r).toMatchObject({ made: 3, failed: 0 });
    expect(steps).toEqual(["1/3", "2/3", "3/3"]);
    expect(loadDrafts(UID).map((d) => d.id).sort()).toEqual(["cmp_c-1_1", "cmp_c-1_3", "cmp_c-1_5"]);
    expect(getDraftById(UID, "cmp_c-1_3")!.draft).toBe("HOOK: x\nBODY: y\nCTA: z");
    expect(startSlideshow).not.toHaveBeenCalled();
    r.undo();
    expect(loadDrafts(UID)).toHaveLength(0);
    expect([1, 3, 5].map((n) => the(n).state)).toEqual(["ready", "ready", "ready"]);
  });
});

describe("makePost, a slideshow", () => {
  it("runs the slideshow maker from the hook and brief, links the show to the post and schedules it with its slides", async () => {
    seed([post(4, { format: "slideshow", hook: "Three things a ward bill hides", brief: "Room type\nTests\nDays", body: undefined })], { pictures: "mine", platforms: ["tiktok", "instagram"] });
    const r = await act.makePost(UID, "c-1", 4, NOW);
    expect(r).toMatchObject({ ok: true, toast: "Post 4 is on your calendar for Wed 4 Nov, 8pm, with its slides." });
    expect(startSlideshow.mock.calls[0][1]).toEqual({ source: null, topic: "Three things a ward bill hides", note: "Room type\nTests\nDays", mention: true, size: "9x16", pictures: "mine" });
    expect(loadSlideshows(UID).find((s) => s.id === "ss-made")?.draftId).toBe("cmp_c-1_4");
    expect(getDraftById(UID, "cmp_c-1_4")).toMatchObject({ status: "scheduled", scheduledFor: "2026-11-04T20:00", format: "carousel", draft: "Made caption. Save this.", pillarDetail: "Busy weeks", audience: "parent" });
    expect(the(4)).toMatchObject({ state: "made", draftId: "cmp_c-1_4", made: { kind: "slideshow", id: "ss-made" } });
  });

  it("tells the maker which Media screens this campaign's made slideshows show, starting at its post number (live-p5dog D7)", async () => {
    const show = (id: string, images: (string | undefined)[]) => saveSlideshow(UID, { ...blankSlideshow({}, NOW), id, slides: images.map((image, i) => ({ id: `${id}-${i}`, boxes: [], ...(image ? { image } : {}) })) }, NOW);
    show("ss-a", ["cimg-one111", "cimg-two222", undefined]);
    show("ss-b", ["cimg-two222"]);
    show("ss-other", ["cimg-nine99"]);
    seed([
      post(1, { format: "slideshow", state: "made", made: { kind: "slideshow", id: "ss-a" } }),
      post(2, { format: "slideshow", state: "made", made: { kind: "slideshow", id: "ss-b" } }),
      post(6, { format: "slideshow", brief: "x" }),
    ], { pictures: "mine" });
    await act.makePost(UID, "c-1", 6, NOW);
    expect(startSlideshow.mock.calls[0][2]).toEqual({ used: ["cimg-one111", "cimg-two222", "cimg-two222"], start: 6 });
  });

  it("is 4:5 for every network but TikTok, and waits while another slideshow is being made", async () => {
    seed([post(4, { format: "slideshow", brief: "x" })]);
    fake.show.set({ id: 99, state: "finding", done: 1, of: 4, ask: {} });
    expect(await act.makePost(UID, "c-1", 4, NOW)).toEqual({ ok: false, error: act.SHOW_BUSY });
    expect(startSlideshow).not.toHaveBeenCalled();
    fake.show.reset();
    await act.makePost(UID, "c-1", 4, NOW);
    expect(startSlideshow.mock.calls[0][1].size).toBe("4x5");
  });

  it("goes back to ready with the maker's words when it fails, and says when today's makes are used", async () => {
    seed([post(4, { format: "slideshow", brief: "x" })]);
    startSlideshow.mockImplementationOnce(async (_: string, ask: unknown) => {
      fake.show.set({ id: ++fake.seq, state: "writing", done: 0, of: 0, ask });
      fake.show.patch({ state: "failed", error: "You've used all 30 remixes for today.", capped: true });
    });
    expect(await act.makePost(UID, "c-1", 4, NOW)).toEqual({ ok: false, error: "You've used all 30 remixes for today.", capped: true });
    expect(the(4)).toMatchObject({ state: "ready", error: "You've used all 30 remixes for today." });
    expect(loadDrafts(UID)).toHaveLength(0);
  });

  it("says first when Slideshows is full and this one drops the oldest", () => {
    expect(act.showDropLine(UID)).toBeNull();
    for (let i = 0; i < MAX_SHOWS; i++) saveSlideshow(UID, { ...blankSlideshow({}, NOW), id: `s${i}`, title: `Show ${i}` }, new Date(NOW.getTime() + i));
    expect(act.showDropLine(UID)).toBe(`Slideshows keeps your newest ${MAX_SHOWS}, so this drops Show 0.`);
  });
});

describe("makePost, a wall of text", () => {
  it("schedules a short-video draft first, then starts the wall with its draftId, and is made once the editor has it", async () => {
    seed([post(5, { format: "wall", hook: "Nobody reads your follow-up", brief: "Write it the same day", body: undefined })]);
    startWall.mockImplementationOnce(async (userId: string, ask: { draftId: string }) => {
      // the draft is on the calendar before the wall is written
      expect(getDraftById(userId, ask.draftId)).toMatchObject({ status: "scheduled", format: "short-video" });
      fake.wall.set({ id: ++fake.seq, state: "writing", ask });
    });
    const made = act.makePost(UID, "c-1", 5, NOW);
    await tick();
    expect(startWall.mock.calls[0][1]).toEqual({ source: null, about: "Nobody reads your follow-up", note: "Write it the same day", mention: true, bg: "stock", draftId: "cmp_c-1_5" });
    expect(the(5)).toMatchObject({ state: "making", draftId: "cmp_c-1_5" });
    expect(act.makerOf("c-1", 5)).toBe("wall");
    fake.wall.patch({ state: "finding" });
    expect(the(5).state).toBe("making");
    fake.wall.patch({ state: "joining", written: { text: "You finish a client chat. Then the next one starts.", caption: "Keep the next step close.\n\nSave this.", scene: "", search: "" } });
    expect(await made).toMatchObject({ ok: true, toast: "Post 5's wall of text is in the editor. Check it and export it there." });
    // the words and caption the maker wrote stay with the post for the queue (live-p5dog D8, and its caption column on day 2)
    expect(the(5)).toMatchObject({ state: "made", made: { kind: "video", id: "cmp_c-1_5", text: "You finish a client chat. Then the next one starts.", caption: "Keep the next step close.\n\nSave this." } });
    expect(act.makerOf("c-1", 5)).toBeNull();
  });

  it("takes its draft off the calendar and goes back to ready when the wall fails", async () => {
    seed([post(5, { format: "wall", brief: "x" })]);
    const made = act.makePost(UID, "c-1", 5, NOW);
    await tick();
    fake.wall.patch({ state: "failed", error: "No stock clip fits these words." });
    expect(await made).toEqual({ ok: false, error: "No stock clip fits these words." });
    expect(getDraftById(UID, "cmp_c-1_5")).toBeNull();
    expect(the(5)).toMatchObject({ state: "ready", error: "No stock clip fits these words." });
  });
});

describe("makePost, an AI video", () => {
  it("speaks the script with the saved who, the remembered voice and the post's draftId, waits at a price check, and is made at joining", async () => {
    local.setItem("content-studio-remix-prefs-u1", JSON.stringify({ voice: "george" }));
    seed([post(6, { format: "ai-video", script: SCRIPT, body: undefined })]);
    const made = act.makePost(UID, "c-1", 6, NOW);
    await tick();
    // with no body from the writer, the caption is the call to action alone (live-p5dog D3)
    expect(startTalk.mock.calls[0][1]).toMatchObject({ source: null, text: SCRIPT, who: "mine", photo: null, look: "", setting: "office", voice: "george", length: 15, mention: true, caption: "What would you add?", draftId: "cmp_c-1_6" });
    expect(getDraftById(UID, "cmp_c-1_6")).toMatchObject({ status: "scheduled", format: "short-video", draft: `${SCRIPT}\n\n---\n\nCAPTION:\nWhat would you add?` });
    // the price check waits for a press: still making, nothing settled
    fake.talk.patch({ state: "priced", step: "" });
    await tick();
    expect(the(6).state).toBe("making");
    let settled = false;
    void made.then(() => (settled = true));
    await tick();
    expect(settled).toBe(false);
    fake.talk.patch({ state: "video", step: "Making your video, 1 of 2 parts ready." });
    fake.talk.patch({ state: "joining", step: "Putting your video together..." });
    expect(await made).toMatchObject({ ok: true });
    expect(the(6)).toMatchObject({ state: "made", made: { kind: "video", id: "cmp_c-1_6" } });
  });

  it("hands the editor the post's caption: the writer's body and the call to action (live-p5dog D3)", async () => {
    seed([post(6, { format: "ai-video", script: SCRIPT, body: "Follow-ups sit with the client.", cta: "Save this for later." })]);
    void act.makePost(UID, "c-1", 6, NOW);
    await tick();
    expect(startTalk.mock.calls[0][1].caption).toBe("Follow-ups sit with the client.\n\nSave this for later.");
    expect(act.videoCaption({ body: " ", cta: " Save this. " })).toBe("Save this.");
    expect(act.videoCaption({})).toBe("");
  });

  it("uses the remembered voice, Alice when none was picked", async () => {
    seed([post(6, { format: "ai-video", script: SCRIPT })]);
    void act.makePost(UID, "c-1", 6, NOW);
    await tick();
    expect(startTalk.mock.calls[0][1].voice).toBe("alice");
  });

  it("a saved presenter speaks in a voice that fits them, over the remembered voice (live-p5dog D1)", async () => {
    fake.who = "pr-raj";
    fake.presenters = [{ id: "pr-raj", name: "Raj", look: "An Indian Singaporean man in his mid 30s, a side-parted crop, dark suit and a plain tie", url: "https://x/raj.png", photo: "", createdAt: NOW.toISOString(), status: "on" }];
    seed([post(6, { format: "ai-video", script: SCRIPT })]);
    void act.makePost(UID, "c-1", 6, NOW);
    await tick();
    expect(startTalk.mock.calls[0][1]).toMatchObject({ who: "pr-raj", voice: "eric" });
  });

  it("with Ask each time, leaves a scheduled short-video draft and opens the AI video maker on it", async () => {
    fake.who = "ask";
    seed([post(6, { format: "ai-video", script: SCRIPT })]);
    const r = await act.makePost(UID, "c-1", 6, NOW);
    expect(r).toMatchObject({ ok: true, open: "/edit?panel=ai&kind=avatar&draft=cmp_c-1_6" });
    expect(startTalk).not.toHaveBeenCalled();
    // the caption waits under the script, so the AI panel takes it to the editor (live-p5dog D3)
    expect(getDraftById(UID, "cmp_c-1_6")).toMatchObject({ status: "scheduled", format: "short-video", draft: `${SCRIPT}\n\n---\n\nCAPTION:\n${CAPTION}` });
    expect(the(6)).toMatchObject({ state: "made", made: { kind: "draft", id: "cmp_c-1_6" } });
  });

  it("waits while another AI video is made, and refuses a script too short to speak as written", async () => {
    seed([post(6, { format: "ai-video", script: SCRIPT }), post(7, { format: "ai-video", script: "Too short to say." })]);
    fake.ai.busy = true;
    expect(await act.makePost(UID, "c-1", 6, NOW)).toEqual({ ok: false, error: act.AI_BUSY });
    fake.ai.busy = false;
    expect(await act.makePost(UID, "c-1", 7, NOW)).toEqual({ ok: false, error: act.SHORT_SCRIPT });
    expect(startTalk).not.toHaveBeenCalled();
    expect(loadDrafts(UID)).toHaveLength(0);
  });

  it("goes back to ready when the job fails before anything is paid", async () => {
    seed([post(6, { format: "ai-video", script: SCRIPT })]);
    const made = act.makePost(UID, "c-1", 6, NOW);
    await tick();
    fake.talk.patch({ state: "failed", step: "", error: "Save your face first." });
    expect(await made).toEqual({ ok: false, error: "Save your face first." });
    expect(the(6)).toMatchObject({ state: "ready", error: "Save your face first." });
    expect(getDraftById(UID, "cmp_c-1_6")).toBeNull();
  });

  it("after a reload, picks up the paid video waiting for its draft and marks the right post made; any other make goes back to ready", async () => {
    seed([
      post(6, { format: "ai-video", script: SCRIPT, state: "making", draftId: "cmp_c-1_6" }),
      post(7, { format: "ai-video", script: SCRIPT, state: "making", draftId: "cmp_c-1_7" }),
      post(5, { format: "wall", brief: "x", state: "making", draftId: "cmp_c-1_5" }),
    ]);
    fake.ai.pending = { name: "x", tokens: ["t"], seconds: [9.5], extra: { draftId: "cmp_c-1_6" } };
    const runs = act.resumeMakes(UID, "c-1");
    expect(runs).toHaveLength(1);
    expect(resumeTalk).toHaveBeenCalledTimes(1);
    expect(the(7)).toMatchObject({ state: "ready", error: act.STOPPED_LINE });
    expect(the(5)).toMatchObject({ state: "ready", error: act.STOPPED_LINE });
    expect(the(6).state).toBe("making");
    fake.talk.patch({ state: "joining" });
    expect(await runs[0]).toMatchObject({ ok: true });
    expect(the(6)).toMatchObject({ state: "made", made: { kind: "video", id: "cmp_c-1_6" } });
    // a second visit while it runs picks up nothing twice
    expect(act.resumeMakes(UID, "c-1")).toHaveLength(0);
  });

  it("past 20 minutes keeps the post making with its paid video, and Make then picks it up at no cost, never paying again (live-p5dog D4)", async () => {
    const STILL = "Your video is still being made. It's picked up at no cost when you come back.";
    seed([post(6, { format: "ai-video", script: SCRIPT })]);
    const made = act.makePost(UID, "c-1", 6, NOW);
    await tick();
    expect(startTalk).toHaveBeenCalledTimes(1);
    // Higgsfield took the job (it waits on this device), then it was still working at 20 minutes
    fake.ai.pending = { name: "x", tokens: ["t1", "t2"], seconds: [9.5, 6], extra: { draftId: "cmp_c-1_6" } };
    fake.talk.patch({ state: "failed", step: "", error: STILL, waiting: true });
    expect(await made).toEqual({ ok: false, error: STILL });
    expect(the(6)).toMatchObject({ state: "making", draftId: "cmp_c-1_6", error: STILL });
    expect(getDraftById(UID, "cmp_c-1_6")).not.toBeNull();
    // Make again: the waiting video is picked up, and nothing new is paid for
    const again = act.makePost(UID, "c-1", 6, NOW);
    expect(resumeTalk).toHaveBeenCalledTimes(1);
    expect(startTalk).toHaveBeenCalledTimes(1);
    expect(the(6).state).toBe("making");
    expect(the(6).error).toBeUndefined();
    fake.talk.patch({ state: "joining" });
    expect(await again).toMatchObject({ ok: true });
    expect(the(6)).toMatchObject({ state: "made", made: { kind: "video", id: "cmp_c-1_6" } });
  });

  it("refuses to pay for another post's video while a paid one waits on this device, which a new one would replace", async () => {
    seed([post(6, { format: "ai-video", script: SCRIPT })]);
    fake.ai.pending = { name: "x", tokens: ["t1"], seconds: [9.5], extra: { draftId: "cmp_c-9_4" } };
    expect(await act.makePost(UID, "c-1", 6, NOW)).toEqual({ ok: false, error: act.AI_WAITING });
    expect(startTalk).not.toHaveBeenCalled();
    expect(resumeTalk).not.toHaveBeenCalled();
    expect(the(6).state).toBe("ready");
  });
});

describe("an AI video post's price before Make (live-p5dog day 3: Raj's 46 words in Eric's voice cost US$3.44 under a US$2.77 card)", () => {
  const RAJ = { id: "pr-raj", name: "Raj", look: "An Indian Singaporean man in his mid 30s, a side-parted crop, dark suit and a plain tie", url: "https://x/raj.png", photo: "", createdAt: NOW.toISOString(), status: "on" };
  const WORDS_46 = Array.from({ length: 46 }, (_, i) => `word${i}`).join(" ");

  it("is its script's estimate in the voice Make speaks it in, plus the voiceover; AI_VIDEO before it has a script", () => {
    fake.who = "pr-raj";
    fake.presenters = [RAJ];
    expect(act.videoPriceOf(UID, { script: WORDS_46 })).toEqual(sumPrices(scriptEstimate(46, "eric"), priceOf("ai-voice")));
    expect(act.videoPriceOf(UID, { script: WORDS_46 }).usd).toBeCloseTo(3.46, 2);
    expect(act.videoPriceOf(UID, {})).toEqual(AI_VIDEO);
  });

  it("Make sends the card's video estimate as the quote, so the price check stops only above it", async () => {
    fake.who = "pr-raj";
    fake.presenters = [RAJ];
    seed([post(6, { format: "ai-video", script: WORDS_46 })]);
    void act.makePost(UID, "c-1", 6, NOW);
    await tick();
    expect(startTalk.mock.calls[0][1]).toMatchObject({ voice: "eric", length: 15 });
    expect(startTalk.mock.calls[0][1].quoted).toBeCloseTo(55 * 0.0625, 9);
  });
});

describe("swapPost", () => {
  it("asks for this one post with swap, its own old hook first in avoid, keeps the old words in prev, and Undo brings them back", async () => {
    seed([post(1), post(2, { hook: "Another hook in this campaign" })]);
    fn.mockResolvedValueOnce({ posts: [{ n: 1, hook: "A different way in", body: "New body.", cta: "Tell me below.", ctaType: "open-question", mas: true }] });
    const r = await act.swapPost(UID, "c-1", 1);
    expect(r).toMatchObject({ ok: true, toast: "New words for post 1." });
    const [name, body] = fn.mock.calls[0];
    expect(name).toBe("idea-dump");
    expect(body).toMatchObject({ mode: "campaign", swap: true });
    expect(body.posts).toHaveLength(1);
    expect(body.posts[0]).toMatchObject({ n: 1, format: "text-post", angle: { title: "The hospital bill question" } });
    expect(body.avoid).toEqual(["Most people get post 1 wrong", "Another hook in this campaign"]);
    expect(the(1)).toMatchObject({ hook: "A different way in", body: "New body.", cta: "Tell me below.", mas: true, prev: { hook: "Most people get post 1 wrong", body: post(1).body, cta: "What would you add?" } });
    if (r.ok === false) throw new Error(r.error);
    r.undo();
    expect(the(1)).toMatchObject({ hook: "Most people get post 1 wrong", body: post(1).body, cta: "What would you add?", mas: null });
    expect(the(1).prev).toBeUndefined();
  });

  it("leaves the words alone at the cap with the cap line, and on a reply it can't use", async () => {
    seed([post(1)]);
    fn.mockRejectedValueOnce(new EdgeError("You've used all 40 for today.", 429, "daily_limit"));
    expect(await act.swapPost(UID, "c-1", 1)).toEqual({ ok: false, error: act.SWAP_CAP_LINE, capped: true });
    expect(act.SWAP_CAP_LINE).toBe("You've used all 40 swaps for today. It resets at 8am Singapore time. Edit the words instead.");
    fn.mockResolvedValueOnce({ posts: [] });
    expect(await act.swapPost(UID, "c-1", 1)).toEqual({ ok: false, error: act.SWAP_FAILED });
    fn.mockRejectedValueOnce(new EdgeError("The words that came back couldn't be used. Try again.", 422, "unusable"));
    expect(await act.swapPost(UID, "c-1", 1)).toEqual({ ok: false, error: "The words that came back couldn't be used. Try again." });
    expect(the(1)).toMatchObject({ hook: "Most people get post 1 wrong", mas: false });
    expect(the(1).prev).toBeUndefined();
  });

  it("is refused on a made post, and runs once at a time", async () => {
    seed([post(1, { state: "made", draftId: "cmp_c-1_1" }), post(2)]);
    expect(await act.swapPost(UID, "c-1", 1)).toEqual({ ok: false, error: act.SWAP_MADE_LINE });
    let answer: (v: unknown) => void = () => {};
    fn.mockReturnValueOnce(new Promise((r) => (answer = r)));
    const first = act.swapPost(UID, "c-1", 2);
    expect(act.isSwapping("c-1", 2)).toBe(true);
    expect(await act.swapPost(UID, "c-1", 2)).toEqual({ ok: false, error: act.MAKING_LINE });
    expect(await act.makePost(UID, "c-1", 2, NOW)).toEqual({ ok: false, error: act.MAKING_LINE });
    answer({ posts: [{ n: 2, hook: "Fresh hook", body: "b", cta: "c", ctaType: "open-question", mas: false }] });
    expect((await first).ok).toBe(true);
    expect(act.isSwapping("c-1", 2)).toBe(false);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("the words of a post whose paid AI video is being made (live-p5dog day 3: Swap on post 25 at 20 minutes)", () => {
  const WAITING = { name: "x", tokens: ["t1", "t2"], seconds: [9.5, 6], extra: { draftId: "cmp_c-1_6" } };

  it("refuses Swap and Edit while its paid video waits on this device, even when another tab put the post back to ready", async () => {
    seed([post(6, { format: "ai-video", script: SCRIPT, state: "ready", draftId: "cmp_c-1_6" })]);
    fake.ai.pending = WAITING;
    expect(act.videoUnderway({ id: "c-1" }, the(6))).toBe(true);
    expect(await act.swapPost(UID, "c-1", 6)).toEqual({ ok: false, error: act.VIDEO_WORDS_LINE });
    expect(fn).not.toHaveBeenCalled();
    expect(act.editPost(UID, "c-1", 6, { script: "New words to say" })).toBe(act.VIDEO_WORDS_LINE);
    expect(the(6).script).toBe(SCRIPT);
  });

  it("refuses Edit while this tab makes its video, and lets another post's words change", async () => {
    seed([post(6, { format: "ai-video", script: SCRIPT }), post(1)]);
    void act.makePost(UID, "c-1", 6, NOW);
    await tick();
    expect(act.editPost(UID, "c-1", 6, { script: "New words to say" })).toBe(act.VIDEO_WORDS_LINE);
    expect(the(6).script).toBe(SCRIPT);
    expect(act.editPost(UID, "c-1", 1, { hook: "Typed hook" })).toBeNull();
    fake.ai.pending = WAITING;
    expect(act.videoUnderway({ id: "c-1" }, the(1))).toBe(false);
  });
});

describe("editPost and skipPost", () => {
  it("saves typed words, and Jev's old answer gives way to the pattern check", () => {
    seed([post(1, { mas: true })]);
    expect(act.editPost(UID, "c-1", 1, { hook: " Typed hook ", body: "Typed body" })).toBeNull();
    expect(the(1)).toMatchObject({ hook: "Typed hook", body: "Typed body", cta: "What would you add?", mas: null, state: "ready" });
  });

  it("Skip toggles, leaves the cost and the angle mix, and Skip again brings it back", () => {
    seed([post(1), post(2, { format: "ai-video", script: SCRIPT })]);
    const before = campaignCost(getCampaign(UID, "c-1")!, { video: 2, remix: 30 });
    expect(before.made.videos).toBe(1);
    const r = act.skipPost(UID, "c-1", 2);
    expect(r).toMatchObject({ ok: true, toast: "Post 2 skipped." });
    expect(the(2).state).toBe("skipped");
    const c = getCampaign(UID, "c-1")!;
    expect(campaignCost(c, { video: 2, remix: 30 }).made.videos).toBe(0);
    expect(angleCounts(c).find((a) => a.id === "a2")?.count).toBe(0);
    expect(act.skipPost(UID, "c-1", 2)).toMatchObject({ ok: true, toast: "" });
    expect(the(2).state).toBe("ready");
    expect(angleCounts(getCampaign(UID, "c-1")!).find((a) => a.id === "a2")?.count).toBe(1);
  });

  it("a skipped post with no words is written again when it comes back; a made or drafting post can't be skipped", () => {
    seed([post(1, { state: "waiting", hook: undefined }), post(2, { state: "made" }), post(3, { state: "drafting", hook: undefined })]);
    act.skipPost(UID, "c-1", 1);
    expect(startDrafting).not.toHaveBeenCalled();
    act.skipPost(UID, "c-1", 1);
    expect(the(1).state).toBe("waiting");
    expect(startDrafting).toHaveBeenCalledWith(UID, "c-1");
    expect(act.skipPost(UID, "c-1", 2)).toEqual({ ok: false, error: act.SWAP_MADE_LINE });
    expect(act.skipPost(UID, "c-1", 3)).toEqual({ ok: false, error: act.WRITING_LINE });
  });
});

describe("a full My posts", () => {
  const draft = (o: Partial<DraftEntry> = {}): DraftEntry => ({ id: "d", createdAt: NOW.toISOString(), hook: "Old hook", draft: "Old words", pillar: "topic", pillarDetail: "", audience: "general", format: "text-post", platform: "linkedin", ctaType: "open-question", ...o });

  it("names the oldest post only when it is posted or has numbers", () => {
    const full = Array.from({ length: MAX_DRAFTS }, (_, i) => draft({ id: `d${i}`, hook: `Hook ${i}` }));
    expect(act.droppedHook(full)).toBeNull();
    expect(act.droppedHook(full.map((d, i) => (i === MAX_DRAFTS - 1 ? { ...d, status: "posted" as const } : d)))).toBe(`Hook ${MAX_DRAFTS - 1}`);
    expect(act.droppedHook(full.map((d, i) => (i === MAX_DRAFTS - 1 ? { ...d, metrics: { reactions: 3 } } : d)))).toBe(`Hook ${MAX_DRAFTS - 1}`);
    saveDrafts(UID, full);
    expect(act.droppedHook(loadDrafts(UID))).toBeNull();
  });
});
