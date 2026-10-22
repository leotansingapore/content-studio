// Batch serves everyone: its first frame, with the five audience chips, must draw exactly as it did before saved
// audiences (brand-audiences), pinned on today's code at eaaa6379. Never update the pinned file with vitest -u.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({
  SUPABASE_URL: "https://abc.supabase.co",
  SUPABASE_ANON_KEY: "",
  supabase: { auth: { getSession: () => new Promise(() => undefined), getUser: () => new Promise(() => undefined), onAuthStateChange: () => ({}) } },
}));
vi.mock("@/lib/useLeoOnly", async (actual) => ({ ...(await actual<typeof import("@/lib/useLeoOnly")>()), useLeoUser: () => null, useLeoOnly: () => false }));
// the shared tab row reads the rails store, which has no server snapshot; it is not this page's to pin
vi.mock("@/components/SectionTabs", () => ({ default: () => createElement("nav", { "data-pin": "section-tabs" }), WRITE_TABS: [] }));

const { default: BatchPage } = await import("./BatchPage");
const html = (at: string) => renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [at] }, createElement(BatchPage)));

describe("Batch for everyone else", () => {
  it("draws today's page", async () => {
    await expect(html("/generate/batch")).toMatchFileSnapshot("./__pins__/batch-page-everyone.html");
  });
  it("draws today's page with a life stage picked in the address", async () => {
    await expect(html("/generate/batch?audience=parent&pillar=market")).toMatchFileSnapshot("./__pins__/batch-page-everyone-parent.html");
  });
});
