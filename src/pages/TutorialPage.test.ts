// /tutorial is live for everyone: its first frame must draw exactly as it did before Leo's tour button (pinned on
// today's code). Never update the pinned file with vitest -u.
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
// the shared tab row reads the rails store, which has no server snapshot; it is not this page's to pin
vi.mock("@/components/SectionTabs", () => ({ default: () => createElement("nav", { "data-pin": "section-tabs" }), LEARN_TABS: [] }));

import TutorialPage from "./TutorialPage";

const html = () => renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: ["/tutorial"] }, createElement(TutorialPage)));

afterEach(() => {
  as.user = null;
});

describe("/tutorial for everyone else", () => {
  it("draws today's page", async () => {
    await expect(html()).toMatchFileSnapshot("./__pins__/tutorial-page-everyone.html");
  });
  it("draws today's page while the sign-in is still being read", async () => {
    as.user = undefined;
    await expect(html()).toMatchFileSnapshot("./__pins__/tutorial-page-everyone.html");
  });
});

describe("/tutorial for Leo", () => {
  it("puts Replay the tour at the top, above the section tabs", () => {
    as.user = { id: "u1", email: "leo@example.com" };
    const out = html();
    expect(out).toContain("Replay the tour");
    expect(out.indexOf("Replay the tour")).toBeLessThan(out.indexOf('data-pin="section-tabs"'));
  });
});
