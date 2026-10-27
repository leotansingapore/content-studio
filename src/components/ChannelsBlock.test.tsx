// The sidebar's Channels block: drawn from the channels cache only, and nothing at all where Social accounts is off.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => {
  const m = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
  };
  return m;
});
const callFn = vi.hoisted(() => vi.fn());
vi.mock("@/lib/edgeFn", async (orig) => ({ ...(await orig<typeof import("@/lib/edgeFn")>()), callFn }));
vi.mock("@/lib/supabase", () => ({ supabase: { auth: { getSession: () => new Promise(() => undefined) } } }));

import ChannelsBlock from "./ChannelsBlock";

const UID = "6d80f027-3395-480c-86a1-8827d3d6cce3";
const html = () => renderToStaticMarkup(createElement(MemoryRouter, null, createElement(ChannelsBlock, { userId: UID })));
const shown = () => store.set("cs-social-connect", JSON.stringify({ on: true, at: Date.now() }));
const cache = (channels: { platform: string; username: string; health: string }[], brand = "me") =>
  store.set(`cs-social-channels-${UID}`, JSON.stringify({ [brand]: { at: 1, channels } }));
const ig = { platform: "instagram", username: "moneybees.sg", health: "healthy" };

afterEach(() => store.clear());

describe("the Channels block", () => {
  it("draws nothing where Social accounts is off, whatever the cache holds", () => {
    cache([ig]);
    expect(html()).toBe("");
  });

  it("shows only the button while this brand has never been read here", () => {
    shown();
    cache([ig], "p-other");
    const out = html();
    expect(out).toContain("Connect a channel");
    expect(out).not.toContain("No channels yet");
    expect(out).not.toContain("moneybees");
  });

  it("says No channels yet with the button when the brand has none", () => {
    shown();
    cache([]);
    expect(html()).toMatch(/No channels yet.*Connect a channel/);
  });

  it("lists up to 4 handles linking to their platform's card, then +N more, and flags one that needs a look", () => {
    shown();
    cache([
      ig,
      { platform: "tiktok", username: "", health: "error" },
      { platform: "linkedin", username: "leo", health: "healthy" },
      { platform: "youtube", username: "mb", health: "healthy" },
      { platform: "threads", username: "mb.t", health: "healthy" },
      { platform: "facebook", username: "mb.f", health: "healthy" },
    ]);
    const out = html();
    expect(out).toContain('href="/accounts#instagram"');
    expect(out).toContain("@moneybees.sg");
    // no handle: the network's name
    expect(out).toMatch(/href="\/accounts#tiktok".*TikTok.*needs a look/);
    expect(out).not.toContain("/accounts#threads");
    expect(out).toContain("+2 more");
    expect(out.indexOf("+2 more")).toBeLessThan(out.indexOf("Connect a channel"));
    expect(callFn).not.toHaveBeenCalled();
  });
});
