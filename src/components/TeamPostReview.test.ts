// The team post review panel on the calendar: a typed comment outlives the panel closing, Send hands it over and
// empties the box, and every decision's toast can take it back. Node has no DOM, so the hooks are stood in for (the
// PostItForMe.test.ts pattern): the panel is drawn by calling it, and a button is pressed by calling its handler.
import { isValidElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const UID = "6d80f027-3395-480c-86a1-8827d3d6cce3";
const shim = vi.hoisted(() => ({ i: 0, slots: [] as unknown[] }));
const toasts = vi.hoisted(() => [] as { title: string; action?: unknown }[]);

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
  const useRef = (init: unknown) => slot(() => ({ current: init }));
  // the panel's one effect wires Escape and the arrow keys to the window; nothing here presses a key
  const useEffect = () => undefined;
  const hooks = { useState, useRef, useEffect };
  return { ...real, ...hooks, default: { ...real, ...hooks } };
});
vi.mock("react-dom", async (actual) => ({ ...(await actual<typeof import("react-dom")>()), createPortal: (node: unknown) => node }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: (t: { title: string }) => toasts.push(t) }) }));

const store = new Map<string, string>();
const local = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k), key: () => null, length: 0 };
vi.stubGlobal("localStorage", local);
vi.stubGlobal("window", { localStorage: local });
vi.stubGlobal("document", { body: {} });

const { TeamPostPanel } = await import("./TeamPostReview");
const { readTeamReviews, statusOf } = await import("@/lib/teamPosts");
import type { TeamPost, TeamReviews } from "@/lib/teamPosts";

const post = (id: string, o: Partial<TeamPost> = {}): TeamPost => ({
  id,
  title: `Post ${id}`,
  product: "at",
  day: "2030-01-15",
  time: "10:00",
  image: "",
  message: "Log a call in two taps.",
  rev: 2,
  revisedAt: null,
  postedAt: null,
  postLink: null,
  skipped: false,
  telegram: { approvedRev: null, comments: [] },
  handled: [],
  ...o,
});

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

let reviews: TeamReviews;
const onReviews = vi.fn((next: TeamReviews) => void (reviews = next));
const onDecided = vi.fn((next: TeamReviews) => void (reviews = next));
/** Opens the panel fresh, as the calendar does with key={post.id}: new state, the module's typed comments kept. */
const open = (p: TeamPost) => {
  shim.slots = [];
  return draw(p);
};
const draw = (p: TeamPost) => {
  shim.i = 0;
  return TeamPostPanel({ uid: UID, post: p, reviews, onReviews, onClose: () => undefined, onDecided, waiting: 2 });
};
const box = (tree: unknown) => find(tree, (e) => e.props["aria-label"] === "Comment")!;
const typeIn = (tree: unknown, v: string) => (box(tree).props.onChange as (e: unknown) => void)({ target: { value: v } });
const submit = (tree: unknown) => (find(tree, (e) => e.type === "form")!.props.onSubmit as (e: unknown) => void)({ preventDefault: () => undefined });

beforeEach(() => {
  store.clear();
  toasts.length = 0;
  reviews = {};
  onReviews.mockClear();
  onDecided.mockClear();
});

describe("a comment on a team post", () => {
  it("is still in the box after the panel is closed and opened again, and only on its own post", () => {
    typeIn(open(post("tp1")), "Lead with the 2 taps");
    expect(box(open(post("tp1"))).props.value).toBe("Lead with the 2 taps");
    expect(box(open(post("tp2"))).props.value).toBe("");
  });

  it("Send saves it on the post, hands over to the next one waiting, and leaves an empty box behind", () => {
    const p = post("tp3");
    let tree = open(p);
    typeIn(tree, "  Shorter, and say it is free  ");
    tree = draw(p);
    submit(tree);
    expect(onDecided).toHaveBeenCalledTimes(1);
    expect(readTeamReviews(UID).tp3.comments.map((c) => c.text)).toEqual(["Shorter, and say it is free"]);
    expect(statusOf(p, reviews.tp3)).toBe("revising");
    expect(toasts.map((t) => t.title)).toEqual(["Sent to Claude: Post tp3. It comes back here reworked."]);
    expect(box(open(p)).props.value).toBe("");
  });

  it("a blank comment sends nothing and decides nothing", () => {
    const p = post("tp4");
    const tree = open(p);
    typeIn(tree, "   ");
    submit(draw(p));
    expect(onDecided).not.toHaveBeenCalled();
    expect(toasts).toEqual([]);
    expect(readTeamReviews(UID).tp4).toBeUndefined();
  });
});

describe("Approve and Skip", () => {
  it("Approve hands over, and Undo in its toast takes the approval back", () => {
    const p = post("tp5");
    (button(open(p), "Approve")!.props.onClick as () => void)();
    expect(onDecided).toHaveBeenCalledTimes(1);
    expect(statusOf(p, reviews.tp5)).toBe("approved");
    const t = toasts.at(-1)!;
    expect(t.title).toBe("Approved: Post tp5");
    ((t.action as El).props.onClick as () => void)();
    expect(onReviews).toHaveBeenCalledTimes(1);
    expect(statusOf(p, reviews.tp5)).toBe("waiting");
    expect(statusOf(p, readTeamReviews(UID).tp5)).toBe("waiting");
  });

  it("Skip hands over, and Undo in its toast puts the post back in the queue", () => {
    const p = post("tp6");
    (button(open(p), "Skip")!.props.onClick as () => void)();
    expect(statusOf(p, reviews.tp6)).toBe("skipped");
    expect(toasts.at(-1)!.title).toBe("Skipped: Post tp6");
    ((toasts.at(-1)!.action as El).props.onClick as () => void)();
    expect(statusOf(p, reviews.tp6)).toBe("waiting");
  });

  it("a posted post can't be approved, skipped or commented on", () => {
    const p = post("tp7", { postedAt: "2030-01-15T02:00:00.000Z" });
    const tree = open(p);
    expect(button(tree, "Approve")!.props.disabled).toBe(true);
    expect(button(tree, "Skip")).toBeNull();
    expect(find(tree, (e) => e.props["aria-label"] === "Comment")).toBeNull();
  });
});
