// Post it for me is live for everyone with social accounts switched on: its schedule, cancel and retry paths are
// pinned on today's code for a session that is not Leo's (what it sends, what it saves on the draft, what it says).
// Never update these with vitest -u.
//
// Node has no DOM, so the hooks are stood in for (the StudioLayout pin's pattern): each draw collects the effects
// whose deps changed, the test runs them, and a button is pressed by calling the onClick it has in the element tree
// the component returns.
import { isValidElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const UID = "6d80f027-3395-480c-86a1-8827d3d6cce3";
const shim = vi.hoisted(() => ({ i: 0, e: 0, slots: [] as unknown[], deps: [] as (unknown[] | undefined)[], effects: [] as (() => unknown)[] }));
const fn = vi.hoisted(() => ({ calls: [] as Record<string, unknown>[], answers: {} as Record<string, () => unknown> }));
const toasts = vi.hoisted(() => [] as unknown[]);

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
  const useMemo = (make: () => unknown) => slot(make);
  // as React does: an effect runs again only when one of its deps changed (cleanups are not run)
  const useEffect = (run: () => unknown, deps?: unknown[]) => {
    const k = shim.e++;
    const prev = shim.deps[k];
    if (deps && prev && deps.length === prev.length && deps.every((d, j) => Object.is(d, prev[j]))) return;
    shim.deps[k] = deps;
    shim.effects.push(run);
  };
  const hooks = { useState, useRef, useMemo, useEffect };
  return { ...real, ...hooks, default: { ...real, ...hooks } };
});
vi.mock("@/lib/supabase", () => ({
  SUPABASE_URL: "https://abc.supabase.co",
  supabase: { auth: { getSession: () => new Promise(() => undefined), onAuthStateChange: () => ({}) } },
}));
vi.mock("@/lib/useLeoOnly", () => ({ useLeoUser: () => null, useLeoOnly: () => false, leoUser: async () => null }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: (t: unknown) => toasts.push(t) }), toast: (t: unknown) => toasts.push(t) }));
// every social call: recorded, then answered by its action
vi.mock("@/lib/edgeFn", async (actual) => ({
  ...(await actual<typeof import("@/lib/edgeFn")>()),
  callFn: async (name: string, body: Record<string, unknown>) => {
    fn.calls.push({ name, ...body });
    const answer = fn.answers[String(body.action)];
    if (!answer) throw new Error(`No answer for ${String(body.action)}`);
    return answer();
  },
}));

class MemStorage {
  private m = new Map<string, string>();
  get length() { return this.m.size; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  keys() { return [...this.m.keys()]; }
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
}
const local = new MemStorage();
vi.stubGlobal("localStorage", local);
vi.stubGlobal("window", { localStorage: local, location: new URL("http://localhost/calendar"), addEventListener() {}, removeEventListener() {}, dispatchEvent: () => true });

const { PostItForMePanel, ZernioStatus } = await import("./PostItForMe");
const { whenLabel } = await import("@/lib/autoPost");
import type { DraftEntry } from "@/lib/draftHistory";

const DRAFTS = `content-studio-drafts-${UID}`;
const dated: DraftEntry = {
  id: "d1",
  createdAt: "2026-10-01T00:00:00.000Z",
  hook: "3 CPF myths at 55",
  draft: "3 CPF myths at 55\n\nMyth one.",
  pillar: "topic",
  pillarDetail: "",
  audience: "general",
  format: "text-post",
  platform: "linkedin",
  ctaType: "comment-keyword",
  status: "scheduled",
  scheduledFor: "2030-01-15T09:00",
};
const ACCOUNT = { id: "acc1", platform: "linkedin", username: "leotan", name: "Leo Tan", url: null, picture: null, health: "healthy", needsReconnect: false, issues: [] };
const view = (status: string) => ({ id: "zp1", status, scheduledFor: "2030-01-15T01:00:00.000Z", platforms: [{ platform: "linkedin", accountId: "acc1", status: "pending" }] });

type El = { type: unknown; props: { children?: unknown; onClick?: () => unknown } };
const kids = (n: unknown): unknown[] => (n == null || typeof n === "boolean" ? [] : Array.isArray(n) ? n.flatMap(kids) : [n]);
const text = (n: unknown): string => (typeof n === "string" || typeof n === "number" ? String(n) : isValidElement(n) ? kids((n as El).props.children).map(text).join("") : "");
/** The first element with an onClick whose words pass `match`, depth first. */
function button(tree: unknown, match: (words: string) => boolean): El {
  const walk = (n: unknown): El | null => {
    if (!isValidElement(n)) return null;
    const el = n as El;
    if (el.props.onClick && match(text(el).trim())) return el;
    for (const c of kids(el.props.children)) {
      const hit = walk(c);
      if (hit) return hit;
    }
    return null;
  };
  const hit = walk(tree);
  if (!hit) throw new Error("No such button");
  return hit;
}
const settle = async () => {
  for (let k = 0; k < 10; k++) await new Promise((r) => setTimeout(r, 0));
};
/** One draw of the component with the stand-in hooks; the effects it set up are run. */
async function draw<P>(C: (p: P) => unknown, props: P): Promise<unknown> {
  shim.i = 0;
  shim.e = 0;
  const tree = C(props);
  for (const run of shim.effects.splice(0)) run();
  await settle();
  return tree;
}
const zernioOf = (calls: unknown[][]) => calls.map(([list]) => (list as DraftEntry[]).find((d) => d.id === "d1")?.zernio ?? null);
const activityRows = () => local.keys().filter((k) => k.startsWith("content-studio-activity-"));

beforeEach(() => {
  local.clear();
  shim.slots = [];
  shim.deps = [];
  shim.effects = [];
  fn.calls.length = 0;
  fn.answers = { status: () => ({ accounts: [ACCOUNT] }) };
  toasts.length = 0;
});

describe("Post it for me for everyone else", () => {
  it("schedules a dated draft: the key on the draft first, then the post, the link, a toast and the panel closed", async () => {
    local.setItem(DRAFTS, JSON.stringify([dated]));
    fn.answers.schedule = () => ({ post: view("scheduled") });
    const onDrafts = vi.fn();
    const onClose = vi.fn();
    const props = { userId: UID, draft: dated, blockReason: null, onDrafts, onClose };
    await draw(PostItForMePanel, props);
    const send = button(await draw(PostItForMePanel, props), (w) => w.startsWith("Schedule for"));
    send.props.onClick!();
    await settle();

    const key = (fn.calls[1] as { clientKey: string }).clientKey;
    expect(fn.calls).toEqual([
      { name: "social", action: "status", profileId: "me" },
      { name: "social", action: "schedule", profileId: "me", accountIds: ["acc1"], clientKey: key, content: "3 CPF myths at 55\n\nMyth one.", mediaUrls: [], scheduledFor: "2030-01-15T09:00:00+08:00" },
    ]);
    expect(zernioOf(onDrafts.mock.calls)).toEqual([{ key }, { key, postId: "zp1", status: "scheduled", at: "2030-01-15T01:00:00.000Z" }]);
    expect(toasts).toEqual([{ title: "Scheduled on LinkedIn", description: `${whenLabel("2030-01-15", "09:00")}. The chip on the post shows when it's up.` }]);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(activityRows()).toEqual([]);
  });

  it("a send that fails keeps the key on the draft, says why and leaves the panel open", async () => {
    local.setItem(DRAFTS, JSON.stringify([dated]));
    fn.answers.schedule = () => {
      throw new Error("Zernio is down. Try again in a minute.");
    };
    const onDrafts = vi.fn();
    const onClose = vi.fn();
    const props = { userId: UID, draft: dated, blockReason: null, onDrafts, onClose };
    await draw(PostItForMePanel, props);
    button(await draw(PostItForMePanel, props), (w) => w.startsWith("Schedule for")).props.onClick!();
    await settle();

    expect(fn.calls.map((c) => c.action)).toEqual(["status", "schedule"]);
    expect(zernioOf(onDrafts.mock.calls)).toEqual([{ key: (fn.calls[1] as { clientKey: string }).clientKey }]);
    expect(text(await draw(PostItForMePanel, props))).toContain("Zernio is down. Try again in a minute.");
    expect(toasts).toEqual([]);
    expect(onClose).not.toHaveBeenCalled();
    expect(activityRows()).toEqual([]);
  });

  it("retries a failed post: opening the chip reads it, Retry sends it again and says so", async () => {
    const failed = { ...dated, zernio: { key: "k1", postId: "zp1", status: "failed", error: "Token expired" } };
    local.setItem(DRAFTS, JSON.stringify([failed]));
    fn.answers.post = () => ({ post: view("failed") });
    fn.answers.retry = () => ({ post: view("publishing") });
    const onDrafts = vi.fn();
    const props = { userId: UID, draft: failed, onDrafts };
    button(await draw(ZernioStatus, props), (w) => w === "Failed").props.onClick!();
    await settle();
    button(await draw(ZernioStatus, props), (w) => w === "Retry").props.onClick!();
    await settle();

    expect(fn.calls).toEqual([
      { name: "social", action: "post", profileId: "me", postId: "zp1" },
      { name: "social", action: "retry", profileId: "me", postId: "zp1" },
    ]);
    expect(zernioOf(onDrafts.mock.calls)).toEqual([
      { key: "k1", postId: "zp1", status: "failed", at: "2030-01-15T01:00:00.000Z" },
      { key: "k1", postId: "zp1", status: "publishing", at: "2030-01-15T01:00:00.000Z" },
    ]);
    expect(toasts).toEqual([{ title: "Trying again", description: "Zernio is posting it again." }]);
    expect(activityRows()).toEqual([]);
  });

  it("a retry that fails says why and changes nothing", async () => {
    const failed = { ...dated, zernio: { key: "k1", postId: "zp1", status: "failed" } };
    local.setItem(DRAFTS, JSON.stringify([failed]));
    fn.answers.post = () => ({ post: view("failed") });
    fn.answers.retry = () => {
      throw new Error("Couldn't try it again. Try again in a minute.");
    };
    const onDrafts = vi.fn();
    const props = { userId: UID, draft: failed, onDrafts };
    button(await draw(ZernioStatus, props), (w) => w === "Failed").props.onClick!();
    await settle();
    button(await draw(ZernioStatus, props), (w) => w === "Retry").props.onClick!();
    await settle();

    expect(fn.calls.map((c) => c.action)).toEqual(["post", "retry"]);
    expect(onDrafts).toHaveBeenCalledTimes(1);
    expect(text(await draw(ZernioStatus, props))).toContain("Couldn't try it again. Try again in a minute.");
    expect(toasts).toEqual([]);
    expect(activityRows()).toEqual([]);
  });

  it("cancels a scheduled post on the second press: the link comes off the draft and a toast says it stays", async () => {
    const scheduled = { ...dated, zernio: { key: "k1", postId: "zp1", status: "scheduled" } };
    local.setItem(DRAFTS, JSON.stringify([scheduled]));
    fn.answers.post = () => ({ post: view("scheduled") });
    fn.answers.cancel = () => ({ cancelled: true });
    const onDrafts = vi.fn();
    const props = { userId: UID, draft: scheduled, onDrafts };
    button(await draw(ZernioStatus, props), (w) => w === "Scheduled").props.onClick!();
    await settle();
    button(await draw(ZernioStatus, props), (w) => w === "Cancel post").props.onClick!();
    button(await draw(ZernioStatus, props), (w) => w === "Confirm cancel").props.onClick!();
    await settle();

    expect(fn.calls).toEqual([
      { name: "social", action: "post", profileId: "me", postId: "zp1" },
      { name: "social", action: "cancel", profileId: "me", postId: "zp1" },
    ]);
    expect(zernioOf(onDrafts.mock.calls)).toEqual([{ key: "k1", postId: "zp1", status: "scheduled", at: "2030-01-15T01:00:00.000Z" }, null]);
    expect(toasts).toEqual([{ title: "Cancelled", description: "Zernio won't post it. It stays in My posts." }]);
    expect(activityRows()).toEqual([]);
  });
});
