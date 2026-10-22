// AssistantMount is live for everyone: everyone but Leo gets today's AssistantDock, with today's props and intro
// byte for byte (pinned on today's code, before the agent dock). Never update the pinned file with vitest -u.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FEEDBACK_API, FEEDBACK_BOARD_KEY } from "./config";

const seen = vi.hoisted(() => ({ props: null as Record<string, unknown> | null, user: null as null | undefined | { id: string; email: string } }));
vi.mock("@/lib/supabase", () => ({
  SUPABASE_URL: "https://abc.supabase.co",
  supabase: { auth: { getUser: () => new Promise(() => undefined), getSession: () => new Promise(() => undefined), onAuthStateChange: () => ({}) } },
}));
vi.mock("@/lib/useLeoOnly", async (actual) => ({ ...(await actual<typeof import("@/lib/useLeoOnly")>()), useLeoUser: () => seen.user }));
vi.mock("./AssistantDock", async (actual) => {
  const real = await actual<typeof import("./AssistantDock")>();
  return {
    ...real,
    AssistantDock: (p: Parameters<typeof real.AssistantDock>[0]) => {
      seen.props = p;
      return createElement(real.AssistantDock, p);
    },
  };
});

import { AssistantMount } from "./AssistantMount";

const html = () => renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: ["/home"] }, createElement(AssistantMount)));
const shape = (p: Record<string, unknown> | null) =>
  p && Object.fromEntries(Object.entries(p).map(([k, v]) => [k, typeof v === "function" ? "function" : v]));

const TODAY = {
  apiUrl: FEEDBACK_API,
  boardKey: FEEDBACK_BOARD_KEY,
  appName: "Content Studio",
  identity: undefined,
  navigate: "function",
  offsetY: 20,
  mobileOffsetY: 88,
  mobileBreakpoint: 1024,
  act: "function",
  intro:
    "Ask how anything works or reach the team. It can also move a post, rewrite one in Write, show last week's numbers or paste text into Reply drafts. Nothing changes until you tap to confirm.",
};

afterEach(() => {
  seen.props = null;
  seen.user = null;
});

describe("AssistantMount for everyone else", () => {
  it("renders today's dock with today's props and intro", async () => {
    const out = html();
    expect(shape(seen.props)).toEqual(TODAY);
    await expect(out).toMatchFileSnapshot("./__pins__/assistant-mount-everyone.html");
  });

  it("renders today's dock while the sign-in is still being read", async () => {
    seen.user = undefined;
    const out = html();
    expect(shape(seen.props)).toEqual(TODAY);
    await expect(out).toMatchFileSnapshot("./__pins__/assistant-mount-everyone.html");
  });
});

describe("AssistantMount for Leo", () => {
  it("renders the agent dock instead of today's", () => {
    seen.user = { id: "40f07a18-0000-4000-8000-000000000001", email: "tanjunsing@gmail.com" };
    // the agent dock loads lazily: its first frame is the Suspense fallback, never today's dock
    expect(html()).toBe("");
    expect(seen.props).toBeNull();
  });
});
