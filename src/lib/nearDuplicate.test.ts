import { describe, expect, it } from "vitest";
import type { DraftEntry } from "@/lib/draftHistory";
import { nearDuplicate, wordOverlap } from "@/lib/nearDuplicate";

const post = (id: string, draft: string, o: Partial<DraftEntry> = {}): DraftEntry => ({
  id, createdAt: "2026-10-01T00:00:00Z", hook: draft.split("\n")[0], draft, pillar: "", pillarDetail: "", audience: "", format: "text-post", platform: "instagram", ctaType: "",
  status: "posted", postedAt: "2026-10-03T02:00:00Z", ...o,
});
const CPF = "Your CPF at 55 is not a payout date. Most people find out too late what the Retirement Account does with their savings, and why the sum they see is not the sum they get.";

describe("wordOverlap", () => {
  it("is the share of words two texts have in common, any case, short words left out", () => {
    expect(wordOverlap("Plan your CPF early", "plan YOUR cpf early!")).toBe(1);
    expect(wordOverlap("Plan your CPF early", "Insure the family first")).toBe(0);
    expect(wordOverlap("a an to of", "a an to of")).toBe(0);
    expect(wordOverlap("save more money now", "save more time")).toBeCloseTo(2 / 5);
  });
});

describe("nearDuplicate", () => {
  it("names the recent post on the same network that the draft mostly repeats, with the percent", () => {
    const hit = nearDuplicate(CPF.replace("too late", "far too late"), "instagram", [post("a", CPF)], "me");
    expect(hit?.post.id).toBe("a");
    expect(hit?.percent).toBeGreaterThanOrEqual(90);
  });
  it("leaves out the draft itself, other networks, plain drafts and posts that only share a topic", () => {
    expect(nearDuplicate(CPF, "instagram", [post("me", CPF)], "me")).toBeNull();
    expect(nearDuplicate(CPF, "instagram", [post("a", CPF, { platform: "linkedin" })], "me")).toBeNull();
    expect(nearDuplicate(CPF, "instagram", [post("a", CPF, { status: "draft", postedAt: undefined })], "me")).toBeNull();
    expect(nearDuplicate(CPF, "instagram", [post("a", "Your CPF at 55: three things to check before you withdraw anything, from a planner who has seen the mistakes.")], "me")).toBeNull();
  });
  it("counts scheduled posts, and only the 5 newest", () => {
    const sched = post("s", CPF, { status: "scheduled", postedAt: undefined, scheduledFor: "2026-10-20T02:00:00Z" });
    expect(nearDuplicate(CPF, "instagram", [sched], "me")?.post.id).toBe("s");
    const newer = [1, 2, 3, 4, 5].map((i) => post(`n${i}`, `Fresh post number ${i} about term life cover, hospital plans and what claims really need from you.`, { postedAt: `2026-10-1${i}T02:00:00Z` }));
    expect(nearDuplicate(CPF, "instagram", [...newer, post("old", CPF)], "me")).toBeNull();
  });
  it("says nothing for a recurring post, which repeats on purpose", () => {
    expect(nearDuplicate(CPF, "instagram", [post("me", CPF, { status: "scheduled", repeat: { every: "week", start: "2026-10-01" } }), post("a", CPF)], "me")).toBeNull();
  });
  it("says nothing about a very short draft", () => {
    expect(nearDuplicate("CPF at 55", "instagram", [post("a", "CPF at 55")], "me")).toBeNull();
  });
});
