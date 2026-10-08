import { describe, expect, it } from "vitest";
import { embedUrlFor } from "./embed";

describe("embedUrlFor", () => {
  it("maps a TikTok video link to the embed player", () => {
    expect(embedUrlFor("https://www.tiktok.com/@jordfinance/video/7690781989669997831?lang=en")).toBe(
      "https://www.tiktok.com/player/v1/7690781989669997831?description=0&music_info=0&rel=0",
    );
  });
  it("maps Instagram posts and reels, with or without a username segment", () => {
    expect(embedUrlFor("https://www.instagram.com/p/DeACu0WtHce/")).toBe("https://www.instagram.com/p/DeACu0WtHce/embed/");
    expect(embedUrlFor("https://instagram.com/reel/Dd3t0XBJMST?igsh=x")).toBe("https://www.instagram.com/reel/Dd3t0XBJMST/embed/");
    expect(embedUrlFor("https://www.instagram.com/herfirst100k/reel/DeKJG2RJBHN/")).toBe("https://www.instagram.com/reel/DeKJG2RJBHN/embed/");
  });
  it("returns null for anything it cannot play", () => {
    expect(embedUrlFor("https://www.straitstimes.com/singapore/x")).toBeNull();
    expect(embedUrlFor("https://www.instagram.com/humphreytalks/")).toBeNull();
    expect(embedUrlFor(undefined)).toBeNull();
  });
});
