// The ad library's "In your space" for a brand with no space words yet: the words we would search as chips, and one
// press that saves them and runs the priced check. Drawing the page saves nothing and runs nothing.
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ SUPABASE_URL: "https://abc.supabase.co", supabase: {} }));

import { brandDevice } from "@/test/brandDevice";
import { loadSpaceAds, spaceAdsKey } from "@/lib/adLibrary";
import AdLibrary from "./AdLibrary";

const words = (out: string) => out.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const draw = () => renderToStaticMarkup(<MemoryRouter initialEntries={["/swipe?tab=ads"]}><AdLibrary userId="u1" /></MemoryRouter>);

afterEach(() => vi.unstubAllGlobals());

describe("In your space before any words are saved", () => {
  it("suggests the brand's own words as removable chips with one Show ads button, and saves nothing on open", () => {
    const local = brandDevice("u1", "Bakery");
    local.setItem("content-studio-market-u1", JSON.stringify({ topics: ["nonya kueh", "kueh lapis", "ondeh ondeh", "gift boxes"] }));
    const out = draw();
    expect(words(out)).toContain("In your space");
    for (const w of ["nonya kueh", "kueh lapis", "ondeh ondeh"]) expect(out).toContain(`aria-label="Remove ${w}"`);
    // three words at most, as the editor takes
    expect(out).not.toContain("gift boxes");
    expect(words(out)).toContain("Show ads in your space");
    // Set your space stays for editing
    expect(words(out)).toContain("Set your space");
    expect(loadSpaceAds("u1").keywords).toEqual([]);
  });

  it("shows no card once words are saved, and none when there is nothing to suggest", () => {
    const local = brandDevice("u1", "Bakery");
    local.setItem("content-studio-market-u1", JSON.stringify({ topics: ["nonya kueh"] }));
    local.setItem(spaceAdsKey("u1"), JSON.stringify({ checkedAt: "", keywords: ["nonya kueh"], ads: [] }));
    expect(draw()).not.toContain("Show ads in your space");
    brandDevice("u1", "Bakery");
    expect(draw()).not.toContain("Show ads in your space");
  });
});
