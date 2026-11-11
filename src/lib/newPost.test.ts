import { afterEach, describe, expect, it, vi } from "vitest";
import { NEW_POST, newPostHref } from "./newPost";

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
