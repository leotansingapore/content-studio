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

describe("hostile links", () => {
  it("never accepts a javascript: link or a look-alike host", async () => {
    const { embedUrlFor, originalUrlFor, safeExternalUrl } = await import("./embed");
    for (const bad of [
      "javascript:alert(document.cookie)//tiktok.com/@x/video/1",
      "https://evil.example/?tiktok.com/@x/video/1",
      "https://tiktok.com.evil.example/@x/video/1",
      "data:text/html,instagram.com/p/abc/",
    ]) {
      expect(embedUrlFor(bad)).toBeNull();
      expect(originalUrlFor(bad)).toBeNull();
    }
    expect(safeExternalUrl("javascript:alert(1)")).toBeNull();
    expect(safeExternalUrl("https://mothership.sg/x")).toBe("https://mothership.sg/x");
  });
  it("rebuilds the original link from the id, not the input", async () => {
    const { originalUrlFor } = await import("./embed");
    expect(originalUrlFor("https://www.tiktok.com/@jordfinance/video/7690781989669997831?x=<script>")).toBe("https://www.tiktok.com/@/video/7690781989669997831");
    expect(originalUrlFor("https://m.instagram.com/herfirst100k/reel/DeKJG2RJBHN/?igsh=1")).toBe("https://www.instagram.com/reel/DeKJG2RJBHN/");
  });
});
