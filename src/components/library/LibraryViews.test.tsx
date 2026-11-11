import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { sectionTabs } from "@/lib/nav";
import SectionTabs from "@/components/SectionTabs";
import LibraryViews, { LIBRARY_VIEWS, isLibraryView, rememberView, viewHref } from "./LibraryViews";

const html = (path: string) => renderToStaticMarkup(<MemoryRouter initialEntries={[path]}><LibraryViews /></MemoryRouter>).replace(/&amp;/g, "&");

describe("the Library's view switch", () => {
  it("lists the four views in one order on every one of them, marking the open one", () => {
    for (const v of LIBRARY_VIEWS) {
      const out = html(v.to);
      expect([...out.matchAll(/<span class="truncate">([^<]+)<\/span>/g)].map((m) => m[1])).toEqual(["Everything", "Posts", "Board", "Grid"]);
      expect(out.match(/aria-current="page"/g)).toHaveLength(1);
      expect(out).toMatch(new RegExp(`<span aria-current="page"[^>]*>.*?<span class="truncate">${v.label}</span></span>`));
      expect(out).not.toContain(`href="${v.to}"`);
    }
  });

  it("is exactly the pages the nav files under Library's first tab", () => {
    expect(sectionTabs("/library", "someone@example.com").picker.map((p) => p.to)).toEqual(LIBRARY_VIEWS.map((v) => v.to));
    expect(isLibraryView("/media")).toBe(false);
  });

  it("reopens a view with the filters it last had, and keeps the open view's own", () => {
    rememberView("/library", "?format=video&q=cpf");
    expect(viewHref("/library")).toBe("/library?format=video&q=cpf");
    const out = html("/board?post=p1");
    expect(out).toContain('href="/library?format=video&q=cpf"');
    rememberView("/library", "");
    expect(html("/grid")).toContain('href="/library"');
  });

  it("leaves the tab row with no second list of the views, on all four", () => {
    const tabs = (path: string) => renderToStaticMarkup(<MemoryRouter initialEntries={[path]}><SectionTabs email="someone@example.com" /></MemoryRouter>);
    for (const v of LIBRARY_VIEWS) {
      expect(tabs(v.to)).not.toContain("aria-haspopup");
      expect(tabs(v.to)).toMatch(/aria-current="page"[^>]*>My work</);
    }
    // another tab that holds several pages keeps its list
    expect(tabs("/generate")).toContain("aria-haspopup");
  });
});
