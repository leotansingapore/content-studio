// The maker beside the agent's chat: which addresses stay in the panel, and its own router inside the app's.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabase: {}, SUPABASE_URL: "", SUPABASE_ANON_KEY: "" }));
const { default: MakerPanel, PANEL_PAGES, inPanel, panelPath } = await import("./MakerPanel");
const { SKILLS } = await import("@/lib/makeSkills");

describe("the maker panel", () => {
  it("holds every maker a skill opens there, and nothing else", () => {
    for (const s of SKILLS.filter((x) => !x.agentFormat)) expect(inPanel(s.href), `${s.id} ${s.href}`).toBe(true);
    expect(inPanel("/make/static/text-chat?note=x")).toBe(true);
    expect(inPanel("/media?folder=AI")).toBe(false);
    expect(inPanel("/agent")).toBe(false);
    expect(PANEL_PAGES.length).toBeGreaterThan(10);
  });

  it("reopens only one of its own pages from the address", () => {
    expect(panelPath("/generate?draft=d1")).toBe("/generate?draft=d1");
    expect(panelPath("//evil.example/generate")).toBeNull();
    expect(panelPath("/settings")).toBeNull();
    expect(panelPath(null)).toBeNull();
  });

  it("runs its own router inside the app's, leaving the chat's address alone", () => {
    let outer = "";
    const Where = () => ((outer = useLocation().pathname), null);
    const html = renderToStaticMarkup(
      createElement(MemoryRouter, { initialEntries: ["/agent/t1?skill=video-editor&step=make"] },
        createElement(Routes, null,
          createElement(Route, {
            path: "/agent/:thread",
            element: createElement("div", null, createElement(Where), createElement(MakerPanel, { name: "Video editor", start: "/edit", onPath: () => undefined, onClose: () => undefined })),
          }),
        ),
      ),
    );
    expect(outer).toBe("/agent/t1");
    expect(html).toContain("Back");
    expect(html).toContain("Video editor");
    expect(html).toContain('aria-busy="true"');
  });
});
