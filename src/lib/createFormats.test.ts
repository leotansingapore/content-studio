import { describe, expect, it } from "vitest";
import { CREATE_FORMATS } from "./createFormats";
import { pageFor } from "./nav";

describe("CREATE_FORMATS", () => {
  it("only lists pages every sign-in can open, so the create menu never leads to Page not found", () => {
    for (const f of CREATE_FORMATS) {
      const hit = pageFor(f.to);
      expect(hit, f.to).not.toBeNull();
      expect(hit!.page.to, f.to).toBe(f.to);
      expect(hit!.page.owners, f.to).toBeUndefined();
      expect(hit!.page.show, f.to).toBeUndefined();
    }
  });

  it("starts with a plain post, the New post button's own target", () => {
    expect(CREATE_FORMATS[0].to).toBe("/generate");
  });
});
