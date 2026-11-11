import { afterEach, describe, expect, it, vi } from "vitest";
import { leftOpenPost, NEW_POST, newPostHref } from "./newPost";

const UID = "6d80f027-3395-480c-86a1-8827d3d6cce3";
afterEach(() => vi.unstubAllGlobals());
const tab = (kept: Record<string, string>) => {
  vi.stubGlobal("sessionStorage", { getItem: (k: string) => kept[k] ?? null });
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {} });
};

describe("New post", () => {
  it("opens Create > Start with the topic box focused", () => {
    tab({});
    expect(NEW_POST).toBe("/studio#topic");
    expect(newPostHref(UID)).toBe(NEW_POST);
    expect(newPostHref(null)).toBe(NEW_POST);
  });

  it("goes back to the writer while this tab holds an unfinished post there", () => {
    tab({ [`cs-write-brief-${UID}`]: JSON.stringify({ pillarDetail: "CPF top-ups" }) });
    expect(newPostHref(UID)).toBe("/generate");
    // another sign-in's unfinished post is not this one's
    expect(newPostHref("someone-else")).toBe(NEW_POST);
  });

  it("opens Start when the browser blocks storage", () => {
    vi.stubGlobal("sessionStorage", { getItem: () => { throw new Error("blocked"); } });
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {} });
    expect(newPostHref(UID)).toBe(NEW_POST);
  });
});

describe("Leaving the open post in Write", () => {
  it("starts a fresh post when a link opens Write without the post", () => {
    expect(leftOpenPost("d-1", null, "PUSH")).toBe(true);
  });
  it("keeps the post on a replace, Back, another post or no post open", () => {
    expect(leftOpenPost("d-1", null, "REPLACE")).toBe(false);
    expect(leftOpenPost("d-1", null, "POP")).toBe(false);
    expect(leftOpenPost("d-1", "d-2", "PUSH")).toBe(false);
    expect(leftOpenPost(null, null, "PUSH")).toBe(false);
  });
});
