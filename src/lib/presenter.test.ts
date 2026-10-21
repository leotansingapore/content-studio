import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabase: { functions: { invoke: vi.fn() } }, SUPABASE_URL: "", SUPABASE_ANON_KEY: "" }));
const fn = vi.hoisted(() => vi.fn());
vi.mock("@/lib/edgeFn", async (orig) => ({ ...(await orig<typeof import("./edgeFn")>()), callFn: fn }));
const files = vi.hoisted(() => new Map<string, Blob>());
vi.mock("@/lib/deviceFiles", () => ({ putFile: async (k: string, b: Blob) => void files.set(k, b), getFile: async (k: string) => files.get(k) }));
const as = vi.hoisted(() => ({ user: null as null | { id: string; email: string } }));
vi.mock("@/lib/useLeoOnly", () => ({ leoUser: async () => as.user }));

import { EdgeError } from "./edgeFn";
import {
  BANNER_RED, MAS_FLAG, SET_FAILED, TALK_SETTING, loadTalk, makeSet, notePresenter, offerAt, offerNames, onPresenterSet, pickOffer, presenterFits,
  presenterSet, savedSet, saveTalk, talkExtra, talkScript, writeTalkScript,
} from "./presenter";
import { sanitizeOverlays } from "./videoEdit";

const store = new Map<string, string>();
const changed: string[] = [];
beforeEach(() => {
  store.clear();
  changed.length = 0;
  files.clear();
  fn.mockReset();
  as.user = null;
  const local = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
  vi.stubGlobal("localStorage", local);
  vi.stubGlobal("window", { localStorage: local, dispatchEvent: (e: Event) => changed.push(e.type) });
});

describe("the last format per brand", () => {
  it("is plain until picked, then synced per brand with the offer's place", () => {
    expect(loadTalk("u1")).toEqual({ talk: "plain" });
    saveTalk("u1", { talk: "spokesperson", offer: 2 });
    expect(store.get("content-studio-presenter-talk-u1")).toBe('{"talk":"spokesperson","offer":2}');
    expect(changed).toEqual(["content-studio-presenter-talk-changed"]);
    expect(loadTalk("u1")).toEqual({ talk: "spokesperson", offer: 2 });
    expect(loadTalk("u2")).toEqual({ talk: "plain" });
  });

  it("reads bad JSON, an unknown format and an offer past the kit's five as nothing", () => {
    store.set("content-studio-presenter-talk-u1", "{bad");
    expect(loadTalk("u1")).toEqual({ talk: "plain" });
    store.set("content-studio-presenter-talk-u1", JSON.stringify({ talk: "unboxing", offer: 7 }));
    expect(loadTalk("u1")).toEqual({ talk: "plain" });
    store.set("content-studio-presenter-talk-u1", JSON.stringify({ talk: "news", offer: "1" }));
    expect(loadTalk("u1")).toEqual({ talk: "news" });
  });
});

describe("the brand kit's offer", () => {
  const kit = (offers: { name: string; url: string }[]) => store.set("content-studio-carousel-brand-u1", JSON.stringify({ name: "ActivityTracker", offers }));

  it("is read by its place in the kit, the way ?offer= names it", () => {
    kit([{ name: "Free 14-day trial", url: "https://activitytracker.io/trial" }, { name: " ", url: "" }, { name: "Sales habits guide", url: "https://x.io/g" }]);
    const names = offerNames("u1");
    expect(names[0]).toBe("Free 14-day trial");
    expect(offerAt(names, "0")).toBe("Free 14-day trial");
    expect(offerAt(names, "2")).toBe("Sales habits guide");
    // no name there, past the end, not a place, or none at all
    for (const raw of ["1", "4", "-1", "2.0", " 2", "0x2", "x", "", null]) expect(offerAt(names, raw), String(raw)).toBeNull();
  });

  it("for Spokesperson: the link's, else the brand's last pick, else the first with a name", () => {
    const names = ["", "Free 14-day trial", "Sales habits guide"];
    expect(pickOffer(names, "2", 1)).toBe(2);
    expect(pickOffer(names, "0", 1)).toBe(1);
    expect(pickOffer(names, null, 2)).toBe(2);
    expect(pickOffer(names, null, 0)).toBe(1);
    expect(pickOffer(names, null)).toBe(1);
    expect(pickOffer([], null, 0)).toBeNull();
  });
});

describe("what the editor adds per format", () => {
  it("adds nothing for Plain, so You speaking hands over today's video", () => {
    expect(talkExtra({ talk: "plain", headline: "Ignored", setKey: "bd-set-news-1", offer: "Free trial", topKey: "offer-1" })).toBeUndefined();
    expect(talkExtra({ talk: "stage" })).toBeUndefined();
  });

  it("puts the news banner from 0 to 4 s with the headline cut to 50, and the set behind your own photo", () => {
    const extra = talkExtra({ talk: "news", headline: "  Most people pay for their hospital stay twice, and here is why  ", setKey: "bd-set-news-abc1" })!;
    const [banner] = extra.settings!.overlays!;
    expect(banner).toMatchObject({ kind: "banner", from: 0, to: 4, y: 0.8, color: BANNER_RED, text: "Most people pay for their hospital stay twice, and" });
    expect(sanitizeOverlays([banner])).toEqual([banner]);
    expect(extra.settings!.backdrop).toEqual({ kind: "picture", key: "bd-set-news-abc1" });
    expect(talkExtra({ talk: "news", headline: " " })).toBeUndefined();
    expect(talkExtra({ talk: "stage", setKey: "bd-set-stage-abc1" })).toEqual({ settings: { backdrop: { kind: "picture", key: "bd-set-stage-abc1" } } });
  });

  it("draws the offer's picture across the top for Spokesperson, or names the offer under the brand without one", () => {
    expect(talkExtra({ talk: "spokesperson", offer: "Free 14-day trial", brand: "ActivityTracker", topKey: "offer-k1" })).toEqual({ topKey: "offer-k1" });
    expect(talkExtra({ talk: "spokesperson", offer: "Free 14-day trial", brand: "ActivityTracker" })).toEqual({ settings: { nameTag: "ActivityTracker", roleTag: "Free 14-day trial" } });
    expect(talkExtra({ talk: "spokesperson", offer: "Free 14-day trial" })).toEqual({ settings: { nameTag: "Free 14-day trial" } });
    expect(talkExtra({ talk: "spokesperson" })).toBeUndefined();
    // only Spokesperson draws an offer
    expect(talkExtra({ talk: "news", topKey: "offer-k1", offer: "Free 14-day trial" })).toBeUndefined();
  });

  it("uses a presenter only in the setting its format puts them in", () => {
    expect(TALK_SETTING).toEqual({ plain: undefined, news: "news", stage: "stage", spokesperson: "bright" });
    expect(presenterFits("plain")).toBe(true);
    notePresenter("news");
    expect([presenterFits("news"), presenterFits("stage"), presenterFits("plain")]).toEqual([true, false, false]);
    notePresenter(undefined);
    expect(presenterFits("plain")).toBe(true);
  });

  it("warns with Jev's MAS answer like any compliance warning", () => {
    expect(MAS_FLAG).toMatchObject({ severity: "warn", id: "mas" });
    expect(MAS_FLAG.message).not.toMatch(/[—–]/);
  });
});

describe("Write it for me", () => {
  it("sends the format, the topic and Spokesperson's offer, and keeps the script, headline and MAS answer", async () => {
    fn.mockResolvedValueOnce({ say: "Tonight's top story.", headline: "Hospital bills twice", mas: true });
    await writeTalkScript({ talk: "news", topic: "Why people pay twice", offer: "Ignored for news" });
    expect(fn).toHaveBeenLastCalledWith("ai-video", { mode: "talk-script", talk: "news", topic: "Why people pay twice" }, expect.any(String));
    expect(talkScript()).toMatchObject({ state: "done", talk: "news", topic: "Why people pay twice", say: "Tonight's top story.", headline: "Hospital bills twice", mas: true });

    fn.mockResolvedValueOnce({ say: "Here is the offer.", mas: null });
    await writeTalkScript({ talk: "spokesperson", topic: "Daily sales habits", offer: "Free 14-day trial" });
    expect(fn).toHaveBeenLastCalledWith("ai-video", { mode: "talk-script", talk: "spokesperson", topic: "Daily sales habits", offer: { name: "Free 14-day trial" } }, expect.any(String));
    expect(talkScript()).toMatchObject({ state: "done", headline: "", mas: null });
  });

  it("sends Leo's facts and video learnings as notes, and nobody else's", async () => {
    store.set("content-studio-facts-u1", JSON.stringify([{ id: "f1", text: "12 years as an adviser", createdAt: "2026-10-20T03:00:00.000Z" }]));
    store.set(
      "content-studio-learnings-u1",
      JSON.stringify([
        { id: "l1", text: "Use Asian presenters", scope: "videos", source: "assistant", createdAt: "2026-10-19T03:00:00.000Z" },
        { id: "l2", text: "Never use emoji", scope: "posts", source: "assistant", createdAt: "2026-10-19T04:00:00.000Z" },
      ]),
    );
    fn.mockResolvedValue({ say: "Here is the offer.", mas: null });
    await writeTalkScript({ talk: "stage", topic: "One habit that wins deals" });
    expect(fn).toHaveBeenLastCalledWith("ai-video", { mode: "talk-script", talk: "stage", topic: "One habit that wins deals" }, expect.any(String));
    as.user = { id: "u1", email: "leo@example.com" };
    await writeTalkScript({ talk: "stage", topic: "One habit that wins deals" });
    expect(fn.mock.calls.at(-1)?.[1]).toEqual({
      mode: "talk-script",
      talk: "stage",
      topic: "One habit that wins deals",
      notes:
        "ABOUT ME, FROM WHAT I HAVE TOLD YOU (follow these unless MY BRAND RULES say otherwise):\n- Facts you may state about me (state no other facts, numbers, awards or results about me): 12 years as an adviser\n- Keep doing or avoid: Use Asian presenters",
    });
    store.clear();
    await writeTalkScript({ talk: "stage", topic: "One habit that wins deals" });
    expect(fn).toHaveBeenLastCalledWith("ai-video", { mode: "talk-script", talk: "stage", topic: "One habit that wins deals" }, expect.any(String));
  });

  it("shows the server's words when it refuses", async () => {
    fn.mockRejectedValueOnce(new EdgeError("You've used all 10 for today. It resets at 8am Singapore time.", 429, "daily_limit"));
    await writeTalkScript({ talk: "stage", topic: "One habit that wins deals" });
    expect(talkScript()).toMatchObject({ state: "failed", error: "You've used all 10 for today. It resets at 8am Singapore time." });
  });
});

describe("the set behind your own photo", () => {
  it("is made once, kept under a bd- key on this device, and reused from there", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Blob(["png"]), { status: 200 })));
    fn.mockImplementation(async (_n: string, body: { mode: string }) => (body.mode === "set" ? { token: "t1" } : { jobs: [{ state: "done", url: "https://cdn/set.png" }] }));
    const seen: string[] = [];
    const off = onPresenterSet((j) => j && seen.push(j.state));
    const run = makeSet("news");
    await vi.advanceTimersByTimeAsync(3000);
    await run;
    off();
    vi.useRealTimers();
    expect(fn.mock.calls.map((c) => c[1])).toEqual([{ mode: "set", talk: "news" }, { mode: "status", tokens: ["t1"] }]);
    const key = presenterSet()!.key!;
    expect(key).toMatch(/^bd-set-news-[a-z0-9]+$/);
    expect(seen).toEqual(["working", "done"]);
    expect(savedSet("news")).toBe(key);
    expect(files.has(key)).toBe(true);
    expect(savedSet("stage")).toBeNull();
  });

  it("says so and keeps your background when it fails, or gives the server's words for a used-up cap", async () => {
    fn.mockRejectedValueOnce(new EdgeError("Couldn't start the video right now. Try again in a minute.", 502));
    await makeSet("stage");
    expect(presenterSet()).toEqual({ talk: "stage", state: "failed", error: SET_FAILED });
    fn.mockRejectedValueOnce(new EdgeError("You've used all 5 for today. It resets at 8am Singapore time.", 429, "daily_limit"));
    await makeSet("stage");
    expect(presenterSet()?.error).toBe("You've used all 5 for today. It resets at 8am Singapore time.");
    expect(savedSet("stage")).toBeNull();
    store.set("cs-presenter-set-stage", "not-a-key");
    expect(savedSet("stage")).toBeNull();
  });
});
