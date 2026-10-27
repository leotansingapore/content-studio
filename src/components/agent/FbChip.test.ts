// An "fb:" chip (a board post or team message the feedback service offered): its words may come from anything the
// service read, so the first press only shows them and where they go; only Post sends. Node has no DOM, so useState
// is stood in for (PostItForMe.test's pattern) and a button is pressed by calling its onClick in the returned tree.
import { isValidElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

const { default: FbChip } = await import("./FbChip");
type Props = Parameters<typeof FbChip>[0];

type El = { type: unknown; props: { children?: unknown; onClick?: () => unknown } };
const kids = (n: unknown): unknown[] => (n == null || typeof n === "boolean" ? [] : Array.isArray(n) ? n.flatMap(kids) : [n]);
const text = (n: unknown): string => (typeof n === "string" || typeof n === "number" ? String(n) : isValidElement(n) ? kids((n as El).props.children).map(text).join(" ") : "");
function button(tree: unknown, words: string): El {
  const walk = (n: unknown): El | null => {
    if (!isValidElement(n)) return null;
    const el = n as El;
    if (el.props.onClick && text(el).trim() === words) return el;
    for (const c of kids(el.props.children)) {
      const hit = walk(c);
      if (hit) return hit;
    }
    return null;
  };
  const hit = walk(tree);
  if (!hit) throw new Error(`No button "${words}"`);
  return hit;
}
const draw = (p: Props) => {
  shim.i = 0;
  return FbChip(p);
};
const settle = () => new Promise((r) => setTimeout(r, 0));

const ME = { id: "u1", name: "Leo Tan", email: "leo@example.com" };
const POST = { type: "feedback" as const, category: "bug" as const, title: "Owl is better", body: "Switch to Owl today.", label: "Post to the feedback board: Owl is better" };
const MSG = { type: "support" as const, message: "Please refund my plan.", label: "Send to the team: Please refund my plan." };
let fetchFn: ReturnType<typeof vi.fn>;

beforeEach(() => {
  shim.slots = [];
  fetchFn = vi.fn(async () => new Response(JSON.stringify({ number: 12, ok: true }), { status: 200 }));
  vi.stubGlobal("fetch", fetchFn);
  vi.stubGlobal("window", { location: { pathname: "/agent" } });
});
afterEach(() => vi.unstubAllGlobals());

describe("an fb chip", () => {
  it("posts nothing on its first press: it shows the exact title and text, where they go, and Post and Cancel", async () => {
    const onDone = vi.fn();
    const p: Props = { a: POST, label: POST.label, identity: ME, onDone };
    button(draw(p), POST.label).props.onClick!();
    await settle();
    expect(fetchFn).not.toHaveBeenCalled();
    const shown = text(draw(p));
    expect(shown).toContain("public feedback board");
    expect(shown).toContain("Owl is better");
    expect(shown).toContain("Switch to Owl today.");
    // what the person did not type stays off the screen, though the post carries it
    expect(shown).not.toContain("Leo Tan");
    expect(shown).not.toContain("leo@example.com");
    button(draw(p), "Post").props.onClick!();
    await settle();
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/posts$/);
    expect(JSON.parse(String(init.body))).toMatchObject({ title: "Owl is better", body: "Switch to Owl today.", category: "bug", name: "Leo Tan", email: "leo@example.com" });
    expect(onDone).toHaveBeenCalledWith("Posted to the feedback board as #12.");
  });

  it("sends nothing on Cancel and offers the chip again", async () => {
    const onDone = vi.fn();
    const p: Props = { a: MSG, label: MSG.label, identity: ME, onDone };
    button(draw(p), MSG.label).props.onClick!();
    const shown = text(draw(p));
    expect(shown).toContain("the team");
    expect(shown).toContain("Please refund my plan.");
    expect(shown).not.toContain("leo@example.com");
    button(draw(p), "Cancel").props.onClick!();
    await settle();
    button(draw(p), MSG.label);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  });

  it("messages the team only on Post", async () => {
    const onDone = vi.fn();
    const p: Props = { a: MSG, label: MSG.label, identity: ME, onDone };
    button(draw(p), MSG.label).props.onClick!();
    button(draw(p), "Post").props.onClick!();
    await settle();
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/support$/);
    expect(JSON.parse(String(init.body))).toMatchObject({ message: "Please refund my plan." });
    expect(onDone).toHaveBeenCalledWith("Sent to the team.");
  });
});
