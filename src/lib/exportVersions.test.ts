import { describe, expect, it } from "vitest";
import { defaultSettings, exportSize, type EditSettings } from "./videoEdit";
import { EXPORT_VERSIONS, currentVersion, versionName, versionPlan, versionSettings, versionsFor } from "./exportVersions";

const edit = (p: Partial<EditSettings> = {}): EditSettings => ({ ...defaultSettings(), ...p });

describe("export in several sizes", () => {
  it("offers the four shapes for a video, As filmed first when the edit keeps the filmed shape, nothing for sound or WhatsApp", () => {
    expect(versionsFor(edit({ aspect: "9:16" })).map((v) => v.aspect)).toEqual(["9:16", "4:5", "1:1", "16:9"]);
    expect(versionsFor(edit({ aspect: "original" })).map((v) => v.id)).toEqual(["original", ...EXPORT_VERSIONS.map((v) => v.id)]);
    expect(versionsFor(edit({ exportAs: "audio" }))).toEqual([]);
    expect(versionsFor(edit({ exportAs: "small" }))).toEqual([]);
  });

  it("ticks the shape the edit is in", () => {
    expect(currentVersion(edit({ aspect: "4:5" }))).toBe("feed-4x5");
    expect(currentVersion(edit({ aspect: "original" }))).toBe("original");
    expect(currentVersion(edit({ exportAs: "audio" }))).toBeNull();
  });

  it("makes the current shape exactly as Export does, but for TikTok's cap on 9:16, and another shape with only its frame and platform changed", () => {
    const s = edit({ aspect: "4:5", exportFor: "linkedin", fit: "blur", focusX: 0.3 });
    const feed = EXPORT_VERSIONS.find((v) => v.aspect === "4:5")!;
    expect(versionSettings(s, feed)).toBe(s);
    // the one exception: "Reels, TikTok 9:16" promises a file TikTok takes, so a 9:16 edit for Instagram gets TikTok's cap there
    const upright = edit({ aspect: "9:16", fit: "blur", focusX: 0.3 });
    const reels = EXPORT_VERSIONS.find((v) => v.aspect === "9:16")!;
    expect(versionSettings(upright, reels)).toEqual({ ...upright, exportFor: "tiktok" });
    const forTikTok = edit({ aspect: "9:16", exportFor: "tiktok" });
    expect(versionSettings(forTikTok, reels)).toBe(forTikTok);
    const reel = versionSettings(s, EXPORT_VERSIONS.find((v) => v.aspect === "9:16")!);
    expect(reel).toEqual({ ...s, aspect: "9:16", exportFor: "tiktok" });
    const wide = versionSettings(s, EXPORT_VERSIONS.find((v) => v.aspect === "16:9")!);
    expect(wide).toEqual({ ...s, aspect: "16:9", exportFor: undefined });
  });

  it("sizes each file for its shape, the 9:16 one under TikTok's cap so Reels and TikTok both take it", () => {
    const plan = versionPlan(edit({ aspect: "1:1" }), "Budget tips", 120, 1920, 1080);
    expect(plan.map((p) => [p.id, p.size.w, p.size.h])).toEqual([
      ["reels-9x16", 1080, 1920],
      ["feed-4x5", 1080, 1350],
      ["square-1x1", 1080, 1080],
      ["youtube-16x9", 1920, 1080],
    ]);
    expect(plan[0].size.capBytes).toBe(72_000_000);
    expect(plan[0].size.bytes).toBeLessThan(72_000_000);
    // the ticked-by-default one is the file Export makes
    const s = edit({ aspect: "1:1" });
    expect(plan[2].size).toEqual(exportSize(s, 120, 1920, 1080));
  });

  it("keeps a 2-minute 9:16 edit's own Reels, TikTok version under TikTok's 72 MB", () => {
    const reel = versionPlan(edit({ aspect: "9:16" }), "Budget tips", 120, 1080, 1920).find((p) => p.id === "reels-9x16")!;
    expect(reel.size.capBytes).toBe(72_000_000);
    expect(reel.size.bytes).toBeLessThan(72_000_000);
  });

  it("names each file by its version, never the plain project name, and keeps the version through the download name's 60 characters", () => {
    const names = EXPORT_VERSIONS.map((v) => versionName("Budget tips", v));
    expect(names).toEqual(["Budget tips reels-9x16", "Budget tips feed-4x5", "Budget tips square-1x1", "Budget tips youtube-16x9"]);
    for (const v of EXPORT_VERSIONS) {
      // what videoMedia's deliver() does to a name before adding -edited.mp4
      const file = versionName("Why most advisers never get past 30 clients in the first year", v).replace(/[^\w-]+/g, "-").slice(0, 60);
      expect(file.endsWith(v.id)).toBe(true);
    }
    expect(versionName("", EXPORT_VERSIONS[1])).toBe("feed-4x5");
  });
});
