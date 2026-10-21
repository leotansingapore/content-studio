import { describe, expect, it } from "vitest";
import { isVoiceProfileUsable, voiceSummaryOf, type VoiceProfile } from "@/lib/voiceProfile";

const post = (n: number) => `Post ${n}: ${"a real thing I said to a client about their hospital plan. ".repeat(2)}`;
const profile = (o: Partial<VoiceProfile>): VoiceProfile => ({ posts: [], updatedAt: "2026-10-21T00:00:00.000Z", ...o });

describe("voiceSummaryOf", () => {
  it("returns a website summary that has no posts behind it", () => {
    const site = profile({ voiceSummary: "  Warm and plain. Short sentences, no jargon.  " });
    expect(voiceSummaryOf(site)).toBe("Warm and plain. Short sentences, no jargon.");
    expect(isVoiceProfileUsable(site)).toBe(false);
  });
  it("is empty with no profile or no summary", () => {
    expect(voiceSummaryOf(null)).toBe("");
    expect(voiceSummaryOf(undefined)).toBe("");
    expect(voiceSummaryOf(profile({ posts: [post(1), post(2), post(3)] }))).toBe("");
  });
});

describe("isVoiceProfileUsable (unchanged)", () => {
  it("still needs 3 posts of 100 characters", () => {
    expect(isVoiceProfileUsable(null)).toBe(false);
    expect(isVoiceProfileUsable(profile({ posts: [post(1), post(2)], voiceSummary: "x" }))).toBe(false);
    expect(isVoiceProfileUsable(profile({ posts: [post(1), post(2), "too short"] }))).toBe(false);
    expect(isVoiceProfileUsable(profile({ posts: [post(1), post(2), post(3)] }))).toBe(true);
  });
});
