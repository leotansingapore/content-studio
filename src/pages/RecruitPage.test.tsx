import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const kit = vi.hoisted(() => ({ profession: "" }));
vi.mock("@/lib/profession", async (actual) => {
  const real = await actual<typeof import("@/lib/profession")>();
  return { ...real, professionFor: () => kit.profession, adviserBrand: () => !kit.profession };
});
vi.mock("@/hooks/useRecruitBrain", async () => {
  const { emptyBrain } = await import("@/lib/recruit");
  return { useRecruitBrain: () => ({ userId: "u1", brain: emptyBrain(), update: () => {}, savedAt: "", ready: true }) };
});
vi.mock("@/components/recruit/Agent", () => ({ default: () => createElement("div", null, "AGENT") }));
vi.mock("@/components/recruit/BrandBrain", () => ({ default: () => null }));
vi.mock("@/components/recruit/Conversations", () => ({ default: () => null }));

import RecruitPage from "./RecruitPage";

const html = () => renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: ["/recruit/agent"] }, createElement(RecruitPage)));

describe("Reply agent", () => {
  beforeEach(() => {
    kit.profession = "";
  });

  it("opens the agent on an adviser brand or one with nothing set", () => {
    expect(html()).toContain("AGENT");
  });

  it("is off on a brand that isn't an adviser's, so it never writes a post recruiting advisers for a coach", () => {
    kit.profession = "Coach";
    const h = html();
    expect(h).not.toContain("AGENT");
    expect(h).toContain("recruit financial advisers to your team, so it is off for this brand");
    expect(h).toContain("you work as: Coach.");
    expect(h).toContain('href="/brand"');
  });
});
