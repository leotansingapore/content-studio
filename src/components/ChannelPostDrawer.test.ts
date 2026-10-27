// A channel post on the calendar (the MoneyBees Telegram feed): a change typed for a post outlives the drawer
// closing, Ask for a change sends it once and empties the box, and what each status lets Leo do. Node has no DOM, so
// the hooks are stood in for (the PostItForMe.test.ts pattern): the drawer is drawn by calling it, its effects run
// once per draw where their deps changed, and a button is pressed by calling its handler.
import { isValidElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const shim = vi.hoisted(() => ({ i: 0, e: 0, slots: [] as unknown[], deps: [] as (unknown[] | undefined)[], effects: [] as (() => unknown)[] }));

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
  // as React does: an effect runs again only when one of its deps changed (cleanups are not run)
  const useEffect = (run: () => unknown, deps?: unknown[]) => {
    const k = shim.e++;
    const prev = shim.deps[k];
    if (deps && prev && deps.length === prev.length && deps.every((d, j) => Object.is(d, prev[j]))) return;
    shim.deps[k] = deps;
    shim.effects.push(run);
  };
  const hooks = { useState, useRef, useEffect };
  return { ...real, ...hooks, default: { ...real, ...hooks } };
});
vi.mock("react-dom", async (actual) => ({ ...(await actual<typeof import("react-dom")>()), createPortal: (node: unknown) => node }));
vi.stubGlobal("window", { addEventListener() {}, removeEventListener() {} });
vi.stubGlobal("document", { body: { style: {} }, activeElement: null });

const { default: ChannelPostDrawer } = await import("./ChannelPostDrawer");
import type { CalendarFeedItem } from "@/lib/channelFeeds";
import type { ChannelReview } from "@/lib/channelReviews";

const item = (id: string, o: Partial<CalendarFeedItem> = {}): CalendarFeedItem => ({
  id,
  date: "2030-01-15",
  time: "20:00",
  status: "locked",
  title: `CPF news ${id}`,
  kind: "news",
  format: "single",
  link: "",
  caption: "<b>CPF</b> news",
  media: [],
  business: "MoneyBees",
  channel: "telegram",
  handle: "@moneybees",
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

const onComment = vi.fn();
const onSkip = vi.fn();
/** One draw of the drawer that stays mounted on the calendar: its effects run, then it draws again with what they set. */
const draw = (it: CalendarFeedItem | null, review?: ChannelReview) => {
  const once = () => {
    shim.i = 0;
    shim.e = 0;
    return ChannelPostDrawer({ item: it, onClose: () => undefined, review, onSkip, onComment });
  };
  once();
  for (const run of shim.effects.splice(0)) run();
  return once();
};
const box = (tree: unknown) => find(tree, (e) => e.type === "textarea");
const typeIn = (tree: unknown, v: string) => (box(tree)!.props.onChange as (e: unknown) => void)({ target: { value: v } });

beforeEach(() => {
  shim.slots = [];
  shim.deps = [];
  shim.effects = [];
  onComment.mockClear();
  onSkip.mockClear();
});

describe("asking for a change", () => {
  it("keeps the typed change through closing the drawer, on its own post only", () => {
    const a = item("a1");
    typeIn(draw(a), "Lead with the deadline");
    expect(draw(null)).toBeNull();
    expect(box(draw(item("b1")))!.props.value).toBe("");
    expect(box(draw(a))!.props.value).toBe("Lead with the deadline");
  });

  it("sends the words trimmed, once, and leaves an empty box that stays empty after closing", () => {
    const a = item("a2");
    let tree = draw(a);
    expect(button(tree, "Ask for a change")!.props.disabled).toBe(true);
    typeIn(tree, "  Shorter, a different picture  ");
    tree = draw(a);
    (button(tree, "Ask for a change")!.props.onClick as () => void)();
    expect(onComment).toHaveBeenCalledTimes(1);
    expect(onComment).toHaveBeenCalledWith("Shorter, a different picture");
    tree = draw(a);
    expect(box(tree)!.props.value).toBe("");
    expect(button(tree, "Ask for a change")!.props.disabled).toBe(true);
    draw(null);
    expect(box(draw(a))!.props.value).toBe("");
  });

  it("a blank change sends nothing", () => {
    const a = item("a3");
    typeIn(draw(a), "   ");
    (button(draw(a), "Ask for a change")!.props.onClick as () => void)();
    expect(onComment).not.toHaveBeenCalled();
  });
});

describe("what each status offers", () => {
  it("a skipped post offers Undo skip and no box, and its changes wait", () => {
    const review = { skip: { on: true, at: "2030-01-14T00:00:00.000Z" }, comments: [{ id: "c1", at: "2030-01-14T00:00:00.000Z", text: "Shorter" }] };
    const tree = draw(item("s1", { status: "skipped" }), review);
    expect(box(tree)).toBeNull();
    expect(button(tree, "Skip this post")).toBeNull();
    expect(text(tree)).toContain("Waiting: the post is skipped");
    (button(tree, "Undo skip")!.props.onClick as () => void)();
    expect(onSkip).toHaveBeenCalledWith(false);
  });

  it("a previewed post can be skipped, and a change the job has made again reads Done", () => {
    const review = { comments: [{ id: "c1", at: "2030-01-14T00:00:00.000Z", text: "Shorter" }, { id: "c2", at: "2030-01-14T01:00:00.000Z", text: "New picture" }] };
    const tree = draw(item("l1", { handled: ["c1"] }), review);
    expect(text(tree)).toContain("ShorterDone");
    expect(text(tree)).toContain("New pictureBeing made again");
    (button(tree, "Skip this post")!.props.onClick as () => void)();
    expect(onSkip).toHaveBeenCalledWith(true);
  });

  it("a posted post offers no box, no Skip and no Undo", () => {
    const tree = draw(item("p1", { status: "posted" }));
    expect(box(tree)).toBeNull();
    expect(button(tree, "Skip this post")).toBeNull();
    expect(button(tree, "Undo skip")).toBeNull();
  });
});
