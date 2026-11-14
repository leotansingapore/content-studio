import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabase: { functions: { invoke: vi.fn() } }, SUPABASE_URL: "", SUPABASE_ANON_KEY: "" }));

// Zernio is never called: every network call is a mock, and callFn throws if anything reaches it
const z = vi.hoisted(() => ({
  schedule: vi.fn(),
  cancel: vi.fn(),
  upload: vi.fn(),
  status: vi.fn(),
  pngs: vi.fn(),
}));
vi.mock("@/lib/edgeFn", async (orig) => ({
  ...(await orig<typeof import("./edgeFn")>()),
  callFn: async (name: string, body: unknown) => {
    throw new Error(`a real call reached ${name}: ${JSON.stringify(body)}`);
  },
}));
vi.mock("@/lib/autoPost", async (orig) => ({
  ...(await orig<typeof import("./autoPost")>()),
  schedulePost: z.schedule,
  cancelPost: z.cancel,
  uploadAll: z.upload,
  browserTimeZone: () => "Asia/Singapore",
}));
vi.mock("@/lib/socialConnect", async (orig) => ({ ...(await orig<typeof import("./socialConnect")>()), socialStatus: z.status }));
// drawing needs a canvas: each slide comes back as a small blob
vi.mock("@/lib/carouselRender", async (orig) => ({ ...(await orig<typeof import("./carouselRender")>()), createCanvasMeasure: () => ({}), svgToPng: async () => new Blob(["png"]) }));
vi.mock("@/lib/carouselLayout", async (orig) => ({ ...(await orig<typeof import("./carouselLayout")>()), layoutSlide: () => ({}), renderSvg: () => "<svg/>" }));
vi.mock("@/lib/slideshowDraw", async (orig) => ({ ...(await orig<typeof import("./slideshowDraw")>()), slideshowPngs: z.pngs }));

import { saveCampaigns, getCampaign, type Campaign, type CampaignPost } from "./campaigns";
import { loadDrafts, saveDrafts, type DraftEntry } from "./draftHistory";

class MemStorage {
  s = new Map<string, string>();
  get length() { return this.s.size; }
  key(i: number) { return [...this.s.keys()][i] ?? null; }
  getItem(k: string) { return this.s.get(k) ?? null; }
  setItem(k: string, v: string) { this.s.set(k, v); }
  removeItem(k: string) { this.s.delete(k); }
}

const UID = "u1";
// 20 Nov 2026, 8am in Singapore
const NOW = Date.parse("2026-11-20T00:00:00.000Z");
const ACCOUNTS = [
  { id: "li", platform: "linkedin", username: "acme", name: "Acme", url: null, picture: null, health: "healthy", needsReconnect: false, issues: [] },
  { id: "ig", platform: "instagram", username: "acme.sg", name: "Acme", url: null, picture: null, health: "healthy", needsReconnect: false, issues: [] },
  { id: "tt", platform: "tiktok", username: "acme.tt", name: "Acme", url: null, picture: null, health: "healthy", needsReconnect: false, issues: [] },
];
const WORDS = "Order by Tuesday for Friday.\n\nTell us who eats what.\n\nWe deliver between 11 and 12.";
const post = (n: number, day: string, o: Partial<CampaignPost> = {}): CampaignPost => ({
  n, day, time: "09:00", angleId: "a1", format: "text-post", stage: "trust", pillar: "topic", ctaType: "soft", state: "made", draftId: `cmp_c-1_${n}`,
  made: { kind: "draft", id: `cmp_c-1_${n}` }, hook: `Lunch for 40, post ${n}`, body: WORDS, ...o,
});
const draftOf = (p: CampaignPost, o: Partial<DraftEntry> = {}): DraftEntry => ({
  id: p.draftId!, createdAt: "2026-11-10T00:00:00.000Z", hook: p.hook ?? "", draft: `${p.hook}\n\n${WORDS}`, pillar: "topic", pillarDetail: "", audience: "general",
  format: p.format === "carousel" ? "carousel" : "text-post", platform: "linkedin", ctaType: "soft", status: "scheduled", scheduledFor: `${p.day}T${p.time}`, ...o,
});
const POSTS = [
  post(1, "2026-11-19"), // its day has passed
  post(2, "2026-11-21", { format: "carousel" }), // pictures: LinkedIn and Instagram
  post(3, "2026-11-22"), // words only: LinkedIn (Instagram needs a picture)
  post(4, "2026-11-23", { format: "wall", made: { kind: "video", id: "cmp_c-1_4" } }), // still in the editor: waits for you
  post(5, "2026-11-24", { state: "ready", draftId: undefined, made: undefined }), // a draft
  post(6, "2026-11-25", { state: "skipped", draftId: undefined, made: undefined }),
  post(7, "2026-11-26"), // already with Zernio
];
const campaign = (o: Partial<Campaign> = {}): Campaign => ({
  id: "c-1", name: "Office admins | December", createdAt: "2026-11-10T00:00:00.000Z", audience: "au-1", audienceName: "Office admins", angles: [{ id: "a1", title: "Lunch", line: "" }],
  platforms: ["linkedin", "instagram"], formats: ["text-post", "carousel"], weeks: 1, perWeek: 7, startDay: "2026-11-19", pictures: "stock",
  target: { posts: 7, winners: 1 }, posts: POSTS, accountIds: ["li", "ig", "tt"], ...o,
});
const seed = (o: Partial<Campaign> = {}) => {
  expect(saveCampaigns(UID, [campaign(o)])).toBeNull();
  saveDrafts(UID, POSTS.filter((p) => p.draftId).map((p) => draftOf(p, p.n === 7 ? { zernio: { key: "k7", postId: "z7", status: "scheduled" } } : {})));
};
const view = (id: string, at: string, status = "scheduled") => ({ post: { id, status, scheduledFor: at, platforms: [{ platform: "linkedin", accountId: "li", status }] } });
const draft = (n: number) => loadDrafts(UID).find((d) => d.id === `cmp_c-1_${n}`)!;

let L: typeof import("./campaignLaunch");
await import("./campaignLaunch");
beforeEach(async () => {
  vi.resetModules();
  L = await import("./campaignLaunch");
  const local = new MemStorage();
  vi.stubGlobal("localStorage", local);
  vi.stubGlobal("sessionStorage", new MemStorage());
  vi.stubGlobal("window", { localStorage: local, dispatchEvent: () => true, addEventListener: () => {}, removeEventListener: () => {} });
  let seq = 0;
  z.schedule.mockReset().mockImplementation(async (_profile: string, req: { scheduledFor: string }) => view(`z${++seq}`, req.scheduledFor));
  z.cancel.mockReset().mockResolvedValue({ cancelled: true });
  z.upload.mockReset().mockImplementation(async (_p: string, files: unknown[]) => files.map((_, i) => `https://cdn.example/${i}.png`));
  z.status.mockReset().mockResolvedValue({ accounts: ACCOUNTS });
  z.pngs.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

describe("launchPlan: which posts go", () => {
  it("sends made posts still ahead to the accounts that take them, and counts the rest", () => {
    seed();
    const plan = L.launchPlan(campaign(), loadDrafts(UID), ACCOUNTS, null, NOW, "Asia/Singapore");
    expect(plan.go.map((g) => [g.n, g.accountIds, g.at])).toEqual([
      [2, ["li", "ig"], "2026-11-21T09:00:00+08:00"],
      [3, ["li"], "2026-11-22T09:00:00+08:00"],
    ]);
    expect(plan).toMatchObject({ you: [4], past: [1], sent: [7], drafts: 1 });
    expect(L.launchLine(plan, 3)).toBe(
      "2 made posts go out on their days on 3 accounts. 1 is already scheduled. 1 waits for you on your calendar. 1 post's day has passed, so it stays on your calendar. 1 draft stays a draft. Make them any time and they join the campaign.",
    );
  });

  it("keeps on the calendar what only TikTok could take, what fails the compliance scan, and a post due within minutes", () => {
    seed();
    const tiktokOnly = L.launchPlan(campaign({ accountIds: ["tt"] }), loadDrafts(UID), ACCOUNTS, null, NOW, "Asia/Singapore");
    expect(tiktokOnly.go).toEqual([]);
    expect(tiktokOnly.you).toEqual([2, 3, 4]);
    const flagged = loadDrafts(UID).map((d) => (d.id === "cmp_c-1_3" ? { ...d, draft: "Guaranteed returns of 8% a year, risk free." } : d));
    expect(L.launchPlan(campaign(), flagged, ACCOUNTS, null, NOW, "Asia/Singapore").you).toEqual([3, 4]);
    const soon = Date.parse("2026-11-21T00:57:00.000Z"); // 8:57am in Singapore, three minutes before post 2
    expect(L.launchPlan(campaign(), loadDrafts(UID), ACCOUNTS, null, soon, "Asia/Singapore").past).toEqual([1, 2]);
  });

  it("says what happens with no accounts, and with nothing made", () => {
    seed();
    const plan = L.launchPlan(campaign({ accountIds: [] }), loadDrafts(UID), ACCOUNTS, null, NOW, "Asia/Singapore");
    expect(plan.go).toEqual([]);
    expect(L.launchLine(plan, 0)).toBe("Each made post is on your calendar on its day for you to post. 1 draft stays a draft. Make them any time and they join the campaign.");
    expect(L.launchLine({ go: [], you: [], past: [], sent: [], drafts: 12 }, 2)).toBe("No posts are made yet. 12 drafts stay drafts. Make them any time and they join the campaign.");
  });
});

describe("launchCampaign", () => {
  it("marks it launched and schedules each post that goes, keeping Zernio's answer on its draft", async () => {
    seed();
    const out = await L.launchCampaign(UID, "c-1", NOW);
    expect(out).toMatchObject({ ok: true, sent: 2, failed: [] });
    expect(getCampaign(UID, "c-1")?.launchedAt).toBe("2026-11-20T00:00:00.000Z");
    expect(z.schedule).toHaveBeenCalledTimes(2);
    const [first, second] = z.schedule.mock.calls.map((c) => c[1]);
    expect(first).toMatchObject({ accountIds: ["li", "ig"], scheduledFor: "2026-11-21T09:00:00+08:00", mediaUrls: ["https://cdn.example/0.png", "https://cdn.example/1.png", "https://cdn.example/2.png", "https://cdn.example/3.png"] });
    expect(first.timezone).toBeUndefined();
    expect(first.content).toContain("Lunch for 40, post 2");
    expect(second).toMatchObject({ accountIds: ["li"], scheduledFor: "2026-11-22T09:00:00+08:00", mediaUrls: [] });
    expect(draft(2).zernio).toMatchObject({ key: first.clientKey, postId: "z1", status: "scheduled" });
    expect(draft(2)).toMatchObject({ status: "scheduled", scheduledFor: "2026-11-21T09:00" });
    // the others are untouched
    expect(draft(4).zernio).toBeUndefined();
    expect(draft(1).zernio).toBeUndefined();
  });

  it("sends nothing and stays unlaunched when the accounts can't be read", async () => {
    seed();
    z.status.mockRejectedValue(new Error("offline"));
    expect(await L.launchCampaign(UID, "c-1", NOW)).toEqual({ ok: false, error: L.READ_FAILED });
    expect(getCampaign(UID, "c-1")?.launchedAt).toBeUndefined();
    expect(z.schedule).not.toHaveBeenCalled();
  });

  it("without accounts only marks it running, and calls nothing", async () => {
    seed({ accountIds: undefined });
    expect(await L.launchCampaign(UID, "c-1", NOW)).toMatchObject({ ok: true, sent: 0, failed: [] });
    expect(getCampaign(UID, "c-1")?.launchedAt).toBeTruthy();
    expect(z.status).not.toHaveBeenCalled();
    expect(z.schedule).not.toHaveBeenCalled();
  });

  it("a refused send leaves its key on the draft, and the next try sends with the same key", async () => {
    seed();
    z.schedule.mockImplementationOnce(async () => {
      throw new Error("Couldn't schedule it. Try again in a minute.");
    });
    const out = await L.launchCampaign(UID, "c-1", NOW);
    expect(out).toMatchObject({ ok: true, sent: 1, failed: [{ n: 2, error: "Couldn't schedule it. Try again in a minute." }] });
    const key = draft(2).zernio?.key;
    expect(key).toBeTruthy();
    expect(draft(2).zernio?.postId).toBeUndefined();
    z.schedule.mockClear();
    await L.launchCampaign(UID, "c-1", NOW);
    expect(z.schedule).toHaveBeenCalledTimes(1);
    expect(z.schedule.mock.calls[0][1]).toMatchObject({ clientKey: key, accountIds: ["li", "ig"] });
  });

  it("a post Zernio fails at once counts as failed, with its reason", async () => {
    seed();
    z.schedule.mockImplementation(async (_p: string, req: { scheduledFor: string }) => ({ post: { id: "zf", status: "failed", scheduledFor: req.scheduledFor, platforms: [{ platform: "linkedin", accountId: "li", status: "failed", error: "Token expired" }] } }));
    const out = await L.launchCampaign(UID, "c-1", NOW);
    expect(out).toMatchObject({ ok: true, sent: 0 });
    expect(out.ok && out.failed.map((f) => f.error)).toEqual(["Token expired", "Token expired"]);
    expect(draft(2).zernio).toMatchObject({ postId: "zf", status: "failed" });
  });
});

describe("pause, resume and posts made while running", () => {
  it("Pause takes the campaign's scheduled posts off Zernio and stops new sends; Resume sends them again", async () => {
    seed();
    await L.launchCampaign(UID, "c-1", NOW);
    const paused = await L.pauseCampaign(UID, "c-1", NOW + 1000);
    // posts 2 and 3 from the launch, and 7 that was already there
    expect(paused).toEqual({ ok: true, cancelled: 3, failed: 0 });
    expect(z.cancel.mock.calls.map((c) => c[1]).sort()).toEqual(["z1", "z2", "z7"]);
    expect(getCampaign(UID, "c-1")?.pausedAt).toBeTruthy();
    expect(draft(2).zernio).toBeUndefined();
    expect(draft(2).status).toBe("scheduled");

    z.schedule.mockClear();
    expect(await L.sendIfLaunched(UID, "c-1", 3, NOW)).toBeNull();
    expect(z.schedule).not.toHaveBeenCalled();

    const resumed = await L.launchCampaign(UID, "c-1", NOW + 2000);
    expect(resumed).toMatchObject({ ok: true, sent: 3 });
    expect(getCampaign(UID, "c-1")).toMatchObject({ launchedAt: "2026-11-20T00:00:00.000Z" });
    expect(getCampaign(UID, "c-1")?.pausedAt).toBeUndefined();
    expect(z.schedule.mock.calls.map((c) => c[1].scheduledFor)).toEqual(["2026-11-21T09:00:00+08:00", "2026-11-22T09:00:00+08:00", "2026-11-26T09:00:00+08:00"]);
  });

  it("a post made while running goes on its own; before launch it waits", async () => {
    seed({ launchedAt: undefined });
    expect(await L.sendIfLaunched(UID, "c-1", 3, NOW)).toBeNull();
    expect(z.schedule).not.toHaveBeenCalled();
    seed({ launchedAt: "2026-11-20T00:00:00.000Z" });
    expect(await L.sendIfLaunched(UID, "c-1", 3, NOW)).toEqual({ sent: 1, failed: [] });
    expect(z.schedule).toHaveBeenCalledTimes(1);
    expect(z.schedule.mock.calls[0][1]).toMatchObject({ accountIds: ["li"], scheduledFor: "2026-11-22T09:00:00+08:00" });
    // a made wall of text still waits for the person
    expect(await L.sendIfLaunched(UID, "c-1", 4, NOW)).toBeNull();
  });

  it("a made slideshow goes with its own slides", async () => {
    const show = { kind: "slideshow" as const, id: "ss-1" };
    const posts = POSTS.map((p) => (p.n === 3 ? { ...p, format: "slideshow" as const, made: show } : p));
    expect(saveCampaigns(UID, [campaign({ posts, launchedAt: "2026-11-20T00:00:00.000Z" })])).toBeNull();
    saveDrafts(UID, posts.filter((p) => p.draftId).map((p) => draftOf(p)));
    const { blankSlideshow, saveSlideshow } = await import("./slideshow");
    saveSlideshow(UID, { ...blankSlideshow({}, new Date(NOW)), id: "ss-1", title: "Lunch" });
    z.pngs.mockResolvedValue([{ file: new Blob(["a"]), name: "1.png", type: "image/png" }, { file: new Blob(["b"]), name: "2.png", type: "image/png" }]);
    const out = await L.sendIfLaunched(UID, "c-1", 3, NOW);
    expect(out).toEqual({ sent: 1, failed: [] });
    expect(z.schedule.mock.calls[0][1]).toMatchObject({ accountIds: ["li", "ig"], mediaUrls: ["https://cdn.example/0.png", "https://cdn.example/1.png"] });
  });
});
