import { describe, expect, it } from "vitest";
import { videoFit } from "./mediaFit";

describe("videoFit", () => {
  it("lets a video under the network's cap go", () => {
    expect(videoFit("instagram", 120)).toBeNull();
    expect(videoFit("facebook", 59.6, { placement: "reel" })).toBeNull();
    expect(videoFit("tiktok", 3)).toBeNull();
  });

  it("holds a Facebook Reel or an Instagram Story to its own cap", () => {
    expect(videoFit("facebook", 134, { placement: "reel" })).toEqual({ line: "A Facebook Reel takes videos up to 1:00. This one runs 2:14.", hard: true });
    expect(videoFit("instagram", 75, { placement: "story" })?.line).toBe("An Instagram Story takes videos up to 1:00. This one runs 1:15.");
    expect(videoFit("facebook", 134, { placement: "feed" })).toBeNull();
  });

  it("uses the cap TikTok reports for the creator, and TikTok's 3-second floor", () => {
    expect(videoFit("tiktok", 90, { tiktokMax: 60 })).toEqual({ line: "This TikTok account takes videos up to 1:00. This one runs 1:30.", hard: true });
    expect(videoFit("tiktok", 90)).toBeNull();
    expect(videoFit("tiktok", 2)).toEqual({ line: "TikTok takes videos of 3 seconds or more. This one runs 0:02.", hard: true });
  });

  it("warns without stopping while a LinkedIn page could still take it", () => {
    expect(videoFit("linkedin", 750)).toEqual({ line: "LinkedIn takes videos up to 10:00 from a profile, 30 minutes from a page. This one runs 12:30.", hard: false });
    expect(videoFit("linkedin", 1900)?.hard).toBe(true);
    expect(videoFit("threads", 301)?.hard).toBe(true);
  });

  it("knows nothing of networks it has no caps for, or a length it couldn't read", () => {
    expect(videoFit("telegram", 9999)).toBeNull();
    expect(videoFit("instagram", NaN)).toBeNull();
  });
});
