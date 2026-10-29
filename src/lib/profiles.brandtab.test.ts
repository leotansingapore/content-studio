// The open brand is one per device: a storage event from another tab tells this one the brand moved (BrandTabWatch).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { addProfile, brandChange } from "./profiles";

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  vi.stubGlobal("window", { localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) } });
});

describe("brandChange", () => {
  it("names the brand another tab opened", () => {
    const at = addProfile("u1", "ActivityTracker");
    expect(brandChange("u1", "cs-active-profile-u1", at.id, "me")).toBe(at.id);
  });
  it("clears once the device is back on this tab's brand", () => {
    const at = addProfile("u1", "ActivityTracker");
    expect(brandChange("u1", "cs-active-profile-u1", "me", "me")).toBeNull();
    expect(brandChange("u1", "cs-active-profile-u1", at.id, at.id)).toBeNull();
  });
  it("reads a removed or unknown brand as the default one, as activeProfileId does", () => {
    const at = addProfile("u1", "ActivityTracker");
    expect(brandChange("u1", "cs-active-profile-u1", null, at.id)).toBe("me");
    expect(brandChange("u1", "cs-active-profile-u1", "pgone", at.id)).toBe("me");
    expect(brandChange("u1", "cs-active-profile-u1", "pgone", "me")).toBeNull();
  });
  it("ignores every other key, and another user's open brand", () => {
    const at = addProfile("u1", "ActivityTracker");
    expect(brandChange("u1", "content-studio-drafts-u1", at.id, "me")).toBeUndefined();
    expect(brandChange("u1", "cs-active-profile-u2", at.id, "me")).toBeUndefined();
    expect(brandChange("u1", null, null, "me")).toBeUndefined();
  });
});
