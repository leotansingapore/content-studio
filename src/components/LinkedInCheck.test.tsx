// The LinkedIn post check under a LinkedIn draft in Write: a draft checked before shows its verdict, fix and the picture
// reminder at once; an unchecked one shows the button; a short one says why it can't be checked. checkLinkedIn refuses
// an answer that isn't a verdict.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const as = vi.hoisted(() => {
  const store = new Map<string, string>();
  const ls = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
  };
  (globalThis as { localStorage?: unknown }).localStorage = ls;
  (globalThis as { window?: unknown }).window = { localStorage: ls, dispatchEvent: () => true, addEventListener: () => undefined, removeEventListener: () => undefined };
  return { store };
});
const callFn = vi.fn();
vi.mock("@/lib/edgeFn", () => ({ callFn: (...a: unknown[]) => callFn(...a) }));
vi.mock("@/lib/supabase", () => ({
  SUPABASE_URL: "https://abc.supabase.co",
  supabase: { auth: { getUser: () => new Promise(() => undefined), getSession: () => new Promise(() => undefined), onAuthStateChange: () => ({}) } },
}));

const { default: LinkedInCheck } = await import("./LinkedInCheck");
const { checkLinkedIn, linkedInKey, saveLinkedInCheck } = await import("@/lib/linkedinCheck");

const draft = "Most coaches lose the client in the first call, not the last one.\n\nHere's the question I ask instead, and why it works.";
const html = (d = draft) => renderToStaticMarkup(createElement(LinkedInCheck, { userId: "u1", draft: d }));

describe("LinkedInCheck", () => {
  beforeEach(() => {
    as.store.clear();
    callFn.mockReset();
  });

  it("shows the button for a draft not checked yet, and never checks on load", () => {
    expect(html()).toContain("Check it for LinkedIn");
    expect(callFn).not.toHaveBeenCalled();
  });

  it("says why a short draft can't be checked", () => {
    expect(html("Too short to check.")).toContain("Write a bit more before checking it.");
  });

  it("shows a checked draft's verdict, its one fix, the other misses and the picture reminder", () => {
    saveLinkedInCheck("u1", linkedInKey(draft), { verdict: "revise", passed: 8, missed: ["hook", "objection", "flow"], fix: "hook" });
    const h = html().replace(/<!-- -->/g, "");
    expect(h).toContain("Revise first");
    expect(h).toContain("8 of 11 checks");
    expect(h).toContain("Fix first, first line:");
    expect(h).toContain("Answers the doubt:");
    expect(h).toContain("One line leads to the next:");
    expect(h).toContain("Picture:");
    expect(h).not.toContain("Check it for LinkedIn");
  });

  it("shows Ready to post for a ship verdict, with no fix line", () => {
    saveLinkedInCheck("u1", linkedInKey(draft), { verdict: "ship", passed: 11, missed: [], fix: null });
    const h = html().replace(/<!-- -->/g, "");
    expect(h).toContain("Ready to post");
    expect(h).not.toContain("Fix first");
  });
});

describe("checkLinkedIn", () => {
  beforeEach(() => callFn.mockReset());

  it("asks post-score for the LinkedIn check and returns its verdict", async () => {
    callFn.mockResolvedValue({ verdict: "ship", passed: 10, missed: ["flow"], fix: "flow" });
    await expect(checkLinkedIn(draft)).resolves.toMatchObject({ verdict: "ship" });
    expect(callFn).toHaveBeenCalledWith("post-score", { text: draft, check: "linkedin" }, expect.any(String));
  });

  it("refuses an answer that isn't a verdict", async () => {
    callFn.mockResolvedValue({ score: 7.5, down: [] });
    await expect(checkLinkedIn(draft)).rejects.toThrow();
    callFn.mockResolvedValue({ verdict: "ship", passed: 10, missed: ["nope"], fix: "nope" });
    await expect(checkLinkedIn(draft)).rejects.toThrow();
  });
});
