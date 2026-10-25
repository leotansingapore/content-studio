// /analytics is live for everyone: its first frame must draw exactly as it did before phase 7a's Leo-only parts
// (grade chips, Winner found, What wins, How the score did), pinned on today's code (35537cb1). Never update the
// pinned file with vitest -u.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

const as = vi.hoisted(() => ({ user: null as null | undefined | { id: string; email: string } }));
vi.mock("@/lib/useLeoOnly", async (actual) => ({ ...(await actual<typeof import("@/lib/useLeoOnly")>()), useLeoUser: () => as.user }));
vi.mock("@/lib/supabase", () => ({
  SUPABASE_URL: "https://abc.supabase.co",
  supabase: { auth: { getUser: () => new Promise(() => undefined), getSession: () => new Promise(() => undefined), onAuthStateChange: () => ({}) } },
}));

const { default: AnalyticsPage } = await import("./AnalyticsPage");
const html = (path = "/analytics") => renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [path] }, createElement(AnalyticsPage)));

afterEach(() => {
  as.user = null;
});

describe("/analytics for everyone else", () => {
  it("draws today's first frame", async () => {
    await expect(html()).toMatchFileSnapshot("./__pins__/analytics-page-everyone.html");
  });
  it("draws today's first frame while the sign-in is still being read", async () => {
    as.user = undefined;
    await expect(html()).toMatchFileSnapshot("./__pins__/analytics-page-everyone.html");
  });
  it("draws today's first frame on Leo's links", async () => {
    for (const path of ["/analytics?grade=d-1#winners", "/analytics?link=p-1#real-numbers", "/analytics?wins=hook#what-wins", "/analytics#score-check"])
      await expect(html(path)).toMatchFileSnapshot("./__pins__/analytics-page-everyone.html");
  });
});
