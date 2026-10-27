import { describe, expect, it } from "vitest";
import { centerCrop } from "./mediaLibrary";
import { cropRatio, pictureFit, pictureLine, videoFit } from "./mediaFit";

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

describe("Instagram's feed shapes", () => {
  it("lets 4:5 to 1.91:1 through and names the side a picture breaks", () => {
    expect(pictureFit(1080, 1350)).toBeNull();
    expect(pictureFit(1080, 1080)).toBeNull();
    expect(pictureFit(1080, 565)).toBeNull();
    expect(pictureFit(1080, 1920)).toBe("taller");
    expect(pictureFit(1080, 400)).toBe("wider");
  });

  it("says which pictures break it, numbered as attached", () => {
    expect(pictureLine([null, null])).toBeNull();
    expect(pictureLine(["taller"])).toBe("Instagram's feed takes pictures from 4:5 tall to 1.91:1 wide. This picture is taller.");
    expect(pictureLine([null, "wider", null])).toBe("Instagram's feed takes pictures from 4:5 tall to 1.91:1 wide. Picture 2 is wider.");
    expect(pictureLine(["taller", null, "wider"])).toBe("Instagram's feed takes pictures from 4:5 tall to 1.91:1 wide. Pictures 1, 3 are outside that.");
  });

  it("crops the middle to the nearest shape the feed takes, which then fits", () => {
    const tall = centerCrop(1080, 1920, cropRatio("taller"));
    expect(tall).toEqual({ x: 0, y: 285, w: 1080, h: 1350 });
    expect(pictureFit(tall.w, tall.h)).toBeNull();
    const wide = centerCrop(3000, 1000, cropRatio("wider"));
    expect(wide).toEqual({ x: 545, y: 0, w: 1910, h: 1000 });
    expect(pictureFit(wide.w, wide.h)).toBeNull();
  });
});
