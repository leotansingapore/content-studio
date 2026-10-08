import { describe, expect, it } from "vitest";
import { TtlCache, cacheKey, normalizePhotos, normalizeVideos, parseStockRequest, pexelsUrl, pickVideoFile } from "./logic";

describe("parseStockRequest", () => {
  it("defaults to photos, page 1, and tidies the query", () => {
    expect(parseStockRequest({ query: "  family   dinner " })).toEqual({ ok: true, request: { kind: "photo", query: "family dinner", page: 1 } });
    expect(parseStockRequest({ kind: "video", query: "city", page: "3", orientation: "portrait" })).toEqual({
      ok: true,
      request: { kind: "video", query: "city", page: 3, orientation: "portrait" },
    });
  });

  it("refuses an empty, overlong or unknown search", () => {
    expect(parseStockRequest({ query: " " })).toMatchObject({ ok: false });
    expect(parseStockRequest({ query: "x".repeat(81) })).toMatchObject({ ok: false });
    expect(parseStockRequest({ kind: "gif", query: "cat" })).toMatchObject({ ok: false });
    expect(parseStockRequest(null)).toMatchObject({ ok: false });
  });

  it("clamps the page and ignores an unknown orientation", () => {
    const r = parseStockRequest({ query: "a", page: 999, orientation: "diagonal" });
    expect(r.ok && r.request).toEqual({ kind: "photo", query: "a", page: 20 });
  });
});

describe("pexelsUrl and cacheKey", () => {
  it("hits the photo or video search with the paging and orientation", () => {
    expect(pexelsUrl({ kind: "photo", query: "hdb flat", page: 2 })).toBe("https://api.pexels.com/v1/search?query=hdb+flat&page=2&per_page=24");
    expect(pexelsUrl({ kind: "video", query: "city", page: 1, orientation: "portrait" })).toBe(
      "https://api.pexels.com/videos/search?query=city&page=1&per_page=24&orientation=portrait",
    );
  });

  it("treats the same search in another case as the same", () => {
    expect(cacheKey({ kind: "photo", query: "Office", page: 1 })).toBe(cacheKey({ kind: "photo", query: "office", page: 1 }));
    expect(cacheKey({ kind: "photo", query: "office", page: 1 })).not.toBe(cacheKey({ kind: "video", query: "office", page: 1 }));
  });
});

const photo = {
  id: 38060679,
  width: 2879,
  height: 3838,
  url: "https://www.pexels.com/photo/modern-skyscrapers-in-singapore-skyline-38060679/",
  photographer: "Shlok Rana",
  photographer_url: "https://www.pexels.com/@shlok-rana-2150773572",
  alt: "Singapore skyline",
  src: {
    original: "https://images.pexels.com/photos/38060679/pexels-photo-38060679.png",
    medium: "https://images.pexels.com/photos/38060679/pexels-photo-38060679.png?auto=compress&cs=tinysrgb&h=350",
  },
};

describe("normalizePhotos", () => {
  it("keeps the credit and asks for a 1080-wide file", () => {
    expect(normalizePhotos({ photos: [photo] })).toEqual([{
      id: "38060679",
      w: 2879,
      h: 3838,
      alt: "Singapore skyline",
      thumb: photo.src.medium,
      src: "https://images.pexels.com/photos/38060679/pexels-photo-38060679.png?auto=compress&cs=tinysrgb&w=1080",
      by: "Shlok Rana",
      byUrl: photo.photographer_url,
      url: photo.url,
    }]);
  });

  it("drops items with files off Pexels and blanks credit links off Pexels", () => {
    const evil = { ...photo, src: { original: "https://evil.example/x.png", medium: "https://evil.example/y.png" } };
    expect(normalizePhotos({ photos: [evil, null] })).toEqual([]);
    expect(normalizePhotos({ photos: [{ ...photo, photographer_url: "javascript:alert(1)" }] })[0].byUrl).toBe("");
    expect(normalizePhotos(null)).toEqual([]);
  });
});

const files = [
  { file_type: "video/mp4", width: 360, height: 640, link: "https://videos.pexels.com/video-files/1/a_360_640.mp4" },
  { file_type: "video/mp4", width: 720, height: 1280, link: "https://videos.pexels.com/video-files/1/b_720_1280.mp4" },
  { file_type: "video/mp4", width: 2160, height: 3840, link: "https://videos.pexels.com/video-files/1/c_2160_3840.mp4" },
];

describe("videos", () => {
  it("picks the file nearest 720p, not the 4K one", () => {
    expect(pickVideoFile(files)?.link).toContain("b_720_1280");
    expect(pickVideoFile([{ ...files[0], width: 240, height: 426 }, files[2]])?.link).toContain("c_2160_3840"); // 240p is too small to use
    expect(pickVideoFile([{ ...files[1], file_type: "video/webm" }])).toBeNull();
  });

  it("normalizes a clip with its length and videographer", () => {
    const v = {
      id: 32248757,
      duration: 9,
      url: "https://www.pexels.com/video/night-view-32248757/",
      image: "https://images.pexels.com/videos/32248757/pexels-photo-32248757.jpeg",
      user: { name: "Richard L", url: "https://www.pexels.com/@richard-l-2150581203" },
      video_files: files,
    };
    expect(normalizeVideos({ videos: [v] })).toEqual([{
      id: "32248757", w: 720, h: 1280, alt: "", thumb: `${v.image}?auto=compress&cs=tinysrgb&h=350`, src: files[1].link, by: "Richard L", byUrl: v.user.url, url: v.url, duration: 9,
    }]);
  });
});

describe("TtlCache", () => {
  it("expires after the TTL and drops the oldest beyond the limit", () => {
    const c = new TtlCache<number>(2, 1000);
    c.set("a", 1, 0);
    c.set("b", 2, 0);
    expect(c.get("a", 500)).toBe(1);
    expect(c.get("a", 1500)).toBeUndefined();
    c.set("c", 3, 0);
    c.set("d", 4, 0);
    expect(c.get("b", 0)).toBeUndefined();
    expect(c.get("d", 0)).toBe(4);
  });
});
