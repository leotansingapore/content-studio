import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ALWAYS, MAX_STARTERS, starterChips } from "@/lib/agentStarters";
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
  it("shows only the two that always work when the brand has nothing yet", () => {
    expect(starterChips(UID)).toEqual(ALWAYS);
  });

  it("adds a chip only when its data exists, never more than 6, the two always last", () => {
    savePositioning(UID, { ...EMPTY_POSITIONING, topics: ["CPF LIFE"] });
    expect(starterChips(UID)).toEqual(["Make a carousel about CPF LIFE", "Make a 20-second video about CPF LIFE", ...ALWAYS]);
    savePositioning(UID, { ...EMPTY_POSITIONING, topics: ["CPF LIFE", "MediShield Life"] });
    toggleSaved(UID, "topPosts", "adv-abc");
    saveDrafts(UID, [draft({}), draft({ id: "b", status: "posted", postedAt: "2026-10-02T00:00:00.000Z" })]);
    const chips = starterChips(UID);
    expect(chips).toHaveLength(MAX_STARTERS);
    expect(chips).toEqual(["Remix a post from my Swipe file", "Make a carousel about CPF LIFE", "Write a script about MediShield Life", "Make a 20-second video about CPF LIFE", ...ALWAYS]);
    for (const c of chips) expect(c).not.toMatch(/advis|client|\bMAS\b|insurer/i);
  });

  it("offers /check and /retro when there is room and a post to run them on", () => {
    saveDrafts(UID, [draft({}), draft({ id: "b", status: "posted", postedAt: "2026-10-02T00:00:00.000Z" })]);
    expect(starterChips(UID)).toEqual(["/check", "/retro", ...ALWAYS]);
  });
});
