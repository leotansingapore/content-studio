// My posts is live for everyone: its first frame must draw exactly as it did before Leo's phase 7 parts (pinned on
// today's code). Never update the pinned file with vitest -u.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const as = vi.hoisted(() => ({ user: null as null | undefined | { id: string; email: string } }));
vi.mock("@/lib/useLeoOnly", async (actual) => ({ ...(await actual<typeof import("@/lib/useLeoOnly")>()), useLeoUser: () => as.user }));
vi.mock("@/lib/supabase", () => ({
  SUPABASE_URL: "https://abc.supabase.co",
  supabase: { auth: { getUser: () => new Promise(() => undefined), getSession: () => new Promise(() => undefined), onAuthStateChange: () => ({}) } },
}));

import DraftsPage, { moreLikeWinner } from "./DraftsPage";

const html = (path = "/drafts") => renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [path] }, createElement(DraftsPage)));

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 22, 9, 0));
});
afterAll(() => vi.useRealTimers());
afterEach(() => {
  as.user = null;
});

describe("My posts for everyone else", () => {
  it("draws today's first frame", async () => {
    await expect(html()).toMatchFileSnapshot("./__pins__/drafts-page-everyone.html");
  });
  it("draws today's first frame while the sign-in is still being read", async () => {
    as.user = undefined;
    await expect(html()).toMatchFileSnapshot("./__pins__/drafts-page-everyone.html");
  });
  it("draws today's first frame on Leo's links", async () => {
    await expect(html("/drafts?set=st-abc&schedule=d1&step=caption&network=linkedin")).toMatchFileSnapshot("./__pins__/drafts-page-everyone.html");
  });
});

describe("Make 3 more like the winner (Leo only)", () => {
  it("opens Write's hooks panel on the winner, carrying its formula so the first new hook keeps it", () => {
    expect(moreLikeWinner({ id: "v1", hookFormula: "contrarian" })).toBe("/generate?draft=v1&panel=hooks&formula=contrarian");
    expect(moreLikeWinner({ id: "v1" })).toBe("/generate?draft=v1&panel=hooks");
  });
});
