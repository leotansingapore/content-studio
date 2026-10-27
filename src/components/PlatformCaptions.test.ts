// Other platforms, under a video's post caption: what a write keeps, what the counter line and limit warnings say,
// and where the keyword's first line goes. Node has no DOM, so the hooks are stood in for (the PostItForMe.test.ts
// pattern): the card is drawn by calling it, and a button is pressed by calling its handler.
import { isValidElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const UID = "6d80f027-3395-480c-86a1-8827d3d6cce3";
const shim = vi.hoisted(() => ({ i: 0, slots: [] as unknown[] }));
const toasts = vi.hoisted(() => [] as { title: string; description?: string }[]);
const writer = vi.hoisted(() => ({ next: null as null | (() => Promise<unknown>), calls: 0 }));

vi.mock("react", async (actual) => {
  const real = await actual<typeof import("react")>();
  const slot = <T,>(make: () => T): T => {
    const i = shim.i++;
    if (!(i in shim.slots)) shim.slots[i] = make();
    return shim.slots[i] as T;
  };
  const useState = (init: unknown) => {
    const i = shim.i;
    slot(() => (typeof init === "function" ? (init as () => unknown)() : init));
    return [shim.slots[i], (v: unknown) => (shim.slots[i] = typeof v === "function" ? (v as (p: unknown) => unknown)(shim.slots[i]) : v)];
  };
  const useMemo = (make: () => unknown) => slot(make);
  // the card's one effect reloads the same video's captions; the first draw already read them
  const useEffect = () => undefined;
  const hooks = { useState, useMemo, useEffect };
  return { ...real, ...hooks, default: { ...real, ...hooks } };
});
vi.mock("@/lib/supabase", () => ({ SUPABASE_URL: "https://abc.supabase.co", supabase: { auth: { getSession: () => new Promise(() => undefined), onAuthStateChange: () => ({}) } } }));
vi.mock("@/lib/useLeoOnly", () => ({ useLeoOnly: () => false, useLeoUser: () => null }));
vi.mock("@/lib/aiUsage", () => ({ useUsesLeft: () => () => 30 }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: (t: { title: string }) => toasts.push(t) }) }));
vi.mock("@/lib/platformCaptions", async (actual) => ({
  ...(await actual<typeof import("@/lib/platformCaptions")>()),
  writePlatformCaptions: () => {
    writer.calls++;
    return writer.next!();
  },
}));

const store = new Map<string, string>();
const local = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k), key: () => null, length: 0 };
vi.stubGlobal("localStorage", local);
vi.stubGlobal("window", { localStorage: local, dispatchEvent: () => true });

const { default: PlatformCaptions } = await import("./PlatformCaptions");
const { captionsKey, loadPlatformCaptions } = await import("@/lib/platformCaptions");
import type { PlatformCaptionSet } from "@/lib/platformCaptions";

type El = { type: unknown; props: Record<string, unknown> & { children?: unknown } };
const kids = (n: unknown): unknown[] => (n == null || typeof n === "boolean" ? [] : Array.isArray(n) ? n.flatMap(kids) : [n]);
const text = (n: unknown): string => (typeof n === "string" || typeof n === "number" ? String(n) : isValidElement(n) ? kids((n as El).props.children).map(text).join("") : "");
function find(tree: unknown, ok: (el: El) => boolean): El | null {
  if (!isValidElement(tree)) return null;
  const el = tree as El;
  if (ok(el)) return el;
  for (const c of kids(el.props.children)) {
    const hit = find(c, ok);
    if (hit) return hit;
  }
  return null;
}
const button = (tree: unknown, words: string) => find(tree, (e) => typeof e.props.onClick === "function" && text(e).trim() === words);
const press = (tree: unknown, words: string) => {
  const b = button(tree, words);
  if (!b) throw new Error(`No button ${words}`);
  (b.props.onClick as () => void)();
};

const VIDEO = "vp1";
const onInstagram = vi.fn();
let instagram = "";
const draw = () => {
  shim.i = 0;
  return PlatformCaptions({ userId: UID, projectId: VIDEO, transcript: "I paid for my own hospital plan at 24.", instagram, title: "Hospital plans at 24", onInstagram });
};
const mount = (set: PlatformCaptionSet) => {
  store.set(captionsKey(UID, VIDEO), JSON.stringify(set));
  shim.slots = [];
  return draw();
};
const saved = () => loadPlatformCaptions(UID, VIDEO);
const tab = (tree: unknown, name: string) => (find(tree, (e) => e.props.role === "tab" && text(e) === name)!.props.onClick as () => void)();
const flush = () => new Promise((r) => setImmediate(r));

beforeEach(() => {
  store.clear();
  toasts.length = 0;
  writer.calls = 0;
  instagram = "";
  onInstagram.mockClear();
});

describe("Write them again", () => {
  it("keeps every caption typed when the write fails, says why, and can be pressed again", async () => {
    const typed = { tiktok: "My own TikTok words", linkedin: "My own LinkedIn words", youtubeTitle: "My title" };
    writer.next = () => Promise.reject(new Error("Couldn't write the captions right now. Try again in a minute."));
    press(mount(typed), "Write them again");
    expect(text(button(draw(), "Writing...")).trim()).toBe("Writing...");
    await flush();
    expect(saved()).toEqual(typed);
    expect(toasts).toEqual([{ title: "The captions didn't come through", description: "Couldn't write the captions right now. Try again in a minute.", variant: "destructive" }]);
    const tree = draw();
    expect(find(tree, (e) => e.props["aria-label"] === "TikTok caption")!.props.value).toBe("My own TikTok words");
    expect(button(tree, "Write them again")!.props.disabled).toBe(false);
  });

  it("replaces the platforms that came back and keeps the ones that did not", async () => {
    writer.next = async () => ({ tiktok: "New TikTok", linkedin: "New LinkedIn" });
    press(mount({ tiktok: "Old TikTok", threads: "My Threads post", youtubeTitle: "My title" }), "Write them again");
    await flush();
    expect(saved()).toEqual({ tiktok: "New TikTok", linkedin: "New LinkedIn", threads: "My Threads post", youtubeTitle: "My title" });
    expect(writer.calls).toBe(1);
  });
});

describe("the counter line and limits", () => {
  it("judges TikTok's sweet spot on the words before the hashtags, and says 1 hashtag, not 1 hashtags", () => {
    // 140 characters of words: 186 with the hashtags, which alone would read as too long
    const words = "Why I paid for my own hospital plan at 24, and what it covered the year I needed it most. Three things I would tell anyone starting work now.";
    const tagged = `${words} #cpf #insurance #singapore #money #firstjob`;
    expect(text(mount({ tiktok: tagged }))).toContain(`${tagged.length} of 2,200 characters, 5 hashtags. On the TikTok caption sweet spot (80-150 chars).`);
    expect(text(mount({ tiktok: `${words} #cpf` }))).toContain(`${words.length + 5} of 2,200 characters, 1 hashtag. On the TikTok`);
  });

  it("an X thread counts its posts and names the one over 280 characters", () => {
    const long = `2/2 ${"word ".repeat(60).trim()}`;
    let tree = mount({ tiktok: "x", x: `1/2 Hospital plans at 24.\n\n${long}` });
    tab(tree, "X");
    tree = draw();
    expect(text(tree)).toContain(`2 posts, the longest ${long.length} of 280 characters, 0 hashtags.`);
    expect(text(tree)).toContain(`Post 2 is over X's 280 character limit by ${long.length - 280}. Trim before posting.`);
    expect(button(tree, "Copy 1/2")).not.toBeNull();
    expect(button(tree, "Copy 2/2")).not.toBeNull();
  });

  it("a Threads post over 500 characters says by how much", () => {
    let tree = mount({ tiktok: "x", threads: "a".repeat(512) });
    tab(tree, "Threads");
    tree = draw();
    expect(text(tree)).toContain("512 of 500 characters");
    expect(text(tree)).toContain("Over Threads's 500 character limit by 12. Trim before posting.");
  });
});

describe("the keyword's first line", () => {
  it("goes first on TikTok, Facebook and Instagram, never twice, and nowhere else", () => {
    const line = 'Comment "PLAN" and I will send you the checklist.';
    instagram = "My Instagram caption";
    press(mount({ tiktok: "My TikTok", facebook: "My Facebook", linkedin: "My LinkedIn", x: "My X post", firstLine: line }), "Add as first line");
    expect(saved()).toEqual({ tiktok: `${line}\n\nMy TikTok`, facebook: `${line}\n\nMy Facebook`, linkedin: "My LinkedIn", x: "My X post" });
    expect(onInstagram).toHaveBeenCalledWith(`${line}\n\nMy Instagram caption`);
    expect(find(draw(), (e) => e.props["data-testid"] === "keyword-line")).toBeNull();
    // a caption that already opens with it is left alone
    press(mount({ tiktok: `${line}\n\nAlready led`, firstLine: line }), "Add as first line");
    expect(saved().tiktok).toBe(`${line}\n\nAlready led`);
  });

  it("Skip drops the line and leaves every caption as it was", () => {
    const set = { tiktok: "My TikTok", facebook: "My Facebook" };
    press(mount({ ...set, firstLine: 'Comment "PLAN"' }), "Skip");
    expect(saved()).toEqual(set);
    expect(onInstagram).not.toHaveBeenCalled();
  });
});
