import { describe, expect, it } from "vitest";
import { VIDEO_FORMAT_GROUPS, VIDEO_FORMATS, videoFormatById, videoFormatRule } from "./videoFormats";

describe("the short-video format library", () => {
  it("has the vault page's 92 formats, unique ids, every group used and every field filled", () => {
    expect(VIDEO_FORMATS).toHaveLength(92);
    expect(new Set(VIDEO_FORMATS.map((f) => f.id)).size).toBe(92);
    for (const g of VIDEO_FORMAT_GROUPS) expect(VIDEO_FORMATS.some((f) => f.group === g.id), g.id).toBe(true);
    for (const f of VIDEO_FORMATS) expect([f.name, f.why, f.template, f.example].every((x) => x.trim().length > 0), f.id).toBe(true);
    // no em dashes in copy a customer reads
    expect(VIDEO_FORMATS.some((f) => /—/.test(f.name + f.why + f.template + f.example))).toBe(false);
  });

  it("finds a format by id and nothing for an unknown or empty one", () => {
    expect(videoFormatById("the-dull-truth")?.name).toBe("The dull truth");
    expect(videoFormatById("nope")).toBeUndefined();
    expect(videoFormatById(null)).toBeUndefined();
  });

  it("gives Write one line with the shape and the why, and never the worked example's words", () => {
    const f = videoFormatById("the-dull-truth")!;
    const rule = videoFormatRule(f);
    expect(rule).toContain("Video format: The dull truth.");
    expect(rule).toContain(f.why);
    expect(rule).toContain(f.template);
    expect(rule).toContain("Take only the shape");
    expect(rule).not.toContain(f.example);
  });
});
