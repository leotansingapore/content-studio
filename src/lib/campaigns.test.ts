import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  addCampaign, AI_VIDEO, angleCounts, buildCampaignPosts, type Campaign, type CampaignAsk, CAMPAIGNS_CHANGED, campaignCost, campaignFormats, campaignsKey,
  campaignStatus, type CampaignFormat, type CampaignPost, deleteCampaign, draftsDropped, dropsPostedDraft, getCampaign, isWinner, keyAction, LIMIT_LINE, loadCampaigns, MAX_CAMPAIGNS, nextToReview,
  planCampaign, type PostState, REMIX_MAKE, restoreCampaign, saveCampaigns, SIZE_LINE, updatePost, videosLeft, winnersFor,
} from "./campaigns";
import { MAX_DRAFTS, type DraftEntry } from "./draftHistory";
import { priceOf, type Price } from "./prices";
import { addProfile, setActiveProfile } from "./profiles";
import { avatarCredits, creditsUsd } from "../../supabase/functions/ai-video/logic.ts";
import { EMPTY_POSITIONING, saveGoal, type Positioning } from "./positioning";

class MemStorage {
  s = new Map<string, string>();
  full = false;
  getItem(k: string) { return this.s.get(k) ?? null; }
  setItem(k: string, v: string) { if (this.full) throw new Error("QuotaExceededError"); this.s.set(k, v); }
  removeItem(k: string) { this.s.delete(k); }
}
let storage: MemStorage;
const events: string[] = [];
beforeEach(() => {
  storage = new MemStorage();
  events.length = 0;
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("window", { localStorage: storage, dispatchEvent: (e: Event) => events.push(e.type) });
});
afterEach(() => vi.unstubAllGlobals());

const UID = "u1";
const ANGLES = ["a1", "a2", "a3", "a4", "a5"].map((id) => ({ id, title: `Angle ${id}`, line: "" }));
const post = (n: number, o: Partial<CampaignPost> = {}): CampaignPost => ({
  n, day: `2026-11-${String(n).padStart(2, "0")}`, angleId: ANGLES[(n - 1) % 5].id, format: "text-post", stage: "attraction", pillar: "topic",
  ctaType: "soft", state: "ready", ...o,
});
const campaign = (o: Partial<Campaign> = {}, count = 12): Campaign => ({
  id: "c1", name: "Young families | November", createdAt: "2026-10-22T08:00:00.000Z", audience: "au-1", audienceName: "Young families",
  angles: ANGLES, platforms: ["linkedin"], formats: ["text-post", "ai-video"], weeks: 4, perWeek: 3, startDay: "2026-11-01",
  pictures: "stock", target: { posts: count, winners: winnersFor(count) }, posts: Array.from({ length: count }, (_, i) => post(i + 1)), ...o,
});
/** 12 posts, every third one (3, 6, 9, 12) an AI video. */
const withVideos = (states: Partial<Record<number, PostState>> = {}) =>
  campaign({ posts: Array.from({ length: 12 }, (_, i) => post(i + 1, { format: (i + 1) % 3 === 0 ? "ai-video" : i % 2 ? "carousel" : "text-post", state: states[i + 1] ?? "ready" })) });
const draft = (o: Partial<DraftEntry> = {}): DraftEntry => ({ id: "d", createdAt: "", hook: "", draft: "", pillar: "", pillarDetail: "", audience: "", format: "text-post", platform: "linkedin", ctaType: "", ...o });

describe("the store", () => {
  it("saves and loads per brand, and says it changed", () => {
    expect(saveCampaigns(UID, [campaign()])).toBeNull();
    expect(events).toEqual([CAMPAIGNS_CHANGED]);
    expect(loadCampaigns(UID).map((c) => c.id)).toEqual(["c1"]);
    expect(getCampaign(UID, "c1")?.posts).toHaveLength(12);
    expect(getCampaign(UID, "nope")).toBeNull();
    const other = addProfile(UID, "Second brand");
    setActiveProfile(UID, other.id);
    expect(campaignsKey(UID)).toBe(`content-studio-campaigns-${UID}~${other.id}`);
    expect(loadCampaigns(UID)).toEqual([]);
  });

  it("refuses a 13th campaign and writes nothing", () => {
    const twelve = Array.from({ length: MAX_CAMPAIGNS }, (_, i) => campaign({ id: `c${i}` }));
    expect(saveCampaigns(UID, twelve)).toBeNull();
    expect(saveCampaigns(UID, [campaign({ id: "c99" }), ...twelve])).toBe(LIMIT_LINE);
    expect(loadCampaigns(UID)).toHaveLength(MAX_CAMPAIGNS);
  });

  it("refuses a save over 800,000 characters, or when the device is full, with the size line", () => {
    const huge = campaign({ posts: Array.from({ length: 56 }, (_, i) => post(i + 1, { body: "w".repeat(15_000) })) });
    expect(saveCampaigns(UID, [huge])).toBe(SIZE_LINE);
    expect(storage.getItem(campaignsKey(UID))).toBeNull();
    storage.full = true;
    expect(saveCampaigns(UID, [campaign()])).toBe(SIZE_LINE);
    expect(events).toEqual([]);
  });

  it("reads bad JSON and bad rows as empty", () => {
    storage.setItem(campaignsKey(UID), "{nope");
    expect(loadCampaigns(UID)).toEqual([]);
    storage.setItem(campaignsKey(UID), JSON.stringify([null, { id: "x" }, campaign()]));
    expect(loadCampaigns(UID).map((c) => c.id)).toEqual(["c1"]);
  });

  it("updates one post and never its n; a gone campaign or post gives null", () => {
    saveCampaigns(UID, [campaign()]);
    const c = updatePost(UID, "c1", 4, { state: "made", n: 9, hook: "New hook" });
    expect(c?.posts[3]).toMatchObject({ n: 4, state: "made", hook: "New hook" });
    expect(getCampaign(UID, "c1")?.posts[3].state).toBe("made");
    expect(getCampaign(UID, "c1")?.posts[8].state).toBe("ready");
    expect(updatePost(UID, "c1", 99, { state: "made" })).toBeNull();
    expect(updatePost(UID, "gone", 1, { state: "made" })).toBeNull();
  });

  it("deletes a campaign, and Undo puts it back in its place with its posts", () => {
    saveCampaigns(UID, [campaign({ id: "new", createdAt: "2026-10-23" }), campaign({ id: "mid", createdAt: "2026-10-22" }), campaign({ id: "old", createdAt: "2026-10-21" })]);
    const gone = deleteCampaign(UID, "mid");
    expect(gone?.id).toBe("mid");
    expect(loadCampaigns(UID).map((c) => c.id)).toEqual(["new", "old"]);
    expect(restoreCampaign(UID, gone as Campaign)).toBeNull();
    expect(loadCampaigns(UID).map((c) => c.id)).toEqual(["new", "mid", "old"]);
    expect(getCampaign(UID, "mid")?.posts).toHaveLength(12);
    expect(deleteCampaign(UID, "nope")).toBeNull();
  });
});

describe("campaignCost", () => {
  it("12 posts with 4 AI videos: 8 free and US$11.08 for the videos", () => {
    const cost = campaignCost(withVideos(), { video: 2, remix: 30 });
    expect(cost.free).toBe(8);
    expect(cost.made).toEqual({ slideshows: 0, walls: 0, videos: 4 });
    expect(cost.usd).toBe(11.08);
  });

  it("leaves made and skipped posts out", () => {
    const cost = campaignCost(withVideos({ 1: "made", 2: "skipped", 3: "made", 6: "skipped", 4: "making", 9: "making" }), { video: 2, remix: null });
    expect(cost.free).toBe(6);
    expect(cost.made.videos).toBe(2);
    expect(cost.usd).toBe(5.54);
  });

  it("covers 2 of 4 with 2 uses left, 0 with none, and null gives no coverage line", () => {
    expect(campaignCost(withVideos(), { video: 2, remix: null }).covers).toEqual({ videos: 2, remix: null });
    expect(campaignCost(withVideos(), { video: 0, remix: 5 }).covers.videos).toBe(0);
    expect(campaignCost(withVideos(), { video: 9, remix: 5 }).covers.videos).toBe(4);
    expect(campaignCost(withVideos(), { video: null, remix: 5 }).covers.videos).toBeNull();
  });

  it("prices slideshows and walls at one remix make each, covered by remix uses left", () => {
    const formats: CampaignFormat[] = ["slideshow", "wall", "ai-video", "slideshow"];
    const c = campaign({ posts: formats.map((format, i) => post(i + 1, { format })) });
    const cost = campaignCost(c, { video: 1, remix: 1 });
    expect(cost.made).toEqual({ slideshows: 2, walls: 1, videos: 1 });
    expect(cost.free).toBe(0);
    expect(cost.usd).toBe(Math.round((3 * REMIX_MAKE.usd + AI_VIDEO.usd) * 100) / 100);
    expect(cost.covers).toEqual({ remix: 1, videos: 1 });
    expect(campaignCost(c, { video: 1, remix: 30 }).covers.remix).toBe(3);
    expect(campaignCost(c, { video: 1, remix: null }).covers.remix).toBeNull();
    expect(campaignCost(campaign(), { video: 2, remix: 30 })).toMatchObject({ free: 12, usd: 0 });
  });

  it("video coverage is the smaller of ai-video and ai-voice uses left", () => {
    expect(videosLeft(2, 1)).toBe(1);
    expect(videosLeft(1, 10)).toBe(1);
    expect(videosLeft(null, 10)).toBeNull();
    expect(videosLeft(2, null)).toBeNull();
  });

  it("AI_VIDEO is the avatarCredits price of a 15 s video plus its voiceover", () => {
    const voice = priceOf("ai-voice") as Price;
    expect(AI_VIDEO.usd - voice.usd).toBeCloseTo(creditsUsd(avatarCredits([7.5, 7.5])), 10);
    expect(AI_VIDEO.usd).toBeCloseTo(2.77, 10);
    expect(AI_VIDEO.kind).toBe("about");
  });
});

describe("campaignStatus", () => {
  const c = (states: PostState[]) => campaign({ posts: states.map((state, i) => post(i + 1, { state })) });
  it("draft while nothing is made", () => {
    expect(campaignStatus(c(["ready", "waiting", "skipped"]), "2026-10-30")).toBe("draft");
    expect(campaignStatus(c([]), "2026-10-30")).toBe("draft");
  });
  it("running once something is made, through its last day", () => {
    expect(campaignStatus(c(["made", "ready", "ready"]), "2026-11-02")).toBe("running");
    expect(campaignStatus(c(["made", "made", "skipped"]), "2026-11-03")).toBe("running");
  });
  it("done when every post is made or skipped and the last day has passed", () => {
    expect(campaignStatus(c(["made", "made", "skipped"]), "2026-11-04")).toBe("done");
    expect(campaignStatus(c(["made", "ready", "skipped"]), "2026-11-04")).toBe("running");
  });
});

describe("angleCounts", () => {
  it("12 posts over 5 angles count 3, 3, 2, 2, 2, and skipped posts are left out", () => {
    expect(angleCounts(campaign()).map((a) => a.count)).toEqual([3, 3, 2, 2, 2]);
    expect(angleCounts(campaign()).map((a) => a.title)).toEqual(ANGLES.map((a) => a.title));
    const skipped = campaign({ posts: campaign().posts.map((p) => (p.n === 1 || p.n === 7 ? { ...p, state: "skipped" as const } : p)) });
    expect(angleCounts(skipped).map((a) => a.count)).toEqual([2, 2, 2, 2, 2]);
  });
});

describe("winners", () => {
  it("winnersFor(12) is 1 and winnersFor(28) is 2", () => {
    expect(winnersFor(12)).toBe(1);
    expect(winnersFor(28)).toBe(2);
    expect(winnersFor(3)).toBe(1);
  });

  it("isWinner is at least 1.5 times the median engagement of posts with numbers", () => {
    const with_ = (reactions: number, impressions = 100) => draft({ metrics: { reactions, impressions } });
    const drafts = [with_(10), with_(20), with_(30), draft(), draft({ metrics: {} })];
    expect(isWinner(with_(30), drafts)).toBe(true);
    expect(isWinner(with_(29), drafts)).toBe(false);
    expect(isWinner(draft(), drafts)).toBe(false);
    expect(isWinner(with_(5), [])).toBe(false);
  });
});

describe("My posts room", () => {
  it("draftsDropped: two short of full plus 8 gives 6, 10 + 8 gives 0", () => {
    expect(draftsDropped(MAX_DRAFTS - 2, 8)).toBe(6);
    expect(draftsDropped(10, 8)).toBe(0);
    expect(draftsDropped(MAX_DRAFTS, 1)).toBe(1);
  });

  it("dropsPostedDraft is true only when an entry that drops out is posted or has numbers", () => {
    const full = Array.from({ length: MAX_DRAFTS }, (_, i) => draft({ id: `d${i}` }));
    expect(dropsPostedDraft(full, 1)).toBe(false);
    const oldestPosted = full.map((d, i) => (i === MAX_DRAFTS - 1 ? { ...d, status: "posted" as const } : d));
    expect(dropsPostedDraft(oldestPosted, 1)).toBe(true);
    const oldestMeasured = full.map((d, i) => (i === MAX_DRAFTS - 1 ? { ...d, metrics: { impressions: 40 } } : d));
    expect(dropsPostedDraft(oldestMeasured, 1)).toBe(true);
    // the posted one is second oldest: one Make keeps it, two drop it
    const second = full.map((d, i) => (i === MAX_DRAFTS - 2 ? { ...d, status: "posted" as const } : d));
    expect(dropsPostedDraft(second, 1)).toBe(false);
    expect(dropsPostedDraft(second, 2)).toBe(true);
    expect(dropsPostedDraft(oldestPosted.slice(1), 1)).toBe(false);
    expect(dropsPostedDraft(oldestPosted, 0)).toBe(false);
  });
});

describe("nextToReview", () => {
  const states: PostState[] = ["made", "ready", "drafting", "skipped", "ready", "made"];
  const c = campaign({ posts: states.map((state, i) => post(i + 1, { state })) });
  it("skips made, skipped and still-drafting posts", () => {
    expect(nextToReview(c, 2)).toBe(5);
    expect(nextToReview(c, 0)).toBe(2);
  });
  it("wraps to the start, and gives null when nothing is ready", () => {
    expect(nextToReview(c, 5)).toBe(2);
    expect(nextToReview(c, 6)).toBe(2);
    expect(nextToReview(campaign({ posts: [post(1, { state: "made" }), post(2, { state: "waiting" })] }), 1)).toBeNull();
  });
});

describe("keyAction", () => {
  const key = (k: string, o: Partial<{ target: unknown; altKey: boolean; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }> = {}) =>
    keyAction({ key: k, altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, target: { tagName: "BUTTON", closest: () => null }, ...o });
  it("maps 1 to 4 and the arrows", () => {
    expect(["1", "2", "3", "4", "ArrowLeft", "ArrowRight", "5", "a"].map((k) => key(k))).toEqual(["make", "swap", "edit", "skip", "prev", "next", null, null]);
    expect(key("1", { target: null })).toBe("make");
  });
  it("ignores inputs, textareas, editable text and dialogs", () => {
    for (const tagName of ["INPUT", "TEXTAREA", "SELECT"]) expect(key("1", { target: { tagName, closest: () => null } })).toBeNull();
    expect(key("2", { target: { tagName: "DIV", isContentEditable: true, closest: () => null } })).toBeNull();
    expect(key("3", { target: { tagName: "BUTTON", closest: (s: string) => (s.includes("dialog") ? {} : null) } })).toBeNull();
  });
  it("ignores keys pressed with a modifier", () => {
    for (const m of ["altKey", "ctrlKey", "metaKey", "shiftKey"]) expect(key("1", { [m]: true })).toBeNull();
  });
});

describe("laying a campaign out", () => {
  const POS: Positioning = { ...EMPTY_POSITIONING, oneLiner: "I help parents", topics: ["CPF top-ups", "Hospital plans"], platform: "instagram" };
  const ask = (o: Partial<CampaignAsk> = {}): CampaignAsk => ({
    audience: "au-1", angles: ANGLES, platforms: ["linkedin", "instagram"], formats: ["text-post", "carousel"], weeks: 4, perWeek: 3,
    pictures: "stock", name: "Young families | November", ...o,
  });
  // a Thursday: the campaign starts on Monday 26 October
  const THU = new Date(2026, 9, 22, 15, 0);
  const tally = <T,>(list: T[]) => list.reduce<Record<string, number>>((m, x) => ({ ...m, [String(x)]: (m[String(x)] ?? 0) + 1 }), {});

  it("4 weeks at 3 a week with text posts and carousels: 12 posts, angles 3/3/2/2/2, only the picked formats", () => {
    const posts = buildCampaignPosts(ask(), POS, {}, THU);
    expect(posts.map((p) => p.n)).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
    expect(Object.values(tally(posts.map((p) => p.angleId)))).toEqual([3, 3, 2, 2, 2]);
    expect(posts.map((p) => p.angleId).slice(0, 6)).toEqual(["a1", "a2", "a3", "a4", "a5", "a1"]);
    expect(new Set(posts.map((p) => p.format))).toEqual(new Set(["text-post", "carousel"]));
    expect(posts.every((p) => p.state === "waiting" && p.ctaType && p.stage && p.pillar && p.formulaId)).toBe(true);
  });

  it("puts the posts on the brand's posting days inside the campaign's weeks, from the Monday after today", () => {
    const posts = buildCampaignPosts(ask(), POS, { postingDays: ["Tue", "Thu", "Sat"], postingTime: (d) => (d === 1 ? "08:30" : null) }, THU);
    const days = posts.map((p) => p.day);
    expect(days[0]).toBe("2026-10-27");
    expect(days.every((d) => d >= "2026-10-26" && d <= "2026-11-22")).toBe(true);
    expect(new Set(days.map((d) => new Date(`${d}T12:00`).getDay()))).toEqual(new Set([2, 4, 6]));
    expect(days).toEqual([...days].sort());
    expect(posts.filter((p) => p.time).map((p) => p.day)).toEqual(["2026-10-27", "2026-11-03", "2026-11-10", "2026-11-17"]);
    expect(posts[0].time).toBe("08:30");
  });

  it("with AI video, exactly one post a week is one, at the middle index of its week", () => {
    const posts = buildCampaignPosts(ask({ formats: ["text-post", "carousel", "ai-video"] }), POS, {}, THU);
    expect(posts.filter((p) => p.format === "ai-video").map((p) => p.n)).toEqual([2, 5, 8, 11]);
    expect(tally(posts.map((p) => p.format))).toEqual({ "text-post": 4, carousel: 4, "ai-video": 4 });
    expect(campaignFormats(["text-post", "ai-video"], 2, 2)).toEqual(["text-post", "ai-video", "text-post", "ai-video"]);
    expect(campaignFormats(["ai-video"], 3, 1)).toEqual(["text-post", "ai-video", "text-post"]);
    expect(campaignFormats(["carousel"], 5, 1)).toEqual(Array(5).fill("carousel"));
  });

  it("28 posts at 1 a day over slideshow, wall and AI video give 12, 12 and 4, angles 6/6/6/5/5 in strict rotation", () => {
    const posts = buildCampaignPosts(ask({ formats: ["slideshow", "wall", "ai-video"], perWeek: 7 }), POS, {}, THU);
    expect(posts).toHaveLength(28);
    expect(tally(posts.map((p) => p.format))).toEqual({ slideshow: 12, wall: 12, "ai-video": 4 });
    expect(posts.filter((p) => p.format === "ai-video").map((p) => p.day)).toEqual(["2026-10-29", "2026-11-05", "2026-11-12", "2026-11-19"]);
    expect(Object.values(tally(posts.map((p) => p.angleId)))).toEqual([6, 6, 6, 5, 5]);
    expect(posts.every((p, i) => p.angleId === ANGLES[i % 5].id)).toBe(true);
    expect(new Set(posts.map((p) => p.day)).size).toBe(28);
  });

  it("weeks times pace at every pace", () => {
    for (const perWeek of [2, 3, 5, 7] as const) {
      for (const weeks of [1, 4, 8]) expect(buildCampaignPosts(ask({ perWeek, weeks }), POS, {}, THU)).toHaveLength(perWeek * weeks);
    }
  });

  it("planCampaign copies the ask, the audience's name and the goal, and addCampaign keeps it first", () => {
    storage.setItem(`content-studio-positioning-${UID}`, JSON.stringify({ ...POS, audienceDetail: "Young families" }));
    storage.setItem(`content-studio-audiences-${UID}`, JSON.stringify([{ id: "au-1", name: "Young families", who: "", lifeStage: "parent", cares: [], source: "you", createdAt: "" }]));
    saveGoal(UID, "Get more enquiries from people I can help", "clients");
    const c = planCampaign(UID, ask({ accountIds: ["acc-1"] }), THU);
    expect(c.id).toMatch(/^c-[a-z0-9]+$/);
    expect(c).toMatchObject({
      name: "Young families | November", audience: "au-1", audienceName: "Young families", platforms: ["linkedin", "instagram"], accountIds: ["acc-1"],
      formats: ["text-post", "carousel"], weeks: 4, perWeek: 3, startDay: "2026-10-26", pictures: "stock", goal: "Get more enquiries from people I can help",
      target: { posts: 12, winners: 1 }, createdAt: THU.toISOString(),
    });
    expect(c.angles).toEqual(ANGLES);
    expect(c.angles).not.toBe(ANGLES);
    expect(c.posts).toHaveLength(12);
    // the goal's weights steer each week: clients is 2/4/4, so a week of 3 is 1/1/1 and never all attraction
    expect(new Set(c.posts.slice(0, 3).map((p) => p.stage)).size).toBe(3);
    expect(planCampaign(UID, ask({ accountIds: [] }), THU)).not.toHaveProperty("accountIds");

    expect(addCampaign(UID, campaign({ id: "old" }))).toBeNull();
    expect(addCampaign(UID, c)).toBeNull();
    expect(loadCampaigns(UID).map((x) => x.id)).toEqual([c.id, "old"]);
    const twelve = Array.from({ length: MAX_CAMPAIGNS }, (_, i) => campaign({ id: `c${i}` }));
    saveCampaigns(UID, twelve);
    expect(addCampaign(UID, c)).toBe(LIMIT_LINE);
    expect(loadCampaigns(UID)).toHaveLength(MAX_CAMPAIGNS);
  });
});
