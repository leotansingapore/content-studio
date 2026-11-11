import { describe, expect, it } from "vitest";
import { newerRelease, releaseIn } from "./newVersion";

const html = (hash: string) => `<html><head><script type="module" crossorigin src="/assets/index-${hash}.js"></script></head></html>`;

describe("new version notice", () => {
  it("reads the build hash from index.html or a script address", () => {
    expect(releaseIn(html("Bq3_x-9Z"))).toBe("Bq3_x-9Z");
    expect(releaseIn("https://app.postmosis.com/assets/index-abc123.js")).toBe("abc123");
    expect(releaseIn("<html></html>")).toBeNull();
  });

  it("speaks up only for a different build, and not again after Later on that build", () => {
    expect(newerRelease("old1", html("new2"))).toBe("new2");
    expect(newerRelease("old1", html("old1"))).toBeNull();
    // Later on new2 keeps quiet until a newer build still
    expect(newerRelease("old1", html("new2"), "new2")).toBeNull();
    expect(newerRelease("old1", html("new3"), "new2")).toBe("new3");
    // a dev build has no hash, and a page that isn't the app's index (an error page, offline) names none
    expect(newerRelease(null, html("new2"))).toBeNull();
    expect(newerRelease("old1", "")).toBeNull();
  });
});
