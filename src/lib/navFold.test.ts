import { describe, expect, it } from "vitest";
import { isFoldKey } from "./navFold";

describe("isFoldKey", () => {
  const key = (k: string, m: Partial<KeyboardEvent> = {}) => ({ key: k, metaKey: false, ctrlKey: false, altKey: false, ...m });

  it("folds on Cmd or Ctrl with backslash", () => {
    expect(isFoldKey(key("\\", { metaKey: true }))).toBe(true);
    expect(isFoldKey(key("\\", { ctrlKey: true }))).toBe(true);
  });

  it("ignores a plain backslash, Alt, and other keys", () => {
    expect(isFoldKey(key("\\"))).toBe(false);
    expect(isFoldKey(key("\\", { metaKey: true, altKey: true }))).toBe(false);
    expect(isFoldKey(key("k", { metaKey: true }))).toBe(false);
  });
});
