import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EdgeError } from "@/lib/edgeFn";
import type { CarouselBrand } from "@/lib/carousel";

const callFn = vi.fn();
vi.mock("@/lib/edgeFn", async (orig) => ({ ...(await orig<typeof import("@/lib/edgeFn")>()), callFn: (...a: unknown[]) => callFn(...a) }));
const toast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ toast: (...a: unknown[]) => toast(...a) }));

const r = await import("./brandRead");
type SiteRead = import("./brandRead").SiteRead;

class MemStorage {
  s = new Map<string, string>();
  getItem(k: string) { return this.s.get(k) ?? null; }
  setItem(k: string, v: string) { this.s.set(k, v); }
  removeItem(k: string) { this.s.delete(k); }
}
let storage: MemStorage;
let path = "/brand";

beforeEach(() => {
  storage = new MemStorage();
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("window", { localStorage: storage, addEventListener: () => {}, removeEventListener: () => {} });
  vi.stubGlobal("location", { get pathname() { return path; } });
  path = "/brand";
  callFn.mockReset();
  toast.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

const found: SiteRead = {
  url: "https://activity-tracker.io",
  name: "ActivityTracker",
  colour: "#c2451d",
  logo: "data:image/png;base64,AAAA",
  handles: { instagram: "activitytracker", linkedin: "company/activity-tracker" },
  oneLiner: "We help sales reps keep clients, chats and targets in one app.",
  audience: "working-adult",
  audienceDetail: "Financial advisers and property agents",
  topics: ["Follow-ups", "WhatsApp"],
  edge: "One app on your phone",
  voice: "Plain. Direct.",
  pagesRead: ["https://activity-tracker.io/", "https://activity-tracker.io/pricing"],
  lang: null,
  readAt: "2026-10-21T08:00:00.000Z",
};
const NOW = new Date("2026-10-21T09:00:00.000Z");
const kit = (k: Partial<CarouselBrand> = {}): CarouselBrand => ({ color: "#1E3A8A", name: "", handle: "", ...k });
const set = (key: string, v: unknown) => storage.setItem(`${key}-u1`, JSON.stringify(v));
const get = (key: string) => JSON.parse(storage.getItem(`${key}-u1`) ?? "null");
const POS = { oneLiner: "I help young families plan.", audience: "parent", audienceDetail: "Parents of under-10s", topics: ["CPF"], edge: "Plain answers", platform: "tiktok", cadence: 5, updatedAt: "2026-01-01T00:00:00.000Z" };

describe("the review's cards", () => {
  it("starts empty fields on Use this and set ones on Keep mine, and folds what the site left blank or matched", () => {
    set("content-studio-positioning", { ...POS, edge: "", topics: ["follow-ups", "whatsapp"] });
    set("content-studio-socialaccounts", { instagram: { handle: "https://www.instagram.com/activitytracker/", connectedAt: "x" } });
    const rows = r.reviewRows(r.currentOf("u1", kit({ name: "Tan Jun Sing" })), { ...found, logo: null });
    const by = Object.fromEntries(rows.map((x) => [x.field, x]));
    expect(rows.map((x) => x.field)).toEqual(["name", "logo", "colour", "social", "does", "who", "topics", "edge", "voice"]);
    expect(by.name).toMatchObject({ mine: "Tan Jun Sing", found: "ActivityTracker", same: false, start: "keep" });
    expect(by.logo).toMatchObject({ found: "", same: true });
    // the default colour is nobody's pick
    expect(by.colour).toMatchObject({ mine: "", found: "#C2451D", same: false, start: "use" });
    expect(by.social).toMatchObject({ mine: "Instagram activitytracker", found: "Instagram activitytracker, LinkedIn company/activity-tracker", same: false, start: "keep" });
    expect(by.does.start).toBe("keep");
    expect(by.who).toMatchObject({ mine: "Parents: Parents of under-10s", found: "Working adults: Financial advisers and property agents" });
    expect(by.topics.same).toBe(true);
    expect(by.edge).toMatchObject({ mine: "", start: "use", same: false });
    expect(by.voice).toMatchObject({ mine: "", start: "use" });
  });

  it("counts social as the same when every network the site names is saved with that handle", () => {
    set("content-studio-socialaccounts", { instagram: { handle: "@ActivityTracker", connectedAt: "x" }, linkedin: { handle: "https://www.linkedin.com/company/activity-tracker", connectedAt: "x" }, tiktok: { handle: "@other", connectedAt: "x" } });
    expect(r.reviewRows(r.currentOf("u1", kit()), found).find((x) => x.field === "social")?.same).toBe(true);
  });
});

describe("mergeRead", () => {
  it("writes only the Use this fields, plus the site and when it was read", () => {
    set("content-studio-positioning", POS);
    set("content-studio-voice", { posts: ["one", "two"], voiceSummary: "Warm.", updatedAt: "x" });
    set("content-studio-market", { site: "my.site", name: "Me" });
    const c = r.currentOf("u1", kit({ name: "Tan Jun Sing", color: "#0F766E" }));
    const w = r.mergeRead(c, found, {}, NOW);
    // every field already set starts on Keep mine; only the empty logo and social start on Use this
    expect(w.kit).toEqual({ website: "https://activity-tracker.io", websiteReadAt: "2026-10-21T08:00:00.000Z", logo: "data:image/png;base64,AAAA", instagram: "activitytracker", handle: "@activitytracker" });
    expect(w.positioning).toBeUndefined();
    expect(w.voice).toBeUndefined();
    expect(w.market).toBeUndefined();
    expect(Object.keys(w.accounts ?? {})).toEqual(["instagram", "linkedin"]);

    const kept = r.mergeRead(c, found, { logo: "keep", social: "keep" }, NOW);
    expect(kept).toEqual({ kit: { website: "https://activity-tracker.io", websiteReadAt: "2026-10-21T08:00:00.000Z" } });
  });

  it("puts each Use this into its own store and keeps every other positioning field", () => {
    set("content-studio-positioning", POS);
    const w = r.mergeRead(r.currentOf("u1", kit({ name: "Tan" })), found, { name: "use", colour: "use", does: "use", who: "use", topics: "use", edge: "use" }, NOW);
    expect(w.kit).toMatchObject({ name: "ActivityTracker", color: "#C2451D" });
    expect(w.positioning).toEqual({
      ...POS,
      oneLiner: found.oneLiner,
      audience: "working-adult",
      audienceDetail: found.audienceDetail,
      topics: found.topics,
      edge: found.edge,
      updatedAt: NOW.toISOString(),
    });
  });

  it("keeps the voice profile's pasted posts when How you sound is used", () => {
    set("content-studio-voice", { posts: ["post one", "post two"], voiceSummary: "Warm.", updatedAt: "x" });
    expect(r.mergeRead(r.currentOf("u1", kit()), found, { voice: "use" }, NOW).voice).toEqual({ posts: ["post one", "post two"], voiceSummary: "Plain. Direct.", updatedAt: NOW.toISOString() });
    storage.removeItem("content-studio-voice-u1");
    expect(r.mergeRead(r.currentOf("u1", kit()), found, {}, NOW).voice?.posts).toEqual([]);
  });

  it("fills Your market's site only when it is empty", () => {
    expect(r.mergeRead(r.currentOf("u1", kit()), found, {}, NOW).market).toMatchObject({ site: "activity-tracker.io" });
    set("content-studio-market", { site: "typed.sg" });
    expect(r.mergeRead(r.currentOf("u1", kit()), found, {}, NOW).market).toBeUndefined();
  });

  it("never lets Everyone (or Jev's silence) replace a narrower life stage", () => {
    set("content-studio-positioning", POS);
    const w = r.mergeRead(r.currentOf("u1", kit()), { ...found, audience: "general" }, { who: "use" }, NOW);
    expect(w.positioning).toMatchObject({ audience: "parent", audienceDetail: found.audienceDetail });
  });

  it("adds the site's networks to the saved ones, as /brands/new saves them", () => {
    set("content-studio-socialaccounts", { tiktok: { handle: "@mine", connectedAt: "2026-01-01" }, instagram: { handle: "@old", connectedAt: "2026-02-02" } });
    const w = r.mergeRead(r.currentOf("u1", kit({ handle: "@old" })), { ...found, handles: { instagram: "@activitytracker", facebook: "atfb" } }, { social: "use" }, NOW);
    expect(w.accounts).toEqual({
      tiktok: { handle: "@mine", connectedAt: "2026-01-01" },
      instagram: { handle: "https://www.instagram.com/activitytracker", connectedAt: "2026-02-02" },
      facebook: { handle: "https://www.facebook.com/atfb", connectedAt: NOW.toISOString() },
    });
    expect(w.kit).toMatchObject({ instagram: "activitytracker", handle: "@activitytracker", facebook: "atfb" });
  });
});

describe("the waiting read and Save", () => {
  it("reads, waits for review on this device, keeps the picks, then saves every store and clears", async () => {
    callFn.mockResolvedValueOnce({ ...found, readAt: undefined });
    await r.startRead("u1", " activity-tracker.io ", () => NOW.getTime());
    expect(callFn.mock.calls[0][0]).toBe("brand-dna");
    expect(callFn.mock.calls[0][1]).toEqual({ url: "activity-tracker.io", deep: true });
    expect(r.loadWaiting("u1")?.read.readAt).toBe(NOW.toISOString());
    expect(JSON.parse(storage.getItem("cs-brand-read-u1")!).read.name).toBe("ActivityTracker");
    expect(toast).not.toHaveBeenCalled();

    r.setPick("u1", "voice", "keep");
    r.setPick("u1", "name", "use");
    expect(r.loadWaiting("u1")?.picks).toEqual({ voice: "keep", name: "use" });

    const setBrand = vi.fn();
    r.saveRead("u1", kit({ name: "Tan" }), setBrand, NOW);
    expect(setBrand).toHaveBeenCalledWith(expect.objectContaining({ name: "ActivityTracker", website: "https://activity-tracker.io", websiteReadAt: NOW.toISOString() }));
    expect(get("content-studio-positioning")).toMatchObject({ oneLiner: found.oneLiner, platform: "linkedin" });
    expect(get("content-studio-voice")).toBeNull();
    expect(get("content-studio-socialaccounts")).toHaveProperty("linkedin");
    expect(get("content-studio-market")).toMatchObject({ site: "activity-tracker.io" });
    expect(r.loadWaiting("u1")).toBeNull();
    expect(storage.getItem("cs-brand-read-u1")).toBeNull();
  });

  it("puts a waiting read back after a reload, and drops one that isn't the right shape", () => {
    storage.setItem("cs-brand-read-u2", JSON.stringify({ read: found, picks: { name: "use", nope: "use", logo: "maybe" } }));
    expect(r.loadWaiting("u2")).toEqual({ read: found, picks: { name: "use" } });
    storage.setItem("cs-brand-read-u3", JSON.stringify({ read: { ...found, pagesRead: "x" } }));
    expect(r.loadWaiting("u3")).toBeNull();
    storage.setItem("cs-brand-read-u4", "{oops");
    expect(r.loadWaiting("u4")).toBeNull();
  });

  it("Discard forgets the read", async () => {
    callFn.mockResolvedValueOnce(found);
    await r.startRead("u5", "activity-tracker.io");
    expect(r.loadWaiting("u5")).not.toBeNull();
    r.discardRead("u5");
    expect(r.loadWaiting("u5")).toBeNull();
  });
});

describe("a read that doesn't come back", () => {
  it("says the site didn't open in this section's words, keeps nothing and tells you elsewhere", async () => {
    path = "/calendar";
    callFn.mockRejectedValueOnce(new EdgeError("We couldn't open acme.sg. Check the address, or start with just a name.", 422));
    await r.startRead("u6", "https://www.acme.sg/about");
    expect(r.readFailed("u6")).toBe("We couldn't open acme.sg. Check the address and try again.");
    expect(r.loadWaiting("u6")).toBeNull();
    expect(r.readingNow("u6")).toBeUndefined();
    expect(toast).toHaveBeenCalledWith({ title: "We couldn't open acme.sg. Check the address and try again.", variant: "destructive" });
  });

  it("shows decision 2's line when the account isn't on, and the cap's own line over the cap", async () => {
    callFn.mockRejectedValueOnce(new EdgeError("This isn't switched on for your account yet.", 403, "not_enabled"));
    await r.startRead("u7", "acme.sg");
    expect(r.readFailed("u7")).toBe("This isn't switched on for your account yet.");
    callFn.mockRejectedValueOnce(new EdgeError("You've used all 10 for today. It resets at 8am Singapore time.", 429, "daily_limit"));
    await r.startRead("u7", "acme.sg");
    expect(r.readFailed("u7")).toBe("You've used all 10 for today. It resets at 8am Singapore time.");
  });

  it("runs one read at a time per brand, and toasts a finished one only away from /brand", async () => {
    let answer!: (v: unknown) => void;
    callFn.mockReturnValueOnce(new Promise((res) => (answer = res)));
    const first = r.startRead("u8", "acme.sg");
    await r.startRead("u8", "acme.sg");
    expect(callFn).toHaveBeenCalledTimes(1);
    expect(r.readingNow("u8")?.address).toBe("acme.sg");
    path = "/generate";
    answer(found);
    await first;
    expect(toast).toHaveBeenCalledWith({ title: "Your website read is ready", description: "Open Brand kit to check it." });
  });
});
