// WHAT IT COSTS (plan-campaign-page): the panel's lines from campaignCost, the free posts button's states, and the
// free posts run that lives outside React (makeFreePosts and the toast faked).
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({
  SUPABASE_URL: "https://abc.supabase.co",
  SUPABASE_ANON_KEY: "",
  supabase: { auth: { getSession: vi.fn(async () => ({ data: { session: null } })), onAuthStateChange: () => ({}) }, functions: { invoke: vi.fn() }, from: vi.fn() },
}));
const make = vi.hoisted(() => ({ fn: vi.fn() }));
vi.mock("@/lib/campaignActions", () => ({ makeFreePosts: (...a: unknown[]) => make.fn(...a) }));
const toasts = vi.hoisted(() => [] as { title: string; action: { props: { onClick: () => void } } }[]);
vi.mock("@/hooks/use-toast", () => ({ toast: (t: (typeof toasts)[number]) => toasts.push(t), useToast: () => ({ toast: () => {} }) }));

const store = new Map<string, string>();
const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k), key: () => null, length: 0 };
vi.stubGlobal("localStorage", storage);
vi.stubGlobal("window", { localStorage: storage, dispatchEvent: () => true, addEventListener: () => {}, removeEventListener: () => {}, location: { search: "" } });

import { campaignCost, type CampaignFormat, type CampaignPost, type PostState } from "@/lib/campaigns";
import { costLines, freeRunOf, freeState, startFreeRun, UNREAD_LINE } from "./CostPanel";

const post = (n: number, format: CampaignFormat, state: PostState = "ready"): CampaignPost =>
  ({ n, day: `2026-11-${String(n).padStart(2, "0")}`, angleId: "a", format, stage: "attraction", pillar: "topic", ctaType: "open-question", state });
/** 12 posts, 4 of them AI videos (posts 2, 5, 8 and 11). */
const twelve = (state: PostState = "ready") => Array.from({ length: 12 }, (_, i) => post(i + 1, i % 3 === 1 ? "ai-video" : "text-post", state));
const lines = (posts: CampaignPost[], video: number | null, remix: number | null = 30) => costLines({ posts }, campaignCost({ posts }, { video, remix }));

describe("what it costs", () => {
  it("12 posts with 4 AI videos: US$11.08, the free and paid line, and 2 of 4 covered", () => {
    const out = lines(twelve(), 2);
    expect(out.big).toBe("US$11.08");
    expect(out.lines).toEqual([
      "8 free posts. 4 AI videos at about US$2.77 each.",
      "Today's limit covers 2 of the 4 AI videos. The other 2 can be made after 8am Singapore time.",
    ]);
  });

  it("all covered, none left, and limits unread", () => {
    expect(lines(twelve(), 4).lines[1]).toBe("Today's limit covers all 4 AI videos.");
    expect(lines(twelve(), 0).lines[1]).toBe("No AI videos left today. The 4 can be made after 8am Singapore time.");
    expect(lines(twelve(), null).lines[1]).toBe(UNREAD_LINE);
  });

  it("made and skipped posts leave the cost", () => {
    const posts = twelve().map((p) => (p.n === 2 ? { ...p, state: "made" as const } : p.n === 5 || p.n === 1 ? { ...p, state: "skipped" as const } : p));
    expect(lines(posts, 2).lines[0]).toBe("7 free posts. 2 AI videos at about US$2.77 each.");
    expect(lines(posts, 2).lines[1]).toBe("Today's limit covers all 2 AI videos.");
  });

  it("names each AI video's own estimate: one figure when they match, the total when they differ (live-p5dog day 3)", () => {
    const posts = [post(1, "text-post"), post(2, "ai-video"), post(3, "ai-video")];
    const at = (usd: (n: number) => number) => costLines({ posts }, campaignCost({ posts }, { video: 2, remix: 30 }, (p) => ({ usd: usd(p.n), kind: "about" })));
    expect(at(() => 3.46).lines[0]).toBe("1 free post. 2 AI videos at about US$3.46 each.");
    expect(at((n) => (n === 2 ? 3.46 : 2.77)).lines[0]).toBe("1 free post. 2 AI videos, about US$6.23 in all.");
    expect(at((n) => (n === 2 ? 3.46 : 2.77)).big).toBe("US$6.23");
  });

  it("no AI video is Free, and Free after the paid ones are made says what is left", () => {
    const text = Array.from({ length: 6 }, (_, i) => post(i + 1, i % 2 ? "carousel" : "short-video"));
    expect(lines(text, 2)).toEqual({ big: "Free", sub: "Every post here costs nothing to make.", lines: [] });
    expect(lines([...text, post(7, "ai-video", "made")], 2).sub).toBe("Every post left costs nothing to make.");
  });

  it("slideshows and walls are priced from today's remix limit, with a line when it runs short", () => {
    const posts = Array.from({ length: 12 }, (_, i) => post(i + 1, i % 2 ? "wall" : "slideshow"));
    expect(lines(posts, 2, 10)).toEqual({
      big: "US$0.24",
      sub: "to make what's left",
      lines: [
        "6 slideshows and 6 walls of text at about US$0.02 each, from today's remix limit.",
        "Today's remix limit covers 10 of the 12 slideshows and walls. The other 2 can be made after 8am Singapore time.",
      ],
    });
    expect(lines(posts, 2, 30).lines).toHaveLength(1);
    expect(lines(posts, 2, 0).lines[1]).toBe("Today's remix limit is used. The 12 can be made after 8am Singapore time.");
    expect(lines(posts, 2, null).lines[1]).toBe(UNREAD_LINE);
  });

  it("says when today's picture picks run out before the remixes (live-p5dog D12)", () => {
    const posts = Array.from({ length: 12 }, (_, i) => post(i + 1, i % 2 ? "wall" : "slideshow"));
    const withPicks = (pick: number | null) => costLines({ posts }, campaignCost({ posts }, { video: 2, remix: 30, pick })).lines;
    expect(withPicks(8)[1]).toBe("Today's limit for picking pictures covers 8 of the 12 slideshows and walls. The rest get the first picture or clip found.");
    expect(withPicks(12)).toHaveLength(1);
    expect(withPicks(null)).toHaveLength(1);
  });
});

describe("the free posts button", () => {
  const writing = [...Array.from({ length: 8 }, (_, i) => post(i + 1, "text-post")), ...Array.from({ length: 4 }, (_, i) => post(i + 9, "carousel", i ? "waiting" : "drafting"))];

  it("waits while posts are being written, and makes the ready ones once writing is paused", () => {
    expect(freeState({ posts: writing }, false)).toEqual({ f: 12, reason: "Waiting for 4 posts to be written." });
    expect(freeState({ posts: writing }, true)).toEqual({ f: 8, reason: null });
  });

  it("says when every free post is made, and is absent with no free format", () => {
    expect(freeState({ posts: twelve().map((p, i) => ({ ...p, state: i ? "made" : "skipped" })) }, false)).toEqual({ f: 0, reason: "All free posts are made." });
    expect(freeState({ posts: [post(1, "text-post", "failed")] }, false)).toEqual({ f: 0, reason: "No free posts are ready to make." });
    expect(freeState({ posts: [post(1, "ai-video"), post(2, "slideshow"), post(3, "wall")] }, false)).toBeNull();
  });
});

describe("the free posts run", () => {
  beforeEach(() => {
    make.fn.mockReset();
    toasts.length = 0;
  });

  it("makes the ready free posts once, however often it is pressed, then toasts with Undo", async () => {
    let finish: (r: unknown) => void = () => {};
    make.fn.mockReturnValue(new Promise((r) => (finish = r)));
    const posts = [...twelve(), post(13, "slideshow"), post(14, "text-post", "waiting")];
    startFreeRun("u1", { id: "c-run", posts });
    startFreeRun("u1", { id: "c-run", posts });
    expect(make.fn).toHaveBeenCalledTimes(1);
    expect(make.fn.mock.calls[0].slice(0, 2)).toEqual(["u1", "c-run"]);
    expect(freeRunOf("c-run")).toEqual({ ns: [1, 3, 4, 6, 7, 9, 10, 12] });
    const undo = vi.fn();
    finish({ made: 8, failed: 0, undo });
    await vi.waitFor(() => expect(freeRunOf("c-run")?.done).toEqual({ made: 8, failed: 0 }));
    expect(toasts).toHaveLength(1);
    expect(toasts[0].title).toBe("8 posts are on your calendar.");
    toasts[0].action.props.onClick();
    expect(undo).toHaveBeenCalledOnce();
  });

  it("a run that makes nothing keeps its failed count and shows no toast", async () => {
    make.fn.mockResolvedValue({ made: 0, failed: 8, undo: vi.fn() });
    startFreeRun("u1", { id: "c-none", posts: twelve() });
    await vi.waitFor(() => expect(freeRunOf("c-none")?.done).toEqual({ made: 0, failed: 8 }));
    expect(toasts).toHaveLength(0);
  });

  it("a run that throws counts every post it didn't make as failed, with no toast", async () => {
    make.fn.mockRejectedValue(new Error("gone"));
    startFreeRun("u1", { id: "c-throw", posts: twelve() });
    await vi.waitFor(() => expect(freeRunOf("c-throw")?.done).toEqual({ made: 0, failed: 8 }));
    expect(toasts).toHaveLength(0);
  });
});
