import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_STARTERS, handoff, starterChips } from "@/lib/agentStarters";
import { confirmAngles } from "@/lib/angles";
import { saveAudience } from "@/lib/audiences";
import { campaignsKey } from "@/lib/campaigns";
import { saveDrafts, type DraftEntry } from "@/lib/draftHistory";
import { EMPTY_POSITIONING, savePositioning } from "@/lib/positioning";
import { toggleSaved } from "@/lib/savedItems";

const UID = "6d80f027-3395-480c-86a1-8827d3d6cce3";
const store = new Map<string, string>();
const draft = (extra: Partial<DraftEntry>): DraftEntry => ({ id: "a", createdAt: "2026-10-01T00:00:00.000Z", hook: "Hook", draft: "Body", pillar: "topic", pillarDetail: "", audience: "general", format: "text-post", platform: "linkedin", ctaType: "dm-keyword", ...extra });

beforeEach(() => {
  store.clear();
  const localStorage = {
    get length() {
      return store.size;
    },
    key: (i: number) => [...store.keys()][i] ?? null,
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  vi.stubGlobal("window", { localStorage, dispatchEvent: () => true });
  vi.stubGlobal("localStorage", localStorage);
});
afterEach(() => vi.unstubAllGlobals());

describe("starterChips", () => {
  const NOTHING = ["Make a 15s video with a question hook", "How did last week go?", "What is trending in my niche?", "What can you make?"];

  it("shows only the ones that need nothing when the brand has nothing yet", () => {
    expect(starterChips(UID)).toEqual(NOTHING);
  });

  it("builds Fastlane's eight from the brand's facts, 8 at most, the least useful dropped first", () => {
    savePositioning(UID, { ...EMPTY_POSITIONING, topics: ["CPF LIFE"] });
    expect(starterChips(UID)).toEqual([NOTHING[0], "Write a script about CPF LIFE", ...NOTHING.slice(1)]);
    const young = saveAudience(UID, { name: "Young parents", who: "Parents in their 30s", cares: ["school fees"], main: true });
    saveAudience(UID, { name: "Retirees", who: "Retired in the last 5 years", cares: ["payouts"] });
    if (young.ok === false) throw new Error(young.error);
    expect(starterChips(UID)).toEqual([
      "Make an image for Young parents",
      "Make a 15s video with a question hook",
      "Write a script about CPF LIFE",
      "Plan a campaign for Young parents",
      "Find new angles",
      "How did last week go?",
      "What is trending in my niche?",
      "What can you make?",
    ]);
    // a saved angle beats a topic, an open campaign moves the plan to the next audience, and a Swipe file and a post
    // with numbers push out the two least useful (the question-hook video, then last week)
    confirmAngles(UID, young.audience.id, [{ title: "School fees panic", line: "", origin: "suggested" }]);
    store.set(campaignsKey(UID), JSON.stringify([{ id: "c1", audience: young.audience.id, angles: [], posts: [{ n: 1, day: "2026-12-01", state: "waiting" }] }]));
    toggleSaved(UID, "topPosts", "adv-abc");
    saveDrafts(UID, [draft({ status: "posted", postedAt: "2026-10-02T00:00:00.000Z", metrics: { reactions: 12 } })]);
    const chips = starterChips(UID, "2026-11-14");
    expect(chips).toHaveLength(MAX_STARTERS);
    expect(chips).toEqual([
      "Remix a post from my Swipe file",
      "Make an image for Young parents",
      "Write a script for School fees panic",
      "Plan a campaign for Retirees",
      "Find new angles",
      "What is trending in my niche?",
      "Which post did best?",
      "What can you make?",
    ]);
    for (const c of chips) expect(c).not.toMatch(/advis|client|\bMAS\b|insurer/i);
  });

  it("offers no campaign once every audience has one open, and again when it is done", () => {
    const a = saveAudience(UID, { name: "Office admins", who: "Admins", cares: [] });
    if (a.ok === false) throw new Error(a.error);
    const open = { id: "c1", audience: a.audience.id, angles: [], posts: [{ n: 1, day: "2026-11-20", state: "waiting" }] };
    store.set(campaignsKey(UID), JSON.stringify([open]));
    expect(starterChips(UID, "2026-11-14")).not.toContain("Plan a campaign for Office admins");
    store.set(campaignsKey(UID), JSON.stringify([{ ...open, posts: [{ n: 1, day: "2026-11-01", state: "made" }] }]));
    expect(starterChips(UID, "2026-11-14")).toContain("Plan a campaign for Office admins");
  });
});

describe("a page handing the agent a request", () => {
  it("sends on arrival only with the state's send and words to send", () => {
    expect(handoff({ send: true }, 'Make an ad in the "Lo-fi note" format.').send).toBe(true);
    // a pasted link carries no state: the composer is filled and nothing is sent
    expect(handoff(null, "Make an ad").send).toBe(false);
    expect(handoff({ send: "1" }, "Make an ad").send).toBe(false);
    expect(handoff({ send: true }, "  ").send).toBe(false);
    expect(handoff({ send: true }, null).send).toBe(false);
  });

  it("keeps where it came from only when that is a page of the app with a label", () => {
    expect(handoff({ from: { label: "Static ads > Lo-fi note", path: "/make/static/lo-fi-note" } }, null).from).toEqual({ label: "Static ads > Lo-fi note", path: "/make/static/lo-fi-note" });
    expect(handoff({ from: { label: "Elsewhere", path: "https://example.com" } }, null).from).toBeNull();
    expect(handoff({ from: { label: "Elsewhere", path: "//example.com" } }, null).from).toBeNull();
    expect(handoff({ from: { label: " ", path: "/make" } }, null).from).toBeNull();
    // a backslash after the first slash is another site to a browser, and a path with a space or line break is no page
    expect(handoff({ from: { label: "Elsewhere", path: "/\\example.com" } }, null).from).toBeNull();
    for (const path of ["/make here", "/make\n", "/make\u0000"]) expect(handoff({ from: { label: "Formats", path } }, null).from, JSON.stringify(path)).toBeNull();
    // a long label is cut to fit the chip
    expect(handoff({ from: { label: "x".repeat(120), path: "/make" } }, null).from?.label).toHaveLength(80);
  });

  it("takes a static format's layout only for a format we draw, with its topic", () => {
    expect(handoff({ send: true, layout: "lofi-note", topic: "  Office workers who skip lunch  " }, "Make a lo-fi note").layout).toEqual({ layout: "lofi-note", topic: "Office workers who skip lunch" });
    expect(handoff({ layout: "tear-off-flyer", topic: "x".repeat(300) }, null).layout?.topic).toHaveLength(200);
    for (const s of [null, { layout: "headline", topic: "Lunch" }, { layout: "street-scene", topic: "Lunch" }, { layout: ["lofi-note"], topic: "Lunch" }, { layout: "lofi-note" }, { layout: "lofi-note", topic: "  " }, { layout: "lofi-note", topic: 3 }])
      expect(handoff(s, "Make a lo-fi note").layout, JSON.stringify(s)).toBeNull();
  });
});
