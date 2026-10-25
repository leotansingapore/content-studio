// TikTok's posting mode and the warm-up guard (publish-tiktok). Node has no DOM, so the hooks are stood in for (the
// PostItForMe.test.ts pattern): a press calls the onClick it has in the element tree the component returns.
import { isValidElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const shim = vi.hoisted(() => ({ i: 0, slots: [] as unknown[] }));
vi.mock("react", async (actual) => {
  const real = await actual<typeof import("react")>();
  const useState = (init: unknown) => {
    const i = shim.i++;
    if (!(i in shim.slots)) shim.slots[i] = typeof init === "function" ? (init as () => unknown)() : init;
    return [shim.slots[i], (v: unknown) => (shim.slots[i] = typeof v === "function" ? (v as (p: unknown) => unknown)(shim.slots[i]) : v)];
  };
  return { ...real, useState, default: { ...real, useState } };
});

const { TikTokMode, INBOX_NOTICE } = await import("./TikTokMode");

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
const press = (tree: unknown, words: string) => {
  const el = find(tree, (e) => typeof e.props.onClick === "function" && text(e).trim() === words);
  if (!el) throw new Error(`No button "${words}"`);
  (el.props.onClick as () => void)();
};

type Props = Parameters<typeof TikTokMode>[0];
let props: Props;
const draw = () => {
  shim.i = 0;
  return TikTokMode(props);
};

beforeEach(() => {
  shim.slots = [];
  props = { handle: "activity_tracker_io", mode: "inbox", isNew: false, warmed: false, onMode: vi.fn(), onWarmed: vi.fn() };
});

describe("TikTok's posting mode", () => {
  it("shows Send to inbox picked with its help and notice; a new account gets its line", () => {
    const t = text(draw());
    expect(t).toContain("Posting mode");
    expect(find(draw(), (e) => e.props["aria-pressed"] === true && text(e) === "Send to inbox")).not.toBeNull();
    expect(t).toContain("It lands in your TikTok inbox. You finish it in the app.");
    expect(t).toContain(INBOX_NOTICE);
    expect(t).not.toContain("New account");
    props.isNew = true;
    expect(text(draw())).toContain("New account: send your first posts to the inbox.");
  });

  it("Post directly on an account with no warmedAt opens the guard; Keep send to inbox leaves the mode", () => {
    press(draw(), "Post directly");
    const guard = draw();
    expect(find(guard, (e) => e.props.role === "alertdialog")).not.toBeNull();
    expect(text(guard)).toContain("Warm up this account first");
    expect(text(guard)).toContain("Don't ask again for @activity_tracker_io");
    expect(props.onMode).not.toHaveBeenCalled();
    press(guard, "Keep send to inbox");
    expect(find(draw(), (e) => e.props.role === "alertdialog")).toBeNull();
    expect(props.onMode).not.toHaveBeenCalled();
    expect(props.onWarmed).not.toHaveBeenCalled();
  });

  it("My account is warmed up switches to Post directly, and saves warmedAt only with the box ticked", () => {
    press(draw(), "Post directly");
    press(draw(), "My account is warmed up");
    expect(props.onMode).toHaveBeenCalledWith("direct");
    expect(props.onWarmed).not.toHaveBeenCalled();

    press(draw(), "Post directly");
    const box = find(draw(), (e) => e.props.type === "checkbox");
    (box!.props.onChange as (e: unknown) => void)({ target: { checked: true } });
    press(draw(), "My account is warmed up");
    expect(props.onWarmed).toHaveBeenCalledTimes(1);
    expect(props.onMode).toHaveBeenCalledTimes(2);
  });

  it("a warmed account goes straight to Post directly, with no guard", () => {
    props.warmed = true;
    press(draw(), "Post directly");
    expect(props.onMode).toHaveBeenCalledWith("direct");
    expect(find(draw(), (e) => e.props.role === "alertdialog")).toBeNull();
    props.mode = "direct";
    const t = text(draw());
    expect(t).toContain("It goes straight to your TikTok profile.");
    expect(t).not.toContain(INBOX_NOTICE);
  });
});
