// PostPreview is drawn for everyone (Write, Calendar, the campaign queue): a person's LinkedIn card with no role in the
// brand kit is pinned on today's code. Never update the pinned files with vitest -u.
//
// Node has no DOM, so effects never run in a server render, and the card reads the brand kit in an effect. A small shim
// stands in for useState and useEffect inside PostPreview's own body only: the first render collects the effect, the
// test runs it (the kit loads from a fake localStorage), and the second render draws the loaded kit.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const UID = "6d80f027-3395-480c-86a1-8827d3d6cce3";
const shim = vi.hoisted(() => ({ on: false, i: 0, slots: [] as unknown[], effects: [] as (() => unknown)[] }));

vi.mock("react", async (actual) => {
  const real = await actual<typeof import("react")>();
  const useState = (init: unknown) => {
    if (!shim.on) return real.useState(init);
    const i = shim.i++;
    if (!(i in shim.slots)) shim.slots[i] = typeof init === "function" ? (init as () => unknown)() : init;
    return [shim.slots[i], (v: unknown) => (shim.slots[i] = typeof v === "function" ? (v as (p: unknown) => unknown)(shim.slots[i]) : v)];
  };
  const useEffect = (fn: () => unknown, deps?: unknown[]) => (shim.on ? void shim.effects.push(fn) : real.useEffect(fn as () => void, deps));
  return { ...real, default: { ...real, useState, useEffect }, useState, useEffect };
});
vi.mock("@/lib/supabase", () => ({
  SUPABASE_URL: "https://abc.supabase.co",
  supabase: { auth: { getUser: async () => ({ data: { user: { id: UID } } }), getSession: () => new Promise(() => undefined), onAuthStateChange: () => ({}) } },
}));

const local = new Map<string, string>();
const storage = { getItem: (k: string) => local.get(k) ?? null, setItem: (k: string, v: string) => void local.set(k, String(v)), removeItem: (k: string) => void local.delete(k), key: () => null, length: 0 };
vi.stubGlobal("localStorage", storage);
vi.stubGlobal("window", { localStorage: storage, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => true });

const { default: PostPreview } = await import("./PostPreview");

const TEXT = "Most people say more apps mean more control. We disagree.\n\nWe bring CRM, a shared WhatsApp inbox, tasks and goals together in one phone app.\n\nWhat part of your sales workflow involves the most app switching?";

// React's dev warnings call a component again outside the render to name it in a stack: that call must not touch the shim
function Pinned(props: Parameters<typeof PostPreview>[0]) {
  const was = { on: shim.on, i: shim.i, effects: shim.effects.length };
  shim.on = true;
  shim.i = 0;
  try {
    return PostPreview(props);
  } catch (e) {
    shim.effects.length = was.effects;
    throw e;
  } finally {
    shim.on = was.on;
    shim.i = was.i;
  }
}
// an icon by its class only, so a lucide upgrade that redraws one doesn't fail this
const draw = (platform: string) =>
  renderToStaticMarkup(createElement(Pinned, { text: TEXT, platform, format: "text-post" })).replace(/<svg[^>]*class="([^"]*)"[^>]*>[\s\S]*?<\/svg>/g, '<svg class="$1"/>');

/** The first frame, then the frame after the brand kit has loaded. */
async function frames(platform = "linkedin") {
  shim.slots = [];
  shim.effects = [];
  const first = draw(platform);
  for (const fn of shim.effects.splice(0)) fn();
  await new Promise((r) => setTimeout(r, 0));
  return { first, loaded: draw(platform) };
}

beforeEach(() => local.clear());

describe("PostPreview for a person", () => {
  it("draws today's LinkedIn card for a brand kit with no role", async () => {
    local.set(`content-studio-carousel-brand-${UID}`, JSON.stringify({ name: "Mei Ling Tan", handle: "@meiling", role: "" }));
    const { first, loaded } = await frames();
    expect(loaded).toContain("Mei Ling Tan");
    await expect(loaded).toMatchFileSnapshot("./__pins__/post-preview-person-no-role.html");
    await expect(first).toMatchFileSnapshot("./__pins__/post-preview-first-frame.html");
  });

  it("draws today's Facebook card for a brand kit with no role", async () => {
    local.set(`content-studio-carousel-brand-${UID}`, JSON.stringify({ name: "Mei Ling Tan", handle: "@meiling", role: "" }));
    await expect((await frames("facebook")).loaded).toMatchFileSnapshot("./__pins__/post-preview-person-no-role-facebook.html");
  });
});

describe("PostPreview for a business (live-p5w4 N2: \"Financial Consultant\" under ActivityTracker)", () => {
  it("draws no role line under a business brand's name", async () => {
    local.set(`content-studio-profiles-${UID}`, JSON.stringify([{ id: "p2", name: "ActivityTracker", createdAt: "" }]));
    local.set(`cs-active-profile-${UID}`, "p2");
    local.set(`content-studio-carousel-brand-${UID}~p2`, JSON.stringify({ name: "ActivityTracker", handle: "@activitytracker", role: "" }));
    for (const platform of ["linkedin", "facebook"]) {
      const { loaded } = await frames(platform);
      expect(loaded).toContain(">ActivityTracker</p>");
      expect(loaded).not.toContain("Financial Consultant");
      expect(loaded).not.toContain('<p class="truncate text-xs text-muted-foreground">');
    }
  });
});
