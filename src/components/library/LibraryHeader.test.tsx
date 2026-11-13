import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { LEO_EMAILS } from "@/lib/leoOnly";
import LibraryHeader, { LibrarySearch, createHref } from "./LibraryHeader";
import { LIBRARY_VIEWS } from "./LibraryViews";

const html = (path: string, node: JSX.Element) => renderToStaticMarkup(<MemoryRouter initialEntries={[path]}>{node}</MemoryRouter>);

describe("the Library's one header row", () => {
  it("holds the title, the view's tabs, its controls and the view switch in one header, in that order, on all four views", () => {
    for (const v of LIBRARY_VIEWS) {
      const out = html(v.to, <LibraryHeader title="Library" left={<b>tabs</b>}><i>controls</i></LibraryHeader>);
      expect(out.match(/<header/g)).toHaveLength(1);
      expect(out).toContain('<h1 class="sr-only">Library</h1>');
      const at = ["<b>tabs</b>", "<i>controls</i>", 'aria-label="Library view"'].map((s) => out.indexOf(s));
      expect(at.every((n) => n > 0)).toBe(true);
      expect([...at].sort((a, b) => a - b)).toEqual(at);
      // one row from lg, and never wider than the page below it
      expect(out).toMatch(/<header[^>]*class="[^"]*flex-wrap[^"]*lg:flex-nowrap/);
    }
  });

  it("draws no empty controls slot on a view with none", () => {
    expect(html("/grid", <LibraryHeader title="Grid" />).match(/<div/g)).toHaveLength(1);
  });

  it("names the search box for a screen reader", () => {
    const out = html("/library", <LibrarySearch value="cpf" onChange={() => undefined} label="Search titles, words and captions" />);
    expect(out).toContain('aria-label="Search titles, words and captions"');
    expect(out).toContain('value="cpf"');
  });

  it("sends Create where Studio's Create tab goes for that sign-in", () => {
    expect(createHref("someone@example.com")).toBe("/generate");
    expect(createHref("")).toBe("/generate");
    expect(createHref(LEO_EMAILS[0])).toBe("/make");
  });
});
