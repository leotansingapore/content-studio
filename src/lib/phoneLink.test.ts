import { describe, expect, it } from "vitest";
import { MAX_LINK_CAPTION, phoneFragment, readPhoneFragment } from "./phoneLink";

describe("the phone link's fragment", () => {
  it("carries the caption and the slide size, and reads back the same", () => {
    const caption = "Save this for later & share it #money 100% \n second line = done? 🙌";
    const hash = phoneFragment(caption, "tiktok");
    expect(hash.startsWith("#c=")).toBe(true);
    expect(hash.endsWith("&f=tiktok")).toBe(true);
    // the caption's own "#", "&", "=" and spaces are encoded, so the fragment splits in exactly two
    expect(hash).not.toMatch(/\s/);
    expect(hash.indexOf("#", 1)).toBe(-1);
    expect(hash.split("&")).toHaveLength(2);
    expect(readPhoneFragment(hash)).toEqual({ caption: caption.trim(), long: false, format: "tiktok" });
  });

  it("leaves out an empty caption", () => {
    expect(phoneFragment("  \n ", "instagram")).toBe("#f=instagram");
    expect(readPhoneFragment("#f=instagram")).toEqual({ caption: "", long: false, format: "instagram" });
  });

  it("keeps a caption of exactly the cap, counted in characters, and drops a longer one with long=1", () => {
    const atCap = "🙌".repeat(MAX_LINK_CAPTION); // 1,000 UTF-16 units, 500 characters
    expect(readPhoneFragment(phoneFragment(atCap, "tiktok")).caption).toBe(atCap);
    const over = "a".repeat(MAX_LINK_CAPTION + 1);
    expect(phoneFragment(over, "tiktok")).toBe("#long=1&f=tiktok");
    expect(readPhoneFragment("#long=1&f=tiktok")).toEqual({ caption: "", long: true, format: "tiktok" });
  });

  it("reads an old link with no fragment, and ignores a size it doesn't know", () => {
    expect(readPhoneFragment("")).toEqual({ caption: "", long: false, format: null });
    expect(readPhoneFragment("#f=youtube&c=hi")).toEqual({ caption: "hi", long: false, format: null });
  });
});
