import { describe, expect, it } from "vitest";
import { CREATE_FORMATS, CREATE_KINDS, MORE_FORMATS, kindOf, kindOfFormat } from "./createFormats";
import { pageFor } from "./nav";

describe("CREATE_FORMATS", () => {
  it("only lists pages every sign-in can open, so Create's first screen never leads to Page not found", () => {
    for (const f of [...CREATE_FORMATS, ...MORE_FORMATS]) {
      const hit = pageFor(f.to);
      expect(hit, f.to).not.toBeNull();
      expect(hit!.page.to, f.to).toBe(f.to);
      expect(hit!.page.owners, f.to).toBeUndefined();
      expect(hit!.page.show, f.to).toBeUndefined();
    }
  });

  it("offers at most six big choices, and no maker twice", () => {
    expect(CREATE_FORMATS.length).toBeLessThanOrEqual(6);
    const all = [...CREATE_FORMATS, ...MORE_FORMATS].map((f) => f.to);
    expect(new Set(all).size).toBe(all.length);
  });

  it("starts with a plain post, the New post button's own target", () => {
    expect(CREATE_FORMATS[0].to).toBe("/generate");
  });
});

describe("Create's kinds", () => {
  it("are the Create picker's headings in nav.ts, in its order", () => {
    expect(CREATE_KINDS).toEqual(["Words", "Slides and pictures", "Video"]);
  });

  it("gives every maker on Create's first screen the kind it sits under in the picker", () => {
    for (const f of [...CREATE_FORMATS, ...MORE_FORMATS]) expect(CREATE_KINDS, f.to).toContain(kindOf(f.to));
    expect(kindOf("/generate/batch")).toBe("Words");
    expect(kindOf("/design/campaigns")).toBe("Slides and pictures");
    expect(kindOf("/clone")).toBe("Video");
  });

  it("has no kind for a page that is not a maker", () => {
    expect(kindOf("/library")).toBeNull();
    expect(kindOf("/make")).toBeNull();
  });

  it("names the catalogue's kinds the same way", () => {
    expect(kindOfFormat("text")).toBe("Words");
    expect(kindOfFormat("image")).toBe("Slides and pictures");
    expect(kindOfFormat("slides")).toBe("Slides and pictures");
    expect(kindOfFormat("video")).toBe("Video");
  });
});
